import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Tests that need a real PostgreSQL database (DATABASE_URL). Run with `npm run test:db`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Email templates are .tsx: use the automatic JSX runtime (as Next.js does) so they render here.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
