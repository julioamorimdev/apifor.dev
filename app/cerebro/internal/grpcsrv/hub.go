package grpcsrv

import (
	"sync"

	"apifor.dev/cerebro/gen/apiforv1"
)

// Hub mantém o canal de saída (push) das streams abertas, indexado por org.
// Permite que um handler REST (ex.: POST /v1/tasks) empurre um comando
// (RequestPlan) ao executor conectado daquela org. M2: 1 stream por org (demo).
type Hub struct {
	mu    sync.Mutex
	byOrg map[string]chan *apiforv1.Envelope
}

func NewHub() *Hub { return &Hub{byOrg: map[string]chan *apiforv1.Envelope{}} }

// register cria o canal de saída de uma stream recém-aberta.
func (h *Hub) register(org string) chan *apiforv1.Envelope {
	out := make(chan *apiforv1.Envelope, 16)
	h.mu.Lock()
	// se já houver uma stream para a org, fecha a antiga (reconnect).
	if old, ok := h.byOrg[org]; ok {
		close(old)
	}
	h.byOrg[org] = out
	h.mu.Unlock()
	return out
}

func (h *Hub) unregister(org string, out chan *apiforv1.Envelope) {
	h.mu.Lock()
	if cur, ok := h.byOrg[org]; ok && cur == out {
		delete(h.byOrg, org)
		close(out)
	}
	h.mu.Unlock()
}

// Send empurra um comando à stream da org. false = nenhum executor conectado.
func (h *Hub) Send(org string, env *apiforv1.Envelope) bool {
	h.mu.Lock()
	out, ok := h.byOrg[org]
	h.mu.Unlock()
	if !ok {
		return false
	}
	select {
	case out <- env:
		return true
	default:
		return false
	}
}
