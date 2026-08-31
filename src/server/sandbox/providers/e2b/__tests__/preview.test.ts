import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { E2BSandboxSession } from "../types";

const { verifySandboxHealthMock } = vi.hoisted(() => ({
  verifySandboxHealthMock: vi.fn(),
}));

const {
  browserCloseMock,
  browserNewPageMock,
  chromiumLaunchMock,
  pageEvaluateMock,
  pageGotoMock,
  pageOnMock,
  pageWaitForTimeoutMock,
  playwrightEvents,
} = vi.hoisted(() => ({
  browserCloseMock: vi.fn(),
  browserNewPageMock: vi.fn(),
  chromiumLaunchMock: vi.fn(),
  pageEvaluateMock: vi.fn(),
  pageGotoMock: vi.fn(),
  pageOnMock: vi.fn(),
  pageWaitForTimeoutMock: vi.fn(),
  playwrightEvents: {} as Record<string, (...args: unknown[]) => void>,
}));

vi.mock("~/server/sandbox/providers/e2b/sandbox-ops", () => ({
  verifySandboxHealth: verifySandboxHealthMock,
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: chromiumLaunchMock,
  },
}));

import {
  checkViteReactPreviewBrowser,
  checkViteReactPreviewHtml,
  recoverPreviewAfterEdit,
} from "../preview";

const spanExporter = new InMemorySpanExporter();
const traceProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
});
trace.setGlobalTracerProvider(traceProvider);
afterAll(async () => {
  await traceProvider.shutdown();
});

function createSession(): E2BSandboxSession {
  return {
    logs: [],
    previewCwd: "/home/user/repo",
    previewCommand: "npm run dev -- --host 0.0.0.0 --port 5173",
    previewProcessId: 123,
    previewState: "ready",
    previewUrl: "https://preview.test",
    sandbox: {
      commands: {
        list: vi.fn().mockResolvedValue([{ pid: 123 }]),
      },
    },
    sandboxId: "sandbox-test",
    sessionId: "session-test",
    status: "running",
  } as unknown as E2BSandboxSession;
}

function response(body: string, init?: ResponseInit) {
  return new Response(body, {
    status: 200,
    ...init,
  });
}

beforeEach(() => {
  spanExporter.reset();
  verifySandboxHealthMock.mockReset();
  browserCloseMock.mockReset();
  browserNewPageMock.mockReset();
  chromiumLaunchMock.mockReset();
  pageEvaluateMock.mockReset();
  pageGotoMock.mockReset();
  pageOnMock.mockReset();
  pageWaitForTimeoutMock.mockReset();
  for (const key of Object.keys(playwrightEvents)) {
    delete playwrightEvents[key];
  }
  vi.unstubAllGlobals();

  pageOnMock.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    playwrightEvents[event] = handler;
  });
  pageEvaluateMock.mockResolvedValue({
    bodyTextLength: 12,
    hasRoot: true,
    rootChildCount: 1,
    rootTextLength: 12,
  });
  pageGotoMock.mockResolvedValue(undefined);
  pageWaitForTimeoutMock.mockResolvedValue(undefined);
  browserNewPageMock.mockResolvedValue({
    evaluate: pageEvaluateMock,
    goto: pageGotoMock,
    on: pageOnMock,
    waitForTimeout: pageWaitForTimeoutMock,
  });
  browserCloseMock.mockResolvedValue(undefined);
  chromiumLaunchMock.mockResolvedValue({
    close: browserCloseMock,
    newPage: browserNewPageMock,
  });
});

describe("preview span errors", () => {
  it.each(["launch", "navigate"])("does not export %s exception details", async (stage) => {
    const privateDetails =
      "custom-secret-456 https://internal.example.test/private /srv/private/preview.ts";
    const error = new Error(privateDetails);
    error.name = privateDetails;
    const failingMock = stage === "launch" ? chromiumLaunchMock : pageGotoMock;
    failingMock.mockRejectedValueOnce(error);

    const result = await checkViteReactPreviewBrowser(createSession());

    expect(result).toMatchObject({
      ok: false,
      reason: "browser_check_failed",
      details: privateDetails,
    });
    const spans = spanExporter.getFinishedSpans();
    expect(spans.find((span) => span.name === `preview browser_${stage}`)).toMatchObject({
      attributes: { "error.type": "preview_stage_failed" },
      status: { code: SpanStatusCode.ERROR, message: "Preview stage failed." },
    });
    const exportedData = JSON.stringify(spans.map(({ attributes, events, status }) => ({
      attributes, events, status,
    })));
    for (const value of privateDetails.split(" ")) {
      expect(exportedData).not.toContain(value);
    }
    expect(spans.flatMap((span) => span.events)).toEqual([]);
  });
});

describe("checkViteReactPreviewHtml", () => {
  it("passes normal Vite React HTML", () => {
    expect(
      checkViteReactPreviewHtml(`<!doctype html>
        <html>
          <head><title>Vite App</title></head>
          <body>
            <div id="root"></div>
            <script type="module" src="/src/main.jsx"></script>
          </body>
        </html>`),
    ).toEqual({ ok: true });
  });

  it("fails on vite-error-overlay", () => {
    expect(
      checkViteReactPreviewHtml(`
        <html>
          <body>
            <vite-error-overlay message="Failed to resolve import"></vite-error-overlay>
          </body>
        </html>`),
    ).toMatchObject({
      marker: "vite-error-overlay",
      ok: false,
      reason: "runtime_error_marker",
    });
  });

  it("fails on Vite import and internal server error text", () => {
    expect(
      checkViteReactPreviewHtml(`
        <html>
          <body>
            <pre>[vite] Internal server error: Failed to resolve import "./Missing"</pre>
          </body>
        </html>`),
    ).toMatchObject({
      marker: "[vite] Internal server error",
      ok: false,
      reason: "runtime_error_marker",
    });
  });

  it("fails on common JavaScript runtime markers", () => {
    expect(
      checkViteReactPreviewHtml(`
        <html>
          <body>
            <pre>ReferenceError: Button is not defined</pre>
          </body>
        </html>`),
    ).toMatchObject({
      marker: "ReferenceError:",
      ok: false,
      reason: "runtime_error_marker",
    });

    expect(
      checkViteReactPreviewHtml(`
        <html>
          <body>
            <pre>TypeError: Cannot read properties of undefined</pre>
          </body>
        </html>`),
    ).toMatchObject({
      marker: "TypeError:",
      ok: false,
      reason: "runtime_error_marker",
    });
  });

  it("fails on empty or near-empty preview HTML", () => {
    expect(checkViteReactPreviewHtml("")).toMatchObject({
      ok: false,
      reason: "empty_preview",
    });

    expect(
      checkViteReactPreviewHtml("<html><body></body></html>"),
    ).toMatchObject({
      ok: false,
      reason: "empty_preview",
    });
  });
});

describe("recoverPreviewAfterEdit", () => {
  it("restarts the preview when E2B reports that the port is closed", async () => {
    const session = createSession();
    const listMock = vi.fn().mockResolvedValue([]);
    const killMock = vi.fn().mockResolvedValue(false);
    const runMock = vi.fn().mockResolvedValue({ pid: 456 });
    session.sandbox = {
      commands: {
        kill: killMock,
        list: listMock,
        run: runMock,
      },
    } as unknown as E2BSandboxSession["sandbox"];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            code: 502,
            message: "The sandbox is running but port is not open",
            port: 5173,
            sandboxId: "sandbox-test",
          }),
          {
            headers: { "content-type": "application/json; charset=utf-8" },
            status: 502,
          },
        ),
      )
      .mockResolvedValueOnce(response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(recoverPreviewAfterEdit(session)).resolves.toBe(true);

    expect(listMock).toHaveBeenCalled();
    expect(killMock).toHaveBeenCalledWith(123, {
      requestTimeoutMs: 10_000,
    });
    expect(runMock).toHaveBeenCalledWith(session.previewCommand, {
      background: true,
      cwd: session.previewCwd,
      onStderr: expect.any(Function),
      onStdout: expect.any(Function),
    });
    expect(session.previewProcessId).toBe(456);
    expect(session.previewState).toBe("ready");
    expect(session.logs.join("")).toContain(
      "Edit detected preview failure. Attempting one automatic restart.",
    );
  });

  it("does not restart for an ordinary application error response", async () => {
    const session = createSession();
    const runMock = vi.fn();
    session.sandbox!.commands.run = runMock;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("Application error", { status: 500 }))
      .mockResolvedValueOnce(response("ok"))
      .mockResolvedValueOnce(
        response(`<!doctype html>
          <html>
            <body>
              <div id="root">Rendered</div>
              <script type="module" src="/src/main.jsx"></script>
            </body>
          </html>`),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(recoverPreviewAfterEdit(session)).resolves.toBe(true);

    expect(runMock).not.toHaveBeenCalled();
    expect(session.previewState).toBe("ready");
  });

  it("stores a diagnostic error when the Vite content check finds an error marker", async () => {
    const session = createSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("ok"))
      .mockResolvedValueOnce(response("ok"))
      .mockResolvedValueOnce(
        response(`
          <html>
            <body>
              <vite-error-overlay message="ReferenceError: Missing is not defined"></vite-error-overlay>
            </body>
          </html>`),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(recoverPreviewAfterEdit(session)).resolves.toBe(false);

    expect(session.previewState).toBe("ready");
    expect(session.previewMessage).toBe("Preview ready.");
    expect(session.previewError).toContain("vite-error-overlay");
    expect(session.logs.join("")).toContain("Preview check failed:");
  });

  it("stores a diagnostic error when the browser console reports a Vite React runtime error", async () => {
    const session = createSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("ok"))
      .mockResolvedValueOnce(response("ok"))
      .mockResolvedValueOnce(
        response(`<!doctype html>
          <html>
            <body>
              <div id="root"></div>
              <script type="module" src="/src/main.jsx"></script>
            </body>
          </html>`),
      );
    vi.stubGlobal("fetch", fetchMock);
    pageWaitForTimeoutMock.mockImplementation(async () => {
      playwrightEvents.console?.([
        {
          text: () => "ReferenceError: Button is not defined",
          type: () => "error",
        },
      ][0]);
    });

    await expect(recoverPreviewAfterEdit(session)).resolves.toBe(false);

    expect(pageGotoMock).toHaveBeenCalledWith("https://preview.test", {
      timeout: 8_000,
      waitUntil: "domcontentloaded",
    });
    expect(browserCloseMock).toHaveBeenCalled();
    expect(session.previewState).toBe("ready");
    expect(session.previewMessage).toBe("Preview ready.");
    expect(session.previewError).toBe("ReferenceError: Button is not defined");
    expect(session.logs.join("")).toContain("ReferenceError: Button is not defined");
  });
});
