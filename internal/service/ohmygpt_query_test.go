package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOhMyGPTQueryServicePostsConfiguredEndpointAndFiltersByMaskedKey(t *testing.T) {
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
				{"key":"sk-*************************************************6dc","remark":"张三","created_at":"2025-07-30T07:31:10.000Z","used_at":"2025-07-30T07:59:28.000Z","expired_at":"2035-07-28T07:26:00.000Z","used_times":"1","used_fee":"90.00","max_fee":"25000.00","permissions":["gpt-5"],"is_disabled":false,"user_id":"55255","is_admin":false,"is_check_permission":false},
				{"key":"sk-*************************************************4A8","remark":"李四","created_at":"2026-03-30T04:56:09.000Z","used_at":null,"expired_at":"2036-03-27T04:56:00.000Z","used_times":"0","used_fee":"0.00","max_fee":"25000.00","permissions":[],"is_disabled":false,"user_id":"55255","is_admin":false,"is_check_permission":false}
			]
		}`))
	}))
	defer server.Close()

	service := NewOhMyGPTQueryService(server.URL, "admin-token")
	result, err := service.QueryAPIKey(context.Background(), "sk-live-real-value-6dc")
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
	if len(result.Data) != 1 || result.Data[0].Remark != "张三" || result.Data[0].Key != "sk-*************************************************6dc" {
		t.Fatalf("expected only the masked key match, got %+v", result.Data)
	}

	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if string(raw) == "" || !json.Valid(raw) {
		t.Fatalf("expected JSON-serializable result, got %s", string(raw))
	}
}

func TestOhMyGPTQueryServiceRequiresConfiguration(t *testing.T) {
	service := NewOhMyGPTQueryService("", "")

	_, err := service.QueryAPIKey(context.Background(), "sk-test")
	if err == nil {
		t.Fatal("expected missing configuration to return an error")
	}
}
