# Gravity patches on top of upstream Activepieces

Authoritative ledger of every change this fork makes against upstream
`activepieces/activepieces`. Source of truth during rebase — if it is not
here, it does not exist.

> This file MUST be touched in any commit whose message starts with
> `[gravity-patch P-NNN]`. The `.husky/commit-msg` hook enforces it.

---

## Active patches

> The fork was bootstrapped from upstream `v0.83.1` on 2026-05-25.
> Next free number is `P-003`. See **Patch template** below for the entry format.

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

Categories enforced by policy (see also `core/docs/ACTIVEPIECES_FORK_AND_DEPLOY.md`):

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
- `../core/docs/ACTIVEPIECES_FORK_AND_DEPLOY.md` — the plan + license rules
- `../core/docs/ACTIVEPIECES_FORK_SCOPE.md` — what we can / cannot touch in this repo
- `../core/docs/AP_UPGRADE_CHECKLIST.md` — per-version-bump runbook
