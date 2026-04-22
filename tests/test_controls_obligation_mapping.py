from utils.controls_library import map_controls_to_obligations


class FakeRegulatoryStore:
    def __init__(self, obligations):
        self._obligations = obligations

    def search_obligations(self, domain=None, enforcement_level=None, keyword=None):
        results = list(self._obligations)
        if domain:
            results = [obl for obl in results if obl.get("domain") == domain]
        return results


def test_mapping_falls_back_beyond_bad_domain_and_prefers_meaningful_access_match():
    controls = [
        {
            "control_id": "IAM-29",
            "control_name": "Least Privilege",
            "description": "Role-based access is defined and deployed to restrict privileged access to information resources based on the concept of least privilege.",
            "domain": "governance",
            "control_type": "preventive",
            "keywords": ["least", "privilege"],
        }
    ]
    obligations = [
        {
            "obligation_id": "OBL-007",
            "obligation_text": "The ITSC shall meet at least on a quarterly basis.",
            "section_reference": "6.(c)",
            "framework_name": "RBI MD",
            "enforcement_level": "mandatory",
            "domain": "governance",
            "keywords": ["meeting", "quarterly"],
        },
        {
            "obligation_id": "OBL-014",
            "obligation_text": "The necessary control procedures include granting authorities that are strictly necessary to privileged and emergency IDs with formal approval and monitoring.",
            "section_reference": "3.2.3",
            "framework_name": "HKMA TRM",
            "enforcement_level": "mandatory",
            "domain": "access_control",
            "keywords": ["privileged IDs", "least privilege", "activity logs"],
        },
        {
            "obligation_id": "OBL-023",
            "obligation_text": "Access to information assets shall be allowed only where a valid business need exists.",
            "section_reference": "19.1(a)",
            "framework_name": "RBI MD",
            "enforcement_level": "mandatory",
            "domain": "access_control",
            "keywords": ["access", "business", "need"],
        },
    ]

    mapped = map_controls_to_obligations(controls, FakeRegulatoryStore(obligations))[0]["mapped_obligations"]

    assert mapped
    assert mapped[0]["obligation_id"] == "OBL-014"
    assert all(item["obligation_id"] != "OBL-007" for item in mapped)


def test_mapping_filters_out_weak_single_word_overlap_matches():
    controls = [
        {
            "control_id": "IAM-29",
            "control_name": "Least Privilege",
            "description": "Restrict privileged access according to least privilege principles.",
            "domain": "governance",
            "control_type": "preventive",
            "keywords": ["least", "privilege"],
        }
    ]
    obligations = [
        {
            "obligation_id": "OBL-007",
            "obligation_text": "The ITSC shall meet at least on a quarterly basis.",
            "section_reference": "6.(c)",
            "framework_name": "RBI MD",
            "enforcement_level": "mandatory",
            "domain": "governance",
            "keywords": ["meeting", "quarterly"],
        }
    ]

    mapped = map_controls_to_obligations(controls, FakeRegulatoryStore(obligations))[0]["mapped_obligations"]

    assert mapped == []
