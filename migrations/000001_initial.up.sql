CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters(id),
  resource_uid text NOT NULL,
  kind text NOT NULL,
  namespace text NOT NULL DEFAULT '',
  name text NOT NULL,
  observed_at timestamptz NOT NULL,
  deleted_at timestamptz,
  snapshot jsonb NOT NULL,
  UNIQUE(cluster_id, resource_uid, observed_at)
);
CREATE INDEX resource_snapshots_lookup_idx ON resource_snapshots(cluster_id, kind, namespace, name, observed_at DESC);

CREATE TABLE signals (
  id text PRIMARY KEY,
  cluster_id uuid NOT NULL REFERENCES clusters(id),
  resource_uid text NOT NULL,
  reason text NOT NULL,
  fingerprint text NOT NULL,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  occurrence_count bigint NOT NULL,
  normalized_message text NOT NULL,
  UNIQUE(cluster_id, fingerprint)
);
CREATE INDEX signals_recent_idx ON signals(cluster_id, last_seen DESC);

CREATE TABLE evidence (
  id text PRIMARY KEY,
  cluster_id uuid NOT NULL REFERENCES clusters(id),
  resource_uid text,
  role text NOT NULL CHECK (role IN ('supporting','contradicting','missing','neutral')),
  source text NOT NULL,
  observed_at timestamptz NOT NULL,
  summary text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  freshness double precision NOT NULL CHECK (freshness BETWEEN 0 AND 1),
  directness double precision NOT NULL CHECK (directness BETWEEN 0 AND 1),
  raw_ref text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE findings (
  id text PRIMARY KEY,
  cluster_id uuid NOT NULL REFERENCES clusters(id),
  resource_uid text NOT NULL,
  code text NOT NULL,
  severity text NOT NULL,
  summary text NOT NULL,
  observed_at timestamptz NOT NULL
);

CREATE TABLE hypotheses (
  id text PRIMARY KEY,
  rule_id text NOT NULL,
  rule_version text NOT NULL,
  status text NOT NULL,
  confidence double precision NOT NULL,
  body jsonb NOT NULL
);

CREATE TABLE incidents (
  id text PRIMARY KEY,
  cluster_id uuid NOT NULL REFERENCES clusters(id),
  title text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  engine_version text NOT NULL,
  snapshot jsonb NOT NULL
);
CREATE INDEX incidents_filter_idx ON incidents(cluster_id, status, severity, updated_at DESC);

CREATE TABLE incident_resources (
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  resource_uid text NOT NULL,
  PRIMARY KEY(incident_id, resource_uid)
);

CREATE TABLE timeline_events (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  type text NOT NULL,
  summary text NOT NULL,
  resource_uid text
);
CREATE INDEX timeline_incident_idx ON timeline_events(incident_id, occurred_at);

CREATE TABLE diagnosis_tasks (
  id text PRIMARY KEY,
  kind text NOT NULL,
  target_uid text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb NOT NULL
);

CREATE TABLE diagnosis_steps (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES diagnosis_tasks(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  status text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  body jsonb NOT NULL
);

CREATE TABLE rule_versions (
  rule_id text NOT NULL,
  version text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  digest text NOT NULL,
  PRIMARY KEY(rule_id, version)
);

