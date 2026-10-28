// The two writers and the reader, against a Plan whose frames follow from the core's rules: a Line starts 1 s
// (30 frames) after its slide frame, a Line lasts 500 ms a word, a Scene ends 0.5 s after its last Line.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import {
  parseVtt,
  srt,
  srtTimestamp,
  vtt,
  vttSourceHash,
  vttTimestamp,
} from "../src/index.ts";
import { hash, narrationOf, timed, withLineText } from "./support.ts";

/** The timing rows of a subtitle file, with `separator` read as the WebVTT dot. */
const timesOf = (text: string, separator: string) =>
  Arr.map(
    Arr.filter(text.split("\n"), (row) => row.includes(" --> ")),
    (row) => row.replaceAll(separator, ".")
  );

const spoken = "Five < six and <b>bold</b> & ok.";

describe("timestamps", () => {
  it("a WebVTT timestamp is HH:MM:SS.mmm and a SubRip one HH:MM:SS,mmm", () => {
    assert.strictEqual(vttTimestamp(0), "00:00:00.000");
    assert.strictEqual(vttTimestamp(3_723_456), "01:02:03.456");
    assert.strictEqual(srtTimestamp(0), "00:00:00,000");
    assert.strictEqual(srtTimestamp(3_723_456), "01:02:03,456");
    assert.strictEqual(srtTimestamp(360_000_999), "100:00:00,999");
  });
});

describe("vtt", () => {
  it.effect(
    "starts with WEBVTT, the source hash note, then one cue per Line",
    () =>
      Effect.gen(function* cues() {
        assert.strictEqual(
          vtt(yield* timed),
          Arr.join(
            [
              "WEBVTT",
              "",
              `NOTE source-sha256 ${hash}`,
              "",
              "sc1.l1",
              "00:00:01.000 --> 00:00:03.000",
              "One two three four.",
              "",
              "sc2.l1",
              "00:00:04.500 --> 00:00:06.000",
              "Five six seven.",
              "",
              "sc3.l1",
              "00:00:07.500 --> 00:00:08.000",
              "Done.",
              "",
            ],
            "\n"
          )
        );
      })
  );

  it.effect(
    "writes & < > as entities, & first, so a reader gets the narration back",
    () =>
      Effect.gen(function* escaped() {
        const plan = withLineText(yield* timed, "sc2.l1", spoken);
        const text = vtt(plan);

        assert.include(
          text,
          "Five &lt; six and &lt;b&gt;bold&lt;/b&gt; &amp; ok."
        );
        assert.notInclude(text, "<b>");
        assert.deepStrictEqual(
          Arr.map(parseVtt(text), ({ text: cue }) => cue),
          narrationOf(plan)
        );
      })
  );

  it.effect("does not escape an ampersand twice", () =>
    Effect.gen(function* twice() {
      assert.include(
        vtt(withLineText(yield* timed, "sc2.l1", "fish &amp; chips")),
        "fish &amp;amp; chips"
      );
    })
  );
});

describe("srt", () => {
  it.effect(
    "numbers the cues from 1, with comma timestamps, the narration text and a blank line after each",
    () =>
      Effect.gen(function* cues() {
        assert.strictEqual(
          srt(yield* timed),
          Arr.join(
            [
              "1",
              "00:00:01,000 --> 00:00:03,000",
              "One two three four.",
              "",
              "2",
              "00:00:04,500 --> 00:00:06,000",
              "Five six seven.",
              "",
              "3",
              "00:00:07,500 --> 00:00:08,000",
              "Done.",
              "",
            ],
            "\n"
          )
        );
      })
  );

  it.effect(
    "carries plain text: < > & pass through unchanged and every cue text equals the narration",
    () =>
      Effect.gen(function* plain() {
        const plan = withLineText(yield* timed, "sc2.l1", spoken);
        const text = srt(plan);

        assert.include(text, `\n${spoken}\n`);
        assert.notInclude(text, "&amp;");
        assert.notInclude(text, "&lt;");

        const bodies = Arr.map(text.trimEnd().split("\n\n"), (block) =>
          Arr.join(block.split("\n").slice(2), "\n")
        );

        assert.deepStrictEqual(bodies, narrationOf(plan));
      })
  );

  it.effect("agrees with the WebVTT on every cue time", () =>
    Effect.gen(function* sameTimes() {
      const plan = yield* timed;

      assert.deepStrictEqual(timesOf(srt(plan), ","), timesOf(vtt(plan), "."));
    })
  );
});

describe("parseVtt", () => {
  it.effect(
    "round trip: the cues of vtt(plan) are the Lines of the Plan, in time and in text",
    () =>
      Effect.gen(function* roundTrip() {
        const plan = withLineText(yield* timed, "sc2.l1", spoken);
        const cues = parseVtt(vtt(plan));

        assert.deepStrictEqual(
          Arr.map(cues, ({ text }) => text),
          narrationOf(plan)
        );
        assert.deepStrictEqual(
          Arr.map(cues, ({ endMs, startMs }) => [startMs, endMs]),
          [
            [1000, 3000],
            [4500, 6000],
            [7500, 8000],
          ]
        );
        assert.strictEqual(vttSourceHash(vtt(plan)), hash);
      })
  );

  it("reads what ffmpeg writes for mov_text: a header without a NOTE, multi-line text, no identifier", () => {
    const written = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:02.500",
      "first &amp; second",
      "line two &lt;b&gt;",
      "",
      "1:02:03.004 --> 1:02:04.000",
      "again",
      "",
    ];

    assert.deepStrictEqual(parseVtt(Arr.join(written, "\n")), [
      { endMs: 2500, startMs: 1000, text: "first & second\nline two <b>" },
      { endMs: 3_724_000, startMs: 3_723_004, text: "again" },
    ]);
    assert.isUndefined(vttSourceHash(Arr.join(written, "\n")));
  });

  it.effect(
    "control: a stale subtitle file no longer equals the narration after one Line is edited",
    () =>
      Effect.gen(function* stale() {
        const plan = yield* timed;
        const edited = withLineText(plan, "sc2.l1", "Five six eight.");
        const written = Arr.map(parseVtt(vtt(plan)), ({ text }) => text);

        assert.deepStrictEqual(written, narrationOf(plan));
        assert.notDeepEqual(written, narrationOf(edited));
      })
  );
});
