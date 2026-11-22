# Sheet 1 — Main Architecture Diagram
## Format: A3 landscape (420 × 297 mm)

---

## Layout plan (draw in this order)

### Step 1 — Page structure

Divide the page into 3 vertical columns:

```
| LEFT (70mm)  | CENTER (220mm)                          | RIGHT (130mm) |
| External     | Google Cloud Platform · europe-west1    | CI/CD         |
```

Draw a large labeled rectangle for the GCP zone (center column, full height minus title).
Draw a smaller labeled rectangle for CI/CD (right column, bottom half).

---

### Step 2 — Title (top center)

```
VYRO — Architecture Overview
"Venture Yourself, Rise Onward" — mobile social challenge app
```

---

### Step 3 — LEFT column: External clients

Draw these boxes stacked vertically, center of left column:

```
┌─────────────────────┐  y ≈ 60mm
│    MOBILE APP       │
│  React Native       │
│  Expo SDK 58        │
└─────────────────────┘

       │  │
  sign in  HTTPS + Firebase ID token

┌─────────────────────┐  y ≈ 130mm
│   FIREBASE AUTH     │
│  Google Identity    │
│  Platform           │
└─────────────────────┘
```

---

### Step 4 — CENTER (GCP) — top row: API Tier

Inside the GCP box, draw a dashed horizontal band labeled "API Tier":

```
┌──────────────────────────┐
│       CLOUD RUN          │  ← wide box, center of band
│  FastAPI · Python 3.12   │
│  REST API · /v1/*        │
└──────────────────────────┘
```

To its right, in the same band:

```
┌──────────────┐    ┌──────────────────┐
│  ARTIFACT    │    │  SECRET MANAGER  │
│  REGISTRY    │    │  DB URL          │
│  Docker imgs │    │  API keys        │
└──────────────┘    └──────────────────┘
```

---

### Step 5 — CENTER (GCP) — middle row: Data & AI Tier

Draw a dashed horizontal band labeled "Data / AI Tier":

Five boxes side by side (use cylinder shape for databases):

```
╔══════════╗  ╔══════════════╗  ╔═══════════╗  ┌──────────────┐  ┌────────────┐
║ CLOUD SQL║  ║ CLOUD STORAGE║  ║ FIRESTORE ║  │  VERTEX AI   │  │  CLOUD     │
║ Postgres ║  ║ Proof photos ║  ║ Chat      ║  │  Gemini flash│  │  MONITORING│
║    17    ║  ║ (signed URLs)║  ║ (Firebase)║  │  verify+gen  │  │  Logs/Mets │
╚══════════╝  ╚══════════════╝  ╚═══════════╝  └──────────────┘  └────────────┘
```

(cylinders = double top/bottom line; rectangles = plain box)

---

### Step 6 — RIGHT column / bottom of CENTER: CI/CD

Draw a dashed box in the bottom-right, labeled "CI/CD Pipeline":

```
┌──────────────────────┐  (outside GCP, bottom-left)
│       GITHUB         │
│  ionutbirescu/VYRO   │
└──────────────────────┘
         │
         │ push to main (GitHub Actions)
         ▼
┌──────────────────────┐  (inside GCP)
│    CLOUD BUILD       │
│  build · migrate     │
│  deploy              │
└──────────────────────┘
         │
    push image
         ▼
┌──────────────┐
│  ARTIFACT    │
│  REGISTRY    │
└──────────────┘

Also:
GitHub ──(OIDC token)──▶ Workload Identity Federation ──▶ Cloud Build
(keyless auth, no stored keys)
```

---

### Step 7 — Draw the arrows

| From           | To               | Label                    | Line style |
|----------------|------------------|--------------------------|------------|
| Mobile App     | Cloud Run        | HTTPS + Firebase ID token | solid →   |
| Mobile App     | Firebase Auth    | sign in / get token       | solid →   |
| Mobile App     | Firestore        | Firebase SDK (chat)       | dashed →  |
| Cloud Run      | Firebase Auth    | verify ID token           | dashed →  |
| Cloud Run      | Cloud SQL        | SQLAlchemy ORM            | solid →   |
| Cloud Run      | Cloud Storage    | signed URLs               | solid →   |
| Cloud Run      | Firestore        | admin SDK                 | solid →   |
| Cloud Run      | Vertex AI        | generate + verify         | solid →   |
| Cloud Run      | Secret Manager   | read secrets (startup)    | dashed →  |
| Cloud Run      | Cloud Monitoring | logs + metrics            | dashed →  |
| GitHub         | Cloud Build      | push to main → CI         | solid →   |
| GitHub         | Workload Identity| OIDC token                | dashed →  |
| Cloud Build    | Artifact Registry| push Docker image         | solid →   |
| Cloud Build    | Cloud Run        | deploy revision           | solid →   |

**Legend (bottom of page):**
```
———→  direct data flow
- - →  indirect / config / verification / async
╔═╗   database / storage (cylinder shape)
```

---

### Color coding (optional, if using colored pens)

- **Blue** — Cloud Run, Cloud Build, Vertex AI (compute / AI)
- **Purple** — Cloud SQL, Cloud Storage, Firestore, Artifact Registry, Secret Manager (data / storage)
- **Gray** — Cloud Monitoring, Workload Identity (infra support)
- **Yellow** — Firebase Auth (external Google service)
- **No fill** — Mobile App, GitHub (external to GCP)
