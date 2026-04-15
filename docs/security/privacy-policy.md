# VRLingo — Privacy Policy & Terms of Use (CGU)

**Version**: 1.0  
**Last updated**: April 2026  
**Author**: Mohammed (Security & Network)  
**Applies to**: VRLingo VR application and backend services  

---

## Table of Contents

**Part A — Privacy Policy (Politique de Confidentialité)**

1. [Who We Are](#1-who-we-are)
2. [What Data We Collect](#2-what-data-we-collect)
3. [Why We Collect It (Legal Basis)](#3-why-we-collect-it-legal-basis)
4. [How We Use Your Data](#4-how-we-use-your-data)
5. [Who We Share Your Data With](#5-who-we-share-your-data-with)
6. [International Data Transfers](#6-international-data-transfers)
7. [How Long We Keep Your Data](#7-how-long-we-keep-your-data)
8. [Your Rights (GDPR)](#8-your-rights-gdpr)
9. [How We Protect Your Data](#9-how-we-protect-your-data)
10. [Cookies & Tracking](#10-cookies--tracking)
11. [Children's Privacy](#11-childrens-privacy)
12. [Changes to This Policy](#12-changes-to-this-policy)
13. [Contact Us](#13-contact-us)

**Part B — Terms of Use (CGU)**

14. [Acceptance of Terms](#14-acceptance-of-terms)
15. [Description of the Service](#15-description-of-the-service)
16. [Account Registration](#16-account-registration)
17. [Acceptable Use](#17-acceptable-use)
18. [AI-Powered Features](#18-ai-powered-features)
19. [Intellectual Property](#19-intellectual-property)
20. [Service Availability & Limitations](#20-service-availability--limitations)
21. [Liability](#21-liability)
22. [Termination](#22-termination)
23. [Governing Law](#23-governing-law)

---

# Part A — Privacy Policy

---

## 1. Who We Are

VRLingo is a virtual reality language-learning application developed as an educational project at Epitech Nancy. The application allows users to practice speaking a foreign language with an AI tutor in an immersive VR environment.

| Field | Detail |
|-------|--------|
| **Data Controller** | VRLingo Project Team — Epitech Nancy |
| **Contact email** | [TO BE FILLED — e.g. privacy@vrlingo.com] |
| **Data Protection contact** | Mohammed — Security & Network lead |
| **Applicable regulation** | EU General Data Protection Regulation (GDPR) 2016/679 |

---

## 2. What Data We Collect

We collect the minimum data necessary to provide the service. Here is an exhaustive list:

### Data you provide directly

| Data | Purpose | Required? |
|------|---------|-----------|
| **Email address** | Account creation and login | Yes |
| **Password** | Authentication (stored as a bcrypt hash — we never see your plaintext password) | Yes |
| **Username** | Display name in the application | No (optional) |
| **Native language** | Personalise your learning experience | Yes |
| **Study language** | Set which language the AI tutor will teach | Yes |

### Data generated during use

| Data | Purpose | How long kept |
|------|---------|---------------|
| **Voice audio** | Sent to the AI tutor for real-time conversation | **Not stored** — processed in transit only |
| **Conversation transcripts** | Text records of what you said and the AI's responses, so you can review your practice sessions | 90 days (then automatically deleted) |
| **AI usage statistics** | Token counts and model information for cost monitoring | 1 year |
| **Language preferences** | Interface language, preferred study language, AI model preference | Until you delete your account |

### Data collected automatically

| Data | Purpose | How long kept |
|------|---------|---------------|
| **IP address** | Security (rate limiting, abuse detection) | 30 days |
| **Request logs** | Debugging and security monitoring | 30 days |

### Data we do NOT collect

- We do **not** store your raw voice recordings.
- We do **not** use cookies or tracking pixels (VR application).
- We do **not** collect device identifiers, location data, or biometric templates.
- We do **not** sell or share your data with advertisers.

---

## 3. Why We Collect It (Legal Basis)

Under GDPR, every data processing activity must have a legal basis. Here is ours:

| Processing activity | Legal basis | GDPR Article |
|---------------------|-------------|-------------|
| Account creation (email, password, username) | **Contract performance** — necessary to provide the service you signed up for | Art. 6(1)(b) |
| Language preferences | **Contract performance** — core functionality | Art. 6(1)(b) |
| Voice processing during AI conversations | **Consent** — you explicitly agree before your first conversation | Art. 6(1)(a) |
| Storing conversation transcripts | **Consent** — you can opt out and practice without saving | Art. 6(1)(a) |
| AI usage tracking | **Legitimate interest** — cost monitoring and abuse prevention | Art. 6(1)(f) |
| Security logs (IP, request logs) | **Legitimate interest** — protecting the service and its users | Art. 6(1)(f) |

---

## 4. How We Use Your Data

Your data is used **exclusively** for the following purposes:

1. **Providing the service** — authenticating you, connecting you to the AI tutor, and delivering language practice sessions.
2. **Improving your learning** — storing conversation transcripts so you can review your practice history.
3. **Protecting the service** — detecting and preventing abuse, brute-force attacks, and unauthorised access.
4. **Cost management** — tracking AI API usage to monitor and control operational costs.

We do **not** use your data for:
- Advertising or marketing profiling
- Automated decision-making or profiling with legal effects
- Training AI models (OpenAI's API terms prohibit use of API data for model training)

---

## 5. Who We Share Your Data With

| Recipient | What they receive | Why | Safeguards |
|-----------|------------------|-----|------------|
| **OpenAI** (USA) | Voice audio (in transit), text prompts | AI conversation processing | OpenAI Data Processing Addendum (DPA); API data not used for training |
| **Hosting provider** (TBD) | All stored data | Infrastructure | EU-based hosting preferred; standard security measures |

We do **not** share your data with any other third parties.

---

## 6. International Data Transfers

When you have a conversation with the AI tutor, your voice audio is sent in real time to **OpenAI's API servers**, which are located in the **United States**.

This constitutes an international data transfer under GDPR Chapter V. We rely on:
- **OpenAI's Data Processing Addendum (DPA)**, which includes EU Standard Contractual Clauses (SCCs)
- **Your explicit consent** — given before your first AI conversation

All other data (account info, transcripts, logs) is stored on servers within the European Union (or will be when deployed to production).

---

## 7. How Long We Keep Your Data

| Data | Retention period | What happens after |
|------|-----------------|-------------------|
| Account data (email, username, settings) | Until you delete your account | Permanently erased |
| Password hash | Until you delete your account | Permanently erased |
| Conversation transcripts | **90 days** | Automatically deleted |
| AI usage logs | **1 year** | Automatically deleted |
| Authentication tokens | **7 days** (active) + **30 days** (expired) | Automatically deleted |
| Security logs | **30 days** | Automatically deleted |
| Deleted accounts (grace period) | **30 days** after deletion request | Permanently erased (hard delete) |

---

## 8. Your Rights (GDPR)

As a user located in the EU, you have the following rights. You can exercise any of them by contacting us at [TO BE FILLED — contact email].

| Right | What it means | How to exercise |
|-------|--------------|-----------------|
| **Access** (Art. 15) | Get a copy of all personal data we hold about you | API: `GET /api/users/me/data` or email us |
| **Rectification** (Art. 16) | Correct inaccurate data (email, username, preferences) | In-app settings or email us |
| **Erasure** (Art. 17) | Delete your account and all associated data | API: `DELETE /api/users/me` or email us |
| **Data portability** (Art. 20) | Receive your data in a machine-readable format (JSON) | API: `GET /api/users/me/data` |
| **Withdraw consent** (Art. 7) | Stop voice processing or transcript storage at any time | In-app settings |
| **Restrict processing** (Art. 18) | Ask us to stop processing your data while a dispute is resolved | Email us |
| **Object** (Art. 21) | Object to processing based on legitimate interest | Email us |
| **Lodge a complaint** | File a complaint with a supervisory authority | CNIL (France): www.cnil.fr |

**Response time**: We will respond to any request within **30 days**. If a request is complex, we may extend this by an additional 60 days (with notice).

**Identity verification**: For security, we may ask you to verify your identity before processing a request.

---

## 9. How We Protect Your Data

We implement the following security measures:

| Measure | Detail |
|---------|--------|
| **Password hashing** | bcrypt with 10 salt rounds — we never store plaintext passwords |
| **JWT authentication** | RS256 asymmetric signing in production; access tokens expire after 15 minutes |
| **Refresh token management** | Stored in database with expiration and revocation capability |
| **Input validation** | All API inputs validated with Zod schemas to prevent injection attacks |
| **SQL injection prevention** | Prisma ORM with parameterised queries |
| **Transport encryption** | HTTPS/TLS for all communications (in progress) |
| **Rate limiting** | API and authentication rate limiting to prevent brute-force attacks (in progress) |
| **Session limits** | AI conversation sessions limited to 5 minutes / 20 turns to prevent abuse |

---

## 10. Cookies & Tracking

VRLingo is a **VR-native application** running on Meta Quest headsets. It does not use cookies, web beacons, or tracking pixels.

If a web-based administration panel is developed in the future, a separate cookie policy will be published.

---

## 11. Children's Privacy

VRLingo is not intended for children under **16 years of age** (the GDPR age threshold for digital consent in most EU countries). We do not knowingly collect data from children under 16.

If you are a parent or guardian and believe your child has provided personal data to VRLingo, please contact us and we will delete it promptly.

---

## 12. Changes to This Policy

We may update this Privacy Policy from time to time. When we do:
- The "Last updated" date at the top will be revised.
- For significant changes, we will notify users through the application.
- Continued use of VRLingo after changes constitutes acceptance of the updated policy.

---

## 13. Contact Us

For any privacy-related questions or to exercise your rights:

| Channel | Contact |
|---------|---------|
| **Email** | [TO BE FILLED — e.g. privacy@vrlingo.com] |
| **Data Protection contact** | Mohammed — Security & Network lead |
| **Supervisory authority** | CNIL — www.cnil.fr |

---

---

# Part B — Terms of Use (Conditions Générales d'Utilisation)

---

## 14. Acceptance of Terms

By creating an account or using VRLingo, you agree to be bound by these Terms of Use and our Privacy Policy. If you do not agree, do not use the service.

---

## 15. Description of the Service

VRLingo is a virtual reality language-learning application that provides:
- **AI-powered conversation practice** — speak with an AI tutor in a target language
- **Conversation history** — review past practice sessions (if you opt in)
- **Progress tracking** — monitor your language learning through usage statistics

VRLingo is an educational project developed at Epitech Nancy. It is provided as-is for learning and evaluation purposes.

---

## 16. Account Registration

To use VRLingo, you must:
- Provide a valid email address
- Create a password (minimum 8 characters)
- Be at least 16 years old
- Provide truthful and accurate information

You are responsible for:
- Keeping your credentials confidential
- All activity that occurs under your account
- Notifying us immediately if you suspect unauthorised access

---

## 17. Acceptable Use

You agree **not to**:

| Prohibited action | Why |
|-------------------|-----|
| Share your account credentials with others | Security — one account per person |
| Attempt to access other users' data | Privacy violation |
| Send abusive, offensive, or illegal content through the AI tutor | Responsible use |
| Attempt to exploit, reverse-engineer, or attack the service | System integrity |
| Use automated tools to flood the API with requests | Abuse prevention and cost control |
| Circumvent rate limits or session restrictions | Fair use |
| Use VRLingo for any purpose other than language learning | Service scope |

Violation of these rules may result in **immediate account suspension or termination**.

---

## 18. AI-Powered Features

VRLingo uses **OpenAI's API** to power AI conversations. Important things to know:

- **AI responses are not always accurate.** The AI tutor may make grammatical errors or provide incorrect translations. Do not rely on it as your sole learning resource.
- **Your voice is processed by OpenAI** in real time. See our Privacy Policy for details on how this data is handled.
- **Conversation sessions are limited** (currently: 5 minutes and 20 exchanges per session) to manage costs and ensure fair usage.
- **OpenAI's terms apply.** By using the AI features, you also agree to comply with OpenAI's [usage policies](https://openai.com/policies/usage-policies).

---

## 19. Intellectual Property

- **VRLingo application**: All code, design, and content are owned by the VRLingo project team.
- **Your content**: You retain ownership of your conversation content. By using the service, you grant us a limited licence to process and store it as described in the Privacy Policy.
- **AI-generated content**: Responses from the AI tutor are generated by OpenAI and are subject to OpenAI's terms. They are not proprietary content of VRLingo.

---

## 20. Service Availability & Limitations

- VRLingo is provided **"as-is"** with no guaranteed uptime or service level.
- We may modify, suspend, or discontinue the service at any time, with reasonable notice when possible.
- The AI features depend on OpenAI's API availability. Service interruptions from OpenAI are outside our control.
- As an educational project, VRLingo has **limited infrastructure and support capacity**.

---

## 21. Liability

To the maximum extent permitted by applicable law:

- VRLingo is provided **without warranty** of any kind, express or implied.
- The team is **not liable** for any indirect, incidental, or consequential damages arising from use of the service.
- The team is **not liable** for inaccurate AI-generated content or language advice.
- Total liability is limited to **the amount you have paid for the service** (currently: zero — VRLingo is free).

---

## 22. Termination

**By you**: You can delete your account at any time through the application or by contacting us. All your data will be erased within 30 days.

**By us**: We reserve the right to suspend or terminate your account if you:
- Violate these Terms of Use
- Engage in abusive or fraudulent behaviour
- Compromise the security of the service or other users

---

## 23. Governing Law

These Terms of Use are governed by **French law**. Any dispute arising from the use of VRLingo shall be submitted to the competent courts of **Nancy, France**.

For EU consumers: nothing in these terms affects your statutory rights under EU consumer protection law.

---

*End of document — Privacy Policy & Terms of Use v1.0*
