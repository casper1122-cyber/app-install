"""Per-asset point-in-time join with explicit verified/assumed provenance."""
from __future__ import annotations
from collections import defaultdict
from datetime import date
from math import isfinite
from pit_release_gate import judge

def asof_join(records, decisions, *, mode='strict', lag_days=1):
    if mode not in ('strict', 'sensitivity'):
        raise ValueError('invalid mode')
    if not isinstance(lag_days, int) or lag_days < 1:
        raise ValueError('lag_days must be a positive integer')
    by = defaultdict(list)
    for r in records:
        value = r.get('value')
        if (r.get('asset_id') and r.get('feature') and isinstance(value, (int, float))
                and not isinstance(value, bool) and isfinite(value)):
            by[(r['asset_id'], r['feature'])].append(r)
    joined, rejected = [], []
    for decision in decisions:
        candidates = []
        for record in by.get((decision['asset_id'], decision['feature']), []):
            verdict = judge(record, decision['decision_at'],
                            policy='verified' if mode == 'strict' else 'sensitivity', lag_days=lag_days)
            if verdict['allowed']:
                candidates.append((date.fromisoformat(record['observed_at']),
                                   verdict['quality'] == 'verified', record, verdict))
        if not candidates:
            rejected.append({'decision': decision, 'reason': 'no eligible as-of observation'})
            continue
        observed, verified, record, verdict = max(candidates, key=lambda x:(x[0], x[1]))
        joined.append({'asset_id': decision['asset_id'], 'feature': decision['feature'],
                       'decision_at': decision['decision_at'], 'observed_at': observed.isoformat(),
                       'value': record['value'], 'evidence': 'verified' if verified else 'assumed',
                       'source_url': record['source_url'], 'lag_days': None if verified else lag_days})
    return {'joined': joined, 'rejected': rejected, 'mode': mode,
            'lag_days': lag_days if mode == 'sensitivity' else None}
