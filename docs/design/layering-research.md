# Layering research: how other tools handle layers, depth, cameras, blending and focus

Status: research note for the design of [spec 0013](../specs/0013-layering.md). Nothing in it is built in reebeat. Date read: 2026-10-29. Prepared for the operator's later review.

reebeat is a declarative multimedia build compiler. The people creating a story declare States that hold Elements with story-wide ids, and the build derives the motion from the identity diff between States ([GLOSSARY](../../GLOSSARY.md), "Identity diff"). The operator approved 2.5D layering: each Layer has one scalar depth, seen through a 2D camera (parallax). That the Layers are blended and blurred by declared functions, and what those functions are, is the operator's idea and spec 0013's proposal. This note asks one question of the existing tools and specifications below: **what do they already do, and what does it cost, so that reebeat can adopt, adapt or reject it?**

## Rules of this note

- **Primary sources only.** Official documentation, specifications, the original paper and, where the documentation is silent, the official source repository (marked *(source)*). A secondary source is named as secondary. Each claim names its source by the key in "Sources" at the end; every key is a link.
- **"Not found in the pages read" is not "absent".** A page that does not mention a feature says nothing about the tool. The table says `not found`, never "the tool lacks it".
- **`not verified`** marks a claim that could not be confirmed from a primary page. It is kept so that the gap is visible.
- **Quotes are at most 25 words.** Everything else is a paraphrase that stays close to the page.
- **No performance number is quoted that a page does not give.** reebeat has measured none of these tools.

### What the author re-checked, and what was relayed

The reading was split across five readers, and each reader's notes were kept. The author of this note then re-opened these pages and confirmed the quoted text in the fetched page: Compositing and Blending Level 1 (blend and clamp rules, isolated group, order of steps, "rounded down"), Filter Effects Module Level 1 (standard deviation, three box blurs, sRGB), CSS Transforms Level 2 (`d/(d − Z)`), Media Queries Level 5 (reduced motion), WCAG 2.2 (2.3.3 text), ECMA-262 (the `Math` clause), the Playwright `omitBackground` option, the Crossref record of Porter and Duff, and one quote each from Blender (Defocus), Godot (CanvasLayer), Figma (Smart animate), Remotion ("Flickering") and Nuke (Card3D). **Every other quote below was extracted by a reader and not re-opened by the author.** Page numbers for the Fusion and Resolve manuals come from the printed footers of an extracted text and may be off by one.

## What each tool does

Each entry answers four questions: what it surfaces as a capability, how it matches layers across states or keyframes, how it parameterises focus, and what it costs or fails to guarantee.

### Adobe After Effects and Apple Motion

- **Layers and depth.** A composition is a stack, and "the bottom layer is rendered first" ([AE-PRECOMP]). A layer is flat. The 3D Layer switch "gains additional properties": Position (z), Orientation and rotations, and z increases "from near to far" ([AE-3D]). "Only 3D layers interact with shadows, lights, and cameras", and "All effects are 2D" ([AE-3D]). Motion states the split plainly: nested layers of a 2D group composite in list order, and those of a 3D group "in depth order (according to their position along the Z axis)" ([MOT-GROUPS]).
- **Capability surfaced.** A per-layer switch (3D or not) and a per-composition renderer choice: Classic 3D, Advanced 3D, Cinema 4D. "The selected renderer determines the features available for 3D layers" ([AE-COMP]). A 3D layer does not intersect a 2D layer or any layer across a 2D layer in the stack ([AE-3D]); adjustment layers, layer styles and some precomps split the 3D groups (same page). The pages read give no one-line depth-sort rule for 2D versus 3D layers (`not verified`).
- **Camera and focus.** The active camera is "the topmost camera in the Timeline panel at the current time for which the Video switch is selected" ([AE-CAM]). Settings are Zoom, Angle of View, Focal Length, Film Size, Focus Distance, Aperture, F-Stop and Blur Level. Zoom is the perspective law: "a layer that is twice the Zoom distance away appears half as tall and wide" ([AE-CAM]). Focus Distance is "the distance from the camera to the plane that is in perfect focus", and "increasing the aperture increases the depth of field blur" ([AE-CAM]). Advanced 3D adds Focus Area Width and separate Near and Far Blur Level ([AE-DOF]). Motion offers Focus Offset, Near Focus and Far Focus in pixels, a Gaussian or Defocus filter, and "Gaussian when setting up a scene, and Defocus for final output" ([MOT-DOF]). **Neither tool gives a blur radius as a function of depth** (`not found in the pages read`).
- **Blending.** Every layer has a blend mode, "identical to blending modes in Adobe Photoshop"; the algorithms are in a PDF reference ([AE-BLEND]). "You can't directly animate blending modes by using keyframes" (same page). The option "Blend colors using 1.0 gamma" "affects only blending between layers", and a linear working space "is not recommended for 8-bpc color" ([AE-COLOR]). Track mattes: Alpha, Luma and the two inverted modes ([AE-MATTE]). An adjustment layer applies effects to the composite "of all layers below" ([AE-CREATE]). Alpha model: `not verified`.
- **Matching across keyframes.** Not found in the pages read. Layers persist on the timeline and each property has its own keyframes ([AE-KEY]). A blend mode cannot be keyed, nor can a light's type. Behaviour of a layer outside its in and out range: `not verified`.
- **Cost and determinism.** "GPU-accelerated effects may render with small color precision differences in an 8-bpc project when compared to CPU-only rendering" ([AE-RENDER]). Advanced 3D needs named GPUs ([AE-ADV3D]). Depth-of-field quality "is controlled by the general Render Quality slider" and rendering a moving Focus Distance may need higher quality, with longer renders ([AE-DOF]). Dancing Dissolve "recalculates for each frame", so its result varies over time by design ([AE-BLEND]). A statement that the same project renders to identical bytes on two machines: `not found in the pages read`.

### DaVinci Resolve (Fusion page and Edit page), Nuke, Blender

- **Layers become wiring.** Fusion has nodes; the Merge node's inputs "determine the layer order" ([FUS17]). Edit and Cut have tracks: "the video clip on the highest track obscures those on lower tracks" ([RES20]). Nuke has "a network of linked operators called nodes" and, for Merge, "think of the B input as the lower layer" ([NUKE-KEY], [NUKE-MERGE]). Blender: "the Compositor processes one image at a time" ([BL-INTRO]). Order is a wire, not a number.
- **2.5D and depth.** Nuke's Card3D page uses the name "2.5D": an element can move back on the z axis without "the sense that it is behind or in front of another element" ([NUKE-CARD3D]). Fusion composites Merge3D "according to each object's absolute position in 3D space" and says a Renderer3D must be placed at the end of a 3D scene "to render it into 2D images" ([FUS17]; quote and page not re-opened by the author, `not verified`). Blender's Depth Combine decides per pixel: "Whichever depth value is less decides which image pixel is used" ([BL-DEPTHCOMBINE]); a parallax node: `not found in the pages read`. Nuke's Deep compositing keeps "multiple samples per pixel at varying depths" ([NUKE-DEEP]) and DeepMerge can drop samples hidden behind opaque ones; its `volumetric_holdout` "can take longer to process" ([NUKE-DEEPMERGE]).
- **Blending.** Fusion's Merge: "The formula used to combine pixels in the merge is always (fg * x) + (bg * y)", with Over, In, Held Out, Atop and XOr, plus apply modes (Screen, Multiply, Overlay, Difference and others) ([FUS17]). Nuke's Merge lists over, atop, in, out, mask, stencil, under, plus, multiply, screen and the rest with formulas in terms of A, B and their alphas, and "expects premultiplied input images" ([NUKE-MERGE]). Blender: "Most images in the compositor are premultiplied"; Alpha Over has Over, Disjoint Over and Conjoint Over ([BL-ALPHAOVER]). Fusion and Nuke recommend linear light ([FUS17], [NUKE-MERGES]); Blender recommends it "for internal work" ([BL-GLOSSARY]). Isolation and grouping: `not found in the pages read` for all three.
- **Focus.** Fusion's Depth Blur has a Focal Point, a Depth of Field band ("all pixels with a Z-value within the region stay in focus"), a Blur Size and a Z Scale, and its manual warns that the default scale "is based on an 8-bit image" ([FUS17]). Nuke's ZDefocus has a focus plane (`center`), a depth-of-field slice (`dof`), `size` ("the size of the blur at infinite depth") and `max_size`; it "splits the image up into layers" of equal depth and blends them back to front ([NUKE-ZDEFOCUS]). Blender's Defocus node has an F-Stop where "the default value 128 is assumed to be infinity" and "half the value will double the amount of blur", plus Max Blur and a Z Scale ([BL-DEFOCUS]). It admits that "this is not real DoF, only a post-processing simulation" and that a close object cannot vanish in a focus pull in one pass (same page). **None of the three pages gives the radius formula.**
- **Matching.** Not found in the pages read, for layers. Animation is by keyframes per parameter; a Dissolve or Mix factor does the transition ([FUS17], [NUKE-MERGE], [BL-ALPHAOVER]).
- **Cost and determinism.** Fusion documents the split in plain words: its Software renderer "produces consistent results on all machines", and the OpenGL renderer's "output may vary slightly from system to system" ([FUS17], p.681 ±1). Blender's system page says data are "stored in half precision formats"; its performance page has a "Precision GPU" setting whose Auto value uses full precision for final renders and half otherwise ([BL-SYS], [BL-PERF]); a statement on whether CPU and GPU agree: `not found`. Nuke processes "exclusively 32-bit-per channel" ([NUKE-KEY]); GPU versus CPU agreement for ZDefocus: `not found`. Nuke's ScanlineRender stochastic sampling is jittered; whether it is seeded: `not found` ([NUKE-SCANLINE]).

### W3C Compositing and Blending Level 1 and Porter and Duff 1984

- **The operators.** Porter and Duff define a matte per element, the operators clear, A, B, over, in, out, atop, xor in both directions, and `plus` ([PD84]); "Features should be provided to exploit the full associativity of the compositing process" (§1). They store colour premultiplied by alpha, so "(.5,0,0,.5) will indicate a full red object half covering a pixel" (§2), and combine with one rule applied to colour and alpha alike, `cO = cA·FA + cB·FB` (§4.3). They name 2.5D directly: renderers "reducing their environments to pieces that can be combined in a 2 1/2 dimensional manner" (§1). They list "methods for breaking arbitrary three dimensional scenes into elements separated in depth" as future work (§6). **The paper has no camera and no focus.**
- **The blend step.** The W3C spec separates blending from compositing: "Typically, the blending step is performed first, followed by the Porter-Duff compositing step" ([CSS-COMP] §5). The general form is `Cs' = (1 − αb)·Cs + αb·B(Cb, Cs)` and `Co = αs·Fa·Cs' + αb·Fb·Cb`. It defines separable modes (multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion) and non-separable ones (hue, saturation, color, luminosity) with formulas, and says "The blending calculations must not use pre-multiplied color values" (§10).
- **Groups.** A compositing group may contain other groups; the default "shall cause no visual difference compared to having no group". "In an isolated group, the initial backdrop shall be black and fully transparent" (§8). In HTML, "Everything in CSS that creates a stacking context must be considered an 'isolated' group" (§3.2). `mix-blend-mode`, `isolation` and `background-blend-mode` animate discretely: there is no interpolation and no matching.
- **What the spec leaves open, and a reproducible build cannot.** It states no bit depth and no fixed-point or floating-point choice, no rounding mode for premultiplying or unpremultiplying, and no blending colour space (`not found in the pages read`). It says only that a result "must be clamped to the minimum and maximum values of the color range", that the lighten result "must be rounded down if it exceeds the range", and that a user agent unable to render because of device limits is not non-conformant. Porter and Duff note that precision "falls off sharply" when colour is recovered as alpha approaches 0 ([PD84] §3). Status: the Level 1 text read is a Candidate Recommendation Draft of 21 March 2024.

### CSS filters, 3D transforms and parallax; Figma

- **Blur.** `blur()` takes "the standard deviation to the Gaussian function", a length, not a percentage ([CSS-FILTER] §6.1). Filter functions "must operate in the sRGB color space" (§5). The module gives a recipe for large deviations: "Three successive box-blurs ... approximates the Gaussian kernel to within roughly 3%", with `d = floor(s · 3 · √(2π) / 4 + 0.5)`, odd `d` as three boxes of size `d`, even `d` as two of `d` and one of `d + 1` (§9.14). It says an approximation "can be used", so two implementations may differ. Status: Working Draft of 18 December 2018.
- **Depth.** Elements are flat planes: "have no depth" until a 3D context. `perspective` gives "The scaling is proportional to d/(d − Z)", with `d` "the distance from the drawing plane to the assumed position of the viewer's eye" ([CSS-TRANSFORMS2] §4.1.1). A Z translation "does not cause that element to render in front" outside a 3D context. Depth sorting inside a context follows Newell's algorithm (§4.1.2). Any of `opacity < 1`, `filter`, `clip-path`, `mask-image`, `isolation: isolate` or `mix-blend-mode` forces `transform-style` to flat (§7.1), which flattens the descendants of that element into it. Whether such an element still takes part in its parent's 3D context, and so in depth sorting with its siblings, is **this note's reading of §4.1.2 and §7.1, `not verified`**. Status: Working Draft of 9 November 2021 (the read text); the editor's draft is newer.
- **CSS-only parallax** is documented in a personal article, so it is a secondary source ([CLARK14]): a scroll container with `perspective: 1px` and layers at `translateZ`, where "Elements with negative Z values will scroll slower"; the scale correction is `1 + (translateZ · −1) / perspective`; and "we cannot clip the content of a group" without breaking it. It is scroll-driven, so its output is not a function of a frame number.
- **Figma.** Blend modes apply to a layer, fill, stroke or effect; "Pass through is the default mode for layers" and a parent set to Normal "restricts blend modes applied to its child layers from interacting with content below" ([FIG-BLEND]). That is isolation chosen per group. Layer blur and Background blur are "Uniform" or "Progressive", with a `radius` whose unit is `not found` ([FIG-EFFECTS]); the help text says blur can "Replicate camera depth", with no focus model. Smart animate matches by **layer name and place in the hierarchy**; "If you introduce a new layer in the destination frame, smart animate will dissolve the layer into view"; shape morphing and shadows are not supported ([FIG-SMART], [FIG-MATCH]). "Background blurs are typically the slowest effect to render", and texture and noise "are randomly generated" so Smart animate may misbehave ([FIG-EFFECTS], [FIG-SMART]).

### Motion Canvas, Remotion, Manim

- **Motion Canvas.** A scene is a tree of nodes "similar to the Document Object Model"; stacking is sibling order with `moveToTop` ([MC-HIER]). It has "a simple orthographic camera that allows you to pan, zoom, and rotate" and a z-depth: `not found in the pages read` ([MC-CAMERA]). Composite operations and filters "require a cached Node" rendered offscreen ([MC-FILTERS]), which is isolation by construction. A scene transition is "an animation performed at the beginning of the scene" that modifies both contexts; a statement on matching nodes across scenes: `not found` ([MC-TRANS]). "Motion Canvas animations are resilient to changes in frame rate" and image encoding "depends on the capabilities of your browser" ([MC-RENDER]).
- **Remotion.** `<Sequence>` children are wrapped in `<AbsoluteFill>`, and "The layers that get rendered last appear on top - this is because of how HTML works" ([RM-SEQ], [RM-ABS]). The depth feature found in the pages read is `<ThreeCanvas>` over React Three Fiber ([RM-THREE]); other routes to depth: `not found in the pages read`. Transitions render "both scenes ... simultaneously" with a progress from 0 to 1 ([RM-TS]); identity matching: `not found in the pages read`. The determinism rule is stated plainly: "Think of your component as a function that transforms a frame number into an image" ([RM-FLICKER]). Headless Chromium disables the GPU by default and several `--gl` back ends exist; whether pixels agree across GPUs: `not found` ([RM-GPU], [RM-GL]). Motion blur is sampled: `<CameraMotionBlur>` has `shutterAngle` and `samples`, and "The technique is destructive to colors" ([RM-MBLUR]).
- **Manim.** Mobjects are drawn "from background to foreground in the order with which they are added", and `set_z_index` overrides ([MANIM-SCENE], [MANIM-MOBJECT]). `ThreeDScene` has a camera with `focal_distance`, `phi`, `theta`, `zoom` ([MANIM-3D]); the projection scale `focal_distance / (focal_distance − z)` is in the camera's source code, not in the documentation *(source)* ([MANIM-3DCAM]). Objects can be "fixed in frame". `TransformMatchingShapes` matches by geometry: "if the hash of their point coordinates after normalization ... matches"; unmatched sub-objects fade out and in ([MANIM-TMS], [MANIM-BASE]). Blend modes, blur and depth of field: `not found`. Caching: "for every play call, a hash value is computed" and a cached output is reused ([MANIM-DEEP]); no bit-for-bit claim is made.

### Rive, Lottie, dotLottie

- **Rive.** Draw order is the hierarchy, "Objects higher in the Hierarchy render above objects lower" ([RIVE-HIER]); draw order can be keyed but "cannot be interpolated" ([RIVE-DRAW]). A state machine layer "can play one state at a time", and lower layers win on the same property ([RIVE-LAYERS]); 1D and Direct blend states mix timelines ([RIVE-STATES]). Feathering softens "the edge of vector paths without the typical performance impact of traditional blur effects", needs the Rive Renderer, and its units are `not found` ([RIVE-FILL], [RIVE-SUPPORT]). A non-normal blend "forces the renderer to re-read the frame" on WebGL2, which costs time ([RIVE-CANVAS]). Parallax, depth and determinism: `not found`.
- **Lottie.** The specification (1.0.1, a subset "of features that have been approved") has precomp, solid, image, null and shape layers, parent links through `ind` and `parent`, track mattes (Alpha, Inverted Alpha, Luma, Inverted Luma) and `st`, `sr` and `tm` time controls ([LOTTIE-SPEC]). A layer-level `ddd` 3D flag, a camera layer, blend modes and effects are **not found in the normative pages read**; they appear in the community-hosted documentation, which is not the specification: 3D layers need `ddd` "set to 1", a camera layer has `pe`, "Distance from the Z=0 plane", and blend modes `bm` 0 to 17 ([LOTTIE-DOCS]). That documentation also says "things might vary from player to player" ([LOTTIE-RENDER]). dotLottie state machines tween between playback states with a duration and easing; layer-level matching is not described ([DOTLOTTIE]).

### Unity and Godot

- **Order is separate from distance.** Unity sorts by Sorting Layer, then Order in Layer, then render queue, then distance, then material, and the last tie-break "isn't guaranteed and you can't control it" ([UNITY-SORT]); a Sorting Group "renders as one unit" ([UNITY-GROUPS]). Godot's `CanvasLayer.layer` is "a numeric index that defines the draw order"; for the same index, "Which CanvasLayer is drawn in front is non-deterministic" ([GODOT-LAYER]).
- **Parallax is a number per layer.** Godot's `Parallax2D` has `scroll_scale` (a `Vector2`, so one multiplier per axis): above 1 "scrolls faster, making objects appear closer", below 1 makes objects appear further away (paraphrase), and 0 stops ([GODOT-PARALLAX]). It is a multiplier of the camera offset, not a depth with a projection (the page documents no depth value). Unity uses real z with a perspective camera for "cardboard theater" parallax: "all graphics are flat, but arranged at different distances from the camera" ([UNITY-2D3D]). A dedicated Unity parallax feature: `not found`.
- **Focus.** Unity URP has Gaussian (Start, End, Max Radius) and Bokeh (Focus Distance, Focal Length in mm, Aperture as f-number) ([UNITY-DOF], [UNITY-DOF-REF]); HDRP offers Physical Camera or Manual Ranges with near and far blur ([UNITY-HDRP-DOF]); the URP and HDRP pages read word the aperture in opposite directions (smaller f-number gives shallower focus; "the larger this value, the larger the bokeh"), an inconsistency in the documentation that was not resolved further. Godot 3D has `dof_blur_far_distance`, `dof_blur_near_distance`, a transition length and `dof_blur_amount`, "only supported in the Forward+ and Mobile rendering methods" ([GODOT-CAMATTR]). 2D depth of field: `not found`. No page gives a formula.
- **Blending.** Godot `CanvasItemMaterial` has Mix, Add, Sub, Mul and PremultAlpha ([GODOT-MAT]). Unity's blend modes: `not found`.

### Keynote, PowerPoint, reveal.js

- **Matching is the feature.** Keynote Magic Move: "Any objects appearing on both slides become part of the transition. Any objects appearing on the first slide, but not the following slide, fade out" ([KEY-TRANS]); unmatched objects can be set to appear and disappear instantly. How Keynote decides that two objects are the same: `not stated`. PowerPoint Morph needs "at least one object in common" and lets the creator force a match by naming two objects with the same name that begins with `!!`; "Morph won't match a '!!' object with a non-'!!' object", and charts "don't morph, they cross-fade" ([PPT-MORPH], [PPT-TIPS]). reveal.js Auto-Animate matches text by content and node type, images by `src`, "We prioritize matching data-id values above our automatic matching", and unmatched elements "fade in" unless set otherwise ([REVEAL-AA]). Depth, blend, focus and determinism: `not found` on each page; Auto-Animate is CSS-transition based in a browser, so it is not frame-pure.

## Comparison

`F` marks facts from the entry above; `n/f` is `not found in the pages read`. Keys are links in "Sources".

| Tool | Layer and depth | Surfaced as a capability | Matching across states | Focus parameters | Cost and determinism |
| --- | --- | --- | --- | --- | --- |
| After Effects | Stack for 2D; z for 3D layers; 3D groups split by 2D layers [AE-3D] | 3D Layer switch per layer; renderer per composition [AE-COMP] | n/f; keyframes per property [AE-KEY] | Focus Distance, Aperture, F-Stop, Blur Level, Focus Area Width [AE-CAM], [AE-DOF] | GPU-accelerated effects may differ in 8-bpc [AE-RENDER]; quality slider for DoF |
| Motion | 2D group by list; 3D group by Z [MOT-GROUPS] | 2D or 3D group; Flatten; Layer Order [MOT-GROUPS] | n/f | Focus Offset, Near and Far Focus, Gaussian or Defocus [MOT-DOF] | Defocus "may impact performance" |
| Resolve Fusion and Edit | Wired Merge; Merge3D by position; tracks [FUS17], [RES20] | Software or OpenGL renderer [FUS17] | n/f; Dissolve factor | Focal Point, Depth of Field, Blur Size, Z Scale [FUS17] | Software "consistent on all machines"; OpenGL varies |
| Nuke | Node graph; Card3D named 2.5D [NUKE-CARD3D]; Deep samples [NUKE-DEEP] | Deep nodes; GPU flag on ZDefocus | n/f | `center`, `dof`, `size`, `max_size`, layers [NUKE-ZDEFOCUS] | 32-bit float; GPU parity n/f |
| Blender compositor | Nodes; Depth Combine by pixel [BL-DEPTHCOMBINE] | CPU or GPU device; limits page [BL-LIMITS] | n/f | F-Stop, Z Scale, Max Blur [BL-DEFOCUS] | Half precision by default, full for final renders in Auto [BL-SYS], [BL-PERF]; CPU vs GPU n/f |
| W3C Compositing 1 | Paint order and groups; depth n/f [CSS-COMP] | `isolation`, `mix-blend-mode` | Discrete animation only | n/f | Bit depth, rounding, colour space unspecified |
| Porter and Duff | Matte per element; 2.5D named as the aim [PD84] | Operators | n/f | n/f | Precision loss near alpha 0 |
| CSS (filters, transforms) | Planes; `d/(d − Z)`; blend or blur flattens 3D [CSS-TRANSFORMS2] | `perspective`, `transform-style` | n/a (Figma below) | σ of a Gaussian; box approximation optional [CSS-FILTER] | "can be used": implementations may differ |
| Figma | Layers and frames; depth n/f [FIG-BLEND] | Pass through vs Normal parent | By name and hierarchy; new layers dissolve [FIG-MATCH] | Blur radius (unit n/f), progressive | Blur slow; texture random |
| Motion Canvas | Node tree; cache for isolation [MC-FILTERS] | Orthographic camera [MC-CAMERA] | Whole-scene transitions; matching n/f [MC-TRANS] | n/f | Browser-dependent encoding |
| Remotion | DOM order; 3D via R3F [RM-ABS], [RM-THREE] | `<ThreeCanvas>` | Scenes as subtrees; matching n/f [RM-TS] | n/f; sampled motion blur | Frame as function; cross-GPU n/f |
| Manim | Add order and `z_index` [MANIM-SCENE] | `ThreeDScene` camera | By geometry hash; mismatch fades [MANIM-TMS] | n/f | Hash cache; no bit claim |
| Rive | Hierarchy order; keyable draw order [RIVE-DRAW] | Rive Renderer for feather | By object in one artboard | Feather; focus n/f | Non-normal blend costs |
| Lottie | Layer list, `parent` links; mattes [LOTTIE-SPEC] | Subset by spec; 3D in community docs only | n/f | n/f | "may vary from player to player" |
| Unity | Sorting layers; z with perspective camera [UNITY-SORT] | Gaussian vs Bokeh DoF [UNITY-DOF] | n/f | Focus Distance, Focal Length, Aperture | Last tie-break "isn't guaranteed" |
| Godot | `CanvasLayer.layer`; `scroll_scale` [GODOT-PARALLAX] | Renderer limits DoF [GODOT-CAMATTR] | n/f | Distances and `dof_blur_amount` (3D only) | Equal-index order "non-deterministic" |
| Keynote, PowerPoint, reveal.js | Stack order; depth n/f | Fade unmatched on or off | By object; `!!name`; `data-id` [PPT-TIPS], [REVEAL-AA] | n/f | Browser CSS; not frame-pure |

## Synthesis: adopt, adapt, reject for reebeat

Each line names the finding, the decision it feeds in [spec 0013](../specs/0013-layering.md), and why. All are proposals for the operator's review; only the scalar-depth choice is approved.

**Adopt (the idea is used as the tool states it).**

- **Porter and Duff plus a separate blend step**, in W3C's order: blend first, then composite ([PD84], [CSS-COMP]). It gives the operator's two wishes (set overlap, difference) as two orthogonal knobs. Fusion's Merge lists operators and apply modes separately, and Blender has Alpha Over beside Mix ([FUS17], [BL-ALPHAOVER]).
- **Premultiplied alpha as the working form.** Fusion, Nuke, Blender and Porter and Duff say that images are premultiplied or store colour that way ([FUS17], [NUKE-MERGE], [BL-ALPHAOVER], [PD84]); the other tools' alpha model was `not found`. It makes the operators plain multiply-and-add.
- **Identity-keyed matching with a default dissolve for the unmatched.** Keynote, PowerPoint, reveal.js, Figma and Manim all fade the unmatched in or out ([KEY-TRANS], [PPT-MORPH], [REVEAL-AA], [FIG-SMART], [MANIM-BASE]); Figma, PowerPoint and reveal.js add an explicit key. reebeat already has the key (story-wide ids) and gains layers as one more identity-bearing kind.
- **A focus band and a maximum.** Fusion and Nuke parameterise blur by an in-focus band plus a size and a clamp ([FUS17], [NUKE-ZDEFOCUS]); Unity's Gaussian mode has a start, an end and a maximum radius, and its page gives no law between them ([UNITY-DOF-REF]). reebeat's own rule over such parameters is linear (spec 0013, Decision 5), so it needs no transcendental function.
- **Two renderers is a documented hazard, not a feature.** Fusion names a software renderer that "produces consistent results on all machines" ([FUS17]). reebeat adopts the software path as the definition and treats any other as a conformance subject.

**Adapt (the idea fits after a change).**

- **Depth as one number.** CSS perspective gives `d/(d − Z)` ([CSS-TRANSFORMS2]); Nuke's Card3D page is the 2.5D precedent but gives no such formula ([NUKE-CARD3D]); Godot's `scroll_scale` is a per-axis multiplier ([GODOT-PARALLAX]). reebeat keeps one scalar `z` and derives the multiplier, so one number drives parallax, blur and order, as the operator approved for the scalar depth.
- **Order from depth, with a total tie-break.** After Effects and Motion split order (2D list) from depth (3D); Unity and Godot document unguaranteed ties ([AE-3D], [MOT-GROUPS], [UNITY-SORT], [GODOT-LAYER]). reebeat orders by depth and breaks ties by declaration order, so the order is total.
- **Blur by a deterministic recipe.** CSS names the standard deviation and a three-box approximation that "can be used" ([CSS-FILTER]). reebeat defines its own integer box recipe as the blur, so it does not claim to equal a browser's.
- **The camera as data per State.** After Effects, Fusion and Blender keep a camera with focus distance ([AE-CAM], [FUS17], [BL-DEFOCUS]). reebeat keeps a 2D camera (pan, zoom) and a focus per State, and derives its motion between States.
- **The static and dynamic split.** Motion Canvas needs a cached offscreen node for filters and composite operations ([MC-FILTERS]); Rive says a non-normal blend "forces the renderer to re-read the frame" on WebGL2 ([RIVE-CANVAS]). Both pages describe a cost the creator meets; neither describes a split derived from what a layer contains. reebeat derives the split from the content (see spec 0013, Decision 10).
- **Isolation.** Figma's Pass through versus Normal and CSS's isolated group ([FIG-BLEND], [CSS-COMP]) become a declared group flag.

**Reject.**

- **Separate 2D and 3D layer kinds** (After Effects, Motion). A layer switch per layer, a renderer per composition and rules about which layers intersect ([AE-3D], [AE-COMP], [MOT-GROUPS]) are the cost of full 3D. reebeat declares scalar depth, so every layer is one kind.
- **Physical lens models** (f-stop, focal length, aperture; [AE-CAM], [BL-DEFOCUS], [UNITY-DOF-REF]). No page read gives the radius formula, the Unity pages read word the aperture in opposite directions, and the model needs functions that are not exact.
- **Any blend or blur that is allowed to differ by device**: GPU compositors without a byte-equality check, "approximation can be used", half-precision storage ([AE-RENDER], [CSS-FILTER], [BL-SYS], [FUS17]).
- **Keying a blend mode** is impossible in After Effects ([AE-BLEND]); reebeat does not need it, because opacity over time is a curve and a blend change is a Beat's `step`.
- **Deep compositing** ([NUKE-DEEP]): many samples per pixel is a different data type, with a cost the story does not need at scalar depth.
- **Layer matching by name and hierarchy or by geometry hash** (Figma, Manim). reebeat matches by declared id.

## Not verified, and gaps that matter to the design

1. The radius of a depth-of-field blur as a function of depth is documented by none of the pages read. reebeat therefore defines its own (spec 0013, Decision 5) and does not claim equivalence with any tool.
2. Whether any tool's output is byte-identical across machines: after Effects, Resolve (OpenGL), Blender, Nuke and Unity say nothing or say it varies; Fusion's Software renderer "produces consistent results on all machines" ([FUS17], page ±1, not re-opened by the author).
3. The alpha model of After Effects, Figma, Motion Canvas, Manim, Rive and Lottie: `not found`.
4. After Effects' rule for ordering 2D and 3D layers and Motion's equivalent for list versus depth beyond the quoted sentence: `not verified`.
5. Keynote's rule for deciding that two objects are the same object: not stated in the page read.
6. Lottie `ddd`, camera, blend modes and effects are in community documentation only, not in the normative pages read.
7. Figma's page on frames versus groups and the masks page were not opened (`not verified`).
8. This note read documentation. It did not run any tool, so no claim of speed or output equality is made.

## Sources

Adobe After Effects and Apple Motion
[AE-3D]: https://helpx.adobe.com/after-effects/desktop/work-with-layers/3d-layers/3d-layers.html
[AE-CAM]: https://helpx.adobe.com/after-effects/desktop/work-with-layers/camera-layer/cameras-lights-points-interest.html
[AE-BLEND]: https://helpx.adobe.com/after-effects/desktop/work-with-layers/work-with-layer-blending-modes/blending-modes-layer-styles.html
[AE-PRECOMP]: https://helpx.adobe.com/after-effects/desktop/work-with-compositions/precomposing-and-nesting/precomposing-nesting-pre-rendering.html
[AE-CREATE]: https://helpx.adobe.com/after-effects/desktop/work-with-layers/create-layers/creating-layers.html
[AE-MATTE]: https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html
[AE-COLOR]: https://helpx.adobe.com/after-effects/desktop/adjust-colors/color-management/color-management.html
[AE-KEY]: https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-keyframes/keyframe-interpolation.html
[AE-COMP]: https://helpx.adobe.com/after-effects/desktop/work-with-compositions/composition-settings/composition-basics.html
[AE-DOF]: https://helpx.adobe.com/after-effects/desktop/work-with-3d-composition/work-with-3d-scene-depth-data/enable-in_engine-depth-of-field-in-advanced-3d.html
[AE-RENDER]: https://helpx.adobe.com/after-effects/desktop/render-and-export/basics-of-rendering-and-exporting/basics-rendering-exporting.html
[AE-ADV3D]: https://helpx.adobe.com/after-effects/desktop/work-with-3d-composition/advanced-3d-renderer/advanced-3d-renderer.html
[MOT-GROUPS]: https://support.apple.com/en-am/guide/motion/motn2fb59f53/mac
[MOT-DOF]: https://support.apple.com/guide/motion/depth-of-field-controls-motn17c674c1/mac

Blackmagic Design, Foundry, Blender
[FUS17]: https://documents.blackmagicdesign.com/UserManuals/Fusion17_Manual.pdf
[RES20]: https://documents.blackmagicdesign.com/UserManuals/DaVinci_Resolve_20_Reference_Manual.pdf
[NUKE-KEY]: https://learn.foundry.com/nuke/content/getting_started/meet_nuke/key_concepts.html
[NUKE-CARD3D]: https://learn.foundry.com/nuke/content/reference_guide/transform_nodes/card3d.html
[NUKE-MERGE]: https://learn.foundry.com/nuke/content/reference_guide/merge_nodes/merge.html
[NUKE-MERGES]: https://learn.foundry.com/nuke/content/comp_environment/merging/merges.html
[NUKE-ZDEFOCUS]: https://learn.foundry.com/nuke/content/reference_guide/filter_nodes/zdefocus.html
[NUKE-DEEP]: https://learn.foundry.com/nuke/content/comp_environment/deep/deep_compositing.html
[NUKE-DEEPMERGE]: https://learn.foundry.com/nuke/content/reference_guide/deep_nodes/deepmerge.html
[NUKE-SCANLINE]: https://learn.foundry.com/nuke/content/reference_guide/3d_nodes/scanlinerender.html
[BL-INTRO]: https://docs.blender.org/manual/en/latest/compositing/introduction.html
[BL-SYS]: https://docs.blender.org/manual/en/latest/compositing/compositor_system.html
[BL-DEFOCUS]: https://docs.blender.org/manual/en/latest/compositing/types/filter/blur/defocus.html
[BL-ALPHAOVER]: https://docs.blender.org/manual/en/latest/compositing/types/color/alpha_over.html
[BL-DEPTHCOMBINE]: https://docs.blender.org/manual/en/latest/compositing/types/color/depth_combine.html
[BL-LIMITS]: https://docs.blender.org/manual/en/latest/compositing/limitations.html
[BL-PERF]: https://docs.blender.org/manual/en/latest/render/cycles/render_settings/performance.html
[BL-GLOSSARY]: https://docs.blender.org/manual/en/latest/glossary/index.html

Specifications, a paper and an article
[PD84]: https://dl.acm.org/doi/10.1145/800031.808606 (Porter and Duff, "Compositing Digital Images", SIGGRAPH '84, Computer Graphics 18(3), pp. 253-259; the ACM page answers 403 to non-browser clients, so title, authors and pages were checked in the [Crossref record](https://api.crossref.org/works/10.1145/800031.808606), and the text was read from the author-era PDF at https://keithp.com/~keithp/porterduff/p253-porter.pdf; the operator table in the PDF text was garbled, so the operator factors are taken from [CSS-COMP])
[CSS-COMP]: https://www.w3.org/TR/compositing-1/
[CSS-FILTER]: https://www.w3.org/TR/filter-effects-1/
[CSS-TRANSFORMS2]: https://www.w3.org/TR/css-transforms-2/
[MQ5]: https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion
[CLARK14]: https://keithclark.co.uk/articles/pure-css-parallax-websites (secondary: a personal article, 4 August 2014)
[FIG-BLEND]: https://help.figma.com/hc/en-us/articles/360040667874-Apply-blend-modes-to-layers-fills-and-effects
[FIG-EFFECTS]: https://help.figma.com/hc/en-us/articles/360041488473-Apply-effects-to-layers
[FIG-SMART]: https://help.figma.com/hc/en-us/articles/360039818874-Smart-animate-layers-between-frames
[FIG-MATCH]: https://help.figma.com/hc/en-us/articles/21523793229463-Identify-matching-objects

Code-first and runtime tools
[MC-HIER]: https://motioncanvas.io/docs/hierarchy
[MC-CAMERA]: https://motioncanvas.io/docs/camera
[MC-FILTERS]: https://motioncanvas.io/docs/filters-and-effects
[MC-TRANS]: https://motioncanvas.io/docs/transitions
[MC-RENDER]: https://motioncanvas.io/docs/rendering
[RM-SEQ]: https://www.remotion.dev/docs/sequence
[RM-ABS]: https://www.remotion.dev/docs/absolute-fill
[RM-THREE]: https://www.remotion.dev/docs/three-canvas
[RM-TS]: https://www.remotion.dev/docs/transitions/transitionseries
[RM-FLICKER]: https://www.remotion.dev/docs/flickering
[RM-GPU]: https://www.remotion.dev/docs/gpu
[RM-GL]: https://www.remotion.dev/docs/gl-options
[RM-MBLUR]: https://www.remotion.dev/docs/motion-blur/camera-motion-blur
[MANIM-SCENE]: https://docs.manim.community/en/stable/reference/manim.scene.scene.Scene.html
[MANIM-MOBJECT]: https://docs.manim.community/en/stable/reference/manim.mobject.mobject.Mobject.html
[MANIM-3D]: https://docs.manim.community/en/stable/reference/manim.scene.three_d_scene.ThreeDScene.html
[MANIM-3DCAM]: https://github.com/ManimCommunity/manim/blob/main/manim/camera/three_d_camera.py (source code, not documentation)
[MANIM-TMS]: https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingShapes.html
[MANIM-BASE]: https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingAbstractBase.html
[MANIM-DEEP]: https://docs.manim.community/en/stable/guides/deep_dive.html
[RIVE-HIER]: https://rive.app/docs/editor/interface-overview/hierarchy.md
[RIVE-DRAW]: https://rive.app/docs/editor/animate-mode/animating-draw-order.md
[RIVE-LAYERS]: https://rive.app/docs/editor/state-machine/layers.md
[RIVE-STATES]: https://rive.app/docs/editor/state-machine/states.md
[RIVE-FILL]: https://rive.app/docs/editor/fundamentals/fill-and-stroke.md
[RIVE-SUPPORT]: https://rive.app/docs/feature-support.md
[RIVE-CANVAS]: https://rive.app/docs/runtimes/web/canvas-vs-webgl.md
[LOTTIE-SPEC]: https://lottie.github.io/lottie-spec/latest/specs/layers/
[LOTTIE-DOCS]: https://lottiefiles.github.io/lottie-docs/layers/ (community-hosted, not the specification)
[LOTTIE-RENDER]: https://lottiefiles.github.io/lottie-docs/rendering/ (community-hosted)
[DOTLOTTIE]: https://docs.lottiefiles.com/en/format/dotlottie/interactivity/state-machines/specification

Engines and presentation tools
[UNITY-SORT]: https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/sprite/sort-sprites/2d-renderer-sorting
[UNITY-GROUPS]: https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/sprite/sort-sprites/use-sorting-groups
[UNITY-2D3D]: https://docs.unity.com/zh-cn/engine/6000.6/manual/get-started/first-time-user/2dor3d
[UNITY-DOF]: https://docs.unity.com/en-us/engine/6000.6/manual/post-processing-and-full-screen-effects/urp/effect-list/depth-of-field-urp/volume-override
[UNITY-DOF-REF]: https://docs.unity.com/en-us/engine/6000.3/manual/post-processing-and-full-screen-effects/urp/effect-list/depth-of-field-urp/volume-override-reference
[UNITY-HDRP-DOF]: https://docs.unity.cn/Packages/com.unity.render-pipelines.high-definition%4017.1/manual/Post-Processing-Depth-of-Field.html (the Unity China mirror of the package documentation)
[GODOT-LAYER]: https://docs.godotengine.org/en/stable/classes/class_canvaslayer.html
[GODOT-PARALLAX]: https://docs.godotengine.org/en/stable/classes/class_parallax2d.html
[GODOT-MAT]: https://docs.godotengine.org/en/stable/classes/class_canvasitemmaterial.html
[GODOT-CAMATTR]: https://docs.godotengine.org/en/stable/classes/class_cameraattributespractical.html
[KEY-TRANS]: https://support.apple.com/guide/keynote/add-transitions-tanff5ae749e/mac
[PPT-MORPH]: https://support.microsoft.com/en-us/powerpoint/training/use-the-morph-transition-in-powerpoint
[PPT-TIPS]: https://support.microsoft.com/en-us/powerpoint/morph-transition-tips-and-tricks
[REVEAL-AA]: https://revealjs.com/auto-animate/

Accessibility and the platform (cited by the spec; read for it)
[WCAG-233]: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
[WCAG-132]: https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html
[WCAG-231]: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
[ECMA262]: https://tc39.es/ecma262/
[PW-SHOT]: https://playwright.dev/docs/api/class-page
