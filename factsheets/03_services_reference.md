# Sheet 3 — Services Reference Card
## For verbal presentation (Darian's questions)

---

## What is VYRO?

A mobile social app where users take on AI-generated challenges alone or with friends.
They prove completion with a photo, which an AI model judges. They earn XP, streaks and badges.
It's a 2-person semester project that also runs a research study comparing AI personalization vs a baseline.

---

## Service-by-service: what it is and what it does

### Mobile App
- **What**: React Native app, built with Expo SDK 58, runs on iOS and Android via Expo Go
- **What it does**: the entire user interface — browse challenges, join, upload proof photos, chat, view leaderboard, track XP/badges
- **Key tech**: TypeScript, expo-router (file-based navigation), openapi-fetch (typed API calls generated from the OpenAPI contract)

### Firebase Auth (Google)
- **What**: managed authentication service by Google, external to our GCP project
- **What it does**: handles user sign-in (email/password, Google, etc.), issues Firebase ID tokens
- **Why not roll our own**: production-grade auth with no maintenance cost; tokens are verified by Cloud Run on every request

### Cloud Run (Google Cloud)
- **What**: serverless container platform; runs our Docker image, scales to zero when idle
- **What it does**: the entire REST API (FastAPI, Python 3.12), all business logic
- **Endpoints cover**: challenges, proofs, AI generation, recommendations, leaderboard, social graph, gamification, shop, analytics events, moderation
- **Why Cloud Run**: no server management, automatic HTTPS, scales with traffic, free tier covers prototype usage

### FastAPI (inside Cloud Run)
- **What**: Python web framework for building REST APIs
- **What it does**: defines all /v1/* endpoints, validates request/response shapes, calls services and returns JSON
- **Key design**: OpenAPI spec is generated from the code; mobile TypeScript types are generated from the spec — single source of truth

### Cloud SQL — PostgreSQL 17
- **What**: managed relational database (PostgreSQL 17) on Google Cloud
- **What it does**: stores all persistent data — users, challenges, participations, proofs, tasks, XP, achievements, events, social graph
- **Why PostgreSQL**: relational model fits the data; SQLAlchemy ORM + Alembic migrations; Cloud SQL handles backups and HA

### Cloud Storage
- **What**: object storage (like S3) on Google Cloud
- **What it does**: stores proof photos uploaded by users
- **How**: the API generates a signed URL; the mobile app uploads directly to Cloud Storage; the API stores only the GCS path in Postgres

### Firestore
- **What**: serverless NoSQL document database by Google (Firebase product)
- **What it does**: powers the real-time challenge chat feature
- **Why not Postgres for chat**: Firestore has built-in real-time listeners; the mobile app subscribes via Firebase SDK — no polling needed

### Vertex AI — Gemini models
- **What**: Google Cloud's AI platform; we call Gemini models via API
- **Two uses**:
  1. **Challenge generation** (`gemini-3.5-flash-lite`): generates personalized challenge drafts from a user's history and preferences
  2. **Proof verification** (`gemini-3.5-flash`): receives the proof photo + challenge description, returns a verdict (pass/fail) with a confidence score
- **Free-tier quota**: free users get 2 AI-generated challenges per 48h; VYRO+ is unlimited

### Secret Manager
- **What**: Google Cloud's encrypted secret store
- **What it does**: stores the production database URL and other sensitive config; Cloud Run reads secrets at startup — no plaintext in env vars or Docker images

### Artifact Registry
- **What**: Google Cloud's Docker image registry
- **What it does**: stores the versioned Docker images built by Cloud Build; Cloud Run pulls from here on each deploy

### Cloud Build
- **What**: Google Cloud's CI/CD build service
- **What it does**: triggered by a push to `main` on GitHub; builds the Docker image, runs Alembic migrations via a Cloud Run job, deploys the new revision to Cloud Run
- **Why no stored keys**: uses Workload Identity Federation — GitHub Actions proves identity via OIDC; Google Cloud issues a short-lived token; no long-lived service account key file

### Workload Identity Federation
- **What**: Google Cloud's keyless auth mechanism for external services
- **What it does**: lets GitHub Actions authenticate to Google Cloud without storing a service account key file in the repo
- **Security**: pinned to the numeric GitHub repo ID and the `main` branch — PRs and other branches cannot get deploy credentials

### Cloud Monitoring
- **What**: Google Cloud's observability suite
- **What it does**: collects logs from Cloud Run, tracks request latency and error rates, can alert on anomalies
- **Currently**: used for basic logging; alerting policies would be added at scale

---

## Key design decisions to explain

| Decision | Why |
|----------|-----|
| Cloud Run (serverless) over a VM | No idle cost; scales automatically; no OS/server management |
| PostgreSQL over NoSQL for main data | Relational model (users, challenges, proofs) fits SQL; transactions; easier to query for analytics |
| Firestore only for chat | Real-time listeners; avoids polling; Firestore is free at low volume |
| OpenAPI contract as source of truth | Mobile TypeScript types auto-generated → no API drift |
| Workload Identity Federation | No stored secrets in GitHub → smaller attack surface |
| Gemini on Vertex AI | Same Google Cloud account; no extra auth; usage logged in Cloud Monitoring |
| Cloud Storage + signed URLs | Mobile app uploads directly → API server not a bottleneck for large files |

---

## Data flow for a proof submission (walkthrough)

1. User takes a photo in the mobile app
2. App calls `POST /v1/proofs` → Cloud Run receives request, verifies Firebase ID token
3. Cloud Run calls Cloud Storage API → gets a signed upload URL
4. App uploads photo directly to Cloud Storage (bypasses the API server)
5. App calls `PATCH /v1/proofs/{id}/submit` → Cloud Run marks proof as submitted
6. Cloud Run calls Vertex AI (Gemini flash) with the photo + challenge description
7. Gemini returns verdict + confidence score
8. Cloud Run writes result to Cloud SQL, logs an analytics event
9. If passed: XP awarded, streak updated, achievements checked
10. App receives response with verdict — user sees result instantly
