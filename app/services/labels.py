import re
from dataclasses import dataclass
from enum import Enum


class Clarity(Enum):
    """Task clarity level - determines energy required to work on it."""

    EXECUTABLE = "executable"  # Clear next action, can do when tired
    DEFINED = "defined"  # Defined but needs focus
    EXPLORATORY = "exploratory"  # Needs research, requires deep focus


CLARITY_LABELS = {
    "executable": Clarity.EXECUTABLE,
    "defined": Clarity.DEFINED,
    "exploratory": Clarity.EXPLORATORY,
}

# Pattern to match duration in description: d:30m, d:2h, d:1h30m
DURATION_PATTERN = re.compile(r"d:(?:(\d+)h)?(?:(\d+)m)?", re.IGNORECASE)


@dataclass
class TaskMetadata:
    """Parsed label metadata from a Todoist task."""

    clarity: Clarity | None = None
    duration_minutes: int | None = None
    other_labels: list[str] | None = None

    def __post_init__(self):
        if self.other_labels is None:
            self.other_labels = []

    def is_unlabeled(self) -> bool:
        """Returns True if task is missing clarity label (needs triage)."""
        return self.clarity is None


def parse_duration(description: str) -> int | None:
    """Parse duration from task description (e.g., 'd:30m', 'd:2h', 'd:1h30m')."""
    match = DURATION_PATTERN.search(description)
    if not match:
        return None

    hours = int(match.group(1)) if match.group(1) else 0
    minutes = int(match.group(2)) if match.group(2) else 0

    total = hours * 60 + minutes
    return total if total > 0 else None


def parse_labels(labels: list[str], description: str = "") -> TaskMetadata:
    """Parse Todoist labels and description into structured TaskMetadata."""
    clarity = None
    other_labels = []

    for label in labels:
        label_lower = label.lower()

        if label_lower in CLARITY_LABELS:
            clarity = CLARITY_LABELS[label_lower]
        else:
            other_labels.append(label)

    duration_minutes = parse_duration(description)

    return TaskMetadata(
        clarity=clarity,
        duration_minutes=duration_minutes,
        other_labels=other_labels,
    )


def clarity_display(clarity: Clarity | None) -> str:
    """Human-readable clarity level."""
    if clarity is None:
        return ""
    return {
        Clarity.EXECUTABLE: "Executable",
        Clarity.DEFINED: "Defined",
        Clarity.EXPLORATORY: "Exploratory",
    }[clarity]
