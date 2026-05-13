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
