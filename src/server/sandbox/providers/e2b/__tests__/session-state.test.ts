import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ABANDONMENT_GRACE_MS,
  HEARTBEAT_INTERVAL_MS,
} from "~/server/sandbox/providers/e2b/constants";
import type { E2BSandboxSession } from "~/server/sandbox/providers/e2b/types";

const { markSandboxSessionStoppedMock } = vi.hoisted(() => ({
  markSandboxSessionStoppedMock: vi.fn(),
}));

vi.mock("~/server/sandbox/session-registry", () => ({
  markSandboxSessionStopped: markSandboxSessionStoppedMock,
}));

import {
  scheduleAbandonmentCheck,
  trackedSessions,
} from "../session-state";

function createSession() {
  const killMock = vi.fn().mockResolvedValue(true);
  const session: E2BSandboxSession = {
    lastHeartbeatAt: new Date().toISOString(),
    logs: [],
    previewState: "ready",
    previewUrl: "https://preview.test",
    sandbox: {
      kill: killMock,
    } as unknown as E2BSandboxSession["sandbox"],
    sandboxId: "sandbox-test",
    sessionId: "session-test",
    status: "running",
  };

  return { killMock, session };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-28T12:00:00.000Z"));
  markSandboxSessionStoppedMock.mockReset();
  markSandboxSessionStoppedMock.mockResolvedValue({ count: 1 });
  trackedSessions.clear();
});

afterEach(() => {
  trackedSessions.clear();
  vi.useRealTimers();
});

describe("scheduleAbandonmentCheck", () => {
  it("persists the stopped state after inactivity cleanup", async () => {
    const { killMock, session } = createSession();
    trackedSessions.set(session.sessionId, session);

    scheduleAbandonmentCheck(session);
    await vi.advanceTimersByTimeAsync(
      ABANDONMENT_GRACE_MS + HEARTBEAT_INTERVAL_MS,
    );

    expect(killMock).toHaveBeenCalledWith({
      requestTimeoutMs: 30_000,
    });
    expect(markSandboxSessionStoppedMock).toHaveBeenCalledWith(
      session.sessionId,
    );
    expect(session.status).toBe("stopped");
    expect(session.sandbox).toBeUndefined();
  });
});
