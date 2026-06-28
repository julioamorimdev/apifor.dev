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

// CreateDeviceCert registra o device com o serial do cert assinado pela CA (M3.2a, mTLS).
func (d *DB) CreateDeviceCert(ctx context.Context, orgID, userID, deviceID, serial string, expires time.Time) error {
	_, err := d.Pool.Exec(ctx, `INSERT INTO device(id,org_id,user_id,label,cert_serial,cert_expires_at,last_seen_at)
		VALUES($1,$2,$3,'executor',$4,$5,now())`, deviceID, orgID, userID, serial, expires)
	return err
}

// FindDeviceBySerial resolve o device pelo serial do cert (não-revogado) — auth da stream.
func (d *DB) FindDeviceBySerial(ctx context.Context, serial string) (*Device, error) {
	var dev Device
	err := d.Pool.QueryRow(ctx, `SELECT id,org_id FROM device WHERE cert_serial=$1 AND revoked_at IS NULL LIMIT 1`, serial).
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

// ── M3.1: enforcement de plano (lease, worker-hours, kill-switch) — server-side ──

type PlanLimits struct {
	Plan        string
	MaxWorkers  *int // nil = ilimitado
	LeaseTTLMin *int // nil = sem expiração
	WeeklyHours *int // nil = ilimitado
}

func (d *DB) GetPlanLimits(ctx context.Context, orgID string) (*PlanLimits, error) {
	var pl PlanLimits
	err := d.Pool.QueryRow(ctx, `SELECT p.id,p.max_workers,p.lease_ttl_min,p.weekly_worker_hours
		FROM org o JOIN plan_catalog p ON p.id=o.plan WHERE o.id=$1`, orgID).
		Scan(&pl.Plan, &pl.MaxWorkers, &pl.LeaseTTLMin, &pl.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &pl, err
}

func (d *DB) ActiveLeaseCount(ctx context.Context, orgID string) (int, error) {
	var n int
	err := d.Pool.QueryRow(ctx, `SELECT count(*) FROM lease WHERE org_id=$1 AND ended_at IS NULL`, orgID).Scan(&n)
	return n, err
}

func (d *DB) WeekSecondsUsed(ctx context.Context, orgID string) (int64, error) {
	var s int64
	err := d.Pool.QueryRow(ctx, `SELECT COALESCE(seconds_used,0) FROM worker_hours_counter
		WHERE org_id=$1 AND week_start=date_trunc('week',now())::date`, orgID).Scan(&s)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	return s, err
}

func (d *DB) AddWorkerSeconds(ctx context.Context, orgID string, sec int64) error {
	_, err := d.Pool.Exec(ctx, `INSERT INTO worker_hours_counter(org_id,week_start,seconds_used)
		VALUES($1, date_trunc('week',now())::date, $2)
		ON CONFLICT (org_id,week_start) DO UPDATE SET seconds_used=worker_hours_counter.seconds_used+EXCLUDED.seconds_used`,
		orgID, sec)
	return err
}

func (d *DB) RecordUsage(ctx context.Context, orgID, workerID, leaseID, eventType string) error {
	var wid, lid *string
	if workerID != "" {
		wid = &workerID
	}
	if leaseID != "" {
		lid = &leaseID
	}
	_, err := d.Pool.Exec(ctx, `INSERT INTO usage_event(id,org_id,worker_instance_id,lease_id,type)
		VALUES($1,$2,$3,$4,$5)`, NewID("use"), orgID, wid, lid, eventType)
	return err
}

// GrantLease cria worker + lease com TTL (ttlSec>0 = expira) e auto_renew.
func (d *DB) GrantLease(ctx context.Context, orgID, wspID string, ttlSec int, autoRenew bool) (workerID, leaseID string, expMs int64, err error) {
	workerID = NewID("wki")
	if _, err = d.Pool.Exec(ctx, `INSERT INTO worker_instance(id,org_id,workspace_id,source,host,status,last_heartbeat_at)
		VALUES($1,$2,$3,'pool','local','running',now())`, workerID, orgID, wspID); err != nil {
		return
	}
	leaseID = NewID("lse")
	var exp *time.Time
	if ttlSec > 0 {
		t := time.Now().Add(time.Duration(ttlSec) * time.Second)
		exp = &t
		expMs = t.UnixMilli()
	}
	if _, err = d.Pool.Exec(ctx, `INSERT INTO lease(id,org_id,worker_instance_id,expires_at,auto_renew)
		VALUES($1,$2,$3,$4,$5)`, leaseID, orgID, workerID, exp, autoRenew); err != nil {
		return
	}
	_, err = d.Pool.Exec(ctx, `UPDATE worker_instance SET lease_id=$1 WHERE id=$2`, leaseID, workerID)
	return
}

// ActiveLease é uma linha viva p/ o reaper avaliar.
type ActiveLease struct {
	LeaseID   string
	WorkerID  string
	OrgID     string
	ExpiresAt *time.Time
	AutoRenew bool
}

func (d *DB) ActiveLeases(ctx context.Context) ([]ActiveLease, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,worker_instance_id,org_id,expires_at,auto_renew
		FROM lease WHERE ended_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ActiveLease
	for rows.Next() {
		var a ActiveLease
		if err := rows.Scan(&a.LeaseID, &a.WorkerID, &a.OrgID, &a.ExpiresAt, &a.AutoRenew); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (d *DB) EndLease(ctx context.Context, leaseID, reason string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE lease SET ended_at=now(),end_reason=$2 WHERE id=$1 AND ended_at IS NULL`,
		leaseID, reason)
	return err
}

func (d *DB) RenewLease(ctx context.Context, leaseID string, ttlSec int) error {
	t := time.Now().Add(time.Duration(ttlSec) * time.Second)
	_, err := d.Pool.Exec(ctx, `UPDATE lease SET expires_at=$2 WHERE id=$1`, leaseID, t)
	return err
}

func (d *DB) PauseWorker(ctx context.Context, workerID string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE worker_instance SET status='paused' WHERE id=$1 AND status<>'stopped'`, workerID)
	return err
}

func (d *DB) StopWorker(ctx context.Context, workerID string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE worker_instance SET status='stopped',current_task_id=NULL,current_step=NULL,lease_id=NULL WHERE id=$1`, workerID)
	return err
}

func (d *DB) OrgHasRevokedDevice(ctx context.Context, orgID string) (bool, error) {
	var ok bool
	err := d.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM device WHERE org_id=$1 AND revoked_at IS NOT NULL)`, orgID).Scan(&ok)
	return ok, err
}

func (d *DB) RevokeDevice(ctx context.Context, deviceID string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE device SET revoked_at=now() WHERE id=$1`, deviceID)
	return err
}

func (d *DB) ListDevices(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,COALESCE(label,''),
		COALESCE(to_char(last_seen_at,'YYYY-MM-DD HH24:MI:SS'),''),
		CASE WHEN revoked_at IS NULL THEN 'active' ELSE 'revoked' END
		FROM device WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, label, seen, st string
		if err := rows.Scan(&id, &label, &seen, &st); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "label": label, "last_seen": seen, "status": st})
	}
	return out, rows.Err()
}

// SetPlan troca o plano da org e registra a assinatura (stand-in de Stripe no M3.1).
func (d *DB) SetPlan(ctx context.Context, orgID, plan string) error {
	if _, err := d.Pool.Exec(ctx, `UPDATE org SET plan=$2,updated_at=now() WHERE id=$1`, orgID, plan); err != nil {
		return err
	}
	// upsert manual (subscription não tem UNIQUE(org_id))
	tag, err := d.Pool.Exec(ctx, `UPDATE subscription SET plan=$2,status='active',updated_at=now() WHERE org_id=$1`, orgID, plan)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		_, err = d.Pool.Exec(ctx, `INSERT INTO subscription(id,org_id,plan,status,seats) VALUES($1,$2,$3,'active',1)`,
			NewID("sub"), orgID, plan)
	}
	return err
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
