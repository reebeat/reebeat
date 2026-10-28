// Opt-in: `bun run test:live` in packages/speech-kokoro, with REEBEAT_KOKORO_CACHE naming the model directory.
// The SpeechSynthesizer contract against the real model. When the model is absent this suite FAILS (the clauses
// fail with AdapterUnavailable); it never skips.
import { speechSynthesizerContract } from "@reebeat/services/contract";

import { kokoroSynthesizer } from "../src/kokoroSynthesizer.ts";

speechSynthesizerContract("kokoro", kokoroSynthesizer, { voice: "af_heart" });
