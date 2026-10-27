-- One short note per member per day, shown beside their score to clanmates.
ALTER TABLE group_scores ADD COLUMN note TEXT;
-- Who made the clan, so they can remove a note in it.
ALTER TABLE groups ADD COLUMN creator_id TEXT;
