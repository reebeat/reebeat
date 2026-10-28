# @reebeat/speech-kokoro

`SpeechSynthesizer` on Kokoro-82M through `kokoro-js` 1.2.1 (local, fp32, `onnx-community/Kokoro-82M-v1.0-ONNX`). `kokoroSynthesizer` is a `Layer`; `info.id` is `kokoro@1.2.1`, `info.settings` is `{ dtype, model, sampleRate }`, `info.egress` is local (nothing leaves the machine). The model directory is `REEBEAT_KOKORO_CACHE`. The model loads on the first `synthesize`, not when the layer is built; a missing variable or model is `AdapterUnavailable` then, never a fallback. The one module that imports the model is `src/kokoroSynthesizer.ts` (registered exception EX-0001: the Promise-returning foreign ABI).

`bun run test`: argument and error mapping over a fake model, and the `SpeechSynthesizer` contract over that fake. `bun run test:live` (opt-in; fails when the model is absent): the contract against the real model, voice `af_heart`.
