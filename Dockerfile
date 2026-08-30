FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/data/krypto.db
ENV BASE_CURRENCY=EUR
ENV PRICE_PROVIDER=coingecko
ENV PRICE_CACHE_TTL_SECONDS=600
ENV BACKUP_DIRECTORY=/backups
ENV BACKUP_RETENTION_COUNT=14
ENV BACKUP_RETENTION_DAYS=30
ENV HOURLY_SNAPSHOT_RETENTION_DAYS=90

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib/server/db/migrations ./src/lib/server/db/migrations

RUN mkdir -p /data /backups
VOLUME ["/data", "/backups"]
EXPOSE 3000

CMD ["node", "build"]
