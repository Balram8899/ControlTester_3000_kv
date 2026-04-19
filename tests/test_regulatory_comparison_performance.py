from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from utils.regulatory_comparision import ControlExtractorAgent


def _chunk(text: str, source: str = "reg-a.pdf"):
    return SimpleNamespace(page_content=text, metadata={"source": source})


def test_control_extractor_processes_one_chunk_per_request():
    fake_llm = MagicMock()
    fake_llm.invoke.return_value = "[]"
    chunks = [_chunk("Control requirement one."), _chunk("Control requirement two.")]

    with patch("utils.regulatory_comparision._make_llm", return_value=fake_llm):
        agent = ControlExtractorAgent("llama3:latest")
        agent.run(chunks)

    assert fake_llm.invoke.call_count == 2


def test_control_extractor_truncates_large_chunk_text_in_prompt():
    fake_llm = MagicMock()
    fake_llm.invoke.return_value = "[]"
    long_text = "A" * 5000

    with patch("utils.regulatory_comparision._make_llm", return_value=fake_llm):
        agent = ControlExtractorAgent("llama3:latest")
        agent.run([_chunk(long_text)])

    prompt = fake_llm.invoke.call_args.args[0]
    assert long_text not in prompt
    assert "A" * 1800 in prompt
