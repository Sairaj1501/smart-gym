import { askLLM, llmEnabled } from './llm.js';
import { ruleBasedReply } from './chatbotRules.js';

const GUARD = 'Rules: use ONLY facts present in the provided JSON; never add numbers, foods or exercises; never diagnose or give medical advice; no supplements; no extreme dieting; if the user mentions pain, injury or a medical condition, tell them to see a doctor or their trainer. Keep it friendly and under 120 words.';

/** LLM only EXPLAINS a plan that the rule engine already produced. It cannot change foods, calories or exercises. */
export async function narrate(kind, data) {
  if (!llmEnabled()) return null;
  try {
    return await askLLM({ system: `You explain a gym member's ${kind} in plain language. ${GUARD}`, messages: [{ role: 'user', content: JSON.stringify(data) }], maxTokens: 300 });
  } catch { return null; }
}

export async function chat({ message, history = [], ctx }) {
  if (llmEnabled()) {
    try {
      // Anthropic requires alternating roles starting with "user"; the new message is always last.
      const msgs = [];
      for (const h of history.slice(-6)) {
        const role = h.role === 'assistant' ? 'assistant' : 'user';
        if (msgs.length === 0 && role !== 'user') continue;
        if (msgs.length && msgs[msgs.length - 1].role === role) msgs.pop();
        msgs.push({ role, content: String(h.content).slice(0, 1000) });
      }
      if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
      const reply = await askLLM({
        system: `You are the in-app fitness assistant of a gym. Member context (their own data only): ${JSON.stringify(ctx)}. ${GUARD} Do not claim to have analysed data that is not in the context.`,
        messages: [...msgs, { role: 'user', content: message }],
      });
      if (reply) return { reply, source: 'llm' };
    } catch { /* fall through to rules */ }
  }
  return { reply: ruleBasedReply(message, ctx), source: 'rules' };
}
