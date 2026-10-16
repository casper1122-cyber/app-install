CITYTIME = True
INTER = True
ROAD = False
def build(df):
    X = pd.DataFrame(index=df.index)
    X["const"] = 1.0
    for c in sorted(df.dist.unique())[1:]: X["d_" + c] = (df.dist == c) * 1.0
    if ROAD:
        vc = df.road.value_counts(); ok = [r for r in vc[vc >= 20].index if not r.endswith("區")]
        R = pd.DataFrame({"r_" + r: (df.road == r) * 1.0 for r in ok}, index=df.index)
        X = pd.concat([X, R], axis=1)
    yms = sorted(df.ym.unique())
    if CITYTIME:
        for cty in sorted(df.city.unique()):
            for c in yms[1:]: X["m_%s_%d" % (cty, c)] = ((df.ym == c) & (df.city == cty)) * 1.0
    else:
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
    if "nfl" in df:
        X["多層"] = (df.nfl > 1) * 1.0
        X["多層x含1樓"] = ((df.nfl > 1) & (df.fl == 1)) * 1.0
        X["多層x商"] = ((df.nfl > 1) & (df.get("use", "住") == "商")) * 1.0
        X["含騎樓"] = df.arcade * 1.0
        X["帶租約"] = df.lease * 1.0
    if INTER:
        for t in ("華廈", "公寓"):
            X["1樓x" + t] = ((df.fl == 1) & (df.typ == t)) * 1.0
            X["屋齡年x" + t] = (df.typ == t) * np.minimum(df.age, 50) / 10
        X["屋齡年x大樓"] = (df.typ == "住宅大樓") * np.minimum(df.age, 50) / 10
        X["log坪"] = np.log(df.ping)
        X["房數多"] = (df.rooms >= 4) * 1.0
        X["沒有隔間房"] = (df.rooms == 0) * 1.0
    # 各行政區自己的折舊速度（地價高的地方，房子舊了跌得比較少）
    DA = pd.DataFrame({"da_" + x: (df.dist == x) * np.minimum(df.age, 50) / 10 for x in sorted(df.dist.unique())}, index=df.index)
    # 透天、辦公、店面（商業用）
    th = (df.typ == "透天厝") if "typ" in df else False
    use = df["use"] if "use" in df else pd.Series("住", index=df.index)
    land = df["land"] if "land" in df else pd.Series(np.nan, index=df.index)
    SG = pd.DataFrame({"透天": th * 1.0, "透天x屋齡": th * np.minimum(df.age, 50) / 10, "透天xlog地": th * np.log(land.fillna(1) + 1),
        "透天xlog坪": th * np.log(df.ping), "透天x層": th * df.tot,
        "辦": (use == "辦") * 1.0, "商": (use == "商") * 1.0, "商x1F": ((use == "商") & (df.fl == 1)) * 1.0,
        "辦x1F": ((use == "辦") & (df.fl == 1)) * 1.0, "商x2F+": ((use == "商") & (df.fl > 1)) * 1.0,
        "工": (use == "工") * 1.0, "工x1F": ((use == "工") & (df.fl == 1)) * 1.0, "工x透天": ((use == "工") & th) * 1.0}, index=df.index)
    X = pd.concat([X, DA, SG], axis=1)
    return X

