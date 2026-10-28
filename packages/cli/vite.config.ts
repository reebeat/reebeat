import { defineConfig } from "vite-plus";

// The tests build small videos on a real ffmpeg: one test file at a time, and a deadline that fits a mux.
export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 180_000,
  },
});
