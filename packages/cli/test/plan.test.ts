// `reebeat plan`: the Plan for review, its JSON, the timing from the speech cache, and the loud failures (spec 0001,
// F10 and F12: each error class stops with its tag and the source line, and the exit is not zero).
import { assert, layer } from "@effect/vitest";
import { decodePlan } from "@reebeat/core";
import type { PlanError } from "@reebeat/core";
import { sha256Hex } from "@reebeat/pipeline";
import { Array as Arr, Effect, Exit, FileSystem, Option, Path } from "effect";

import {
  fillCache,
  platform,
  runCli,
  sameId,
  storyFile,
  storyText,
  storyWithCache,
  tempDirectory,
  writeIn,
  writeText,
} from "./support.ts";

/** The flags of the offline stand-ins for narration. */
const offline = ["--speech", "silent", "--aligner", "even"] as const;

layer(platform)("reebeat plan", (it) => {
  it.effect("prints the review text of the committed story and exits 0", () =>
    Effect.gen(function* review() {
      const { exit, stdout } = yield* runCli(["plan", (yield* sameId).story]);

      assert.isTrue(Exit.isSuccess(exit));
      assert.include(
        stdout,
        "Plan: 7 scenes, 12 lines, 11 effects; 3 to enter, 3 to exit, 4 to update"
      );
      assert.include(stdout, "Scene sc4  INT. THE NEXT SCREEN - DAY");
    })
  );

  it.effect(
    "prints plan.json with --json: no Timeline, the hash of the file's bytes, the same text twice",
    () =>
      Effect.gen(function* json() {
        const fs = yield* FileSystem.FileSystem;
        const { story } = yield* sameId;
        const first = yield* runCli(["plan", story, "--json"]);
        const second = yield* runCli(["plan", "--json", story]);
        const plan = yield* decodePlan(first.stdout);

        assert.isTrue(Exit.isSuccess(first.exit));
        assert.strictEqual(first.stdout, second.stdout);
        assert.isUndefined(plan.timeline);
        assert.strictEqual(
          plan.sourceSha256,
          yield* sha256Hex(yield* fs.readFile(story))
        );
      })
  );

  it.effect(
    "keeps a byte-order mark: the Plan carries the hash of the file's bytes, not of the text without it",
    () =>
      Effect.gen(function* bom() {
        const dir = yield* tempDirectory;
        const bytes = new TextEncoder().encode(`\uFEFF${storyText}`);
        const file = yield* writeIn(dir, "story.fountain", bytes);
        const { exit, stdout } = yield* runCli(["plan", file, "--json"]);
        const plan = yield* decodePlan(stdout);

        assert.isTrue(Exit.isSuccess(exit));
        assert.strictEqual(plan.sourceSha256, yield* sha256Hex(bytes));
        // The mutation that this guards against: dropping the mark changes the bytes that are hashed.
        assert.notStrictEqual(
          plan.sourceSha256,
          yield* sha256Hex(new TextEncoder().encode(storyText))
        );
      })
  );

  it.effect("--timing shows frames from the speech cache, read-only", () =>
    Effect.gen(function* timing() {
      const fs = yield* FileSystem.FileSystem;
      const { cacheDir, story } = yield* storyWithCache;
      const before = yield* fs.readDirectory(cacheDir);

      const review = yield* runCli(["plan", story, "--timing", ...offline]);

      const json = yield* runCli([
        "plan",
        story,
        "--timing",
        "--json",
        ...offline,
      ]);

      const plan = yield* decodePlan(json.stdout);

      assert.isTrue(Exit.isSuccess(review.exit));
      assert.match(review.stdout, /Timeline: \d+ frames, [\d.]+ s at 30 fps/u);
      assert.isDefined(plan.timeline);
      assert.deepStrictEqual(yield* fs.readDirectory(cacheDir), before);
    })
  );

  it.effect("--timing takes the cache named by --cache-dir", () =>
    Effect.gen(function* elsewhere() {
      const path = yield* Path.Path;
      const story = yield* storyFile();
      const cacheDir = path.join(yield* tempDirectory, "cache");

      yield* fillCache(cacheDir, storyText);

      const { exit, stdout } = yield* runCli([
        "plan",
        story,
        "--timing",
        "--cache-dir",
        cacheDir,
        ...offline,
      ]);

      assert.isTrue(Exit.isSuccess(exit));
      assert.include(stdout, "Timeline:");
    })
  );

  it.effect(
    "--timing without a cache entry fails with SpeechCacheMiss naming the Line and the key",
    () =>
      Effect.gen(function* miss() {
        const story = yield* storyFile();

        const { exit, stderr } = yield* runCli([
          "plan",
          story,
          "--timing",
          ...offline,
        ]);

        assert.isTrue(Exit.isFailure(exit));
        assert.include(stderr, "SpeechCacheMiss");
        assert.include(stderr, "sc1.l1");
        assert.match(stderr, /[0-9a-f]{64}/u);
      })
  );

  it.effect(
    "--timing under the other narrator is a miss: the key names the adapter that made the audio",
    () =>
      Effect.gen(function* otherNarrator() {
        const { cacheDir, story } = yield* storyWithCache;

        // The cache holds the silent narrator's assets; the default narrator, Kokoro, finds none of its own.
        const { exit, stderr } = yield* runCli([
          "plan",
          story,
          "--timing",
          "--cache-dir",
          cacheDir,
        ]);

        assert.isTrue(Exit.isFailure(exit));
        assert.include(stderr, "SpeechCacheMiss");
      })
  );

  it.effect(
    "a missing file fails with SourceUnreadable and prints no stack",
    () =>
      Effect.gen(function* missing() {
        const dir = yield* tempDirectory;

        const { exit, stderr } = yield* runCli([
          "plan",
          `${dir}/nothing.fountain`,
        ]);

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^SourceUnreadable: cannot read /u);
        assert.notInclude(stderr, "\n    at ");
      })
  );
});

/** The test story with its only occurrence of `from` replaced by `to`. */
const change = (from: string, to: string): string => {
  assert.include(storyText, from);

  return storyText.replace(from, to);
};

interface Case {
  readonly needle: string;
  readonly source: string;
  readonly tag: PlanError["_tag"];
}

// One mutation per error class of the Plan stage (F10's list of release 1, plus the classes spec 0002 adds).
const cases: readonly Case[] = [
  {
    needle: "## Deeper",
    source: change("INT. ONE", "## Deeper\n\nINT. ONE"),
    tag: "UnsupportedElement",
  },
  {
    needle: "[[next]]",
    source: change("One two three. Four", "One two three. [[next]] Four"),
    tag: "ReleaseOneForm",
  },
  {
    needle: "Again {id=a",
    source: change(
      "Box {id=a cell=mc class=box}",
      "Box {id=a cell=mc class=box}\nAgain {id=a cell=tr class=box}"
    ),
    tag: "DuplicateId",
  },
  {
    needle: "No id here",
    source: change(
      "Box {id=a cell=mc class=box}",
      "Box {id=a cell=mc class=box}\nNo id here"
    ),
    tag: "MissingId",
  },
  {
    needle: "cell=zz",
    source: change("cell=mc", "cell=zz"),
    tag: "BadProperty",
  },
  {
    needle: "INT. TWO",
    source: change("INT. TWO #sc2#", "INT. TWO"),
    tag: "BadSceneId",
  },
  {
    needle: "f1: focus nope",
    source: change("f1: focus a", "f1: focus nope"),
    tag: "UnknownReference",
  },
  {
    needle: 'word("nine")',
    source: change('word("five")', 'word("nine")'),
    tag: "UnknownReference",
  },
  {
    needle: 'r1: show b at word("three")',
    source: change("One two three. Four five.", "One two three. Three five."),
    tag: "AmbiguousWord",
  },
  {
    needle: "p1: sound pop at a.move.start",
    source: change('word("five").end', "a.move.start"),
    tag: "NoSuchEvent",
  },
  {
    needle: "p1: sound pop at p1.start",
    source: change('word("five").end', "p1.start"),
    tag: "EffectCycle",
  },
  {
    needle: "at 1.5s",
    source: change('word("five").end', "1.5s"),
    tag: "AbsoluteNeedsReason",
  },
  {
    needle: "Later {id=b",
    source: change('  r1: show b at word("three").end\n', ""),
    tag: "HiddenNeverRevealed",
  },
  {
    needle: "(whisper)",
    source: change("NARRATOR\nOne two", "NARRATOR\n(whisper)\nOne two"),
    tag: "BadParenthetical",
  },
  {
    needle: "> FADE",
    source: change("> AUTO-ANIMATE", "> FADE"),
    tag: "BadTransition",
  },
  {
    needle: "sound boom",
    source: change("sound pop", "sound boom"),
    tag: "UnknownSfx",
  },
  {
    needle: "Six *seven*",
    source: change("Six seven.", "Six *seven*."),
    tag: "EmphasisInDialogue",
  },
  {
    needle: "INT. ONE",
    source: change("# Part\n\n", ""),
    tag: "SceneBeforeSection",
  },
];

/** The 1-based number of the first line of `source` that contains `needle`. */
const lineOf = (source: string, needle: string): number =>
  Option.getOrThrow(
    Arr.findFirstIndex(source.split("\n"), (row) => row.includes(needle))
  ) + 1;

layer(platform)("reebeat plan on a story with a mistake (F12)", (it) => {
  it.effect.each(cases)(
    "$tag stops the command with its source line and a non-zero exit",
    ({ needle, source, tag }) =>
      Effect.gen(function* loud() {
        const file = yield* writeText(
          yield* tempDirectory,
          "story.fountain",
          source
        );

        const { exit, stderr, stdout } = yield* runCli(["plan", file]);

        assert.isTrue(Exit.isFailure(exit));
        assert.strictEqual(stdout, "");
        assert.match(
          stderr,
          new RegExp(`^${tag} \\(line ${lineOf(source, needle)}\\): `, "u")
        );
        assert.notInclude(stderr, "\n    at ");
      })
  );
});
