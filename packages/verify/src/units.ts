// Frame and time arithmetic of the checks: plain functions. A check passes when its observation lies within one
// frame of the Timeline (spec 0001, F1, F2, F8, F9).

/** The millisecond at which `frame` starts, without rounding. */
export const frameStartMs = (frame: number, fps: number): number =>
  (1000 * frame) / fps;

/** `ms` in frames. */
export const msToFrames = (ms: number, fps: number): number =>
  (ms * fps) / 1000;

/** One frame of tolerance, with a margin for the floating point of the millisecond arithmetic. */
export const withinOneFrame = (offsetFrames: number): boolean =>
  Math.abs(offsetFrames) <= 1 + 1e-6;

/** A number of frames for display: at most two decimals, a sign for a non-zero value. */
export const signedFrames = (frames: number): string => {
  const rounded = Math.round(frames * 100) / 100;

  return rounded > 0 ? `+${rounded}` : String(rounded);
};
