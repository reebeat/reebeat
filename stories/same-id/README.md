# same-id

The release-1 story of reebeat: why a box that keeps its name between two screens can be animated into place, told in seven Scenes and about 45 seconds of narration.

- **Source:** [`story.fountain`](story.fountain), one Fountain screenplay in the vocabulary of [spec 0001](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md) and the syntax of [spec 0002](../../docs/specs/0002-explicit-anchors-and-syntax.md) (grammar: [`docs/grammar/effects.md`](../../docs/grammar/effects.md)): explicit scene ids (`#sc4#`), Elements as `{id=one cell=mc class=box}`, and one `[[effects]]` block per Scene.
- **Text:** original, written for this repository, and public. It uses no course material.
- **Narration:** a synthetic voice (Kokoro, voice `af_heart`), not a human recording, read at the speed the title page sets (`Speed: 1.1`; without the key the default is also 1.1; `(speed N)`, `(slowly)` and `(quickly)` change one Line). The speech cache committed in `speech-cache/` holds 12 Lines of FLAC, word times and provenance, about 1.2 MB; refill it with `reebeat build ... --refresh-speech` after removing the old assets (see [`packages/pipeline`](../../packages/pipeline/README.md)). Without any model, `--speech silent --aligner even --cache-dir <tmp>` builds the same story with a silent stand-in narrator.

## Build

From the repository root, inside devenv (needs the CLI of spec 0001):

```sh
bun run reebeat build stories/same-id/story.fountain --out build/same-id
```

This writes `deck.html`, `same-id.mp4` and `same-id.vtt` to `build/same-id`. Open the deck with `open build/same-id/deck.html`; press `s` for the speaker notes.

Change the story only in `story.fountain`: the deck, the notes, the subtitles and the video all come from that one file.

## Effects

Dialogue is plain prose: the narration, the subtitles and the notes are its text byte for byte, so the speech cache of release 1 still hits (the key is unchanged for all 12 Lines). Everything that happens besides speaking is a line of the Scene's `[[effects]]` block, `<id>: <verb> <target> at <anchor> [<offset>]`:

| Scene | Effect | Says |
| --- | --- | --- |
| `sc2` | `f1: focus box at word("screen", 1).end` | the ring goes on the box when "screen" ends (the first "screen": it also occurs in the next Line) |
| `sc2` | `r1: show twin at word("too").end` | the hidden box is revealed when "too" ends |
| `sc4` | `s1: sound whoosh at transition.start` | the whoosh sounds with the slide change, not at the first word of the Line (the narration starts 1 s later) |
| `sc4` | `s2: sound ding at one.move.50%` | the ding sounds when box `one` is half way across (position, not time: 8 frames in, where time is half way at 13) |
| `sc4` | `r1: show note at word("matches").end +100ms` | a hidden Element appears 0.1 s after "matches" |
| `sc4` | `f1: focus hint at word("slides").start -200ms` | the ring goes on `hint` 0.2 s before "slides"; it is written first and resolves **after** `r1`, so the Deck has the steps in the order `r1`, `f1` |
| `sc5` | `s1: sound ding at transition.start` | the ding sounds as the new box starts to appear |
| `sc7` | `p1: sound pop at 0.5s because "..."` | an absolute time, which needs its reason and which `reebeat lint` lists |

`reebeat plan --timing` prints each effect with its intent and its resolved frame; `reebeat check` prints, for each one, the frame it resolves to, the frame its anchor is **observed** at in the video, and where the sound is **heard** in the audio (`sc4.s2 ... resolved 706; anchor observed 706.04, so 706.04 (+0.04); sound onset 705.99 (-0.01)`). Effect ids are per Scene (`s1` is the whoosh in `sc4` and the ding in `sc5`).

Sounds ride along in the Deck: the whoosh and the ding of `sc4` are `data-sounds` of the slide and play when it is shown, a sound anchored after a step plays with that step; nothing in the Deck is a step that only plays a sound. The effects are not in the speaker notes, which are the narration.

The `(speed 1.05)` before the Line "Box two has no match, so it leaves." is still the release-1 workaround for whisper.cpp hearing "has" as "is" at the story rate, kept as it was.
