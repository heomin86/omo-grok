import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const scratchDir =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

const vendorAliases = {
  "@oh-my-opencode/rules-engine/engine": path.resolve(root, "vendor/rules-engine/src/engine/index.ts"),
  "@oh-my-opencode/comment-checker-core": path.resolve(root, "vendor/comment-checker-core/src/index.ts"),
  "@oh-my-opencode/hashline-core": path.resolve(root, "vendor/hashline-core/src/index.ts"),
  "@oh-my-opencode/utils": path.resolve(root, "vendor/utils/src/index.ts"),
  "@oh-my-opencode/utils/record-type-guard": path.resolve(root, "vendor/utils/src/record-type-guard.ts"),
};

export default defineConfig({
  resolve: {
    alias: vendorAliases,
  },
  test: {
    projects: [
      defineProject({
        root,
        resolve: {
          alias: vendorAliases,
        },
        test: {
          name: "omo-grok",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["node_modules/**", "vendor/**", "dist/**", "components/**"],
          globalSetup: [path.join(root, "scripts/vitest-global-setup.mjs")],
          env: {
            SCRATCH: scratchDir,
            RUN_VERIFY_GATES: process.env.RUN_VERIFY_GATES ?? "1",
            GROK_SKIP_PLUGIN_INSTALL: process.env.GROK_SKIP_PLUGIN_INSTALL ?? "1",
            GROK_PLUGIN_ROOT: process.env.GROK_PLUGIN_ROOT ?? root,
          },
          testTimeout: 300_000,
        },
      }),
      defineProject({
        root: path.join(root, "components/ulw-loop"),
        test: {
          name: "ulw-loop",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["node_modules/**", "dist/**"],
          setupFiles: ["test/vitest-setup.ts"],
          env: { SCRATCH: scratchDir },
        },
      }),
    ],
  },
});