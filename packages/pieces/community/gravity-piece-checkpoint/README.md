# Gravity Checkpoint (`gravity-piece-checkpoint`)

A flow-control piece that sits directly above an outside-world step and asks
the Gravity Runtime Checker whether that step should run.

| Checker says | The piece does |
|---|---|
| `ALLOW` | returns; the step below runs |
| `ASK` | creates a `WEBHOOK` waitpoint and waits. `?action=approve` on the resume URL continues; anything else stops the run before the step |
| `BLOCK` | `context.run.stop()` before the step |
| `NOT_CHECKED`, unreachable, timeout, bad answer | fail mode decides: `ask` (default) pauses exactly like ASK; `allow` continues and records `checked: false` |

`continueOnFailure` and `retryOnFailure` are hidden so the gate cannot be
bypassed. A misconfigured checkpoint (no step name, no app for an app step)
throws, which fails the run closed.

## Inputs

Set by Gravity's injector (`core/apps/api/src/marketplace/checkpoint-injector.ts`),
or by hand for testing:

- `guardedStep`, `guardedDisplayName`, `stepType` (`PIECE` | `CODE`), `piece`, `action`
- `parameters`: a copy of the guarded step's inputs **with the same references**, so
  the engine resolves the real values before the piece runs. Connection references
  are never copied.
- `sourceCode`: for a code step
- `userRequest`: the user's own words, when known
- `checkerUrl`, `failMode` (`ask` | `allow`), `timeoutSeconds`

## Output

The decision record: verdict, `checked`, capability / treatment / consequential,
reasons, explanation, checker latency, and for ASK the waitpoint id plus
approve / reject URLs; on resume, `resolution` and any `note` from the body.

## Request sent to the checker

`POST checkerUrl` with `{ user_request, piece, action, step_type, parameters,
step_input, executed: false, guarded_step, run: { id, flow_id, flow_version_id,
project_id }, checkpoint: { version } }`. The answer must carry
`decision` ∈ `ALLOW | ASK | BLOCK | NOT_CHECKED`; `reasons`, `explanation`,
`capability`, `treatment`, `consequential` are passed through.

## Building for an Activepieces platform

The source imports only `@activepieces/pieces-framework` (the 0.86.x workspace
re-exports the enums it needs). To ship a packed archive built against the npm
framework `0.32.0`, `ExecutionType`, `MarkdownVariant`, `StopResponse` and
`PieceCategory` must come from `@activepieces/shared` instead; pin
`@activepieces/pieces-framework@0.32.0` + `@activepieces/shared@0.96.2`, compile
with `tsc`, write a `package.json` with `main: ./src/index.js` into `dist/`,
`npm pack`, then `POST /api/v1/pieces` as a platform admin with
`packageType=ARCHIVE`, `scope=PLATFORM`, `pieceName`, `pieceVersion`, `pieceArchive`.
Verify with `GET /api/v1/pieces/gravity-piece-checkpoint?version=<v>` before any
flow pins it: an unregistered version never starts a run.
