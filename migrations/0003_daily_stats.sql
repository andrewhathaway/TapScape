-- Anonymous per-day counters for the homepage preview card.
CREATE TABLE daily_stats (
  day_key  TEXT PRIMARY KEY,
  plays    INTEGER NOT NULL DEFAULT 0,
  total    INTEGER NOT NULL DEFAULT 0     -- sum of totals, for the average
);
