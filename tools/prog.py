# ============================================================
# 資產配置 App：資料自動更新（Windows，不用安裝任何東西）
#
# 第一次：在這個檔案上按兩下（或用命令提示字元 python 這個檔案），照畫面設定一次：
#   1. 貼上 GitHub 金鑰（讓程式可以把整理好的資料放到你的 app-install 網站）
#   2. 程式會在桌面放一個「資產配置資料更新」，並設定每天下午 4 點自動在背景跑
# 之後：每天自動跑，只抓「到期」的資料，整理好直接放上網站，App 會自己讀最新的。
#   有需要你按一下的（台灣 CPI、存款利率網站不能自動下載），App 會提醒你，到時候按桌面的圖示就好。
#   出問題（網站改版、被擋）App 也會提醒你：按桌面圖示選「打包給 Claude」，把 zip 傳給 Claude。
# 要更新哪些資料，是看網站上的 data/registry.json（以後新功能需要新資料，Claude 改那個檔案就好，這個程式不用重裝）
# ============================================================
import json, os, sys, time, csv, glob, io, re, shutil, zipfile, gzip, base64, datetime, webbrowser, subprocess, urllib.request, urllib.parse, urllib.error
try: sys.stdout.reconfigure(errors="replace")
except Exception: pass

VERSION = "2026-10-25p"
REPO = "casper1122-cyber/app-install"
PAGES = "https://casper1122-cyber.github.io/app-install/"
HOME = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "資產配置資料更新")
CACHE = os.path.join(HOME, "cache")
os.makedirs(CACHE, exist_ok=True)
CFG_F, STATE_F, LOG_F = os.path.join(HOME, "config.json"), os.path.join(HOME, "state.json"), os.path.join(HOME, "log.txt")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
AUTO = "--auto" in sys.argv

def jload(f, d):
    try: return json.load(open(f, encoding="utf-8"))
    except Exception: return d
def jsave(f, o): json.dump(o, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
def log(s):
    line = datetime.datetime.now().strftime("%m-%d %H:%M ") + s
    try: print(s)
    except Exception: pass
    try:
        open(LOG_F, "a", encoding="utf-8").write(line + "\n")
        if os.path.getsize(LOG_F) > 400000:   # 只留最後一段
            t = open(LOG_F, encoding="utf-8").read()[-200000:]; open(LOG_F, "w", encoding="utf-8").write(t)
    except Exception: pass
def fetch(url, timeout=40, headers=None):
    h = dict(UA); h.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r: return r.read()
    except urllib.error.URLError as e:
        # 有些政府網站沒附完整的憑證鏈，Python 驗不過；改用系統內建的 curl（Windows 用系統憑證、會自己補中間憑證），一樣有驗證
        if "CERTIFICATE_VERIFY_FAILED" not in str(e) or headers: raise
        return curl_get(url, timeout)
NOWIN = {"creationflags": 0x08000000} if os.name == "nt" else {}   # Windows：背景執行 curl、系統指令時不要跳出黑色視窗
def curl_get(url, timeout):
    exe = shutil.which("curl.exe") or shutil.which("curl")
    if not exe: raise RuntimeError("憑證驗證失敗，這台電腦也沒有 curl")
    # 直接從 curl 的輸出拿資料（不寫暫存檔：有些電腦的資料夾路徑有中文或權限，curl 會寫不進去）
    r = subprocess.run([exe, "-sSL", "--fail", "--max-time", str(int(timeout)), "-A", UA["User-Agent"], url], capture_output=True, **NOWIN)
    if r.returncode != 0: raise RuntimeError("curl 下載失敗：" + r.stderr.decode("utf-8", "replace")[:80])
    return r.stdout
def desktop():
    # 桌面位置：OneDrive 備份會把桌面搬到 OneDrive\Desktop（或「桌面」），照 Windows 設定找；找不到就放使用者資料夾
    if os.name == "nt":
        try:
            import winreg
            k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
            p = os.path.expandvars(winreg.QueryValueEx(k, "Desktop")[0])
            if os.path.isdir(p): return p
        except Exception: pass
    home = os.path.expanduser("~")
    for p in [os.path.join(home, "Desktop"), os.path.join(home, "OneDrive", "Desktop"), os.path.join(home, "OneDrive", "桌面"), os.path.join(home, "桌面")]:
        if os.path.isdir(p): return p
    return home
def run_out(cmd):   # 執行系統指令；Windows 中文輸出是 cp950，用 replace 避免解碼錯誤
    r = subprocess.run(cmd, capture_output=True, **NOWIN)
    enc = "cp950" if os.name == "nt" else "utf-8"
    return r.returncode, (r.stdout or b"").decode(enc, "replace") + (r.stderr or b"").decode(enc, "replace")

CFG = jload(CFG_F, {})
STATE = jload(STATE_F, {})

# ---------- 資料清單：先讀網站上最新的，讀不到用內建的 ----------
BUILTIN = {"items": [
  {"id": "prices", "name": "股票、ETF、債券、黃金價格和配息", "every": 1, "how": "yahoo"},
  {"id": "fx", "name": "美元兌台幣匯率", "every": 1, "how": "fred", "series": ["DEXTAUS"]},
  {"id": "uscpi", "name": "美國 CPI、利率", "every": 7, "how": "fred", "series": ["CPIAUCSL", "TB3MS", "GS10"]},
  {"id": "twdep", "name": "台灣五大銀行存款利率", "every": 30, "how": "twdep"},
  {"id": "twcpi", "name": "台灣消費者物價指數（CPI）", "every": 30, "how": "twcpi"},
  {"id": "rate", "name": "評級用的回測資料（整理後放上網站）", "every": 1, "how": "rate", "after": ["prices", "fx", "uscpi", "twdep", "twcpi"]},
  {"id": "long", "name": "長期歷史（Shiller、Fama-French、金價）", "every": 180, "how": "files", "files": [
     ["FF_factors.zip", "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip"],
     ["gold_monthly.csv", "https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv"],
     ["shiller_ie_data.xls", "http://www.econ.yale.edu/~shiller/data/ie_data.xls"]]},
  {"id": "war", "name": "棒球 WAR（球員卡評級用）", "every": 7, "every_off": 30, "how": "later", "note": "做球員卡評級時再設定（baseball-reference 不讓程式直接下載，要換方法）", "files": [
     ["war_bat.txt", "https://www.baseball-reference.com/data/war_daily_bat.txt"], ["war_pitch.txt", "https://www.baseball-reference.com/data/war_daily_pitch.txt"]]},
  {"id": "lahman", "name": "棒球資料庫（生涯數據、名人堂、獎項）", "every": 30, "how": "later", "note": "做球員卡評級時再設定（原本的下載網址搬家了）", "files": [
     ["lahman.zip", "https://github.com/chadwickbureau/baseballdatabank/archive/refs/heads/master.zip"]]},
  {"id": "plvr", "name": "內政部實價登錄（2012 年起每一季，房價細到行政區用）", "every": 1, "how": "plvr"},
  {"id": "twstk", "name": "台股個股歷史（股價、產業、本益比，個股評級用）", "every": 1, "how": "twstk"},
  {"id": "brokers", "name": "券商手續費資料", "every": 365, "how": "manual", "done": "2026-01-01", "note": "每年一月跟 Claude 說一聲，查各家券商新方案"},
  {"id": "tax", "name": "遺產稅、贈與稅免稅額", "every": 365, "how": "manual", "done": "2026-01-01", "note": "每年一月跟 Claude 說一聲（財政部年底公告新的免稅額）"},
  {"id": "fo", "name": "家族辦公室參考配置", "every": 365, "how": "manual", "done": "2026-07-01", "note": "每年七月跟 Claude 說一聲（UBS 報告出來）"}
]}
def registry():
    try:
        r = json.loads(fetch(PAGES + "data/registry.json?t=%d" % time.time(), 20).decode("utf-8"))
        if r.get("items"): jsave(os.path.join(HOME, "registry.json"), r); return r
    except Exception as e: log("讀不到網站上的資料清單，用內建的（%s）" % str(e)[:60])
    return jload(os.path.join(HOME, "registry.json"), BUILTIN)

def due(it, force=False):
    if force: return True
    st = STATE.get(it["id"], {})
    last = st.get("ok_at")
    every = it.get("every", 1)
    if it.get("every_off") and datetime.date.today().month in (11, 12, 1, 2, 3): every = it["every_off"]
    if not last: return True
    return (datetime.datetime.now() - datetime.datetime.fromisoformat(last)).total_seconds() > every * 86400 - 3600
def mark(it, ok, msg="", need_user=False, est=False):
    st = STATE.setdefault(it["id"], {})
    st["name"] = it.get("name", it["id"]); st["try_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    if ok: st["ok_at"] = st["try_at"]; st["msg"] = msg; st["state"] = "ok"
    else: st["msg"] = msg; st["state"] = "est" if est else "need-user" if need_user else "fail"
    jsave(STATE_F, STATE); log(("OK   " if ok else "估計 " if est else "要處理 " if need_user else "失敗 ") + it.get("name", it["id"]) + ("：" + msg if msg else ""))

# ---------- 各種下載 ----------
def h_files(it):
    bad = []
    for name, url in it.get("files", []):
        try:
            b = fetch(url, 120)
            if len(b) < 1000: raise ValueError("內容太短")
            open(os.path.join(CACHE, name), "wb").write(b)
        except Exception as e: bad.append(name + "（" + str(e)[:40] + "）")
    if bad: raise RuntimeError("、".join(bad))
    return "%d 個檔案" % len(it.get("files", []))

# 聯準會（FRED）抓不到就換備用來源：匯率用 Yahoo、美國 CPI 用美國勞工統計局（BLS）、利率用 Yahoo 的公債殖利率
# 只抓最近 6 年（底稿已經有更早的歷史），檔案小、比較不會逾時
def fred_alt(sid):
    rows = []
    if sid in ("DEXTAUS", "TB3MS", "GS10"):
        y = yahoo({"DEXTAUS": "TWD=X", "TB3MS": "^IRX", "GS10": "^TNX"}[sid], 6)
        by = {}
        for d, c in y["days"]: by.setdefault(d[:7], []).append(c)
        for ym in sorted(by): v = by[ym]; rows.append((ym + "-01", v[-1] if sid == "DEXTAUS" else sum(v) / len(v)))
        src = "Yahoo"
    elif sid == "CPIAUCSL":
        y0 = datetime.date.today().year
        req = json.dumps({"seriesid": ["CUSR0000SA0"], "startyear": str(y0 - 6), "endyear": str(y0)}).encode("utf-8")
        j, last = None, None
        for ep in ("v2", "v1", "v2"):   # 勞工統計局偶爾忙線（503）：換一個入口再試
            try:
                r = urllib.request.Request("https://api.bls.gov/publicAPI/%s/timeseries/data/" % ep, data=req, headers=dict(UA, **{"Content-Type": "application/json"}))
                j = json.loads(urllib.request.urlopen(r, timeout=40).read().decode("utf-8"))
                if j.get("Results"): break
            except Exception as e: last = e; time.sleep(3)
        if not j or not j.get("Results"): raise RuntimeError(str(last)[:40] if last else "沒有資料")
        for d in j["Results"]["series"][0]["data"]:
            if d["period"].startswith("M") and d["period"] != "M13": rows.append(("%s-%s-01" % (d["year"], d["period"][1:]), float(d["value"])))
        rows.sort(); src = "美國勞工統計局 BLS"
    else: raise RuntimeError("沒有備用來源")
    if len(rows) < 12: raise RuntimeError("備用來源資料太少")
    return ("observation_date,%s\n" % sid + "\n".join("%s,%s" % (d, v) for d, v in rows)).encode("utf-8"), src
FRED_DOWN = [False]   # 這次執行聯準會已經連不上：後面的直接用備用來源，不要每一個都等
def h_fred(it):
    used = []
    for sid in it.get("series", []):
        b, err = None, None
        cosd = (datetime.date.today() - datetime.timedelta(days=6 * 366)).isoformat()
        if not FRED_DOWN[0]:
            if not AUTO: print("  聯準會 " + sid + "…（最多等 30 秒）", flush=True)
            try: b = fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s&cosd=%s" % (sid, cosd), 30)
            except Exception as e: err = e; FRED_DOWN[0] = True
        if not AUTO and b is None: print("  聯準會連不上，改用備用來源 " + sid, flush=True)
        if b is not None and b"," not in b[:100]: b = None
        if b is None:
            try: b, src = fred_alt(sid); used.append(sid + " 用" + src)
            except Exception as e2:
                # 美國 CPI、利率每個月才變一次：兩邊都抓不到就先用估計值（評級會用最近 12 個月平均補），超過 3 個月才算失敗
                if sid != "DEXTAUS" and stale_days(it) < 95 and os.path.exists(os.path.join(CACHE, "FRED_%s.csv" % sid)) or (sid != "DEXTAUS" and not os.path.exists(os.path.join(CACHE, "FRED_%s.csv" % sid)) and stale_days(it) < 95):
                    raise Estimate(sid + " 今天抓不到（聯準會、勞工統計局都沒回應），先用估計值，明天再試")
                raise RuntimeError(sid + " 聯準會和備用來源都抓不到（%s；%s），明天會再試" % (str(err)[:30], str(e2)[:30]))
        open(os.path.join(CACHE, "FRED_%s.csv" % sid), "wb").write(b)
    return "、".join(it.get("series", [])) + ("（" + "、".join(used) + "）" if used else "")

YHOSTS = ["query2", "query1"]
def yahoo(sym, years=4):
    p1 = int(time.time() - years * 366 * 86400)
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d&events=div%%2Csplit" % (urllib.parse.quote(sym), p1, int(time.time()) + 86400)
    last = None
    for host in YHOSTS[:]:
        try:
            j = json.loads(fetch(url.replace("query1", host), 20).decode("utf-8"))["chart"]["result"][0]
            if YHOSTS[0] != host: YHOSTS.remove(host); YHOSTS.insert(0, host)
            ts = j.get("timestamp") or []; cl = j["indicators"]["quote"][0].get("close") or []
            days = [[datetime.datetime.fromtimestamp(t + 8 * 3600, datetime.timezone.utc).date().isoformat(), c] for t, c in zip(ts, cl) if c]
            divs = {}
            for v in ((j.get("events") or {}).get("dividends") or {}).values():
                d = datetime.datetime.fromtimestamp(v["date"] + 8 * 3600, datetime.timezone.utc).date().isoformat(); divs[d] = divs.get(d, 0) + v["amount"]
            if not days: raise ValueError("沒有資料")
            return {"days": days, "divs": divs}
        except Exception as e: last = e
    raise last
def h_yahoo(it):
    base = rate_base()
    syms = sorted({a["src"]["y"] for a in base["a"].values() if a.get("src", {}).get("y")} | {"^TWII", "SPY", "IEF", "BIL", "GC=F"})
    bad = []
    for i, s in enumerate(syms, 1):
        try:
            jsave(os.path.join(CACHE, "y_" + re.sub(r"[^A-Za-z0-9.=^-]", "_", s) + ".json"), yahoo(s))
            if not AUTO: print("  [%d/%d] %s" % (i, len(syms), s))
        except Exception as e: bad.append(s)
        time.sleep(0.25)
    if len(bad) > 3: raise RuntimeError("失敗 %d 檔：%s" % (len(bad), ",".join(bad[:8])))
    return "%d 檔" % (len(syms) - len(bad)) + ("（%s 沒抓到，下次再試）" % ",".join(bad) if bad else "")

DL = [os.path.join(os.path.expanduser("~"), "Downloads"), os.path.join(os.path.expanduser("~"), "下載")]
def newest(patterns, days=7):
    c = []
    for d in DL:
        for p in patterns: c += glob.glob(os.path.join(d, p))
    c = [x for x in c if time.time() - os.path.getmtime(x) < days * 86400]
    return max(c, key=os.path.getmtime) if c else None
def stale_days(it):
    # 第一次跑：網站上的底稿已經有到 2026 年 9 月的台灣 CPI 和存款利率（你之前給的檔案），從那時候開始算
    last = STATE.get(it["id"], {}).get("ok_at") or "2026-10-20T00:00:00"
    return (datetime.datetime.now() - datetime.datetime.fromisoformat(last)).days
def browser_get(it, title, url, steps, patterns, save_as):
    f = newest(patterns, 40)
    if f: shutil.copy(f, os.path.join(CACHE, save_as)); return "在下載資料夾找到 " + os.path.basename(f)
    old = os.path.exists(os.path.join(CACHE, save_as)) or os.path.exists(os.path.join(HOME, "seed_" + save_as))
    # 平常不打擾你：沒有新檔就先用估計值（評級本來就會用最近 12 個月平均補）
    if stale_days(it) < 95 or (AUTO and old):
        raise Estimate("先用估計值（官方網站不能自動下載；超過 3 個月沒更新才會請你按一下）")
    if AUTO: raise NeedUser("已經 3 個月沒有新資料，有空按桌面的「資產配置資料更新」下載一次")
    print("\n  ▶ " + title + "：已經超過 3 個月沒更新了，要現在下載嗎？")
    if input("    要的話打 y 按 Enter，不要就直接按 Enter：").strip().lower() != "y":
        raise Estimate("這次先用估計值")
    print("\n  ▶ " + title + "：我幫你打開網頁，照這樣做：")
    for i, s in enumerate(steps, 1): print("      %d. %s" % (i, s))
    try: webbrowser.open(url)
    except Exception: print("    網址：" + url)
    for _ in range(3):
        input("    下載好了按 Enter（想跳過也按 Enter）…")
        f = newest(patterns)
        if f: shutil.copy(f, os.path.join(CACHE, save_as)); return "找到 " + os.path.basename(f)
        print("    在「下載」資料夾找不到")
    raise NeedUser("這次跳過了")
class NeedUser(Exception): pass
class Estimate(Exception): pass

def h_twdep(it):
    return browser_get(it, "五大銀行存款利率", "https://data.gov.tw/dataset/10359", ["頁面往下找「資料資源」", "按 CSV 的「下載」"], ["*A13Rate*.csv", "*五大銀行*.csv"], "twdep.csv")
def h_twcpi(it):
    return browser_get(it, "台灣消費者物價指數", "https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?k=dgmain",
        ["左邊點「物價統計」→「消費者物價指數」→「消費者物價基本分類指數」", "統計期：最早（70 年 1 月）到最新；週期「月」；輸出模式選 CSV", "下面只勾「總指數」", "按「查詢」，會自動下載"],
        ["A030101015*.csv", "*消費者物價*.csv"], "twcpi.csv")

# ---------- 評級用的回測資料：拿網站上目前的版本，把最近 24 個月重算、接上新的月份 ----------
def rate_base():
    f = os.path.join(CACHE, "rate_base.json")
    try:
        b = json.loads(fetch(PAGES + "rate/latest.json?t=%d" % time.time(), 40).decode("utf-8"))
        if b.get("a") and b.get("last"): jsave(f, b); return b
    except Exception as e: log("讀不到網站上的回測資料（%s），用上次存的" % str(e)[:50])
    b = jload(f, None)
    if not b: raise RuntimeError("網站上還沒有 rate/latest.json：先把「v53_網站上傳.zip」裡的檔案傳到 GitHub 的 app-install，再跑一次")
    return b
def ym_add(ym, k): y, m = int(ym[:4]), int(ym[5:7]) - 1 + k; return "%04d-%02d" % (y + m // 12, m % 12 + 1)
def ym_idx(base, ym): return (int(ym[:4]) - int(base[:4])) * 12 + int(ym[5:7]) - int(base[5:7])
def ycache(sym):
    return jload(os.path.join(CACHE, "y_" + re.sub(r"[^A-Za-z0-9.=^-]", "_", sym) + ".json"), None)
def month_tr(sym, wht=0, fix=False, twii=None):
    y = ycache(sym)
    if not y: return None, None
    days, divs = y["days"], y["divs"]
    tw = {}
    if fix and twii: tw = {d: c for d, c in twii["days"]}
    tr, out, prev, lastday = 1.0, {}, None, None
    rets = []
    for i, (d, c) in enumerate(days):
        if prev is None: prev = c; out[d[:7]] = tr; lastday = d; continue
        r = (c + divs.get(d, 0) * (1 - wht)) / prev - 1
        rets.append([d, r]); prev = c
    if fix and tw:   # 台股 ETF 配息日資料錯誤：跟加權指數差超過 3.5%、前後沒有抵銷 → 用指數的漲跌
        tdays = sorted(tw); tret = {}
        for a, b in zip(tdays, tdays[1:]): tret[b] = tw[b] / tw[a] - 1
        dif = [r - tret.get(d, r) for d, r in rets]
        for i in range(len(rets)):
            if abs(dif[i]) > 0.035 and abs(sum(dif[i:i + 6])) > 0.03 and abs(sum(dif[max(0, i - 5):i + 6])) > 0.03 and rets[i][0] in tret: rets[i][1] = tret[rets[i][0]]
    for d, r in rets: tr *= 1 + r; out[d[:7]] = tr; lastday = d
    return out, lastday
def fred_monthly(sid, how="last"):
    f = os.path.join(CACHE, "FRED_%s.csv" % sid)
    if not os.path.exists(f): return {}
    m = {}
    for row in csv.reader(open(f, encoding="utf-8")):
        if len(row) < 2 or not re.match(r"\d{4}-\d{2}-\d{2}", row[0]): continue
        try: v = float(row[1])
        except ValueError: continue
        m.setdefault(row[0][:7], []).append(v)
    return {k: (v[-1] if how == "last" else sum(v) / len(v)) for k, v in m.items()}
def tw_cpi():
    f = os.path.join(CACHE, "twcpi.csv"); out = {}
    if not os.path.exists(f): return out
    t = open(f, "rb").read()
    for enc in ("utf-8-sig", "big5", "cp950"):
        try: t = t.decode(enc); break
        except Exception: continue
    for m in re.finditer(r'"?(\d{2,3})\D{1,3}?(\d{1,2})\D{1,3}?"?,\s*"?([\d.]+)', t if isinstance(t, str) else ""):
        out["%04d-%02d" % (int(m.group(1)) + 1911, int(m.group(2)))] = float(m.group(3))
    return out
def tw_dep():
    f = os.path.join(CACHE, "twdep.csv"); out = {}
    if not os.path.exists(f): return out
    rows = list(csv.DictReader(io.StringIO(open(f, encoding="utf-8-sig", errors="replace").read())))
    acc = {}
    for r in rows:
        ym = str(r.get("年月") or "").strip()
        if not re.match(r"^\d{4,5}$", ym): continue
        k = "%04d-%s" % (int(ym[:-2]) + 1911, ym[-2:])
        v = r.get("定存利率-一年期-機動") or r.get("定存利率-一年期-固定")
        try: acc.setdefault(k, []).append(float(v))
        except (TypeError, ValueError): pass
    return {k: sum(v) / len(v) for k, v in acc.items()}

# 房貸利率（回測扣利息用）：五大行庫「指數型房貸指標利率（機動）」平均＋0.551
# 加碼用央行「五大銀行新承做購屋貸款利率」2009～2022 年平均校正（每年誤差平均 0.036 個百分點）
MORT_SPREAD = 0.551
def tw_mort():
    f = os.path.join(CACHE, "twdep.csv"); acc = {}
    if not os.path.exists(f): return {}
    for r in csv.DictReader(io.StringIO(open(f, encoding="utf-8-sig", errors="replace").read())):
        ym = str(r.get("年月") or "").strip()
        if not re.match(r"^\d{4,5}$", ym): continue
        try: v = float(r.get("指數房貸-機動") or r.get("房貸月指-機動"))
        except (TypeError, ValueError): continue
        acc.setdefault("%04d-%s" % (int(ym[:-2]) + 1911, ym[-2:]), []).append(v)
    return {k: sum(v) / len(v) + MORT_SPREAD for k, v in acc.items()}
def mort_series(last, old=None):
    m = tw_mort()
    if not m: return old
    first = min(m); out = []; k = "2001-01"; prev = m[first]
    while k <= last:
        if k in m: prev = m[k]
        out.append(int(round(prev * 1000))); k = ym_add(k, 1)
    return {"s": "2001-01", "r": out, "first": first, "spread": MORT_SPREAD,
            "src": "五大行庫指數型房貸指標利率（機動）平均＋0.551（用央行五大銀行新承做購屋貸款利率 2009～2022 年校正，每年誤差平均 0.04 個百分點）；" + first[:4] + " 年 " + str(int(first[5:7])) + " 月以前沒有資料，先用那個月的利率（當時實際利率可能更高）"}

def h_rate(it):
    B = rate_base()
    old_last = B["last"]
    today = datetime.date.today()
    target = ym_add(today.strftime("%Y-%m"), -1)   # 上個月（已經結束的最後一個月）
    fxm = fred_monthly("DEXTAUS")
    twii = ycache("^TWII")
    # 新的「最後一個月」：匯率和大部分的產品都有那個月月底的資料
    if target not in fxm: target = ym_add(target, -1)
    win0 = ym_add(old_last, -23)
    est = []
    months = []
    k = win0
    while k <= target: months.append(k); k = ym_add(k, 1)
    fx_ret = {}
    for k in months:
        a, b = fxm.get(ym_add(k, -1)), fxm.get(k)
        if a and b: fx_ret[k] = b / a - 1
    bad = []
    for code, a in B["a"].items():
        src = a.get("src") or {}
        if code == "TWDCASH" or not src.get("y"): continue
        trm, lastday = month_tr(src["y"], src.get("wht", 0), src.get("fix"), twii)
        if not trm: bad.append(code); continue
        for k in months:
            if k not in trm or ym_add(k, -1) not in trm: continue
            if k == target and lastday[:7] == target and int(lastday[8:10]) < 25: continue   # 那個月還沒收完
            r = trm[k] / trm[ym_add(k, -1)] - 1
            if src.get("usd"):
                if k not in fx_ret: continue
                r = (1 + r) * (1 + fx_ret[k]) - 1
            r += (src.get("adj") or 0) / 12
            i = ym_idx(a["s"], k)
            if i < 0: continue
            v = int(round(r * 10000))
            if i < len(a["r"]): a["r"][i] = v
            elif i == len(a["r"]): a["r"].append(v)
    # 每一檔都要接到同一個月；接不上的就用最後一個月可以接到的
    ends = [ym_add(a["s"], len(a["r"]) - 1) for c, a in B["a"].items() if c != "TWDCASH" and a.get("ok", True) and (a.get("src") or {}).get("y")]
    new_last = min(ends) if ends else old_last
    if new_last < old_last: new_last = old_last
    for c, a in B["a"].items():   # 超過的切掉、不夠的補 0（只會發生在少數沒抓到的），大家一樣長
        n = ym_idx(a["s"], new_last) + 1
        if c != "TWDCASH" and len(a["r"]) > n: del a["r"][n:]
        if c != "TWDCASH" and len(a["r"]) < n: bad.append(c); est.append(a.get("n", c) + "（這個月沒抓到，先當 0%）"); a["r"] += [0] * (n - len(a["r"]))
    # 台幣定存
    dep = tw_dep(); tc = B["a"]["TWDCASH"]; lastdep = None
    for k in sorted(dep):
        if k <= new_last: lastdep = dep[k]
    n = ym_idx(tc["s"], new_last) + 1
    while len(tc["r"]) < n:
        k = ym_add(tc["s"], len(tc["r"])); rate = dep.get(k, lastdep)
        if rate is None: rate = 1.7; est.append("台幣定存利率")
        elif k not in dep: est.append("台幣定存利率（沿用上個月）")
        tc["r"].append(int(round(((1 + rate / 100) ** (1 / 12) - 1) * 10000)))
    # 台灣 CPI
    cpi = tw_cpi(); n = ym_idx(B["base"], new_last) + 1
    while len(B["cpi"]) < n:
        k = ym_add(B["base"], len(B["cpi"]))
        if k in cpi and ym_add(k, -1) in cpi: B["cpi"].append(int(round((cpi[k] / cpi[ym_add(k, -1)] - 1) * 100000)))
        else: B["cpi"].append(int(round(sum(B["cpi"][-12:]) / 12))); est.append("台灣 CPI（還沒公布，用最近 12 個月平均）")
    # 匯率
    n = ym_idx(B["fxs"], new_last) + 1
    while len(B["fxr"]) < n:
        k = ym_add(B["fxs"], len(B["fxr"])); B["fxr"].append(int(round(fx_ret.get(k, 0) * 100000)))
        if k not in fx_ret: est.append("匯率")
    # 美國長期歷史：股票用 SPY、債券用 IEF、現金用 BIL、黃金用期貨、通膨用 CPIAUCSL
    L = B["L"]; n = ym_idx(L["s"], new_last) + 1
    spy, ief, bil, gld = month_tr("SPY")[0] or {}, month_tr("IEF")[0] or {}, month_tr("BIL")[0] or {}, month_tr("GC=F")[0] or {}
    ucpi = fred_monthly("CPIAUCSL")
    def mret(m, k): return m[k] / m[ym_add(k, -1)] - 1 if k in m and ym_add(k, -1) in m else None
    while len(L["stock"]) < n:
        k = ym_add(L["s"], len(L["stock"]))
        for key, m, sc in (("stock", spy, 1e4), ("bond", ief, 1e4), ("cash", bil, 1e5), ("gold", gld, 1e4)):
            r = mret(m, k); L[key].append(int(round((r if r is not None else 0) * sc)))
        c = mret(ucpi, k)
        if c is None: c = sum(L["cpi"][-12:]) / 12 / 1e5; est.append("美國 CPI（還沒公布）")
        L["cpi"].append(int(round(c * 1e5)))
    B["mort"] = mort_series(new_last, B.get("mort"))
    if not B["mort"]: B.pop("mort"); est.append("房貸利率（沒有五大銀行利率檔）")
    B["last"] = new_last; B["v"] = today.isoformat()
    B["upd"] = {"at": datetime.datetime.now().isoformat(timespec="minutes"), "from": old_last, "est": sorted(set(est)), "bad": sorted(set(bad))}
    js = json.dumps(B, ensure_ascii=False, separators=(",", ":"))
    open(os.path.join(CACHE, "rate_latest.json"), "w", encoding="utf-8").write(js)
    gh_put("rate/latest.json", js.encode("utf-8"), "資料自動更新：回測資料到 " + new_last)
    if len(set(bad)) > 3: raise RuntimeError("有 %d 檔沒接上：%s" % (len(set(bad)), ",".join(sorted(set(bad))[:8])))
    return "資料到 " + new_last + ("（估計：" + "、".join(sorted(set(est))) + "）" if est else "")

# ---------- 放上 GitHub（你的 app-install 網站）----------
def gh_put(path, data, msg):
    tok = CFG.get("token")
    if not tok: raise RuntimeError("還沒設定 GitHub 金鑰")
    api = "https://api.github.com/repos/%s/contents/%s" % (REPO, urllib.parse.quote(path))
    hd = {"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    sha = None
    try: sha = json.loads(fetch(api, 30, hd).decode("utf-8")).get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404: raise RuntimeError("GitHub 讀取失敗 %d（金鑰可能過期）" % e.code)
    body = {"message": msg, "content": base64.b64encode(data).decode("ascii")}
    if sha: body["sha"] = sha
    req = urllib.request.Request(api, data=json.dumps(body).encode("utf-8"), method="PUT", headers=dict(UA, **hd, **{"Content-Type": "application/json"}))
    try: urllib.request.urlopen(req, timeout=60).read()
    except urllib.error.HTTPError as e: raise RuntimeError("GitHub 上傳失敗 %d（金鑰權限不夠或過期）" % e.code)

def upload_status(reg):
    items = []
    for it in reg["items"]:
        st = STATE.get(it["id"], {})
        every = it.get("every", 1)
        nxt = ""
        if st.get("ok_at"): nxt = (datetime.datetime.fromisoformat(st["ok_at"]) + datetime.timedelta(days=every)).date().isoformat()
        state = st.get("state") or ("manual" if it.get("how") == "manual" else "new")
        if it.get("how") == "later": state = "later"
        if it.get("how") == "manual":   # Claude 手動更新的：registry 的 done 是上次更新日，過期才顯示「有空跟 Claude 說」
            dn = it.get("done") or st.get("ok_at") or ""
            state = "manual-due" if not dn or (datetime.datetime.now() - datetime.datetime.fromisoformat(dn[:10])).days > every else "ok"
            st = dict(st, ok_at=dn)
            if dn: nxt = (datetime.datetime.fromisoformat(dn[:10]) + datetime.timedelta(days=every)).date().isoformat()
        items.append({"id": it["id"], "name": it.get("name", it["id"]), "how": it.get("how"), "every": every, "last": st.get("ok_at", ""), "next": nxt, "state": state, "msg": it.get("note", "") if state == "later" else (st.get("msg", "") or it.get("note", ""))})
    s = {"at": datetime.datetime.now().isoformat(timespec="minutes"), "ver": VERSION, "items": items, "pack": STATE.get("_pack", "")}
    jsave(os.path.join(HOME, "status.json"), s)
    try: gh_put("data/status.json", json.dumps(s, ensure_ascii=False, indent=1).encode("utf-8"), "資料自動更新：狀態")
    except Exception as e: log("狀態沒放上網站：" + str(e)[:80])

# ---------- 內政部實價登錄：每一季的全國買賣資料（開放資料），只留房地和土地的成交，壓縮後放上網站 rawdata/plvr/ ----------
PLVR_URL = "https://plvr.land.moi.gov.tw/DownloadSeason?season=%s&type=zip&fileName=lvr_landcsv.zip"
PLVR_DROP = {"非都市土地使用分區", "非都市土地使用編定", "主要建材", "單價元平方公尺", "建物現況格局-隔間", "移轉編號"}
def plvr_seasons():
    d = datetime.date.today(); y, q = d.year - 1911, (d.month - 1) // 3 + 1
    out = []
    for yy in range(101, y + 1):
        for qq in range(1, 5):
            if (yy, qq) < (101, 3) or (yy, qq) >= (y, q): continue
            out.append("%dS%d" % (yy, qq))
    return out   # 這一季還沒結束的不抓；上一季要等內政部公布（季後第二個月）
def plvr_pack(season, b):
    z = zipfile.ZipFile(io.BytesIO(b)); master = None; rows = []
    for name in sorted(z.namelist()):
        m = re.match(r"^(?:.*/)?([A-Z])_LVR_LAND_A\.CSV$", name.upper())
        if not m: continue
        raw = z.read(name)
        try: txt = raw.decode("utf-8-sig")
        except UnicodeDecodeError: txt = raw.decode("cp950", errors="replace")
        rd = list(csv.reader(io.StringIO(txt)))
        if len(rd) < 2: continue
        head = [h.strip() for h in rd[0]]
        body = rd[2:] if rd[1] and re.match(r"^[A-Za-z ]", rd[1][0] or "") else rd[1:]   # 第二行是英文欄名
        if master is None: master = ["縣市代碼"] + [h for h in head if h not in PLVR_DROP]
        for h in head:
            if h not in PLVR_DROP and h not in master: master.append(h)
        ti = head.index("交易標的") if "交易標的" in head else -1
        for r in body:
            if ti >= 0 and not (r[ti].startswith("房地") or r[ti].startswith("土地")): continue
            dct = dict(zip(head, r)); dct["縣市代碼"] = m.group(1); rows.append(dct)
    if master is None: raise RuntimeError(season + " 的壓縮檔裡沒有買賣資料")
    out = io.StringIO(); w = csv.writer(out); w.writerow(master)
    for dct in rows: w.writerow([dct.get(h, "") for h in master])
    return gzip.compress(out.getvalue().encode("utf-8"), 9), len(rows)
def h_plvr(it):
    done = set(STATE.get("_plvr", [])); allS = plvr_seasons(); at = STATE.setdefault("_plvrAt", {})
    for se in allS[-2:]:   # 最近兩季：內政部會陸續補登（申報期 30 天），每 30 天重抓一次
        if se in done and (datetime.date.today() - datetime.date.fromisoformat(at.get(se, "2000-01-01"))).days > 30: done.discard(se)
    try:   # 別台電腦已經放上網站的，這台就不用再抓
        tok = CFG.get("token"); hd = {"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json"} if tok else {}
        have = [x["name"][:-7] for x in json.loads(fetch("https://api.github.com/repos/%s/contents/rawdata/plvr" % REPO, 30, hd).decode("utf-8")) if x["name"].endswith(".csv.gz")]
        for se in have:
            if se not in done and se not in allS[-2:]: done.add(se); at.setdefault(se, datetime.date.today().isoformat())
        STATE["_plvr"] = sorted(done); jsave(STATE_F, STATE)
    except Exception: pass
    todo = [x for x in allS if x not in done]
    if not todo: return "全部 %d 季都已經放上網站" % len(allS)
    limit = 12 if AUTO else 999; got = 0
    for k, se in enumerate(todo[:limit]):
        if not AUTO: print("   %s（%d/%d）…" % (se, k + 1, min(limit, len(todo))), flush=True)
        try: b = fetch(PLVR_URL % se, 300)
        except Exception as e:
            if se == allS[-1]: break   # 最新一季可能還沒公布
            raise RuntimeError("%s 下載失敗：%s（已完成 %d 季，下次會接著抓）" % (se, str(e)[:60], len(done)))
        if b[:2] != b"PK":
            if se == allS[-1]: break
            raise NeedUser("%s 下載到的不是資料檔（內政部網站可能改版或要驗證），請把這個程式的紀錄傳給 Claude" % se)
        gz, n = plvr_pack(se, b)
        gh_put("rawdata/plvr/%s.csv.gz" % se, gz, "實價登錄 " + se)
        done.add(se); got += 1; at[se] = datetime.date.today().isoformat(); STATE["_plvr"] = sorted(done); jsave(STATE_F, STATE)
        log("   %s：%d 筆，%.1f MB" % (se, n, len(gz) / 1e6))
        time.sleep(3)   # 一季一季慢慢抓，不要太快
    left = len([x for x in allS if x not in done])
    if left > 1: raise Estimate("已經放上 %d 季，還有 %d 季，下次自動接著抓" % (len(done), left))
    return "已經放上 %d 季（這次 %d 季）" % (len(done), got)

# ---------- 台股個股歷史：個股評級用（研究「什麼樣的股票風險大」要全部的股票，包含已經下市的）----------
# 1. 證交所 ISIN 清單：上市、上櫃普通股的代號、名稱、上市日、產業別
# 2. Yahoo 每月股價（含還原權息）：每檔一次，100 檔一包放上網站
# 3. 證交所每個月最後一個交易日的「全部股票收盤價」和「本益比、殖利率、淨值比」：2005 年起（含後來下市的股票，避免只看活下來的公司）
# 4. 櫃買中心同樣的資料（網站常改版，抓不到不影響前面的）
TW_ISIN = {"上市": "https://isin.twse.com.tw/isin/C_public.jsp?strMode=2", "上櫃": "https://isin.twse.com.tw/isin/C_public.jsp?strMode=4"}
def tw_list():
    out = []
    for mk, url in TW_ISIN.items():
        raw = fetch(url, 60)
        try: html = raw.decode("cp950")
        except UnicodeDecodeError: html = raw.decode("big5", errors="replace")
        for tr in re.findall(r"<tr>(.*?)</tr>", html, re.S):
            td = [re.sub(r"<[^>]+>", "", x).replace("　", " ").strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if len(td) < 6: continue
            m = re.match(r"^(\d{4})\s+(.+)$", td[0])
            if not m or not td[5].startswith("ES"): continue   # 只要普通股（CFI 是 ES 開頭）
            out.append({"c": m.group(1), "n": m.group(2).strip(), "since": td[2], "mk": mk, "ind": td[4]})
    if len(out) < 1000: raise RuntimeError("股票清單只抓到 %d 檔（證交所網站可能改版）" % len(out))
    return out
def ymonth(sym):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=max&interval=1mo&events=div%%2Csplit" % urllib.parse.quote(sym)
    last = None
    for host in YHOSTS[:]:
        try:
            j = json.loads(fetch(url.replace("query1", host), 30).decode("utf-8"))["chart"]["result"][0]
            ts = j.get("timestamp") or []; q = j["indicators"]["quote"][0]
            adj = ((j["indicators"].get("adjclose") or [{}])[0]).get("adjclose") or []
            rows = []
            for i, t in enumerate(ts):
                c = (q.get("close") or [None] * len(ts))[i]; a = adj[i] if i < len(adj) else None; v = (q.get("volume") or [None] * len(ts))[i]
                if c: rows.append([datetime.datetime.fromtimestamp(t + 8 * 3600, datetime.timezone.utc).strftime("%Y-%m"), round(c, 4), round(a, 4) if a else None, int(v or 0)])
            return rows
        except Exception as e: last = e
    if last and "404" in str(last): return []
    raise last
def twse_json(url):
    for k in range(3):
        try:
            j = json.loads(fetch(url, 40).decode("utf-8"))
            return j
        except Exception as e:
            if k == 2: raise
            time.sleep(10)
def twse_month(ym):   # 這個月最後一個交易日：從月底往前找，先看收盤價有沒有，再抓同一天的本益比
    y, m = int(ym[:4]), int(ym[5:])
    d = datetime.date(y + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1)
    for k in range(8):
        dd = d - datetime.timedelta(days=k)
        if dd.weekday() >= 5: continue
        day = dd.strftime("%Y%m%d")
        px = twse_json("https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=%s&type=ALLBUT0999&response=json" % day); time.sleep(3.5)
        tbl = None
        for t in (px.get("tables") or []):
            f = t.get("fields") or []
            if "證券代號" in f and "收盤價" in f and len(t.get("data") or []) > 300: tbl = t; break
        if tbl is None and px.get("fields9"): tbl = {"fields": px["fields9"], "data": px.get("data9") or []}   # 舊格式
        if tbl is None: continue
        pe = twse_json("https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=%s&selectType=ALL&response=json" % day); time.sleep(3.5)
        return {"d": day, "px": {"f": tbl["fields"], "r": tbl["data"]}, "pe": {"f": pe.get("fields"), "r": pe.get("data")} if pe.get("stat") == "OK" else None}
    return None
# ---- 個股評級給 App 的資料（stk/hist.json）：每檔每月還原報酬＋「公司自己出事」的機率 ----
import math, statistics
TWD = lambda: os.path.join(CACHE, "twstk")
def tw_local(name, data=None):   # 本機也存一份，算的時候不用再下載
    os.makedirs(TWD(), exist_ok=True); f = os.path.join(TWD(), name)
    if data is not None: open(f, "wb").write(data); return data
    if os.path.exists(f): return open(f, "rb").read()
    b = fetch(PAGES + "rawdata/twstk/" + name + "?t=%d" % time.time(), 120); open(f, "wb").write(b); return b
def stk_clean(d, rawc, ymadd):
    # 每月還原報酬，去掉明顯的資料錯誤：
    #  台股每天漲跌最多 10%（2015 年以前 7%），一個月漲超過 160% 或跌超過 62% 很少見；遇到這種月份：
    #  1) 有證交所原始收盤價：兩邊差超過 35 個百分點，就改用證交所的（Yahoo 偶爾會錯）
    #  2) 沒有：3 個月內又整個回來（暴漲又暴跌）＝資料錯，這幾個月當沒資料；單月漲超過 5 倍也當沒資料
    ks = sorted(d); r = {}
    for a, b in zip(ks, ks[1:]):
        if ymadd(a, 1) == b: r[b] = d[b] / d[a] - 1
    fix = 0; ms = sorted(r)
    for i, k in enumerate(ms):
        v = r[k]
        if v is None or (-0.62 <= v <= 1.6): continue
        a0, b0 = rawc.get(ymadd(k, -1)), rawc.get(k)
        if a0 and b0 and a0 > 0:
            rr = b0 / a0 - 1
            if abs(rr - v) > 0.35: r[k] = rr; fix += 1
            continue
        g = 1 + v; rev = None
        for j in range(i + 1, min(i + 4, len(ms))):
            if r[ms[j]] is None: continue
            g *= 1 + r[ms[j]]
            if 0.5 < g < 1.5: rev = j; break
        if rev is not None:
            for j in range(i, rev + 1): r[ms[j]] = None
            fix += 1
        elif v > 5: r[k] = None; fix += 1
    return r, fix
def stk_build(packs, snap, lst, model, last, raw=None):
    # packs: {code: [[ym, close, adjclose, volume], ...]}；snap: 證交所某月 {'px':{f,r},'pe':{f,r}}；lst: 清單；last: 要對齊到的最後一個月（App 回測資料的最後一個月）
    def ymadd(ym, k): y, m = int(ym[:4]), int(ym[5:7]) - 1 + k; return "%04d-%02d" % (y + m // 12, m % 12 + 1)
    L = {x["c"]: x for x in lst}
    S = {}; R = {}; FIX = {}; VOL0 = {}
    raw = raw or {}
    for c, rows in packs.items():
        d = {}; z = 0
        for ym, cl, ac, vol in rows:
            if ac and ac > 0 and ym <= last: d[ym] = ac
            if ymadd(last, -11) <= ym <= last and not vol: z += 1
        if len(d) >= 2:
            S[c] = d; R[c], FIX[c] = stk_clean(d, raw.get(c, {}), ymadd); VOL0[c] = z
    # 每月報酬（對數，算風險用）、等權重市場（上市股票的中位數）
    lr = {}
    for c in S:
        lr[c] = {k: max(-1.5, min(1.5, math.log(1 + v))) for k, v in R[c].items() if v is not None and v > -1}
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
        # App 用的每月簡單報酬（萬分之一），從第一個月接到 last；資料錯的月份是 null（App 會用大盤補）
        r = []; k = s0
        while k < last:
            k2 = ymadd(k, 1); v0 = R[c].get(k2); r.append(int(round(v0 * 1e4)) if v0 is not None else None); k = k2
        if FIX[c]: info["fix"] = FIX[c]
        if VOL0[c] >= 6: info["stale"] = VOL0[c]   # 最近 12 個月有幾個月沒成交
        info["s"] = ymadd(s0, 1); info["r"] = r
        if len(ok) >= 24:
            ma = sum(b for a, b in ok) / len(ok); sa = sum(a for a, b in ok) / len(ok)
            vb = sum((b - ma) ** 2 for a, b in ok) / (len(ok) - 1); cov = sum((a - sa) * (b - ma) for a, b in ok) / (len(ok) - 1)
            beta = cov / vb if vb > 0 else 1.0
            res = [a - beta * b for a, b in ok]; mr = sum(res) / len(res)
            ivol = min(1.2, math.sqrt(sum((v - mr) ** 2 for v in res) / (len(res) - 1)) * math.sqrt(12))
            mom = sum(lr[c].get(ymadd(last, -k), 0.0) for k in range(12)) if last in d else 0.0   # 過去 12 個月（用清過的報酬）
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

def h_twstk(it):
    st = STATE.setdefault("_twstk", {"y": [], "m": []}); hd = {}
    # 1. 清單（每 30 天更新）
    if not st.get("listAt") or (datetime.date.today() - datetime.date.fromisoformat(st["listAt"])).days > 30:
        L = tw_list(); gh_put("rawdata/twstk/list.json", json.dumps(L, ensure_ascii=False).encode("utf-8"), "台股清單")
        st["list"] = [[x["c"], x["mk"]] for x in L]; st["listAt"] = datetime.date.today().isoformat(); jsave(STATE_F, STATE)
        log("   台股清單：%d 檔" % len(L))
    codes = st["list"]
    try:   # 別台電腦已經放上網站的，這台就不用再抓
        tok = CFG.get("token"); hd2 = {"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json"} if tok else {}
        have = [x["name"] for x in json.loads(fetch("https://api.github.com/repos/%s/contents/rawdata/twstk" % REPO, 30, hd2).decode("utf-8"))]
        for nm in have:
            m1 = re.match(r"^(y\d\d)\.json\.gz$", nm); m2 = re.match(r"^twse_(\d{4})\.json\.gz$", nm)
            if m1 and m1.group(1) not in st["y"]: st["y"].append(m1.group(1)); st.setdefault("yAt", {}).setdefault(m1.group(1), datetime.date.today().isoformat())
            if m2 and int(m2.group(1)) < datetime.date.today().year and "t" + m2.group(1) not in st["m"]: st["m"].append("t" + m2.group(1))
        jsave(STATE_F, STATE)
    except Exception: pass
    # 2. Yahoo 每月股價：100 檔一包
    packs = [codes[i:i + 100] for i in range(0, len(codes), 100)]
    limit = 3 if AUTO else 99; done_now = 0
    for k, pk in enumerate(packs):
        key = "y%02d" % k
        yat = st.setdefault("yAt", {}).get(key)
        fresh = yat and (datetime.date.today() - datetime.date.fromisoformat(yat)).days < 30   # 每個月更新一次股價（評級要用最新的）
        if key in st["y"] and fresh: continue
        if done_now >= (limit if key not in st["y"] else 3): break
        if not AUTO: print("   個股股價 第 %d/%d 包…" % (k + 1, len(packs)), flush=True)
        out, bad = {}, 0
        for c, mk in pk:
            try: out[c] = ymonth(c + (".TW" if mk == "上市" else ".TWO"))
            except Exception: bad += 1
            time.sleep(0.8)
        if bad > len(pk) * 0.5: raise RuntimeError("Yahoo 這一包有 %d 檔抓不到，晚點再試" % bad)
        gzb = gzip.compress(json.dumps(out, separators=(",", ":")).encode("utf-8"), 9)
        gh_put("rawdata/twstk/%s.json.gz" % key, gzb, "台股股價 " + key); tw_local(key + ".json.gz", gzb)
        if key not in st["y"]: st["y"].append(key)
        st["yAt"][key] = datetime.date.today().isoformat(); jsave(STATE_F, STATE); done_now += 1; st["dirty"] = 1
    # 3. 證交所每月快照（2005 年起，一年一包）
    y0, ynow = 2005, datetime.date.today().year
    for y in range(y0, ynow + 1):
        key = "t%d" % y
        if key in st["m"] and y < ynow: continue
        if done_now >= limit and y < ynow: break
        if y == ynow and st.get("mAt") == datetime.date.today().strftime("%Y-%m"): continue   # 今年的每月更新一次
        if not AUTO: print("   證交所 %d 年每月資料…" % y, flush=True)
        snaps = {}
        for m in range(1, 13):
            ym = "%d-%02d" % (y, m)
            if datetime.date(y, m, 1) >= datetime.date.today().replace(day=1): break
            r = twse_month(ym)
            if r: snaps[ym] = r
        if not snaps: continue
        gzb = gzip.compress(json.dumps(snaps, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)
        gh_put("rawdata/twstk/twse_%d.json.gz" % y, gzb, "證交所每月 %d" % y); tw_local("twse_%d.json.gz" % y, gzb); st["dirty"] = 1
        if key not in st["m"]: st["m"].append(key)
        if y == ynow: st["mAt"] = datetime.date.today().strftime("%Y-%m")
        jsave(STATE_F, STATE); done_now += 1
    left = len([1 for k in range(len(packs)) if "y%02d" % k not in st["y"]]) + len([1 for y in range(y0, ynow) if "t%d" % y not in st["m"]])
    if left: raise Estimate("台股資料還有 %d 包，下次自動接著抓" % left)
    # 4. 給 App 的個股資料：股價或證交所資料有更新、或還沒做過，就重算一次
    M = it.get("model"); msg = ""
    if M and (st.get("dirty") or not st.get("histAt")):
        if not AUTO: print("   計算個股風險…", flush=True)
        pk = {}
        for k in range(len(packs)): pk.update(json.loads(gzip.decompress(tw_local("y%02d.json.gz" % k)).decode("utf-8")))
        snap, sym = None, None
        for y in (ynow, ynow - 1):
            try: T = json.loads(gzip.decompress(tw_local("twse_%d.json.gz" % y)).decode("utf-8"))
            except Exception: continue
            ks = sorted(k for k in T if T[k].get("pe")); 
            if ks: sym = ks[-1]; snap = T[sym]; break
        if snap:
            L = json.loads(fetch(PAGES + "rawdata/twstk/list.json?t=%d" % time.time(), 60).decode("utf-8"))
            raw = {}   # 證交所每個月的原始收盤價（用來抓 Yahoo 偶爾錯的月份）
            for y in range(y0, ynow + 1):
                try: T2 = json.loads(gzip.decompress(tw_local("twse_%d.json.gz" % y)).decode("utf-8"))
                except Exception: continue
                for ym, v in T2.items():
                    try: fi = v["px"]["f"]; ic = fi.index("收盤價")
                    except Exception: continue
                    for r0 in v["px"]["r"]:
                        try: raw.setdefault(r0[0], {})[ym] = float(str(r0[ic]).replace(",", ""))
                        except ValueError: pass
            A = stk_build(pk, snap, L, M, sym, raw)
            res = {"v": datetime.date.today().isoformat(), "last": sym, "model": {k: M[k] for k in M if k in ("src", "auc", "ver", "elt", "eltSrc")}, "a": A}
            gh_put("stk/hist.json", json.dumps(res, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), "個股評級資料 " + sym)
            st["histAt"] = sym; st.pop("dirty", None); jsave(STATE_F, STATE); msg = "；個股評級資料到 " + sym + "（%d 檔）" % len(A)
    return "台股 %d 檔股價、證交所 %d 年每月資料都放上網站了" % (len(codes), ynow - y0 + 1) + msg

# ---------- 政府開放資料平臺（data.gov.tw）：先查資料集的說明（govmeta），再照網站資料清單指定的下載（govdata）----------
# 資料清單放在網站 data/registry.json，之後要加新資料只要改清單，不用改程式
GOV_API = "https://data.gov.tw/api/v2/rest/dataset/%s"
def gov_meta(did):
    j = json.loads(fetch(GOV_API % did, 40).decode("utf-8"))
    r = j.get("result") or j
    return {"id": did, "title": r.get("title"), "org": r.get("publisher") or r.get("organization"), "updated": r.get("modified") or r.get("updateFrequency"),
            "dist": [{"desc": d.get("resourceDescription"), "fmt": d.get("resourceFormat"), "url": d.get("resourceDownloadUrl"), "mod": d.get("resourceModified")} for d in (r.get("distribution") or [])]}
def h_govmeta(it):
    out = {}
    for did in it.get("ids", []):
        try: out[str(did)] = gov_meta(did)
        except Exception as e: out[str(did)] = {"id": did, "err": str(e)[:120]}
        time.sleep(1)
    gh_put("rawdata/gov/meta.json", json.dumps(out, ensure_ascii=False, indent=1).encode("utf-8"), "政府資料集說明")
    ok = len([1 for v in out.values() if not v.get("err")])
    return "查了 %d 個資料集（%d 個成功）" % (len(out), ok)
def gh_put_big(path, data, msg):   # GitHub 一個檔案最好不要超過 50MB：大的切成幾份
    lim = 45 * 1024 * 1024
    if len(data) <= lim: gh_put(path, data, msg); return 1
    n = 0
    for i in range(0, len(data), lim): gh_put("%s.part%02d" % (path, n), data[i:i + lim], msg + " part%d" % n); n += 1
    return n
def h_govdata(it):
    st = STATE.setdefault("_gov", {}); got = []
    for S in it.get("sets", []):
        key = S["key"]; every = S.get("every", 30)
        last = st.get(key)
        if last and (datetime.date.today() - datetime.date.fromisoformat(last)).days < every: continue
        if not AUTO: print("   " + S.get("name", key) + "…", flush=True)
        M = gov_meta(S["id"]); pat = re.compile(S.get("pick", "."), re.I); n = 0
        files = {}
        dl = M["dist"]
        if S.get("last"):   # 同一個資料集有很多個月份的版本：只抓清單上最後一個符合的（最新的）
            mm = [d for d in dl if d.get("url") and pat.search("%s %s" % (d.get("desc") or "", d.get("fmt") or ""))]; dl = mm[-1:]
        for d in dl:
            lab = "%s %s" % (d.get("desc") or "", d.get("fmt") or "")
            if not d.get("url") or not pat.search(lab): continue
            b = fetch(d["url"], 300)
            ext = (d.get("fmt") or "bin").lower().split("/")[-1][:5]
            fn = "%s_%02d.%s" % (key, n, re.sub(r"[^a-z0-9]", "", ext) or "bin")
            if not fn.endswith(".gz") and ext in ("csv", "json", "xml", "txt"): b = gzip.compress(b, 9); fn += ".gz"
            parts = gh_put_big("rawdata/gov/%s/%s" % (key, fn), b, S.get("name", key))
            files[fn] = {"desc": d.get("desc"), "fmt": d.get("fmt"), "url": d.get("url"), "bytes": len(b), "parts": parts}
            n += 1; time.sleep(1)
            if n >= S.get("max", 60): break
        if not n: raise RuntimeError("%s：資料集 %s 裡沒有符合的檔案（網站可能改版）" % (S.get("name", key), S["id"]))
        gh_put("rawdata/gov/%s/index.json" % key, json.dumps({"id": S["id"], "title": M.get("title"), "at": datetime.date.today().isoformat(), "files": files}, ensure_ascii=False, indent=1).encode("utf-8"), S.get("name", key))
        st[key] = datetime.date.today().isoformat(); jsave(STATE_F, STATE); got.append(S.get("name", key))
    return ("更新：" + "、".join(got)) if got else "都還沒到更新時間"

# 先看看新資料長什麼樣子（探路）：照網站清單抓幾個網址原樣放上網站，Claude 看過格式再寫正式的下載
def h_probe(it):
    st = STATE.setdefault("_probe", {}); idx = {}; got = []
    for P in it.get("urls", []):
        key = re.sub(r"[^A-Za-z0-9_-]", "", P["key"])[:40]
        if st.get(key) == P["url"] and not P.get("again"): continue
        try:
            b = fetch(P["url"], P.get("timeout", 60), P.get("headers"))
            info = {"url": P["url"], "bytes": len(b), "at": datetime.datetime.now().isoformat(timespec="seconds")}
            b = b[:20 * 1024 * 1024]
            gh_put("rawdata/probe/%s.gz" % key, gzip.compress(b, 9), "探路 " + key)
            st[key] = P["url"]; got.append(key)
        except Exception as e:
            info = {"url": P["url"], "err": str(e)[:200]}
        idx[key] = info; time.sleep(1)
    if idx:
        old = {}
        try: old = json.loads(fetch(PAGES + "rawdata/probe/index.json?t=%d" % time.time(), 20).decode("utf-8"))
        except Exception: pass
        old.update(idx); gh_put("rawdata/probe/index.json", json.dumps(old, ensure_ascii=False, indent=1).encode("utf-8"), "探路清單")
    jsave(STATE_F, STATE)
    bad = [k for k, v in idx.items() if v.get("err")]
    # 抓不到不算失敗（只是探路，原因寫在 index.json 給 Claude 看）
    return ("抓了 " + "、".join(got) if got else "沒有新的") + ("（失敗：" + "、".join(bad) + "）" if bad else "")

HANDLERS = {"files": h_files, "fred": h_fred, "yahoo": h_yahoo, "twdep": h_twdep, "twcpi": h_twcpi, "rate": h_rate, "plvr": h_plvr, "twstk": h_twstk, "govmeta": h_govmeta, "govdata": h_govdata, "probe": h_probe}
def run(force=False):
    reg = registry()
    log("===== 開始（%s）=====" % ("自動" if AUTO else "手動"))
    done = {}
    for it in reg["items"]:
        if it.get("how") in ("manual", "later"): continue
        dep_new = any(done.get(d) for d in it.get("after", []))
        if not (due(it, force) or dep_new): continue
        fn = HANDLERS.get(it.get("how"))
        if not AUTO: print("▶ " + it.get("name", it["id"]) + "…", flush=True)
        if not fn: mark(it, False, "這個程式太舊，不認得「%s」，請重新下載" % it.get("how")); continue
        try: mark(it, True, fn(it) or ""); done[it["id"]] = True
        except Estimate as e: mark(it, False, str(e), est=True)
        except NeedUser as e: mark(it, False, str(e), need_user=True)
        except Exception as e: mark(it, False, str(e)[:160])
    bad = [STATE[x["id"]]["name"] for x in reg["items"] if STATE.get(x["id"], {}).get("state") == "fail"]
    if bad:   # 有失敗：自動打包放桌面，你只要把 zip 傳給 Claude
        try: zp = pack(quiet=True); STATE["_pack"] = os.path.basename(zp); jsave(STATE_F, STATE)
        except Exception as e: log("打包失敗：" + str(e)[:80])
    else: STATE.pop("_pack", None); jsave(STATE_F, STATE)
    upload_status(reg)
    log("===== 結束 =====")

# ---------- 打包給 Claude（出問題時用）----------
def pack(quiet=False):
    zp = os.path.join(desktop(), "資產配置資料_給Claude_%s.zip" % datetime.date.today().strftime("%Y%m%d"))
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for f in [LOG_F, STATE_F, os.path.join(HOME, "status.json")]:
            if os.path.exists(f): z.write(f, os.path.basename(f))
        for f in os.listdir(CACHE):
            p = os.path.join(CACHE, f)
            if os.path.getsize(p) < 60e6: z.write(p, "cache/" + f)
    if quiet: return zp
    print("\n已經放在桌面：" + zp + "\n把它傳給 Claude 就好。")
    try:
        if sys.platform == "darwin": subprocess.run(["open", os.path.dirname(zp)])
        else: os.startfile(os.path.dirname(zp))
    except Exception: pass
    return zp

# ---------- 第一次設定 ----------
def clip():   # 讀剪貼簿（不用貼上）：Windows 用 PowerShell、Mac 用 pbpaste
    try:
        if os.name == "nt": rc, out = run_out(["powershell", "-NoProfile", "-Command", "Get-Clipboard"])
        else: rc, out = run_out(["pbpaste"])
        return out.strip() if rc == 0 else ""
    except Exception: return ""
TOK_RE = re.compile(r"(github_pat_[A-Za-z0-9_]{50,}|ghp_[A-Za-z0-9]{30,})")
def ask_token():
    # 金鑰不在畫面上出現：在 GitHub 按複製後，回來按 Enter，程式直接從剪貼簿讀
    for _ in range(3):
        input("\n   在 GitHub 按金鑰右邊的「複製」，回到這裡直接按 Enter（不用貼上）：")
        m = TOK_RE.search(clip())
        if m:
            t = m.group(1); print("   讀到金鑰：%s…%s" % (t[:14], t[-4:])); return t
        print("   剪貼簿裡沒有金鑰（要是 github_pat_ 開頭的那串），請再按一次「複製」")
    return ""
def ask_yn(q):
    while True:
        a = input(q).strip().lower()
        if a in ("y", "yes", "要", "n", "no", "不要", "不"): return a in ("y", "yes", "要")
        print("   只要打 y 或 n 就好")
def setup():
    print("\n第一次設定（只要一次）")
    print("─" * 40)
    print("① 建立 GitHub 金鑰（讓程式可以把資料放到你的 app-install 網站）")
    print("   我幫你打開 GitHub 的頁面，照這樣做：")
    print("   1. Token name 填：資產配置資料更新")
    print("   2. Expiration 選：No expiration（或最長）")
    print("   3. Repository access 選「Only select repositories」→ 選 app-install")
    print("   4. Permissions → Repository permissions → Contents 選「Read and write」")
    print("   5. 最下面按「Generate token」，把出現的一長串（github_pat_ 開頭）複製")
    try: webbrowser.open("https://github.com/settings/personal-access-tokens/new")
    except Exception: pass
    tok = ask_token()
    if tok:
        CFG["token"] = tok; jsave(CFG_F, CFG)
        try: gh_put("data/hello.txt", ("資料自動更新已連線 " + datetime.datetime.now().isoformat()).encode("utf-8"), "資料自動更新：連線測試"); print("   ✔ 連線成功")
        except Exception as e: print("   ✘ " + str(e) + "（可以之後再設定：再按一次桌面的圖示）")
    print("\n② 放桌面圖示、設定每天自動跑")
    me = os.path.abspath(__file__); py = sys.executable; mac = sys.platform == "darwin"
    auto = ask_yn("   這台電腦要每天下午 4 點自動更新嗎？（只要一台開著就夠）打 y＝要、n＝不要，再按 Enter：")
    if mac:
        try:
            cmd = os.path.join(desktop(), "資產配置資料更新.command")
            open(cmd, "w", encoding="utf-8").write('#!/bin/bash\n"%s" "%s"\n' % (py, me)); os.chmod(cmd, 0o755)
            print("   ✔ 桌面已經放「資產配置資料更新」（點兩下就會打開）")
        except Exception as e: print("   ✘ 桌面圖示：" + str(e))
        if auto:
            try:
                pl = os.path.join(os.path.expanduser("~"), "Library", "LaunchAgents", "tw.casper.assetdata.plist"); os.makedirs(os.path.dirname(pl), exist_ok=True)
                open(pl, "w", encoding="utf-8").write('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>tw.casper.assetdata</string><key>ProgramArguments</key><array><string>%s</string><string>%s</string><string>--auto</string></array><key>StartCalendarInterval</key><dict><key>Hour</key><integer>16</integer><key>Minute</key><integer>0</integer></dict></dict></plist>\n' % (py, me))
                run_out(["launchctl", "unload", pl]); rc, out = run_out(["launchctl", "load", pl])
                print("   ✔ 每天下午 4 點自動在背景更新（電腦要開著、沒睡著）" if rc == 0 else "   ✘ 自動排程沒設定成功：" + out[:120])
            except Exception as e: print("   ✘ 自動排程：" + str(e))
    else:
        pyw = py.replace("python.exe", "pythonw.exe")
        if not os.path.exists(pyw): pyw = py
        try:
            bat = os.path.join(desktop(), "資產配置資料更新.bat")
            open(bat, "w", encoding="cp950", errors="replace").write('@echo off\r\nchcp 65001 >nul\r\n"%s" "%s"\r\n' % (py, me))
            print("   ✔ 桌面已經放「資產配置資料更新」")
        except Exception as e: print("   ✘ 桌面圖示：" + str(e))
        if not auto:
            rc, out = run_out(["schtasks", "/Delete", "/F", "/TN", "資產配置資料更新"])
            if rc == 0: print("   ✔ 這台不自動更新（之前設定的排程已經拿掉）")
        if auto:
            try:
                rc, out = run_out(["schtasks", "/Create", "/F", "/SC", "DAILY", "/ST", "16:00", "/TN", "資產配置資料更新", "/TR", '"%s" "%s" --auto' % (pyw, me)])
                print("   ✔ 每天下午 4 點自動在背景更新" if rc == 0 else "   ✘ 自動排程沒設定成功：" + out[:120])
            except Exception as e: print("   ✘ 自動排程：" + str(e))
    CFG["setup"] = VERSION; jsave(CFG_F, CFG)

def menu():
    print("\n資產配置資料更新（%s）" % VERSION)
    print("  1. 現在更新（只抓到期的，要你按的會打開網頁）")
    print("  2. 全部重新下載")
    print("  3. 打包給 Claude（出問題時用）")
    print("  4. 重新設定（GitHub 金鑰、桌面圖示、自動排程）")
    c = input("選一個（直接按 Enter＝1）：").strip() or "1"
    if c == "1": run()
    elif c == "2": run(force=True)
    elif c == "3": pack()
    elif c == "4": setup()
    input("\n按 Enter 關閉")

# ---------- 好幾台電腦都用：自動換成最新版 ----------
# 網站上的 data/prog.json 記著最新版的版本；這台比較舊 → 自動下載換掉自己再重開；這台比較新 → 把自己放上網站，其他電腦下次打開就會換
def self_update():
    me = os.path.abspath(__file__)
    try: site = json.loads(fetch(PAGES + "data/prog.json?t=%d" % time.time(), 20).decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code != 404: log("檢查新版失敗（先用這一版）：%d" % e.code); return
        site = {}   # 網站上還沒有：這一台就是第一個
    except Exception as e: log("檢查新版失敗（先用這一版）：" + str(e)[:60]); return
    sv = site.get("ver", "")
    if sv > VERSION:
        try:
            code = fetch(PAGES + site.get("path", "tools/prog.py") + "?t=%d" % time.time(), 60)
            compile(code, me, "exec")   # 確定下載到的是完整的程式
            if ('VERSION = "%s"' % sv).encode("utf-8") not in code: raise ValueError("版本對不上")
            shutil.copy(me, me + ".舊版"); open(me, "wb").write(code)
            log("已經自動換成最新版 %s（原本 %s），重新開啟…" % (sv, VERSION))
            rc = subprocess.call([sys.executable, me] + sys.argv[1:]); sys.exit(rc)
        except Exception as e: log("自動換新版失敗（先用這一版 %s，網站上是 %s）：%s" % (VERSION, sv, str(e)[:60]))
    elif VERSION > sv and CFG.get("token"):
        try:
            gh_put("tools/prog.py", open(me, "rb").read(), "資料更新程式 " + VERSION)
            gh_put("data/prog.json", json.dumps({"ver": VERSION, "path": "tools/prog.py"}).encode("utf-8"), "資料更新程式版本 " + VERSION)
            log("這台是最新版 %s，已經放上網站，其他電腦下次打開會自動換" % VERSION)
        except Exception as e: log("新版沒放上網站：" + str(e)[:60])

if __name__ == "__main__":
    if CFG.get("token") or AUTO: self_update()
    if AUTO: run()
    elif not CFG.get("setup"): setup(); run(); input("\n設定完成，按 Enter 關閉")
    else: menu()
