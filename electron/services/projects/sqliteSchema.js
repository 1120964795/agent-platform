const PROJECT_INDEX_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_opened_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_root
    ON projects(username, root_path)`,
  `CREATE TABLE IF NOT EXISTS project_settings (
    project_id TEXT PRIMARY KEY,
    watch_enabled INTEGER NOT NULL,
    embedding_enabled INTEGER NOT NULL,
    debounce_ms INTEGER NOT NULL,
    max_file_bytes INTEGER NOT NULL,
    include_extensions_json TEXT NOT NULL,
    include_filenames_json TEXT NOT NULL,
    exclude_globs_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_profiles (
    project_id TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    language TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    UNIQUE(project_id, relative_path)
  )`,
  `CREATE TABLE IF NOT EXISTS project_chunks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    chunk_type TEXT NOT NULL,
    text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS project_chunks_fts USING fts5(
    text,
    relative_path,
    chunk_type,
    content='project_chunks',
    content_rowid='rowid'
  )`,
  `CREATE TABLE IF NOT EXISTS project_embeddings (
    chunk_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    vector_json TEXT NOT NULL,
    embedded_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS patch_apply_records (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    username TEXT NOT NULL,
    title TEXT NOT NULL,
    patch_text TEXT NOT NULL,
    affected_files_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    applied_at TEXT
  )`
]

function getProjectIndexSchemaSql() {
  return PROJECT_INDEX_SCHEMA.join(';\n\n')
}

module.exports = {
  PROJECT_INDEX_SCHEMA,
  getProjectIndexSchemaSql
}
