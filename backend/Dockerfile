# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 se compile si aucun binaire précompilé ne correspond à la version de Node
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=3001
WORKDIR /app
# python3 : uniquement pour le bloc Fonction en Python (facultatif)
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Le disque persistant (Render, volume Docker) est monté au démarrage, souvent en root :
# on lui rend ses droits, puis on lance le serveur en utilisateur node (non root)
CMD ["sh", "-c", "chown -R node:node /data 2>/dev/null; exec setpriv --reuid=node --regid=node --init-groups node dist/server.js"]
