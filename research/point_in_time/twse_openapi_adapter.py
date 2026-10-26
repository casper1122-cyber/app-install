"""Parse TWSE BWIBBU_d OpenAPI list rows without guessing release timestamps."""
from twse_pit import normalize_day

def adapt_openapi(raw, requested_day):
    if not isinstance(raw, list) or not raw:
        raise ValueError('OpenAPI response must be a nonempty list')
    requested = normalize_day(requested_day)
    items = []
    for i, row in enumerate(raw):
        if not isinstance(row, dict): raise ValueError(f'row {i} is not an object')
        day = row.get('Date')
        if not day: raise ValueError(f'row {i} missing Date')
        if normalize_day(day) != requested:
            raise ValueError(f'row {i} date mismatch: {day} vs {requested}')
        code = row.get('Code') or row.get('StockNo') or row.get('證券代號')
        if not code: raise ValueError(f'row {i} missing security code')
        items.append([
            str(code), row.get('PEratio') or row.get('本益比') or '--',
            row.get('PBratio') or row.get('股價淨值比') or '--',
            row.get('DividendYield') or row.get('殖利率(%)') or '--'
        ])
    return {'date':requested.strftime('%Y%m%d'), 'stat':'OK',
            'fields':['證券代號','本益比','股價淨值比','殖利率(%)'], 'data':items}
