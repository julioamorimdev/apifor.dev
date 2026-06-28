package httpapi

import (
	"strings"
	"testing"
)

func TestCanRBAC(t *testing.T) {
	cases := []struct {
		role, cap string
		want      bool
	}{
		{"owner", "read", true}, {"viewer", "read", true},
		{"owner", "write", true}, {"admin", "write", true}, {"member", "write", true},
		{"viewer", "write", false}, {"billing", "write", false},
		{"owner", "manage", true}, {"admin", "manage", true}, {"member", "manage", false},
		{"owner", "billing", true}, {"billing", "billing", true}, {"admin", "billing", false},
		{"owner", "desconhecida", false},
	}
	for _, c := range cases {
		if got := can(c.role, c.cap); got != c.want {
			t.Errorf("can(%q,%q)=%v, quero %v", c.role, c.cap, got, c.want)
		}
	}
}

func TestRpmForPlan(t *testing.T) {
	cases := map[string]int64{"free": 60, "pro": 300, "team": 1000, "enterprise": 0, "qualquer": 0}
	for plan, want := range cases {
		if got := rpmForPlan(plan); got != want {
			t.Errorf("rpmForPlan(%q)=%d, quero %d", plan, got, want)
		}
	}
}

func TestCsvFieldNeutralizesInjection(t *testing.T) {
	for _, bad := range []string{"=cmd", "+x", "-y", "@z"} {
		if got := csvField(bad); !strings.HasPrefix(got, `"'`) {
			t.Errorf("csvField(%q)=%q deveria começar com aspas+apóstrofo", bad, got)
		}
	}
	if got := csvField(`a"b`); got != `"a""b"` {
		t.Errorf("csvField escape de aspas: got %q", got)
	}
	if got := csvField("normal"); got != `"normal"` {
		t.Errorf("csvField normal: got %q", got)
	}
}
