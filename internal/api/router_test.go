package api

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"

	"github.com/gin-gonic/gin"
	"llmapi-dashboard/internal/auth"
	"llmapi-dashboard/internal/version"
)

func testStaticFS(t *testing.T, files map[string]string) fs.FS {
	t.Helper()
	staticFS := fstest.MapFS{}
	for name, content := range files {
		staticFS[name] = &fstest.MapFile{Data: []byte(content), Mode: 0o644}
	}
	return staticFS
}

func TestHealthzReturnsOK(t *testing.T) {
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "")
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
}

func TestRouterDoesNotTrustForwardedClientIPByDefault(t *testing.T) {
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "")
	router.GET("/client-ip", func(c *gin.Context) {
		c.String(http.StatusOK, c.ClientIP())
	})
	req := httptest.NewRequest(http.MethodGet, "/client-ip", nil)
	req.RemoteAddr = "198.51.100.10:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.7")
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	if resp.Body.String() != "198.51.100.10" {
		t.Fatalf("expected direct remote IP, got %q", resp.Body.String())
	}
}

func TestReadOnlyStatusReturnsLocalState(t *testing.T) {
	previousLocal := time.Local
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}
	t.Cleanup(func() { time.Local = previousLocal })
	time.Local = location

	previousVersion := version.Version
	t.Cleanup(func() { version.Version = previousVersion })
	version.Version = "v1.2.3"

	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
	body := resp.Body.String()
	for _, expected := range []string{
		`"timezone":"Asia/Shanghai"`,
		`"version":"v1.2.3"`,
	} {
		if !contains(body, expected) {
			t.Fatalf("expected status response to contain %s, got %s", expected, body)
		}
	}
	for _, forbidden := range []string{
		"public_url",
		"running",
	} {
		if contains(body, forbidden) {
			t.Fatalf("expected read-only status response not to include %q, got %s", forbidden, body)
		}
	}
}

func TestSubpathRoutesOnlyServePrefixedEndpoints(t *testing.T) {
	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{BasePath: "/usage"}, nil, "/usage")

	for _, testCase := range []struct {
		path       string
		statusCode int
	}{
		{path: "/usage/healthz", statusCode: http.StatusOK},
		{path: "/usage/api/v1/status", statusCode: http.StatusOK},
		{path: "/healthz", statusCode: http.StatusNotFound},
		{path: "/api/v1/status", statusCode: http.StatusNotFound},
	} {
		resp := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, testCase.path, nil)
		router.ServeHTTP(resp, req)
		if resp.Code != testCase.statusCode {
			t.Fatalf("expected %s to return %d, got %d", testCase.path, testCase.statusCode, resp.Code)
		}
	}
}

func TestSubpathStaticRoutesServeOnlyUnderPrefix(t *testing.T) {
	staticFS := testStaticFS(t, map[string]string{
		"index.html":    `<html><head><script>window.__APP_BASE_PATH__ = "__APP_BASE_PATH__"; window.__TUTORIAL_PDF_URL__ = "__TUTORIAL_PDF_URL__";</script></head><body>app</body></html>`,
		"assets/app.js": "console.log('ok')",
	})

	pdfPath := filepath.Join(t.TempDir(), "guidance.pdf")
	if err := os.WriteFile(pdfPath, []byte("%PDF-1.7\n%%EOF\n"), 0o600); err != nil {
		t.Fatalf("write pdf: %v", err)
	}
	router := NewReadOnlyRouter(staticFS, nil, nil, nil, AuthConfig{BasePath: "/usage"}, nil, "/usage", TutorialPDFConfig{Path: pdfPath})

	for _, testCase := range []struct {
		path       string
		statusCode int
		contains   string
	}{
		{path: "/usage/", statusCode: http.StatusOK, contains: `window.__TUTORIAL_PDF_URL__ = "/usage/api/v1/tutorial.pdf?v=`},
		{path: "/usage/dashboard", statusCode: http.StatusOK, contains: `window.__APP_BASE_PATH__ = "/usage";`},
		{path: "/usage/assets/app.js", statusCode: http.StatusOK, contains: "console.log('ok')"},
		{path: "/usage/missing.html", statusCode: http.StatusOK, contains: `window.__APP_BASE_PATH__ = "/usage";`},
		{path: "/foo", statusCode: http.StatusNotFound},
		{path: "/assets/app.js", statusCode: http.StatusNotFound},
		{path: "/usage/api/unknown", statusCode: http.StatusNotFound},
	} {
		resp := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, testCase.path, nil)
		router.ServeHTTP(resp, req)
		if resp.Code != testCase.statusCode {
			t.Fatalf("expected %s to return %d, got %d", testCase.path, testCase.statusCode, resp.Code)
		}
		if testCase.contains != "" && !contains(resp.Body.String(), testCase.contains) {
			t.Fatalf("expected %s response to contain %q, got %s", testCase.path, testCase.contains, resp.Body.String())
		}
	}
}

func TestCleanURLPathUsesSlashSemantics(t *testing.T) {
	if cleaned := cleanURLPath("/usage//dashboard/../assets/app.js"); cleaned != "/usage/assets/app.js" {
		t.Fatalf("expected slash-normalized URL path, got %q", cleaned)
	}
}

func TestStaticAssetPathRejectsBackslashTraversal(t *testing.T) {
	if _, ok := staticAssetPath(`/..\.env`); ok {
		t.Fatal("expected backslash traversal path to be rejected")
	}
}

func TestRootStaticRouteInjectsEmptyBasePath(t *testing.T) {
	staticFS := testStaticFS(t, map[string]string{
		"index.html": `<html><head><script>window.__APP_BASE_PATH__ = "__APP_BASE_PATH__"; window.__TUTORIAL_PDF_URL__ = "__TUTORIAL_PDF_URL__";</script></head><body>app</body></html>`,
	})

	router := NewReadOnlyRouter(staticFS, nil, nil, nil, AuthConfig{}, nil, "")
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
	if !contains(resp.Body.String(), `window.__APP_BASE_PATH__ = "";`) {
		t.Fatalf("expected injected empty base path, got %s", resp.Body.String())
	}
	if !contains(resp.Body.String(), `window.__TUTORIAL_PDF_URL__ = "";`) {
		t.Fatalf("expected injected empty tutorial URL, got %s", resp.Body.String())
	}
}

func TestTutorialPDFRouteServesConfiguredPDFInline(t *testing.T) {
	pdfBytes := []byte("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n")
	pdfPath := filepath.Join(t.TempDir(), "guidance.pdf")
	if err := os.WriteFile(pdfPath, pdfBytes, 0o600); err != nil {
		t.Fatalf("write pdf: %v", err)
	}

	router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", TutorialPDFConfig{Path: pdfPath})
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tutorial.pdf", nil)
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", resp.Code, resp.Body.String())
	}
	if got := resp.Header().Get("Content-Type"); got != "application/pdf" {
		t.Fatalf("expected PDF content type, got %q", got)
	}
	if got := resp.Header().Get("Content-Disposition"); !contains(got, "inline") || !contains(got, "guidance.pdf") {
		t.Fatalf("expected inline PDF content disposition, got %q", got)
	}
	if got := resp.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("expected PDF response to bypass cache, got %q", got)
	}
	if got := resp.Header().Get("Pragma"); got != "no-cache" {
		t.Fatalf("expected PDF response pragma no-cache, got %q", got)
	}
	if resp.Body.String() != string(pdfBytes) {
		t.Fatalf("unexpected PDF body: %q", resp.Body.String())
	}
}

func TestTutorialPDFURLIncludesPDFModificationVersion(t *testing.T) {
	tempDir := t.TempDir()
	pdfPath := filepath.Join(tempDir, "guidance.pdf")
	if err := os.WriteFile(pdfPath, []byte("%PDF-1.7\n%%EOF\n"), 0o600); err != nil {
		t.Fatalf("write pdf: %v", err)
	}
	modTime := time.Date(2026, 6, 1, 10, 11, 12, 0, time.UTC)
	if err := os.Chtimes(pdfPath, modTime, modTime); err != nil {
		t.Fatalf("set pdf mtime: %v", err)
	}

	got := tutorialPDFURL("/usage", TutorialPDFConfig{Path: pdfPath})

	want := "/usage/api/v1/tutorial.pdf?v=1780308672000000000"
	if got != want {
		t.Fatalf("expected tutorial URL %q, got %q", want, got)
	}
}

func TestTutorialPDFRouteRequiresAdminSessionWhenAuthEnabled(t *testing.T) {
	pdfPath := filepath.Join(t.TempDir(), "guidance.pdf")
	if err := os.WriteFile(pdfPath, []byte("%PDF-1.7\n%%EOF\n"), 0o600); err != nil {
		t.Fatalf("write pdf: %v", err)
	}
	authConfig := AuthConfig{Enabled: true, LoginPassword: "secret", SessionTTL: time.Hour}
	router := NewReadOnlyRouter(nil, nil, nil, nil, authConfig, NewAuthHandler(authConfig, auth.NewSessionManager(time.Hour)), "", TutorialPDFConfig{Path: pdfPath})

	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tutorial.pdf", nil)
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", resp.Code, resp.Body.String())
	}
}

func TestTutorialPDFRouteReturnsNotFoundWhenUnsetOrMissing(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		config TutorialPDFConfig
	}{
		{name: "unset", config: TutorialPDFConfig{}},
		{name: "missing", config: TutorialPDFConfig{Path: filepath.Join(t.TempDir(), "missing.pdf")}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			router := NewReadOnlyRouter(nil, nil, nil, nil, AuthConfig{}, nil, "", testCase.config)
			resp := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/tutorial.pdf", nil)
			router.ServeHTTP(resp, req)

			if resp.Code != http.StatusNotFound {
				t.Fatalf("expected status 404, got %d body=%s", resp.Code, resp.Body.String())
			}
		})
	}
}

func TestStaticHTMLResponsesBypassCache(t *testing.T) {
	staticFS := testStaticFS(t, map[string]string{
		"index.html":    `<html><head><script>window.__APP_BASE_PATH__ = "__APP_BASE_PATH__";</script></head><body>app</body></html>`,
		"assets/app.js": "console.log('ok')",
	})

	router := NewReadOnlyRouter(staticFS, nil, nil, nil, AuthConfig{}, nil, "/usage")
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/usage/dashboard", nil)
	router.ServeHTTP(resp, req)

	if got := resp.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("expected HTML Cache-Control no-store, got %q", got)
	}
}

func TestStaticAssetResponsesUseLongCache(t *testing.T) {
	staticFS := testStaticFS(t, map[string]string{
		"index.html":    `<html><head><script>window.__APP_BASE_PATH__ = "__APP_BASE_PATH__";</script></head><body>app</body></html>`,
		"assets/app.js": "console.log('ok')",
	})

	router := NewReadOnlyRouter(staticFS, nil, nil, nil, AuthConfig{}, nil, "/usage")
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/usage/assets/app.js", nil)
	router.ServeHTTP(resp, req)

	if got := resp.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("expected asset Cache-Control immutable cache, got %q", got)
	}
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && (func() bool { return stringContains(s, sub) })())
}

func stringContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
