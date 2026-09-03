import {
  createPiece,
  PieceAuth,
  PieceCategory,
} from '@activepieces/pieces-framework';
import { checkBeforeStep } from './lib/actions/check-before-step';

export const gravityCheckpoint = createPiece({
  displayName: 'Gravity Checkpoint',
  description:
    'Checks the next step with the Gravity Runtime Checker before it runs: continues when it is safe, pauses to ask you when it is uncertain, and stops the run when it is clearly wrong.',
  minimumSupportedRelease: '0.86.0',
  logoUrl:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMGY3NjZlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDIyczgtNCA4LTEwVjVsLTgtMy04IDN2N2MwIDYgOCAxMCA4IDEweiIvPjxwYXRoIGQ9Ik0xMiA4djQiLz48cGF0aCBkPSJNMTIgMTZoLjAxIi8+PC9zdmc+',
  categories: [PieceCategory.CORE, PieceCategory.FLOW_CONTROL],
  authors: ['Gravity'],
  auth: PieceAuth.None(),
  actions: [checkBeforeStep],
  triggers: [],
});
