import re, sys, numpy as np, pandas as pd
sys.argv = sys.argv[:2] + sys.argv[2:]
D = sys.argv[1]
exec(open(D + "/../hedonic_build.py").read())  # build(df) 特徵

df = pd.read_pickle(D + "/clean.pkl").reset_index(drop=True)
FW = str.maketrans("０１２３４５６７８９", "0123456789")
CN = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9}
def parse(a):
    a = a.translate(FW)
    a = re.sub(r"(\d+)[-－‐–](\d+)號", r"\1之\2號", a, count=1)   # 221－4號 → 221之4號（跟 App 一樣）
    a = re.sub(r"^(臺北市|新北市|桃園市)?[^區]{1,3}區", "", a)
    a = re.sub(r"^[^路街道]{1,4}里", "", a)   # 去掉里名
    m = re.match(r"(.+?(?:路|街|大道)(?:[一二三四五六七八九十]+段)?)?(?:(\d+)巷)?(?:(\d+)弄)?(?:(\d+)(?:之\d+)?號)?", a)
    if not m: return "", "", "", None
    road = m.group(1) or ""
    lane = m.group(2) or ""; alley = m.group(3) or ""; no = m.group(4)
    return road, lane, alley, int(no) if no else None
P = df.addr.map(parse)
df["road"] = df.dist + P.map(lambda x: x[0])
df["lane"] = df.road + "|" + P.map(lambda x: x[1] + "-" + x[2])
nb = P.map(lambda x: x[3])
nbs = nb.map(lambda v: "" if v is None or v != v else str(int(v)))
# 同一棟：路＋巷弄＋門牌號（主號）＋總樓層＋完工年
df["bldg"] = df.lane + "|" + nbs + "|" + df.tot.astype(str) + "|" + (df.ym // 100 + 1911 + ((df.ym % 100) - 0.5) / 12 - df.age - 0.5).round(0).astype(int).astype(str)
# 主幹道上的門牌區段（每 100 號一段，巷弄內的用巷弄）
df["blk"] = np.where(P.map(lambda x: x[1] == ""), df.road + "|#" + (nb.fillna(-100) // 100).astype(int).astype(str), df.lane)
noroad = P.map(lambda x: x[0] == "")
for c in ("road", "blk", "lane", "bldg"): df.loc[noroad, c] = None
nb2 = nb.map(lambda v: -1 if v is None or v != v else int(v))
# 門牌區段：路上每 100 號一段；巷子裡的用「巷號」算在哪一段（156 巷就在 100～199 號那一段），長街頭尾行情不同才分得出來
lnum = P.map(lambda x: int(x[1]) if x[1] else None)
seg = [int(l) if (l is not None and l == l) else int(n) for l, n in zip(lnum, nb2)]
df["blk"] = None
df.loc[~noroad, "blk"] = df.road[~noroad] + "|#" + pd.Series([str(s // 100) for s in seg], index=df.index)[~noroad]
# 原本的區段：路上的門牌每 100 號一段；巷子裡的就是那條巷弄
df["blk2"] = np.where(P.map(lambda x: x[1] == ""), df.road + "|#" + (nb2 // 100).astype(str), df.lane)
df.loc[noroad, "blk2"] = None
# 門牌附近（同一條巷弄、號碼每 20 號一組）；路上的再分單雙號（對面是另一邊）
okn = ~noroad & nb.notna()
df["near20"] = None; df.loc[okn, "near20"] = df.lane[okn] + "|n" + (nb2[okn] // 20).astype(str)
sidem = (~noroad) & nb.notna() & P.map(lambda x: x[1] == "")
df["side"] = None; df.loc[sidem, "side"] = df.road[sidem] + "|s" + (nb2[sidem] % 2).astype(str) + "|" + (nb2[sidem] // 50).astype(str)
print("buildings with >=2 sales:", (df.bldg.value_counts() >= 2).sum(), "rows in them:", df.bldg.map(df.bldg.value_counts()).ge(2).sum())

def ols(X, y):
    b, *_ = np.linalg.lstsq(X, y, rcond=None); return b

LEVELS = [("road", 3), ("blk", 2), ("side", 2), ("blk2", 2), ("lane", 2), ("near20", 2), ("bldg", 1)]
def train(tr):
    X = build(tr); cols = X.columns
    b = ols(X.values, tr.lu.values)
    res = tr.lu.values - X.values @ b
    eff = {}
    r = pd.Series(res, index=tr.index)
    for lv, k in LEVELS:
        rc = r.clip(-0.2, 0.2)  # 單筆偏離太多（沒註明的特殊交易）最多只算 ±20%，不讓它把整棟帶歪
        g = rc.groupby(tr[lv]); e = g.sum() / (g.size() + k)
        eff[lv] = e
        r = r - tr[lv].map(e).fillna(0)
    return cols, b, eff, r.std()

def predict(model, all_df, te, levels):
    cols, b, eff, _ = model
    X = build(all_df).loc[te.index]
    for c in cols:
        if c not in X.columns: X[c] = 0.0
    p = X[cols].values @ b
    for lv, k in LEVELS:
        if lv in levels: p = p + te[lv].map(eff[lv]).fillna(0).values
    return p

def cv(levels, folds=5, seed=0):
    rng = np.random.RandomState(seed); f = rng.randint(0, folds, len(df))
    errs = np.zeros(len(df))
    for i in range(folds):
        tr, te = df[f != i], df[f == i]
        m = train(tr)
        errs[te.index] = np.exp(te.lu.values - predict(m, df, te, levels)) - 1
    a = np.abs(errs)
    return a

for name, lv in [("行政區", []), ("+路段", ["road"]), ("+門牌區段/巷弄", ["road", "blk", "side", "blk2", "lane", "near20"]), ("+同一棟", ["road", "blk", "side", "blk2", "lane", "near20", "bldg"])]:
    a = cv(lv)
    print("%-16s 誤差中位數 %.1f%%  ±10%%內 %.0f%%  ±20%%內 %.0f%%" % (name, np.median(a) * 100, (a < .1).mean() * 100, (a < .2).mean() * 100))
a = cv(["road", "blk", "side", "blk2", "lane", "near20", "bldg"])
seen = df.bldg.map(df.bldg.value_counts()).ge(2).values
print("  同棟有其他成交: %.1f%% (n=%d)   沒有: %.1f%% (n=%d)" % (np.median(a[seen]) * 100, seen.sum(), np.median(a[~seen]) * 100, (~seen).sum()))
for t in ["住宅大樓", "華廈", "公寓", "透天厝"]:
    m = (df.typ == t).values; print("  ", t, "%.1f%%" % (np.median(a[m]) * 100))
for c in ["臺北市", "新北市", "桃園市"]:
    m = (df.city == c).values; print("  ", c, "%.1f%%" % (np.median(a[m]) * 100))
df.assign(err=a).to_pickle(D + "/cv.pkl")
rec = (df.ym >= 11406).values
print("  最近一年的成交: %.1f%%   ±10%%內 %.0f%%" % (np.median(a[rec]) * 100, (a[rec] < .1).mean() * 100))
for u in ["辦", "商"]:
    m = (df.use == u).values; print("  ", u, "%.1f%%" % (np.median(a[m]) * 100))
