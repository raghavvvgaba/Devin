export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.OTEL_TRACES_EXPORTER !== "none"
  ) {
    await import("./instrumentation-node");
  }
}
