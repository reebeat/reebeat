// What reveal.js declares about its slide change (spec 0002, "plan contract for effects"): when each Element event
// happens in the transition window, as `RendererLifecycle` plain data. `schedule` resolves every effect anchored to an
// event from it and `@tsukuri/verify` observes the events in the written video (F1), so a wrong number fails there.
//
// The numbers are MEASURED, not read from reveal.js's CSS: they are what the viewer sees in the frames of the capture
// (`@tsukuri/capture-chromium`), found by the observers of `@tsukuri/verify` on a fresh build of `stories/same-id`.
// `README.md` lists the measurements and how to repeat them. A frame counts as changed at 200 pixels that differ by
// more than 8 gray levels, and an event as settled when under 1% of the change (at least 200 pixels) is left.
import type { RendererLifecycle } from "@tsukuri/core";

export const revealLifecycle: RendererLifecycle = {
  matched: {
    // Reveal's `autoAnimateEasing: "ease"`, the CSS `ease` cubic-bezier.
    easing: [0.25, 0.1, 0.25, 1],
    // The matched Element's animation is created one frame after the call and `ease` starts slowly: the first
    // changed frame is 2 after the slide change (measured on the box of `stories/same-id`, a 524 px move).
    startLagFrames: 2,
  },
  // The frame rate the lags below, and those of the README table, were measured at: frames of the capture at 30 fps.
  // A lag is a time, so `lifecycleFrames` of `@tsukuri/core` resolves it to frames at the Plan's rate; the capture
  // adapter still renders only this rate, since no other was measured.
  measuredFps: 30,
  // `.el.shown` fades opacity in 0.2 s (`theme.ts`); under 1% of the change is left after 4 frames (133 ms).
  showMs: 133,
  transitionMs: {
    // The Plan's `transition` (`settings.transition` 0.8 s): the matched Element settles 1 frame after it.
    "auto-animate": 800,
    // `data-transition="none"`: the slide is swapped at once.
    cut: 0,
    // reveal.js's `fade` is `opacity .5s` with `ease`; the picture is settled by the 12th frame (400 ms).
    default: 400,
  },
  // An Element that is only in the new Scene fades in from the 8th to the 22nd frame after the slide change; one that is
  // only in the old Scene leaves at the slide change (`exit` is an instant at the slide frame, not a declaration).
  unmatched: { enter: { endLagFrames: 22, startLagFrames: 8 } },
};
