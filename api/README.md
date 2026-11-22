# VYRO API

FastAPI backend for the VYRO app: Python 3.12, SQLAlchemy 2 and Alembic on PostgreSQL. It is deployed to Cloud Run.

- **Contract:** [`../contract/openapi.json`](../contract/openapi.json), generated from this code.
- **Live:** https://vyro-api-2aczsavhwq-ew.a.run.app. Interactive docs are at [`/docs`](https://vyro-api-2aczsavhwq-ew.a.run.app/docs).

## Run it locally

The quickest way is Docker, which runs the API next to Postgres and keeps both running:

```sh
docker compose up -d                                         # from the repo root; http://localhost:8000/docs
docker compose exec api python scripts/seed.py --uid dev-<you>   # realistic data for your dev user
docker compose logs -f api                                   # its log
```

It reloads when you edit `app/`, and applies new migrations when it restarts (`docker compose restart api`). After changing dependencies, rebuild it with `docker compose up -d --build api`. `scripts/seed.py --reset` empties the local database first. The seed adds 61 built-in challenges (39 from the templates, 22 hand-written in `scripts/seed_challenges.py`), your user (Alex for the default `dev-user`) and seven more (`dev-maria`, `dev-radu`, `dev-elena`, `dev-andrei`, `dev-ioana`, `dev-alice`, `dev-bob`) with three weeks of progress, so you can also open the app as any of them. Gemini is off in the container by default: drafts come from templates and proofs pass unscored. To turn it on, run `gcloud auth application-default login` and `gcloud auth application-default set-quota-project vyro-app-2026` once, put `VYRO_AI_PROJECT=vyro-app-2026` in a `.env` file next to `docker-compose.yml`, and run `docker compose up -d api`. The container reads your login from gcloud's config folder.

To run the API from your own venv instead (for a debugger, or Gemini through your gcloud login), you need Python 3.12:

```sh
docker compose up -d db && docker compose stop api   # Postgres only, so port 8000 is free
cd api
python -m venv .venv
.venv/bin/pip install -c requirements.lock -e ".[dev]"   # Windows: .venv\Scripts\pip
alembic upgrade head
uvicorn app.main:app --reload      # http://localhost:8000/docs
```

To reach it from a phone running Expo Go, add `--host 0.0.0.0`. The app finds it on port 8000, like the Docker one.

### Configuration

Settings are environment variables with the `VYRO_` prefix. They are read from `api/.env` when it exists; copy [`.env.example`](.env.example) to start.

| Variable | Default | Meaning |
|---|---|---|
| `VYRO_ENV` | `local` | `local`, `test` or `prod` |
| `VYRO_DATABASE_URL` | local docker Postgres | SQLAlchemy URL (`postgresql+psycopg://...`) |
| `VYRO_AUTH_MODE` | `dev` | `dev` accepts `dev:<uid>` tokens; `firebase` verifies Firebase ID tokens. `prod` refuses `dev`. |
| `VYRO_FIREBASE_PROJECT_ID` | none | Required for `firebase` mode |
| `VYRO_CORS_ORIGINS` | `["http://localhost:8081"]` | JSON list; only matters for Expo web |
| `VYRO_PROOF_BUCKET` | none | Cloud Storage bucket for proof photos. Unset, the API stores them in `api/.uploads` and serves them at `/dev/uploads`, so the proof flow works locally. Cloud Build sets it in production. |
| `VYRO_AI_PROJECT` | none | Google Cloud project for Gemini on Vertex AI. Unset, nothing calls a model: AI drafts come from templates. Locally, run `gcloud auth application-default login` first. Cloud Build sets it in production. |
| `VYRO_AI_LOCATION` | `global` | Vertex AI location. The Gemini 3.x models are only on `global` |
| `VYRO_AI_GENERATION_MODEL` | `gemini-3.5-flash-lite` | Writes challenge drafts |
| `VYRO_AI_VERIFICATION_MODEL` | `gemini-3.5-flash` | Judges proof photos |
| `VYRO_AI_FREE_DRAFTS` | `2` | AI drafts a free user gets per rolling window; VYRO+ is unlimited |
| `VYRO_AI_FREE_WINDOW_HOURS` | `48` | Length of that window. A draft frees its slot when it's older than this |

## Auth

Every `/v1` endpoint takes `Authorization: Bearer <Firebase ID token>`. Locally and in tests, `dev:<any-id>` works instead, so you can call the API and the mock server without Firebase:

```sh
curl -H "Authorization: Bearer dev:alice" http://localhost:8000/v1/me
```

The API answers in one of three ways:
- **`401`:** the token is missing or invalid.
- **`403` with `registration_required`:** the token is valid but the user has no VYRO profile yet. The app should then show onboarding and call `POST /v1/me`.
- **`501`:** the endpoint is in the contract but not built yet.

## The contract

`contract/openapi.json` is generated from the routes and schemas, so the code is the source of truth:

```sh
python scripts/export_openapi.py           # after changing a route or schema; commit the result
```

CI fails if the file is stale. The app's TypeScript types come from it, so run `npm run gen:api` in `mobile/` too.

### Mock server

To build screens before an endpoint exists, serve fake data that matches the contract:

```sh
npx @stoplight/prism-cli mock -d -h 0.0.0.0 contract/openapi.json    # http://localhost:4010
```

Mocked requests also need a bearer token; any `dev:<id>` works.

## Tests and migrations

```sh
pytest                                    # needs the docker Postgres; uses the vyro_test database
ruff check . && ruff format --check .
alembic revision --autogenerate -m "add x" # after changing app/models.py
```

Read every autogenerated migration before committing it. For enum columns, keep only the `op.f("ck_...")` CHECK constraint (see the note in `app/models.py`). CI fails if the migrations don't match the models.

## Coach agent and MCP server

The coach (`app/coach/`) is a Gemini agent behind `/v1/coach/...`. It answers with the user's real data through tools in `app/coach/tools.py`, which call the same handlers as the REST endpoints. Tools that change data (join, leave, draft, publish) pause the agent until the user approves them in the app. It needs `VYRO_AI_PROJECT`; without it the endpoints return 503.

**Streak rescue** (`app/coach/rescue.py`) is the coach acting on its own. When Home opens, `GET /v1/coach/rescue` looks for a challenge at risk today:
- a rejected photo for today's task;
- a missed day, or today not done by 17:00 local time;
- a friend in the same challenge;
- or, with nothing active, a challenge that just ended.

Gemini picks one fix with read-only tools (`get_task`, `explain_rejection`, `find_buddies`, `recommend_next`) and ends with `propose`. The fix is one of: a lighter version of today's task (half the XP, still counts for the streak), tips for retaking the photo, a friend to check in with, or the next challenge to join. The app shows it as a card with Accept and Not today.

Guardrails:
- Nothing changes until the user accepts.
- There is at most one suggestion per user per local day.
- The agent gets at most 4 model calls.
- Every proposal is checked against the situations found. If it's invalid, or AI is off or fails, a rule picks the fix instead.

Accepted lighter tasks live in `task_swaps`. Proofs for that day are checked against the swap instead of the original task.

The coach's tools are also served over MCP at `/v1/mcp` (streamable HTTP), authenticated with the app's bearer token. MCP clients get two more tools: `submit_proof` (a base64 photo, verified like one from the app) and `check_streak_rescue`. To use them from Claude Code against the local API:

```sh
claude mcp add --transport http vyro http://localhost:8000/v1/mcp --header "Authorization: Bearer dev:<uid>"
```

## Deploy

Merging to `main` runs CI. When CI passes, Cloud Build builds the image, runs migrations and deploys to Cloud Run in `europe-west1`. GitHub signs in to Google Cloud through Workload Identity Federation, so there's no key file. The one-time Google Cloud setup is [`infra/setup-gcp.sh`](../infra/setup-gcp.sh), which can be re-run safely.

## Analytics events

The study metrics come from the `events` table. The app sends client events through `POST /v1/events` (`source = client`): `app_opened`, `app_foregrounded`, `recommendation_opened`, `vyro_plus_prompt_viewed` and `vyro_plus_prompt_tapped` (`source`: where the prompt was), and whatever else screens log with `logEvent`. The API records these itself (`source = server`), in the same transaction as the action, so a failed request records nothing:

| Event | Properties |
|---|---|
| `challenge_created` | `challenge_id`, `source`, `category`, `difficulty`, `duration_days`, `visibility`, `generation_id` |
| `challenge_joined` | `challenge_id`, `participation_id`, `recommendation_id`, `category`, `difficulty`, `duration_days`, `target_difficulty` |
| `challenge_left` | `challenge_id`, `participation_id`, `completed_tasks` |
| `proof_verified` | `proof_id`, `challenge_id`, `participation_id`, `day_number`, `verdict`, `confidence`, `model`, `latency_ms` |
| `proof_disputed` | `proof_id`, `verdict`, `confidence` |
| `proof_dispute_resolved` | `proof_id`, `approved` (from `analysis.disputes`) |
| `task_completed` | `challenge_id`, `participation_id`, `day_number`, `xp` |
| `challenge_completed` | `challenge_id`, `participation_id`, `difficulty`, `duration_days` |
| `level_up` | `level` |
| `achievement_unlocked` | `code` |
| `ai_challenge_generated` | `generation_id`, `model`, `duration_days`, `difficulty`, `latency_ms` |
| `ai_generation_rated` | `generation_id`, `model`, `rating` |
| `proof_commented` | `proof_id`, `challenge_id`, `own_proof` (replying under your own proof) |
| `coach_message_sent` | `conversation_id` |
| `coach_action_resolved` | `conversation_id`, `tools`, `approved` |
| `agent_intervention_shown` | `intervention_id`, `kind`, `source` (`agent` or `rules`), `participation_id`, `challenge_id` |
| `agent_action_accepted` | `intervention_id`, `kind` |
| `agent_intervention_dismissed` | `intervention_id`, `kind` |
| `streak_rescued` | `intervention_id`, `kind`, `accepted`, `participation_id`, `current_streak`: the user completed the task the coach stepped in about, the same day |

To record a new one, call `events.log(db, user, "name", key=value)` from `app/services/events.py` and add it here.

## Study tools

The `analysis/` scripts aren't deployed. Run them from `api/`:

| Command | What it does |
|---|---|
| `python -m analysis.export --out study-data` | Pseudonymized CSV export of the users who gave research consent (`--all-users` for test runs). No names, titles, goals, captions or photos |
| `python -m analysis.metrics study-data` | The RQ1-RQ3 and generation metrics per study group, as Markdown (`--json` for raw numbers) |
| `python -m analysis.labels export --rater rater1 --out to-rate`, then `import to-rate/rater1.csv --rater rater1` | Human rating of proof photos, the ground truth for RQ3. Raters don't see the AI verdict |
| `python -m analysis.disputes list`, `approve <proof_id>`, `reject <proof_id>` | Review disputed proofs. Approving awards the task as of when the photo was sent |

To use them on production data, connect through the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy):

```sh
cloud-sql-proxy vyro-app-2026:europe-west1:vyro-db --port 5433
# The password is inside the URL stored in Secret Manager:
#   gcloud secrets versions access latest --secret=vyro-database-url --project=vyro-app-2026
export VYRO_DATABASE_URL="postgresql+psycopg://vyro:<password>@localhost:5433/vyro"
export VYRO_PROOF_BUCKET=vyro-app-2026-proofs   # analysis.labels downloads photos from here
```

`study-data*/` and `to-rate*/` are git-ignored. Keep them within the study team and delete rating folders when the rating is done.

## Who builds what

| Router (`app/routers/`) | Endpoints | Owner |
|---|---|---|
| `me.py` | `/v1/me`, `/v1/users` | Member B (`GET /v1/me` built early by A, for local data) |
| `social.py` | follow, followers, friends | Member B |
| `shop.py` | sandbox shop, entitlements | Member B |
| `challenges.py` | browse, create, join, progress | Member A |
| `proofs.py` | photo upload and AI verification | Member A |
| `ai.py` | AI challenge generator, quota | Member A |
| `recommendations.py` | recommendations | Member A |
| `leaderboard.py` | per-challenge leaderboard | Member A |
| `gamification.py` | achievements | Member A |
| `events.py` | analytics events | Member A |
| `moderation.py` | report button | not assigned yet |

The request and response shapes for Member B's endpoints are a first proposal. Change them as the screens need, then regenerate the contract.
