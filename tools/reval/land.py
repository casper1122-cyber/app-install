# 土地（只有土地的交易）估價：每坪單價 ~ 使用分區、行政區、地段、面積、是不是持分
# 用法：python3 land.py <資料夾> <最早成交日 民國yyymmdd> [out資料夾]
import csv, glob, re, sys, json, os, collections
import numpy as np, pandas as pd
D = sys.argv[1]; MIN_T = int(sys.argv[2]); OUT = sys.argv[3] if len(sys.argv) > 3 else None
BAD = ["親友", "特殊關係", "員工", "急買急賣", "債權", "債務", "法拍", "受債權", "政府機關", "畸零", "瑕疵", "預售"]
def zone_of(urban, nz, nb):
    u = re.sub(r"^都市：", "", urban or "").split("。")[0]
    if u:
        if "公共設施用地" in u or re.search(r"(道路|公園|學校|廣場|綠地|停車場|市場|機關|堤防|溝渠|兒童遊樂場|體育場)用地", u): return "公設保留地"
        if "住" in u and "商" not in u: return "住宅區"
        if "商" in u: return "商業區"
        if "工" in u: return "工業區"
        if "農" in u: return "農業區"
        if "保護" in u or "保安" in u or "河川" in u: return "保護區"
        return "都市其他"
    b = nb or ""
    for k, z in (("甲種建築", "甲建"), ("乙種建築", "乙建"), ("丙種建築", "丙建"), ("丁種建築", "丁建"), ("農牧", "農牧"), ("林業", "林業"), ("交通", "交通水利"), ("水利", "交通水利")):
        if k in b: return z
    if nz or nb: return "非都市其他"
    return ""
rows = []; seen = set()
for d in sorted(glob.glob(D + "/*/")):
    for city, f in (("臺北市", "A"), ("新北市", "F"), ("桃園市", "H")):
        fn = d + f + "_lvr_land_A.csv"
        if not os.path.exists(fn): continue
        share = {}
        lf = d + f + "_lvr_land_A_land.csv"
        if os.path.exists(lf):
            for y in list(csv.DictReader(open(lf, encoding="utf-8-sig")))[1:]:
                if "持分" in y["移轉情形"]: share[y["編號"]] = 1
        for x in list(csv.DictReader(open(fn, encoding="utf-8-sig")))[1:]:
            if x["編號"] in seen or x["交易標的"] != "土地": continue
            seen.add(x["編號"])
            t = int(x["交易年月日"] or 0)
            if t < MIN_T: continue
            if any(b in x["備註"] for b in BAD): continue
            area = float(x["土地移轉總面積平方公尺"] or 0) / 3.30579; price = float(x["總價元"] or 0)
            if area < 1 or price < 10000: continue
            z = zone_of(x["都市土地使用分區"], x["非都市土地使用分區"], x["非都市土地使用編定"])
            if not z: continue
            loc = x["土地位置建物門牌"]
            m = re.match(r"(.*?段)(.*?小段)?(\d+)", loc)
            sec = (m.group(1) or "") if m else ""; sub = (m.group(2) or "") if m else ""; no = int(m.group(3)) if m else -1
            n = re.match(r"土地(\d+)", x["交易筆棟數"]); npar = int(n.group(1)) if n else 1
            rows.append(dict(city=city, dist=city + x["鄉鎮市區"], ym=t // 100, zone=z, area=area, unit=price / area, partial=x["編號"] in share,
                             npar=npar, sec=sec, subs=sub, no=no, loc=loc, note=x["備註"]))
df = pd.DataFrame(rows)
df = df[(df.unit > 3000) & (df.unit < 2e7)].copy()
df["lu"] = np.log(df.unit)
df["zk"] = df.dist + "|" + df.zone
g = df.groupby("zk").lu
df = df[(df.lu >= g.transform(lambda s: s.quantile(.03))) & (df.lu <= g.transform(lambda s: s.quantile(.97)))].copy()
df = df.reset_index(drop=True)
print("land rows", len(df), df.zone.value_counts().to_dict())
df["k_sec"] = df.dist + "|" + df.zone + "|" + df.sec
df["k_sub"] = df.k_sec + "|" + df.subs
df["k_no"] = df.k_sub + "|" + (df.no // 100).astype(str)
ZONES = sorted(df.zone.unique())
def build(d):
    X = pd.DataFrame(index=d.index); X["const"] = 1.0
    for z in ZONES[1:]: X["z_" + z] = (d.zone == z) * 1.0
    for c in ["新北市", "桃園市"]:
        for z in ZONES: X["cz_%s_%s" % (c, z)] = ((d.city == c) & (d.zone == z)) * 1.0
    for x in sorted(df.dist.unique())[1:]: X["d_" + x] = (d.dist == x) * 1.0
    X["log面積"] = np.log(d.area); X["log面積2"] = np.log(d.area) ** 2
    X["持分"] = d.partial * 1.0; X["多筆"] = (d.npar > 1) * 1.0
    X["公設x持分"] = ((d.zone == "公設保留地") & d.partial) * 1.0
    mi = (d.ym // 100) * 12 + d.ym % 100; X["t"] = (mi - mi.max()) / 12.0
    return X
LEV = [("zk", 3), ("k_sec", 2), ("k_sub", 2), ("k_no", 2)]
def train(tr):
    X = build(tr); b, *_ = np.linalg.lstsq(X.values, tr.lu.values, rcond=None)
    r = pd.Series(tr.lu.values - X.values @ b, index=tr.index); eff = {}
    for lv, k in LEV:
        rc = r.clip(-0.5, 0.5); gg = rc.groupby(tr[lv]); e = gg.sum() / (gg.size() + k); eff[lv] = e; r = r - tr[lv].map(e).fillna(0)
    return list(X.columns), b, eff
def pred(m, d):
    cols, b, eff = m; X = build(d)
    for c in cols:
        if c not in X.columns: X[c] = 0.0
    p = X[cols].values @ b
    for lv, _ in LEV: p = p + d[lv].map(eff[lv]).fillna(0).values
    return p
rng = np.random.RandomState(0); f = rng.randint(0, 5, len(df)); err = np.zeros(len(df))
for i in range(5):
    tr, te = df[f != i], df[f == i]; m = train(tr); err[te.index] = np.abs(np.exp(te.lu.values - pred(m, te)) - 1)
print("land CV median err %.1f%%  within20 %.0f%%" % (np.median(err) * 100, (err < .2).mean() * 100))
rec = (df.ym >= 11307).values
print("  最近兩年的成交：誤差 %.1f%%" % (np.median(err[rec]) * 100))
for z in ZONES:
    mm = (df.zone == z).values
    print("  %-8s n=%5d  誤差 %.1f%%  80%%區間 ±%.0f%%" % (z, mm.sum(), np.median(err[mm]) * 100, np.quantile(err[mm], .8) * 100))
df["err"] = err
if OUT:
    m = train(df); cols, b, eff = m; B = dict(zip(cols, b))
    os.makedirs(OUT + "/l", exist_ok=True)
    base = json.load(open(OUT + "/base.json"))
    dists = sorted(df.dist.unique())
    base["land"] = {"coef": {k: round(float(v), 5) for k, v in B.items() if not k.startswith("d_")}, "dist": {x: round(float(B.get("d_" + x, 0)), 5) for x in dists},
                    "zones": ZONES, "band": {z: round(float(np.quantile(err[(df.zone == z).values], .8)), 3) for z in ZONES},
                    "files": {x: "l%02d.json" % i for i, x in enumerate(dists)}, "n": int(len(df)),
                    "from": "%d/%02d" % (df.ym.min() // 100, df.ym.min() % 100), "through": "%d/%02d" % (df.ym.max() // 100, df.ym.max() % 100)}
    mi = (df.ym // 100) * 12 + df.ym % 100
    for x in dists:
        o = {lv: {k[len(x):]: round(float(v), 3) for k, v in eff[lv].items() if k.startswith(x) and abs(v) >= 0.003} for lv, _ in LEV}
        rr = df[(df.dist == x) & (mi > mi.max() - 24)].sort_values("ym", ascending=False)
        o["near"] = {k[len(x):]: [[int(r.ym), r.loc[:20], r.zone, round(float(r.area), 1), int(round(r.unit, -2)), int(r.partial)] for r in g2.head(10).itertuples()] for k, g2 in rr.groupby("k_sub")}
        json.dump(o, open(OUT + "/l/" + base["land"]["files"][x], "w"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    json.dump(base, open(OUT + "/base.json", "w"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    smp = df.sample(min(2000, len(df)), random_state=3).copy(); smp["py"] = pred(m, smp) - build(smp)["t"].values * B["t"]
    smp[["city", "dist", "zone", "area", "partial", "npar", "sec", "subs", "no", "py", "lu"]].to_json(OUT + "/../land_check.json", orient="records", force_ascii=False)
    print("exported land", len(dists))
