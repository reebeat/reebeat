import { String as Str } from "effect";
// Subtitle timestamps: plain functions over integer milliseconds.

const pad = (value: number, width: number): string =>
  Str.padStart(width, "0")(String(value));

/** `HH:MM:SS` and `mmm` of a millisecond, the parts both subtitle formats write. */
const clockParts = (totalMs: number): readonly [string, string] => {
  const milliseconds = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  return [
    `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`,
    pad(milliseconds, 3),
  ];
};

/** `HH:MM:SS.mmm`, the WebVTT timestamp of a millisecond. */
export const vttTimestamp = (totalMs: number): string => {
  const [clock, millis] = clockParts(totalMs);

  return `${clock}.${millis}`;
};

/** `HH:MM:SS,mmm`, the SubRip timestamp of a millisecond. */
export const srtTimestamp = (totalMs: number): string => {
  const [clock, millis] = clockParts(totalMs);

  return `${clock},${millis}`;
};
