import { defineConfig } from "vite-plus";

// Some tests start ffmpeg or a server process: one test file at a time, and a deadline that fits a build.
export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
