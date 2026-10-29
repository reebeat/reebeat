# Third-party software, models and their licences

Audit of 2026-10-29, for [spec 0008](../specs/0008-apache-2-licence.md). reebeat is licensed under Apache-2.0 ([`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE)). This page says what it depends on, under which licence, and what each licence asks of reebeat. Each licence below comes from the project's own source, linked in the table. Nothing here is legal advice.

## The rule

```text
reebeat's code ──calls as a separate process──▶ ffmpeg, ffprobe, whisper-cli, Chromium
                 (arguments in, files out; nothing linked, nothing bundled)
```

reebeat runs ffmpeg as an external process and does not bundle or link it, so ffmpeg's GPL does not reach reebeat's code. The same holds for `whisper-cli` and Chromium. The conditions of a licence apply to what you **distribute**:

| Situation | What it triggers |
| --- | --- |
| A person runs reebeat on their own machine, with ffmpeg from their own package manager or from `devenv` | Nothing for reebeat. The user's copy of ffmpeg is their own installation. |
| A hosted service runs reebeat and ffmpeg on its servers and sends users only the resulting video | Nothing. The GPL conditions arise on distribution of the program; a hosted service does not distribute ffmpeg. (The AGPL would change this; no dependency here is AGPL.) |
| A product **distributes** a binary that contains libx264 (a downloadable editor with ffmpeg inside, a CLI release with ffmpeg bundled, a container image on a public registry) | The product takes on GPL obligations for that binary: the GPL text, the corresponding source of ffmpeg and libx264 (or a written offer), and no further restriction on the recipient. The build used here is GPL-3.0-or-later (see below). |

The open item for the third row is tracked in [issue #7](https://github.com/reebeat/reebeat/issues/7): the options are an LGPL ffmpeg build without x264 and a different H.264 encoder, a different codec, or complying with the GPL for that binary. The decision belongs to the operator and is not taken here.

## What the audit covers

| Part | Source of the list | Result |
| --- | --- | --- |
| npm packages, runtime and build | `bun.lock` (workspace packages excluded); the licence of each is in `tools/quality/third-party-licences.json`, from the package's own published `package.json` | **No GPL, AGPL, SSPL or unknown licence** on 2026-10-29; the gate keeps that true. Details below. |
| External binaries | `devenv.nix` (`pkgs.chromium`, `pkgs.ffmpeg-headless`, `pkgs.whisper-cpp`, `pkgs.bun`, `pkgs.nodejs_24`, `pkgs.gitleaks`); versions read from the binaries in `devenv shell` | One GPL binary: ffmpeg, as configured. Run as a process only. |
| Models | `packages/speech-kokoro/src/kokoroSynthesizer.ts` (Kokoro), `packages/align-whisper/src/whisperAligner.ts` (`ggml-base.en`) | MIT and Apache-2.0 weights. |
| Sounds | `packages/sounds-synth/src/sfx.ts` | Synthesised in TypeScript; no third-party sample or source. |

## npm packages

Every third-party package of `bun.lock`, runtime and build alike, has its licence in [`tools/quality/third-party-licences.json`](../../tools/quality/third-party-licences.json), one `name@version` per line, taken from the `license` field of the package's own published `package.json` (`https://registry.npmjs.org/<name>/<version>`). That file is the one source for the list: `bun run test` fails when it and `bun.lock` disagree, so there is no second copy here. Count by licence with `jq -r '.[]' tools/quality/third-party-licences.json | sort | uniq -c | sort -rn`. On 2026-10-29 the lock held 505 packages and none was GPL, AGPL, SSPL or unknown.

What the licences outside the permissive family (MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD) ask of reebeat:

- **LGPL-3.0-or-later** (alone or in an `AND` expression): see "The LGPL packages" below. The gate allows it for `@img/sharp-*` and for no other package.
- **MPL-2.0**: copyleft at the level of the licensed files. It binds only changes to those files. On 2026-10-29 it came from `lightningcss`, a build tool that reebeat does not ship.
- **OFL-1.1**: a font licence; the Inter font, see below.
- **BlueOak-1.0.0, Python-2.0, CC0-1.0**: permissive; keep the notice (BlueOak, Python-2.0) or nothing (CC0).

**The LGPL packages.** `sharp` (Apache-2.0) is an image library that `@huggingface/transformers` (Apache-2.0, used by `kokoro-js`) lists as a dependency. Its prebuilt libvips binaries, `@img/sharp-libvips-<platform>`, are LGPL-3.0-or-later shared libraries ([`sharp-libvips` README](https://github.com/lovell/sharp-libvips#licences): scripts Apache-2.0, bundled libraries under [various licences](https://github.com/lovell/sharp-libvips/blob/main/THIRD-PARTY-NOTICES.md)). npm installs them on the user's machine; reebeat neither bundles nor links them into its own code. A product that ships `node_modules` (a desktop app, a container image) carries LGPL-3.0 obligations for these files: the licence text, a way to replace the library, and its source. The gate allows LGPL-3.0-or-later for `@img/sharp-*` and for no other package.

**Inter (OFL-1.1).** Every Deck copies `reveal.js` (MIT) and the Inter woff2 files (SIL OFL 1.1, [`rsms/inter` licence](https://github.com/rsms/inter/blob/master/LICENSE.txt)) into `assets/`, with each package's `LICENSE` file beside it (`packages/render-reveal/src/assets.ts`). The OFL allows redistribution of the font inside a work if the licence and copyright notice travel with it; they do.

## Direct runtime dependencies

They are the `dependencies` of the `packages/*` manifests; read the list there and the licence in the JSON file above. Experimental or alpha dependencies are allowed in the compiler and are pinned exactly ([open-core boundary](open-core-boundary.md)); none is locked today.

## External binaries

Versions are those of `devenv shell` on 2026-10-29.

| Program | Version | Licence | Source of the licence | How reebeat uses it | If a product distributes it |
| --- | --- | --- | --- | --- | --- |
| Chromium (`pkgs.chromium`) | 155.0.8059.39 | BSD-3-Clause for the Chromium Authors' code; bundled components under their own licences | [`LICENSE` at the tag](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.39/LICENSE); the browser lists its components at `chrome://credits` | Process, driven by Playwright (`capture-chromium`) | Ship the credits page and the notices of its components. |
| ffmpeg and ffprobe (`pkgs.ffmpeg-headless`) | 9.0.1 | Upstream: LGPL-2.1-or-later by default; GPL-2.0-or-later when built with `--enable-gpl`; `--enable-version3` upgrades to version 3 of the (L)GPL. **This build** (`ffmpeg -buildconf`: `--enable-gpl --enable-version3 --enable-libx264 --enable-libx265 --enable-libxvid --enable-libvidstab`, among others) is **GPL-3.0-or-later** | [FFmpeg `LICENSE.md` at n9.0.1](https://github.com/FFmpeg/FFmpeg/blob/n9.0.1/LICENSE.md), [legal page](https://ffmpeg.org/legal.html) | Process (`encode-ffmpeg`: `ffmpeg` to encode and mux, `ffprobe` to measure) | GPL obligations, see the rule above and [issue #7](https://github.com/reebeat/reebeat/issues/7). |
| libx264, inside ffmpeg | as built into ffmpeg 9.0.1 | **GPL-2.0-or-later**; also sold under a commercial licence | Source header of [`x264.c`](https://code.videolan.org/videolan/x264/-/blob/master/x264.c) ("either version 2 of the License, or (at your option) any later version"), [`COPYING`](https://code.videolan.org/videolan/x264/-/blob/master/COPYING), [x264 page](https://www.videolan.org/developers/x264.html) (commercial licence: `x264licensing@videolan.org`) | The H.264 encoder, `-c:v libx264` (`packages/encode-ffmpeg/src/settings.ts`). AAC, FLAC and `mov_text` are ffmpeg's own LGPL code. | GPL for the whole binary; this is why the open item exists. |
| `whisper-cli` (`pkgs.whisper-cpp`) | 1.9.5 | MIT, Copyright The ggml authors | [`LICENSE`](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE) | Process, word timestamps (`align-whisper`) | MIT notice. |
| Bun (`pkgs.bun`) | 1.4.2 | MIT; statically links JavaScriptCore and WebKit (LGPL-2) and other libraries | [`LICENSE.md`](https://github.com/oven-sh/bun/blob/main/LICENSE.md) | Runtime and package manager of the repository | Bun's own conditions (object files to relink); reebeat does not distribute Bun. |
| Node.js (`pkgs.nodejs_24`) | 24.21.0 | MIT, with a longer list of bundled-component notices | [`LICENSE`](https://github.com/nodejs/node/blob/main/LICENSE) | Toolchain (Vite+ needs it) | Not distributed. |
| gitleaks (`pkgs.gitleaks`) | 8.30.1 | MIT | [`LICENSE`](https://github.com/gitleaks/gitleaks/blob/master/LICENSE) | Secret scanning in hooks and CI | Not distributed. |
| devenv | not pinned in this repository | Apache-2.0 | [`LICENSE`](https://github.com/cachix/devenv/blob/main/LICENSE) | Provides the shell above | Not distributed. |

The ffmpeg build in nixpkgs enables other GPL-2.0 libraries besides libx264 (libx265, libxvid, libvidstab, among others). Replacing libx264 alone would not make that build LGPL; a build for distribution must be configured without `--enable-gpl`.

## Models

| Model | Licence | Source of the licence | How reebeat uses it |
| --- | --- | --- | --- |
| Kokoro-82M v1.0, ONNX build `onnx-community/Kokoro-82M-v1.0-ONNX` (fp32), including its voices | Apache-2.0 | Model cards: [`hexgrad/Kokoro-82M`](https://huggingface.co/hexgrad/Kokoro-82M) (`license: apache-2.0`, "Apache-licensed weights") and [`onnx-community/Kokoro-82M-v1.0-ONNX`](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (`license: apache-2.0`) | Downloaded by `kokoro-js` on first use, never stored in the repository. The synthesised speech of `stories/same-id` is committed in `speech-cache`. |
| Whisper `ggml-base.en.bin` | MIT | [OpenAI Whisper `LICENSE`](https://github.com/openai/whisper/blob/main/LICENSE) (MIT, OpenAI) for the weights; [`ggerganov/whisper.cpp` model card](https://huggingface.co/ggerganov/whisper.cpp) (`license: mit`) for the ggml conversion | Not in the repository or the devenv closure; the user downloads it (`align-whisper`). |

The Kokoro card says the model was trained on permissive and non-copyrighted audio and lists two CC BY datasets (Koniwa `tnc`, SIWIS) among the training data. That is the model author's statement about the weights' provenance and is not verified here. The card puts no condition on generated audio.

## Sounds

`@reebeat/sounds-synth` synthesises `pop`, `whoosh` and `ding` from sine sweeps and seeded noise in TypeScript. There is no recorded sample and no third-party sound source, so nothing to attribute.

## Provenance of copied code

The lifecycle tooling comes from the author's other repository, [`phibkro/vektorprogrammet-reimagined`](https://github.com/phibkro/vektorprogrammet-reimagined) (see [`PROVENANCE.md`](../../PROVENANCE.md)). That repository carries no licence file (GitHub reports none), so its code is under its owners' default copyright. Its owner account is the one that authored every commit of this repository; if the donor has other contributors, their files need their consent before they stay under Apache-2.0. Open, for the operator.

## The gate

`bun run test` runs `tools/quality/test/thirdPartyLicences.test.ts`. It reads `bun.lock` and `tools/quality/third-party-licences.json` (one line per package: `name@version` and its licence) and fails when:

- a locked package has no recorded licence, or a recorded package left the lock;
- a recorded licence is not made only of identifiers in the allowlist: `0BSD`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `BlueOak-1.0.0`, `CC0-1.0`, `ISC`, `MIT`, `MPL-2.0`, `OFL-1.1`, `Python-2.0`, plus `LGPL-3.0-or-later` for `@img/sharp-*` only. GPL, AGPL, SSPL and unknown licences are rejected because they are not on the list.

To add or bump a dependency, read the `license` field of `https://registry.npmjs.org/<name>/<version>` and add the line to `tools/quality/third-party-licences.json`; nothing else lists packages. A new licence identifier is a decision for this page first, then the allowlist.

Limits: the gate checks the declared `license` field, which a package can get wrong or omit; it does not read licence files inside packages or the licences of what a package bundles. It does not cover the binaries and models above, which a person reads here.
