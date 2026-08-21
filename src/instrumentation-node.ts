import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import { createHeartbeatFilteringSampler } from "~/server/observability/heartbeat-trace-sampler";

const traceExporterMode = process.env.OTEL_TRACES_EXPORTER ?? "otlp";
const spanProcessors =
  traceExporterMode === "console"
    ? [new SimpleSpanProcessor(new ConsoleSpanExporter())]
    : [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url:
              process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
              "http://localhost:4318/v1/traces",
          }),
        ),
      ];

const sdk = new NodeSDK({
  sampler: createHeartbeatFilteringSampler(),
  serviceName: process.env.OTEL_SERVICE_NAME ?? "inlaya-agent",
  spanProcessors,
});

sdk.start();
