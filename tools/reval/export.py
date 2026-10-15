# 用全部資料訓練一次，匯出給 App 用的估價表：base.json + 每個行政區一個檔
import sys, json, os
D, OUT = sys.argv[1], sys.argv[2]
sys.argv = [sys.argv[0], D]
src = open(os.path.dirname(os.path.abspath(__file__)) + "/model2.py").read().split("for name, lv in")[0]
exec(src)
LEVELS = [("road", 3), ("blk", 2), ("lane", 2), ("bldg", 1)]
cols, b, eff, sd = train(df)
B = dict(zip(cols, b))
feat = {k: round(float(v), 5) for k, v in B.items() if not k.startswith(("d_", "m_", "const"))}
dists = sorted(df.dist.unique())
distfx = {d: round(float(B.get("d_" + d, 0.0)), 5) for d in dists}
yms = sorted(df.ym.unique())
level = {}
for c in sorted(df.city.unique()):
    last = yms[-3:]
    level[c] = round(float(np.mean([B.get("m_%s_%d" % (c, y), 0.0) for y in last])), 5)
# 車位：各縣市各類型中位數（只用有另外計價的）
p = df[df.hasp & (df.pprice > 0)].copy()
p["t"] = p.ptype.where(p.ptype.isin(["坡道平面", "坡道機械", "升降平面", "升降機械", "塔式車位", "一樓平面"]), "其他")
park = {c: {t: int(round(v, -4)) for t, v in g.groupby("t").pprice.median().items()} for c, g in p.groupby("city")}
# 區間（80% 的成交落在裡面），用交叉驗證的結果
cvd = pd.read_pickle(D + "/cv.pkl"); a = cvd.err
seen = cvd.bldg.map(cvd.bldg.value_counts()).ge(2)
bands = {}
for n, m in (("seen", seen), ("new", ~seen)):
    bands[n] = {t: round(float(a[m & (cvd.typ == t)].quantile(.8)), 3) for t in ("住宅大樓", "華廈", "公寓")}
base = {"v": 1, "through": "%d/%02d" % (yms[-1] // 100, yms[-1] % 100), "from": "%d/%02d" % (yms[0] // 100, yms[0] % 100),
        "n": int(len(df)), "const": round(float(B["const"]), 5), "pubMed": round(float(df.pub.median()), 4),
        "feat": feat, "dist": distfx, "level": level, "park": park, "bands": bands,
        "cnt": {d: int(c) for d, c in df.dist.value_counts().items()}}
os.makedirs(OUT + "/d", exist_ok=True)
import glob as _g
_seas = sorted({os.path.basename(x) for x in _g.glob(D + "/*/*") if re.match(r"^1\d\dS[1-4]$", os.path.basename(x))}, key=lambda z: (int(z[:-2]), int(z[-1])))
base["season"] = _seas[-1] if _seas else ""   # 最新的一季（例如 115S3），後台用來判斷該不該更新
base["seasons"] = _seas
base["files"] = {d: "d%02d.json" % i for i, d in enumerate(dists)}
# 沒填公設時用：同一棟的公設比 → 同型態同屋齡的中位數（舊大樓公設比低很多，用全體平均會估錯）
AB = [0, 5, 10, 20, 30, 40, 999]
base["pubAge"] = AB[1:-1]
base["biTyp"] = ["住宅大樓", "華廈", "公寓"]
base["pubBy"] = {t: [round(float(df[(df.typ == t) & (df.age >= AB[i]) & (df.age < AB[i + 1])].pub.median()), 3) for i in range(len(AB) - 1)] for t in ("住宅大樓", "華廈", "公寓")}
bpub = df.dropna(subset=["bldg"]).groupby("bldg").pub.median()
# 只用門牌找得到的大樓資料（使用者沒填總樓層、完工年、車位價時用）：鍵＝路|巷-弄|號
TYP = ["住宅大樓", "華廈", "公寓"]
dfa = df.dropna(subset=["lane"]).copy()
dfa["addrk"] = dfa.lane + "|" + nbs.loc[dfa.index]
dfa = dfa[nbs.loc[dfa.index] != ""]
dfa["by"] = (dfa.ym // 100 + 1911 + ((dfa.ym % 100) - 0.5) / 12 - dfa.age - 0.5).round(0).astype(int)
BI = {}
for k, g in dfa.groupby("addrk"):
    top = g.groupby(["tot", "by"]).size().idxmax(); g2 = g[(g.tot == top[0]) & (g.by == top[1])]
    pk = g2[g2.hasp & (g2.pprice > 0)]
    park = {t: int(round(v, -4)) for t, v in pk.groupby("ptype").pprice.median().items()} if len(pk) else {}
    BI[k] = [int(top[0]), int(top[1]), TYP.index(g2.typ.mode()[0]), int(g2.elev.mean() >= .5), int(g2.mgmt.mean() >= .5), round(float(g2.pub.median()), 3), park, int(len(g2))]  # 檔名用英數字，Windows 解壓縮、GitHub 上傳都不會出問題
tot = 0
for d in dists:
    o = {}
    for lv, _ in LEVELS:
        e = eff[lv]; e = e[[k.startswith(d) for k in e.index]]
        o[lv] = {k[len(d):]: round(float(v), 3) for k, v in e.items() if abs(v) >= 0.003}
    bp = bpub[[k.startswith(d) for k in bpub.index]]
    o["pub"] = {k[len(d):]: round(float(v), 3) for k, v in bp.items() if v == v}
    o["bi"] = {k[len(d):]: v for k, v in BI.items() if k.startswith(d)}
    s = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    open(OUT + "/d/" + base["files"][d], "w").write(s); tot += len(s.encode())
json.dump(base, open(OUT + "/base.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("districts", len(dists), "total KB", tot // 1024, "base KB", os.path.getsize(OUT + "/base.json") // 1024)
# 給 JS 驗證用：抽 3000 筆，記下 Python 算出來的預測（用匯出的數字重算，水準用各月份實際值）
smp = df.sample(3000, random_state=7)
X = build(df).loc[smp.index]
pred = X[cols].values @ b
for lv, _ in LEVELS: pred = pred + smp[lv].map(eff[lv]).fillna(0).values
mfx = np.array([B.get("m_%s_%d" % (c, y), 0.0) for c, y in zip(smp.city, smp.ym)])
smp = smp.assign(py=pred - mfx)  # 去掉月份效果，JS 那邊也不加月份（只比結構）
smp[["city", "dist", "addr", "typ", "fl", "tot", "age", "ym", "ping", "pub", "hasp", "pnoprice", "elev", "mgmt", "rooms",
     "n_add", "n_bal", "n_roof", "n_furn", "n_mezz", "py", "lu"]].to_json(OUT + "/../sample_check.json", orient="records", force_ascii=False)
