"""54q research candidate: prevent benchmark substitution in own-history evaluations."""
import argparse,hashlib
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('app',type=Path);p.add_argument('core',type=Path);p.add_argument('output_dir',type=Path)
a=p.parse_args()
reference=Path(__file__).parent/'candidates/central-54p-test'
for src,name in [(a.app,'App.html'),(a.core,'核心.gs')]:
    if src.read_bytes()!=(reference/name).read_bytes():raise SystemExit('Unknown 54p source; review before porting')
    if src.resolve()==(a.output_dir/name).resolve():raise SystemExit('Refusing source overwrite')
s=a.app.read_text()
def change(old,new):
    global s
    if s.count(old)!=1:raise SystemExit('Unexpected source anchor: '+old[:90])
    s=s.replace(old,new)
change('if (hv != null) { own++; return hv; }','if (Number.isFinite(hv)) { own++; return hv; }')
change('if (opt.ownOnly) { var cut = Math.max(0, rateIdx_(b.s, H.s)); rr = rr.slice(cut); s1 = rateYm_(b.s, cut); }', '''if (opt.ownOnly) {
        // Never fill listing gaps or pre-listing history with a benchmark.
        var needed = Math.max(0, rateIdx_(H.s, data.last) + 1);
        rr = H.r.slice(0, needed).map(function (v) { return Number.isFinite(v) ? v : null; });
        s1 = H.s; own = rr.filter(function (v) { return Number.isFinite(v); }).length;
      }''')
change('r: rr, real: true, own_n: own,', '''r: rr, real: own === rr.length, own_n: own,
        provenance: { kind: opt.ownOnly ? (own === rr.length ? "observed" : "observed-with-gaps") : (own === rr.length ? "observed" : "mixed"),
          observedMonths: own, proxyMonths: opt.ownOnly ? 0 : rr.length - own,
          missingMonths: opt.ownOnly ? Math.max(0, needed - own) : 0,
          benchmark: opt.ownOnly ? null : (tw ? "0050" : "SPY") },''')
change('    data.a[key] = { n: x.name || x.code,', '    if (opt.ownOnly) return; // No own history: no individual rating from a benchmark.\n    data.a[key] = { n: x.name || x.code,')
change('      r: b.r.map(proxy) };', '      r: b.r.map(proxy), real: false, provenance: { kind: "benchmark-proxy", observedMonths: 0, proxyMonths: b.r.length, benchmark: tw ? "0050" : "SPY" } };')
# Do not assert complete integration yet: the default portfolio path still uses proxies.
core=a.core.read_text()
if core.count('var LIB_VERSION_ = "2026.10.54p";')!=1:raise SystemExit('Unexpected core marker')
a.output_dir.mkdir(parents=True,exist_ok=True)
(a.output_dir/'App.html').write_text(s)
(a.output_dir/'核心.gs').write_text(core.replace('var LIB_VERSION_ = "2026.10.54p";','var LIB_VERSION_ = "2026.10.54q";'))
print('Created offline 54q research candidate; NOT FOR DEPLOYMENT:',a.output_dir)
