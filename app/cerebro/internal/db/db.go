// Package db — acesso ao Postgres (M1). Conecta como superuser; RLS por-org entra depois.
package db

import (
	"context"
	"encoding/json"
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

// ── M2.1: tarefa real + relay de planejamento ──

// CreateRealTask cria uma tarefa em 'queued' (sem worker ainda; o relay planeja antes).
// repoID vazio = tarefa sem repositório (só planeja).
func (d *DB) CreateRealTask(ctx context.Context, orgID, wspID, title, desc, repoID string) (string, error) {
	id := NewID("tsk")
	var rid *string
	if repoID != "" {
		rid = &repoID
	}
	_, err := d.Pool.Exec(ctx, `INSERT INTO task(id,org_id,workspace_id,repo_id,title,description,status)
		VALUES($1,$2,$3,$4,$5,$6,'queued')`, id, orgID, wspID, rid, title, desc)
	return id, err
}

// ── M2.2: repositório/conexão + execução real (clone -> coda -> PR) ──

// CreateRepo registra uma conexão de código + um repositório (clone_url em settings).
func (d *DB) CreateRepo(ctx context.Context, orgID, wspID, name, cloneURL, defaultBranch string) (string, error) {
	conID := NewID("con")
	if _, err := d.Pool.Exec(ctx, `INSERT INTO connection(id,org_id,workspace_id,type,provider,label,status)
		VALUES($1,$2,$3,'code','github',$4,'ok')`, conID, orgID, wspID, name); err != nil {
		return "", err
	}
	repoID := NewID("repo")
	settings := `{"clone_url":` + jsonStr(cloneURL) + `}`
	_, err := d.Pool.Exec(ctx, `INSERT INTO repository(id,org_id,workspace_id,name,provider,default_branch,connection_id,settings)
		VALUES($1,$2,$3,$4,'github',$5,$6,$7::jsonb)`, repoID, orgID, wspID, name, defaultBranch, conID, settings)
	return repoID, err
}

func (d *DB) ListRepos(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,name,default_branch,COALESCE(settings->>'clone_url','')
		FROM repository WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, name, branch, url string
		if err := rows.Scan(&id, &name, &branch, &url); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "name": name, "default_branch": branch, "clone_url": url})
	}
	return out, rows.Err()
}

// TaskRepo é o repo associado a uma tarefa (vazio se não houver).
type TaskRepo struct {
	CloneURL      string
	DefaultBranch string
	Prompt        string
	OrgID         string
}

func (d *DB) GetTaskRepo(ctx context.Context, taskID string) (*TaskRepo, error) {
	var tr TaskRepo
	err := d.Pool.QueryRow(ctx, `SELECT COALESCE(r.settings->>'clone_url',''),COALESCE(r.default_branch,'main'),
		COALESCE(t.description,''),t.org_id
		FROM task t LEFT JOIN repository r ON r.id=t.repo_id WHERE t.id=$1`, taskID).
		Scan(&tr.CloneURL, &tr.DefaultBranch, &tr.Prompt, &tr.OrgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &tr, err
}

// SaveExecResult grava o PR aberto e move a tarefa p/ 'in_review' (PR pronto p/ revisão).
func (d *DB) SaveExecResult(ctx context.Context, taskID, branch, url string) error {
	var orgID, repoID string
	err := d.Pool.QueryRow(ctx, `SELECT org_id,COALESCE(repo_id,'') FROM task WHERE id=$1`, taskID).
		Scan(&orgID, &repoID)
	if err != nil {
		return err
	}
	var rid *string
	if repoID != "" {
		rid = &repoID
	}
	if _, err := d.Pool.Exec(ctx, `INSERT INTO pull_request(id,org_id,task_id,repo_id,url,branch,status)
		VALUES($1,$2,$3,$4,$5,$6,'open')`, NewID("pr"), orgID, taskID, rid, url, branch); err != nil {
		return err
	}
	_, err = d.Pool.Exec(ctx, `UPDATE task SET status='in_review',updated_at=now() WHERE id=$1`, taskID)
	return err
}

func (d *DB) FailTask(ctx context.Context, taskID, reason string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE task SET status='failed',blocked_reason=$2,updated_at=now() WHERE id=$1`,
		taskID, reason)
	return err
}

func (d *DB) ListPRs(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,COALESCE(task_id,''),COALESCE(branch,''),COALESCE(url,''),status
		FROM pull_request WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, task, branch, url, st string
		if err := rows.Scan(&id, &task, &branch, &url, &st); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "task_id": task, "branch": branch, "url": url, "status": st})
	}
	return out, rows.Err()
}

func jsonStr(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func (d *DB) SetTaskStatus(ctx context.Context, taskID, status string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE task SET status=$2,updated_at=now() WHERE id=$1`, status, taskID)
	return err
}

// PlanStepIn é um passo estruturado devolvido pelo relay (sem código bruto).
type PlanStepIn struct {
	Idx   int
	Type  string // step_type: plan|exec|test|review|merge|question
	Label string
}

// SavePlan grava os steps do plano e move a tarefa p/ 'in_review' (plano pronto p/ revisão).
func (d *DB) SavePlan(ctx context.Context, taskID string, steps []PlanStepIn, tokens int64) error {
	for _, st := range steps {
		_, err := d.Pool.Exec(ctx, `INSERT INTO step(id,task_id,idx,type,label,status)
			VALUES($1,$2,$3,$4,$5,'pending')
			ON CONFLICT (task_id,idx) DO UPDATE SET type=EXCLUDED.type,label=EXCLUDED.label`,
			NewID("stp"), taskID, st.Idx, st.Type, st.Label)
		if err != nil {
			return err
		}
	}
	_, err := d.Pool.Exec(ctx, `UPDATE task SET status='in_review',tokens_used=$2,updated_at=now() WHERE id=$1`,
		taskID, tokens)
	return err
}

func (d *DB) ListSteps(ctx context.Context, taskID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT idx,type,COALESCE(label,''),status
		FROM step WHERE task_id=$1 ORDER BY idx`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var idx int
		var typ, label, st string
		if err := rows.Scan(&idx, &typ, &label, &st); err != nil {
			return nil, err
		}
		out = append(out, Row{"idx": idx, "type": typ, "label": label, "status": st})
	}
	return out, rows.Err()
}

// CreateSecretRef registra só o metadado do segredo (valor fica no vault local).
func (d *DB) CreateSecretRef(ctx context.Context, orgID, name, typ, fingerprint string) (string, error) {
	id := NewID("sec")
	_, err := d.Pool.Exec(ctx, `INSERT INTO secret_ref(id,org_id,name,type,fingerprint,location,exists)
		VALUES($1,$2,$3,$4,$5,'local',true)`, id, orgID, name, typ, fingerprint)
	return id, err
}

func (d *DB) ListSecrets(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,name,COALESCE(type,''),COALESCE(fingerprint,''),location
		FROM secret_ref WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, name, typ, fp, loc string
		if err := rows.Scan(&id, &name, &typ, &fp, &loc); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "name": name, "type": typ, "fingerprint": fp, "location": loc})
	}
	return out, rows.Err()
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
