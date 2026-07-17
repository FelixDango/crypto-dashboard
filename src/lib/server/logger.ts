type LogLevel = 'info' | 'warn' | 'error';

type LogContext = Record<string, string | number | boolean | null | undefined>;

function sanitizedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:key|token|secret|api_key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 1000);
}

function write(level: LogLevel, event: string, context: LogContext): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context
  });
  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else console.info(record);
}

export function logRequest(context: LogContext): void {
  const status = typeof context.status === 'number' ? context.status : 0;
  write(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'http_request', context);
}

export function logError(event: string, error: unknown, context: LogContext = {}): void {
  write('error', event, {
    ...context,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: sanitizedMessage(error)
  });
}
