"""Write the API contract to contract/openapi.json.

python scripts/export_openapi.py          # regenerate after changing routes or schemas
python scripts/export_openapi.py --check  # exit 1 if the committed file is stale (CI)
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app

CONTRACT = Path(__file__).resolve().parents[2] / "contract" / "openapi.json"


def render() -> str:
    return json.dumps(create_app().openapi(), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    current = render()
    if "--check" in sys.argv:
        committed = CONTRACT.read_text(encoding="utf-8") if CONTRACT.exists() else ""
        if committed.replace("\r\n", "\n") != current:
            print(f"{CONTRACT} is out of date; run: python scripts/export_openapi.py")
            return 1
        print("Contract is up to date")
        return 0
    CONTRACT.parent.mkdir(exist_ok=True)
    CONTRACT.write_text(current, encoding="utf-8", newline="\n")
    print(f"Wrote {CONTRACT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
