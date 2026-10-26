# Stage 1: 2025 exchange-stratified downside input sensitivity (2026-10-27)
This research uses **existing 2025 monthly absolute-return forecasts**, not independently certified exchange returns. Locked mixing weight shrink_50, no refit.
Source 54h zip SHA256 `03f8798d88c08f5ac63499980b7114f39d1d960e8c9e01b79c606929d1320aa6`.
* Listed (TWSE): 12,567 forecast observations, 1,064 issuers, baseline MAE 5.01749 percentage points, shrink50 4.82944, delta +0.18805; monthly wins 9/12.
* OTC (TPEx): 10,423 forecast observations, 877 issuers, baseline 5.60693, shrink50 5.34106, delta +0.26587; monthly wins 10/12.
* Removing realized abs return >=50%: listed +0.17117pp, OTC +0.23754pp; result is **sensitivity analysis**, not a revised model or historical data correction.
* 2025 >=100% monthly abs return observations: listed 3, OTC 9. Full snapshot 448 monthly >=+100% is from all historical years and a separate statistic.
* The two markets must have separate exchange-source coverage and release gates. Snapshot's `mk` metadata is assumed, not independently verified.
* BLOCK: independently sourced delisting and corporate actions, PIT data, trained calibrated downside probabilities, and portfolio joint-tail risks are not satisfied.
Official lookup refs: TWSE `https://openapi.twse.com.tw/`; TPEx `https://www.tpex.org.tw/zh-tw/mainboard/trading/info/daily-pe.html`.
