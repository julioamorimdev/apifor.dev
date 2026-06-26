// Package db — acesso ao Postgres (M1). Conecta como superuser; RLS por-org entra depois.
package db

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"golang.org/x/crypto/bcrypt"
)

type DB struct{ Pool *pgxpool.Pool }

func Open(ctx context.Context, url string) (*DB, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return &DB{Pool: pool}, nil
}

func NewID(prefix string) string { return prefix + "_" + strings.ToLower(ulid.Make().String()) }

// Demo: garante user/org/workspace/pool_config p/ o walking skeleton.
const (
	DemoUserID  = "usr_demo"
	DemoOrgID   = "org_demo"
	DemoWspID   = "wsp_demo"
	DemoEmail   = "demo@apifor.dev"
	DemoPass    = "demo"
)

func (d *DB) SeedDemo(ctx context.Context) error {
	hash, _ := bcrypt.GenerateFromPassword([]byte(DemoPass), bcrypt.DefaultCost)
	b := d.Pool
	if _, err := b.Exec(ctx, `INSERT INTO app_user(id,email,name,password_hash) VALUES($1,$2,'Demo',$3)
		ON CONFLICT (id) DO UPDATE SET password_hash=EXCLUDED.password_hash`, DemoUserID, DemoEmail, string(hash)); err != nil {
		return err
	}
	if _, err := b.Exec(ctx, `INSERT INTO org(id,name,owner_user_id,plan) VALUES($1,'Demo',$2,'free')
		ON CONFLICT (id) DO NOTHING`, DemoOrgID, DemoUserID); err != nil {
		return err
	}
	if _, err := b.Exec(ctx, `INSERT INTO membership(id,org_id,user_id,permission_tier) VALUES($1,$2,$3,'owner')
		ON CONFLICT (org_id,user_id) DO NOTHING`, NewID("mbr"), DemoOrgID, DemoUserID); err != nil {
		return err
	}
	if _, err := b.Exec(ctx, `INSERT INTO workspace(id,org_id,name,initial) VALUES($1,$2,'Principal','P')
		ON CONFLICT (id) DO NOTHING`, DemoWspID, DemoOrgID); err != nil {
		return err
	}
	if _, err := b.Exec(ctx, `INSERT INTO pool_config(id,workspace_id,parallel_workers,retries) VALUES($1,$2,1,2)
		ON CONFLICT (workspace_id) DO NOTHING`, NewID("pcfg"), DemoWspID); err != nil {
		return err
	}
	return nil
}

type User struct {
	ID, Email, Hash, OrgID string
}

func (d *DB) FindUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := d.Pool.QueryRow(ctx, `SELECT u.id,u.email,COALESCE(u.password_hash,''),COALESCE(m.org_id,'')
		FROM app_user u LEFT JOIN membership m ON m.user_id=u.id WHERE u.email=$1 LIMIT 1`, email).
		Scan(&u.ID, &u.Email, &u.Hash, &u.OrgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

// Device (M1: token simples no cert_serial; mTLS depois).
func (d *DB) CreateDevice(ctx context.Context, orgID, userID, token string) (string, error) {
	id := NewID("dev")
	_, err := d.Pool.Exec(ctx, `INSERT INTO device(id,org_id,user_id,label,cert_serial,last_seen_at)
		VALUES($1,$2,$3,'executor',$4,now())`, id, orgID, userID, token)
	return id, err
}

type Device struct{ ID, OrgID string }

func (d *DB) FindDeviceByToken(ctx context.Context, token string) (*Device, error) {
	var dev Device
	err := d.Pool.QueryRow(ctx, `SELECT id,org_id FROM device WHERE cert_serial=$1 AND revoked_at IS NULL LIMIT 1`, token).
		Scan(&dev.ID, &dev.OrgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &dev, err
}

func (d *DB) TouchDevice(ctx context.Context, id string) {
	_, _ = d.Pool.Exec(ctx, `UPDATE device SET last_seen_at=now() WHERE id=$1`, id)
}

// Worker + lease.
func (d *DB) CreateWorkerInstance(ctx context.Context, orgID, wspID string) (string, error) {
	id := NewID("wki")
	_, err := d.Pool.Exec(ctx, `INSERT INTO worker_instance(id,org_id,workspace_id,source,host,status,last_heartbeat_at)
		VALUES($1,$2,$3,'pool','local','running',now())`, id, orgID, wspID)
	return id, err
}

func (d *DB) CreateLease(ctx context.Context, orgID, workerID string, ttl time.Duration, autoRenew bool) (string, error) {
	id := NewID("lse")
	var exp *time.Time
	if ttl > 0 {
		t := time.Now().Add(ttl)
		exp = &t
	}
	_, err := d.Pool.Exec(ctx, `INSERT INTO lease(id,org_id,worker_instance_id,expires_at,auto_renew)
		VALUES($1,$2,$3,$4,$5)`, id, orgID, workerID, exp, autoRenew)
	if err == nil {
		_, _ = d.Pool.Exec(ctx, `UPDATE worker_instance SET lease_id=$1 WHERE id=$2`, id, workerID)
	}
	return id, err
}

// Task.
func (d *DB) CreateTask(ctx context.Context, orgID, wspID, workerID, title string) (string, error) {
	id := NewID("tsk")
	_, err := d.Pool.Exec(ctx, `INSERT INTO task(id,org_id,workspace_id,title,status,assigned_worker_id)
		VALUES($1,$2,$3,$4,'running',$5)`, id, orgID, wspID, title, workerID)
	if err == nil {
		_, _ = d.Pool.Exec(ctx, `UPDATE worker_instance SET current_task_id=$1,current_step='exec' WHERE id=$2`, id, workerID)
	}
	return id, err
}

func (d *DB) CompleteTask(ctx context.Context, taskID string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE task SET status='merged',updated_at=now() WHERE id=$1`, taskID)
	if err == nil {
		_, _ = d.Pool.Exec(ctx, `UPDATE worker_instance SET status='idle',current_task_id=NULL,current_step=NULL WHERE current_task_id=$1`, taskID)
	}
	return err
}

// Leitura p/ a UI.
type Row = map[string]any

func (d *DB) ListWorkers(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,source,host,status,COALESCE(current_task_id,''),COALESCE(current_step,'')
		FROM worker_instance WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, src, host, st, task, step string
		if err := rows.Scan(&id, &src, &host, &st, &task, &step); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "source": src, "host": host, "status": st, "current_task_id": task, "current_step": step})
	}
	return out, rows.Err()
}

func (d *DB) ListTasks(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,title,status,COALESCE(assigned_worker_id,'')
		FROM task WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, title, st, w string
		if err := rows.Scan(&id, &title, &st, &w); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "title": title, "status": st, "assigned_worker_id": w})
	}
	return out, rows.Err()
}
