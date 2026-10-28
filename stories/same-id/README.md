# same-id

The release-1 story of reebeat: why a box that keeps its name between two screens can be animated into place, told in seven Scenes and about 45 seconds of narration.

- **Source:** [`story.fountain`](story.fountain), one Fountain screenplay in the vocabulary of [spec 0001](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md).
- **Text:** original, written for this repository, and public. It uses no course material.
- **Narration:** a synthetic voice (Kokoro, voice `af_heart`), not a human recording. The speech cache committed in `speech-cache/` holds 12 Lines of FLAC, word times and provenance, about 1.2 MB; refill it with `reebeat build ... --refresh-speech` after removing the old assets (see [`packages/pipeline`](../../packages/pipeline/README.md)). Without any model, `--speech silent --aligner even --cache-dir <tmp>` builds the same story with a silent stand-in narrator.

## Build

From the repository root, inside devenv (needs the CLI of spec 0001):

```sh
bun run reebeat build stories/same-id/story.fountain --out build/same-id
```

This writes `deck.html`, `same-id.mp4` and `same-id.vtt` to `build/same-id`. Open the deck with `open build/same-id/deck.html`; press `s` for the speaker notes.

Change the story only in `story.fountain`: the deck, the notes, the subtitles and the video all come from that one file.
