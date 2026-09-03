import {
  ActionContext,
  createAction,
  ExecutionType,
  MarkdownVariant,
  PieceAuthProperty,
  Property,
  StopResponse,
} from '@activepieces/pieces-framework';
import { callChecker, CheckerCall } from '../common/checker-client';
import {
  CHECKPOINT_PIECE_VERSION,
  CheckerVerdict,
  FailMode,
  Verdict,
} from '../common/verdict';

const DEFAULT_TIMEOUT_SECONDS = 45;

type StepType = 'PIECE' | 'CODE';

const checkpointProps = {
  info: Property.MarkDown({
    variant: MarkdownVariant.INFO,
    value:
      'Place this step directly **above** the step it should check, and describe that step below using the same references it uses. The checker then sees the real values at run time.\n\nSafe steps continue on their own. Uncertain ones pause until you decide. Clearly wrong ones stop the run.',
  }),
  guardedStep: Property.ShortText({
    displayName: 'Step to check',
    description: 'The name of the step right below this one (for example step_3).',
    required: true,
  }),
  guardedDisplayName: Property.ShortText({
    displayName: 'Step label',
    description: 'How that step is shown to people.',
    required: false,
  }),
  stepType: Property.StaticDropdown<StepType>({
    displayName: 'Kind of step',
    required: true,
    defaultValue: 'PIECE',
    options: {
      options: [
        { label: 'App action', value: 'PIECE' },
        { label: 'Code', value: 'CODE' },
      ],
    },
  }),
  piece: Property.ShortText({
    displayName: 'App',
    description:
      'The app the next step uses (for example @activepieces/piece-gmail). Leave empty for a code step.',
    required: false,
  }),
  action: Property.ShortText({
    displayName: 'Action',
    description: 'The action the next step performs (for example send_email).',
    required: false,
  }),
  parameters: Property.Object({
    displayName: 'Inputs of the step to check',
    description:
      "Copy the next step's inputs here, references included, so the checker sees what will actually be sent.",
    required: false,
  }),
  sourceCode: Property.LongText({
    displayName: 'Code',
    description: 'For a code step: its source.',
    required: false,
  }),
  userRequest: Property.LongText({
    displayName: 'What the user asked for',
    description:
      "The user's own words, when known. Leave empty to let the checker look them up.",
    required: false,
  }),
  checkerUrl: Property.ShortText({
    displayName: 'Checker address',
    description:
      'Where the Runtime Checker answers. Without it nothing can be checked, and the setting below decides what happens.',
    required: false,
  }),
  failMode: Property.StaticDropdown<FailMode>({
    displayName: 'If the checker cannot answer',
    required: true,
    defaultValue: 'ask',
    options: {
      options: [
        { label: 'Pause and ask (safe default)', value: 'ask' },
        { label: 'Continue, but record that nothing was checked', value: 'allow' },
      ],
    },
  }),
  timeoutSeconds: Property.Number({
    displayName: 'Checker timeout (seconds)',
    required: false,
    defaultValue: DEFAULT_TIMEOUT_SECONDS,
  }),
};

type CheckpointContext = ActionContext<PieceAuthProperty, typeof checkpointProps>;
type ResumeContext = Extract<CheckpointContext, { executionType: ExecutionType.RESUME }>;

interface GuardedStep {
  name: string;
  displayName: string;
  stepType: StepType;
  piece: string;
  action: string;
}

interface CheckerSummary {
  url: string | null;
  latencyMs: number | null;
  httpStatus: number | null;
}

/** The step's output: what was decided, on what, and why. */
interface CheckpointRecord {
  checkpoint: Verdict;
  checked: boolean;
  guardedStep: GuardedStep;
  failMode: FailMode;
  checkpointVersion: string;
  checker: CheckerSummary;
  capability: string | null;
  treatment: string | null;
  consequential: boolean;
  reasons: string[];
  explanation: unknown;
  message: string;
  state?: 'waiting';
  waitpoint?: { id: string; approveUrl: string; rejectUrl: string };
  resolution?: 'approved' | 'rejected';
  note?: string;
  decidedAt?: string;
}

type RecordBase = Pick<CheckpointRecord, 'guardedStep' | 'failMode' | 'checkpointVersion'>;

export const checkBeforeStep = createAction({
  name: 'check_before_step',
  displayName: 'Check Before Step',
  description:
    'Asks the Gravity Runtime Checker whether the next step should run. Continues, pauses for a decision, or stops the run.',
  errorHandlingOptions: {
    // A checkpoint must never be bypassable: "continue on failure" would let
    // the guarded step run even if the check itself failed.
    continueOnFailure: {
      hide: true,
    },
    retryOnFailure: {
      hide: true,
    },
  },
  props: checkpointProps,
  async run(context) {
    const guarded = describeGuardedStep(context);
    const failMode: FailMode = context.propsValue.failMode ?? 'ask';
    const base: RecordBase = {
      guardedStep: guarded,
      failMode,
      checkpointVersion: CHECKPOINT_PIECE_VERSION,
    };

    if (context.executionType === ExecutionType.RESUME) {
      return settleDecision(context, base);
    }

    const checkerUrl = (context.propsValue.checkerUrl ?? '').trim();
    const timeoutMs =
      Math.max(1, Number(context.propsValue.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS)) *
      1000;

    let call: CheckerCall | null = null;
    let failure: string | null = null;
    if (!checkerUrl) {
      failure = 'no checker address is configured';
    } else {
      try {
        call = await callChecker({
          url: checkerUrl,
          body: buildCheckRequest(context, guarded),
          timeoutMs,
        });
      } catch (err) {
        failure = (err as Error).message;
      }
    }

    const checker: CheckerSummary = {
      url: checkerUrl || null,
      latencyMs: call?.latencyMs ?? null,
      httpStatus: call?.httpStatus ?? null,
    };

    if (call && call.verdict.decision !== 'NOT_CHECKED') {
      const record = {
        ...base,
        checked: true,
        checker,
        ...summarise(call.verdict),
      };
      switch (call.verdict.decision) {
        case 'ALLOW':
          return {
            ...record,
            checkpoint: 'ALLOW',
            message: 'Checked and allowed; the step runs.',
          } satisfies CheckpointRecord;
        case 'BLOCK':
          return stopRun(context, {
            ...record,
            checkpoint: 'BLOCK',
            message: `Stopped before "${guarded.displayName}": ${firstReason(call.verdict)}`,
          });
        case 'ASK':
          return pauseForDecision(context, {
            ...record,
            checkpoint: 'ASK',
            message: `Waiting for your decision before "${guarded.displayName}": ${firstReason(call.verdict)}`,
          });
      }
    }

    // The checker could not look: unreachable, timed out, answered badly, or
    // said NOT_CHECKED itself. That is never permission on its own.
    const reason = call
      ? 'the checker could not look at this step'
      : `the checker was unavailable (${failure})`;
    const unchecked = {
      ...base,
      checked: false,
      checker,
      capability: null,
      treatment: null,
      consequential: false,
      reasons: [reason],
      explanation: null,
    };
    if (failMode === 'allow') {
      console.warn(
        `[gravity-checkpoint] ${guarded.name} (${guarded.piece || guarded.stepType}) continued UNCHECKED: ${reason}`,
      );
      return {
        ...unchecked,
        checkpoint: 'ALLOW',
        message: `Continued without a check because ${reason}.`,
      } satisfies CheckpointRecord;
    }
    return pauseForDecision(context, {
      ...unchecked,
      checkpoint: 'ASK',
      message: `Waiting for your decision before "${guarded.displayName}" because ${reason}.`,
    });
  },
});

function describeGuardedStep(context: CheckpointContext): GuardedStep {
  const props = context.propsValue;
  const stepType: StepType = props.stepType ?? 'PIECE';
  const piece = (props.piece ?? '').trim();
  const action = (props.action ?? '').trim();
  const name = (props.guardedStep ?? '').trim();
  if (!name) {
    throw new Error(
      'Gravity Checkpoint is not configured: it does not know which step to check.',
    );
  }
  if (stepType === 'PIECE' && !piece) {
    throw new Error(
      `Gravity Checkpoint is not configured: the app of "${name}" is missing, so it cannot be checked.`,
    );
  }
  return {
    name,
    displayName: (props.guardedDisplayName ?? '').trim() || name,
    stepType,
    piece,
    action,
  };
}

function buildCheckRequest(
  context: CheckpointContext,
  guarded: GuardedStep,
): Record<string, unknown> {
  const props = context.propsValue;
  const parameters: Record<string, unknown> = { ...(props.parameters ?? {}) };
  const sourceCode = (props.sourceCode ?? '').trim();
  if (guarded.stepType === 'CODE' && sourceCode) {
    parameters['sourceCode'] = { code: sourceCode };
  }
  return {
    user_request: props.userRequest ?? '',
    piece: guarded.piece,
    action: guarded.action,
    step_type: guarded.stepType,
    parameters,
    // Every reference in `parameters` was resolved by the engine before this
    // step ran, so this IS what the guarded step is about to do.
    step_input: parameters,
    executed: false,
    guarded_step: { name: guarded.name, display_name: guarded.displayName },
    run: {
      id: context.run.id,
      flow_id: context.flows.current.id,
      flow_version_id: context.flows.current.version.id,
      project_id: context.project.id,
    },
    checkpoint: { version: CHECKPOINT_PIECE_VERSION },
  };
}

function summarise(verdict: CheckerVerdict) {
  return {
    capability: verdict.capability ?? null,
    treatment: verdict.treatment ?? null,
    consequential: verdict.consequential ?? false,
    reasons: verdict.reasons,
    explanation: verdict.explanation ?? null,
  };
}

function firstReason(verdict: CheckerVerdict): string {
  return verdict.reasons[0] ?? 'the checker gave no reason';
}

function stopRun(context: CheckpointContext, record: CheckpointRecord): CheckpointRecord {
  const response: StopResponse = { status: 200, body: record };
  context.run.stop({ response });
  return record;
}

async function pauseForDecision(
  context: CheckpointContext,
  record: CheckpointRecord,
): Promise<CheckpointRecord> {
  const waitpoint = await context.run.createWaitpoint({ type: 'WEBHOOK' });
  const paused: CheckpointRecord = {
    ...record,
    state: 'waiting',
    waitpoint: {
      id: waitpoint.id,
      approveUrl: waitpoint.buildResumeUrl({ queryParams: { action: 'approve' } }),
      rejectUrl: waitpoint.buildResumeUrl({ queryParams: { action: 'reject' } }),
    },
  };
  // Make the question visible on the run while it waits, so whoever answers
  // it can see what is being asked and how to answer.
  try {
    await context.output.update({ data: { ...paused } });
  } catch {
    // Older engines have no live output; the returned record still carries it.
  }
  context.run.waitForWaitpoint(waitpoint.id);
  return paused;
}

function settleDecision(context: ResumeContext, base: RecordBase): CheckpointRecord {
  const queryParams = context.resumePayload.queryParams ?? {};
  const action = String(queryParams['action'] ?? '').toLowerCase();
  const approved = action === 'approve';
  const body = context.resumePayload.body as Record<string, unknown> | null | undefined;
  const note = typeof body?.['note'] === 'string' ? body['note'] : undefined;
  const record: CheckpointRecord = {
    ...base,
    checkpoint: 'ASK',
    checked: true,
    checker: { url: null, latencyMs: null, httpStatus: null },
    capability: null,
    treatment: null,
    consequential: false,
    reasons: [],
    explanation: null,
    resolution: approved ? 'approved' : 'rejected',
    note,
    decidedAt: new Date().toISOString(),
    message: approved
      ? `Approved; "${base.guardedStep.displayName}" runs.`
      : `Not approved, so the run stopped before "${base.guardedStep.displayName}".`,
  };
  if (approved) {
    return record;
  }
  return stopRun(context, record);
}
