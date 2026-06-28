package grpcsrv

import (
	"context"
	"log"
	"time"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/db"
)

// RunScheduler dispara rotinas agendadas (trigger=schedule) vencidas (M5.2).
func (s *Server) RunScheduler(ctx context.Context) {
	tick := time.Duration(s.Cfg.ReaperTickSec) * time.Second
	log.Printf("scheduler: tick=%ds (rotinas schedule)", s.Cfg.ReaperTickSec)
	t := time.NewTicker(tick)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			due, err := s.DB.DueRoutines(ctx)
			if err != nil {
				continue
			}
			for _, r := range due {
				taskID := s.fireRoutine(ctx, r.OrgID, r.WspID, r.Action)
				_ = s.DB.MarkRoutineRan(ctx, r.ID, r.IntervalSec)
				log.Printf("rotina disparada: id=%s -> task=%s", r.ID, taskID)
			}
		}
	}
}

// fireRoutine cria a tarefa da ação e dispara o relay de planejamento.
func (s *Server) fireRoutine(ctx context.Context, orgID, wspID string, a db.RoutineAction) string {
	if wspID == "" {
		wspID = s.DB.FirstWorkspace(ctx, orgID)
	}
	taskID, err := s.DB.CreateRealTask(ctx, orgID, wspID, a.Title, a.Prompt, a.RepoID)
	if err != nil {
		log.Printf("fireRoutine: %v", err)
		return ""
	}
	planPrompt, _ := s.DB.PromptWithMemory(ctx, orgID, a.RepoID, a.Prompt) // M5.3
	env := &apiforv1.Envelope{
		Type: apiforv1.MsgType_REQUEST_PLAN,
		Payload: &apiforv1.Envelope_RequestPlan{RequestPlan: &apiforv1.RequestPlan{
			TaskId: taskID, PromptTemplate: planPrompt, ContextRefs: a.Refs,
		}},
	}
	if s.Hub.Send(orgID, env) {
		_ = s.DB.SetTaskStatus(ctx, taskID, "planning")
	}
	s.DB.CreateNotification(ctx, orgID, "routine", "Rotina disparada", a.Title, "/routines")
	return taskID
}
