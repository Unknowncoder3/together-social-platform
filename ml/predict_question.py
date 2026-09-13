"""Recommend Together questions for a new session context.

Usage:
    python3 ml/predict_question.py --mood romantic --energy medium --occasion date_night \
      --relationship serious --depth 3 --bonding 4 --intimacy moderate \
      --couple-only true --consent true

To test repetition, pass --previous-question multiple times.
"""

from __future__ import annotations

import argparse
import sys

from question_engine import QuestionEngine


def boolean(value: str) -> bool:
    value = value.strip().lower()
    if value not in {"true", "false"}:
        raise argparse.ArgumentTypeError("use true or false")
    return value == "true"


def main() -> None:
    parser = argparse.ArgumentParser(description="Rank Together questions")
    parser.add_argument("--mood", required=True)
    parser.add_argument("--energy", required=True, dest="energy_level")
    parser.add_argument("--occasion", required=True)
    parser.add_argument("--relationship", required=True, dest="relationship_stage")
    parser.add_argument("--depth", type=int, default=2)
    parser.add_argument("--bonding", type=int, default=1, dest="bonding_level")
    parser.add_argument("--intimacy", default="light", dest="intimacy_level")
    parser.add_argument("--couple-only", type=boolean, default=False, dest="couple_only")
    parser.add_argument("--consent", type=boolean, default=False)
    parser.add_argument("--top", type=int, default=5)
    parser.add_argument(
        "--previous-question",
        action="append",
        default=[],
        help="A previously asked question. Repeat the flag to provide several.",
    )
    args = parser.parse_args()

    try:
        engine = QuestionEngine()
    except FileNotFoundError as exc:
        print(exc)
        sys.exit(1)

    context = {
        "mood": args.mood,
        "energy_level": args.energy_level,
        "occasion": args.occasion,
        "relationship_stage": args.relationship_stage,
        "depth": max(1, min(5, args.depth)),
        "bonding_level": max(1, min(5, args.bonding_level)),
        "intimacy_level": args.intimacy_level,
        "couple_only": args.couple_only,
        "consent": args.consent,
    }

    results = engine.rank(context, args.previous_question, args.top)

    print("Together Question Intelligence")
    print("------------------------------")
    print(f"Context: {args.mood} | {args.occasion} | {args.relationship_stage}")
    print(f"Bonding: {args.bonding_level} | Intimacy: {args.intimacy_level} | Consent: {args.consent}")
    print()

    if not results:
        print("No safe matching questions found for this context.")
        return

    print("Recommended Questions")
    for rank, item in enumerate(results, start=1):
        print(f"{rank}. {item['question']}")
        print(
            f"   relevance={item['relevance']:.4f} | category={item['category']} | "
            f"depth={item['depth']} | previous_similarity={item['similarity_to_previous']:.4f}"
        )

    if args.previous_question:
        print("\nRepetition check")
        print("----------------")
        for item in results:
            similarity = item["similarity_to_previous"]
            label = "HIGH SIMILARITY" if similarity >= 0.72 else "OK"
            print(f"{item['question']} -> {similarity:.4f} [{label}]")


if __name__ == "__main__":
    main()
