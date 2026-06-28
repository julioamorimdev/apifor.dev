// Package db — acesso ao Postgres (M1). Conecta como superuser; RLS por-org entra depois.
package db

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
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
	// M4.2: agent_profile globais (modelo por agente)
	if _, err := b.Exec(ctx, `INSERT INTO agent_profile(id,org_id,key,label,model) VALUES
		('agp_coder',NULL,'coder','Coder','claude_opus'),
		('agp_qa',NULL,'qa','QA','claude_haiku'),
		('agp_reviewer',NULL,'reviewer','Reviewer','claude_sonnet')
		ON CONFLICT (id) DO NOTHING`); err != nil {
		return err
	}
	return nil
}

// modelID resolve o enum agent_model p/ o id de modelo real.
func modelID(enum string) string {
	switch enum {
	case "claude_opus":
		return "claude-opus-4-8"
	case "claude_sonnet":
		return "claude-sonnet-4-6"
	case "claude_haiku":
		return "claude-haiku-4-5"
	default:
		return "claude-opus-4-8"
	}
}

// GetAgentModel devolve o id de modelo do agent_profile (coder/qa/reviewer).
func (d *DB) GetAgentModel(ctx context.Context, key string) string {
	var enum string
	err := d.Pool.QueryRow(ctx, `SELECT model::text FROM agent_profile WHERE key=$1 AND org_id IS NULL ORDER BY created_at LIMIT 1`, key).Scan(&enum)
	if err != nil {
		return "claude-opus-4-8"
	}
	return modelID(enum)
}

type User struct {
	ID, Email, Hash, OrgID, Role string
}

func (d *DB) FindUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := d.Pool.QueryRow(ctx, `SELECT u.id,u.email,COALESCE(u.password_hash,''),COALESCE(m.org_id,''),COALESCE(m.permission_tier::text,'')
		FROM app_user u LEFT JOIN membership m ON m.user_id=u.id WHERE u.email=$1
		ORDER BY m.created_at LIMIT 1`, email).
		Scan(&u.ID, &u.Email, &u.Hash, &u.OrgID, &u.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

// ── M5.4: notificações (eventos -> SSE) ──

// CreateNotification registra uma notificação da org (alvo: o owner da org).
func (d *DB) CreateNotification(ctx context.Context, orgID, ntype, title, body, link string) {
	var owner string
	if err := d.Pool.QueryRow(ctx, `SELECT owner_user_id FROM org WHERE id=$1`, orgID).Scan(&owner); err != nil {
		owner = DemoUserID
	}
	_, _ = d.Pool.Exec(ctx, `INSERT INTO notification(id,org_id,user_id,type,title,body,link,read)
		VALUES($1,$2,$3,$4,$5,$6,$7,false)`, NewID("ntf"), orgID, owner, ntype, title, body, link)
}

func (d *DB) ListNotifications(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,COALESCE(type,''),COALESCE(title,''),COALESCE(body,''),COALESCE(link,''),read,
		to_char(created_at,'YYYY-MM-DD HH24:MI:SS')
		FROM notification WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, t, title, body, link, date string
		var read bool
		if err := rows.Scan(&id, &t, &title, &body, &link, &read, &date); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "type": t, "title": title, "body": body, "link": link, "read": read, "date": date})
	}
	return out, rows.Err()
}

func (d *DB) UnreadCount(ctx context.Context, orgID string) int {
	var n int
	_ = d.Pool.QueryRow(ctx, `SELECT count(*) FROM notification WHERE org_id=$1 AND NOT read`, orgID).Scan(&n)
	return n
}

func (d *DB) MarkNotificationsRead(ctx context.Context, orgID string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE notification SET read=true WHERE org_id=$1 AND NOT read`, orgID)
	return err
}

// ── M5.3: memória (guia os agentes) + KB (metadado; arquivo local) ──

func (d *DB) CreateMemory(ctx context.Context, orgID, wspID, scope, repoID, instruction, source string) (string, error) {
	id := NewID("mem")
	var rid *string
	if scope == "repo" && repoID != "" {
		rid = &repoID
	} else {
		scope = "global"
	}
	_, err := d.Pool.Exec(ctx, `INSERT INTO memory(id,org_id,workspace_id,scope,repo_id,instruction,source)
		VALUES($1,$2,$3,$4,$5,$6,$7)`, id, orgID, wspID, scope, rid, instruction, source)
	return id, err
}

func (d *DB) ListMemories(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,scope::text,COALESCE(repo_id,''),instruction,source::text
		FROM memory WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, scope, repo, instr, src string
		if err := rows.Scan(&id, &scope, &repo, &instr, &src); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "scope": scope, "repo_id": repo, "instruction": instr, "source": src})
	}
	return out, rows.Err()
}

// MemoriesForTask devolve as instruções aplicáveis (global + as do repo) — p/ injetar no plano.
func (d *DB) MemoriesForTask(ctx context.Context, orgID, repoID string) ([]string, error) {
	rows, err := d.Pool.Query(ctx, `SELECT instruction FROM memory
		WHERE org_id=$1 AND (scope='global' OR (scope='repo' AND repo_id=$2)) ORDER BY created_at`, orgID, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (d *DB) DeleteMemory(ctx context.Context, orgID, id string) error {
	_, err := d.Pool.Exec(ctx, `DELETE FROM memory WHERE id=$1 AND org_id=$2`, id, orgID)
	return err
}

// PromptWithMemory prepende a memória da org (global + repo) ao pedido. Retorna (prompt, n).
func (d *DB) PromptWithMemory(ctx context.Context, orgID, repoID, prompt string) (string, int) {
	mems, _ := d.MemoriesForTask(ctx, orgID, repoID)
	if len(mems) == 0 {
		return prompt, 0
	}
	var b strings.Builder
	b.WriteString("MEMÓRIA DA ORG (siga estas instruções):\n")
	for _, m := range mems {
		b.WriteString("- " + m + "\n")
	}
	b.WriteString("\nPEDIDO:\n" + prompt)
	return b.String(), len(mems)
}

func (d *DB) CreateKBDoc(ctx context.Context, orgID, wspID, name, category, fileRef string) (string, error) {
	id := NewID("kb")
	switch category {
	case "doc", "guide", "spec", "runbook", "reference":
	default:
		category = "doc"
	}
	_, err := d.Pool.Exec(ctx, `INSERT INTO kb_document(id,org_id,workspace_id,name,category,file_ref,indexed)
		VALUES($1,$2,$3,$4,$5,$6,true)`, id, orgID, wspID, name, category, fileRef)
	return id, err
}

func (d *DB) ListKBDocs(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,name,category::text,COALESCE(file_ref,''),indexed
		FROM kb_document WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, name, cat, ref string
		var idx bool
		if err := rows.Scan(&id, &name, &cat, &ref, &idx); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "name": name, "category": cat, "file_ref": ref, "indexed": idx})
	}
	return out, rows.Err()
}

// ── M5.2: rotinas (schedule/manual -> cria tarefa) ──

// RoutineAction é o que a rotina dispara (espelha o POST /v1/tasks).
type RoutineAction struct {
	Title  string   `json:"title"`
	Prompt string   `json:"prompt"`
	Refs   []string `json:"refs"`
	RepoID string   `json:"repo_id"`
}

func (d *DB) CreateRoutine(ctx context.Context, orgID, wspID, name, triggerType string, intervalSec int, action RoutineAction) (string, error) {
	id := NewID("rtn")
	actJSON, _ := json.Marshal(action)
	trigJSON := `{"interval_sec":` + itoa(intervalSec) + `}`
	var next *time.Time
	if triggerType == "schedule" && intervalSec > 0 {
		t := time.Now().Add(time.Duration(intervalSec) * time.Second)
		next = &t
	}
	_, err := d.Pool.Exec(ctx, `INSERT INTO routine(id,org_id,workspace_id,name,trigger_type,trigger_config,action,enabled,next_run_at)
		VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,true,$8)`, id, orgID, wspID, name, triggerType, trigJSON, string(actJSON), next)
	return id, err
}

func (d *DB) ListRoutines(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,name,trigger_type::text,COALESCE((trigger_config->>'interval_sec')::int,0),
		enabled,COALESCE(to_char(last_run_at,'YYYY-MM-DD HH24:MI:SS'),''),COALESCE(action->>'title','')
		FROM routine WHERE org_id=$1 ORDER BY created_at`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, name, tt, last, title string
		var interval int
		var enabled bool
		if err := rows.Scan(&id, &name, &tt, &interval, &enabled, &last, &title); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "name": name, "trigger": tt, "interval_sec": interval, "enabled": enabled, "last_run": last, "action_title": title})
	}
	return out, rows.Err()
}

// RoutineDue é uma rotina agendada vencida (pronta p/ disparar).
type RoutineDue struct {
	ID, OrgID, WspID string
	IntervalSec      int
	Action           RoutineAction
}

func (d *DB) DueRoutines(ctx context.Context) ([]RoutineDue, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,org_id,workspace_id,COALESCE((trigger_config->>'interval_sec')::int,0),action::text
		FROM routine WHERE enabled AND trigger_type='schedule' AND next_run_at IS NOT NULL AND next_run_at <= now()`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RoutineDue
	for rows.Next() {
		var rd RoutineDue
		var actStr string
		if err := rows.Scan(&rd.ID, &rd.OrgID, &rd.WspID, &rd.IntervalSec, &actStr); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(actStr), &rd.Action)
		out = append(out, rd)
	}
	return out, rows.Err()
}

// GetRoutineAction devolve org/wsp/ação de uma rotina (p/ run manual).
func (d *DB) GetRoutineAction(ctx context.Context, routineID string) (string, string, RoutineAction, error) {
	var org, wsp, actStr string
	err := d.Pool.QueryRow(ctx, `SELECT org_id,workspace_id,action::text FROM routine WHERE id=$1`, routineID).Scan(&org, &wsp, &actStr)
	var act RoutineAction
	if err == nil {
		_ = json.Unmarshal([]byte(actStr), &act)
	}
	return org, wsp, act, err
}

func (d *DB) MarkRoutineRan(ctx context.Context, routineID string, intervalSec int) error {
	var next *time.Time
	if intervalSec > 0 {
		t := time.Now().Add(time.Duration(intervalSec) * time.Second)
		next = &t
	}
	_, err := d.Pool.Exec(ctx, `UPDATE routine SET last_run_at=now(),next_run_at=$2,updated_at=now() WHERE id=$1`, routineID, next)
	return err
}

func (d *DB) SetRoutineEnabled(ctx context.Context, orgID, routineID string, enabled bool) error {
	var next *time.Time
	if enabled {
		// reativa: agenda o próximo disparo com base no intervalo
		var interval int
		_ = d.Pool.QueryRow(ctx, `SELECT COALESCE((trigger_config->>'interval_sec')::int,0) FROM routine WHERE id=$1`, routineID).Scan(&interval)
		if interval > 0 {
			t := time.Now().Add(time.Duration(interval) * time.Second)
			next = &t
		}
	}
	_, err := d.Pool.Exec(ctx, `UPDATE routine SET enabled=$3,next_run_at=$4,updated_at=now() WHERE id=$1 AND org_id=$2`, routineID, orgID, enabled, next)
	return err
}

func (d *DB) DeleteRoutine(ctx context.Context, orgID, routineID string) error {
	_, err := d.Pool.Exec(ctx, `DELETE FROM routine WHERE id=$1 AND org_id=$2`, routineID, orgID)
	return err
}

func itoa(n int) string { return strconv.Itoa(n) }

// ── M5.1: multi-tenant (org/workspace/membership) + RBAC ──

// RegisterOrg cria user + org (Free) + membership owner + workspace + pool_config.
func (d *DB) RegisterOrg(ctx context.Context, email, name, hash, orgName string) (userID, orgID string, err error) {
	userID, orgID = NewID("usr"), NewID("org")
	wsp := NewID("wsp")
	b := d.Pool
	if _, err = b.Exec(ctx, `INSERT INTO app_user(id,email,name,password_hash) VALUES($1,$2,$3,$4)`, userID, email, name, hash); err != nil {
		return
	}
	if _, err = b.Exec(ctx, `INSERT INTO org(id,name,owner_user_id,plan) VALUES($1,$2,$3,'free')`, orgID, orgName, userID); err != nil {
		return
	}
	if _, err = b.Exec(ctx, `INSERT INTO membership(id,org_id,user_id,permission_tier,status) VALUES($1,$2,$3,'owner','active')`, NewID("mbr"), orgID, userID); err != nil {
		return
	}
	if _, err = b.Exec(ctx, `INSERT INTO workspace(id,org_id,name,initial) VALUES($1,$2,'Principal','P')`, wsp, orgID); err != nil {
		return
	}
	_, err = b.Exec(ctx, `INSERT INTO pool_config(id,workspace_id,parallel_workers,retries) VALUES($1,$2,1,2)`, NewID("pcfg"), wsp)
	return
}

func (d *DB) EmailExists(ctx context.Context, email string) (bool, error) {
	var ok bool
	err := d.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM app_user WHERE email=$1)`, email).Scan(&ok)
	return ok, err
}

// AddMember cria o usuário (se novo) e o vincula à org com o papel dado.
func (d *DB) AddMember(ctx context.Context, orgID, email, name, hash, role string) (string, error) {
	var userID string
	err := d.Pool.QueryRow(ctx, `SELECT id FROM app_user WHERE email=$1`, email).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		userID = NewID("usr")
		if _, err = d.Pool.Exec(ctx, `INSERT INTO app_user(id,email,name,password_hash) VALUES($1,$2,$3,$4)`, userID, email, name, hash); err != nil {
			return "", err
		}
	} else if err != nil {
		return "", err
	}
	_, err = d.Pool.Exec(ctx, `INSERT INTO membership(id,org_id,user_id,permission_tier,status)
		VALUES($1,$2,$3,$4,'active') ON CONFLICT (org_id,user_id) DO UPDATE SET permission_tier=EXCLUDED.permission_tier,status='active'`,
		NewID("mbr"), orgID, userID, role)
	return userID, err
}

func (d *DB) ListMembers(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT m.id,u.email,COALESCE(u.name,''),m.permission_tier::text,m.status::text
		FROM membership m JOIN app_user u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY m.created_at`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, email, name, role, st string
		if err := rows.Scan(&id, &email, &name, &role, &st); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "email": email, "name": name, "role": role, "status": st})
	}
	return out, rows.Err()
}

func (d *DB) RemoveMember(ctx context.Context, orgID, membershipID string) error {
	_, err := d.Pool.Exec(ctx, `DELETE FROM membership WHERE id=$1 AND org_id=$2 AND permission_tier<>'owner'`, membershipID, orgID)
	return err
}

func (d *DB) CreateWorkspace(ctx context.Context, orgID, name string) (string, error) {
	id := NewID("wsp")
	init := "W"
	if name != "" {
		init = strings.ToUpper(name[:1])
	}
	if _, err := d.Pool.Exec(ctx, `INSERT INTO workspace(id,org_id,name,initial) VALUES($1,$2,$3,$4)`, id, orgID, name, init); err != nil {
		return "", err
	}
	_, err := d.Pool.Exec(ctx, `INSERT INTO pool_config(id,workspace_id,parallel_workers,retries) VALUES($1,$2,1,2)`, NewID("pcfg"), id)
	return id, err
}

func (d *DB) ListWorkspaces(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,name,COALESCE(initial,'') FROM workspace WHERE org_id=$1 ORDER BY created_at`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, name, init string
		if err := rows.Scan(&id, &name, &init); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "name": name, "initial": init})
	}
	return out, rows.Err()
}

// FirstWorkspace devolve o workspace default da org (p/ escopar tarefas/repos).
func (d *DB) FirstWorkspace(ctx context.Context, orgID string) string {
	var id string
	if err := d.Pool.QueryRow(ctx, `SELECT id FROM workspace WHERE org_id=$1 ORDER BY created_at LIMIT 1`, orgID).Scan(&id); err != nil {
		return DemoWspID
	}
	return id
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

// ── M4.1: pipeline (test/review/merge) + gates + intervenção ──

func (d *DB) prIDByTask(ctx context.Context, taskID string) (string, string, error) {
	var prID, orgID string
	err := d.Pool.QueryRow(ctx, `SELECT id,org_id FROM pull_request WHERE task_id=$1 ORDER BY created_at DESC LIMIT 1`, taskID).
		Scan(&prID, &orgID)
	return prID, orgID, err
}

// SetCIResult grava o resultado do step de teste: pull_request.ci_status + ci_run.
func (d *DB) SetCIResult(ctx context.Context, taskID string, passed bool, summary string) error {
	prID, _, err := d.prIDByTask(ctx, taskID)
	if err != nil {
		return err
	}
	st := "failed"
	if passed {
		st = "passed"
	}
	if _, err := d.Pool.Exec(ctx, `UPDATE pull_request SET ci_status=$2,updated_at=now() WHERE id=$1`, prID, st); err != nil {
		return err
	}
	_, err = d.Pool.Exec(ctx, `INSERT INTO ci_run(id,pr_id,provider,status,started_at,finished_at,summary)
		VALUES($1,$2,'apifor',$3,now(),now(),$4::jsonb)`, NewID("ci"), prID, st, `{"summary":`+jsonStr(summary)+`}`)
	return err
}

// CreateQAReport grava um relatório de QA a partir do step de teste (M4.3).
func (d *DB) CreateQAReport(ctx context.Context, taskID string, passed bool, summary string) {
	prID, orgID, err := d.prIDByTask(ctx, taskID)
	if err != nil {
		return
	}
	total, np, st := 1, 0, "failed"
	if passed {
		np, st = 1, "passed"
	}
	_, _ = d.Pool.Exec(ctx, `INSERT INTO qa_report(id,org_id,task_id,pr_id,status,tests_total,tests_passed,summary)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, NewID("qa"), orgID, taskID, prID, st, total, np, summary)
}

func (d *DB) ListCI(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT c.id,COALESCE(c.provider,''),c.status::text,COALESCE(p.task_id,''),
		COALESCE(to_char(c.finished_at,'YYYY-MM-DD HH24:MI:SS'),'')
		FROM ci_run c JOIN pull_request p ON p.id=c.pr_id WHERE p.org_id=$1 ORDER BY c.started_at DESC LIMIT 50`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, prov, st, task, fin string
		if err := rows.Scan(&id, &prov, &st, &task, &fin); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "provider": prov, "status": st, "task_id": task, "finished_at": fin})
	}
	return out, rows.Err()
}

func (d *DB) ListQA(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,COALESCE(task_id,''),COALESCE(status,''),COALESCE(tests_total,0),
		COALESCE(tests_passed,0),to_char(created_at,'YYYY-MM-DD HH24:MI')
		FROM qa_report WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, task, st, date string
		var total, passed int
		if err := rows.Scan(&id, &task, &st, &total, &passed, &date); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "task_id": task, "status": st, "tests_total": total, "tests_passed": passed, "date": date})
	}
	return out, rows.Err()
}

// Telemetry — agregado por org (tarefas por estado, tokens, PRs, worker-hours/sem).
func (d *DB) Telemetry(ctx context.Context, orgID string) (Row, error) {
	var total, merged, failed, active int
	var tokens int64
	err := d.Pool.QueryRow(ctx, `SELECT count(*),
		count(*) FILTER (WHERE status='merged'),
		count(*) FILTER (WHERE status='failed'),
		count(*) FILTER (WHERE status IN ('queued','planning','running','blocked','in_review','assigned')),
		COALESCE(sum(tokens_used),0)
		FROM task WHERE org_id=$1`, orgID).Scan(&total, &merged, &failed, &active, &tokens)
	if err != nil {
		return nil, err
	}
	var prs int
	_ = d.Pool.QueryRow(ctx, `SELECT count(*) FROM pull_request WHERE org_id=$1`, orgID).Scan(&prs)
	week, _ := d.WeekSecondsUsed(ctx, orgID)
	return Row{
		"tasks_total": total, "tasks_merged": merged, "tasks_failed": failed, "tasks_active": active,
		"tokens_used": tokens, "pull_requests": prs, "week_worker_seconds": week,
	}, nil
}

// SetAIReview grava o resultado do step de revisão IA: pull_request.ai_review_status.
func (d *DB) SetAIReview(ctx context.Context, taskID string, approved bool) error {
	prID, _, err := d.prIDByTask(ctx, taskID)
	if err != nil {
		return err
	}
	st := "changes"
	if approved {
		st = "approved"
	}
	_, err = d.Pool.Exec(ctx, `UPDATE pull_request SET ai_review_status=$2,updated_at=now() WHERE id=$1`, prID, st)
	return err
}

// HumanApproved diz se a revisão humana já aprovou o PR da tarefa.
func (d *DB) HumanApproved(ctx context.Context, taskID string) (bool, error) {
	var st string
	err := d.Pool.QueryRow(ctx, `SELECT human_review_status FROM pull_request WHERE task_id=$1 ORDER BY created_at DESC LIMIT 1`, taskID).Scan(&st)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return st == "approved", err
}

func (d *DB) SetTaskBlocked(ctx context.Context, taskID, reason string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE task SET status='blocked',blocked_reason=$2,updated_at=now() WHERE id=$1`, taskID, reason)
	return err
}

// MarkMerged: PR e tarefa concluídos (merge feito pelo executor).
func (d *DB) MarkMerged(ctx context.Context, taskID, url string) error {
	prID, _, err := d.prIDByTask(ctx, taskID)
	if err == nil {
		_, _ = d.Pool.Exec(ctx, `UPDATE pull_request SET status='merged',merged_at=now(),url=$2,updated_at=now() WHERE id=$1`, prID, url)
	}
	_, err = d.Pool.Exec(ctx, `UPDATE task SET status='merged',updated_at=now() WHERE id=$1`, taskID)
	return err
}

// ApproveHumanReview: humano aprova o gate; desbloqueia a tarefa (p/ seguir ao merge).
func (d *DB) ApproveHumanReview(ctx context.Context, taskID string) error {
	prID, _, err := d.prIDByTask(ctx, taskID)
	if err != nil {
		return err
	}
	if _, err := d.Pool.Exec(ctx, `UPDATE pull_request SET human_review_status='approved',updated_at=now() WHERE id=$1`, prID); err != nil {
		return err
	}
	_, err = d.Pool.Exec(ctx, `UPDATE task SET status='running',blocked_reason=NULL,updated_at=now() WHERE id=$1`, taskID)
	return err
}

// RejectHumanReview: humano reprova → tarefa falha.
func (d *DB) RejectHumanReview(ctx context.Context, taskID, note string) error {
	if prID, _, err := d.prIDByTask(ctx, taskID); err == nil {
		_, _ = d.Pool.Exec(ctx, `UPDATE pull_request SET human_review_status='changes',updated_at=now() WHERE id=$1`, prID)
	}
	return d.FailTask(ctx, taskID, "revisão humana reprovou: "+note)
}

// PipelineState — estado da tarefa + gates do PR, p/ a reconciliação no reconnect.
type PipelineState struct {
	Status   string
	HasPR    bool
	CIStatus string
	AIStatus string
	HuStatus string
}

func (d *DB) GetTaskPipelineState(ctx context.Context, taskID string) (*PipelineState, error) {
	var ps PipelineState
	var ci, ai, hu *string
	err := d.Pool.QueryRow(ctx, `SELECT t.status,p.ci_status::text,p.ai_review_status::text,p.human_review_status::text
		FROM task t LEFT JOIN pull_request p ON p.task_id=t.id WHERE t.id=$1 ORDER BY p.created_at DESC LIMIT 1`, taskID).
		Scan(&ps.Status, &ci, &ai, &hu)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if ci != nil {
		ps.HasPR = true
		ps.CIStatus, ps.AIStatus, ps.HuStatus = *ci, deref(ai), deref(hu)
	}
	return &ps, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// RecordStepOutput atualiza o step do plano (por tipo) com status + output — p/ a timeline/Logs.
func (d *DB) RecordStepOutput(ctx context.Context, taskID, stepType, status, output string) {
	_, _ = d.Pool.Exec(ctx, `UPDATE step SET status=$3,output=$4::jsonb,ended_at=now()
		WHERE task_id=$1 AND type=$2`, taskID, stepType, status, `{"log":`+jsonStr(output)+`}`)
}

// ListInterventions: tarefas bloqueadas aguardando revisão humana (gate de merge).
func (d *DB) ListInterventions(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT t.id,t.title,COALESCE(p.branch,''),COALESCE(p.ci_status::text,''),COALESCE(p.ai_review_status::text,'')
		FROM task t LEFT JOIN pull_request p ON p.task_id=t.id
		WHERE t.org_id=$1 AND t.status='blocked' AND t.blocked_reason='human_review' ORDER BY t.created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, title, branch, ci, ai string
		if err := rows.Scan(&id, &title, &branch, &ci, &ai); err != nil {
			return nil, err
		}
		out = append(out, Row{"task_id": id, "title": title, "branch": branch, "ci_status": ci, "ai_review_status": ai})
	}
	return out, rows.Err()
}

func (d *DB) ListPRs(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT id,COALESCE(task_id,''),COALESCE(branch,''),COALESCE(url,''),status,
		ci_status::text,ai_review_status::text,human_review_status::text
		FROM pull_request WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var id, task, branch, url, st, ci, ai, human string
		if err := rows.Scan(&id, &task, &branch, &url, &st, &ci, &ai, &human); err != nil {
			return nil, err
		}
		out = append(out, Row{"id": id, "task_id": task, "branch": branch, "url": url, "status": st,
			"ci_status": ci, "ai_review_status": ai, "human_review_status": human})
	}
	return out, rows.Err()
}

func jsonStr(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// ── M3.2b: billing (Stripe) + dunning ──

type Subscription struct {
	Plan       string
	Status     string
	CustomerID string
	SubID      string
	GraceUntil *time.Time
}

func (d *DB) GetSubscription(ctx context.Context, orgID string) (*Subscription, error) {
	var s Subscription
	err := d.Pool.QueryRow(ctx, `SELECT plan,status,COALESCE(stripe_customer_id,''),COALESCE(stripe_subscription_id,''),grace_until
		FROM subscription WHERE org_id=$1 ORDER BY created_at DESC LIMIT 1`, orgID).
		Scan(&s.Plan, &s.Status, &s.CustomerID, &s.SubID, &s.GraceUntil)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &s, err
}

// UpsertSubscription aplica o plano da org + assinatura ativa (checkout concluído).
func (d *DB) UpsertSubscription(ctx context.Context, orgID, plan, customerID, subID string) error {
	if _, err := d.Pool.Exec(ctx, `UPDATE org SET plan=$2,updated_at=now() WHERE id=$1`, orgID, plan); err != nil {
		return err
	}
	tag, err := d.Pool.Exec(ctx, `UPDATE subscription SET plan=$2,status='active',
		stripe_customer_id=COALESCE(NULLIF($3,''),stripe_customer_id),
		stripe_subscription_id=COALESCE(NULLIF($4,''),stripe_subscription_id),
		grace_until=NULL,updated_at=now() WHERE org_id=$1`, orgID, plan, customerID, subID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		_, err = d.Pool.Exec(ctx, `INSERT INTO subscription(id,org_id,plan,status,seats,stripe_customer_id,stripe_subscription_id)
			VALUES($1,$2,$3,'active',1,NULLIF($4,''),NULLIF($5,''))`, NewID("sub"), orgID, plan, customerID, subID)
	}
	return err
}

func (d *DB) OrgByStripeCustomer(ctx context.Context, customerID string) (string, error) {
	if customerID == "" {
		return "", nil
	}
	var org string
	err := d.Pool.QueryRow(ctx, `SELECT org_id FROM subscription WHERE stripe_customer_id=$1 ORDER BY created_at DESC LIMIT 1`, customerID).Scan(&org)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return org, err
}

func (d *DB) SetSubscriptionPastDue(ctx context.Context, orgID string, graceUntil time.Time) error {
	_, err := d.Pool.Exec(ctx, `UPDATE subscription SET status='past_due',grace_until=$2,updated_at=now() WHERE org_id=$1`,
		orgID, graceUntil)
	return err
}

func (d *DB) SetSubscriptionActive(ctx context.Context, orgID string) error {
	_, err := d.Pool.Exec(ctx, `UPDATE subscription SET status='active',grace_until=NULL,updated_at=now() WHERE org_id=$1`, orgID)
	return err
}

// PastDueExpired: orgs em past_due cuja graça já passou → candidatas a rebaixar.
func (d *DB) PastDueExpired(ctx context.Context) ([]string, error) {
	rows, err := d.Pool.Query(ctx, `SELECT org_id FROM subscription
		WHERE status='past_due' AND grace_until IS NOT NULL AND grace_until < now()`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var o string
		if err := rows.Scan(&o); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// DowngradeToFree rebaixa a org p/ Free e marca a assinatura cancelada (dunning).
func (d *DB) DowngradeToFree(ctx context.Context, orgID string) error {
	if _, err := d.Pool.Exec(ctx, `UPDATE org SET plan='free',updated_at=now() WHERE id=$1`, orgID); err != nil {
		return err
	}
	_, err := d.Pool.Exec(ctx, `UPDATE subscription SET plan='free',status='canceled',grace_until=NULL,updated_at=now() WHERE org_id=$1`, orgID)
	return err
}

func (d *DB) CreateInvoice(ctx context.Context, orgID, stripeInvoiceID string, amountCents int, currency, status, pdfURL string) error {
	_, err := d.Pool.Exec(ctx, `INSERT INTO invoice(id,org_id,stripe_invoice_id,amount_cents,currency,status,pdf_url)
		VALUES($1,$2,$3,$4,$5,$6,NULLIF($7,''))`, NewID("inv"), orgID, stripeInvoiceID, amountCents, currency, status, pdfURL)
	return err
}

func (d *DB) ListInvoices(ctx context.Context, orgID string) ([]Row, error) {
	rows, err := d.Pool.Query(ctx, `SELECT COALESCE(stripe_invoice_id,''),COALESCE(amount_cents,0),currency,COALESCE(status,''),
		to_char(created_at,'YYYY-MM-DD'),COALESCE(pdf_url,'')
		FROM invoice WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var sid, cur, st, date, pdf string
		var amount int
		if err := rows.Scan(&sid, &amount, &cur, &st, &date, &pdf); err != nil {
			return nil, err
		}
		out = append(out, Row{"stripe_invoice_id": sid, "amount_cents": amount, "currency": cur, "status": st, "date": date, "pdf_url": pdf})
	}
	return out, rows.Err()
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
