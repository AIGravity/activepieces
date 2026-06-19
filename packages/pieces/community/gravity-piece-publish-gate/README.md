# gravity-piece-publish-gate

**Publish Gate** — a flow-control piece that stops an automation before its next
steps unless it has been published. Put the **Continue Only If Published** action
above the steps that should run only on the published automation; when the gate is
not satisfied it calls `context.run.stop()` so nothing below it executes.

## Action: Continue Only If Published

- **Only when the published automation runs for real** (`live`, default) — passes
  only when the flow is switched on, has a published version, and this run is that
  published version. Builder test runs (which execute the draft) are stopped.
- **Whenever the automation has been published** (`published`) — passes once the
  flow has a published version, so builder test runs pass too.

## Install on Activepieces Cloud (public npm)

The cloud **Install Piece** dialog installs from the **public npm registry** by
package name + version, so the piece must be published to npm first.

1. Create an npmjs.com **access token** (Automation or Publish/granular-write). The repo's
   `.npmrc` reads npm auth from the `NPM_TOKEN` env var, so a plain `npm login` won't apply.
2. From the repo root:
   ```
   $env:NPM_TOKEN = "<your-npmjs-token>"   # PowerShell — bash: export NPM_TOKEN=...
   bun install
   npm run publish-piece gravity-piece-publish-gate
   ```
   This builds the piece, pins its `@activepieces/*` deps to concrete versions, and
   runs `npm publish --access public`.
3. In Activepieces Cloud → **Platform Admin → Pieces → Install Piece**:
   - **Package Type**: NPM Registry
   - **Piece Name**: `gravity-piece-publish-gate`
   - **Piece Version**: `0.0.1` (bump the version on every re-publish)
4. Add it in the flow builder. In `live` mode the builder's **Test flow** always
   stops (it runs the draft, not the published version) — publish and trigger the
   flow for real to see the steps below run, or use `published` mode to verify in
   the builder.

## Local / self-hosted dev

Add the folder name to `AP_DEV_PIECES`, then build and restart the server + worker:

```
AP_DEV_PIECES=gravity-piece-publish-gate
npx turbo run build --filter=gravity-piece-publish-gate
```
