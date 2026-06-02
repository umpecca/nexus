# Nexus QuickConnect Publishing Specification

**Spec version:** 1.0
**Status:** Stable (implemented in Nexus task T_107)

QuickConnect is Nexus's simple HTTP publishing target. When a user chooses
**File → Publish as HTML over QuickConnect…**, Nexus renders the current
document to a single self-contained HTML file and sends it to a user-configured
HTTP endpoint with one `POST` request.

This document is the contract a receiving server must implement. It is intended
for anyone building a server that accepts QuickConnect pushes from Nexus.

---

## 1. Overview

- Transport: a single HTTP `POST` per publish.
- Payload: one self-contained HTML document (images, fonts, and Mermaid diagrams
  are inlined as base64), sent as the raw request body.
- Authentication: a bearer token chosen by the user and verified by your server.
- Destination on the server: a user-supplied path string, sent in a request
  header. Your server decides what the path means (where to store and/or serve
  the page).

Nexus is only the client. It does not bundle a server; you provide the endpoint.

---

## 2. The user-facing fields

The QuickConnect dialog has three fields, all saved per OS profile so they
pre-fill next time:

| Field | Maps to | Notes |
| --- | --- | --- |
| **Endpoint URL** | The request URL | Used verbatim. The path is **not** appended to it. |
| **Path** | `X-QuickConnect-Path` header | Free-form string; your server interprets it. |
| **Bearer token** | `Authorization: Bearer <token>` | Verified by your server. Stored in local settings. |

---

## 3. Request

| | |
| --- | --- |
| **Method** | `POST` |
| **URL** | Exactly the Endpoint URL field, unchanged. |
| **Body** | The raw self-contained HTML document, UTF-8. A single file with all assets inlined as base64, so it can be several megabytes. Not form-encoded, not chunked. |

### Headers Nexus sends

```
Content-Type: text/html; charset=utf-8
Authorization: Bearer <token>
X-QuickConnect-Path: <path>
```

- `Content-Length` is added automatically by the HTTP client.
- `Authorization` is **always** present. If the user left the token blank, the
  header is literally `Authorization: Bearer ` with an empty credential — reject
  that case.
- `X-QuickConnect-Path` is the Path field, whitespace-trimmed and otherwise
  verbatim. Nexus does **not** URL-encode it or append it to the URL. Keep it to
  ASCII, since it is an HTTP header value.

---

## 4. Response — success

- **Any `2xx`** status is treated as a successful publish.
- The response body is optional. It is used only to show the user a clickable
  link to the published page. Nexus reads the body and, in this order:
  1. Parses it as JSON and uses a `url` string field, if present:
     `{"url":"https://example.com/docs/my-doc.html"}`
  2. Otherwise, if the entire body is a bare `http(s)://…` URL, uses that.
  3. Otherwise (empty body or anything else) shows "Published" with no link.

Returning `{"url":"…"}` (or a bare URL) gives the user a "Copy URL" control.
Returning an empty `200` is perfectly valid.

---

## 5. Response — failure

- **Any non-`2xx`** status is treated as a failure.
- Nexus shows the user the **status code**, the **status text**, and the
  **first 200 characters of the response body**.
- Put a short human-readable reason in the body (for example `invalid token` or
  `unknown path`). Use conventional codes — `401` for a bad token, `400` for a
  missing/invalid path, `5xx` for server errors.

---

## 6. Timeouts and limits

- Nexus aborts the request after **30 seconds**. Accept the upload and respond
  within that window.
- There are **no retries**. Each publish is one `POST` carrying the full
  document. Nexus does not diff, resume, or chunk.

---

## 7. Security

- The bearer token is whatever the user typed. **You** define and verify it;
  Nexus does not validate it.
- Prefer an **HTTPS** endpoint. The token and the entire document are sent in the
  request, so a plain-HTTP endpoint exposes both in transit.
- Treat the `X-QuickConnect-Path` value as untrusted input. If you map it to a
  filesystem path, clean it and confirm it stays within your publish root to
  avoid path traversal (`../`) escapes. See the reference server below.

---

## 8. Example request

```http
POST /quickconnect HTTP/1.1
Host: example.com
Content-Type: text/html; charset=utf-8
Authorization: Bearer s3cr3t-token
X-QuickConnect-Path: docs/my-doc.html
Content-Length: 48213

<!doctype html><html>…fully inlined document…</html>
```

## 9. Testing with curl

```bash
curl -i -X POST https://example.com/quickconnect \
  -H "Content-Type: text/html; charset=utf-8" \
  -H "Authorization: Bearer s3cr3t-token" \
  -H "X-QuickConnect-Path: docs/my-doc.html" \
  --data-binary @page.html
```

---

## 10. Reference server (Go)

A minimal receiver that verifies the token, safely resolves the path under a
publish root, stores the HTML, and returns a page URL.

```go
package main

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const expectedToken = "s3cr3t-token" // verify however you like
var publishRoot = "./published"      // where pages are stored/served

func handlePublish(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Bearer token check.
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if subtle.ConstantTimeCompare([]byte(token), []byte(expectedToken)) != 1 {
		http.Error(w, "invalid token", http.StatusUnauthorized) // 401 -> shown to user
		return
	}

	// Path header, sanitized so it cannot escape publishRoot.
	rel := strings.TrimLeft(r.Header.Get("X-QuickConnect-Path"), "/")
	if rel == "" {
		http.Error(w, "missing X-QuickConnect-Path", http.StatusBadRequest)
		return
	}
	dest := filepath.Join(publishRoot, filepath.Clean("/"+rel))
	if !strings.HasPrefix(dest, filepath.Clean(publishRoot)+string(os.PathSeparator)) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body) // the raw HTML document
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile(dest, body, 0o644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Optional: return a URL so Nexus shows a clickable "Copy URL".
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"url": "https://example.com/" + rel,
	})
}

func main() {
	http.HandleFunc("/quickconnect", handlePublish)
	http.Handle("/", http.FileServer(http.Dir(publishRoot))) // serve published pages
	_ = http.ListenAndServe(":8080", nil)                    // put TLS termination in front
}
```

---

## 11. Conventions (subject to change)

These choices are Nexus conventions rather than external standards, noted so
server authors know what is fixed and what could move in a future spec version:

- The destination **path is carried in the `X-QuickConnect-Path` header**, not
  appended to the URL. (An alternative `POST {url}/{path}` routing scheme is not
  used.)
- The header name is **`X-QuickConnect-Path`**.
- The document is sent as the **raw request body** with `text/html`, not wrapped
  in JSON or multipart form data.

If these change, this document's spec version will be incremented.
