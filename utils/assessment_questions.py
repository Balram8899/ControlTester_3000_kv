# utils/assessment_questions.py
"""8-section application risk assessment question bank.

Each question has a `question_type` used by the hybrid rule-layer scorer:
  Exposure  — "Yes" answer RAISES inherent risk
  Control   — "No" answer RAISES inherent risk (control absent)
  Context   — Informational; passed to LLM analysis only
"""

SECTIONS: list[dict] = [
    {
        "id": "business_criticality",
        "title": "Business Use and Criticality",
        "questions": [
            {"id": "bc_1", "text": "Is this application business-critical — would any unplanned downtime cause significant business or operational impact?", "question_type": "Exposure"},
            {"id": "bc_2", "text": "Does this application directly support revenue-generating or customer-facing processes?", "question_type": "Exposure"},
            {"id": "bc_3", "text": "Are there formally documented RTO/RPO requirements for this application?", "question_type": "Control"},
            {"id": "bc_4", "text": "Have documented owners, escalation contacts, and a support model been assigned to this application?", "question_type": "Control"},
            {"id": "bc_5", "text": "Does failure of this application trigger cascading failures in other critical systems?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "data_handled",
        "title": "Data Handled by the Application",
        "questions": [
            {"id": "dh_1", "text": "Does this application process, store, or transmit personal data (PII)?", "question_type": "Exposure"},
            {"id": "dh_2", "text": "Does this application handle sensitive regulated data (financial, healthcare, payment card, or government data)?", "question_type": "Exposure"},
            {"id": "dh_3", "text": "Is data classified according to the organisation's data classification policy?", "question_type": "Control"},
            {"id": "dh_4", "text": "Are formal data retention and disposal procedures in place for this application?", "question_type": "Control"},
            {"id": "dh_5", "text": "Does this application share data with third parties or external services?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "identity_access",
        "title": "Identity, Access, and Privileged Usage",
        "questions": [
            {"id": "ia_1", "text": "Are privileged or admin accounts separate from standard user accounts for this application?", "question_type": "Control"},
            {"id": "ia_2", "text": "Is multi-factor authentication (MFA) enforced for all user access to this application?", "question_type": "Control"},
            {"id": "ia_3", "text": "Are access reviews conducted on a regular basis (at least annually) for this application?", "question_type": "Control"},
            {"id": "ia_4", "text": "Is there a formal offboarding process that revokes access to this application when staff leave?", "question_type": "Control"},
            {"id": "ia_5", "text": "Are shared or generic accounts used to access this application?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "exposure_architecture",
        "title": "Exposure, Architecture, and Integrations",
        "questions": [
            {"id": "ea_1", "text": "Is this application accessible over the internet or from untrusted networks?", "question_type": "Exposure"},
            {"id": "ea_2", "text": "Does this application integrate with external or third-party services?", "question_type": "Exposure"},
            {"id": "ea_3", "text": "Are all API connections and integrations formally documented and inventoried?", "question_type": "Control"},
            {"id": "ea_4", "text": "Is network segmentation or a DMZ in place to isolate this application from other systems?", "question_type": "Control"},
            {"id": "ea_5", "text": "Has a formal threat model or architecture security review been conducted for this application?", "question_type": "Control"},
        ],
    },
    {
        "id": "secure_build_change",
        "title": "Secure Build, Change, and Vulnerability Handling",
        "questions": [
            {"id": "sb_1", "text": "Is a formal change management process followed before deploying changes to this application?", "question_type": "Control"},
            {"id": "sb_2", "text": "Are application dependencies and third-party libraries regularly reviewed for known vulnerabilities?", "question_type": "Control"},
            {"id": "sb_3", "text": "Has a penetration test or security assessment been conducted for this application within the last 12 months?", "question_type": "Control"},
            {"id": "sb_4", "text": "Are known security vulnerabilities tracked, prioritised, and remediated to a defined SLA?", "question_type": "Control"},
            {"id": "sb_5", "text": "Is any part of this application running on unsupported or end-of-life software or infrastructure?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "logging_monitoring",
        "title": "Logging, Monitoring, and Detectability",
        "questions": [
            {"id": "lm_1", "text": "Are security-relevant events (authentication, access, errors, admin actions) logged for this application?", "question_type": "Control"},
            {"id": "lm_2", "text": "Are logs retained for a defined minimum period and protected from tampering or deletion?", "question_type": "Control"},
            {"id": "lm_3", "text": "Is there active alerting or monitoring on anomalous security events for this application?", "question_type": "Control"},
            {"id": "lm_4", "text": "Would an unauthorised access or data exfiltration event go undetected for more than 24 hours?", "question_type": "Exposure"},
            {"id": "lm_5", "text": "Are logs centralised and accessible to a security operations or incident response team?", "question_type": "Control"},
        ],
    },
    {
        "id": "resilience_backup",
        "title": "Resilience, Backup, and Recoverability",
        "questions": [
            {"id": "rb_1", "text": "Are backups of application data performed regularly and tested for restorability?", "question_type": "Control"},
            {"id": "rb_2", "text": "Is there a documented disaster recovery (DR) plan for this application?", "question_type": "Control"},
            {"id": "rb_3", "text": "Has the DR plan been tested within the last 12 months?", "question_type": "Control"},
            {"id": "rb_4", "text": "Does this application have a single point of failure with no redundancy?", "question_type": "Exposure"},
            {"id": "rb_5", "text": "Are backups stored in a geographically or logically separate location from the primary system?", "question_type": "Control"},
        ],
    },
    {
        "id": "special_risk_indicators",
        "title": "Special Risk Indicators",
        "questions": [
            {"id": "sr_1", "text": "Is this application subject to mandatory regulatory compliance requirements (e.g. GDPR, PCI DSS, HIPAA, SOX)?", "question_type": "Exposure"},
            {"id": "sr_2", "text": "Has this application been involved in a confirmed security incident or data breach in the last 24 months?", "question_type": "Exposure"},
            {"id": "sr_3", "text": "Are there open high or critical severity audit findings or remediation actions against this application?", "question_type": "Exposure"},
            {"id": "sr_4", "text": "Is this application managed or hosted entirely by a third-party vendor with limited internal oversight?", "question_type": "Exposure"},
            {"id": "sr_5", "text": "Is there an active and tracked remediation plan for known risks associated with this application?", "question_type": "Control"},
            {"id": "sr_6", "text": "Does this application process personal data for EU or UK data subjects requiring GDPR consideration?", "question_type": "Exposure"},
            {"id": "sr_7", "text": "Are explicit security requirements documented and mapped to implementation evidence?", "question_type": "Control"},
            {"id": "sr_8", "text": "Are unresolved Jira issues, defects, incidents, or delivery risks relevant to this assessment?", "question_type": "Exposure"},
        ],
    },
]


def get_sections() -> list[dict]:
    """Return all 8 assessment sections with their question banks."""
    return SECTIONS
