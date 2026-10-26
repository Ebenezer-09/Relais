import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { config as appConfig } from '../config.js';
import { executions } from '../db.js';
import { nodeHandlers } from '../nodes/index.js';
import type { ExecutionRecord, Json, NodeRun, WorkflowGraph, WorkflowNode } from '../types.js';
import { resolveDeep, resolveString, slugify, type NodeOutputs, type Scope } from './expressions.js';

export interface RunOptions {
  mode: 'manual' | 'test' | 'production';
  triggerItems?: Json[];
  /** Démarre à ce bloc (au lieu du déclencheur) — pour « Exécuter ce bloc » */
  startNodeId?: string;
  /** Sorties épinglées : nom du bloc -> items. Le bloc est court-circuité (comme les « pin data » de n8n). */
  pinned?: Record<string, Json[]>;
  /** Pré-remplit les sorties de blocs amont (pour exécuter un seul bloc avec le contexte voulu) */
  seedOutputs?: Record<string, Json[]>;
  /** Exécute uniquement le bloc de départ, sans suivre les liens */
  onlyStart?: boolean;
  persist?: boolean;
}

/** Élément interne : données + filiation (quel élément de chaque bloc ancêtre l'a produit) */
interface WItem { json: Json; lineage: Record<string, number> }
const wrap = (json: Json, lineage: Record<string, number> = {}): WItem => ({ json, lineage });

/** 'update' (ExecutionRecord) à chaque étape d'une exécution enregistrée : alimente la vue client en direct */
export const execEvents = new EventEmitter().setMaxListeners(0);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function findTrigger(graph: WorkflowGraph): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.type === 'trigger');
}

export function validateGraph(graph: WorkflowGraph): string[] {
  const errs: string[] = [];
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) return ['Graphe invalide : nodes et edges requis'];
  const ids = new Set(graph.nodes.map((n) => n.id));
  const names = new Set<string>();
  for (const n of graph.nodes) {
    if (names.has(n.name)) errs.push(`Nom de bloc en double : « ${n.name} »`);
    names.add(n.name);
    if (n.type !== 'trigger' && !nodeHandlers[n.type]) errs.push(`Type de bloc inconnu : ${n.type}`);
  }
  if (graph.nodes.filter((n) => n.type === 'trigger').length !== 1) errs.push('Le workflow doit avoir exactement un déclencheur');
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) errs.push(`Lien vers un bloc inexistant (${e.from} → ${e.to})`);
  }
  return errs;
}

export async function runWorkflow(
  wf: { id: string; name: string; graph: WorkflowGraph },
  opts: RunOptions,
): Promise<ExecutionRecord> {
  const persist = opts.persist !== false;
  const exec: ExecutionRecord = {
    id: randomUUID(), workflowId: wf.id, mode: opts.mode, status: 'running', startedAt: Date.now(), runData: [],
  };
  const publish = () => { if (persist) { executions.save(exec); execEvents.emit('update', exec); } };
  publish();

  const { nodes, edges } = wf.graph;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outputs = new Map<string, NodeOutputs>();
  for (const [name, items] of Object.entries(opts.seedOutputs ?? {})) {
    outputs.set(name, { name, slug: name === 'trigger' ? 'trigger' : slugify(name), items });
  }

  try {
    const problems = validateGraph(wf.graph);
    if (problems.length) throw new Error(problems.join(' ; '));

    const start = opts.startNodeId ? byId.get(opts.startNodeId) : findTrigger(wf.graph);
    if (!start) throw new Error('Bloc de départ introuvable');

    const triggerName = findTrigger(wf.graph)?.name ?? '';
    const queue: Array<{ node: WorkflowNode; items: WItem[] }> = [
      { node: start, items: (opts.triggerItems?.length ? opts.triggerItems : [{}]).map((j) => wrap(j)) },
    ];
    let runs = 0;
    let last: Json[] = [];

    while (queue.length) {
      if (++runs > appConfig.maxNodeRuns) throw new Error(`Limite de ${appConfig.maxNodeRuns} exécutions de blocs atteinte (boucle infinie ?)`);
      const { node, items } = queue.shift()!;
      const run: NodeRun = { node: node.name, nodeId: node.id, status: 'running', startedAt: Date.now(), durationMs: 0, input: items.map((i) => i.json), output: {} };
      exec.runData.push(run);
      publish();

      let byPort: Record<string, WItem[]>;
      const pin = opts.pinned?.[node.name];
      try {
        byPort = pin ? { out: pin.map((j) => wrap(j)) } : await executeNode(node, items, outputs, exec, wf.id, opts.mode, triggerName);
      } catch (e) {
        run.status = 'error';
        run.error = errMsg(e);
        run.durationMs = Date.now() - run.startedAt;
        throw new Error(`Bloc « ${node.name} » : ${run.error}`);
      }
      // Position de chaque élément dans la sortie du bloc : sert à la filiation des blocs suivants
      const flat = Object.values(byPort).flat();
      flat.forEach((it, i) => { it.lineage = { ...it.lineage, [node.name]: i }; });
      run.output = Object.fromEntries(Object.entries(byPort).map(([p, l]) => [p, l.map((i) => i.json)]));
      run.status = 'success';
      run.durationMs = Date.now() - run.startedAt;
      publish();

      const flatJson = flat.map((i) => i.json);
      outputs.set(node.name, { name: node.name, slug: node.type === 'trigger' ? 'trigger' : slugify(node.name), items: flatJson });
      last = flatJson;

      if (opts.onlyStart) continue;
      for (const [port, out] of Object.entries(byPort)) {
        if (!out.length) continue;
        for (const e of edges.filter((x) => x.from === node.id && (x.port || 'out') === port)) {
          const next = byId.get(e.to);
          if (next) queue.push({ node: next, items: out });
        }
      }
    }
    exec.status = 'success';
    exec.result = last;
  } catch (e) {
    exec.status = 'error';
    exec.error = errMsg(e);
  }
  exec.finishedAt = Date.now();
  publish();
  if (persist) executions.prune(appConfig.keepExecutions);
  return exec;
}

async function executeNode(
  node: WorkflowNode, items: WItem[], outputs: Map<string, NodeOutputs>,
  exec: ExecutionRecord, workflowId: string, mode: RunOptions['mode'], triggerName: string,
): Promise<Record<string, WItem[]>> {
  if (node.type === 'trigger') return { out: items };
  const handler = nodeHandlers[node.type];
  if (!handler) throw new Error(`Type de bloc inconnu : ${node.type}`);
  const skip = new Set(handler.noResolve ?? []);
  const retries = Math.max(0, node.settings?.retries ?? 0);
  const retryDelay = node.settings?.retryDelayMs ?? 1000;
  const result: Record<string, WItem[]> = {};
  const push = (port: string, json: Json, lineage: Record<string, number>) => { (result[port] ??= []).push(wrap(json, lineage)); };
  const allJson = items.map((i) => i.json);

  for (let index = 0; index < items.length; index++) {
    const { json: item, lineage } = items[index];
    const scope: Scope = { item, index, items: allJson, outputs, lineage };
    let attempt = 0;
    for (;;) {
      try {
        const cfg = resolveDeep(node.config ?? {}, scope, skip) as Json;
        const tItems = outputs.get(triggerName)?.items ?? [];
        const trigger = tItems[lineage[triggerName] ?? index] ?? tItems[0] ?? {};
        const outs = await handler.run({ workflowId, executionId: exec.id, mode, node, config: cfg, item, index, trigger, resolve: (t) => resolveString(t, scope) });
        for (const o of outs) push(o.port ?? 'out', o.json, lineage);
        break;
      } catch (e) {
        if (attempt < retries) { attempt++; await sleep(retryDelay); continue; }
        if (node.settings?.onError === 'continue') { push('out', { ...item, error: errMsg(e) }, lineage); break; }
        throw e;
      }
    }
  }
  // Une condition expose toujours ses deux sorties, même vides
  if (node.type === 'condition') { result.yes ??= []; result.no ??= []; }
  else result.out ??= [];
  return result;
}
