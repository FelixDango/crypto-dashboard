CREATE TABLE IF NOT EXISTS news_sources (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rss')),
  url TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_fetched_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS news_sources_enabled_idx
ON news_sources(is_enabled);

CREATE INDEX IF NOT EXISTS news_sources_fetch_due_idx
ON news_sources(is_enabled, last_fetched_at);

CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  external_id TEXT,
  url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  language TEXT,
  raw_asset_mentions_json TEXT,
  raw_themes_json TEXT,
  sentiment_label TEXT NOT NULL CHECK (sentiment_label IN ('positive', 'neutral', 'negative', 'mixed', 'unknown')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS news_articles_url_unique
ON news_articles(url);

CREATE UNIQUE INDEX IF NOT EXISTS news_articles_source_external_unique
ON news_articles(source_id, external_id);

CREATE INDEX IF NOT EXISTS news_articles_source_published_idx
ON news_articles(source_id, published_at);

CREATE INDEX IF NOT EXISTS news_articles_fetched_idx
ON news_articles(fetched_at);

CREATE TABLE IF NOT EXISTS news_article_asset_matches (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('symbol', 'name', 'alias', 'manual')),
  confidence REAL NOT NULL,
  matched_terms_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS news_article_asset_matches_article_asset_unique
ON news_article_asset_matches(article_id, asset_id);

CREATE INDEX IF NOT EXISTS news_article_asset_matches_asset_confidence_idx
ON news_article_asset_matches(asset_id, confidence);

CREATE TABLE IF NOT EXISTS news_fetch_events (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  articles_found INTEGER NOT NULL DEFAULT 0,
  articles_inserted INTEGER NOT NULL DEFAULT 0,
  articles_updated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS news_fetch_events_status_created_idx
ON news_fetch_events(status, created_at);

CREATE INDEX IF NOT EXISTS news_fetch_events_source_created_idx
ON news_fetch_events(source_id, created_at);

INSERT INTO news_sources (
  id,
  name,
  type,
  url,
  is_enabled,
  fetch_interval_minutes,
  created_at,
  updated_at
)
VALUES
  (
    'coindesk',
    'CoinDesk',
    'rss',
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    1,
    60,
    datetime('now'),
    datetime('now')
  ),
  (
    'cointelegraph',
    'Cointelegraph',
    'rss',
    'https://cointelegraph.com/rss',
    1,
    60,
    datetime('now'),
    datetime('now')
  ),
  (
    'decrypt',
    'Decrypt',
    'rss',
    'https://decrypt.co/feed',
    1,
    60,
    datetime('now'),
    datetime('now')
  ),
  (
    'bitcoin-magazine',
    'Bitcoin Magazine',
    'rss',
    'https://bitcoinmagazine.com/.rss/full/',
    1,
    60,
    datetime('now'),
    datetime('now')
  )
ON CONFLICT(id) DO NOTHING;
