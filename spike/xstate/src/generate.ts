// Throwaway generator: IR (+ speech timings) -> XState v6 `MachineJSON`, data only.
//
//   Story  = parallel statechart (the root)
//     scenes   compound region: one compound state per Scene; its atomic states are the States (dwell), the Beats
//              are timed edges s(k) -> b(k) -> s(k+1) (a Beat has a window, an XState transition has none, so the
//              window is the state `b(k)`); a final state `end` completes the Scene (`xstate.done.state`)
//     elements parallel region: one parallel state per Element id with the regions presence / position / style
//     sound    parallel region: one voice per sound name (idle -> cued -> idle through an eventless transition)
//
// Everything is a string, a number or a plain object: targets, `after` delays, `matches` filters, built-in actions
// (`@xstate.raise` with `delay`) and ONE named custom action `mark` (the implementation map the caller supplies).
// The time of each event is NOT in the IR: it comes from the speech assets (word times, line durations) and from the
// renderer lifecycle constants below; the generator resolves it (SMIL-style anchor resolution is the part XState does
// not do) and writes it as `after` delays and delayed raises.
import type { MachineJSON } from "xstate";
import type { Anchor, Ir, IrElement, IrScene, Speech, SpeechWord, When } from "./ir.ts";

/** Defaults of release 1 (packages/core/src/build.ts of 0004): the pacing the Plan uses, in ms. */
export const pacing = { lineGapMs: 500, sceneLeadMs: 1000, sceneTailMs: 500 } as const;
/** `referenceLifecycle` of spec 0004 (plan.ts): the transition windows and the `show` window, in ms. */
export const lifecycle = { showMs: 133, transitionMs: { "auto-animate": 800, cut: 0, default: 400 } } as const;
const flicksPerMs = 705_600;

export interface DeclaredState {
  readonly id: string;
  readonly enterMs: number;
  readonly leaveMs: number;
}
export interface DeclaredBeat {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
}
export interface DeclaredCue {
  readonly id: string;
  readonly name: string;
  readonly atMs: number;
}
/** What the generator declared, independent of what the interpreter then does: the oracle of the measurements. */
export interface Declared {
  readonly scenes: readonly { readonly id: string; readonly startMs: number; readonly endMs: number }[];
  readonly states: readonly DeclaredState[];
  readonly beats: readonly DeclaredBeat[];
  readonly cues: readonly DeclaredCue[];
  readonly totalMs: number;
}

const mark = (event: string, id: string) => ({ type: "mark", params: { event, id } });
const raise = (type: string, payload: Record<string, unknown>, delay?: number) => ({
  type: "@xstate.raise" as const,
  event: { type, ...payload },
  ...(delay === undefined ? {} : { delay }),
});

const norm = (w: string): string => w.toLowerCase().replace(/[^a-z0-9']/g, "");

interface TimedScene {
  readonly scene: IrScene;
  readonly startMs: number;
  readonly endMs: number;
  readonly words: readonly SpeechWord[];
}

/** Lay the Lines of every Scene on one timeline, exactly as `timeScene` of 0004 does (in ms instead of frames). */
const timeline = (ir: Ir, speech: ReadonlyMap<string, Speech>): readonly TimedScene[] => {
  let cursor = 0;
  return ir.scenes.map((scene) => {
    const startMs = cursor;
    const words: SpeechWord[] = [];
    scene.lines.forEach((line, index) => {
      const asset = speech.get(line.text);
      if (asset === undefined) throw new Error(`no speech asset for line ${line.id}: ${line.text}`);
      const gap = index === 0 ? pacing.sceneLeadMs : pacing.lineGapMs;
      const lineStart = cursor + gap + Math.round(line.hints.pauseBefore * 1000);
      for (const w of asset.words) words.push({ w: w.w, startMs: lineStart + w.startMs, endMs: lineStart + w.endMs });
      cursor = lineStart + asset.durationMs;
    });
    cursor += pacing.sceneTailMs;
    return { scene, startMs, endMs: cursor, words };
  });
};

const anchorMs = (anchor: Anchor, t: TimedScene): number => {
  if (anchor.kind === "word") {
    const hits = t.words.filter((w) => norm(w.w) === norm(anchor.phrase));
    const hit = hits[anchor.occurrence - 1];
    if (hit === undefined) throw new Error(`${t.scene.id}: word "${anchor.phrase}" #${anchor.occurrence} not in the speech`);
    return anchor.edge === "start" ? hit.startMs : hit.endMs;
  }
  // Edge anchors: only the slide change of the Scene and a point of a move window (simplified: the window is the
  // transition window of the Scene, without the renderer's start lag).
  const window = lifecycle.transitionMs[t.scene.transition];
  if (anchor.at === "start") return t.startMs;
  if (anchor.at === "end") return t.startMs + window;
  return t.startMs + Math.round((window * anchor.at.percent) / 100);
};

const whenMs = (when: When, t: TimedScene): number => {
  if ("absoluteFlicks" in when) return t.startMs + Math.round(when.absoluteFlicks / flicksPerMs);
  if (when.event.kind === "anchor") return anchorMs(when.event.anchor, t);
  const { offset, of } = when.event;
  if (offset.unit !== "flicks") throw new Error(`offset unit ${offset.unit} is not handled by the spike`);
  return anchorMs(of.anchor, t) + Math.round(offset.value / flicksPerMs);
};

interface Beat {
  readonly startMs: number;
  readonly windowMs: number;
  readonly reveals: readonly string[];
  readonly focuses: readonly string[];
}

/** The Beats of a Scene: one per distinct fire time of a `show`/`focus` after the first frame (spec 0004, machines.ts). */
const beatsOf = (t: TimedScene): readonly Beat[] => {
  const fires = t.scene.effects
    .filter((e) => e.verb !== "sound")
    .map((e) => ({ e, at: whenMs(e.when, t) }))
    .filter((f) => f.at > t.startMs)
    .sort((a, b) => a.at - b.at);
  const beats: Beat[] = [];
  for (const f of fires) {
    const last = beats[beats.length - 1];
    const windowMs = f.e.verb === "show" ? lifecycle.showMs : 0;
    const reveals = f.e.verb === "show" && f.e.target ? [f.e.target] : [];
    const focuses = f.e.verb === "focus" && f.e.target ? [f.e.target] : [];
    if (last !== undefined && f.at < last.startMs + Math.max(last.windowMs, 1)) {
      // A fire time inside the window of the running Beat (or equal to its start) joins that Beat: at exact time
      // a `focus` 20 ms after a `show` starts is not a new State, which frames used to hide by rounding.
      beats[beats.length - 1] = {
        ...last,
        windowMs: Math.max(last.windowMs, f.at - last.startMs + windowMs),
        reveals: [...last.reveals, ...reveals],
        focuses: [...last.focuses, ...focuses],
      };
    } else {
      beats.push({ startMs: f.at, windowMs, reveals, focuses });
    }
  }
  beats.forEach((b, i) => {
    const next = beats[i + 1];
    if (next !== undefined && b.startMs + b.windowMs > next.startMs) throw new Error(`${t.scene.id}: Beats overlap`);
    if (b.startMs + b.windowMs > t.endMs) throw new Error(`${t.scene.id}: a Beat runs past the Scene`);
  });
  return beats;
};

const elementId = (e: IrElement): string => e.id;

/** The identity diff of a Scene against the Elements present before it (ours, not XState's). */
const diffOf = (scene: IrScene, previous: IrScene | undefined, present: ReadonlySet<string>) => {
  const ids = new Set(scene.elements.map(elementId));
  const before = new Map((previous?.elements ?? []).map((e) => [e.id, e]));
  const enter = scene.elements.filter((e) => e.visible && !present.has(e.id)).map(elementId);
  const exit = [...present].filter((id) => !ids.has(id));
  const move: string[] = [];
  const update: string[] = [];
  for (const e of scene.elements) {
    const was = before.get(e.id);
    if (was === undefined || !present.has(e.id)) continue;
    if (was.cell !== e.cell) move.push(e.id);
    if (was.class !== e.class || was.text !== e.text) update.push(e.id);
  }
  return { enter, exit, move, update };
};

const elementRegions = (id: string) => {
  const on = (event: string, target: string) => ({ [event]: { matches: { el: id }, target } });
  const leaveEnter = (event: string, state: string) => ({
    entry: [mark(event, `${id}.${state}`)],
  });
  return {
    type: "parallel" as const,
    states: {
      presence: {
        initial: "absent",
        states: {
          absent: { on: on("element.enter.start", "entering") },
          entering: { ...leaveEnter("element.enter", "presence.entering"), on: on("element.enter.end", "present") },
          present: { ...leaveEnter("element.present", "presence.present"), on: on("element.exit.start", "exiting") },
          exiting: { ...leaveEnter("element.exit", "presence.exiting"), on: on("element.exit.end", "absent") },
        },
      },
      position: {
        initial: "still",
        states: {
          still: { on: on("element.move.start", "moving") },
          moving: { ...leaveEnter("element.move", "position.moving"), on: on("element.move.end", "still") },
        },
      },
      style: {
        initial: "steady",
        states: {
          steady: { on: on("element.update.start", "updating") },
          updating: { ...leaveEnter("element.update", "style.updating"), on: on("element.update.end", "steady") },
        },
      },
    },
  };
};

export interface Generated {
  readonly json: MachineJSON;
  readonly declared: Declared;
}

export const generate = (ir: Ir, speech: ReadonlyMap<string, Speech>): Generated => {
  const timed = timeline(ir, speech);
  const sceneStates: Record<string, unknown> = {};
  const declaredStates: DeclaredState[] = [];
  const declaredBeats: DeclaredBeat[] = [];
  const declaredCues: DeclaredCue[] = [];
  const declaredScenes: { id: string; startMs: number; endMs: number }[] = [];
  const soundNames: string[] = [];
  const elementIds: string[] = [];
  let present = new Set<string>();

  timed.forEach((t, i) => {
    const { scene } = t;
    const previous = ir.scenes[i - 1];
    const next = ir.scenes[i + 1];
    const windowMs = lifecycle.transitionMs[scene.transition];
    const beats = beatsOf(t);
    const diff = diffOf(scene, previous, present);
    for (const e of scene.elements) if (!elementIds.includes(e.id)) elementIds.push(e.id);
    declaredScenes.push({ id: scene.id, startMs: t.startMs, endMs: t.endMs });

    // Entry of the Scene: the generated events (Element edges from the identity diff, the slide change, the sound
    // cues). Everything that is delayed is a delayed raise: the timer is the interpreter's.
    const entry: unknown[] = [mark("scene.enter", scene.id), mark("transition.start", scene.id)];
    const timedRaise = (type: string, el: string, at: number) => entry.push(raise(type, { el }, at));
    for (const [kind, ids] of [["enter", diff.enter], ["exit", diff.exit], ["move", diff.move], ["update", diff.update]] as const) {
      for (const el of ids) {
        entry.push(raise(`element.${kind}.start`, { el }));
        timedRaise(`element.${kind}.end`, el, windowMs);
      }
    }
    entry.push(raise("transition.end", { scene: scene.id }, windowMs));
    for (const e of scene.effects.filter((f) => f.verb === "sound")) {
      const atMs = whenMs(e.when, t);
      const name = e.name ?? "sound";
      if (!soundNames.includes(name)) soundNames.push(name);
      declaredCues.push({ id: `${scene.id}.${e.id}`, name, atMs });
      entry.push(raise("sound.cue", { name, cue: `${scene.id}.${e.id}` }, atMs - t.startMs));
    }

    // States and Beats. State k is entered at `enter`, left at the start of Beat k (or at the end of the Scene).
    const states: Record<string, unknown> = {};
    let enterMs = t.startMs;
    const stateId = (k: number) => `${scene.id}.s${k}`;
    beats.forEach((b, k) => {
      const sid = stateId(k + 1);
      const bid = `${scene.id}.b${k + 1}`;
      declaredStates.push({ id: sid, enterMs, leaveMs: b.startMs });
      declaredBeats.push({ id: bid, startMs: b.startMs, endMs: b.startMs + b.windowMs });
      states[`s${k + 1}`] = {
        entry: [mark("state.enter", sid)],
        exit: [mark("state.leave", sid)],
        after: { [b.startMs - enterMs]: { target: `b${k + 1}` } },
        meta: { state: { id: sid, elements: scene.elements.filter((e) => e.visible || present.has(e.id)).map((e) => e.id) } },
      };
      states[`b${k + 1}`] = {
        entry: [
          mark("beat.start", bid),
          ...b.reveals.flatMap((el) => [raise("element.enter.start", { el }), raise("element.enter.end", { el }, b.windowMs)]),
        ],
        exit: [mark("beat.end", bid)],
        after: { [b.windowMs]: { target: `s${k + 2}` } },
        meta: { beat: { id: bid, from: sid, to: stateId(k + 2), reveals: b.reveals, focuses: b.focuses } },
      };
      enterMs = b.startMs + b.windowMs;
    });
    const last = beats.length + 1;
    declaredStates.push({ id: stateId(last), enterMs, leaveMs: t.endMs });
    states[`s${last}`] = {
      entry: [mark("state.enter", stateId(last))],
      exit: [mark("state.leave", stateId(last))],
      after: { [t.endMs - enterMs]: { target: "end" } },
      meta: { state: { id: stateId(last) } },
    };
    states.end = { type: "final" };

    sceneStates[scene.id] = {
      initial: "s1",
      entry,
      exit: [mark("scene.leave", scene.id)],
      states,
      ...(next === undefined
        ? { on: { "xstate.done.state": { matches: { stateId: `story.scenes.${scene.id}` }, target: "end" } } }
        : { on: { "xstate.done.state": { matches: { stateId: `story.scenes.${scene.id}` }, target: next.id } } }),
      meta: {
        scene: {
          id: scene.id,
          chapterId: scene.chapterId,
          transition: scene.transition,
          heading: scene.heading,
          line: scene.line,
          elements: scene.elements,
          lines: scene.lines,
          effects: scene.effects,
          events: scene.events,
        },
      },
    };

    // Presence after the Scene: the identity diff plus the Elements revealed by a `show`.
    const shown = beats.flatMap((b) => b.reveals);
    const ids = new Set(scene.elements.map(elementId));
    present = new Set([...[...present].filter((id) => ids.has(id)), ...diff.enter, ...shown]);
  });
  sceneStates.end = { type: "final" };

  const elementStates = Object.fromEntries(elementIds.map((id) => [id, elementRegions(id)]));
  const voice = (name: string) => ({
    initial: "idle",
    states: {
      idle: { on: { "sound.cue": { matches: { name }, target: "cued" } } },
      cued: { entry: [{ type: "mark", params: { event: "sound.start", id: name } }], always: { target: "idle" } },
    },
  });

  const json: MachineJSON = {
    id: "story",
    version: String(ir.version),
    type: "parallel",
    meta: {
      story: {
        title: ir.title,
        ...(ir.author === undefined ? {} : { author: ir.author }),
        speed: ir.speed,
        version: ir.version,
        chapters: ir.chapters,
      },
    },
    states: {
      scenes: { initial: ir.scenes[0]!.id, states: sceneStates as never },
      elements: { type: "parallel", states: elementStates as never },
      sound: { type: "parallel", states: Object.fromEntries(soundNames.map((n) => [n, voice(n)])) as never },
    },
  };

  return {
    json,
    declared: {
      scenes: declaredScenes,
      states: declaredStates,
      beats: declaredBeats,
      cues: declaredCues,
      totalMs: timed[timed.length - 1]!.endMs,
    },
  };
};
