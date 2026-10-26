# Stage 1 official data coverage audit (2026-10-27)
Local 54h snapshot contains 1,977 stocks: TWSE listed 1,084; TPEx OTC 893. Thus TWSE valuation historical endpoints **alone cannot validate the entire stock universe**.
408,212 numeric monthly return cells and 96 missing cells internally; 448 monthly returns >= +100% require adjustment/corporate action cross-check. Internal counts are not independent exchange validation.
Official historical per-date valuation: TWSE https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html ; TPEx https://www.tpex.org.tw/zh-tw/mainboard/trading/info/daily-pe.html .
**RELEASE BLOCKED** until separate market archives, event-time proof, delisted constituents, total return adjustment, and validated downside calibration & correlated portfolio-tail risk can be established. User's real portfolio and GAS deployments remain untouched.
