from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TestingPeriod(BaseModel):
    model_config = {"populate_by_name": True}

    from_: str = Field(alias="from")
    to: str

    def model_dump(self, **kwargs):
        kwargs.setdefault("by_alias", True)
        return super().model_dump(**kwargs)


class SignOffPerson(BaseModel):
    name: str = ""
    initials: str = ""
    date: Optional[str] = None


class SignOff(BaseModel):
    preparer: SignOffPerson = Field(default_factory=SignOffPerson)
    reviewer: SignOffPerson = Field(default_factory=SignOffPerson)
    manager: SignOffPerson = Field(default_factory=SignOffPerson)


class CreateSessionRequest(BaseModel):
    title: str
    description: str = ""
    entity: str
    testing_period: TestingPeriod
    framework: str = "Controls Assurance"
    preparer: str = ""


class ControlStepInput(BaseModel):
    attribute_id: str = ""
    label: str = ""
    test_attribute: str = ""
    description: str = ""
    evidence_required: str = ""


class CreateControlRequest(BaseModel):
    control_id: str
    control_name: str
    control_type: str = ""
    domain: str = ""
    framework_reference: str = ""
    inherent_risk_rating: str = "Medium"
    control_owner: str = ""
    frequency: str = ""
    prior_period_result: str = "N/A"
    walkthrough_performed: bool = False
    risk: str = ""
    sampling_mode: str = "sample"
    sampling_additional_context: str = ""
    test_steps: list[ControlStepInput] = Field(default_factory=list)
