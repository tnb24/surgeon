# GPT-2 neuron playground

Build a good interface for inspecting and changing GPT-2's MLP neurons, then seeing what happens to its output.

The first useful version must let me paste text, find a neuron that responds to it, change that neuron's activation, and compare the result with the unchanged model. Everything below serves that loop.

## Scope and approach

- GPT-2 small (`openai-community/gpt2`) only: 12 layers, 3,072 MLP neurons per layer. Use zero-based layer and neuron IDs throughout.
- Browser UI with a local Python inference server. Running entirely inside the browser is a possible later project, not a requirement.
- PyTorch and Hugging Face Transformers for inference; FastAPI for the API; React, TypeScript, and Vite for the UI. Pin working dependency versions and the model revision during implementation.
- Load the model once, use evaluation/inference mode, and support CPU first with CUDA acceleration when available. Measure performance on the actual development machine before promising latency.
- No full-model sweep or precomputed dataset is needed to start exploring.

Use [neuron-explorer](https://github.com/lyramakesmusic/neuron-explorer) as the interaction reference: layer browsing, a focused neuron panel, activation inspection, and steered completions. Its live features already use a local model server. Study those interactions; implement a smaller GPT-2 app rather than preserving its Qwen-specific API and research pipeline.

## The interface

One workspace, with three connected areas:

1. **Text and results.** A prompt editor with a few completion-style examples, a Run button, and baseline/modified completions side by side. Stream output and show next-token probability changes at the end of the shared prompt. Default to greedy decoding so comparisons are repeatable. GPT-2 continues text; use no chat template.
2. **Neuron browser.** A layer selector and a clickable 2D grid of that layer's neurons, paired with a sortable list. Analyze the prompt to color the grid and rank neurons by maximum absolute activation, or activation at a selected token. Display the signed value and the token responsible for each score. Direct ID lookup and random selection also work before analysis.
3. **Selected neuron.** Show `L6 / N123`, its signed activations over the prompt's tokens, and controls to add, multiply, set, or ablate its activation. Include a slider, precise numeric input, reset, and an enable switch. Clicking a ranked neuron opens these controls without losing the prompt or results.

Make the experiment easy to read:

- Preserve token boundaries and whitespace in the activation view. Hover or keyboard focus shows the token index and numeric value. Use a diverging color scale centered at zero, with a visible legend; do not hide negative GELU activations.
- Show the exact intervention beside each result. An old result keeps the settings it ran with when the controls change; mark it stale until rerun.
- Slider changes update the controls immediately. Generation starts on Run, not on every slider movement. Stop cancels computation and leaves partial output readable.
- Show model loading/download progress, busy state, errors, token counts, and the active device. Enforce GPT-2's 1,024-token context limit, including requested output; do not silently truncate text.
- Keep selection and keyboard focus visible. Make the grid/list navigable without a mouse, and let the workspace collapse into a usable narrow layout.
- Add a few bookmarks and save/load an experiment as JSON: prompt, model revision, interventions, generation settings, and results. No account system.

The grid starts in neuron-index order. A 3D model map can come later if it improves navigation. The first version should already feel finished in its spacing, typography, token display, and interaction states.

## What an intervention means

A neuron is one post-GELU MLP activation, immediately before `transformer.h[layer].mlp.c_proj`. Capture and edit that tensor with a forward pre-hook. In GPT-2's Conv1D convention, its output direction is `c_proj.weight[neuron, :]`.

| Control | Operation on the selected activation `h` |
|---|---|
| Add | `h = h + delta` |
| Multiply | `h = h * factor` |
| Set | `h = value` |
| Ablate | `h = 0` |

Start with raw activation units and show the observed values for the user's text. Multipliers are dimensionless. Do not introduce an unexplained normalized "dose" or reuse Qwen's dose presets.

For version one, each enabled intervention applies at every real prompt position and every subsequent decode position. Activation inspection is an unmodified pass, labeled accordingly. Token-specific edits are deferred.

Each comparison starts both branches from the same prompt with fresh, separate KV caches. Once completions diverge, they are separate continuations; only the next-token comparison at the shared prompt holds context fixed. Changing an intervention requires a fresh run.

Support a small list of enabled neurons after the single-neuron path works. Allow one operation per neuron, with its own value; reject duplicate entries rather than inventing an order of operations.

Serialize model jobs so capture and intervention state cannot leak between requests. Clear request state on success, error, and cancellation. Stop must release the model for the next job.

## Build order

### 1. Prove one edit works

Create the Python runtime and a minimal working UI for prompt entry, neuron selection, activation display, and baseline/edited generation. Start with one neuron in layer 6, then allow any valid layer and neuron. Use the existing Transformers forward pass and KV cache.

Verify:

- With no intervention, and with identity edits (add 0 / multiply 1), logits match the untouched model.
- In f32, adding `delta` before `c_proj` matches adding `delta * c_proj.weight[n, :]` to that projection's output. Use combined absolute/relative tolerances, initially `atol=1e-4, rtol=1e-4` on CPU.
- Multiply, set, and ablate match direct reference tensor edits. Unselected activations remain unchanged at the edit point.
- Cached decoding matches full-prefix recomputation for a fixed token sequence, both with and without intervention. Compare logits, not just generated text.
- A stopped or failed edited run cannot affect the next baseline run.

Done when a user can inspect and change a real neuron and compare real outputs through the UI. Do not build a sweep pipeline first.

### 2. Make neurons discoverable

Add prompt analysis across all layers, the grid/list, token selection, and the focused neuron panel. Capture activations for analysis only; during generation keep capture off unless explicitly needed. Return summaries for browsing and fetch per-token detail for the selected neuron instead of sending every activation to the browser.

Done when pasting unfamiliar text leads to selectable neurons through their actual activation values, without knowing neuron IDs or relying on a precomputed ranking. Switching selections must preserve the experiment and ignore stale responses.

### 3. Finish the playground

Add the small intervention list, bookmarks, experiment export/import, and the loading, error, cancellation, keyboard, and narrow-screen behavior described above. Serve the built frontend from the local server and document one development command and one normal launch command after installation.

Verify the complete paste -> analyze -> select -> edit -> compare -> reset flow in a browser. Check long inputs, invalid IDs/values, cancellation, and repeated runs. Record model load time, analysis time, time to first generated token, and decode speed with the device and input sizes. Address measured bottlenecks before adding more views.

Done when that flow works without a notebook, manual cache generation, or a sweep job, and resetting reproduces the baseline on the same runtime.

## Later, only when useful

- Three-column negative/baseline/positive comparison for additive edits.
- Small saved example sets or a bounded sweep over selected neurons to help discovery. Estimate cost before any all-neuron sweep.
- Token-specific interventions, sampled generation with recorded seeds/settings, and comparison history.
- Weight-direction token projections, clearly labeled as a heuristic; use actual next-token changes for measured effects. Neuron labels remain hypotheses, not claims of a single concept.
- A 3D map or similarity layout if the grid becomes limiting.
- Browser inference or public hosting, considered separately once there is a working product and an actual distribution requirement.

Nanochat, custom WebGPU kernels, binary dataset shards, full-model rollouts, UMAP views, connection graphs, attention-head tooling, and an agent tab are outside this plan. None is needed to play with GPT-2 neurons.

## References

- [Inspiration and interaction overview](https://github.com/lyramakesmusic/neuron-explorer)
- [Inspiration's local inference runtime](https://github.com/lyramakesmusic/neuron-explorer/blob/main/explorer/runtime.py)
- [GPT-2 configuration](https://huggingface.co/openai-community/gpt2/blob/main/config.json)
- [Transformers GPT-2 MLP implementation](https://github.com/huggingface/transformers/blob/main/src/transformers/models/gpt2/modeling_gpt2.py)
