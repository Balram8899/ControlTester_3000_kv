from unittest.mock import patch

from utils.llm_chain import assess_evidence_with_kb


class FakeUpload:
    name = "access_review_evidence.txt"

    def read(self):
        return b"Quarterly access review completed for administrator accounts."


def test_assess_evidence_with_kb_loads_uploaded_evidence_before_assessing():
    with patch("utils.llm_chain._assess_single_evidence", return_value={"assessment": "ok"}) as assess:
        results = assess_evidence_with_kb([FakeUpload()], selected_model="fake-model", max_workers=1)

    assert results == [{"assessment": "ok"}]
    assert assess.call_count == 1
