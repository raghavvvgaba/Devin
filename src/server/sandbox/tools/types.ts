import "server-only";

export type SandboxAgentToolTraceAttributes = Record<
  string,
  boolean | number | string
>;

type SandboxAgentToolErrorOptions = {
  code: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  safeArguments?: Record<string, unknown>;
  traceAttributes?: SandboxAgentToolTraceAttributes;
};

export class SandboxAgentToolError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly safeArguments?: Record<string, unknown>;
  readonly traceAttributes?: SandboxAgentToolTraceAttributes;

  constructor(message: string, options: SandboxAgentToolErrorOptions) {
    super(message);
    this.name = "SandboxAgentToolError";
    this.code = options.code;
    this.details = options.details;
    this.retryable = options.retryable ?? true;
    this.safeArguments = options.safeArguments;
    this.traceAttributes = options.traceAttributes;
  }
}

export type SandboxAgentToolContext = {
  deferPreviewRecovery?: boolean;
  sessionId: string;
};

export type SandboxAgentToolDefinition<
  TArguments extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
> = {
  description: string;
  execute(arguments_: TArguments, context: SandboxAgentToolContext): Promise<TResult>;
  id: string;
  parameters: Record<string, unknown>;
};
