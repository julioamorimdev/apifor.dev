package grpcsrv

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/db"
)

// EnforceConfig — travas de plano. Os *OverrideSec encolhem TTL/cap (p/ testar a
// lógica de 4h/36h em segundos sem esperar horas).
type EnforceConfig struct {
	LeaseTTLOverrideSec int // >0 sobrepõe o TTL de planos que têm TTL (free)
	HoursCapOverrideSec int // >0 sobrepõe o cap semanal de planos que têm cap (free)
	ReaperTickSec       int
	GraceSec            int
}

func EnforceConfigFromEnv() EnforceConfig {
	atoi := func(k string, def int) int {
		if v, err := strconv.Atoi(os.Getenv(k)); err == nil && v > 0 {
			return v
		}
		return def
	}
	return EnforceConfig{
		LeaseTTLOverrideSec: atoi("LEASE_TTL_SEC", 0),
		HoursCapOverrideSec: atoi("WORKER_HOURS_CAP_SEC", 0),
		ReaperTickSec:       atoi("REAPER_TICK_SEC", 30),
		GraceSec:            atoi("GRACE_SEC", 300),
	}
}

// ttlSec: 0 = sem expiração (plano sem lease_ttl_min, ex.: pro+).
func (c EnforceConfig) ttlSec(pl *db.PlanLimits) int {
	if pl == nil || pl.LeaseTTLMin == nil {
		return 0
	}
	if c.LeaseTTLOverrideSec > 0 {
		return c.LeaseTTLOverrideSec
	}
	return *pl.LeaseTTLMin * 60
}

// capSec: 0 = sem cap semanal (plano sem weekly_worker_hours, ex.: pro+).
func (c EnforceConfig) capSec(pl *db.PlanLimits) int {
	if pl == nil || pl.WeeklyHours == nil {
		return 0
	}
	if c.HoursCapOverrideSec > 0 {
		return c.HoursCapOverrideSec
	}
	return *pl.WeeklyHours * 3600
}

// tryGrant aplica as travas e, se passar, concede o lease. Retorna o motivo da negação.
func (s *Server) tryGrant(ctx context.Context, orgID, wspID string) (*apiforv1.LeaseGranted, string) {
	if s.DB.PoolPaused(ctx, orgID) {
		return nil, "pool_paused"
	}
	pl, err := s.DB.GetPlanLimits(ctx, orgID)
	if err != nil || pl == nil {
		return nil, "no_plan"
	}
	// cap efetivo: em modo "pinned", o teto é a concorrência somada dos workers
	// dedicados (mas nunca acima do limite do plano).
	capW := -1 // -1 = sem teto (∞)
	if pl.MaxWorkers != nil {
		capW = *pl.MaxWorkers
	}
	if s.DB.PoolMode(ctx, orgID) == "pinned" {
		pc := s.DB.PinnedConcurrency(ctx, orgID)
		if capW < 0 || pc < capW {
			capW = pc
		}
	}
	if capW >= 0 {
		n, _ := s.DB.ActiveLeaseCount(ctx, orgID)
		if n >= capW {
			return nil, "cap"
		}
	}
	if cap := s.Cfg.capSec(pl); cap > 0 {
		if used, _ := s.DB.WeekSecondsUsed(ctx, orgID); used >= int64(cap) {
			return nil, "hours_cap"
		}
	}
	ttl := s.Cfg.ttlSec(pl)
	autoRenew := pl.Plan != "free" // Free = não-renovável; Pro+ sem expiração/renova
	wid, lid, expMs, err := s.DB.GrantLease(ctx, orgID, wspID, ttl, autoRenew)
	if err != nil {
		log.Printf("grant lease err: %v", err)
		return nil, "internal"
	}
	_ = s.DB.RecordUsage(ctx, orgID, wid, lid, "worker_started")
	_ = s.DB.RecordUsage(ctx, orgID, wid, lid, "lease_issued")
	log.Printf("lease concedido: org=%s plano=%s worker=%s lease=%s ttl=%ds auto_renew=%v",
		orgID, pl.Plan, wid, lid, ttl, autoRenew)
	return &apiforv1.LeaseGranted{LeaseId: lid, WorkerId: wid, ExpiresAt: expMs, AutoRenew: autoRenew}, ""
}

// RunReaper roda em background: acumula worker-hours, expira lease Free (não-renova),
// renova Pro+, corta no cap semanal e aplica o kill-switch (device revogado).
func (s *Server) RunReaper(ctx context.Context) {
	tick := time.Duration(s.Cfg.ReaperTickSec) * time.Second
	log.Printf("reaper: tick=%ds grace=%ds (override ttl=%ds cap=%ds)",
		s.Cfg.ReaperTickSec, s.Cfg.GraceSec, s.Cfg.LeaseTTLOverrideSec, s.Cfg.HoursCapOverrideSec)
	t := time.NewTicker(tick)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.reapOnce(ctx)
		}
	}
}

func (s *Server) reapOnce(ctx context.Context) {
	// dunning: assinaturas past_due cuja graça (7d) expirou → rebaixa p/ Free.
	if orgs, err := s.DB.PastDueExpired(ctx); err == nil {
		for _, org := range orgs {
			if err := s.DB.DowngradeToFree(ctx, org); err == nil {
				log.Printf("dunning: org=%s past_due expirou -> rebaixada p/ Free", org)
			}
		}
	}

	leases, err := s.DB.ActiveLeases(ctx)
	if err != nil {
		return
	}
	for _, l := range leases {
		// acumula worker-hours do ciclo
		_ = s.DB.AddWorkerSeconds(ctx, l.OrgID, int64(s.Cfg.ReaperTickSec))

		// kill-switch: device revogado → corta já
		if revoked, _ := s.DB.OrgHasRevokedDevice(ctx, l.OrgID); revoked {
			s.revoke(ctx, l, "killed")
			continue
		}

		pl, _ := s.DB.GetPlanLimits(ctx, l.OrgID)

		// cap semanal (Free): 36h/sem → corta e bloqueia até reset
		if cap := s.Cfg.capSec(pl); cap > 0 {
			if used, _ := s.DB.WeekSecondsUsed(ctx, l.OrgID); used >= int64(cap) {
				s.revoke(ctx, l, "hours_cap")
				continue
			}
		}

		// TTL: Free expira (não-renova) → pausa; Pro+ renova
		if l.ExpiresAt != nil && time.Now().After(*l.ExpiresAt) {
			if l.AutoRenew {
				_ = s.DB.RenewLease(ctx, l.LeaseID, s.Cfg.ttlSec(pl))
				log.Printf("lease renovado: lease=%s org=%s", l.LeaseID, l.OrgID)
			} else {
				s.revoke(ctx, l, "expired")
			}
		}
	}
}

// revoke encerra o lease, ajusta o worker e empurra LEASE_REVOKED + STOP_WORKER.
func (s *Server) revoke(ctx context.Context, l db.ActiveLease, reason string) {
	_ = s.DB.EndLease(ctx, l.LeaseID, reason)
	if reason == "expired" {
		_ = s.DB.PauseWorker(ctx, l.WorkerID) // Free: pausa graceful, religar manual
	} else {
		_ = s.DB.StopWorker(ctx, l.WorkerID)
	}
	_ = s.DB.RecordUsage(ctx, l.OrgID, l.WorkerID, l.LeaseID, "lease_expired")
	_ = s.DB.RecordUsage(ctx, l.OrgID, l.WorkerID, l.LeaseID, "worker_stopped")
	s.Hub.Send(l.OrgID, &apiforv1.Envelope{
		Type:    apiforv1.MsgType_LEASE_REVOKED,
		Payload: &apiforv1.Envelope_LeaseRevoked{LeaseRevoked: &apiforv1.LeaseRevoked{LeaseId: l.LeaseID, Reason: reason}},
	})
	s.Hub.Send(l.OrgID, &apiforv1.Envelope{
		Type:    apiforv1.MsgType_STOP_WORKER,
		Payload: &apiforv1.Envelope_WorkerControl{WorkerControl: &apiforv1.WorkerControl{WorkerId: l.WorkerID, Stop: true, Reason: reason}},
	})
	s.DB.CreateNotification(ctx, l.OrgID, "lease", "Lease revogado", "motivo: "+reason, "/usage")
	log.Printf("lease revogado: org=%s lease=%s worker=%s motivo=%s", l.OrgID, l.LeaseID, l.WorkerID, reason)
}
