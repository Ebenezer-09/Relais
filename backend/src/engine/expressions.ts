import vm from 'node:vm';
import type { Json } from '../types.js';

export const slugify = (s: string): string =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'bloc';

export interface NodeOutputs { name: string; slug: string; items: Json[] }

export interface Scope {
  item: Json;
  index: number;
  items: Json[];
  /** Sorties du dernier passage de chaque bloc déjà exécuté, indexées par nom */
  outputs: Map<string, NodeOutputs>;
  /** Filiation de l'élément courant : nom du bloc ancêtre -> index de l'élément dans sa sortie */
  lineage?: Record<string, number>;
  vars?: Json;
}

const EXPR = /\{\{([\s\S]+?)\}\}/g;

/** Élément d'un bloc amont correspondant à l'élément courant (suivi de filiation, comme les « paired items » de n8n) */
function pickFor(o: NodeOutputs, scope: Scope): Json | undefined {
  const i = scope.lineage?.[o.name];
  return o.items[i ?? scope.index] ?? o.items[0];
}

function buildContext(scope: Scope): Json {
  const ctx: Json = Object.create(null);
  ctx.$json = scope.item;
  ctx.$itemIndex = scope.index;
  ctx.$input = { item: { json: scope.item }, all: () => scope.items.map((json) => ({ json })), first: () => ({ json: scope.items[0] }) };
  ctx.$now = new Date();
  ctx.$vars = scope.vars ?? {};
  const nodeApi = (name: string) => {
    const o = scope.outputs.get(name);
    if (!o) throw new Error(`Le bloc "${name}" n'a pas encore été exécuté`);
    return {
      item: { json: pickFor(o, scope) ?? {} },
      first: () => ({ json: o.items[0] ?? {} }),
      last: () => ({ json: o.items[o.items.length - 1] ?? {} }),
      all: () => o.items.map((json) => ({ json })),
      json: pickFor(o, scope) ?? {},
    };
  };
  ctx.$ = nodeApi;
  ctx.$node = new Proxy({}, { get: (_t, name) => nodeApi(String(name)) });
  // Alias historiques du builder : {{trigger.text}}, {{llm.text}}, {{mon_bloc.result}}
  for (const o of scope.outputs.values()) {
    if (!(o.slug in ctx)) ctx[o.slug] = pickFor(o, scope) ?? {};
  }
  return ctx;
}

export function evaluate(expr: string, scope: Scope): unknown {
  const ctx = buildContext(scope);
  try {
    return vm.runInNewContext(expr, vm.createContext(ctx, { codeGeneration: { strings: false, wasm: false } }), { timeout: 1000 });
  } catch (e: any) {
    throw new Error(`Expression « {{ ${expr.trim()} }} » invalide : ${e?.message ?? e}`);
  }
}

const stringify = (v: unknown): string =>
  v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

export function resolveString(str: string, scope: Scope): unknown {
  if (!str.includes('{{')) return str;
  const whole = str.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
  if (whole && !/\}\}[\s\S]*\{\{/.test(whole[1])) return evaluate(whole[1], scope);
  return str.replace(EXPR, (_m, e) => stringify(evaluate(e, scope)));
}

export function resolveDeep(value: unknown, scope: Scope, skipKeys: ReadonlySet<string> = new Set(), key = ''): unknown {
  if (skipKeys.has(key)) return value;
  if (typeof value === 'string') return resolveString(value, scope);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, scope, skipKeys));
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveDeep(v, scope, skipKeys, k);
    return out;
  }
  return value;
}
