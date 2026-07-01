import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { computeNextPrompt } from "../src/orchestrator-decision.js";
import { type GrokInvoker, orchestrate, parseTurn } from "../src/orchestrator.js";
import { activateUlwLoop } from "../src/ultrawork.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const ws = mkdtempSync(join(tmpdir(), "omo-grok-orch-"));
  temps.push(ws);
  return ws;
}

describe("headless orchestrator", () => {
  describe("computeNextPrompt", () => {
    it("returns null when no continuation state exists", async () => {
      // #given a workspace with no .omo plan
      const ws = workspace();
      // #when computing the next prompt
      const next = await computeNextPrompt(ws, "s1", "anything");
      // #then there is nothing to continue
      expect(next).toBeNull();
    });

    it("returns a loop directive while an ultrawork task is unfinished", async () => {
      // #given an active lightweight ultrawork loop
      const ws = workspace();
      activateUlwLoop(ws, "s1", "do the thing");
      // #when the last message does not promise completion
      const next = await computeNextPrompt(ws, "s1", "still working");
      // #then it steers the agent to keep going
      expect(next).toContain("ULTRAWORK LOOP");
    });
  });

  describe("orchestrate", () => {
    it("drives the ultrawork loop to completion via DONE then VERIFIED", async () => {
      // #given an ultrawork loop and a fake grok that finishes on the 3rd turn
      const ws = workspace();
      activateUlwLoop(ws, "sess", "ship it");
      const prompts: string[] = [];
      const replies = ["progress", "<promise>DONE</promise>", "<promise>VERIFIED</promise>"];
      const invoke: GrokInvoker = async (args) => {
        prompts.push(args.prompt);
        return { text: replies[prompts.length - 1] ?? "", sessionId: args.sessionId, stopReason: "EndTurn" };
      };
      // #when orchestrating
      const result = await orchestrate({ cwd: ws, initialPrompt: "start", sessionId: "sess", invoke });
      // #then it resumes until VERIFIED clears the loop
      expect(result.stopReason).toBe("completed");
      expect(result.iterations).toBe(3);
      expect(prompts[0]).toBe("start");
      expect(prompts[1]).toContain("ULTRAWORK LOOP");
      expect(prompts[2]).toContain("VERIFICATION");
    });

    it("stops at max-iterations when the task never completes", async () => {
      // #given an ultrawork loop and a fake grok that never promises completion
      const ws = workspace();
      activateUlwLoop(ws, "sess", "endless");
      const invoke: GrokInvoker = async (args) => ({ text: "nope", sessionId: args.sessionId, stopReason: "EndTurn" });
      // #when orchestrating with a low cap
      const result = await orchestrate({ cwd: ws, initialPrompt: "start", sessionId: "sess", maxIterations: 4, invoke });
      // #then it bails out after the cap
      expect(result.stopReason).toBe("max-iterations");
      expect(result.iterations).toBe(4);
    });

    it("passes new then resume modes to the invoker", async () => {
      // #given a fake grok that finishes immediately (no .omo state)
      const ws = workspace();
      const modes: string[] = [];
      const invoke: GrokInvoker = async (args) => {
        modes.push(args.mode);
        return { text: "done", sessionId: args.sessionId, stopReason: "EndTurn" };
      };
      // #when orchestrating with no continuation state
      const result = await orchestrate({ cwd: ws, initialPrompt: "start", sessionId: "sess", invoke });
      // #then only the initial new-session turn runs
      expect(result.stopReason).toBe("completed");
      expect(modes).toEqual(["new"]);
    });
  });

  describe("parseTurn", () => {
    it("reads the last JSON line and defaults the session id", () => {
      // #given streaming-ish output with a trailing json object
      const stdout = 'noise\n{"text":"hi","sessionId":"abc","stopReason":"EndTurn"}\n';
      // #when parsing
      const turn = parseTurn(stdout, "fallback");
      // #then it extracts the fields
      expect(turn).toEqual({ text: "hi", sessionId: "abc", stopReason: "EndTurn" });
    });

    it("throws on a grok error object", () => {
      // #given an error payload
      const stdout = '{"type":"error","message":"boom"}';
      // #when/#then parsing rejects
      expect(() => parseTurn(stdout, "fallback")).toThrow(/boom/);
    });
  });
});
