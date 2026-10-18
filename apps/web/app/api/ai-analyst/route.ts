import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ai-analyst   { question: string, context: object }
 *
 * Always responds with JSON (never an HTML error page), so the client can show a real message.
 * Uses OPENAI_API_KEY if set, otherwise ANTHROPIC_API_KEY.
 * Optional: OPENAI_MODEL (default gpt-4o-mini), ANTHROPIC_MODEL (default claude-sonnet-5-5).
 */
export const maxDuration = 30;

const SYSTEM = `You are the TERRAPULSE urban-heat analyst.

Rules:
- Base every number and city name on the JSON data supplied by the user message. Never invent measurements, cities or figures.
- You may add well-established urban-climate and planning knowledge (tree canopy, cool roofs, shade, reflective pavement, water features), but keep it clearly separate from the data.
- Respect the "provenance" field: say plainly when values are illustrative samples or reference figures rather than live measurements.
- Correlation is not causation; do not present estimates as forecasts.
- If the question is unrelated to urban heat, vegetation or the supplied data, say so in one sentence and steer back.

Format (plain text, no tables, under 280 words):
## Headline
One sentence answering the question.
## Key findings
3-4 bullets starting with "- ", each citing specific numbers from the data.
## What to do first
3 numbered actions (1. 2. 3.), practical and specific.
## Caveats
1-2 short lines on data limits.`;

const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 8) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    if (rateLimited(ip)) return fail("Too many requests — please wait a minute and try again.", 429);

    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim().slice(0, 1200) : "";
    if (!question) return fail("Please enter a question.", 400);

    const contextText = JSON.stringify(body?.context ?? {});
    if (contextText.length > 24_000) return fail("The data context is too large.", 413);

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!openaiKey && !anthropicKey) {
      return fail(
        "The AI analyst isn't configured on the server. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) in Vercel → Project → Settings → Environment Variables, then redeploy.",
        503
      );
    }

    const userMessage = `DATA (JSON):\n${contextText}\n\nQUESTION:\n${question}`;
    let answer = "";

    if (openaiKey) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 800,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userMessage },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = data?.error?.message as string | undefined;
        return fail(msg ? `AI provider error: ${msg}` : `AI provider returned HTTP ${r.status}.`, 502);
      }
      answer = data?.choices?.[0]?.message?.content?.trim() ?? "";
    } else {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
          max_tokens: 800,
          temperature: 0.3,
          system: SYSTEM,
          messages: [{ role: "user", content: userMessage }],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = data?.error?.message as string | undefined;
        return fail(msg ? `AI provider error: ${msg}` : `AI provider returned HTTP ${r.status}.`, 502);
      }
      answer = (data?.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n")
        .trim();
    }

    if (!answer) return fail("The AI provider returned an empty answer. Please try again.", 502);
    return NextResponse.json({ answer });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return fail(timedOut ? "The AI provider took too long to respond. Please try again." : "The analyst hit an unexpected error. Please try again.", timedOut ? 504 : 500);
  }
}