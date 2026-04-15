# VRLingo — GDPR Policy & Consent Plan

**Version**: 1.0  
**Date**: April 2026  
**Author**: Mohammed (Security & Network)  
**Regulation**: RGPD / GDPR (EU Regulation 2016/679)  
**Application**: VRLingo — VR Language Learning Platform  

---

## Table of Contents

1. [Data Inventory](#1-data-inventory)
2. [Legal Basis per Processing Activity](#2-legal-basis-per-processing-activity)
3. [Consent Plan](#3-consent-plan)
4. [Data Subject Rights](#4-data-subject-rights)
5. [Data Retention Policy](#5-data-retention-policy)
6. [Privacy by Design Checklist](#6-privacy-by-design-checklist)
7. [Data Flow Diagram](#7-data-flow-diagram)
8. [Technical Implementation Plan](#8-technical-implementation-plan)
9. [Third-Party Data Processors](#9-third-party-data-processors)
10. [Decisions Needed from the Team](#10-decisions-needed-from-the-team)

---

## 1. Data Inventory

### What personal data does VRLingo collect?

| # | Data Category | Specific Data | Where Stored | Encrypted? | Retention |
|---|--------------|---------------|-------------|-----------|-----------|
| D1 | **Identity** | Email address | `users.email` (PostgreSQL) | No (plaintext) | Until account deletion |
| D2 | **Identity** | Username (optional) | `users.username` (PostgreSQL) | No (plaintext) | Until account deletion |
| D3 | **Authentication** | Password | `users.passwordHash` (PostgreSQL) | Yes (bcrypt hash, 10 rounds) | Until account deletion |
| D4 | **Authentication** | Refresh tokens | `auth_tokens.refreshToken` (PostgreSQL) | No (plaintext JWT) | 7 days, then stale |
| D5 | **Preferences** | Native language, study language, interface language | `user_settings` (PostgreSQL) | No | Until account deletion |
| D6 | **Voice data** | Raw audio (PCM16) | **Network transit only** — not stored on disk | No (plaintext over ws://) | Not persisted |
| D7 | **Conversation content** | Text transcripts of user speech | `messages` (PostgreSQL) | No | **Indefinite (no policy)** |
| D8 | **Conversation content** | AI responses (text) | `messages` (PostgreSQL) | No | **Indefinite (no policy)** |
| D9 | **Usage analytics** | Token counts, model used, timestamps | `ia_usage_logs` (PostgreSQL) | No | **Indefinite (no policy)** |
| D10 | **Technical** | IP address, user agent | `auth_tokens` (columns exist but not populated) | No | 7 days (with token) |
| D11 | **Technical** | Fastify request logs | Console / stdout | No | Session only (not persisted) |

### Key observations

- **Voice data (D6)** is the most sensitive — it's biometric data under GDPR Article 9. Although VRLingo doesn't store the raw audio, it does transit unencrypted AND the transcription (D7) is stored permanently.
- **Conversation transcripts (D7-D8)** have **no retention policy** — they accumulate forever.
- **Refresh tokens (D4)** are stored as plaintext JWT strings — they should be hashed.

---

## 2. Legal Basis per Processing Activity

GDPR requires a valid legal basis for each processing activity. Here's our assessment:

| Processing Activity | Data Used | Legal Basis | GDPR Article | Notes |
|---------------------|-----------|-------------|-------------|-------|
| User registration & authentication | D1, D2, D3 | **Contract performance** | Art. 6(1)(b) | Necessary to provide the service |
| Token management | D4, D10 | **Legitimate interest** | Art. 6(1)(f) | Security measure, user expects session management |
| Language preference storage | D5 | **Contract performance** | Art. 6(1)(b) | Core feature of the app |
| Voice processing for AI conversation | D6 | **Consent** | Art. 6(1)(a) + Art. 9(2)(a) | Biometric data — **explicit consent required** |
| Transcript storage | D7, D8 | **Consent** | Art. 6(1)(a) | User should choose if transcripts are stored |
| AI usage tracking | D9 | **Legitimate interest** | Art. 6(1)(f) | Cost monitoring, abuse prevention |
| Server logging | D11 | **Legitimate interest** | Art. 6(1)(f) | Security and debugging |

### Actions required

1. Voice data processing (D6) falls under **special category** (biometric) — we MUST get **explicit consent** before the first AI conversation.
2. Transcript storage (D7-D8) should be **opt-in** — users should be able to practice without their conversations being permanently stored.

---

## 3. Consent Plan

### 3.1 What requires consent?

| Feature | Consent Type | When to Ask | Can Withdraw? |
|---------|-------------|-------------|---------------|
| AI voice conversation | **Explicit** (biometric data) | Before first conversation | Yes — disables AI features |
| Transcript storage | **Explicit** | Before first conversation | Yes — conversations not saved |
| Usage analytics (if added later) | **Explicit** | At registration or first use | Yes |

### 3.2 How to collect consent (VR flow)

Since VRLingo is a VR application, consent must be adapted to the VR interface:

```
+--------------------------------------------------+
|                                                  |
|   Welcome to VRLingo!                            |
|                                                  |
|   Before you start practicing, we need your      |
|   permission for the following:                  |
|                                                  |
|   [x] I agree to voice processing               |
|       Your voice will be sent to our AI tutor    |
|       for real-time conversation. Audio is NOT   |
|       stored, but text transcripts may be saved. |
|                                                  |
|   [x] I agree to save my conversation history    |
|       Your practice sessions will be saved so    |
|       you can review them later. You can delete  |
|       them at any time.                          |
|                                                  |
|   [ ] I want to practice without saving          |
|       Your conversations won't be stored.        |
|                                                  |
|   [Start Practicing]    [Read Privacy Policy]    |
|                                                  |
+--------------------------------------------------+
```

### 3.3 How to withdraw consent

Users must be able to withdraw consent at any time:
- **In-app settings**: Toggle to disable transcript saving
- **API endpoint**: `DELETE /api/users/me/data` for full data erasure
- **Email request**: Contact support (fallback)

### 3.4 Database schema additions needed

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN consent_voice_processing BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN consent_transcript_storage BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN consent_given_at TIMESTAMP;
ALTER TABLE users ADD COLUMN consent_withdrawn_at TIMESTAMP;
```

---

## 4. Data Subject Rights

GDPR grants users these rights. Here's our implementation plan:

### 4.1 Right of Access (Art. 15)

> "The user can request all personal data we hold about them."

| Requirement | Implementation | Status |
|------------|---------------|--------|
| Provide all personal data on request | `GET /api/users/me/data` endpoint | **NOT IMPLEMENTED** |
| Response within 30 days | Manual process initially, then automated | **NOT IMPLEMENTED** |
| Machine-readable format | JSON export | **NOT IMPLEMENTED** |

**Endpoint spec**:
```
GET /api/users/me/data
Authorization: Bearer <token>

Response 200:
{
  "user": { email, username, role, createdAt },
  "settings": { nativeLanguage, studyLanguage, ... },
  "conversations": [ { id, title, messages: [...], createdAt } ],
  "usageLogs": [ { timestamp, model, tokenCost } ],
  "consents": { voiceProcessing, transcriptStorage, givenAt }
}
```

### 4.2 Right to Rectification (Art. 16)

> "The user can correct inaccurate personal data."

| Requirement | Implementation | Status |
|------------|---------------|--------|
| Update email | `PATCH /api/users/me` | **Partially exists** (user settings route) |
| Update username | `PATCH /api/users/me` | **Partially exists** |
| Update language preferences | `PATCH /api/users/me/settings` | **Exists** |

### 4.3 Right to Erasure — "Right to be Forgotten" (Art. 17)

> "The user can request deletion of all their personal data."

| Requirement | Implementation | Status |
|------------|---------------|--------|
| Delete user account and all data | `DELETE /api/users/me` | **NOT IMPLEMENTED** |
| Cascade delete conversations | Prisma `onDelete: Cascade` | **CONFIGURED** (in schema) |
| Cascade delete auth tokens | Prisma `onDelete: Cascade` | **CONFIGURED** |
| Cascade delete usage logs | Prisma `onDelete: Cascade` | **CONFIGURED** |
| Confirmation step | Require password re-entry | **NOT IMPLEMENTED** |

Good news: Prisma schema already has `onDelete: Cascade` on all relations to User. So `DELETE FROM users WHERE id = ?` will cascade correctly.

**Endpoint spec**:
```
DELETE /api/users/me
Authorization: Bearer <token>
Body: { "password": "confirm_password" }

Response 200: { "message": "Account and all data deleted" }
```

### 4.4 Right to Data Portability (Art. 20)

> "The user can get their data in a portable format."

Same as Right of Access — JSON export from `GET /api/users/me/data`.

### 4.5 Right to Restrict Processing (Art. 18)

> "The user can ask us to stop processing their data while they dispute accuracy."

Implementation: Add a `processingRestricted` boolean flag on the user account. When true, the AI conversation feature is disabled but the account remains active.

---

## 5. Data Retention Policy

### Proposed retention periods

| Data | Current Retention | Proposed Retention | Justification |
|------|------------------|-------------------|---------------|
| User account | Indefinite | Until deletion request + 30 days grace | GDPR minimization |
| Conversation transcripts | **Indefinite** | **90 days** then auto-delete | Data minimization — users rarely review old conversations |
| AI usage logs | **Indefinite** | **1 year** | Billing reconciliation needs |
| Auth tokens (expired) | **Indefinite** | **30 days** after expiry | No need to keep expired tokens |
| Server logs | Session only | **30 days** | Security incident investigation |
| Soft-deleted users (`deletedAt`) | Never cleaned | **30 days** then hard delete | GDPR compliance |

### Implementation

Add a scheduled job (cron) or Prisma middleware to enforce retention:

```typescript
// Run daily
async function enforceRetention() {
  const now = new Date();

  // Delete conversations older than 90 days
  await prisma.message.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } }
  });

  // Delete expired auth tokens older than 30 days
  await prisma.authToken.deleteMany({
    where: {
      refreshExpiresAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
    }
  });

  // Hard-delete soft-deleted users after 30 days
  await prisma.user.deleteMany({
    where: {
      deletedAt: { not: null, lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
    }
  });
}
```

---

## 6. Privacy by Design Checklist

GDPR Article 25 requires "data protection by design and by default." Here's our assessment:

| # | Principle | Status | Action Needed |
|---|-----------|--------|---------------|
| 1 | **Data minimization** — only collect what's needed | PARTIAL | Review: do we need to store AI responses permanently? |
| 2 | **Purpose limitation** — data used only for stated purpose | OK | Transcripts used for learning review only |
| 3 | **Storage limitation** — don't keep data longer than needed | **FAIL** | Implement retention policy (see Section 5) |
| 4 | **Encryption in transit** — TLS for all communications | **FAIL** | No HTTPS/WSS — high priority |
| 5 | **Encryption at rest** — encrypted database | **FAIL** | No DB encryption — to be addressed before launch |
| 6 | **Pseudonymization** — use IDs instead of personal data in logs | PARTIAL | Logs use UUID (good) but email visible in requests |
| 7 | **Access control** — least privilege | **FAIL** | No RBAC, single DB user |
| 8 | **Consent management** — explicit, informed, withdrawable | **FAIL** | No consent mechanism exists |
| 9 | **Data portability** — export in standard format | **FAIL** | No export endpoint |
| 10 | **Right to erasure** — ability to delete all user data | PARTIAL | Cascade configured but no endpoint |
| 11 | **Breach notification** — notify within 72 hours | **FAIL** | No incident response plan — to be written before launch |
| 12 | **Privacy impact assessment (PIA)** | **FAIL** | Voice/biometric processing requires PIA |

**Score: 2/12 fully compliant, 3/12 partial, 7/12 failing**

---

## 7. Data Flow Diagram

This shows where personal data flows and where it crosses regulatory boundaries:

```
User (Data Subject)
    |
    | Voice + credentials (PLAINTEXT - no TLS!)
    v
+-------------------+
| VR Client (Unity) |  Stores: hard-coded test creds (D1, D3)
|                   |  Sends: email, password, voice audio, JWT
+--------+----------+
         |
         | HTTP / WebSocket (UNENCRYPTED)
         v
+--------+----------+
| Fastify Backend    |  Processes: auth, voice relay, transcript storage
| (EU? - TBD)       |  Stores: email, passwordHash, transcripts, usage logs
+--------+----------+
         |
    +----+----+
    |         |
    v         v
+-------+  +-----------+
| Postgres|  | OpenAI API |  <-- DATA TRANSFER OUTSIDE EU!
| (local) |  | (US-based) |  Receives: user voice audio, transcripts
+---------+  +-----------+
```

### GDPR cross-border transfer concern

OpenAI is a US-based company. Sending user voice data and receiving transcripts constitutes a **cross-border data transfer** under GDPR Chapter V. This requires:

1. **Standard Contractual Clauses (SCCs)** with OpenAI, OR
2. **User consent** for the transfer, OR
3. OpenAI's **Data Processing Addendum (DPA)** — OpenAI provides one at https://openai.com/policies/data-processing-addendum

**Action required**: Review and accept OpenAI's DPA. Document this in our privacy policy.

---

## 8. Technical Implementation Plan

### Priority 1 — Immediate (do first)

| Task | Effort |
|------|--------|
| Remove public AI endpoints from `PUBLIC_API_PATHS` | 15min |
| Add `consent_*` columns to User model (Prisma migration) | 1h |
| Create consent collection UI flow in Unity VR client | 4h |
| Implement `DELETE /api/users/me` endpoint | 2h |
| Implement `GET /api/users/me/data` endpoint (data export) | 3h |

### Priority 2 — Before launch

| Task | Effort |
|------|--------|
| Set up HTTPS (Let's Encrypt + Nginx) | 4h |
| Write and publish privacy policy page | 3h |
| Implement data retention cron job | 2h |
| Add `DATA_RETENTION_DAYS` config to `.env` | 15min |
| Hash refresh tokens before storing | 2h |
| Review and sign OpenAI DPA | 1h |

### Priority 3 — Before production use

| Task | Effort |
|------|--------|
| Implement audit logging for data access | 3h |
| Database encryption at rest | 4h |
| Publish CGU (Terms of Service) | 3h |
| Write Data Protection Impact Assessment (DPIA) | 4h |
| Write Incident Response Runbook | 3h |
| Designate a DPO or data protection contact | 1h |

---

## 9. Third-Party Data Processors

Under GDPR, we must document all third parties who process personal data on our behalf:

| Processor | Data Shared | Purpose | DPA Available? | Data Location |
|-----------|------------|---------|---------------|---------------|
| **OpenAI** | Voice audio (transit), text prompts | AI conversation | Yes — [OpenAI DPA](https://openai.com/policies/data-processing-addendum) | USA |
| **PostgreSQL hosting** (self-hosted) | All database data | Storage | N/A (self-hosted) | Where we deploy |
| **Docker Hub** | None (images only) | Container images | N/A | USA |
| **GitHub** | Source code (no user data) | Version control | Yes | USA |
| **Let's Encrypt** | Domain name only | TLS certificates | N/A | Global |

---

## 10. Decisions Needed from the Team

### Decision 1: Conversation retention period

**Options**:
- (A) **90 days** then auto-delete — good GDPR compliance, users rarely review old sessions
- (B) **1 year** — more history for learning progress features
- (C) **Indefinite with user control** — user can delete manually, we never auto-delete
- (D) **User chooses at registration** — offer 30/90/365 day options

> **Recommended**: Option (A) with manual override — 90 days auto-delete, but users can delete anytime via settings.

### Decision 2: Where to host?

Hosting location directly impacts GDPR. If we host in the EU, we avoid cross-border concerns for database data.

> **Recommended**: EU-based hosting (OVH, Hetzner, Scaleway) to keep database data in EU.

### Decision 3: Voice data — is it biometric?

GDPR Article 9 classifies biometric data as "special category." Voice can be considered biometric if used for identification. VRLingo uses voice for language practice, NOT identification.

> **Our position**: Voice data is processed for language learning (not identification), so it falls under Article 6, not Article 9. However, we should still get explicit consent to be safe.

### Decision 4: OpenAI data retention

OpenAI may retain API inputs for up to 30 days (for abuse monitoring). Check if we can opt out via the API settings.

> **Action**: Review [OpenAI's data usage policies](https://openai.com/policies/api-data-usage-policies) and enable zero-retention mode if available.

---

*This document should be reviewed by the full team and updated as decisions are made. Version-control all changes.*
