export type Json = Record<string, any>;
export interface Item { json: Json }

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'llm' | 'whatsapp' | 'telegram' | 'mail' | 'sheets' | 'docs' | 'condition' | 'function' | 'automation';
  name: string;
  trigger?: string;
  x?: number; y?: number;
  config: Json;
  /** Paramètres d'exécution du bloc (comme n8n) */
  settings?: { retries?: number; retryDelayMs?: number; onError?: 'stop' | 'continue' };
}
export interface WorkflowEdge { id?: string; from: string; port: string; to: string }
export interface WorkflowGraph { nodes: WorkflowNode[]; edges: WorkflowEdge[] }

export interface WorkflowRecord {
  id: string;
  name: string;
  active: boolean;
  graph: WorkflowGraph;
  createdAt: number;
  updatedAt: number;
}

export interface NodeRun {
  node: string;           // nom du bloc
  nodeId: string;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  durationMs: number;
  input: Json[];
  output: Record<string, Json[]>; // port -> items
  error?: string;
}

export type ExecutionStatus = 'running' | 'success' | 'error';
export interface ExecutionRecord {
  id: string;
  workflowId: string;
  mode: 'manual' | 'test' | 'production';
  status: ExecutionStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  runData: NodeRun[];
  result?: Json[];        // sortie du dernier bloc exécuté
}
