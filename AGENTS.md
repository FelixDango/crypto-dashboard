# Project Rules

- This is a private, self-hosted personal crypto portfolio tracker.
- Do not add user registration, OAuth, public sign-up, or multi-user features unless explicitly requested.
- Do not add trading, withdrawals, private exchange API keys, Kraken private API calls, or exchange account connections.
- All crypto transactions are manual entries. Price data must come from public market APIs through server-side routes/utilities.
- Keep calculations decimal-safe. Use `decimal.js` for money, crypto quantities, ROI, and cost basis math.
- The v1 cost basis model is average cost. Do not replace it with FIFO/LIFO until average-cost behavior remains tested.
- SQLite is the production database. Keep it in a persistent Docker volume.
- Authentication for v1 is handled by Nginx Proxy Manager Access List / Basic Auth in front of the container.
- Do not add analytics, telemetry, or third-party tracking.
- Validate server-side inputs with Zod or an equivalent schema.
- Keep UI changes practical, responsive, dark, and low-clutter.
