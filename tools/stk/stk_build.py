# 個股資料給 App：每檔的每月還原報酬（評級回測用）＋「公司自己出事」的機率（3 年內比大盤多跌一半）
# 純 Python（桌面程式也用同一段），模型係數放在網站的資料清單裡，之後重新訓練不用改程式
import json, gzip, math, statistics
def stk_build(packs, snap, lst, model, last):
    # packs: {code: [[ym, close, adjclose, volume], ...]}；snap: 證交所某月 {'px':{f,r},'pe':{f,r}}；lst: 清單；last: 要對齊到的最後一個月（App 回測資料的最後一個月）
    def ymadd(ym, k): y, m = int(ym[:4]), int(ym[5:7]) - 1 + k; return "%04d-%02d" % (y + m // 12, m % 12 + 1)
    L = {x["c"]: x for x in lst}
    S = {}
    for c, rows in packs.items():
        d = {}
        for ym, cl, ac, vol in rows:
            if ac and ac > 0 and ym <= last: d[ym] = ac
        if len(d) >= 2: S[c] = d
    # 每月報酬（對數，算風險用）、等權重市場（上市股票的中位數）
    lr = {}
    for c, d in S.items():
        ks = sorted(d); lr[c] = {}
        for a, b in zip(ks, ks[1:]):
            if ymadd(a, 1) == b: lr[c][b] = max(-1.5, min(1.5, math.log(d[b] / d[a])))
    mons = [ymadd(last, -k) for k in range(35, -1, -1)]
    mk = {}
    for ym in mons:
        v = [lr[c][ym] for c in lr if ym in lr[c] and L.get(c, {}).get("mk") == "上市"]
        mk[ym] = statistics.median(v) if v else 0.0
    pe = {}
    if snap and snap.get("pe"):
        f = snap["pe"]["f"]; ip, ib, iy = f.index("本益比"), f.index("股價淨值比"), f.index("殖利率(%)")
        num = lambda s: float(str(s).replace(",", "")) if str(s).replace(",", "").replace(".", "", 1).replace("-", "", 1).isdigit() else None
        for r in snap["pe"]["r"]: pe[r[0]] = (num(r[ip]), num(r[ib]), num(r[iy]))
    out = {}
    for c, d in S.items():
        x = L.get(c, {}); rr = [(lr[c].get(ym), mk[ym]) for ym in mons]; ok = [(a, b) for a, b in rr if a is not None]
        info = {"n": x.get("n", c), "mk": x.get("mk", ""), "ind": x.get("ind", "")}
        ks = sorted(d); s0 = ks[0]
        # App 用的每月簡單報酬（萬分之一），從第一個月接到 last
        r = []; k = s0
        while k < last:
            k2 = ymadd(k, 1); r.append(int(round((d[k2] / d[k] - 1) * 1e4)) if k in d and k2 in d else None); k = k2
        info["s"] = ymadd(s0, 1); info["r"] = r
        if len(ok) >= 24:
            ma = sum(b for a, b in ok) / len(ok); sa = sum(a for a, b in ok) / len(ok)
            vb = sum((b - ma) ** 2 for a, b in ok) / (len(ok) - 1); cov = sum((a - sa) * (b - ma) for a, b in ok) / (len(ok) - 1)
            beta = cov / vb if vb > 0 else 1.0
            res = [a - beta * b for a, b in ok]; mr = sum(res) / len(res)
            ivol = min(1.2, math.sqrt(sum((v - mr) ** 2 for v in res) / (len(res) - 1)) * math.sqrt(12))
            p12 = d.get(ymadd(last, -12)); mom = math.log(d[last] / p12) if p12 and last in d else 0.0
            F = {"ivol": ivol, "mom_dn": max(0.0, -mom - 0.15), "mom_up": max(0.0, mom - 0.3)}
            q = pe.get(c)
            if x.get("mk") == "上市" and q:
                pev, pbv, dyv = q; F["pb_hi"] = math.log(max(pbv if pbv and pbv > 0 else 1.5, 2) / 2); F["loss"] = 0 if pev and pev > 0 else 1
                dy = dyv if dyv and dyv > 0 else 0.0; F["nodiv"] = 1 if dy <= 0.01 else 0; F["dy"] = min(10.0, dy); M = model["full"]
            else: M = model["px"]
            z = M["b0"] + sum(M["w"][k2] * F[k2] for k2 in M["w"]); p = 1 / (1 + math.exp(-z))
            # 比一般股票多（或少）的預期損失：只算驗證過的 3 年（不往後推 10 年，風險條件會變）
            info["p"] = round(p, 4); info["x"] = round(model["sev"] * (p - model["pTyp"]), 4)
            info["f"] = {"ivol": round(ivol, 3), "mom": round(mom, 3), "beta": round(beta, 2)}
            if "loss" in F: info["f"].update({"pb": q[1], "loss": F["loss"], "dy": round(F["dy"], 2)})
            info["m"] = "full" if M is model["full"] else "px"
        out[c] = info
    return out
