# tsukuri: keyframe engine for the 4EM explainer pipeline (design)

Status: design, approved for build planning. No code in the repo was changed for this document.
Date of research: 2026-10-28. Repo state read: working tree of `work/explainers` on that day.
`src/components/Diagram.tsx` is being edited by the contrast work, so function names are
authoritative and line numbers are approximate.

> **Provenance.** Moved into this repository on 2026-10-28 as its single source. It was written in a private
> study repository (not published) at `work/explainers/docs/keyframe-engine.md`, last changed by commit
> `bf7c2e107ee29c1a9f32cddf6525afb1e2325af4` (repository head when moved: `6c1fec44fdeb4d4d534ed93514e0d792427a7b66`).
> Course-specific mentions were removed on the move (three phrases: a course-repo reference in section 9, and two
> in `GLOSSARY.md`); the technical content is unchanged. File and line references such as `src/core/types.ts:57`
> point into the legacy pipeline of that private repository at the commit above, not into this repository. Edit this
> copy, never the original. Dated revisions to this design are listed in the section "Revisions" at the end.
>
> **Revision R1 (2026-10-28) supersedes every statement below that the core is "plain TypeScript" or "plain-TS".**
> The core may use Effect v4 for services, errors, resources and the render pipeline; frame math stays plain functions.
> The core still imports no `react`, `remotion`, `@remotion/*`, DOM global or Node built-in (P10 holds). See "Revisions".

**tsukuri** (formerly the working name `reebeat`) is the tool this document designs. A **Story**, declared as Beats of Keyframes, goes in. A compiler turns it into a **Plan** (what enters, exits, updates or is replaced, per Beat) and then a **Timeline**, and a pure `frameState(story, frame)` plus thin adapters produce **Renderings**: a Video now, a Deck later. The core is plain TypeScript; renderers are adapters (section 3.0).

Vocabulary follows [`GLOSSARY.md`](../GLOSSARY.md):

| Term | Meaning here | Today's code (until step f of section 8) |
|---|---|---|
| Story | The whole source: Scenes with their Beats. Renderings derive from it. | `storyboard.ts` |
| Scene | One visual context and the boundary of identity: Beats inside it are identity-diffed; between Scenes there is a cut or crossfade and nothing is matched. | `Scene` (`types.ts:138`) |
| Beat | One change the viewer should notice: a Keyframe, a Line, Cues, Hints. | A `beat` in `types.ts` is a spoken paragraph with actions; it becomes the Line of one or more Beats. |
| Keyframe | The visual state a Beat ends in: every visible Element with its properties. | The result of replaying actions (the `state` memo in `Diagram.tsx`). |
| Line | The narration that carries a Beat, aligned to words. | `Beat.text`, `on:` phrases, `prepare.ts:34-44`. |
| Cue | A sound or timing anchor in a Beat. Reserved; no renderer reads it yet. | none |
| Hint | Optional instruction for the transition into a Beat: order, delay, path, emphasis. | `how` and `delay` on actions |
| Behaviour | Continuous motion between Keyframes. Reserved. | `ripple` |
| Element | A visible thing with a stable id within a Scene: shape, link, label or icon. | `El`, `Link` |
| Identity diff | Comparing two consecutive Keyframes by Element id: only in the second enters, only in the first exits, in both updates. Its output is the **Plan** (4.0). | none |
| Rendering, Video, Deck | Outputs derived from a Story and never edited by hand. | MP4; `*.storyboard.md` and `*.srt` are Renderings too |

This document avoids "slide", "step", "tween" and "snapshot" for these concepts, and "node" and "edge" outside ELK and graph terms. Older passages that say lowercase `keyframe`, `scene` or `beat` in the generic sense mean the same things.

Labels used below:
- **[verified]** I read the primary source or ran the code in a scratch install under `/tmp` (outside the repo).
- **[INFERENCE]** I did not verify it. Treat it as a hypothesis.

## 0. Decision in one page

| Question | Decision |
|---|---|
| What is it? | **tsukuri** (formerly the working name `reebeat`). Our own engine: a plain TypeScript core and thin renderer adapters. |
| Adopt an existing tool? | No. **BUILD-THIN.** A survey of about 50 candidates (section 2.6) found none that gives declared Keyframes, Identity diff and frame-deterministic output together, and none with layout across Beats. What is reused, adopted and inspired is in section 11. |
| Build on Remotion or adopt Reframe? | Build on Remotion as the first Video adapter. Borrow ideas from Reframe, do not depend on it (section 2.3). |
| Use reveal.js Auto-Animate itself? | **Decided: no spike.** Own engine with reveal.js matching semantics as the spec (`data-id`, unmatched fade, restart groups, per-element overrides): R0+R3 (section 2.5, section 10 item 2). |
| Which Renderings? | Video first. A reveal.js Deck later; the Story format is designed so it stays possible (section 3.4). Nothing deck-specific is built now. |
| Where is the core? | Plain TypeScript: Identity diff, Plan, `frameState`, layout bake, contrast check. No React, Remotion or DOM imports, enforced by test P10. Renderers are adapters: Remotion now, HyperFrames as the verified exit, Deck later (section 3.0). |
| Compiler stages | Story, resolve, identity join, **Plan**, schedule against Lines, **Timeline**, `frameState`, adapters. `tsukuri plan <story>` prints the Plan for review, modelled on `terraform plan` (section 4.0). |
| What is the unit of authoring? | Beats: each Beat ends in a full Keyframe with stable Element ids. Today's `reveal/hide/morph/focus` become sugar that compiles to Beats. |
| Who decides enter, exit, update, replace? | A pure Identity diff of two consecutive Keyframes in one Scene (section 4). Presence decides enter and exit; a kind change is a replace. Hints decide the look. |
| How is it frame-deterministic? | The schedule stage bakes all segments (integer frames, `from`, `to`, easing) into `timeline.json`. Render calls `frameState(story, frame)`, which returns plain data. No timers, no CSS animation, no wall clock. |
| Colour | Interpolate in OKLCH with culori, gamut-map, quantise to 8-bit hex. |
| Paths and easing | Core: `d3-interpolate-path` for path morph, flubber only for explicit `morphFrom` where it looks bad, and the core's own easing and spring. `@remotion/paths` imports `remotion/no-react`, so it stays out of the core (sections 2.2 note and 7). |
| Layout | ELK (`elkjs`, `layered`) at prepare time only. Results baked into `timeline.json`. Dagre is the fallback. |
| Accessibility | Contrast gate runs on every integer frame of every transition, not only on Keyframes. Text colour is derived (`inkFor`). |
| Licence flags | Remotion: custom licence with eligibility limits. `@remotion/transitions`: npm says `UNLICENSED`. elkjs: `EPL-2.0 OR GPL-3.0-or-later`. (Section 7.) |

Measured facts from a scratch install (culori 4.0.2, elkjs 0.12.0, @remotion/paths 4.0.539, Node 24.21, Bun 1.3.13) [verified]:
- ELK geometry is identical across runs once the internal `$H` field is stripped. Raw JSON differs because of `$H`.
- Removing one node from an ELK layout moved other nodes (goal x 242 to 122). With `elk.interactive` plus positions from the first layout, the others stayed.
- Two text and fill colours that pass at both ends of a 30-step OKLCH tween can drop to 1.04:1 in the middle (section 6.3).
- With the 4EM ink tokens, no mid-grey fill reaches 4.5:1 (best of two inks is 4.00:1 at grey 119).

---

## 1. Problem and what exists today

### 1.1 How scenes are animated now

A scene declares `elements` and `links` (`src/core/types.ts:57` `El`, `:83` `Link`, `:138` `Scene`).
Each beat lists actions (`types.ts:106-118` `Action`; builders in `src/core/dsl.ts:16-22`).
`scripts/prepare.ts:52-54` turns each action into one number: `startFrame = round((beat.start + word.start + delay) * fps)`.
An action has no duration and no end state. `Diagram.tsx` decides how it looks.

| Action | Declared in | What `Diagram.tsx` does | Gap |
|---|---|---|---|
| `reveal` | `types.ts:107`, `dsl.ts:16` | `state` memo adds id to `visible`, stores `{frame, how}` (`Diagram.tsx:126`). `how` is read in `Shape`: `pop` scale 0.84 to 1 in 12 frames, `Easing.out(cubic)` (`:86`); `fade` opacity 0 to 1 in 12 frames (`:87`); `slide` x -40 to 0 in 14 frames (`:88`); `type` one character per 1.5 frames (`:74`). Links: `draw` dash offset 1 to 0 in 15 frames (`LinkShape`, `:106`). | `draw` on an element does nothing: `s14-recap.ts:25` `reveal("scope", {how:"draw"})` makes the boundary appear in one frame. Durations and easings are constants in the component, not data. `style.ts:76` says "0.35 s spring" but code uses 12 frames (0.4 s) cubic. |
| `hide` | `types.ts:112`, `dsl.ts:20` | `visible.delete` (`Diagram.tsx:127`). | The element disappears in one frame. No exit. `s14.7` removes six boxes, six links and then pops the title with no overlap rule. |
| `morph` | `types.ts:114` | Shallow merge into the element from the action frame (`:128`, merge at `:138`). | Position, size, label, kind, fill change in one frame. `s06.8` turns an Opportunity into a Goal (fill, kind, text colour) in one frame. |
| `focus` / `unfocus` | `types.ts:109,111` | Sets focused ids and rings the listed ids; nonfocused shape bodies and arrows use contrast-safe opacity, while labels remain full opacity. | State changes instantly; labels do not dim together with shape bodies. |
| `camera` | `types.ts:116` | `camera = action.to` (`:131`). | Snap, no move. |
| `ripple` | `types.ts:118` | One link per 12 frames (`:132`, rippleIndex). | Effect, not state. |
| Links | `types.ts:83`, `framework.ts:18-28` | Route = `via` waypoints you type by hand, plus `pointOnBorder` (`geometry.ts:54`) at render time. Label at path midpoint. | Routes do not adapt when boxes move. `via` numbers are hand-tuned (`framework.ts:21-27`). |

### 1.2 What is already good (keep it)

- The component already is a pure function of the frame. `Diagram` replays all events up to `globalFrame` every render (`:118-135`). It reads `useCurrentFrame()` plus `absoluteStart` (`Root.tsx:25`). This matches Remotion's rule that a component is a function from frame to image ([Remotion: Flickering](https://www.remotion.dev/docs/flickering), [Don't use CSS animations](https://www.remotion.dev/docs/troubleshooting/css-animations)). [verified]
- Narration alignment: `prepare.ts:34-44` resolves `on:` phrases to word times from Whisper alignment. Keep this as the only time source.
- Scene-to-scene crossfade is `TransitionSeries` with `fade()` (`Root.tsx:21-32`, 0.5 s from `style.ts` `pacing.crossfade`). Keep it. The engine works inside one scene.
- Canvas 1920x1080, 30 fps, safe box `[120,130,1800,870]`, caption box `[160,900,1760,1030]` (`style.ts:6`).

### 1.3 Pain points the engine must remove

1. Motion is hard-coded per action in the component; authors cannot say "move this box, recolour it, change its label" as one move.
2. No exit animation; no ordering rule between exits and enters (needed for the s12 label rule, section 8.4).
3. `morph` is a snap. Shape change, colour change and move cannot be tweened.
4. Dimming and fades are not checked for contrast between keyframes.
5. Links and labels are hand-placed; they cannot follow moved nodes.
6. `scripts/emit.ts:64-112` validates and describes actions for `*.storyboard.md`; this also must move to keyframes.

---

## 2. Prior art

Versions and dates were read from the npm registry and GitHub API on 2026-10-28 [verified].
"Runtime" = animation advances by wall clock or by layout measurement in a browser. "Deterministic" = output is a pure function of frame or time.

### 2.1 Identity and diff models (what to borrow conceptually)

| Tool | What it does | Borrow | Reject | Licence | Maintenance | Runtime or deterministic |
|---|---|---|---|---|---|---|
| [React reconciliation](https://legacy.reactjs.org/docs/reconciliation.html), [state and keys](https://react.dev/learn/preserving-and-resetting-state) | Heuristic O(n) tree diff. A `key` is the developer's hint that an element is the same across renders. Same type at same position keeps state. | `key` = our stable `ElementId`. Same id and same kind = update. New key = mount (enter). Missing key = unmount (exit). Changing the key or type = remount. | The diff produces minimal DOM operations, not motion. | MIT (React) | Active [INFERENCE: not re-checked] | Deterministic diff |
| [FLIP](https://aerotwist.com/blog/flip-your-animations/) (First, Last, Invert, Play) | Record first and last state, invert the difference with transforms, play to zero. | The idea "state A and state B are enough; derive the motion". Our keyframes are First and Last, known at build time. | Browser measurement (`getBoundingClientRect`) at runtime. | Technique, no licence | n/a | Runtime (in browsers) |
| [Motion](https://motion.dev/docs/react-layout-animations) `layoutId`, [LayoutGroup](https://motion.dev/docs/react-layout-group), [AnimatePresence](https://motion.dev/docs/react-animate-presence) | `layoutId` connects two different elements as one shared element. `AnimatePresence` keeps removed children mounted to run `exit`. Modes `sync`, `wait` (enter waits for exit), `popLayout`. `exit` can be a variant label. | Shared identity across states. Presence (the diff sees both sets). Exit-before-enter = `wait` mode = our `order: "exit-then-enter"`. `custom` data into exiting elements = our exit Hint on the Beat the element leaves into. | Runtime React tree, DOM layout measure, wall-clock animation. `AnimatePresence` exists only because React has already deleted the child; we have the whole timeline, so we need no workaround. | MIT (`motion` 14.7.1, 2026-10-27) | Very active (repo pushed 2026-10-27) | Runtime by default; since 14.6.0 a manual clock (`processFrame`) makes it seekable on a fresh page (2.4) |
| [reveal.js Auto-Animate](https://revealjs.com/auto-animate/) | Two adjacent slides with `data-auto-animate`: matching elements animate (CSS transitions plus transforms). Match by text content and node type, or by `data-id`, which has priority. Unmatched elements fade in (`data-auto-animate-unmatched`). Per-slide or per-element easing, duration, delay. | Two-level matching: automatic first, explicit id overrides. Per-element timing override. Explicit `restart`/group ids to stop matching. | Content-based auto-match is fragile for diagrams. Runs in the browser: CSS transitions and layout measured with `getBoundingClientRect`. Animates a configurable list of CSS properties (default 12, `autoAnimateStyles`; position and scale are handled separately). Outgoing-only elements get no exit. Full option analysis in 2.5. | MIT (`reveal.js` 6.0.2, 2026-09-10) | Active (repo pushed 2026-09-30; 72k stars per GitHub API) | Runtime CSS; seekable via `getAnimations()` [verified 2026-10-28] (2.5) |
| Keynote [Magic Move](https://support.apple.com/guide/keynote/add-transitions-tanff5ae749e/mac) | Objects move from their place on one slide to their place on the next. Apple's advice: duplicate the slide, then move, resize or reorient objects. | The authoring habit: next state = edited copy of the previous state. Our `add/drop/set` sugar does this. How Apple matches objects is not stated on the page I read; assume identity by duplication [INFERENCE]. | GUI, closed, not scriptable. | Proprietary | n/a | n/a |
| PowerPoint [Morph](https://support.microsoft.com/en-us/powerpoint/morph-transition-tips-and-tricks) | Auto-matches objects. A name starting with `!!` plus the same name on two objects forces a match, even circle to square. | Explicit `morphFrom` override for shape change. | GUI, closed. | Proprietary | n/a | n/a |
| [Manim](https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingAbstractBase.html) `TransformMatchingShapes/Tex` | Submobjects with equal keys transform into each other. The keys are hashes of rounded point coordinates, not author ids (source read 2026-10-28, not run). `key_map` forces extra matches. Unmatched ones fade out and fade in ([source](https://raw.githubusercontent.com/ManimCommunity/manim/main/manim/animation/transform_matching_parts.py)). | Key-based match with explicit override (`key_map` = our `hints.morphFrom`). Default for unmatched = fade. | Imperative Python scripts, not a data model. Not React. | MIT (Manim Community 0.22.1, 2026-10-27) | Active | Deterministic by frame stepping [INFERENCE] |
| [GSAP Flip](https://gsap.com/docs/v3/Plugins/Flip/) | Record state, change DOM, animate offsets away. | Same as FLIP. | DOM measurement. Deterministic only as a paused timeline seeked by frame, as `@remotion/gsap` and HyperFrames do [verified 2026-10-28]. Licence has a competitor clause. | GSAP "no charge" [Standard License](https://gsap.com/standard-license): free, but "Prohibited Uses" forbid tools that let users build visual animations without code and compete with Webflow. npm field: `Standard 'no charge' license`. Not OSI. | `gsap` 3.15.0, 2026-04-13 | Runtime unless seeked |

### 2.2 Libraries (what to reuse)

| Tool | What it does | Borrow | Reject | Why | Licence | Maintenance | Runtime or deterministic |
|---|---|---|---|---|---|---|---|
| [Remotion `interpolate`](https://www.remotion.dev/docs/interpolate) | Maps a frame range to a value range. `extrapolateLeft/Right: 'clamp'`, per-segment `easing`, multi-keyframe input ranges, `Easing.step1` for discrete values. | Use for numbers. Our segments are exactly "one active segment between two keyframes". | Nothing. | Already installed. | Remotion Licence (7) | 4.0.539, 2026-10-26 | Deterministic |
| [Remotion `spring`](https://www.remotion.dev/docs/spring), [`Easing`](https://www.remotion.dev/docs/easing) | `spring({frame, fps, durationInFrames, config})`: `durationInFrames` stretches the curve to a fixed length. `Easing.spring()` is a normalised spring easing. `Easing.bezier`, `inOut`, `out`, `cubic`, `step1`. | Spring with fixed duration so a segment has a known end. Named easings. | `allowTail: true` (spring continues past the segment end): breaks "state at keyframe time is exact". | The segment end must be final. | Remotion Licence | same | Deterministic |
| [`@remotion/paths`](https://www.remotion.dev/docs/paths/interpolate-path): `interpolatePath`, [`interpolatePaths`](https://www.remotion.dev/docs/paths/interpolate-paths), [`evolvePath`](https://www.remotion.dev/docs/paths/evolve-path) | `interpolatePath(t, a, b)` blends two SVG paths; code stems from d3-interpolate-path. `interpolatePaths` (since 4.0.529) adds multiple keyframes, easing and posterize. `evolvePath` returns `strokeDasharray/Offset` for a draw-on. Also `getLength`, `getPointAtLength`, `getTangentAtLength`, `reversePath`, `normalizePath`, `translatePath` (exports read from installed `dist/index.d.ts`). | Path morph for shapes. `getPointAtLength` for label anchors. `interpolatePaths` is useful for the multi-keyframe case. | `evolvePath`: current code already uses `pathLength="1"` and `strokeDashoffset`, which is simpler and frame-exact. | Same vendor, MIT, already a Remotion dependency family. | MIT | 4.0.539 | Deterministic |
| [`@remotion/transitions`](https://www.remotion.dev/docs/transitions) | `TransitionSeries` with presentations (`fade`, `slide`...) between scenes. | Keep for scene-to-scene (already used, `Root.tsx:8`). | Not for element-level motion: it transitions whole sequences, with no element identity. | Different level. | npm and installed `package.json` say `UNLICENSED`; docs say "Remotion License" (flag, section 7). | 4.0.539 | Deterministic |
| [`@remotion/gsap`](https://www.remotion.dev/docs/gsap) | Builds a paused GSAP timeline and seeks it to the current frame. | Proves that "seek by frame" is the accepted pattern for third-party timelines. | Needs GSAP and its licence; timelines are imperative. | We have no need for it. | MIT (`@remotion/gsap` 4.0.539); GSAP see above | 4.0.539 | Deterministic |
| [Motion Canvas](https://motioncanvas.io/docs/flow) | Animations are generator functions (`yield`). [Signals](https://motioncanvas.io/docs/signals) are values that depend on other values. | The idea of derived values: our `inkFor(fill)` and route-from-endpoints are signals. | A second renderer and editor; generators are imperative; no identity diff; no React. | Would replace Remotion and our whole pipeline. | MIT | `@motion-canvas/core` 3.17.2 (2024-12-14); last code commit 2025-02-16; docs-only commit 2026-07-02 (GitHub API). Low activity. Maintained fork Revideo: 0.11.0, 2026-07-10, repo moved to midrender/revideo (2.6). | Frame stepping; deterministic with one worker, but frame N is a fold over frames 0..N-1 [verified via Revideo, 2.6] |
| [d3-interpolate](https://d3js.org/d3-interpolate/color) | `interpolateRgb/Hsl/Lab/Hcl`, [`interpolateTransformSvg`](https://d3js.org/d3-interpolate/transform), `interpolateString`. | `Hcl`/`Lab` prove the idea (perceptual space). | culori does OKLCH and gamut mapping; we do not animate CSS transform strings. | Do not add. | ISC | 3.0.1, 2021-06-05; last push 2023-10-06. Stable, small, quiet. | Deterministic |
| [culori](https://culorijs.org/api/) | `interpolate(colors, mode)`, `formatHex`, `toGamut(dest='rgb', mode='oklch', delta, jnd=0.02)`, `clampChroma`, `clampRgb`, plus `wcagLuminance` / `wcagContrast` (exported in `src/index.js`). | OKLCH interpolation and gamut mapping. Can also cross-check our own contrast code. | Nothing. | Zero dependencies, MIT, active. | MIT | 4.0.2, 2025-06-27; repo pushed 2026-10-15 | Deterministic |
| [flubber](https://github.com/veltman/flubber) | `interpolate(from, to, {maxSegmentLength})` morphs any two shapes (rings or path strings), `separate`, `combine`, `toCircle`, `toRect`. Only the first outer shape of a path string is used. | Better morph for unlike shapes (rect to ellipse). Exact end paths [verified: `interpolate(1) === target`]. | Unmaintained. Multi-subpath input is reduced. Output has hundreds of segments (3.5 kB for a rect to ellipse) [verified]. | Opt-in only. | MIT | 0.4.2, 2018-03-01; last push 2022-11-08. Unmaintained. | Deterministic |
| [ELK](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html) / [elkjs](https://github.com/kieler/elkjs) | Layer-based (Sugiyama) layout with ports, compound nodes, orthogonal edge routing, edge labels, interactive mode. `elk.layout(graph)` returns a Promise. | Layout at prepare time. | Not for render time (async, 1.6 MB bundle). | See 5. | `EPL-2.0 OR GPL-3.0-or-later` | elkjs 0.12.0, 2026-07-17; ELK 0.12.0, 2026-07-22; both repos pushed Oct 2026 | Deterministic geometry [verified] |
| [dagre](https://github.com/dagrejs/dagre) | Directed graph layout. README: only `@dagrejs/dagre` is updated; the old `dagre` package is stale. | Fallback, simpler API. | No ports, weaker routing and no interactive mode [INFERENCE: I did not read its wiki]. | ELK gives more control. | MIT | `@dagrejs/dagre` 3.1.3, 2026-10-24; `dagre` 0.8.5, 2019-12-03 (stale) | Deterministic [INFERENCE] |
| [Mermaid](https://mermaid.js.org/config/layouts.html) | Text diagrams (nodes and edges). States that ELK is bundled since v12.0.0. | Declaration style: `A --> B` nodes and edges. We declare the same graph in TypeScript. | Not a layout engine we can bake per keyframe. | We only copy the idea. | MIT (`mermaid` 12.2.0) | Active | Runtime |
| [React Flow](https://reactflow.dev/examples/nodes/node-position-animation) | Node UI library. Its example tweens node positions with `d3-timer` and linear interpolation. | Confirms the pattern "layout first, then tween positions". | Runtime timer, linear only, no enter/exit. | | MIT (`@xyflow/react` 12.12.0, 2026-09-24) | Active | Runtime |
| Kinety, remotion-open-fx | Per-element animation components for Remotion ([Kinety](https://github.com/muhammed-shaker/kinety): `FadeIn`, `Spin`, `Pop`, `<Motion>`; [remotion-open-fx](https://www.npmjs.com/package/remotion-open-fx): "CSS-based" entrance effects). | Preset names (`fadeIn`, `popIn`) match our enter vocabulary. | No state diff, no identity. remotion-open-fx is CSS based; Remotion says CSS animation is wrong in Remotion [INFERENCE that it applies]. | | MIT per npm for both (Kinety 0.1.1, 2026-07-22; open-fx 1.2.0, 2026-02-27). Kinety has no `LICENSE` file at `main/LICENSE` (HTTP 404). | Kinety: frame driven; open-fx: CSS |
| [fast-check](https://github.com/dubzzz/fast-check) | Property-based testing for TypeScript. | Test strategy (section 4.7). | | | MIT | 4.10.2, 2026-09-19 | n/a (dev only) |

Core purity consequence (section 10, items 8 and 11). The core cannot import `remotion`, so the rows above that say to use `interpolate`, `spring`, `Easing` or `@remotion/paths` describe semantics to match, not imports. `remotion/no-react` exports the same functions without React but is still Remotion. The core therefore writes its own easing (cubic, quad, back, step, `cubic-bezier`), a closed-form damped spring normalised to the segment length (written from the physics, not from Remotion's source; about 30 lines [INFERENCE]), and uses `d3-interpolate-path` for path morph. Remotion's functions stay available inside the Remotion adapter.

### 2.3 Build on Remotion or adopt Reframe?

[Reframe](https://github.com/kiyeonjeon21/reframe) (npm `reframe-video`) is the closest design. I read its `README.md`, `LICENSE`, `CLA.md`, `DESIGN.md`, `packages/core/src/ir.ts`, `interpolate.ts` and `layout.ts` [verified].

| Criterion | Remotion (build on) | Reframe (adopt) |
|---|---|---|
| Licence | Remotion Licence: free for individuals, for-profit organisations up to 3 employees, non-profits and evaluation; company licence otherwise (section 7). | `LICENSE` is MIT text followed by a note on bundled CC0 sound samples. GitHub shows "Other" (`NOASSERTION`) because of that note. `CLA.md` gives the owner the right to relicense contributions. |
| Maturity | 68k stars; 4.0.539 on 2026-10-26. | Repo created 2026-06-11; 24 stars; npm 0.6.49 on 2026-06-22; repo pushed 2026-09-05. Young, one owner. |
| Model | React components. We write the diff. | IR is JSON: nodes with ids, named `states` (sparse overrides), a timeline of `to(state)` steps with `duration`, `ease`, `stagger`, `filter`. Enter and exit are explicit state values, not derived from presence [INFERENCE: I found no presence diff in `ir.ts`]. |
| Determinism | Pure function of `useCurrentFrame()`. | `evaluate(scene, t)` is pure; `reframe lint` compiles twice and compares the IR. Good idea. |
| Renderer | Chromium by Remotion; our SVG components stay. | Canvas 2D, rendered with Playwright (`playwright` in `packages/render-cli/package.json`). Not React, not Remotion. Our shapes, fonts and `measureText` code would be rewritten. |
| Colour | We choose OKLCH. | `lerpValue` lerps RGB (`interpolate.ts:165-173`). |
| Paths | `interpolatePath`, flubber. | Morph only if the command sequence matches; else swap at the midpoint (`interpolate.ts:177-180`). |
| Layout | ELK at prepare (this doc). | `layout.ts` is row/grid arithmetic only. No graph layout. |
| Contrast gate | We have `src/core/contrast.ts` and `scripts/contrast.ts`. | None found. |
| Our pipeline (Kokoro TTS, Whisper word alignment, soft captions, `emit.ts`, `verify.ts`) | Already wired to Remotion. | Has its own narration and audio tooling; would not use our alignment. |

Decision: build on Remotion. Steal from Reframe: (1) the purity lint "compile twice, compare", (2) easing as data (names, bezier, spring), (3) stable-id overlay edits as a later feature, (4) `token()` colour references (we already have palette tokens).

### 2.4 Test of the claim "no package combines all five properties"

Properties: **K** declared keyframes, **I** identity diff that derives enter/exit/update, **D** frame-deterministic, **R** React/Remotion, **L** graph layout per state. The survey in 2.6 adds **A** (a contrast check on rendered frames is possible) and Fit.

Corrected 2026-10-28 after the survey (changed cells marked *):

| Candidate | K | I | D | R | L |
|---|---|---|---|---|---|
| Reframe | yes (named states) | no (its docs mention no presence diff; enter/exit are explicit state values) | yes | no | no |
| Motion (`layoutId`, `AnimatePresence`) | partly (`animate` keyframe arrays, variants) | yes | partly* (14.6.0, 2026-10-22: `processFrame` plus `MotionGlobalConfig.useManualTiming`; on a fresh page 31/31 frames identical across two runs and direct jumps match; backward seek fails; the API is undocumented) | yes (not Remotion) | no (measures DOM) |
| reveal.js Auto-Animate | yes (slides) | yes | partly* (seekable: `getAnimations()` entries settable, identical hashes forward and shuffled; no exit; sRGB colour tween) | no | no |
| Manim `TransformMatching*` | no (imperative) | partly* (keys are hashes of rounded point coordinates; `key_map` forces matches) | yes [INFERENCE] | no | not checked |
| Motion Canvas (and its fork Revideo) | no | no | partly* (one worker byte-identical; frame N is a fold over frames 0..N-1; three workers lost a frame) | no | no |
| `@remotion/gsap` | no (timelines) | no | yes | yes | no |
| GSAP Flip | no | yes (DOM snapshot) | partly* (only as a paused, seeked timeline) | no | no |
| Kinety, remotion-open-fx | partly | no | Kinety yes; open-fx CSS | yes | no |
| React Flow + ELK ([Stately cookbook](https://dev.stately.ai/docs/packages/graph/react-flow-elk-pipeline), [position animation](https://reactflow.dev/examples/nodes/node-position-animation)) | no | partly (node ids) | no (`d3-timer`) | yes | yes |
| Remotion core and `@remotion/paths` | no | no | yes | yes | no |

Rows added by the survey (2.6; all [verified] by source read or experiment unless marked [INFERENCE]):

| Candidate | K | I | D | R | L | Evidence |
|---|---|---|---|---|---|---|
| CSS View Transitions (`view-transition-name`) | yes | yes | yes | no | no | Seeks via `getAnimations()`; identical hashes forward, reverse and shuffled in two experiments. Recolour and relabel are a raster crossfade (labels ghost); inner SVG elements are not captured. |
| anime.js 4.5.0 `createLayout` | partly | yes | partly | no | no | `data-layout-id` identity, seekable timeline. Exit only if the node stays in the DOM; seeking to the end changes later frames. |
| Animotion 2.0.0-next.8 | partly | yes | partly | no (Svelte) | no | `data-layout` diff; 77 frames identical across two runs; one step boundary mismatched when seeking; SVG exit broken. |
| HyperFrames 0.8.210 | no with GSAP; partly as a frame source | partly (GSAP Flip) | yes | no | no | `window.__hf.seek(t)`; Flip scene 90/90 identical at 1 and 3 workers; a pure `frameState(t)` frame source 60/60 identical. |
| ecmanim 0.14.1 | partly | yes | yes | no | partly | `TransformMatchingAuto` pairs by `matchId`; 12 SVG frames identical across two runs; own layout has no edge routing. |
| Revideo 0.11.0 | no | no | partly | no | no | Flexbox layout only; per-frame node graph readable; a 74-line diff layer on top ran. |
| d3-graphviz 5.6.0 | partly | yes | partly (faked clock) | no | partly | Matches by DOT node name; `dot` re-lays out every state, so unchanged nodes move. |
| Sprotty 1.4.0 | partly | yes | partly [INFERENCE] | no | yes | Id-keyed `ModelMatcher` plus ELK; no colour tween; not run. |
| D2 (`@terrastruct/d2` WASM 0.1.33) | yes (boards) | partly (stable ids, geometry only) | yes (layout output) | no | yes per board, but positions are not stable between boards | `top`/`left` ignored; animated export flips opacity between boards, no tween. |
| Theatre.js `@theatre/core` 0.7.2 | partly | no | yes | no | no | `sequence.position` exact in both directions; strings do not tween; last release 2024-05-19. |
| lottie-web 5.13.0 / `@remotion/lottie` | partly | no | yes | yes (`@remotion/lottie`) | no | `goToAndStop` identical forward, reverse and shuffled. |
| react-spring `useTransition` | partly | yes | partly | yes | no | Sequential stepping identical; a jump to frame 17 differs (dt clamped to 64 ms). |
| d3 data-join + d3-transition | partly | yes | yes (virtual clock) | no | no | Jump on a fresh page equals sequential stepping; not React; quiet since 2023. |
| Code Hike token-transitions + `template-code-hike` | partly | partly (token content) | yes | yes | no | The Remotion pattern "measure the DOM, apply from `useCurrentFrame()`" works seekably; code only. |
| Kinetograph 0.2.0 | no | no | partly | yes (reimplements the Remotion API) | no | At concurrency 3 it diverged on a Flip page; SVG labels missing on our project while `doctor` reported clean. |
| Rive / `@remotion/rive` | partly | no | no | yes | no | `advance(frame - lastFrame)` is stateful, not a function of the frame. |
| Gemini² (uwdata/gemini) | yes | yes | no | no | no | Vega-Lite 4 only; d3 transitions with `setTimeout`; no release since 2020. |

The claim holds after the survey: about 50 candidates, none with K, I and D together on computed frames plus layout across Beats. The tools that derive enter, exit and update all measure the live DOM. Absence cannot be proven [INFERENCE].

What we write ourselves: the compiler (diff and window placement), `frameState`, the layout bake, the contrast sampler. The size is small (a few hundred lines) [INFERENCE].

### 2.5 Option space: reveal.js Auto-Animate as the animator (R1, R2, R3) versus the native engine (R0)

Facts read from the reveal.js source (`js/controllers/autoanimate.js`, `js/reveal.js`, master on 2026-10-28) and docs [verified]:
- **Matching.** Explicit `[data-id]` pairs are matched first by node name plus id (`autoanimate.js` ~451); then text and `src` heuristics ([docs](https://revealjs.com/auto-animate/)).
- **Motion is CSS transitions.** For each matched pair the code writes a style sheet: the from-state has `transition: none`; the to-state has `transition: all <duration>s <easing> <delay>s` and a `transition-property` list (~258-262). `data-auto-animate="running"` is set inside `requestAnimationFrame` (~102-108). `reveal.js` adds `disable-slide-transitions` and calls `autoAnimate.run(previous, current)` synchronously in the slide change (`reveal.js` ~1440-1453).
- **Layout is measured in the browser.** Position and size come from `getBoundingClientRect()` when `center` is on, else `offsetLeft * Reveal.getScale()` (~345-360). Position and scale become transforms.
- **Animatable properties.** Default `autoAnimateStyles`: `opacity, color, background-color, padding, font-size, line-height, letter-spacing, border-width, border-color, border-radius, outline, outline-offset`; position and scale are matched separately ([config](https://revealjs.com/config/)).
- **Unmatched elements.** Only elements of the incoming slide that have no match get an opacity transition (default duration 0.8 x D, delay 0.2 x D, ~72-92). There is no exit animation for elements that exist only on the outgoing slide [verified 2026-10-28: `getUnmatchedAutoAnimateElements(toSlide)` collects only incoming elements, and in a run an outgoing-only element was gone at the first frame].
- **React.** [`@revealjs/react`](https://revealjs.com/react/) 0.2.2 (MIT): `Deck` (async init, `onReady`), `Slide` props `autoAnimate`, `autoAnimateId`, `autoAnimateRestart`, `autoAnimateUnmatched`, `autoAnimateEasing`, `autoAnimateDuration`, `autoAnimateDelay`, `Fragment` (`animation`, `index`), `Stack`, `Markdown`, `useReveal()`, `deckRef`, events `onReady`, `onSlideChange`, `onSlideTransitionEnd`, `onFragmentShown`. `config` is shallow-compared; `plugins` are read once.
- **Web platform.** [`document.getAnimations()`](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations) returns CSS Animations, CSS Transitions and Web Animations. [`CSSTransition`](https://developer.mozilla.org/en-US/docs/Web/API/CSSTransition) is an `Animation`. [`Animation.currentTime`](https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime) can be set "whether running or paused". Playwright `animations: "disabled"` fast-forwards finite animations to completion ([API](https://playwright.dev/docs/api/class-page)), so it cannot give midpoints; [`page.clock`](https://playwright.dev/docs/clock) fakes `Date`, timers and `requestAnimationFrame`.
- **Remotion.** "All animations in Remotion must be driven by the value returned by `useCurrentFrame()`" ([third party](https://www.remotion.dev/docs/third-party)); CSS animations are synced with `animation-play-state` and `animation-delay`; CSS transitions are named as a flicker cause ([animating properties](https://www.remotion.dev/docs/animating-properties)); frames can render out of order or twice ([CSS animations](https://www.remotion.dev/docs/troubleshooting/css-animations)).

| Option | How it works | Why it can be deterministic | Gain | Loss |
|---|---|---|---|---|
| **R0** native engine (sections 3 to 6) | Keyframes, diff, baked segments, pure `frameState` in Remotion. | Pure function of the frame; nothing in the browser animates. | Everything in sections 3 to 6. | We write the engine. |
| **R1** seek-capture | Headless Chromium (Playwright) opens a reveal.js deck. Per transition: navigate, wait for `running`, pause all `document.getAnimations()`, set `currentTime` to `k * 1000/30` ms, screenshot. ffmpeg assembles frames and muxes narration and subtitles. | Only if every frame is byte-identical on re-render (falsifier below). Relies on Chromium's animation and layout. | Mature matcher; the live deck is the source. | Leaves Remotion: its parallel renderer, Studio and `TransitionSeries`. We write the capture loop, scene sequencing and audio sync. |
| **R2** reveal.js inside a Remotion composition | `@revealjs/react` `<Deck>` in an `AbsoluteFill`. A pure map `frame -> (slide, fragment, ms since transition)`. Each frame: `delayRender`, navigate to slide n-1 (no animation), navigate to n, wait for `running`, pause and seek every `getAnimations()` entry, `continueRender`. | Same as R1, plus the per-frame state rebuild that parallel tabs need. | One animator for live deck and video. Keeps Remotion tooling, `TransitionSeries`, audio, our alignment. | Two navigations and at least two animation frames per rendered frame. Pre-1.0 wrapper. |
| **R3** reveal semantics as spec, our diff | Keep the author-facing rules: `data-id` identity, unmatched fade-in, `restart` and id groups, per-element duration, easing, delay. Implement the diff in our layer (this document). | As R0. | Authors who know reveal.js read the model at once. | Not a reveal deck. |
| **R4** Deck Rendering (decided: later) | Render a Story as a reveal.js Deck: one slide per Beat, `data-id` = Element id, Lines as speaker notes (3.4). | Not used for the Video. | Click-through Deck for the speaker and for study. | Two animators (ours for Video, reveal.js for Deck) can drift. The Deck inherits Auto-Animate's limits: no exit, sRGB colour tween (2.6). |

Answers to the technical questions [status in brackets]:

| Question | Answer |
|---|---|
| Do Auto-Animate animations appear as seekable `CSSTransition` objects? | Yes [verified 2026-10-28, Chromium 155, reduced version of spike S1 and S2]. After the `running` flip `document.getAnimations()` lists `CSSTransition` entries (`background-color`, `border-*-color`, `color`, `outline-color`, `transform`), `currentTime` is settable, and five seek points in forward and in shuffled order gave identical screenshot hashes across two fresh runs. Not tested: Remotion concurrency (S5) and per-frame fresh-page replay. |
| Does Remotion's parallel rendering force a state rebuild per frame? | Yes by design: tabs do not share state and frames may render out of order or twice (Flickering and CSS-animation pages). Each frame must therefore be self-contained: slide n-1, slide n, pause, seek. Whether a tab keeps the page loaded between its frames is [INFERENCE]. Spike S5 checks equal output at `--concurrency=1` and `4`. |
| Do reveal's scaling and transforms conflict with the 1920x1080 canvas? | Reveal scales `.slides` to fit the viewport by default. Set `width: 1920`, `height: 1080`, `margin: 0`, `minScale: 1`, `maxScale: 1`, or `disableLayout: true` (config comment: "Disables the default reveal.js slide layout (scaling and centering) so that you can use custom CSS layout"). Auto-Animate multiplies offsets by `Reveal.getScale()` when `center` is off, so the scale must be exactly 1. Spike S5 compares a still against an `AbsoluteFill` reference. |
| What breaks determinism? | Chromium version, fonts not yet loaded, `requestAnimationFrame` and `setTimeout` hops inside reveal.js, GPU raster differences. Falsifier: render twice and byte-compare every frame; render in a shuffled order; render at two concurrencies. Any mismatch rejects R1 and R2. |
| Can the contrast check run? | Yes. R1 and R2 can read `getComputedStyle` (colour, background colour, opacity of each ancestor) at every seeked frame and feed `contrastRatio`. This checks what the browser painted, including its own colour interpolation. SVG paint and gradients need extra code. R0 checks model values without a browser. Use R0 as the gate and the DOM pass as an audit if R2 is chosen. |
| One source for live deck and video? | R2 gives one literal animator. R0 can give the same through `@remotion/player` ([docs](https://www.remotion.dev/docs/player)): it embeds Remotion videos in any React app; a step control jumps to the settle frame of each keyframe [INFERENCE: not tested]. Both stay under the Remotion licence. |

What Auto-Animate cannot express and the 4EM scenes need:

| Need | Where it comes from | Auto-Animate |
|---|---|---|
| Exit animation and exit-before-enter order | s12 label rule (8.4), s14.7 | No exit for outgoing-only elements [verified 2026-10-28]. Unmatched-in fade has a fixed delay only. |
| Links follow moved boxes | `Link` routes today are hand-typed (`framework.ts:21-27`) | SVG `d` is not in `autoAnimateStyles`. `offsetLeft` does not exist on SVG elements, so measuring needs the `center` path [INFERENCE from ~345-360]. |
| OKLCH colour, fixed-duration spring | Section 4.6 | CSS transition colour space is the browser's; easing is CSS easing. A `linear()` easing could approximate a spring [INFERENCE]. Spike S4 records the colour result. |
| Typed storyboard as source of narration, captions, `emit.ts` | Section 1 | Slides are HTML or JSX. Needs a generator from keyframes (R4) or a rewrite of 15 scenes. |
| Graph layout | Section 5 | None. ELK at prepare works with every option. |

**Recommendation: R0 with R3 semantics.** Reasons:
1. The scenes need exits, ordering rules, route following and path morph; Auto-Animate has none of these, so R2 would need the same engine work on top of a browser animation layer.
2. Determinism by construction (pure function of integers) is stronger than determinism by seeking Chromium's animation clock, which we can only falsify, not prove.
3. The contrast gate works on model values with no browser, on every frame, in seconds.
4. The 15 typed scenes already feed `emit.ts`, captions and the storyboard document; a reveal deck would replace that single source or duplicate it.
5. `@revealjs/react` is 0.2.2 and new in reveal.js 6.0.0.
6. The live-deck argument is met by `@remotion/player` driving the same pure function.

Decision (2026-10-28): R0 with R3 semantics, no spike (section 10, item 2). The counter-points stay on record: R2 would have been the least code had the spike passed; Auto-Animate's matcher is mature (reveal.js has 72k stars); reveal.js gives speaker notes, overview and PDF export for free, which is why the Deck Rendering uses it (3.4).

The spike below will not be run (decided 2026-10-28). During the survey (2.6) a reduced version of S1 and S2 ran at 960x540 with one moving, recoloured and relabelled box, one incoming-only element and one outgoing-only element, and S4's question was answered by sampling computed colours: seeking works and is deterministic, the outgoing-only element has no exit, and text and fill both tween in sRGB (worst contrast 1.08:1, at 528 ms). The table stays as the recipe for checking a Deck Rendering later.

| Step | Action | Pass criterion |
|---|---|---|
| S1 | Two-slide deck, both `data-auto-animate`, 1920x1080, `autoAnimateDuration: 1`. Four `data-id` elements: a box that moves, resizes and changes fill (`#9BEA9B` to `#7A64A8`) and text colour; a label that changes text; an element only on slide 2; an inline SVG `<path>` with a changed `d`. | Deck loads; the `ready` event fires. |
| S2 | R1 harness: Chromium via Playwright (`CHROMIUM_PATH` as in `README.md`), viewport 1920x1080, scale factor 1. Navigate to slide 2, wait for `data-auto-animate="running"`, log `document.getAnimations()` (class name, `transitionProperty`, `getComputedTiming()`), pause all, for `k = 0..30` set `currentTime = k * 1000/30`, wait two animation frames, screenshot PNG, record `getComputedStyle` of the four elements. | `CSSTransition` entries exist for transform, `background-color`, `color`, opacity; settable; frame 0 equals slide 1, frame 30 equals slide 2. |
| S3 | Determinism: run S2 twice and hash all 31 PNGs; run a shuffled order with a fresh page per frame (slide 1, slide 2, pause, seek); compare hashes. | All hashes equal in all three runs. Record the Chromium version. |
| S4 | Show frame 15 as PNG. Print computed `background-color` at the midpoint and compare with the sRGB mean and with the culori OKLCH mean (`#2fb2d5`, section 4.6). Note what the SVG `<path>` did. | Midpoint colour space identified; SVG behaviour written down. |
| S5 | R2: minimal Remotion composition with `<Deck>` from `@revealjs/react`, config `width 1920, height 1080, margin 0, minScale 1, maxScale 1` (or `disableLayout`), frame map for frames 0, 15, 30, 29, 0; render stills at `--concurrency=1` and `4`. | Hashes equal across concurrency and equal to S2 frames. |
| S6 | Feed the S2 computed colours to `contrastRatio` for all 31 frames. | Per-frame ratios produced; the text/fill dip (6.3) is visible or absent. |

The spike also gives measured per-frame cost for R1 and R2 (the current `README.md` full render is five chunks of about 3000 frames, so the cost matters).

### 2.6 Survey 2026-10-28: does an existing tool already solve it?

**Question.** Before building tsukuri, does a maintained tool already give narrated, frame-deterministic explainers of box-and-arrow notations with: **K** declared keyframes, **I** identity-diff enter/exit/update, **D** frame-deterministic offline rendering, **L** automatic layout per state with stable positions and re-routed arrows, **A** a per-frame contrast check, and Fit (TypeScript/Bun, works with or replaces Remotion 4, licence usable by a student or non-profit, maintained in 2025-2026)?

**Method.** About 50 candidates: the tools in 2.1 to 2.5, then npm and GitHub topic searches (`magic-move`, `shared-element-transition`, `diagram-animation`, `programmatic-video`, `auto-animate`, `animated-diagrams`, `explainer-video`) and docs. Versions, licences and dates were read from the npm registry, the GitHub API and package `LICENSE` files. Where a claim was decisive (seekable, matched by id, same bytes on rerun) it was run: two states, a goal box appears, then moves, is relabelled and recoloured while a second box exits; system Chromium 155 through playwright-core, Bun 1.3.13 and Node 24, at most one browser at a time, small frames, scratch directories under `/tmp` removed afterwards. Per-candidate verdicts are in 2.4; this section keeps the decision and its reasons.

**Verdict: BUILD-THIN.** The design in this document stands. No candidate is adoptable, and none is worth building on for more than a helper.

| # | Reason | Evidence |
|---|---|---|
| 1 | Every tool that derives enter, exit and update measures the live DOM at runtime (reveal.js, Motion, anime.js, View Transitions, GSAP Flip, Animotion, d3-graphviz, Svelte, Vue). Their determinism comes from seek or replay tricks, and each broke somewhere. | Motion: jump works, backward seek fails, the two-node form matched 4 of 13 on a reused page. anime.js: seeking to the end changes later frames. Animotion: one step boundary mismatched in three runs. d3 and react-spring: a jump after sequential stepping fails. |
| 2 | The tools whose frames are computed rather than measured have no identity diff. | Revideo, Theatre.js, Lottie, VideoFlow, HyperFrames with GSAP. A 74-line diff layer on Revideo ran, so adopting it saves nothing and replaces Remotion. |
| 3 | Nobody ships layout across states with stable positions. | D2 lays out each board independently and ignores `top`/`left`; d3-graphviz re-lays out and moves unchanged nodes; Sprotty has ELK and id diff but is a browser-only Inversify app with no colour tween (not run). Our `elk.interactive` result stays the verified approach. |
| 4 | Every tool tweens text colour and fill separately, so contrast dips in the middle. | reveal.js 1.08:1 (sRGB), Revideo 1.13:1 (LCH), HyperFrames 1.04:1 on a planted case that its audit found only when the times were named (it samples at most 5 times per run). Derived ink plus a per-frame gate (section 6) is a requirement none meets. |
| 5 | Exit and SVG support are weak where identity diff is good. | Auto-Animate has no exit; Animotion's SVG exit is broken; View Transitions cannot capture inner SVG elements and crossfade labels as pixels; anime.js needs the node to stay in the DOM. Our scenes are SVG. |

**Borrow, do not depend on.** Reframe's "compile twice, compare" lint (2.3). An after-the-fact continuity probe like onetake's (the idea only: its licence is PolyForm Noncommercial). HyperFrames' `check` contrast audit as a second opinion on browser-painted frames. `@remotion/animation-utils` `interpolateStyles` for plain numeric styles.

**Exit ramp.** HyperFrames (Apache-2.0, `hyperframes` 0.8.210 on 2026-10-28, 210 releases since 2026-03-10) ran a pure `frameState(t)` through `registerFrameSource` with 60 of 60 frames identical across two runs at two workers, and ships Kokoro TTS and Whisper word timestamps, the same models we use. The cost is that it is no longer React, and its 0.x API changes fast. This is why `frameState` returns plain data and the core imports nothing from React or Remotion (3.0).

**What would change the verdict.**
- Motion documents `processFrame` as stable, supports SVG and gives a Remotion-safe pattern: BUILD-ON for the diff only. We would still write layout, link routing, label tween and the contrast gate. Today `processFrame` is 6 days old and the changelog says undocumented APIs "may change without warning".
- ecmanim (MIT, 0.14.1, created 2026-07-01, 7 stars) gains ELK with edge routing and a verified mp4 path. It has `matchId` identity and byte-identical frames today, but it would replace Remotion.
- HyperFrames adds an engine-level state diff.
- Animotion publishes its 2.x source and fixes SVG exit and seeking.
- A Deck becomes the primary Rendering rather than a later one (3.4): then reveal.js Auto-Animate semantics, not our diff, would drive it.

**Not verified.** Sprotty, Penrose, tldraw, Manim, Cytoscape and yFiles were not run. HyperFrames' "atomic" capture could not start here (the cached `chrome-headless-shell` lacked shared libraries), so its determinism results are for the screenshot fallback on one machine and one Chromium; its docs say exact cross-machine reproducibility needs its Docker mode. ecmanim's mp4 path was not run (no ffmpeg on that run), and its text coordinates looked wrong in one test, cause unconfirmed. View Transitions inside a Remotion frame was not tried.

---

## 3. Data model

### 3.0 Core and adapters

tsukuri's core is plain TypeScript. It owns the data model, the compile step (anchors, Identity diff, layout bake, checks) and `frameState`. It imports no `react`, `remotion`, `@remotion/*` or DOM type. Renderers are adapters that read `FrameState` (plain data) and draw it.

```
src/core/                     tsukuri core: pure TypeScript; runs under Bun and in Chromium
  story.ts                    Story, Scene, Beat, Keyframe, Element types and the `beat` sugar (this section, 8.1)
  compile/                    prepare time only (Bun): resolve, layout bake (elkjs), plan.ts (the Plan, 4.0), schedule (anchors to frames), checks
  frame-state.ts              frameState(story, frame): FrameState. No elkjs, no fs, no Date, no random (4.2)
  contrast.ts                 exists today; pure
  geometry.ts                 the pure parts (pointOnBorder, outline) move here from src/components
src/adapters/remotion/        Diagram.tsx draws FrameState as SVG; Root.tsx; TransitionSeries; @remotion/layout-utils measuring
src/adapters/hyperframes/     the exit ramp: registerFrameSource(...) around frameState (not built, 2.6)
src/adapters/deck/            reveal.js Deck Rendering (later, 3.4)
scripts/                      prepare, plan, layout, contrast, render, mux, verify: call the core; render.ts drives the Remotion adapter
```

Today `src/core/` already has no React or Remotion import (checked 2026-10-28: its files import only `./types.ts`), while `src/components/geometry.ts` imports `@remotion/layout-utils` for `measureText`. Measuring therefore stays adapter code, and the core receives declared sizes (5.1). Property P10 (4.7) keeps the boundary by test, not by review. Existing `El`, `Link`, `NotationKind` stay and are reused by the adapter.

Vocabulary is `GLOSSARY.md`: a **Story** contains **Scenes**; a Scene is the boundary of identity; a Scene is a sequence of **Beats**; a Beat holds the **Keyframe** it ends in, the **Line** that carries it, **Cues** and **Hints**. The types below are the whole model.

```ts
import type { ElementKind, LinkKind } from "./types.ts";

export type ElementId = string;           // stable inside one Scene; shapes and links share one namespace; "g11", "l_goal_proc"
export type LineId = string;              // a spoken paragraph of the manuscript, aligned to words by Whisper; "s14.1"
export type Frames = number;              // integer frames at style.canvas.fps (30)
export type Pt = readonly [x: number, y: number];
export type Colour = string;              // "#RRGGBB" or a palette token name ("night", "signal")

// ------------------------------------------------------------ Story, Scene, Beat

export interface Story { readonly id: string; readonly fps: number; readonly scenes: readonly Scene[] }

export interface Scene {                          // the boundary of identity: Elements are matched only between Beats of one Scene
  readonly id: string;
  readonly entities: { readonly elements: readonly El[]; readonly links: readonly Link[] };   // today's `elements` and `links`
  readonly defaults?: SceneDefaults;
  readonly beats: readonly Beat[];
}

export interface Beat {                           // the smallest unit of story: one change the viewer should notice
  readonly id: string;                            // "s14.b3"; shows up in storyboard.md and test names
  readonly at: When;                              // when the transition into this Beat starts; usually { anchor: { on: "word", phrase } } in its Line (4.4.1)
  readonly keyframe: Keyframe;                    // the visual state the Beat ends in
  readonly cues?: readonly Cue[];                 // reserved: sound effects, music changes, pauses; no renderer reads them yet
  readonly hints?: Hints;                         // optional instructions for the transition into this Beat
}


export interface Cue { readonly id?: string; readonly kind: "sound" | "music" | "pause"; readonly ref?: string; readonly at?: When }   // `at` defaults per kind (4.4.1); no renderer reads Cues yet
// `When`, `Anchor` and `Offset` are defined in 4.4.1. They replace today's `When` (types.ts:104): a word phrase is `{ on: "word", phrase }`,
// today's `delay` is an offset, today's scene start/end is `{ on: "scene", edge }`, and today's seconds escape hatch becomes `{ absolute, reason }`.

// ------------------------------------------------------------------ Keyframe

export interface Keyframe {                       // every visible Element with its properties: a full state, not a delta
  readonly elements: Readonly<Record<ElementId, ElementState>>;
  readonly camera?: Camera;
  readonly graph?: GraphSpec;                     // section 5; expands into x, y, w, h, route at prepare
}

export type ElementState = ShapeState | LinkState;   // links are Elements too (glossary)

export interface ShapeState {
  readonly type: "shape";
  readonly kind: ElementKind;
  readonly label?: string;
  readonly head?: string;
  readonly x: number; readonly y: number;          // centre on the 1920x1080 canvas (same as El.at)
  readonly w: number; readonly h: number;
  readonly fill: Colour;
  readonly stroke: Colour;
  readonly textColour?: Colour;                    // omitted = inkFor(effective background), derived every frame
  readonly opacity: number;                        // 0..1, applies to the element as a group (fill + text)
  readonly ring?: number;                          // 0..1 signal ring (replaces focus ring)
  readonly path?: string;                          // SVG path "d", element-local; makes the shape morphable
  readonly z: number;
  readonly parent?: ElementId;                     // containment: effective background and transform inheritance
  readonly opt?: Readonly<Record<string, string | number | boolean>>;
}

export interface LinkState {
  readonly type: "link";
  readonly kind: LinkKind;
  readonly from: ElementId;                        // endpoints are shape Elements of the same Scene
  readonly to: ElementId;
  readonly label?: string;
  readonly stroke: Colour;
  readonly width: number;
  readonly dash?: string;
  readonly opacity: number;
  readonly z: number;
  readonly via?: readonly Pt[];                    // hand hints (today's Link.via); input to layout
  readonly route?: readonly Pt[];                  // BAKED by prepare: polyline from border to border
  readonly labelAt?: Pt;                           // BAKED: label centre
}

export interface Camera { readonly x: number; readonly y: number; readonly zoom: number }

// --------------------------------------------------------------------- Hints

/** Optional instructions for the transition into a Beat. The motion itself is derived by the Identity diff, never declared. */
export interface Hints {
  /** "exit-then-enter": exits end before any enter or update starts (Motion "wait" mode). Default. */
  readonly order?: "exit-then-enter" | "together";
  /** "start": window starts at the anchor word (today's behaviour). "end": window ends at the word. */
  readonly align?: "start" | "end";
  readonly allowInterrupt?: boolean;               // else a window crossing the next anchor is a prepare error
  readonly stagger?: Frames | { readonly each: Frames; readonly by: "declaration" | "x" | "y" | "distance" };   // a bare number = by declaration order
  readonly enter?: Readonly<Record<ElementId, EnterSpec>>;       // how an entering Element appears
  readonly exit?: Readonly<Record<ElementId, ExitSpec>>;         // how a leaving Element goes (declared on the Beat it leaves into)
  readonly update?: Readonly<Record<ElementId, UpdateSpec>>;     // timing of changed props
  readonly morph?: Readonly<Record<ElementId, "shape">>;         // allow a kind change to morph (3.2 rule 5)
  readonly morphFrom?: Readonly<Record<ElementId, ElementId>>;   // explicit identity override (3.2 rule 6, 3.3)
}

/** Scene-wide defaults that every Beat's Hints refine. */
export interface SceneDefaults {
  readonly enter?: EnterSpec; readonly exit?: ExitSpec; readonly update?: UpdateSpec;
  readonly order?: Hints["order"]; readonly align?: Hints["align"];
}

// -------------------------------------------------------------- enter / exit

export type EnterSpec =
  | { readonly kind: "none" }
  | { readonly kind: "fade"; readonly frames: Frames; readonly easing?: EasingSpec }
  | { readonly kind: "pop"; readonly frames: Frames; readonly from?: number; readonly easing?: EasingSpec }   // scale from..1 (default 0.84)
  | { readonly kind: "draw"; readonly frames: Frames; readonly easing?: EasingSpec }                            // stroke-dashoffset 1 -> 0 on pathLength=1
  | { readonly kind: "slide"; readonly frames: Frames; readonly dx: number; readonly dy: number; readonly easing?: EasingSpec }
  | { readonly kind: "type"; readonly framesPerChar: number };                                                   // deterministic: floor(age / n)

export type ExitSpec =
  | { readonly kind: "none" }
  | { readonly kind: "fade"; readonly frames: Frames; readonly easing?: EasingSpec }
  | { readonly kind: "pop"; readonly frames: Frames; readonly to?: number; readonly easing?: EasingSpec }
  | { readonly kind: "draw"; readonly frames: Frames; readonly easing?: EasingSpec }                            // un-draw
  | { readonly kind: "slide"; readonly frames: Frames; readonly dx: number; readonly dy: number; readonly easing?: EasingSpec };

// ------------------------------------------------------------------- update

export type Animatable =
  | "x" | "y" | "w" | "h" | "opacity" | "ring" | "z"
  | "fill" | "stroke" | "textColour"
  | "path" | "route" | "label" | "camera";

export interface PropTiming {
  readonly frames?: Frames;                        // duration; default from style tokens
  readonly delay?: Frames;
  readonly easing?: EasingSpec;
  /** Offset each element by `each` frames in the order given by `by`. */
  readonly stagger?: { readonly each: Frames; readonly by: "declaration" | "x" | "y" | "distance" };
}
export type UpdateSpec = Partial<Record<Animatable | "default", PropTiming>> & {
  /** Text cannot be blended. Default: old label fades out, then new label fades in (no overlap). */
  readonly label?: PropTiming & { readonly mode?: "sequential" | "swap" | "type"; readonly outFrames?: Frames; readonly inFrames?: Frames; readonly gap?: Frames };
};

// ------------------------------------------------------------------- easing

export type EasingName =
  | "linear" | "ease-in" | "ease-out" | "ease-in-out"        // cubic, as Easing.in/out/inOut(Easing.cubic)
  | "in-quad" | "out-quad" | "in-out-quad"
  | "out-back"                                               // small overshoot, positions and scale only
  | "step-start" | "step-end";                               // discrete props (z, kind); Easing.step0 / step1

export type EasingSpec =
  | EasingName
  | { readonly bezier: readonly [x1: number, y1: number, x2: number, y2: number] }      // Easing.bezier
  | { readonly spring: { readonly damping?: number; readonly stiffness?: number; readonly mass?: number; readonly restThreshold?: number } };
// A spring is evaluated with `durationInFrames` = the segment length, so it ends exactly at the window end.
// `allowTail` is never set. At f >= f1 the value is the declared `to`, exactly.
```

Rules for easing [verified in docs]:
- Remotion `spring` has `durationInFrames` ("stretches the animation curve so it is exactly as long as you specify") and `durationRestThreshold`. `Easing.spring` exists since 4.0.476; its curve is normalised to the segment. See the [spring](https://www.remotion.dev/docs/spring) and [Easing](https://www.remotion.dev/docs/easing) pages. These are the semantics to match: the core writes its own spring with the same contract (ends exactly at the segment end, no tail), because it cannot import Remotion (2.2 note).
- Overshoot (`out-back`, low damping) is allowed only for `x, y, w, h` and scale. For `opacity`, `ring` and colours the engine clamps to the range of `from` and `to`.
- Defaults live in `style.ts` as tokens: position `ease-in-out` 18 frames; opacity `linear` 12; fill `ease-in-out` 15; path `ease-in-out` 18; label out 6 + in 6.

### 3.1 Style tokens for motion

`style.motion` today is a list of text rules (`style.ts:72-`). Add data next to them, and keep the text rules as the reason:

```ts
motionTokens: {
  enter: { pop: { frames: 12, from: 0.84, easing: "ease-out" }, fade: { frames: 12 }, draw: { frames: 15 },
           slide: { frames: 14, dx: -40, dy: 0, easing: "ease-out" }, type: { framesPerChar: 1.5 } },
  exit: { fade: { frames: 8 } },
  update: { default: { frames: 18, easing: "ease-in-out" } },
  exemptWindowMax: 12,                 // section 6.5
}
```

The enter values are the numbers in `Diagram.tsx:74,86-88,106`. The adapter keeps them so the first migration step changes no pixels.

### 3.2 Identity rules

React's model is the template: a stable `key` says "same thing" ([React](https://legacy.reactjs.org/docs/reconciliation.html)).

1. **Id equality.** The same `ElementId` in the Keyframes of two consecutive Beats of one Scene is the same Element. Ids are unique per Scene, shared by shapes and links, and never reused for a different thing in the same Scene. Across Scenes nothing is matched: a Scene boundary is a cut or crossfade. `prepare` fails on a duplicate id inside one Keyframe (impossible by `Record`) and warns on an id that vanishes and returns within 30 frames (probably a typo).
2. **Present in next only** = enter. Uses `hints.enter[id]` of the Beat, else the Scene default, else the style default (`fade`).
3. **Present in previous only** = exit. Uses `hints.exit[id]` of the Beat it leaves into, else the Scene default, else the style token. The compiler sees both Keyframes, so no React-style workaround (`AnimatePresence`) is needed.
4. **Present in both, same `kind`** = update. Each changed prop gets a segment (section 4.3).
5. **Present in both, `kind` changed** = exit old + enter new, unless `hints.morph[id]` is `"shape"` and both kinds have a path (see 3.3). Example: `s06.8` `op` goes from `opportunity` to `goal`. Both are rectangles, so allow the morph; fill and label tween.
6. **`hints.morphFrom[newId] = oldId`** says "the new Element is the continuation of that old one". The old id exits as part of the morph (no separate exit), the new id enters at the old geometry. Same effect as PowerPoint `!!name` and Manim `key_map`. Needed when a box is replaced by a differently shaped Element under a new id.
7. **Groups and parents.** `parent` is containment. A child's x, y are absolute canvas coordinates (not relative), so a moved parent does not silently move children. Declaring a parent that moves requires listing the children's new positions in the same Keyframe, or `follow: true` (then children get the parent's delta added at compile time). Opacity of a parent multiplies children (group opacity). Exit of a parent exits its children in the same window unless a child is also in the next Keyframe with a different `parent` (reparenting = update with no visual jump).
8. **Links are Elements.** A link shares the id namespace of shapes; its `from` and `to` name shape Elements of the same Scene. A link is only visible while both endpoints exist; the compiler errors if a link stays in a Keyframe where an endpoint is missing. The link's route is recomputed for each Keyframe (section 5) and tweened (section 4.6).
9. **Order of declaration** is irrelevant for identity. It is used only to order `stagger: by: "declaration"` and ties in z.

### 3.3 Shape morph

- `ShapeState.path` holds the outline as an SVG path. For built-in kinds, `geometry.ts` gets a function `outline(kind, w, h): string` (rect, rounded rect, ellipse, polygon kinds already drawn in `Shape`). Only kinds with an outline can morph.
- `interpolatePath` semantics first, from `d3-interpolate-path` in the core (`@remotion/paths` imports `remotion/no-react`, so it cannot be in the core; its `interpolatePath` stems from `d3-interpolate-path`, 2.2). The rect-to-ellipse and rect-to-triangle results below were measured with `@remotion/paths` `interpolatePath` [verified]; re-run them against `d3-interpolate-path` when the core is built [INFERENCE: same output]. Rect to ellipse worked but the middle frame was lopsided (`M -100 -25 C -100 -38.5 -27.5 -50 0 -50 ...`). Rect to triangle gave `M -50 -50 L 75 -25 L 100 50 L -100 50 Z`.
- When the golden-frame review shows a bad middle, set `morphWith: "flubber"` on that element. Do not depend on flubber globally.

### 3.4 Deck-ready Story (a Deck Rendering comes later)

A Deck is a Rendering the speaker steps through Beat by Beat, with the Lines as speaker notes. It is not built now (section 10, item 7), but the Story format must not rule it out. A reveal.js Deck maps onto the model like this (the reveal.js facts are [verified] in 2.5 and 2.6):

| Story | reveal.js Deck | Constraint on the Story format |
|---|---|---|
| Scene | a run of `data-auto-animate` slides; a restart (`autoAnimateRestart` in `@revealjs/react`) or a plain slide at a Scene boundary | Identity is per Scene (3.2 rule 1), which matches restart semantics. |
| Beat | one slide (or one fragment step) | A Keyframe is a full state, so every Beat can stand alone as a slide. The `beat` sugar always expands to full Keyframes in the compiled Story. |
| Element id | `data-id` | Ids are stable strings within a Scene and unique across shapes and links. |
| Keyframe geometry | absolutely positioned elements at 1920x1080 with reveal `width`/`height` set and scale exactly 1 | Positions are baked canvas coordinates (5.4), never layout read at render time. |
| Line | speaker notes | A Line is plain text first; word alignment is an extra that only the Video uses. |
| `at`, Hints, Cues | ignored, or mapped (`order`, delay to Auto-Animate options) | Optional, and they never change what a Keyframe shows. |
| Behaviour (continuous motion) | CSS animation, or omitted | Declared as data between Keyframes, never baked into a Keyframe. |

What a Deck loses, because Auto-Animate does not do it (2.6): exit animation (an Element only on the outgoing slide is gone at the first frame), link re-routing and path morph (SVG `d` is not in the default animated styles [INFERENCE]), and OKLCH colour (the browser tweens in sRGB, so text and fill can cross: 1.08:1 measured mid-tween). A Deck therefore guarantees contrast at Beat endpoints only; a Video guarantees it on every frame.

---

## 4. Identity diff, Plan and `frameState`

### 4.0 Compiler stages and the Plan

```
Story --resolve--> Story (full Keyframes, layout baked) --identity join--> Plan --schedule against Lines--> Timeline --> frameState(story, f) --> adapters
```

| Stage | Input | Output | Needs | Notes |
|---|---|---|---|---|
| resolve | Story with `beat` sugar and `graph` | the same Story with full Keyframes and baked layout (5) | the layout cache | So `x 420→1100` in a Plan can come from layout, not only from typed numbers |
| identity join | two consecutive Keyframes of one Scene, the Beat's Hints, Scene defaults, style tokens | **Plan**: per Beat, per Element, `enter`, `exit`, `update` or `replace`, with the changed properties | nothing else | Pure. No frames, no word times, no audio. Durations are known (a `fade, 12 f`), placement is not |
| schedule | Plan, aligned word times (the Lines), `order`/`align`/`stagger` Hints | **Timeline**: `Track[]` of `Segment`s in integer frames (4.1, 4.3, 4.4) | Whisper alignment | Pure, integer arithmetic, budget checks |
| sample | Timeline, frame | `FrameState` (4.2) | nothing | Pure; this is what adapters call |

The Plan is plain data in the core (`src/core/compile/plan.ts`, no React, no Remotion). It is the unit that golden tests and human review compare:

```ts
export interface PropChange { readonly prop: Animatable; readonly from: PropValue; readonly to: PropValue }

export type PlanOp =
  | { readonly op: "enter";   readonly id: ElementId; readonly how: EnterSpec }
  | { readonly op: "exit";    readonly id: ElementId; readonly how: ExitSpec }
  | { readonly op: "update";  readonly id: ElementId; readonly changes: readonly PropChange[] }
  | { readonly op: "replace"; readonly id: ElementId; readonly from: { readonly id: ElementId; readonly kind: string };
      readonly to: { readonly kind: string }; readonly how: "morph" | "exit-then-enter" };

export interface BeatPlan { readonly scene: string; readonly beat: string; readonly order: "exit-then-enter" | "together"; readonly ops: readonly PlanOp[] }
export type Plan = readonly BeatPlan[];
export const plan = (story: Story): Plan => /* identity join over every Scene */;
```

`how` is already resolved from `hints.enter/exit` of the Beat, then Scene defaults, then style tokens (3.2 rules 2 and 3), so a reviewer sees what will happen without reading three places. Elements present and unchanged in both Keyframes are not listed; the summary line counts them.

A **replace** is a change of Element kind (3.2 rule 5) or a `hints.morphFrom` continuation (rule 6). Its `how` is `morph` when a shape morph is allowed (3.3) and `exit-then-enter` otherwise. A morph across Element kinds is therefore a replace, not an update.

**`tsukuri plan <story>`** prints the Plan in a review form modelled on `terraform plan`: a preview of what will change, with `+` for enter, `-` for exit, `~` for update in place and `-/+` for replace (the symbols and wording are on the [`terraform plan` reference](https://developer.hashicorp.com/terraform/cli/commands/plan), verified 2026-10-28).

```
$ tsukuri plan 4em --scene s06
Scene s06
  Beat s06.3  (line s06.3, on "Increase retention")
    ~ g1   update   x 420→1100, fill goal→signal, label "Increase retention"→"Retain 90%"
    - opp  exit     fade, 12 f
    -/+ op replace  opportunity→goal, morph shape
    + c1   enter    pop, 12 f
  Beat s06.4  (line s06.4, on "Rules")
    + r1   enter    fade, 12 f
Plan: 2 to enter, 1 to exit, 1 to update, 1 to replace, 14 unchanged.
```

Rules for the review form: one line per op, ordered exit, replace, update, enter within a Beat; properties in `Animatable` order; strings in quotes; colours as token names when the value came from a token; durations as `N f`. `--json` prints the `Plan` itself. The command is read-only: it needs no audio, no alignment and no Chromium, and it reads only the Story and the layout cache. It fails (non-zero exit) on identity errors from 3.2 (a link whose endpoint is missing, an id that vanishes and returns within 30 frames, a duplicate). Today's entry point is `bun scripts/plan.ts`; `tsukuri plan` is the same code under the tool's name.

The Plan lands in step (b) of section 8: the Plan of the adapter-produced Beats shows what today's `reveal/hide/morph/focus` actions mean, before any pixel changes.

### 4.1 Two phases

```
tsukuri core (plain TypeScript: no react, no remotion, no DOM)                                  adapters (thin)
prepare (Bun, once)                                                  render (per frame)
  Story (Beats of Keyframes, Hints)
    -> resolve: expand sugar, bake layout (section 5)                  Timeline = PreparedStory (timeline.json, numbers only)
    -> identity join per Scene: Keyframe_i x Keyframe_{i+1}               -> frameState(story, f)  [pure] -> FrameState (plain data)
         = Plan (enter | exit | update | replace; no frames)                     -> Remotion adapter: <svg> from FrameState
    -> schedule the Plan against the Lines (word times) -> segments            -> HyperFrames frame source (exit ramp, not built)
         = Timeline                                                              -> Deck adapter (later, 3.4)
    -> checks (windows, contrast, collision)
    -> write timeline.json
```

`timeline.json` is the Timeline, typed `PreparedStory`: per Scene, a baked `Track[]` instead of `beats[].actions[]`. `PreparedAction` (`Prepared.ts:4`) is replaced.

```ts
export interface Segment {
  readonly prop: Animatable | "scale" | "dx" | "dy" | "dash" | "chars" | "labelOut" | "labelIn";
  readonly f0: Frames; readonly f1: Frames;          // absolute frames, f0 < f1
  readonly from: PropValue; readonly to: PropValue;  // baked; numbers, hex, path strings, polylines, strings
  readonly easing: EasingSpec;
  readonly interp: "number" | "oklch" | "path" | "route" | "text" | "step";
}
export interface Track {
  readonly id: ElementId;
  readonly type: ElementState["type"];               // "shape" | "link"
  readonly appearAt: Frames;                         // first frame the element is on screen
  readonly vanishAt: Frames;                         // first frame it is gone (Infinity if never)
  readonly base: ElementState;                       // state at appearAt, before segments
  readonly segments: Readonly<Partial<Record<Segment["prop"], readonly Segment[]>>>;   // sorted by f0
}
export interface PreparedScene {
  readonly id: string;
  readonly start: Frames; readonly end: Frames;      // span on the Story's frame axis; spans overlap while Scenes crossfade
  readonly tracks: readonly Track[];
  readonly camera: readonly Segment[];
}
export interface PreparedStory { readonly fps: number; readonly scenes: readonly PreparedScene[] }   // plain JSON: timeline.json
```

### 4.2 Pure render function

```ts
export interface SceneLayer { readonly scene: string; readonly items: readonly DrawItem[]; readonly camera: Camera }
export interface FrameState { readonly frame: Frames; readonly layers: readonly SceneLayer[] }   // plain data: numbers, strings, arrays

export const frameState = (story: PreparedStory, f: Frames): FrameState => ({
  frame: f,
  layers: story.scenes.filter((s) => f >= s.start && f < s.end).map((s) => sceneLayer(s, f)),   // one layer; two while Scenes crossfade
});

const sceneLayer = (scene: PreparedScene, f: Frames): SceneLayer => {
  const items: DrawItem[] = [];
  for (const track of scene.tracks) {
    if (f < track.appearAt || f >= track.vanishAt) continue;           // not on screen
    const p: Record<string, PropValue> = { ...track.base };
    for (const [prop, segs] of Object.entries(track.segments)) p[prop] = sampleProp(segs, f, p[prop]);
    items.push(toDrawItem(track, p));                                  // adds derived textColour, label opacities
  }
  items.sort((a, b) => a.z - b.z || a.order - b.order);
  return { scene: scene.id, items, camera: sampleCamera(scene, f) };
};

const sampleProp = (segs: readonly Segment[], f: number, base: PropValue): PropValue => {
  const i = lastIndexWhere(segs, (s) => s.f0 <= f);                    // binary search
  if (i < 0) return base;
  const s = segs[i]!;
  if (f >= s.f1) return s.to;                                          // settled: exact declared value
  const u = ease(s.easing, (f - s.f0) / (s.f1 - s.f0));
  return INTERP[s.interp](s.from, s.to, u);
};
```

Rules:
- Only `story` (plain JSON) and the frame number are inputs, and the result is plain data. No `Date`, no `Math.random`, no timers, no CSS `transition`/`animation` (Remotion states these break parallel rendering: [Flickering](https://www.remotion.dev/docs/flickering)).
- Scene spans overlap while two Scenes crossfade, so `layers` then has two entries in draw order. Compositing them (the opacity curve) is the adapter's job: Remotion keeps `TransitionSeries` `fade()` and draws only its own Scene's layer (`layers.find((l) => l.scene === id)`). `Diagram.tsx` shrinks to: `frameState(story, absoluteStart + useCurrentFrame())`, pick the layer, then draw. The `Shape` code keeps drawing, but reads `scale`, `dx`, `dash`, `chars` from the draw item instead of `reveal.how`.

### 4.3 Compile: the Plan, then place windows

```ts
// prepare time; B = the Scene's Beats, anchor[i] = frameOf(B[i].at) in integer frames
for (let i = 0; i + 1 < B.length; i++) {
  const prev = B[i].keyframe, next = B[i + 1].keyframe, h = B[i + 1].hints ?? {}, d = scene.defaults ?? {};
  const start = (h.align ?? d.align) === "end" ? anchor[i + 1] - span : anchor[i + 1];   // first frame of the window
  const ids = union(keys(prev.elements), keys(next.elements));
  const plan = ids.map((id) => classify(prev.elements[id], next.elements[id], h.morph?.[id], h.morphFrom?.[id]));   // the Plan of this Beat (4.0): enter | exit | update | replace | same; no frames yet
  // phase 1: exits
  const exitEnd = start + max(0, ...plan.filter(isExit).map((p) => durationOf(p, h, d)));
  // phase 2: enter and update start after exits if order === "exit-then-enter"
  const t0 = (h.order ?? d.order ?? "exit-then-enter") === "together" ? start : exitEnd;
  for (const p of plan) {
    const rank = staggerRank(p, plan, h);                                // from Hints.stagger or PropTiming.stagger
    for (const prop of changedProps(p)) {
      const timing = timingFor(p, prop, h, d);                           // h.enter/exit/update[id] > h scalars > d (Scene defaults) > style token
      const f0 = (p.kind === "exit" ? start : t0) + (timing.delay ?? 0) + rank * (timing.stagger?.each ?? 0);
      const f1 = f0 + max(1, timing.frames);
      pushSegment(p.id, prop, { f0, f1, from: fromValueAt(p, prop, f0), to: p.next[prop], easing, interp: interpFor(prop) });
    }
  }
  // budget: every f1 must be <= anchor[i + 2] (or Scene end). Else error, unless allowInterrupt.
}
```

`fromValueAt(p, prop, f0)` is the declared previous value, or, if an earlier segment on the same `(id, prop)` is still running at `f0`, the **sampled value of that segment at `f0`** (retarget). This bakes continuity: a later Beat never causes a jump.

### 4.4 Window placement against narration

- Anchor `a_{i+1}` (`anchor[i+1]`) = frame of the aligned word in the Line of Beat `i+1` (same formula as `prepare.ts:54`). The transition starts at the word and lasts `d` (`frames`). That is today's behaviour for `reveal`.
- `align: "end"` makes the motion arrive on the word (useful when the narrator says "moves to" after the move starts). Default is `start`, the same as today, so the adapter in step (b) changes no timing.
- The Keyframe of Beat `i` **holds** from its settle frame `a_i + D_i` until `a_{i+1}` (`D` = longest segment). Before a Scene's first Beat: the empty Scene, plus `scene.initial` elements (today's `initial`, `s12-links.ts:56`) which are Beat 0 with `enter: none`.
- Budget check (hard error): each window must end by the next anchor. If the narrator speaks two cue words 10 frames apart and the move needs 18 frames, the author shortens `frames`, moves an anchor, or sets `allowInterrupt: true`. The existing check `prepare.ts:86-88` (anchor inside the spoken paragraph) stays.
- The last Beat of a Scene must settle at least `sceneTail` before the Scene crossfade starts [INFERENCE: the crossfade overlap is `style.pacing.crossfade`, 0.5 s; the check must use `scene.durationInFrames - transitionFrames`].

#### 4.4.1 Anchors and offsets: when Cues and Hints happen (operator decision, 2026-10-28)

Time is declared by **anchoring to a lifecycle event, with an optional relative offset**. Manual timing is the exception, and absolute timestamps are a last resort. This applies to every timed thing an author can declare: Cue `at`, Hint `delay`/`align`, and Behaviour windows.

```ts
export type Anchor =
  | { readonly on: "word"; readonly phrase: string; readonly edge?: "start" | "end" }                  // a word in this Beat's Line
  | { readonly on: "beat"; readonly beat?: BeatId; readonly edge: "start" | "settle" | "end" }          // default beat: this one
  | { readonly on: "element"; readonly id: ElementId; readonly event: "enter" | "exit" | "update"; readonly edge: "start" | "end" }
  | { readonly on: "scene"; readonly edge: "start" | "end" }
  | { readonly on: "cue"; readonly id: string; readonly edge: "start" | "end" };                         // chain off another Cue
export type Offset = { readonly frames: number } | { readonly seconds: number } | { readonly fraction: number };  // fraction of the anchored window
export type When =
  | { readonly anchor: Anchor; readonly offset?: Offset }                       // preferred
  | { readonly absolute: Frames; readonly reason: string };                     // escape hatch: Scene-relative frame, reason required
```

Rules:
1. **Defaults, so most Cues need no `at`:** a `sound` Cue anchors to the start of the transition into its Beat; a `music` Cue to its Beat's start; a `pause` to the end of its Beat's Line. An Element's own sound (a "pop" when it enters) is `{ on: "element", id, event: "enter", edge: "start" }`.
2. **Offsets are relative and may be negative** (a whoosh that leads the move by 4 frames is `offset: { frames: -4 }`). `fraction` scales with the anchored window, so retiming the narration or the motion keeps the intent.
3. **The events are the compiler's own lifecycle**, named after established hooks: an Element's enter/exit/update start and end (Motion's `AnimatePresence`/`onExitComplete`, the Web Animations `finished` event), a Beat's start, settle and end (reveal.js `slidechanged`/`fragmentshown`), a Scene's start and end, and a word of the Line (the narration alignment that already drives `on:` phrases).
4. **Absolute timestamps are allowed but discouraged:** they are Scene-relative frames, never Story- or wall-clock time; each needs a `reason`; `tsukuri lint` warns on every one and the Plan lists them, so they stay visible in review.
5. **Resolution happens in the schedule stage**, after the Plan: anchors become frames from the word alignment and the placed windows. A chain of Cue anchors must be acyclic (compile error otherwise), and an anchor that resolves outside its Scene is an error.
6. **The Plan shows both forms**: `cue whoosh: element g1 enter start −4 f → frame 312`, so a reviewer sees the intent and its resolved time.


### 4.5 Interrupts and overlaps

| Situation | Rule |
|---|---|
| Two segments on the same `(id, prop)` overlap in time | The later `f0` wins. The earlier one is cut at the later `f0`. The later `from` is the earlier segment sampled at that frame. Needs `allowInterrupt: true` or `prepare` errors. |
| Segments on different props of one element overlap | Allowed. They are independent (x, fill and label run in parallel). |
| Exit window of an element still running when the same id returns | `prepare` error. Keep the element in the Keyframes instead. |
| Enter and exit of different elements in one transition | `order: "exit-then-enter"` (default): all exit windows end before any enter or update window starts. `together`: all start at the anchor. |
| Stagger pushes a window past the budget | Error with the offending id and frame count. No silent compression. |
| Camera | `camera` is an `Animatable`; its segment obeys the same rules. Today it snaps (`Diagram.tsx:131`). |

### 4.6 Per-prop interpolators

| Prop | Interpolator | Notes |
|---|---|---|
| `x, y, w, h`, `ring` | `from + (to - from) * u` | Position eased `ease-in-out`. Overshoot allowed for position and size only. |
| `opacity` | same, `u` clamped to 0..1 | Monotone. Group opacity applies to fill, stroke and text together. |
| `fill, stroke, textColour` | culori `interpolate([from, to], "oklch")(u)` then `toGamut("rgb", "oklch")` then `formatHex` | Hue takes the short arc: red `#FF6B6B` to blue `#6FA0FF` gave hues 23, -37, -97 [verified]. Achromatic ends (white) take the other end's hue (white to `#7A64A8` stayed at h=298) [verified]. Mid-colour out of gamut example: lime to magenta gives `#ff6100` clipped but `#ff9635` gamut-mapped; always map. Output is quantised to 8 bit, so equal inputs give equal output. |
| `textColour` omitted | `inkFor(effective fill at f)` (section 6.4) | Derived, not tweened. A flip between the two inks happens on one frame; the check in 6.3 keeps contrast at the flip. |
| `path` | `interpolatePath(u, a, b)` from `d3-interpolate-path`; `morphWith: "flubber"` uses `flubber.interpolate(a, b)` built once per pair | Both give the exact target at `u = 1` [verified for the Remotion and flubber versions; re-check for `d3-interpolate-path`]. |
| `route` (link polyline) | Resample both polylines to `M = max(n_a, n_b)` points by arc length, then lerp point by point | Link windows copy the windows of their two endpoint shapes, so ends stay on borders. Test: max gap between route end and shape border in any in-between frame is at most 2 px. If a tween cuts through a box (collision test, 5.5), set `hints.update[linkId]: { route: { mode: "redraw" } }`: old route un-draws, then new route draws. |
| `label` | Sequential crossfade: `labelOut` 1 to 0 over `outFrames`, then `labelIn` 0 to 1 over `inFrames`, `gap` frames between (default 0) | Text is never blended. The two label opacities never overlap in time (section 8.4). `mode: "type"` uses `floor(age / framesPerChar)`. |
| `z`, `kind` | `step` at `f0` (or `f0` of the shape morph midpoint) | Discrete. |
| enter `pop` | `scale` segment `from..1`, opacity unchanged | Same as today (`:86`). |
| enter `draw` | `dash` segment `1 -> 0` on `pathLength=1` | Works for links today (`:106`). Extend to outlines of boxes and boundaries (fixes `s14` scope). |
| camera | translate and zoom lerp; zoom interpolated in log space [INFERENCE: choice to avoid fast-then-slow zoom] | |

### 4.7 Determinism guarantees and tests

Guarantees:
1. `frameState` is a function of `(PreparedStory, f)` only. `PreparedStory` is plain JSON and the result is plain data (no functions, class instances or React elements), so any adapter can render it.
2. All time placement is integer-frame arithmetic done at prepare.
3. All outputs are quantised: numbers to 1/1000 px, colours to 8-bit hex. This hides float differences across machines [INFERENCE that differences could appear; V8's maths is the same engine on both sides of the pipeline].
4. ELK output is stripped of `$H` and cached by hash (section 5.4).
5. `prepare` runs the compile twice and fails if the JSON differs (idea from Reframe's `lint`: "compiles the scene twice and flags any IR that differs").

Property tests with [fast-check](https://github.com/dubzzz/fast-check) (dev dependency) and `bun test`:

| ID | Property | How |
|---|---|---|
| P1 | **Endpoints exact.** For each Keyframe K_i whose windows settle before the next anchor, `frameState(a_i + D_i)` equals K_i's declared state (after quantisation), for every Element. | Random Keyframe pairs from a generator. |
| P2 | **Monotone progress.** For `linear` and non-overshoot easings, each numeric prop moves monotonically from `from` to `to`. `u(f)` is non-decreasing for all easings. For springs, overshoot is bounded and the last frame equals `to`. | Per segment, all frames. |
| P3 | **Idempotence and order independence.** `frameState(s, f)` equals itself on a second call, and equals the result when frames are visited in a shuffled order (Remotion criterion 2: "not rely on frames being rendered in order"). `compile(compile-input)` twice gives equal JSON. | Shuffle frames. |
| P4 | **Continuity at interrupts.** At a retarget frame, `abs(v(f0) - v(f0 - 1))` is at most the per-frame max of the old segment. | Interrupting pairs. |
| P5 | **Identity.** `tracks` ids equal the union of all Keyframe ids in the Scene; each track has one contiguous visible interval unless `reenter` is declared; links never visible without both endpoints. | Property over random graphs. |
| P6 | **Label exclusion.** For one element, `labelOut.f1 <= labelIn.f0`. In `exit-then-enter`, every exit `f1` is at most every enter `f0`. | Section 8.4. |
| P7 | **Contrast.** Section 6 on every integer frame. | |
| P8 | **Geometry.** Every element box lies inside the canvas; non-exempt boxes and labels lie inside the safe box; no link segment crosses a non-endpoint box in any sampled frame (reuse `segmentIntersects` from `scripts/contrast.ts`). | |
| P9 | **Layout determinism.** Same graph and options give equal geometry after removing `$H`. | Run twice, Node. |
| P10 | **Core purity.** No file under `src/core/` imports `react`, `react-dom`, `remotion`, `@remotion/*` or `playwright`, or uses `document`/`window`; `frame-state.ts` imports nothing from `compile/` and not `elkjs`; a `FrameState` survives a `JSON.stringify`/`JSON.parse` round trip unchanged. | Static import scan plus a round-trip test under `bun test`. |
| P11 | **Plan purity and completeness.** `plan(story)` twice gives equal JSON; a Plan holds no frame numbers and no word times; every Element id in either Keyframe appears in exactly one op or in the unchanged count; a `replace` appears iff the kind changed or a `morphFrom` applies. | Property over random Keyframe pairs; Plan golden. |

Golden tests:
- **Plan golden (primary, structural).** The review text and the `--json` form of `plan(story)` for every Scene, checked in. A change of behaviour shows up as a readable diff of ops before any frame is computed, and it is what a human reviews.
- **Numeric golden (primary).** JSON snapshot of `frameState` at `a_i - 1`, `a_i`, mid-window, `end`, `a_{i+1} - 1` for each keyframe. Cheap, exact, reviewable in a diff.
- **Pixel golden (secondary).** `remotion still` for 2 to 3 frames per scene with the Chromium binary pinned (`CHROMIUM_PATH` as in `README.md`). Compare with a ratio threshold; same machine class only. Use for the migration steps (section 8).

---

## 5. Layout per keyframe

### 5.1 Graph declaration

A Keyframe may carry a `graph` instead of hand-typed x, y. It uses the same ids as the Scene's Elements. ELK calls shapes nodes and links edges; the model calls both Elements, and `graph.links` below are link Elements.

```ts
export interface GraphSpec {
  readonly direction?: "DOWN" | "RIGHT";
  readonly mode: "union" | "per-keyframe" | "manual";      // 5.3
  readonly nodes: readonly {
    readonly id: ElementId;
    readonly size?: readonly [w: number, h: number];        // default: geometry.ts defaultSize or explicit El.size
    readonly pin?: Pt;                                      // 5.2
    readonly layer?: number;                                // ELK layer constraint (rank hint)
    readonly group?: ElementId;                             // compound node (boundary, viewBox)
    readonly ports?: readonly { readonly id: string; readonly side: "N" | "E" | "S" | "W" }[];
  }[];
  readonly links: readonly { readonly id: ElementId; readonly from: ElementId; readonly to: ElementId;
    readonly fromPort?: string; readonly toPort?: string; readonly label?: string }[];
}
```

Authoring looks like Mermaid (`A --> B`), but typed. [Mermaid](https://mermaid.js.org/config/layouts.html) itself bundles ELK since v12.0.0, which shows ELK is the practical choice for node-and-edge text diagrams.

Node sizes: `El.size` or `defaultSize` (`geometry.ts:4`). The render-time `Shape` grows a box to fit wrapped text using `measureText` (`Diagram.tsx:30` region; `geometry.ts:28 wrapLabel`). `@remotion/layout-utils` measures in the browser after fonts load (`Root.tsx:46` comment). Bun has no DOM, so prepare cannot call it [INFERENCE]. Rule: declared `size` must already fit. A check in the render environment (Remotion Studio or a `remotion still`) asserts `grownHeight <= declaredHeight` for every element; a failure means "enlarge `size` and re-run layout". This keeps layout and render consistent.

### 5.2 ELK pass at prepare time

New script `scripts/layout.ts`, called by `prepare.ts` before the diff. Fixed options:

| Option | Value | Why |
|---|---|---|
| `elk.algorithm` | `layered` ([doc](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)) | Arranges edges mostly in one direction; orthogonal routing; ports. |
| `elk.randomSeed` | `1` | The [option](https://eclipse.dev/elk/reference/options/org-eclipse-elk-randomSeed.html) says seed `0` is chosen "pseudo-randomly (e.g. from the system time)". Never use 0. |
| `elk.layered.considerModelOrder.strategy` | `NODES_AND_EDGES` | [Preserves model order](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-strategy.html) "if this does not lead to additional edge crossings". Declaration order becomes a tie-break. |
| `elk.edgeRouting` | `ORTHOGONAL` | [Edge routing](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html). Matches the current straight and via-point look. |
| `elk.portConstraints` | `FIXED_SIDE` on nodes that declare ports | [Port constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html). Test result: south port on `a`, north port on `b` gave a straight vertical edge [verified]. |
| `elk.hierarchyHandling` | `INCLUDE_CHILDREN` | [Compound nodes](https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html) in one run. |
| `elk.edgeLabels.placement`, `elk.spacing.edgeLabel` | `CENTER`, `8`; edge labels declared with `width`/`height` of the link pill | ELK returns label x and y [verified]. Pill size comes from the formula in `LinkShape` (`max(116, len * 13.2 + 20)` by 36). |
| `elk.spacing.nodeNode`, `elk.spacing.edgeNode`, `elk.layered.spacing.*` | fixed numbers in `style.ts` | Part of the cache key. |
| `elk.interactive`, `elk.layered.crossingMinimization.semiInteractive`, `elk.layered.nodePlacement.strategy`, `elk.layered.layering.strategy` | `true`, `true`, `INTERACTIVE`, `INTERACTIVE` in `per-keyframe` mode, with `elk.position` set from the previous keyframe | [Interactive](https://eclipse.dev/elk/reference/options/org-eclipse-elk-interactive.html): "algorithms try to modify the current layout as little as possible". [Semi-interactive](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-semiInteractive.html) keeps the in-layer order. In my test this kept all five remaining nodes in place after removing one (without it, goal x moved 242 to 122) [verified]. I did not read the docs for the `layering.strategy` value; I only ran it [INFERENCE for semantics]. |

Engine notes [verified]:
- Under Node 24, `new ELK()` from `elkjs` works. Under Bun 1.3.13 it throws (`_Worker is not a constructor`) because of the fake-worker path. This worked under Bun: `import ELK from "elkjs/lib/elk-api.js"; new ELK({ workerUrl: "./node_modules/elkjs/lib/elk-worker.min.js" })`. Run layout in that mode, or spawn `node`.
- Strip `$H` from the result before hashing or comparing (GWT internal hash; changed between runs while all x, y stayed equal).

Pins. Three levels, from soft to hard:
1. `pin` in `union`/`per-keyframe` mode sets `elk.position` plus interactive options (soft: ELK may still shift within its layer).
2. `mode: "manual"` uses ELK's `fixed` algorithm: positions stay as given; edges get no sections, so routing is done by our own router (a straight or orthogonal polyline from border to border, like `pointOnBorder` plus `via` today) [verified: with `elk.algorithm: fixed` the nodes kept x=100,y=50 and 400,300 and the edge had no sections].
3. Hard pin of a single node inside a laid-out graph: override x, y after layout, then re-route the edges that touch it with our own router and run the collision check (5.5). Use sparingly.

### 5.3 Stability across keyframes

| Mode | What it does | Use for |
|---|---|---|
| `union` (default when elements appear one by one) | Lay out the union of all shapes and links that ever appear in the Scene once. A Keyframe shows a subset at those positions. Nothing moves unless a Keyframe says so. | s06 (goal tree appears piece by piece), s12 (map is stable while links draw), s14. Gaps for not-yet-visible nodes are intended. |
| `per-keyframe` | Lay out each Keyframe's graph. Interactive options plus the previous Keyframe's positions keep unchanged nodes in place. Changed nodes move; the engine tweens x, y. | s09.6 (process "opens" into three steps): real movement is the point. |
| `manual` | Positions as typed (today's behaviour). | Illustrations (s01-s05) and any scene the operator hand-tuned. |

### 5.4 Bake

```
generated/<id>/layout.json    cache: key = sha256(canonical(graph) + options + elkjs version + sizes)
                              value = { shapes: {id: {x, y}}, links: {id: {route: Pt[], labelAt: Pt}} }
```

Steps: ELK returns top-left x, y relative to the parent. Convert to centres (`El.at` is the centre). Link route = `[startPoint, ...bendPoints, endPoint]` of each section. Translate the whole graph so its bounding box is centred in the safe box `[120,130,1800,870]` (1680 by 740). If the box is larger than the safe box, **fail**; never scale, because the style rule forbids shrinking text (`style.ts` layout rule "never shrink text to force fit"). Write the numbers into `Keyframe.elements[*]`: `x/y/w/h` on shapes, `route/labelAt` on links. After this, `timeline.json` has only numbers: render never imports `elkjs`, so the 1.6 MB bundle stays out of the Remotion bundle and no async work happens during render.

### 5.5 Route, label and safe-area checks (build time, every keyframe and sampled in-betweens)

```
for each Keyframe and each in-between frame (step 1 frame, same sampler as section 6):
  for each link segment s, for each element box B (expanded by 6 px), B not an endpoint of the link:
      fail if segmentIntersects(s, B)                 // function already in scripts/contrast.ts
  for each label box L:
      fail if L is not inside [120,130,1800,870]
      fail if L overlaps any element box that is not its own link's endpoint
      fail if L overlaps another visible label (opacity product > 0)
  for each element box: fail if it leaves the canvas; warn if it leaves the safe box outside an exempt window
```

Caption box `[160,900,1760,1030]` lies below the safe box (y 870 to 900 is the gap). The chip at top-left is at y below 102, above the safe top 130. [verified from `style.ts:6` and `Diagram.tsx` chip style.]

---

## 6. Accessibility by construction

Standard: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (W3C Recommendation, 12 December 2024) [verified: header of the document]. The style sheet already states: "Text contrast is at least 4.5:1; essential graphical objects at least 3:1" (`style.ts` accessibility rules). Existing code: `src/core/contrast.ts` (`contrastRatio`, `composite`, `inkFor`, `largeText`, `maximumSafeOpacity`, `effectiveTextBackground`) and `scripts/contrast.ts`. The engine reuses them.

### 6.1 Definitions [verified in the WCAG 2.2 text]

- Relative luminance: `L = 0.2126 R + 0.7152 G + 0.0722 B`, where each channel is `c/12.92` if `c <= 0.04045`, else `((c + 0.055) / 1.055)^2.4`, with `c` = sRGB channel / 255. (The older 0.03928 threshold was replaced in 2021; no practical effect.)
- Contrast ratio: `(L1 + 0.05) / (L2 + 0.05)`, `L1` the lighter. See [SC 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum).
- Thresholds: text 4.5:1; "large-scale" text 3:1. [SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum). Large scale = at least 18 point, or 14 point bold ([definition](https://www.w3.org/TR/WCAG22/#dfn-large-scale)). At 96 dpi that is 24 px, or 18.66 px bold; `largeText()` in `contrast.ts` uses exactly this.
- Non-text: [SC 1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast): graphical objects needed to understand content, and UI components, need 3:1 against adjacent colours.

### 6.2 Effective background and compositing

For text of element `E` at frame `f`:

```
B  = canvas colour (night; sheetLight when the scene has a board, as Diagram.tsx hasBoard)
for ancestor A in chain root..parent(E), then non-parent elements below E in z whose box contains the text box:
    B = composite(fill_A(f), B, opacity_A(f))              // painter's algorithm, using the interpolated values at frame f
F' = composite(fill_E(f), B, opacity_E(f))                 // element fill after group opacity
T' = composite(textColour_E(f), B, opacity_E(f))           // text is in the same group, so same alpha over the same B
ratio = contrastRatio(T', F')                              // text vs its own fill
```

`composite(fg, bg, a) = a * fg + (1 - a) * bg` per sRGB channel (the existing `composite()`). Text over no fill (labels on a sheet, link labels) uses `F' = B`. For non-text marks: `contrastRatio(stroke', B)` for strokes, arrows, rings, with the same alpha rule. For a text box that touches several layers, test the box centre and its four corners and take the worst.

Checked pair list per element: text vs fill (4.5 or 3 if large); stroke vs fill and vs `B` (3); link stroke vs `B` (3); link label text vs its pill (4.5); signal ring vs `B` (3).

### 6.3 Why endpoints are not enough [measured in the scratch install with culori 4.0.2, `wcagContrast`]

| Case | Endpoints | Worst in-between | Cause |
|---|---|---|---|
| Text `#F4F1E8` to `#101820` while its background goes `#0E1B2E` to `#F4F1E8` (OKLCH, 30 steps) | 15.30:1 and 15.84:1 | **1.04:1 at t = 0.50** | The two colours cross. Both ends are fine; the middle is unreadable. |
| Fill `#237023` (white text, 6.15:1) to `#9BEA9B` (dark text, 13.26:1), ink chosen per frame as the better of white and `#101010`, as in `s06.8` | 6.15 and 13.26 | **4.45:1 at t = 0.20** (fill `#3C873B`) | Ink flips; the mid fill is a medium green. Fails 4.5 by 0.05. With fixed white text it falls to 1.43:1. |
| Hypothetical whole-group fade: goal text `#101010` on `#9BEA9B` over the sheet, opacity 1.0, 0.8, 0.6, 0.5, 0.3 | 13.26 at 1.0 | 7.91, 4.12, 3.06, **1.83** | Blending both text and fill toward the sheet reduces their contrast. The current renderer keeps label ink full-opacity and dims shape bodies separately; the engine must preserve that or calculate a safe group opacity. Minimum opacity for 4.5:1 is 0.628 (goal), 0.947 (role: white on `#7A64A8`), 0.645 (link label pill); for 3:1 it is 0.493, 0.726, 0.500. |
| Best-of-two inks (`#F4F1E8`, `#101820`) over all greys | n/a | **4.00:1 at grey 119** | With these tokens no grey fill can pass 4.5:1. A fill tween must not pass through that band, or the ink tokens must change. |
| Previous link colours on the light sheet (`#6FA0FF` supports, `#FF6B6B` hinders) | 2.28:1 and 2.46:1 before the contrast fix | Current light-sheet tokens: `#3569B8` supports, `#B4232F` hinders, `#46566C` inter-model | The renderer now selects `supportOnLight`, `hinderOnLight` and `interlinkOnLight`; measured contrast against `sheetLight` is 4.81:1, 5.77:1 and 6.62:1. `scripts/contrast.ts` checks these pairs for regression. |

### 6.4 `inkFor(bg)`: a violating pair cannot be declared

- `ShapeState.textColour` is optional. If omitted, the engine uses `inkFor(F'(f), style)` (`contrast.ts`) on every frame. Authors cannot declare "white text on pale fill" by accident.
- If `textColour` is declared, `prepare` checks it against the fill at every Keyframe and every in-between frame, with the same rule as for derived ink.
- Fills come from tokens (`notationFills`, palette), so a new fill is a token edit that `scripts/contrast.ts` already verifies (`report(...text/fill, 4.5)`).
- Because of the 4.00:1 floor above, tween paths between two fills are accepted only if the check passes on all frames. If not, the author picks another path: a `morph` through a darker or lighter fill (`update.fill.easing`), or `mode: "swap"` (a cut at the window start).

### 6.5 In-between check

Gate = every integer frame of every segment window, for every on-screen text and mark. This is exact for what is rendered, because frames are integers.

- Cost: about 13 572 frames (`README.md` frame ranges) times about 20 items times a few contrast pairs: well under a million ratio evaluations, a few seconds in Bun [INFERENCE on speed].
- Fast mode for the editor loop: step of 3 frames. Because luminance changes smoothly with `u`, a bound `min_true >= min_sampled - K * step` holds with `K` from the largest per-frame change of any channel; set `K` empirically by comparing fast mode with the exhaustive mode on the 4EM timeline, and require a margin (start at 0.25:1) [INFERENCE: margin value is a starting guess]. The exhaustive run is the CI gate.
- Analytic shortcut before sampling (skip a segment if it is provably safe): opacity-only change with text and fill unchanged, both endpoints pass, and the pair is a blend toward the same `B`: the ratio falls monotonically as opacity falls in all samples I ran, so the worst frame is the lowest-opacity frame. Not proven in general; keep the sampled check as the authority [INFERENCE].
- Colour tween: no closed form. Colours cross, so check the sampled frames.

**Exempt windows.** WCAG 2.2 has no exception for fades. Our policy, stricter than "ignore animation" and looser than "never fade":
- A text or mark may fall below its threshold only inside a declared `enter` or `exit` segment of at most `exemptWindowMax` frames (12 frames = 0.4 s at 30 fps) [policy, question 5].
- At the window edge on the visible side, it must pass. A 12-frame linear fade to the 4.5:1 threshold of a link pill (opacity 0.645) is below the threshold on 8 of 13 frames [verified by count]; this is allowed only because it is a declared enter.
- `update` segments (dimming, recolour, move) are never exempt. Focus dimming therefore needs a floor opacity per element from `maximumSafeOpacity(fg, bg, 3, preferred)` instead of the fixed 0.3 (question 1).
- Exempt windows are listed in the contrast report so a reviewer sees them.

**Flashing.** `style.ts` has "No flashing above three luminance changes per second" citing [WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold). The sampler also computes mean-luminance change between frames and counts reversals per second.

### 6.6 APCA: considered, not used

- WCAG 2.2 (a W3C Recommendation) defines conformance by the ratio above; claims must use it.
- APCA was an exploratory candidate for WCAG 3. Adrian Roselli reports it was pulled from the July 2023 WCAG 3 draft ([post, April 2026](http://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)); the APCA site calls it ["the candidate contrast method for the future WCAG 3" in public beta](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html). The two sources disagree on status; neither calls it final.
- APCA output depends on text polarity, font size and weight lookups, so the check would need per-text metrics.
- culori ships WCAG contrast (`wcagContrast`), not APCA [verified in `src/index.js`].
- If wanted later, add APCA as an advisory warning only. It cannot replace the ratio gate.

---

## 7. Dependencies and licences

Verified on 2026-10-28 from the npm registry (`license` field of the latest version), the repository `LICENSE` file, and installed `package.json` files in a scratch directory. "Phase": R = in the Remotion bundle at render; P = prepare only; T = tests only.

| Package | Version | SPDX / licence as found | Restriction | Phase | Flag |
|---|---|---|---|---|---|
| `remotion` | 4.0.539 (in repo) | npm: `SEE LICENSE IN LICENSE.md`. [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) (same text as `node_modules/remotion/LICENSE.md`; copyright 2026 Remotion). Not an SPDX id. | **Free licence** for: an individual; a for-profit organisation with up to 3 employees; a non-profit or not-for-profit organisation; evaluation without commercial use. Allowed: use commercially or not "for the purpose of creating videos and images", and modify it for your own use. Disallowed: copy or modify Remotion "for the purpose of selling, renting, licensing, relicensing, or sublicensing your own derivate". Larger for-profit organisations need a [Company License](https://www.remotion.pro/license). The file says Remotion 5.0 will change the licence slightly ([PR 3750](https://github.com/remotion-dev/remotion/pull/3750), not read). | R | **Not permissive.** Eligibility rule. Repo README states personal study use. |
| `@remotion/paths` | 4.0.539 | `MIT` (npm, installed `package.json`, repo `packages/paths`) | none | adapter only (link label anchors, draw-on) | **Not in the core.** Its installed `dist/esm/index.mjs` imports `remotion/no-react`, which P10 forbids [verified 2026-10-28]. |
| `d3-interpolate-path` | 2.3.0 | `BSD-3-Clause` (npm registry), zero dependencies | none | core, path morph | Remotion's `interpolatePath` stems from it (2.2). [INFERENCE: same morphs as Remotion's; not run here.] |
| `@remotion/transitions` | 4.0.539 (in repo) | npm and installed `package.json`: `UNLICENSED`. The [docs page](https://www.remotion.dev/docs/transitions) says "Remotion License". The installed package has no `LICENSE.md` (my directory listing found none). | Treat as the Remotion License. | R | **Flag:** metadata and docs disagree. Already used at `Root.tsx:8`. |
| `@remotion/layout-utils` | 4.0.539 (in repo) | `MIT` | none | R | no |
| `culori` | 4.0.2 | `MIT` (npm, repo `LICENSE`: "Copyright (c) 2018 Dan Burzo") | none; zero dependencies | R and P | no |
| `elkjs` | 0.12.0 | npm: `EPL-2.0 OR GPL-3.0-or-later`. Repo `LICENSE.md` is the EPL-2.0 text. | EPL-2.0 is weak copyleft: if we distribute modified ELK files, we must share those source files. We use it unmodified, at prepare time only, and ship only its numeric output. Choose the EPL-2.0 option. This is not legal advice [INFERENCE on the effect of using output]. | P | **Flag: not permissive.** Operator should accept (question 3). |
| `@dagrejs/dagre` | 3.1.3 | `MIT` (npm; README says MIT). Dependency `@dagrejs/graphlib` 4.0.6 `MIT`. | none | P (fallback) | no |
| `dagre` (old name) | 0.8.5 (2019) | `MIT` | Stale; do not use. | none | note |
| `flubber` (optional) | 0.4.2 | `MIT`. Its dependencies as installed: `d3-array` 1.2.4 `BSD-3-Clause`, `d3-polygon` 1.0.6 `BSD-3-Clause`, `earcut` 2.2.4 `ISC`, `svg-path-properties` 0.2.2 `ISC`, `svgpath` 2.6.0 `MIT`, `topojson-client` 3.1.0 `ISC`. | none | core (only if enabled) | Unmaintained (2018). Opt-in. |
| `d3-interpolate` | 3.0.1 | `ISC` | none | not used | Not recommended. |
| `fast-check` | 4.10.2 | `MIT` | none | T | no |
| `bun:test` | bundled with Bun | n/a | n/a | T | no |
| `@remotion/gsap`, `gsap` | 4.0.539 / 3.15.0 | `MIT` / GSAP "no charge" Standard License | GSAP: competitor clause (section 2.1) | not used | Not recommended. |
| `reframe-video` | 0.6.49 | `MIT` file plus asset note; CLA | | not used | Not adopted. |
| `reveal.js` | 6.0.2 (2026-09-10) | `MIT` (npm; GitHub licence API `MIT`; repo pushed 2026-09-30) | none | Deck Rendering (later) | Not the animator (2.5, 2.6); the candidate for the Deck Rendering (3.4). |
| `@revealjs/react` | 0.2.2 (2026-09-10) | `MIT` (npm). Peer deps: `react >=18`, `react-dom >=18`, `reveal.js >=5`. | none | Deck Rendering (later), optional | Version 0.x, [documented as new in 6.0.0](https://revealjs.com/react/). |
| `playwright` | 1.64.1 (2026-10-14) | `Apache-2.0` (npm) | Patent grant and notice terms of Apache-2.0. | only for a browser seek-capture check of the Deck | Not needed for the Video path. |
| `hyperframes` | 0.8.210 (2026-10-28) | `Apache-2.0` (npm `hyperframes`; `@hyperframes/core` has an empty npm licence field) | none | exit ramp only (2.6) | Not installed. 0.x with 210 releases since 2026-03-10: expect API churn. |
| `@remotion/player` | 4.0.539 (installed) | `SEE LICENSE IN LICENSE.md` (Remotion License, installed `package.json`) | Same as `remotion`. | live preview, see 2.5 | Same flag as `remotion`. |

Recommended additions to `package.json`: `culori`, `d3-interpolate-path` (core), `elkjs` (prepare), `fast-check` (dev). Optional: `flubber`. `@remotion/paths` only inside the Remotion adapter, if at all. The core writes its own easing (cubic, quad, back, step, bezier) and a closed-form damped spring normalised to the segment, instead of importing Remotion's `interpolate`, `Easing` and `spring` (2.2 note). No `d3-interpolate`, no `dagre` unless ELK is rejected. I did not run `bun install` in the repo.
Deck-only additions (later, 3.4): `reveal.js`, `@revealjs/react`; `playwright` only for a browser seek-capture check. `@remotion/player` only for a live preview. `hyperframes` is the exit ramp (2.6) and is not installed.

---

## 8. Migration path

Each step ships alone and keeps the video renderable. Steps (b) and (c) are the risky ones.

| Step | Work | Acceptance check | Risk |
|---|---|---|---|
| **a. Tokens and contrast module** | Exists in the working tree (untracked at time of writing): `src/core/contrast.ts`, `scripts/contrast.ts`, new palette tokens in `style.ts`. Add a `motionTokens` block (3.1). | `bun scripts/contrast.ts` exits 0. Fix or accept the link colours on the sheet (6.3). | Low. |
| **b. Adapter: actions to Beats** | New `src/core/story.ts` (types and the `beat` sugar) and `compileActions(scene): Beat[]`. Group actions with equal `startFrame` into one Beat. Replay the exact logic of `Diagram.tsx:119-135`: `reveal` adds the id with an enter Hint from `how` (pop 12, fade 12, slide 14, type 1.5 per char, draw 15 on links, **none** on elements to match today). `hide` = drop with `exit: none`. `morph` = `set` with `update: none`. `focus` = opacity 0.3 and ring with `update: none`. `camera` = a Keyframe field; `ripple` is a Behaviour in glossary terms and stays an effect field. Compiler outputs zero-duration "snap" segments where today snaps. | Test: for all 15 scenes and every frame, `frameState` visible set, morphed props, focus and camera equal the old `state` memo (extract it as a pure function and compare JSON). Pixel golden: 3 frames per scene (`startFrame - 1`, `+0`, `+15`, per action) with threshold 0 (same renderer path) then `bun scripts/verify.ts` on one scene draft. | Medium. The old memo has implicit rules (later `reveal` after `hide` revives the id; `morphs` merge). The test pins them. |
| **c. Replace per-action animation with `frameState`** | The Remotion adapter draws from `frameState(story, frame)`; `Shape` reads `scale/dx/dash/chars/labelOpacity` from the draw item. The core/adapter split (3.0) lands here: `frameState`, the compiler and the pure parts of `geometry.ts` move to `src/core/`; `@remotion/layout-utils` measuring and `Diagram.tsx` move to `src/adapters/remotion/`. `prepare.ts:52-54` writes `tracks` instead of `actions`; `Prepared.ts:4` changes. Keep adapter-produced Beats. | Pixel golden diff against step (b) renders: pop, fade, slide, draw, type frames equal within ratio 0.001 (SVG anti-aliasing can differ if transform composition changes: keep the same transform string order). P1 to P5 and P10 pass. `bun scripts/contrast.ts` still passes. | Medium. Floating order in `translate(...) scale(...)` can change pixels; keep the existing order. |
| **d. Author new Scenes as Beats** | Turn on new behaviour: element `draw`, exit fades, tweened morphs (`s06.3` label, `s06.8` kind), `order: "exit-then-enter"`, label swap. Start with `s14` and `s12` (8.3, 8.4). Switch `style.motion` text rules to the new tokens (replace "0.35 s spring" with the real numbers). | Numeric goldens reviewed by a human; contrast gate on all frames (P7); P6 label exclusion; draft render of the Scene (`scripts/render.ts draft`) viewed. Total Scene duration unchanged (windows fit the budget). | Medium: narrative timing. Exits add frames before enters; budgets may fail and need anchor edits. |
| **e. Graph layout for s06, s09, s12, s14** | `scripts/layout.ts` with the options in 5.2; `GraphSpec` per scene; `union` for s06/s12/s14, `per-keyframe` for s09.6. Bake to `layout.json`. Keep `manual` for scenes the operator tuned. | P8 geometry (routes avoid boxes, labels inside the safe box). P9 layout determinism (run twice). Visual review of each laid-out scene against the hand-placed version (the positions will differ; the operator signs off). Cache hit on second `prepare`. | High. ELK may place boxes worse than hand-tuned coordinates, and a layout change can break the narration's spatial story (`framework.ts` mirrors L2 p.5). Mitigate with `layer` hints and `pin`; allow `manual` per scene. |
| **f. Delete the old action path** | Remove `Action`, `When`-based builders `reveal/hide/focus/unfocus/morph/camera/ripple` from `types.ts:96-118` and `dsl.ts`, the `state` memo in `Diagram.tsx`, `PreparedAction`, and the action blocks in `prepare.ts`. Rewrite `emit.ts:64-112` (validation and `describeAction`) to describe Beats (`add/drop/set` lines per Beat). Keep `El` and `Link` as input types for the adapter-free sugar. | `bunx tsc --noEmit` (repo uses TypeScript `^7.0.2`). No references to `do:` actions (grep). `emit` output (`*.storyboard.md`, `*.srt`, which are Renderings of the Story) diff reviewed. Full `bun scripts/verify.ts` on the final MP4. | Low to medium. `emit.ts` is the surprise: it consumes actions for the storyboard document. |

### 8.1 Beat sugar

Authors rarely type a full Keyframe. The sugar keeps Scenes as short as today:

```ts
beat(id, at, { add?: (ElementId | { id: ElementId; enter?: EnterSpec })[], drop?: ElementId[],
               set?: Record<ElementId, Partial<ElementState>>, hints?: Hints })
```

The compiler expands `beat` to a full `Beat` by copying the previous Beat's Keyframe, removing `drop`, adding `add` from the Scene's `entities` (the `elements` array as it is today, each `El` converted by `fromEl`), and applying `set`. An `{ id, enter }` item in `add` is shorthand for `hints.enter[id]`. Full Keyframes are what the Identity diff and the tests use.

### 8.2 `focus` in the new model

`focus(ids)` becomes per-element `opacity` (dim token, with a contrast floor) and `ring: 1` on the listed ids, in the Keyframe where it is true. A `focus` is therefore a normal update segment (so it tweens and it is contrast-checked). `unfocus` is the next Beat with the dim removed.

### 8.3 Worked example: `s14` recap

Today (`s14-recap.ts:25-30`): 6 beats, 18 actions; `hide` removes five items in one frame (`:26`); `s14.7` hides twelve things and pops the title in the same frame (`:30`); the `scope` "draw" does nothing for an element.

As Beats (the element and link declarations in `elements`/`links` stay as they are; they become the Scene's `entities`; the narration paragraphs `s14.1`, `s14.3`, ... are the Lines that carry the Beats):

```ts
import { at, beat, fade, pop, draw } from "../../../core/story.ts";

const boxes = ["goal", "rule", "concept", "process", "actor", "tech"];
const links = ["l_goal_proc", "l_rule_proc", "l_proc_goal", "l_actor_proc", "l_proc_concept", "l_proc_tech"];

export const s14: Scene = {
  ...meta,                                          // id, title, chip, purpose, describe (unchanged)
  entities: { elements: [/* tag, scope, sheet, fac, de, ...frameworkBoxes(""), title */], links: recapLinks },
  defaults: { enter: pop(12), exit: fade(8), order: "exit-then-enter" },
  beats: [
    beat("b1",  at("s14.1", "Purpose"),                  { add: ["tag"] }),
    beat("b2",  at("s14.1", "scope"),                    { add: [{ id: "scope", enter: draw(15) }] }),   // real draw-on for the boundary outline
    beat("b3",  at("s14.1", "build"),                    { add: ["sheet"] }),
    beat("b4",  at("s14.1", "together"),                 { add: ["fac", "de"], hints: { stagger: 4 } }),
    beat("b5",  at("s14.3"),                             { drop: ["tag", "scope", "sheet", "fac", "de"] }),   // fade out, 8 frames
    beat("b6",  at("s14.3", "Goals Model"),              { add: ["goal"] }),
    beat("b7",  at("s14.3", "Business Rules Model"),     { add: ["rule"] }),
    beat("b8",  at("s14.3", "Concepts Model"),           { add: ["concept"] }),
    beat("b9",  at("s14.4", "Business Process Model"),   { add: ["process"] }),
    beat("b10", at("s14.4", "Actors and Resources Model"), { add: ["actor"] }),
    beat("b11", at("s14.5", "Technical Components"),     { add: ["tech"] }),
    beat("b12", at("s14.6"),                             { add: links.map((id) => ({ id, enter: draw(15) })), hints: { stagger: 4 } }),  // links draw one after another
    beat("b13", at("s14.7"),                             { drop: [...boxes, ...links], add: [{ id: "title", enter: pop(12) }] }),            // boxes and links fade out, THEN the title pops
  ],
};
```

What the compiler derives for `b13` (frames at 30 fps, anchor `a`):
- `boxes`, `links`: only in `b12` = exit. `exit` = `fade(8)` from the Scene defaults. Windows `[a, a + 8)`.
- `title`: only in `b13` = enter. `order: "exit-then-enter"` puts its window at `[a + 8, a + 20)`: `scale 0.84 to 1`.
- Settle frame `a + 20`. Budget: the title must settle before the Scene tail; `prepare` checks it against the Scene's frame span minus the crossfade.
- `s14.7` text is "4EM links the six submodels." (about 2 s of speech) so 20 frames (0.67 s) fits [INFERENCE: speech length from the 2.6 words/s pacing in `style.ts`].

For `b4` the `stagger: 4` hint shifts `de` four frames after `fac`.

### 8.4 Worked example: `s12` and the label crossfade rule

Operator rule: *outgoing labels finish fading before incoming labels appear.* This rule is not written anywhere in the repo: `grep` for "outgoing", "crossfade" and "finish fading" finds only the 0.5 s scene crossfade (`style.ts:4`, `Root.tsx:18`). [verified] It is expressed by two model features.

1. **Different elements, one transition.** `order: "exit-then-enter"` (the default in `defaults`): every exit window ends at or before the first enter or update window starts. In `s12.9` today the map hides and `orph` reveals in the same frame (`s12-links.ts:65`: `hide(..., {on:"A process"})`, `reveal("orph", {on:"A process"})`). As Beats:

```ts
beat("b9a",  at("s12.9", "A process"),   { drop: [...boxes, ...recapLinks], add: ["orph"] }),            // map fades 6 frames, then orph pops
beat("b9b",  at("s12.9", "or the goal"), { add: [{ id: "ghost", enter: fade(12) }] }),
beat("b9c",  at("s12.9", "missing"),     { add: [{ id: "orph_l", enter: draw(15) }] }),
beat("b10a", at("s12.10", "Ask"),        { drop: ["orph", "ghost", "orph_l"], add: ["goal", "concept", "actor"] }),
beat("b10b", at("s12.10", "what"),       { add: ["q1"] }),
```

   With `drop` exit `fade(6)`, the six map boxes and six links (and their pill labels, which follow their link's window) reach opacity 0 at `a + 6`. `orph` and its label start at `a + 6`. No old and new labels are visible together.

2. **Same element, text change.** Illustrative example (not in today's `s12` source): the `l_actor_proc` pill reads "performs" and later "performs / is responsible for" (the full text is in `framework.ts:23`; `s12-links.ts:53` overrides it to "performs").

```ts
beat("b5b", at("s12.5", "responsible"), { set: { l_actor_proc: { label: "performs / is responsible for" } } })
// default label update: { mode: "sequential", outFrames: 6, gap: 0, inFrames: 6 }
```

   Compiler output: `labelOut` 1 to 0 on `[a, a + 6)`, `labelIn` 0 to 1 on `[a + 6, a + 12)`. The pill width and `labelAt` are baked for the new text; the old text is drawn with the old pill until `labelOut` ends, then the pill tweens to the new width (a `w` segment from `a + 6`).

Tests in the model for this rule (P6): (i) `labelOut.f1 <= labelIn.f0`; (ii) for every frame, `max(opacityOld, opacityNew)` of the same element is at most 1 and `min` is 0 in the window after `labelOut.f1`; (iii) in a transition with `order: "exit-then-enter"`, `max(exit.f1) <= min(enter.f0)`. Contrast of text is checked on both label states per frame (6.2), and the 6-frame fade is an exempt window (at most 12 frames).

---

## 9. Open questions for the operator (max 6)

| # | Question | Recommended decision |
|---|---|---|
| 1 | Focus prefers 0.3 opacity for nonfocused shape bodies, but `safeTextElementOpacity` and the link-opacity floor raise it when needed for contrast. Is the remaining compromise (some shapes dim less; labels stay legible) acceptable? | Keep the per-element floors and focus ring; do not use 30% where it fails the text or 3:1 graphical-contrast threshold. |
| 2 | reveal.js spike, then R0+R3 versus R2? | Decided 2026-10-28: R0+R3, no spike (section 10, item 2). The `align` default (start at the word) is in 4.4. |
| 3 | Accept `elkjs` licence `EPL-2.0 OR GPL-3.0-or-later` for a prepare-time tool? Alternative is `@dagrejs/dagre` (MIT) with weaker routing and no interactive mode. | Accept ELK under EPL-2.0, prepare only, unmodified. Ship only baked numbers. Keep a `manual` mode so a scene never depends on layout. |
| 4 | Remotion's licence limits who may use it free (individual, up to 3 employees, non-profit, evaluation) and says 5.0 will change the terms. Is this project inside that eligibility for its whole life, including any hand-over to a team? | Confirm eligibility in writing; pin `remotion` and `@remotion/*` to one exact version; record the licence check in the repo. Re-read the 5.0 terms before upgrading. Also settle the `UNLICENSED` flag on `@remotion/transitions`. |
| 5 | Exempt window for fades: is 12 frames (0.4 s) of sub-threshold contrast acceptable during declared enter and exit only? | Yes, 12 frames, enter and exit only, listed in the contrast report. Anything longer or any update must pass on every frame. |
| 6 | Migrate pixel-identically first (snap morphs, no exits), or accept the new motion (exits, tweened morphs, label swap) in the same release? | Two releases. Steps (b) and (c) ship pixel-identical and are reviewed with goldens. Step (d) changes the look, scene by scene, starting with `s14` and `s12`, each with a human review of a draft render. |

## 10. Operator decisions (2026-10-28)

| # | Question | Decision |
|---|---|---|
| 1 | Focus dimming | **Legibility wins.** Dim non-focused shapes to 30% where their labels stay legible; a per-element floor dims less where they would fail, and the focus ring carries the emphasis. Every frame passes WCAG. |
| 2 | reveal.js spike, R0+R3 versus R2 | **Decided: R0+R3.** tsukuri is our own engine with reveal.js semantics as the spec (`data-id` identity, unmatched fade, restart groups, per-element overrides). The spike is not run. The prior-art survey (2.6) found no existing tool to adopt or build on. |
| 3 | Layout licence | **ELK at build time only**, under EPL-2.0, unmodified, in the prepare step; videos carry only computed positions. Keep the manual-position mode. |
| 4 | Remotion licence | **Pin, record and plan an exit.** Confirm individual / non-profit eligibility, pin one exact version, record the check in the repo, re-read the terms before any upgrade, and keep the engine core (diff, `frameState`, layout bake, contrast sampler) free of Remotion imports so the renderer can be swapped. |
| 5 | Sub-threshold contrast during fades | **12 frames, enter and exit only**, listed in the contrast report; every update passes on every frame. |
| 6 | Migration | **Two releases**: a pixel-identical port proven by golden frames, then the new motion scene by scene with a reviewed draft render. |
| 7 | Renderings beyond Video | **Video first, Deck later.** Design the Story so a reveal.js Deck renderer is possible (3.4: full-state Keyframes, stable Element ids per Scene, Hints and Cues optional and ignorable, Lines as plain text for speaker notes). Build nothing deck-specific until the Video path is done. |
| 8 | Engine boundary | **The core is plain TypeScript**: Identity diff, `frameState`, layout bake and contrast check, with no React, Remotion or DOM imports, enforced by a test (P10). Renderers are thin adapters: Remotion now, HyperFrames as the verified exit (2.6), Deck later. `frameState(story, frame)` returns plain data (3.0, 4.2). |
| 9 | Name | **tsukuri** (formerly the working name `reebeat`). |
| 10 | Compiler stages | **The Plan is a named stage**: Story, identity join, Plan, schedule against Lines, Timeline, `frameState`, adapters (4.0). `tsukuri plan <story>` prints the Plan for human review; the Plan is plain core data and is what golden tests and review compare. |
| 11 | Timing of Cues, Hints and Behaviours | **Anchor to lifecycle events with relative offsets** (4.4.1): word, Beat, Element enter/exit/update, Scene, or another Cue, each with a start/end edge, plus an optional offset in frames, seconds or a fraction of the anchored window. Defaults per Cue kind. Absolute (Scene-relative) frames are an escape hatch that needs a reason, is linted and is listed in the Plan. |
| 12 | Core imports | Following from item 8: the core imports no `remotion`, `@remotion/*` or `react`. Consequences: `d3-interpolate-path` instead of `@remotion/paths` for path morph, and the core's own easing and spring instead of Remotion's `interpolate`/`Easing`/`spring` (7, 2.2 note). |

---

## 11. Lineage: adopted, reused and inspired

Three groups, by how much of the source we carry. Legend for the last column: **[V]** the primary source was opened on 2026-10-28 and the claim checked in it; **[bib]** the bibliographic record (title, authors, venue, year) was checked in Crossref but the paper was not read; **[I]** the mapping to tsukuri is our design choice, not a claim by the source.

### 11.1 Reused: dependencies and renderers

| Name | What we take | Where it lives in tsukuri | Licence | Primary source | Verified |
|---|---|---|---|---|---|
| culori | OKLCH interpolation, gamut mapping, hex output; its WCAG helpers cross-check ours | core: colour interpolators (4.6), contrast cross-check (6) | MIT | https://culorijs.org/api/ | [V] page; licence from the npm registry (section 7) |
| d3-interpolate | The perceptual-interpolation idea (`interpolateHcl`, `interpolateLab`) | **Not a dependency** (lead decision, 2026-10-28): culori covers OKLCH and gamut mapping, numbers need only a plain lerp, and we do not animate transform strings. Credited for the idea | ISC | https://d3js.org/d3-interpolate | [V] page; licence from npm |
| d3-interpolate-path | Path morph between two SVG paths | core: `path` interpolator (4.6) | BSD-3-Clause | https://github.com/pbeshai/d3-interpolate-path (repository URL from the npm registry) | [V] registry metadata (2.3.0, licence, zero dependencies); [I] same output as Remotion's `interpolatePath` |
| flubber | Morph between unlike shapes, opt-in via `morphWith: "flubber"` | core: `path` interpolator (4.6) | MIT | https://github.com/veltman/flubber | [V] page; unmaintained since 2018 (section 2.2) |
| @remotion/paths | `getPointAtLength` for label anchors, `evolvePath` draw-on | Remotion adapter only. Not the core: its dist imports `remotion/no-react` | MIT | https://www.remotion.dev/docs/paths/interpolate-path | [V] docs page; import checked in the installed package |
| elkjs / ELK | Layered layout, orthogonal routing, ports, `elk.interactive` | `src/core/compile/` layout bake, prepare time only; only baked numbers reach the Timeline (5.2, 5.4) | EPL-2.0 OR GPL-3.0-or-later; we use it under EPL-2.0, unmodified | https://github.com/kieler/elkjs (LICENSE: https://github.com/kieler/elkjs/blob/master/LICENSE.md) | [V] pages; dual licence from npm (section 7) |
| Remotion | The Video adapter: composition, per-frame render, `TransitionSeries`, audio mux. Pinned to one exact version | `src/adapters/remotion/` | Remotion License (free for individuals, for-profit organisations up to 3 employees, non-profits) | https://github.com/remotion-dev/remotion/blob/main/LICENSE.md | [V] licence text read (section 7) |
| HyperFrames | The verified exit adapter: `registerFrameSource` around `frameState`; its Kokoro and Whisper tooling; its contrast `check` as a second opinion | `src/adapters/hyperframes/` (not built) | Apache-2.0 | https://hyperframes.heygen.com/guides/frame-sources | [V] docs page; 60/60 identical frames in a survey run (2.6); licence from npm and GitHub |
| reveal.js (and `@revealjs/react`) | The Deck renderer's runtime and Auto-Animate | `src/adapters/deck/` (later, 3.4) | MIT | https://revealjs.com/auto-animate/ and https://github.com/hakimel/reveal.js | [V] pages; seek experiment in 2.5 |

### 11.2 Adopted patterns

| Name | What we take | Where it lives in tsukuri | Primary source | Verified |
|---|---|---|---|---|
| Keyed join (Bostock, "Thinking with Joins") | Enter, update and exit derived from a key function over two collections | The Identity diff: `ElementId` is the key (3.2, 4.0) | https://bost.ocks.org/mike/join/ ; also Bostock, Ogievetsky, Heer, "D³ Data-Driven Documents", IEEE TVCG 2011, doi:10.1109/TVCG.2011.185 | [V] page describes enter, update, exit and the key function; [bib] for the paper |
| Plan then apply with a reviewable diff (Terraform plan, Alchemy plan, Atlas declarative migrations) | A preview of what will change, in a review form, before anything runs; declare the target state and let the tool derive the steps | The Plan stage and `tsukuri plan` (4.0) | https://developer.hashicorp.com/terraform/cli/commands/plan ; https://alchemy.run/guides/cli/ ; https://atlasgo.io/declarative/apply | [V] Terraform page shows the `+`, `-`, `~` and `-/+` symbols and "execution plan with a preview of the changes"; [V] Alchemy CLI page lists `plan # preview changes, apply nothing`; [V] Atlas page: "automatically plans and applies schema changes ... from its current state to the desired state" |
| Behaviour as a function of time with lerp laws (Fran) | A value is a pure function of time; each segment satisfies `interp(a, b, 0) = a` and `interp(a, b, 1) = b` | `frameState` and the Segment sampler (4.2, 4.7 P1 and P2) | Elliott and Hudak, "Functional Reactive Animation", ICFP 1997, http://conal.net/papers/icfp97/ , doi:10.1145/258948.258973 | [V] abstract: behaviors are time-varying values; [bib] record; [I] the lerp laws as test properties are ours |
| Build Systems à la Carte | A content-addressed cache keyed by inputs, so unchanged work is not redone | The layout cache key (5.4) and the prepare "compile twice, compare" check (4.7) | Mokhov, Mitchell, Peyton Jones, ICFP 2018 (PACMPL), https://www.microsoft.com/en-us/research/publication/build-systems-a-la-carte/ , doi:10.1145/3236774 | [bib] and the page loads; the paper was not read, so the mapping is [I] |
| Mental-map preservation in dynamic graph drawing (Misue, Eades, Lai, Sugiyama) | Between layouts, unchanged nodes keep their relative positions so the viewer keeps their mental map | `elk.interactive` plus the previous Keyframe's positions (5.2, 5.3) | Journal of Visual Languages and Computing 1995, doi:10.1006/jvlc.1995.1010 ; ELK option: https://eclipse.dev/elk/reference/options/org-eclipse-elk-interactive.html | [bib] for the paper (not read); [V] ELK option page and our own measurement in section 0 |
| Allen's interval algebra | The vocabulary for ordering windows: `exit-then-enter` is "before" or "meets", `together` is "starts" or "equals", `align: "end"` is "finishes" | Hints `order` and `align` (3.0, 4.3, 4.5) | Allen, "Maintaining knowledge about temporal intervals", CACM 1983, doi:10.1145/182.358434 | [bib]; [I] the mapping to our Hints is ours |
| Story as a labelled transition system (Harel, statecharts) | Beats are states and a Scene is a path through them: a Video is a timed walk, a Deck is an interactive walk | The Story type and the Deck mapping (3.0, 3.4) | Harel, "Statecharts: a visual formalism for complex systems", Science of Computer Programming 1987, doi:10.1016/0167-6423(87)90035-9 | [bib]; [I] we use only the plain transition system, not hierarchy or concurrency |
| Contrast as an invariant made true by construction, then checked on every integer frame | Derived ink (`inkFor`) makes a violating pair unrepresentable; the sampler proves the in-betweens | Section 6 | https://www.w3.org/TR/WCAG22/#contrast-minimum | [V] WCAG 2.2 text read for section 6.1; the construction-plus-check structure is [I] |

### 11.3 Inspired by: ideas only, no code

| Name | The idea | Where it shows in tsukuri | Primary source | Verified |
|---|---|---|---|---|
| reveal.js Auto-Animate matching rules | `data-id` beats content matching; unmatched elements fade; restart groups; per-element timing overrides | The R3 spec for the Identity diff (2.5, 3.2) | https://revealjs.com/auto-animate/ | [V] docs and source read (2.5) |
| Keynote Magic Move, PowerPoint Morph | The next state is an edited copy of the previous one; `!!name` forces a match across shapes | The `beat` sugar (8.1) and `hints.morphFrom` (3.2 rule 6) | https://support.apple.com/guide/keynote/add-transitions-tanff5ae749e/mac ; https://support.microsoft.com/en-us/powerpoint/morph-transition-tips-and-tricks | [V] both pages load; the `!!` rule is on the Microsoft page (read for 2.1); how Keynote matches objects is not stated there [I] |
| React keyed reconciliation | A key is the developer's statement of identity; keys apply per level, so a group's exit takes its children (rule 7) | 3.2 rules 1 and 7 | https://legacy.reactjs.org/docs/reconciliation.html | [V] page loads; read for 2.1 |
| Motion `layoutId` and `AnimatePresence` | Shared identity across states; presence modes, where `wait` is exit before enter | `order: "exit-then-enter"` and the exit Hint (3.0, 3.2) | https://motion.dev/docs/react-layout-animations ; https://motion.dev/docs/react-animate-presence | [V] pages load; read for 2.1 |
| Reframe | Named states, the "compile twice, compare" lint, behaviours as a separate notion | P3 and the prepare lint (4.7); Behaviour is reserved in the glossary | https://github.com/kiyeonjeon21/reframe | [V] README lines on `reframe lint` and on "phase-shifted behaviors" |
| Manim `TransformMatching*`, Hungarian assignment (Kuhn 1955), GumTree (Falleri et al. 2014), type-directed structural diff (Miraldo and Swierstra 2019) | Similarity-based matching, used only for an id-suggestion lint: when an id vanishes and a similar Element appears, suggest the same id or a `morphFrom`. Never in the diff itself | A compile-time lint (not built) | https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingAbstractBase.html ; doi:10.1002/nav.3800020109 ; doi:10.1145/2642937.2642982 (https://github.com/GumTreeDiff/gumtree) ; doi:10.1145/3341717 | [V] Manim page and GumTree repo load; [bib] for the three papers (not read); [I] the lint is a design idea |
| onetake's continuity probe | Measure after the fact what carried across a cut, as a lint on rendered frames | A post-render continuity lint (idea only: its licence is PolyForm Noncommercial 1.0.0, so no code) | https://github.com/feitangyuan/onetake | [V] first line of its LICENSE reads "free for noncommercial use only" with PolyForm Noncommercial 1.0.0 |
| HyperFrames contrast audit | A second opinion on what the browser painted | Optional audit pass beside the model-value gate (6.5, 2.5) | https://github.com/heygen-com/hyperframes | [V] repository loads; the `check` audit ran in a survey experiment (2.6) |

**Citations not fully verified.** Every paper above (Fran is the one exception, where the abstract was read) was checked only as a bibliographic record in Crossref; none of the PDFs was read, so what the paper says about caching, mental maps, intervals, statecharts, Hungarian assignment, GumTree and structural diffing is not checked here, and each "where it lives" mapping is our design. The Atlas page was read only for the sentence quoted. How Keynote matches objects is not stated on the page we read. `d3-interpolate-path` was checked in the npm registry only; the equivalence to Remotion's `interpolatePath` is inference.

---

## Revisions

### R1 (2026-10-28): the core may use Effect v4

**Decided by:** the operator, 2026-10-28. **Supersedes:** section 0 row "Where is the core?" and row "What is it?", section 3.0 first paragraph, section 4.1 diagram heading and section 10 items 8 and 12, wherever they say "plain TypeScript". Section 10 items 8 and 12 keep their import prohibitions.

**What changed.** The first design chose a plain-TypeScript core with no runtime library so that the exit to another renderer (HyperFrames, a Deck) stays cheap. The operator's house default is TypeScript 7, Bun and Effect v4, and the machine rule "Effect pushes dependencies to the seams" applies to semantic cores too. The core may therefore depend on `effect`.

**What did not change.**

| Kept | Why |
|---|---|
| `frameState(story, frame)` is a pure plain function over plain JSON, returns plain data, imports nothing from `compile/` and nothing from `effect` | it runs once per frame inside Chromium and must not carry a runtime into the render path; "pure stays pure" |
| Easing, interpolation, identity join (`plan`), sampling, schedule arithmetic, contrast math, geometry stay plain functions | total, deterministic, no dependency or authority to abstract |
| The core imports no `react`, `remotion`, `@remotion/*`, `playwright`, DOM global or Node built-in (P10) | the exit ramp to HyperFrames or a Deck stays open; enforced by package `dependencies`, lint restriction and a test |
| `PreparedStory` and `FrameState` are plain JSON | any adapter, in any runtime, can read them |

**Where Effect is used.** `Schema` for every plain-JSON boundary (alignment, style, `PreparedStory`, reference pins, fixture manifest); tagged errors for expected compile and pipeline failures; services for what has a dependency or authority (fixture source, alignment, media tools over `ChildProcess`, frame renderer, reference store); `Layer`s selected in the CLI composition root; `Scope` for temporary files and child processes; the render pipeline as one Effect program.

**Why it is safe.** The exit ramp needs only `FrameState` and `PreparedStory`, both plain data. The compile stages that use Effect run at prepare time under Bun; none runs per frame. Spec 0001 states the split per module and tests it (F9).

### R2 (2026-10-28): screenplay-first, Fountain to Deck and Video

**Decided by:** the operator, 2026-10-28. **Supersedes** for release 1: section 0 rows "Build on Remotion or adopt Reframe?" and "Use reveal.js Auto-Animate itself?", "Which Renderings?" and decision 7 ("Video first, Deck later"), decision 2 (own engine, R0+R3, no reveal.js animator), and every statement that Remotion is the first Video adapter. **Keeps:** the vocabulary, the Plan stage and `tsukuri plan`, anchoring to spoken words, determinism as a requirement, R1 (Effect in the core).

**What changed.** tsukuri is **screenplay-first**. One [Fountain](https://fountain.io/syntax) file is the source. `tsukuri plan` shows the Plan. Two Renderings are generated from the same Plan and cannot disagree:

- a **Deck**: reveal.js slides, the narration as speaker notes, the Cues as fragments, Auto-Animate (`data-id`) as the identity diff;
- a **Video**: the same reveal.js page captured frame by frame on a controlled clock (prior art: `timeweb`, the clock behind `timesnap` and `timecut`), stepped through slides and fragments at the aligned time of each Cue, muxed with narration (Kokoro), sound effects, WebVTT subtitles and chapter marks (ffmpeg). Word timing comes from whisper.cpp alignment, as in the first prototype, with the idea of anchoring to a spoken word taken from manim-voiceover's bookmarks.

**Mapping** (also in `GLOSSARY.md`, "Screenplay mapping"):

| Fountain | tsukuri |
|---|---|
| `# Section`, `= synopsis` | Story and Chapter outline: slide groups, chapter marks |
| scene heading | Scene (identity boundary): one slide |
| Action | Keyframe: what is on screen |
| `NARRATOR` dialogue | Line: speaker notes, narration, subtitles |
| Parenthetical | delivery hint (speech settings) |
| `[[note]]` inline | Cue (`next`, `sfx: name`, `focus: id`), anchored to the spoken word before it |
| Transition | Hint: `> AUTO-ANIMATE` matches Elements by id with the previous Scene; `> CUT` does not |

**Why.** A screenplay is the form writers already use for "what is seen, what is said, when", it has maintained editors and parsers, and one file produces a Deck for the room and a Video for sharing without a second copy to keep. reveal.js already supplies identity matching (`data-id`), fragments, speaker notes and PDF export, which the design had listed as the reasons for a Deck Rendering (2.5). The first prototype's motion-graphic engine is larger than the story needs to start.

**What this reopens.** Section 2.5 rejected reveal.js as the animator because Auto-Animate has no exit, no spring, no path morph, and because a seek of the Chromium animation clock can only be falsified, not proved deterministic. Both remain true. Release 1 accepts them: it **measures** whether the controlled clock drives reveal's CSS transitions and whether two builds are frame-identical (spec 0001, F6 and F7), and records the outcome. If the clock does not cover them, the recorded fallback order is a per-frame seek of `document.getAnimations()`, then JS-driven transitions.

**Roadmap (recorded, not built).** (1) tsukuri's own motion engine (path morphs, springs, exits, layout, the per-frame contrast gate; sections 3 to 6) as a renderer plug-in behind the same Plan. (2) The pixel-identical port of the existing 4EM explainer as that engine's regression test; what was measured for it is in [`4em-regression-baseline.md`](4em-regression-baseline.md). (3) Cue offsets and further cue kinds, more than one voice, richer Element vocabulary, a theme system.

**Consequences for earlier sections.** The Remotion licence question (section 9, question 4) no longer blocks release 1: Remotion is not a dependency of it. The `PreparedStory` and `frameState` of section 4 are not built in release 1; reveal.js plus the controlled clock take their place, and the Plan and Timeline stages stay. Property P10 now reads: the core imports no browser, Playwright, ffmpeg, reveal.js or Node built-in.

### R3 (2026-10-28): composable pieces: libraries, services, integrations

**Decided by:** the operator, 2026-10-28. **Supersedes** the module layouts of section 3.0 and of spec 0001 "Module layout" (the dependency rule of R1 stays and is made structural).

tsukuri is built from pieces that can be replaced one by one. Three categories, with one dependency direction (library, then service, then integration; never back):

| Category | What it is | Release 1 |
|---|---|---|
| **Library** | Pure functions and types, no runtime, no service. | Fountain to Story (parser adapter), Story to Plan (identity diff, timeline, cue anchoring), subtitle writers (WebVTT, SRT), lint rules (cue and fragment agreement; contrast; "absolute times need a reason" when absolute times exist) |
| **Service** | An Effect service: an interface plus a contract. Each has at least one adapter and **one contract suite that every adapter must pass**. A service may ship stand-ins for offline tests. | `SpeechSynthesizer`, `WordAligner`, `SoundLibrary`, `Renderer`, `FrameCapturer`, `Encoder`, `AssetCache`; `Layouter` (ELK at build time) only when diagrams need it |
| **Integration / platform adapter** | `Layer`s that implement a service and depend on an outside runtime or provider. | Kokoro (local), whisper.cpp (local), synthesised sounds, reveal.js deck, headless Chromium with a controlled clock, ffmpeg, filesystem cache. First future integration: ElevenLabs for `SpeechSynthesizer`, once the operator provides a key |

Service sketches (release 1 builds the interfaces, the local adapters and the stand-ins):

- `SpeechSynthesizer`: text, voice, speed to audio, optionally the provider's own word timings. Adapters: Kokoro (local); a **silent stand-in** that returns silence with synthetic word timings. Later: ElevenLabs (credential-gated; it may return its own timings).
- `WordAligner`: audio and the expected words to word times and a match ratio. Adapters: whisper.cpp (local); later "provider timings" when the synthesiser supplies them; the stand-in spreads the words evenly.
- `SoundLibrary`: a sound name to audio. Release 1: sounds synthesised in TypeScript; later local files or generated or third-party sounds.
- `Renderer`: Plan to a Deck (reveal.js in release 1; tsukuri's own motion engine later).
- `FrameCapturer`: Deck, schedule and a controlled clock to a stream of frames (headless Chromium).
- `Encoder`: frames, audio mix, subtitles, chapters to a media file, plus lossless audio encode and decode (ffmpeg, local).
- `AssetCache`: content-addressed; **key = adapter and model or voice and settings and input text**, so re-renders reuse paid or slow outputs and stay deterministic; the output manifest records the provenance of every asset.

Rules:

1. **Selection is explicit configuration at the composition root** (for example `speech: kokoro | silent`, later `elevenlabs`). A selected adapter whose requirement is missing (a credential, a model, a binary) **fails with a clear error**; there is never a silent fallback to another adapter.
2. **Every integration has a test stand-in** so the whole pipeline runs offline in tests, and **declares what it sends out** (for a speech provider: the script text). The build manifest lists each adapter's declaration.
3. **Secrets only through the environment or the secret store**: never in a config file or the repository, never printed, never part of a cache key or manifest.
4. **The dependency direction is enforced by the linter** (restricted imports per category), not by review.

### R4 (2026-10-29): anchors as built (spec 0002) and how they differ from section 4.4.1

**Decided by:** the operator's picks of 2026-10-28 and the review of spec 0002. **Supersedes** section 4.4.1 where it differs; the rest of 4.4.1 stands.

The anchor model of 4.4.1 is built as `@tsukuri/core` `Anchor`/`Offset`/`Effect` (spec 0002, "plan contract for effects"). Differences, each deliberate:

| 4.4.1 | As built | Why |
|---|---|---|
| Defaults per cue kind, so most cues need no `at` | `at` is mandatory | "no positional magic": every effect names its anchor |
| `beat` anchor (start, settle, end) | none | a Beat is derived, not written, in the screenplay source; the Scene, the slide transition (`transition.start`, `.end` or `.N%`), an Element's lifecycle and a word cover the moments that exist |
| Offset `fraction` | `%` of the anchored window | the same quantity |
| Absolute times: "`tsukuri lint` warns on every" | allowed with `because "<reason>"`, listed by `lint` and `plan` at severity info | operator pick 2026-10-28 |
| Cue chain: end of another cue | `<effect>.start`; `<show>.end` = end of its window; `.end` of a sound or focus is an error | an instant has no end |
| Element events enter, exit, update | enter, exit, **move**, update; an Element's `move` and `update` percent points follow the renderer's eased progress | a box that moves is the case the operator asked to anchor to ("50% through the move") |
| The event times | declared by the renderer as a `RendererLifecycle` (plain data) and observed in the output by F1 | a wrong declaration must fail on the observed event |

New first-class anchor: **`transition.start|end|N%`**, the Scene's incoming slide transition (the operator: a whoosh belongs to the slide change). Transitions written as lines (`> AUTO-ANIMATE`, `> CUT`) still apply to the scene heading below: Fountain's own grammar; making them a heading property is an open, operator-owned decision.
