# Untested Realm — demo image. One container serves everything: the server
# (HTTP + WebSocket on $PORT) statically serves the built client, so a single
# tunnel hostname covers the whole app. Runs as the non-root `node` user.
FROM node:24-alpine

WORKDIR /app

# layer-cache the npm install: manifests first, sources later
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci

COPY . .
RUN npm run build

# `battles` CLI on PATH so operators can `docker exec <container> battles` to see
# active games (queries the live server over localhost). Symlink needs root — do
# it before dropping to the node user below.
RUN chmod +x packages/server/bin/battles.mjs \
  && ln -sf /app/packages/server/bin/battles.mjs /usr/local/bin/battles

# demo database lives OUTSIDE the repo tree, in a dir the node user owns;
# ephemeral by default (wiped with the container), mount a volume to persist
RUN mkdir -p /data && chown node:node /data
ENV SORCERY_DB=/data/sorcery.db
ENV NODE_ENV=production
ENV PORT=8787

USER node
EXPOSE 8787
CMD ["npm", "run", "start"]
