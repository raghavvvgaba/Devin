import {
  ROOT_CONTEXT,
  SpanKind,
  TraceFlags,
  trace,
  type Attributes,
  type Context,
} from "@opentelemetry/api";
import { SamplingDecision } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

import { createApplicationTraceSampler } from "../heartbeat-trace-sampler";

const TRACE_ID = "1234567890abcdef1234567890abcdef";
const SPAN_ID = "1234567890abcdef";

function sample(input: {
  attributes?: Attributes;
  context?: Context;
  spanName: string;
}) {
  return createApplicationTraceSampler().shouldSample(
    input.context ?? ROOT_CONTEXT,
    TRACE_ID,
    input.spanName,
    SpanKind.SERVER,
    input.attributes ?? {},
    [],
  ).decision;
}

describe("createApplicationTraceSampler", () => {
  it.each([
    [
      "project heartbeat",
      "POST /api/projects/project-1/sandbox/heartbeat",
      "/api/projects/project-1/sandbox/heartbeat",
    ],
    [
      "issue heartbeat",
      "POST /api/projects/project-1/issues/24/sandbox/heartbeat?source=panel",
      "/api/projects/project-1/issues/24/sandbox/heartbeat?source=panel",
    ],
    [
      "normalized project heartbeat",
      "POST /api/projects/[id]/sandbox/heartbeat/route",
      "/api/projects/[id]/sandbox/heartbeat/route",
    ],
    [
      "normalized issue heartbeat",
      "POST /api/projects/[id]/issues/[issueNumber]/sandbox/heartbeat/route",
      "/api/projects/[id]/issues/[issueNumber]/sandbox/heartbeat/route",
    ],
  ])("drops the complete %s trace", (_label, spanName, route) => {
    expect(
      sample({
        attributes: {
          "http.target": route,
          "next.route": route,
        },
        spanName,
      }),
    ).toBe(SamplingDecision.NOT_RECORD);
  });

  it.each([
    [
      "agent",
      "/api/projects/[id]/issues/[issueNumber]/sandbox/agent/route",
    ],
    [
      "sandbox start",
      "/api/projects/[id]/issues/[issueNumber]/sandbox/start/route",
    ],
    [
      "preview check",
      "/api/projects/[id]/issues/[issueNumber]/sandbox/check-preview/route",
    ],
    [
      "preview restart",
      "/api/projects/[id]/issues/[issueNumber]/sandbox/restart-preview/route",
    ],
  ])("keeps the complete normalized %s route trace", (_label, route) => {
    expect(
      sample({
        attributes: {
          "http.route": route,
          "http.target": route,
          "next.route": route,
        },
        spanName: `POST ${route}`,
      }),
    ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it.each([
    [
      "project session poll",
      "/api/projects/project-1/sandbox/session?sessionId=sandbox-1",
    ],
    [
      "issue session poll",
      "/api/projects/project-1/issues/24/sandbox/session?sessionId=sandbox-1",
    ],
  ])("drops the complete %s trace", (_label, target) => {
    expect(
      sample({
        attributes: { "http.method": "GET", "http.target": target },
        spanName: `GET ${target}`,
      }),
    ).toBe(SamplingDecision.NOT_RECORD);
  });

  it("drops the complete chat deletion trace", () => {
    const route = "/api/projects/[id]/issues/[issueNumber]/chat/route";
    expect(
      sample({
        attributes: {
          "http.method": "DELETE",
          "http.route": route,
          "http.target": "/api/projects/project-1/issues/24/chat",
        },
        spanName: `DELETE ${route}`,
      }),
    ).toBe(SamplingDecision.NOT_RECORD);
  });

  it.each([
    ["agent", "/api/projects/project-1/issues/24/sandbox/agent"],
    ["sandbox start", "/api/projects/project-1/issues/24/sandbox/start"],
  ])(
    "keeps the %s request before Next.js resolves its normalized route",
    (_label, target) => {
      expect(
        sample({
          attributes: { "http.target": target },
          spanName: `POST ${target}`,
        }),
      ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    },
  );

  it("continues dropping a raw session poll before route resolution", () => {
    const target =
      "/api/projects/project-1/issues/24/sandbox/session?sessionId=sandbox-1";
    expect(
      sample({
        attributes: { "http.method": "GET", "http.target": target },
        spanName: `GET ${target}`,
      }),
    ).toBe(SamplingDecision.NOT_RECORD);
  });

  it("keeps non-deletion chat requests", () => {
    const route = "/api/projects/[id]/issues/[issueNumber]/chat/route";
    expect(
      sample({
        attributes: {
          "http.method": "POST",
          "http.route": route,
          "http.target": "/api/projects/project-1/issues/24/chat",
        },
        spanName: `POST ${route}`,
      }),
    ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("propagates a dropped root decision to child spans", () => {
    const unsampledParentContext = trace.setSpanContext(ROOT_CONTEXT, {
      isRemote: false,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.NONE,
      traceId: TRACE_ID,
    });

    expect(
      sample({
        context: unsampledParentContext,
        spanName: "fetch GET https://api.e2b.app/sandboxes/example",
      }),
    ).toBe(SamplingDecision.NOT_RECORD);
  });

  it("drops heartbeat roots even when an incoming remote parent was sampled", () => {
    const sampledRemoteContext = trace.setSpanContext(ROOT_CONTEXT, {
      isRemote: true,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.SAMPLED,
      traceId: TRACE_ID,
    });

    expect(
      sample({
        attributes: {
          "http.target": "/api/projects/project-1/sandbox/heartbeat",
        },
        context: sampledRemoteContext,
        spanName: "POST /api/projects/project-1/sandbox/heartbeat",
      }),
    ).toBe(SamplingDecision.NOT_RECORD);
  });
});
