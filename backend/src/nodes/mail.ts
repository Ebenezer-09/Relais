import type { NodeHandler } from '../engine/nodeTypes.js';
import { sendMail } from '../services/gmail.js';
import { need } from './util.js';

export const mail: NodeHandler = {
  async run({ config: c, trigger }) {
    const credId = need(String(c.credentialId ?? ''), 'Compte Google');
    const reply = String(c.action || '').startsWith('Répondre');
    const to = need(String(c.to ?? '').trim(), 'Destinataire');
    const res = await sendMail(credId, {
      to, cc: c.cc ? String(c.cc) : undefined, from: c.from ? String(c.from) : undefined,
      subject: String(c.subject ?? ''), body: String(c.body ?? ''),
      html: c.html === true || c.html === 'true',
      ...(reply ? { threadId: trigger.threadId, inReplyTo: trigger.messageIdHeader } : {}),
    });
    return [{ json: { status: 'sent', message_id: res.id, thread_id: res.threadId } }];
  },
};
