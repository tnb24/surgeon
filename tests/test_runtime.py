import threading
import pytest
import torch
from backend.runtime import Busy, Runtime

@pytest.fixture(scope='module')
def runtime():
    r = Runtime()
    r.load()
    assert r.model is not None, r.error
    return r

def test_identity_and_reference_edits(runtime):
    r = runtime
    with r.job():
        ids = r.encode('The city was quiet after the rain.')
        base = r.model(ids).logits
        for mode, value in [('add', 0), ('multiply', 1)]:
            r.edits = [dict(layer=6, neuron=123, mode=mode, value=value)]
            torch.testing.assert_close(r.model(ids).logits, base, atol=1e-4, rtol=1e-4)
        for mode, value in [('add', 5), ('multiply', 2), ('set', 3), ('ablate', 0)]:
            r.edits = [dict(layer=6, neuron=123, mode=mode, value=value)]
            edited = r.model(ids).logits
            r.edits = []
            projection = r.model.transformer.h[6].mlp.c_proj
            def reference(module, inputs, output):
                h = inputs[0][..., 123]
                delta = {'add': torch.full_like(h, value), 'multiply': h*(value-1), 'set': value-h, 'ablate': -h}[mode]
                return output + delta.unsqueeze(-1)*module.weight[123]
            hook = projection.register_forward_hook(reference)
            try: expected = r.model(ids).logits
            finally: hook.remove()
            torch.testing.assert_close(edited, expected, atol=1e-4, rtol=1e-4)

@pytest.mark.parametrize('edited', [False, True])
def test_cached_decode(runtime, edited):
    r = runtime
    with r.job():
        if edited: r.edits = [dict(layer=6, neuron=123, mode='add', value=5)]
        ids = r.encode('A scientist walked into the quiet laboratory and discovered a strange machine.')
        cache = None
        for i in range(ids.shape[1]):
            out = r.model(ids[:, i:i+1], past_key_values=cache, use_cache=True)
            cache = out.past_key_values
            reference = r.model(ids[:, :i+1], use_cache=False)
            torch.testing.assert_close(out.logits[:, -1], reference.logits[:, -1], atol=1e-4, rtol=1e-4)

def test_cancellation_and_cleanup(runtime):
    r = runtime
    events = []
    cancel = threading.Event()
    def emit(e):
        events.append(e)
        if e['type'] == 'text': cancel.set()
    r.generate('The city was quiet', [dict(layer=6, neuron=123, mode='set', value=20)], 30, cancel, emit)
    assert r.edits == [] and r.capture is None and not r.lock.locked()
    with pytest.raises(ValueError):
        with r.job():
            r.edits = [dict(layer=6, neuron=1, mode='ablate', value=0)]
            raise ValueError('test failure')
    assert not r.edits and not r.lock.locked()
    with r.job():
        with pytest.raises(Busy): r.analyze('The model is busy.')

@pytest.mark.parametrize('text', ['The ocean is full of life.', 'Café ☕ 日本語 🙂 naïve\n\tend', 'a<|endoftext|>b �'])
def test_token_labels(runtime, text):
    ids = runtime.tokenizer.encode(text)
    labels = runtime.token_labels(ids)
    assert len(labels) == len(ids)
    assert ''.join(labels) == runtime.tokenizer.decode(ids) == text


def test_analysis_and_limits(runtime):
    r = runtime
    a = r.analyze('The ocean is full of life.')
    summary = r.layer_summary(a['id'], 6)
    trace = r.neuron_trace(a['id'], 6, 123)['trace']
    assert len(summary['values']) == 3072
    assert len(trace) == len(a['tokens'])
    assert trace[summary['positions'][123]] == summary['values'][123]
    with pytest.raises(LookupError): r.layer_summary('expired', 6)
    assert len(r.analysis['acts']) == 12
    with pytest.raises(ValueError): r.encode(' hello'*1024, 1)
    with pytest.raises(ValueError): r.encode('')
