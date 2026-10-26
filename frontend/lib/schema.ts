import type { BlockType, FieldDef, NodeType, TriggerName } from './types';

export const NODE_W = 264;

export const COLORS: Record<NodeType, string> = {
  trigger: '#0e7c66', llm: '#6d4fc2', whatsapp: '#178a4c', telegram: '#1f7fb8',
  mail: '#c2453a', sheets: '#188038', docs: '#2f6fd6', condition: '#a16207', function: '#3f4b5b', automation: '#c2570c',
};

export const TYPE_META: Record<NodeType, { label: string; icon: string }> = {
  trigger: { label: 'Déclencheur', icon: 'bolt' },
  llm: { label: 'LLM', icon: 'psychology' },
  whatsapp: { label: 'WhatsApp', icon: 'chat' },
  telegram: { label: 'Telegram', icon: 'send' },
  mail: { label: 'Mail', icon: 'mail' },
  sheets: { label: 'Google Sheets', icon: 'table_chart' },
  docs: { label: 'Google Docs', icon: 'description' },
  condition: { label: 'Condition', icon: 'alt_route' },
  function: { label: 'Fonction', icon: 'functions' },
  automation: { label: 'Automation', icon: 'settings_suggest' },
};

export const PALETTE: { group: string; items: BlockType[] }[] = [
  { group: 'Messagerie', items: ['whatsapp', 'telegram', 'mail'] },
  { group: 'Intelligence artificielle', items: ['llm'] },
  { group: 'Google', items: ['sheets', 'docs'] },
  { group: 'Logique', items: ['condition'] },
];

export const PALETTE_DESC: Record<BlockType, string> = {
  whatsapp: 'Envoyer un message via votre session', telegram: 'Envoyer via un bot Telegram', mail: 'Envoyer ou répondre depuis Gmail',
  sheets: 'Ajouter ou lire des lignes', docs: 'Créer, compléter ou lire un document',
  llm: 'Prompt système, format de sortie, mémoire', condition: 'Branches Oui / Non', function: 'Code JavaScript ou Python',
  automation: 'HTTP, délai, variable, boucle, stockage',
};

export const TRIGGERS: Record<TriggerName, { icon: string; vars: string[]; fields: FieldDef[] }> = {
  'Message WhatsApp': { icon: 'chat', vars: ['text', 'from', 'name'], fields: [
    { type: 'wa-session', required: true },
    { key: 'allowed', label: 'Numéros autorisés (optionnel)', type: 'textarea', rows: 2, placeholder: '212612345678\n33612345678', help: 'Un numéro par ligne. Vide = tout le monde.' },
    { key: 'ignoreGroups', label: 'Ignorer les groupes', type: 'toggle', default: true },
    { key: 'ignoreOwn', label: 'Ignorer mes propres messages', type: 'toggle', default: true },
  ] },
  'Message Telegram': { icon: 'send', vars: ['text', 'chat_id', 'username'], fields: [
    { key: 'botToken', label: 'Token du bot', type: 'password', required: true, placeholder: '123456:ABC-DEF…', help: 'Obtenu auprès de @BotFather.' },
    { key: 'allowed', label: 'Chat IDs autorisés (optionnel)', type: 'textarea', rows: 2, placeholder: 'Un ID par ligne' },
  ] },
  'Email entrant': { icon: 'mail', vars: ['from', 'subject', 'body'], fields: [
    { key: 'credentialId', label: 'Compte Gmail', type: 'google-account', required: true },
    { key: 'filterFrom', label: 'Filtrer par expéditeur (optionnel)', type: 'text', placeholder: 'client@exemple.com' },
    { key: 'poll', label: 'Vérifier toutes les (secondes)', type: 'number', default: 60, help: 'Minimum 15 s. Les emails traités sont marqués comme lus.' },
  ] },
  'API / Webhook': { icon: 'api', vars: ['body', 'query', 'headers'], fields: [
    { key: 'path', label: "Chemin de l'endpoint", type: 'text', required: true, default: '/agent/entree', help: 'Les adresses complètes sont affichées en bas de ce panneau.' },
    { key: 'method', label: 'Méthode HTTP', type: 'select', options: ['POST', 'GET', 'PUT'], default: 'POST' },
    { key: 'auth', label: 'Authentification', type: 'select', options: ['Aucune', 'Bearer token', "Clé d'API (header)"], default: 'Aucune' },
    { key: 'secret', label: 'Secret / token attendu', type: 'password', required: true, showIf: (c) => c.auth !== 'Aucune' },
    { key: 'responseMode', label: 'Réponse HTTP', type: 'select', options: ['Immédiate (200 OK)', 'Attendre la fin du workflow'], default: 'Immédiate (200 OK)' },
  ] },
  Planification: { icon: 'schedule', vars: ['date'], fields: [
    { key: 'mode', label: 'Mode', type: 'select', options: ['Intervalle', 'Expression cron'], default: 'Intervalle' },
    { key: 'every', label: 'Toutes les', type: 'number', default: 15, showIf: (c) => c.mode === 'Intervalle' },
    { key: 'unit', label: 'Unité', type: 'select', options: ['minutes', 'heures', 'jours'], default: 'minutes', showIf: (c) => c.mode === 'Intervalle' },
    { key: 'cron', label: 'Expression cron', type: 'text', required: true, placeholder: '0 9 * * 1-5', showIf: (c) => c.mode === 'Expression cron', help: 'Ex : 0 9 * * 1-5 = 9h du lundi au vendredi.' },
    { key: 'tz', label: 'Fuseau horaire', type: 'text', default: 'Africa/Casablanca' },
  ] },
  'Clic manuel': { icon: 'touch_app', vars: ['input'], fields: [
    { key: 'input', label: "Données d'entrée de test (JSON)", type: 'code', rows: 5, default: '{\n  "text": "Bonjour"\n}' },
  ] },
};

export const TRIGGER_NAMES = Object.keys(TRIGGERS) as TriggerName[];

export const SCHEMAS: Record<BlockType, FieldDef[]> = {
  llm: [
    { key: 'provider', label: 'Fournisseur', type: 'select', options: ['Groq', 'Anthropic (Claude)', 'OpenAI', 'Google Gemini', 'Mistral', 'Ollama (local)', 'Compatible OpenAI'], default: 'Groq', advanced: true },
    { key: 'model', label: 'Modèle', type: 'text', required: true, default: 'openai/gpt-oss-120b', placeholder: 'Identifiant du modèle', advanced: true },
    { key: 'apiKey', label: "Clé d'API", type: 'password', required: true, showIf: (c) => c.provider !== 'Ollama (local)' && c.provider !== 'Groq', advanced: true },
    { key: 'baseUrl', label: 'URL de base', type: 'text', required: true, default: 'http://localhost:11434', showIf: (c) => c.provider === 'Ollama (local)' || c.provider === 'Compatible OpenAI', advanced: true },
    { key: 'system', label: "Instructions pour l'IA", type: 'textarea', rows: 6, required: true, placeholder: "Tu es l'assistant de… Réponds toujours en français, de façon concise.", help: 'Explique simplement ce que l’IA doit faire et sur quel ton.' },
    { key: 'prompt', label: 'Texte à traiter', type: 'textarea', rows: 3, required: true, default: '{{trigger.text}}', help: 'Le message que l’IA lit. Cliquez une donnée ci-dessous pour l’ajouter.' },
    { key: 'memory', label: 'Se souvenir de la conversation', type: 'toggle', default: false },
    { key: 'memoryKey', label: 'Clé de session', type: 'text', default: '{{trigger.from}}', showIf: (c) => !!c.memory, help: "Une conversation distincte par valeur (ex : numéro de l'expéditeur).", advanced: true },
    { key: 'memoryWindow', label: 'Messages gardés en mémoire', type: 'number', default: 10, showIf: (c) => !!c.memory, advanced: true },
    { key: 'format', label: 'Format de sortie', type: 'select', options: ['Texte libre', 'JSON', 'JSON avec schéma'], default: 'Texte libre', advanced: true },
    { key: 'schema', label: 'Schéma JSON attendu', type: 'code', rows: 6, required: true, showIf: (c) => c.format === 'JSON avec schéma', placeholder: '{\n  "type":"object",\n  "properties":{"reponse":{"type":"string"}}\n}', advanced: true },
    { key: 'temperature', label: 'Température', type: 'number', step: 0.1, default: 0.7, advanced: true },
    { key: 'maxTokens', label: 'Tokens max en sortie', type: 'number', default: 1024, advanced: true },
  ],
  whatsapp: [
    { key: 'action', label: 'Action', type: 'select', options: ['Envoyer un texte', 'Envoyer un média', "Afficher « en train d'écrire »"], default: 'Envoyer un texte' },
    { type: 'wa-session', required: true },
    { key: 'to', label: 'Destinataire', type: 'text', required: true, default: '{{trigger.from}}', help: 'Numéro au format international (212612345678), ou une donnée insérée.' },
    { key: 'text', label: 'Message', type: 'textarea', rows: 4, required: true, showIf: (c) => c.action === 'Envoyer un texte', placeholder: '{{llm.text}}' },
    { key: 'mediaUrl', label: 'URL du média', type: 'text', required: true, showIf: (c) => c.action === 'Envoyer un média' },
    { key: 'caption', label: 'Légende', type: 'textarea', rows: 2, showIf: (c) => c.action === 'Envoyer un média' },
    { key: 'delay', label: 'Délai avant envoi (ms)', type: 'number', default: 0, advanced: true },
  ],
  telegram: [
    { key: 'action', label: 'Action', type: 'select', options: ['Envoyer un message', 'Envoyer une photo', 'Envoyer un document'], default: 'Envoyer un message' },
    { key: 'botToken', label: 'Token du bot', type: 'password', required: true },
    { key: 'chatId', label: 'Chat ID', type: 'text', required: true, default: '{{trigger.chat_id}}' },
    { key: 'text', label: 'Message', type: 'textarea', rows: 4, required: true, showIf: (c) => c.action === 'Envoyer un message', placeholder: '{{llm.text}}' },
    { key: 'mediaUrl', label: 'URL du fichier', type: 'text', required: true, showIf: (c) => c.action !== 'Envoyer un message' },
    { key: 'caption', label: 'Légende', type: 'textarea', rows: 2, showIf: (c) => c.action !== 'Envoyer un message' },
    { key: 'parseMode', label: 'Mise en forme', type: 'select', options: ['Texte brut', 'Markdown', 'HTML'], default: 'Texte brut', advanced: true },
  ],
  mail: [
    { key: 'action', label: 'Action', type: 'select', options: ['Envoyer un email', "Répondre à l'email reçu"], default: 'Envoyer un email' },
    { key: 'credentialId', label: 'Compte Gmail', type: 'google-account', required: true },
    { key: 'to', label: 'Destinataire(s)', type: 'text', required: true, default: '{{trigger.from}}' },
    { key: 'cc', label: 'Copie (cc)', type: 'text', advanced: true },
    { key: 'subject', label: 'Objet', type: 'text', required: true, placeholder: 'Re : {{trigger.subject}}' },
    { key: 'body', label: 'Contenu', type: 'textarea', rows: 6, required: true, placeholder: '{{llm.text}}' },
    { key: 'html', label: 'Contenu en HTML', type: 'toggle', default: false, advanced: true },
  ],
  sheets: [
    { key: 'action', label: 'Action', type: 'select', options: ['Ajouter une ligne', 'Lire les lignes'], default: 'Ajouter une ligne' },
    { key: 'credentialId', label: 'Compte Google', type: 'google-account', required: true },
    { key: 'values', label: 'Colonnes à remplir', type: 'textarea', rows: 4, required: true, showIf: (c) => c.action === 'Ajouter une ligne', placeholder: 'Expéditeur : \nRéponse : ',
      help: 'Une colonne par ligne : « Titre : donnée ». Écrivez le titre, puis cliquez une donnée ci-dessous.' },
    { key: 'spreadsheet', label: 'Feuille Google existante (facultatif)', type: 'text', placeholder: 'Vide = créée automatiquement',
      help: 'Laissez vide : Relais crée la feuille dans votre Google Drive au premier envoi. Sinon, collez son adresse.' },
    { key: 'sheet', label: 'Onglet', type: 'text', placeholder: 'Feuille 1', help: 'Vide = premier onglet.', advanced: true },
  ],
  docs: [
    { key: 'action', label: 'Action', type: 'select', options: ['Ajouter du texte', 'Créer un document', 'Lire le document'], default: 'Ajouter du texte' },
    { key: 'credentialId', label: 'Compte Google', type: 'google-account', required: true },
    { key: 'document', label: 'Document', type: 'text', required: true, showIf: (c) => c.action !== 'Créer un document', placeholder: 'https://docs.google.com/document/d/…', help: "Collez l'adresse du document (ou son ID)." },
    { key: 'title', label: 'Titre', type: 'text', required: true, showIf: (c) => c.action === 'Créer un document', placeholder: 'Compte rendu – {{trigger.from}}' },
    { key: 'text', label: 'Texte', type: 'textarea', rows: 5, required: true, showIf: (c) => c.action === 'Ajouter du texte', placeholder: '{{llm.text}}', help: 'Ajouté à la fin du document.' },
    { key: 'text', label: 'Contenu (optionnel)', type: 'textarea', rows: 5, showIf: (c) => c.action === 'Créer un document', placeholder: '{{llm.text}}' },
  ],
  condition: [
    { key: 'left', label: 'Valeur à tester', type: 'text', required: true, placeholder: '{{llm.text}}' },
    { key: 'op', label: 'Opérateur', type: 'select', options: ['contient', 'ne contient pas', 'est égal à', 'est différent de', 'commence par', 'correspond à la regex', 'est vide', "n'est pas vide", 'est supérieur à', 'est inférieur à'], default: 'contient' },
    { key: 'right', label: 'Valeur de comparaison', type: 'text', required: true, showIf: (c) => c.op !== 'est vide' && c.op !== "n'est pas vide" },
    { key: 'caseSensitive', label: 'Sensible à la casse', type: 'toggle', default: false },
  ],
  function: [
    { key: 'language', label: 'Langage', type: 'select', options: ['JavaScript', 'Python'], default: 'JavaScript' },
    { key: 'inputs', label: 'Entrées (une par ligne : nom = valeur)', type: 'textarea', rows: 3, placeholder: 'texte = {{trigger.text}}\nnom = {{trigger.name}}', help: 'Accessibles dans le code via inputs.nom' },
    { key: 'code', label: 'Code', type: 'code', rows: 10, required: true, default: '// inputs.texte, inputs.nom…\nreturn { result: inputs.texte };' },
  ],
  automation: [
    { key: 'kind', label: "Type d'automation", type: 'select', options: ['Requête HTTP', 'Délai', 'Définir une variable', 'Boucle sur une liste', 'Stockage clé/valeur'], default: 'Requête HTTP' },
    { key: 'url', label: 'URL', type: 'text', required: true, showIf: (c) => c.kind === 'Requête HTTP', placeholder: 'https://api.exemple.com/…' },
    { key: 'method', label: 'Méthode', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET', showIf: (c) => c.kind === 'Requête HTTP' },
    { key: 'headers', label: 'En-têtes (JSON)', type: 'code', rows: 3, showIf: (c) => c.kind === 'Requête HTTP', placeholder: '{"Authorization":"Bearer …"}' },
    { key: 'body', label: 'Corps (JSON)', type: 'code', rows: 4, showIf: (c) => c.kind === 'Requête HTTP' },
    { key: 'duration', label: 'Durée', type: 'number', required: true, default: 5, showIf: (c) => c.kind === 'Délai' },
    { key: 'unit', label: 'Unité', type: 'select', options: ['secondes', 'minutes', 'heures'], default: 'secondes', showIf: (c) => c.kind === 'Délai' },
    { key: 'varName', label: 'Nom de la variable', type: 'text', required: true, showIf: (c) => c.kind === 'Définir une variable' },
    { key: 'varValue', label: 'Valeur', type: 'textarea', rows: 3, required: true, showIf: (c) => c.kind === 'Définir une variable' },
    { key: 'listExpr', label: 'Liste à parcourir', type: 'text', required: true, showIf: (c) => c.kind === 'Boucle sur une liste', placeholder: '{{function.result}}' },
    { key: 'itemName', label: "Nom de l'élément courant", type: 'text', default: 'item', showIf: (c) => c.kind === 'Boucle sur une liste' },
    { key: 'storeOp', label: 'Opération', type: 'select', options: ['Lire', 'Écrire'], default: 'Écrire', showIf: (c) => c.kind === 'Stockage clé/valeur' },
    { key: 'storeKey', label: 'Clé', type: 'text', required: true, showIf: (c) => c.kind === 'Stockage clé/valeur' },
    { key: 'storeValue', label: 'Valeur', type: 'textarea', rows: 2, required: true, showIf: (c) => c.kind === 'Stockage clé/valeur' && c.storeOp === 'Écrire' },
  ],
};

export const OUT_VARS: Record<BlockType, string[]> = {
  llm: ['text', 'json'], whatsapp: ['message_id'], telegram: ['message_id'], mail: ['status'], sheets: ['status', 'rows', 'count', 'url'], docs: ['document_id', 'url', 'text'],
  function: ['result'], automation: ['result', 'status'], condition: [],
};

export const PORT_COLORS: Record<'yes' | 'no', string> = { yes: '#15803d', no: '#c8372d' };
