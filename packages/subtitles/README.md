# @reebeat/subtitles

A library (design R3): the narration of a scheduled Plan as subtitles, and WebVTT back to cues. Pure functions; it
depends on `@reebeat/core` and `effect` only.

| Export | What it is |
| --- | --- |
| `vtt(plan)` | WebVTT: `WEBVTT`, a `NOTE source-sha256 <hash>`, then one cue per Line, identified by the Line id. Cue text is the narration text with `&`, `<` and `>` written as `&amp;`, `&lt;` and `&gt;` |
| `srt(plan)` | SubRip: cues numbered from 1, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, the narration text, a blank line after each. SubRip has no escapes, so `<`, `>` and `&` pass through unchanged |
| `parseVtt(text)` | The cues of a WebVTT text (`startMs`, `endMs`, `text` with the entities undone); reads what ffmpeg writes for a `mov_text` stream too |
| `vttSourceHash(text)` | The hash of the `NOTE source-sha256` row, or undefined |
| `vttTimestamp(ms)`, `srtTimestamp(ms)` | `HH:MM:SS.mmm` and `HH:MM:SS,mmm` |

Both writers read one list of cues (`subtitleCues`), so they cannot disagree about timing or text. `test/subtitles.test.ts`
works the expected timestamps out by hand, round-trips `parseVtt(vtt(plan))` to the Lines, and shows that the SubRip
text equals the narration where the WebVTT text needs its entities undone.
