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

const SESSION_ROUTE_PATTERN =
  /^\/api\/projects\/[^/?#\s]+\/(?:issues\/[^/?#\s]+\/)?sandbox\/session(?:\/route)?\/?$/;

const ISSUE_CHAT_ROUTE_PATTERN =
  /^\/api\/projects\/[^/?#\s]+\/issues\/[^/?#\s]+\/chat(?:\/route)?\/?$/;

const TRACE_ROUTE_ATTRIBUTE_KEYS = [
  "http.route",
  "http.target",
  "next.route",
  "next.span_name",
] as const;

function getTraceCandidates(spanName: string, attributes: Attributes) {
  return [
    spanName,
    ...TRACE_ROUTE_ATTRIBUTE_KEYS.map((key) => attributes[key]).filter(
      (value): value is string => typeof value === "string",
    ),
  ];
}

function getRequestMethod(spanName: string, attributes: Attributes) {
  const attributeMethod =
    attributes["http.request.method"] ?? attributes["http.method"];
  if (typeof attributeMethod === "string") {
    return attributeMethod.toUpperCase();
  }

  return spanName.match(/^([A-Z]+)\s+/)?.[1];
}

function getRoutePath(candidate: string) {
  const withoutMethod = candidate.replace(/^[A-Z]+\s+/, "");
  return withoutMethod.split(/[?#]/, 1)[0] ?? withoutMethod;
}

export function isHeartbeatTrace(
  spanName: string,
  attributes: Attributes,
) {
  return getTraceCandidates(spanName, attributes).some((candidate) =>
    HEARTBEAT_ROUTE_PATTERN.test(candidate),
  );
}

export function isBackgroundRouteTrace(
  spanName: string,
  attributes: Attributes,
) {
  const method = getRequestMethod(spanName, attributes);
  const paths = getTraceCandidates(spanName, attributes).map(getRoutePath);

  if (
    method === "GET" &&
    paths.some((path) => SESSION_ROUTE_PATTERN.test(path))
  ) {
    return true;
  }

  return (
    method === "DELETE" &&
    paths.some((path) => ISSUE_CHAT_ROUTE_PATTERN.test(path))
  );
}

class ApplicationRootSampler implements Sampler {
  constructor(private readonly delegate: Sampler) {}

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    if (
      isHeartbeatTrace(spanName, attributes) ||
      isBackgroundRouteTrace(spanName, attributes)
    ) {
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
    return `ApplicationRootSampler{delegate=${this.delegate.toString()}}`;
  }
}

export function createApplicationTraceSampler() {
  const applicationRootSampler = new ApplicationRootSampler(
    new AlwaysOnSampler(),
  );

  return new ParentBasedSampler({
    remoteParentSampled: applicationRootSampler,
    root: applicationRootSampler,
  });
}
