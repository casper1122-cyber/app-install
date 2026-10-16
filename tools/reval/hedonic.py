import csv, glob, re, sys, json
import numpy as np, pandas as pd

D = sys.argv[1]
CN = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9}
def cnum(s):
    s = s.replace("層", "").replace("樓", "").strip()
    if not s: return None
    if s.isdigit(): return int(s)
    if any(c not in "一二三四五六七八九十" for c in s): return None
    if "十" in s:
        a, b = s.split("十", 1)
        return (CN.get(a, 1) if a else 1) * 10 + (CN.get(b, 0) if b else 0)
    return CN.get(s)

# 移轉層次常寫成「一層，騎樓」「五層，陽臺」「一層，二層」：拆開，只留樓層，騎樓另外記
def floors_of(s):
    out = []
    for tok in re.split(r"[，,、]", s or ""):
        tok = tok.strip()
        if re.fullmatch(r"[一二三四五六七八九十0-9]+層", tok):
            n = cnum(tok)
            if n: out.append(n)
    return sorted(set(out))
MIN_T = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 1130701
BAD = ["預售屋、或土地及建物分件", "親友", "特殊關係", "毛胚", "未登記建物", "樂齡", "預售當時價格", "瑕疵", "凶宅", "急買急賣", "債權債務", "法拍", "受債權", "政府機關", "畸零"]
rows = []
SEEN = set()
for d in sorted(glob.glob(D + "/*/")):
    for city, f in (("臺北市", "A"), ("新北市", "F"), ("桃園市", "H")):
        fn = d + f + "_lvr_land_A.csv"
        if not glob.glob(fn): continue
        for x in list(csv.DictReader(open(fn, encoding="utf-8-sig")))[1:]:
            if x["編號"] in SEEN: continue
            SEEN.add(x["編號"])
            if not x["交易標的"].startswith("房地"): continue
            use = {"住家用": "住", "辦公用": "辦", "商業用": "商", "工業用": "工"}.get(x["主要用途"])
            if not use: continue
            m = re.match(r"土地\d+建物(\d+)車位(\d+)", x["交易筆棟數"])
            if not m or m.group(1) != "1" or int(m.group(2)) > 1: continue
            t = int(x["交易年月日"] or 0)
            if t < MIN_T: continue
            note = x["備註"]
            if any(b in note for b in BAD): continue
            typ = x["建物型態"].split("(")[0]
            if typ in ("工廠", "廠辦", "倉庫"): typ = "華廈" if (cnum(x["總樓層數"]) or 1) > 1 else "透天厝"  # 很少，併到最接近的型態
            if typ not in ("住宅大樓", "華廈", "公寓", "套房", "透天厝"): continue
            fls = floors_of(x["移轉層次"]); tot = cnum(x["總樓層數"])
            fl = fls[0] if fls else None; nfl = max(1, len(fls))
            arcade = "騎樓" in x["移轉層次"]
            if typ == "透天厝":
                if not tot: continue
                fl = 1  # 透天：整棟
            elif not fl or not tot or fl > tot: continue
            by = x["建築完成年月"]
            if not re.match(r"^\d{6,7}$", by): continue
            byear = int(by[:-4]) + 1911; tyear = t // 10000 + 1911 + ((t // 100) % 100 - 0.5) / 12
            age = tyear - byear - 0.5
            if age < -1 or age > 70: continue
            area = float(x["建物移轉總面積平方公尺"]); parea = float(x["車位移轉總面積平方公尺"] or 0)
            price = float(x["總價元"]); pprice = float(x["車位總價元"] or 0)
            barea = area - parea
            if barea <= 8: continue
            hasp = bool(x["車位類別"])
            unit = (price - pprice) / (barea / 3.30579)
            main, att, bal = float(x["主建物面積"] or 0), float(x["附屬建物面積"] or 0), float(x["陽台面積"] or 0)
            pub = 1 - (main + att + bal) / barea if main > 0 else np.nan
            land = float(x["土地移轉總面積平方公尺"] or 0) / 3.30579
            rows.append(dict(city=city, dist=city + x["鄉鎮市區"], ym=t // 100, typ=typ, fl=fl, tot=tot, age=max(0, age),
                ping=barea / 3.30579, unit=unit, hasp=hasp, pnoprice=hasp and pprice == 0, ptype=x["車位類別"],
                pprice=pprice, elev=x["電梯"] == "有", mgmt=x["有無管理組織"] == "有", pub=pub,
                n_add="增建" in note, n_bal="陽台外推" in note, n_roof="頂樓加蓋" in note or "頂加" in note,
                n_furn="傢俱" in note or "家具" in note or "裝潢" in note, n_mezz="夾層" in note, nfl=nfl, arcade=arcade, lease="租約" in note,
                rooms=int(x["建物現況格局-房"] or 0), addr=x["土地位置建物門牌"], use=use, land=land, parea=parea / 3.30579))
df = pd.DataFrame(rows)
def road(a):
    a = re.sub(r"^(臺北市|新北市)?[^區]{1,3}區", "", a)
    m = re.match(r"(.+?(?:路|街|大道)(?:[一二三四五六七八九十]+段)?)", a)
    return m.group(1) if m else ""
df["road"] = df.dist + df.addr.map(road)
ROAD = "--road" in sys.argv
print("rows", len(df))
df = df[(df.unit > 80000) & (df.unit < 4000000)]
# trim per district 2% tails on log unit
df["lu"] = np.log(df.unit)
df["segk"] = df.dist + "|" + df.use + "|" + (df.typ == "透天厝").astype(str)
g = df.groupby("segk").lu
df = df[(df.lu >= g.transform(lambda s: s.quantile(.02))) & (df.lu <= g.transform(lambda s: s.quantile(.98)))]
df = df[df.groupby("dist").lu.transform("size") >= 30]
print("clean", len(df), df.city.value_counts().to_dict())
df.to_pickle(D + "/" + (sys.argv[3] if len(sys.argv) > 3 else "clean.pkl"))

def build(df):
    X = pd.DataFrame(index=df.index)
    X["const"] = 1.0
    for c in sorted(df.dist.unique())[1:]: X["d_" + c] = (df.dist == c) * 1.0
    if ROAD:
        vc = df.road.value_counts(); ok = [r for r in vc[vc >= 20].index if not r.endswith("區")]
        R = pd.DataFrame({"r_" + r: (df.road == r) * 1.0 for r in ok}, index=df.index)
        X = pd.concat([X, R], axis=1)
    yms = sorted(df.ym.unique())
    for c in yms[1:]: X["m_%d" % c] = (df.ym == c) * 1.0
    # 型態（基準：住宅大樓）
    for t in ("華廈", "公寓"): X["型態:" + t] = (df.typ == t) * 1.0
    # 屋齡（基準：5~10 年）
    bins = [(0, 2, "0-2年(新成屋)"), (2, 5, "2-5年"), (10, 20, "10-20年"), (20, 30, "20-30年"), (30, 40, "30-40年"), (40, 99, "40年以上")]
    for a, b, n in bins: X["屋齡:" + n] = ((df.age >= a) & (df.age < b)) * 1.0
    # 樓層（基準：中間樓層 2F 以上、非頂樓）
    X["樓層:1樓"] = (df.fl == 1) * 1.0
    top = (df.fl == df.tot) & (df.fl > 1)
    X["樓層:頂樓(公寓/華廈,無電梯)"] = (top & ~df.elev) * 1.0
    X["樓層:頂樓(有電梯)"] = (top & df.elev) * 1.0
    # 大樓的高度：每高 1 層的效果（只算有電梯、非 1 樓、非頂樓），分段
    mid = (df.fl > 1) & ~top & df.elev
    X["有電梯:6-10樓"] = (mid & (df.fl >= 6) & (df.fl <= 10)) * 1.0
    X["有電梯:11-15樓"] = (mid & (df.fl >= 11) & (df.fl <= 15)) * 1.0
    X["有電梯:16-20樓"] = (mid & (df.fl >= 16) & (df.fl <= 20)) * 1.0
    X["有電梯:21樓以上"] = (mid & (df.fl >= 21)) * 1.0
    X["無電梯:4樓"] = ((~df.elev) & (df.fl == 4) & ~top) * 1.0
    X["棟高:16-25層"] = ((df.tot >= 16) & (df.tot <= 25)) * 1.0
    X["棟高:26層以上"] = (df.tot >= 26) * 1.0
    X["有管理組織"] = df.mgmt * 1.0
    # 坪數（基準：25~35 坪）
    for a, b, n in [(0, 15, "<15坪"), (15, 25, "15-25坪"), (35, 50, "35-50坪"), (50, 80, "50-80坪"), (80, 999, "80坪以上")]:
        X["坪數:" + n] = ((df.ping >= a) & (df.ping < b)) * 1.0
    pubf = df.pub.fillna(df.pub.median())
    X["公設比每+10%"] = (pubf - 0.3) * 10
    X["車位:有(另計價)"] = (df.hasp & ~df.pnoprice) * 1.0
    X["車位:有(沒拆價)"] = df.pnoprice * 1.0
    X["備註:增建"] = df.n_add * 1.0
    X["備註:陽台外推"] = df.n_bal * 1.0
    X["備註:頂樓加蓋"] = df.n_roof * 1.0
    X["備註:含傢俱/裝潢"] = df.n_furn * 1.0
    X["備註:夾層"] = df.n_mezz * 1.0
    return X

def fit(df, label):
    X = build(df); y = df.lu.values
    A = X.values
    b, *_ = np.linalg.lstsq(A, y, rcond=None)
    res = y - A @ b
    n, k = A.shape
    s2 = res @ res / (n - k)
    cov = s2 * np.linalg.pinv(A.T @ A)
    se = np.sqrt(np.diag(cov))
    r2 = 1 - res.var() / y.var()
    out = pd.DataFrame({"b": b, "se": se}, index=X.columns)
    return out, r2, res, X

out, r2, res, X = fit(df, "all")
print("R2 %.3f  median abs err %.1f%%" % (r2, np.median(np.abs(np.exp(res) - 1)) * 100))
keep = [c for c in out.index if not c.startswith(("d_", "m_", "const", "r_"))]
o = out.loc[keep].copy(); o["pct"] = (np.exp(o.b) - 1) * 100; o["t"] = o.b / o.se
o["n"] = [int(X[c].abs().gt(0).sum()) for c in keep]
pd.set_option("display.width", 200)
print(o[["pct", "t", "n"]].round(1).to_string())
# 時間趨勢
m = out.loc[[c for c in out.index if c.startswith("m_")]]
print("month trend", ((np.exp(m.b) - 1) * 100).round(1).to_dict())
# 分城市看穩不穩
res_city = {}
for c in ("臺北市", "新北市"):
    oc, r2c, rc, Xc = fit(df[df.city == c], c)
    oc = oc.loc[[k for k in keep if k in oc.index]]
    res_city[c] = ((np.exp(oc.b) - 1) * 100).round(1)
    print(c, "R2 %.3f mae %.1f%%" % (r2c, np.median(np.abs(np.exp(rc) - 1)) * 100))
print(pd.DataFrame(res_city).to_string())
# holdout: 最後一個月當測試
last = df.ym.max(); tr = df[df.ym < last - 1]; te = df[df.ym >= last - 1]
ot, *_ = fit(tr, "tr")
Xt = build(pd.concat([tr, te])).loc[te.index]
cols = [c for c in Xt.columns if c in ot.index]
pred = Xt[cols].values @ ot.loc[cols].b.values
# 沒在訓練出現的月份用最後一個月的趨勢
lastm = [c for c in ot.index if c.startswith("m_")][-1]
pred = pred + ot.loc[lastm].b * ((te.ym.values >= last - 1) * 1)
err = np.exp(te.lu.values - pred) - 1
print("holdout n=%d  median abs err %.1f%%  within10%% %.0f%%  within20%% %.0f%%" % (len(te), np.median(np.abs(err)) * 100, (np.abs(err) < .1).mean() * 100, (np.abs(err) < .2).mean() * 100))
out.to_csv(D + "/coef.csv")
