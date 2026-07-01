export const CHANGED_FILE_PATHS: readonly string[];

export function writeChangedFilesManifest(scratch: string, root: string): void;

export function captureUlwGrokGateEvidence(scratch: string, root: string): void;

export function runVerifyGates(
  scratch: string,
  root: string,
  env?: Record<string, string>,
): void;

export function writeScratchEvidenceComplete(scratch: string, generator?: string): void;

export interface EmitScratchEvidenceOptions {
  scratch: string;
  root: string;
  generator?: string;
  build?: boolean;
  runVerifyGates?: boolean;
}

export function emitScratchEvidence(opts?: EmitScratchEvidenceOptions): void;
