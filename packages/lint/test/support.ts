// A small Plan built by the real core: three Scenes, four Cues (a `next`, a `focus` and two `sfx`).
import { buildPlan } from "@reebeat/core";
import { Array as Arr, String as Str } from "effect";

const source = Arr.join(
  [
    "Title: Lint",
    "",
    "# Part",
    "",
    "INT. ONE",
    "",
    "Box {#a @tl .box}",
    "Later {#b @br .label hidden}",
    "",
    "NARRATOR",
    "One two three. [[next]] Four five.",
    "",
    "INT. TWO",
    "",
    "Box {#a @br .box}",
    "",
    "NARRATOR",
    "Six. [[focus: a]] Seven. [[sfx: pop]] Eight.",
    "",
    "INT. THREE",
    "",
    "Done {#c @mc .title}",
    "",
    "NARRATOR",
    "Nine. [[sfx: ding]] Ten.",
    "",
  ],
  "\n"
);

/** The Plan of the source above, with a fixed hash. */
export const plan = buildPlan(source, Str.repeat(32)("5a"));
