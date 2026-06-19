# Gravity patches on top of upstream Activepieces

Authoritative ledger of every change this fork makes against upstream
`activepieces/activepieces`. Source of truth during rebase — if it is not
here, it does not exist.

> This file MUST be touched in any commit whose message starts with
> `[gravity-patch P-NNN]`. The `.husky/commit-msg` hook enforces it.

---

## Active patches

> The fork was bootstrapped from upstream `v0.83.1` on 2026-05-25, and **adopted upstream `0.85.4` on 2026-06-19** (via cherry-pick onto the clean tag — a plain rebase explodes on commit `b42b8145`; full runbook in `../core/docs/02_ACTIVEPIECES_PLATFORM.md` §6).
> Next free number is `P-005` (`P-003` pending — see **Pending patches**; `P-004` active below). See **Patch template** below for the entry format.

### P-000: Force LF line endings on shell scripts
- **Files**: `.gitattributes`
- **Category**: config
- **Reason**: Windows git with `autocrlf=true` checks out shell scripts with CRLF, which breaks Linux shebangs inside the Docker image (`exec ./docker-entrypoint.sh: no such file or directory`).
- **Upstream status**: n/a (cosmetic — only affects Windows contributors)
- **Removable if upstream fixes**: yes (if upstream adds an equivalent `.gitattributes`)
- **Rebase risk**: low — net-new file, upstream has no `.gitattributes` at root

### P-001: Add "Publish Gate" custom piece
- **Files**: `packages/pieces/community/gravity-piece-publish-gate/**`, `tsconfig.base.json`
- **Category**: custom-piece
- **Reason**: Gates a flow so the steps placed after it only execute when the flow is genuinely published — and, in the default `live` mode, only on a real production run of the published version — keeping test/draft runs from firing real downstream actions. Implemented with `context.run.stop()` plus a published-version check read from `context.flows` (`publishedVersionId`, `status`, current run version id). Distributed as the public-npm package `gravity-piece-publish-gate` so it can be installed on Activepieces Cloud via Platform → Pieces → Install Piece (NPM Registry).
- **Upstream status**: not appropriate for upstream (Gravity-specific behaviour)
- **Removable if upstream fixes**: no
- **Rebase risk**: low — net-new dir under `packages/pieces/community/`; only shared touch-point is the alphabetical `paths` entry in `tsconfig.base.json`

### P-002: Make piece-publish dist symlink best-effort (Windows)
- **Files**: `packages/cli/src/lib/utils/prepare-piece-utils.ts`
- **Category**: bug-fix
- **Reason**: `preparePieceDistForPublish` created a `dist/node_modules` symlink that throws `EPERM` on Windows without admin/Developer Mode, aborting `npm run publish-piece`. The symlink is only a local-run convenience (not part of the published npm package), so it is now wrapped in try/catch and skipped when symlink creation is not permitted.
- **Upstream status**: file upstream (affects all Windows contributors)
- **Removable if upstream fixes**: yes
- **Rebase risk**: low — small localized change in CLI tooling

### P-004: OpenRouter per-request cost metering
- **Files**: `packages/pieces/community/ai/src/lib/common/gravity-meter.ts` (new), `packages/pieces/community/ai/src/lib/common/ai-sdk.ts`
- **Category**: mit-feature
- **Reason**: Upstream AP discards the cost OpenRouter returns. This sends `usage: { include: true }` on the OpenRouter provider and wraps its `fetch` to read the real per-request `usage.cost` (+ token counts) from both JSON (`generateText`) and SSE (`streamText`/Agent) bodies, then fire-and-forget POSTs it to the Gravity ai-service `/credits/internal/workflow-llm-event` endpoint keyed by the AP `runId`. Covers every AI action routed through `createAIModel` (Ask AI, Run Agent, Summarize, Classify, Extract). No-op unless `GRAVITY_METERING_URL` is set, so upstream behaviour is unchanged. ⚠️ In SANDBOXED execution mode, `GRAVITY_METERING_URL` must also be added to `AP_SANDBOX_PROPAGATED_ENV_VARS`. Full design: `../core/docs/CREDIT_SYSTEM.md` → "How an Activepieces flow LLM call gets metered".
- **Upstream status**: not appropriate for upstream (Gravity billing integration)
- **Removable if upstream fixes**: no
- **Rebase risk**: low — net-new file + one isolated provider case in `ai-sdk.ts`; conflicts only if upstream rewrites the OpenRouter case.
- **Not yet covered**: the standalone `open-router` piece (`ask-open-router.ts`) bypasses `createAIModel` — separate follow-up.

---

## Pending patches (identified, not yet applied)

### P-003: Fix commit-msg hook for Windows + bun
- **Files**: `.husky/commit-msg`
- **Category**: bug-fix
- **Reason**: The hook's last line is `npx --no -- commitlint --edit ${1}`. On Windows + bun, npx cannot resolve the locally-installed `@commitlint/cli` (its bins are `commitlint.exe` / `commitlint.bunx`), so it tries to fetch the standalone `commitlint@21.0.2` package and aborts non-interactively — **blocking every commit**. This is why the fork's own patches sat uncommitted. Fix: replace that line with `./node_modules/.bin/commitlint --edit "$1"` (or `bunx commitlint --edit "$1"`). The `[gravity-patch P-NNN]` ledger check above it is fine and should stay.
- **Upstream status**: n/a (Gravity-owned hook)
- **Removable if upstream fixes**: no
- **Rebase risk**: low — single line in a gravity-owned hook

---

## Removed / superseded patches

> _None yet._ Move a patch here (do not delete) when upstream merges the same fix
> or the rationale no longer holds. Keeps the rebase context for the next person.

---

## Patch template

Every active patch is a section like this:

```markdown
### P-NNN: <short title in imperative form>
- **Files**: comma-separated list of paths the patch touches
- **Category**: bug-fix | config | white-label | custom-piece | mit-feature
- **Reason**: 1-3 sentences on why it exists. Link to upstream issue / PR / Gravity ticket if applicable.
- **Upstream status**: filed at https://… | n/a (cosmetic) | not appropriate for upstream
- **Removable if upstream fixes**: yes | no
- **Rebase risk**: low | medium | high — what to watch for during next rebase
```

Categories enforced by policy (see also `../core/docs/02_ACTIVEPIECES_PLATFORM.md` §1):

| Category | OK? | Notes |
|---|---|---|
| `bug-fix` | ✅ | File upstream too. Drop our patch when they merge. |
| `config` | ✅ | Dockerfile defaults, env-var defaults. Rarely conflict. |
| `white-label` | ✅ | UI changes in `packages/react-ui/`, `packages/web/`. Highest rebase risk. |
| `custom-piece` | ✅ | Net-new dir under `packages/pieces/community/`. Lowest rebase risk. |
| `mit-feature` | ✅ | New REST endpoints / operators outside EE paths. |
| EE-gate removal | ❌ | FORBIDDEN. CI workflow `ee-guard.yml` blocks PRs. |
| EE feature reimplementation (same intent) | ❌ | FORBIDDEN by EE license spirit. Redesign instead. |

---

## Process

1. Branch `feature/<short-name>` off `gravity/main`.
2. Make the change.
3. Add a new `### P-NNN: …` entry above (next free `NNN`, never reuse a number).
4. Commit with `[gravity-patch P-NNN] <description>` as the first line of the message.
5. Open PR into `gravity/main`. Self-review.
6. Squash-merge — keep `[gravity-patch P-NNN]` on the merge commit so it survives in `git log`.

## Greppability

To list every patch commit on the current branch:

```sh
git log --grep='\[gravity-patch P-[0-9]\+\]' --oneline
```

To find every file modified by Gravity patches since fork was created:

```sh
git log --grep='\[gravity-patch' --name-only --format='' | sort -u
```

---

## Useful cross-references

- `README-GRAVITY.md` — orientation for new contributors to the fork
- `../core/docs/02_ACTIVEPIECES_PLATFORM.md` — **the consolidated source of truth**: fork plan, license rules, what we can/can't touch, the four core↔AP dependency surfaces, and the per-version upgrade runbook (§6). (The old `ACTIVEPIECES_FORK_AND_DEPLOY.md` / `ACTIVEPIECES_FORK_SCOPE.md` / `AP_UPGRADE_CHECKLIST.md` were merged here; originals now in `../core/docs/archive/`.)
- `../core/docs/07_DEV_RUNBOOK.md` — Gravity-side dev workflow
