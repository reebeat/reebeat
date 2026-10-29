// F2, F4 and F5 of spec 0002, the loud half: each error class of the Plan stage is raised for one mutation of a
// small valid story, with the error's tag, the exact source line and the exact message (a golden: what was found,
// what was expected, the nearest valid form). `buildPlan` fails with the first error in document order;
// `collectErrors` lists them all in that order.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, String as Str, pipe } from "effect";

import { buildPlan, collectErrors } from "../src/build.ts";
import type { PlanError } from "../src/errors.ts";
import { anchorFormsText } from "../src/grammar.ts";
import { asText, fixtureSha256, lineOf } from "./support.ts";

const base = asText([
  "Title: Errors",
  "",
  "# Section",
  "",
  "INT. ONE #one#",
  "",
  "Box {id=a cell=tl class=box}",
  "Later {id=h cell=mc class=label visible=false}",
  "",
  "[[effects",
  '  r1: show h at word("hello").end',
  '  f1: focus a at word("goodbye").start',
  "  s1: sound pop at r1.end +100ms",
  "]]",
  "",
  "NARRATOR",
  "Hello there. Goodbye.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. TWO #two#",
  "",
  "Box {id=a cell=mc class=box}",
  "Fresh {id=f cell=tr class=title}",
  "",
  "[[effects",
  "  m1: sound ding at a.move.start",
  "]]",
  "",
  "NARRATOR",
  "Moving on.",
  "",
]);

/** The base story with its only occurrence of `from` replaced by `to`. */
const change = (from: string, to: string): string => {
  assert.strictEqual(
    Str.split(base, from).length,
    2,
    `${from} occurs once in the base`
  );

  return Str.replace(from, to)(base);
};

const firstError = (source: string) =>
  Effect.flip(buildPlan(source, fixtureSha256));

/** What a mutation must produce: the tag, the needle of the line that carries the mistake, and the message. */
interface Case {
  /** How many lines above the needle line the error stands (a block opens above its first row). */
  readonly above?: number;
  readonly message: string;
  readonly name: string;
  readonly needle: string;
  readonly source: string;
  readonly tag: PlanError["_tag"];
}

const noReveal = '  r1: show h at word("hello").end\n';

const cases: readonly Case[] = [
  {
    message:
      'unknown Element property "colour"; expected id, cell, class or visible',
    name: "an unknown Element property",
    needle: "colour=box",
    source: change("class=box}\nLater", "colour=box}\nLater"),
    tag: "BadProperty",
  },
  {
    message:
      'Element property "id" appears twice (id=a and id=b); expected each property once',
    name: "a repeated Element property",
    needle: "id=b",
    source: change("{id=a cell=tl class=box}", "{id=a cell=tl id=b class=box}"),
    tag: "BadProperty",
  },
  {
    message:
      "cell=zz is not a valid value; expected tl, tc, tr, ml, mc, mr, bl, bc or br; did you mean tl?",
    name: "a cell outside the grid",
    needle: "cell=zz",
    source: change("cell=tl", "cell=zz"),
    tag: "BadProperty",
  },
  {
    message:
      'Element "Box" has no class; expected class=<box, title, label, accent or muted>',
    name: "an Element without a class",
    needle: "Box {id=a cell=tl}",
    source: change("{id=a cell=tl class=box}", "{id=a cell=tl}"),
    tag: "BadProperty",
  },
  {
    message:
      '"box" in the Element properties is not key=value; expected key=value, with the keys id, cell, class or visible; did you mean class=box?',
    name: "a bare value instead of key=value",
    needle: "Box {id=a cell=tl box}",
    source: change("{id=a cell=tl class=box}", "{id=a cell=tl box}"),
    tag: "BadProperty",
  },
  {
    message:
      'Element "Box" has no id; expected "Box {id=<id> cell=<cell> class=<class>}"; did you mean "Box {id=box cell=tl class=label}"?',
    name: "an Element without an id keeps its own cell and class",
    needle: "Box {cell=tl class=label}",
    source: change("Box {id=a cell=tl class=box}", "Box {cell=tl class=label}"),
    tag: "MissingId",
  },
  {
    message:
      'Element "Box" has no id; expected "Box {id=<id> cell=<cell> class=<class>}"; did you mean "Box {id=box cell=tl visible=false class=box}"?',
    name: "an Element without an id and without a class gets an example class only",
    needle: "Box {cell=tl visible=false}",
    source: change(
      "Box {id=a cell=tl class=box}",
      "Box {cell=tl visible=false}"
    ),
    tag: "MissingId",
  },
  {
    above: 1,
    message:
      'Element "Box" has no id; expected "Box {id=<id> cell=<cell> class=<class>}"; did you mean "Box {id=box cell=mc class=box}"?',
    name: "an Element line with no properties at all",
    needle: "Later {id=h",
    source: change("Box {id=a cell=tl class=box}", "Box"),
    tag: "MissingId",
  },
  {
    message:
      'Element id "scene" is reserved by the anchor grammar; expected an identifier that is not beat, scene, state, transition, word, each, first, last, when, within or let',
    name: "an Element id the anchor grammar reserves",
    needle: "id=scene",
    source: change(
      "{id=a cell=tl class=box}\nLater",
      "{id=scene cell=tl class=box}\nLater"
    ),
    tag: "BadProperty",
  },
  {
    message:
      'Scene heading "INT. ONE" has no id; expected the id between # at the end of the heading, as "INT. THE NEXT SCREEN - DAY #sc4#"; did you mean "INT. ONE #sc1#"?',
    name: "a Scene heading without an id (F4)",
    needle: "INT. ONE",
    source: change("INT. ONE #one#", "INT. ONE"),
    tag: "BadSceneId",
  },
  {
    message:
      '"#1 one#" is not a Scene id; expected an identifier: a letter, then letters, digits, _ and -, between #',
    name: "a Scene id that is not an identifier",
    needle: "#1 one#",
    source: change("INT. ONE #one#", "INT. ONE #1 one#"),
    tag: "BadSceneId",
  },
  {
    message:
      'Scene id "one" is already used; expected a different id for each Scene',
    name: "two Scenes with one id",
    needle: "INT. TWO #one#",
    source: change("INT. TWO #two#", "INT. TWO #one#"),
    tag: "DuplicateId",
  },
  {
    message:
      'unknown verb "shw"; expected sound, show or focus; did you mean show?',
    name: "an unknown verb",
    needle: "r1: shw h",
    source: change("r1: show h at", "r1: shw h at"),
    tag: "BadEffect",
  },
  {
    message:
      '"f1 focus a at word("goodbye").start" is not an effect line; expected <id>: <verb> <argument> at <when>',
    name: "an effect line without its colon",
    needle: "f1 focus a",
    source: change("f1: focus a at", "f1 focus a at"),
    tag: "BadEffect",
  },
  {
    message:
      'unknown sound "pops"; expected pop, whoosh or ding; did you mean pop?',
    name: "a sound outside the catalogue",
    needle: "sound pops",
    source: change("sound pop at r1", "sound pops at r1"),
    tag: "UnknownSfx",
  },
  {
    message: `"a.moev.start" names no moment of a declared machine; expected ${anchorFormsText}; did you mean a.move.start?`,
    name: "an unknown Element event",
    needle: "a.moev.start",
    source: change("a.move.start", "a.moev.start"),
    tag: "BadEffect",
  },
  {
    message: `"r1.strat" names no moment of a declared machine; expected ${anchorFormsText}; did you mean r1.start?`,
    name: "an unknown edge",
    needle: "r1.strat",
    source: change("at r1.end +100ms", "at r1.strat +100ms"),
    tag: "BadEffect",
  },
  {
    message:
      'unknown unit "sec" in offset "+100sec"; expected ms, s, f or %; did you mean s?',
    name: "an unknown offset unit",
    needle: "+100sec",
    source: change("+100ms", "+100sec"),
    tag: "BadEffect",
  },
  {
    message:
      'offset "+100" has no unit; expected ms, s, f or %; did you mean s?',
    name: "an offset without a unit",
    needle: "s1: sound pop at r1.end +100",
    source: change("+100ms", "+100"),
    tag: "BadEffect",
  },
  {
    message:
      'effect id "scene" is not usable; expected an identifier that is not beat, scene, state, transition, word, each, first, last, when, within or let',
    name: "an effect id the anchor grammar reserves",
    needle: "scene: focus",
    source: change("f1: focus", "scene: focus"),
    tag: "BadEffect",
  },
  {
    message:
      'effect id "r1" is already used in this Scene; expected a different name for each effect and derived event of a Scene',
    name: "two effects with one id",
    needle: "r1: focus",
    source: change("f1: focus", "r1: focus"),
    tag: "DuplicateId",
  },
  {
    message:
      'Element "hh" is not in Scene one; expected a or h; did you mean h?',
    name: "a show of an unknown Element",
    needle: "show hh",
    source: change("show h at", "show hh at"),
    tag: "UnknownReference",
  },
  {
    message:
      'Element "hh" is not in Scene one; expected a or h; did you mean h?',
    name: "an anchor on an unknown Element",
    needle: "hh.enter.start",
    source: change("at r1.end +100ms", "at hh.enter.start"),
    tag: "UnknownReference",
  },
  {
    message:
      'effect "r9" is not in Scene one; expected r1, f1 or s1; did you mean r1?',
    name: "an anchor on an unknown effect",
    needle: "r9.end",
    source: change("at r1.end +100ms", "at r9.end +100ms"),
    tag: "UnknownReference",
  },
  {
    message:
      'word("helo").end: the narration of Scene one has no "helo"; expected words that the Lines of this Scene say; did you mean word("hello")?',
    name: "a word the narration does not have",
    needle: 'word("helo")',
    source: change('word("hello")', 'word("helo")'),
    tag: "UnknownReference",
  },
  {
    message:
      'word("there goodbye").end: "there goodbye" runs from the end of one Line into the start of the next (a phrase must stay within one Line); expected words that stand next to each other in one Line; did you mean word("there")?',
    name: "a phrase that runs across two Lines states the rule",
    needle: 'word("there goodbye")',
    source: Str.replace(
      "Hello there. Goodbye.",
      "Hello there.\n\nNARRATOR\nGoodbye."
    )(change('word("hello").end', 'word("there goodbye").end')),
    tag: "UnknownReference",
  },
  {
    message:
      'word("hello") occurs 2 times in Scene one; expected the occurrence you mean; did you mean word("hello", 1) to word("hello", 2)?',
    name: "a phrase that occurs twice, with no occurrence number",
    needle: 'r1: show h at word("hello")',
    source: change("Hello there.", "Hello there. Hello again."),
    tag: "AmbiguousWord",
  },
  {
    message:
      'word("hello", 3).end: occurrence 3, but the phrase occurs 1 time; expected an occurrence from 1 to 1',
    name: "an occurrence number past the last",
    needle: 'word("hello", 3)',
    source: change('word("hello")', 'word("hello", 3)'),
    tag: "UnknownReference",
  },
  {
    message:
      'h.enter on Element "h", which is visible=false and has no show effect; expected a show effect for h (hidden Elements have enter, from their show effect, and nothing else)',
    name: "an enter anchor on a hidden Element that no show reveals",
    needle: "h.enter.start",
    source: Str.replace(
      "at r1.end +100ms",
      "at h.enter.start"
    )(change(noReveal, "")),
    tag: "NoSuchEvent",
  },
  {
    message:
      'Element "a" has no move in Scene two; expected a cell that differs from the previous Scene (a has no event in this Scene)',
    name: "a move of an Element that does not change cell",
    needle: "a.move.start",
    source: change("{id=a cell=mc class=box}", "{id=a cell=tl class=box}"),
    tag: "NoSuchEvent",
  },
  {
    message:
      "effects and derived events wait for each other: s1 -> s2 -> s1; expected a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)",
    name: "two effects that wait for each other",
    needle: "s1: sound pop at s2.start",
    source: change(
      "s1: sound pop at r1.end +100ms",
      "s1: sound pop at s2.start\n  s2: sound pop at s1.start"
    ),
    tag: "EffectCycle",
  },
  {
    message:
      "s1.end: a sound has no end (it plays to its own end, which the plan does not know); use s1.start",
    name: "the end of a sound, which has no window",
    needle: "s2: sound ding at s1.end",
    source: change(
      "s1: sound pop at r1.end +100ms",
      "s1: sound pop at r1.end +100ms\n  s2: sound ding at s1.end"
    ),
    tag: "UnsupportedEdge",
  },
  {
    message:
      "effects and derived events wait for each other: r1 -> r1; expected a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)",
    name: "a show that waits for its own Element to enter",
    needle: "r1: show h at h.enter.end",
    source: change(
      'r1: show h at word("hello").end',
      "r1: show h at h.enter.end"
    ),
    tag: "EffectCycle",
  },
  {
    message:
      "percent offset 50% on h.exit.start, which has no window (it is an instant); expected start or end, or a percent of a move, an update, a show, a focus, or the transition of a Scene that is not > CUT",
    name: "a percent offset on an anchor with no window",
    needle: "h.exit.start +50%",
    source: change(
      "m1: sound ding at a.move.start",
      "m1: sound ding at h.exit.start +50%"
    ),
    tag: "BadPercent",
  },
  {
    message:
      "percent point 50% on h.exit.50%, which has no window (it is an instant); expected start or end, or a percent of a move, an update, a show, a focus, or the transition of a Scene that is not > CUT",
    name: "a percent point on an exit",
    needle: "h.exit.50%",
    source: change(
      "m1: sound ding at a.move.start",
      "m1: sound ding at h.exit.50%"
    ),
    tag: "BadPercent",
  },
  {
    message:
      "effects and derived events wait for each other: a -> b -> a; expected a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)",
    name: "two derived events that wait for each other",
    needle: "let a = b",
    source: change(
      "s1: sound pop at r1.end +100ms",
      "let a = b\n  let b = a\n  s1: sound pop at a"
    ),
    tag: "EffectCycle",
  },
  {
    message:
      "effects and derived events wait for each other: f1 -> f1; expected a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)",
    name: "a focus whose until is its own end",
    needle: 'f1: focus a at word("goodbye").start until f1.end',
    source: change(
      'f1: focus a at word("goodbye").start',
      'f1: focus a at word("goodbye").start until f1.end'
    ),
    tag: "EffectCycle",
  },
  {
    message:
      "effects and derived events wait for each other: r1 -> r1; expected a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)",
    name: "a step timed by the Beat it opens",
    needle: "r1: show h at beat(1).start",
    source: change(
      'r1: show h at word("hello").end',
      "r1: show h at beat(1).start"
    ),
    tag: "EffectCycle",
  },
  {
    message:
      "effects and derived events wait for each other: f1 -> f1; expected a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)",
    name: "a step timed by a State it opens",
    needle: "f1: focus a at state(2).enter",
    source: change(
      'f1: focus a at word("goodbye").start',
      "f1: focus a at state(2).enter"
    ),
    tag: "EffectCycle",
  },
  {
    message:
      'r1: each(word("hello").end, word("goodbye").end) can happen 2 times, but a show happens once; expected first(...) or last(...) to pick one moment (only a sound runs once for each occurrence)',
    name: "a show that fires more than once",
    needle: "r1: show h at each",
    source: change(
      'r1: show h at word("hello").end',
      'r1: show h at each(word("hello").end, word("goodbye").end)'
    ),
    tag: "BadEffect",
  },
  {
    message:
      "until on a sound, which plays to its own end; expected until only on focus",
    name: "an until on a sound",
    needle: "s1: sound pop at r1.end +100ms until",
    source: change(
      "s1: sound pop at r1.end +100ms",
      "s1: sound pop at r1.end +100ms until scene.end"
    ),
    tag: "BadEffect",
  },
  {
    message: "until on a show, which stays shown; expected until only on focus",
    name: "an until on a show",
    needle: 'r1: show h at word("hello").end until',
    source: change(
      'r1: show h at word("hello").end',
      'r1: show h at word("hello").end until scene.end'
    ),
    tag: "BadEffect",
  },
  {
    message:
      "state(9) in Scene one, which has at most 3 (one State, and one more State and one Beat for each show or focus); expected a number from 1 to 3",
    name: "a State the Scene cannot have",
    needle: "within(",
    source: change(
      "s1: sound pop at r1.end +100ms",
      "s1: sound pop at within(r1.end, state(9))"
    ),
    tag: "UnknownReference",
  },
  {
    message:
      'Element "a" is never entering in Scene two; expected a state a reaches: its events are move',
    name: "a state an Element never reaches",
    needle: "m1: sound ding at a.entering.leave",
    source: change(
      "m1: sound ding at a.move.start",
      "m1: sound ding at a.entering.leave"
    ),
    tag: "NoSuchEvent",
  },
  {
    message:
      'show of Element "a", which is visible; expected an Element with visible=false (line 7), or a focus effect',
    name: "a show of a visible Element",
    needle: "show a at",
    source: change("show h at", "show a at"),
    tag: "BadShow",
  },
  {
    message:
      'Element "h" is shown twice (effects r1 and r2); expected one show effect for each visible=false Element',
    name: "two shows of one Element",
    needle: "r2: show h",
    source: change(
      "s1: sound",
      'r2: show h at word("goodbye").end\n  s1: sound'
    ),
    tag: "BadShow",
  },
  {
    message:
      'Element "h" is visible=false and no effect shows it; expected a line of the [[effects]] block: r1: show h at word("<phrase>").end',
    name: "a visible=false Element that no effect shows",
    needle: "Later {id=h",
    source: Str.replace(
      "at r1.end +100ms",
      'at word("goodbye").end'
    )(change(noReveal, "")),
    tag: "HiddenNeverRevealed",
  },
  {
    message:
      'absolute time "12.5s" has no reason; expected at 12.5s because "<why this moment is fixed>"',
    name: "an absolute time without a reason (F5)",
    needle: "at 12.5s",
    source: change("at r1.end +100ms", "at 12.5s"),
    tag: "AbsoluteNeedsReason",
  },
  {
    message:
      'absolute time "12.5s because """ has no reason; expected at 12.5s because "<why this moment is fixed>"',
    name: "an absolute time with an empty reason (F5)",
    needle: "at 12.5s",
    source: change("at r1.end +100ms", 'at 12.5s because ""'),
    tag: "AbsoluteNeedsReason",
  },
  {
    above: 1,
    message:
      "a second [[effects]] block in this Scene (the first is on line 10); expected one [[effects]] block per Scene",
    name: "a second effects block in one Scene",
    needle: "q1: sound",
    source: change(
      "NARRATOR\nHello",
      "[[effects\n  q1: sound pop at scene.start\n]]\n\nNARRATOR\nHello"
    ),
    tag: "BadEffectsBlock",
  },
  {
    above: 1,
    message:
      'an [[effects]] block that never closes with ]] on a line of its own; expected no blank line inside the block, and "]]" alone on its last line',
    name: "a blank line inside an effects block",
    needle: "r1: show h",
    source: change(
      "  s1: sound pop at r1.end +100ms\n]]",
      "  s1: sound pop at r1.end +100ms\n\n  q1: sound pop at scene.start\n]]"
    ),
    tag: "BadEffectsBlock",
  },
  {
    above: 1,
    message:
      "an [[effects]] block after the first dialogue; expected the block before the first NARRATOR line of its Scene",
    name: "an effects block after the dialogue",
    needle: "q1: sound",
    source: pipe(
      base,
      Str.replace(/\[\[effects\n {2}r1[\s\S]*?\n\]\]\n\n/u, ""),
      Str.replace(
        "Hello there. Goodbye.\n",
        "Hello there. Goodbye.\n\n[[effects\n  q1: sound pop at scene.start\n]]\n"
      )
    ),
    tag: "BadEffectsBlock",
  },
];

/** The release-1 forms (F4): each is an error whose message gives the replacement. */
const oldForms: readonly Case[] = [
  {
    message:
      'release-1 cue [[next]] in dialogue; expected no note in dialogue; write r2: show h at word("there").end in the [[effects]] block of the Scene',
    name: "[[next]] in dialogue names the hidden Element and takes a free id",
    needle: "[[next]]",
    source: change("Hello there.", "Hello there. [[next]]"),
    tag: "ReleaseOneForm",
  },
  {
    message:
      'release-1 cue [[focus: a]] in dialogue; expected no note in dialogue; write f2: focus a at word("Hello").end in the [[effects]] block of the Scene',
    name: "[[focus: id]] in dialogue",
    needle: "[[focus: a]]",
    source: change("Hello there.", "Hello [[focus: a]] there."),
    tag: "ReleaseOneForm",
  },
  {
    message:
      "release-1 cue [[sfx: whoosh]] in dialogue; expected no note in dialogue; write s2: sound whoosh at transition.start in the [[effects]] block of the Scene",
    name: "[[sfx: name]] before the first word",
    needle: "[[sfx: whoosh]]",
    source: change("Hello there.", "[[sfx: whoosh]] Hello there."),
    tag: "ReleaseOneForm",
  },
  {
    message:
      'release-1 cue [[focus: a]] in dialogue; expected no note in dialogue; write f2: focus a at word("there").end in the [[effects]] block of the Scene',
    name: "a cue that opens a Line is timed against the last word of the Line before",
    needle: "[[focus: a]] Goodbye",
    source: change(
      "Hello there. Goodbye.",
      "Hello there.\n\nNARRATOR\n[[focus: a]] Goodbye."
    ),
    tag: "ReleaseOneForm",
  },
  {
    message:
      'release-1 cue [[sfx: pop]] in dialogue; expected no note in dialogue; write s2: sound pop at word("there", 2).end in the [[effects]] block of the Scene',
    name: "a cue after a phrase that repeats in the Scene writes the occurrence",
    needle: "[[sfx: pop]]",
    source: change(
      "Hello there. Goodbye.",
      "Hello there. Goodbye there. [[sfx: pop]]"
    ),
    tag: "ReleaseOneForm",
  },
  {
    message:
      'release-1 cue [[focus: a]] in dialogue; expected no note in dialogue; write f2: focus a at word("Hello").start in the [[effects]] block of the Scene',
    name: "a focus before the first word of the Scene is timed against that word",
    needle: "[[focus: a]]",
    source: change("Hello there.", "[[focus: a]] Hello there."),
    tag: "ReleaseOneForm",
  },
  {
    message:
      "release-1 cue [[todo]] in dialogue; expected no note in dialogue; remove it: effects live in the [[effects]] block of the Scene",
    name: "any other note in dialogue",
    needle: "[[todo]]",
    source: change("Hello there.", "Hello there. [[todo]]"),
    tag: "ReleaseOneForm",
  },
  {
    message:
      "release-1 Element form {#a @tl .box hidden}; expected key=value properties: Box {id=a cell=tl class=box visible=false}",
    name: "{#id @cell .class hidden}",
    needle: "{#a @tl .box hidden}",
    source: change("{id=a cell=tl class=box}", "{#a @tl .box hidden}"),
    tag: "ReleaseOneForm",
  },
  {
    message:
      "a [[note]] outside an [[effects]] block is not supported: write the block as [[effects NEWLINE <lines> NEWLINE ]]",
    name: "a note outside dialogue and outside an effects block",
    needle: "[[a note]]",
    source: change(
      "INT. ONE #one#\n\nBox",
      "INT. ONE #one#\n\n[[a note]]\n\nBox"
    ),
    tag: "UnsupportedElement",
  },
];

/** Every error of `source` with this tag. */
const withTag = (source: string, tag: PlanError["_tag"]) =>
  Arr.filter(collectErrors(source), (found) => found._tag === tag);

describe("every error class of the effects syntax, with its message", () => {
  for (const mutation of [...cases, ...oldForms]) {
    it.effect(mutation.name, () =>
      Effect.gen(function* raised() {
        const [found, ...others] = withTag(mutation.source, mutation.tag);

        assert.isDefined(found, `${mutation.tag} is raised`);
        assert.strictEqual(others.length, 0, "exactly once");
        assert.strictEqual(
          found?.line,
          lineOf(mutation.source, mutation.needle) - (mutation.above ?? 0)
        );
        assert.strictEqual(found?.message, mutation.message);

        // buildPlan fails with the first error in document order, which is the first of collectErrors.
        const first = yield* firstError(mutation.source);

        assert.strictEqual(first._tag, collectErrors(mutation.source)[0]?._tag);
        assert.strictEqual(
          first.message,
          collectErrors(mutation.source)[0]?.message
        );
      })
    );
  }
});

describe("what is valid stays valid", () => {
  it("the base story has no error", () => {
    assert.deepStrictEqual(collectErrors(base), []);
  });

  it("an occurrence number makes a repeated phrase unambiguous", () => {
    const source = Str.replace(
      'word("hello")',
      'word("hello", 2)'
    )(change("Hello there.", "Hello there. Hello again."));

    assert.deepStrictEqual(collectErrors(source), []);
  });

  it("an absolute time with its reason is valid", () => {
    const source = change(
      "at r1.end +100ms",
      'at 0.5s because "the music has a beat here"'
    );

    assert.deepStrictEqual(collectErrors(source), []);
  });

  it("the end of a focus is an event, and a focus may end by its own until", () => {
    const source = change(
      "s1: sound pop at r1.end +100ms",
      'f2: focus a at word("hello").end until word("goodbye").start\n  s1: sound pop at f2.end'
    );

    assert.deepStrictEqual(collectErrors(source), []);
  });

  it("a sound may be timed by a Beat or a State that a step opens, and by a derived event, once for each occurrence", () => {
    const source = change(
      "s1: sound pop at r1.end +100ms",
      'let both = last(r1.end, word("goodbye").end)\n  s1: sound pop at beat(1).end\n  s2: sound ding at state(2).enter\n  s3: sound pop at each(both, scene.end)'
    );

    assert.deepStrictEqual(collectErrors(source), []);
  });

  it("the effects block may follow the Elements with no blank line", () => {
    const source = change(
      "Later {id=h cell=mc class=label visible=false}\n\n[[effects",
      "Later {id=h cell=mc class=label visible=false}\n[[effects"
    );

    assert.deepStrictEqual(collectErrors(source), []);
  });
});

describe("the other errors of the Plan stage", () => {
  it("lists several errors of one source in document order", () => {
    const source = Str.replace(
      "sound pop",
      "sound pops"
    )(change("cell=tl", "cell=zz"));

    const tags = Arr.map(collectErrors(source), (found) => [
      found._tag,
      found.line,
    ]);

    assert.deepStrictEqual(tags, [
      ["BadProperty", 7],
      ["UnknownSfx", 13],
    ]);
  });

  it("a Scene with an error on one of its lines is not cross-checked, so no reference error echoes it", () => {
    const source = change("cell=tl", "cell=zz");

    assert.deepStrictEqual(
      Arr.map(collectErrors(source), (found) => found._tag),
      ["BadProperty"]
    );
  });
});

const sceneBase = asText([
  "# Section",
  "",
  "INT. ONE #one#",
  "",
  "NARRATOR",
  "Hello.",
  "",
]);

describe("the structure of the story", () => {
  it("a source with no Scene is EmptyStory at line 1", () => {
    assert.deepStrictEqual(
      Arr.map(collectErrors("Title: T\n"), (found) => [found._tag, found.line]),
      [["EmptyStory", 1]]
    );
  });

  it("a Scene before any Section is SceneBeforeSection", () => {
    assert.deepStrictEqual(
      Arr.map(
        collectErrors("INT. ONE #one#\n\nNARRATOR\nHello.\n"),
        (found) => found._tag
      ),
      ["SceneBeforeSection"]
    );
  });

  it("a Scene with no dialogue is an UnsupportedElement", () => {
    assert.deepStrictEqual(
      Arr.map(
        collectErrors("# Section\n\nINT. ONE #one#\n"),
        (found) => found._tag
      ),
      ["UnsupportedElement"]
    );
  });

  it("a valid minimal story has no error", () => {
    assert.deepStrictEqual(collectErrors(sceneBase), []);
  });
});
