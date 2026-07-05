# Krypto Dashboard

A private, self-hosted crypto portfolio tracker for manual transactions. It uses SQLite, SvelteKit, Drizzle ORM, and public CoinGecko price data. It does not connect to private exchange APIs and has no trading, withdrawal, or registration features.

## Local Setup

```bash
npm install
cp .env.example .env
# Edit .env and set INTERNAL_CRON_SECRET to a long random value.
npm run db:migrate
npm run seed
npm run dev
```

Open `http://localhost:5173`.

Useful checks:

```bash
npm run test
npm run check
npm run lint
npm run build
```

## Docker

Create the Docker network shared with Nginx Proxy Manager if it does not already exist:

```bash
docker network create npm_proxy
```

Build and run:

```bash
cp .env.example .env
# Edit .env and set INTERNAL_CRON_SECRET to a long random value.
docker compose up -d --build
docker compose ps
```

The app container exposes port `3000` only to the `npm_proxy` Docker network. It does not bind a public host port by default. `docker compose up -d` starts both `krypto-dashboard` and `snapshot-cron`.

## Automatic Snapshots

Portfolio value charts use rows from the `portfolio_snapshots` SQLite table. The app creates real snapshots only; it does not invent historical values. On the first dashboard visit, the server creates an initial hourly snapshot if none exist yet.

The `snapshot-cron` sidecar runs Alpine `crond` and calls the app by Docker DNS alias:

- Hourly: minute 5, `POST http://app:3000/api/internal/snapshots/hourly`
- Daily: 23:55, `POST http://app:3000/api/internal/snapshots/daily`

Both calls require:

```text
Authorization: Bearer ${INTERNAL_CRON_SECRET}
```

Set `INTERNAL_CRON_SECRET` in `.env` to a long random value and keep it the same for the app and sidecar. Do not expose `/api/internal/*` publicly without the bearer token. Nginx Proxy Manager should expose only the normal app route with its Access List / Basic Auth in front.

Manual verification from inside the Compose network:

```bash
docker compose exec snapshot-cron sh -lc 'curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://app:3000/api/internal/snapshots/hourly'
docker compose exec snapshot-cron sh -lc 'curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://app:3000/api/internal/snapshots/daily'
```

For local dev on the Vite server:

```bash
curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://localhost:5173/api/internal/snapshots/hourly
```

Disable the cron sidecar while keeping the app running:

```bash
docker compose up -d --scale snapshot-cron=0
```

Chart ranges map to snapshot types as follows:

- `24h`: hourly snapshots
- `7d`: hourly snapshots when at least 24 hourly points exist, otherwise daily snapshots if available
- `30d`, `90d`, `1y`, `all`: daily snapshots

Duplicate prevention is enforced by a unique SQLite index over snapshot type, base currency, and normalized UTC bucket timestamp. Repeated calls for the same hour or day return `already_exists`.

## GitHub Actions CI/CD

The workflow in `.github/workflows/ci-cd.yml` runs checks on pull requests and pushes to `main` or `master`:

```bash
npm ci
npm run check
npm run lint
npm run test
npm run build
docker build
```

On pushes to `main`, `master`, and version tags, it publishes the Docker image to GitHub Container Registry as:

```text
ghcr.io/<owner>/<repo>:main
ghcr.io/<owner>/<repo>:master
ghcr.io/<owner>/<repo>:sha-<commit-sha>
ghcr.io/<owner>/<repo>:vX.Y.Z
ghcr.io/<owner>/<repo>:latest
```

For production deployment, keep this repository checked out on the server and set these GitHub repository secrets:

- `DEPLOY_HOST`: SSH host/IP
- `DEPLOY_USER`: SSH user with Docker access
- `DEPLOY_SSH_KEY`: private SSH key for deployment
- `DEPLOY_PATH`: absolute path to the checked-out project on the server
- `DEPLOY_PORT`: optional SSH port, defaults to `22`
- `ENABLE_PRODUCTION_DEPLOY`: set to `true` to deploy automatically after pushes to `main` or `master`

You can also run the workflow manually and enable the `deploy` input. The deploy job pulls the tested GHCR image, runs `npm run db:migrate` against the persistent SQLite volume, restarts the Compose service, and checks `/health`.

## Password Protection

Authentication for this v1 app is handled in front of the container with Nginx Proxy Manager Access Lists / Basic Auth. Keep the app container private and require Basic Auth at the proxy.

1. Make sure Nginx Proxy Manager and this app share the same Docker network:

   ```bash
   docker network create npm_proxy
   docker compose up -d
   ```

   If Nginx Proxy Manager is already running in a separate Compose stack, attach its app container to the same network or add `npm_proxy` as an external network in that stack.

2. In Nginx Proxy Manager, create an access list:

   - Go to `Access Lists` -> `Add Access List`
   - Name it `Krypto Dashboard`
   - Add one username and a strong password under `Authorization`
   - Save it

3. Create or edit the proxy host:

   - Domain Names: your dashboard domain
   - Scheme: `http`
   - Forward Hostname/IP: `krypto-dashboard`
   - Forward Port: `3000`
   - Websockets Support: off
   - Access List: `Krypto Dashboard`
   - SSL: request/attach your certificate and enable `Force SSL`

4. Verify the container is not published directly:

   ```bash
   docker compose ps
   ```

   The dashboard service should not show a public host port such as `0.0.0.0:3000->3000/tcp`.

5. Verify the protection from a private/incognito browser window:

   - Opening the dashboard domain should show a browser username/password prompt
   - Canceling the prompt should not show the dashboard
   - Entering the saved Basic Auth credentials should load the dashboard

Warning: do not expose this app publicly without access control, and do not add a `ports:` mapping for the dashboard service unless it is bound only to a trusted local interface for debugging.

## Backup

The Compose volume is named `krypto-dashboard-data`.

Safe stopped-container backup:

```bash
mkdir -p backups
docker compose stop krypto-dashboard
docker run --rm -v krypto-dashboard-data:/data -v "$PWD/backups:/backup" busybox sh -c "cp /data/krypto.db /backup/krypto-$(date +%F).db"
docker compose start krypto-dashboard
```

You can also download a live backup from `/api/backup` while authenticated through Nginx Proxy Manager.

## Restore

```bash
docker compose stop krypto-dashboard
docker run --rm -v krypto-dashboard-data:/data -v "$PWD/backups:/backup" busybox sh -c "cp /backup/krypto-YYYY-MM-DD.db /data/krypto.db && rm -f /data/krypto.db-wal /data/krypto.db-shm"
docker compose up -d
```

Replace `krypto-YYYY-MM-DD.db` with your backup filename.

## CSV Format

Export from `/api/export` or the Transactions page. Import expects:

```text
type,asset_provider,asset_provider_coin_id,asset_symbol,asset_name,quantity,fiat_amount,fiat_currency,fee_amount,fee_currency,transaction_date,notes
```

## Calculation Model

v1 uses average cost basis:

- Buy cost = fiat amount + buy fee
- Average cost = total buy cost / total quantity bought
- Current quantity = buys - sells
- Current value = current quantity × current market price
- Open cost basis = current quantity × average cost
- Unrealized P/L = current value - open cost basis
- ROI = unrealized P/L / open cost basis × 100

Realized P/L is approximate in v1.

## Known Limitations

- Fiat conversion is not implemented. For clean reporting, enter transactions in the selected base currency.
- No tax reporting, FIFO/LIFO, exchange sync, or real-time WebSocket pricing.
- Portfolio history begins when real automatic snapshots are created; past values are not backfilled.
- Coin search and price refresh depend on CoinGecko availability and rate limits.

## Suggested V2 Improvements

- Optional FX conversion cache for EUR/USD transaction mixing.
- FIFO/LIFO cost basis modes after average-cost parity tests.
- Optional Kraken public market price provider.
- Encrypted off-host backup target.
