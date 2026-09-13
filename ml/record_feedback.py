"""Record one Together feedback event into the local preference dataset."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "dataset" / "feedback.csv"

ACTIONS = {"like", "favorite", "complete", "skip", "too_easy", "too_deep", "dislike"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Record Together preference feedback")
    parser.add_argument("--couple-id", required=True)
    parser.add_argument("--item-type", required=True, choices=["activity", "question"])
    parser.add_argument("--item-id", required=True)
    parser.add_argument("--action", required=True, choices=sorted(ACTIONS))
    parser.add_argument("--category", default="")
    parser.add_argument("--mood", default="")
    parser.add_argument("--intimacy-level", default="")
    parser.add_argument("--energy-level", default="")
    parser.add_argument("--occasion", default="")
    parser.add_argument("--relationship-stage", default="")
    parser.add_argument("--bonding-level", default="")
    args = parser.parse_args()

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    fields = ["couple_id", "item_type", "item_id", "action", "category", "mood",
              "intimacy_level", "energy_level", "occasion", "relationship_stage", "bonding_level"]
    exists = DATA_PATH.exists()
    with DATA_PATH.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        if not exists:
            writer.writeheader()
        writer.writerow({
            "couple_id": args.couple_id,
            "item_type": args.item_type,
            "item_id": args.item_id,
            "action": args.action,
            "category": args.category,
            "mood": args.mood,
            "intimacy_level": args.intimacy_level,
            "energy_level": args.energy_level,
            "occasion": args.occasion,
            "relationship_stage": args.relationship_stage,
            "bonding_level": args.bonding_level,
        })
    print(f"Recorded feedback for {args.couple_id}: {args.item_type} {args.item_id} -> {args.action}")
    print(f"Dataset: {DATA_PATH}")


if __name__ == "__main__":
    main()
