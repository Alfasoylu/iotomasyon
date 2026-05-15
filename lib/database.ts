import "server-only";

export class DatabaseUnavailableError extends Error {
  constructor(message = "Database is unavailable.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

export function isDatabaseUnavailableError(error: unknown) {
  if (error instanceof DatabaseUnavailableError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return [
    "can't reach database server",
    "database is unavailable",
    "connect econnrefused",
    "connect etimedout",
    "connection refused",
    "connection terminated unexpectedly",
    "failed to connect",
    "server closed the connection unexpectedly",
  ].some((needle) => message.includes(needle));
}

/**
 * Returns true when a Prisma / PostgreSQL error indicates a schema column or
 * table that hasn't been created yet (i.e. a pending migration).
 * Used to fall back gracefully on pre-migration deployments.
 */
export function isSchemaMismatchError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  // Prisma typed error codes: P2021 = table missing, P2022 = column missing
  const code = (error as { code?: string }).code;
  if (code === "P2021" || code === "P2022") return true;

  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();

  return (
    (msg.includes("column") && msg.includes("does not exist")) ||
    (msg.includes("relation") && msg.includes("does not exist")) ||
    (msg.includes("type") && msg.includes("does not exist")) ||
    msg.includes("undefined_column") ||
    msg.includes("undefined_table") ||
    msg.includes("no such column") ||
    msg.includes("no such table") ||
    msg.includes("unknown column")
  );
}
