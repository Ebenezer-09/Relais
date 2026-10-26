import { spawn } from 'node:child_process';
import vm from 'node:vm';
import type { NodeHandler, NodeOutput } from '../engine/nodeTypes.js';
import type { Json } from '../types.js';
import { need } from './util.js';

const TIMEOUT_MS = 10_000;

function parseInputs(text: unknown): Json {
  const out: Json = {};
  for (const line of String(text ?? '').split('\n')) {
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v: any = line.slice(i + 1).trim();
    if (/^[\[{]/.test(v)) { try { v = JSON.parse(v); } catch { /* texte */ } }
    out[k] = v;
  }
  return out;
}

export function toItems(r: unknown): NodeOutput[] {
  const one = (v: unknown): NodeOutput => ({ json: v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : { result: v } });
  if (Array.isArray(r)) return r.map(one);
  return [one(r)];
}

/** Copie une valeur DANS le contexte du sandbox : aucun objet de l'hôte n'y est exposé
 *  (sinon `inputs.constructor.constructor("return process")()` permettrait d'en sortir). */
const intoContext = (ctx: vm.Context, v: unknown) => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(v ?? null))})`, ctx);

async function runJs(code: string, inputs: Json, item: Json): Promise<unknown> {
  const ctx = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  ctx.inputs = intoContext(ctx, inputs);
  ctx.$json = intoContext(ctx, item);
  const p = vm.runInContext(`(async () => {\n${code}\n})()`, ctx, { timeout: TIMEOUT_MS });
  let timer: NodeJS.Timeout;
  const guard = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`Délai dépassé (${TIMEOUT_MS / 1000}s)`)), TIMEOUT_MS); });
  try {
    const r = await Promise.race([p, guard]);
    return r === undefined ? null : JSON.parse(JSON.stringify(r)); // sortie ramenée dans le monde hôte
  } finally { clearTimeout(timer!); }
}

function runPython(code: string, inputs: Json, item: Json): Promise<unknown> {
  const body = code.split('\n').map((l) => '    ' + l).join('\n');
  const src = `import sys, json\n_d = json.load(sys.stdin)\ndef _main(inputs, _json):\n${body}\n    return None\n_r = _main(_d["inputs"], _d["json"])\nsys.stdout.write("\\x00RESULT\\x00" + json.dumps(_r, default=str))\n`;
  return new Promise((resolve, reject) => {
    const p = spawn('python3', ['-I', '-c', src], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '' } });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`Délai dépassé (${TIMEOUT_MS / 1000}s)`)); }, TIMEOUT_MS);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e: any) => { clearTimeout(t); reject(new Error(e.code === 'ENOENT' ? "python3 n'est pas installé sur le serveur" : e.message)); });
    p.on('close', () => {
      clearTimeout(t);
      const i = out.indexOf('\x00RESULT\x00');
      if (i < 0) return reject(new Error(err.trim().split('\n').slice(-3).join(' | ') || 'Le script Python a échoué'));
      try { resolve(JSON.parse(out.slice(i + 8))); } catch { reject(new Error('Résultat Python non sérialisable')); }
    });
    p.stdin.end(JSON.stringify({ inputs, json: item }));
  });
}

export const fn: NodeHandler = {
  noResolve: ['code'],
  async run({ config: c, item }) {
    const code = need(String(c.code ?? ''), 'Code');
    const inputs = parseInputs(c.inputs);
    const r = String(c.language) === 'Python' ? await runPython(code, inputs, item) : await runJs(code, inputs, item);
    return toItems(r);
  },
};
