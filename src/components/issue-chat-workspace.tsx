"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AIChat, type AIChatMessage } from "~/components/ui/ai-chat";
import { ChatInputBox } from "~/components/ui/chat-input-box";
import { buildIssueChatRuntimeMessage } from "~/lib/issue-chat-messages";

type IssueChatWorkspaceProps = {
  accessBlocked: boolean;
  editAction: string;
  initialFilePath: string;
  initialInstruction: string;
  initialMessages: AIChatMessage[];
  issueNumber: number;
  projectId: string;
};

type EditResponse =
  | {
      filePath: string;
      messages: AIChatMessage[];
      status: "ok";
    }
  | {
      code: string;
      status: "error";
    };

export function IssueChatWorkspace({
  accessBlocked,
  editAction,
  initialFilePath,
  initialInstruction,
  initialMessages,
  issueNumber,
  projectId,
}: IssueChatWorkspaceProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [filePath, setFilePath] = useState(initialFilePath);
  const [instruction, setInstruction] = useState(initialInstruction);
  const [isPreparing, setIsPreparing] = useState(false);

  const thinkingMessage = useMemo<AIChatMessage>(
    () => ({
      body: "Thinking",
      id: "thinking-message",
      isThinking: true,
      role: "assistant",
      tone: "default",
    }),
    [],
  );

  const storageKey = useMemo(
    () => `devin:sandbox:${projectId}`,
    [projectId],
  );

  function getSandboxSessionId() {
    try {
      const savedValue = window.localStorage.getItem(storageKey);

      if (!savedValue) {
        return null;
      }

      const saved = JSON.parse(savedValue) as { sessionId?: unknown };
      return typeof saved.sessionId === "string" && saved.sessionId.trim()
        ? saved.sessionId.trim()
        : null;
    } catch {
      return null;
    }
  }

  async function handlePrepareEdit() {
    const trimmedFilePath = filePath.trim();
    const trimmedInstruction = instruction.trim();
    const sessionId = getSandboxSessionId();

    if (!trimmedFilePath || !trimmedInstruction || accessBlocked || isPreparing) {
      return;
    }

    if (!sessionId) {
      setMessages((current) => [
        ...current,
        buildIssueChatRuntimeMessage("missing_session_id"),
      ]);
      return;
    }

    const userMessage: AIChatMessage = {
      body: `${trimmedInstruction}\n\nIssue #${issueNumber} · ${trimmedFilePath}`,
      id: `user-message-${Date.now()}`,
      role: "user",
    };

    setIsPreparing(true);
    setMessages((current) => [...current, userMessage, thinkingMessage]);

    try {
      const response = await fetch(editAction, {
        body: JSON.stringify({
          filePath: trimmedFilePath,
          instruction: trimmedInstruction,
          sessionId,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const result = (await response.json()) as EditResponse;

      if (!response.ok || result.status !== "ok") {
        setMessages((current) => [
          ...current.filter((message) => message.id !== thinkingMessage.id),
          buildIssueChatRuntimeMessage(
            result.status === "error" ? result.code : "edit_prepare_failed",
          ),
        ]);
        return;
      }

      setFilePath(result.filePath);
      setInstruction(trimmedInstruction);
      setMessages((current) => [
        ...current.filter(
          (message) =>
            message.id !== thinkingMessage.id && message.id !== userMessage.id,
        ),
        ...result.messages,
      ]);
      router.refresh();
    } catch {
      setMessages((current) => [
        ...current.filter((message) => message.id !== thinkingMessage.id),
        buildIssueChatRuntimeMessage("edit_prepare_failed"),
      ]);
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <AIChat
      className="h-auto min-h-[32rem]"
      fullBleed
      messages={messages}
    >
      <ChatInputBox
        accessBlocked={accessBlocked}
        filePath={filePath}
        instruction={instruction}
        isPreparing={isPreparing}
        onFilePathChange={setFilePath}
        onInstructionChange={setInstruction}
        onPrepareEdit={handlePrepareEdit}
      />
    </AIChat>
  );
}
