import { getString, isRecord } from "@oh-my-opencode/comment-checker-core";

export type CommentCheckRequest = {
  sourceToolName: string;
  toolName: string;
  filePath: string;
  toolInput: Record<string, unknown>;
};

type ToolResultContent = { type: "text"; text: string };

type ToolResultLike = {
  toolName: string;
  input: Record<string, unknown>;
  isError: boolean;
  content: readonly ToolResultContent[];
};

import type { GrokHookEvent } from "./grok-io.js";

export function grokEventToToolResultLike(event: GrokHookEvent): ToolResultLike | null {
  const toolName = event.toolName ?? "";
  const input = event.toolInput ?? {};
  const mapped = mapGrokTool(toolName, input);
  if (mapped === null) return null;
  return {
    toolName: mapped.toolName,
    input: mapped.input,
    isError: false,
    content: toolResponseToContent(event.toolResponse),
  };
}

export function extractGrokCommentCheckRequests(event: GrokHookEvent): CommentCheckRequest[] {
  const like = grokEventToToolResultLike(event);
  if (like === null) return [];
  return extractFromToolResult(like);
}

function extractFromToolResult(event: ToolResultLike): CommentCheckRequest[] {
  const toolName = event.toolName.toLowerCase();
  if (toolName === "write") return extractWrite(event);
  if (toolName === "edit" || toolName === "strreplace") return extractEdit(event);
  return [];
}

function extractWrite(event: ToolResultLike): CommentCheckRequest[] {
  const filePath = getString(event.input, ["path", "filePath", "file_path"]);
  const content = getString(event.input, ["content", "contents"]);
  if (!filePath || content === undefined) return [];
  return [{ sourceToolName: event.toolName, toolName: "Write", filePath, toolInput: { file_path: filePath, content } }];
}

function extractEdit(event: ToolResultLike): CommentCheckRequest[] {
  const filePath = getString(event.input, ["path", "filePath", "file_path"]);
  const oldString = getString(event.input, ["oldString", "old_string"]);
  const newString = getString(event.input, ["newString", "new_string"]);
  if (!filePath || oldString === undefined || newString === undefined) return [];
  return [
    {
      sourceToolName: event.toolName,
      toolName: "Edit",
      filePath,
      toolInput: { file_path: filePath, old_string: oldString, new_string: newString },
    },
  ];
}

function mapGrokTool(toolName: string, input: Record<string, unknown>): { toolName: string; input: Record<string, unknown> } | null {
  const lower = toolName.toLowerCase();
  if (lower === "write") return { toolName: "Write", input };
  if (lower === "strreplace" || lower === "edit") return { toolName: "Edit", input };
  return null;
}

function toolResponseToContent(toolResponse: unknown): readonly ToolResultContent[] {
  if (typeof toolResponse === "string") return [{ type: "text", text: toolResponse }];
  if (isRecord(toolResponse) && typeof toolResponse["message"] === "string") {
    return [{ type: "text", text: toolResponse["message"] }];
  }
  return [{ type: "text", text: "" }];
}