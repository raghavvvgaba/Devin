export const streamingFinalMessageId = "streaming-final-message";
export const workingMessageId = "working-message";

export type AgentStreamMessage = {
  body: string;
  id: string;
  isThinking?: boolean;
  role: "assistant" | "system" | "user";
  tone?: "default" | "error" | "success" | "warning";
};

export function removeTransientAgentMessages<T extends AgentStreamMessage>(
  messages: T[],
) {
  return messages.filter(
    (message) =>
      message.id !== workingMessageId &&
      message.id !== streamingFinalMessageId,
  );
}

export function appendFinalMessageDelta(
  messages: AgentStreamMessage[],
  delta: string,
): AgentStreamMessage[] {
  if (!delta) return messages;

  const existing = messages.find(
    (message) => message.id === streamingFinalMessageId,
  );
  const withoutWorking = messages.filter(
    (message) => message.id !== workingMessageId,
  );

  if (!existing) {
    return [
      ...withoutWorking,
      {
        body: delta,
        id: streamingFinalMessageId,
        role: "assistant",
        tone: "default",
      },
    ];
  }

  return withoutWorking.map((message) =>
    message.id === streamingFinalMessageId
      ? { ...message, body: `${message.body}${delta}` }
      : message,
  );
}
