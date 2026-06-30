import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { computeLineHash, HASHLINE_REF_PATTERN } from "@oh-my-opencode/hashline-core";

import type { GrokHookEvent } from "./grok-io.js";

type HashlineCache = {
  path: string;
  rel_path: string;
  updated_at: string;
  lines: Record<string, string>;
};

const HASH_REF_RE = /([0-9]+)#([ZPMQVRWSNKTXJBYH]{2})/g;

export function hashlineEnabled(): boolean {
  return process.env.OMO_HASHLINE !== "0" && process.env.OMG_HASHLINE !== "0";
}

export function grokHome(): string {
  return process.env.GROK_HOME ?? join(process.env.HOME ?? "", ".grok");
}

export function isSkillPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.endsWith("/SKILL.md") || normalized.endsWith("SKILL.md");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashlineCacheFile(sessionId: string, absPath: string): string {
  return join(grokHome(), "state", "hashline", sessionId, `${sha256Hex(absPath)}.json`);
}

function resolveWorkspacePath(filePath: string, workspaceRoot: string): string {
  if (isAbsolute(filePath)) return resolve(filePath);
  return resolve(workspaceRoot, filePath);
}

function relWorkspacePath(absPath: string, workspaceRoot: string): string {
  try {
    return relative(resolve(workspaceRoot), resolve(absPath)).replace(/\\/g, "/");
  } catch {
    return absPath;
  }
}

function pickPath(input: Record<string, unknown>): string | undefined {
  for (const key of ["path", "filePath", "file_path", "target_file", "targetFile"]) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function pickOldString(input: Record<string, unknown>): string | undefined {
  for (const key of ["old_string", "oldString"]) {
    const value = input[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export function updateHashlineCacheFromRead(
  sessionId: string,
  workspaceRoot: string,
  readPath: string,
): void {
  if (!hashlineEnabled() || !readPath || isSkillPath(readPath)) return;
  const absPath = resolveWorkspacePath(readPath, workspaceRoot);
  if (!existsSync(absPath)) return;
  const relPath = relWorkspacePath(absPath, workspaceRoot);
  if (relPath && isSkillPath(relPath)) return;

  const text = readFileSync(absPath, "utf8").replace(/\r\n/g, "\n");
  let lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines = lines.slice(0, -1);
  }

  const lineHashes: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    lineHashes[String(i + 1)] = computeLineHash(i + 1, lines[i] ?? "");
  }

  const payload: HashlineCache = {
    path: absPath,
    rel_path: relPath || absPath,
    updated_at: new Date().toISOString(),
    lines: lineHashes,
  };

  const cacheFile = hashlineCacheFile(sessionId, absPath);
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function validateHashlinePreTool(event: GrokHookEvent): string | null {
  if (!hashlineEnabled()) return null;
  const tool = (event.toolName ?? "").toLowerCase();
  if (!["strreplace", "str_replace", "edit", "multiedit", "multi_edit"].includes(tool)) {
    return null;
  }
  const input = event.toolInput ?? {};
  const filePath = pickPath(input);
  const oldString = pickOldString(input);
  if (!filePath || !oldString) return null;

  const refs = [...oldString.matchAll(HASH_REF_RE)];
  if (refs.length === 0) return null;

  const absPath = resolveWorkspacePath(filePath, event.workspaceRoot);
  const cacheFile = hashlineCacheFile(event.sessionId, absPath);
  if (!existsSync(cacheFile)) {
    return `Hashline: LINE#ID anchors in old_string but no read cache for this file. Read ${filePath} first, then retry with current tags.`;
  }

  let cache: HashlineCache;
  try {
    cache = JSON.parse(readFileSync(cacheFile, "utf8")) as HashlineCache;
  } catch {
    return "Hashline: corrupt read cache; re-read the file before editing.";
  }
  if (!cache.lines || Object.keys(cache.lines).length === 0) {
    return "Hashline: corrupt read cache; re-read the file before editing.";
  }

  const stale: Array<{ line: number; expected: string; cached?: string }> = [];
  for (const match of refs) {
    const lineS = match[1];
    const expected = match[2];
    const cached = cache.lines[lineS];
    const lineNo = Number.parseInt(lineS, 10);
    if (cached === undefined) {
      stale.push({ line: lineNo, expected });
      continue;
    }
    if (cached !== expected) {
      stale.push({ line: lineNo, expected, cached });
    }
  }
  if (stale.length === 0) return null;

  const rel = cache.rel_path || filePath;
  const parts = [
    `Hashline: stale LINE#ID in StrReplace for ${rel}. File changed since last Read — re-read and copy fresh tags.`,
  ];
  for (const entry of stale.sort((a, b) => a.line - b.line)) {
    if (entry.cached !== undefined) {
      parts.push(`  line ${entry.line}: used ${entry.line}#${entry.expected}, cache has ${entry.line}#${entry.cached}`);
    } else {
      parts.push(`  line ${entry.line}: used ${entry.line}#${entry.expected}, not in cache`);
    }
  }
  return parts.join("\n");
}

export function collectHashlineRefs(text: string): string[] {
  return [...text.matchAll(HASHLINE_REF_PATTERN)].map((m) => m[0]);
}

export function handlePostToolRead(event: GrokHookEvent): void {
  const input = event.toolInput ?? {};
  const readPath = pickPath(input);
  if (!readPath) return;
  updateHashlineCacheFromRead(event.sessionId, event.workspaceRoot, readPath);
}