#!/usr/bin/env node
import { spawn } from "node:child_process";

const [subcommand, payloadJson] = process.argv.slice(2);
if (!subcommand || !payloadJson) {
  process.stderr.write("usage: run-gate.mjs <subcommand> '<json>'\n");
  process.exit(2);
}

const pluginRoot = process.env.GROK_PLUGIN_ROOT;
if (!pluginRoot) {
  process.stderr.write("GROK_PLUGIN_ROOT required\n");
  process.exit(2);
}

const REQUIRES_OUTPUT = new Set([
  "session-start",
  "user-prompt",
  "stop",
  "post-tool-comment-checker",
]);

const cli = `${pluginRoot}/dist/cli.js`;
const child = spawn(process.execPath, [cli, subcommand], {
  env: { ...process.env, GROK_PLUGIN_ROOT: pluginRoot },
  stdio: ["pipe", "pipe", "inherit"],
});

let stdout = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
child.stdin.end(payloadJson);
child.on("close", (code) => {
  if (
    stdout.trim().length === 0 &&
    code === 0 &&
    REQUIRES_OUTPUT.has(subcommand)
  ) {
    process.exit(3);
  }
  process.exit(code ?? 1);
});