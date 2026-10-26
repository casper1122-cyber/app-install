// Standard-normal CDF: Abramowitz & Stegun 26.2.17 polynomial approximation.
// Numerical constants below approximate a mathematical function, not market parameters.
function elNormalCdf_(x) {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  var z = Math.abs(x), t = 1 / (1 + 0.2316419 * z);
  var tail = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}
// For G=exp(m+sZ), evaluate E[clamp((L+I-G)/I, 0, 1)].
// E[G 1(G<=K)] = exp(m+s²/2) Phi((ln(K)-m-s²)/s).
function elLognormalLoss_(m, s, loan, invested) {
  var upper = loan + invested;
  var zu = (Math.log(upper) - m) / s;
  var zl = loan > 0 ? (Math.log(loan) - m) / s : -Infinity;
  var probability = Math.max(0, elNormalCdf_(zu) - elNormalCdf_(zl));
  var momentProbability = Math.max(0, elNormalCdf_(zu - s) - elNormalCdf_(zl - s));
  var moment = momentProbability === 0 ? 0 : Math.exp(m + s * s / 2) * momentProbability;
  var loss = elNormalCdf_(zl) + (upper * probability - moment) / invested;
  return Math.max(0, Math.min(1, loss));
}
function elCalc(P) {
  // Preserve existing economic assumptions; this change only fixes numerical integration.
  var yrs = P.yrs || 10, mu = P.mu || 0, sig = Math.max(0.0001, P.sig || 0), ltv = Math.min(0.95, Math.max(0, P.ltv || 0));
  var am = P.amort != null ? Math.max(0, Math.min(1, P.amort)) : 1, defl = Math.pow(0.98, yrs);
  var loan10 = ltv * am * defl, paidIn = (1 - ltv) + ltv * (1 - am) * Math.pow(0.98, yrs / 2);
  var J = (P.jumps || []).filter(function (j) { return j.p > 0 && j.s > 0; }).sort(function (a, b) { return b.p * b.s - a.p * a.s; }).slice(0, 7);
  var combos = [{ p: 1, f: 1 }];
  J.forEach(function (j) { var nx = []; combos.forEach(function (c) { nx.push({ p: c.p * (1 - Math.min(1, j.p)), f: c.f }); nx.push({ p: c.p * Math.min(1, j.p), f: c.f * (1 - Math.min(1, j.s)) }); }); combos = nx; });
  var m = (mu - sig * sig / 2) * yrs, s = sig * Math.sqrt(yrs), el = 0;
  combos.forEach(function (c) {
    if (c.p === 0) return;
    el += c.p * (c.f <= 0 ? 1 : elLognormalLoss_(m + Math.log(c.f), s, ltv > 0 ? loan10 : 0, ltv > 0 ? paidIn : 1));
  });
  return Math.max(0, Math.min(1, el));
}
