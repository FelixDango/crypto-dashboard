# Krypto Dashboard

A private, self-hosted crypto portfolio tracker for manual transactions. It uses SQLite, SvelteKit,
Drizzle ORM, and public CoinGecko price data. It does not connect to private exchange APIs and has
no trading, withdrawal, or registration features. Public RSS news is optional context only and does
not prove why prices moved.

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
npm test
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

The app container exposes port `3000` only to the `npm_proxy` Docker network. It does not bind a
public host port by default. `docker compose up -d` starts both `krypto-dashboard` and
`snapshot-cron`.

## Automatic Snapshots And Health

Portfolio value charts use rows from the `portfolio_snapshots` SQLite table. The app creates real
snapshots only; it does not invent historical values. On the first dashboard visit, the server
creates an initial hourly snapshot if none exist yet.

The `snapshot-cron` sidecar runs Alpine `crond` and calls the app by internal Docker service name:

- Hourly snapshot: minute 5, `POST http://krypto-dashboard:3000/api/internal/snapshots/hourly`
- Analytics health check: minute 10,
  `POST http://krypto-dashboard:3000/api/internal/analytics/health-check`
- News fetch: minute 20, `POST http://krypto-dashboard:3000/api/internal/news/fetch`
- Daily snapshot: 23:55, `POST http://krypto-dashboard:3000/api/internal/snapshots/daily`

These calls require:

```text
Authorization: Bearer ${INTERNAL_CRON_SECRET}
```

Set `INTERNAL_CRON_SECRET` in `.env` to a long random value and keep it the same for the app and
sidecar. Do not expose `/api/internal/*` publicly without the bearer token. Nginx Proxy Manager
should expose only the normal app route with its Access List / Basic Auth in front.

Manual verification from inside the Compose network:

```bash
docker compose logs snapshot-cron --since 24h
```

```bash
docker compose exec snapshot-cron sh -c 'curl -i -X POST http://krypto-dashboard:3000/api/internal/analytics/health-check -H "Authorization: Bearer $INTERNAL_CRON_SECRET"'
```

```bash
docker compose exec snapshot-cron sh -lc 'curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://krypto-dashboard:3000/api/internal/snapshots/hourly'
docker compose exec snapshot-cron sh -c 'curl -i -X POST http://krypto-dashboard:3000/api/internal/news/fetch -H "Authorization: Bearer $INTERNAL_CRON_SECRET"'
docker compose exec snapshot-cron sh -lc 'curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://krypto-dashboard:3000/api/internal/snapshots/daily'
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
- `7d`: hourly snapshots when hourly history is complete, otherwise daily snapshots if available
- `30d`, `90d`, `1y`, `all`: daily snapshots

Duplicate prevention is enforced by a unique SQLite index over snapshot type, base currency, and
normalized UTC bucket timestamp. Repeated calls for the same hour or day return `already_exists`.

## V6 News Context Engine

Open `/news` for public crypto headlines, source status, filters, and asset-context grouping.
`/insights` and `/assets/[asset]` also show compact “Possible news context” sections.

What it does:

- Fetches enabled public RSS sources server-side.
- Stores articles in SQLite and deduplicates by URL or source external ID.
- Matches headlines to currently held assets with deterministic symbol/name/alias rules.
- Extracts simple keyword themes such as `ETF`, `macro`, `regulation`, `security/exploit`, and
  `exchange`.
- Assigns a conservative `Context label`: `positive`, `neutral`, `negative`, `mixed`, or `unknown`.
- Shows the disclaimer: “This is possible news context only and does not prove causation.”

What it does not do:

- It does not present headlines as the reason for a price movement.
- It does not provide financial advice, tax advice, trading, withdrawals, or exchange connections.
- It does not require paid APIs, API keys, OAuth, AI, PostgreSQL, or Kubernetes.
- It does not block dashboard, accounting, analytics, or snapshots if a feed is unavailable.

Default RSS rows are seeded in `news_sources` for CoinDesk, Cointelegraph, Decrypt, and Bitcoin
Magazine. To add or edit sources, update `news_sources` in SQLite; keep `type = 'rss'`, set
`is_enabled = 1`, and choose a `fetch_interval_minutes` value. Official project blogs can be added
the same way.

News endpoints:

- `GET /api/news/articles?assetId=&sourceId=&theme=&range=24h|7d|30d`
- `GET /api/news/context?range=24h|7d|30d`
- `GET /api/news/context/[assetId]?range=24h|7d|30d`
- `GET /api/news/health`
- `POST /api/internal/news/fetch` with `Authorization: Bearer ${INTERNAL_CRON_SECRET}`

Manual news fetch from the cron sidecar:

```bash
docker compose exec snapshot-cron sh -c 'curl -i -X POST http://krypto-dashboard:3000/api/internal/news/fetch -H "Authorization: Bearer $INTERNAL_CRON_SECRET"'
```

Logs and health checks:

```bash
docker compose logs snapshot-cron --since 24h
docker compose logs krypto-dashboard --since 24h | grep -i news
```

SQLite checks:

```sql
select count(*) from news_articles;
select count(*) from news_article_asset_matches;
select status, count(*) from news_fetch_events group by status;
```

## Analytics

Open `/analytics` for performance cards, portfolio value and drawdown charts, monthly contribution
and P/L charts, allocation drift, asset performance, and data health. The page uses these server
endpoints:

- `GET /api/analytics/summary`
- `GET /api/analytics/performance?range=24h|7d|30d|90d|1y|all`
- `GET /api/analytics/drawdown?range=24h|7d|30d|90d|1y|all`
- `GET /api/analytics/monthly`
- `GET /api/analytics/allocation`
- `GET /api/analytics/health`

Performance history comes from `portfolio_snapshots`. Current accounting values still come from the
manual transaction ledger plus cached public market prices.

Key labels:

- Portfolio value change = raw change between the first and last snapshot in the selected range.
- Cash-flow adjusted P/L = end portfolio value - start portfolio value - net contribution.
- Accounting P/L = realized P/L + unrealized P/L from the current portfolio accounting view.

ATH and drawdown:

```text
drawdown_percent = (current_value - running_ath) / running_ath * 100
```

Drawdown values are zero or negative. Max drawdown is the lowest drawdown in the selected series.

Monthly contribution:

```text
monthly_buy_cost = sum(buy fiat_amount + buy fees)
monthly_sell_proceeds = sum(sell fiat_amount - sell fees)
net_contribution = monthly_buy_cost - monthly_sell_proceeds
```

Monthly P/L uses daily snapshots:

```text
monthly_pnl = end_portfolio_value - start_portfolio_value - net_contribution
```

If a month is missing start/end daily snapshots, it is marked incomplete and omitted from the P/L
chart.

Allocation concentration uses the largest current asset weight:

```text
top_asset_weight_percent = largest_asset_value / total_portfolio_value * 100
```

Set `ALLOCATION_CONCENTRATION_WARNING_PERCENT=70` to change the warning threshold.

## V5 Intelligence Layer

Open `/insights` for deterministic portfolio context. V5 adds:

- Privacy mode in the app shell. `off`, `basic`, and `strict` are stored in browser localStorage.
  Basic hides fiat values. Strict hides fiat values and exact coin quantities.
- Data confidence score answering whether the displayed numbers are trustworthy.
- Explain mode using deterministic rules from snapshots, prices, transactions, analytics, and the
  custom cycle model. It does not use AI and does not provide buy/sell advice.
- Custom cycle model cards on `/dashboard`, `/analytics`, and `/insights`.
- Optional bull/bear cycle overlays on portfolio value and drawdown charts.

V5 API endpoints:

- `GET /api/insights/summary`
- `GET /api/insights/confidence`
- `GET /api/insights/explain?range=24h|7d|30d`
- `GET /api/insights/cycle`
- `GET /api/insights/cycle/windows?start=YYYY-MM-DD&end=YYYY-MM-DD`

### Custom Cycle Model

This is a personal custom cycle model, not a prediction or financial advice.

The app stores cycle windows as half-open intervals: `[start_date, end_date)`. The start date is
included, the end date is excluded, and the displayed end date is one day before `end_date`.

Seeded model:

```text
Bull: 2022-11-08 -> 2025-10-05
Bear: 2025-10-06 -> 2026-10-05
Bull: 2026-10-06 -> 2029-09-03
Bear: 2029-09-04 -> 2030-09-03
Bull: 2030-09-04 -> 2033-08-02
Bear: 2033-08-03 -> 2034-08-02
```

Internal seed values:

```text
first_bull_start_date: 2022-11-08
first_bull_end_date_exclusive: 2025-10-06
first_bear_start_date: 2025-10-06
first_bear_end_date_exclusive: 2026-10-06
recurrence_start_date: 2026-10-06
recurring_bull_duration_days: 1064
recurring_bear_duration_days: 365
```

Manual cycle checks:

```text
Open /insights and confirm:
- 2022-11-08 appears as bull start
- 2025-10-06 appears as bear start
- 2026-10-06 appears as recurring bull start
- 2029-09-04 appears as bear start
```

### Data Confidence

The data confidence score is a weighted average:

- Snapshots: 30%
- Prices: 30%
- Transactions: 25%
- Accounting: 15%

The score checks snapshot freshness and gaps, price freshness and missing prices, suspicious manual
transactions, sell quantities, and whether open accounting lots match transaction-derived holdings.

### Explain Mode

Explain mode returns structured JSON with `summary`, `bullets`, `warnings`, and `drivers`. It is
deterministic and limited to app data. It avoids prescriptive trade recommendations.

Verification:

```bash
npm test
npm run build
```

### Data Health Rules

`/analytics` shows `Healthy`, `Warning`, or `Broken` for snapshots and prices.

- Hourly snapshots are healthy within 2 hours, warning between 2 and 6 hours, broken after 6 hours.
- Daily snapshots are healthy within 36 hours, warning between 36 and 72 hours, broken after
  72 hours.
- Hourly history has a gap when adjacent hourly snapshots are more than 90 minutes apart.
- Daily history has a gap when adjacent daily snapshots are more than 36 hours apart.
- Prices are fresh within 30 minutes, stale between 30 minutes and 24 hours, missing after 24 hours
  or when no usable price exists.
- Failed price fetch attempts are stored in `price_update_events` and shown in price health.

Price event retention:

- Successful price events are kept for 30 days.
- Failed and stale-fallback price events are kept for 90 days.
- The internal analytics health check runs cleanup.

SQLite verification queries for `/data/krypto.db`:

```sql
select snapshot_type, bucket_at, captured_at, price_status
from portfolio_snapshots
where snapshot_type = 'hourly'
order by bucket_at desc
limit 1;
```

```sql
select snapshot_type, bucket_at, captured_at, price_status
from portfolio_snapshots
where snapshot_type = 'daily'
order by bucket_at desc
limit 1;
```

```sql
select asset_id, provider, fiat_currency, status, error_message, checked_at
from price_update_events
where status = 'failed'
order by checked_at desc
limit 20;
```

Hourly gap inspection:

```sql
with ordered as (
  select
    bucket_at,
    lag(bucket_at) over (order by bucket_at) as previous_bucket
  from portfolio_snapshots
  where snapshot_type = 'hourly'
)
select
  previous_bucket,
  bucket_at,
  round((julianday(bucket_at) - julianday(previous_bucket)) * 24, 2) as gap_hours
from ordered
where previous_bucket is not null
  and (julianday(bucket_at) - julianday(previous_bucket)) * 24 > 1.5;
```

## GitHub Actions CI/CD

The workflow in `.github/workflows/ci-cd.yml` runs checks on pull requests and pushes to `main` or
`master`:

```bash
npm ci
npm run check
npm run lint
npm run test
npm run build
docker build
```

On pushes to `main`, `master`, and version tags, it publishes the Docker image to GitHub Container
Registry as:

```text
ghcr.io/<owner>/<repo>:main
ghcr.io/<owner>/<repo>:master
ghcr.io/<owner>/<repo>:sha-<commit-sha>
ghcr.io/<owner>/<repo>:vX.Y.Z
ghcr.io/<owner>/<repo>:latest
```

For production deployment, keep this repository checked out on the server and set these GitHub
repository secrets:

- `DEPLOY_HOST`: SSH host/IP
- `DEPLOY_USER`: SSH user with Docker access
- `DEPLOY_SSH_KEY`: private SSH key for deployment
- `DEPLOY_PATH`: absolute path to the checked-out project on the server
- `DEPLOY_PORT`: optional SSH port, defaults to `22`
- `ENABLE_PRODUCTION_DEPLOY`: set to `true` to deploy automatically after pushes to `main` or
  `master`

You can also run the workflow manually and enable the `deploy` input. The deploy job pulls the
tested GHCR image, runs `npm run db:migrate` against the persistent SQLite volume, restarts the
Compose service, and checks `/health`.

## Password Protection

Authentication for this v1 app is handled in front of the container with Nginx Proxy Manager Access
Lists / Basic Auth. Keep the app container private and require Basic Auth at the proxy.

1. Make sure Nginx Proxy Manager and this app share the same Docker network:

   ```bash
   docker network create npm_proxy
   docker compose up -d
   ```

   If Nginx Proxy Manager is already running in a separate Compose stack, attach its app container
   to the same network or add `npm_proxy` as an external network in that stack.

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

Warning: do not expose this app publicly without access control, and do not add a `ports:` mapping
for the dashboard service unless it is bound only to a trusted local interface for debugging.

## Backup

The Compose volume is named `krypto-dashboard-data`.

Safe stopped-container backup:

```bash
mkdir -p backups
docker compose stop krypto-dashboard
docker run --rm -v krypto-dashboard-data:/data -v "$PWD/backups:/backup" busybox sh -c "cp /data/krypto.db /backup/krypto-$(date +%F).db"
docker compose start krypto-dashboard
```

You can also download a live backup from `/api/backup` while authenticated through Nginx Proxy
Manager.

## Restore

```bash
docker compose stop krypto-dashboard
docker run --rm -v krypto-dashboard-data:/data -v "$PWD/backups:/backup" busybox sh -c "cp /backup/krypto-YYYY-MM-DD.db /data/krypto.db && rm -f /data/krypto.db-wal /data/krypto.db-shm"
docker compose up -d
```

Replace `krypto-YYYY-MM-DD.db` with your backup filename.

## CSV Format

Export transactions from `/api/export?type=transactions` or the Transactions page. Additional
exports are available at:

- `/api/export?type=open-lots` -> `open-lots.csv`
- `/api/export?type=realized-pnl` -> `realized-pnl.csv`
- `/api/export?type=portfolio-snapshots` -> `portfolio-snapshots.csv`

Import expects:

```text
type,asset_provider,asset_provider_coin_id,asset_symbol,asset_name,quantity,fiat_amount,fiat_currency,fee_amount,fee_currency,transaction_date,notes
```

## FIFO Accounting

V3 uses FIFO tax-lot accounting as the default portfolio accounting method.

- Each buy creates one `asset_lots` row.
- Buy fees are added to that lot's cost basis.
- Each sell consumes the oldest open lots first and creates one or more `lot_disposals` rows.
- Sell fees reduce sale proceeds before realized P/L is calculated.
- Sells that exceed available holdings are rejected.

The app stores generated lots and disposals in SQLite. They can be rebuilt from the transaction
ledger at any time, so manual transactions remain the source of truth.

## Realized And Unrealized P/L

- Current value = current open quantity x current market price
- Open cost basis = remaining FIFO lot cost basis
- Unrealized P/L = current value - open cost basis
- Realized P/L = sell proceeds - consumed FIFO lot cost basis
- Total P/L = realized P/L + unrealized P/L
- Total ROI = total P/L / total buy cost x 100

The asset detail page shows current holdings, average open cost, current price, current value,
unrealized P/L, realized P/L, open lots, and disposal history.

## Manual Accounting Rebuild

Accounting rebuilds automatically after transaction create, update, delete, CSV import, and settings
updates. To rebuild manually in local development:

```bash
curl -fsS -X POST http://localhost:5173/api/accounting/rebuild
```

For a deployed instance behind Nginx Proxy Manager Basic Auth, call the same endpoint through the
authenticated proxy URL.

## Known Limitations

- No tax filing logic or country-specific tax advice is provided.
- FIFO is the default and only lot disposal method in V3.
- EUR/USD fiat conversion uses cached public FX data when transactions differ from the base currency.
- No exchange sync, private exchange APIs, trading, withdrawals, or real-time WebSocket pricing.
- Portfolio history begins when real automatic snapshots are created; past values are not backfilled.
- Coin search and price refresh depend on CoinGecko availability and rate limits.
- News context depends on public RSS feed availability and remains optional context, not causality.
