import type {
  Attributes,
  Context,
  Link,
  SpanKind,
} from "@opentelemetry/api";
import {
  AlwaysOnSampler,
  ParentBasedSampler,
  SamplingDecision,
  type Sampler,
  type SamplingResult,
} from "@opentelemetry/sdk-trace-base";

const HEARTBEAT_ROUTE_PATTERN =
  /(?:^|\s)\/api\/projects\/[^/?#\s]+\/(?:issues\/[^/?#\s]+\/)?sandbox\/heartbeat(?:\/route)?(?:[/?#\s]|$)/;

const HEARTBEAT_ROUTE_ATTRIBUTE_KEYS = [
  "http.route",
  "http.target",
  "next.route",
  "next.span_name",
] as const;

export function isHeartbeatTrace(
  spanName: string,
  attributes: Attributes,
) {
  const candidates = [
    spanName,
    ...HEARTBEAT_ROUTE_ATTRIBUTE_KEYS.map((key) => attributes[key]).filter(
      (value): value is string => typeof value === "string",
    ),
  ];

  return candidates.some((candidate) => HEARTBEAT_ROUTE_PATTERN.test(candidate));
}

class HeartbeatRootSampler implements Sampler {
  constructor(private readonly delegate: Sampler) {}

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    if (isHeartbeatTrace(spanName, attributes)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    return this.delegate.shouldSample(
      context,
      traceId,
      spanName,
      spanKind,
      attributes,
      links,
    );
  }

  toString() {
    return `HeartbeatRootSampler{delegate=${this.delegate.toString()}}`;
  }
}

export function createHeartbeatFilteringSampler() {
  const heartbeatRootSampler = new HeartbeatRootSampler(
    new AlwaysOnSampler(),
  );

  return new ParentBasedSampler({
    remoteParentSampled: heartbeatRootSampler,
    root: heartbeatRootSampler,
  });
}
