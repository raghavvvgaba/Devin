import { type AIChatMessage } from "~/components/ui/ai-chat";

type IssueChatMessageTone = NonNullable<AIChatMessage["tone"]>;

type IssueChatMessageEntry = {
  body: string;
  tone: IssueChatMessageTone;
};

type IssueChatSuccessCode = "edit_prepared";

type IssueChatErrorCode =
  | "chat_persist_failed"
  | "edit_access_missing"
  | "edit_ai_unavailable"
  | "edit_generation_failed"
  | "edit_invalid_response"
  | "edit_no_changes"
  | "edit_prepare_failed"
  | "edit_provider_rejected_request"
  | "edit_rate_limited"
  | "file_not_found"
  | "invalid_path"
  | "issue_unavailable"
  | "missing_file_path"
  | "missing_instruction"
  | "missing_session_id"
  | "sandbox_not_running"
  | "session_not_found"
  | "unsupported_file";

const issueChatSuccessMessages: Record<IssueChatSuccessCode, IssueChatMessageEntry> =
  {
    edit_prepared: {
      body: "The sandbox edit was applied successfully. You can keep iterating from this issue workspace.",
      tone: "success",
    },
  };

const issueChatErrorMessages: Record<IssueChatErrorCode, IssueChatMessageEntry> = {
  chat_persist_failed: {
    body: "The edit was prepared, but the chat could not be saved. Retry once so the conversation history stays durable.",
    tone: "error",
  },
  edit_access_missing: {
    body: "GitHub access for this repository is missing or expired, so the edit cannot be prepared from this workspace yet.",
    tone: "error",
  },
  edit_ai_unavailable: {
    body: "The edit preparation service is not configured right now, so the chat can show the workflow but cannot apply a new change yet.",
    tone: "error",
  },
  edit_generation_failed: {
    body: "The model failed while preparing the change. The workspace is still intact, and you can retry from the composer.",
    tone: "error",
  },
  edit_invalid_response: {
    body: "The generated edit came back in an unusable format. Try the request again with a simpler instruction.",
    tone: "error",
  },
  edit_no_changes: {
    body: "The prepared result matched the current file, so there was nothing new to apply. Tighten the instruction and try again.",
    tone: "warning",
  },
  edit_prepare_failed: {
    body: "The edit could not be staged for this issue. Retry once, and if it persists we can narrow the target file further.",
    tone: "error",
  },
  edit_provider_rejected_request: {
    body: "The AI provider rejected this edit request. The server log now includes the OpenRouter response details so we can see whether the model, structured-output settings, or another parameter caused it.",
    tone: "error",
  },
  edit_rate_limited: {
    body: "OpenRouter rate limited this edit request. Wait a moment, then retry from the same issue workspace.",
    tone: "warning",
  },
  file_not_found: {
    body: "That file path does not exist in this sandboxed repository. Try an exact repo-relative path and prepare again.",
    tone: "error",
  },
  invalid_path: {
    body: "Use a repository-relative file path inside the sandbox workspace, then prepare the edit again.",
    tone: "error",
  },
  issue_unavailable: {
    body: "The issue details could not be loaded from GitHub right now, so the workspace is paused until that recovers.",
    tone: "error",
  },
  missing_file_path: {
    body: "Add the repository file path in the file section before asking Devin to prepare the edit.",
    tone: "error",
  },
  missing_instruction: {
    body: "The composer needs an instruction before it can prepare the change for this issue.",
    tone: "error",
  },
  missing_session_id: {
    body: "Start the sandbox first so Devin has a live workspace to edit.",
    tone: "error",
  },
  sandbox_not_running: {
    body: "The sandbox is not running right now. Start it again, then retry the edit from this issue thread.",
    tone: "error",
  },
  session_not_found: {
    body: "This sandbox session is no longer available. Start a fresh sandbox and prepare the edit again.",
    tone: "error",
  },
  unsupported_file: {
    body: "This MVP can only prepare text-based file changes right now. Pick a plain text source file and try again.",
    tone: "error",
  },
};

export function buildIssueChatRuntimeMessage(
  code: string,
  options?: { fallbackBody?: string },
): AIChatMessage {
  const fallbackBody =
    options?.fallbackBody ?? "The draft could not be prepared from this chat request.";
  const entry = issueChatErrorMessages[code as IssueChatErrorCode];

  return {
    body: entry?.body ?? fallbackBody,
    id: `error-${Date.now()}`,
    role: "system",
    tone: entry?.tone ?? "error",
  };
}

export function buildIssueChatStatusMessage(input: {
  error?: string;
  success?: string;
}): AIChatMessage | null {
  if (input.success) {
    const entry =
      issueChatSuccessMessages[input.success as IssueChatSuccessCode];

    if (entry) {
      return {
        ...entry,
        id: `success-${input.success}`,
        role: "system",
      };
    }
  }

  if (input.error) {
    const entry = issueChatErrorMessages[input.error as IssueChatErrorCode];

    if (entry) {
      return {
        ...entry,
        id: `error-${input.error}`,
        role: "system",
      };
    }
  }

  return null;
}
