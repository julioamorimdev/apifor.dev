// Package grpcsrv — implementa o serviço Orchestrator.
// M1: Enroll(token) -> Stream -> Lease -> DispatchTask(fake) -> StepCompleted.
// M2.1: relay de planejamento — REST cria tarefa -> Hub empurra RequestPlan ->
//       executor planeja LOCAL (chave do user) -> PlanResult -> grava steps.
package grpcsrv

import (
	"context"
	"log"
	"time"

	"google.golang.org/grpc/metadata"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/auth"
	"apifor.dev/cerebro/internal/db"
)

type Server struct {
	apiforv1.UnimplementedOrchestratorServer
	DB   *db.DB
	Auth *auth.Auth
	Hub  *Hub
}

// Enroll: troca o enrollment token (JWT de login) por um device token (M1; mTLS depois).
func (s *Server) Enroll(ctx context.Context, req *apiforv1.EnrollRequest) (*apiforv1.EnrollResponse, error) {
	claims, err := s.Auth.Parse(req.GetEnrollmentToken())
	if err != nil {
		return nil, err
	}
	token := db.NewID("dvt")
	devID, err := s.DB.CreateDevice(ctx, claims.OrgID, claims.Subject, token)
	if err != nil {
		return nil, err
	}
	log.Printf("enroll: device=%s org=%s", devID, claims.OrgID)
	return &apiforv1.EnrollResponse{
		DeviceId:    devID,
		Certificate: []byte(token), // M1: token no campo certificate
		ExpiresAt:   time.Now().Add(30 * 24 * time.Hour).UnixMilli(),
	}, nil
}

// Stream: canal bidi. Autentica por device token na metadata "authorization".
func (s *Server) Stream(stream apiforv1.Orchestrator_StreamServer) error {
	ctx := stream.Context()
	token := bearer(ctx)
	dev, err := s.DB.FindDeviceByToken(ctx, token)
	if err != nil || dev == nil {
		log.Printf("stream: device token inválido")
		return context.Canceled
	}
	log.Printf("stream aberto: device=%s org=%s", dev.ID, dev.OrgID)

	// Canal de saída (push): tudo que o cérebro envia passa por aqui — uma única
	// goroutine faz Send, o loop principal faz Recv (regra do gRPC streaming).
	out := s.Hub.register(dev.OrgID)
	defer s.Hub.unregister(dev.OrgID, out)
	go func() {
		for env := range out {
			env.Id = db.NewID("msg")
			env.Ts = time.Now().UnixMilli()
			if err := stream.Send(env); err != nil {
				return
			}
		}
	}()

	for {
		env, err := stream.Recv()
		if err != nil {
			log.Printf("stream fechado: %v", err)
			return nil
		}
		switch env.GetType() {

		case apiforv1.MsgType_HEARTBEAT:
			s.DB.TouchDevice(ctx, dev.ID)

		case apiforv1.MsgType_LEASE_REQUEST:
			workerID, err := s.DB.CreateWorkerInstance(ctx, dev.OrgID, db.DemoWspID)
			if err != nil {
				log.Printf("worker_instance err: %v", err)
				continue
			}
			leaseID, err := s.DB.CreateLease(ctx, dev.OrgID, workerID, 4*time.Hour, false)
			if err != nil {
				log.Printf("lease err: %v", err)
				continue
			}
			log.Printf("lease concedido: worker=%s lease=%s", workerID, leaseID)
			out <- &apiforv1.Envelope{
				Type:    apiforv1.MsgType_LEASE_GRANTED,
				Payload: &apiforv1.Envelope_LeaseGranted{LeaseGranted: &apiforv1.LeaseGranted{LeaseId: leaseID, WorkerId: workerID, AutoRenew: false}},
			}

		case apiforv1.MsgType_STEP_COMPLETED:
			ev := env.GetStepEvent()
			if ev != nil {
				if err := s.DB.CompleteTask(ctx, ev.GetTaskId()); err != nil {
					log.Printf("complete err: %v", err)
				} else {
					log.Printf("task %s concluída", ev.GetTaskId())
				}
			}

		case apiforv1.MsgType_PLAN_RESULT:
			pr := env.GetPlanResult()
			if pr == nil {
				continue
			}
			steps := make([]db.PlanStepIn, 0, len(pr.GetSteps()))
			for _, st := range pr.GetSteps() {
				steps = append(steps, db.PlanStepIn{
					Idx:   int(st.GetIdx()),
					Type:  stepKindToType(st.GetKind()),
					Label: st.GetLabel(),
				})
			}
			if err := s.DB.SavePlan(ctx, pr.GetTaskId(), steps, pr.GetTokensUsed()); err != nil {
				log.Printf("save plan err: %v", err)
				continue
			}
			log.Printf("plano recebido: task=%s steps=%d tokens=%d decisão=%q",
				pr.GetTaskId(), len(steps), pr.GetTokensUsed(), pr.GetDecision())
		}
	}
}

// stepKindToType mapeia o enum do proto p/ o enum step_type do schema.
func stepKindToType(k apiforv1.StepKind) string {
	switch k {
	case apiforv1.StepKind_PLAN:
		return "plan"
	case apiforv1.StepKind_EXEC:
		return "exec"
	case apiforv1.StepKind_TEST:
		return "test"
	case apiforv1.StepKind_REVIEW:
		return "review"
	case apiforv1.StepKind_MERGE:
		return "merge"
	case apiforv1.StepKind_QUESTION:
		return "question"
	default:
		return "plan"
	}
}

func bearer(ctx context.Context) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	vals := md.Get("authorization")
	if len(vals) == 0 {
		return ""
	}
	t := vals[0]
	if len(t) > 7 && t[:7] == "Bearer " {
		return t[7:]
	}
	return t
}
