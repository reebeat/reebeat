// F15, the offline pipeline, and the capture lags measured on the real deck (moved here from the capture adapter,
// which must not depend on the Renderer): the whole build of a small story runs with no model, `--speech silent
// --aligner even`, on the real reveal.js deck, the real Chromium and the real ffmpeg, and `tsukuri check` on its
// output passes F1 (the show and focus effects, every anchor in the picture, and the sounds, which are audible in an
// offline build), F2, F3, F4, F5, F7 and F9. Only F8 compares narration audio that is silent by construction: its
// verdict says `N/A (silent stand-in)`, which is only ever the case because the build's own manifest lists a stand-in
// narrator.
//
// `lags.fountain` has the mechanics of the committed story: a default fade, a CUT, two AUTO-ANIMATEs and focus, show
// and sound effects. F1 and F7 observe the first changed frame of every step, of every anchor in the picture and of every
// scene change within a frame of the Timeline, which is the measurement the capture lags were chosen by.
import { assert, layer } from "@effect/vitest";
import { chromiumCapturer } from "@tsukuri/capture-chromium";
import { MediaTools } from "@tsukuri/encode-ffmpeg";
import { Effect, Exit, FileSystem, Layer, Path } from "effect";

import { Verifier } from "../src/verifier.ts";
import { platform, runCli, tempDirectory } from "./support.ts";

/** The real verification (verify's checks over ffmpeg) in place of the fake. */
const realVerifier = Verifier.layer.pipe(Layer.provide(MediaTools.layer));

/** The status of a falsifier in the printed table: the word after its id. */
const statusOf = (table: string, id: string): string | undefined =>
  new RegExp(`^${id} +(?<status>PASS|FAIL|N/A) `, "mu").exec(table)?.groups
    ?.status;

layer(platform)("the offline pipeline (F15)", (it) => {
  it.effect(
    "builds a story with no model and passes every check except the narration onsets; F8 says N/A (silent stand-in)",
    () =>
      Effect.gen(function* offline() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* tempDirectory;
        const story = path.join(dir, "story.fountain");
        const cache = path.join(dir, "cache");
        const out = path.join(dir, "out");

        yield* fs.copyFile(
          yield* path.fromFileUrl(new URL("lags.fountain", import.meta.url)),
          story
        );

        const real = {
          capturer: chromiumCapturer,
          machineEnv: true,
          verifier: realVerifier,
        };

        const built = yield* runCli(
          [
            "build",
            story,
            "--speech",
            "silent",
            "--aligner",
            "even",
            "--cache-dir",
            cache,
            "--out",
            out,
          ],
          real
        );

        assert.isTrue(Exit.isSuccess(built.exit), built.stderr);
        assert.include(built.stdout, "SpeechSynthesizer: silent@2-standin");
        assert.include(built.stdout, "Encoder: ffmpeg@");

        const checked = yield* runCli(
          ["check", out, "--source", story, "--cache-dir", cache],
          real
        );

        assert.isTrue(Exit.isSuccess(checked.exit), checked.stdout);

        for (const id of ["F1", "F2", "F3", "F4", "F5", "F7", "F9"]) {
          assert.strictEqual(
            statusOf(checked.stdout, id),
            "PASS",
            `${id}\n${checked.stdout}`
          );
        }

        assert.strictEqual(
          statusOf(checked.stdout, "F8"),
          "N/A",
          checked.stdout
        );
        assert.include(checked.stdout, "N/A (silent stand-in)");
        assert.include(checked.stdout, "sound onset");
        assert.notInclude(checked.stdout, "sound N/A");
        assert.include(checked.stdout, "not applicable: F8");
      }),
    { timeout: 600_000 }
  );
});
