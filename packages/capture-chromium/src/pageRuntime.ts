// The script the capture adds to the page after `timeweb` and before the page's own scripts. It is the seek layer
// of mechanism Hp (spec 0001, Revision "M0 measured: the clock decides the mechanism"): every animation the page
// starts (CSS transitions and animations, Web Animations) is paused and set to the time of the frame, so a frame
// does not depend on how much real time passed. A new animation first runs for two REAL animation frames (the
// "settle"): the compositor then has committed its start, and pausing it afterwards is deterministic; without the
// wait, about one launch in two differs at the first frame of an animation.
//
// Three calls, made by the capture as three separate round trips (the pause must not happen in the same task as
// the wait: the round trip gives the compositor one more real frame):
//   hasNewAnimations()      whether an animation started that the layer has not seen
//   twoRealFrames()         resolves after two real animation frames
//   seek(frame, fps, skewMs) pauses every new animation and sets each to `(frame - firstFrame) * 1000 / fps` ms plus
//                           the growth of `skewMs` since the animation was first seen (0 when the clock is on time);
//                           returns how many animations the document had when the seek began (the capture shoots a
//                           frame with a live animation until two PNGs agree; an animation that has run to its end
//                           and left the document no longer counts)
export const pageRuntime = `
(() => {
  const tracked = new Map();
  const realRequestFrame = (callback) =>
    window.timeweb ? window.timeweb.realtime.requestAnimationFrame(callback) : window.requestAnimationFrame(callback);

  window.__tsukuriHasNewAnimations = () => document.getAnimations().some((animation) => !tracked.has(animation));
  window.__tsukuriTwoRealFrames = () =>
    new Promise((resolve) => realRequestFrame(() => realRequestFrame(() => resolve(0))));
  window.__tsukuriSeek = (frame, fps, skewMs) => {
    const live = document.getAnimations();

    for (const animation of live) {
      if (!tracked.has(animation)) {
        animation.pause();
        tracked.set(animation, { frame, skewMs });
      }
    }

    for (const [animation, first] of tracked) {
      if (animation.playState === "idle") {
        tracked.delete(animation);
      } else {
        animation.currentTime = ((frame - first.frame) * 1000) / fps + (skewMs - first.skewMs);
      }
    }

    return live.length;
  };
})();
`;
