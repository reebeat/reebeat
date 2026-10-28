// The live suite (`bun run test:live`) runs the contract against the real model or binary; it is not part of
// `bun run test` or `ready`.
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { include: ["live/**/*.test.ts"], testTimeout: 300_000 },
});
