# Arabic implementation handoff

**Start here.** Hashem and Elias approved all **247** language decisions in the live Arabic room. Version 1 records catalog `2026-09-30-v1`, revision **607**, exported on **2026-10-01 at 11:06:41.355 UTC**. Both named approvals are present and `readyForImplementation` is true.

This is a documentation checkpoint on **`arabic-localisation`**, built directly on Elias’s `f98e324`. It does not implement the remaining translations, integrate main, or certify the branch for release.

## Read in order

1. [STANDARD.md](STANDARD.md) — binding wording rules, exact exceptions, and how to resolve apparent conflicts.
2. [DECISIONS.md](DECISIONS.md) — all 247 agreed items, their contexts, custom wording and the one reviewer note.
3. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — branch findings, preservation strategy, work packages and acceptance gates.
4. [COVERAGE.md](COVERAGE.md) — all 76 current-main page entries and 40 integration overlaps; expand into a completion ledger.
5. [IMPLEMENTATION_PROMPT.md](IMPLEMENTATION_PROMPT.md) — ready-to-use instructions for the implementation agent.

## Evidence and verification

- [approved-decisions.v1.json](approved-decisions.v1.json) is the full saved export, including both votes, timestamps, all original options, contexts and source hints. No decisions were changed by the agent.
- [approved-decisions.v1.sha256](approved-decisions.v1.sha256) records its SHA-256 checksum.
- [baseline-inventory.json](baseline-inventory.json) records the inspected main/Arabic commits, common ancestor, page files and overlapping modifications.
- Run `python3 docs/arabic/verify-lock.py` from the repository root before working on this standard.

“Locked” means a versioned repository standard, not a disabled review room. The room remains available at https://www.rivetjo.com/arabic-room. The approved identities are the room’s self-selected Elias/Hashem profiles; they are not authenticated signatures. Hashem also confirmed approval in the task that created this handoff.

Do not silently refresh v1 from a mutable live room. New jointly approved wording becomes a new version with a decision diff and explicit supersession. A changed draft in the room does not by itself replace this approved checkpoint. Preserve old snapshots and their checksums.

The original main-branch review-room README and downloadable implementation prompt describe the questionnaire workflow. During integration, preserve that operational documentation under a review-room section or separate file, and update both the repository prompt and its public download to point to this approved standard. Preserve the public name picker, saved choices and collaborative behavior.

## Current integration

The integration also preserves the newer local `arabic-foundation` history at `9fbd53c`. Its typed catalogs, translated member/auth flows and tests extend the older Arabic work; draft wording is being aligned with v1. See [REVIEW_ROOM.md](REVIEW_ROOM.md) for the current public review-room operation and [COVERAGE.md](COVERAGE.md) for implementation status.
