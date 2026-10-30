// Observations of one build, made without reading `tsukuri check`'s code: frames at the resolved anchors, audio onsets,
// subtitles and chapters, the Deck in headless Chromium, and the speech cache. Each command prints raw lines, writes
// its files under <outDir>, and exits 1 when the observation disagrees with plan.json.
//   bun observe.ts <frames|onsets|subtitles|deck|cache> <buildDir> <outDir> [repoRoot] [cacheDir]
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { recordBrowser } from "./recordPid.ts";

interface Effect {
  readonly effectId: string;
  readonly endCommandFrame: number | null;
  readonly fireFrame: number;
  readonly instance: number;
}

interface TimedLine {
  readonly audio: { readonly file: string };
  readonly endFrame: number;
  readonly startFrame: number;
  readonly words: readonly { readonly startFrame: number }[];
}

interface TimedScene {
  readonly effects: readonly Effect[];
  readonly endFrame: number;
  readonly lines: readonly TimedLine[];
  readonly sceneId: string;
  readonly slideFrame: number;
}

interface Plan {
  readonly chapters: readonly { readonly id: string; readonly title: string }[];
  readonly scenes: readonly {
    readonly effects: readonly {
      readonly id: string;
      readonly verb: string;
      readonly target?: string;
    }[];
    readonly id: string;
    readonly lines: readonly { readonly text: string }[];
    readonly transition: string;
  }[];
  readonly settings: { readonly fps: number };
  readonly timeline: {
    readonly chapters: readonly {
      readonly chapterId: string;
      readonly startFrame: number;
    }[];
    readonly scenes: readonly TimedScene[];
  };
}

const [command, buildArg, outArg, rootArg, cacheArg] = process.argv.slice(2);

if (command === undefined || buildArg === undefined || outArg === undefined) {
  console.error(
    "usage: observe.ts <frames|onsets|subtitles|deck|cache> <buildDir> <outDir> [repoRoot] [cacheDir]"
  );
  process.exit(64);
}

const buildDir = resolve(buildArg);
const outDir = resolve(outArg);
const repoRoot = resolve(rootArg ?? ".");

await mkdir(outDir, { recursive: true });

const plan: Plan = await Bun.file(join(buildDir, "plan.json")).json();
const { fps } = plan.settings;
const mp4 = [...new Bun.Glob("*.mp4").scanSync(buildDir)][0];
const vtt = [...new Bun.Glob("*.vtt").scanSync(buildDir)][0];
const problems: string[] = [];
const say = (line: string): void => {
  console.log(line);
};

const fail = (line: string): void => {
  problems.push(line);
  say(`FAIL ${line}`);
};

const run = async (
  argv: readonly string[]
): Promise<{ out: string; err: string }> => {
  const child = Bun.spawn([...argv], { stderr: "pipe", stdout: "pipe" });

  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  await child.exited;

  return { err, out };
};

const frames = async (): Promise<void> => {
  if (mp4 === undefined) {
    throw new Error("no .mp4 in the build");
  }
  const montage = async (
    name: string,
    wanted: readonly number[]
  ): Promise<void> => {
    const picked = [...new Set(wanted.map((n) => Math.max(0, n)))].toSorted(
      (a, b) => a - b
    );

    const select = picked.map((n) => `eq(n\\,${n})`).join("+");
    const file = join(outDir, `${name}.png`);

    const { err } = await run([
      "ffmpeg",
      "-v",
      "error",
      "-y",
      "-i",
      join(buildDir, mp4),
      "-vf",
      `select='${select}',scale=640:-1,tile=${picked.length}x1`,
      "-frames:v",
      "1",
      "-fps_mode",
      "passthrough",
      file,
    ]);

    say(
      `${name}\tframes ${picked.join(",")}\t${err.trim() === "" ? file : `ffmpeg: ${err.trim()}`}`
    );

    if (err.trim() !== "") {
      fail(`${name}: ffmpeg said ${err.trim()}`);
    }
  };

  for (const scene of plan.timeline.scenes) {
    await montage(`${scene.sceneId}-slide`, [
      scene.slideFrame - 1,
      scene.slideFrame,
      scene.slideFrame + 1,
    ]);
    const kind = plan.scenes.find((s) => s.id === scene.sceneId)?.transition;

    if (kind === "auto-animate") {
      await montage(`${scene.sceneId}-transition`, [
        scene.slideFrame + 4,
        scene.slideFrame + 12,
        scene.slideFrame + 20,
      ]);
    }

    for (const effect of scene.effects) {
      // An effect with several instances (an `each` sound) has one montage per instance.
      const name =
        effect.instance === 1
          ? `${scene.sceneId}-${effect.effectId}`
          : `${scene.sceneId}-${effect.effectId}-${effect.instance}`;

      await montage(name, [
        effect.fireFrame - 1,
        effect.fireFrame,
        effect.fireFrame + 1,
      ]);
    }
  }
};

const detect = "silencedetect=noise=-50dB:d=0.1";

const silenceEnds = (log: string): number[] =>
  [...log.matchAll(/silence_end: (?<t>[\d.]+)/gu)].map((m) =>
    Number(m.groups?.t)
  );

// The expected onset of a Line is its scheduled start plus the first onset of its own cached audio file, found the same way.
// A sound is expected at its fire frame. An onset that follows another sound within 1.5 s is not separable by silence and is skipped.
const onsets = async (): Promise<void> => {
  if (mp4 === undefined) {
    throw new Error("no .mp4 in the build");
  }
  const cacheDir = resolve(
    repoRoot,
    cacheArg ??
      [
        ...new Bun.Glob("stories/*/speech-cache").scanSync({
          cwd: repoRoot,
          onlyFiles: false,
        }),
      ][0] ??
      ""
  );

  const { err } = await run([
    "ffmpeg",
    "-v",
    "info",
    "-i",
    join(buildDir, mp4),
    "-vn",
    "-af",
    detect,
    "-f",
    "null",
    "-",
  ]);

  const found = silenceEnds(err).map((t) => t * fps);
  say(
    `${detect} on the mp4: ${found.length} onsets (frames): ${found.map((f) => f.toFixed(2)).join(" ")}`
  );
  const wanted: { frame: number; label: string; what: string }[] = [];

  const spoken = plan.timeline.scenes.flatMap((s) =>
    s.lines.map((l) => ({ end: l.endFrame, start: l.startFrame }))
  );

  for (const scene of plan.timeline.scenes) {
    for (const line of scene.lines) {
      const own = await run([
        "ffmpeg",
        "-v",
        "info",
        "-i",
        join(cacheDir, line.audio.file),
        "-af",
        detect,
        "-f",
        "null",
        "-",
      ]);

      const lead = /silence_start: (?<s>-?[\d.]+)/u.exec(own.err);

      const first =
        lead !== null && Number(lead.groups?.s) < 0.01
          ? (silenceEnds(own.err)[0] ?? 0)
          : 0;

      wanted.push({
        frame: line.startFrame + first * fps,
        label: `${scene.sceneId}.l${scene.lines.indexOf(line) + 1}`,
        what: `narration (file onset ${first.toFixed(3)} s)`,
      });
    }

    for (const effect of scene.effects) {
      if (
        plan.scenes
          .find((s) => s.id === scene.sceneId)
          ?.effects.find((x) => x.id === effect.effectId)?.verb === "sound"
      ) {
        wanted.push({
          frame: effect.fireFrame,
          label: `${scene.sceneId}.${effect.effectId}`,
          what: "sound",
        });
      }
    }
  }

  for (const want of wanted) {
    const masked = wanted.some(
      (other) =>
        other.what === "sound" &&
        other.frame < want.frame &&
        want.frame - other.frame < fps * 1.5
    );

    if (masked) {
      say(
        `skip ${want.what} ${want.label}: scheduled ${want.frame.toFixed(2)}, within 1.5 s after a sound (see \`check\` F1/F8)`
      );
      continue;
    }

    // Silence detection cannot see a sound over speech; `check` F1's matched filter does (sc6.s4 sounds inside a Line).
    if (
      want.what === "sound" &&
      spoken.some((w) => want.frame >= w.start && want.frame <= w.end)
    ) {
      say(
        `skip ${want.what} ${want.label}: scheduled ${want.frame.toFixed(2)}, inside a spoken Line (see \`check\` F1: matched filter)`
      );
      continue;
    }

    const nearest = found.toSorted(
      (a, b) => Math.abs(a - want.frame) - Math.abs(b - want.frame)
    )[0];

    const delta = nearest === undefined ? Number.NaN : nearest - want.frame;
    const ok = Math.abs(delta) <= 1; // the map's "broken" threshold: an offset above 1 frame
    say(
      `${ok ? "ok  " : "FAIL"} ${want.what} ${want.label}: expected ${want.frame.toFixed(2)}, nearest onset ${nearest?.toFixed(2) ?? "none"} (${delta.toFixed(2)})`
    );

    if (!ok) {
      problems.push(`${want.label} onset`);
    }
  }
};

const stamp = (text: string): number => {
  const [h, m, s] = text.split(":").map(Number);

  return ((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * fps;
};

const subtitles = async (): Promise<void> => {
  if (vtt === undefined || mp4 === undefined) {
    throw new Error("no .vtt or .mp4 in the build");
  }
  const cues = (await Bun.file(join(buildDir, vtt)).text())
    .split(/\r?\n\r?\n/u)
    .map((block) => block.split(/\r?\n/u))
    .filter((rows) => rows[1]?.includes("-->"))
    .map(([id, times, ...text]) => ({
      id,
      text: text.join(" ").trim(),
      times: (times ?? "").split(" --> ").map(stamp),
    }));

  // The id of a Line is not stored (0004): it is its Scene's id, `.l` and its place in the Scene.
  const lines = plan.scenes.flatMap((s) =>
    s.lines.map((l, k) => ({ id: `${s.id}.l${k + 1}`, text: l.text }))
  );
  const timed = plan.timeline.scenes.flatMap((s) => s.lines);
  say(`.vtt cues ${cues.length}, Lines in the Plan ${lines.length}`);

  if (cues.length !== lines.length) {
    fail("cue count differs from Line count");
  }
  for (const [i, cue] of cues.entries()) {
    const line = lines[i];
    const time = timed[i];
    const startOff = (cue.times[0] ?? 0) - (time?.startFrame ?? 0);
    const endOff = (cue.times[1] ?? 0) - (time?.endFrame ?? 0);
    const same = cue.text === line?.text && cue.id === line?.id;
    const ok = same && Math.abs(startOff) <= 1 && Math.abs(endOff) <= 1;
    say(
      `${ok ? "ok  " : "FAIL"} ${cue.id}: text ${same ? "equal" : "DIFFERENT"}, start ${startOff.toFixed(2)} f, end ${endOff.toFixed(2)} f`
    );

    if (!ok) {
      problems.push(`cue ${cue.id}`);
    }
  }

  const probe = await run([
    "ffprobe",
    "-v",
    "error",
    "-show_chapters",
    "-show_streams",
    "-of",
    "json",
    join(buildDir, mp4),
  ]);

  await Bun.write(join(outDir, "ffprobe.json"), probe.out);

  const data: {
    chapters: { start_time: string; tags: { title: string } }[];
    streams: { codec_name: string; codec_type: string }[];
  } = JSON.parse(probe.out);

  say(
    `mp4 streams: ${data.streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(" ")}`
  );

  if (data.chapters.length !== plan.chapters.length) {
    fail(
      `mp4 chapters ${data.chapters.length}, Sections ${plan.chapters.length}`
    );
  }
  for (const [i, chapter] of data.chapters.entries()) {
    const start = Number(chapter.start_time) * fps;
    const want = plan.timeline.chapters[i]?.startFrame ?? Number.NaN;

    const ok =
      chapter.tags.title === plan.chapters[i]?.title &&
      Math.abs(start - want) <= 1;

    say(
      `${ok ? "ok  " : "FAIL"} chapter ${i + 1} "${chapter.tags.title}" starts at frame ${start.toFixed(2)}, scheduled ${want}`
    );

    if (!ok) {
      problems.push(`chapter ${i + 1}`);
    }
  }
};

const deck = async (): Promise<void> => {
  const chromiumPath = process.env.TSUKURI_CHROMIUM;

  if (chromiumPath === undefined) {
    throw new Error("TSUKURI_CHROMIUM is not set: run inside `devenv shell`");
  }
  const entry = join(
    repoRoot,
    "packages/capture-chromium/node_modules/playwright-core/index.mjs"
  );

  // A dynamic import: this script sits outside every workspace, so Playwright is found by the path of the checkout being verified, known only at run time.
  const { chromium } = await import(pathToFileURL(entry).href);

  const browser = await chromium.launch({
    args: ["--force-color-profile=srgb", "--disable-gpu"],
    executablePath: chromiumPath,
  });

  // Playwright starts Chromium detached, in a group of its own: record it so that cleanup.sh can stop it after an interruption.
  await recordBrowser(browser);

  const page = await browser.newPage({
    viewport: { height: 720, width: 1280 },
  });

  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  page.on(
    "console",
    (m: { text: () => string; type: () => string }) =>
      m.type() === "error" && errors.push(m.text())
  );
  await page.goto(pathToFileURL(join(buildDir, "deck.html")).href);
  await page.evaluate("window.tsukuriDeck.ready");
  const report: unknown[] = [];

  for (const scene of plan.scenes) {
    await page.evaluate(
      `window.tsukuriDeck.goToScene(${JSON.stringify(scene.id)})`
    );
    await page.waitForTimeout(1200);
    const slide = `.reveal .slides > section[data-scene="${scene.id}"]`;

    const seen: { fragments: number; notes: string[]; sounds: string } =
      await page.evaluate(`(() => {
      const s = document.querySelector(${JSON.stringify(slide)});
      return { fragments: s.querySelectorAll(".fragment.effect").length, notes: [...s.querySelectorAll("aside.notes p")].map((p) => p.textContent), sounds: s.getAttribute("data-sounds") ?? "" };
    })()`);

    // A step is the start of each show or focus, and the end of each focus ring that ends by its own `until` (0004).
    const endSteps =
      plan.timeline.scenes
        .find((t) => t.sceneId === scene.id)
        ?.effects.filter((e) => e.endCommandFrame !== null).length ?? 0;

    const visible =
      scene.effects.filter((e) => e.verb !== "sound").length + endSteps;

    const notesOk =
      JSON.stringify(seen.notes) ===
      JSON.stringify(scene.lines.map((l) => l.text));

    say(
      `${notesOk && seen.fragments === visible ? "ok  " : "FAIL"} ${scene.id}: ${seen.fragments} fragments (Plan: ${visible} show/focus), notes ${notesOk ? "equal the Lines" : "DIFFER"}, slide sounds "${seen.sounds}"`
    );

    if (!notesOk || seen.fragments !== visible) {
      problems.push(`deck ${scene.id}`);
    }
    await page.screenshot({ path: join(outDir, `deck-${scene.id}-0.png`) });

    for (let step = 1; step <= seen.fragments; step += 1) {
      await page.evaluate("window.tsukuriDeck.stepFragment()");
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(outDir, `deck-${scene.id}-${step}.png`),
      });
    }

    report.push({ scene: scene.id, ...seen });
  }

  await browser.close();
  await Bun.write(join(outDir, "deck.json"), JSON.stringify(report, null, 2));
  say(`page errors: ${errors.length}${errors.map((e) => `\n  ${e}`).join("")}`);

  if (errors.length > 0) {
    problems.push("page errors");
  }
};

const cache = async (): Promise<void> => {
  const manifest: { assets: unknown[] } = await Bun.file(
    join(buildDir, "build.json")
  ).json();

  const lines = plan.scenes.flatMap((s) => s.lines).length;
  say(
    `speech assets used by the build: ${manifest.assets.length} of ${lines} Lines`
  );

  if (manifest.assets.length !== lines) {
    fail("not every Line has a cache asset in build.json");
  }
  const target = cacheArg ?? "stories/*/speech-cache";

  if (isAbsolute(target) && !target.startsWith(repoRoot)) {
    say(
      `cache ${target} is outside the checkout: no git status; the committed speech cache was not selected`
    );

    return;
  }

  const { out } = await run([
    "git",
    "-C",
    repoRoot,
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    target,
  ]);

  say(
    `git status of ${target}: ${out.trim() === "" ? "unchanged" : `\n${out}`}`
  );

  if (out.trim() !== "") {
    fail("the build changed the committed speech cache");
  }
};

const table = { cache, deck, frames, onsets, subtitles } as const;
const chosen = table[command as keyof typeof table];

if (chosen === undefined) {
  console.error(`unknown command ${command}`);
  process.exit(64);
}

await chosen();

await Bun.write(join(outDir, `${command}.problems.txt`), problems.join("\n"));

process.exit(problems.length === 0 ? 0 : 1);
