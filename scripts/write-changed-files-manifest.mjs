#!/usr/bin/env node
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeChangedFilesManifest } from "./scratch-evidence-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  join(tmpdir(), "omo-grok-scratch");

writeChangedFilesManifest(scratch, root);
process.stdout.write(`CHANGED_FILES_MANIFEST_OK scratch=${scratch}\n`);