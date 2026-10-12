-- Friend groups. A group is a code; a member is a device-minted id plus the
-- display name they typed. Scores are one row per member per day.
CREATE TABLE groups (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE group_members (
  code        TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  player_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (code, player_id)
);

CREATE TABLE group_scores (
  code        TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  player_id   TEXT NOT NULL,
  day_key     TEXT NOT NULL,
  total       INTEGER NOT NULL,
  scores      TEXT NOT NULL,      -- JSON array of the five round scores
  PRIMARY KEY (code, player_id, day_key)
);

CREATE INDEX group_scores_day ON group_scores (code, day_key);
