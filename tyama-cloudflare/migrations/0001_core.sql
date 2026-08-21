PRAGMA foreign_keys = ON;

CREATE TABLE hosts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_host_id ON sessions(host_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'Подія',
  event_date TEXT,
  venue TEXT,
  questionnaire_token TEXT NOT NULL UNIQUE,
  public_screen_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_host_id ON events(host_id);

CREATE TABLE questionnaires (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  questionnaire_id TEXT NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','textarea','select')),
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0,1)),
  options_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_questions_position ON questions(questionnaire_id, position);

CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  questionnaire_id TEXT NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  respondent_label TEXT NOT NULL,
  consent TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_responses_event_id ON responses(event_id);

CREATE TABLE response_answers (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(response_id, question_id)
);

CREATE TABLE kit_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_response_id TEXT REFERENCES responses(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','do_not_use','removed')),
  privacy TEXT NOT NULL DEFAULT 'review_required' CHECK (privacy IN ('review_required','host_only','public_allowed')),
  useful INTEGER NOT NULL DEFAULT 0 CHECK (useful IN (0,1)),
  edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_kit_items_event_id ON kit_items(event_id);
CREATE INDEX idx_kit_items_live ON kit_items(event_id, status, privacy);

CREATE TABLE rehearsal_items (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kit_item_id TEXT NOT NULL REFERENCES kit_items(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(event_id, kit_item_id)
);

CREATE TABLE live_state (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  current_item_id TEXT REFERENCES kit_items(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
