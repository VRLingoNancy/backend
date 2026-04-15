# VRLingo — Current Security Audit Notes

**Date**: April 2026  
**Auditor**: Mohammed (Security & Network)  
**Branch audited**: `origin/temp/dev-working` (backend), `origin/network` (vr-client)  
**Purpose**: Quick security assessment of the existing codebase before starting the security roadmap.  

---

## Executive Summary

The application has a **functional authentication system** with JWT + bcrypt, which is a solid foundation. However, there are **several critical and high-severity issues** that need immediate attention before any production deployment. The most urgent: **three AI-powered endpoints are completely public**, meaning anyone can use our OpenAI API key.

### Overall Security Score: 3/10

| Category | Score | Comment |
|----------|-------|---------|
| Authentication | 6/10 | JWT + bcrypt is good, but weak password policy and no rate limiting |
| Authorization | 2/10 | Auth guard exists but no RBAC, some critical routes are public |
| Transport security | 1/10 | No TLS anywhere |
| Data protection | 3/10 | Bcrypt for passwords, but nothing else encrypted |
| Infrastructure | 3/10 | Docker setup exists, but hardcoded secrets, no reverse proxy |
| Input validation | 6/10 | Zod schemas exist, but coverage is incomplete |
| Logging & monitoring | 4/10 | Fastify logger active, but no audit trail for security events |

---

## Finding #1: Public AI Endpoints (CRITICAL)

**File**: `src/main/routes/api/index.ts`  
**Lines**: 12-18

```typescript
const PUBLIC_API_PATHS = new Set([
  '/api/ping',
  '/api/test',
  '/api/transcribe',  // <-- Uses OpenAI API, no auth required!
  '/api/tts',          // <-- Uses OpenAI API, no auth required!
  '/api/conversation', // <-- Uses OpenAI API, no auth required!
  '/api/realtime/connect-info',
]);
```

**Impact**: Anyone who discovers these endpoints can:
- Use our OpenAI API key to transcribe audio (`/api/transcribe`)
- Generate text-to-speech audio (`/api/tts`)
- Have full AI conversations (`/api/conversation`)
- Each call costs real money (OpenAI billing)

**Recommendation**: Remove `transcribe`, `tts`, and `conversation` from `PUBLIC_API_PATHS` immediately. These should require JWT authentication.

**Effort**: 15 minutes (one line change + VR client update to send JWT).

---

## Finding #2: No TLS / HTTPS (CRITICAL)

**Files**: `server.ts`, VR client `AuthState.cs`

Backend listens on plain HTTP:
```typescript
await server.listen({ port, host: '0.0.0.0' });
```

VR client connects via plain HTTP/WS:
```csharp
public static readonly string httpUrl = $"http://{apiUri}";
public static readonly string wsUrl = $"ws://{apiUri}";
```

**Impact**: All traffic is unencrypted — passwords, JWT tokens, voice audio, and AI responses can be intercepted by anyone on the network (coffee shop, university WiFi, ISP).

**Recommendation**: 
1. Set up Nginx reverse proxy with Let's Encrypt certificates
2. Update VR client to use `https://` and `wss://`
3. Configure HSTS header

**Effort**: 4 hours (Nginx + Let's Encrypt + client update).

---

## Finding #3: Hard-coded Credentials in VR Client (HIGH)

**File**: `vr-client/Assets/Scripts/api/AuthState.cs`

```csharp
public static readonly string EMAIL = "test@vrlingo.local";
public static readonly string PASSWORD = "test1234";
```

**Impact**: Anyone who decompiles the APK (trivial with IL2CPP tools) gets valid credentials. If these match a real account, they have full access.

**Recommendation**: Replace with a proper login UI in VR. For now, at minimum move to environment/build configuration and ensure this account has no admin privileges.

---

## Finding #4: Weak Password Policy (HIGH)

**File**: `src/main/dtos/RegisterUserRequestDto.ts`

```typescript
password: z.string().min(4),
```

**Impact**: Passwords as short as 4 characters are accepted. Combined with no rate limiting on login (Finding #5), this makes brute-force attacks trivial.

**Recommendation**: Increase to minimum 8 characters. Consider adding:
- At least one uppercase letter
- At least one number
- Check against common password lists (e.g., `have-i-been-pwned` API)

---

## Finding #5: No Rate Limiting (HIGH)

**Files**: All routes

There is no rate limiting anywhere in the application:
- No `@fastify/rate-limit` plugin
- No Nginx/reverse proxy rate limiting
- No per-IP or per-user throttling

**Impact**:
- Brute-force attacks on `/auth/login` are unthrottled
- API abuse can generate unlimited OpenAI costs
- Denial of service by flooding endpoints

**Recommendation**: Install `@fastify/rate-limit` with these limits:

| Endpoint | Limit |
|----------|-------|
| `POST /auth/login` | 5 requests / minute / IP |
| `POST /auth/register` | 3 requests / hour / IP |
| `POST /auth/refresh` | 10 requests / minute / IP |
| `* /api/*` | 100 requests / minute / user |
| WebSocket connections | 2 concurrent / user |

---

## Finding #6: No Refresh Token Rotation (HIGH)

**File**: `src/main/routes/auth/refresh.ts`

When a refresh token is used, a new access token is generated BUT the same refresh token remains valid:

```typescript
// Current: only generates new access token
const accessToken = fastify.jwt.sign(
  { sub: user.id, role: user.role },
  { expiresIn: '15m' }
);
reply.send({ accessToken }); // <-- No new refresh token issued
```

**Impact**: If a refresh token is stolen, the attacker can use it for 7 days without the legitimate user knowing. There's no way to detect the theft because both parties use the same token.

**Recommendation**: Implement refresh token rotation:
1. On `/auth/refresh`, revoke the old refresh token
2. Issue a new refresh token alongside the new access token
3. If a revoked refresh token is ever used again, revoke ALL tokens for that user (indicates theft)

---

## Finding #7: Database Credentials Hardcoded (HIGH)

**File**: `docker-compose.yml`

```yaml
environment:
  POSTGRES_USER: vrlingo
  POSTGRES_PASSWORD: vrlingo_pass
  POSTGRES_DB: vrlingo_db
```

And repeated in the backend service:
```yaml
DATABASE_URL: postgresql://vrlingo:vrlingo_pass@postgres:5432/vrlingo_db
```

**Impact**: Anyone with access to the repository has database credentials. If docker-compose is used in production (which it shouldn't be for production databases), this is a direct database compromise.

**Recommendation**:
1. Use `.env` file (gitignored) for all credentials
2. Reference `${POSTGRES_PASSWORD}` in docker-compose.yml
3. For production: use Docker secrets or a secrets manager

---

## Finding #8: JWT Test Secret (MEDIUM)

**File**: `src/main/plugins/jwt.ts`

```typescript
if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
  fastify.register(import('@fastify/jwt'), {
    secret: 'testsecret',
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  });
  return;
}
```

**Impact**: If `NODE_ENV` is not set or accidentally set to `test` in production, anyone can forge valid JWTs with the known secret `testsecret`.

**Recommendation**: 
1. Add a startup check: if no PEM files found AND `NODE_ENV !== 'test'`, crash the server with a clear error
2. Log a warning when using HS256/test mode

---

## Finding #9: No CORS Configuration (MEDIUM)

**Impact**: Without CORS headers, the API behaves as follows:
- Browsers will block cross-origin requests (default Same-Origin Policy)
- But: the VR client uses `HttpClient` (not a browser), so CORS doesn't affect it
- However: if a web admin panel is added later, CORS will be needed
- A misconfigured CORS (e.g., `Access-Control-Allow-Origin: *`) is worse than no CORS

**Recommendation**: Install `@fastify/cors` with restrictive settings:
```typescript
fastify.register(cors, {
  origin: ['https://admin.vrlingo.com'], // Only trusted origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
});
```

---

## Finding #10: No Security Headers (MEDIUM)

**Impact**: Missing headers expose the application to various browser-based attacks (XSS, clickjacking, MIME sniffing). Less critical for a VR-only app but essential if web interfaces are added.

**Recommendation**: Install `@fastify/helmet`:
```typescript
fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
});
```

---

## Finding #11: Docker Image Contains Source Code (LOW)

**File**: `Dockerfile`

```dockerfile
COPY --from=builder /app/src ./src
```

The production Docker image contains the full TypeScript source code. This is unnecessary since the compiled JS is in `dist/`.

**Impact**: If the Docker image is compromised or leaked, the attacker gets source code for easier vulnerability discovery.

**Recommendation**: Remove the `src` copy. If `tsx` is needed at runtime (current `CMD`), switch to running the compiled output:
```dockerfile
CMD ["node", "dist/main/server.js"]
```

---

## Finding #12: No Concurrent WebSocket Session Limit (MEDIUM)

**File**: `src/main/routes/api/realtime/index.ts`

Each WebSocket session creates a new connection to OpenAI. There is a per-session guard (`SessionGuard`) limiting to 5 min / 20 turns, but no limit on how many sessions a single user can open simultaneously.

**Impact**: A malicious user could open 100 concurrent sessions, each generating OpenAI API costs.

**Recommendation**: Add a per-user session counter (in-memory Map or Redis):
```typescript
const activeSessions = new Map<string, number>();
// On connect: check if activeSessions.get(userId) < MAX_CONCURRENT_SESSIONS
// On disconnect: decrement
```

---

## Finding #13: Swagger UI Publicly Accessible (LOW)

**File**: `src/main/plugins/swagger.ts`

Swagger UI at `/docs` exposes:
- All endpoint URLs and methods
- Request/response schemas
- Authentication requirements (or lack thereof)

**Impact**: Helps attackers understand the API surface. Low impact since the API structure can also be discovered through network inspection.

**Recommendation**: Disable in production or add basic authentication:
```typescript
if (process.env.NODE_ENV !== 'production') {
  await fastify.register(swagger, { ... });
  await fastify.register(swaggerUi, { ... });
}
```

---

## Positive Findings (What's Already Good)

Not everything is bad! Here's what the team did well:

| # | What | Why It's Good |
|---|------|--------------|
| 1 | **RS256 JWT in production** | Asymmetric signing — private key never leaves the server |
| 2 | **bcrypt with 10 rounds** | Industry-standard password hashing |
| 3 | **Prisma ORM** | Parameterized queries — immune to SQL injection |
| 4 | **Zod validation** | Input validation on DTOs prevents most injection attacks |
| 5 | **Refresh token revocation** | Tokens can be revoked (column `revoked` exists and is checked) |
| 6 | **Session guard** | Prevents infinite AI conversation loops (5 min, 20 turns) |
| 7 | **onDelete: Cascade** | User deletion cascades to all related data (GDPR-friendly) |
| 8 | **UUID primary keys** | Non-sequential — prevents enumeration attacks |
| 9 | **Role field in schema** | Foundation for RBAC is already in the data model |
| 10 | **Docker multi-stage build** | Smaller image, build tools not in production |

---

## Priority Action List

Ordered by urgency — tackle top-to-bottom:

| Priority | Finding | Effort | Urgency |
|----------|---------|--------|---------|
| 1 | #1 — Fix public AI endpoints | 15 min | **Immediate** — do this first |
| 2 | #5 — Add rate limiting | 2h | Critical — before any public exposure |
| 3 | #4 — Strengthen password policy | 30 min | Critical |
| 4 | #6 — Implement refresh token rotation | 2h | Critical |
| 5 | #9 — CORS configuration | 30 min | Critical |
| 6 | #10 — Security headers | 30 min | Critical |
| 7 | #3 — Remove hardcoded creds from VR client | 2h | Critical (VR team) |
| 8 | #2 — Set up HTTPS | 4h | High — required before launch |
| 9 | #7 — Externalize DB credentials | 1h | High |
| 10 | #12 — Concurrent session limit | 1h | High |
| 11 | #8 — JWT test mode safety | 30 min | Medium |
| 12 | #11 — Clean Docker image | 15 min | Medium |
| 13 | #13 — Protect Swagger UI | 15 min | Medium |

---

*Next steps: Present these findings to the team, get approval on the priority list, then start implementing top-to-bottom.*
