export function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function formatBooleanLabel(value: boolean) {
  return value ? "Active" : "Passive";
}

export function buildQueryString(
  current: URLSearchParams,
  nextValues: Record<string, string | undefined>,
) {
  const params = new URLSearchParams(current.toString());

  for (const [key, value] of Object.entries(nextValues)) {
    if (!value || value === "all") {
      params.delete(key);
      continue;
    }

    params.set(key, value);
  }

  const result = params.toString();
  return result ? `?${result}` : "";
}
