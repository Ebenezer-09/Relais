import type { NodeHandler } from '../engine/nodeTypes.js';
import { google, googleFileId } from '../services/google.js';
import { need } from './util.js';

const API = 'https://docs.googleapis.com/v1/documents';
const docUrl = (id: string) => `https://docs.google.com/document/d/${id}/edit`;

export const docs: NodeHandler = {
  async run({ config: c }) {
    const credId = need(String(c.credentialId ?? ''), 'Compte Google');
    const action = String(c.action || '');
    const text = String(c.text ?? '');
    const append = (id: string) => google('Google Docs', credId, `${API}/${id}:batchUpdate`, 'POST',
      { requests: [{ insertText: { text: text.endsWith('\n') ? text : text + '\n', endOfSegmentLocation: {} } }] });

    if (action.startsWith('Créer')) {
      const d = await google('Google Docs', credId, API, 'POST', { title: need(String(c.title ?? '').trim(), 'Titre') });
      if (text) await append(d.documentId);
      return [{ json: { document_id: d.documentId, url: docUrl(d.documentId) } }];
    }
    const id = googleFileId(need(String(c.document ?? ''), 'Document'));
    if (action.startsWith('Lire')) {
      const d = await google('Google Docs', credId, `${API}/${id}`);
      const out = (d.body?.content ?? []).flatMap((b: any) => b.paragraph?.elements ?? []).map((e: any) => e.textRun?.content ?? '').join('');
      return [{ json: { document_id: id, url: docUrl(id), text: out } }];
    }
    need(text, 'Texte');
    await append(id);
    return [{ json: { document_id: id, url: docUrl(id), status: 'added' } }];
  },
};
