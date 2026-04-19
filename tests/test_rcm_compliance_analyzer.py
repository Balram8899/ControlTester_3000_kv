import json
from unittest.mock import MagicMock, patch

from utils.rcm_compliance_analyzer import analyze_rcm_against_obligations


def test_analyze_rcm_against_obligations_batches_multi_domain_llm_analysis():
    obligations = [
        {
            "obligation_text": "Access reviews must be performed regularly.",
            "domain": "Access",
            "framework_name": "Test Regulation",
            "section_reference": "1.1",
            "obligation_id": "obl-access",
        },
        {
            "obligation_text": "Network monitoring must detect suspicious traffic.",
            "domain": "Network",
            "framework_name": "Test Regulation",
            "section_reference": "2.1",
            "obligation_id": "obl-network",
        },
    ]
    parsed_controls = {
        "Sheet1": [
            {
                "reference": "AC-1",
                "title": "Access review",
                "description": "User access is reviewed quarterly.",
                "domain": "Access",
                "subdomain": "Identity",
            },
            {
                "reference": "NET-1",
                "title": "Traffic monitoring",
                "description": "Traffic is monitored only for core systems.",
                "domain": "Network",
                "subdomain": "Monitoring",
            },
        ]
    }
    llm_response = json.dumps(
        {
            "domains": {
                "Access": {
                    "score": 92,
                    "missing_requirements": [],
                    "weak_controls": [],
                    "recommendations": ["Keep the current review cadence."],
                },
                "Network": {
                    "score": 61,
                    "missing_requirements": ["Suspicious traffic detection coverage is incomplete."],
                    "weak_controls": ["NET-1"],
                    "recommendations": ["Expand monitoring to all in-scope systems."],
                },
            }
        }
    )
    fake_llm = MagicMock()
    fake_llm.invoke.return_value = llm_response

    with (
        patch("utils.rcm_compliance_analyzer.parse_rcm_excel", return_value=parsed_controls),
        patch("utils.rcm_compliance_analyzer.get_llm", return_value=fake_llm),
        patch("utils.graph_rag.build_knowledge_graph_from_documents", return_value=None),
        patch("utils.rcm_compliance_analyzer.generate_compliance_report", return_value="report body"),
    ):
        result = analyze_rcm_against_obligations(
            rcm_file_path="dummy.xlsx",
            obligations=obligations,
            model_name="llama3:latest",
        )

    assert result["success"] is True
    assert fake_llm.invoke.call_count == 1

    detailed_results = result["compliance_analysis"]["detailed_results"]
    access_result = next(item for item in detailed_results if item["control_reference"] == "AC-1")
    network_result = next(item for item in detailed_results if item["control_reference"] == "NET-1")

    assert access_result["compliance_status"] == "COMPLIANT"
    assert network_result["compliance_status"] == "PARTIAL"
    assert network_result["gaps"] == "Suspicious traffic detection coverage is incomplete."
    assert network_result["recommendation"] == "Expand monitoring to all in-scope systems."
