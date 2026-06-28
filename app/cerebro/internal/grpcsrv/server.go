// Package grpcsrv — implementa o serviço Orchestrator.
// M1: Enroll(token) -> Stream -> Lease -> DispatchTask(fake) -> StepCompleted.
// M2.1: relay de planejamento — REST cria tarefa -> Hub empurra RequestPlan ->
//       executor planeja LOCAL (chave do user) -> PlanResult -> grava steps.
package grpcsrv

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/peer"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/auth"
	"apifor.dev/cerebro/internal/db"
	"apifor.dev/cerebro/internal/pki"
)

type Server struct {
	apiforv1.UnimplementedOrchestratorServer
	DB                *db.DB
	Auth              *auth.Auth
	Hub               *Hub
	CA                *pki.CA
	Cfg               EnforceConfig
	MergeRequireHuman bool // gate de merge: exigir revisão humana (M4.1)
}

// Enroll: valida o enrollment token (JWT de login), assina o CSR do device com a CA
// e devolve o cert de device (mTLS) + a cadeia da CA. A chave privada fica no executor.
func (s *Server) Enroll(ctx context.Context, req *apiforv1.EnrollRequest) (*apiforv1.EnrollResponse, error) {
	claims, err := s.Auth.Parse(req.GetEnrollmentToken())
	if err != nil {
		return nil, err
	}
	devID := db.NewID("dev")
	certPEM, serial, notAfter, err := s.CA.SignCSR(req.GetCsr(), devID, 30*24*time.Hour)
	if err != nil {
		log.Printf("enroll: assinatura do CSR falhou: %v", err)
		return nil, err
	}
	if err := s.DB.CreateDeviceCert(ctx, claims.OrgID, claims.Subject, devID, serial, notAfter); err != nil {
		return nil, err
	}
	log.Printf("enroll: device=%s org=%s serial=%s (cert assinado pela CA)", devID, claims.OrgID, serial)
	return &apiforv1.EnrollResponse{
		DeviceId:    devID,
		Certificate: certPEM,
		CaChain:     s.CA.CertPEM,
		ExpiresAt:   notAfter.UnixMilli(),
	}, nil
}

// Stream: canal bidi. Autentica pelo cert de device (mTLS): o serial do peer
// tem de bater com um device não-revogado. Revogar o cert = kill-switch real.
func (s *Server) Stream(stream apiforv1.Orchestrator_StreamServer) error {
	ctx := stream.Context()
	serial, ok := peerCertSerial(ctx)
	if !ok {
		log.Printf("stream: sem cert de device (mTLS exigido)")
		return context.Canceled
	}
	dev, err := s.DB.FindDeviceBySerial(ctx, serial)
	if err != nil || dev == nil {
		log.Printf("stream: cert desconhecido ou revogado (serial=%s)", serial)
		return context.Canceled
	}
	log.Printf("stream aberto (mTLS): device=%s org=%s serial=%s", dev.ID, dev.OrgID, serial)

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
			// M3.1: trava server-side (max_workers, worker-hours 36h/sem, TTL por plano).
			granted, reason := s.tryGrant(ctx, dev.OrgID, db.DemoWspID)
			if granted == nil {
				log.Printf("lease NEGADO: org=%s motivo=%s", dev.OrgID, reason)
				out <- &apiforv1.Envelope{
					Type:    apiforv1.MsgType_LEASE_DENIED,
					Payload: &apiforv1.Envelope_LeaseDenied{LeaseDenied: &apiforv1.LeaseDenied{Reason: reason}},
				}
				continue
			}
			out <- &apiforv1.Envelope{
				Type:    apiforv1.MsgType_LEASE_GRANTED,
				Payload: &apiforv1.Envelope_LeaseGranted{LeaseGranted: granted},
			}

		case apiforv1.MsgType_STEP_COMPLETED:
			ev := env.GetStepEvent()
			if ev == nil {
				continue
			}
			// Steps do pipeline (M4) reportam JSON {kind,...}; o step fake do M1 reporta "ok".
			if out := strings.TrimSpace(ev.GetOutput()); strings.HasPrefix(out, "{") {
				var r stepResult
				if json.Unmarshal([]byte(out), &r) == nil && r.Kind != "" {
					s.advancePipeline(ctx, ev.GetTaskId(), r)
					continue
				}
			}
			if err := s.DB.CompleteTask(ctx, ev.GetTaskId()); err != nil {
				log.Printf("complete err: %v", err)
			} else {
				log.Printf("task %s concluída", ev.GetTaskId())
			}

		case apiforv1.MsgType_STEP_FAILED:
			ev := env.GetStepEvent()
			if ev != nil {
				_ = s.DB.FailTask(ctx, ev.GetTaskId(), ev.GetError())
				log.Printf("step falhou: task=%s erro=%s", ev.GetTaskId(), ev.GetError())
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

			// Se a tarefa tem repositório, despacha o exec real (clone -> coda -> PR).
			if tr, err := s.DB.GetTaskRepo(ctx, pr.GetTaskId()); err == nil && tr != nil && tr.CloneURL != "" {
				instr := execInstructions{
					RepoURL:     tr.CloneURL,
					BaseBranch:  tr.DefaultBranch,
					Branch:      "apifor/" + pr.GetTaskId(),
					ChangeReq:   tr.Prompt,
					TargetFiles: pr.GetTargetFiles(),
				}
				blob, _ := json.Marshal(instr)
				out <- &apiforv1.Envelope{
					Type: apiforv1.MsgType_DISPATCH_STEP,
					Payload: &apiforv1.Envelope_DispatchStep{DispatchStep: &apiforv1.DispatchStep{
						StepId:       db.NewID("stp"),
						TaskId:       pr.GetTaskId(),
						Kind:         apiforv1.StepKind_EXEC,
						Instructions: string(blob),
					}},
				}
				_ = s.DB.SetTaskStatus(ctx, pr.GetTaskId(), "running")
				log.Printf("exec despachado: task=%s repo=%s branch=%s", pr.GetTaskId(), tr.CloneURL, instr.Branch)
			}
		}
	}
}

// execInstructions é o payload (JSON) do DispatchStep — espelhado no executor.
type execInstructions struct {
	RepoURL     string   `json:"repo_url"`
	BaseBranch  string   `json:"base_branch"`
	Branch      string   `json:"branch"`
	ChangeReq   string   `json:"change_request"`
	TargetFiles []string `json:"target_files,omitempty"`
}

// stepResult é o output JSON de um step do pipeline (exec/test/review/merge).
type stepResult struct {
	Kind     string `json:"kind"`
	Branch   string `json:"branch"`
	Url      string `json:"url"`
	Summary  string `json:"summary"`
	Comments string `json:"comments"`
	Passed   bool   `json:"passed"`
	Approved bool   `json:"approved"`
	Merged   bool   `json:"merged"`
}

// dispatchStep empurra o próximo step (test/review/merge) ao executor da org.
func (s *Server) dispatchStep(ctx context.Context, taskID string, kind apiforv1.StepKind) {
	tr, err := s.DB.GetTaskRepo(ctx, taskID)
	if err != nil || tr == nil || tr.CloneURL == "" {
		log.Printf("dispatchStep: sem repo p/ task=%s", taskID)
		return
	}
	instr := execInstructions{RepoURL: tr.CloneURL, BaseBranch: tr.DefaultBranch, Branch: "apifor/" + taskID, ChangeReq: tr.Prompt}
	blob, _ := json.Marshal(instr)
	s.Hub.Send(tr.OrgID, &apiforv1.Envelope{
		Type: apiforv1.MsgType_DISPATCH_STEP,
		Payload: &apiforv1.Envelope_DispatchStep{DispatchStep: &apiforv1.DispatchStep{
			StepId: db.NewID("stp"), TaskId: taskID, Kind: kind, Instructions: string(blob),
		}},
	})
	log.Printf("step despachado: task=%s kind=%v", taskID, kind)
}

// advancePipeline avança plan→exec→test→review→merge aplicando os gates server-side.
func (s *Server) advancePipeline(ctx context.Context, taskID string, r stepResult) {
	switch r.Kind {
	case "exec":
		_ = s.DB.SaveExecResult(ctx, taskID, r.Branch, r.Url) // PR aberto
		log.Printf("pipeline: PR criado task=%s branch=%s -> test", taskID, r.Branch)
		s.dispatchStep(ctx, taskID, apiforv1.StepKind_TEST)
	case "test":
		_ = s.DB.SetCIResult(ctx, taskID, r.Passed, r.Summary)
		if r.Passed {
			log.Printf("pipeline: CI verde task=%s -> review", taskID)
			s.dispatchStep(ctx, taskID, apiforv1.StepKind_REVIEW)
		} else {
			_ = s.DB.FailTask(ctx, taskID, "gate: testes falharam")
			log.Printf("pipeline: CI vermelho task=%s -> failed", taskID)
		}
	case "review":
		_ = s.DB.SetAIReview(ctx, taskID, r.Approved)
		if !r.Approved {
			_ = s.DB.FailTask(ctx, taskID, "gate: revisão IA pediu mudanças")
			log.Printf("pipeline: review IA reprovou task=%s -> failed", taskID)
			return
		}
		// gate de revisão humana
		if s.MergeRequireHuman {
			if ok, _ := s.DB.HumanApproved(ctx, taskID); !ok {
				_ = s.DB.SetTaskBlocked(ctx, taskID, "human_review")
				log.Printf("pipeline: task=%s bloqueada aguardando revisão HUMANA (intervenção)", taskID)
				return
			}
		}
		log.Printf("pipeline: gates ok task=%s -> merge", taskID)
		s.dispatchStep(ctx, taskID, apiforv1.StepKind_MERGE)
	case "merge":
		_ = s.DB.MarkMerged(ctx, taskID, r.Url)
		log.Printf("pipeline: MERGED task=%s url=%s", taskID, r.Url)
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

// peerCertSerial extrai o serial (hex) do cert de device apresentado na conexão mTLS.
func peerCertSerial(ctx context.Context) (string, bool) {
	pr, ok := peer.FromContext(ctx)
	if !ok {
		return "", false
	}
	ti, ok := pr.AuthInfo.(credentials.TLSInfo)
	if !ok || len(ti.State.PeerCertificates) == 0 {
		return "", false
	}
	return ti.State.PeerCertificates[0].SerialNumber.Text(16), true
}
