"""Compatibility adapter: avoid calling unverified next-day data 'verified'."""
from pit_release_gate import judge
def available_by(feature, decision_date, *, decision_time="09:00", verified_publication=None, mode="strict", lag_days=1):
    if mode not in ("strict", "sensitivity"): raise ValueError("mode must be strict or sensitivity")
    if verified_publication is not None:
        feature = dict(feature, published_at=verified_publication)
    decision = f"{decision_date}T{decision_time}+08:00"
    return judge(feature, decision, policy="verified" if mode=="strict" else "sensitivity", lag_days=lag_days)["allowed"]
