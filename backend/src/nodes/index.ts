import type { NodeHandler } from '../engine/nodeTypes.js';
import { automation } from './automation.js';
import { condition } from './condition.js';
import { docs } from './docs.js';
import { fn } from './function.js';
import { llm } from './llm.js';
import { mail } from './mail.js';
import { sheets } from './sheets.js';
import { telegram } from './telegram.js';
import { whatsapp } from './whatsapp.js';

export const nodeHandlers: Record<string, NodeHandler | undefined> = {
  llm, whatsapp, telegram, mail, sheets, docs, condition, function: fn, automation,
};
