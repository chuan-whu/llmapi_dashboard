package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNormalizeModelsEndpointAcceptsOriginV1AndModelsPath(t *testing.T) {
	for _, testCase := range []struct {
		input string
		want  string
	}{
		{input: "https://api.openai.com", want: "https://api.openai.com/v1/models"},
		{input: "https://api.openai.com/v1", want: "https://api.openai.com/v1/models"},
		{input: "https://api.openai.com/v1/models", want: "https://api.openai.com/v1/models"},
	} {
		got, err := normalizeModelsEndpoint(testCase.input)
		if err != nil {
			t.Fatalf("%s returned error: %v", testCase.input, err)
		}
		if got != testCase.want {
			t.Fatalf("%s expected %s, got %s", testCase.input, testCase.want, got)
		}
	}
}

func TestNormalizeModelsEndpointErrorsNameAvailableModelsBaseURL(t *testing.T) {
	for _, input := range []string{"", "not-a-url"} {
		_, err := normalizeModelsEndpoint(input)
		if err == nil {
			t.Fatalf("expected error for %q", input)
		}
		if !strings.Contains(err.Error(), "AVAILABLE_MODELS_BASE_URL") {
			t.Fatalf("expected error to name AVAILABLE_MODELS_BASE_URL, got %v", err)
		}
	}
}

func TestParseAvailableModelsAcceptsOpenAICompatibleResponse(t *testing.T) {
	models, err := parseAvailableModels(json.RawMessage(`{"data":[{"id":"gpt-5"},{"id":"gpt-5-mini"},{"id":"gpt-5"}]}`))
	if err != nil {
		t.Fatalf("parseAvailableModels returned error: %v", err)
	}
	if len(models) != 2 || models[0] != "gpt-5" || models[1] != "gpt-5-mini" {
		t.Fatalf("unexpected models: %+v", models)
	}
}

func TestParseAvailableModelsAcceptsStringArrayResponse(t *testing.T) {
	models, err := parseAvailableModels(json.RawMessage(`["claude-sonnet","gpt-5",""]`))
	if err != nil {
		t.Fatalf("parseAvailableModels returned error: %v", err)
	}
	if len(models) != 2 || models[0] != "claude-sonnet" || models[1] != "gpt-5" {
		t.Fatalf("unexpected models: %+v", models)
	}
}
