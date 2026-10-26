"""Strict point-in-time evidence gate for historical finance models."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
TZ=ZoneInfo('Asia/Taipei')
def ts(value):
    if not isinstance(value,str) or not value.strip(): raise ValueError('missing timestamp')
    d=datetime.fromisoformat(value)
    if d.tzinfo is None or d.utcoffset() is None: raise ValueError('timezone offset required')
    return d.astimezone(timezone.utc)
def judge(feature,decision_at,policy='verified'):
    if policy not in ('verified','sensitivity'): raise ValueError('unknown policy')
    decision=ts(decision_at)
    if not feature.get('source_url') or not feature.get('asset_id'):
        return {'allowed':False,'quality':'invalid','reason':'missing source or asset ID'}
    proof=feature.get('publication_proof')
    if feature.get('published_at') and isinstance(proof,dict) and proof.get('url') and proof.get('kind')=='archived_official':
        try: p=ts(feature['published_at'])
        except ValueError: return {'allowed':False,'quality':'invalid','reason':'bad publication timestamp'}
        return {'allowed':p<=decision,'quality':'verified','reason':'archived official timestamp'}
    if policy=='verified':
        return {'allowed':False,'quality':'unverified','reason':'no independently archived publication time'}
    from datetime import date
    try: observed=date.fromisoformat(feature['observed_at'])
    except (ValueError,TypeError,KeyError): return {'allowed':False,'quality':'invalid','reason':'bad observation date'}
    return {'allowed':decision.astimezone(TZ).date()>observed,'quality':'assumption','reason':'next-day sensitivity assumption only'}
