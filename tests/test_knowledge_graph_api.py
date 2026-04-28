from fastapi.testclient import TestClient

from api.main import app


def test_load_graph_missing_path_returns_optional_not_found_payload():
    client = TestClient(app)

    response = client.post(
        "/load-graph",
        data={"dir_path": "missing_test_graph_path", "kb_type": "global"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is False
    assert payload["exists"] is False
    assert payload["kb_type"] == "global"
