// The services of a real run, for the two entry points (`bin.ts`, `scripts/journey.ts`): the Node platform,
// ffmpeg, Chromium and the verification.
import { NodeServices } from "@effect/platform-node";
import { Browser, MediaTools } from "@reebeat/video";
import { Layer } from "effect";

import { Verifier } from "../src/verifier.ts";

const tools = Layer.mergeAll(MediaTools.layer, Browser.layer).pipe(
  Layer.provideMerge(NodeServices.layer)
);

export const cliServices = Verifier.layer.pipe(Layer.provideMerge(tools));
