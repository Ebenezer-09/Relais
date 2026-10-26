# Synapse Backend

Moteur de workflows (façon n8n) pour le builder **Synapse Flow** : déclencheurs, exécution par items,
historique par bloc, identifiants chiffrés. Blocs : **LLM, WhatsApp (Baileys), Telegram, Gmail, Condition, Fonction, Automation**.

## Démarrage local

```bash
npm install
cp .env.example .env        # puis renseigner API_KEY et ENCRYPTION_KEY
openssl rand -hex 32        # -> ENCRYPTION_KEY (ne la perdez pas : sans elle les identifiants sont illisibles)
export $(grep -v '^#' .env | xargs) && npm run dev
npm test
```

## Déploiement (VM Google Compute Engine ou n'importe quel serveur Docker)

```bash
cp .env.example .env   # PUBLIC_URL = https://votre-domaine.com ; CORS_ORIGIN = origine du builder
docker compose up -d --build
```

- **Une seule instance** : WhatsApp garde une connexion ouverte et les déclencheurs (cron, polling) tournent dans le processus. Ne lancez pas deux réplicas.
- Montez `/data` sur un disque persistant et sauvegardez-le : il contient la base SQLite et les sessions WhatsApp.
- Mettez un **proxy HTTPS** devant (Caddy ou nginx) : les webhooks Telegram/Google et l'API exigent HTTPS en production.
- Cloud Run n'est pas adapté tel quel (instances qui s'éteignent, disque éphémère). Une VM `e2-small` suffit pour démarrer.

## Modèle de données (comme n8n)

Chaque bloc reçoit une liste d'éléments et s'exécute **une fois par élément**. Les expressions `{{ … }}` sont évaluées avant chaque exécution :

| Expression | Valeur |
|---|---|
| `{{ $json.text }}` | élément reçu par ce bloc |
| `{{ $('Nom du bloc').item.json.x }}` | l'élément **apparié** d'un bloc amont (la filiation est suivie à travers conditions et boucles) |
| `{{ $('Nom du bloc').all() }}` | tous les éléments de ce bloc |
| `{{trigger.text}}`, `{{llm.text}}` | alias historiques du builder (nom du bloc en snake_case) |

Une expression qui occupe tout le champ garde son type (liste, objet) ; mêlée à du texte, elle est convertie en texte.
Réglages par bloc (`node.settings`) : `retries`, `retryDelayMs`, `onError: "continue"`.

## API (`Authorization: Bearer <API_KEY>`)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET/POST | `/api/workflows` | lister / créer `{ name, graph:{nodes,edges} }` (l'export JSON du builder est accepté tel quel) |
| GET/PUT/DELETE | `/api/workflows/:id` | lire (avec URL de webhook test/production) / modifier / supprimer |
| POST | `/api/workflows/:id/activate` · `/deactivate` | enregistre ou retire le déclencheur |
| POST | `/api/workflows/:id/run` | exécution manuelle `{ input, pinned, startNodeId, onlyStart }` |
| POST | `/api/run` | exécute un graphe **non enregistré** (bouton « Tester »), non persisté |
| GET | `/api/executions?workflowId=` · `/api/executions/:id` | historique, avec entrées/sorties de chaque bloc |
| GET/POST/PUT/DELETE | `/api/credentials` | identifiants chiffrés (AES-256-GCM) ; les secrets ne sont jamais renvoyés |
| POST | `/api/whatsapp/:session/connect` `{method:"qr"\|"pairing", phone}` | démarre la session |
| GET | `/api/whatsapp/:session/events?token=<API_KEY>` | flux SSE : QR (data URL), code de jumelage, état |
| GET · POST | `/api/whatsapp/:session/status` · `/disconnect` | état / déconnexion (supprime la session) |
| POST | `/api/oauth/google/url` `{credentialId}` | URL d'autorisation Google |
| any | `/webhook/<chemin>` · `/webhook-test/<chemin>` | webhooks publics (production = workflow actif ; test = tout workflow) |

## Configurer Gmail (Google Cloud)

1. Console Google Cloud → créez un projet, activez **Gmail API**.
2. Écran de consentement OAuth, puis **Identifiants → ID client OAuth → Application Web**. URI de redirection autorisée : `https://votre-domaine.com/oauth/google/callback` (`PUBLIC_URL` + `/oauth/google/callback`).
3. Créez un identifiant `{ "name":"Gmail", "type":"googleOAuth", "data":{ "clientId":"…", "clientSecret":"…" } }`.
4. `POST /api/oauth/google/url` → ouvrez l'URL, autorisez : le `refreshToken` est stocké chiffré.
5. Dans le bloc Mail et le déclencheur « Email entrant », mettez `credentialId`.

Tant que l'application est en mode « Test », Google expire le refresh token après 7 jours : passez-la en production (ou publiez-la en interne si vous avez Google Workspace). Les mails entrants sont lus par **polling** (toutes les 60 s par défaut, mis en lu une fois traités), sans configuration Pub/Sub.

## WhatsApp (Baileys)

Baileys est une bibliothèque **non officielle** : le numéro peut être **bloqué** par WhatsApp (envois massifs, messages non sollicités). Utilisez un numéro dédié, gardez le champ « délai » et évitez le volume. Pour des clients en production, l'API WhatsApp Business officielle est la voie sûre.
Les blocs utilisent `sessionId` (défaut `default`) ; plusieurs numéros = plusieurs sessions.

## Limites connues

- Le code des blocs Fonction et les expressions tournent dans `node:vm` avec les données clonées et sans accès à `process`/`require`, mais **`vm` n'est pas une frontière de sécurité** : ne laissez écrire des workflows qu'à des personnes de confiance. Pour du multi-utilisateur, passez à `isolated-vm` ou à un processus isolé.
- Mono-utilisateur (une seule clé d'API), un seul processus, pas de file externe : un redémarrage interrompt les exécutions en cours (marquées en erreur).
- Pas encore de bloc Fusionner / Switch ; la condition a deux sorties.
- Le schéma du mode « JSON avec schéma » est donné au modèle mais la réponse n'est pas validée contre lui (seul le JSON valide est exigé).
