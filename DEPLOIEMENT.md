# Déployer Relais : backend sur Render, frontend sur Vercel

## En local

```bash
npm run dev     # à la racine : lance le backend (port 3001) et le frontend (port 3000)
```
Connectez-vous avec `ADMIN_USERNAME` et `ADMIN_PIN` de `backend/.env` (modifiables ; redémarrez le backend après changement).
`backend/.env` et `frontend/.env.local` restent sur votre machine (ignorés par git).

Render et Vercel déploient depuis un dépôt Git : poussez d'abord ce dossier sur GitHub
(`git init && git add . && git commit -m "Relais" && git push`, le `.gitignore` exclut `node_modules`, `.env` et `data/`).

## 1. Backend sur Render

1. Render → **New → Blueprint** → choisissez le dépôt. Render lit `render.yaml` et crée le service `relais-api`.
2. Il demande cinq valeurs :
   - `ADMIN_USERNAME` et `ADMIN_PIN` : vos identifiants de connexion (le PIN = exactement 4 chiffres).
   - `ENCRYPTION_KEY` : le résultat de `openssl rand -hex 32`. **Gardez-la** : sans elle, les comptes Gmail enregistrés deviennent illisibles.
   - `PUBLIC_URL` : l'adresse du service, par exemple `https://relais-api.onrender.com`.
   - `CORS_ORIGIN` : l'adresse du frontend Vercel, par exemple `https://relais.vercel.app` (vous pouvez la compléter après l'étape 2).
3. `API_KEY` est générée par Render : elle signe les sessions (la changer déconnecte tout le monde).
4. Vérifiez : `https://relais-api.onrender.com/api/health` doit répondre `{"ok":true,…}`.

Le plan **Starter** (payant) est nécessaire : l'offre gratuite s'endort après 15 minutes sans trafic
(WhatsApp, Telegram, Gmail et les planifications s'arrêtent) et n'a pas de disque (base et session WhatsApp perdues à chaque redémarrage).
Gardez **une seule instance**.

## 2. Frontend sur Vercel

1. Vercel → **Add New → Project** → le même dépôt.
2. **Root Directory** : `frontend` (Next.js est détecté automatiquement).
3. Variable d'environnement : `NEXT_PUBLIC_API_URL` = l'adresse Render (`https://relais-api.onrender.com`).
4. Déployez, puis reportez l'adresse Vercel dans `CORS_ORIGIN` sur Render (le service redémarre).

## 3. Utilisation

- Ouvrez l'adresse Vercel, entrez votre nom d'utilisateur et votre code PIN. La session dure 1 an sur cet appareil.
  Protection : 5 codes faux bloquent l'appareil 15 min ; 30 codes faux en une heure bloquent toute connexion pendant 1 h.
- Créez un agent, configurez-le, testez-le, activez-le.
- **Partager** (en-tête) → **Créer le lien client** : envoyez ce lien au client. Il voit son agent en direct,
  chaque exécution et les valeurs produites à chaque étape, sans pouvoir rien modifier ni voir les clés.
  **Nouveau lien** invalide l'ancien ; **Désactiver le lien** coupe l'accès.

## Google (Gmail, Sheets, Docs)

Un seul compte Google sert aux blocs Mail, Google Sheets et Google Docs. Dans Google Cloud, activez les API
**Gmail**, **Google Sheets** et **Google Docs**. Un compte connecté avant l'ajout de Sheets/Docs doit être reconnecté
(le bloc affiche alors un message clair).

Dans Google Cloud, l'URI de redirection autorisée de l'ID client OAuth doit être
`https://relais-api.onrender.com/oauth/google/callback` (`PUBLIC_URL` + `/oauth/google/callback`).
