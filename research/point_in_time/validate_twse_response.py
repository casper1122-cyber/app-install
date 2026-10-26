"""Reject TWSE historical snapshots whose returned day does not match requested day."""
from twse_pit import normalize_day
def response_day(raw):
    for key in ('date','Date'):
        if raw.get(key):return normalize_day(raw[key])
    for t in raw.get('tables',[]):
        if t.get('date'):return normalize_day(t['date'])
    return None
def validate_response(raw,requested_day):
    if not isinstance(raw,dict):raise ValueError('TWSE response must be an object')
    if raw.get('stat') not in (None,'OK'):raise ValueError('TWSE reported non-OK response')
    actual=response_day(raw)
    if actual is None:raise ValueError('TWSE response date missing; cannot verify archive identity')
    requested=normalize_day(requested_day)
    if actual!=requested:raise ValueError(f'TWSE date mismatch: requested {requested}, got {actual}')
    return actual
