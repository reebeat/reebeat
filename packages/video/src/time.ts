// Frame and time arithmetic: plain functions, integer milliseconds.

/** The millisecond at which `frame` starts: `round(1000 * frame / fps)`. */
export const frameToMs = (frame: number, fps: number): number =>
  Math.round((1000 * frame) / fps);

const pad = (value: number, width: number): string =>
  String(value).padStart(width, "0");

/** `HH:MM:SS.mmm`, the WebVTT timestamp of a millisecond. */
export const vttTimestamp = (totalMs: number): string => {
  const milliseconds = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
};
