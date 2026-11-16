"""GPT-2 runtime: load the model, capture MLP activations, and edit neurons.

A neuron is one post-GELU MLP activation. The runtime reads and edits the
activation with a forward pre-hook on `transformer.h[layer].mlp.c_proj`.
"""
import codecs
import os
from pathlib import Path

# Set the cache location before Transformers reads the environment.
os.environ.setdefault('HF_HOME', str(Path(__file__).resolve().parents[1] / '.cache' / 'huggingface'))

import threading
import time
import uuid
from contextlib import contextmanager

import torch
from transformers import AutoTokenizer, GPT2LMHeadModel

MODEL = 'openai-community/gpt2'
REVISION = '607a30d783dfa663caf39e06633721c8d4cfcd7e'
LAYERS = 12
NEURONS = 3072
CONTEXT = 1024
TOP_TOKENS = 8


class Busy(RuntimeError):
    """The model cannot accept a job now."""


def pretrained(cls, **options):
    """Load from the local cache. Download only when the cache has no copy."""
    try:
        return cls.from_pretrained(MODEL, revision=REVISION, local_files_only=True, **options)
    except OSError:
        return cls.from_pretrained(MODEL, revision=REVISION, **options)


def byte_table():
    """Map each character of the GPT-2 byte-level vocabulary to its byte."""
    printable = [*range(ord('!'), ord('~') + 1), *range(ord('¡'), ord('¬') + 1), *range(ord('®'), ord('ÿ') + 1)]
    hidden = [b for b in range(256) if b not in printable]
    table = {chr(b): b for b in printable}
    table.update({chr(256 + i): b for i, b in enumerate(hidden)})
    return table


BYTES = byte_table()


class Runtime:
    def __init__(self):
        self.lock = threading.Lock()
        self.state = 'idle'
        self.error = None
        self.tokenizer = None
        self.model = None
        self.edits = []
        self.capture = None
        self.analysis = None
        self.device = 'cpu'
        self.load_seconds = None

    def load(self):
        with self.lock:
            if self.model is not None:
                return
            try:
                started = time.perf_counter()
                self.error = None
                self.state = 'Loading tokenizer'
                self.tokenizer = pretrained(AutoTokenizer)
                self.state = 'Loading GPT-2 weights'
                self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
                torch.set_num_threads(min(8, os.cpu_count() or 4))
                model = pretrained(GPT2LMHeadModel, dtype=torch.float32)
                model.to(self.device).eval()
                for layer, block in enumerate(model.transformer.h):
                    block.mlp.c_proj.register_forward_pre_hook(self.hook(layer))
                self.model = model
                self.load_seconds = time.perf_counter() - started
                self.state = 'ready'
            except Exception as exc:
                self.state = 'error'
                self.error = str(exc)

    def hook(self, layer):
        """Return the pre-hook that captures and edits the activations of one layer."""
        def apply(module, inputs):
            h = inputs[0]
            if self.capture is not None:
                self.capture[layer] = h[0].detach().float().cpu().clone()
            edits = [e for e in self.edits if e['layer'] == layer and e.get('enabled', True)]
            if not edits:
                return None
            h = h.clone()
            for e in edits:
                n, v = e['neuron'], e['value']
                if e['mode'] == 'add':
                    h[..., n] += v
                elif e['mode'] == 'multiply':
                    h[..., n] *= v
                elif e['mode'] == 'set':
                    h[..., n] = v
                elif e['mode'] == 'ablate':
                    h[..., n] = 0
            return (h,)
        return apply

    @contextmanager
    def job(self):
        """Give one caller the model. Clear the request state when the job ends."""
        if self.model is None:
            raise Busy(self.error or 'Model is still loading')
        if not self.lock.acquire(blocking=False):
            raise Busy('The model is busy. Stop the current run or wait for it to finish.')
        try:
            with torch.inference_mode():
                yield
        finally:
            self.edits = []
            self.capture = None
            self.lock.release()

    def encode(self, prompt, max_new=0):
        ids = self.tokenizer.encode(prompt)
        if not ids:
            raise ValueError('Enter a prompt first.')
        if len(ids) + max_new > CONTEXT:
            raise ValueError(f'{len(ids)} prompt tokens + {max_new} output tokens exceeds the {CONTEXT:,}-token limit.')
        return torch.tensor([ids], device=self.device)

    def token_labels(self, ids):
        """Return the text of each token. The labels join to the decoded prompt.

        One character can span some tokens. The last of these tokens gets the
        character, and the earlier tokens get an empty label.
        """
        decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
        labels = []
        for piece in self.tokenizer.convert_ids_to_tokens(ids):
            if all(c in BYTES for c in piece):
                labels.append(decoder.decode(bytes(BYTES[c] for c in piece)))
            else:
                labels.append(decoder.decode(b'', final=True) + piece)
        labels[-1] += decoder.decode(b'', final=True)
        return labels

    def analyze(self, prompt):
        """Run the unmodified model and keep the activations of all layers."""
        with self.job():
            start = time.perf_counter()
            ids = self.encode(prompt)
            self.capture = {}
            self.model(ids, use_cache=False)
            tokens = self.token_labels(ids[0].tolist())
            self.analysis = {'id': uuid.uuid4().hex, 'tokens': tokens, 'acts': self.capture}
            return {'id': self.analysis['id'], 'tokens': tokens, 'seconds': time.perf_counter() - start}

    def activations(self, analysis_id, layer):
        a = self.analysis
        if not a or a['id'] != analysis_id:
            raise LookupError('This analysis has expired. Analyze the prompt again.')
        return a['acts'][layer]

    def layer_summary(self, analysis_id, layer, token=-1):
        """Return one value for each neuron: the peak (token < 0) or the value at `token`."""
        acts = self.activations(analysis_id, layer)
        if token >= acts.shape[0]:
            raise ValueError('Invalid token index')
        positions = acts.abs().argmax(dim=0) if token < 0 else torch.full((NEURONS,), token, dtype=torch.long)
        values = acts[positions, torch.arange(NEURONS)]
        return {'values': values.tolist(), 'positions': positions.tolist()}

    def neuron_trace(self, analysis_id, layer, neuron):
        """Return the activation of one neuron at each prompt token."""
        return {'trace': self.activations(analysis_id, layer)[:, neuron].tolist()}

    def generate(self, prompt, edits, max_new, cancel, emit):
        """Decode a baseline branch and a modified branch from the same prompt."""
        with self.job():
            ids = self.encode(prompt, max_new)
            emit({'type': 'start', 'prompt_tokens': ids.shape[1], 'model': MODEL, 'revision': REVISION})
            probabilities = []
            for branch in ('baseline', 'modified'):
                self.edits = [] if branch == 'baseline' else edits
                cache = None
                current = ids
                output = []
                start = time.perf_counter()
                first_token_seconds = None
                for step in range(max_new):
                    if cancel.is_set():
                        return
                    result = self.model(current, past_key_values=cache, use_cache=True)
                    logits = result.logits[0, -1].float()
                    if step == 0:
                        probabilities.append(logits.softmax(-1).cpu())
                        first_token_seconds = time.perf_counter() - start
                    next_id = int(logits.argmax())
                    output.append(next_id)
                    emit({'type': 'text', 'branch': branch, 'text': self.tokenizer.decode(output), 'count': len(output)})
                    if next_id == self.tokenizer.eos_token_id:
                        break
                    cache = result.past_key_values
                    current = torch.tensor([[next_id]], device=self.device)
                emit({'type': 'timing', 'branch': branch, 'seconds': time.perf_counter() - start,
                      'first_token_seconds': first_token_seconds, 'tokens': len(output)})
            base, changed = probabilities
            indices = torch.unique(torch.cat((base.topk(TOP_TOKENS).indices, changed.topk(TOP_TOKENS).indices)))
            indices = sorted(indices.tolist(), key=lambda i: float(changed[i] - base[i]), reverse=True)
            emit({'type': 'probabilities', 'items': [
                {'token': self.tokenizer.decode([i]), 'baseline': float(base[i]), 'modified': float(changed[i])}
                for i in indices]})
