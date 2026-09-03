export const CHECKPOINT_PIECE_VERSION = '0.0.1';

/**
 * What the Runtime Checker can answer about the step that is about to run.
 *
 * - ALLOW        safe and on-task: the step runs, nobody is asked.
 * - ASK          risky or uncertain: the run pauses until a person decides.
 * - BLOCK        clearly wrong: the run stops before the step.
 * - NOT_CHECKED  the checker could not look. Never treated as ALLOW on its own;
 *                the checkpoint's fail mode decides what happens.
 */
export const VERDICTS = ['ALLOW', 'ASK', 'BLOCK', 'NOT_CHECKED'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** What to do when the checker cannot be reached or gives no usable answer. */
export const FAIL_MODES = ['ask', 'allow'] as const;
export type FailMode = (typeof FAIL_MODES)[number];

export interface CheckerVerdict {
  decision: Verdict;
  reasons: string[];
  explanation?: unknown;
  capability?: string | null;
  treatment?: string | null;
  consequential?: boolean;
  outcome?: string;
}

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value);
}

/**
 * Reads the checker's answer off its response body. Anything without a
 * recognisable decision is an error, not a default — a malformed answer must
 * never be read as permission.
 */
export function parseVerdict(raw: unknown): CheckerVerdict {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('checker response is not a JSON object');
  }
  const body = raw as Record<string, unknown>;
  const decision = body['decision'];
  if (!isVerdict(decision)) {
    throw new Error(`checker response has no usable decision (got ${JSON.stringify(decision)})`);
  }
  const reasons = Array.isArray(body['reasons'])
    ? body['reasons'].map((r) => String(r))
    : [];
  return {
    decision,
    reasons,
    explanation: body['explanation'],
    capability: asOptionalString(body['capability']),
    treatment: asOptionalString(body['treatment']),
    consequential: body['consequential'] === true,
    outcome: asOptionalString(body['outcome']) ?? undefined,
  };
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
