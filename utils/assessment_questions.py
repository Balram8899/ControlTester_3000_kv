# utils/assessment_questions.py
"""Pre-defined question bank for BIA, Legal/Reg, and PIA assessments."""

QUESTION_BANK: dict[str, list[dict]] = {
    "BIA": [
        {
            "id": "bia_1",
            "question_text": "What is the maximum tolerable downtime (MTD) for this asset before business operations are critically impacted?",
            "guidance_text": "Consider SLAs, business hours, and recovery time objectives (RTO/RPO).",
            "required": True,
            "order": 1,
        },
        {
            "id": "bia_2",
            "question_text": "What is the estimated financial impact per hour if this asset becomes unavailable?",
            "guidance_text": "Include direct revenue loss, productivity loss, and contractual penalties.",
            "required": True,
            "order": 2,
        },
        {
            "id": "bia_3",
            "question_text": "How many users, customers, or downstream systems directly depend on this asset?",
            "guidance_text": "Include internal staff, external users, and dependent applications.",
            "required": True,
            "order": 3,
        },
        {
            "id": "bia_4",
            "question_text": "What manual workarounds exist if this asset becomes unavailable?",
            "guidance_text": "Describe alternative processes or backup systems that can be activated.",
            "required": True,
            "order": 4,
        },
        {
            "id": "bia_5",
            "question_text": "Does failure of this asset trigger cascading failures in other critical systems?",
            "guidance_text": "List dependent systems and describe the nature of each dependency.",
            "required": False,
            "order": 5,
        },
    ],
    "LEGAL": [
        {
            "id": "legal_1",
            "question_text": "Which regulatory frameworks govern the data or processes managed by this asset?",
            "guidance_text": "e.g. GDPR, DPDP, PCI-DSS, SOX, HIPAA, ISO 27001, RBI guidelines.",
            "required": True,
            "order": 1,
        },
        {
            "id": "legal_2",
            "question_text": "Are there mandatory breach notification timelines applicable to this asset?",
            "guidance_text": "GDPR: 72 hours; DPDP: 6 hours; SEC: 4 business days. State applicable timelines.",
            "required": True,
            "order": 2,
        },
        {
            "id": "legal_3",
            "question_text": "What contractual or SLA obligations are tied to this asset's availability and security?",
            "guidance_text": "Include customer contracts, vendor agreements, and insurance clauses.",
            "required": True,
            "order": 3,
        },
        {
            "id": "legal_4",
            "question_text": "What is the estimated maximum regulatory fine exposure if this asset is compromised?",
            "guidance_text": "Estimate based on applicable regulation, data volume, and jurisdiction.",
            "required": False,
            "order": 4,
        },
        {
            "id": "legal_5",
            "question_text": "Are there data residency or sovereignty requirements restricting where this asset's data can be stored or processed?",
            "guidance_text": "Consider cross-border data transfer restrictions under GDPR Chapter V, DPDP, etc.",
            "required": False,
            "order": 5,
        },
    ],
    "PIA": [
        {
            "id": "pia_1",
            "question_text": "Does this asset process, store, or transmit personally identifiable information (PII)?",
            "guidance_text": "Include names, email addresses, IDs, financial data, health data, location data.",
            "required": True,
            "order": 1,
        },
        {
            "id": "pia_2",
            "question_text": "What categories of personal data does this asset handle?",
            "guidance_text": "Classify as: basic identity, financial, health, biometric, children's data, or sensitive special categories.",
            "required": True,
            "order": 2,
        },
        {
            "id": "pia_3",
            "question_text": "Is personal data shared with or accessible by third parties or sub-processors?",
            "guidance_text": "List all third-party recipients, their roles, and their jurisdictions.",
            "required": True,
            "order": 3,
        },
        {
            "id": "pia_4",
            "question_text": "What is the retention period for personal data processed by this asset, and what is the deletion mechanism?",
            "guidance_text": "State the retention schedule and describe automated or manual deletion processes.",
            "required": True,
            "order": 4,
        },
        {
            "id": "pia_5",
            "question_text": "Are data subject rights mechanisms (access, erasure, portability, rectification) implemented for data held in this asset?",
            "guidance_text": "Describe the process for handling Data Subject Access Requests (DSARs).",
            "required": False,
            "order": 5,
        },
    ],
}


def get_questions(assessment_type: str) -> list[dict]:
    """Return questions for a given assessment type (BIA | LEGAL | PIA)."""
    return QUESTION_BANK.get(assessment_type.upper(), [])
