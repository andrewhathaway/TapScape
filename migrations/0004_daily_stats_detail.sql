-- Per-round sums, inside counts and a 25-bucket histogram of totals, so a
-- player can be compared with everyone else today. Hard-mode runs are kept
-- under a separate key ("YYYY-MM-DD#hard") so the two aren't mixed.
ALTER TABLE daily_stats ADD COLUMN round_sums TEXT NOT NULL DEFAULT '[0,0,0,0,0]';
ALTER TABLE daily_stats ADD COLUMN inside_counts TEXT NOT NULL DEFAULT '[0,0,0,0,0]';
ALTER TABLE daily_stats ADD COLUMN hist TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]';
