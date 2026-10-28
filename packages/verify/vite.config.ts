import { defineConfig } from "vite-plus";

// The integration tests start Chromium and ffmpeg: one test file at a time, and a deadline that fits a capture.
export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 180_000,
  },
});
