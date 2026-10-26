import type { Json, WorkflowNode } from '../types.js';

export interface NodeContext {
  workflowId: string;
  executionId: string;
  mode: 'manual' | 'test' | 'production';
  node: WorkflowNode;
  /** Configuration du bloc avec les expressions déjà évaluées pour cet élément */
  config: Json;
  item: Json;
  index: number;
  /** Élément produit par le déclencheur pour cet index (utile pour répondre à un mail, etc.) */
  trigger: Json;
  /** Évalue un texte contenant des {{…}} (pour les clés de noResolve) */
  resolve: (s: string) => unknown;
}
export interface NodeOutput { json: Json; port?: string }
export interface NodeHandler {
  /** Clés de configuration à ne pas évaluer comme expressions (code, schémas…) */
  noResolve?: string[];
  run(ctx: NodeContext): Promise<NodeOutput[]>;
}
