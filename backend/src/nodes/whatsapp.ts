import type { NodeHandler } from '../engine/nodeTypes.js';
import { wa } from '../services/whatsapp.js';
import { need, num, sleep } from './util.js';

export const sessionOf = (c: Record<string, any>) => String(c.sessionId || c.credentialId || 'default');

export const whatsapp: NodeHandler = {
  async run({ config: c }) {
    const sid = sessionOf(c);
    const to = need(String(c.to ?? '').trim(), 'Destinataire');
    const action = String(c.action || 'Envoyer un texte');
    const delay = Math.max(0, num(c.delay, 0));

    if (action.startsWith('Afficher')) {
      await wa.typing(sid, to, delay || 2000);
      return [{ json: { status: 'typing' } }];
    }
    if (delay) await sleep(Math.min(delay, 60_000));
    if (action === 'Envoyer un média') {
      const id = await wa.sendMedia(sid, to, need(String(c.mediaUrl ?? '').trim(), 'URL du média'), c.caption ? String(c.caption) : undefined);
      return [{ json: { message_id: id } }];
    }
    const id = await wa.sendText(sid, to, need(String(c.text ?? ''), 'Message'));
    return [{ json: { message_id: id } }];
  },
};
