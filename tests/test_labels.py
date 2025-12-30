from app.services.labels import (
    Clarity,
    clarity_display,
    parse_duration,
    parse_labels,
)


class TestParseLabels:
    def test_parse_clarity_labels(self):
        """Test clarity labels."""
        result = parse_labels(["executable"])
        assert result.clarity == Clarity.EXECUTABLE

        result = parse_labels(["defined"])
        assert result.clarity == Clarity.DEFINED

        result = parse_labels(["exploratory"])
        assert result.clarity == Clarity.EXPLORATORY

    def test_parse_multiple_labels(self):
        """Test parsing multiple labels at once."""
        result = parse_labels(["executable", "work", "urgent"])

        assert result.clarity == Clarity.EXECUTABLE
        assert result.other_labels == ["work", "urgent"]

    def test_parse_empty_labels(self):
        """Test parsing empty label list."""
        result = parse_labels([])

        assert result.clarity is None
        assert result.other_labels == []

    def test_parse_unknown_labels(self):
        """Test that unknown labels go to other_labels."""
        result = parse_labels(["project-x", "meeting", "followup"])

        assert result.clarity is None
        assert result.other_labels == ["project-x", "meeting", "followup"]

    def test_case_insensitivity(self):
        """Test that label matching is case-insensitive."""
        result = parse_labels(["Executable"])
        assert result.clarity == Clarity.EXECUTABLE

        result = parse_labels(["DEFINED"])
        assert result.clarity == Clarity.DEFINED

    def test_is_unlabeled_missing_clarity(self):
        """Test is_unlabeled returns True when clarity is missing."""
        result = parse_labels(["other-label"])
        assert result.is_unlabeled() is True

    def test_is_unlabeled_clarity_present(self):
        """Test is_unlabeled returns False when clarity is present."""
        result = parse_labels(["executable"])
        assert result.is_unlabeled() is False


class TestParseDuration:
    def test_parse_minutes(self):
        """Test parsing minutes only."""
        assert parse_duration("d:30m") == 30
        assert parse_duration("d:45m") == 45
        assert parse_duration("Some text d:15m more text") == 15

    def test_parse_hours(self):
        """Test parsing hours only."""
        assert parse_duration("d:2h") == 120
        assert parse_duration("d:1h") == 60

    def test_parse_hours_and_minutes(self):
        """Test parsing combined hours and minutes."""
        assert parse_duration("d:1h30m") == 90
        assert parse_duration("d:2h15m") == 135

    def test_parse_no_duration(self):
        """Test parsing when no duration present."""
        assert parse_duration("") is None
        assert parse_duration("no duration here") is None

    def test_case_insensitivity(self):
        """Test that duration parsing is case-insensitive."""
        assert parse_duration("D:30M") == 30
        assert parse_duration("d:2H") == 120
        assert parse_duration("D:1H30M") == 90

    def test_duration_in_metadata(self):
        """Test that duration is parsed into TaskMetadata."""
        result = parse_labels(["executable"], "Task with d:45m duration")
        assert result.duration_minutes == 45
        assert result.clarity == Clarity.EXECUTABLE


class TestDisplayFunctions:
    def test_clarity_display(self):
        """Test clarity display strings."""
        assert clarity_display(Clarity.EXECUTABLE) == "Executable"
        assert clarity_display(Clarity.DEFINED) == "Defined"
        assert clarity_display(Clarity.EXPLORATORY) == "Exploratory"
        assert clarity_display(None) == ""
