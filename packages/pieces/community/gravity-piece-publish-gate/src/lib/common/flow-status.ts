import { FlowsContext } from '@activepieces/pieces-framework';
import { FlowStatus, isNil, PopulatedFlow } from '@activepieces/shared';

/**
 * Loads the flow that the current run belongs to, so its publish state can be
 * inspected. The engine exposes the current flow id on `flows.current`, but not
 * its publish status, so the full record is fetched through `flows.list()`.
 */
export async function getCurrentFlowOrThrow({
  flows,
}: {
  flows: FlowsContext;
}): Promise<PopulatedFlow> {
  const currentFlowId = flows.current.id;
  const allFlows = await listFlowsOrThrow({ flows });
  const currentFlow = allFlows.find((flow) => flow.id === currentFlowId);
  if (isNil(currentFlow)) {
    throw new Error(
      'Publish Gate could not find the current automation while checking whether it is published.'
    );
  }
  return currentFlow;
}

/**
 * Decides whether the steps after the gate are allowed to run.
 *
 * - `live`: only a real run of the published, switched-on automation passes.
 *   Test/draft runs are blocked even after the automation has been published,
 *   because they execute a different (draft) version than the published one.
 * - `published`: passes as long as the automation has a published version,
 *   which also lets test runs through once it has been published at least once.
 */
export function isPublishedForMode({
  flow,
  runningVersionId,
  mode,
}: {
  flow: PopulatedFlow;
  runningVersionId: string;
  mode: PublishGateMode;
}): boolean {
  const hasPublishedVersion = !isNil(flow.publishedVersionId);
  if (mode === 'published') {
    return hasPublishedVersion;
  }
  const isSwitchedOn = flow.status === FlowStatus.ENABLED;
  const isRunningPublishedVersion = flow.publishedVersionId === runningVersionId;
  return hasPublishedVersion && isSwitchedOn && isRunningPublishedVersion;
}

async function listFlowsOrThrow({
  flows,
}: {
  flows: FlowsContext;
}): Promise<PopulatedFlow[]> {
  try {
    const page = await flows.list();
    return page.data;
  } catch {
    throw new Error(
      "Publish Gate could not check the automation's publish status. Please try running it again."
    );
  }
}

export const PUBLISH_GATE_MODES = ['live', 'published'] as const;
export type PublishGateMode = (typeof PUBLISH_GATE_MODES)[number];
