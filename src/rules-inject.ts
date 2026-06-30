import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createEngine, defaultConfig } from "@oh-my-opencode/rules-engine/engine";
import { findRuleCandidates } from "@oh-my-opencode/rules-engine/engine";
import { findProjectRoot } from "@oh-my-opencode/rules-engine/engine";
import { formatStaticBlock } from "@oh-my-opencode/rules-engine/engine";

function pluginDataRoot(): string {
  const root = process.env["GROK_PLUGIN_DATA"] ?? process.env["GROK_HOME"] ?? join(process.env["HOME"] ?? "/tmp", ".grok");
  return join(root, "state", "omo-grok-rules");
}

function sessionCachePath(sessionId: string): string {
  const dir = join(pluginDataRoot(), sessionId);
  mkdirSync(dir, { recursive: true });
  return join(dir, "engine-state.json");
}

function createRulesEngine(cwd: string) {
  const pluginRoot = process.env["GROK_PLUGIN_ROOT"] ?? process.cwd();
  return createEngine(defaultConfig(), {
    findCandidates: (options) => findRuleCandidates({ ...options, platform: process.platform, pluginRoot }),
    findProjectRoot,
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
  });
}

function hydrate(engine: ReturnType<typeof createRulesEngine>, cachePath: string): void {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      Object.assign(engine.state, parsed);
    }
  } catch {
    // fresh session
  }
}

function persist(engine: ReturnType<typeof createRulesEngine>, cachePath: string): void {
  writeFileSync(cachePath, JSON.stringify(engine.state));
}

export function injectStaticRules(cwd: string, sessionId: string): string {
  let block = "";
  try {
    const cachePath = sessionCachePath(sessionId);
    const engine = createRulesEngine(cwd);
    hydrate(engine, cachePath);
    engine.state.cwd = cwd;
    const loaded = engine.loadStaticRules(cwd);
    const rules = loaded.rules.filter((rule) => !engine.isStaticInjected(rule));
    block = rules.length > 0 ? formatStaticBlock(rules) : "";
    if (rules.length > 0) {
      for (const rule of rules) engine.markStaticInjected(rule);
    }
    persist(engine, cachePath);
  } catch {
    block = "";
  }
  if (block.length === 0) {
    block = loadOmoRulesFallback(cwd);
  }
  return block;
}

function loadOmoRulesFallback(cwd: string): string {
  const rulesDir = join(cwd, ".omo", "rules");
  const parts: string[] = [];
  try {
    for (const name of walkMdFiles(rulesDir)) {
      const rel = name.slice(rulesDir.length + 1);
      const body = readFileSync(name, "utf8").trim();
      if (body.length > 0) parts.push(`<OMO_RULE file="${rel}">\n${body}\n</OMO_RULE>`);
    }
  } catch {
    return "";
  }
  return parts.join("\n\n");
}

function walkMdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkMdFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

export function formatOmoRulesContext(block: string): string {
  if (block.trim().length === 0) return "";
  return `<OMO_RULES>\n${block}\n</OMO_RULES>`;
}