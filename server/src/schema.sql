PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS novels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  cp_category TEXT NOT NULL CHECK (cp_category IN ('1v1', '无CP', 'NP')),
  ending TEXT NOT NULL CHECK (ending IN ('HE', 'BE', 'OE', '坑', '其他')),
  status TEXT NOT NULL CHECK (status IN ('看完', '荒废')),
  rating TEXT NOT NULL CHECK (rating IN ('喜欢', '一般', '不喜欢', '未评价')),
  read_count INTEGER NOT NULL DEFAULT 0 CHECK (read_count >= 0),
  notes TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT 'book',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES authors(id)
);

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  attribute TEXT NOT NULL CHECK (attribute IN ('1', '0', '0.5', '其他')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS novel_tags (
  novel_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (novel_id, tag_id),
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_novels_author_id ON novels(author_id);
CREATE INDEX IF NOT EXISTS idx_characters_novel_id ON characters(novel_id);
CREATE INDEX IF NOT EXISTS idx_novel_tags_tag_id ON novel_tags(tag_id);
