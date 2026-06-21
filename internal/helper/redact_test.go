package helper

import (
	"testing"

	"llmapi-dashboard/internal/entities"
)

func TestRedactSensitiveValueUsesCanonicalFormat(t *testing.T) {
	if got := RedactSensitiveValue("sk-demo-key-1234"); got != "sk-*********y-1234" {
		t.Fatalf("expected canonical masked key, got %q", got)
	}
	if got := RedactSensitiveValue("short"); got != "*********" {
		t.Fatalf("expected short key to use fixed mask, got %q", got)
	}
	if got := RedactSensitiveValue("sk-123456"); got != "*********" {
		t.Fatalf("expected boundary-length key to be fully masked, got %q", got)
	}
	if got := RedactSensitiveValue(""); got != "unknown" {
		t.Fatalf("expected empty key to stay compatible with public fallback, got %q", got)
	}
	if got := RedactSensitiveValue("unknown"); got != "unknown" {
		t.Fatalf("expected unknown key to remain unknown, got %q", got)
	}
}

func TestAPIKeyDisplayNameIgnoresAlias(t *testing.T) {
	row := entities.APIKey{APIKey: "sk-alpha123456", KeyAlias: "  Production  ", DisplayKey: "sk-B********************************Zejy"}

	if got := APIKeyDisplayName(row); got != "sk-a*****************3456" {
		t.Fatalf("expected masked key label, got %q", got)
	}
}

func TestAPIKeyDisplayNameFallsBackToMaskedRawKey(t *testing.T) {
	row := entities.APIKey{APIKey: "sk-alpha123456", DisplayKey: "sk-B********************************Zejy"}

	if got := APIKeyDisplayName(row); got != "sk-a*****************3456" {
		t.Fatalf("expected dashboard masked key fallback, got %q", got)
	}
}

func TestAPIKeyMaskedDisplayKeyMasksRawKeyWithCanonicalFormat(t *testing.T) {
	row := entities.APIKey{APIKey: "sk-demo-key-1234", DisplayKey: "sk-*********y-1234"}

	if got := APIKeyMaskedDisplayKey(row); got != "sk-d*****************1234" {
		t.Fatalf("expected dashboard display key, got %q", got)
	}
}

func TestAPIKeyMaskedDisplayKeyFallsBackToStoredDisplayKeyWhenRawKeyIsMissing(t *testing.T) {
	row := entities.APIKey{DisplayKey: "sk-*********maWyTA"}

	if got := APIKeyMaskedDisplayKey(row); got != "sk-*********maWyTA" {
		t.Fatalf("expected stored display key fallback, got %q", got)
	}
}
