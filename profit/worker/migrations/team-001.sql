-- The team scorecard (2026-11-09, account-health src/agency.js scorecard / saveRating). Also made on first use.
-- p_team_rating: Cole's own 1 to 5 rating of one person for one week (week = that week's Monday, Central), with an
-- optional one-line note. person = the roster key (the first name, lower case: cole, ahsan, noma, william, ravo, radhesh, hamza).
CREATE TABLE IF NOT EXISTS p_team_rating (person TEXT NOT NULL, week TEXT NOT NULL, stars INTEGER NOT NULL, note TEXT,
  by_email TEXT, at TEXT NOT NULL, PRIMARY KEY (person, week));
