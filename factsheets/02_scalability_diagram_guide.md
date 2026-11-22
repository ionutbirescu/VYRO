# Sheet 2 — Scalability Diagram
## Format: A2 landscape (594 × 420 mm) — or A3 if A2 not available

---

## Concept

Draw **3 columns**, each representing one scaling state.
Each column contains a mini version of the architecture showing what changes.
Use **arrows or annotations** between columns to explain what was upgraded and why.

---

## Page layout

```
|  CURRENT STATE    |  INTERMEDIATE         |  1 MILLION USERS        |
|  (prototype)      |  (1 000 – 10 000)     |  (1 000 000+)           |
|  ~10–100 users    |  users                |  users                  |
```

Draw a vertical dividing line between each column.
Title each column with a banner at the top.

---

## Column 1 — Current State

```
BOTTLENECKS (mark with ⚠):

┌─────────────────┐
│  MOBILE APP     │──────────────────────────────────────┐
└─────────────────┘  HTTPS                               │
                                                         ▼
              ┌────────────────────────────────────────────────┐
              │  GOOGLE CLOUD PLATFORM                         │
              │                                                │
              │  ┌──────────────────────┐                     │
              │  │  CLOUD RUN           │ ⚠ 1 instance        │
              │  │  FastAPI             │   manual scaling     │
              │  └──────────────────────┘                     │
              │        │        │        │                     │
              │  ╔═══╗ ╔══════╗ ┌──────┐ ┌──────────────┐    │
              │  ║SQL║ ║GCS   ║ │Fire- │ │Vertex AI     │⚠   │
              │  ║⚠  ║ ║      ║ │store │ │rate limits   │    │
              │  ╚═══╝ ╚══════╝ └──────┘ └──────────────┘    │
              │  f1-micro                                      │
              │  25 conn max ⚠                                 │
              └────────────────────────────────────────────────┘

Bottlenecks:
⚠ Cloud SQL f1-micro — max ~25 connections, no HA
⚠ Cloud Run — single instance, cold starts
⚠ No CDN — proof photos served directly from GCS
⚠ Vertex AI — synchronous, blocks API response
```

---

## Column 2 — Intermediate (1K–10K users)

Mark changes in GREEN or circle them.

```
What CHANGES vs current state:

┌──────────────────────────────────────────────────────────────┐
│  GOOGLE CLOUD PLATFORM                                        │
│                                                              │
│  ┌──────────────────────────────────────────────┐           │
│  │  CLOUD RUN (auto-scaling)                    │  ← NEW   │
│  │  min=1, max=10 instances                     │           │
│  └──────────────────────────────────────────────┘           │
│        │        │          │          │                      │
│  ╔════════╗  ╔══════╗  ┌──────┐  ┌──────────┐              │
│  ║ Cloud  ║  ║ GCS  ║  │Fire- │  │Vertex AI │              │
│  ║ SQL    ║  ║ +CDN ║  │store │  │+ queue   │  ← NEW      │
│  ║ g1-sml ║  ║ ←NEW ║  └──────┘  └──────────┘              │
│  ║+read   ║  ╚══════╝                                       │
│  ║replica ║  ← NEW                                          │
│  ╚════════╝                                                  │
│                                                              │
│  + PgBouncer connection pooler  ← NEW                        │
└──────────────────────────────────────────────────────────────┘

Changes:
✓ Cloud Run: set maxInstances=10, minInstances=1 (zero cold starts)
✓ Cloud SQL: upgrade to db-g1-small, add 1 read replica for analytics
✓ Connection pooler: PgBouncer (or Cloud SQL Proxy built-in) prevents conn exhaustion
✓ Cloud CDN in front of Cloud Storage → proof photo latency drops 10x
✓ Vertex AI calls moved to background queue (Cloud Tasks) → API stays fast

No code changes needed for Cloud Run scaling — it is already the model.
Cost: ~$50–150/month
```

---

## Column 3 — 1 Million Users

Mark NEW components in RED or double-circle them.

```
What CHANGES vs intermediate:

┌──────────────────────────────────────────────────────────────────────┐
│  GOOGLE CLOUD PLATFORM  (multi-region)                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  CLOUD RUN  ×N instances auto-scaled                       │     │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                │     │
│  │  │challenges │ │ social    │ │ AI service│ ← split svc    │     │
│  │  │  service  │ │  service  │ │           │   NEW          │     │
│  │  └───────────┘ └───────────┘ └───────────┘                │     │
│  └────────────────────────────────────────────────────────────┘     │
│            │                │                 │                      │
│  ╔════════════╗   ╔════════════╗  ┌──────────────────────┐         │
│  ║ CLOUD      ║   ║ CLOUD      ║  │  CLOUD TASKS /       │         │
│  ║ SPANNER    ║   ║ STORAGE    │  │  PUB/SUB queue       │  NEW   │
│  ║ (or Postgres║  ║ multi-     │  │  async AI jobs       │        │
│  ║ + Spanner) ║  ║ region+CDN ║  └──────────────────────┘         │
│  ╚════════════╝   ╚════════════╝                                    │
│         NEW            NEW                                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │  API GATEWAY (Cloud Endpoints / API Gateway)   NEW       │       │
│  │  Rate limiting · Auth · Routing                          │       │
│  └──────────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────┘

Changes vs intermediate:
✓ Cloud SQL → Cloud Spanner (globally distributed, unlimited writes)
  WHY: PostgreSQL hits its ceiling at ~10K concurrent connections even with pooling
✓ Split monolithic API → domain microservices (challenges, social, AI)
  WHY: independent scaling, independent deploys
✓ API Gateway in front of Cloud Run
  WHY: rate limiting, DDoS protection, auth offloading
✓ Cloud Tasks / Pub/Sub for all async work (AI, notifications, analytics)
  WHY: a 1M-user load cannot wait synchronously for Gemini
✓ Multi-region Cloud Storage + Cloud CDN mandatory
  WHY: global users → photo latency otherwise 2–5 seconds
✓ Firebase Auth: no change needed — already globally managed by Google
✓ Firestore: no change needed — already serverless & globally distributed

Cost: ~$5 000–15 000/month (AI call volume dominates)
```

---

## Transition arrows between columns

Draw horizontal arrows between columns with these labels:

```
Column 1 → Column 2:
  "Scale Cloud Run instances (config only)"
  "Upgrade Cloud SQL tier + read replica"
  "Add CDN layer"
  "Async AI via Cloud Tasks"

Column 2 → Column 3:
  "Replace PostgreSQL with Cloud Spanner"
  "Split API into domain services"
  "Add API Gateway"
  "Multi-region storage + global CDN"
```

---

## Summary table (draw at the bottom of the page)

| Component        | Current           | 1K–10K             | 1M                        |
|-----------------|-------------------|--------------------|---------------------------|
| Cloud Run       | 1 instance        | auto-scale 1–10    | auto-scale, split svc     |
| Database        | Cloud SQL f1-micro| Cloud SQL g1-small | Cloud Spanner             |
| Connection pool | none              | PgBouncer          | PgBouncer / Spanner native|
| Photo delivery  | GCS direct        | GCS + CDN          | Multi-region GCS + CDN    |
| AI calls        | synchronous       | async queue        | async queue + quotas      |
| Auth            | Firebase (unchanged) | unchanged       | unchanged                 |
| Firestore       | unchanged         | unchanged          | unchanged                 |
| API surface     | single FastAPI    | single FastAPI     | API Gateway + microservices|
| Est. cost/month | ~$10              | ~$50–150           | ~$5K–15K                  |
