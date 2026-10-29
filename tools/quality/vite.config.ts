import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The repository-scan tests (every source of every package, `tsc` scans, the lockfile) take 1 to 3 s on a
    // development machine and more than vitest's 5 s default on a two-core CI runner running them side by side.
    testTimeout: 60_000,
  },
});
