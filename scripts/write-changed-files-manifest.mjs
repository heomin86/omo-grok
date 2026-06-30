#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeChangedFilesManifest } from "./scratch-evidence-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

writeChangedFilesManifest(scratch, root);
process.stdout.write(`CHANGED_FILES_MANIFEST_OK scratch=${scratch}\n`);