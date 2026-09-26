# HTTP API

The gateway in `packages/mcp-gateway/src/server.ts` runs a plain Node `http` server — it does
not use a routing framework. Requests are matched by pathname inside `handleRequest`. The
server binds `0.0.0.0` so it is reachable from outside its container.

Base URL: `http://<host>:<port>` (default port `3080`).

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/sessions` | Create an audit session |
| `GET` | `/v1/sessions/:id/events` | Paginated event history for a session |
| `POST` | `/v1/sessions/:id/stop` | End a session and produce a final report |
| `POST` | `/v1/policies/validate` | Validate a `policy.yaml` document |
| `GET` | `/v1/stats` | Server status and connection counts |
| `GET` | `/v1/stream` | WebSocket upgrade for the live event stream |
| `GET` | `/` | Serves the dashboard (`index.html`) and other static assets |

## CORS

`OPTIONS` requests are answered before any route matching, so browser clients can issue
preflight requests. Credentials are permitted and the allowed headers include
`Content-Type` and `Authorization`.

## Static assets

Any unmatched `GET` is treated as a static file request. The site root resolves to
`index.html`, which is what makes the live dashboard available at the gateway's own port
rather than behind a separate web server.