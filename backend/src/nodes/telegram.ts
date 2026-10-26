import type { NodeHandler } from '../engine/nodeTypes.js';
import { apiError, postJson } from '../services/http.js';
import { field, loadCred, need } from './util.js';

const LIMIT = 4096;
export const chunk = (s: string, n = LIMIT): string[] => {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.length ? out : [''];
};

export async function tgCall(token: string, method: string, body: unknown, timeoutMs = 30_000) {
  const r = await postJson(`https://api.telegram.org/bot${token}/${method}`, body, {}, timeoutMs);
  if (!r.ok || r.data?.ok === false) throw apiError('Telegram', r);
  return r.data.result;
}

export const telegram: NodeHandler = {
  async run({ config: c }) {
    const cred = loadCred(c);
    const token = need(field(c, cred, 'botToken'), 'Token du bot');
    const chatId = need(String(c.chatId ?? '').trim(), 'Chat ID');
    const action = String(c.action || 'Envoyer un message');
    const pm = c.parseMode === 'Markdown' ? 'Markdown' : c.parseMode === 'HTML' ? 'HTML' : undefined;
    const common = { chat_id: chatId, ...(pm ? { parse_mode: pm } : {}) };

    if (action === 'Envoyer un message') {
      const text = need(String(c.text ?? ''), 'Message');
      let last: any;
      for (const part of chunk(text)) last = await tgCall(token, 'sendMessage', { ...common, text: part });
      return [{ json: { message_id: last.message_id, chat_id: chatId } }];
    }
    const url = need(String(c.mediaUrl ?? '').trim(), 'URL du fichier');
    const isPhoto = action === 'Envoyer une photo';
    const res = await tgCall(token, isPhoto ? 'sendPhoto' : 'sendDocument', { ...common, [isPhoto ? 'photo' : 'document']: url, ...(c.caption ? { caption: String(c.caption).slice(0, 1024) } : {}) });
    return [{ json: { message_id: res.message_id, chat_id: chatId } }];
  },
};
