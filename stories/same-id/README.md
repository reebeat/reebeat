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
| `sc3` | `s1: sound pop at each(scene.start +0.1s, scene.start +0.2s, scene.start +0.7s, throttle=0.3s)` | `each`: a begin-value list of three times in the silent lead; `throttle=0.3s` drops the middle one (0.1 s after the first kept), so two pops sound |
| `sc4` | `let settled = all(one.move.end, tag.update.end)` | a derived event (`let`, evaluated once): the later of two edges of two Elements, `all` = SMIL `endsync` |
| `sc4` | `s1: sound whoosh at transition.start` | the whoosh sounds with the slide change, not at the first word of the Line (the narration starts 1 s later) |
| `sc4` | `s2: sound ding at when(one.move.progress >= 50%)` | the ding sounds when box `one` is half way across: the threshold event of the move's progress behaviour (position by the renderer's easing, not time: 8 frames in, where time is half way at 13). `one.move.50%` is the sugar for the same event |
| `sc4` | `f2: focus tag at settled` | the ring goes on `tag` when both have settled |
| `sc4` | `r1: show note at word("matches").end +0.1s` | a hidden Element appears 0.1 s after "matches" |
| `sc4` | `f1: focus hint at word("slides").start -0.2s until first(word("there").end, scene.end)` | the ring goes on `hint` 0.2 s before "slides" and comes off when "there" ends (`first` = race; `until` = the SMIL end value): the Deck has an END step and the Video a command at the end of the ring |
| `sc5` | `let landed = all(one.moving.leave, three.entering.leave)` | the same idea over STATE events of the Elements' machines (`moving` is left when the move ends, `entering` when the enter ends) |
| `sc5` | `s1: sound ding at transition.start` | the ding sounds as the new box starts to appear |
| `sc6` | `s1: sound pop at each(scene.start +0.1s, scene.start +0.15s, stagger=0.4s)` | `stagger=0.4s` pushes the second pop to 0.4 s after the first |
| `sc6` | `s2: sound pop at beat(2).end +0.1s` | a sound on the generated Beat between State 2 and State 3 (the Beat of `r2`) |
| `sc6` | `s3: sound pop at state(3).leave -1f` | a sound on the last State: left at the Scene's last frame, the slide change leaves every state |
| `sc7` | `p1: sound pop at 0.5s because "..."` | an absolute time, which needs its reason and which `reebeat lint` lists |
| `sc7` | `p2: sound pop at first(scene.start +1s, scene.start +0.8s)` | `first`: the earlier of the two |
| `sc7` | `p3: sound pop at all(scene.start +0.1s, scene.start +0.2s)` | `all`: the later of the two |

`reebeat plan --timing` prints each effect with its intent and its resolved frame; `reebeat check` prints, for each one, the frame it resolves to, the frame its anchor is **observed** at in the video, and where the sound is **heard** in the audio (`sc4.s2 ... resolved 706; anchor observed 706.04, so 706.04 (+0.04); sound onset 705.99 (-0.01)`). Effect ids are per Scene (`s1` is the whoosh in `sc4` and the ding in `sc5`).

Sounds ride along in the Deck: the whoosh and the ding of `sc4` are `data-sounds` of the slide and play when it is shown, a sound anchored after a step plays with that step; nothing in the Deck is a step that only plays a sound. The effects are not in the speaker notes, which are the narration.

The `(speed 1.05)` before the Line "Box two has no match, so it leaves." is still the release-1 workaround for whisper.cpp hearing "has" as "is" at the story rate, kept as it was.
