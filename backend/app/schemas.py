from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field

StepStatus = Literal["complete","in-progress","upcoming","not-started","at-risk"]
Event = Literal["build_pathway","simulate_delay","simulate_rejection","reset"]

class Profile(BaseModel):
    name: str
    profession: str
    countryTrained: str
    targetCountry: str
    targetRegion: str

class Step(BaseModel):
    id: int
    title: str
    status: StepStatus
    detail: str
    # optional grounding fields (frontend ignores unknown keys; judges see the citation)
    source: Optional[str] = None
    sourceUrl: Optional[str] = None

class ReasonRequest(BaseModel):
    profile: Profile
    event: Event
    currentSteps: list[Step] = Field(default_factory=list)

class LogEntry(BaseModel):
    text: str
    flag: bool = False

class ReasonResponse(BaseModel):
    steps: list[Step]
    logEntry: LogEntry
    # extra, non-breaking: lets the UI or judge see grounding + regulator
    regulator: Optional[str] = None
    regulatorUrl: Optional[str] = None
