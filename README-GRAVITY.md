# Gravity fork of Activepieces

> Start-here doc for the AIGravity-maintained fork of [activepieces/activepieces](https://github.com/activepieces/activepieces).
> Bootstrapped from upstream tag `0.83.1` on 2026-05-25. **Currently on `0.85.4`** (upgraded 2026-06-19 via cherry-pick — see "Upgrade flow" below).

The upstream `README.md` still applies for the AP product itself. This file
adds the Gravity-specific bits: branches, license boundaries, native dev
loop, and how to upgrade against upstream.

---

## Branches

| Branch | Purpose | Modifiable? |
|---|---|---|
| `upstream-main` | Tracks `upstream/main`. Updated by `git fetch upstream && git reset --hard upstream/main`. | Never |
| `gravity/main`  | Long-lived branch: clean upstream tag (**`0.85.4`** since 2026-06-19) + our P-NNN patches. CI builds image from this. | Via PR only |
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
   See `../core/docs/02_ACTIVEPIECES_PLATFORM.md` §1 (License boundary) for
   the full EE-feature → MIT-workaround map.
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

Detailed runbook: `../core/docs/07_DEV_RUNBOOK.md` § "Native AP mode".

---

## Upgrade flow (cherry-pick, NOT rebase)

> ⚠️ **Do not `git rebase gravity/main` onto the new tag.** The branch contains a
> poisoned commit (`b42b8145`, mislabeled "ci: create release tag") that carries an
> ancient full-tree snapshot — rebasing it 3-way-merges the whole tree and explodes
> into **~7,500 conflicts**. Cherry-pick the patch commit onto a clean tag instead.

The single canonical, detailed runbook now lives in
[`../core/docs/02_ACTIVEPIECES_PLATFORM.md` §6](../core/docs/02_ACTIVEPIECES_PLATFORM.md)
(the old `AP_UPGRADE_CHECKLIST.md` was consolidated there). It covers the **four
dependency surfaces to re-audit** (REST contract, direct AP-Postgres coupling,
JWT/encryption, env) plus post-upgrade smoke tests. Short version:

```bash
git fetch upstream --tags
# 0. safety
git branch backup/gravity-main-pre-<tag>
git branch gravity/wip-patches <patches-commit>

# 1. base on the CLEAN tag, cherry-pick ONLY the Gravity patch commit
git -c core.protectNTFS=false checkout -B gravity/upgrade-<tag> <tag>
git -c core.protectNTFS=false cherry-pick <patches-commit>
#    expect ONE conflict: tsconfig.base.json `paths` — keep ALL entries

# 2. regenerate lockfile + typecheck the custom piece against the new framework
bun install
bunx tsc --noEmit -p packages/pieces/community/gravity-piece-publish-gate/tsconfig.lib.json

# 3. run the four-surface audit (core §6a), then promote + push
git branch -f gravity/main gravity/upgrade-<tag>
CI=true git push -u origin gravity/main     # CI=true → non-interactive, skips pre-push lint/tests
```

Windows gotchas (all hit during the 0.85.4 bump):
- **`:Zone.Identifier` NTFS files** block git tree ops → prefix with `git -c core.protectNTFS=false`
  (strip leftover streams with PowerShell `Remove-Item -LiteralPath <png> -Stream Zone.Identifier`).
- **The `commit-msg` hook is broken** here on Windows+bun (`npx --no -- commitlint` can't find the
  local bin → tries to fetch `commitlint@21.0.2` and aborts, blocking every commit). **This is why
  these very patches were uncommitted for so long.** Fix the hook line to
  `./node_modules/.bin/commitlint --edit "$1"` (pending `P-003`); until then use `--no-verify`.

---

## How patches are tracked

See [`GRAVITY_PATCHES.md`](./GRAVITY_PATCHES.md). Every change to AP source
gets an entry there with files, reason, upstream status, and removability.

Commit-message convention: every patch commit starts with
`[gravity-patch P-NNN]`. The `.husky/commit-msg` hook enforces that any
commit using that prefix also stages a change to `GRAVITY_PATCHES.md`.

---

## Where to read next

1. `GRAVITY_PATCHES.md` — the P-NNN patch ledger (currently P-000..P-002 + pending P-003)
2. `../core/docs/02_ACTIVEPIECES_PLATFORM.md` — **consolidated source of truth**: fork plan, license boundary, the four core↔AP dependency surfaces, and the upgrade runbook (§6). Supersedes the old `ACTIVEPIECES_FORK_AND_DEPLOY.md` / `ACTIVEPIECES_FORK_SCOPE.md` / `AP_UPGRADE_CHECKLIST.md` (now in `../core/docs/archive/`).
3. `../core/docs/07_DEV_RUNBOOK.md` — Gravity-side dev workflow
4. `../core/docs/03_MARKETPLACE.md` — publish/clone/run logic + the AP source-path table
5. Upstream `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md` — still apply
