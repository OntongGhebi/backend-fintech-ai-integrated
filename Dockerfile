
# --------------------------------------------------
# Stage 1: Install all dependencies for building
# --------------------------------------------------
FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# --------------------------------------------------
# Stage 2: Generate Prisma Client and build NestJS
# --------------------------------------------------
FROM dependencies AS build

WORKDIR /app

COPY . .

# Prisma 7 reads DATABASE_URL from prisma.config.ts.
# This placeholder is used only for client generation.
# It is not carried into the runtime image.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    npx prisma generate

RUN npm run build


# --------------------------------------------------
# Stage 3: Dedicated migration runner
# --------------------------------------------------
FROM build AS migrate

ENV NODE_ENV=production

CMD ["npx", "prisma", "migrate", "deploy"]


# --------------------------------------------------
# Stage 4: Install production dependencies only
# --------------------------------------------------
FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force


# --------------------------------------------------
# Stage 5: Minimal production runtime
# --------------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV API_PREFIX=api/v1

COPY --from=production-dependencies --chown=node:node \
    /app/node_modules ./node_modules

COPY --from=production-dependencies --chown=node:node \
    /app/package.json ./package.json

COPY --from=build --chown=node:node \
    /app/dist ./dist

COPY --from=build --chown=node:node \
    /app/scripts/start-prod.cjs ./scripts/start-prod.cjs

USER node

EXPOSE 3000

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=30s \
    --retries=3 \
    CMD node -e "const p=process.env.PORT||3000;const prefix=(process.env.API_PREFIX||'api/v1').replace(/^\\/+|\\/+$/g,'');fetch('http://127.0.0.1:'+p+'/'+prefix+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/start-prod.cjs"]
