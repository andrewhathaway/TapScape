-- One row per push subscription. No identity is stored: the endpoint is an
-- opaque URL minted by the browser's push service, and the keys only let us
-- encrypt messages to that one browser.
CREATE TABLE subscriptions (
  endpoint        TEXT PRIMARY KEY,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  tz              TEXT NOT NULL,              -- IANA zone, e.g. Europe/London
  hour            INTEGER NOT NULL,           -- local hour to send, 0-23
  next_send_at    INTEGER NOT NULL,           -- unix ms
  last_sent_day   TEXT,                       -- UTC day key of the last reminder
  last_played_day TEXT,                       -- UTC day key of the last completed daily
  created_at      INTEGER NOT NULL,           -- unix ms
  failures        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX subscriptions_next_send ON subscriptions (next_send_at);
