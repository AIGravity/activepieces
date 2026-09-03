import { CheckerVerdict, parseVerdict } from './verdict';

export interface CheckerCall {
  verdict: CheckerVerdict;
  latencyMs: number;
  httpStatus: number;
}

/**
 * One round trip to the Runtime Checker. Throws on any failure — network,
 * timeout, non-2xx, or an answer without a decision — so the caller's fail mode
 * decides the outcome instead of a broken checker quietly reading as ALLOW.
 */
export async function callChecker(opts: {
  url: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<CheckerCall> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`checker answered HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`checker answered non-JSON: ${text.slice(0, 200)}`);
    }
    return {
      verdict: parseVerdict(parsed),
      latencyMs: Date.now() - started,
      httpStatus: res.status,
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`checker did not answer within ${opts.timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
