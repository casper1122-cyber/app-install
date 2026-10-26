from pathlib import Path
import argparse, hashlib
parser = argparse.ArgumentParser(description="Build an OFFLINE test candidate; never upload or deploy")
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
p = args.source
if p.resolve() == args.output.resolve(): raise SystemExit("Refusing to overwrite source")
known = {"35914f99b2986c850d9e08490142432688e8da9ea8b856968a578bce4718dd28", "3d6453555bdb7d02fbdb76c99b3ff9e68af677be4ac485ab253c73739e59df5f", "9814e8317a38c149f815bccb32d06ee1888b5b5a0be5304506be24ab45c71bae"}
if hashlib.sha256(p.read_bytes()).hexdigest() not in known:
    raise SystemExit("Unknown source revision; inspect and port the patch before using it")
s=p.read_text()
old='''  var KP = { "棒球卡": [0.01, 0.2, 0.12], "藝術品": [0.01, 0.25, 0.25], "名錶": [0, 0.12, 0.15], "名牌包": [-0.01, 0.15, 0.25], "酒": [0.01, 0.15, 0.2], "錢幣郵票": [0, 0.15, 0.15], "珠寶": [-0.01, 0.15, 0.4], "古董": [0, 0.25, 0.25], "公仔玩具": [-0.01, 0.3, 0.2], "收藏車": [0.01, 0.2, 0.1] }[a.category] || [0, 0.2, 0.2];
  var RA = assetGrade(sc, { risk: 4 });
  elSet(RA, elCalc({ mu: KP[0], sig: KP[1], jumps: [{ p: 0.3, s: KP[2] }] }), [{ n: "行情起伏", share: 0.75 }, { n: "賣出成本（手續費、殺價）", share: 0.25 }]);'''
new='''  // QUALITY GATE 2026-10-26: 沒有逐品項成交序列、真實成本及樣本外驗證時，不可使用品類預設參數假造 AAA～CCC。
  // 避免把無資料誤認為 CCC，亦避免它進入整體預期損失；待十指標模型以實際成交資料校準後才恢復評級。
  var RA = assetGrade(sc, { risk: 4 });
  RA.grade = null; RA.score = null; RA.el = null; RA.invest = null; RA.unverified = true;
  RA.evidence = { status: "insufficient", source: null, modelVersion: "evidence-gate-20261026", reason: "尚未建立該件收藏品的可查核成交資料、對照母體與樣本外誤差" };
  det.grow = "尚未有這件收藏品可查核的成交時間序列，無法可靠計算年報酬、波動及十年預期損失。";
  det.risk = "尚未完成該件收藏品的歷史價格波動回測；風險類別僅供辨識，不代表已完成量化驗證。";
  pts.push("品質評級待驗證：不以同類平均值或人工指定機率給 AAA～CCC，也不當作 0% 損失。需提供實際成交與鑑定資料後才能校準。" );'''
assert s.count(old)==1
s=s.replace(old,new)
old2='''function rateBadge(g, big) {
  return '<span class="rt-badge' + (big ? " big" : "") + '" style="background:' + (RATE_COLORS[g] || "#666") + '">' + esc(g) + "</span>";
}'''
new2='''function rateBadge(g, big) {
  if (!g || !RATE_COLORS[g]) return '<span class="rt-badge' + (big ? " big" : "") + '" style="background:#69756e">資料不足</span>';
  return '<span class="rt-badge' + (big ? " big" : "") + '" style="background:' + RATE_COLORS[g] + '">' + esc(g) + "</span>";
}'''
assert s.count(old2)==1;s=s.replace(old2,new2)
old3='''function rateTag(g, big) { return '<span class="rt-tag' + (big ? " big" : "") + '" style="background:' + (RATE_COLORS[g] || "#666") + '">' + rateWord(g) + "</span>"; }'''
new3='''function rateTag(g, big) { if (!g || !RATE_COLORS[g]) return '<span class="rt-tag' + (big ? " big" : "") + '" style="background:#69756e">待取得可驗證資料</span>'; return '<span class="rt-tag' + (big ? " big" : "") + '" style="background:' + RATE_COLORS[g] + '">' + rateWord(g) + "</span>"; }'''
assert s.count(old3)==1;s=s.replace(old3,new3)
old4='''  var q = out.reduce(function (s, x) { return s + x.R.score * x.value; }, 0) / tot;'''
new4='''  var rated = out.filter(function (x) { return x.R && Number.isFinite(x.R.score) && !x.R.unverified; });
  var ratedValue = rated.reduce(function (s, x) { return s + x.value; }, 0);
  var unratedValue = out.reduce(function (s, x) { return s + ((x.R && x.R.unverified) ? x.value : 0); }, 0);
  var q = ratedValue ? rated.reduce(function (s, x) { return s + x.R.score * x.value; }, 0) / ratedValue : null;'''
assert s.count(old4)==1;s=s.replace(old4,new4)
old5='''var X = { list: out, sub: sub, total: tot, quality: q, qGrade: rateLetter(q), risk: risk, loans: loans, cash: C, finTiny: finTiny ? F.cur.total : 0 };'''
new5='''var X = { list: out, sub: sub, total: tot, quality: q, qGrade: q == null ? null : rateLetter(q), risk: risk, loans: loans, cash: C, finTiny: finTiny ? F.cur.total : 0, unratedValue: unratedValue, ratedValue: ratedValue };'''
assert s.count(old5)==1;s=s.replace(old5,new5)
# aggregate: preserve existing mechanics for rated-only accounts; suspend overall grade when any asset unrated, don't call inferred loss on such asset.
needle='''  // 綜合：每一項的預期損失，照淨值（扣掉貸款）加權；越集中，分散的好處越少
  var eqs ='''
replacement='''  // 綜合：未驗證的收藏品不能被轉成合成損失，更不能在整體分數中悄悄當成 0% 損失。
  // 保留個別資產頁面的資料；若有未驗證資產，整體品質標示資料不足，待真實來源可回測才恢復。
  if (unratedValue > 0) {
    X.grade = null; X.score = null; X.el = null; X.invest = null;
    X.unratedNotice = "有 $" + money(unratedValue) + " 收藏品尚無可驗證評級；整體評級暫不提供，避免誤導。";
    X.contrib = []; X.divF = null;
    return X;
  }
  // 綜合：每一項的預期損失，照淨值（扣掉貸款）加權；越集中，分散的好處越少
  var eqs ='''
assert s.count(needle)==1;s=s.replace(needle,replacement)
# show missing reason in detail page
needle2='''  var R = A.R;
  var s = '<div class="rt-top">'''
replace2='''  var R = A.R;
  var s = R.unverified ? '<div class="card" style="border:1px solid var(--warn)"><b>資料不足，暫不給品質等級</b><div class="label">'+ esc(R.evidence.reason) + '</div></div>' : '';
  s += '<div class="rt-top">'''
assert s.count(needle2)==1;s=s.replace(needle2,replace2)
# avoid saving unverified null grade histories
s=s.replace('''if (a.hk) items[a.hk] = [a.R.grade, a.R.risk, String(a.name).slice(0, 20)];''','''if (a.hk && a.R.grade && RATE_COLORS[a.R.grade]) items[a.hk] = [a.R.grade, a.R.risk, String(a.name).slice(0, 20)];''')

# Null grades must remain unknown through descriptions, aggregate risk, and history.
def replace_once(old, new):
    global s
    if s.count(old) != 1: raise ValueError("Unexpected source anchor: " + old[:80])
    s = s.replace(old, new)
replace_once('function rateWord(g) { return ', 'function rateWord(g) { if (!g || !RATE_COLORS[g]) return "資料不足"; return ')
replace_once('function rateGW(g) { return ', 'function rateGW(g) { if (!g || !RATE_COLORS[g]) return "資料不足（待驗證）"; return ')
replace_once('function assetBand(g) {', 'function assetBand(g) {\n  if (!g || !RATE_COLORS[g]) return "缺少可驗證資料，無法判定品質";')
replace_once('  var items = { all: [X.grade, X.risk, "全部資產"] };', '  var items = {}; if (X.grade && RATE_COLORS[X.grade]) items.all = [X.grade, X.risk, "全部資產"];')
replace_once('  call("waRateSnap", { items: items })', '  if (!Object.keys(items).length) { RATE_SNAP_DONE = false; return; }\n  call("waRateSnap", { items: items })')
replace_once('  var R = A.R;\n  var s = R.unverified', '  var R = A.R;\n  if (R.unverified) return \'<div class="notice"><b>資料不足，暫不評級</b><p>\' + esc(R.evidence.reason) + \'</p><p>價格、成本與持有資料仍保留；不將缺資料視為 CCC 或零風險。</p></div><div class="rt-keys">\' + A.key.map(function (k) { return \'<div class="rt-key"><div class="label">\' + esc(k[0]) + \'</div><b>\' + esc(k[1]) + \'</b></div>\'; }).join(\'\') + \'</div>\';\n  var s = R.unverified')
replace_once('    X.contrib = []; X.divF = null;', '    X.risk = null; X.quality = null; X.qGrade = null;\n    X.coverage = tot > 0 ? ratedValue / tot : 0; X.contrib = []; X.divF = null;')
# The full account view must not show invented Rnull or loss for unknown assets.
replace_once('  var al = assetAlerts(X);', '  if (X.unratedNotice) s += \'<div class="notice">\' + esc(X.unratedNotice) + " 已有評級的資產占 " + ratePct(X.coverage, 0) + "。</div>";\n  var al = assetAlerts(X);')
replace_once('function rateRun(D, w, opt) {\n  opt = opt || {};', 'function rateRun(D, w, opt) {\n  opt = opt || {};\n  var requested = Object.keys(w).filter(function (k) { return Number(w[k]) > 0; });\n  if (requested.some(function (k) { return !D.a[k]; })) return null;')
# Bad ages may not silently select a retirement glide path. No model constants changed.
replace_once('  if (age == null) return null;\n  return r.retireAge - age;', '  if (!Number.isFinite(Number(age)) || !(Number(age) > 0) || (r.birth > new Date().getFullYear())) return null;\n  return Number(r.retireAge) - Number(age);')
# Prevent a missing preset from aborting the remaining comparison rows.
replace_once('    return kv(p.icon + " " + p.k, e.g.grade', '    if (!e) return kv(p.icon + " " + p.k, "資料不足", "請核對此方案的標的及回測期間；未用其他資產替代。");\n    return kv(p.icon + " " + p.k, e.g.grade')

# Preserve the existing layout, but make unknown risk explicit.
replace_once('RA.unverified = true;', 'RA.unverified = true; RA.risk = null;')
for line in s.splitlines():
    if 'RATE_RISK[X.risk].n.slice(3)' in line:
        changed = line.replace("\">R' + X.risk +", "\">' + (X.risk == null ? '資料不足' : 'R' + X.risk) +")
        changed = changed.replace('esc(RATE_RISK[X.risk].n.slice(3))', 'esc(X.risk == null ? "無法量化風險" : RATE_RISK[X.risk].n.slice(3))')
        replace_once(line, changed)
    if 'a.R.risk + "</span></div></div>"' in line:
        changed = line.replace("\">R' + a.R.risk +", "\">' + (a.R.risk == null ? '風險待驗證' : 'R' + a.R.risk) +")
        replace_once(line, changed)

replace_once('function elBlockHtml(R, amt) {', 'function elBlockHtml(R, amt) {\n  if (!R || !Number.isFinite(R.el)) return "";')
replace_once('  var C = codes.map(function (k) { return rateCost_(k, D.a[k]); });', '  if (!(T > 0) || R.some(function (r) { return r.length !== T || r.some(function (x) { return !Number.isFinite(x); }); }) || RC.length !== T || CPI.length !== T || RC.concat(CPI).some(function (x) { return !Number.isFinite(x); })) return null;\n  var C = codes.map(function (k) { return rateCost_(k, D.a[k]); });')

replace_once('  var R = codes.map(function (k) { var a = D.a[k], off = rateIdx_(a.s, start);', '  if (codes.some(function (k) { var a = D.a[k], off = rateIdx_(a.s, start); return !Array.isArray(a.r) || a.r.slice(off, off + T).some(function (x) { return !Number.isFinite(x); }); })) return null;\n  var R = codes.map(function (k) { var a = D.a[k], off = rateIdx_(a.s, start);')

replace_once('  var cash = D.a.TWDCASH, coff = rateIdx_(cash.s, start), RC =', '  var complete = function (a, off) { return Array.isArray(a) && off >= 0 && a.slice(off, off + T).length === T && a.slice(off, off + T).every(function (x) { return Number.isFinite(x); }); };\n  if (!D.a.TWDCASH || !complete(D.a.TWDCASH.r, rateIdx_(D.a.TWDCASH.s, start)) || !complete(D.cpi, rateIdx_(D.base, start))) return null;\n  var cash = D.a.TWDCASH, coff = rateIdx_(cash.s, start), RC =')
replace_once('    var fo = rateIdx_(D.fxs, start), FX =', '    if (!complete(D.fxr, rateIdx_(D.fxs, start)) || !D.a.USDCASH || !complete(D.a.USDCASH.r, rateIdx_(D.a.USDCASH.s, start)) || !D.L || !complete(D.L.cpi, rateIdx_(D.L.s, start))) return null;\n    var fo = rateIdx_(D.fxs, start), FX =')

replace_once('    if (!R) return;\n    var high = rateHighRisk(R);', '    if (!R) {\n      var missingData = X.data || RATE_DATA;\n      var missingCodes = Object.keys(w).filter(function (k) { return Number(w[k]) > 0 && !missingData.a[k]; });\n      $("labOut").innerHTML = \'<div class="notice" role="status"><b>資料不足，暫時無法回測這組配置</b><p>\' + (missingCodes.length ? \'缺少標的：\' + esc(missingCodes.join(\'、\')) : \'請核對標的、通膨與匯率的共同月份及缺失資料\') + \'。</p><p>資料截至：\' + esc(missingData.last || \'未標示\') + \'。請稍後重新讀取或更新資料；不會以零報酬或其他資產代替。</p></div>\';\n      return;\n    }\n    var high = rateHighRisk(R);')
replace_once('  var r = D && D.retire; if (!r || !(r.retireAge > 0)) return null;', '  var r = D && D.retire; if (!r || !Number.isFinite(Number(r.retireAge)) || !(Number(r.retireAge) > 0)) return null;')

# Compact home summary uses the same unknown state as the full account view.
for line in s.splitlines():
    changed = line
    for ref in ('X.risk', 'X0.risk', 'a.R.risk'):
        changed = changed.replace('">R\' + ' + ref + ' +', '">' + "' + (" + ref + " == null ? '資料不足' : 'R' + " + ref + ') +')
    changed = changed.replace('esc(RATE_RISK[X0.risk].n.slice(3))', 'esc(X0.risk == null ? "無法量化風險" : RATE_RISK[X0.risk].n.slice(3))')
    changed = changed.replace('(X0.el * 100).toFixed(1)', '(X0.el == null ? "待驗證" : (X0.el * 100).toFixed(1))')
    if changed != line: replace_once(line, changed)

replace_once('(X0.el == null ? "待驗證" : (X0.el * 100).toFixed(1)) + "%・現金夠用 "', '(X0.el == null ? "待驗證" : (X0.el * 100).toFixed(1) + "%") + "・現金夠用 "')
output=args.output;output.parent.mkdir(parents=True,exist_ok=True);output.write_text(s)
print('created',output,output.stat().st_size)
