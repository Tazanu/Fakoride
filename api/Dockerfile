# The Fako Ride API, as one container.
#
# Runs on Render (see render.yaml at the repo root), and on anything else that
# runs a container — including a VPS rented in francs, if that ever beats a
# dollar-billed host. On start it applies any pending migrations, then serves.
#
# Build and run it locally the same way production will:
#
#   docker build -t fako-ride-api api
#   docker run --env-file api/.env.production -p 4000:4000 fako-ride-api

# --- build: compile the TypeScript and generate Prisma's client for Alpine ---
FROM node:24-alpine AS build
WORKDIR /app
# Prisma's query engine links against OpenSSL; Alpine does not ship it.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate \
 && npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# --- run: only what serving needs ----------------------------------------------
FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./

# Not root: a hole in a dependency should not be a hole in the machine.
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/health" >/dev/null || exit 1

# Migrations first, every start. `migrate deploy` only applies what has not run
# and never resets anything, so a restart is harmless. The seed is NOT here: it
# rewrites the observed corridor fares, and ops may have corrected those since.
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && node dist/server.js"]
