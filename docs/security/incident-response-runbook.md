# VRLingo — Incident Response Runbook (IRP)

**Version**: 1.0  
**Last updated**: April 2026  
**Author**: Mohammed (Security & Network)  
**Scope**: All VRLingo infrastructure (backend, database, VR client, third-party services)  

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Team Roles & Contacts](#2-team-roles--contacts)
3. [Severity Levels](#3-severity-levels)
4. [Incident Response Flow](#4-incident-response-flow)
5. [Playbook: Compromised API Key](#5-playbook-compromised-api-key)
6. [Playbook: Database Breach](#6-playbook-database-breach)
7. [Playbook: Account Takeover](#7-playbook-account-takeover)
8. [Playbook: DDoS / Service Degradation](#8-playbook-ddos--service-degradation)
9. [Playbook: Leaked Credentials in Source Code](#9-playbook-leaked-credentials-in-source-code)
10. [Playbook: Malicious Dependency (Supply Chain)](#10-playbook-malicious-dependency-supply-chain)
11. [GDPR Breach Notification](#11-gdpr-breach-notification)
12. [Post-Incident Review Template](#12-post-incident-review-template)
13. [Quick-Reference Cheat Sheet](#13-quick-reference-cheat-sheet)

---

## 1. Purpose & Scope

This runbook defines **what to do when something goes wrong** — a security breach, a service outage, or a suspected attack. Its goals:

- **Speed**: Reduce time between detection and containment
- **Consistency**: Everyone follows the same steps regardless of who is on call
- **Compliance**: Meet GDPR's 72-hour breach notification requirement
- **Learning**: Every incident feeds back into better defenses

### What counts as an incident?

| Is an incident | Is NOT an incident |
|----------------|-------------------|
| Unauthorised access to user data | A normal bug or crash without data exposure |
| API key leaked publicly | Slow performance (unless caused by an attack) |
| Brute-force attack succeeding | Failed login attempts below lockout threshold |
| Database exposed to the internet | Planned maintenance downtime |
| Malware in a dependency | Known vulnerability with no exploit |
| User reports their account was hijacked | User forgot their password |

---

## 2. Team Roles & Contacts

During an incident, these are the key roles. One person can hold multiple roles on a small team.

| Role | Responsibility | Person | Contact |
|------|---------------|--------|---------|
| **Incident Commander (IC)** | Coordinates response, makes decisions, communicates to stakeholders | [TO BE ASSIGNED] | [email / phone] |
| **Security Lead** | Investigates the technical root cause, executes containment | Mohammed | [email / phone] |
| **Backend Lead** | Backend service recovery, log analysis, API fixes | [TO BE ASSIGNED] | [email / phone] |
| **VR Client Lead** | Client-side patches, APK updates if needed | [TO BE ASSIGNED] | [email / phone] |
| **Communications** | Handles user notifications, GDPR reporting if needed | [TO BE ASSIGNED] | [email / phone] |

### Escalation path

```
Any team member detects issue
        |
        v
  Notify Security Lead (Mohammed)
        |
        v
  Security Lead assesses severity (see Section 3)
        |
        +---> SEV-1 or SEV-2: Immediately assign Incident Commander
        |                       Notify full team within 15 minutes
        |
        +---> SEV-3: Security Lead handles directly
        |             Notify team within 1 hour
        |
        +---> SEV-4: Log it, fix in next work session
```

---

## 3. Severity Levels

Every incident gets a severity level. This determines response speed and who gets involved.

| Level | Name | Description | Response time | Examples |
|-------|------|-------------|--------------|----------|
| **SEV-1** | Critical | Active data breach, complete service compromise, financial exposure | **Immediate** — drop everything | OpenAI API key leaked publicly; database dumped by attacker; all user passwords exposed |
| **SEV-2** | High | Significant security issue with potential for data loss, service partially compromised | **Within 1 hour** | Brute-force attack succeeding; single account takeover confirmed; public endpoint abused at scale |
| **SEV-3** | Medium | Security weakness exploited but limited impact, no confirmed data loss | **Within 4 hours** | Suspicious login patterns; vulnerability discovered in dependency; failed intrusion attempt |
| **SEV-4** | Low | Potential issue identified, no active exploitation | **Within 24 hours** | Security scan finds low-severity CVE; misconfiguration noticed in dev; minor policy violation |

---

## 4. Incident Response Flow

Every incident follows these 6 phases. Do them in order.

### Phase 1: Detection & Triage (0–15 min)

**Goal**: Confirm it's real and determine severity.

- [ ] Who detected it? (monitoring alert, user report, team member, external report)
- [ ] What system is affected? (backend, database, VR client, OpenAI integration)
- [ ] Is there active exploitation right now?
- [ ] What data is potentially exposed?
- [ ] Assign severity level (SEV-1 to SEV-4)
- [ ] Notify the appropriate people (see escalation path above)
- [ ] Start an incident log — write down everything with timestamps

### Phase 2: Containment (15 min – 1 hour)

**Goal**: Stop the bleeding. Prevent further damage.

- [ ] Isolate the affected system (take service offline, block IPs, revoke keys)
- [ ] Do NOT destroy evidence — don't delete logs or wipe systems yet
- [ ] Preserve logs (copy them to a safe location before they rotate)
- [ ] If credentials are compromised: rotate them immediately
- [ ] If an endpoint is being abused: block it or add emergency auth
- [ ] Communicate status to the team: "Contained" or "Still active"

### Phase 3: Investigation (1–4 hours)

**Goal**: Understand what happened, how, and what's impacted.

- [ ] Review relevant logs (Fastify server logs, database logs, Nginx access logs)
- [ ] Determine the attack vector (how did they get in?)
- [ ] Determine the blast radius (what data/systems were affected?)
- [ ] Identify all affected users
- [ ] Document the timeline of events
- [ ] Determine if this is a GDPR-reportable breach (see Section 11)

### Phase 4: Eradication (1–8 hours)

**Goal**: Remove the threat completely.

- [ ] Patch the vulnerability that was exploited
- [ ] Remove any backdoors, malicious code, or compromised accounts
- [ ] Rotate ALL potentially compromised credentials (passwords, API keys, JWT keys, DB passwords)
- [ ] Force logout all affected users (revoke all refresh tokens)
- [ ] Update dependencies if the attack vector was a supply chain issue

### Phase 5: Recovery (1–24 hours)

**Goal**: Restore normal operations safely.

- [ ] Redeploy the patched application
- [ ] Verify the fix — test that the vulnerability is actually closed
- [ ] Monitor closely for recurrence (increase log verbosity temporarily)
- [ ] Gradually restore full service
- [ ] Notify affected users (see Section 11 for GDPR requirements)
- [ ] Update external parties if needed (OpenAI, hosting provider)

### Phase 6: Post-Incident Review (within 1 week)

**Goal**: Learn from it so it doesn't happen again.

- [ ] Hold a post-mortem meeting (blameless)
- [ ] Fill out the Post-Incident Review Template (Section 12)
- [ ] Update the threat model with new findings
- [ ] Create tickets for follow-up security improvements
- [ ] Update this runbook if the playbooks were missing steps

---

## 5. Playbook: Compromised API Key

**Scenario**: The OpenAI API key (`CHATGPT_API_KEY`) is leaked — found in a public repo, logs, or error message.

### Why this is SEV-1

An exposed OpenAI API key allows anyone to generate API calls billed to our account. With the GPT-4o Realtime model, costs can reach **hundreds of euros per hour** of abuse.

### Steps

| Step | Action | Command / Details |
|------|--------|-------------------|
| 1 | **Revoke the key immediately** | Go to https://platform.openai.com/api-keys and delete the compromised key |
| 2 | **Generate a new key** | Create a new API key on the same page |
| 3 | **Update the application** | Update `CHATGPT_API_KEY` in `.env` and redeploy |
| 4 | **Check billing** | Review https://platform.openai.com/usage for unexpected charges |
| 5 | **Find the leak source** | Search git history: `git log -p --all -S 'CHATGPT_API_KEY'` |
| 6 | **If leaked in a public repo** | Use `git filter-branch` or BFG Repo-Cleaner to remove from history |
| 7 | **Set up usage limits** | On OpenAI dashboard: set monthly spending limit |
| 8 | **Add key scanning** | Enable GitHub secret scanning or add a pre-commit hook |

### Prevention

- Never commit API keys to source code
- Use `.env` files (gitignored) or a secrets manager
- Add `CHATGPT_API_KEY` pattern to `.gitignore` and pre-commit hooks

---

## 6. Playbook: Database Breach

**Scenario**: Unauthorised access to PostgreSQL — data may have been read or exfiltrated.

### Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Isolate the database** | Shut down external access: block port 5433, stop Docker container if needed |
| 2 | **Preserve evidence** | Copy PostgreSQL logs before they rotate: `docker logs backend-postgres-1 > pg_incident.log 2>&1` |
| 3 | **Check access logs** | Review PostgreSQL `pg_stat_activity` for active/recent connections |
| 4 | **Change all DB credentials** | New `POSTGRES_USER` / `POSTGRES_PASSWORD` in docker-compose and `.env` |
| 5 | **Assess data exposure** | Determine which tables were accessed. Key tables with personal data: `users`, `messages`, `auth_tokens` |
| 6 | **Force-rotate user credentials** | If `users` table was accessed: invalidate all refresh tokens (`UPDATE auth_tokens SET revoked = true`) |
| 7 | **Notify users** | If passwords were exposed: force password reset for all users |
| 8 | **GDPR notification** | If personal data was exposed: follow Section 11 (72-hour reporting) |
| 9 | **Harden database** | Remove exposed ports from docker-compose, enable SSL for DB connections, use least-privilege DB users |

### Data at risk in each table

| Table | Personal data | Impact if exposed |
|-------|--------------|-------------------|
| `users` | Email, password hash (bcrypt), username | HIGH — password hashes can be cracked offline |
| `auth_tokens` | Refresh tokens | HIGH — tokens can be used to impersonate users |
| `messages` | Conversation transcripts | MEDIUM — personal content, GDPR-sensitive |
| `user_settings` | Language preferences | LOW |
| `ia_usage_logs` | Token usage stats | LOW |
| `ia_credits` | Credit balances | LOW |

---

## 7. Playbook: Account Takeover

**Scenario**: A user reports their account is compromised, or we detect suspicious activity (login from unusual IP, rapid token refreshes).

### Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Revoke all sessions** | `UPDATE auth_tokens SET revoked = true WHERE "userId" = '<user_id>'` |
| 2 | **Lock the account** | Optionally set `isVerified = false` to prevent login while investigating |
| 3 | **Contact the user** | Via email — confirm they did not authorise the activity |
| 4 | **Review auth logs** | Check Fastify logs for login attempts on this account (IP, user agent, timing) |
| 5 | **Force password reset** | User must create a new password before regaining access |
| 6 | **Check for data access** | Review what the attacker may have accessed (conversations, settings) |
| 7 | **Review the attack vector** | Was the password brute-forced (no rate limiting)? Credential stuffing? Phished? |
| 8 | **Implement prevention** | Rate limiting on login, account lockout after failed attempts, notify user of new logins |

---

## 8. Playbook: DDoS / Service Degradation

**Scenario**: The service is slow or unresponsive due to a flood of requests.

### Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Confirm it's an attack** | Check: is it a traffic spike (legitimate) or an attack (single IP, unusual patterns)? |
| 2 | **Check resource usage** | `docker stats` to see CPU/memory per container |
| 3 | **Identify the source** | Check Nginx/Fastify logs for top IPs: look for high request rates from single sources |
| 4 | **Block abusive IPs** | Nginx: `deny <IP>;` in config and reload. Firewall: `iptables -A INPUT -s <IP> -j DROP` |
| 5 | **Enable rate limiting** | If not already active: deploy `@fastify/rate-limit` with aggressive limits |
| 6 | **Scale if possible** | Add more container replicas if infrastructure supports it |
| 7 | **Monitor WebSocket abuse** | Check for users opening excessive concurrent sessions |
| 8 | **Post-attack** | Add the attacking IP ranges to a permanent blocklist. Review rate limit settings. |

### Indicators of attack vs. legitimate traffic

| Indicator | Attack | Legitimate |
|-----------|--------|-----------|
| Requests from single IP > 1000/min | Likely | Unlikely |
| Requests to a single endpoint repeatedly | Likely | Unlikely |
| No valid JWT in requests | Likely | Unlikely |
| Geographic origin matches user base | Unlikely | Likely |
| Request patterns are uniform/automated | Likely | Unlikely |

---

## 9. Playbook: Leaked Credentials in Source Code

**Scenario**: Credentials, tokens, or secrets found committed to a Git repository (public or private).

### Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Identify what was leaked** | Password? API key? JWT private key? Database credentials? |
| 2 | **Rotate the credential immediately** | Generate new ones — assume the old ones are compromised |
| 3 | **Remove from Git history** | Use BFG Repo-Cleaner: `bfg --replace-text passwords.txt repo.git` |
| 4 | **Force push cleaned history** | `git reflog expire --expire=now --all && git gc --prune=now --aggressive && git push --force --all` |
| 5 | **Audit .gitignore** | Ensure `.env`, `*.pem`, `config/jwt/`, and credential files are listed |
| 6 | **Add pre-commit scanning** | Install `gitleaks` or `detect-secrets` as a pre-commit hook |
| 7 | **If JWT private key was leaked** | Regenerate the RSA key pair AND revoke all existing tokens (all users must re-login) |

### Things that should NEVER be in Git

| File / Pattern | What it contains |
|----------------|-----------------|
| `.env` | All environment secrets |
| `config/jwt/private.pem` | JWT signing key |
| `config/jwt/public.pem` | JWT verification key (less critical but still sensitive) |
| Any `*_KEY`, `*_SECRET`, `*_PASSWORD` | API keys and credentials |
| `docker-compose.override.yml` | Local dev overrides with real passwords |

---

## 10. Playbook: Malicious Dependency (Supply Chain)

**Scenario**: A dependency in `package.json` or `Packages/manifest.json` (Unity) is found to contain malicious code, or has been compromised upstream.

### Steps

| Step | Action | Details |
|------|--------|---------|
| 1 | **Identify the affected package** | Check Snyk alerts, GitHub Dependabot, or npm audit output |
| 2 | **Assess impact** | Did the malicious version run in production? Check `package-lock.json` for exact version |
| 3 | **Pin to a safe version** | Update `package.json` to a known-good version, run `npm ci` |
| 4 | **Check for data exfiltration** | Review outbound network connections from the backend container |
| 5 | **Rotate credentials** | If the package had access to env vars (all Node packages do), rotate all secrets |
| 6 | **Rebuild and redeploy** | Clean `node_modules`, rebuild Docker image from scratch: `docker build --no-cache` |
| 7 | **Review lock file** | Verify `package-lock.json` integrity matches expected hashes |
| 8 | **Post-incident** | Add `npm audit` to CI pipeline, consider using `socket.dev` for supply chain monitoring |

---

## 11. GDPR Breach Notification

### When is notification required?

Under GDPR Article 33, you **must** notify the supervisory authority (CNIL) within **72 hours** if a breach is "likely to result in a risk to the rights and freedoms of natural persons."

### Decision flowchart

```
Personal data was accessed by an unauthorised party?
    |
    +-- No  --> Document internally, no notification required
    |
    +-- Yes --> Was the data encrypted or otherwise unintelligible to the attacker?
                    |
                    +-- Yes --> Document internally, notification likely NOT required
                    |
                    +-- No  --> Is there a risk to users' rights and freedoms?
                                    |
                                    +-- Low risk (e.g. only language preferences)
                                    |   --> Notify CNIL within 72h (Art. 33)
                                    |       Do NOT need to notify users
                                    |
                                    +-- High risk (e.g. emails, password hashes, voice data)
                                        --> Notify CNIL within 72h (Art. 33)
                                        --> ALSO notify affected users (Art. 34)
```

### What to include in the CNIL notification

CNIL notification form: https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles

| Required field | What to provide |
|----------------|----------------|
| Nature of the breach | What happened (technical description) |
| Categories of data | Email, password hashes, conversation transcripts, etc. |
| Number of affected users | Exact count or best estimate |
| Likely consequences | Identity theft risk, account takeover, privacy loss |
| Measures taken | Containment steps, credential rotation, user notification |
| DPO contact | Mohammed — [email] |

### What to include in user notification

If users must be notified (high risk):

```
Subject: Important: Security incident affecting your VRLingo account

Dear [User],

We are writing to inform you of a security incident that may have 
affected your VRLingo account.

What happened: [brief description]
When: [date/time]
What data may have been affected: [list]

What we have done:
- [containment measures taken]
- [credential rotation]

What you should do:
- Change your password immediately
- If you use the same password on other services, change those too
- Monitor your email for suspicious activity

We take your privacy seriously and are working to prevent this 
from happening again.

Contact: [privacy email]
```

---

## 12. Post-Incident Review Template

Fill this out within **1 week** of every SEV-1 or SEV-2 incident. Optional for SEV-3/SEV-4.

```
# Post-Incident Review

**Incident ID**: INC-[YYYY]-[NNN]
**Date of incident**: [date]
**Severity**: SEV-[1-4]
**Duration**: [detection to resolution]
**Authored by**: [name]
**Review date**: [date of post-mortem meeting]

## Summary
[2-3 sentences: what happened, what was the impact]

## Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | [First detection] |
| HH:MM | [Containment started] |
| HH:MM | [Root cause identified] |
| HH:MM | [Fix deployed] |
| HH:MM | [Service fully restored] |

## Root Cause
[Technical explanation of why it happened]

## Impact
- Users affected: [number]
- Data exposed: [what types]
- Financial impact: [if any — e.g. OpenAI charges]
- Downtime: [duration]

## What Went Well
- [Thing that helped]
- [Another thing]

## What Could Be Improved
- [Gap in detection]
- [Missing automation]
- [Documentation that was unclear]

## Action Items
| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| [Fix to implement] | [person] | [date] | [ ] |
| [Process to update] | [person] | [date] | [ ] |
| [Monitoring to add] | [person] | [date] | [ ] |

## GDPR Reporting
- Was CNIL notified? [Yes/No]
- Were users notified? [Yes/No]
- Notification date: [date or N/A]
```

---

## 13. Quick-Reference Cheat Sheet

Print this page and keep it accessible. When an incident occurs, use this as a starting point.

### Emergency commands

| Action | Command |
|--------|---------|
| **Stop the backend** | `docker compose down backend` |
| **Stop everything** | `docker compose down` |
| **View backend logs** | `docker compose logs -f backend` |
| **View DB logs** | `docker compose logs -f postgres` |
| **Revoke all user sessions** | `UPDATE auth_tokens SET revoked = true;` (via `npm run db:connect`) |
| **Revoke one user's sessions** | `UPDATE auth_tokens SET revoked = true WHERE "userId" = '<id>';` |
| **Block an IP (Nginx)** | Add `deny <IP>;` to Nginx config, then `nginx -s reload` |
| **Check active DB connections** | `SELECT * FROM pg_stat_activity;` |
| **Check OpenAI billing** | https://platform.openai.com/usage |
| **Rotate OpenAI key** | https://platform.openai.com/api-keys |
| **Rotate JWT keys** | Regenerate PEM pair in `config/jwt/`, restart backend |

### Key URLs

| Resource | URL |
|----------|-----|
| OpenAI API keys | https://platform.openai.com/api-keys |
| OpenAI usage / billing | https://platform.openai.com/usage |
| CNIL breach notification | https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles |
| GitHub repo (backend) | [TO BE FILLED] |
| GitHub repo (vr-client) | [TO BE FILLED] |

### Severity reminder

| SEV-1 | SEV-2 | SEV-3 | SEV-4 |
|-------|-------|-------|-------|
| Active breach / financial loss | Significant risk, partial compromise | Weakness exploited, limited impact | Potential issue, no exploitation |
| **Immediate** response | **1 hour** response | **4 hours** | **24 hours** |
| Full team | IC + Security Lead | Security Lead | Logged for next session |

---

*Keep this document up to date. After every incident, review whether the playbooks were sufficient and update as needed.*
