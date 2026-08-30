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

Browser smoke tests use Playwright Chromium:

```bash
npm run test:e2e:install
npm run test:e2e
```

The launcher always creates a new database under the operating-system temporary directory, sets
`NODE_ENV=test`, and supplies matching `DATABASE_PATH`/`E2E_DATABASE_PATH` values. Both Playwright
configuration and the database client refuse to start if that guard is missing or the path is not
inside a `krypto-dashboard-e2e-*` temporary directory. The serial smoke flow covers transaction
create/edit/delete, close/reopen, future-date rejection, missing ROI, snapshot/analytics rendering,
CSV export, both reset scopes, and mobile navigation. CI runs it as a separate browser job.

## Transaction Correctness

All ledger-sensitive code uses one deterministic ascending order: `transactionDate`, then
`createdAt`, then `id`. The final identifier tie-breaker is mandatory even when both timestamps are
identical, so average-cost holdings, realized P/L, cost basis, ROI, oversell checks, analytics, and
accounting rebuilds do not depend on SQLite return order or JavaScript sort stability.

Transaction eligibility uses **UTC calendar dates**. Today in UTC is accepted; any later UTC date is
rejected by form and CSV validation and again by the persistence service. Legacy future-dated rows
remain visible and editable in the transaction ledger, but are excluded from current holdings,
totals, snapshots, analytics, held-asset context, and accounting rebuilds until their date arrives.
The dashboard shows the number of rows currently excluded for this reason.

## Irreversible Data Reset

Settings contains a **Danger zone** with two POST-only reset scopes. Portfolio and planning removes
manual transactions/CSV batches, average-cost records, portfolio snapshots, current price and FX
caches, price-update events, plans/targets, and assets that become orphaned. Full historical data
adds fetched news content and events, news/asset matches, market daily history, sentiment history,
and market-signal refresh history.

Both scopes preserve the SQLite schema and migration journal, app settings, market-signal and cycle
configuration, configured news-source definitions, environment variables/secrets, application code,
and existing backup files. The page shows exact category counts before deletion. Reset requires a
scope, a permanent-deletion checkbox, and the exact phrase `DELETE ALL TEST DATA`; all deletes run in
one SQLite transaction and roll back together on failure.

Download `/api/backup` before resetting. **The app does not create a backup automatically.** Reset
tests exclusively create temporary databases and never target the configured development or
production database.

## Portfolio Planning

Open `/plan` to maintain one active, private portfolio plan. A plan contains a name, a positive
target portfolio value in the current base currency, an optional target date, and 1–50 unique asset
targets whose positive percentages total exactly 100%. Target assets use the same public CoinGecko
search as manual transactions and may be held or currently unheld. Clearing a plan removes only its
planning rows; the transaction ledger and derived average-cost accounting remain untouched.

Planning calculations use `decimal.js` and decimal text storage throughout:

- Goal progress = current portfolio value / target portfolio value × 100. The displayed percentage
  may exceed 100%; only the visual progress bar is capped.
- Remaining value = max(target portfolio value − current portfolio value, 0).
- Current allocation = asset current value / current portfolio value × 100. A zero-value portfolio
  produces 0% current allocations without division fallback.
- Allocation drift in percentage points = current allocation − saved target allocation.
- Fiat value gap = saved target allocation × current portfolio value − asset current value.
- Open holdings without a saved target remain visible with a 0% target.

Missing market prices and transactions excluded by unavailable FX make portfolio totals partial.
While partial, goal progress, allocation percentages, drift, value gaps, and contribution scenarios
are labeled unavailable; a missing price is never treated as a zero-value holding.

The contribution alignment scenario is non-persistent and informational. For a positive amount `C`
and current portfolio value `V`, each target's desired value is `target % × (V + C)`. The scenario
computes each positive deficit, distributes all of `C` proportionally across those deficits, and
shows projected allocations and remaining drift. It does not calculate crypto quantities, model
sales, create transactions, execute trades, or provide financial advice.

Changing the app base currency also converts the saved plan target using a current cached or public
EUR/USD rate. The converted target, settings change, and accounting replacement are committed in
one SQLite transaction. If that current FX conversion is unavailable, none of those records change.
Planning data lives in `portfolio_plans` and `portfolio_allocation_targets` in the same persistent
SQLite Docker volume as the rest of the application.

Focused verification is included in:

```bash
npx vitest run tests/planning-calculations.test.ts tests/planning-persistence.test.ts tests/db-migration.test.ts
```

## Planned-Asset Market Signals

The Plan and Insights pages add deterministic market context for saved allocation targets. This is
an informational ranking layer: it does not calculate quantities, create transactions, place
orders, connect exchange accounts, send notifications, or use “buy now” instructions.

Signals use `decimal.js` and completed UTC daily closes:

- Crypto Fear & Greed: favorable at `≤ 25`. This is Bitcoin-wide context supplied by
  [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/), not an asset-specific
  measure.
- RSI (14): Wilder-smoothed RSI, favorable at `≤ 30`.
- 200-day SMA deviation: `(close / SMA200 - 1) × 100`, favorable at `≤ -10%`.
- 365-day drawdown: `(close / highest close over 365 days - 1) × 100`, favorable at `≤ -30%`.
- 20-day Bollinger position: `(close - SMA20) / population standard deviation`, favorable at
  `≤ -1.5`.

The thresholds and required favorable count are global and editable under Settings. Defaults
require at least four favorable signals, but all five signals must be available and fresh. Exact
threshold equality is favorable. An asset is labeled **Contribution candidate** only when the
portfolio valuation is complete, its current allocation is below its saved target, all five signals
are fresh, and the favorable-count threshold is met.

The label is suppressed when fewer than 365 completed daily points exist, market history is over 36
hours stale, Fear & Greed is over 48 hours stale, portfolio planning data is partial, or any signal
is unavailable. The exact reasons appear beside the asset. A zero-value portfolio treats every
positive allocation target as underweight without dividing by zero.

Daily price history comes from CoinGecko's public
[`market_chart` endpoint](https://docs.coingecko.com/reference/coins-id-market-chart). Provider
payloads are validated server-side; the current incomplete UTC day is excluded, duplicate daily
points are resolved to the latest timestamp, decimal values are stored as text, and only the latest
400 days are retained. Cached history is keyed by base currency. Changing EUR/USD never reinterprets
old history: signals remain pending until the new currency is populated.

The authenticated internal refresh endpoint is `POST /api/internal/signals/refresh`. The cron
sidecar calls it every ten minutes, and each invocation processes at most two stale planned assets
to remain conservative with public API rate limits. Failed requests keep prior points and update
per-asset retry health; failed assets are retried after a cooldown. The Plan page also offers a
manual one-asset refresh. Page loads themselves never trigger market-history or sentiment requests.

These signals do not establish fair value and cannot predict returns. Favorable historical or
sentiment conditions can persist while prices continue falling.

Focused verification:

```bash
npx vitest run tests/market-signals-calculations.test.ts tests/market-signals-service.test.ts tests/db-migration.test.ts
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

## Automated SQLite Backups And Restore Drill

The cron sidecar requests `POST /api/internal/backups/run` every day at 01:30. The app uses SQLite's
online backup API (safe with WAL), opens the completed copy, requires `PRAGMA integrity_check` to
return `ok`, and only then publishes a timestamped
`krypto-dashboard-backup-YYYYMMDDTHHMMSSmmmZ.db` file. Backups use the separate
`krypto-dashboard-backups` Docker volume mounted at `/backups`; they are never placed beside the
live `/data/krypto.db` file.

Configuration defaults:

- `BACKUP_DIRECTORY=/backups` in Docker (`./backups` for local `.env`)
- `BACKUP_RETENTION_COUNT=14`
- `BACKUP_RETENTION_DAYS=30`

Retention applies both limits. Pruning is restricted to this app's exact timestamped filename
pattern inside the resolved backup directory; unrelated files are ignored. `/api/backup` uses the
same verified mechanism and leaves its generated backup in the backup volume as well as returning
the download. A failed integrity check never publishes the partial file.

Copy backups off-host regularly (replace the example filename with one shown in `/backups`):

```bash
mkdir -p off-host-backups
docker cp krypto-dashboard:/backups/krypto-dashboard-backup-20260830T013000000Z.db ./off-host-backups/
sqlite3 ./off-host-backups/krypto-dashboard-backup-20260830T013000000Z.db 'PRAGMA integrity_check;'
```

Restore drill (perform on a disposable host first):

1. Stop both writers with `docker compose stop snapshot-cron krypto-dashboard`.
2. Verify the selected backup returns `ok` from `PRAGMA integrity_check`.
3. Copy the current `/data/krypto.db` off-host as an additional rollback copy.
4. Replace `/data/krypto.db` with the verified backup while the containers are stopped and remove
   only the matching stale `krypto.db-wal` and `krypto.db-shm` files.
5. Start the app with `docker compose up -d`, inspect `/health`, the dashboard, transaction count,
   and logs, then run another `/api/backup` download.

Never restore over a running SQLite writer. The reset feature does not create a backup automatically.

## Automatic Snapshots And Health

Portfolio value charts use rows from the `portfolio_snapshots` SQLite table. The app creates real
snapshots only; it does not invent historical values. On the first dashboard visit, the server
creates an initial hourly snapshot if none exist yet.

The `snapshot-cron` sidecar runs Alpine `crond` and calls the app by internal Docker service name:

- Hourly snapshot: minute 5, `POST http://krypto-dashboard:3000/api/internal/snapshots/hourly`
- Analytics health check: minute 10,
  `POST http://krypto-dashboard:3000/api/internal/analytics/health-check`
- Planned-asset signals: minutes 2, 12, 22, 32, 42, and 52,
  `POST http://krypto-dashboard:3000/api/internal/signals/refresh`
- News fetch: minute 20, `POST http://krypto-dashboard:3000/api/internal/news/fetch`
- Daily snapshot: 23:55, `POST http://krypto-dashboard:3000/api/internal/snapshots/daily`
- Verified SQLite backup: 01:30, `POST http://krypto-dashboard:3000/api/internal/backups/run`

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
docker compose exec snapshot-cron sh -lc 'curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://krypto-dashboard:3000/api/internal/signals/refresh'
docker compose exec snapshot-cron sh -c 'curl -i -X POST http://krypto-dashboard:3000/api/internal/news/fetch -H "Authorization: Bearer $INTERNAL_CRON_SECRET"'
docker compose exec snapshot-cron sh -lc 'curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://krypto-dashboard:3000/api/internal/snapshots/daily'
```

For local dev on the Vite server:

```bash
curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://localhost:5173/api/internal/snapshots/hourly
curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_CRON_SECRET" http://localhost:5173/api/internal/signals/refresh
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
Failed buckets are excluded from charts and analytics. A later successful run repairs the failed
row in place, so a temporary provider or FX failure cannot permanently poison that time bucket.

Hourly snapshots are retained for 90 days by default; set
`HOURLY_SNAPSHOT_RETENTION_DAYS` to an integer of at least 7 to change it. Daily snapshots are kept
indefinitely. The authenticated analytics health-check workflow performs cleanup and returns hourly
deleted/retained and daily-retained counts. Cleanup never removes daily rows, retains the exact
cutoff boundary, and preserves the latest usable hourly point even when all hourly history is old.

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

Default RSS rows are seeded in `news_sources` for CoinDesk, Cointelegraph, Decrypt, Bitcoin
Magazine, CryptoSlate, Bitcoin Core, and the Ethereum Foundation Blog. The Block is also seeded as
a disabled source row because its RSS endpoint is not reliably available. To add or edit sources,
update `news_sources` in SQLite; keep `type = 'rss'`, set `is_enabled = 1`, and choose a
`fetch_interval_minutes` value. Official project blogs can be added the same way.

The `/news` page includes a private `Fetch now` form action that refreshes enabled RSS sources
server-side and reloads the dashboard with a compact fetch summary.

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
- `/api/export?type=average-cost-positions` -> `average-cost-positions.csv`
- `/api/export?type=realized-pnl` -> `realized-pnl.csv`
- `/api/export?type=portfolio-snapshots` -> `portfolio-snapshots.csv`

Import expects:

```text
type,asset_provider,asset_provider_coin_id,asset_symbol,asset_name,quantity,fiat_amount,fiat_currency,fee_amount,fee_currency,transaction_date,notes
```

Imports are limited to 5 MB and 5,000 rows. CSV formula prefixes in user-controlled text are
neutralized on export without changing the text stored on import. Transaction rows, their import
batch, and the rebuilt accounting projection are committed in one SQLite transaction.

## Average-Cost Accounting

The application uses pooled average cost as its sole v1 portfolio accounting method.

- Each buy increases the asset's pooled quantity and cost basis.
- Buy fees are added to the pooled cost basis.
- Each sell removes quantity at the average unit cost immediately before the sale.
- Each sell creates one derived disposal row with proceeds, average-cost basis, and realized P/L.
- Sell fees reduce sale proceeds before realized P/L is calculated.
- Sells that exceed available holdings are rejected.

For backward-compatible exports and storage, the pooled position currently uses the existing
`asset_lots` projection table. It contains at most one generated position per asset; it is not a FIFO
tax lot. All position and disposal rows can be rebuilt from the manual transaction ledger, which
remains the source of truth.

## Realized And Unrealized P/L

- Current value = current open quantity x current market price
- Open cost basis = remaining pooled average-cost basis
- Unrealized P/L = current value - open cost basis
- Realized P/L = net sell proceeds - quantity sold x average cost before sale
- Total P/L = realized P/L + unrealized P/L
- Total ROI = total P/L / total buy cost x 100

Analytics also reports two return measures when the required data is complete:

- Time-weighted return chains snapshot subperiod returns after adjusting each subperiod for the
  transaction-ledger changes actually present between both snapshot payloads. This keeps late,
  backdated, edited, and deleted manual entries aligned with the recorded value history. The current
  complete valuation closes the final period; accuracy improves with uninterrupted daily snapshots.
- Money-weighted return is annualized XIRR using dated buy costs, net sell proceeds, and current
  portfolio value.

Portfolio-history CSV exports name the remaining pooled basis `open_cost_basis`. The legacy
`total_invested` column remains as an equal-valued compatibility alias; new integrations should use
`open_cost_basis`.

If a required EUR/USD conversion cannot be fetched or read from cache, the transaction is marked
incomplete and excluded from financial totals instead of being treated as a false 1:1 conversion.
The UI labels the resulting value as partial, failed snapshots are not published as usable history,
and accounting mutations are rejected before transaction and projection data are committed.

The asset detail page shows current holdings, average open cost, current price, current value,
unrealized P/L, realized P/L, the average-cost position, and disposal history.

## Manual Accounting Rebuild

Accounting rebuilds automatically after transaction create, update, delete, CSV import, and settings
updates. To rebuild manually in local development:

```bash
curl -fsS -X POST http://localhost:5173/api/accounting/rebuild
```

For a deployed instance behind Nginx Proxy Manager Basic Auth, call the same endpoint through the
authenticated proxy URL.

Migration filenames are immutable after deployment. The runner stores a SHA-256 checksum for every
applied SQL file and refuses to start if a previously recorded migration was changed. Application
requests are logged as structured JSON with request ID, path, status, and duration; secrets and URL
credentials are redacted from logged error messages.

## Known Limitations

- No tax filing logic or country-specific tax advice is provided.
- Average cost is the only supported v1 accounting method; FIFO/LIFO are not available.
- EUR/USD fiat conversion uses cached public FX data when transactions differ from the base currency.
- No exchange sync, private exchange APIs, trading, withdrawals, or real-time WebSocket pricing.
- Portfolio history begins when real automatic snapshots are created; past values are not backfilled.
- Coin search and price refresh depend on CoinGecko availability and rate limits.
- News context depends on public RSS feed availability and remains optional context, not causality.
- Portfolio planning supports one active plan, average-cost portfolio inputs, and contribution-only
  mathematical scenarios. It does not optimize portfolios or recommend transactions.
