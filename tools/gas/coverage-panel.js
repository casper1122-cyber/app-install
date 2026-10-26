// Existing per-asset model results stay visible; this does not create a portfolio grade.
function assetCoverageHtml(X) {
  var list = X.list || [];
  var hasResult = function (a) { return a.R && !a.R.unverified && Number.isFinite(a.R.score) && !!RATE_COLORS[a.R.grade]; };
  var rated = list.filter(hasResult), pending = list.filter(function (a) { return !hasResult(a); });
  var value = rated.reduce(function (s, a) { return s + a.value; }, 0);
  var fraction = X.total > 0 ? Math.max(0, Math.min(1, value / X.total)) : 0;
  var coverageText = fraction < 1 && fraction > 0.999 ? "超過99.9%" : ratePct(fraction, 1);
  var pendingNames = pending.map(function (a) { return a.name; });
  var rows = rated.map(function (a) {
    return '<div class="line" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin:10px 0"><div><b>' + esc(a.name) + '</b><div class="label">' + esc(a.kind) + ' · $' + money(a.value) + '</div></div><div>' + rateBadge(a.R.grade) + ' ' + rateTag(a.R.grade) + (a.R.risk != null && RATE_RISK[a.R.risk] ? ' <span class="rt-risk r' + a.R.risk + '">R' + a.R.risk + '</span>' : '') + '</div></div>';
  }).join('');
  return '<section aria-label="資產評估範圍"><div style="font-size:18px;font-weight:700">已有結果的資產分析</div><p class="label">已有模型結果的資產占 ' + coverageText + '（$' + money(value) + '／總資產 $' + money(X.total) + '）。以下逐項呈現，不代表全部資產綜合等級；既有模型仍有各自的估計與資料限制。</p>' +
    '<div style="height:8px;background:var(--line);border-radius:4px;overflow:hidden"><div style="height:100%;background:var(--brand);width:' + (fraction * 100).toFixed(2) + '%"></div></div>' +
    (rows || '<p>目前尚無可呈現的個別評級，已登記的資產價值仍完整保留。</p>') +
    (pendingNames.length ? '<details class="rt-det"><summary>尚待評估：' + pendingNames.length + ' 項</summary><p class="label">' + esc(pendingNames.join('、')) + '。尚未建立可驗證模型，未計入任何推估的綜合損失或等級。</p></details>' : '') +
    (X.finTiny > 0 ? '<p class="label">另有金融資產 $' + money(X.finTiny) + ' 依既有小額規則未列入個別評級；仍包含在總資產及覆蓋率分母。</p>' : '') +
    '<p class="label">全部資產綜合評級尚未提供。歷史回測另列，缺價格的項目仍可能使用原有估計，請查看圖表下方說明。</p></section>';
}
