// Time (spec 0004). The IR holds EXACT time, independent of the frame rate: a whole number of FLICKS, 1/705,600,000 of
// a second. A flick divides evenly into one frame of 24, 25, 30, 48, 50, 60 and 120 fps (and of 44.1 and 48 kHz audio
// samples), so an offset such as `+0.1s` is 70,560,000 flicks exactly, never a float, and the same IR means the same
// time at every rate. A FRAME exists only at render time, at the Plan's `fps` (`Settings.fps`, nominal, and `ntsc`, the
// 1000/1001 fraction: 24000/1001 and 30000/1001):
//
//   frame = floor(t x rate + 1/2)     the NEAREST frame, a half going to the later one (the rule of 0001 and 0002)
//
// computed in integers (BigInt), so no float rounds a half the wrong way. Plain functions.
import type { Settings } from "./plan.ts";

/** Flicks in one second (Facebook's `flicks`). */
export const flicksPerSecond = 705_600_000;

/** A frame rate as a rational: `num` frames in `den` seconds. */
export interface Rate {
  readonly den: number;
  readonly num: number;
}

/** The exact frame rate of a Plan: `fps`, or `fps` x 1000/1001 when `ntsc`. */
export const rateOf = (settings: Pick<Settings, "fps" | "ntsc">): Rate =>
  settings.ntsc
    ? { den: 1001, num: settings.fps * 1000 }
    : { den: 1, num: settings.fps };

/** The frame nearest to `flicks` from the start, at `rate`; a half goes to the later frame (toward +infinity). */
export const framesOfFlicks = (rate: Rate, flicks: number): number => {
  const whole = BigInt(Math.round(flicks));
  const second = BigInt(flicksPerSecond);
  const numerator = 2n * whole * BigInt(rate.num) + BigInt(rate.den) * second;
  const divisor = 2n * BigInt(rate.den) * second;
  const quotient = numerator / divisor;

  return Number(
    numerator % divisor !== 0n && numerator < 0n ? quotient - 1n : quotient
  );
};

/** Seconds as flicks, to the nearest flick. */
export const flicksOfSeconds = (seconds: number): number =>
  Math.round(seconds * flicksPerSecond);

/** Milliseconds as flicks (705,600 each). */
export const flicksOfMilliseconds = (milliseconds: number): number =>
  Math.round(milliseconds * (flicksPerSecond / 1000));

/** A number of frames at `fps` as flicks: the time a lag that was measured in frames lasts. */
export const flicksOfFrames = (fps: number, frames: number): number =>
  Math.round((frames * flicksPerSecond) / fps);
