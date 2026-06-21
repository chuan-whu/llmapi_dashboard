package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOhMyGPTQueryServicePostsConfiguredEndpointAndFiltersByFullKey(t *testing.T) {
	var method string
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method = r.Method
		authHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"statusCode": 200,
			"message": "Get api keys success, total keys: 2",
			"data": [
				{"key":"sk-live-full-value-alpha","remark":"user-a","created_at":"2025-07-30T07:31:10.000Z","used_at":"2025-07-30T07:59:28.000Z","expired_at":"2035-07-28T07:26:00.000Z","used_times":"1","used_fee":"90.00","max_fee":"25000.00","permissions":["gpt-5"],"is_disabled":false},
				{"key":"sk-other-full-value-beta","remark":"user-b","created_at":"2026-03-30T04:56:09.000Z","used_at":null,"expired_at":"2036-03-27T04:56:00.000Z","used_times":"0","used_fee":"0.00","max_fee":"25000.00","permissions":[],"is_disabled":false}
			]
		}`))
	}))
	defer server.Close()

	service := NewOhMyGPTQueryService(server.URL, "admin-token")
	result, err := service.QueryAPIKey(context.Background(), "sk-live-full-value-alpha")
	if err != nil {
		t.Fatalf("QueryAPIKey returned error: %v", err)
	}

	if method != http.MethodPost {
		t.Fatalf("expected POST request, got %s", method)
	}
	if authHeader != "Bearer admin-token" {
		t.Fatalf("expected bearer token header, got %q", authHeader)
	}
	if result.StatusCode != 200 || result.Message != "Get api keys success, total keys: 2" {
		t.Fatalf("expected root metadata to be preserved, got %+v", result)
	}
	if len(result.Data) != 1 || result.Data[0].Remark != "user-a" || result.Data[0].Key != "sk-live-full-value-alpha" {
		t.Fatalf("expected only the full key match, got %+v", result.Data)
	}

	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if string(raw) == "" || !json.Valid(raw) {
		t.Fatalf("expected JSON-serializable result, got %s", string(raw))
	}
}

func TestOhMyGPTQueryServiceDoesNotMatchBySuffix(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"statusCode": 200,
			"message": "Get api keys success, total keys: 1",
			"data": [
				{"key":"sk-different-full-value-alpha","remark":"user-a","created_at":"2025-07-30T07:31:10.000Z","used_at":null,"expired_at":"2035-07-28T07:26:00.000Z","used_times":"1","used_fee":"90.00","max_fee":"25000.00","permissions":["gpt-5"],"is_disabled":false}
			]
		}`))
	}))
	defer server.Close()

	service := NewOhMyGPTQueryService(server.URL, "admin-token")
	result, err := service.QueryAPIKey(context.Background(), "sk-live-full-value-alpha")
	if err != nil {
		t.Fatalf("QueryAPIKey returned error: %v", err)
	}

	if len(result.Data) != 0 {
		t.Fatalf("expected no suffix-only match, got %+v", result.Data)
	}
}

func TestOhMyGPTQueryServiceRequiresConfiguration(t *testing.T) {
	service := NewOhMyGPTQueryService("", "")

	_, err := service.QueryAPIKey(context.Background(), "sk-test")
	if err == nil {
		t.Fatal("expected missing configuration to return an error")
	}
}
