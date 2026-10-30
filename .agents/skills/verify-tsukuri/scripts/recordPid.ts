// Records a process that a step of `run.sh` started outside the step's own process group, so that `cleanup.sh` can stop it.
// Playwright launches Chromium detached (a new session and process group of its own), so the group `run.sh` recorded for the
// step does not contain it. The line written is `<pid> <start time>`, the same form `run.sh` writes, in the file named by
// TSUKURI_VERIFY_PIDS (set by `run.sh`; absent when the script is run by hand, then nothing is recorded).
// Playwright 1.64 has no `browser.process()`: the browser process id comes from Chromium's own `SystemInfo.getProcessInfo`.
import { appendFileSync, readFileSync } from "node:fs";

interface ProcessInfo {
  readonly id: number;
  readonly type: string;
}

/** The part of a Playwright Chromium `Browser` that is used here. */
export interface BrowserWithCdp {
  readonly newBrowserCDPSession: () => Promise<{
    readonly send: (
      method: string
    ) => Promise<{ readonly processInfo: readonly ProcessInfo[] }>;
  }>;
}

/** Field 22 of /proc/<pid>/stat: the start time in clock ticks. The command name (field 2) may contain spaces, so count after it. */
const startTime = (pid: number): string => {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");

  return stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19] ?? "";
};

/** Appends the browser process (the leader of Chromium's group) to the file named by TSUKURI_VERIFY_PIDS, if there is one. */
export const recordBrowser = async (
  browser: BrowserWithCdp
): Promise<number | undefined> => {
  const file = process.env.TSUKURI_VERIFY_PIDS;
  const { processInfo } = await (
    await browser.newBrowserCDPSession()
  ).send("SystemInfo.getProcessInfo");
  const pid = processInfo.find((info) => info.type === "browser")?.id;

  if (pid !== undefined && file !== undefined && file !== "") {
    appendFileSync(file, `${pid} ${startTime(pid)}\n`);
  }

  return pid;
};
