import pytest
from utils.assessment_questions import get_sections, SECTIONS


def test_exactly_eight_sections():
    sections = get_sections()
    assert len(sections) == 8


def test_section_structure():
    for s in get_sections():
        assert "id" in s
        assert "title" in s
        assert "questions" in s
        assert isinstance(s["questions"], list)
        assert len(s["questions"]) >= 4


def test_question_structure():
    for s in get_sections():
        for q in s["questions"]:
            assert "id" in q
            assert "text" in q
            assert q["question_type"] in ("Exposure", "Control", "Context")


def test_question_ids_are_unique():
    all_ids = [q["id"] for s in get_sections() for q in s["questions"]]
    assert len(all_ids) == len(set(all_ids))


def test_section_ids_are_unique():
    ids = [s["id"] for s in get_sections()]
    assert len(ids) == len(set(ids))


def test_sections_returns_all_sections():
    assert get_sections() == SECTIONS
