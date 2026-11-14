# VYRO
Venture Yourself, Rise Onward

*Don't just scroll. Challenge yourself.*

VYRO is a mobile social app. Users take on AI-generated challenges alone or with friends, prove they completed them with a photo, and earn XP, streaks and badges. It is a two-person semester project. The prototype also measures whether AI personalization and adaptive difficulty raise completion and retention compared with a non-AI baseline.

## Repository

| Path | What it is |
|---|---|
| [`api/`](api/) | FastAPI backend on Cloud Run, with PostgreSQL. See [`api/README.md`](api/README.md) |
| [`mobile/`](mobile/) | React Native app (Expo SDK 58, expo-router), run in Expo Go |
| [`contract/openapi.json`](contract/openapi.json) | API contract generated from `api/`; the app's types come from it |
| [`infra/`](infra/) | Google Cloud setup scripts and local dev config |
| `docker-compose.yml` | Local Postgres for development and tests |

## Quick start

```sh
docker compose up -d                                   # Postgres and the API on :8000; they restart with Docker
docker compose exec api python scripts/seed.py --uid dev-<you>   # once: challenges, users, progress
cd mobile && npm install && npx expo start             # scan the QR code with Expo Go
```

In `mobile/.env`, set `EXPO_PUBLIC_DEV_UID=dev-<you>` and leave `EXPO_PUBLIC_API_URL` unset: the app then finds the local API on its own (see [`mobile/.env.example`](mobile/.env.example)). If the phone can't reach it, allow Docker through the Windows firewall for private networks.

## How we work

- Each change goes on its own branch with a pull request. The other member reviews it, and it is merged with a merge commit.
- CI runs on every pull request: API lint, migrations, tests and the contract check, plus the mobile typecheck and lint.
- Merging to `main` deploys the API automatically.
