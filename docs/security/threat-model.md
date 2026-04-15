# VRLingo — Threat Model

**Version**: 1.0  
**Date**: April 2026  
**Author**: Mohammed (Security & Network)  
**Scope**: Full-stack VRLingo application (Fastify backend + Unity VR client)  
**Methodology**: STRIDE per component  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Assets Inventory](#2-assets-inventory)
3. [Entry Points](#3-entry-points)
4. [Trust Boundaries](#4-trust-boundaries)
5. [STRIDE Analysis per Component](#5-stride-analysis-per-component)
6. [Risk Matrix](#6-risk-matrix)
7. [Mitigation Roadmap](#7-mitigation-roadmap)
8. [Open Questions for the Team](#8-open-questions-for-the-team)

---

## 1. System Overview

VRLingo is a VR language-learning application. Users put on a VR headset, authenticate, and practice speaking a foreign language with an AI tutor in real time. The system has four main components:

```
+-------------------+         HTTPS / WSS          +--------------------+
|                   | ---------------------------> |                    |
|   Unity VR Client |                              |  Fastify Backend   |
|   (Meta Quest)    | <--------------------------- |  (Node.js 22)      |
|                   |      JSON + PCM16 audio       |                    |
+-------------------+                              +--------+-----------+
                                                            |
                                               +------------+------------+
                                               |                         |
                                       +-------v-------+       +--------v--------+
                                       |   PostgreSQL   |       |  OpenAI Realtime|
                                       |   (Prisma ORM) |       |  API (GPT-4o)   |
                                       +----------------+       +-----------------+
```

### Current tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| VR Client | Unity 6 + C# | Meta Quest, NativeWebSocket, HttpClient |
| Backend framework | Fastify 5 (TypeScript) | Node.js 22, auto-loaded plugins |
| Auth | @fastify/jwt (RS256 prod / HS256 test) + bcrypt | Access (15 min) + Refresh (7 days) tokens |
| Database | PostgreSQL 16 via Prisma ORM | Users, auth tokens, conversations, AI usage logs |
| AI | OpenAI Realtime API (gpt-4o-mini) | Server-side WebSocket relay |
| Infra | Docker Compose (dev) | No production deployment yet |

---

## 2. Assets Inventory

These are the things we need to protect. Listed by sensitivity (highest first):

| # | Asset | Where stored | Sensitivity | Why it matters |
|---|-------|-------------|-------------|----------------|
| A1 | **User passwords** | PostgreSQL (`users.passwordHash`) | CRITICAL | Bcrypt-hashed, but source of identity |
| A2 | **JWT private key** | File system (`config/jwt/private.pem`) | CRITICAL | Signing key — compromise = full impersonation |
| A3 | **OpenAI API key** | Environment variable (`CHATGPT_API_KEY`) | CRITICAL | Financial exposure — direct billing |
| A4 | **Database credentials** | docker-compose.yml / .env | HIGH | Full DB access |
| A5 | **Refresh tokens** | PostgreSQL (`auth_tokens` table) | HIGH | 7-day validity, can mint new access tokens |
| A6 | **Access tokens (JWT)** | Client memory / network transit | HIGH | 15-min validity, grants API access |
| A7 | **User audio recordings** | Network transit (not persisted as audio) | HIGH | Voice biometric data, GDPR-sensitive |
| A8 | **Conversation transcripts** | PostgreSQL (`messages` table) | MEDIUM | Personal data — language practice content |
| A9 | **User settings** | PostgreSQL (`user_settings` table) | LOW | Language preferences |
| A10 | **AI usage/billing logs** | PostgreSQL (`ia_usage_logs` table) | LOW | Token counts, cost tracking |

---

## 3. Entry Points

Every way an attacker (or legitimate user) can interact with the system:

| # | Entry Point | Protocol | Auth Required? | Current Status |
|---|------------|----------|---------------|----------------|
| EP1 | `POST /auth/login` | HTTP | No (public) | Exists |
| EP2 | `POST /auth/register` | HTTP | No (public) | Exists |
| EP3 | `POST /auth/refresh` | HTTP | No (takes refresh token in body) | Exists |
| EP4 | `GET /api/*` (all API routes) | HTTP | Yes (JWT via `onRequest` hook) | Exists |
| EP5 | `WS /api/realtime/session` | WebSocket | Yes (JWT via `preHandler`) | Exists |
| EP6 | `GET /docs` | HTTP | No (public) | Swagger UI — exists |
| EP7 | `POST /api/transcribe` | HTTP | **No (public!)** | Exists — **RISK** |
| EP8 | `POST /api/tts` | HTTP | **No (public!)** | Exists — **RISK** |
| EP9 | `POST /api/conversation` | HTTP | **No (public!)** | Exists — **RISK** |
| EP10 | `GET /api/realtime/connect-info` | HTTP | **No (public!)** | Exists — info only |
| EP11 | PostgreSQL port 5433 | TCP | Password | Exposed in docker-compose |

---

## 4. Trust Boundaries

A trust boundary is where data crosses from one trust level to another:

```
TRUST BOUNDARY 1: Internet <---> Backend API
   - All HTTP/WS traffic from the VR client
   - Currently: NO TLS (http:// and ws://)
   - Currently: NO reverse proxy, NO WAF

TRUST BOUNDARY 2: Backend <---> PostgreSQL
   - Prisma ORM queries
   - Currently: plaintext connection, no SSL
   - DB credentials hardcoded in docker-compose.yml

TRUST BOUNDARY 3: Backend <---> OpenAI API
   - Server-to-server WebSocket (wss://)
   - API key in Authorization header
   - User audio and transcripts cross this boundary

TRUST BOUNDARY 4: VR Client <---> Local Device
   - Hard-coded test credentials in source code
   - No secure token storage on device
```

---

## 5. STRIDE Analysis per Component

### How to read this section

For each component, we analyze six threat categories:

| Letter | Category | Question |
|--------|---------|----------|
| **S** | Spoofing | Can someone pretend to be someone else? |
| **T** | Tampering | Can someone modify data they shouldn't? |
| **R** | Repudiation | Can someone deny they did something? |
| **I** | Information Disclosure | Can someone access data they shouldn't see? |
| **D** | Denial of Service | Can someone make the system unavailable? |
| **E** | Elevation of Privilege | Can someone gain higher access than allowed? |

---

### 5.1 VR Client (Unity)

| Cat. | Threat ID | Threat | Current Status | Severity |
|------|-----------|--------|---------------|----------|
| **S** | T-C1 | Hard-coded credentials (`test@vrlingo.local` / `test1234`) in `AuthState.cs` allow anyone with the APK to authenticate | **VULNERABLE** — credentials in source | HIGH |
| **S** | T-C2 | No Meta/Oculus account integration — no real user identity verification on VR device | Not implemented yet (stub exists) | MEDIUM |
| **T** | T-C3 | HTTP (not HTTPS) traffic can be intercepted and modified by man-in-the-middle | **VULNERABLE** — `http://` hardcoded | HIGH |
| **I** | T-C4 | JWT token sent as URL query parameter (`?token=xxx`) in WebSocket connection — visible in logs, proxy caches, browser history | **VULNERABLE** — token in URL | MEDIUM |
| **I** | T-C5 | Audio data (user's voice) sent unencrypted over `ws://` | **VULNERABLE** — no TLS | HIGH |
| **D** | T-C6 | No connection retry limits — client could flood reconnection attempts | Not handled | LOW |

---

### 5.2 Authentication System (Backend)

| Cat. | Threat ID | Threat | Current Status | Severity |
|------|-----------|--------|---------------|----------|
| **S** | T-A1 | No rate limiting on `/auth/login` — allows brute-force password attacks | **VULNERABLE** — no rate limit | HIGH |
| **S** | T-A2 | No account lockout after failed login attempts | **VULNERABLE** | MEDIUM |
| **S** | T-A3 | Refresh tokens not rotated on use — stolen token can be reused indefinitely for 7 days | **VULNERABLE** — no rotation | HIGH |
| **T** | T-A4 | JWT `sub` claim trusted without additional validation — if a user is deleted, their token remains valid until expiry | Minor risk (15 min window) | LOW |
| **R** | T-A5 | No audit log for authentication events (login, failed login, token refresh, logout) | **MISSING** — no logging to DB | MEDIUM |
| **I** | T-A6 | Test mode uses `HS256` with secret `"testsecret"` — if test mode accidentally runs in prod, all tokens are forgeable | Conditional risk | MEDIUM |
| **I** | T-A7 | Password minimum length is only 4 characters (in `RegisterUserRequestDto`) | **WEAK** — industry standard is 8+ | MEDIUM |
| **E** | T-A8 | `role` field exists in JWT payload and DB but no role-based access control is implemented — all authenticated users have equal access | **MISSING** — RBAC not enforced | MEDIUM |

---

### 5.3 API Routes (Backend)

| Cat. | Threat ID | Threat | Current Status | Severity |
|------|-----------|--------|---------------|----------|
| **S** | T-R1 | `/api/transcribe`, `/api/tts`, `/api/conversation` are PUBLIC (no auth) — anyone can use your OpenAI API key | **VULNERABLE** — in `PUBLIC_API_PATHS` | CRITICAL |
| **T** | T-R2 | No input size limits on API request bodies — large payloads could cause memory issues | **MISSING** — Fastify default is 1MB | MEDIUM |
| **T** | T-R3 | No CORS configuration — any website could make requests to the API | **MISSING** — no `@fastify/cors` | MEDIUM |
| **I** | T-R4 | Swagger UI (`/docs`) is publicly accessible — exposes full API documentation to attackers | **OPEN** — no auth on /docs | LOW |
| **I** | T-R5 | Error responses may leak stack traces or internal details (Fastify logger in production) | Partially mitigated by `@fastify/sensible` | LOW |
| **D** | T-R6 | No rate limiting on any API endpoint — vulnerable to API abuse and cost amplification (OpenAI billing) | **VULNERABLE** | HIGH |
| **D** | T-R7 | No request size limit on audio upload endpoints | **MISSING** | MEDIUM |

---

### 5.4 Realtime WebSocket (Backend)

| Cat. | Threat ID | Threat | Current Status | Severity |
|------|-----------|--------|---------------|----------|
| **S** | T-W1 | WebSocket authentication via query parameter `?token=xxx` — token visible in access logs | **WEAK** — unavoidable on Android but should be over TLS | MEDIUM |
| **T** | T-W2 | Client messages relayed directly to OpenAI after JSON parse — no schema validation on content | **WEAK** — only JSON parse check | MEDIUM |
| **D** | T-W3 | Session limits exist (5 min, 20 turns) but no per-user concurrent session limit — user could open many parallel sessions | **MISSING** | HIGH |
| **D** | T-W4 | No message rate limiting within a WebSocket session — client could flood audio chunks | **MISSING** | MEDIUM |
| **I** | T-W5 | User audio transcripts stored permanently — no retention policy or auto-deletion | **MISSING** — GDPR issue | MEDIUM |

---

### 5.5 Database (PostgreSQL)

| Cat. | Threat ID | Threat | Current Status | Severity |
|------|-----------|--------|---------------|----------|
| **I** | T-D1 | Database credentials hardcoded in `docker-compose.yml` (`vrlingo` / `vrlingo_pass`) | **VULNERABLE** — should be in secrets | HIGH |
| **I** | T-D2 | PostgreSQL port 5433 exposed to host network | **RISK** — acceptable in dev, not in prod | MEDIUM |
| **I** | T-D3 | No encryption at rest — database files are plaintext on disk | **MISSING** | MEDIUM |
| **I** | T-D4 | No SSL/TLS between Fastify and PostgreSQL | **MISSING** | LOW (internal network) |
| **T** | T-D5 | No database backup strategy or disaster recovery plan | **MISSING** | HIGH |
| **E** | T-D6 | Single database user with full privileges — no least-privilege separation | **MISSING** | LOW |

---

### 5.6 Infrastructure & Deployment

| Cat. | Threat ID | Threat | Current Status | Severity |
|------|-----------|--------|---------------|----------|
| **I** | T-I1 | No HTTPS — all traffic is plaintext | **VULNERABLE** — no TLS anywhere | CRITICAL |
| **I** | T-I2 | No security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) | **MISSING** — no `@fastify/helmet` | MEDIUM |
| **D** | T-I3 | No reverse proxy (Nginx/Caddy) — Fastify directly exposed | **MISSING** | MEDIUM |
| **D** | T-I4 | No WAF or DDoS protection | **MISSING** | MEDIUM |
| **T** | T-I5 | Docker image copies source code (`COPY --from=builder /app/src ./src`) — unnecessary attack surface | **WEAK** — should only copy `dist/` | LOW |
| **T** | T-I6 | No dependency vulnerability scanning in CI pipeline | **PARTIAL** — Snyk branches exist but not integrated | MEDIUM |

---

## 6. Risk Matrix

Each threat is rated on two axes:
- **Likelihood**: How easy/probable is exploitation? (1=Unlikely, 2=Possible, 3=Likely)
- **Impact**: What's the damage? (1=Low, 2=Medium, 3=High)
- **Risk Score** = Likelihood x Impact

### Critical Risks (Score 9) — Fix immediately

| ID | Threat | L | I | Score |
|----|--------|---|---|-------|
| T-R1 | Public AI endpoints (OpenAI API key abuse) | 3 | 3 | **9** |
| T-I1 | No HTTPS/TLS anywhere | 3 | 3 | **9** |

### High Risks (Score 6) — Fix as next priority

| ID | Threat | L | I | Score |
|----|--------|---|---|-------|
| T-A1 | No rate limiting on login (brute force) | 3 | 2 | **6** |
| T-A3 | Refresh token not rotated | 2 | 3 | **6** |
| T-C1 | Hard-coded credentials in VR client | 2 | 3 | **6** |
| T-C3 | HTTP traffic — MITM possible | 3 | 2 | **6** |
| T-C5 | Audio sent unencrypted | 3 | 2 | **6** |
| T-D1 | DB credentials in docker-compose | 2 | 3 | **6** |
| T-R6 | No API rate limiting (cost amplification) | 3 | 2 | **6** |
| T-W3 | No concurrent session limit | 2 | 3 | **6** |
| T-D5 | No backup strategy | 2 | 3 | **6** |

### Medium Risks (Score 3-4) — Fix before launch

| ID | Threat | L | I | Score |
|----|--------|---|---|-------|
| T-A5 | No auth audit logging | 2 | 2 | **4** |
| T-A7 | Weak password policy (4 chars) | 2 | 2 | **4** |
| T-A8 | RBAC not enforced | 2 | 2 | **4** |
| T-C4 | JWT in URL query parameter | 2 | 2 | **4** |
| T-R3 | No CORS configuration | 2 | 2 | **4** |
| T-W5 | No data retention policy | 2 | 2 | **4** |
| T-I2 | No security headers | 2 | 2 | **4** |
| T-I6 | No dependency scanning in CI | 2 | 2 | **4** |
| T-A6 | Test secret in test mode | 1 | 3 | **3** |
| T-R2 | No input size limits | 1 | 3 | **3** |
| T-W2 | No WS message schema validation | 2 | 2 | **4** |
| T-D3 | No encryption at rest | 1 | 3 | **3** |

### Low Risks (Score 1-2) — Address when possible

| ID | Threat | L | I | Score |
|----|--------|---|---|-------|
| T-A4 | Deleted user token valid 15 min | 1 | 2 | **2** |
| T-R4 | Swagger UI public | 1 | 1 | **1** |
| T-R5 | Error message leakage | 1 | 2 | **2** |
| T-I5 | Source code in Docker image | 1 | 1 | **1** |
| T-D6 | Single DB user | 1 | 2 | **2** |
| T-C6 | No reconnection limits | 1 | 1 | **1** |

---

## 7. Mitigation Roadmap

Ordered by priority — work top-to-bottom:

| Priority | Task | Threats Addressed | What to Do |
|----------|------|-------------------|------------|
| **P0 — Immediate** | Fix public endpoints | **T-R1** | Remove `/api/transcribe`, `/api/tts`, `/api/conversation` from `PUBLIC_API_PATHS`. Require JWT for all AI-consuming endpoints. |
| **P1 — Critical** | Security headers + rate limiting | T-A1, T-R6, T-I2, T-R3 | Install `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`. Configure CSP, HSTS. Add rate limits (login: 5/min, API: 100/min). |
| **P1 — Critical** | Strengthen auth | T-A3, T-A7, T-A2 | Implement refresh token rotation (revoke old on use, issue new). Increase password minimum to 8 chars + complexity rules. Add account lockout after 5 failures. |
| **P2 — High** | HTTPS + Nginx | **T-I1**, T-C3, T-C5, T-I3 | Set up Nginx reverse proxy with Let's Encrypt. Force HTTPS/WSS. Configure Nginx rate limiting as second layer. |
| **P2 — High** | DoS defense | T-I4, T-W3, T-W4 | WAF rules via Nginx. Per-user concurrent session limit (max 2). WebSocket message throttling. |
| **P3 — Medium** | Vulnerability scanning | T-I6 | Integrate Snyk into CI pipeline (branches already exist). Add container image scanning with Clair/Trivy. Auto-update via Watchtower. |
| **P3 — Medium** | RBAC + audit logging | T-A8, T-A5 | Implement role-based middleware. Log all auth events to a dedicated audit table. |
| **P3 — Medium** | Static analysis | T-W2, T-R2, T-R5 | SonarQube/Checkmarx integration. Fix input validation gaps. |
| **P4 — Before launch** | Encryption & backups | T-D1, T-D3, T-D5 | Move secrets to vault/env. Enable PostgreSQL encryption at rest. Set up automated backups. |
| **P4 — Before launch** | Privacy & IRP | T-W5 | Publish privacy policy. Implement data retention auto-cleanup. Write incident response runbook. |
| **P5 — Final** | Pentest & final audit | ALL | Execute penetration testing. Verify all mitigations. Final security report. |

---

## 8. Open Questions for the Team

These questions need team input before proceeding. Please discuss and decide:

### Question 1: Public AI Endpoints (CRITICAL)

`/api/transcribe`, `/api/tts`, and `/api/conversation` are currently **public** (no authentication required). This means **anyone who knows the URL can use our OpenAI API key** and generate costs.

> **Decision needed**: Can we add JWT authentication to these endpoints immediately, or does the VR client currently rely on them being public?  
> **Recommended action**: Add auth now, update VR client to send JWT header.

### Question 2: Hard-coded Credentials in VR Client

`AuthState.cs` contains `EMAIL = "test@vrlingo.local"` and `PASSWORD = "test1234"`. This is fine for local dev but dangerous if an APK is distributed.

> **Decision needed**: When should we switch to a proper login screen or Meta account integration?

### Question 3: Token in WebSocket URL

The VR client sends the JWT as `?token=xxx` in the WebSocket URL because Android NativeWebSocket doesn't support custom headers. This is a known limitation.

> **Decision needed**: Accept this risk (mitigated by TLS) or implement first-message authentication (send token as first WS message instead)?

### Question 4: Database Credentials

`docker-compose.yml` has hardcoded DB credentials (`vrlingo` / `vrlingo_pass`). For dev this is fine, but we need a secrets strategy for production.

> **Decision needed**: Docker secrets, environment variables from a `.env` file (gitignored), or a vault solution?

### Question 5: Swagger UI in Production

`/docs` exposes the full API documentation including all endpoints and schemas.

> **Decision needed**: Disable Swagger in production, or protect it behind authentication?

---

*This document will be updated as threats are mitigated. Each priority level should close the corresponding threat IDs.*
