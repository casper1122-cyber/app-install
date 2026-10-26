"""Historical observation availability gate. No guessed publication times."""
from __future__ import annotations
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
TZ = ZoneInfo('Asia/Taipei')

def parse_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('timestamp missing')
    t = datetime.fromisoformat(value)
    if t.tzinfo is None or t.utcoffset() is None:
        raise ValueError('timezone offset required')
    return t.astimezone(timezone.utc)

def judge(feature: dict, decision_at: str, *, policy: str = 'verified', lag_days: int = 1):
    if policy not in ('verified', 'sensitivity'):
        raise ValueError('unknown policy')
    if not isinstance(lag_days, int) or lag_days < 1:
        raise ValueError('lag_days must be a positive integer')
    decision = parse_timestamp(decision_at)
    if not feature.get('source_url') or not feature.get('asset_id') or not feature.get('feature'):
        return {'allowed': False, 'quality': 'invalid', 'reason': 'missing source or asset/feature identifier'}
    try:
        observed = date.fromisoformat(feature['observed_at'])
    except (ValueError, TypeError, KeyError):
        return {'allowed': False, 'quality': 'invalid', 'reason': 'invalid observation date'}
    if observed > decision.astimezone(TZ).date():
        return {'allowed': False, 'quality': 'invalid', 'reason': 'observation after decision'}
    publication = feature.get('published_at')
    proof = feature.get('publication_proof') or {}
    is_verified = (isinstance(proof, dict) and proof.get('kind') == 'archived_official'
                   and proof.get('verified') is True and bool(proof.get('url')) and bool(publication))
    if is_verified:
        try:
            published = parse_timestamp(publication)
        except ValueError:
            return {'allowed': False, 'quality': 'invalid', 'reason': 'invalid publication timestamp'}
        if published.astimezone(TZ).date() < observed:
            return {'allowed': False, 'quality': 'invalid', 'reason': 'publication precedes observation'}
        return {'allowed': published <= decision, 'quality': 'verified', 'reason': 'independently verified release time'}
    if policy == 'verified':
        return {'allowed': False, 'quality': 'unverified', 'reason': 'independent release evidence absent'}
    age = (decision.astimezone(TZ).date() - observed).days
    return {'allowed': age >= lag_days, 'quality': 'assumption',
            'reason': f'{lag_days}-day lag sensitivity assumption only'}
