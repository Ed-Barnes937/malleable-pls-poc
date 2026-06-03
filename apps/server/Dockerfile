FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/workflows/package.json packages/workflows/package.json
RUN pnpm install --frozen-lockfile --filter @pls/server...

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

COPY apps/server/ apps/server/
COPY packages/db/ packages/db/
COPY packages/workflows/ packages/workflows/
COPY package.json pnpm-workspace.yaml ./

RUN addgroup -S app && adduser -S app -G app
RUN mkdir -p /data/uploads && chown app:app /data/uploads

USER app

ENV NODE_ENV=production
ENV PORT=3001
ENV UPLOADS_DIR=/data/uploads
EXPOSE 3001

CMD ["pnpm", "--filter", "@pls/server", "run", "migrate-and-start"]
