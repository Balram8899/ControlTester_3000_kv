# tests/test_controls_quality.py
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def _w1h_result():
    return {
        "control_id": "c1",
        "control_name": "Access Review",
        "what": True, "why": True, "who": True,
        "when": False, "where": True, "how": False,
        "score": 4,
        "rag": "amber",
        "rationale": {
            "what": "Control activity is stated.",
            "why": "Objective is clear.",
            "who": "Owner identified.",
            "when": "No cadence specified.",
            "where": "Scope implicit.",
            "how": "Mechanism not described.",
        },
        "queue_finding": True,
    }


@patch("api.routers.controls_quality._run_5w1h_llm")
def test_quality_analysis_returns_results(mock_llm):
    from api.main import app
    mock_llm.return_value = [_w1h_result()]
    resp = TestClient(app).post(
        "/controls-library/quality-analysis",
        json={"controls": [{"control_id": "c1", "name": "Access Review", "description": "Quarterly access review"}]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["rag"] == "amber"
    assert data["results"][0]["queue_finding"] is True


@patch("api.routers.controls_quality._run_5w1h_llm")
def test_quality_analysis_empty_controls(mock_llm):
    from api.main import app
    resp = TestClient(app).post(
        "/controls-library/quality-analysis",
        json={"controls": []},
    )
    assert resp.status_code == 422


@patch("utils.llm_provider.get_llm")
def test_run_5w1h_llm_formats_prompt_and_parses_json(mock_get_llm):
    from api.routers.controls_quality import ControlInput, _run_5w1h_llm

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="""
    [
      {
        "control_id": "c1",
        "control_name": "Access Review",
        "what": true,
        "why": true,
        "who": true,
        "when": false,
        "where": true,
        "how": false,
        "score": 4,
        "rag": "amber",
        "rationale": {
          "what": "Control activity is stated.",
          "why": "Objective is clear.",
          "who": "Owner identified.",
          "when": "No cadence specified.",
          "where": "Scope is clear.",
          "how": "Mechanism not described."
        },
        "queue_finding": true
      }
    ]
    """)
    mock_get_llm.return_value = mock_llm

    results = _run_5w1h_llm([
        ControlInput(
            control_id="c1",
            name="Access Review",
            description="Quarterly access review by system owner",
        )
    ])

    assert results[0]["control_id"] == "c1"
    prompt = mock_llm.invoke.call_args[0][0][0].content
    assert '"control_id"' in prompt
    assert "Controls to evaluate:" in prompt
