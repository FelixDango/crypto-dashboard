const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type ResilientFetchOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  maxResponseBytes?: number;
};

function retryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 5_000);

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(Math.max(retryAt - Date.now(), 0), 5_000);
  }

  return 200 * 2 ** attempt;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithResilience(
  url: URL | string,
  init: RequestInit = {},
  options: ResilientFetchOptions = {},
  fetcher: typeof fetch = fetch
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!isRetryableStatus(response.status) || attempt === maxRetries) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
    }

    await delay(retryDelayMs(response, attempt));
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed.');
}

export async function readJsonResponse<T>(
  response: Response,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
): Promise<T> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new Error('Provider response exceeded the allowed size.');
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxResponseBytes) {
    throw new Error('Provider response exceeded the allowed size.');
  }

  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function readTextResponse(
  response: Response,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new Error('Provider response exceeded the allowed size.');
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxResponseBytes) {
    throw new Error('Provider response exceeded the allowed size.');
  }
  return new TextDecoder().decode(bytes);
}
