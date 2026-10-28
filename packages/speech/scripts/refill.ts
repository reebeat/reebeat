// Refills the speech cache of stories/same-id with the local models (spec 0001, M2). The CLI does not exist yet;
// this script is its `build --refresh-speech` for one story: it reads the story, builds the Plan, narrates every
// Line (a Line whose entry exists is a hit and loads no model), checks that the aligned words schedule, and
// prints the length of the video. Needs REEBEAT_KOKORO_CACHE and REEBEAT_WHISPER_MODEL (see the package readme).
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { buildPlan, schedule } from "@reebeat/core";
import { Duration, Effect, FileSystem, Path } from "effect";

import { Speech, sha256Hex, speechLive } from "../src/index.ts";

const refill = Effect.gen(function* refillStory() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("../../../", import.meta.url));
  const story = path.join(root, "stories", "same-id");
  const source = yield* fs.readFileString(path.join(story, "story.fountain"));
  const sourceSha256 = yield* sha256Hex(new TextEncoder().encode(source));
  const plan = yield* buildPlan(source, sourceSha256);

  const narrate = Effect.gen(function* narrateStory() {
    const speech = yield* Speech;

    return yield* speech.alignLines(plan);
  });

  const [elapsed, aligned] = yield* Effect.timed(
    Effect.provide(narrate, speechLive(path.join(story, "speech-cache")))
  );

  const scheduled = yield* schedule(plan, aligned);

  yield* Effect.log(
    `${aligned.length} Lines narrated in ${Duration.toMillis(elapsed)} ms; the video runs ${scheduled.timeline?.totalFrames} frames`
  );
});

NodeRuntime.runMain(Effect.provide(refill, NodeServices.layer));
