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
    'the-block',
    'The Block',
    'rss',
    'https://www.theblock.co/rss.xml',
    0,
    60,
    datetime('now'),
    datetime('now')
  ),
  (
    'cryptoslate',
    'CryptoSlate',
    'rss',
    'https://cryptoslate.com/feed/',
    1,
    60,
    datetime('now'),
    datetime('now')
  ),
  (
    'bitcoin-core',
    'Bitcoin Core',
    'rss',
    'https://bitcoincore.org/en/rss.xml',
    1,
    360,
    datetime('now'),
    datetime('now')
  ),
  (
    'ethereum-foundation-blog',
    'Ethereum Foundation Blog',
    'rss',
    'https://blog.ethereum.org/feed.xml',
    1,
    360,
    datetime('now'),
    datetime('now')
  )
ON CONFLICT(id) DO NOTHING;
