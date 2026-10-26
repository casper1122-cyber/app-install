"""Build 54p UI correction from exact reviewed 54o files; never deploy."""
import argparse
import hashlib
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('app',type=Path)
p.add_argument('core',type=Path)
p.add_argument('output_dir',type=Path)
a=p.parse_args()
if hashlib.sha256(a.app.read_bytes()).hexdigest()!='c6cd3e9a12066428a1777cffc48b4a4094010f11c5700be43e19239b5fe9f4b6':
    raise SystemExit('Unknown App revision; review before porting')
s=a.app.read_text()
def change(old,new):
    global s
    if s.count(old)!=1:raise SystemExit('Unexpected source anchor: '+old[:90])
    s=s.replace(old,new)
change('function rateTopDraw() {',Path(__file__).with_name('coverage-panel.js').read_text()+'\nfunction rateTopDraw() {')
change('if (!X) return "";\n      return', 'if (!X) return "";\n      if (X.unratedNotice) return \'<button class="btn ghost" onclick="openAssetAll()" style="margin-top:10px">查看全部資產與尚待評估項目</button>\';\n      return')
for line in s.splitlines():
    if '(X0 ? \'<div class="rt-top">' in line:
        new=line.replace('(X0 ?','(X0 && X0.unratedNotice ? assetCoverageHtml(X0) : (X0 ?',1)
        if not new.endswith(': "") +'):raise SystemExit('Unexpected home expression')
        change(line,new[:-len(': "") +')]+': "")) +')
    if line.startswith('  s += \'<div class="rt-top">') and '綜合品質評級' in line:
        change(line,line.replace('  s += ', '  s += X.unratedNotice ? assetCoverageHtml(X) : ',1))
change('if (X.unratedNotice) s += \'<div class="notice">\' + esc(X.unratedNotice) + " 已有評級的資產占 " + ratePct(X.coverage, 0) + "。</div>";', 'if (X.unratedNotice) s += \'<p class="label">個別資產的評級及家庭財務檢查仍可查看。</p>\';')
change('rateBadge(X.qGrade) + " " + rateTag(X.qGrade)', '(X.unratedNotice ? "" : rateBadge(X.qGrade) + " " + rateTag(X.qGrade))')
# A missing financial evaluation must not hide existing non-financial analysis.
change('  if (!R) { el.innerHTML =', '  if (!R) { var coverageOnly = null; try { coverageOnly = assetAll(); } catch (coverageError) {} if (coverageOnly && coverageOnly.unratedNotice) { var coverageChart = ""; try { coverageChart = allBacktestHtml(allBacktest(coverageOnly)); } catch (coverageChartError) {} el.innerHTML = \'<div class="card rt-card">\' + assetCoverageHtml(coverageOnly) + coverageChart + \'<button class="btn ghost" onclick="openAssetAll()">查看全部資產</button></div>\'; return; } el.innerHTML =')
change('el.innerHTML = \'<div class="card rt-card"><h3>我的配置評級 <small>全部資產', 'el.innerHTML = \'<div class="card rt-card"><h3>\' + (X0 && X0.unratedNotice ? "我的資產分析" : "我的配置評級") + \' <small>全部資產')
change("var s = '<h3>📦 全部資產綜合評級 <small", 'var s = \'<h3>📦 \' + (X.unratedNotice ? "全部資產分析" : "全部資產綜合評級") + \' <small')
core=a.core.read_text()
if core.count('var LIB_VERSION_ = "2026.10.54o";')!=1:raise SystemExit('Unexpected core version')
# Core must be identical to the archived 54n apart from version marker.
reference=Path(__file__).parent/'candidates/central-54o-test/核心.gs'
if core!=reference.read_text():raise SystemExit('Unknown core revision')
a.output_dir.mkdir(parents=True,exist_ok=True)
for source,name in [(a.app,'App.html'),(a.core,'核心.gs')]:
    if source.resolve()==(a.output_dir/name).resolve():raise SystemExit('Refusing to overwrite source')
(a.output_dir/'App.html').write_text(s)
(a.output_dir/'核心.gs').write_text(core.replace('var LIB_VERSION_ = "2026.10.54o";','var LIB_VERSION_ = "2026.10.54p";'))
print('Created offline 54p coverage candidate:',a.output_dir)
