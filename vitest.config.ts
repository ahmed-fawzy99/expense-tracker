import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(__dirname, "./src"),
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["convex/**/*.ts", "src/**/*.{ts,tsx}"],
      exclude: [
        "convex/_generated/**",
        "convex/**/*.test.ts",
        "convex/**/__tests__/**",
        "src/**/__tests__/**",
        "src/routeTree.gen.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/components/ui/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "backend",
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
          include: ["convex/__tests__/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["src/__tests__/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/__tests__/setup.ts"],
          css: false,
        },
      },
    ],
  },
});
