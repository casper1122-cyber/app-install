# app-install development continuity

Read `docs/MASTER_BACKLOG.md` before changing application behavior. It is the single current requirements/acceptance ledger. `docs/handoff/` and original uploads are historical evidence, not independent current todo lists.

Preserve original task numbers 1–16, original D1–D13, and unresolved placeholders 17/18. Add source-attributed commitments absent from those tasks under the ledger's supplementary section; do not silently merge or drop existing requirements. Record implementation locations, exact verification scope, missing work, and deployment evidence. Code existence, fixture tests, self-reported metrics and actual market out-of-sample validation are different evidence levels.

Keep all changes on a test/development branch. Do not merge to main, approve a release, or publish production without the user's explicit release instruction after testing. GAS /dev may use the user's real sheet: do not run destructive tests against it. Preserve existing holdings, bookkeeping, models and charts while making scoped changes.

Do not invent model coefficients, transactions, market backtests, or a completion claim. Missing data is neither CCC nor zero risk. Keep researching missing sources; mark current limitations without pretending the full model is delivered. Prefer automated operations and minimize repeated user download/upload work.

Batch delivery is required: do not ask the user to install every incremental candidate or research revision. Integrate the current rating/data, allocation, age/cash and release-safety fixes, run consolidated regression checks, and deliver one reviewable batch. Keep full-market research tasks tracked separately without pretending they are delivered. Bundle truly necessary questions and device checks.

Before delivering a batch, verify engineering correctness and model evidence separately. `tools/gas/check_candidate.py` defaults to blocking on missing research evidence; `--program-checks-only` is diagnostic, never release readiness. Numerical kernel tests do not validate market coefficients, distributions, probabilities, calibration, or out-of-sample predictive performance. Do not deliver further installation candidates while the ledger's batch blockers remain unresolved.
