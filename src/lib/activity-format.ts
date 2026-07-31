export function formatActivityNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatActivityDate(value: Date) {
  return value.toLocaleString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatActivityDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "In progress";
  }

  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}
