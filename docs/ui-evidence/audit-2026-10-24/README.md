# Audit correction evidence - 24 October 2026

Synthetic local fixtures on `codex/audit-billing-export-corrections`, based on
`3ed7d3d2`. These captures are implementation evidence, not production acceptance.
No live gym, application, payment or email was created. Existing screenshot
baselines and the 0.015 tolerance remain unchanged.

- `owner-upgrade-{en,ar}-{390,1440}.png`: actual owner Change plan dialog; Pro
  has localized Unlimited capacities and accessible radio labels at both widths.
- `add-ons-{390,1440}.png`: actual platform billing package editor; bounded Basic
  quantities and JD158 recurring total, preserved through reopening.
- `termination-exports-{390,1440}.png`: cancelled-owner export frame with seven
  existing datasets, download history and repeat CSV retrieval; no workspace nav.
- `activation-invoice-{en,ar}.png`: one-page rendered A4 synthetic paid invoice.
  Original JD199 quote, JD158 estimated credit and JD41 transfer are retained;
  the note explains JD41 actual service funding with no remaining old-term credit.

All 13 selected browser flows pass on both the development server and the
built approved Preview bundle (four workers). No tested console/runtime errors
were seen.
The original development run logged existing Clerk development-key and image
aspect warnings. The PDF source bytes were temporary synthetic fixtures under
`/tmp/rivet-fixes-pdf`; no signed historical document was edited.
