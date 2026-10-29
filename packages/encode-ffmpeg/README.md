# @reebeat/encode-ffmpeg

`Encoder` on ffmpeg (local), and the media probes the checks use. `ffmpegEncoder` is a `Layer` over `ChildProcessSpawner`, `FileSystem` and `Path`; `info.id` is `ffmpeg@<version of ffmpeg -version>`, read once when the layer is built. When ffmpeg cannot start the layer still builds (its id says `unavailable`) and every operation raises `AdapterUnavailable`.

| Operation | What it does |
| --- | --- |
| `encodeAudio(clip)` / `decodeAudio(bytes)` | FLAC s16 mono, level 8, bit-exact; the float samples are `s16 / 32768`; the clip's own rate is kept |
| `mux(request)` | PNG frames from a `Stream` on ffmpeg's stdin, `tracks` (clips, each at its `startMs`) mixed to 48 kHz stereo AAC cut to `totalMs` (`aresample`, `adelay`, `amix normalize=0`, `apad`, `atrim`), the WebVTT as `mov_text`, `chapters` through `ffmetadata`, bt709 video, `-map_metadata:g -1`, the title and comment, `+bitexact`. ffmpeg writes beside `outPath` and the file is renamed into place when it exits 0; a failed frame stream or a failed ffmpeg leaves nothing |

`outPath`'s file name must be a plain stem (`InvalidOutputName`, reported as `EncodeFailed`). `request.ntsc` (the Plan's `settings.ntsc`, the 1000/1001 fraction of `fps`) is refused with `AdapterUnavailable` (requirement `settings.ntsc false`): `fps` is written as a whole frame rate, and a rounded one would be a wrong video. Also exported for `@reebeat/verify`: `MediaTools` (ffmpeg and ffprobe as scoped processes), `probeMedia`, `decodeGrayFrames` (the caller passes the frame size: the Plan's `settings.width` and `settings.height`; raw pixels carry no header and the probe has no default), `frameHashes`, `decodeMonoPcm`, `firstChangedFrame`, `changedPixels`, `audioOffsetMs`. The argument lists are written once in `src/settings.ts`; `info.settings` is derived from them.

`bun run test` (ffmpeg is in the devenv; the inputs are tiny): the `Encoder` contract, the pure parts (chapters, filter graph, arguments), the loud failures, nothing left behind, the adapter without ffmpeg, and the probes.
