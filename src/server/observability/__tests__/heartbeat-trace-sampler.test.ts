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

import { createHeartbeatFilteringSampler } from "../heartbeat-trace-sampler";

const TRACE_ID = "1234567890abcdef1234567890abcdef";
const SPAN_ID = "1234567890abcdef";

function sample(input: {
  attributes?: Attributes;
  context?: Context;
  spanName: string;
}) {
  return createHeartbeatFilteringSampler().shouldSample(
    input.context ?? ROOT_CONTEXT,
    TRACE_ID,
    input.spanName,
    SpanKind.SERVER,
    input.attributes ?? {},
    [],
  ).decision;
}

describe("createHeartbeatFilteringSampler", () => {
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
    "/api/projects/project-1/sandbox/check-preview",
    "/api/projects/project-1/sandbox/session",
    "/api/projects/project-1/issues/24/sandbox/agent",
    "/api/projects/project-1/issues/24/sandbox/heartbeat-status",
    "/api/projects/project-1/issues/24/sandbox/restart-preview",
  ])("keeps non-heartbeat route %s", (route) => {
    expect(
      sample({
        attributes: { "http.target": route },
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
