// The Renderer, FrameCapturer and Encoder suites have no stand-in to run on here (their live adapters need Chromium
// and ffmpeg and run in their own packages). These small test adapters pass them, so the suites themselves are
// exercised: a clause that could never pass would show up here.
import { Layer } from "effect";

import {
  encoderContract,
  frameCapturerContract,
  rendererContract,
} from "../contract/index.ts";
import { fakeCapturer, fakeEncoder, fakeProbe, fakeRenderer } from "./fakes.ts";
import { platform } from "./support.ts";

rendererContract("fakeRenderer", fakeRenderer());

frameCapturerContract(
  "fakeCapturer",
  Layer.mergeAll(fakeCapturer(), fakeRenderer(), platform)
);

encoderContract("fakeEncoder", Layer.provideMerge(fakeEncoder(), platform), {
  probe: fakeProbe,
});
