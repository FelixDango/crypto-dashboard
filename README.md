# Krypto Dashboard

A private, self-hosted crypto portfolio tracker for manual transactions. It uses SQLite, SvelteKit, Drizzle ORM, and public CoinGecko price data. It does not connect to private exchange APIs and has no trading, withdrawal, or registration features.

## Local Setup

```bash
npm install
cp .env.example .env
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
docker compose up -d --build
docker compose ps
```

The container exposes port `3000` only to the Docker network. It does not bind a public host port by default.

## GitHub Actions CI/CD

The workflow in `.github/workflows/ci-cd.yml` runs checks on pull requests and pushes to `main`:

```bash
npm ci
npm run check
npm run lint
npm run test
npm run build
docker build
```

On pushes to `main` and version tags, it publishes the Docker image to GitHub Container Registry as:

```text
ghcr.io/<owner>/<repo>:main
ghcr.io/<owner>/<repo>:sha-<commit-sha>
ghcr.io/<owner>/<repo>:vX.Y.Z
```

For production deployment, keep this repository checked out on the server and set these GitHub repository secrets:

- `DEPLOY_HOST`: SSH host/IP
- `DEPLOY_USER`: SSH user with Docker access
- `DEPLOY_SSH_KEY`: private SSH key for deployment
- `DEPLOY_PATH`: absolute path to the checked-out project on the server
- `DEPLOY_PORT`: optional SSH port, defaults to `22`

Enable automatic deploys from `main` by setting the repository variable `ENABLE_PRODUCTION_DEPLOY` to `true`. You can also run the workflow manually and enable the `deploy` input. The deploy job pulls the tested GHCR image, runs `npm run db:migrate` against the persistent SQLite volume, restarts the Compose service, and checks `/health`.

## Nginx Proxy Manager

Create a Proxy Host:

- Forward Hostname/IP: `krypto-dashboard`
- Forward Port: `3000`
- Scheme: `http`
- Websockets Support: off
- SSL: enable and request/attach your certificate
- Access List: enable Basic Auth or another NPM access list

Warning: do not expose this app publicly without access control.

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
- Price history charts are built from cached snapshots collected while the app is used.
- Coin search and price refresh depend on CoinGecko availability and rate limits.

## Suggested V2 Improvements

- Optional FX conversion cache for EUR/USD transaction mixing.
- FIFO/LIFO cost basis modes after average-cost parity tests.
- Scheduled price snapshot capture.
- Optional Kraken public market price provider.
- Encrypted off-host backup target.
