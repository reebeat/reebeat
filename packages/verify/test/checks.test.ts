// The checks on a small story built end to end, and the negative control of each falsifier: a mutation of one
// written file (or a re-render with one thing changed) that makes that falsifier fail, naming the item, while the
// falsifiers the mutation does not touch still hold.
//   F1  a show commanded two frames late, a sound three frames late, a whoosh at the first word of its Line, a renderer
//       that declares the wrong lifecycle
//   F2  one character of the .vtt, and of the mov_text stream
//   F3  a note of deck.html                    F4  a deleted and a swapped fragment of deck.html, a moved sound
//   F5  one hash, a source edited after the build, a deck rebuilt alone
//   F6  a frame replaced in one of two builds  F7  a hard cut instead of the transition, and a reversed transition
//   F8  the audio delayed by three frames      F9  a renamed chapter
import { assert, layer } from "@effect/vitest";
import { buildPlan, encodePlan } from "@reebeat/core";
import { sha256Hex } from "@reebeat/pipeline";
import {
  renderDeck,
  revealLifecycle,
  revealRenderer,
} from "@reebeat/render-reveal";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  Stream,
  String as Str,
  pipe,
} from "effect";

import {
  BuildInvalid,
  compareBuilds,
  exitCode,
  renderVerdicts,
  runChecks,
} from "../src/index.ts";
import {
  Fixture,
  buildFixtureOf,
  buildName,
  checkDirectory,
  control,
  copyBuild,
  decliningRenderer,
  editFile,
  failedIds,
  audioFilter,
  ffmpeg,
  logFailures,
  mapping,
  measuredOf,
  frameMs,
  moveFire,
  narrationFile,
  offsetsIn,
  anchorFrameIn,
  remix,
  rowOf,
  soundFile,
  recapture,
  mp4Of,
  muxFrames,
  replaceInFile,
  rewriteMp4,
  sealBuild,
  shiftCommand,
  shiftSlide,
  slideFrameOf,
  verdictOf,
  assertWhooshThreeFramesLate,
  dingRow,
  whooshRow,
} from "./support.ts";

/** The pattern of the line of one fragment span of deck.html. */
const fragment = (effect: string): string =>
  `[ ]*<span class="fragment effect"[^>]*data-effect-id="${effect}"[^>]*></span>\\n`;

/** A copy of the story's source with `seven` changed to `sevens` (no effect is anchored to it), in a directory of its own. */
const editedSource = Effect.fn("editedSource")(function* edited(name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* Fixture;
  const target = path.join(fixture.root, name, "story.fountain");

  yield* fs.makeDirectory(path.dirname(target), { recursive: true });
  yield* fs.copyFile(fixture.sourcePath, target);
  yield* replaceInFile(target, "Five six seven.", "Five six sevens.");

  return target;
});

/**
 * One Auto-Animate move with a ding at the start of the box's motion and a pop at its end, and no whoosh: nothing
 * sounds near them, so each is found at its own frame.
 */
const lifecycleStory = `Title: Lifecycle
Author: reebeat tests

# One

INT. ONE - DAY #sc1#

Box {id=a cell=tl class=box}

NARRATOR
One two three four.

> AUTO-ANIMATE

INT. TWO - DAY #sc2#

Box {id=a cell=tr class=box}

[[effects
  m1: sound ding at a.move.start
  m2: sound pop at a.move.end
]]

NARRATOR
Five six seven.
`;

layer(Fixture.layer, { excludeTestServices: true, timeout: "300 seconds" })(
  "the checks on a small built story",
  (it) => {
    it.effect("every falsifier holds on the intact build", () =>
      Effect.gen(function* intact() {
        const fixture = yield* Fixture;
        const verdicts = yield* checkDirectory(fixture.build);

        assert.deepStrictEqual(
          Arr.map(verdicts, (verdict) => verdict.id),
          ["F1", "F2", "F3", "F4", "F5", "F7", "F8", "F9"]
        );
        assert.deepStrictEqual(
          failedIds(verdicts),
          [],
          renderVerdicts(verdicts)
        );
        assert.strictEqual(exitCode(verdicts), 0);

        // The measured values are the evidence: six effects and two Lines, each within a frame.
        assert.strictEqual(verdictOf(verdicts, "F1").measured[0]?.[1], 6);
        assert.strictEqual(verdictOf(verdicts, "F8").measured[0]?.[1], 2);
        assert.isAtLeast(Number(verdictOf(verdicts, "F7").measured[1]?.[1]), 5);
        yield* Effect.log(renderVerdicts(verdicts));
      })
    );

    it.effect(
      "a directory without build.json is refused with BuildInvalid",
      () =>
        Effect.gen(function* refused() {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* copyBuild("no-manifest");

          yield* fs.remove(path.join(dir, "build.json"));

          const failure = yield* checkDirectory(dir).pipe(Effect.flip);

          assert.instanceOf(failure, BuildInvalid);
          assert.include(failure.message, "build.json");
        })
    );

    it.effect(
      "F1: a show commanded two frames late is observed two frames late, naming the effect",
      () =>
        Effect.gen(function* late() {
          const fixture = yield* Fixture;

          // The video of the shifted capture, under the Plan, deck and subtitles of the intact build.
          const verdicts = yield* control(
            "f1-late",
            (dir) =>
              muxFrames(dir, recapture(shiftCommand(fixture.plan, "r1", 2))),
            ["F1"]
          );

          const verdict = verdictOf(verdicts, "F1");

          assert.include(verdict.detail, "sc1.r1 show b");
          assert.include(verdict.detail, "+2 frames");
          assert.approximately(
            offsetsIn(rowOf(verdict, "sc1.r1 show b")).own ?? Number.NaN,
            2,
            0.5
          );
        })
    );

    it.effect(
      "F1: the whoosh anchored to transition.start sounds at the first changed frame of the scene change, and at its resolved frame",
      () =>
        Effect.gen(function* anchored() {
          const fixture = yield* Fixture;
          const verdict = verdictOf(yield* checkDirectory(fixture.build), "F1");
          const row = rowOf(verdict, whooshRow);
          const offsets = offsetsIn(row);

          assert.strictEqual(verdict.status, "pass", verdict.detail);
          assert.isAtMost(Math.abs(offsets.anchor ?? Number.NaN), 1, row);
          assert.isAtMost(Math.abs(offsets.own ?? Number.NaN), 1, row);
          // The anchor is the observed slide change, not the Timeline's own number.
          assert.approximately(
            anchorFrameIn(row),
            slideFrameOf(fixture.plan, "sc2"),
            1
          );
          yield* Effect.log(row);
        })
    );

    it.effect(
      "F1: the ding anchored to the middle of the box's move sounds at the frame the box is halfway, which is not the middle of the transition",
      () =>
        Effect.gen(function* halfway() {
          const fixture = yield* Fixture;
          const verdict = verdictOf(yield* checkDirectory(fixture.build), "F1");
          const row = rowOf(verdict, dingRow);
          const offsets = offsetsIn(row);
          const slide = slideFrameOf(fixture.plan, "sc2");

          assert.isAtMost(Math.abs(offsets.anchor ?? Number.NaN), 1, row);
          assert.isAtMost(Math.abs(offsets.own ?? Number.NaN), 1, row);

          // `ease` is in front of its middle: the box is half way well before 0.4 s (12 frames), and well after it starts.
          assert.isAbove(anchorFrameIn(row), slide + 4);
          assert.isBelow(anchorFrameIn(row), slide + 12);
          yield* Effect.log(row);
        })
    );

    it.effect(
      "F1: a whoosh delayed by three frames is observed three frames from its resolved frame, though it still sounds at the slide change it was written for",
      () => assertWhooshThreeFramesLate("f1-whoosh-late")
    );

    it.effect(
      "F1: a whoosh the Timeline and the audio both put at the first word of its Line (30 frames after the slide change) fails against the observed slide change",
      () =>
        Effect.gen(function* firstWord() {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const fixture = yield* Fixture;
          const [firstScene, scene] = fixture.plan.timeline.scenes;
          const line = scene?.lines[0];
          const first = firstScene?.lines[0];
          const lineStart = line?.startFrame ?? 0;

          assert.strictEqual(lineStart, (scene?.slideFrame ?? 0) + 30);

          // The release-1 schedule: the sound at the Line's start. The Timeline of plan.json and the audio agree on it.
          // The test narrator is loud noise that would hide the whoosh, so the Line's narration is mixed at a fifth.
          const moved = moveFire(fixture.plan, "s1", lineStart);

          const pop = Arr.findFirst(
            firstScene?.effects ?? [],
            (effect) => effect.effectId === "p1"
          );

          const verdicts = yield* control(
            "f1-first-word",
            (dir) =>
              Effect.gen(function* remixed() {
                yield* remix([
                  {
                    file: narrationFile(fixture, "sc1.l1"),
                    startMs: frameMs(first?.startFrame ?? 0),
                  },
                  {
                    file: narrationFile(fixture, "sc2.l1"),
                    gain: 0.2,
                    startMs: frameMs(lineStart),
                  },
                  {
                    file: soundFile(fixture, "pop"),
                    startMs: frameMs(
                      Option.getOrElse(
                        Option.map(pop, (effect) => effect.fireFrame),
                        () => 0
                      )
                    ),
                  },
                  {
                    file: soundFile(fixture, "whoosh"),
                    startMs: frameMs(lineStart),
                  },
                ])(dir);
                yield* fs.writeFileString(
                  path.join(dir, "plan.json"),
                  yield* Effect.orDie(encodePlan(moved))
                );
              }),
            // The quiet narration under the whoosh falls below F8's score floor: a side effect of this crude mix.
            ["F1", "F8"]
          );

          const verdict = verdictOf(verdicts, "F1");
          const offsets = offsetsIn(rowOf(verdict, whooshRow));

          assert.include(verdict.detail, "sc2.s1 sound whoosh");
          assert.include(verdict.detail, "frames from its resolved frame");
          assert.approximately(offsets.own ?? Number.NaN, 0, 1);
          assert.approximately(offsets.anchor ?? Number.NaN, -30, 1);
        })
    );

    it.effect(
      "F1 (the heart of spec 0002): a renderer that declares the wrong lifecycle fails on the observed event, and the right declaration passes",
      () =>
        Effect.gen(function* wrongDeclaration() {
          const right = yield* buildFixtureOf(lifecycleStory, revealRenderer);

          // reveal.js does not start the matched Element's motion at the slide change: the declaration says it does.
          const wrong = yield* buildFixtureOf(
            lifecycleStory,
            decliningRenderer({
              ...revealLifecycle,
              matched: { ...revealLifecycle.matched, startLagFrames: 0 },
            })
          );

          const checked = (built: typeof right) =>
            runChecks({
              buildDir: built.build,
              cacheDir: built.cacheDir,
              sourcePath: built.sourcePath,
            });

          const intact = verdictOf(yield* checked(right), "F1");
          const declared = yield* checked(wrong);
          const broken = verdictOf(declared, "F1");

          assert.strictEqual(intact.status, "pass", intact.detail);
          assert.deepStrictEqual(failedIds(declared), ["F1"]);
          assert.include(broken.detail, "sc2.m1 sound ding");
          assert.include(broken.detail, "frames from its resolved frame");

          // It starts at the slide frame in the wrong Timeline and 2 frames later in the video: the anchor is 2 off.
          assert.approximately(
            offsetsIn(rowOf(broken, "sc2.m1 sound ding")).anchor ?? Number.NaN,
            2,
            0.5
          );
          assert.approximately(
            offsetsIn(rowOf(intact, "sc2.m1 sound ding")).anchor ?? Number.NaN,
            0,
            1
          );
        })
    );

    it.effect(
      "F7: a scene change commanded two frames late, and two frames early, is observed there, naming the Scene (the whoosh anchored to it is then two frames from the observed slide change: F1)",
      () =>
        Effect.gen(function* sceneChanges() {
          const fixture = yield* Fixture;

          const late = yield* control(
            "f7-late",
            (dir) =>
              muxFrames(dir, recapture(shiftSlide(fixture.plan, "sc2", 2))),
            ["F1", "F7"]
          );

          const early = yield* control(
            "f7-early",
            (dir) =>
              muxFrames(dir, recapture(shiftSlide(fixture.plan, "sc2", -2))),
            ["F1", "F7"]
          );

          assert.include(
            verdictOf(late, "F7").detail,
            "the slide change into sc2 (auto-animate) is observed +2 frames"
          );
          assert.include(
            verdictOf(early, "F7").detail,
            "the slide change into sc2 (auto-animate) is observed -2 frames"
          );
          // The Timeline still says the slide frame; the slide change is observed 2 frames later (earlier) than it.
          assert.approximately(
            offsetsIn(rowOf(verdictOf(late, "F1"), whooshRow)).anchor ??
              Number.NaN,
            2,
            0.5
          );
          assert.approximately(
            offsetsIn(rowOf(verdictOf(early, "F1"), whooshRow)).anchor ??
              Number.NaN,
            -2,
            0.5
          );
        })
    );

    it.effect("F2: one character of the .vtt file fails, naming the Line", () =>
      Effect.gen(function* vttEdit() {
        const path = yield* Path.Path;

        const verdicts = yield* control(
          "f2-vtt",
          (dir) =>
            replaceInFile(
              path.join(dir, `${buildName}.vtt`),
              "One two",
              "Won two"
            ),
          ["F2"]
        );

        const { detail } = verdictOf(verdicts, "F2");

        assert.include(detail, ".vtt file, Line sc1.l1");
        assert.include(detail, "Won two");
      })
    );

    it.effect(
      "F2: one character of the mov_text stream fails, naming the Line, with the .vtt file intact",
      () =>
        Effect.gen(function* streamEdit() {
          const path = yield* Path.Path;
          const fixture = yield* Fixture;
          const edited = path.join(fixture.root, "edited.vtt");

          const verdicts = yield* control(
            "f2-stream",
            (dir) =>
              Effect.gen(function* remuxSubtitles() {
                yield* ffmpeg([
                  "-i",
                  yield* mp4Of(dir),
                  "-map",
                  "0:s:0",
                  "-f",
                  "webvtt",
                  edited,
                ]);
                yield* replaceInFile(edited, "Five six", "Fave six");
                yield* rewriteMp4(
                  dir,
                  [edited],
                  [
                    ...mapping("1:0", "0"),
                    "-c:v",
                    "copy",
                    "-c:a",
                    "copy",
                    "-c:s",
                    "mov_text",
                  ]
                );
              }),
            ["F2"]
          );

          const { detail } = verdictOf(verdicts, "F2");

          assert.include(detail, "mov_text stream, Line sc2.l1");
          assert.include(detail, "Fave six");
        })
    );

    it.effect("F3: one character of a note fails, naming the slide", () =>
      Effect.gen(function* noteEdit() {
        const path = yield* Path.Path;

        const verdicts = yield* control(
          "f3-note",
          (dir) =>
            replaceInFile(
              path.join(dir, "deck.html"),
              "<p>One two three four.</p>",
              "<p>One two three fou.</p>"
            ),
          ["F3"]
        );

        const { detail } = verdictOf(verdicts, "F3");

        assert.include(detail, "slide sc1, note 1");
        assert.include(detail, "One two three fou.");
      })
    );

    it.effect(
      "F4: a deleted fragment, two swapped fragments and a sound moved to another step fail, naming the slide and the position",
      () =>
        Effect.gen(function* fragmentEdits() {
          const path = yield* Path.Path;

          const afterDelete = yield* control(
            "f4-deleted",
            (dir) =>
              editFile(path.join(dir, "deck.html"), (text) =>
                Str.replace(new RegExp(fragment("f0"), "u"), "")(text)
              ),
            ["F4"]
          );

          const afterSwap = yield* control(
            "f4-swapped",
            (dir) =>
              editFile(path.join(dir, "deck.html"), (text) =>
                Str.replace(
                  new RegExp(
                    `(?<first>${fragment("r1")})(?<second>${fragment("f0")})`,
                    "u"
                  ),
                  "$<second>$<first>"
                )(text)
              ),
            ["F4"]
          );

          // The pop rides on the focus f0 (the step before its time); the page puts it on the show r1 before it.
          const afterMove = yield* control(
            "f4-sound-moved",
            (dir) =>
              editFile(path.join(dir, "deck.html"), (text) =>
                pipe(
                  text,
                  Str.replace(' data-sounds="pop"', ""),
                  Str.replace(
                    'data-effect-id="r1"',
                    'data-sounds="pop" data-effect-id="r1"'
                  )
                )
              ),
            ["F4"]
          );

          assert.include(
            verdictOf(afterDelete, "F4").detail,
            "scene sc1, fragment 1"
          );
          assert.include(
            verdictOf(afterSwap, "F4").detail,
            "scene sc1, fragment 0"
          );
          assert.include(
            verdictOf(afterMove, "F4").detail,
            "slide sc1, fragment 0"
          );
          assert.include(verdictOf(afterMove, "F4").detail, "playing pop");
        })
    );

    it.effect(
      "F5: one changed hash in plan.json fails, naming plan.json; unsealed, build.json notices the edit too",
      () =>
        Effect.gen(function* hashEdit() {
          const path = yield* Path.Path;
          const fixture = yield* Fixture;
          const dir = yield* copyBuild("f5-unsealed");
          const hash = fixture.plan.sourceSha256;
          const flipped = `${Str.startsWith("0")(hash) ? "1" : "0"}${Str.slice(1)(hash)}`;

          yield* replaceInFile(path.join(dir, "plan.json"), hash, flipped);

          const unsealed = yield* checkDirectory(dir);

          assert.deepStrictEqual(failedIds(unsealed), ["F5"]);
          assert.include(verdictOf(unsealed, "F5").detail, "plan.json says");
          assert.include(
            measuredOf(verdictOf(unsealed, "F5")),
            "plan.json equals the Plan of the source: no"
          );

          // Sealed again, only the hash itself is left to find.
          const sealed = yield* control(
            "f5-sealed",
            (copy) =>
              replaceInFile(path.join(copy, "plan.json"), hash, flipped),
            ["F5"]
          );

          assert.include(verdictOf(sealed, "F5").detail, "plan.json says");
        })
    );

    it.effect(
      "F5: a source edited after the build makes every output stale; F2 and F3 fail with it",
      () =>
        Effect.gen(function* staleSource() {
          const fixture = yield* Fixture;
          const edited = yield* editedSource("edited-source");
          const verdicts = yield* checkDirectory(fixture.build, edited);
          const verdict = verdictOf(verdicts, "F5");

          yield* logFailures(verdicts);
          assert.deepStrictEqual(failedIds(verdicts), ["F2", "F3", "F5"]);
          assert.include(verdict.detail, "plan.json says");
          assert.include(
            measuredOf(verdict),
            "plan.json equals the Plan of the source: no"
          );
        })
    );

    it.effect(
      "F5: rebuilding only the deck after editing the source leaves the stale video, and F5 fails on its hash",
      () =>
        Effect.gen(function* deckOnly() {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const fixture = yield* Fixture;
          const dir = yield* copyBuild("f5-deck-only");
          const edited = yield* editedSource("deck-only-source");
          const text = yield* fs.readFileString(edited);

          const plan = yield* buildPlan(
            text,
            yield* sha256Hex(new TextEncoder().encode(text))
          );

          // The Deck of the new source, with the Timeline of the old one (the edit keeps every frame).
          yield* fs.writeFileString(
            path.join(dir, "deck.html"),
            renderDeck({ ...plan, timeline: fixture.plan.timeline }).html
          );
          yield* sealBuild(dir, edited);

          const verdicts = yield* checkDirectory(dir, edited);
          const measured = measuredOf(verdictOf(verdicts, "F5"));

          yield* logFailures(verdicts);
          assert.deepStrictEqual(failedIds(verdicts), ["F2", "F5"]);
          assert.include(measured, "deck.html data-source-sha256: equal");
          assert.notInclude(measured, "mp4 comment: equal");
          assert.notInclude(measured, ".vtt NOTE: equal");
          assert.notInclude(measured, "plan.json: equal");
        })
    );

    it.effect(
      "F7: a hard cut in place of the transition shows too few intermediate frames",
      () =>
        Effect.gen(function* hardCut() {
          const fixture = yield* Fixture;
          const slide = slideFrameOf(fixture.plan, "sc2");

          assert.isAbove(slide, 0);

          // From the slide change, thirty frames show the settled slide: the transition is cut out.
          const cut = Arr.map(fixture.frames, (frame, index) =>
            index >= slide && index < slide + 30
              ? (fixture.frames[slide + 30] ?? frame)
              : frame
          );

          const verdicts = yield* control(
            "f7-cut",
            (dir) => muxFrames(dir, Stream.fromIterable(cut)),
            // The ding anchored to the middle of the box's move is half way at the cut, where the Timeline says 9 frames later.
            ["F1", "F7"]
          );

          const verdict = verdictOf(verdicts, "F7");

          assert.include(verdict.detail, "the transition into sc2 shows");
          assert.include(
            verdict.detail,
            "distinct intermediate frames, at least 5 are needed"
          );

          // The encoder's own refinement of the first frames after a cut is all that is left between the two ends.
          const distinct = Option.getOrThrow(
            Arr.findFirst(verdict.measured, ([name]) =>
              Str.endsWith("distinct intermediate frames")(name)
            )
          );

          assert.isAtMost(Number(distinct[1]), 3);
        })
    );

    it.effect(
      "F7: a transition played backwards shows its intermediate frames but does not approach the settled frame",
      () =>
        Effect.gen(function* backwards() {
          const fixture = yield* Fixture;

          // The transition runs from the slide frame to 24 frames after: reverse that run. The picture still changes
          // at the slide frame, so only the approach to the settled frame is wrong.
          const first = slideFrameOf(fixture.plan, "sc2");
          const last = first + 24;

          const reversed = Arr.map(fixture.frames, (frame, index) =>
            index >= first && index <= last
              ? (fixture.frames[first + last - index] ?? frame)
              : frame
          );

          const verdicts = yield* control(
            "f7-backwards",
            (dir) => muxFrames(dir, Stream.fromIterable(reversed)),
            // The box is half way on the way back, not where the Timeline resolved the ding: F1 sees it too.
            ["F1", "F7"]
          );

          assert.include(
            verdictOf(verdicts, "F7").detail,
            "the transition into sc2 does not approach its settled frame monotonically"
          );
        })
    );

    it.effect(
      "F8: the audio delayed by three frames fails, naming the Lines (the sound of the sfx Cue is late with it: F1)",
      () =>
        Effect.gen(function* delayed() {
          const verdicts = yield* control(
            "f8-delay",
            audioFilter("adelay=100:all=1"),
            ["F1", "F8"]
          );

          assert.include(
            verdictOf(verdicts, "F8").detail,
            "Line sc1.l1 starts +3 frames"
          );
          assert.include(verdictOf(verdicts, "F1").detail, "sc1.p1 sound pop");
        })
    );

    it.effect(
      "F8 and F1: audio delayed beyond the search window, and a silent track, are not found: the match score is below the floor",
      () =>
        Effect.gen(function* notFound() {
          const late = yield* control(
            "f8-far",
            audioFilter("adelay=400:all=1"),
            ["F1", "F8"]
          );

          const silent = yield* control("f8-silent", audioFilter("volume=0"), [
            "F1",
            "F8",
          ]);

          for (const verdicts of [late, silent]) {
            assert.include(
              verdictOf(verdicts, "F8").detail,
              "Line sc1.l1: its audio is not found within 150 ms"
            );
            assert.include(
              verdictOf(verdicts, "F1").detail,
              "sc1.p1 sound pop"
            );
          }
        })
    );

    it.effect("F9: a renamed chapter fails, naming the chapter", () =>
      Effect.gen(function* renamed() {
        const path = yield* Path.Path;
        const fixture = yield* Fixture;
        const meta = path.join(fixture.root, "chapters.ffmetadata");

        const verdicts = yield* control(
          "f9-rename",
          (dir) =>
            Effect.gen(function* renameChapter() {
              yield* ffmpeg([
                "-i",
                yield* mp4Of(dir),
                "-f",
                "ffmetadata",
                meta,
              ]);
              yield* replaceInFile(meta, "title=Part one", "title=Part uno");
              yield* rewriteMp4(
                dir,
                [meta],
                [...mapping("0:s", "1"), "-c", "copy"]
              );
            }),
          ["F9"]
        );

        const { detail } = verdictOf(verdicts, "F9");

        assert.include(detail, "chapter ch1");
        assert.include(detail, "Part uno");
      })
    );

    it.effect(
      "F6: a copy of a build decodes to the same frames and samples, and its bytes are identical",
      () =>
        Effect.gen(function* same() {
          const fixture = yield* Fixture;

          const verdict = yield* compareBuilds(
            fixture.build,
            yield* copyBuild("f6-copy")
          );

          assert.strictEqual(verdict.status, "pass", verdict.detail);
          assert.include(verdict.detail, "container bytes identical");
          yield* Effect.log(renderVerdicts([verdict]));
        })
    );

    it.effect(
      "F6: one frame replaced in the second build fails, naming the first differing frame",
      () =>
        Effect.gen(function* perturbed() {
          const fixture = yield* Fixture;
          const dir = yield* copyBuild("f6-perturbed");

          // Frame 40 shows the first slide; frame 100 shows the second.
          const frames = Arr.map(fixture.frames, (frame, index) =>
            index === 40 ? (fixture.frames[100] ?? frame) : frame
          );

          yield* muxFrames(dir, Stream.fromIterable(frames));

          const verdict = yield* compareBuilds(fixture.build, dir);

          const named = /first differing video frame is (?<frame>\d+)/u.exec(
            verdict.detail
          );

          assert.strictEqual(verdict.status, "fail");
          assert.isNotNull(named);
          assert.isAtMost(Number(named?.groups?.frame), 40);
          yield* Effect.log(renderVerdicts([verdict]));
        })
    );
  }
);
