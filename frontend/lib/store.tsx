'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, getConnection, type Connection, type Execution, type Graph, type WorkflowRecord } from './api';
import { SCHEMAS, TRIGGERS, TYPE_META } from './schema';
import type { BlockType, ConfigValue, Flow, FlowNode, Port, TriggerName, View, WaState } from './types';
import { defaultsFor, fieldsOf, missing, serialize } from './workflow';

const STORAGE_KEY = 'synapse-flow';
const WA_SESSION = 'default';
const EMPTY: Flow = { nodes: [], edges: [], view: { x: 0, y: 0, k: 1 }, seq: 1, eseq: 1 };
const WA_INIT: WaState = { status: 'disconnected', method: 'qr', phone: '' };

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Webhook = WorkflowRecord['webhook'];

const withDefaults = (nodes: FlowNode[]) => nodes.map((n) => ({ ...n, config: { ...defaultsFor(fieldsOf(n)), ...n.config } }));
const nextSeq = (ids: string[], prefix: string) => Math.max(0, ...ids.map((id) => Number(id.slice(prefix.length)) || 0)) + 1;

/** Graphe du backend -> état de l'éditeur (les blocs sans position sont posés en ligne) */
function flowFromGraph(g: Graph, view: View = EMPTY.view): Flow {
  const nodes = withDefaults(g.nodes).map((n, i) => ({ ...n, x: n.x ?? 110 + i * 370, y: n.y ?? 200 }));
  return { nodes, edges: g.edges, view, seq: nextSeq(nodes.map((n) => n.id), 'n'), eseq: nextSeq(g.edges.map((e) => e.id), 'e') };
}

function loadLocal(): { flow: Flow; workflowId: string | null } | null {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!d?.nodes) return null;
    const nodes = withDefaults(d.nodes), edges = d.edges || [];
    return { flow: { nodes, edges, view: d.view || EMPTY.view, seq: d.seq || nodes.length + 1, eseq: d.eseq || edges.length + 1 }, workflowId: d.workflowId ?? null };
  } catch { return null; }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useFlowStore() {
  const [flow, setFlow] = useState<Flow>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [wa, setWaState] = useState<WaState>(WA_INIT);
  const [toastMsg, setToastMsg] = useState<{ text: string; id: number } | null>(null);

  // backend
  const [conn, setConn] = useState<Connection>({ url: '' });
  const [connOk, setConnOk] = useState<boolean | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [webhook, setWebhook] = useState<Webhook>();
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [lastRun, setLastRun] = useState<Execution | null>(null);
  const [running, setRunning] = useState(false);

  // Les gestionnaires (glisser, enregistrement) lisent toujours l'état le plus récent via ces refs
  const flowRef = useRef(flow);
  const idRef = useRef<string | null>(null);
  const dirty = useRef(false);
  /** Vrai une fois que le graphe local fait foi : jamais avant d'avoir relu la version serveur
   *  (la copie locale n'a pas les mots de passe, elle écraserait ceux du serveur) */
  const synced = useRef(false);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const connOkRef = useRef(false);
  useEffect(() => { connOkRef.current = !!connOk; }, [connOk]);

  const commit = useCallback((fn: (f: Flow) => Flow, markDirty = true) => {
    flowRef.current = fn(flowRef.current);
    if (markDirty) dirty.current = true;
    setFlow(flowRef.current);
  }, []);
  const getFlow = useCallback(() => flowRef.current, []);
  const setId = useCallback((id: string | null) => { idRef.current = id; setWorkflowId(id); }, []);

  const toast = useCallback((text: string) => setToastMsg({ text, id: Date.now() }), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const applyRecord = useCallback((wf: WorkflowRecord) => {
    setActive(wf.active); setWebhook(wf.webhook); setShareToken(wf.shareToken);
    if (wf.warning) toast(wf.warning);
  }, [toast]);

  /* ---------- enregistrement sur le serveur ---------- */
  const save = useCallback((): Promise<unknown> => {
    saveChain.current = saveChain.current.then(async () => {
      if (!dirty.current || !synced.current || !connOkRef.current) return;
      const { nodes, edges } = flowRef.current;
      if (!nodes.length) return;
      dirty.current = false;
      setSaveState('saving');
      const name = nodes.find((n) => n.type === 'trigger')?.name || 'Sans titre';
      try {
        let wf: WorkflowRecord;
        try {
          wf = idRef.current ? await api.workflows.update(idRef.current, name, { nodes, edges }) : await api.workflows.create(name, { nodes, edges });
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          wf = await api.workflows.create(name, { nodes, edges });
        }
        setId(wf.id); applyRecord(wf);
        setSaveState(dirty.current ? 'idle' : 'saved'); setSaveError('');
      } catch (e) {
        dirty.current = true;
        setSaveState('error'); setSaveError(errText(e));
      }
    });
    return saveChain.current;
  }, [setId, applyRecord]);

  /* ---------- démarrage : copie locale, puis version du serveur ---------- */
  useEffect(() => {
    const local = loadLocal();
    if (local) { commit(() => local.flow, false); setId(local.workflowId); }
    setConn(getConnection());
    setLoaded(true);
  }, [commit, setId]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        await api.check(conn);
        if (cancelled) return;
        setConnOk(true); connOkRef.current = true;
        const id = idRef.current;
        if (id) {
          try {
            const wf = await api.workflows.get(id);
            if (cancelled) return;
            commit((f) => flowFromGraph(wf.graph, f.view), false);
            applyRecord(wf);
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 404)) throw e;
            setId(null); dirty.current = true; // supprimé côté serveur : on recrée à partir de la copie locale
          }
        } else if (flowRef.current.nodes.length) dirty.current = true;
        synced.current = true;
        setSaveState(dirty.current ? 'idle' : 'saved');
        save();
      } catch (e) {
        if (cancelled) return;
        setConnOk(false); toast(errText(e));
      }
    })();
    return () => { cancelled = true; };
  }, [loaded, conn, commit, setId, applyRecord, toast, save]);

  /* ---------- copie locale (sans secrets) ---------- */
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...serialize(flow, true), seq: flow.seq, eseq: flow.eseq, workflowId })); } catch { /* stockage indisponible */ }
    }, 300);
    return () => clearTimeout(t);
  }, [flow, loaded, workflowId]);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    setSaveState((s) => (s === 'error' ? s : 'idle'));
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [flow.nodes, flow.edges, loaded, save]);


  /* ---------- vue, sélection, panneau ---------- */
  const setView = useCallback((view: View) => commit((f) => ({ ...f, view }), false), [commit]);
  const select = useCallback((id: string | null, open = false) => { setSel(id); if (open) setPanelOpen(true); }, []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  /* ---------- nœuds ---------- */
  const patchNode = useCallback((id: string, patch: (n: FlowNode) => Partial<FlowNode>) =>
    commit((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === id ? { ...n, ...patch(n) } : n)) })), [commit]);

  const moveNode = useCallback((id: string, x: number, y: number) => patchNode(id, () => ({ x, y })), [patchNode]);
  const setName = useCallback((id: string, name: string) => patchNode(id, (n) => ({ name: name || TYPE_META[n.type].label })), [patchNode]);
  const setConfig = useCallback((id: string, key: string, value: ConfigValue) => patchNode(id, (n) => ({ config: { ...n.config, [key]: value } })), [patchNode]);
  const setTrigger = useCallback((id: string, trigger: TriggerName) => patchNode(id, () => ({ trigger, config: defaultsFor(TRIGGERS[trigger].fields) })), [patchNode]);

  const addNode = useCallback((type: BlockType, x: number, y: number, link?: { from: string; port: Port }) => {
    const f = flowRef.current, base = TYPE_META[type].label;
    let name = base, i = 2;
    while (f.nodes.some((n) => n.name === name)) name = `${base} ${i++}`;
    const node: FlowNode = { id: 'n' + f.seq, type, name, x, y, config: defaultsFor(SCHEMAS[type]) };
    commit((g) => ({
      ...g, nodes: [...g.nodes, node], seq: g.seq + 1,
      ...(link ? { edges: [...g.edges, { id: 'e' + g.eseq, from: link.from, port: link.port, to: node.id }], eseq: g.eseq + 1 } : {}),
    }));
    select(node.id, true);
  }, [commit, select]);

  const deleteNode = useCallback((id: string) => {
    const n = flowRef.current.nodes.find((x) => x.id === id);
    if (!n || n.type === 'trigger') return;
    commit((f) => ({ ...f, nodes: f.nodes.filter((x) => x.id !== id), edges: f.edges.filter((e) => e.from !== id && e.to !== id) }));
    setSel(null); setPanelOpen(false);
  }, [commit]);

  /* ---------- liens ---------- */
  const addEdge = useCallback((from: string, port: Port, to: string) => {
    const f = flowRef.current;
    if (from === to || f.nodes.find((n) => n.id === to)?.type === 'trigger') return;
    if (f.edges.some((x) => x.from === from && x.port === port && x.to === to)) return;
    commit((g) => ({ ...g, edges: [...g.edges, { id: 'e' + g.eseq, from, port, to }], eseq: g.eseq + 1 }));
  }, [commit]);
  const removeEdge = useCallback((id: string) => commit((f) => ({ ...f, edges: f.edges.filter((e) => e.id !== id) })), [commit]);

  /* ---------- agents ---------- */
  const resetEditor = useCallback((id: string | null, next: Flow) => {
    setId(id); setActive(false); setWebhook(undefined); setShareToken(null); setLastRun(null); setSel(null); setPanelOpen(false);
    commit(() => next, id === null);
    synced.current = true;
  }, [commit, setId]);

  const openCreate = useCallback(() => {
    // hors ligne, l'agent actuel n'existe que dans ce navigateur : le remplacer le perdrait
    if (!connOkRef.current && flowRef.current.nodes.length && !confirm("Vous n'êtes pas connecté au serveur : l'agent actuel sera remplacé. Continuer ?")) return;
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const createAgent = useCallback(async (name: string, trigger: TriggerName, y: number) => {
    await save(); // l'agent actuel reste enregistré sur le serveur
    const node: FlowNode = { id: 'n1', type: 'trigger', name: name || 'Nouvel agent', trigger, x: 110, y, config: defaultsFor(TRIGGERS[trigger].fields) };
    resetEditor(null, { nodes: [node], edges: [], view: { x: 0, y: 0, k: 1 }, seq: 2, eseq: 1 });
    setModalOpen(false);
    select(node.id, true);
  }, [save, resetEditor, select]);

  const openAgent = useCallback(async (id: string) => {
    try {
      await save();
      const wf = await api.workflows.get(id);
      resetEditor(wf.id, flowFromGraph(wf.graph));
      dirty.current = false; setSaveState('saved');
      applyRecord(wf);
    } catch (e) { toast(errText(e)); }
  }, [save, resetEditor, applyRecord, toast]);

  /* ---------- exécution et activation ---------- */
  const needServer = useCallback(async (): Promise<string | null> => {
    if (!connOk) { toast('Serveur injoignable, réessayez dans un instant.'); return null; }
    await save();
    if (!idRef.current) toast(saveError || "L'agent n'a pas pu être enregistré.");
    return idRef.current;
  }, [connOk, save, saveError, toast]);

  const runTest = useCallback(async () => {
    const trig = flowRef.current.nodes.find((n) => n.type === 'trigger');
    let input: unknown;
    if (trig?.trigger === 'Clic manuel' && String(trig.config.input ?? '').trim()) {
      try { input = JSON.parse(String(trig.config.input)); } catch { toast("Données d'entrée de test : JSON invalide."); return; }
    }
    const id = await needServer();
    if (!id) return;
    setRunning(true);
    try {
      const ex = await api.workflows.run(id, input);
      setLastRun(ex);
      toast(ex.status === 'success' ? `Test réussi : ${ex.runData.length} bloc${ex.runData.length > 1 ? 's' : ''} exécuté${ex.runData.length > 1 ? 's' : ''}.` : `Test en erreur : ${ex.error}`);
    } catch (e) { toast(errText(e)); } finally { setRunning(false); }
  }, [needServer, toast]);

  const toggleActive = useCallback(async () => {
    const id = await needServer();
    if (!id) return;
    try {
      const wf = active ? await api.workflows.deactivate(id) : await api.workflows.activate(id);
      applyRecord(wf);
      toast(wf.active ? 'Agent activé : il répond maintenant aux messages.' : 'Agent désactivé.');
    } catch (e) { toast(errText(e)); }
  }, [active, needServer, applyRecord, toast]);

  /** Crée le lien client, ou le remplace (renew) ; l'ancien lien cesse alors de fonctionner */
  const shareAgent = useCallback(async () => {
    const id = await needServer();
    if (!id) return;
    try { setShareToken((await api.workflows.share(id)).shareToken); } catch (e) { toast(errText(e)); }
  }, [needServer, toast]);
  const unshareAgent = useCallback(async () => {
    if (!idRef.current) return;
    try { await api.workflows.unshare(idRef.current); setShareToken(null); toast('Lien désactivé : le client ne peut plus voir cet agent.'); } catch (e) { toast(errText(e)); }
  }, [toast]);

  const validate = useCallback(() => {
    const { nodes, edges } = flowRef.current;
    if (!nodes.length) { toast('Aucun agent à vérifier.'); return; }
    const issues = nodes.map((n) => ({ n, m: missing(n, wa.status === 'connected') })).filter((x) => x.m.length);
    const orphan = nodes.filter((n) => n.type !== 'trigger' && !edges.some((e) => e.to === n.id));
    if (!issues.length && !orphan.length) { toast('Tout est prêt : chaque bloc est configuré et relié.'); return; }
    const lines = issues.map((x) => `${x.n.name} : ${x.m.join(', ')}`).concat(orphan.map((n) => `${n.name} : non relié`));
    toast(lines.slice(0, 4).join('  •  ') + (lines.length > 4 ? ` … (+${lines.length - 4})` : ''));
  }, [toast, wa.status]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(serialize(flowRef.current, true), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'workflow.json'; a.click(); URL.revokeObjectURL(a.href);
    toast('Workflow exporté (clés et mots de passe exclus).');
  }, [toast]);

  /* ---------- session WhatsApp (Baileys, côté serveur) ---------- */
  const setWa = useCallback((patch: Partial<WaState>) => setWaState((w) => ({ ...w, ...patch })), []);
  useEffect(() => {
    if (!connOk) return;
    return api.whatsapp.events(WA_SESSION, (s) => setWaState((w) => ({
      ...w, status: s.status, qr: s.qr, pairingCode: s.pairingCode, number: s.number,
    })));
  }, [connOk, conn]);

  const waConnect = useCallback(async () => {
    if (!connOk) { toast('Serveur injoignable, réessayez dans un instant.'); return; }
    if (wa.method === 'pairing' && !wa.phone.trim()) { toast('Renseignez le numéro pour le code de jumelage.'); return; }
    try { await api.whatsapp.connect(WA_SESSION, wa.method, wa.phone); } catch (e) { toast(errText(e)); }
  }, [connOk, wa.method, wa.phone, toast]);
  const waDisconnect = useCallback(async () => {
    try { await api.whatsapp.disconnect(WA_SESSION); } catch (e) { toast(errText(e)); }
  }, [toast]);

  return {
    flow, loaded, sel, panelOpen, modalOpen, wa, toastMsg, getFlow,
    conn, connOk, workflowId, active, webhook, shareToken, shareAgent, unshareAgent, saveState, saveError, lastRun, running,
    setView, select, closePanel, moveNode, setName, setConfig, setTrigger, addNode, deleteNode,
    addEdge, removeEdge, openCreate, closeModal, createAgent, openAgent, validate, exportJson, toast,
    setWa, waConnect, waDisconnect, runTest, toggleActive,
  };
}

type FlowStore = ReturnType<typeof useFlowStore>;
const FlowContext = createContext<FlowStore | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  return <FlowContext.Provider value={useFlowStore()}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowStore {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow doit être utilisé dans <FlowProvider>');
  return ctx;
}
