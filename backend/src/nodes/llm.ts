import { config } from '../config.js';
import { memory } from '../db.js';
import type { NodeHandler } from '../engine/nodeTypes.js';
import { apiError, postJson } from '../services/http.js';
import type { Json } from '../types.js';
import { field, loadCred, need, num } from './util.js';

type Msg = { role: 'user' | 'assistant'; content: string };

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* essaie de isoler l'objet */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  const c = t.indexOf('['), d = t.lastIndexOf(']');
  for (const [s, e] of [[a, b], [c, d]]) {
    if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* suite */ } }
  }
  throw new Error(`Le modèle n'a pas renvoyé de JSON valide : « ${text.slice(0, 200)} »`);
}

async function anthropic(o: CallOpts): Promise<string> {
  const body: Json = { model: o.model, max_tokens: o.maxTokens, messages: o.messages };
  if (o.system) body.system = o.system;
  if (o.temperature !== undefined) body.temperature = o.temperature;
  const r = await postJson('https://api.anthropic.com/v1/messages', body, { 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' }, 120_000);
  if (!r.ok) throw apiError('Anthropic', r);
  return (r.data.content ?? []).filter((b: Json) => b.type === 'text').map((b: Json) => b.text).join('');
}

async function openaiLike(o: CallOpts, base: string, isOpenAI: boolean): Promise<string> {
  const body: Json = { model: o.model, messages: [...(o.system ? [{ role: 'system', content: o.system }] : []), ...o.messages] };
  if (o.temperature !== undefined) body.temperature = o.temperature;
  body[isOpenAI ? 'max_completion_tokens' : 'max_tokens'] = o.maxTokens;
  if (o.json) body.response_format = { type: 'json_object' };
  const headers: Record<string, string> = o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {};
  const r = await postJson(`${base}/chat/completions`, body, headers, 180_000);
  if (!r.ok) throw apiError('LLM', r);
  return r.data.choices?.[0]?.message?.content ?? '';
}

async function gemini(o: CallOpts): Promise<string> {
  const body: Json = {
    contents: o.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: o.maxTokens, ...(o.temperature !== undefined ? { temperature: o.temperature } : {}), ...(o.json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
  const r = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.model)}:generateContent`, body, { 'x-goog-api-key': o.apiKey }, 120_000);
  if (!r.ok) throw apiError('Gemini', r);
  return (r.data.candidates?.[0]?.content?.parts ?? []).map((p: Json) => p.text ?? '').join('');
}

interface CallOpts { model: string; apiKey: string; system: string; messages: Msg[]; temperature?: number; maxTokens: number; json: boolean }

export const llm: NodeHandler = {
  noResolve: ['schema'],
  async run({ config: c, workflowId }) {
    const cred = loadCred(c);
    const provider = String(c.provider || 'Groq');
    const model = need(field(c, {}, 'model'), 'Modèle');
    const prompt = need(String(c.prompt ?? '').trim(), 'Prompt utilisateur');
    const format = String(c.format || 'Texte libre');
    const wantsJson = format !== 'Texte libre';
    const ollama = provider.startsWith('Ollama');
    const groq = provider === 'Groq';
    // Groq : la clé du serveur (GROQ_API) sert si le bloc n'en fournit pas
    const apiKey = field(c, cred, 'apiKey') || (groq ? config.groqApiKey : '');
    if (!ollama && !apiKey) throw new Error("Clé d'API manquante");

    let system = String(c.system ?? '');
    if (wantsJson) {
      system += '\n\nRéponds UNIQUEMENT avec un JSON valide, sans texte avant ou après, sans balises markdown.';
      if (format === 'JSON avec schéma' && c.schema) system += `\nLe JSON doit respecter ce schéma :\n${c.schema}`;
    }

    const useMemory = c.memory === true || c.memory === 'true';
    const memKey = `${workflowId}:${String(c.memoryKey || 'default')}`;
    const window = Math.max(0, num(c.memoryWindow, 10));
    const history: Msg[] = useMemory ? (memory.get(memKey) as Msg[]) : [];
    const messages: Msg[] = [...history, { role: 'user', content: prompt }];

    const opts: CallOpts = {
      model, apiKey, system, messages, json: wantsJson,
      temperature: c.temperature === '' || c.temperature === undefined ? undefined : Number(c.temperature),
      maxTokens: num(c.maxTokens, 1024),
    };
    const baseUrl = String(field(c, cred, 'baseUrl') || '').replace(/\/$/, '');
    let text: string;
    if (provider.startsWith('Anthropic')) text = await anthropic(opts);
    else if (provider.startsWith('Google')) text = await gemini(opts);
    else if (provider === 'OpenAI') text = await openaiLike(opts, 'https://api.openai.com/v1', true);
    else if (groq) text = await openaiLike(opts, 'https://api.groq.com/openai/v1', false);
    else if (provider === 'Mistral') text = await openaiLike(opts, 'https://api.mistral.ai/v1', false);
    else if (ollama) text = await openaiLike(opts, `${baseUrl || 'http://localhost:11434'}/v1`, false);
    else text = await openaiLike(opts, need(baseUrl, 'URL de base'), false);

    if (useMemory && window > 0) memory.set(memKey, [...messages, { role: 'assistant' as const, content: text }].slice(-window));
    const out: Json = { text };
    if (wantsJson) out.json = extractJson(text);
    return [{ json: out }];
  },
};
