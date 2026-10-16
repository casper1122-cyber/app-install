# 用全部資料訓練一次，匯出給 App 用的估價表：base.json + 每個行政區一個檔
import sys, json, os
D, OUT = sys.argv[1], sys.argv[2]
sys.argv = [sys.argv[0], D]
src = open(os.path.dirname(os.path.abspath(__file__)) + "/model2.py").read().split("for name, lv in")[0]
exec(src)
LEVELS = [("road", 3), ("blk", 2), ("side", 2), ("blk2", 2), ("lane", 2), ("near20", 2), ("bldg", 1)]
cols, b, eff, sd = train(df)
B = dict(zip(cols, b))
# 1 樓店面的「在地店面行情」：店面賣多少很看是哪條路（大馬路商圈 vs 住宅區），所以另外用店面成交再算一層地段效果
Xall = build(df)
for c in cols:
    if c not in Xall.columns: Xall[c] = 0.0
pall = Xall[cols].values @ b
# 店面的基準：不含「附近門牌」「同一棟」（那兩層多半是樓上住宅，店面行情要看整條路／這一段）
for lv in ["road", "blk", "side", "blk2", "lane"]: pall = pall + df[lv].map(eff[lv]).fillna(0).values
SHOP_LV = ["road", "blk", "side"]
shopm = ((df.use == "商") & (df.fl == 1)).values
rs = pd.Series(df.lu.values - pall, index=df.index)[shopm]; dsh = df[shopm]
shop_eff = {}
for lv in SHOP_LV:
    rc = rs.clip(-0.5, 0.5); g = rc.groupby(dsh[lv]); e = g.sum() / (g.size() + 0.5); shop_eff[lv] = e
    rs = rs - dsh[lv].map(e).fillna(0)
# 各地自己的價差（行政區 → 路 → 門牌區段，成交越少越往上一層靠）：全市共用的係數之外，再看這一帶的
# 大小坪數、屋齡（新舊）、樓層高低、公設比、1 樓 是不是跟全市不一樣。比較都是先換算到同一個月的行情再比。
# 驗證（交叉驗證誤差中位數）：全部 7.04% → 6.91%，最近一年 7.01% → 6.89%，台北 6.95% → 6.87%，8 樓以上 5.62% → 5.48%
SL_K = 2.0
_res = (df.use == "住") & (df.typ != "透天厝")
SLX = {"size": np.log(df.ping / 30.0).where(_res, 0.0).clip(-1.2, 1.2),
       "age": ((np.minimum(df.age, 50) - 30) / 10).where(_res, 0.0),
       "floor": ((df.fl.clip(1, 30) - 5) / 10).where(_res & df.elev & (df.fl > 1), 0.0),
       "pub": ((df.pub.fillna(df.pub.median()) - 0.3) * 10).where(_res, 0.0).clip(-3, 3),
       "f1": ((df.fl == 1) * 1.0).where(_res, 0.0)}
_pf = Xall[cols].values @ b
for lv, _ in LEVELS: _pf = _pf + df[lv].map(eff[lv]).fillna(0).values
_rr = pd.Series(df.lu.values - _pf, index=df.index).clip(-0.2, 0.2); _w = pd.Series(0.5 ** (AGE_Y / HALF_LIFE), index=df.index)
SLS = {fn: {} for fn in SLX}
for lv in ("dist", "road", "blk"):
    for fn, x in SLX.items():
        sl = (_w * x * _rr).groupby(df[lv]).sum() / ((_w * x * x).groupby(df[lv]).sum() + SL_K)
        SLS[fn][lv] = sl; _rr = _rr - df[lv].map(sl).fillna(0) * x
feat = {k: round(float(v), 5) for k, v in B.items() if not k.startswith(("d_", "m_", "const", "da_"))}
distAge = {k[3:]: round(float(v), 5) for k, v in B.items() if k.startswith("da_")}
dists = sorted(df.dist.unique())
distfx = {d: round(float(B.get("d_" + d, 0.0)), 5) for d in dists}
yms = sorted(df.ym.unique())
level = {}
levelFrom = {}
for c in sorted(df.city.unique()):
    # 市場水準：用最近 1 個月；那個月成交太少（<200 筆）就用最近 2 個月
    n1 = int(((df.city == c) & (df.ym == yms[-1])).sum())
    last = yms[-1:] if n1 >= 200 else yms[-2:]
    level[c] = round(float(np.mean([B.get("m_%s_%d" % (c, y), 0.0) for y in last])), 5)
    levelFrom[c] = "%d/%02d" % (last[0] // 100, last[0] % 100)
# 車位：各縣市各類型中位數（只用有另外計價的）
p = df[df.hasp & (df.pprice > 0)].copy()
p["t"] = p.ptype.where(p.ptype.isin(["坡道平面", "坡道機械", "升降平面", "升降機械", "塔式車位", "一樓平面"]), "其他")
park = {c: {t: int(round(v, -4)) for t, v in g.groupby("t").pprice.median().items()} for c, g in p.groupby("city")}
# 區間（80% 的成交落在裡面），用交叉驗證的結果
cvd = pd.read_pickle(D + "/cv.pkl"); a = cvd.err
seen = cvd.bldg.map(cvd.bldg.value_counts()).ge(2)
bands = {}
res = (cvd.use == "住") & (cvd.typ != "透天厝")
for n, m in (("seen", seen), ("new", ~seen)):
    bands[n] = {t: round(float(a[m & res & (cvd.typ == t)].quantile(.8)), 3) for t in ("住宅大樓", "華廈", "公寓")}
    bands[n]["透天"] = round(float(a[m & (cvd.typ == "透天厝")].quantile(.8)), 3)
    bands[n]["辦公"] = round(float(a[m & (cvd.use == "辦") & (cvd.typ != "透天厝")].quantile(.8)), 3)
    bands[n]["店面"] = round(float(a[m & (cvd.use == "商") & (cvd.fl == 1)].quantile(.8)), 3)
    bands[n]["商業"] = round(float(a[m & (cvd.use == "商") & (cvd.fl > 1)].quantile(.8)), 3)
    bands[n]["工業"] = round(float(a[m & (cvd.use == "工")].quantile(.8)), 3)
base = {"v": 1, "through": "%d/%02d" % (yms[-1] // 100, yms[-1] % 100), "from": "%d/%02d" % (yms[0] // 100, yms[0] % 100),
        "n": int(len(df)), "const": round(float(B["const"]), 5), "pubMed": round(float(df.pub.median()), 4),
        "feat": feat, "distAge": distAge, "dist": distfx, "level": level, "levelFrom": levelFrom, "park": park, "bands": bands,
        "cnt": {d: int(c) for d, c in df.dist.value_counts().items()}}
os.makedirs(OUT + "/d", exist_ok=True)
# 巷弄裡近 3 年完全沒有其他成交的房子：交叉驗證顯示系統會系統性估低（台北 +1.7%、新北 +1.4%）、桃園估高 1.0%，App 補回來
base["lonely"] = {"臺北市": 0.017, "新北市": 0.014, "桃園市": -0.010}
# 車位坪數（權狀裡車位占多少坪）：各類型中位數，使用者沒填車位坪數時用
pa = df[df.hasp & (df.parea > 0)].copy()
pa["t"] = pa.ptype.where(pa.ptype.isin(["坡道平面", "坡道機械", "升降平面", "升降機械", "塔式車位", "一樓平面"]), "其他")
base["parkArea"] = {t: round(float(v), 2) for t, v in pa.groupby("t").parea.median().items()}
# 附近最近 12 個月的成交（給使用者自己看行情）：每個門牌區段最多 10 筆
mi_ = (df.ym // 100) * 12 + df.ym % 100; lastmi = mi_.max()
FW2 = str.maketrans("０１２３４５６７８９", "0123456789")
def short(a):
    a = a.translate(FW2); a = re.sub(r"^(臺北市|新北市|桃園市)?[^區]{1,3}區", "", a); return a[:22]
recent = df[(mi_ > lastmi - 12) & df.blk.notna()].copy()
recent["sa"] = recent.addr.map(short)
TY4 = ["住宅大樓", "華廈", "公寓", "透天厝"]; US = ["住", "辦", "商", "工"]
import glob as _g
_seas = sorted({os.path.basename(x) for x in _g.glob(D + "/*/*") if re.match(r"^1\d\dS[1-4]$", os.path.basename(x))}, key=lambda z: (int(z[:-2]), int(z[-1])))
base["season"] = _seas[-1] if _seas else ""   # 最新的一季（例如 115S3），後台用來判斷該不該更新
base["seasons"] = _seas
base["files"] = {d: "d%02d.json" % i for i, d in enumerate(dists)}
# 沒填公設時用：同一棟的公設比 → 同型態同屋齡的中位數（舊大樓公設比低很多，用全體平均會估錯）
AB = [0, 5, 10, 20, 30, 40, 999]
base["pubAge"] = AB[1:-1]
base["biTyp"] = ["住宅大樓", "華廈", "公寓", "透天厝"]
base["pubBy"] = {t: [round(float(df[(df.typ == t) & (df.age >= AB[i]) & (df.age < AB[i + 1])].pub.median()), 3) for i in range(len(AB) - 1)] for t in ("住宅大樓", "華廈", "公寓")}
bpub = df.dropna(subset=["bldg"]).groupby("bldg").pub.median()
# 同一區段、同型態、差不多年代（每 5 年一組）其他大樓的公設比中位數：自己這棟沒資料時用（驗證：誤差從 2.2% 降到 0.4%，比全市同屋齡平均準很多）
_bb = df.dropna(subset=["bldg"]).copy(); _bb = _bb[_bb.pub.notna() & (_bb.typ != "透天厝")]
_bb["by5"] = _bb.bldg.str.split("|").str[-1].astype(int) // 5
_bm = _bb.groupby("bldg").agg(pub=("pub", "median"), typ=("typ", "first"), blk=("blk", "first"), road=("road", "first"), by5=("by5", "first"))
PUBL = {}
for col, tag in (("blk", "b"), ("road", "r")):
    g = _bm.dropna(subset=[col]).groupby([col, "typ", "by5"]).pub.agg(["median", "size"])
    for (k, t, y), r in g.iterrows():
        if r["size"] >= 2: PUBL[k + "|" + t + "|" + str(int(y)) + "|" + tag] = round(float(r["median"]), 3)
# 只用門牌找得到的大樓資料（使用者沒填總樓層、完工年、車位價時用）：鍵＝路|巷-弄|號
TYP = ["住宅大樓", "華廈", "公寓", "透天厝"]
dfa = df.dropna(subset=["lane"]).copy()
dfa = dfa[dfa.use == "住"]  # 同一棟的基本資料用住宅的成交
dfa["addrk"] = dfa.lane + "|" + nbs.loc[dfa.index]
dfa = dfa[nbs.loc[dfa.index] != ""]
dfa["by"] = (dfa.ym // 100 + 1911 + ((dfa.ym % 100) - 0.5) / 12 - dfa.age - 0.5).round(0).astype(int)
BI = {}
for k, g in dfa.groupby("addrk"):
    top = g.groupby(["tot", "by"]).size().idxmax(); g2 = g[(g.tot == top[0]) & (g.by == top[1])]
    pk = g2[g2.hasp & (g2.pprice > 0)]
    park = {t: int(round(v, -4)) for t, v in pk.groupby("ptype").pprice.median().items()} if len(pk) else {}
    BI[k] = [int(top[0]), int(top[1]), TYP.index(g2.typ.mode()[0]), int(g2.elev.mean() >= .5), int(g2.mgmt.mean() >= .5), (round(float(g2.pub.median()), 3) if g2.pub.notna().any() else None), park, int(len(g2))]  # 檔名用英數字，Windows 解壓縮、GitHub 上傳都不會出問題
tot = 0
for d in dists:
    o = {}
    for lv, _ in LEVELS:
        e = eff[lv]; e = e[[k.startswith(d) for k in e.index]]
        o[lv] = {k[len(d):]: round(float(v), 3) for k, v in e.items() if abs(v) >= 0.003 or lv == "lane"}  # 巷弄全部留：App 要知道這條巷弄有沒有成交
    bp = bpub[[k.startswith(d) for k in bpub.index]]
    o["pub"] = {k[len(d):]: round(float(v), 3) for k, v in bp.items() if v == v}
    o["bi"] = {k[len(d):]: v for k, v in BI.items() if k.startswith(d)}
    o["sl"] = {fn: {"d": round(float(SLS[fn]["dist"].get(d, 0.0)), 4),
                    "road": {k[len(d):]: round(float(v), 4) for k, v in SLS[fn]["road"].items() if isinstance(k, str) and k.startswith(d) and abs(v) >= 0.002},
                    "blk": {k[len(d):]: round(float(v), 4) for k, v in SLS[fn]["blk"].items() if isinstance(k, str) and k.startswith(d) and abs(v) >= 0.002}} for fn in SLX}
    o["pubL"] = {k[len(d):]: v for k, v in PUBL.items() if k.startswith(d)}
    o["shop"] = {lv: {k[len(d):]: round(float(v), 3) for k, v in shop_eff[lv].items() if isinstance(k, str) and k.startswith(d) and abs(v) >= 0.003} for lv in SHOP_LV}
    rr = recent[recent.dist == d].sort_values("ym", ascending=False)
    o["near"] = {k[len(d):]: [[int(x.ym), x.sa, int(x.fl), int(x.tot), round(float(x.age), 1), round(float(x.ping), 1), int(round(x.unit, -2)), TY4.index(x.typ) if x.typ in TY4 else 0, US.index(x.use)] for x in g.head(10).itertuples()]
                 for k, g in rr.groupby("blk")}
    s = json.dumps(o, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    open(OUT + "/d/" + base["files"][d], "w").write(s); tot += len(s.encode())
json.dump(base, open(OUT + "/base.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("districts", len(dists), "total KB", tot // 1024, "base KB", os.path.getsize(OUT + "/base.json") // 1024)
# 給 JS 驗證用：抽 3000 筆，記下 Python 算出來的預測（用匯出的數字重算，水準用各月份實際值）
smp = df.sample(3000, random_state=7)
X = build(df).loc[smp.index]
pred = X[cols].values @ b
for lv, _ in LEVELS: pred = pred + smp[lv].map(eff[lv]).fillna(0).values
mfx = np.array([B.get("m_%s_%d" % (c, y), 0.0) for c, y in zip(smp.city, smp.ym)])
# 1 樓店面：跟 App 一樣，不含附近門牌／同一棟，改加店面層
shop_s = ((smp.use == "商") & (smp.fl == 1)).values
if shop_s.any():
    ps = X[cols].values @ b
    for lv in ["road", "blk", "side", "blk2", "lane"]: ps = ps + smp[lv].map(eff[lv]).fillna(0).values
    for lv in SHOP_LV: ps = ps + smp[lv].map(lambda k, lv=lv: float(round(shop_eff[lv].get(k, 0.0), 3)) if isinstance(k, str) and abs(shop_eff[lv].get(k, 0.0)) >= 0.003 else 0.0).values
    pred = np.where(shop_s, ps, pred)
def _r4(v): return round(float(v), 4) if abs(v) >= 0.002 else 0.0
for fn, x in SLX.items():
    _t = smp.dist.map(lambda k: round(float(SLS[fn]["dist"].get(k, 0.0)), 4)).values
    _t = _t + smp.road.map(lambda k: _r4(SLS[fn]["road"].get(k, 0.0)) if isinstance(k, str) else 0.0).values
    _t = _t + smp.blk.map(lambda k: _r4(SLS[fn]["blk"].get(k, 0.0)) if isinstance(k, str) else 0.0).values
    pred = pred + np.where(shop_s, 0.0, _t * x.loc[smp.index].values)
smp = smp.assign(py=pred - mfx)  # 去掉月份效果，JS 那邊也不加月份（只比結構）
smp[["city", "dist", "addr", "typ", "use", "land", "nfl", "arcade", "lease", "fl", "tot", "age", "ym", "ping", "pub", "hasp", "pnoprice", "elev", "mgmt", "rooms",
     "n_add", "n_bal", "n_roof", "n_furn", "n_mezz", "py", "lu"]].to_json(OUT + "/../sample_check.json", orient="records", force_ascii=False)
