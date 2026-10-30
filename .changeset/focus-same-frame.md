---
"@tsukuri/core": patch
---

Two `focus` effects of a Scene that fire on the same frame are rejected when the Plan is scheduled (`SimultaneousFocus`, naming both effects and the frame) instead of leaving a ring that `check` F1 cannot observe (spec 0018). Before, the earlier-declared effect got a ring of zero frames.
