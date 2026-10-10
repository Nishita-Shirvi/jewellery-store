import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Tests that need a real PostgreSQL database (DATABASE_URL). Run with `npm run test:db`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
