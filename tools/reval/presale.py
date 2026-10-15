# 預售屋買賣（B 檔）→ 每個行政區一個檔：{建案名稱: {a: 地址, r: [[年月, 樓層, 總樓層, 每坪(扣車位), 坪數, 車位價, 車位類型, 棟號], ...]}}
# 用法：python3 presale.py <輸出資料夾(re)> <資料夾1> <資料夾2> ...
import csv, glob, json, os, re, sys, collections
OUT = sys.argv[1]; DIRS = sys.argv[2:]
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
PT = ["坡道平面", "坡道機械", "升降平面", "升降機械", "塔式車位", "一樓平面", "其他"]
def norm(n): return re.sub(r"[\s　]", "", n or "")
seen = set(); data = collections.defaultdict(lambda: collections.defaultdict(lambda: {"a": collections.Counter(), "r": []}))
stat = collections.Counter(); maxym = 0
for d in DIRS:
    for city, f in (("臺北市", "A"), ("新北市", "F"), ("桃園市", "H")):
        for fn in glob.glob(os.path.join(d, "**", f + "_lvr_land_B.csv"), recursive=True):
            for x in list(csv.DictReader(open(fn, encoding="utf-8-sig")))[1:]:
                if x["編號"] in seen: continue
                seen.add(x["編號"]); stat["all"] += 1
                if x["解約情形"].strip(): stat["cancel"] += 1; continue
                if not x["交易標的"].startswith("房地") or "住" not in x["主要用途"]: stat["notres"] += 1; continue
                m = re.match(r"土地\d+建物(\d+)車位(\d+)", x["交易筆棟數"])
                if not m or m.group(1) != "1" or int(m.group(2)) > 2: stat["multi"] += 1; continue
                name = norm(x["建案名稱"])
                if not name: stat["noname"] += 1; continue
                fl, tot = cnum(x["移轉層次"]), cnum(x["總樓層數"])
                if not fl or not tot or fl > tot: stat["floor"] += 1; continue
                area = float(x["建物移轉總面積平方公尺"] or 0); parea = float(x["車位移轉總面積平方公尺"] or 0)
                price = float(x["總價元"] or 0); pprice = float(x["車位總價元"] or 0)
                ping = (area - parea) / 3.30579
                if ping < 3 or price <= 0: stat["area"] += 1; continue
                hasp = int(m.group(2)) > 0 or bool(x["車位類別"])
                if hasp and pprice <= 0: stat["park_unpriced"] += 1; continue  # 車位沒拆價，算不出房子本身的單價
                unit = (price - pprice) / ping
                if not (50000 < unit < 5000000): stat["outlier"] += 1; continue
                t = int(x["交易年月日"] or 0); ym = t // 100; maxym = max(maxym, ym)
                pt = PT.index(x["車位類別"]) if x["車位類別"] in PT else (6 if hasp else -1)
                dist = city + x["鄉鎮市區"]
                P = data[dist][name]
                P["a"][x["土地位置建物門牌"][:40]] += 1
                P["r"].append([ym, fl, tot, round(unit), round(ping, 2), round(pprice), pt, x["棟及號"][:12]])
                stat["ok"] += 1
print(dict(stat))
os.makedirs(OUT + "/p", exist_ok=True)
base = json.load(open(OUT + "/base.json"))
dists = sorted(data)
base["pfiles"] = {d: "p%02d.json" % i for i, d in enumerate(dists)}
base["pthrough"] = "%d/%02d" % (maxym // 100, maxym % 100)
base["ptypes"] = PT
tot = 0; nproj = 0
for d in dists:
    o = {}
    for name, P in data[d].items():
        P["r"].sort()
        o[name] = {"a": P["a"].most_common(1)[0][0], "r": P["r"]}; nproj += 1
    s = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    open(OUT + "/p/" + base["pfiles"][d], "w").write(s); tot += len(s.encode())
json.dump(base, open(OUT + "/base.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("districts", len(dists), "projects", nproj, "KB", tot // 1024, "through", base["pthrough"])
