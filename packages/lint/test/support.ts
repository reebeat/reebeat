// A small Plan built by the real core: three Scenes, a `show`, a `focus`, three sounds and one absolute time.
import { buildPlan } from "@tsukuri/core";
import { Array as Arr, String as Str } from "effect";

const source = Arr.join(
  [
    "Title: Lint",
    "",
    "# Part",
    "",
    "INT. ONE #one#",
    "",
    "Box {id=a cell=tl class=box}",
    "Later {id=b cell=br class=label visible=false}",
    "",
    "[[effects",
    '  r1: show b at word("three").end',
    "]]",
    "",
    "NARRATOR",
    "One two three. Four five.",
    "",
    "INT. TWO #two#",
    "",
    "Box {id=a cell=br class=box}",
    "",
    "[[effects",
    '  f1: focus a at word("six").end',
    '  s1: sound pop at word("seven").end',
    "]]",
    "",
    "NARRATOR",
    "Six. Seven. Eight.",
    "",
    "INT. THREE #three#",
    "",
    "Done {id=c cell=mc class=title}",
    "",
    "[[effects",
    '  s1: sound ding at word("nine").end',
    '  a1: sound pop at 1s because "the beat of the music"',
    "]]",
    "",
    "NARRATOR",
    "Nine. Ten.",
    "",
  ],
  "\n"
);

/** The Plan of the source above, with a fixed hash. */
export const plan = buildPlan(source, Str.repeat(32)("5a"));
