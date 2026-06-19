# Gravity fork of Activepieces

> Start-here doc for the AIGravity-maintained fork of [activepieces/activepieces](https://github.com/activepieces/activepieces).
> Forked at upstream tag `0.83.1` on 2026-05-25.

The upstream `README.md` still applies for the AP product itself. This file
adds the Gravity-specific bits: branches, license boundaries, native dev
loop, and how to upgrade against upstream.

---

## Branches

| Branch | Purpose | Modifiable? |
|---|---|---|
| `upstream-main` | Tracks `upstream/main`. Updated by `git fetch upstream && git reset --hard upstream/main`. | Never |
| `gravity/main`  | Long-lived branch with all our patches on top of upstream `v0.83.1`. CI builds image from this. | Via PR only |
| `feature/*`     | Short-lived branches PR'd into `gravity/main`. | Yes |

`pre-push` hook (upstream's) blocks direct pushes to `main`. We follow the
same rule for `gravity/main` — patches always land via PR.

---

## License boundaries — read before patching anything

| Path | License | Rule |
|---|---|---|
| `packages/ee/` | Commercial (Activepieces) | **DO NOT modify** |
| `packages/server/api/src/app/ee/` | Commercial (Activepieces) | **DO NOT modify** |
| Everything else | MIT | OK to patch |

Two guards enforce this:

- `.github/workflows/ee-guard.yml` — fails any PR whose diff touches EE paths.
- `.husky/pre-commit` — same check, locally, before the commit lands.

If you need an EE feature, do one of:

1. Find the MIT-compatible workaround. We already have ones for JWT mint
   (no `managed-authn` needed), OAuth (`oauth-broker` instead of EE OAuth
   Apps), and white-label (`flags/theme.ts` instead of EE theming).
   See `core/docs/ACTIVEPIECES_FORK_SCOPE.md` § "EE features and how we
   already work around them".
2. Buy an EE license from `sales@activepieces.com`. EE code is bundled in
   the image but dormant without a license — a valid license unlocks it
   at runtime without us patching anything.

---

## Cloning on Windows

Upstream has two files with `:` in the path (a Windows-reserved character
used for NTFS alternate data streams) — `docs/resources/screenshots/*png:Zone.Identifier`.
A vanilla `git clone` on Windows aborts checkout with "invalid path".
Workaround:

```powershell
git clone --no-checkout https://github.com/AIGravity/activepieces.git
cd activepieces
git config core.protectNTFS false              # local-only, lets git read the bad paths
git read-tree HEAD                             # populate the index
git checkout-index -a -f                       # write working tree (NTFS swallows the bad files as ADS)
git update-index --skip-worktree 'docs/resources/screenshots/cloud.activepieces.com_projects_er7zUIumSRjbOuqubZiye_flows_limit=10(laptop) (1).png:Zone.Identifier'
git update-index --skip-worktree 'docs/resources/screenshots/enable-environments-2.png:Zone.Identifier'
git remote add upstream https://github.com/activepieces/activepieces.git
git fetch upstream --tags
git branch -m main upstream-main
git checkout -b gravity/main 0.83.1
```

On macOS / Linux, the standard `git clone` works without any of this.

---

## Native dev quickstart

The fork uses **bun** (pinned to `bun@1.3.3` via `packageManager`).
`pnpm install` will refuse with `ERROR This project is configured to use bun`.

```bash
# one-time: install deps
bun install            # the NPM_TOKEN warning in .npmrc is harmless for dev

# every day — first-time run uses `bun start` which does setup-dev first;
# subsequent runs can use `bun run dev` directly
bun start              # API :3000, Vite web :4200, engine + worker in-process
# or, after first setup:
bun run dev
```

`.env` (gitignored) is preconfigured for the `gravity-ap-dev` environment:
- **Postgres** — Supabase project, session-mode pooler (IPv4-friendly)
- **Redis**    — Upstash regional database, TLS on :6379
- **Crypto**   — JWT + encryption secrets mirrored from
  `../core/infra/activepieces/.env` so the Gravity API works against either
  Docker AP or native AP without changes.

To run alongside Gravity Web:

```bash
# in core/apps/web/.env.local
VITE_AP_TARGET=http://localhost:4200
```

Why `:4200` and not `:3000`: AP's dev mode runs the Vite frontend on :4200
and the Fastify API on :3000 as separate processes. Vite proxies
`/api`, `/mcp`, etc. onward to :3000 itself. Gravity Web's proxy targets
:4200 so the iframe gets the hot-reloading UI bundle. (Docker AP bundles
both into a single :8080 process — that's why Docker mode targets :8080.)

Then `bun run dev` in `core/apps/web/` proxies AP routes to native AP
instead of Docker AP. Unset / remove the line to flip back.

Detailed runbook: `../core/docs/DEV_RUNBOOK.md` § "Native AP mode".

---

## Upgrade flow (rebase against upstream)

When upstream cuts a new release we want to adopt:

```bash
# update our upstream tracker
git fetch upstream --tags
git checkout upstream-main
git reset --hard upstream/main
git push origin upstream-main

# rebase gravity/main onto the new release tag
git checkout gravity/main
git rebase 0.84.0          # the tag we are adopting

# Resolve each conflict by referencing GRAVITY_PATCHES.md.
# For every patch:
#   - Does the original reason still hold?
#   - If upstream fixed the underlying issue:
#       git rebase --skip   (drop the patch)
#       and move the entry to "Removed / superseded patches" in
#       GRAVITY_PATCHES.md.
#   - Otherwise resolve, git add, git rebase --continue.

git push --force-with-lease origin gravity/main
# Triggers the CI image build automatically.
```

Then run through `../core/docs/AP_UPGRADE_CHECKLIST.md` for the env-var,
REST-contract, and schema audits that are orthogonal to our patches.

---

## How patches are tracked

See [`GRAVITY_PATCHES.md`](./GRAVITY_PATCHES.md). Every change to AP source
gets an entry there with files, reason, upstream status, and removability.

Commit-message convention: every patch commit starts with
`[gravity-patch P-NNN]`. The `.husky/commit-msg` hook enforces that any
commit using that prefix also stages a change to `GRAVITY_PATCHES.md`.

---

## Where to read next

1. `GRAVITY_PATCHES.md` — what we've patched (empty at fork time)
2. `../core/docs/ACTIVEPIECES_FORK_AND_DEPLOY.md` — the full plan + license
3. `../core/docs/ACTIVEPIECES_FORK_SCOPE.md` — concrete map of what we can / can't touch
4. `../core/docs/AP_UPGRADE_CHECKLIST.md` — per-version-bump runbook
5. `../core/docs/DEV_RUNBOOK.md` — Gravity-side dev workflow
6. Upstream `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md` — still apply
