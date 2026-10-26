export type BlockType = 'llm' | 'whatsapp' | 'telegram' | 'mail' | 'sheets' | 'docs' | 'condition' | 'function' | 'automation';
export type NodeType = 'trigger' | BlockType;
export type Port = 'out' | 'yes' | 'no';

export type TriggerName =
  | 'Message WhatsApp' | 'Message Telegram' | 'Email entrant'
  | 'API / Webhook' | 'Planification' | 'Clic manuel';

export type ConfigValue = string | number | boolean;
export type Config = Record<string, ConfigValue>;

export interface FlowNode {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  /** Uniquement pour type === 'trigger' */
  trigger?: TriggerName;
  config: Config;
}

export interface FlowEdge { id: string; from: string; port: Port; to: string }
export interface View { x: number; y: number; k: number }
export interface Point { x: number; y: number }

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
  view: View;
  seq: number;
  eseq: number;
}

export type FieldType = 'text' | 'number' | 'password' | 'textarea' | 'code' | 'select' | 'toggle' | 'wa-session' | 'google-account';

export interface FieldDef {
  type: FieldType;
  key?: string;
  label?: string;
  required?: boolean;
  default?: ConfigValue;
  options?: string[];
  rows?: number;
  placeholder?: string;
  help?: string;
  step?: number;
  showIf?: (c: Config) => boolean;
}

export type WaStatus = 'disconnected' | 'connecting' | 'qr' | 'pairing' | 'connected';
export interface WaState {
  status: WaStatus;
  method: 'qr' | 'pairing';
  phone: string;
  /** QR code en data URL, fourni par le backend */
  qr?: string;
  pairingCode?: string;
  number?: string;
}

/** Ouverture de la palette : depuis un port de sortie, et/ou à une position écran / monde */
export interface PaletteCtx {
  from: string | null;
  port: Port;
  screen?: Point;
  world?: Point | null;
}
