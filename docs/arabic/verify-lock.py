#!/usr/bin/env python3
"""Validate the immutable approved language snapshot and its readable registry."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
snapshot = ROOT / "approved-decisions.v1.json"
expected = (ROOT / "approved-decisions.v1.sha256").read_text().split()[0]
assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == expected, "Snapshot checksum changed"
data = json.loads(snapshot.read_text())
assert data["format"] == "rivet-arabic-review-v1"
assert data["catalogVersion"] == "2026-09-30-v1"
assert data["revision"] == 607
assert data["readyForImplementation"] is True
assert set(data["approvals"]) == {"elias", "hashem"}
assert {r["id"] for r in data["reviewers"]} == {"elias", "hashem"}
assert len(data["decisions"]) == 247
assert len({d["id"] for d in data["decisions"]}) == 247
registry = (ROOT / "DECISIONS.md").read_text()
custom_count = 0
note_count = 0
for decision in data["decisions"]:
    assert decision["status"] == "agreed", decision["id"]
    assert decision["agreedText"], decision["id"]
    assert len(decision["votes"]) == 2, decision["id"]
    assert {v["userId"] for v in decision["votes"]} == {"elias", "hashem"}
    heading = "### " + decision["id"] + "\n"
    assert registry.count(heading) == 1, decision["id"]
    section = registry.split(heading, 1)[1].split("\n### ", 1)[0]
    assert "**Approved:** " + decision["agreedText"] + "\n" in section, decision["id"]
    assert "**Context:** " + decision["context"] + "\n" in section, decision["id"]
    for vote in decision["votes"]:
        assert vote["selectedText"] == decision["agreedText"], decision["id"]
        if vote["choice"] == "custom":
            assert vote["customText"] == vote["selectedText"], decision["id"]
        else:
            option = next(o for o in decision["options"] if o["id"] == vote["choice"])
            assert option["text"] == vote["selectedText"], decision["id"]
        if vote["note"]:
            note_count += 1
            assert vote["note"] in section, decision["id"]
    custom_count += any(v["choice"] == "custom" for v in decision["votes"])
assert custom_count == 8
assert note_count == 1
print("PASS: revision 607; 247 exact agreements; both approvals; 8 custom decisions; 1 note; checksum and registry match.")
