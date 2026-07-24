package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

type Postgres struct{ pool *pgxpool.Pool }

func OpenPostgres(ctx context.Context, databaseURL string) (*Postgres, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database config: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

func (p *Postgres) Close() { p.pool.Close() }

func (p *Postgres) ListClusters(ctx context.Context) ([]string, error) {
	rows, err := p.pool.Query(ctx, `SELECT name FROM clusters ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		items = append(items, name)
	}
	return items, rows.Err()
}

func (p *Postgres) ListIncidents(ctx context.Context) ([]model.Incident, error) {
	rows, err := p.pool.Query(ctx, `SELECT snapshot FROM incidents ORDER BY updated_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []model.Incident{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var item model.Incident
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *Postgres) GetIncident(ctx context.Context, id string) (model.Incident, error) {
	var raw []byte
	if err := p.pool.QueryRow(ctx, `SELECT snapshot FROM incidents WHERE id=$1`, id).Scan(&raw); err != nil {
		return model.Incident{}, ErrNotFound
	}
	var item model.Incident
	return item, json.Unmarshal(raw, &item)
}

func (p *Postgres) SaveIncident(ctx context.Context, item model.Incident) error {
	raw, err := json.Marshal(item)
	if err != nil {
		return err
	}
	_, err = p.pool.Exec(ctx, `INSERT INTO incidents
		(id, cluster_id, title, severity, status, started_at, updated_at, engine_version, snapshot)
		VALUES ($1,(SELECT id FROM clusters WHERE name=$2),$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,severity=EXCLUDED.severity,
		status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,snapshot=EXCLUDED.snapshot`,
		item.ID, item.Cluster, item.Title, item.Severity, item.Status, item.StartedAt,
		item.UpdatedAt, item.EngineVersion, raw)
	return err
}

func (p *Postgres) SaveTask(ctx context.Context, item model.DiagnosisTask) error {
	raw, err := json.Marshal(item)
	if err != nil {
		return err
	}
	_, err = p.pool.Exec(ctx, `INSERT INTO diagnosis_tasks
		(id, kind, target_uid, status, created_at, started_at, finished_at, result)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,started_at=EXCLUDED.started_at,
		finished_at=EXCLUDED.finished_at,result=EXCLUDED.result`,
		item.ID, item.Kind, item.Target.UID, item.Status, item.CreatedAt, item.StartedAt, item.FinishedAt, raw)
	return err
}

func (p *Postgres) GetTask(ctx context.Context, id string) (model.DiagnosisTask, error) {
	var raw []byte
	if err := p.pool.QueryRow(ctx, `SELECT result FROM diagnosis_tasks WHERE id=$1`, id).Scan(&raw); err != nil {
		return model.DiagnosisTask{}, ErrNotFound
	}
	var item model.DiagnosisTask
	return item, json.Unmarshal(raw, &item)
}

func (p *Postgres) ListTasks(ctx context.Context) ([]model.DiagnosisTask, error) {
	rows, err := p.pool.Query(ctx, `SELECT result FROM diagnosis_tasks ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []model.DiagnosisTask{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var item model.DiagnosisTask
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *Postgres) SearchResources(ctx context.Context, query string) ([]model.Resource, error) {
	rows, err := p.pool.Query(ctx, `SELECT snapshot FROM resource_snapshots
		WHERE name ILIKE '%' || $1 || '%' OR kind ILIKE '%' || $1 || '%'
		ORDER BY observed_at DESC LIMIT 100`, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []model.Resource{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var item model.Resource
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *Postgres) GetResource(ctx context.Context, kind, namespace, name string) (model.Resource, error) {
	var raw []byte
	err := p.pool.QueryRow(ctx, `SELECT snapshot FROM resource_snapshots
		WHERE kind=$1 AND namespace=$2 AND name=$3 ORDER BY observed_at DESC LIMIT 1`,
		kind, namespace, name).Scan(&raw)
	if err != nil {
		return model.Resource{}, ErrNotFound
	}
	var item model.Resource
	return item, json.Unmarshal(raw, &item)
}
