"""Build the reviewed current 54n pair as an offline 54o TEST candidate."""
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys

p = argparse.ArgumentParser()
p.add_argument('app', type=Path)
p.add_argument('core', type=Path)
p.add_argument('output_dir', type=Path)
a = p.parse_args()
expected = [(a.app, '9814e8317a38c149f815bccb32d06ee1888b5b5a0be5304506be24ab45c71bae'), (a.core, '8a3aa8aa6d32980abac7ea76408e247fb2125bf766b2dda72606c145b7f13a86')]
for f, digest in expected:
    if hashlib.sha256(f.read_bytes()).hexdigest() != digest:
        raise SystemExit('Unknown current source revision: review before porting')
for f in (a.app, a.core):
    for name in ('App.html', '核心.gs'):
        if f.resolve() == (a.output_dir / name).resolve():
            raise SystemExit('Refusing to overwrite original')
s = a.core.read_text()
old, new = 'var LIB_VERSION_ = "2026.10.54n";', 'var LIB_VERSION_ = "2026.10.54o";'
if s.count(old) != 1:
    raise SystemExit('Unexpected version marker')
subprocess.run([sys.executable, str(Path(__file__).with_name('build_test_candidate.py')), str(a.app), str(a.output_dir / 'App.html')], check=True)
(a.output_dir / '核心.gs').write_text(s.replace(old, new))
print('Core change: version marker only; model and application logic preserved')
