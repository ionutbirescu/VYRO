"""Study metrics from an export folder (see analysis.export), per study group.

    python -m analysis.metrics study-data           # Markdown report
    python -m analysis.metrics study-data --json    # the same numbers as JSON

RQ1: recommendation hit rate, precision@5 and NDCG@5. RQ2: completion rate, 14-day retention
and streak length. Generation: schema validity, rating, publish and edit rates. RQ3: AI
verification against human raters (accuracy, precision, recall, Cohen's kappa, calibration
error) and the dispute rate. These are descriptive numbers; significance tests belong to the
evaluation chapter.
"""

import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean, median
from typing import Any

K = 5
RETENTION_DAYS = 14
Row = dict[str, str]


# --- Building blocks --------------------------------------------------------------------------


def cohen_kappa(a: Sequence[bool], b: Sequence[bool]) -> float | None:
    """Agreement between two binary raters beyond chance. None when it is undefined."""
    n = len(a)
    if n == 0:
        return None
    observed = sum(x == y for x, y in zip(a, b, strict=True)) / n
    rate_a, rate_b = sum(a) / n, sum(b) / n
    chance = rate_a * rate_b + (1 - rate_a) * (1 - rate_b)
    if chance == 1:
        return None
    return (observed - chance) / (1 - chance)


def expected_calibration_error(
    confidences: Sequence[float], correct: Sequence[bool], bins: int = 10
) -> float | None:
    """Mean gap between confidence and accuracy over equal-width bins, weighted by bin size."""
    n = len(confidences)
    if n == 0:
        return None
    binned: dict[int, list[int]] = defaultdict(list)
    for index, confidence in enumerate(confidences):
        binned[min(bins - 1, int(confidence * bins))].append(index)
    return sum(
        len(members)
        / n
        * abs(mean(correct[i] for i in members) - mean(confidences[i] for i in members))
        for members in binned.values()
    )


def ndcg(gains: Sequence[float], k: int = K) -> float | None:
    """NDCG@k of a ranked list, against the best ordering of the same items."""

    def dcg(values: Iterable[float]) -> float:
        return sum(gain / math.log2(rank + 2) for rank, gain in enumerate(values))

    ideal = dcg(sorted(gains, reverse=True)[:k])
    return dcg(gains[:k]) / ideal if ideal else None


# --- Loading ----------------------------------------------------------------------------------


class Data:
    def __init__(self, folder: Path) -> None:
        def rows(name: str) -> list[Row]:
            with (folder / f"{name}.csv").open(newline="", encoding="utf-8") as file:
                return list(csv.DictReader(file))

        meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        self.exported_at = datetime.fromisoformat(meta["exported_at"])
        self.users = rows("users")
        self.challenges = {c["challenge_id"]: c for c in rows("challenges")}
        self.participations = rows("participations")
        self.proofs = rows("proofs")
        self.labels = rows("proof_labels")
        self.generations = rows("ai_generations")
        self.events = rows("events")
        self.group = {u["user"]: u["study_group"] for u in self.users}

    def groups(self) -> list[str]:
        return sorted(set(self.group.values()))


def _time(value: str) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _rate(hits: int, total: int) -> float | None:
    return hits / total if total else None


def _avg(values: Iterable[float]) -> float | None:
    values = list(values)
    return mean(values) if values else None


def _by_group(data: Data, rows: Iterable[Row]) -> dict[str, list[Row]]:
    grouped: dict[str, list[Row]] = {group: [] for group in data.groups()}
    for row in rows:
        if row["user"] in data.group:
            grouped[data.group[row["user"]]].append(row)
    return grouped


# --- RQ2: completion, retention, streaks ------------------------------------------------------


def completion(data: Data) -> dict[str, dict[str, Any]]:
    """Over participations whose full duration has passed, so ones still running don't count."""
    result = {}
    for group, rows in _by_group(data, data.participations).items():
        due = []
        for p in rows:
            days = int(data.challenges[p["challenge_id"]]["duration_days"])
            joined_at = _time(p["joined_at"])
            if joined_at and joined_at + timedelta(days=days) <= data.exported_at:
                due.append(p)
        statuses = Counter(p["status"] for p in due)
        gaps = [
            abs(int(data.challenges[p["challenge_id"]]["difficulty"]) - int(target))
            for p in rows
            if (target := p["target_difficulty_at_join"])
        ]
        result[group] = {
            "participations": len(rows),
            "due": len(due),
            "completion_rate": _rate(statuses["completed"], len(due)),
            "abandon_rate": _rate(statuses["abandoned"], len(due)),
            "mean_difficulty_gap": _avg(gaps),
        }
    return result


def retention(data: Data, days: int = RETENTION_DAYS) -> dict[str, dict[str, Any]]:
    """Share of users with any activity `days` or more after they joined, among users who
    joined at least `days` ago."""
    last_seen: dict[str, datetime] = {}
    for event in data.events:
        at = _time(event["created_at"])
        if at and (event["user"] not in last_seen or at > last_seen[event["user"]]):
            last_seen[event["user"]] = at
    result = {}
    for group, users in _by_group(data, data.users).items():
        eligible = [
            u
            for u in users
            if (joined := _time(u["joined_at"]))
            and joined + timedelta(days=days) <= data.exported_at
        ]
        retained = [
            u
            for u in eligible
            if u["user"] in last_seen
            and last_seen[u["user"]]
            >= datetime.fromisoformat(u["joined_at"]) + timedelta(days=days)
        ]
        streaks = [int(u["longest_streak"]) for u in users]
        result[group] = {
            "users": len(users),
            "eligible": len(eligible),
            "retention_rate": _rate(len(retained), len(eligible)),
            "mean_longest_streak": _avg(streaks),
            "median_longest_streak": median(streaks) if streaks else None,
        }
    return result


# --- RQ1: recommendations ---------------------------------------------------------------------


def recommendations(data: Data) -> dict[str, dict[str, Any]]:
    """A served item is relevant if the user joined it with that list's recommendation_id:
    gain 2 if they went on to complete it, 1 otherwise."""
    gains: dict[tuple[str, str], int] = {}
    for p in data.participations:
        if p["recommendation_id"]:
            gain = 2 if p["status"] == "completed" else 1
            key = (p["recommendation_id"], p["challenge_id"])
            gains[key] = max(gains.get(key, 0), gain)

    served = [e for e in data.events if e["name"] == "recommendations_served"]
    result = {}
    for group, events in _by_group(data, served).items():
        lists, strategies = [], Counter()
        for event in events:
            properties = json.loads(event["properties"])
            strategies[properties.get("strategy", "?")] += 1
            items = sorted(properties["items"], key=lambda item: item["rank"])[:K]
            lists.append(
                [
                    gains.get((properties["recommendation_id"], item["challenge_id"]), 0)
                    for item in items
                ]
            )
        non_empty = [items for items in lists if items]
        hits = [items for items in non_empty if any(items)]
        result[group] = {
            "lists_served": len(lists),
            "strategy": dict(strategies),
            "hit_rate": _rate(len(hits), len(non_empty)),
            "precision_at_5": _avg(sum(1 for g in items if g) / len(items) for items in non_empty),
            # Over lists that led to at least one join: NDCG is undefined for the others.
            "ndcg_at_5": _avg(score for items in hits if (score := ndcg(items)) is not None),
            "completed_after_join": _rate(
                sum(1 for items in hits for g in items if g == 2),
                sum(1 for items in hits for g in items if g),
            ),
        }
    return result


# --- Challenge generation ---------------------------------------------------------------------


def _kind(model: str) -> str:
    if model == "template":
        return "template (baseline)"
    if model == "template-fallback":
        return "template (fallback)"
    return "model"


def generation(data: Data) -> dict[str, dict[str, Any]]:
    by_kind: dict[str, list[Row]] = defaultdict(list)
    for row in data.generations:
        by_kind[_kind(row["model"])].append(row)
    result = {}
    for kind, rows in sorted(by_kind.items()):
        delivered = [r for r in rows if r["failed"] == "0"]
        published = [r for r in delivered if r["published"] == "1"]
        ratings = [int(r["rating"]) for r in delivered if r["rating"]]
        result[kind] = {
            "calls": len(rows),
            "schema_valid_rate": _rate(sum(r["schema_valid"] == "1" for r in rows), len(rows)),
            "drafts": len(delivered),
            "mean_rating": _avg(ratings),
            "ratings": len(ratings),
            "publish_rate": _rate(len(published), len(delivered)),
            "edit_rate": _rate(
                sum(r["edited_before_publish"] == "1" for r in published), len(published)
            ),
            "mean_latency_ms": _avg(int(r["latency_ms"]) for r in rows if r["latency_ms"]),
        }
    return result


# --- RQ3: verification ------------------------------------------------------------------------


def _human_truth(labels: list[Row]) -> dict[str, bool]:
    """Majority label per proof; ties are left out."""
    votes: dict[str, list[bool]] = defaultdict(list)
    for label in labels:
        votes[label["proof_id"]].append(label["is_valid"] == "1")
    return {proof: sum(v) > len(v) / 2 for proof, v in votes.items() if sum(v) * 2 != len(v)}


def _inter_rater_kappa(labels: list[Row]) -> dict[str, Any] | None:
    """Cohen's kappa between the two raters who labelled the most proofs in common."""
    by_rater: dict[str, dict[str, bool]] = defaultdict(dict)
    for label in labels:
        by_rater[label["rater"]][label["proof_id"]] = label["is_valid"] == "1"
    raters = sorted(by_rater)
    best = None
    for i, first in enumerate(raters):
        for second in raters[i + 1 :]:
            shared = sorted(by_rater[first].keys() & by_rater[second].keys())
            if shared and (best is None or len(shared) > len(best[2])):
                best = (first, second, shared)
    if best is None:
        return None
    first, second, shared = best
    return {
        "raters": [first, second],
        "proofs": len(shared),
        "kappa": cohen_kappa(
            [by_rater[first][p] for p in shared], [by_rater[second][p] for p in shared]
        ),
    }


def verification(data: Data) -> dict[str, Any]:
    """Proofs judged by the model (those with a confidence) against the raters' majority.
    A pass verdict is a positive prediction; fail and unsure are negative."""
    scored = [p for p in data.proofs if p["ai_confidence"]]
    truth = _human_truth(data.labels)
    labelled = [p for p in scored if p["proof_id"] in truth]
    predicted = [p["ai_verdict"] == "pass" for p in labelled]
    actual = [truth[p["proof_id"]] for p in labelled]
    correct = [x == y for x, y in zip(predicted, actual, strict=True)]
    true_positives = sum(x and y for x, y in zip(predicted, actual, strict=True))
    rejected = [p for p in scored if p["ai_verdict"] != "pass"]
    return {
        "proofs_scored": len(scored),
        "verdicts": dict(Counter(p["ai_verdict"] for p in scored)),
        "proofs_labelled": len(labelled),
        "accuracy": _rate(sum(correct), len(correct)),
        "precision": _rate(true_positives, sum(predicted)),
        "recall": _rate(true_positives, sum(actual)),
        "kappa": cohen_kappa(predicted, actual),
        "calibration_error": expected_calibration_error(
            [float(p["ai_confidence"]) for p in labelled], correct
        ),
        "inter_rater": _inter_rater_kappa(data.labels),
        "dispute_rate": _rate(sum(p["disputed"] == "1" for p in rejected), len(rejected)),
        "mean_latency_ms": _avg(int(p["ai_latency_ms"]) for p in scored if p["ai_latency_ms"]),
    }


# --- Report -----------------------------------------------------------------------------------


def report(data: Data) -> dict[str, Any]:
    return {
        "exported_at": data.exported_at.isoformat(),
        "rq1_recommendations": recommendations(data),
        "rq2_completion": completion(data),
        "rq2_retention": retention(data),
        "generation": generation(data),
        "rq3_verification": verification(data),
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.3f}"
    if isinstance(value, dict):
        return ", ".join(f"{k}: {v}" for k, v in value.items()) or "n/a"
    return str(value)


def _table(title: str, columns: dict[str, dict[str, Any]], note: str = "") -> list[str]:
    if not columns:
        return [f"## {title}", "", "No data yet.", ""]
    names = list(columns)
    metrics = list(next(iter(columns.values())))
    lines = [f"## {title}", ""]
    if note:
        lines += [note, ""]
    lines.append("| | " + " | ".join(names) + " |")
    lines.append("|---" * (len(names) + 1) + "|")
    lines += [
        f"| {metric} | " + " | ".join(_fmt(columns[n][metric]) for n in names) + " |"
        for metric in metrics
    ]
    return [*lines, ""]


def markdown(numbers: dict[str, Any]) -> str:
    verify = numbers["rq3_verification"]
    return "\n".join(
        [
            f"# VYRO study metrics (export of {numbers['exported_at']})",
            "",
            *_table(
                "RQ1: recommendations",
                numbers["rq1_recommendations"],
                "A served item counts if the user joined it from that list.",
            ),
            *_table(
                "RQ2: completion",
                numbers["rq2_completion"],
                "Over participations whose full duration has passed.",
            ),
            *_table(
                f"RQ2: {RETENTION_DAYS}-day retention and streaks",
                numbers["rq2_retention"],
                f"Users with any activity {RETENTION_DAYS}+ days after joining, among users who "
                f"joined {RETENTION_DAYS}+ days before the export.",
            ),
            *_table("Challenge generation", numbers["generation"]),
            *_table(
                "RQ3: AI verification vs human raters",
                {"model": {k: v for k, v in verify.items() if k != "inter_rater"}},
                "Positive = pass. Proofs approved without a model score are left out.",
            ),
            f"Inter-rater agreement: {_fmt(verify['inter_rater'])}",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", type=Path, help="An export folder from analysis.export")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown")
    args = parser.parse_args()
    numbers = report(Data(args.folder))
    print(json.dumps(numbers, indent=2) if args.json else markdown(numbers))


if __name__ == "__main__":
    main()
