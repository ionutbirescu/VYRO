"""Seed built-in challenges into the production API.

    python scripts/seed_production.py --email you@example.com --password yourpassword

Reads Firebase credentials from mobile/.env, signs in, then POSTs every challenge
from seed_challenges.py to the production API. Skips challenges that already exist
(same title + category). Safe to run multiple times.
"""

import argparse
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.seed_challenges import CHALLENGES

API_URL = "https://vyro-api-2aczsavhwq-ew.a.run.app"

# Read Firebase config from mobile/.env
def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def get_firebase_token(api_key: str, email: str, password: str) -> str:
    # Try sign-in first
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    payload = {"email": email, "password": password, "returnSecureToken": True}
    resp = requests.post(url, json=payload)
    if resp.ok:
        return resp.json()["idToken"]

    error = resp.json().get("error", {}).get("message", "")
    if "INVALID_LOGIN_CREDENTIALS" not in error and "EMAIL_NOT_FOUND" not in error:
        sys.exit(f"Firebase sign-in failed: {resp.json()}")

    # Account doesn't exist — sign up
    print("Account not found, creating Firebase account...")
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}"
    resp = requests.post(url, json=payload)
    if not resp.ok:
        sys.exit(f"Firebase sign-up failed: {resp.json()}")
    print("Firebase account created.")
    return resp.json()["idToken"]


def ensure_vyro_profile(token: str) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{API_URL}/v1/me", headers=headers)
    if resp.status_code == 200:
        print(f"VYRO profile exists: @{resp.json()['username']}")
        return
    if resp.status_code != 403:
        sys.exit(f"Unexpected response from GET /v1/me: {resp.status_code} {resp.text}")

    # Create profile
    print("Creating VYRO profile...")
    username = "seeduser"
    profile = {"username": username, "name": "Seed User"}
    r = requests.post(f"{API_URL}/v1/me", headers=headers, json=profile)
    if r.status_code == 409:
        # Username taken, try a unique one
        import time as _time
        profile["username"] = f"seed{int(_time.time()) % 10000}"
        r = requests.post(f"{API_URL}/v1/me", headers=headers, json=profile)
    if not r.ok:
        sys.exit(f"Failed to create VYRO profile: {r.status_code} {r.text}")
    print(f"VYRO profile created: @{r.json()['username']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    env_path = Path(__file__).resolve().parents[2] / "mobile" / ".env"
    env = load_env(env_path)
    api_key = env.get("EXPO_PUBLIC_FIREBASE_API_KEY", "")
    if not api_key:
        sys.exit("EXPO_PUBLIC_FIREBASE_API_KEY not found in mobile/.env")

    print("Signing in to Firebase...")
    token = get_firebase_token(api_key, args.email, args.password)
    headers = {"Authorization": f"Bearer {token}"}
    ensure_vyro_profile(token)

    # Fetch existing challenges to avoid duplicates
    resp = requests.get(f"{API_URL}/v1/challenges", headers=headers)
    resp.raise_for_status()
    existing = {(c["title"], c["category"]) for c in resp.json()["items"]}
    print(f"Found {len(existing)} existing challenges.")

    created = skipped = failed = 0
    for ch in CHALLENGES:
        title = ch["title"]
        category = ch["category"].value
        if (title, category) in existing:
            print(f"  skip  {title}")
            skipped += 1
            continue

        payload = {
            "title": title,
            "description": ch["description"],
            "category": category,
            "difficulty": ch["difficulty"],
            "duration_days": ch["duration_days"],
            "tasks": [
                {
                    "day_number": t[0],
                    "title": t[1],
                    "instructions": t[2],
                    "proof_hint": t[3],
                }
                for t in ch["tasks"]
            ],
        }

        r = requests.post(f"{API_URL}/v1/challenges", json=payload, headers=headers)
        if r.status_code == 201:
            print(f"  ok    {title}")
            created += 1
        else:
            print(f"  FAIL  {title} — {r.status_code}: {r.text[:120]}")
            failed += 1

    print(f"\nDone: {created} created, {skipped} skipped, {failed} failed.")


if __name__ == "__main__":
    main()
