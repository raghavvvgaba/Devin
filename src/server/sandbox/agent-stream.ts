export type SandboxAgentStreamEvent =
  | {
      message: string;
      type: "progress";
    }
  | {
      delta: string;
      type: "final_delta";
    }
  | {
      result: unknown;
      type: "final";
    }
  | {
      message: string;
      type: "error";
    };

export function formatSseEvent(event: SandboxAgentStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
