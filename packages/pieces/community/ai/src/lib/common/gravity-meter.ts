// [gravity-patch P-004] OpenRouter per-request cost metering.
//
// Wraps the OpenRouter provider's `fetch` so we can read OpenRouter's `usage`
// block (token counts AND the real charged `cost`, surfaced by sending
// `usage: { include: true }` in the request body) and fire-and-forget POST it
// to the Gravity ai-service metering endpoint. Rows are keyed by the AP
// `runId` (`workflow_run_id`), which Gravity maps back to the triggering user.
//
// Disabled (a plain pass-through) unless `GRAVITY_METERING_URL` is set, so
// upstream behaviour is byte-for-byte unchanged when the env var is absent.
//
// ⚠️ In SANDBOXED execution mode, add `GRAVITY_METERING_URL` to
// `AP_SANDBOX_PROPAGATED_ENV_VARS` — sandbox subprocesses inherit no env by
// default. In the default dev UNSANDBOXED mode the engine inherits it directly.

type MeterMeta = {
    provider: string
    model: string
    projectId: string
    flowId: string
    runId: string
}

type OpenRouterUsage = {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
}

// e.g. http://ai-service:8000/credits/internal/workflow-llm-event
const METERING_URL = process.env['GRAVITY_METERING_URL']
const TIMEOUT_MS = 4000

function postUsage(meta: MeterMeta, usage: OpenRouterUsage): void {
    if (!METERING_URL) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    void fetch(METERING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
            provider: meta.provider === 'activepieces' ? 'openrouter' : meta.provider,
            model: meta.model,
            operation: 'ap-flow',
            input_tokens: usage.prompt_tokens ?? 0,
            output_tokens: usage.completion_tokens ?? 0,
            // OpenRouter's real charged amount (USD). When present the ai-service
            // prefers it over re-pricing tokens; falls back to token pricing if absent.
            cost_usd: typeof usage.cost === 'number' ? usage.cost : undefined,
            workflow_run_id: meta.runId,
        }),
    })
        .catch(() => { /* metering must never break a flow run */ })
        .finally(() => clearTimeout(timer))
}

// Pull the OpenRouter `usage` object out of either a JSON chat-completion body
// (generateText) or an SSE stream body (streamText — the AI Agent). Returns the
// last usage block seen, or null when none is present.
function extractUsage(body: string): OpenRouterUsage | null {
    const trimmed = body.trim()
    if (!trimmed) return null

    // Non-streaming: a single JSON chat-completion object.
    if (trimmed.startsWith('{')) {
        try {
            return (JSON.parse(trimmed) as { usage?: OpenRouterUsage }).usage ?? null
        } catch {
            return null
        }
    }

    // Streaming SSE: scan `data:` lines; the usage block rides the final chunk.
    let found: OpenRouterUsage | null = null
    for (const line of trimmed.split('\n')) {
        const l = line.trim()
        if (!l.startsWith('data:')) continue
        const payload = l.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
            const chunk = JSON.parse(payload) as { usage?: OpenRouterUsage }
            if (chunk.usage) found = chunk.usage // last one wins
        } catch {
            // keepalive / non-JSON line — ignore
        }
    }
    return found
}

// A drop-in `fetch` for the OpenRouter provider. When metering is disabled we
// return the global `fetch` unchanged (zero overhead). Otherwise we read a
// CLONE of each response so the SDK consumes the original untouched, and report
// usage asynchronously — we never await or throw into the request path.
export function makeMeteringFetch(meta: MeterMeta): typeof fetch {
    if (!METERING_URL) {
        return fetch
    }
    return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const res = await fetch(input, init)
        try {
            res.clone()
                .text()
                .then((text) => {
                    const usage = extractUsage(text)
                    if (usage) postUsage(meta, usage)
                })
                .catch(() => { /* body read failed — ignore */ })
        } catch {
            // clone() can throw if the body is already locked — never block the call
        }
        return res
    }) as typeof fetch
}
