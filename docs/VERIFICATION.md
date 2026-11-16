# Verification

Verified on Windows, 2026-10-27, and verified again on 2026-11-13 after the cleanup, with the pinned GPT-2 small checkpoint in `backend/runtime.py`. Inference used CPU, f32, and 8 PyTorch threads. Python packages are recorded in `requirements-lock.txt`; frontend packages are recorded in `package-lock.json`.

## Results

- Production frontend: `npm run build` passed TypeScript checking and Vite compilation.
- Runtime/API: `npm test` passed all 12 tests. These cover identity edits, all four intervention modes against independent projection-output edits, cached/full-prefix logits, analysis capture, token labels for multi-byte characters, context limits, cleanup after cancellation/failure, the busy state, invalid API inputs, the analysis endpoints, and the generation stream.
- Real browser: `npm run test:browser` passed against the production server at port 8791. It exercised analysis, neuron selection, an additive intervention, streamed comparison, probability display, bookmarks, export/import, reset, stopping generation, a clean baseline after stop, keyboard navigation, malformed-result rejection, and mobile overflow. No browser JavaScript errors were observed.
- Both `npm run dev` (Vite plus API) and `npm start` (production server) were launched and checked. A Windows command-path issue discovered during this check was fixed.

## Observed performance

These are measurements, not guarantees. Measured on 2026-11-13 through the HTTP API, with CPU inference and 8 PyTorch threads.

| Measurement | Input | Result |
|---|---|---|
| Model load from the local cache | - | 0.42 s |
| Analysis, all 12 layers | 12 tokens | 0.11 s (0.36 s for the first request) |
| Analysis, all 12 layers | 480 tokens | 0.78 s |
| Time to first generated token | 12-token prompt | 0.10 s |
| Time to first generated token | 2-token prompt | 0.05 s |
| Decode speed with the KV cache | 8 to 128 new tokens | 15 to 19 tokens per second |
| One branch, 24 new tokens | 12-token prompt | 1.5 to 1.6 s |
| One branch, 128 new tokens | 12-token prompt | 8.0 to 8.5 s |

The baseline branch and the modified branch have the same speed. The edit hook adds no measurable cost.

For `The city was quiet after the rain. In the distance,`, the baseline continued with `a man stood in the middle of the street`. Adding 20 to L6/N2130 changed the continuation to `the wind was blowing`. This demonstrates intervention behavior on this prompt; it does not establish a semantic interpretation of the neuron.

See `browser-evidence.json`, `preview-live.png`, and `preview-mobile.png` in this directory for recorded browser evidence. The browser script writes `test-experiment.json` as its export/import fixture.

## Current limits

- This installation uses CPU PyTorch. CUDA support is selected only when a CUDA-enabled PyTorch installation is available; the GPU path has not been verified here.
- Baseline and modified generations run sequentially and greedily. The local model handles one job at a time.
- Analysis is kept for the most recent prompt in memory. Saved experiments preserve inputs and results; activations are recomputed on demand.
- Browser testing used Chromium. Other browsers have not been verified.

The later features listed in [PLAN.md](PLAN.md) remain optional and are not implemented.
