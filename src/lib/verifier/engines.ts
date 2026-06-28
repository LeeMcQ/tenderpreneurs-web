/**
 * src/lib/verifier/engines.ts
 * Model-agnostic engine adapters. runEngine() calls a provider, parses via the
 * safety parser, and returns [] on ANY failure (missing key, timeout, bad JSON)
 * so the pipeline always degrades gracefully. No user PII is sent — only public
 * tender text + corpus — so any provider is POPIA-safe here.
 */
import { buildEnginePrompt, type EnginePrompt } from './prompt.ts';
import { parseEngineResponse } from './parse.ts';
import type { CandidateFlaw, ModelFlawSet } from './orchestrate.ts';
import type { VerifyTender } from './rules.ts';

export type Provider = 'anthropic' | 'gemini' | 'openrouter' | 'openai' | 'deepseek';
export interface EngineConfig { name: string; provider: Provider; model: string; }

const TIMEOUT_MS = 20_000;

/** Choose engines based on which keys are present. Full ensemble: Claude, Gemini,
 *  ChatGPT, DeepSeek — routing through OpenRouter when a direct key is absent.
 *  Note: the verifier sends only PUBLIC tender text + corpus (no user PII), so
 *  DeepSeek is permitted here, consistent with the POPIA rule. */
export function defaultEngines(env: any): EngineConfig[] {
  const e: EngineConfig[] = [];
  const or = env.OPENROUTER_API_KEY;

  if (env.ANTHROPIC_API_KEY) e.push({ name: 'claude', provider: 'anthropic', model: env.ENGINE_CLAUDE_MODEL || 'claude-3-5-sonnet-latest' });
  else if (or) e.push({ name: 'claude', provider: 'openrouter', model: env.ENGINE_CLAUDE_OR_MODEL || 'anthropic/claude-3.5-sonnet' });

  if (env.GEMINI_API_KEY) e.push({ name: 'gemini', provider: 'gemini', model: env.ENGINE_GEMINI_MODEL || 'gemini-1.5-pro' });
  else if (or) e.push({ name: 'gemini', provider: 'openrouter', model: env.ENGINE_GEMINI_OR_MODEL || 'google/gemini-pro-1.5' });

  if (env.OPENAI_API_KEY) e.push({ name: 'chatgpt', provider: 'openai', model: env.ENGINE_OPENAI_MODEL || 'gpt-4o' });
  else if (or) e.push({ name: 'chatgpt', provider: 'openrouter', model: env.ENGINE_OPENAI_OR_MODEL || 'openai/gpt-4o' });

  if (env.DEEPSEEK_API_KEY) e.push({ name: 'deepseek', provider: 'deepseek', model: env.ENGINE_DEEPSEEK_MODEL || 'deepseek-chat' });
  else if (or) e.push({ name: 'deepseek', provider: 'openrouter', model: env.ENGINE_DEEPSEEK_OR_MODEL || 'deepseek/deepseek-chat' });

  // De-dupe engine names (avoid two 'claude' if both direct + OR keys exist isn't possible here,
  // but guard against future additions).
  const seen = new Set<string>();
  return e.filter(c => (seen.has(c.name) ? false : (seen.add(c.name), true)));
}

async function callProvider(cfg: EngineConfig, prompt: EnginePrompt, env: any, signal: AbortSignal): Promise<string> {
  if (cfg.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1500, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] }),
    });
    const j: any = await res.json();
    return (j?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  }
  if (cfg.provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt.system }] }, contents: [{ role: 'user', parts: [{ text: prompt.user }] }], generationConfig: { temperature: 0.2 } }),
    });
    const j: any = await res.json();
    return (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text).join('\n');
  }
  // OpenAI-compatible providers: openrouter | openai | deepseek
  const oai = ({
    openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: env.OPENROUTER_API_KEY },
    openai:     { url: 'https://api.openai.com/v1/chat/completions',    key: env.OPENAI_API_KEY },
    deepseek:   { url: 'https://api.deepseek.com/chat/completions',     key: env.DEEPSEEK_API_KEY },
  } as Record<string, { url: string; key: string }>)[cfg.provider];
  const res = await fetch(oai.url, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${oai.key}` },
    body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] }),
  });
  const j: any = await res.json();
  return j?.choices?.[0]?.message?.content ?? '';
}

export async function runEngine(cfg: EngineConfig, prompt: EnginePrompt, env: any): Promise<CandidateFlaw[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const raw = await callProvider(cfg, prompt, env, ctrl.signal);
    return parseEngineResponse(raw);
  } catch (err) {
    console.error(`[engine:${cfg.name}] failed:`, (err as Error)?.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Run all configured engines in parallel; returns only those that produced output. */
export async function runEnsemble(
  tender: VerifyTender & { title?: string | null },
  corpus: unknown,
  env: any,
  configs?: EngineConfig[],
): Promise<{ outputs: ModelFlawSet[]; used: string[] }> {
  const engines = configs ?? defaultEngines(env);
  if (engines.length === 0) return { outputs: [], used: [] };

  const prompt = buildEnginePrompt(tender, corpus);
  const settled = await Promise.allSettled(engines.map(cfg => runEngine(cfg, prompt, env)));

  const outputs: ModelFlawSet[] = [];
  const used: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      outputs.push({ engine: engines[i].name, flaws: r.value });
      used.push(engines[i].name);
    }
  });
  return { outputs, used };
}
