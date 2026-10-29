import { env } from '../config/env.js';

export const llmEnabled = () => Boolean(env.anthropicKey);

/** Backend-only call. The API key never reaches the browser. Throws on any failure so callers can fall back. */
export async function askLLM({ system, messages, maxTokens = 500, timeoutMs = 15000 }) {
  if (!llmEnabled()) throw new Error('LLM not configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.llmModel, max_tokens: maxTokens, system, messages }),
    });
    if (!r.ok) throw new Error(`LLM request failed (${r.status})`);
    const j = await r.json();
    return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  } finally { clearTimeout(timer); }
}
