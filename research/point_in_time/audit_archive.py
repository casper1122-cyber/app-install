"""Verify original archive bytes and reject conflicting feature observations."""
import hashlib
from pathlib import Path
def create_ledger(directory,records):
    base=Path(directory); files={}
    for path in sorted(base.glob('*.json')):
        data=path.read_bytes()
        files[path.name]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
    seen={}; conflicts=[]
    for r in records:
        key=(r['asset_id'],r['feature'],r['observed_at'])
        value=r['value']; origin=r.get('local_archive')
        if key in seen and seen[key][0]!=value:
            conflicts.append({'asset_id':key[0],'feature':key[1],'observed_at':key[2],
                              'first':seen[key],'second':(value,origin)})
        elif key not in seen:seen[key]=(value,origin)
        if origin not in files:raise ValueError(f'missing source file: {origin}')
        r['raw_sha256']=files[origin]['sha256']
    return {'files':files,'distinct_feature_keys':len(seen),'duplicate_conflicts':conflicts,
            'accepted_record_count':len(records),'status':'fail' if conflicts else 'pass'}
def validate_ledger(directory,ledger):
    base=Path(directory)
    return all((base/name).is_file() and
               hashlib.sha256((base/name).read_bytes()).hexdigest()==meta['sha256']
               for name,meta in ledger['files'].items())
