// ==================== Env.gs ====================
// ============================================================
// 程式庫環境：每一份試算表（副本）呼叫程式庫時，先把自己的
// 試算表、指令碼屬性、快取、鎖傳進來，這樣每個人的資料、密碼、設定都分開。
// 副本那邊的「接頭.gs」會自動呼叫 bind()，不用手動執行。
// ============================================================

var LIB_VERSION_ = "2026.10.54p";
var ENV_ = null;

// 副本呼叫：Core.bind({ ss, props, ucache, scache, lock, scriptId })
function bind(env) {
  ENV_ = env || null;
  CFG_ = null;
  LAY_ = null;
  applyConfig_();
  return LIB_VERSION_;
}
function libVersion() { return LIB_VERSION_; }

// 中央 App 模式（有 Hub.gs）：第一次用到資料時，自動找出「這個使用者自己的」試算表和設定
function ensureEnv_() {
  if (!ENV_ && typeof hubEnv_ === "function") { ENV_ = envHubLazy_(); CFG_ = null; LAY_ = null; applyConfig_(); }
}
// ---------- 加速 ----------
// 屬性（設定、分類、匯率…）原本每讀一個就要跟 Google 來回一次；這裡改成第一次用到時整包讀進來，之後都從記憶體拿。
// 寫入照樣直接寫，並且同步更新記憶體裡那一份。每次執行都是新的，不會讀到別次執行的舊資料。
function propsMemo_(up) {
  var m = null;
  var load = function () { if (!m) m = up.getProperties() || {}; return m; };
  var w = {
    getProperty: function (k) { var x = load(); return Object.prototype.hasOwnProperty.call(x, k) ? x[k] : null; },
    getProperties: function () { var x = load(), o = {}; Object.keys(x).forEach(function (k) { o[k] = x[k]; }); return o; },
    getKeys: function () { return Object.keys(load()); },
    setProperty: function (k, v) { up.setProperty(k, v); if (m) m[k] = String(v); return w; },
    setProperties: function (o, del) { up.setProperties(o, !!del); if (del) m = null; else if (m) Object.keys(o).forEach(function (k) { m[k] = String(o[k]); }); return w; },
    deleteProperty: function (k) { up.deleteProperty(k); if (m) delete m[k]; return w; },
    deleteAllProperties: function () { up.deleteAllProperties(); m = {}; return w; }
  };
  return w;
}
// 中央 App：跟 Hub.gs 的 hubEnv_ 一樣，但試算表「真的用到才開」（開一次要 2～3 秒，顯示網頁那一步用不到）
var HUB_OK_EMAIL_ = "";
function envHubLazy_(noThrow) {
  var email = hubEmail_();
  if (HUB_OK_EMAIL_ !== email && !hubAllowed_(email)) return hubEnv_(); // 沒受邀：交給原本的流程處理（清排程、丟出錯誤）
  HUB_OK_EMAIL_ = email;
  var up = propsMemo_(PropertiesService.getUserProperties());
  var id = up.getProperty(HUB_SHEET_PROP_);
  if (!id) { if (noThrow) return null; throw new Error("還沒有建立資料試算表，請重新打開 App"); }
  var uc = CacheService.getUserCache(), ss = null;
  var env = { props: up, ucache: uc, scache: uc, lock: LockService.getUserLock(), scriptId: ScriptApp.getScriptId() + ":" + email };
  Object.defineProperty(env, "ss", { enumerable: true, get: function () { if (!ss) ss = SpreadsheetApp.openById(id); return ss; } });
  return env;
}
function SS_() { ensureEnv_(); return ENV_ && ENV_.ss ? ENV_.ss : SpreadsheetApp.getActiveSpreadsheet(); }
function PROPS_() { ensureEnv_(); return ENV_ && ENV_.props ? ENV_.props : PropertiesService.getScriptProperties(); }
function UCACHE_() { ensureEnv_(); return ENV_ && ENV_.ucache ? ENV_.ucache : CacheService.getUserCache(); }
function SCACHE_() { ensureEnv_(); return ENV_ && ENV_.scache ? ENV_.scache : CacheService.getScriptCache(); }
function LOCK_() { ensureEnv_(); return ENV_ && ENV_.lock ? ENV_.lock : LockService.getScriptLock(); }
function SCRIPT_ID_() { ensureEnv_(); return ENV_ && ENV_.scriptId ? ENV_.scriptId : ScriptApp.getScriptId(); }

// ---------- 每份副本自己的設定（「系統設定」分頁） ----------
var CFG_SHEET_ = "系統設定";
var CFG_DEFAULTS_ = [
  ["通知信箱", "", "留空＝寄到自己的 Google 帳號"],
  ["寄送通知信", "是", "是／否：記帳、交易、每日試算的通知信"],
  ["通知方式", "兩個都要", "Gmail／日曆／兩個都要：日曆會在自己的 Google 日曆加一個活動，手機會跳通知"],
  ["平盤時進場比例", 0.10, "那一檔跌幅 0～5% 時，本期建議買進的比例"],
  ["上漲時最低進場比例", 0.05, "那一檔在漲的時候，還是保留的最低買進比例"],
  ["下跌第1段（跌幅%）", 5, "3 個交易日內跌超過這個 %"],
  ["下跌第1段進場比例", 0.2, "跌到第 1 段時，本期買進比例"],
  ["下跌第2段（跌幅%）", 10, ""],
  ["下跌第2段進場比例", 0.3, ""],
  ["下跌第3段（跌幅%）", 20, ""],
  ["下跌第3段進場比例", 0.5, ""],
  ["手續費折讓方式", "無", "無＝C21 直接填折扣後費率；日退／月退＝C21 填全額 0.001425，折讓之後退回（在 App 設定）"],
  ["一般折數", "", "例如 2.8 折填 0.28（門檻以下）"],
  ["一般門檻（月成交額）", 0, "0＝不分段"],
  ["一般超過門檻折數", "", "月成交額超過門檻的部分"],
  ["新戶活動", "否", "是／否"],
  ["活動到期日", "", "例如 2026-12-31，過了就用一般折數"],
  ["活動門檻（月成交額）", 0, ""],
  ["活動門檻內折數", "", ""],
  ["活動超過門檻折數", "", ""],
  ["日退開始日", "", "改成日退的那天，之前的交易不會重複退"],
  ["手續費每月回補", "否", "（舊設定，App 會自動換成上面的折讓方式）"],
  ["手續費折數", "", "（舊設定）"]
];
var CFG_ = null;
function cfgSheet_(create) {
  var ss = SS_();
  var sh = ss.getSheetByName(CFG_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(CFG_SHEET_);
    sh.getRange(1, 1, 1, 3).setValues([["設定", "值", "說明"]]).setFontWeight("bold");
    sh.getRange(2, 1, CFG_DEFAULTS_.length, 3).setValues(CFG_DEFAULTS_);
    sh.setColumnWidth(1, 160); sh.setColumnWidth(3, 420);
  }
  return sh;
}
function CFG(key) {
  if (!CFG_) {
    CFG_ = {};
    CFG_DEFAULTS_.forEach(function (r) { CFG_[r[0]] = r[1]; });
    var cached = null;
    try { cached = SCACHE_().get("lib_cfg"); } catch (e) {}
    if (cached) {
      try { var o = JSON.parse(cached); for (var k in o) CFG_[k] = o[k]; } catch (e) {}
    } else {
      var sh = null;
      try { sh = cfgSheet_(false); } catch (e) {}
      var read = {};
      if (sh && sh.getLastRow() >= 2) {
        sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
          var k = String(r[0]).trim();
          if (k) { CFG_[k] = r[1]; read[k] = r[1]; }
        });
      }
      try { SCACHE_().put("lib_cfg", JSON.stringify(read), 600); } catch (e) {}
    }
  }
  return CFG_[key];
}
function clearConfigCache() { try { SCACHE_().remove("lib_cfg"); } catch (e) {} CFG_ = null; LAY_ = null; }

function applyConfig_() {
  try { if (typeof waApplyCodeNames_ === "function") waApplyCodeNames_(); } catch (e) {}
  try {
    var flat = Number(CFG("平盤時進場比例"));
    var rise = Number(CFG("上漲時最低進場比例"));
    if (typeof PER_TICKER_TIERS_ !== "undefined") {
      var tiers = [];
      for (var i = 1; i <= 3; i++) {
        var d = Number(CFG("下跌第" + i + "段（跌幅%）")), r = Number(CFG("下跌第" + i + "段進場比例"));
        if (d > 0 && d <= 100 && r >= 0 && r <= 1) tiers.push({ minDrop: d, ratio: r });
      }
      tiers.sort(function (a, b) { return b.minDrop - a.minDrop; });
      tiers.push({ minDrop: 0, ratio: flat > 0 && flat <= 1 ? flat : 0.1 });
      PER_TICKER_TIERS_.length = 0;
      tiers.forEach(function (t) { PER_TICKER_TIERS_.push(t); });
    }
    if (rise >= 0 && rise <= 1 && typeof RISE_FLOOR_RATIO_ !== "undefined") RISE_FLOOR_RATIO_ = rise;
  } catch (e) { Logger.log("讀取系統設定失敗：" + e); }
}

function NOTIFY_EMAIL_() {
  var e = String(CFG("通知信箱") || "").trim();
  if (e) return e;
  try { return Session.getEffectiveUser().getEmail(); } catch (err) { return ""; }
}
function MAIL_ON_() { return String(CFG("寄送通知信")).trim() !== "否"; }

// 取代 MailApp.sendEmail：關掉通知或沒有信箱時就不寄
function SEND_MAIL_(to, subject, body) {
  if (!MAIL_ON_()) { Logger.log("通知信已關閉：" + subject); return; }
  var addr = to || NOTIFY_EMAIL_();
  var mode = String(CFG("通知方式") || "兩個都要").trim();
  var calOk = false;
  if (mode !== "Gmail") calOk = CAL_NOTIFY_(subject, body);
  // 只用日曆、但日曆加不進去（例如還沒授權）：改寄信，免得通知不見
  if (mode === "Gmail" || mode === "兩個都要" || !calOk) { if (addr) MailApp.sendEmail(addr, subject, body); }
}
// 在自己的 Google 日曆加一個 15 分鐘的活動（3 分鐘後開始、開始時跳通知），手機的日曆 App 會跳出來
function CAL_NOTIFY_(subject, body) {
  try {
    var start = new Date(Date.now() + 3 * 60000), end = new Date(start.getTime() + 15 * 60000);
    var ev = CalendarApp.getDefaultCalendar().createEvent("💰 " + subject, start, end, { description: String(body || "").slice(0, 8000) });
    try { ev.removeAllReminders(); ev.addPopupReminder(0); } catch (re) {}
    return true;
  } catch (e) { Logger.log("日曆通知失敗（可能還沒授權日曆）：" + e); return false; }
}


// ==================== Layout.gs ====================
// ============================================================
// 工作表1 版面：第 2 列開始是標的（核心 N 檔＋自選 M 檔，預設 4＋4）
// 多加標的時，會在表格裡插入一列，原本第 10 列以下（現金、總資產、生活帳戶…）整片往下移。
// 程式裡寫的都是「原本的列號」，一律經過 R_() / A1_() 換算成現在的位置。
// 沒有多加標的時，換算結果跟原本完全一樣。
// ============================================================

var LAY_ = null;
function LAY() {
  if (LAY_) return LAY_;
  var core = 4, pick = 4;
  try {
    core = Math.max(4, Math.floor(Number(CFG("核心檔數")) || 4));
    pick = Math.max(4, Math.floor(Number(CFG("自選檔數")) || 4));
  } catch (e) { Logger.log(e); }
  LAY_ = { core: core, pick: pick, n: core + pick, coreLast: 1 + core, pickFirst: 2 + core, last: 1 + core + pick, off: core + pick - 8 };
  return LAY_;
}
// 原本的列號（第 10 列以後）→ 現在的列號
function R_(n) { return n >= 10 ? n + LAY().off : n; }
// "B14"、"B12:C48"、"=B14*1.5%/12" 這類寫法裡第 10 列以後的列號一起換算（別的分頁的參照不動）
function A1_(s) {
  var off = LAY().off;
  if (!off) return s;
  // 先把「別的分頁!範圍」整段藏起來，只換這一頁自己的參照
  var keep = [];
  var t = String(s).replace(/(?:'[^']+'|[A-Za-z0-9_\u4e00-\u9fff]+)!\$?[A-Z]{1,3}\$?\d*(?::\$?[A-Z]{1,3}\$?\d*)?/g, function (m) { keep.push(m); return "\u0001" + (keep.length - 1) + "\u0002"; });
  t = t.replace(/(^|[^A-Za-z0-9_'.$\u0001])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_\u0002])/g, function (m, pre, d1, col, d2, row) {
    var r = Number(row);
    return pre + d1 + col + d2 + (r >= 10 ? r + off : r);
  });
  return t.replace(/\u0001(\d+)\u0002/g, function (m, i) { return keep[Number(i)]; });
}
// 第 r 列是核心還是自選
function slotGroup_(row) { return row >= 2 && row <= LAY().coreLast ? "core" : row >= LAY().pickFirst && row <= LAY().last ? "pick" : ""; }

// ---------- 多加一個標的欄位 ----------
// group：core（核心 ETF）｜pick（自選股）
function waAddSlot(p) {
  var group = p && p.group === "pick" ? "pick" : "core";
  var ss = SS_();
  var sh = ss.getSheetByName("工作表1");
  var panel = ss.getSheetByName("操作面板");
  var lock = LOCK_();
  lock.waitLock(20000);
  try {
    var L = LAY();
    if (L.n >= 30) throw new Error("最多 30 檔");
    var groupFirst = group === "core" ? 2 : L.pickFirst;
    var groupLast = group === "core" ? L.coreLast : L.last;
    var at = groupLast + 1; // 新的一列放在這一組的最後面

    // 1. 工作表1、操作面板：插入一列，複製上一列的公式和格式
    [sh, panel].forEach(function (s) {
      if (!s) return;
      s.insertRowAfter(groupLast);
      s.getRange(groupLast, 1, 1, s.getMaxColumns()).copyTo(s.getRange(at, 1, 1, s.getMaxColumns()));
      // 只留公式：代號、股數、成本、手動輸入這些「值」清掉
      var rg = s.getRange(at, 1, 1, s.getLastColumn());
      var f = rg.getFormulas()[0];
      var v = rg.getValues()[0];
      for (var c = 0; c < f.length; c++) if (!f[c] && v[c] !== "") s.getRange(at, c + 1).clearContent();
    });
    // 目標比例先放 0（自動變保守只管原本的核心 4 檔）
    sh.getRange(at, 6).setValue(0);
    sh.getRange(at, 2).setValue(0);
    sh.getRange(at, 12).setValue(0);

    // 2. 公式裡「只到這一組最後一列」的範圍（例如 K2:K5）往下多包一列
    slotExtendRanges_(ss, groupFirst, groupLast);

    // 3. 記住新的檔數
    cfgSet_(group === "core" ? "核心檔數" : "自選檔數", (group === "core" ? L.core : L.pick) + 1);
    clearConfigCache();
    LAY_ = null;
  } finally {
    lock.releaseLock();
  }
  SpreadsheetApp.flush();
  return { message: "已多一個" + (group === "core" ? "核心 ETF" : "自選股") + "欄位", detail: "填上代號和比例就能用", dashboard: waGetDashboard() };
}

// 插入新列之後：所有參照「工作表1 第 first～last 列」的範圍，結尾是 last 的，改成 last+1
function slotExtendRanges_(ss, first, last) {
  var mainName = "工作表1";
  var re = /((?:'[^']+'|[A-Za-z0-9_一-鿿]+)!)?(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)/g;
  ss.getSheets().forEach(function (s) {
    var lr = s.getLastRow(), lc = s.getLastColumn();
    if (lr < 1 || lc < 1) return;
    var name = s.getName();
    var rg = s.getRange(1, 1, lr, lc);
    var fs = rg.getFormulas();
    fs.forEach(function (row, i) {
      row.forEach(function (f, j) {
        if (!f || f.indexOf(":") < 0) return;
        var changed = false;
        var nf = f.replace(re, function (m, pre, c1, r1, c2, r2) {
          var target = pre ? pre.replace(/!$/, "").replace(/^'|'$/g, "") : name;
          if (target !== mainName) return m;
          var a = Number(r1), b = Number(r2);
          if (b === last && a < b && (a <= 2 || a === first)) { changed = true; return (pre || "") + c1 + a + ":" + c2 + (b + 1); }
          return m;
        });
        if (changed) s.getRange(i + 1, j + 1).setFormula(nf);
      });
    });
  });
}

// ---------- 即時股價公式（C 欄）----------
// 一律跟著 A 欄的代號抓：先用 GOOGLEFINANCE，抓不到（上櫃、債券 ETF）再用 Yahoo 股市。
// 舊的範本有些格子把網址寫死成某一檔（例如 quote/00719B），換代號之後價格還是舊那檔的 → 這裡會自動改正。
function priceFormula_(r) {
  // 1. GOOGLEFINANCE 2. Yahoo 股市（即時，但要在試算表按一次「允許存取」）3. 「股價備援」分頁（App 每天從證交所／櫃買中心抓收盤價，不用按允許）
  return '=IF(A' + r + '="",0,IFERROR(GOOGLEFINANCE(A' + r + '),IFERROR(VALUE(IMPORTXML("https://tw.stock.yahoo.com/quote/"&SUBSTITUTE(A' + r +
    ',"TPE:",""),"//*[@id=\'main-0-QuoteHeader-Proxy\']/div/div[2]/div[1]/div/span[1]")),IFERROR(VLOOKUP(SUBSTITUTE(A' + r + ',"TPE:",""),\'' + PRICE_BAK_SHEET_ + '\'!A:B,2,FALSE),0))))';
}
// 舊版的標準公式（沒有股價備援）：看到就換成新的
function priceFormulaOld_(r) {
  return '=IF(A' + r + '="",0,IFERROR(GOOGLEFINANCE(A' + r + '),IFERROR(VALUE(IMPORTXML("https://tw.stock.yahoo.com/quote/"&SUBSTITUTE(A' + r +
    ',"TPE:",""),"//*[@id=\'main-0-QuoteHeader-Proxy\']/div/div[2]/div[1]/div/span[1]")),0)))';
}
// ---------- 股價備援：每天抓證交所（上市）和櫃買中心（上櫃，債券 ETF 大多在這）的收盤價，寫進隱藏分頁 ----------
// 這樣上櫃的債券 ETF 不用在試算表按「允許存取」也有價格（Yahoo 的 IMPORTXML 要按允許才會動）
var PRICE_BAK_SHEET_ = "股價備援";
function priceBackupRefresh_(force) {
  var props = PROPS_(), today = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd"), hour = Number(Utilities.formatDate(new Date(), "Asia/Taipei", "H"));
  var last = props.getProperty("PRICE_BAK_AT") || "";
  if (!force && (last === today + (hour >= 14 ? "pm" : "am") || (last.slice(0, 10) === today && hour < 14))) return 0;
  var ss = SS_(), codes = {};
  var main = ss.getSheetByName("工作表1");
  if (main) main.getRange(2, 1, LAY().n, 1).getValues().forEach(function (r) { var c = String(r[0]).trim().replace(/^TPE:/, "").toUpperCase(); if (/^[0-9A-Z]{4,6}$/.test(c)) codes[c] = true; });
  var alt = ss.getSheetByName("另類資產");
  if (alt && alt.getLastRow() >= 2) alt.getRange(2, 8, alt.getLastRow() - 1, 1).getValues().forEach(function (r) { var c = String(r[0]).trim().replace(/^TPE:/, "").toUpperCase(); if (/^[0-9A-Z]{4,6}$/.test(c)) codes[c] = true; });
  if (!Object.keys(codes).length) return 0;
  var px = {};
  var grab = function (url, codeKeys, priceKeys) {
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: "application/json" } });
      if (res.getResponseCode() !== 200) return;
      var arr = JSON.parse(res.getContentText()); if (!Array.isArray(arr)) return;
      arr.forEach(function (o) {
        var c = "", v = NaN;
        codeKeys.forEach(function (k) { if (!c && o[k]) c = String(o[k]).trim().toUpperCase(); });
        priceKeys.forEach(function (k) { if (!(v > 0) && o[k] != null) v = Number(String(o[k]).replace(/,/g, "")); });
        if (c && codes[c] && v > 0) px[c] = v;
      });
    } catch (e) { Logger.log("股價備援抓取失敗：" + url + " " + e); }
  };
  grab("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", ["Code"], ["ClosingPrice"]);
  grab("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", ["SecuritiesCompanyCode", "Code"], ["Close", "ClosingPrice"]);
  var keys = Object.keys(px);
  props.setProperty("PRICE_BAK_AT", today + (hour >= 14 ? "pm" : "am"));
  if (!keys.length) return 0;
  var sh = ss.getSheetByName(PRICE_BAK_SHEET_);
  if (!sh) { sh = ss.insertSheet(PRICE_BAK_SHEET_); try { sh.hideSheet(); } catch (e) {} }
  // 舊的保留（今天沒抓到的不要變空白），新的覆蓋
  var old = {}; if (sh.getLastRow() >= 1) sh.getRange(1, 1, sh.getLastRow(), 3).getValues().forEach(function (r) { if (r[0]) old[String(r[0])] = [r[1], r[2]]; });
  keys.forEach(function (c) { old[c] = [px[c], today]; });
  var out = Object.keys(old).sort().map(function (c) { return ["'" + c, old[c][0], old[c][1]]; });
  sh.clearContents(); sh.getRange(1, 1, out.length, 3).setValues(out);
  try { fixPriceFormulas_(); } catch (e) { Logger.log(e); }   // 舊公式換成有備援的
  return keys.length;
}

// 檢查每一列的 C 欄：公式沒有跟著 A 欄（寫死別的代號）就換成標準公式。回傳改了幾格
function fixPriceFormulas_() {
  var sh = SS_().getSheetByName("工作表1");
  if (!sh) return 0;
  var L = LAY();
  var codes = sh.getRange(2, 1, L.n, 1).getValues();
  var fs = sh.getRange(2, 3, L.n, 1).getFormulas();
  var vs = sh.getRange(2, 3, L.n, 1).getValues();
  var fixed = 0;
  for (var i = 0; i < L.n; i++) {
    var r = i + 2, code = String(codes[i][0]).trim().replace(/^TPE:/, "").toUpperCase(), f = String(fs[i][0] || "");
    if (!code) {
      // 代號清空的格子：舊公式（例如 =GOOGLEFINANCE(A8)）會變成錯誤，一樣會讓總資產整個壞掉 → 換成標準公式（沒代號就是 0）
      if (/^#/.test(String(vs[i][0])) || (f && !/A\$?\d+\s*=\s*""/.test(f))) { if (f !== priceFormula_(r)) { sh.getRange(r, 3).setFormula(priceFormula_(r)); fixed++; } }
      continue;
    }
    var nf = "";
    var vv = String(vs[i][0]);
    if (f === priceFormulaOld_(r)) { sh.getRange(r, 3).setFormula(priceFormula_(r)); fixed++; continue; }   // 舊的標準公式 → 加上股價備援
    // 股價現在是錯誤（#N/A 之類，例如 Google 財經暫時查不到）：換成有備援的標準公式（抓不到改用 Yahoo，再不行就是 0），
    // 不然這一格的錯誤會讓市值、總資產（B14）整個變成錯誤，所有建議買進都變 0
    if (f && /^#/.test(vv) && f !== priceFormula_(r)) nf = priceFormula_(r);
    else if (f) {
      // 寫死的 Yahoo 網址是別檔：只把網址換成跟著 A 欄，其他（例如只用 Yahoo）保持原樣
      var m = f.match(/"https:\/\/tw\.stock\.yahoo\.com\/quote\/([0-9A-Za-z]+)"/);
      if (m && m[1].toUpperCase() !== code) nf = f.replace(m[0], '"https://tw.stock.yahoo.com/quote/"&SUBSTITUTE(A' + r + ',"TPE:","")');
      // 寫死的 GOOGLEFINANCE("TPE:xxxx") 是別檔：換成標準公式
      var g = f.match(/"TPE:([0-9A-Za-z]+)"/);
      if (!nf && g && g[1].toUpperCase() !== code) nf = priceFormula_(r);
    } else if (!f && !(Number(vs[i][0]) > 0)) nf = priceFormula_(r); // 空白或 0：補上公式
    if (nf) { sh.getRange(r, 3).setFormula(nf); fixed++; }
  }
  if (fixed) Logger.log("C 欄股價公式改正 " + fixed + " 格");
  return fixed;
}


// ==================== Setup.gs ====================
// ============================================================
// 一鍵安裝（程式庫這邊）：建立分頁、列出副本需要的自動排程
// 副本的「接頭.gs」裡的 setupAll() 會呼叫這裡，然後自己建立排程
// ============================================================

// 建立／補齊需要的分頁，不會刪任何資料
function setupSheets() {
  var ss = SS_();
  var done = [];
  if (!ss.getSheetByName(CFG_SHEET_)) { cfgSheet_(true); done.push("系統設定"); }
  if (!ss.getSheetByName(WA_ACCOUNT_SHEET_)) { waAccountSheet_(ss); done.push("帳戶"); } else waAccountSheet_(ss);
  if (!ss.getSheetByName(WA_FLOW_SHEET_)) { waFlowSheet_(ss); done.push("帳戶流水"); }
  if (!ss.getSheetByName(RETIRE_SHEET_)) { try { setupRetirePlan(); done.push("退休規劃、配置規則"); } catch (e) { Logger.log(e); } }
  clearConfigCache();
  return done;
}

// 副本要建立的排程清單（依照這份試算表有哪些功能決定）
function triggerPlan() {
  var ss = SS_();
  var props = PROPS_();
  var feeMode = feeRule_().mode;
  var rebate = feeMode === "月退";
  var plan = [
    { fn: "refreshWeeklyLifeAccountV2", kind: "weekly", day: "MONDAY", hour: 8, label: "每週一 8 點校準生活帳戶" },
    { fn: "dailyPortfolioCheck", kind: "daily", hour: 12, label: "每天 12:00 再平衡試算（盤中，還來得及下單）" },
    { fn: "recordDailyClose", kind: "daily", hour: 15, label: "每天 15 點記錄收盤價" },
    { fn: "refreshDashCache", kind: "hourly", label: "每小時先把 App 畫面算好（7～23 點）" }
  ];
  if (rebate) plan.push({ fn: "monthlyFeeRebate", kind: "monthly", day: 15, hour: 10, label: "每月 15 號手續費回補" });
  if (feeMode !== "無") plan.push({ fn: "onLedgerEditUpdatePreview_", kind: "edit", label: "交易紀錄修改時更新回補預估" });
  if (feeMode === "日退") plan[2].label += "（順便手續費日退）";
  if (props.getProperty("EXPENSE_FORM_ID")) plan.push({ fn: "onExpenseFormSubmitV2", kind: "formSubmit", label: "記帳表單" });
  if (props.getProperty("TRADE_FORM_ID")) plan.push({ fn: "onTradeFormSubmitV2", kind: "formSubmit", label: "交易表單" });
  if (ss.getSheetByName(GOLD_SET_SHEET_)) plan.push({ fn: "updateGoldPrice", kind: "hourly", label: "每小時更新金價" });
  if (ss.getSheetByName(FX_SHEET_)) plan.push({ fn: "updateFxRates", kind: "hourly", label: "每小時更新匯率" });
  return plan;
}

// 所有可能由舊版建立的排程名稱（重新安裝時先清掉，避免重複）
function knownTriggerNames() {
  return ["onExpenseFormSubmit", "onExpenseFormSubmitV2", "onTradeFormSubmit", "onTradeFormSubmitV2",
    "refreshWeeklyLifeAccountV2", "monthlyFeeRebate", "onLedgerEditUpdatePreview_", "dailyPortfolioCheck",
    "recordDailyClose", "updateGoldPrice", "updateFxRates", "sendRebalanceEmailUpdate", "processNewExpenseResponses",
    "processNewTradeResponses", "refreshDashCache", "portfolioCheckAtNoon"];
}

function enableGold() { setupGoldModule(); return "實體黃金"; }
function enableFx() { setupFxModule(); return "外幣"; }
function enableBiz() { setupBizModule(); return "生意"; }

// 安裝完的說明
function setupSummary(created, plan) {
  return "✅ 安裝完成\n\n" +
    (created.length ? "新建立的分頁：" + created.join("、") + "\n" : "") +
    "自動排程：\n・" + plan.map(function (p) { return p.label; }).join("\n・") + "\n\n" +
    "接下來：\n" +
    "1. 到「系統設定」分頁確認通知信箱和進場比例\n" +
    "2. Apps Script 右上角「部署 → 新增部署作業 → 網頁應用程式」，執行身分選「我」、存取權選「只有我自己」→ 部署\n" +
    "3. 打開網頁 App，到「持股」分頁的「期初設定」填目前的持股、現金和帳戶餘額";
}

// ============================================================
// 做成「空白範本」：給別人用之前，在「副本」上執行一次
// 會先備份，再清掉所有個人資料（持股、紀錄、帳戶、另類資產、黃金、外幣、生意、密碼、外觀）
// 千萬不要在自己正在用的試算表上執行
// ============================================================
function makeBlankTemplate() {
  var ui = SpreadsheetApp.getUi();
  var ss = SS_();
  var a = ui.alert("⚠️ 做成空白範本", "這會清掉這份試算表裡「所有個人資料」：持股、現金、交易和收支紀錄、帳戶、另類資產、黃金、外幣、生意資料、密碼和外觀設定。\n\n" +
    "只有要分享給別人的「副本」才可以執行！\n\n目前這份是：" + ss.getName() + "\n\n確定要繼續嗎？", ui.ButtonSet.YES_NO);
  if (a !== ui.Button.YES) return;
  var b = ui.prompt("最後確認", "請輸入「清空」兩個字確認：", ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK || String(b.getResponseText()).trim() !== "清空") { ui.alert("已取消，沒有動任何資料。"); return; }

  // 先備份
  var stamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd_HHmmss");
  DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + "_做成範本前備份_" + stamp);

  var main = ss.getSheetByName("工作表1");
  if (!main) throw new Error("找不到工作表1");
  // 持股、現金、生活帳戶歸零；自選股欄位清空（核心 ETF 保留）
  main.getRange("B2:B" + LAY().last).setValue(0);
  main.getRange("L2:L" + LAY().last).setValue(0);
  main.getRange("N2:N" + LAY().last).clearContent();
  main.getRange("Q2:R" + LAY().last).clearContent();
  main.getRange("A" + LAY().pickFirst + ":A" + LAY().last).clearContent();
  for (var r = LAY().pickFirst; r <= LAY().last; r++) {
    main.getRange(r, 3).setFormula(priceFormula_(r));
  }
  ["D10", "B38", "B45", "B46", "B16"].forEach(function (c) { main.getRange(A1_(c)).setValue(0); });
  main.getRange(A1_("B48")).clearContent();
  main.getRange(A1_("B15")).setFormula(A1_("=IF(OR(B16=\"\",B16=0),0,(B14-(B16+SUM('另類資產'!G2:G100)))/(B16+SUM('另類資產'!G2:G100)))"));

  // 紀錄類分頁：只留表頭
  ["交易紀錄", "收支紀錄", "歷史配置", "支出評估紀錄", "帳戶流水", "另類資產", "生意資產", "資產快照", "另類資產走勢", "外幣流水"].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(1, sh.getLastColumn())).clearContent();
  });
  // 表單（Google 表單）解除連結並刪掉回覆分頁；新的人用網頁 App 就好
  ss.getSheets().forEach(function (sh) {
    var url = null;
    try { url = sh.getFormUrl(); } catch (e) {}
    if (url) {
      try { FormApp.openByUrl(url).removeDestination(); } catch (e) { Logger.log(e); }
      try { ss.deleteSheet(sh); } catch (e) { Logger.log(e); }
    }
  });
  // 選用功能的分頁整個刪掉（新的人需要再從選單啟用）
  ["黃金", "黃金設定", "外幣帳戶", "外幣流水", "商品", "進貨", "營收", "費用", "耗材領用", "生意設定", "App設定"].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh) { try { ss.deleteSheet(sh); } catch (e) { Logger.log(e); } }
  });
  // 帳戶：換成兩個通用帳戶
  var acc = ss.getSheetByName(WA_ACCOUNT_SHEET_);
  if (acc) {
    if (acc.getLastRow() > 1) acc.getRange(2, 1, acc.getLastRow() - 1, Math.max(5, acc.getLastColumn())).clearContent();
    acc.getRange(1, 1, 1, 5).setValues([["帳戶名稱", "狀態（使用中 / 未使用）", "歸屬（個人 / 生意）", "用途（股票交割）", WA_ROLE_HEADER_]]);
    acc.getRange(2, 1, 2, 5).setValues([["現金", "使用中", "個人", "", "生活"], ["證券交割戶", "使用中", "個人", "股票交割", "投資"]]);
  }
  // 退休規劃：個人數字清空，保留結構
  var rp = ss.getSheetByName(RETIRE_SHEET_);
  if (rp) { rp.getRange("B1").clearContent(); rp.getRange("B3").clearContent(); rp.getRange("B5").clearContent(); rp.getRange("B6").setValue(0); rp.getRange("B10").clearContent(); rp.getRange("B11").clearContent(); rp.getRange("B12").clearContent(); }
  // 生活帳戶提領比例回到預設 1.5%
  main.getRange(A1_("B29")).setFormula(A1_("=B14*1.5%/12"));
  // 系統設定回到預設
  var cfg = ss.getSheetByName(CFG_SHEET_);
  if (cfg) ss.deleteSheet(cfg);
  cfgSheet_(true);
  // 指令碼屬性：密碼、外觀、表單、匯率、分類、分批計畫全部清掉
  var props = PROPS_();
  ["HEALTH_STATE", "MAIL_WEEK_STATE", "TRIAL_LAST", "FEE_MONTH_SETTLED", "APP_PIN", "APP_SETTINGS", "EXPENSE_FORM_ID", "TRADE_FORM_ID", "FX_RATES", "STAGED_ENTRY_PLAN", "INCOME_CATEGORIES", "EXPENSE_CATEGORIES", "ONBOARD_DONE", "CODE_NAMES", "PLAN2", "BIZ_BOUND_CATS"].forEach(function (k) { props.deleteProperty(k); });
  clearConfigCache();
  try { UCACHE_().remove("wa_dash"); } catch (e) {}
  SpreadsheetApp.flush();
  return "done";
}


// ==================== Settings.gs ====================
// ============================================================
// App 裡的「設定」：原本要到試算表改的東西，都可以在 App 裡改
// 投資標的與目標比例、生活帳戶提領比例、帳戶管理、退休規劃、通知與進場比例、新手引導
// ============================================================

var WA_CODE_NAMES_PROP_ = "CODE_NAMES";

// 自訂的標的名稱（新增的股票沒有內建名字時用）
function waApplyCodeNames_() {
  try {
    var o = JSON.parse(PROPS_().getProperty(WA_CODE_NAMES_PROP_) || "{}");
    for (var k in o) if (o[k]) WA_NAMES_[k] = o[k];
  } catch (e) {}
}

function waLifeRate_(sh) {
  var f = String(sh.getRange(A1_("B29")).getFormula() || "");
  var m = f.match(/B\$?\d+\s*\*\s*([\d.]+)\s*%\s*\/\s*12/i);
  return m ? Number(m[1]) / 100 : null;
}

// 設定頁要用的全部資料
function waGetConfigData() {
  var ss = SS_();
  var sh = ss.getSheetByName("工作表1");
  waApplyCodeNames_();
  var L = LAY();
  var a = sh.getRange(2, 1, L.n + 1, 2).getValues();
  var fv = sh.getRange(2, 6, L.n + 1, 1).getValues();
  var ff = sh.getRange(2, 6, L.n + 1, 1).getFormulas();
  var rows = [];
  for (var i = 0; i < L.n; i++) {
    var code = String(a[i][0]).trim();
    rows.push({ row: i + 2, code: code, name: code ? (WA_NAMES_[code] || "") : "", shares: waNum_(a[i][1]),
      target: waNum_(fv[i][0]), formula: !!ff[i][0], group: i < L.core ? "core" : "pick" });
  }
  var glide = /配置規則/.test(ff[0][0] || "");
  var cashIdx = L.n;
  var cfg = {};
  CFG_DEFAULTS_.forEach(function (d) { cfg[d[0]] = { value: CFG(d[0]), note: d[2] }; });
  var retire = null;
  var rp = ss.getSheetByName(RETIRE_SHEET_);
  if (rp) {
    var v = rp.getRange("A1:B12").getValues();
    retire = v.map(function (r) { return { label: String(r[0]), value: r[1] === "" ? "" : r[1] }; });
  }
  var alloc = null;
  var al = ss.getSheetByName(ALLOC_SHEET_);
  if (al) alloc = al.getRange("A2:D7").getValues().map(function (r, i) { return { row: i + 2, name: String(r[0]), start: waNum_(r[2]), end: waNum_(r[3]) }; });
  var flows = waFlowRows_(ss);
  var accounts = waAccountBalances_(ss).map(function (x) {
    var info = waAccountList_(ss).filter(function (y) { return y.name === x.name; })[0] || {};
    return { name: x.name, active: x.active, scope: x.scope, role: x.role, stock: !!info.stock, balance: x.balance };
  });
  return JSON.parse(JSON.stringify({
    rows: rows, cash: { target: waNum_(fv[cashIdx][0]), formula: !!ff[cashIdx][0] }, slots: { core: L.core, pick: L.pick }, glide: glide, hasAlloc: !!al, alloc: alloc,
    plan2: plan2Data_(),
    lifeRate: waLifeRate_(sh), lifeFormula: String(sh.getRange(A1_("B29")).getFormula() || ""),
    cfg: cfg, retire: retire, accounts: accounts, calibrated: flows.some(function (r) { return String(r[1]) === "校正"; }),
    onboardDone: PROPS_().getProperty("ONBOARD_DONE") === "1"
  }));
}

// ---------- 投資標的與目標比例 ----------
// p.rows: [{row, code, name, target}]（target 是 0～1）, p.cash, p.glide（核心 4 檔＋現金跟著退休規劃自動變保守）
function waSaveTargets(p) {
  var ss = SS_();
  var sh = ss.getSheetByName("工作表1");
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var cur = sh.getRange(2, 1, LAY().n, 2).getValues();
    var names = {};
    try { names = JSON.parse(PROPS_().getProperty(WA_CODE_NAMES_PROP_) || "{}"); } catch (e) {}
    var seen = {}, codeChanged = false;
    var rows = (p.rows || []).map(function (x) {
      var row = Number(x.row);
      if (!(row >= 2 && row <= LAY().last)) throw new Error("列號不正確");
      var raw = String(x.code || "").trim();
      var code = raw ? normalizeStockCode_(raw) : "";
      if (raw && !code) throw new Error("看不懂代號「" + raw + "」，請輸入例如 0050 或 2330");
      var old = String(cur[row - 2][0]).trim();
      var shares = waNum_(cur[row - 2][1]);
      if (code !== old && shares > 0) throw new Error((WA_NAMES_[old] || old) + " 還有 " + shares + " 股，要先賣光（或到持股校正成 0）才能換代號");
      if (code && seen[code]) throw new Error(code + " 重複了");
      if (code) seen[code] = true;
      var t = Number(x.target);
      if (!(t >= 0 && t <= 1)) throw new Error("目標比例要在 0%～100% 之間");
      if (!code) t = 0;
      if (code !== old) codeChanged = true;
      if (code && x.name) names[code] = String(x.name).trim().slice(0, 20);
      return { row: row, code: code, target: t };
    });
    var cash = Number(p.cash);
    if (!(cash >= 0 && cash <= 1)) throw new Error("現金目標比例要在 0%～100% 之間");
    var plan2 = p.mode === "plan2";
    var glide = !plan2 && !!p.glide && !!ss.getSheetByName(ALLOC_SHEET_);
    var p2B = null;
    if (plan2) {
      // 退休組合：代號＋比例，加現金要剛好 100%
      var bSeen = {}, bSum = 0, bCodes = {};
      (Array.isArray(p.plan2B) ? p.plan2B : []).forEach(function (x) {
        var raw = String(x.code || "").trim();
        if (!raw) return;
        var c = normalizeStockCode_(raw);
        if (!c) throw new Error("退休組合裡看不懂代號「" + raw + "」");
        if (bSeen[c]) throw new Error("退休組合裡 " + c + " 重複了");
        bSeen[c] = 1;
        var v = Number(x.target);
        if (!(v >= 0 && v <= 1)) throw new Error("退休組合的比例要在 0%～100% 之間");
        bCodes[c] = v; bSum += v;
        if (x.name) names[c] = String(x.name).trim().slice(0, 20);
      });
      var bCash = Number(p.plan2Cash);
      if (!(bCash >= 0 && bCash <= 1)) throw new Error("退休組合的現金比例要在 0%～100% 之間");
      if (Math.abs(bSum + bCash - 1) > 0.0051) throw new Error("退休組合加起來要是 100%（現在是 " + ((bSum + bCash) * 100).toFixed(1) + "%）");
      p2B = { codes: bCodes, cash: bCash };
    }
    if (!glide) {
      var sum = rows.reduce(function (s, x) { return s + x.target; }, 0) + cash;
      if (Math.abs(sum - 1) > 0.0051) throw new Error("所有目標比例加起來要是 100%（現在是 " + (sum * 100).toFixed(1) + "%）");
    }
    rows.forEach(function (x) {
      sh.getRange(x.row, 1).setValue(x.code);
      if (glide && x.row <= 5) sh.getRange(x.row, 6).setFormula("='" + ALLOC_SHEET_ + "'!F" + x.row);
      else sh.getRange(x.row, 6).setValue(x.target);
    });
    if (glide) sh.getRange(R_(10), 6).setFormula("='" + ALLOC_SHEET_ + "'!F7");
    // 配置規則：核心 4 檔的代號跟著改；有傳起點／退休時比例就一起存
    var al = ss.getSheetByName(ALLOC_SHEET_);
    if (al) {
      rows.forEach(function (x) { if (x.row <= 5 && x.code) al.getRange(x.row, 2).setValue(x.code); });
      if (Array.isArray(p.alloc) && p.alloc.length === 6) {
        var st = 0, en = 0;
        var vals = p.alloc.map(function (a) {
          var s0 = Number(a.start), e0 = Number(a.end);
          if (!(s0 >= 0 && s0 <= 1 && e0 >= 0 && e0 <= 1)) throw new Error("自動變保守的比例要在 0%～100% 之間");
          st += s0; en += e0; return [s0, e0];
        });
        if (Math.abs(st - 1) > 0.0051) throw new Error("「現在」那一欄加起來要是 100%（現在是 " + (st * 100).toFixed(1) + "%）");
        if (Math.abs(en - 1) > 0.0051) throw new Error("「退休時」那一欄加起來要是 100%（現在是 " + (en * 100).toFixed(1) + "%）");
        al.getRange(2, 3, 6, 2).setValues(vals);
      }
      // 還沒填退休規劃時不要出現 #DIV/0!（先用「現在」的比例）
      var t = "IFERROR(MAX(0,MIN(1,('" + RETIRE_SHEET_ + "'!$B$2-'" + RETIRE_SHEET_ + "'!$B$3)/('" + RETIRE_SHEET_ + "'!$B$4-'" + RETIRE_SHEET_ + "'!$B$3))),0)";
      for (var i = 2; i <= 7; i++) al.getRange(i, 5).setFormula("=C" + i + "+(D" + i + "-C" + i + ")*" + t);
    }
    else sh.getRange(R_(10), 6).setValue(cash);
    PROPS_().setProperty(WA_CODE_NAMES_PROP_, JSON.stringify(names));
    // 兩套組合：記下現在的組合（就是上面填的）和退休組合，目標比例照年紀算好寫進去
    var oldP2 = plan2Get_();
    if (plan2) {
      var aCodes = {};
      rows.forEach(function (x) { if (x.code) aCodes[x.code] = x.target; });
      var np = { on: true, years: Math.max(1, Math.min(30, Math.round(Number(p.plan2Years) || 10))), A: { codes: aCodes, cash: cash }, B: p2B, stage: 0 };
      var pg0 = plan2Progress_(np);
      np.stage = Math.round(pg0.t * pg0.years); // 存的當下已經在換的話，不再補寄信
      plan2Save_(np);
    } else if (oldP2 && oldP2.on) { oldP2.on = false; plan2Save_(oldP2); }
  } finally {
    lock.releaseLock();
  }
  if (plan2) { SpreadsheetApp.flush(); plan2Apply_(false); } // 可能要多開核心欄位（那裡自己會拿鎖），所以放在鎖外面
  if (codeChanged) { try { syncTradeFormCodes(); } catch (e) { Logger.log(e); } }
  try { fixPriceFormulas_(); } catch (pfE) { Logger.log(pfE); } // 換了代號：股價公式跟著換
  return { message: "投資標的與目標比例已儲存", detail: plan2 ? "退休前 " + (Math.round(Number(p.plan2Years) || 10)) + " 年開始，每年把目標比例往退休組合移一點" : glide ? "核心 4 檔和現金會跟著退休規劃每年自動變保守" : "", dashboard: waGetDashboard() };
}

// ---------- 生活帳戶：每年可以從總資產提領多少 % 當生活費 ----------
function waSaveLifeRate(p) {
  var rate = Number(p.rate);
  if (!(rate > 0 && rate <= 0.2)) throw new Error("提領比例要在 0%～20% 之間");
  var sh = SS_().getSheetByName("工作表1");
  sh.getRange(A1_("B29")).setFormula(A1_("=B14*") + Math.round(rate * 10000) / 100 + "%/12");
  try { if (typeof refreshLifeAccountDisplayV2_ === "function") refreshLifeAccountDisplayV2_(SS_()); } catch (e) { Logger.log(e); }
  return { message: "生活帳戶提領比例改為每年 " + (rate * 100).toFixed(2).replace(/\.?0+$/, "") + "%", detail: "每週額度下次校準時會更新", dashboard: waGetDashboard() };
}

// ---------- 通知與進場比例（系統設定分頁） ----------
function waSaveConfig(p) {
  var sh = cfgSheet_(true);
  var last = sh.getLastRow();
  var keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  var vals = p && p.values ? p.values : {};
  Object.keys(vals).forEach(function (k) {
    var def = CFG_DEFAULTS_.filter(function (d) { return d[0] === k; })[0];
    if (!def) return;
    var v = vals[k];
    if (k.indexOf("跌幅") >= 0) {
      v = Number(v); if (!(v > 0 && v <= 100)) throw new Error(k + " 要在 0～100 之間");
    } else if (typeof def[1] === "number" || k === "手續費折數") {
      if (v === "" || v === null) v = "";
      else { v = Number(v); if (!(v >= 0 && v <= 1)) throw new Error(k + " 要在 0%～100% 之間"); }
    } else v = String(v == null ? "" : v).trim();
    if (k === "通知信箱" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error("信箱格式不正確");
    var i = keys.indexOf(k);
    if (i >= 0) sh.getRange(i + 2, 2).setValue(v);
    else { sh.appendRow([k, v, def[2]]); keys.push(k); }
  });
  clearConfigCache();
  return { message: "設定已儲存", detail: (typeof hubEnv_ === "function" ? "" : "手續費回補的開關改了的話，到試算表選單按一次「一鍵安裝」更新排程"), dashboard: waGetDashboard() };
}

// ---------- 退休規劃 ----------
function waSaveRetire(p) {
  var ss = SS_();
  if (!ss.getSheetByName(RETIRE_SHEET_)) setupRetirePlan();
  var r = ss.getSheetByName(RETIRE_SHEET_);
  var num = function (v, label, min, max) {
    var n = Number(v);
    if (!(n >= min && n <= max)) throw new Error(label + " 格式不正確");
    return n;
  };
  var y = new Date().getFullYear();
  var birth = num(p.birth, "出生年", 1900, y);
  var start = num(p.start, "規劃起點年齡", 0, 120);
  var retireAge = num(p.retireAge, "預計退休年齡", 1, 120);
  if (retireAge < y - birth && retireAge < start) throw new Error("預計退休年齡比目前年齡還小");
  r.getRange("B1").setValue(birth);
  r.getRange("B3").setValue(start);
  r.getRange("B4").setValue(retireAge);
  r.getRange("B5").setValue(num(p.need, "退休後每月生活費", 0, 1e8));
  r.getRange("B6").setValue(num(p.pension || 0, "每月退休金", 0, 1e8));
  r.getRange("B7").setValue(num(p.inflation, "通膨率", 0, 0.2));
  r.getRange("B8").setValue(num(p.ret, "預期年報酬率", 0, 0.3));
  r.getRange("B9").setValue(num(p.wr, "每年可提領率", 0.005, 0.2));
  r.getRange("B10").setValue(num(p.pmt || 0, "每月可投入金額", 0, 1e8));
  try { SpreadsheetApp.flush(); plan2Apply_(false); } catch (p2e) { Logger.log(p2e); } // 退休年齡改了，兩套組合的進度跟著變
  return { message: "退休規劃已儲存", detail: "", dashboard: waGetDashboard() };
}

// 首頁退休卡片直接改：只改「退休後每月預算」和「每月投入」，其他設定不動
function waSaveRetireQuick(p) {
  var ss = SS_();
  if (!ss.getSheetByName(RETIRE_SHEET_)) throw new Error("還沒設定退休規劃，請先到 設定 → 退休規劃 填出生年");
  var r = ss.getSheetByName(RETIRE_SHEET_);
  var need = Number(String(p.need).replace(/,/g, ""));
  if (!(need > 0 && need <= 1e8)) throw new Error("每月預算請填大於 0 的數字");
  r.getRange("B5").setValue(need);
  // 首頁填的是「退休那年每個月要多少」：記下填法，之後不再乘通膨
  if (p.mode === "future") { r.getRange("A11:C11").setValues([["生活費填法", "退休那年", "B5 填的是退休那年的錢（空白＝今天的錢，會自動加通膨）"]]); r.getRange("A11").setFontWeight("bold"); }
  else if (p.mode === "today") r.getRange("B11").clearContent();
  if (p.pmtAuto === true) { r.getRange("A12:C12").setValues([["每月投入算法", "自動", "自動＝用最近 6 個月收支紀錄（收入−支出）估；手動＝用 B10"]]); r.getRange("A12").setFontWeight("bold"); }
  else if (p.pmtAuto === false) { r.getRange("A12:C12").setValues([["每月投入算法", "手動", "自動＝用最近 6 個月收支紀錄（收入−支出）估；手動＝用 B10"]]); r.getRange("A12").setFontWeight("bold"); }
  if (p.pmtAuto !== true && p.pmt !== undefined && p.pmt !== null && String(p.pmt).trim() !== "") {
    var pmt = Number(String(p.pmt).replace(/,/g, ""));
    if (!(pmt >= 0 && pmt <= 1e8)) throw new Error("每月投入請填 0 以上的數字");
    r.getRange("B10").setValue(pmt);
  }
  return { message: "已更新退休預算", detail: "", dashboard: waGetDashboard() };
}

// ---------- 帳戶管理 ----------
// p: { old（原名稱，新增時留空）, name, active, scope, role, stock }
function waSaveAccount(p) {
  if (typeof healthDrop_ === "function") healthDrop_("acc");
  var ss = SS_();
  var name = waCheckAccountName_(p.name);
  var old = String(p.old || "").trim();
  var role = String(p.role || "混用");
  if (WA_ROLES_.indexOf(role) < 0) role = "混用";
  var scope = role === "生意" ? "生意" : "個人";
  var sh = waAccountSheet_(ss);
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var last = sh.getLastRow();
    var names = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
    if (name !== old && names.indexOf(name) >= 0) throw new Error("已經有「" + name + "」了");
    var row;
    if (old) {
      var i = names.indexOf(old);
      if (i < 0) throw new Error("找不到帳戶 " + old);
      row = i + 2;
    } else {
      row = Math.max(last, 1) + 1;
    }
    if (p.stock) {
      for (var j = 0; j < names.length; j++) if (j + 2 !== row && String(sh.getRange(j + 2, 4).getValue()).indexOf("交割") >= 0) sh.getRange(j + 2, 4).setValue("");
    }
    sh.getRange(row, 1, 1, 5).setValues([[name, p.active === false ? "未使用" : "使用中", scope, p.stock ? "股票交割" : "", role]]);
    if (old && old !== name) waRenameAccountEverywhere_(ss, old, name);
  } finally {
    lock.releaseLock();
  }
  return { message: (old ? "已更新 " : "已新增 ") + name, detail: old && old !== name ? "以前的金流紀錄也一起改名了" : "", dashboard: waGetDashboard() };
}

// 帳戶改名時，把帳戶流水、外幣、生意紀錄裡的舊名稱一起換掉，餘額才不會跑掉
function waRenameAccountEverywhere_(ss, oldName, newName) {
  var fix = function (sheetName, cols, prefix) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return;
    cols.forEach(function (c) {
      var rg = sh.getRange(2, c, sh.getLastRow() - 1, 1);
      var v = rg.getValues(), changed = false;
      v.forEach(function (r) {
        var s = String(r[0]);
        if (s === oldName) { r[0] = newName; changed = true; }
        else if (prefix && s.indexOf("外幣:" + oldName + " ") === 0) { r[0] = s.replace("外幣:" + oldName + " ", "外幣:" + newName + " "); changed = true; }
      });
      if (changed) rg.setValues(v);
    });
  };
  fix(WA_FLOW_SHEET_, [3, 4], true);
  fix("外幣帳戶", [1]);
  fix("外幣流水", [2]);
  fix("營收", [7]);
  fix("進貨", [7]);
  fix("費用", [4]);
}

// ---------- 新手引導 ----------
function waOnboardDone(p) {
  if (p && p.reset) PROPS_().deleteProperty("ONBOARD_DONE");
  else PROPS_().setProperty("ONBOARD_DONE", "1");
  return { message: p && p.reset ? "已重新顯示新手設定" : "新手設定完成 🎉", detail: "", dashboard: waGetDashboard() };
}

// ---------- 搬到中央 App ----------
// 舊的試算表（自己的 Apps Script）裡的設定存在「指令碼屬性」，中央 App 讀不到，
// 所以先抄到隱藏分頁「_搬家」，中央 App 接上這份試算表時會自動讀回來（密碼鎖要重設）
var WA_MOVE_SHEET_ = "_搬家";
var WA_MOVE_KEYS_ = ["CODE_NAMES", "APP_SETTINGS", "ONBOARD_DONE", "STAGED_ENTRY_PLAN", "INCOME_CATEGORIES", "EXPENSE_CATEGORIES"];
function waMoveExport() {
  var props = PROPS_();
  var ss = SS_();
  var sh = ss.getSheetByName(WA_MOVE_SHEET_) || ss.insertSheet(WA_MOVE_SHEET_);
  sh.clear();
  var rows = [["設定", "值（搬到中央 App 用，不用改）"]];
  WA_MOVE_KEYS_.forEach(function (k) { var v = props.getProperty(k); if (v != null) rows.push([k, v]); });
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  try { sh.hideSheet(); } catch (e) {}
  return { message: "設定已準備好搬家", detail: "照說明到中央 App 接上這份試算表", url: ss.getUrl(), dashboard: waGetDashboard() };
}
function waMoveImport_() {
  var sh = SS_().getSheetByName(WA_MOVE_SHEET_);
  if (!sh || sh.getLastRow() < 2) return 0;
  var props = PROPS_(), n = 0;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var k = String(r[0]).trim();
    // 已經在新 App 設過的（例如外觀）不要被舊設定蓋掉
    if (WA_MOVE_KEYS_.indexOf(k) >= 0 && String(r[1]) !== "" && props.getProperty(k) == null) { props.setProperty(k, String(r[1])); n++; }
  });
  // 只搬一次：讀完就刪掉，之後再改接同一份試算表也不會重覆套用舊設定
  try { SS_().deleteSheet(sh); } catch (e) { Logger.log(e); }
  return n;
}

// 試寄一次通知：看日曆和 Gmail 有沒有收到
function waTestNotify() {
  var mode = String(CFG("通知方式") || "兩個都要").trim();
  var cal = mode !== "Gmail" ? CAL_NOTIFY_("測試通知", "這是資產配置 App 的測試通知。看到這個活動，代表日曆通知可以用了。") : null;
  var mail = false;
  if (mode !== "日曆" || cal === false) { var to = NOTIFY_EMAIL_(); if (to) { MailApp.sendEmail(to, "資產配置：測試通知", "這是測試通知。收到這封信，代表 Gmail 通知可以用了。"); mail = true; } }
  return { message: "已送出測試通知", detail: (cal === true ? "日曆：3 分鐘後有一個「💰 測試通知」活動。" : cal === false ? "日曆：加不進去（重新打開 App、同意存取日曆後再試）。" : "") +
    (mail ? "Gmail：已寄到 " + NOTIFY_EMAIL_() + "。" : ""), dashboard: waGetDashboard() };
}

// ---------- 建議組合：7 種（回測評級最好的，一鍵套用，套用後可以再改）----------
// 跟 App.html 的 RATE_PRESETS 一樣。股票＝0050：00646：00662＝2：2：1；債券用美債（美元計價，會跟著匯率漲跌）；黃金 00635U
var WA_PRESETS_ = {   // 每一組至少留 5% 現金；黃金用黃金存摺（gold，不放股票欄位）；台股大盤用 006208（跟 0050 一樣，費用低、長期每年多約 0.2%）
  "保本": { cash: 0.10, gold: 0.15, rows: [["TPE:006208", 0.04], ["TPE:00646", 0.04], ["TPE:00662", 0.02], ["TPE:00719B", 0.45], ["TPE:00697B", 0.20]] },
  "保守": { cash: 0.05, gold: 0.20, rows: [["TPE:006208", 0.10], ["TPE:00646", 0.10], ["TPE:00662", 0.05], ["TPE:00697B", 0.25], ["TPE:00719B", 0.25]] },
  "穩守": { cash: 0.05, gold: 0.25, rows: [["TPE:006208", 0.16], ["TPE:00646", 0.16], ["TPE:00662", 0.08], ["TPE:00697B", 0.30]] },
  "穩健": { cash: 0.05, gold: 0.20, rows: [["TPE:006208", 0.20], ["TPE:00646", 0.20], ["TPE:00662", 0.10], ["TPE:00697B", 0.15], ["TPE:00679B", 0.10]] },
  "成長": { cash: 0.05, gold: 0.20, rows: [["TPE:006208", 0.24], ["TPE:00646", 0.24], ["TPE:00662", 0.12], ["TPE:00697B", 0.10], ["TPE:00679B", 0.05]] },
  "積極": { cash: 0.05, gold: 0.15, rows: [["TPE:006208", 0.30], ["TPE:00646", 0.30], ["TPE:00662", 0.15], ["TPE:00679B", 0.05]] },
  "全攻": { cash: 0.05, gold: 0, rows: [["TPE:006208", 0.38], ["TPE:00646", 0.38], ["TPE:00662", 0.19]] }
};
// 一次多加 n 個欄位（7 種建議配置最多要 6 檔，原本核心只有 4 格）
function waAddSlots(p) {
  var n = Math.max(1, Math.min(10, Math.floor(Number(p && p.n) || 1))), r = null;
  var prev = WA_DEFER_; WA_DEFER_ = true;
  try { for (var i = 0; i < n; i++) r = waAddSlot({ group: p && p.group === "pick" ? "pick" : "core" }); } finally { WA_DEFER_ = prev; }
  return { message: "已多 " + n + " 個" + (p && p.group === "pick" ? "自選股" : "核心 ETF") + "欄位", detail: "填上代號和比例就能用", dashboard: waGetDashboard() };
}
// 套用一組（伺服器端，新建立的試算表用）：核心換成這組，其他核心、自選股的比例歸 0（代號保留），改成固定比例；核心格子不夠就自動加
function waApplyPreset_(name) {
  var P = WA_PRESETS_[name];
  if (!P) throw new Error("沒有這組");
  return waApplyMix_(P.rows, [], P.cash, P.gold || 0);
}
// 從 App「我的配置」儲存一組：want／pick 是 { 代號: %(0～100) }，cash 是 %
function waApplyMix(p) {
  var conv = function (o) { return Object.keys(o || {}).map(function (k) { var c = normalizeStockCode_(k); if (!c) throw new Error("看不懂代號「" + k + "」"); return [c, Number(o[k]) / 100]; }).filter(function (x) { return x[1] > 0; }); };
  var core = conv(p && p.want), pick = conv(p && p.pick), cash = Number(p && p.cash) / 100, gold = Number(p && p.gold || 0) / 100;
  if (!(gold >= 0 && gold < 1)) throw new Error("黃金比例不正確");
  var t = cash + gold; core.concat(pick).forEach(function (x) { t += x[1]; });
  if (Math.abs(t - 1) > 0.006) throw new Error("比例加起來要 100%（現在 " + Math.round(t * 1000) / 10 + "%）");
  return waApplyMix_(core, pick, cash, gold);
}
// 核心（ETF）放核心欄位、pick（個股等短線型）放自選股欄位；欄位不夠自動多加；不在這組裡的其他代號比例歸 0（有持股的代號保留），改成固定比例
// gold：黃金存摺的目標比例（佔「股票＋現金＋黃金」）。股票欄位和現金換算成「不含黃金」的比例存進試算表（加起來還是 100%），黃金比例另外記
function waApplyMix_(coreRows, pickRows, cash, gold) {
  gold = Number(gold) || 0;
  if (gold > 0) { var sc = 1 / (1 - gold); coreRows = coreRows.map(function (x) { return [x[0], x[1] * sc]; }); pickRows = pickRows.map(function (x) { return [x[0], x[1] * sc]; }); cash = cash * sc; }
  cfgSet_("黃金目標比例", gold); clearConfigCache();
  var sh = SS_().getSheetByName("工作表1"), L = LAY();
  var want = {}; coreRows.concat(pickRows).forEach(function (x) { want[x[0]] = (want[x[0]] || 0) + x[1]; });
  var isPick = {}; pickRows.forEach(function (x) { isPick[x[0]] = true; });
  var plan = function () {
    var cur = sh.getRange(2, 1, L.n, 2).getValues(), have = {}, free = { core: [], pick: [] };
    cur.forEach(function (r, i) {
      var code = String(r[0]).trim(), grp = i < L.core ? "core" : "pick";
      if (code && want.hasOwnProperty(code) && !have[code]) { have[code] = i + 2; return; }
      if (!(waNum_(r[1]) > 0) && (!code || !want.hasOwnProperty(code))) free[grp].push(i + 2);
    });
    var need = { core: [], pick: [] };
    Object.keys(want).forEach(function (c) { if (!have[c]) need[isPick[c] ? "pick" : "core"].push(c); });
    return { cur: cur, have: have, free: free, need: need };
  };
  var P = plan(), add = { core: Math.max(0, P.need.core.length - P.free.core.length), pick: Math.max(0, P.need.pick.length - P.free.pick.length) };
  if (add.core || add.pick) {
    if (L.n + add.core + add.pick > 30) throw new Error("欄位最多 30 檔，這組放不下");
    var prevD = WA_DEFER_; WA_DEFER_ = true;
    try { ["core", "pick"].forEach(function (g) { for (var k = 0; k < add[g]; k++) waAddSlot({ group: g }); }); } finally { WA_DEFER_ = prevD; }
    LAY_ = null; L = LAY(); P = plan();
  }
  var assign = {};
  ["core", "pick"].forEach(function (g) { P.need[g].forEach(function (c, k) { assign[P.free[g][k]] = c; }); });
  var rows = [];
  for (var i = 0; i < L.n; i++) {
    var row = i + 2, code = String(P.cur[i][0]).trim();
    if (assign[row]) { rows.push({ row: row, code: assign[row], target: want[assign[row]], name: WA_NAMES_[assign[row]] || "" }); continue; }
    if (code && P.have[code] === row) { rows.push({ row: row, code: code, target: want[code], name: WA_NAMES_[code] || "" }); continue; }
    rows.push({ row: row, code: (code && !want.hasOwnProperty(code)) || waNum_(P.cur[i][1]) > 0 ? code : "", target: 0, name: "" });
  }
  var r = waSaveTargets({ rows: rows, cash: cash, glide: false, mode: "fixed" });
  if (add.core || add.pick) r.detail = "自動多加了 " + (add.core + add.pick) + " 個欄位。" + (r.detail || "");
  if (gold > 0) r.detail = (r.detail || "") + "黃金存摺目標 " + Math.round(gold * 1000) / 10 + "%，到「資產」頁的黃金看建議買幾公克。";
  try { priceBackupRefresh_(true); } catch (e) { Logger.log(e); }
  return r;
}


// ==================== Fee.gs ====================
// ============================================================
// 手續費折讓：無（C21 直接填折扣後費率）／日退／月退
// 折數可以分「門檻以下 / 超過門檻」兩段，另外可以設一段「新戶活動」（到期後回到一般折數）
// 月退：每月 15 號結算上個月（monthlyFeeRebate）
// 日退：每天下午收盤價記錄時，順便把前一天以前的交易退款（不用另外的排程）
// ============================================================

function feeCfgNum_(k, d) { var v = CFG(k); return v === "" || v === null || v === undefined || isNaN(Number(v)) ? d : Number(v); }
function feeCfgDate_(k) {
  var v = CFG(k);
  if (v instanceof Date) return v;
  var s = String(v || "").trim().replace(/^'/, "");
  if (!s) return null;
  var d = new Date(s.replace(/\//g, "-") + "T23:59:59+08:00");
  return isNaN(d.getTime()) ? null : d;
}

// 目前的折讓規則（舊設定「手續費每月回補＝是」自動對應成月退＋永豐規則）
function feeRule_() {
  var mode = String(CFG("手續費折讓方式") || "無").trim();
  if (mode === "無" && String(CFG("手續費每月回補")).trim() === "是") mode = "月退";
  var k1 = feeCfgNum_("一般折數", null);
  var r = {
    mode: mode,
    k1: k1, T: feeCfgNum_("一般門檻（月成交額）", 0), k2: feeCfgNum_("一般超過門檻折數", null),
    promo: String(CFG("新戶活動")).trim() === "是", end: feeCfgDate_("活動到期日"),
    Ta: feeCfgNum_("活動門檻（月成交額）", 0), ka1: feeCfgNum_("活動門檻內折數", null), ka2: feeCfgNum_("活動超過門檻折數", null),
    dailyStart: feeCfgDate_("日退開始日")
  };
  if (mode !== "無" && r.k1 === null) {
    var oldK = feeCfgNum_("手續費折數", null);
    if (oldK > 0 && oldK < 1) { r.k1 = oldK; r.k2 = oldK; r.promo = false; }
    else { // 舊版預設：永豐（活動到 2026/12/31：100 萬內 2 折、超過 2.8 折；之後 2.8 折）
      r.k1 = 0.28; r.k2 = 0.28; r.T = 0;
      r.promo = true; r.end = new Date("2026-12-31T23:59:59+08:00"); r.Ta = 1000000; r.ka1 = 0.2; r.ka2 = 0.28;
    }
  }
  if (r.k2 === null) r.k2 = r.k1;
  if (r.ka2 === null) r.ka2 = r.ka1;
  return r;
}

function feeFullRate_() {
  try { return waNum_(SS_().getSheetByName("工作表1").getRange(A1_("C21")).getValue()) || 0.001425; } catch (e) { return 0.001425; }
}

// 某個月內，從累積成交額 before 開始再成交 gross，「折扣後應該收」多少手續費
function feeShouldPay_(before, gross, when, rule) {
  rule = rule || feeRule_();
  var rate = feeFullRate_();
  var inPromo = rule.promo && rule.end && when <= rule.end && rule.ka1 !== null;
  var T = inPromo ? rule.Ta : rule.T, lo = inPromo ? rule.ka1 : rule.k1, hi = inPromo ? rule.ka2 : rule.k2;
  if (lo === null) return gross * rate; // 沒有折扣
  if (!(T > 0)) return gross * rate * lo;
  var under = Math.max(0, Math.min(gross, T - before));
  var over = gross - under;
  return gross > 0 ? (under * rate * lo + over * rate * hi) : 0;
}

// ---------- 日退 ----------
// 交易紀錄 K 欄：已退款的會寫「已退 日期」
function processDailyRebate_() {
  var rule = feeRule_();
  if (rule.mode !== "日退") return 0;
  var ss = SS_();
  var log = ss.getSheetByName("交易紀錄");
  var sheet = ss.getSheetByName("工作表1");
  if (!log || log.getLastRow() < 2) return 0;
  var today = new Date(Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd") + "T00:00:00+08:00");
  var start = rule.dailyStart ? new Date(rule.dailyStart.getTime() - 86399000) : today; // 開始日當天 00:00
  var data = log.getRange(2, 1, log.getLastRow() - 1, 11).getValues();
  var monthVol = {}, total = 0, marks = [];
  data.forEach(function (r, i) {
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(d.getTime())) return;
    var mk = d.getFullYear() + "-" + d.getMonth();
    var gross = Math.abs(waNum_(r[4])), fee = waNum_(r[5]);
    var before = monthVol[mk] || 0;
    monthVol[mk] = before + gross;
    if (String(r[10]).indexOf("已退") === 0) return;
    if (d < start || d >= today) return; // 開始日以前的不退；今天的明天再退
    var rebate = Math.max(0, Math.floor(fee - Math.max(1, feeShouldPay_(before, gross, d, rule)) + 1e-9)); // 券商逐筆算，元以下捨去
    total += rebate;
    marks.push(i + 2);
  });
  if (!marks.length) return 0;
  var stamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd");
  marks.forEach(function (row) { log.getRange(row, 11).setValue("已退 " + stamp); });
  if (total > 0) {
    sheet.getRange(R_(10), 4).setValue(waNum_(sheet.getRange(R_(10), 4).getValue()) + total);
    var ledger = ss.getSheetByName("收支紀錄");
    if (ledger) ledger.appendRow([new Date(), "收入", "手續費回補", total, "手續費日退（" + marks.length + " 筆交易）", "是"]);
    try { waLogFlow_(ss, "收入", "收入:手續費回補", waStockAccount_(ss) || WA_STOCK_ACCOUNT_, total, "手續費日退"); } catch (e) { Logger.log(e); }
    try { SEND_MAIL_(NOTIFY_EMAIL_(), "手續費日退 " + total + " 元", "已退回 " + marks.length + " 筆交易的手續費折讓，共 " + total + " 元，已加回投資現金。"); } catch (e) {}
  }
  return total;
}

// 日退：還沒退的預估金額（給 B12 顯示）
function pendingDailyRebate_() {
  var rule = feeRule_();
  var log = SS_().getSheetByName("交易紀錄");
  if (!log || log.getLastRow() < 2) return 0;
  var start = rule.dailyStart ? new Date(rule.dailyStart.getTime() - 86399000) : new Date();
  var data = log.getRange(2, 1, log.getLastRow() - 1, 11).getValues();
  var monthVol = {}, total = 0;
  data.forEach(function (r) {
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(d.getTime())) return;
    var mk = d.getFullYear() + "-" + d.getMonth();
    var gross = Math.abs(waNum_(r[4])), before = monthVol[mk] || 0;
    monthVol[mk] = before + gross;
    if (String(r[10]).indexOf("已退") === 0 || d < start) return;
    total += Math.max(0, Math.round(waNum_(r[5]) - Math.max(1, Math.round(feeShouldPay_(before, gross, d, rule)))));
  });
  return total;
}

// ---------- App 設定頁 ----------
function waGetFeeData() {
  var sh = SS_().getSheetByName("工作表1");
  var c = sh.getRange(A1_("C21:C23")).getValues();
  var r = feeRule_();
  var fmt = function (d) { return d ? Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd") : ""; };
  return { rate: waNum_(c[0][0]), tax: waNum_(c[1][0]), min: waNum_(c[2][0]), mode: r.mode, k1: r.k1, T: r.T, k2: r.k2,
    promo: r.promo, end: fmt(r.end), Ta: r.Ta, ka1: r.ka1, ka2: r.ka2,
    plan: { amt: CFG("每次買進金額"), buys: CFG("一年買幾次"), hold: CFG("打算放幾年") },
    broker: String(CFG("證券商") || ""), oddMin: CFG("零股最低手續費") === "" || CFG("零股最低手續費") == null ? "" : Number(CFG("零股最低手續費")), k0: CFG("當下折數") === "" || CFG("當下折數") == null ? "" : Number(CFG("當下折數")) };
}

function cfgSet_(key, value) {
  var sh = cfgSheet_(true);
  var last = sh.getLastRow();
  var keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (x) { return String(x[0]).trim(); }) : [];
  var i = keys.indexOf(key);
  var def = CFG_DEFAULTS_.filter(function (d) { return d[0] === key; })[0];
  if (i >= 0) sh.getRange(i + 2, 2).setValue(value);
  else sh.appendRow([key, value, def ? def[2] : ""]);
}

function waSaveFee(p) {
  var mode = String(p.mode || "無");
  if (["無", "日退", "月退"].indexOf(mode) < 0) throw new Error("請選擇折讓方式");
  var rate = Number(p.rate), tax = Number(p.tax), min = Number(p.min);
  if (!(rate > 0 && rate < 0.01)) throw new Error("手續費率格式不正確（例如 0.1425% ）");
  if (!(tax >= 0 && tax < 0.01)) throw new Error("證交稅率格式不正確");
  if (!(min >= 0 && min <= 100)) throw new Error("最低手續費格式不正確");
  var k = function (v, label, need) {
    if (v === "" || v === null || v === undefined) { if (need) throw new Error("請填" + label); return ""; }
    var n = Number(v); if (!(n > 0 && n <= 1)) throw new Error(label + "要在 0～1 之間（例如 2.8 折填 0.28）"); return n;
  };
  var amt = function (v) { var n = Number(v || 0); if (!(n >= 0)) throw new Error("門檻金額格式不正確"); return n; };
  var sh = SS_().getSheetByName("工作表1");
  sh.getRange(A1_("C21")).setValue(rate);
  sh.getRange(A1_("C22")).setValue(tax);
  sh.getRange(A1_("C23")).setValue(min);
  var oldMode = feeRule_().mode;
  cfgSet_("手續費折讓方式", mode);
  cfgSet_("手續費每月回補", mode === "月退" ? "是" : "否");
  if (mode !== "無") {
    cfgSet_("一般折數", k(p.k1, "一般折數", true));
    cfgSet_("一般門檻（月成交額）", amt(p.T));
    cfgSet_("一般超過門檻折數", k(p.k2, "超過門檻折數", false));
    cfgSet_("新戶活動", p.promo ? "是" : "否");
    if (p.promo) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.end || ""))) throw new Error("請選活動到期日");
      cfgSet_("活動到期日", "'" + p.end);
      cfgSet_("活動門檻（月成交額）", amt(p.Ta));
      cfgSet_("活動門檻內折數", k(p.ka1, "活動折數", true));
      cfgSet_("活動超過門檻折數", k(p.ka2, "活動超過門檻折數", false));
    }
  }
  if (p.broker !== undefined) cfgSet_("證券商", String(p.broker || "").slice(0, 30));
  if (p.oddMin !== undefined && p.oddMin !== "") { var om = Number(p.oddMin); if (!(om >= 0 && om <= 100)) throw new Error("零股最低手續費格式不正確"); cfgSet_("零股最低手續費", om); }
  if (p.k0 !== undefined) cfgSet_("當下折數", p.k0 === "" ? "" : k(p.k0, "折數", false));
  if (p.plan) { var pl = p.plan, nn = function (v, l, lo, hi) { var n = Number(v); if (v === "" || !(n >= lo && n <= hi)) throw new Error("請填" + l); return n; };
    cfgSet_("每次買進金額", nn(pl.amt, "每次大概買多少", 1, 1e9)); cfgSet_("一年買幾次", nn(pl.buys, "一年買幾次", 0.1, 365)); cfgSet_("打算放幾年", nn(pl.hold, "打算放幾年", 1, 80)); }
  // 改成日退時，從今天開始算，以前的交易不會重複退
  if (mode === "日退" && oldMode !== "日退") cfgSet_("日退開始日", "'" + Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd"));
  clearConfigCache();
  var note = "";
  if (mode !== oldMode && (mode === "月退" || oldMode === "月退")) {
    if (typeof hubInstallTriggers_ === "function") { try { hubInstallTriggers_(); } catch (e) { Logger.log(e); } note = "自動排程已更新"; }
    else note = "折讓方式改了，請到試算表選單按一次「⚙️ 一鍵安裝」更新排程";
  }
  return { message: "手續費設定已儲存", detail: note, dashboard: waGetDashboard() };
}


// ---------- 美股（複委託）：只用在配置評級的成本比較（App 目前不幫美股下單）----------
// 費率是個人化的（要跟營業員確認），沒有預設值
function waSaveBrokerUS(p) {
  var method = String(p && p.method || "");
  if (["複委託", "海外券商", "沒有"].indexOf(method) < 0) throw new Error("請選怎麼買美股");
  var need = function (v, label, lo, hi) { if (v === "" || v === null || v === undefined) throw new Error("請填" + label); var n = Number(v); if (!(n >= lo && n <= hi)) throw new Error(label + "的數字不對"); return n; };
  if (method !== "沒有") {
    if (!String(p.name || "").trim()) throw new Error("請選券商");
    cfgSet_("美股券商", String(p.name).trim().slice(0, 30));
    cfgSet_("美股費率", need(p.rate, "手續費率", 0, 5));
    cfgSet_("美股每股費", p.perShare === "" || p.perShare == null ? 0 : need(p.perShare, "每股手續費", 0, 1));
    cfgSet_("美股最低手續費", need(p.min, "最低手續費", 0, 100));
    cfgSet_("換匯價差", need(p.fx, "換匯價差", 0, 2));
    cfgSet_("美股每次買進金額", need(p.amt, "每次大概買多少（美元）", 1, 1e8));
    cfgSet_("美股一年買幾次", need(p.buys, "一年買幾次", 0.1, 365));
    if (method === "海外券商") { cfgSet_("匯款手續費", need(p.remitFee, "每次匯款手續費", 0, 1e5)); cfgSet_("一年匯款次數", need(p.remitN, "一年匯幾次", 0.1, 365)); }
  }
  if (p.hold !== undefined && p.hold !== "") cfgSet_("打算放幾年", need(p.hold, "打算放幾年", 1, 80));
  cfgSet_("美股方式", method); cfgSet_("有複委託", method === "沒有" ? "否" : "是");
  clearConfigCache();
  return { message: method === "沒有" ? "已設定成不用美股帳戶" : "美股（" + method + "）設定已儲存", detail: "", dashboard: waGetDashboard() };
}
// 台股的買法（算實際手續費用）：每次買多少、一年買幾次、打算放幾年
function waSaveBuyPlan(p) {
  var need = function (v, label, lo, hi) { if (v === "" || v === null || v === undefined) throw new Error("請填" + label); var n = Number(v); if (!(n >= lo && n <= hi)) throw new Error(label + "的數字不對"); return n; };
  cfgSet_("每次買進金額", need(p.amt, "每次大概買多少", 1, 1e9));
  cfgSet_("一年買幾次", need(p.buys, "一年買幾次", 0.1, 365));
  cfgSet_("打算放幾年", need(p.hold, "打算放幾年", 1, 80));
  clearConfigCache();
  return { message: "買法已儲存", detail: "手續費會照你的買法算實際比例", dashboard: waGetDashboard() };
}
function brokerInfo_() {
  var num = function (k) { var v = CFG(k); return v === "" || v == null || isNaN(Number(v)) ? null : Number(v); };
  var method = String(CFG("美股方式") || (String(CFG("有複委託")) === "是" ? "複委託" : String(CFG("有複委託")) === "否" ? "沒有" : ""));
  var r = feeRule_(), c = null;
  try { c = SS_().getSheetByName("工作表1").getRange(A1_("C21:C23")).getValues(); } catch (e) {}
  var hold = num("打算放幾年");
  return {
    tw: String(CFG("證券商") || ""),
    twFee: { rate: c ? waNum_(c[0][0]) : 0.001425, min: c ? waNum_(c[2][0]) : 20, mode: r.mode, k: r.mode === "無" ? (num("當下折數") || null) : r.k1, amt: num("每次買進金額"), buys: num("一年買幾次"), hold: hold },
    us: method === "複委託" || method === "海外券商" ? { method: method, name: String(CFG("美股券商") || CFG("複委託券商") || ""), rate: num("美股費率") != null ? num("美股費率") : num("複委託費率"),
      perShare: num("美股每股費") || 0, min: num("美股最低手續費") != null ? num("美股最低手續費") : num("複委託最低手續費"), fx: num("換匯價差"), amt: num("美股每次買進金額"), buys: num("美股一年買幾次"),
      remitFee: num("匯款手續費"), remitN: num("一年匯款次數"), hold: hold } : null,
    usAsked: method !== "", usMethod: method, goldTarget: num("黃金目標比例") || 0 };
}


// ==================== WebApp.gs ====================
// ============================================================
// 手機網頁 App（資產配置）
// 直接讀寫現有的試算表，買賣、記帳沿用原本表單的處理程式，
// 所以計算邏輯跟用 Google 表單送出完全一樣。
// 部署：部署 → 新增部署作業 → 網頁應用程式
//       執行身分：我 / 誰可以存取：只有我自己
// ============================================================

var WA_TZ_ = "Asia/Taipei";
var WA_PRICE_TITLE_ = "成交價（選填，留空則用當下即時股價）";
var WA_ONETIME_TITLE_ = "是否為一次性大額支出（不列入可花費額度比較）";

var WA_NAMES_ = {
  "TPE:006208": "富邦台50",
  "TPE:00646": "元大S&P500",
  "TPE:00935": "野村臺灣新科技50",
  "TPE:00635U": "元大S&P黃金",
  "TPE:0050": "元大台灣50",
  "TPE:2884": "玉山金",
  "TPE:2548": "華固",
  "TPE:2454": "聯發科",
  "TPE:2330": "台積電",
  "TPE:00878": "國泰永續高股息",
  "TPE:00679B": "元大美債20年",
  "TPE:00719B": "元大美債1-3"
};

function doGet(e) {
  // 中央 App 模式：還沒受邀請、還沒有自己的試算表時，先顯示歡迎／邀請頁
  //（跟 Hub.gs 的 hubDoGet_ 同樣的檢查，但只查一次、而且不開試算表，網頁才出得快）
  if (!ENV_ && typeof hubDoGet_ === "function") {
    var hEmail = hubEmail_();
    if (!hubAllowed_(hEmail)) { admVisit_(hEmail, "沒受邀（被擋在門外）"); return hubPage2_("notInvited", hEmail); }
    // 按了圖解裡的「重新允許權限」：把這個人對 App 的授權整個清掉（跟到 Google 帳戶刪連結一樣，資料不會動），
    // 再重新打開 App，Google 就會像第一次一樣完整問一次權限（網頁 App 沒辦法只補問沒勾的那幾項）
    if (e && e.parameter && e.parameter.reauth) {
      admVisit_(hEmail, "按了「重新允許權限」");
      try { ScriptApp.invalidateAuth(); } catch (raE) { Logger.log("重設授權：" + raE); }
      return hubPage2_("reauth", hEmail);
    }
    // Google 問權限時有幾項沒打勾：先顯示圖解，按一下重新允許（不然後面一直出現看不懂的英文錯誤）
    var hAuth = hubAuthUrl_();
    if (hAuth && !(e && e.parameter && e.parameter.skipauth)) { admVisit_(hEmail, "權限沒勾全選（看到圖解）"); return hubPage2_("auth", hEmail, { url: hAuth }); }
    HUB_OK_EMAIL_ = hEmail;
    var hEnv = envHubLazy_(true);
    if (!hEnv) { admVisit_(hEmail, "歡迎頁（還沒有試算表）"); return hubPage2_("welcome", hEmail); }
    admVisit_(hEmail, "正常進入 App");
    if (!hAuth) { try { hubFinishPending_(); } catch (pe) { Logger.log(pe); } }
    ENV_ = hEnv; CFG_ = null; LAY_ = null; // 這一步只是送出網頁，用不到「系統設定」，不讀（讀了就得開試算表）
    // 後台開了維護模式：管理員以外的人先看到維護中
    try { var ann0 = admAnn_(); if (ann0 && ann0.maint && !hubIsAdmin_(hEmail)) return admMaintPage_(ann0); } catch (annErr) { Logger.log(annErr); }
  }
  var t = HtmlService.createTemplateFromFile("App");
  var cached = waDashGet_() || waDashDurableGet_();
  t.cached = (cached || "null").replace(/</g, "\\u003c"); // 上次的畫面資料，先顯示，背景再更新
  var st = waSettings_();
  if (st.pinOn) t.cached = "null"; // 有密碼鎖時，解鎖前不把資料放進網頁
  // 背景圖片：快取裡有就直接放進網頁；沒有就先不放，網頁出來之後再去拿（不讓它拖慢開啟）
  var bg = waChunkGet_("wa_bg");
  if (bg === null) { st.bgLazy = true; bg = ""; } else if (bg === "-") bg = "";
  t.settings = JSON.stringify(st).replace(/</g, "\\u003c");
  // 這一頁是哪一版、正式網址是什麼：App 裡的「更新」按鈕用（新版上線後不用滑掉重開）
  t.ver = String(LIB_VERSION_).replace(/[^0-9A-Za-z.\-]/g, "");
  var appUrl_ = "";
  // 只有中央 App 才拿得到自己的正式網址（副本＋程式庫的模式拿到的會是程式庫的，不能用）
  try { if (typeof hubDoGet_ === "function") appUrl_ = String(ScriptApp.getService().getUrl() || ""); } catch (urlErr) { Logger.log(urlErr); }
  t.appUrl = /^https:\/\/script\.google\.com\/[A-Za-z0-9_\-\/.]+$/.test(appUrl_) ? appUrl_ : "";
  var meEmail_ = ""; // 中央 App：設定裡「換 Google 帳號」顯示現在是哪個帳號
  try { if (typeof hubDoGet_ === "function") meEmail_ = String(hubEmail_() || ""); } catch (meErr) { Logger.log(meErr); }
  t.email = meEmail_.replace(/[^A-Za-z0-9@._+\-]/g, "");
  t.bg = JSON.stringify(bg);
  return t.evaluate()
    .setTitle(st.name)
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover")
    .addMetaTag("apple-mobile-web-app-capable", "yes")
    // 允許安裝頁把 App 放在全螢幕的框裡（Android 才能沒有網址列）。App 自己會檢查是誰在框它，不認識的網站一律不顯示。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- App 外觀設定：名稱、主題顏色、背景圖片 ----------
// 名稱、顏色存在指令碼屬性；背景圖片（壓縮過的 JPEG）分段存在隱藏的「App設定」分頁
var WA_SET_PROP_ = "APP_SETTINGS";
var WA_BG_SHEET_ = "App設定";
function waSettings_() {
  var d = { name: "資產配置", color: "#1f5a3f", dim: 0.35 };
  try {
    var o = JSON.parse(PROPS_().getProperty(WA_SET_PROP_) || "{}");
    if (o.name) d.name = String(o.name).slice(0, 20);
    if (/^#[0-9a-fA-F]{6}$/.test(o.color || "")) d.color = o.color;
    if (o.dim >= 0 && o.dim <= 0.9) d.dim = Number(o.dim);
    d.lang = o.lang === "en" ? "en" : "zh";
    d.cur = /^[A-Z]{3}$/.test(o.cur || "") ? o.cur : "TWD";
    try { d.seen = JSON.parse(PROPS_().getProperty("MENU_SEEN") || "[]"); } catch (eS) { d.seen = []; }
  } catch (e) {}
  if (!d.lang) d.lang = "zh";
  if (!d.cur) d.cur = "TWD";
  try { d.appUrl = ScriptApp.getService().getUrl() || ""; } catch (eu) { d.appUrl = ""; }
  d.pinOn = waPinOn_();
  return d;
}
function waSaveSettings(p) {
  var cur = waSettings_();
  var name = String(p.name == null ? cur.name : p.name).trim();
  if (!name) throw new Error("名稱不能空白");
  if (name.length > 20) throw new Error("名稱最多 20 個字");
  var color = String(p.color || cur.color);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("顏色格式不正確");
  var dim = p.dim == null ? cur.dim : Number(p.dim);
  if (!(dim >= 0 && dim <= 0.9)) dim = cur.dim;
  PROPS_().setProperty(WA_SET_PROP_, JSON.stringify({ name: name, color: color, dim: dim, lang: cur.lang, cur: cur.cur }));
  return { message: "外觀已儲存", detail: "加到主畫面的捷徑名稱，要刪掉重新加一次才會變", settings: waSettings_() };
}
// 語言、記帳預設幣別（每個人自己的）
function waSavePrefs(p) {
  var cur = waSettings_();
  var lang = p && p.lang ? (p.lang === "en" ? "en" : "zh") : cur.lang;
  var c = p && p.cur ? String(p.cur).toUpperCase() : cur.cur;
  if (!/^[A-Z]{3}$/.test(c)) throw new Error("幣別請用代碼，例如 USD");
  PROPS_().setProperty(WA_SET_PROP_, JSON.stringify({ name: cur.name, color: cur.color, dim: cur.dim, lang: lang, cur: c }));
  return { message: lang === "en" ? "Saved" : "已儲存", detail: "", settings: waSettings_() };
}
// ---------- 4 位數密碼鎖 ----------
// 密碼只存雜湊值；連續輸錯 5 次鎖 5 分鐘
var WA_PIN_PROP_ = "APP_PIN";
function waPinHash_(pin) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SCRIPT_ID_() + ":pin:" + pin, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}
function waPinOn_() { return !!PROPS_().getProperty(WA_PIN_PROP_); }
function waPinCheck_(pin) {
  var cache = UCACHE_();
  var fails = Number(cache.get("pin_fail") || 0);
  if (fails >= 5) throw new Error("密碼錯太多次，請 5 分鐘後再試");
  var ok = waPinHash_(String(pin || "")) === PROPS_().getProperty(WA_PIN_PROP_);
  if (ok) cache.remove("pin_fail"); else cache.put("pin_fail", String(fails + 1), 300);
  return { ok: ok, left: Math.max(0, 4 - fails) };
}
function waUnlock(p) {
  if (!waPinOn_()) return { ok: true, dashboard: p && p.light ? null : waGetDashboard() };
  var r = waPinCheck_(p && p.pin);
  if (!r.ok) return { ok: false, left: r.left };
  if (p && p.light) return { ok: true };
  var cached = waDashGet_() || waDashDurableGet_();
  return { ok: true, dashboard: cached ? JSON.parse(cached) : waGetDashboard() };
}
function waSetPin(p) {
  var pin = String(p && p.pin || "");
  if (waPinOn_()) {
    var r = waPinCheck_(p && p.old);
    if (!r.ok) throw new Error("原本的密碼不對" + (r.left ? "（還可以試 " + r.left + " 次）" : ""));
  }
  var props = PROPS_();
  if (!pin) { props.deleteProperty(WA_PIN_PROP_); return { message: "已關閉密碼鎖", detail: "", settings: waSettings_() }; }
  if (!/^\d{4}$/.test(pin)) throw new Error("密碼要是 4 位數字");
  props.setProperty(WA_PIN_PROP_, waPinHash_(pin));
  return { message: "密碼鎖已設定", detail: "下次打開 App 要輸入密碼", settings: waSettings_() };
}

function waBgImage_() {
  var sh = SS_().getSheetByName(WA_BG_SHEET_);
  if (!sh || sh.getLastRow() < 1) return "";
  return sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).join("");
}
function waSaveBgImage(p) {
  var data = String(p && p.data || "");
  if (data && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) throw new Error("圖片格式不正確");
  if (data.length > 600000) throw new Error("圖片太大，請換一張");
  var ss = SS_();
  var sh = ss.getSheetByName(WA_BG_SHEET_);
  if (!sh) { sh = ss.insertSheet(WA_BG_SHEET_); sh.hideSheet(); }
  sh.clear();
  if (data) {
    var chunks = [];
    for (var i = 0; i < data.length; i += 45000) chunks.push([data.slice(i, i + 45000)]);
    sh.getRange(1, 1, chunks.length, 1).setValues(chunks);
  }
  waChunkPut_("wa_bg", data || "-");
  return { message: data ? "背景圖片已更新" : "已移除背景圖片", detail: "" };
}

function waNum_(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function waDate_(v, fmt) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, WA_TZ_, fmt || "MM/dd HH:mm");
  }
  return String(v || "");
}

// 跟 waLastRows_ 一樣，但每列最後多一個「列號」，給 App 修改／撤銷用
function waLastRowsIdx_(sheet, cols, n) {
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - n + 1);
  return sheet.getRange(start, 1, last - start + 1, cols).getValues()
    .map(function (r, i) { r.push(start + i); return r; }).reverse();
}

function waLastRows_(sheet, cols, n) {
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - n + 1);
  return sheet.getRange(start, 1, last - start + 1, cols).getValues().reverse();
}

function waCategories_(key, fallback) {
  try {
    var list = JSON.parse(PROPS_().getProperty(key) || "[]");
    return list.length ? list : fallback;
  } catch (e) {
    return fallback;
  }
}

// ---------- 讀取整個畫面要用的資料 ----------
// 回傳前先轉成純文字資料：日期會變成文字、NaN 變成 null，
// 避免 google.script.run 遇到日期格式就把整包資料變成 null
// 同一次讀取裡，同一個分頁只讀一次（加快速度）
var WA_MEMO_ = null;
function waMemo_(key, fn) {
  if (!WA_MEMO_) return fn();
  if (!WA_MEMO_.hasOwnProperty(key)) WA_MEMO_[key] = fn();
  return WA_MEMO_[key];
}

// ---------- 加速：先回覆「完成」，畫面資料之後在背景更新 ----------
// App 送出的動作都經過 waAction：動作本身做完就立刻回覆，
// 不在同一次等待裡重算整個畫面；畫面再由 waRefreshAfter 背景更新。
var WA_DEFER_ = false;      // true = 這次不要重建畫面資料
var WA_NEED_TRIAL_ = false; // true = 背景更新時要先重跑試算（交易後）

// 副本的「接頭.gs」固定不變，之後新增的功能都經過 waAction 呼叫，不用再改接頭
var WA_READ_ONLY_ = { waVehNP: 1, waReLayoutImgGet: 1, waGetConfigData: 1, waGetFeeData: 1, waHubGetInvites: 1, waSavePrefs: 1, waMenuSeen: 1, waNwJumps: 1 };
function waAction(req) {
  var name = String(req && req.fn || "");
  if (!/^wa[A-Z][A-Za-z0-9]*$/.test(name) || name === "waAction" || name === "waGetDashboard" || name === "waRefreshAfter") {
    throw new Error("不支援的動作：" + name);
  }
  var f = globalThis[name];
  if (typeof f !== "function") throw new Error("找不到動作：" + name);
  WA_DEFER_ = true;
  WA_NEED_TRIAL_ = false;
  // 期初登記（本來就有的資產，現在才登記）：記下登記前的淨資產，登記完的差額算「期初」，不算資產成長
  try { if (WA_OPENING_FNS_[name] || (req.arg && req.arg.opening === true && (name === "waReSave" || name === "waSaveAltItem" || name === "waReValuate"))) nwPreMark_(); } catch (eNw) { Logger.log(eNw); }
  var r;
  try { r = f(req.arg === null || req.arg === undefined ? undefined : req.arg); } finally { WA_DEFER_ = false; }
  // 只讀資料的動作：直接回傳，不觸發背景更新畫面
  if (WA_READ_ONLY_[name]) return r === undefined ? null : JSON.parse(JSON.stringify(r));
  var rev_ = waRevBump_(); // 資料變了：記一個新的版次，別台裝置看到版次變大就會自己更新
  if (r && typeof r === "object") {
    r.rev = rev_;
    r.deferred = true;
    r.needTrial = WA_NEED_TRIAL_;
    delete r.dashboard;
  }
  return r === undefined ? null : JSON.parse(JSON.stringify(r));
}

// 背景更新畫面（交易後會先重跑一次試算，讓建議股數扣掉剛買的量）
function waRefreshAfter(opt) {
  if (opt && opt.trial) {
    try { buildCombinedReportV4_(); } catch (e) { Logger.log("自動試算失敗：" + e); }
  }
  return waGetDashboard();
}

// 上次的畫面資料存在快取裡，下次開 App 先顯示它、背景再更新。
// 快取一格最多 100KB（中文字一個算 3 bytes），所以切成小塊存
var WA_DASH_CHUNK_ = 30000;
function waChunkPut_(key, str, secs) {
  try {
    var n = Math.max(1, Math.ceil(str.length / WA_DASH_CHUNK_));
    if (n > 60) return false;
    var stamp = String(Date.now()), all = {};
    for (var i = 0; i < n; i++) all[key + "_" + stamp + "_" + i] = str.substr(i * WA_DASH_CHUNK_, WA_DASH_CHUNK_);
    all[key] = "#" + n + ":" + stamp;
    UCACHE_().putAll(all, secs || 21600);
    return true;
  } catch (e) { Logger.log("快取寫入失敗（" + key + "）：" + e); return false; }
}
function waChunkGet_(key) {
  try {
    var c = UCACHE_(), meta = c.get(key);
    if (!meta) return null;
    if (meta.charAt(0) !== "#") return meta; // 舊格式：整包存在一格
    var m = meta.match(/^#(\d+):(\d+)$/);
    if (!m) return null;
    var keys = [];
    for (var i = 0; i < Number(m[1]); i++) keys.push(key + "_" + m[2] + "_" + i);
    var got = c.getAll(keys), parts = [];
    for (var k = 0; k < keys.length; k++) { if (typeof got[keys[k]] !== "string") return null; parts.push(got[keys[k]]); }
    return parts.join("");
  } catch (e) { return null; }
}
function waDashPut_(json, force) {
  var ok = waChunkPut_("wa_dash", json);
  try { waDashDurablePut_(json, force); } catch (e) { Logger.log("畫面長期備份失敗：" + e); }
  return ok;
}
function waDashGet_() { return waChunkGet_("wa_dash"); }
// 快取最多只能放 6 小時，隔天第一次開就沒了。所以另外在「使用者屬性」放一份不會過期的（一格 9KB，切更小塊），
// 每 30 分鐘最多更新一次。只有快取沒有的時候才會拿它出來用。
var WA_DP_CHUNK_ = 2800;
function waDashDurablePut_(json, force) {
  var c = UCACHE_();
  if (!force && c.get("wa_dp_at")) return;
  var n = Math.ceil(json.length / WA_DP_CHUNK_);
  if (n > 120) return; // 太大（超過約 330KB）就不放了
  var all = { WA_DP_N: String(n) };
  for (var i = 0; i < n; i++) all["WA_DP_" + i] = json.substr(i * WA_DP_CHUNK_, WA_DP_CHUNK_);
  PROPS_().setProperties(all, false);
  c.put("wa_dp_at", "1", 1800);
}
function waDashDurableGet_() {
  try {
    var p = PROPS_(), n = Number(p.getProperty("WA_DP_N"));
    if (!(n > 0)) return null;
    var parts = [];
    for (var i = 0; i < n; i++) { var s = p.getProperty("WA_DP_" + i); if (typeof s !== "string") return null; parts.push(s); }
    var json = parts.join("");
    JSON.parse(json); // 壞掉的就不要用
    return json;
  } catch (e) { return null; }
}
// 背景圖片：網頁出來之後才來拿（順便放進快取，下次就直接在網頁裡）
WA_READ_ONLY_.waGetBg = 1;
function waGetBg() {
  var data = "";
  try { data = waBgImage_(); } catch (e) {}
  waChunkPut_("wa_bg", data || "-");
  return { data: data };
}
function waGetDashboard() {
  if (WA_DEFER_) return null;
  WA_MEMO_ = {};
  var json, t0 = Date.now(), d;
  try {
    d = waBuildDashboard_();
    if (d && d.timing) d.timing["合計"] = Date.now() - t0;
    if (d && WA_PREBUILD_) d.prebuilt = WA_PREBUILD_;
    if (d) { try { d.announce = admAnn_(); } catch (anE) {} try { d.disclaimer = disclaimerState_(); } catch (dsE) {} }
    if (d && typeof histSnapshot_ === "function") { try { histSnapshot_(d); } catch (hsE) { Logger.log(hsE); } } // 價格走勢：有變才記
    json = JSON.stringify(d);
  } finally { WA_MEMO_ = null; }
  waDashPut_(json, !!WA_PREBUILD_);
  if (!WA_PREBUILD_) { try { dashPrebuildEnsure_(); } catch (te) { Logger.log(te); } try { admBeat_("open"); } catch (be) {} }
  return JSON.parse(json);
}

// ---------- 沒開 App 的時候先把畫面算好 ----------
// 每小時（早上 7 點到晚上 11 點）、中午試算完、下午收盤記完，各算一次存起來。
// 打開 App 時網頁裡直接放這份，馬上看到結果；背景還是會再抓一次最新的，有變才會跟著變。
var WA_PREBUILD_ = "";
var DASH_PREBUILD_FN_ = "refreshDashCache";
var WA_PREBUILD_ERR_ = "";
function dashPrebuild_(why) {
  if (WA_PREBUILD_) return true;
  WA_PREBUILD_ = why || "排程"; WA_PREBUILD_ERR_ = "";
  var ok = false;
  try {
    var d = waGetDashboard(); ok = !!d;
    try { if (d) sellAlertCheck_(d); } catch (sae) { Logger.log("賣出提醒檢查失敗：" + sae); admErr_("賣出提醒", sae && sae.message ? sae.message : sae); }
  } catch (e) { Logger.log("先算好畫面失敗：" + e); WA_PREBUILD_ERR_ = String(e && e.message ? e.message : e); } finally { WA_PREBUILD_ = ""; }
  return ok;
}
// 每小時的排程
function refreshDashCache() {
  var h = Number(Utilities.formatDate(new Date(), "Asia/Taipei", "H"));
  if (h < 7) return; // 半夜不用算（省 Google 每天給的排程時間）
  try { noonSchedule_(); } catch (e) { Logger.log("訂 12:00 試算失敗：" + e); admErr_("訂 12:00 試算", e && e.message ? e.message : e); }
  try { dataHourly_(h); } catch (e) { Logger.log("資料更新：" + e); }
  var ok = dashPrebuild_("每小時");
  admBeat_("每小時更新", ok, WA_PREBUILD_ERR_ || "畫面算不出來");
  if (!ok) admErr_("排程 每小時更新", WA_PREBUILD_ERR_ || "畫面算不出來");
}
// 舊的使用者不用自己去按「重新安裝排程」：開 App 的時候發現少了這個排程就自己裝（一天最多檢查一次）
function dashPrebuildEnsure_() {
  if (typeof hubDoGet_ !== "function") return; // 只有中央 App 自己裝（副本請用「重新安裝排程」）
  var c = UCACHE_();
  if (c.get("dpb_chk")) return;
  c.put("dpb_chk", "1", 21600);
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === DASH_PREBUILD_FN_; });
  if (!has) ScriptApp.newTrigger(DASH_PREBUILD_FN_).timeBased().everyHours(1).create();
}
// 資料版次：每次用 App 改了資料就換一個新的（存在快取，不用開試算表，很快）
// 同一個帳號在別台裝置開著 App 時，每分鐘問一次版次，變大了就重新讀資料
function waRevGet_() { try { return Number(UCACHE_().get("wa_rev")) || 0; } catch (e) { return 0; } }
function waRevBump_() { var v = Date.now(); try { UCACHE_().put("wa_rev", String(v), 21600); } catch (e) { Logger.log(e); } return v; }
WA_READ_ONLY_.waRev = 1;
function waRev() { return { rev: waRevGet_(), ver: LIB_VERSION_ }; }

// 測速用：什麼都不做，量「手機 ⇄ Google」一來一回要多久
WA_READ_ONLY_.waPing = 1;
function waPing() { return { t: Date.now() }; }

// ---------- 個人偏好：ETF 買進提醒、生活帳戶只當參考 ----------
var WA_PREFS_ = "USER_PREFS";
function waPrefs_() {
  var o = {}; try { o = JSON.parse(PROPS_().getProperty(WA_PREFS_) || "{}"); } catch (e) {}
  return { etf: o.etf !== false && o.etfTask !== false, lifeRef: o.lifeRef !== false, reserveMonths: o.reserveMonths >= 0 ? Number(o.reserveMonths) : 6, simple: o.simple === true, reco: o.reco || null };
}
function waSavePref(p) {
  var key = String(p && p.key || ""), val = key === "reserveMonths" ? Math.max(0, Math.min(36, Math.round(Number(p && p.val) || 0))) : !!(p && p.val);
  if (["etf", "lifeRef", "reserveMonths", "simple"].indexOf(key) < 0) throw new Error("不明的設定");
  var o = {}; try { o = JSON.parse(PROPS_().getProperty(WA_PREFS_) || "{}"); } catch (e) {}
  o[key] = val; if (key === "etf") delete o.etfTask; PROPS_().setProperty(WA_PREFS_, JSON.stringify(o));
  if (key === "reserveMonths") return { message: val ? "房貸保留 " + val + " 個月" : "不保留房貸現金", detail: "下次試算開始算", dashboard: waGetDashboard() };
  if (key === "simple") return { message: val ? "已開啟簡單模式" : "已關閉簡單模式", detail: val ? "首頁只放常用的，字放大；其他功能都還在，按「看全部」就有" : "回到完整的首頁", dashboard: waGetDashboard() };
  if (key === "lifeRef" && !val) { try { refreshWeeklyLifeAccountV2(); } catch (e) { Logger.log(e); } } // 改回真的撥錢：馬上照週額度校準一次
  return { message: key === "lifeRef" ? (val ? "生活帳戶改成只當參考" : "生活帳戶改回真的撥錢") : (val ? "已開啟 ETF 買進建議" : "已關閉 ETF 買進建議"),
    detail: key === "lifeRef" ? (val ? "錢都留在投資現金，生活帳戶只顯示這週還可以花多少" : "每週一會從投資現金撥這週的生活費到生活帳戶") : "", dashboard: waGetDashboard() };
}
// 推薦配置的回答（大跌反應、5 年內要用的錢、退休後自動調、大跌保護）：之後每個月照年紀重算要用
// 推薦配置只問年紀：出生年、退休年齡（已經退休的填退休那年的年紀）；其他退休規劃欄位沒填過的用預設
function waRetireBasic(p) {
  var y = new Date().getFullYear(), birth = Number(p && p.birth), ra = Number(p && p.retireAge);
  if (!(birth >= 1900 && birth <= y - 10)) throw new Error("出生年請填西元，例如 1955");
  if (!(ra >= 30 && ra <= 100)) throw new Error("退休年齡請填 30～100");
  var ss = SS_(); if (!ss.getSheetByName(RETIRE_SHEET_)) setupRetirePlan();
  var r = ss.getSheetByName(RETIRE_SHEET_);
  r.getRange("B1").setValue(birth); r.getRange("B4").setValue(ra);
  if (String(r.getRange("B3").getValue()).trim() === "") r.getRange("B3").setValue(y - birth);
  var need = Number(p && p.need);
  if (need > 0 && need < 1e8) { r.getRange("B5").setValue(need); r.getRange("B11").clearContent(); }   // 今天的錢
  return { message: "已記下年紀", detail: "", age: y - birth, retireAge: ra, birth: birth, need: need > 0 ? need : 0 };
}
function waSaveReco(p) {
  p = p || {};
  if (p.mix) waApplyMix(p.mix);   // 推薦配置和設定一起存：少一次來回
  var num = function (v, lo, hi) { var n = Number(v); return n >= lo && n <= hi ? n : null; };
  var r = { pref: num(p.pref, -20, 10), big: num(p.big, 0, 1e11), auto: !!p.auto, trend: !!p.trend, eq: num(p.eq, 0, 100), at: /^\d{4}-\d{2}$/.test(String(p.at || "")) ? String(p.at) : "" };
  var o = {}; try { o = JSON.parse(PROPS_().getProperty(WA_PREFS_) || "{}"); } catch (e) {}
  o.reco = r; PROPS_().setProperty(WA_PREFS_, JSON.stringify(o));
  return { message: "已經記下你的推薦配置設定", detail: "", dashboard: waGetDashboard() };
}
// 生活帳戶只當參考：生活帳戶裡的錢全部放回投資現金（兩邊加起來不變，對帳不受影響），生活帳戶只顯示這週還可以花多少（B47）
// 記帳、每週校準的邏輯都照舊，只是每次打開 App 時把撥過去的錢收回來
function lifeRefFold_(ss, sh) {
  if (!waPrefs_().lifeRef || !sh) return;
  var life = waNum_(sh.getRange(R_(45), 2).getValue()), p = PROPS_(), last = Number(p.getProperty("LIFE_REF_AT") || 0);
  if (life > 0.004) {
    var cash = waNum_(sh.getRange(R_(10), 4).getValue());
    sh.getRange(R_(10), 4).setValue(Math.round((cash + life) * 100) / 100);
    sh.getRange(R_(45), 2).setValue(0);
  } else if (Date.now() - last < 30 * 60000) return;
  try { if (typeof refreshLifeAccountDisplayV2_ === "function") refreshLifeAccountDisplayV2_(ss); } catch (e) { Logger.log(e); }
  p.setProperty("LIFE_REF_AT", String(Date.now()));
  SpreadsheetApp.flush();
}
// 打開 App 時自己檢查：自動排程還在不在、今天中午的試算有沒有跑（沒跑就現在補跑）
function waSelfCheck() {
  var out = { fixed: [], ran: false };
  try {
    if (typeof triggerPlan === "function" && typeof hubInstallTriggers_ === "function") {
      var want = triggerPlan().filter(function (x) { return x.kind !== "edit" && x.kind !== "formSubmit"; }).map(function (x) { return x.fn; });
      var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
      var miss = want.filter(function (f) { return have.indexOf(f) < 0; });
      if (miss.length) { hubInstallTriggers_(); out.fixed = miss; }
    }
  } catch (e) { Logger.log("檢查排程失敗：" + e); }
  try {
    var now = new Date(), tz = "Asia/Taipei", day = Utilities.formatDate(now, tz, "yyyy-MM-dd"), dow = Number(Utilities.formatDate(now, tz, "u")), hm = Number(Utilities.formatDate(now, tz, "HHmm"));
    if (waPrefs_().etf && dow <= 5 && hm >= 1220 && PROPS_().getProperty("DPC_DONE_DAY") !== day && typeof dailyPortfolioCheck === "function") { dailyPortfolioCheck(); out.ran = true; }
  } catch (e2) { Logger.log("補跑試算失敗：" + e2); }
  out.message = out.ran ? "今天中午的試算沒有跑到，已經補跑" : out.fixed.length ? "自動排程有缺，已經重新安裝" : "";
  out.dashboard = out.ran || out.fixed.length ? waGetDashboard() : null;
  return out;
}
function waBuildDashboard_() {
  // 房貸、固定支出、租金：到期的先自動記帳（一天一次），畫面才會是最新的
  try { if (typeof reProcess_ === "function") reProcess_(false); } catch (reE) { Logger.log("房地產自動記帳失敗：" + reE); }
  var tm_ = {}, tl_ = Date.now();
  var mark_ = function (k) { var n = Date.now(); tm_[k] = (tm_[k] || 0) + n - tl_; tl_ = n; }; // 測速：每一段花幾毫秒
  var ss = SS_();
  mark_("開試算表");
  var sh = ss.getSheetByName("工作表1");
  try { lifeRefFold_(ss, sh); } catch (lrE) { Logger.log("生活帳戶參考模式：" + lrE); }
  var rows = sh.getRange(2, 1, LAY().n + 1, 20).getValues(); // 標的那幾列＋現金列

  var holdings = [];
  for (var i = 0; i < LAY().n; i++) {
    var r = rows[i];
    var code = String(r[0]).trim();
    if (!code) continue;
    holdings.push({
      row: i + 2,
      code: code,
      name: WA_NAMES_[code] || "",
      group: i < LAY().core ? "core" : "pick",
      shares: waNum_(r[1]),
      price: waNum_(r[2]),
      value: waNum_(r[3]),
      pct: waNum_(r[4]),
      target: waNum_(r[5]),
      status: String(r[6] || ""),
      targetAmt: waNum_(r[7]),
      buyFull: waNum_(r[10]),
      cost: waNum_(r[11]),
      ret: r[12] === "" ? null : waNum_(r[12]),
      sellSuggest: waNum_(r[14]),
      buySuggest: waNum_(r[18]),
      diff: waNum_(r[9]),
      pastClose: waNum_(r[19]),
      avgCost: waNum_(r[1]) > 0 ? waNum_(r[11]) / waNum_(r[1]) : 0
    });
  }

  // 第一次用（還沒抓過股價備援）：先抓一次，上櫃的債券 ETF 才有價格
  try { if (!PROPS_().getProperty("PRICE_BAK_AT")) priceBackupRefresh_(true); } catch (pbE) { Logger.log(pbE); }
  var cashRow = rows[LAY().n];
  var investTotal = waNum_(cashRow[8]); // I10 投資總額（不含另類資產）
  var blk = sh.getRange(A1_("B12:C48")).getValues(); // 一次讀完，比分三次讀快
  // 總資產（B14）是錯誤：多半是某一格股價抓不到（#N/A）→ 先把股價公式修好再讀一次
  if (/^#/.test(String(blk[2][0])) && typeof fixPriceFormulas_ === "function") {
    try { if (fixPriceFormulas_()) { SpreadsheetApp.flush(); Utilities.sleep(3000); blk = sh.getRange(A1_("B12:C48")).getValues(); } } catch (pfE) { Logger.log(pfE); }
  }
  var top = blk.slice(0, 15);                    // B12:B26
  var life = blk.slice(33, 37);                  // B45:B48
  var feeV = blk.slice(9, 12).map(function (r) { return [r[1]]; }); // C21:C23

  mark_("主表");
  var altTotal = 0, altCost = 0, altItems = [];
  var alt = ss.getSheetByName("另類資產");
  try { waAltFxRefresh_(ss); } catch (afe) { Logger.log("外幣保險換算失敗：" + afe); }
  mark_("另類資產匯率換算");
  if (alt && alt.getLastRow() >= 2) {
    alt.getRange(2, 1, alt.getLastRow() - 1, Math.min(15, alt.getMaxColumns())).getValues().forEach(function (v, i) {
      if (!String(v[0]).trim()) return;
      if (String(v[1]).trim() === "股票" && String(v[7] || "").trim()) return; // 其他個股另外顯示
      altTotal += waNum_(v[2]);
      altCost += waNum_(v[6]);
      var cur = waAltCur_(v);
      altItems.push({ row: i + 2, note: String(v[4] || ""), name: String(v[0]), category: String(v[1] || ""), value: waNum_(v[2]),
        cost: v[6] === "" ? null : waNum_(v[6]), date: waDate_(v[3], "yyyy/MM/dd"),
        currency: cur, fxValue: cur ? waNum_(v[8]) : null, fxCost: cur && v[9] !== "" ? waNum_(v[9]) : null,
        costTwd: !!cur && v[9] === "" && v[6] !== "", // 價值是外幣、成本是用台幣記的（例如用台幣買的球員卡）
        priceUrl: String(v[10] || "").trim(), priceGrade: String(v[11] || "").trim(), priceInfo: String(v[12] || "").trim(),
        spec: (function () { try { var o = JSON.parse(String(v[14] || "") || "null"); return o && o.spec ? o.spec : null; } catch (e) { return null; } })(),
        priceAt: v[13] instanceof Date ? v[13].getTime() : 0, // N 欄：上次去查成交價的時間（不管有沒有查到）
        pol: waAltPol_(v[14]) }); // O 欄：保單資料（保險金額、身故給付、滿期日、滿期金、繳清、解約金查詢日期），只當備註，不算進資產
    });
  }

  // 生意的資產（用生意的錢買的保險等）：放在另一個分頁，不算進個人總資產、生活費和退休進度
  var bizAssets = null;
  var bizAlt = ss.getSheetByName(WA_BIZ_ALT_SHEET_);
  if (bizAlt && bizAlt.getLastRow() >= 2) {
    bizAssets = { items: [], total: 0, cost: 0 };
    bizAlt.getRange(2, 1, bizAlt.getLastRow() - 1, 10).getValues().forEach(function (v, i) {
      if (!String(v[0]).trim()) return;
      var cur2 = waAltCur_(v);
      bizAssets.total += waNum_(v[2]); bizAssets.cost += waNum_(v[6]);
      bizAssets.items.push({ row: i + 2, scope: "生意", note: String(v[4] || ""), name: String(v[0]), category: String(v[1] || ""), value: waNum_(v[2]),
        cost: v[6] === "" ? null : waNum_(v[6]), date: waDate_(v[3], "yyyy/MM/dd"),
        currency: cur2, fxValue: cur2 ? waNum_(v[8]) : null, fxCost: cur2 && v[9] !== "" ? waNum_(v[9]) : null });
    });
  }

  mark_("另類資產");
  var picks = holdings.filter(function (h) { return h.group === "pick"; });
  var pickTargetAmt = 0, pickValue = 0, pickTargetPct = 0, pickPct = 0, pickMax = 0;
  picks.forEach(function (h) {
    pickTargetAmt += h.targetAmt; pickValue += h.value;
    pickTargetPct += h.target; pickPct += h.pct;
    if (h.pct > pickMax) pickMax = h.pct;
  });

  var trades = waLastRowsIdx_(ss.getSheetByName("交易紀錄"), 10, 15).map(function (r) {
    return { row: r[10], date: waDate_(r[0]), code: String(r[1]), name: WA_NAMES_[String(r[1])] || "",
      shares: waNum_(r[2]), price: waNum_(r[3]), net: waNum_(r[7]), type: String(r[8]), fee: waNum_(r[5]), tax: waNum_(r[6]) };
  });
  var ledger = waLastRowsIdx_(ss.getSheetByName("收支紀錄"), 6, 15).map(function (r) {
    return { row: r[6], date: waDate_(r[0]), day: waDate_(r[0], "yyyy-MM-dd"), type: String(r[1]), category: String(r[2]),
      amount: waNum_(r[3]), note: String(r[4] || ""), oneTime: String(r[5]) === "是" };
  });

  // 以前記過的「備註 → 分類」：一句話記帳、打備註時自動猜分類用（最近 600 筆，同一個備註用最近一次的分類）
  var noteCats = (function () {
    try {
      var sh = ss.getSheetByName("收支紀錄"); if (!sh || sh.getLastRow() < 2) return {};
      var n = Math.min(600, sh.getLastRow() - 1), v = sh.getRange(sh.getLastRow() - n + 1, 2, n, 4).getValues(), o = {}, k = 0;
      for (var i = v.length - 1; i >= 0 && k < 300; i--) {
        var t = String(v[i][0]).trim(), c = String(v[i][1]).trim(), nt = String(v[i][3] || "").trim().replace(/[〔［].*$/, "").trim();
        if ((t !== "收入" && t !== "支出") || !c || !nt || nt.length > 12 || /^\d+(\.\d+)?$/.test(nt) || c === "帳務調整") continue;
        var key = t.slice(0, 1) + nt; if (o.hasOwnProperty(key)) continue; o[key] = c; k++;
      }
      return o;
    } catch (e) { return {}; }
  })();
  mark_("交易和收支紀錄");
  var gold = waGoldData_(ss);
  mark_("黃金");
  var fx = null;
  try { fx = waFxData_(ss); } catch (fxErr) { Logger.log("外幣讀取失敗：" + fxErr); }
  mark_("外幣");
  var otherStocksList = waOtherStocks_(ss);
  // 名稱：查不到的代號去公開資料查（查到就記住），每一檔都顯示「名稱＋代號」
  try {
    stockNamesFill_(holdings.map(function (x) { return x.code; }).concat(otherStocksList.map(function (x) { return x.code; })));
    holdings.forEach(function (x) { if (!x.name) x.name = WA_NAMES_[x.code] || ""; });
    otherStocksList.forEach(function (x) { if (!x.name || x.name === x.code) x.name = WA_NAMES_[x.code] || ""; });
  } catch (nmErr) { Logger.log("股票名稱查詢失敗：" + nmErr); }
  mark_("其他個股");
  var netRet = waNetReturn_(holdings, otherStocksList, waNum_(top[2][0]), waNum_(top[3][0]), feeV);
  var perf = null;
  var reT = null;
  try { reT = reTotals_(ss); } catch (reErr) { Logger.log("房地產讀取失敗：" + reErr); }
  try { perf = waPerf_(ss, holdings, otherStocksList, waNum_(top[2][0]), waNum_(top[3][0]), netRet, gold, fx, waNum_(life[0][0]), altItems, reT); }
  catch (perfErr) { Logger.log("績效計算失敗：" + perfErr); }
  mark_("績效");
  var onboard = { done: PROPS_().getProperty("ONBOARD_DONE") === "1" };
  if (!onboard.done) {
    var rpS = ss.getSheetByName(RETIRE_SHEET_);
    onboard.retire = !!(rpS && String(rpS.getRange("B1").getValue()).trim());
    onboard.targets = holdings.some(function (h) { return h.target > 0; });
    onboard.opening = waNum_(cashRow[3]) > 0 || holdings.some(function (h) { return h.shares > 0; });
    onboard.accounts = waFlowRows_(ss).some(function (r) { return String(r[1]) === "校正"; });
  }
  var hub = null;
  try { if (typeof hubInfo_ === "function") hub = hubInfo_(); } catch (hubErr) { Logger.log(hubErr); }
  mark_("設定和中央資訊");
  var retireD_ = waRetireData_(ss, waNum_(top[2][0]), investTotal, gold ? gold.total : 0, (fx ? fx.total : 0) + waSavingTotal_(ss));
  mark_("退休試算");
  var bizD_ = waBizData_(ss);
  mark_("生意");
  var detailsD_ = waGetDetails_(ss);
  mark_("明細");
  var accD_ = waAccountBalances_(ss), stockAccD_ = waStockAccount_(ss), flowsD_ = waRecentFlows_(ss, 10);
  mark_("帳戶和金流");
  var pendD_ = (function () { try { return waCardPending_(ss); } catch (cpE) { Logger.log("卡片待確認讀取失敗：" + cpE); return []; } })();
  var ccD_ = (function () { try { return waCcData_(ss); } catch (ccE) { Logger.log("信用卡讀取失敗：" + ccE); return []; } })();
  var inCats_ = waCategories_("INCOME_CATEGORIES", ["薪水", "獎金", "其他"]), exCats_ = waCategories_("EXPENSE_CATEGORIES", ["餐飲", "交通", "日常用品", "娛樂", "醫療", "其他"]);
  mark_("信用卡和分類");
  var allocRemind_ = { on: false, sentAt: 0, day: 1, who: "" };
  try { var ar_ = JSON.parse(PROPS_().getProperty("ALLOC_REMIND") || "{}"); allocRemind_ = { on: !!ar_.on, sentAt: Number(ar_.sentAt) || 0, day: ar_.day >= 0 && ar_.day <= 6 ? Number(ar_.day) : 1, who: String(ar_.who || "").slice(0, 20) }; } catch (arE) {}
  return {
    ver: LIB_VERSION_, rev: waRevGet_(), changes: (function () { try { return changelogUnseen_(); } catch (e) { return []; } })(),
    trial: (function () { try { return JSON.parse(PROPS_().getProperty("TRIAL_LAST") || "null"); } catch (e) { return null; } })(),
    allocRemind: allocRemind_,
    health: (function () { try { return waHealthData_(); } catch (e) { return null; } })(),
    timing: tm_,
    hub: hub,
    onboard: onboard,
    perf: perf,
    netReturn: netRet,
    // 退休試算的資產：總資產＋黃金＋外幣＋設成「儲蓄」的帳戶（存款也是退休金的一部分）
    retire: retireD_,
    fx: fx,
    plan2: (function () { try { return plan2Data_(); } catch (e) { return null; } })(),
    bizBound: (function () { try { return bizBoundList_(); } catch (e) { return []; } })(),
    // 記帳頁最上面：本月收入、支出、收支（算法跟收支查詢一樣）
    ledgerMonth: (function () {
      try {
        var now = new Date(), key = Utilities.formatDate(now, WA_TZ_, "yyyy-MM");
        var q = waLedgerQuery({ from: key + "-01", to: Utilities.formatDate(now, WA_TZ_, "yyyy-MM-dd"), type: "all" });
        return { key: key, income: q.income, expense: q.expense, net: q.net, oneTimeExp: q.oneTimeExp };
      } catch (e) { return null; }
    })(),
    // 沒有開外幣帳戶、但有信用卡的人：外幣刷卡也要有匯率可以估
    fxq: (function () {
      if (fx || !ccD_.length || typeof fxRates_ !== "function") return null;
      try {
        var o = fxRates_(), rt = {};
        Object.keys(FX_NAMES_).forEach(function (k) { if (o.rates[k]) rt[k] = o.rates[k]; });
        return { rates: rt, updated: o.time || "", known: Object.keys(FX_NAMES_).map(function (k) { return FX_NAMES_[k] + " " + k; }) };
      } catch (qe) { return null; }
    })(),
    biz: bizD_,
    bizAssets: bizAssets,
    updatedAt: Utilities.formatDate(new Date(), WA_TZ_, "MM/dd HH:mm"),
    holdings: holdings,
    cash: { amount: waNum_(cashRow[3]), pct: waNum_(cashRow[4]), target: waNum_(cashRow[5]), status: String(cashRow[6] || "") },
    investTotal: investTotal,
    totalAssets: waNum_(top[2][0]),        // B14
    returnRate: waNum_(top[3][0]),         // B15
    principal: waNum_(top[4][0]),          // B16
    annualized: top[5][0],                 // B17（可能是文字）
    lastAction: String(top[7][0] || ""),   // B19
    feePending: waNum_(top[0][0]),         // B12
    health: String(top[13][0] || ""),      // B25
    goal: waNum_(top[14][0]),              // B26
    altTotal: altTotal,
    altCost: altCost,
    altItems: altItems,
    details: detailsD_,
    otherStocks: otherStocksList,
    realEstate: reT,
    sellAlerts: (function () { try { return sellAlertStatus_({ holdings: holdings, otherStocks: otherStocksList }); } catch (e) { return {}; } })(),
    emptySlots: (function () { var o = []; for (var r = LAY().pickFirst; r <= LAY().last; r++) if (!String(rows[r - 2][0]).trim()) o.push(r); return o; })(),
    accounts: accD_,
    stockAccount: stockAccD_,
    gold: gold,
    flows: flowsD_,
    cardPending: pendD_,
    cards: ccD_,
    life: { balance: waNum_(life[0][0]), monthSpent: waNum_(life[1][0]), weekTarget: waNum_(life[2][0]), notice: String(life[3][0] || ""), ref: waPrefs_().lifeRef },
    prefs: waPrefs_(),
    broker: (function () { try { return brokerInfo_(); } catch (e) { return null; } })(),
    rateHist: (function () { try { return rateHistInfo_(); } catch (e) { return null; } })(),
    reserve: (function () { try { return loanReserve_(); } catch (e) { return null; } })(),
    picks: {
      targetAmt: pickTargetAmt, value: pickValue, remain: pickTargetAmt - pickValue,
      targetPct: pickTargetPct, pct: pickPct, maxPct: pickMax,
      capLow: investTotal * 0.03, capHigh: investTotal * 0.04
    },
    fxReady: typeof fxRates_ === "function",
    fee: { rate: waNum_(feeV[0][0]) || 0.001425, tax: waNum_(feeV[1][0]) || 0.003, min: waNum_(feeV[2][0]) || 20 },
    trades: trades,
    ledger: ledger,
    noteCats: noteCats,
    accUse: (function () { try { return waAccUsage_(ss); } catch (e) { return null; } })(),
    incomeCats: inCats_,
    expenseCats: exCats_
  };
}

function waSavingTotal_(ss) {
  var t = 0;
  waAccountBalances_(ss).forEach(function (a) { if (a.role === "儲蓄") t += a.balance; });
  return t;
}

// ---------- 三個績效數字 ----------
// 1. 資產報酬：全部資產（股票＋現金＋另類資產＋實體黃金＋外幣）對比投入成本
// 2. 股票 ETF 報酬：只看股票和 ETF，扣掉賣出成本（跟證券 App 一樣）
// 3. 淨資產年成長：投資賺的＋存下來的錢（收入−支出）都算，跟一年前比；每天記一筆到「資產快照」
var WA_SNAP_SHEET_ = "資產快照";
function waPerf_(ss, holdings, others, totalAssets, returnRate, netRet, gold, fx, lifeBalance, altItems, reT) {
  // 1. 資產報酬
  var base = returnRate > -1 ? totalAssets / (1 + returnRate) : 0; // 跟 B15 同一個分母
  var goldVal = 0, goldCost = 0;
  (gold ? gold.items : []).forEach(function (x) { goldVal += x.value; goldCost += x.cost === null ? x.value : x.cost; });
  var fxVal = fx ? fx.total : 0, fxCost = fx ? fx.cost : 0;
  // 另類資產沒填成本的（例如保險只填了解約金），用現值當成本，不然整筆價值都會被當成賺的
  var noCost = (altItems || []).filter(function (a) { return a.cost === null && a.value > 0; });
  var noCostVal = noCost.reduce(function (t, a) { return t + a.value; }, 0);
  // 保險：解約金跟繳的保費差多少不算投資報酬（保費有一部分是買過去的保障），成本當作等於解約金
  (altItems || []).forEach(function (a) { if (a.category === "保險" && a.cost !== null) noCostVal += a.value - a.cost; });
  var allVal = totalAssets + goldVal + fxVal, allCost = base + goldCost + fxCost + noCostVal;
  var asset = allCost > 0 ? { rate: (allVal - allCost) / allCost, gain: allVal - allCost, cost: allCost,
    noCost: noCost.map(function (a) { return a.name; }) } : null;

  // 2. 股票 ETF 報酬（扣賣出成本）
  var sVal = 0, sCost = 0;
  holdings.concat(others || []).forEach(function (h) { if (h.value > 0 || h.cost > 0) { sVal += h.value; sCost += h.cost; } });
  var sell = netRet ? netRet.sellCost : 0;
  var stock = sCost > 0 ? { rate: (sVal - sell - sCost) / sCost, gain: sVal - sell - sCost, cost: sCost, value: sVal } : null;

  // 3. 淨資產（個人）＝總資產＋黃金＋外幣＋生活帳戶＋儲蓄帳戶
  var saving = waSavingTotal_(ss);
  var reEq = reT ? reT.equity : 0; // 房地產淨值（估值 − 房貸 − 押金）
  var netWorth = Math.round(allVal + lifeBalance + saving + reEq);
  var growth = waSnapshot_(ss, netWorth, asset ? asset.gain : 0);
  return { asset: asset, stock: stock, growth: growth, netWorth: netWorth, reEquity: Math.round(reEq) };
}

var WA_OPENING_FNS_ = { waSetOpening: 1, waWizAccounts: 1, waWizFx: 1, waWizHoldings: 1, waWizAlt: 1, waWizGold: 1, waWizBiz: 1 };
function nwPreMark_() {
  var P = PROPS_(); if (P.getProperty("NW_PRE")) return;   // 同一次登記好幾步：用第一步之前的
  var sh = SS_().getSheetByName(WA_SNAP_SHEET_); if (!sh || sh.getLastRow() < 2) return;
  var v = waNum_(sh.getRange(sh.getLastRow(), 2).getValue()); if (v > 0 || v < 0) P.setProperty("NW_PRE", String(v));
}
function nwFlows_() { try { return JSON.parse(PROPS_().getProperty("NW_FLOWS") || "[]"); } catch (e) { return []; } }
// 已經登記的資產，事後補標「本來就有」：找出淨資產那幾天突然多出來的金額，讓 App 配對到每一項
function waNwJumps() {
  var sh = SS_().getSheetByName(WA_SNAP_SHEET_), out = [], first = "";
  if (sh && sh.getLastRow() >= 2) {
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    var key = function (v) { return v instanceof Date ? Utilities.formatDate(v, WA_TZ_, "yyyy-MM-dd") : String(v).trim().replace(/^'/, ""); };
    var prev = null;
    rows.forEach(function (r) { var k = key(r[0]), v = waNum_(r[1]); if (!k || !(v > 0)) return; if (!first) first = k; if (prev) out.push([k, Math.round(v - prev[1]), Math.round(prev[1])]); prev = [k, v]; });
  }
  out = out.filter(function (x) { return x[1] >= 10000; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 60);
  return { first: first, jumps: out, flows: nwFlows_() };
}
function waNwFlowSet(p) {
  p = p || {}; var tag = String(p.tag || "").slice(0, 80); if (!tag) throw new Error("缺少項目");
  var FL = nwFlows_().filter(function (x) { return x[2] !== tag; });
  if (!p.del) {
    var d = String(p.d || ""), a = Math.round(waNum_(p.amt));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("日期格式不對");
    if (!(Math.abs(a) >= 1)) throw new Error("金額不對");
    FL.push([d, a, tag]); FL.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
  }
  PROPS_().setProperty("NW_FLOWS", JSON.stringify(FL.slice(-500)));
  return { message: p.del ? "已取消" : "已存", detail: "淨資產成長會重新算" };
}
// 設定選單看過的新項目（存在伺服器，換手機、清快取也不會再出現紅點）
function waMenuSeen(p) {
  var k = String(p && p.k || "").slice(0, 40); if (!k) return { ok: false };
  var P = PROPS_(), o = []; try { o = JSON.parse(P.getProperty("MENU_SEEN") || "[]"); } catch (e) { o = []; }
  if (o.indexOf(k) < 0) { o.push(k); P.setProperty("MENU_SEEN", JSON.stringify(o.slice(-200))); }
  return { ok: true };
}
function waSnapshot_(ss, netWorth, costGain) {
  var sh = ss.getSheetByName(WA_SNAP_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(WA_SNAP_SHEET_);
    sh.getRange(1, 1, 1, 2).setValues([["日期", "淨資產（總資產＋黃金＋外幣＋生活帳戶＋儲蓄）"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  var today = Utilities.formatDate(new Date(), WA_TZ_, "yyyy-MM-dd");
  var last = sh.getLastRow();
  var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  var key = function (v) { return v instanceof Date ? Utilities.formatDate(v, WA_TZ_, "yyyy-MM-dd") : String(v).trim().replace(/^'/, ""); };
  // 第一次使用：自動放一筆「起點」＝現在的淨資產 − 股票、黃金、另類資產從成本到現在賺的
  // 日期用最早一筆交易的日期，這樣從買進到現在的報酬都算進淨資產成長
  if (!rows.some(function (r) { var k = key(r[0]); return k && k < today; })) {
    var startDate = waFirstRecordDate_(ss, today);
    var startVal = Math.round(netWorth - (costGain || 0));
    if (startVal > 0) {
      sh.getRange(1, 3).setValue("來源");
      if (rows.length) sh.insertRowBefore(2); // 起點放最前面
      sh.getRange(2, 1, 1, 3).setValues([["'" + startDate, startVal, "起點（成本）"]]);
      rows.unshift([startDate, startVal]);
      last = sh.getLastRow();
    }
  }
  // 期初登記完：登記前後淨資產的差＝本來就有的資產，記成「期初」，算成長時扣掉
  var PP = PROPS_(), pre = PP.getProperty("NW_PRE");
  if (pre !== null && pre !== "" && rows.length) {
    var fl = Math.round(netWorth - Number(pre));
    if (Math.abs(fl) >= 1) { var FL = nwFlows_(); FL.push([today, fl]); PP.setProperty("NW_FLOWS", JSON.stringify(FL.slice(-500))); }
    PP.deleteProperty("NW_PRE");
  }
  // 跟前一天比少掉一半以上：幾乎一定是資料暫時出錯（例如某一檔股價抓不到，總資產算不出來），今天這一點先不記，免得線圖掉到谷底
  var prevRow = null;
  for (var pi = rows.length - 1; pi >= 0; pi--) { if (key(rows[pi][0]) < today) { prevRow = rows[pi]; break; } }
  var bad = prevRow && waNum_(prevRow[1]) > 0 && netWorth < waNum_(prevRow[1]) * 0.5;
  if (bad) {
    if (rows.length && key(rows[rows.length - 1][0]) === today) { rows.pop(); sh.deleteRow(last); }
  } else if (rows.length && key(rows[rows.length - 1][0]) === today) {
    sh.getRange(last, 2).setValue(netWorth);
    rows[rows.length - 1][1] = netWorth;
  } else {
    sh.appendRow(["'" + today, netWorth]);
    rows.push([today, netWorth]);
  }
  // 基準：一年前（或更早）最接近的那一天；還不滿一年就用第一天
  var yearAgo = Utilities.formatDate(new Date(Date.now() - 365 * 86400000), WA_TZ_, "yyyy-MM-dd");
  var baseRow = rows[0];
  for (var i = 0; i < rows.length; i++) { if (key(rows[i][0]) <= yearAgo) baseRow = rows[i]; else break; }
  var baseVal = waNum_(baseRow[1]), baseDate = key(baseRow[0]);
  var days = Math.round((new Date(today) - new Date(baseDate)) / 86400000);
  // 線圖用：最近兩年，點太多就平均抽樣（最後一天一定保留）
  var series = rows.slice(-730).map(function (r) { return [key(r[0]), Math.round(waNum_(r[1]))]; })
    .filter(function (r) { return r[1] > 0; });
  if (series.length > 300) {
    var step = series.length / 300, thin = [];
    for (var k = 0; k < 299; k++) thin.push(series[Math.floor(k * step)]);
    thin.push(series[series.length - 1]);
    series = thin;
  }
  var intraday = bad ? waIntradayGet_() : waIntradayPut_(netWorth);
  // 期間內的期初登記（本來就有、現在才登記的資產）不算成長：用時間加權報酬，每一天的漲跌扣掉當天登記的金額再連乘
  var FL = {}, F = 0; nwFlows_().forEach(function (x) { if (x[0] > baseDate && x[0] <= today) { FL[x[0]] = (FL[x[0]] || 0) + x[1]; F += x[1]; } });
  if (!(baseVal > 0) || days < 1) return { since: baseDate, days: 0, rate: null, full: false, series: series, intraday: intraday, opening: F };
  var rate = null;
  if (F) {
    var g = 1, prev = baseVal, started = false;
    rows.forEach(function (r) {
      var k = key(r[0]), v = waNum_(r[1]); if (!(v > 0)) return;
      if (!started) { if (k === baseDate) started = true; return; }
      if (k <= baseDate) return;
      var fl = FL[k] || 0; if (prev > 0) g *= (v - fl) / prev; prev = v;
    });
    rate = g - 1;
  } else rate = (netWorth - baseVal) / baseVal;
  return { since: baseDate, days: days, rate: rate, gain: netWorth - baseVal - F, full: days >= 360, series: series, intraday: intraday, opening: F };
}

// 盤中走勢：每小時一個點（每小時的排程、或打開 App 時記），只留最近 8 天，存在使用者屬性（很小，不用開新分頁）
// 格式：[["2026-10-13 14:00", 淨資產], ...]，同一個小時只留最新的
var WA_INTRA_PROP_ = "NW_INTRADAY";
function waIntradayGet_() {
  try { var a = JSON.parse(PROPS_().getProperty(WA_INTRA_PROP_) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function waIntradayPut_(netWorth) {
  var a = waIntradayGet_();
  if (!(netWorth > 0)) return a;
  try {
    var now = new Date();
    var key = Utilities.formatDate(now, WA_TZ_, "yyyy-MM-dd HH") + ":00";
    var cut = Utilities.formatDate(new Date(now.getTime() - 8 * 86400000), WA_TZ_, "yyyy-MM-dd HH") + ":00";
    a = a.filter(function (p) { return p && p[0] >= cut && p[0] !== key; });
    a.push([key, Math.round(netWorth)]);
    a.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
    PROPS_().setProperty(WA_INTRA_PROP_, JSON.stringify(a));
  } catch (e) { Logger.log("盤中走勢紀錄失敗：" + e); }
  return a;
}

// 推算某一天的淨資產：今天的淨資產 −（那天之後記的收入 − 支出）
// 沒辦法扣掉那天之後股價的漲跌，所以日期越近越準
function waEstimateSnapshot(p) {
  var ss = SS_();
  var date = String(p && p.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("請選日期");
  var inc = 0, exp = 0, n = 0;
  var sh = ss.getSheetByName("收支紀錄");
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
      if (!(r[0] instanceof Date)) return;
      var d = Utilities.formatDate(r[0], WA_TZ_, "yyyy-MM-dd");
      if (d <= date) return;
      var amt = waNum_(r[3]);
      if (String(r[1]).trim() === "收入") inc += amt; else if (String(r[1]).trim() === "支出") exp += amt;
      n++;
    });
  }
  var dash = waGetDashboard();
  var now = dash && dash.perf ? dash.perf.netWorth : 0;
  return { income: inc, expense: exp, count: n, netWorth: now, estimate: Math.round(now - (inc - exp)) };
}

// 重設淨資產成長的起點：清掉所有快照，下次讀取時用「現在的淨資產 − 成本到現在的報酬」重新設起點
// 期初登記（補登保險、存款、黃金、持股）還沒做完前，起點會偏低，登記完按一次就好
function waResetSnapshots() {
  var ss = SS_();
  var sh = ss.getSheetByName(WA_SNAP_SHEET_);
  if (sh && sh.getLastRow() >= 2) sh.deleteRows(2, sh.getLastRow() - 1);
  PROPS_().deleteProperty(WA_INTRA_PROP_); PROPS_().deleteProperty("NW_FLOWS"); PROPS_().deleteProperty("NW_PRE");
  return { message: "已重設起點", detail: "淨資產成長改從現在的成本重新算", dashboard: waGetDashboard() };
}

// 最早一筆交易的日期（沒有交易就用昨天）
function waFirstRecordDate_(ss, today) {
  var first = "";
  var sh = ss.getSheetByName("交易紀錄");
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (!(r[0] instanceof Date)) return;
      var d = Utilities.formatDate(r[0], WA_TZ_, "yyyy-MM-dd");
      if (!first || d < first) first = d;
    });
  }
  if (!first || first >= today) first = Utilities.formatDate(new Date(Date.now() - 86400000), WA_TZ_, "yyyy-MM-dd");
  return first;
}

// 補登過去的淨資產（例如從對帳單、以前的記帳找到的月底數字），線圖和成長率會一起算進去
function waAddSnapshot(p) {
  var ss = SS_();
  var date = String(p.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("請選日期");
  var today = Utilities.formatDate(new Date(), WA_TZ_, "yyyy-MM-dd");
  if (date >= today) throw new Error("只能補登今天以前的日期（今天的會自動記錄）");
  var value = Number(p.value);
  if (!(value > 0)) throw new Error("請輸入那天的淨資產");
  var sh = ss.getSheetByName(WA_SNAP_SHEET_);
  if (!sh) { waGetDashboard(); sh = ss.getSheetByName(WA_SNAP_SHEET_); }
  var last = sh.getLastRow();
  var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
  var key = function (v) { return v instanceof Date ? Utilities.formatDate(v, WA_TZ_, "yyyy-MM-dd") : String(v).trim().replace(/^'/, ""); };
  var found = false;
  rows = rows.map(function (r) { var k = key(r[0]); if (k === date) { found = true; return [k, Math.round(value), "補登"]; } return [k, r[1], r[2]]; });
  if (!found) rows.push([date, Math.round(value), "補登"]);
  rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  sh.getRange(1, 3).setValue("來源");
  sh.getRange(2, 1, rows.length, 3).setValues(rows.map(function (r) { return ["'" + r[0], r[1], r[2]]; }));
  return { message: (found ? "已更新 " : "已補登 ") + date, detail: "淨資產 $" + Math.round(value).toLocaleString(), dashboard: waGetDashboard() };
}

// ---------- 扣除賣出成本後的報酬率（跟證券 App 的算法一樣） ----------
// 假設現在全部賣掉：每檔扣手續費（C21 費率，最低 C23）＋證交稅
//   一般 ETF（00 開頭）0.1%、債券 ETF（B 結尾）0%、個股用 C22（預設 0.3%）
// 分母跟 B15 報酬率一樣（淨投入本金＋另類資產成本），所以兩個數字可以直接比較
function waSellTaxRate_(code, stockRate) {
  var c = String(code || "").toUpperCase().replace(/^[A-Z]+:/, "");
  if (/^00\w*B$/.test(c)) return 0;   // 債券 ETF 目前免證交稅
  if (/^00/.test(c)) return 0.001;     // 一般 ETF
  return stockRate || 0.003;           // 個股
}
function waNetReturn_(holdings, others, totalAssets, returnRate, feeV) {
  var feeRate = waNum_(feeV[0][0]) || 0.001425;
  var stockTax = waNum_(feeV[1][0]) || 0.003;
  var minFee = waNum_(feeV[2][0]) || 20;
  var sellCost = 0;
  holdings.concat(others || []).forEach(function (h) {
    if (!(h.value > 0)) return;
    sellCost += Math.max(minFee, Math.round(h.value * feeRate)) + Math.round(h.value * waSellTaxRate_(h.code, stockTax));
  });
  if (!(returnRate > -1)) return null;
  var base = totalAssets / (1 + returnRate);
  if (!(base > 0)) return null;
  return { rate: (totalAssets - sellCost - base) / base, sellCost: sellCost };
}

// ---------- 所有計算數據（直接讀試算表顯示的格式，以後新增欄位也會自動出現） ----------
// 操作面板：A/B、C/D、E/F、I/J 四組「標題｜數值」；只有標題沒有數值的格子當作分組名稱
// 工作表1：A12:C60 的「名稱｜數值｜說明」，跟操作面板重複的名稱會略過
// 手續費的兩個統計格自己會壞掉，這裡順手修好：
// - B24「累計已繳手續費+稅」：原本是公式，按過「重置」之後被寫成固定的 0，之後就不會再動 → 補回公式（交易紀錄 F 手續費＋G 稅）
// - B12「本月預估未回補手續費」：以前只有手動改「交易紀錄」分頁才會重算，用 App 下單不會 → 每次更新畫面時重算
function waFeeStatsFix_(ss) {
  var sh = ss.getSheetByName("工作表1");
  if (!sh || !ss.getSheetByName("交易紀錄")) return;
  var changed = false;
  var c24 = sh.getRange(R_(24), 1, 1, 2);
  if (/手續費/.test(String(c24.getValue())) && !sh.getRange(R_(24), 2).getFormula()) {
    sh.getRange(R_(24), 2).setFormula("=SUM('交易紀錄'!F2:G)");
    changed = true;
  }
  if (typeof computePendingFeeRebate_ === "function" && /手續費/.test(String(sh.getRange(R_(12), 1).getValue()))) {
    var pending = computePendingFeeRebate_();
    if (pending !== null && Math.abs(waNum_(sh.getRange(R_(12), 2).getValue()) - pending) > 0.5) { sh.getRange(R_(12), 2).setValue(pending); changed = true; }
  }
  if (changed) SpreadsheetApp.flush();
}

function waGetDetails_(ss) {
  try { waFeeStatsFix_(ss); } catch (feeFixErr) { Logger.log("手續費統計修正失敗：" + feeFixErr); }
  var groups = [];
  var seen = {};
  var isUrl = function (s) { return /^https?:\/\//.test(s); };

  var panel = ss.getSheetByName("操作面板");
  if (panel) {
    var pv = panel.getRange(A1_("A11:J40")).getDisplayValues();
    [[0, 1], [2, 3], [4, 5], [8, 9]].forEach(function (pair) {
      var current = null;
      for (var i = 0; i < pv.length; i++) {
        var label = String(pv[i][pair[0]]).trim();
        var value = String(pv[i][pair[1]]).trim();
        if (!label || /^[\d.,%$\-+\s]+$/.test(label)) continue;
        if (!value) { current = { title: label, items: [] }; groups.push(current); continue; }
        if (isUrl(value)) continue;
        if (!current) { current = { title: "操作面板", items: [] }; groups.push(current); }
        current.items.push({ label: label, value: value, note: "" });
        seen[label] = true;
      }
    });
  }
  groups = groups.filter(function (g) { return g.items.length; });

  var sh = ss.getSheetByName("工作表1");
  var sv = sh.getRange(A1_("A12:C60")).getDisplayValues();
  var other = { title: "其他計算數據（工作表1）", items: [] };
  sv.forEach(function (r) {
    var label = String(r[0]).trim(), value = String(r[1]).trim(), note = String(r[2]).trim();
    if (!label || !value || isUrl(value) || seen[label]) return;
    other.items.push({ label: label, value: value, note: isUrl(note) ? "" : note });
  });
  var fee = sh.getRange(A1_("C21:C23")).getDisplayValues();
  other.items.push({ label: "手續費率（全額）", value: fee[0][0], note: "折扣每月另外回補" });
  other.items.push({ label: "證交稅率", value: fee[1][0], note: "" });
  other.items.push({ label: "最低手續費", value: fee[2][0], note: "" });
  groups.push(other);

  var log = ss.getSheetByName(CLOSE_LOG_SHEET_);
  if (log && log.getLastRow() >= 2) {
    var seenDate = {};
    log.getRange(2, 1, log.getLastRow() - 1, 1).getValues().forEach(function (v) { var d = normDate_(v[0]); if (d) seenDate[d] = true; });
    var uniq = Object.keys(seenDate).sort();
    groups.push({ title: "每日收盤價紀錄", items: [
      { label: "已記錄交易日", value: uniq.length + " 天", note: uniq.length >= 3 ? "已可用來算 3 日漲跌" : "滿 3 天後試算會改用紀錄表" },
      { label: "最新一筆", value: uniq[uniq.length - 1] || "—", note: "" }
    ]});
  }
  return groups;
}

// ---------- 買進 / 賣出 ----------
// 先在這裡把會失敗的情況檢查一遍，直接回傳錯誤訊息給畫面；
// 通過後交給原本的 onTradeFormSubmitV2 處理，計算方式跟表單送出完全相同。
function waSubmitTrade(p) {
  var ss = SS_();
  var sh = ss.getSheetByName("工作表1");

  var type = String(p.type || "");
  if (type !== "買進" && type !== "賣出") throw new Error("請選擇買進或賣出");
  var account = waCheckAccountName_(p.account || waStockAccount_(ss) || WA_STOCK_ACCOUNT_);

  var shares = Number(p.shares);
  if (!(shares > 0) || Math.floor(shares) !== shares) throw new Error("股數必須是大於 0 的整數");

  var customRaw = String(p.custom || "").trim();
  var custom = customRaw ? normalizeStockCode_(customRaw) : "";
  if (customRaw && !custom) throw new Error("看不懂這個代號，請輸入例如 2330 或 TPE:2330");

  var code = custom || String(p.code || "").trim();
  if (!code) throw new Error("請選擇標的");

  var codes = sh.getRange(2, 1, LAY().n, 1).getValues();
  var row = -1;
  for (var i = 0; i < LAY().n; i++) {
    if (String(codes[i][0]).trim() === code) { row = i + 2; break; }
  }

  var isNewSlot = false;
  if (row === -1) {
    if (!custom) throw new Error("工作表1 找不到代號 " + code);
    if (type === "賣出") throw new Error("目前沒有持有 " + code + "，無法賣出");
    for (var r = LAY().pickFirst; r <= LAY().last; r++) {
      if (waNum_(sh.getRange(r, 2).getValue()) === 0 && waNum_(sh.getRange(r, 12).getValue()) === 0) { row = r; break; }
    }
    if (row === -1) throw new Error("自選股欄位都已經有持股了。到 ⚙️ 投資標的與目標比例 按「＋ 多一檔自選股」，或在「資產」頁的「個股」按「＋ 登記個股」");
    isNewSlot = true;
  }

  var priceRaw = String(p.price === null || p.price === undefined ? "" : p.price).trim();
  var manual = priceRaw === "" ? null : Number(priceRaw);
  if (manual !== null && !(manual > 0)) throw new Error("成交價格式不正確");
  if (isNewSlot && manual === null) throw new Error("新登記的股票還沒有即時股價，請手動填成交價");

  var price = manual !== null ? manual : waNum_(sh.getRange(row, 3).getValue());
  if (!(price > 0)) throw new Error("目前抓不到即時股價，請手動填成交價");

  var held = waNum_(sh.getRange(row, 2).getValue());
  var cash = waNum_(sh.getRange(R_(10), 4).getValue());
  var feeRate = waNum_(sh.getRange(R_(21), 3).getValue()) || 0.001425;
  var taxRate = waNum_(sh.getRange(R_(22), 3).getValue()) || 0.003;
  var minFee = waNum_(sh.getRange(R_(23), 3).getValue()) || 20;

  var gross = shares * price;
  var fee = Math.max(minFee, Math.round(gross * feeRate));
  var tax = 0, total;
  if (type === "買進") {
    total = gross + fee;
    if (total > cash) {
      throw new Error("現金不足：需要 " + Math.round(total).toLocaleString() + " 元，目前現金 " + Math.round(cash).toLocaleString() + " 元");
    }
  } else {
    if (shares > held) throw new Error("目前只有 " + held + " 股，無法賣出 " + shares + " 股");
    tax = Math.round(gross * taxRate);
    total = gross - fee - tax;
  }

  var nv = {
    "交易類型": [type],
    "標的代號": [code],
    "股數": [String(shares)]
  };
  nv[WA_PRICE_TITLE_] = [manual === null ? "" : String(manual)];
  if (custom) nv[STOCK_FIELD_TITLE_] = [custom];

  onTradeFormSubmitV2({ namedValues: nv });

  var after = waNum_(sh.getRange(row, 2).getValue());
  if (after === held) {
    throw new Error("這筆交易沒有寫入（系統可能正在處理別的操作），請稍後再試，或到信箱查看通知");
  }

  var flowNote = (WA_NAMES_[code] || code) + " " + shares + " 股 @ " + price;
  try {
    waEnsureAccount_(ss, account);
    if (type === "買進") waLogFlow_(ss, "買股", account, "股票:" + code, total, flowNote);
    else waLogFlow_(ss, "賣股", "股票:" + code, account, total, flowNote);
  } catch (flowErr) { Logger.log("交易已完成，但帳戶流水寫入失敗：" + flowErr); }

  // 交易後自動重跑一次試算，S 欄的建議股數會扣掉剛買的量
  if (WA_DEFER_) WA_NEED_TRIAL_ = true; // 交給背景更新時再跑，先讓畫面顯示「完成」
  else { try { buildCombinedReportV4_(); } catch (trialErr) { Logger.log("交易已完成，但自動試算失敗：" + trialErr); } }

  return {
    message: type + " " + (WA_NAMES_[code] || code) + " " + shares + " 股完成",
    detail: "成交價 " + price + "｜手續費 " + fee + (tax ? "｜證交稅 " + tax : "") +
      "｜" + (type === "買進" ? "總支出 " : "實收 ") + Math.round(total).toLocaleString() + " 元",
    dashboard: waGetDashboard()
  };
}

// ---------- 記帳 ----------
function waSubmitLedger(p) {
  var ss = SS_();
  var type = String(p.type || "");
  if (type !== "收入" && type !== "支出") throw new Error("請選擇收入或支出");

  var amount = Number(p.amount);
  if (!(amount > 0)) throw new Error("請輸入大於 0 的金額");

  var category = String(p.category || "").trim();
  if (!category) throw new Error("請選擇分類");
  // 綁定生意的分類（例如芝妮雅）：改記成生意支出
  if (type === "支出" && !p._bound && typeof bizIsBound_ === "function" && bizIsBound_(category) && bizReady_(ss)) return bizBoundSubmit_(p);
  var account = waCheckAccountName_(p.account);
  var when = waEntryWhen_(p.date);
  var backdated = String(p.date || "").trim() && Utilities.formatDate(when, WA_TZ_, "yyyy-MM-dd") !== Utilities.formatDate(new Date(), WA_TZ_, "yyyy-MM-dd");

  // 外幣記帳：支出從外幣餘額扣、收入存進外幣；預算用即時匯率換成台幣
  var fxL = null;
  var curCode = String(p.currency || "TWD").trim().toUpperCase();
  if (curCode && curCode !== "TWD") {
    if (typeof fxLedgerPrep_ !== "function") throw new Error("要先啟用外幣功能");
    if (backdated) throw new Error("外幣記帳還不能補記以前的日期，請用今天的日期記");
    fxL = fxLedgerPrep_(ss, type, curCode, account, amount);
    amount = fxL.twd;
    p.note = (String(p.note || "").trim() ? String(p.note).trim() + " " : "") + fxL.tag;
  }

  var nv = {
    "金額": [String(amount)],
    "類型": [type],
    "備註": [String(p.note || "")]
  };
  if (backdated) nv["日期"] = [String(when.getTime())];
  if (type === "收入") {
    nv["收入分類"] = [category];
  } else {
    nv["支出分類"] = [category];
    nv[WA_ONETIME_TITLE_] = [p.oneTime ? "是" : "否"];
  }

  var ledger = ss.getSheetByName("收支紀錄");
  var before = ledger ? ledger.getLastRow() : 0;

  onExpenseFormSubmitV2({ namedValues: nv }); // 失敗會丟出錯誤，畫面會顯示原因
  if (!p._bound) waLearnCategory_(type === "收入" ? "INCOME_CATEGORIES" : "EXPENSE_CATEGORIES", category); // 「代墊生意」不放進分類按鈕

  ledger = ss.getSheetByName("收支紀錄");
  if (!ledger || ledger.getLastRow() === before) {
    throw new Error("這筆沒有寫入（系統可能正在處理別的操作），請稍後再試");
  }

  if (fxL) {
    fxLedgerApply_(ss, fxL, type, category, String(p.note || ""));
  } else {
    try {
      waEnsureAccount_(ss, account);
      if (type === "支出") waLogFlow_(ss, "支出", account, "支出:" + category, amount, String(p.note || ""), when);
      else waLogFlow_(ss, "收入", "收入:" + category, account, amount, String(p.note || ""), when);
    } catch (flowErr) { Logger.log("記帳已完成，但帳戶流水寫入失敗：" + flowErr); }
  }

  var sh = ss.getSheetByName("工作表1");
  return {
    message: fxL ? type + " " + category + " " + fxL.code + " " + fxL.fx.toLocaleString() + "（≈ 台幣 " + Math.round(amount).toLocaleString() + " 元）已記錄（" + account + "）"
      : type + " " + category + " " + Math.round(amount).toLocaleString() + " 元已記錄（" + account + (backdated ? "・記在 " + Utilities.formatDate(when, WA_TZ_, "M/d") : "") + "）",
    detail: String(sh.getRange(R_(48), 2).getValue() || ""),
    dashboard: p._noDash ? null : waGetDashboard()
  };
}

// ---------- 再平衡試算（跟選單按鈕同一套，會更新S欄） ----------
function waRunTrial() {
  try { if (fixPriceFormulas_()) { SpreadsheetApp.flush(); Utilities.sleep(5000); } } catch (pfE) { Logger.log(pfE); } // 股價公式寫死別檔代號的先改正
  var msg = buildCombinedReportV4_();
  return { report: msg, dashboard: waGetDashboard() };
}

// ============================================================
// 實體帳戶（錢放在哪裡）：現金、永豐大戶、郵局…
// - 「帳戶」分頁：A 帳戶名稱｜B 狀態（使用中 / 未使用）
//   想新增或停用帳戶，可以直接改這個分頁，或在 App 裡按「＋ 新增帳戶」
// - 「帳戶流水」分頁：每一筆錢從哪個帳戶出去、進到哪個帳戶
// 這一層只記錄錢的位置，不影響 D10 / B45 / B16 的預算計算
// ============================================================
var WA_ACCOUNT_SHEET_ = "帳戶";
var WA_FLOW_SHEET_ = "帳戶流水";
var WA_STOCK_ACCOUNT_ = "永豐大戶(日常使用+股票)";
var WA_DEFAULT_ACCOUNTS_ = [
  ["現金", "使用中"],
  [WA_STOCK_ACCOUNT_, "使用中"],
  ["郵局", "未使用"],
  ["中國信託", "未使用"],
  ["富邦", "未使用"]
];

function waCheckAccountName_(name) {
  var n = String(name || "").trim();
  if (!n) throw new Error("請選擇帳戶");
  if (n.length > 30) throw new Error("帳戶名稱太長");
  if (/^(支出|收入|股票|校正):/.test(n)) throw new Error("帳戶名稱不能用這個開頭");
  return n;
}

function waAccountSheet_(ss) {
  var sh = ss.getSheetByName(WA_ACCOUNT_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(WA_ACCOUNT_SHEET_);
    sh.getRange(1, 1, 1, 4).setValues([["帳戶名稱", "狀態（使用中 / 未使用）", "歸屬（個人 / 生意）", "用途（股票交割）"]]);
    sh.getRange(2, 1, WA_DEFAULT_ACCOUNTS_.length, 2).setValues(WA_DEFAULT_ACCOUNTS_);
    sh.setFrozenRows(1);
  }
  if (!String(sh.getRange(1, 5).getValue()).trim()) sh.getRange(1, 5).setValue(WA_ROLE_HEADER_);
  return sh;
}

function waFlowSheet_(ss) {
  var sh = ss.getSheetByName(WA_FLOW_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(WA_FLOW_SHEET_);
    sh.getRange(1, 1, 1, 6).setValues([["日期", "類型", "從", "到", "金額", "說明"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function waAccountList_(ss) {
  return waMemo_("accList", function () { return waAccountListRaw_(ss); });
}
// 帳戶功能（E 欄）：投資｜生活｜混用｜儲蓄｜生意
//   投資＝放投資現金（D10）的帳戶，生活＝放生活費（B45）的帳戶，
//   混用＝投資和生活放在一起（沒填時的預設），儲蓄＝系統外的存款（定存、緊急預備金），不參加對帳
//   中轉＝個人和生意的錢都會經過的帳戶（例如轉帳免手續費的那一家）：付款時個人、生意都能選它，
//         裡面的錢依來源分成「個人的」和「生意的」兩份，各自算回個人對帳和生意現金，不能拿來買股票
var WA_ROLES_ = ["投資", "生活", "混用", "儲蓄", "生意", "中轉"];
var WA_ROLE_HEADER_ = "功能（投資 / 生活 / 混用 / 儲蓄 / 生意 / 中轉）";
function waAccountListRaw_(ss) {
  var sh = waAccountSheet_(ss);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      var scope = String(r[2]).trim() === "生意" ? "生意" : "個人";
      var role = String(r[4]).trim();
      if (scope === "生意") role = "生意";
      else if (WA_ROLES_.indexOf(role) < 0 || role === "生意") role = "混用";
      if (role === "中轉") scope = "中轉";
      return { name: String(r[0]).trim(), active: String(r[1]).trim() !== "未使用", scope: scope,
        stock: String(r[3]).indexOf("交割") >= 0, role: role };
    });
}

// 在 App 裡設定帳戶功能（選「生意」會同時把歸屬改成生意）
function waSetAccountRole(p) {
  if (typeof healthDrop_ === "function") healthDrop_("acc"); // 改帳戶功能會改變對帳的範圍
  var ss = SS_();
  var name = waCheckAccountName_(p.account);
  var role = String(p.role || "");
  if (WA_ROLES_.indexOf(role) < 0) throw new Error("請選擇帳戶功能");
  waEnsureAccount_(ss, name);
  var sh = waAccountSheet_(ss);
  var names = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  var before = null;
  try { before = waRoleCounted_(ss, name); } catch (rc0) { Logger.log(rc0); }
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() === name) {
      sh.getRange(i + 2, 3).setValue(role === "生意" ? "生意" : "個人");
      sh.getRange(i + 2, 5).setValue(role);
      // 記下來：算進個人對帳的錢變了多少（找差額時才講得出「是改了帳戶功能」）
      try {
        if (before && before.role !== role) {
          if (WA_MEMO_) WA_MEMO_ = {};
          var after = waRoleCounted_(ss, name);
          if (Math.abs(after.counted - before.counted) >= 1) {
            var lg = []; try { lg = JSON.parse(PROPS_().getProperty("ACC_ROLE_LOG") || "[]"); } catch (le) {}
            lg.push({ t: Date.now(), name: name, from: before.role, to: role, before: before.counted, after: after.counted });
            PROPS_().setProperty("ACC_ROLE_LOG", JSON.stringify(lg.slice(-30)));
          }
        }
      } catch (rc1) { Logger.log(rc1); }
      return { message: name + " 設為「" + role + "」", detail: role === "儲蓄" ? "儲蓄帳戶不參加對帳，只顯示餘額" : role === "中轉" ? "個人和生意付款時都可以選這個帳戶，不能拿來買股票" : "", dashboard: waGetDashboard() };
    }
  }
  throw new Error("找不到帳戶 " + name);
}

// 這個帳戶有多少錢算進「個人對帳」：生意、儲蓄＝0；中轉＝個人的那份；其他＝全部
function waRoleCounted_(ss, name) {
  var a = waAccountBalancesRaw_(ss).filter(function (x) { return x.name === name; })[0];
  if (!a) return { role: "", counted: 0 };
  var role = a.scope === "生意" ? "生意" : (a.role || "混用");
  var counted = role === "生意" || role === "儲蓄" ? 0 : a.scope === "中轉" ? (a.ownPart || 0) : a.balance;
  return { role: role, counted: Math.round(counted * 100) / 100 };
}

function waEnsureAccount_(ss, name, scope) {
  var list = waAccountList_(ss);
  for (var i = 0; i < list.length; i++) if (list[i].name === name) return;
  waAccountSheet_(ss).appendRow([name, "使用中", scope === "生意" ? "生意" : "個人", ""]);
}

// 常用帳戶：看帳戶流水最近 600 筆，每種動作（支出從哪付、收入進哪、轉帳…）各帳戶用了幾次；越近的算越重（60 天減半）
// 支出、收入另外照分類記（例如「午餐」大多用現金）。回傳 { "支出:from": {帳戶: 分數}, "支出:午餐:from": {...}, ... }
function waAccUsage_(ss) {
  var sh = ss.getSheetByName(WA_FLOW_SHEET_); if (!sh || sh.getLastRow() < 2) return {};
  var last = sh.getLastRow(), start = Math.max(2, last - 599), now = Date.now(), out = {};
  var add = function (k, acc, w) { if (!acc || acc.indexOf(":") >= 0 || acc === "提領到個人") return; var m = out[k] || (out[k] = {}); m[acc] = (m[acc] || 0) + w; }; // 「支出:午餐」「股票:0050」這種不是帳戶，跳過
  sh.getRange(start, 1, last - start + 1, 4).getValues().forEach(function (r) {
    var t = r[0] instanceof Date ? r[0].getTime() : now, w = Math.pow(0.5, Math.max(0, now - t) / (60 * 86400000));
    var type = String(r[1] || ""), from = String(r[2] || "").trim(), to = String(r[3] || "").trim();
    if (!type || /^歸屬/.test(type) || type === "校正") return;
    add(type + ":from", from, w); add(type + ":to", to, w);
    if (type === "支出" && to.indexOf("支出:") === 0) add("支出:" + to.slice(3) + ":from", from, w);
    if (type === "收入" && from.indexOf("收入:") === 0) add("收入:" + from.slice(3) + ":to", to, w);
  });
  Object.keys(out).forEach(function (k) { Object.keys(out[k]).forEach(function (a) { out[k][a] = Math.round(out[k][a] * 100) / 100; }); });
  return out;
}
function waLogFlow_(ss, type, from, to, amount, note, when) {
  waFlowSheet_(ss).appendRow([when instanceof Date ? when : new Date(), type, from, to, Math.round(Number(amount) * 100) / 100, note || ""]);
}

// 補記日期："yyyy-MM-dd" → 那一天、現在這個時分秒（台北時間）。留空或今天＝現在；未來或太久以前會擋掉
function waEntryWhen_(day) {
  var now = new Date();
  day = String(day || "").trim();
  if (!day) return now;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("日期格式不正確");
  var today = Utilities.formatDate(now, WA_TZ_, "yyyy-MM-dd");
  if (day === today) return now;
  if (day > today) throw new Error("日期不能選未來");
  var when = new Date(day + "T" + Utilities.formatDate(now, WA_TZ_, "HH:mm:ss") + "+08:00");
  if (isNaN(when.getTime())) throw new Error("日期格式不正確");
  if (now.getTime() - when.getTime() > 366 * 86400000) throw new Error("日期最多只能補記一年內");
  return when;
}

// 帳戶流水全部列（同一次讀取只讀一次）
function waFlowRows_(ss) {
  return waMemo_("flowRows", function () {
    var sh = waFlowSheet_(ss);
    return sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues() : [];
  });
}

function waAccountBalances_(ss) {
  return waMemo_("accBal", function () { return waAccountBalancesRaw_(ss); });
}
function waAccountBalancesRaw_(ss) {
  var list = waAccountList_(ss);
  var bal = {}, scopeOf = {}, biz = {};
  list.forEach(function (a) { bal[a.name] = 0; scopeOf[a.name] = a.scope; if (a.scope === "中轉") biz[a.name] = 0; });
  waFlowRows_(ss).forEach(function (r) {
    var type = String(r[1]).trim(), from = String(r[2]).trim(), to = String(r[3]).trim(), amt = waNum_(r[4]);
    if (bal.hasOwnProperty(from)) bal[from] -= amt;
    if (bal.hasOwnProperty(to)) bal[to] += amt;
    // 中轉帳戶：裡面的錢哪些是生意的（從生意帳戶轉來、營收收進來的；付生意的支出、轉回生意帳戶就減掉）
    if (from === to) { if (biz.hasOwnProperty(from)) { if (type === "歸屬→生意") biz[from] += amt; else if (type === "歸屬→個人") biz[from] -= amt; } return; }
    if (biz.hasOwnProperty(to) && (scopeOf[from] === "生意" || from.indexOf("營收:") === 0)) biz[to] += amt;
    if (biz.hasOwnProperty(from) && (scopeOf[to] === "生意" || /^(進貨|費用|生意資產):/.test(to) || to === "提領到個人")) biz[from] -= amt;
  });
  return list.map(function (a) {
    var o = { name: a.name, active: a.active, scope: a.scope, role: a.role, balance: Math.round(bal[a.name] * 100) / 100 };
    if (a.scope === "中轉") { o.bizPart = Math.round(biz[a.name] * 100) / 100; o.ownPart = Math.round((o.balance - o.bizPart) * 100) / 100; }
    return o;
  });
}

function waRecentFlows_(ss, n) {
  return waLastRows_(waFlowSheet_(ss), 6, n).map(function (r) {
    return { date: waDate_(r[0]), type: String(r[1]), from: String(r[2]), to: String(r[3]), amount: waNum_(r[4]), note: String(r[5] || "") };
  });
}

// 轉帳：例如把現金存進永豐大戶。只改變錢放的位置，不影響總資產和預算
function waSubmitTransfer(p) {
  var ss = SS_();
  var from = waCheckAccountName_(p.from);
  var to = waCheckAccountName_(p.to);
  if (from === to) throw new Error("轉出和轉入不能是同一個帳戶");
  var amount = Number(p.amount);
  if (!(amount > 0)) throw new Error("請輸入大於 0 的金額");

  var sc = {};
  waAccountList_(ss).forEach(function (a) { sc[a.name] = a.scope; });
  if ((sc[from] === "生意" && (sc[to] || "個人") === "個人") || ((sc[from] || "個人") === "個人" && sc[to] === "生意"))
    throw new Error("個人和生意帳戶之間不能直接轉帳：生意的錢要給個人，請到「生意 → 提領」");

  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    waEnsureAccount_(ss, from);
    waEnsureAccount_(ss, to);
    waLogFlow_(ss, "轉帳", from, to, amount, String(p.note || ""));
  } finally {
    lock.releaseLock();
  }
  return {
    message: from + " → " + to + " " + Math.round(amount).toLocaleString() + " 元",
    detail: "只移動錢的位置，總資產不變",
    dashboard: waGetDashboard()
  };
}

// 中轉帳戶：把裡面的一部分錢改成「生意的」或「個人的」（錢沒有動，只改算在誰那邊）
// p: { account, amount, to: "生意" | "個人" }
function waTransitReclass(p) {
  var ss = SS_();
  var name = waCheckAccountName_(p.account);
  var amount = Number(p.amount);
  if (!(amount > 0)) throw new Error("請輸入大於 0 的金額");
  var to = p.to === "生意" ? "生意" : "個人";
  var acc = waAccountBalances_(ss).filter(function (a) { return a.name === name; })[0];
  if (!acc || acc.scope !== "中轉") throw new Error(name + " 不是中轉帳戶");
  var lock = LOCK_();
  lock.waitLock(10000);
  try { waLogFlow_(ss, "歸屬→" + to, name, name, amount, "調整歸屬"); } finally { lock.releaseLock(); }
  return { message: name + "：" + Math.round(amount).toLocaleString() + " 元改算" + to + "的", detail: "錢沒有動，只是改算在誰那邊", dashboard: waGetDashboard() };
}

// 校正餘額：輸入帳戶實際餘額，自動補一筆差額（第一次使用時設定期初餘額也用這個）
function waAdjustBalance(p) {
  var ss = SS_();
  var name = waCheckAccountName_(p.account);
  var actual = Number(p.actual);
  if (!isFinite(actual)) throw new Error("請輸入實際餘額");

  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    waEnsureAccount_(ss, name);
    var current = 0;
    waAccountBalances_(ss).forEach(function (a) { if (a.name === name) current = a.balance; });
    var delta = Math.round((actual - current) * 100) / 100;
    if (delta === 0) return { message: name + " 餘額本來就是 " + actual.toLocaleString() + "，不用校正", detail: "", dashboard: waGetDashboard() };
    // 這個帳戶以前有沒有校正過（第一次校正＝設定期初餘額，不是真的花掉／賺到）
    var fsh0 = waFlowSheet_(ss), fl0 = fsh0.getLastRow() >= 2 ? fsh0.getRange(2, 1, fsh0.getLastRow() - 1, 4).getValues() : [];
    var first = !fl0.some(function (r) { return String(r[1]).trim() === "校正" && (String(r[2]) === name || String(r[3]) === name); });
    if (delta > 0) waLogFlow_(ss, "校正", "校正:差額", name, delta, "校正為 " + actual);
    else waLogFlow_(ss, "校正", name, "校正:差額", -delta, "校正為 " + actual);
    var calRow = waFlowSheet_(ss).getLastRow();
  } finally {
    lock.releaseLock();
  }
  // 差額怎麼處理（p.how）：spend＝沒記到的收支，補記成分類（第一次校正自動改成帳務調整）；adjust＝帳務調整（不算收支）；其他／沒給＝先不管，留在對帳的差額
  var acc = waAccountList_(ss).filter(function (a) { return a.name === name; })[0] || {};
  var counted = (acc.scope === "個人" || acc.scope === "中轉" || !acc.scope) && acc.role !== "儲蓄";
  if (counted && (p.how === "spend" || p.how === "adjust")) {
    var adj = p.how === "adjust" || first;
    var r = waReconAbsorb({ row: calRow, category: String(p.category || "").trim() || "其他", adjust: adj });
    return { message: name + " 已校正為 " + actual.toLocaleString() + " 元", detail: (adj ? "差額 " : "差額補記成" + (delta > 0 ? "收入" : "支出") + "「" + (String(p.category || "").trim() || "其他") + "」") + (adj ? Math.abs(delta).toLocaleString() + " 記成帳務調整" + (first && p.how === "spend" ? "（第一次校正＝設定餘額，不算收支）" : "") : " $" + Math.abs(delta).toLocaleString()) + "，系統記錄跟著改，對帳不會出現差額", dashboard: r.dashboard };
  }
  return { message: name + " 已校正為 " + actual.toLocaleString() + " 元", detail: counted ? "差額 " + (delta > 0 ? "+" : "−") + Math.abs(delta).toLocaleString() + " 先留著，之後在「一鍵找差額」處理" : "", dashboard: waGetDashboard() };
}

// 股票交割戶：「帳戶」分頁 D 欄寫「股票交割」的那一個；沒有標記時用預設名稱（如果存在）
function waStockAccount_(ss) {
  var list = waAccountList_(ss);
  for (var i = 0; i < list.length; i++) if (list[i].stock) return list[i].name;
  for (var j = 0; j < list.length; j++) if (list[j].name === WA_STOCK_ACCOUNT_) return list[j].name;
  return "";
}

// ============================================================
// 分批進場的「本期額度」：最近幾天已經買過的股數，會從試算建議裡扣掉
// computeRebalancePlan_() 會用到（程式碼.gs）
// ============================================================
// 一期 = 一個禮拜（週一 00:00 到週日，台北時間）。回傳這一期開始的時間。
function entryPeriodStart_() {
  var tz = "Asia/Taipei";
  var now = new Date();
  var dow = Number(Utilities.formatDate(now, tz, "u")); // 1=週一 … 7=週日
  var midnight = new Date(Utilities.formatDate(now, tz, "yyyy-MM-dd") + "T00:00:00+08:00");
  return new Date(midnight.getTime() - (dow - 1) * 86400000);
}

// 從 since 之後各檔已經買進的股數
function recentBuySharesByCode_(since) {
  var map = {};
  var sh = SS_().getSheetByName("交易紀錄");
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().forEach(function (r) {
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(d.getTime()) || d < since) return;
    if (String(r[8]).trim() !== "買進") return;
    var code = String(r[1]).trim();
    map[code] = (map[code] || 0) + (Number(r[2]) || 0);
  });
  return map;
}

// 記住新的收支分類（不靠 Google 表單，App 下次就會出現）
function waLearnCategory_(key, cat) {
  try {
    var props = PROPS_();
    var list = JSON.parse(props.getProperty(key) || "[]");
    if (!list.length) list = key === "INCOME_CATEGORIES" ? ["薪水", "獎金", "其他"] : ["餐飲", "交通", "日常用品", "娛樂", "醫療", "其他"];
    if (list.indexOf(cat) === -1) { list.push(cat); props.setProperty(key, JSON.stringify(list)); }
  } catch (e) { Logger.log("分類記憶失敗：" + e); }
}

// ============================================================
// 另類資產（保險、收藏品、其他）：在 App 新增、修改、刪除
// 欄位：A 名稱｜B 類別｜C 目前估值｜D 估值日期｜E 備註｜F 最後更新｜G 購買成本
// ============================================================
var WA_BIZ_ALT_SHEET_ = "生意資產";
function waBizAltSheet_(ss, create) {
  var sh = ss.getSheetByName(WA_BIZ_ALT_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(WA_BIZ_ALT_SHEET_);
    sh.getRange(1, 1, 1, 10).setValues([["名稱", "類別", "目前估值", "估值日期", "備註", "最後更新", "購買成本", "幣別", "外幣價值", "外幣成本"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
// p.scope：個人（預設，算進總資產）｜生意（用生意的錢買的，另外放，不算進個人總資產）
// p.fromScope：修改時原本放在哪一邊（改歸屬會搬過去）；p.payAccount：新增生意資產時從哪個生意帳戶付（選填）
function waSaveAltItem(p) {
  var ss = SS_();
  var toBiz = String(p.scope || "") === "生意";
  var fromBiz = p.row ? String(p.fromScope || p.scope || "") === "生意" : toBiz;
  var src = fromBiz ? waBizAltSheet_(ss, true) : ss.getSheetByName("另類資產");
  var sh = toBiz ? waBizAltSheet_(ss, true) : ss.getSheetByName("另類資產");
  if (!sh || !src) throw new Error("找不到「另類資產」分頁");
  var name = String(p.name || "").trim();
  if (!name) throw new Error("請輸入名稱");
  var cat = String(p.category || "").trim() || "其他";
  if (cat === "股票") throw new Error("股票請到「資產」頁的「個股」登記");
  var value = Number(p.value);
  if (!(value >= 0)) throw new Error("目前價值要是 0 以上的數字");
  var cost = String(p.cost === null || p.cost === undefined ? "" : p.cost).trim();
  if (cost !== "" && !(Number(cost) >= 0)) throw new Error("成本格式不正確");
  var row = Number(p.row) || sh.getLastRow() + 1;
  if (p.row) {
    if (!(row >= 2 && row <= src.getLastRow())) throw new Error("找不到這一筆");
    if (String(src.getRange(row, 2).getValue()).trim() === "股票") throw new Error("股票請到「資產」頁的「個股」修改");
    if (src.getSheetId() !== sh.getSheetId()) { src.deleteRow(row); row = sh.getLastRow() + 1; } // 改歸屬：搬到另一邊
  }
  var payAcc = !p.row && toBiz ? String(p.payAccount || "").trim() : "";
  var oldName = p.row && src.getSheetId() === sh.getSheetId() ? String(sh.getRange(row, 1).getValue()).trim() : (p.row ? String(p.oldName || "").trim() : "");
  var now = new Date();
  var cur = String(p.currency || "").trim().toUpperCase();
  if (cur === "TWD") cur = "";
  // 球員卡：K 欄存 eBay 搜尋字（ebay:…）、L 欄存等級（RAW／PSA 6…）。價格由「更新卡片價格」從 eBay 成交帶回來，這裡不抓
  var pUrl = String(p.priceUrl || "").trim(), pGrade = String(p.priceGrade || "").trim();
  if (pUrl && !/^ebay:/i.test(pUrl)) pUrl = ""; // 舊版的報價網址（SportsCardsPro）不再使用
  var savePrice = function () {
    if (p.priceUrl === undefined && !p.row) return;
    if (p.priceUrl === undefined) return; // 舊版畫面沒有這個欄位：不動原本的設定
    if (sh.getMaxColumns() < 13) sh.insertColumnsAfter(sh.getMaxColumns(), 13 - sh.getMaxColumns());
    if (!String(sh.getRange(1, 11).getValue()).trim()) sh.getRange(1, 11, 1, 3).setValues([["報價網址", "報價等級", "最後報價"]]).setFontWeight("bold");
    sh.getRange(row, 11, 1, 2).setValues([[pUrl, pUrl ? pGrade : ""]]);
    if (!pUrl) sh.getRange(row, 13).setValue("");
  };
  if (cur) {
    // 外幣保單：H 幣別｜I 外幣價值｜J 外幣成本，C、G 自動用即時匯率換成台幣
    if (typeof fxRates_ !== "function") throw new Error("要先安裝外幣功能（Fx.gs）才能登記外幣保單");
    if (!/^[A-Z]{3}$/.test(cur)) throw new Error("幣別請用代碼，例如 USD");
    var rate = fxRates_().rates[cur];
    if (!(rate > 0)) throw new Error("抓不到 " + cur + " 的匯率");
    var costTwd = String(p.costCur || "") === "TWD"; // 成本是用台幣付的：G 欄直接記台幣，J 欄留空（之後匯率變動也不會動到成本）
    sh.getRange(row, 1, 1, 10).setValues([[name, cat, Math.round(value * rate), now, String(p.note || ""), now,
      cost === "" ? "" : costTwd ? Math.round(Number(cost)) : Math.round(Number(cost) * rate), cur, value, cost === "" || costTwd ? "" : Number(cost)]]);
    waAltPay_(ss, payAcc, name, cost === "" ? value * rate : costTwd ? Number(cost) : Number(cost) * rate);
    savePrice(); waAltPolSave_(sh, row, cat === "保險" ? p.pol : null); waAltSpecSave_(sh, row, cat, p);
    altHistAfterSave_(ss, oldName, name, fromBiz, toBiz);
    return { message: (p.row ? "已更新 " : "已新增 ") + name, detail: cur + " " + value.toLocaleString() + " ≈ 台幣 " + Math.round(value * rate).toLocaleString() + " 元（匯率 " + rate.toFixed(3) + "，每小時自動更新）", dashboard: waGetDashboard() };
  }
  sh.getRange(row, 1, 1, 10).setValues([[name, cat, value, now, String(p.note || ""), now, cost === "" ? "" : Number(cost), "", "", ""]]);
  waAltPay_(ss, payAcc, name, cost === "" ? value : Number(cost));
  savePrice(); waAltPolSave_(sh, row, cat === "保險" ? p.pol : null); waAltSpecSave_(sh, row, cat, p);
  altHistAfterSave_(ss, oldName, name, fromBiz, toBiz);
  return { message: (p.row ? "已更新 " : "已新增 ") + name, detail: (toBiz ? "生意資產・" : "") + "目前價值 " + Math.round(value).toLocaleString() + " 元" + (payAcc ? "・已從 " + payAcc + " 扣款" : ""), dashboard: waGetDashboard() };
}
// 保單資料（O 欄，JSON）：都是選填的備註
function waAltPol_(cell) {
  var o = null; try { o = JSON.parse(String(cell || "") || "null"); } catch (e) { o = null; }
  if (!o || typeof o !== "object") return null;
  var n = function (x) { x = Number(x); return isFinite(x) && x > 0 ? x : 0; }, d = function (x) { x = String(x || ""); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ""; };
  var g = o.gRate === null || o.gRate === undefined || o.gRate === "" ? null : Number(o.gRate);
  var tbl = (Array.isArray(o.tbl) ? o.tbl : []).filter(function (r) { return Array.isArray(r) && n(r[0]) && n(r[0]) <= 100 && n(r[1]); }).slice(0, 40).map(function (r) { return [Math.round(n(r[0])), n(r[1])]; });
  return { type: ["save", "life", "annuity", "ilp", "pure"].indexOf(o.type) >= 0 ? o.type : "", sa: n(o.sa), death: n(o.death), mat: d(o.mat), matAmt: n(o.matAmt), paid: !!o.paid, vdate: d(o.vdate),
    prem: n(o.prem), payYrs: n(o.payYrs) <= 50 ? n(o.payYrs) : 0, gRate: g !== null && isFinite(g) && g >= 0 && g <= 10 ? g : null, decl: n(o.decl) <= 15 ? n(o.decl) : 0, payout: n(o.payout),
    link: ["stock", "bal", "bond", "mm"].indexOf(o.link) >= 0 ? o.link : "", fee: n(o.fee) <= 10 ? n(o.fee) : 0, tbl: tbl };
}
function waAltPolSave_(sh, row, pol) {
  if (pol === undefined) return; // 舊版畫面：不動
  if (!pol && sh.getMaxColumns() < 15) return;
  if (sh.getMaxColumns() < 15) sh.insertColumnsAfter(sh.getMaxColumns(), 15 - sh.getMaxColumns());
  if (!String(sh.getRange(1, 15).getValue()).trim()) sh.getRange(1, 15).setValue("保單資料").setFontWeight("bold");
  var c = pol ? waAltPol_(JSON.stringify(pol)) : null, any = c && (c.type || c.sa || c.death || c.mat || c.matAmt || c.paid || c.vdate || c.prem || c.gRate !== null || c.tbl.length);
  sh.getRange(row, 15).setValue(any ? JSON.stringify(c) : "");
}
// 收藏品各種類的資料（藝術家、品牌、年份…）：跟保單資料共用 O 欄（保險以外的才用），存 {"spec":{…}}
function waAltSpecSave_(sh, row, cat, p) {
  if (cat === "保險" || p.spec === undefined) return;
  var o = {};
  if (p.spec && typeof p.spec === "object") Object.keys(p.spec).slice(0, 15).forEach(function (k) { var v = String(p.spec[k] == null ? "" : p.spec[k]).trim().slice(0, 60); if (/^[a-z]{1,12}$/.test(k) && v) o[k] = v; });
  if (sh.getMaxColumns() < 15) sh.insertColumnsAfter(sh.getMaxColumns(), 15 - sh.getMaxColumns());
  if (!String(sh.getRange(1, 15).getValue()).trim()) sh.getRange(1, 15).setValue("保單資料").setFontWeight("bold");
  sh.getRange(row, 15).setValue(Object.keys(o).length ? JSON.stringify({ spec: o }) : "");
  // 自己新增的分類：通知管理員，之後做那一類專用的表格和自動查價
  if (p.newCat) { try { if (typeof admOn_ === "function" && admOn_()) admLocked_(function () { admProps_().setProperty("ADM_F_" + Date.now().toString(36), JSON.stringify({ t: admNow_(), who: admEmail_(), ver: LIB_VERSION_, text: "【新分類】有人在另類資產新增了「" + cat + "」：" + String(p.name || "") + "（價值 " + Math.round(Number(p.value) || 0) + "）" + (Object.keys(o).length ? "，資料：" + JSON.stringify(o) : "") + "。可以做這一類專用的表格和自動查價。", read: false, reply: "", replyAt: "" })); admTrim_("ADM_F_", 100); return true; }); } catch (e) { Logger.log(e); } }
}
// 用生意帳戶的錢買（例如保費）：從那個帳戶扣掉，錢只是換個地方放，不算費用
function waAltPay_(ss, acc, name, twd) {
  if (!acc || !(twd > 0)) return;
  waEnsureAccount_(ss, acc, "生意");
  waLogFlow_(ss, "生意資產", acc, "生意資產:" + name, Math.round(twd), "買入 " + name);
}

// 繳保費／加碼：成本增加，錢從選的地方扣（外幣餘額或帳戶），不算生意費用、也不算個人收入
// p: { row, scope, amount（保單幣別）, source: "fx:<外幣列>"｜"acc:<帳戶>"｜"", value（繳完後的解約金，選填） }
function waAltPremium(p) {
  var ss = SS_();
  var sh = ss.getSheetByName(String(p.scope || "") === "生意" ? WA_BIZ_ALT_SHEET_ : "另類資產");
  var row = Number(p.row);
  if (!sh || !(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這一筆");
  var v = sh.getRange(row, 1, 1, 10).getValues()[0];
  if (String(v[1]).trim() === "股票") throw new Error("股票請到「資產」頁的「個股」修改");
  var name = String(v[0]);
  var amt = Number(p.amount);
  if (!(amt > 0)) throw new Error("請輸入金額");
  var cur = waAltCur_(v);
  var rate = 1;
  if (cur) { rate = fxRates_().rates[cur]; if (!(rate > 0)) throw new Error("抓不到 " + cur + " 的匯率"); }
  var twd = Math.round(amt * rate);
  var src = String(p.source || ""), note = "";
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    if (src.indexOf("fx:") === 0) {
      var x = fxFind_(ss, src.slice(3));
      if (x.code !== (cur || "TWD")) throw new Error("這筆外幣是" + fxLabel_(x.code) + "，跟保單的幣別不一樣");
      if (amt > x.balance + 1e-9) throw new Error(x.bank + " " + fxLabel_(x.code) + " 餘額只有 " + x.balance.toLocaleString());
      var cOut = x.balance > 0 ? Math.round(x.cost * amt / x.balance) : 0;
      var fsh = fxSheet_(ss);
      fsh.getRange(x.row, 3, 1, 2).setValues([[x.balance - amt, Math.max(0, x.cost - cOut)]]);
      fsh.getRange(x.row, 7).setValue(new Date());
      fxLog_(ss, x.bank, x.code, "繳保費", -amt, -cOut, name);
      waLogFlow_(ss, "保費", fxFlowName_(x), "另類資產:" + name, twd, cur + " " + amt);
      note = "從 " + x.bank + " " + fxLabel_(x.code) + " 扣 " + amt.toLocaleString();
    } else if (src.indexOf("acc:") === 0) {
      var acc = waCheckAccountName_(src.slice(4));
      var info = waAccountList_(ss).filter(function (a) { return a.name === acc; })[0];
      if (!info) throw new Error("找不到帳戶 " + acc);
      waLogFlow_(ss, "保費", acc, "另類資產:" + name, twd, cur ? cur + " " + amt : "");
      note = "從 " + acc + " 扣 " + twd.toLocaleString() + " 元";
      // 從個人的投資／生活／混用帳戶付：錢從預算裡移到保單，投資現金和本金一起減
      if (info.scope !== "生意" && (info.role === "投資" || info.role === "生活" || info.role === "混用")) {
        var st = waLedgerAdjust_(ss, -twd, -twd);
        waLedgerSettle_(ss, st);
      }
    }
    var now = new Date();
    if (cur) {
      var fxCost = waNum_(v[9]) + amt;
      sh.getRange(row, 10).setValue(fxCost);
      sh.getRange(row, 7).setValue(Math.round(fxCost * rate));
      if (p.value !== "" && p.value !== null && p.value !== undefined && Number(p.value) >= 0) { sh.getRange(row, 9).setValue(Number(p.value)); sh.getRange(row, 3).setValue(Math.round(Number(p.value) * rate)); sh.getRange(row, 4).setValue(now); }
    } else {
      sh.getRange(row, 7).setValue(waNum_(v[6]) + amt);
      if (p.value !== "" && p.value !== null && p.value !== undefined && Number(p.value) >= 0) { sh.getRange(row, 3).setValue(Number(p.value)); sh.getRange(row, 4).setValue(now); }
    }
    sh.getRange(row, 6).setValue(now);
  } finally {
    lock.releaseLock();
  }
  return { message: name + " 繳保費 " + (cur ? cur + " " : "") + amt.toLocaleString(), detail: note || "只增加成本，沒有扣款", dashboard: waGetDashboard() };
}

// 外幣保單的幣別（非股票列的 H 欄是 3 個英文字母）
function waAltCur_(v) {
  if (String(v[1]).trim() === "股票") return "";
  var c = String(v[7] || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : "";
}
// 用最新匯率重算外幣保單的台幣價值（C）和台幣成本（G），有變才寫入
function waAltFxRefresh_(ss) {
  if (typeof fxRates_ !== "function") return;
  waAltFxRefreshSheet_(ss.getSheetByName("另類資產"));
  waAltFxRefreshSheet_(ss.getSheetByName(WA_BIZ_ALT_SHEET_));
}
function waAltFxRefreshSheet_(sh) {
  if (!sh || sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var data = sh.getRange(2, 1, n, 10).getValues();
  if (!data.some(function (v) { return waAltCur_(v); })) return;
  var rates = fxRates_().rates;
  data.forEach(function (v, i) {
    var cur = waAltCur_(v);
    if (!cur || !(rates[cur] > 0)) return;
    var c = Math.round(waNum_(v[8]) * rates[cur]);
    var g = v[9] === "" ? "" : Math.round(waNum_(v[9]) * rates[cur]);
    if (c !== waNum_(v[2])) sh.getRange(i + 2, 3).setValue(c);
    if (v[9] === "") return; // 成本是用台幣記的（或沒填）：不動 G 欄
    var gChanged = g === "" ? v[6] !== "" : (v[6] === "" || waNum_(v[6]) !== g);
    if (gChanged) sh.getRange(i + 2, 7).setValue(g);
  });
}

// ============================================================
// 球員卡價格：由使用者自己的瀏覽器（卡片報價小幫手）去 130point 查成交，結果交回 App 寫入。伺服器這邊不抓任何網站。
// 另類資產 K 搜尋字（ebay:…）｜L 等級｜M 最後一筆成交｜N 上次查價時間
// ============================================================
// 每天記一筆另類資產的價值走勢（掛在每天 15 點的排程上）
function cardPriceDaily_() {
  try { waAltFxRefresh_(SS_()); altHistRecord_(SS_()); } catch (e2) { Logger.log("另類資產走勢紀錄失敗：" + e2); }
  try { priceBackupRefresh_(); } catch (e3) { Logger.log("股價備援失敗：" + e3); }
}

// 把小幫手查到、確認過（或夠有把握）的成交價寫進去
// p.items: [{ row, scope, price, cur（TWD／USD…）, date, title }]
// 自動查價時「不夠有把握、留給使用者自己選」的成交，存在這個分頁，哪一台裝置開 App 都看得到
var WA_CARD_PENDING_SHEET_ = "卡片待確認";
function waCardPendingSheet_(ss, create) {
  var sh = ss.getSheetByName(WA_CARD_PENDING_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(WA_CARD_PENDING_SHEET_);
    sh.getRange(1, 1, 1, 5).setValues([["歸屬", "列", "名稱", "時間", "候選成交（系統用）"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function waCardPending_(ss) {
  var sh = waCardPendingSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2) return [];
  var out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) {
    if (!r[1]) return;
    var opts = [];
    try { opts = JSON.parse(String(r[4] || "[]")); } catch (e) {}
    if (Array.isArray(opts) && opts.length) out.push({ s: String(r[0]) === "生意" ? "生意" : "個人", r: Number(r[1]), n: String(r[2]), at: waDate_(r[3]), opts: opts });
  });
  return out;
}
// keys: [{ row, scope }] 這幾張從待確認拿掉
function waCardPendingRemove_(ss, keys) {
  var sh = waCardPendingSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2 || !keys.length) return;
  var k = {};
  keys.forEach(function (x) { k[(String(x.scope || "") === "生意" ? "生意" : "個人") + "|" + Number(x.row)] = 1; });
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (k[(String(vals[i][0]) === "生意" ? "生意" : "個人") + "|" + Number(vals[i][1])]) sh.deleteRow(i + 2);
}
// p: { items: 要寫入的價格, checked: [{row,scope}] 這次有查過的卡（記下查價時間，3 天內不再查）,
//      pending: [{row,scope,name,opts}] 留給使用者確認的, clearPending: [{row,scope}] 使用者已經看過的 }
function waCardInboxApply(p) {
  var ss = SS_(), items = Array.isArray(p && p.items) ? p.items : [], ok = 0, fail = [];
  var checked = Array.isArray(p && p.checked) ? p.checked : [], pending = Array.isArray(p && p.pending) ? p.pending : [], clearP = Array.isArray(p && p.clearPending) ? p.clearPending : [];
  var rates = {};
  try { rates = fxRates_().rates || {}; } catch (e) {}
  var lock = LOCK_();
  lock.waitLock(15000);
  try {
    items.forEach(function (it) {
      try {
        var sh = ss.getSheetByName(String(it.scope || "") === "生意" ? WA_BIZ_ALT_SHEET_ : "另類資產"), row = Number(it.row);
        if (!sh || !(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這一筆");
        var price = Number(it.price), cur = String(it.cur || "TWD").toUpperCase();
        if (!(price > 0)) throw new Error("價格不正確");
        if (sh.getMaxColumns() < 13) sh.insertColumnsAfter(sh.getMaxColumns(), 13 - sh.getMaxColumns());
        var v = sh.getRange(row, 1, 1, 10).getValues()[0], now = new Date(), oldCur = waAltCur_(v);
        // 成本：原本是外幣成本（J 欄）而現在改記台幣 → 先把成本換成台幣固定下來
        if (cur === "TWD") {
          var g = v[6];
          if (oldCur && v[9] !== "" && rates[oldCur] > 0) g = Math.round(waNum_(v[9]) * rates[oldCur]);
          sh.getRange(row, 3).setValue(Math.round(price));
          sh.getRange(row, 7, 1, 4).setValues([[g, "", "", ""]]);
        } else {
          if (!(rates[cur] > 0)) throw new Error("抓不到 " + cur + " 的匯率");
          // 成本維持台幣（G 欄），J 欄留空，匯率變動不會動到成本
          var g2 = v[6];
          if (oldCur && v[9] !== "" && rates[oldCur] > 0) g2 = Math.round(waNum_(v[9]) * rates[oldCur]);
          sh.getRange(row, 3).setValue(Math.round(price * rates[cur]));
          sh.getRange(row, 7, 1, 4).setValues([[g2, cur, price, ""]]);
        }
        sh.getRange(row, 4).setValue(now); sh.getRange(row, 6).setValue(now);
        sh.getRange(row, 13).setValue(String(it.date || "").slice(0, 10) + " 成交 " + (cur === "TWD" ? "NT$" : cur + " ") + price + " " + String(it.title || "").slice(0, 80));
        ok++;
      } catch (e) { fail.push((it && it.name ? it.name + "：" : "") + (e && e.message ? e.message : e)); }
    });
    // 記下查價時間（N 欄）
    var stampAt = new Date();
    checked.concat(items).forEach(function (c) {
      try {
        var sh2 = ss.getSheetByName(String(c.scope || "") === "生意" ? WA_BIZ_ALT_SHEET_ : "另類資產"), r2 = Number(c.row);
        if (!sh2 || !(r2 >= 2 && r2 <= sh2.getLastRow())) return;
        if (sh2.getMaxColumns() < 14) sh2.insertColumnsAfter(sh2.getMaxColumns(), 14 - sh2.getMaxColumns());
        sh2.getRange(r2, 14).setValue(stampAt);
      } catch (e3) { Logger.log(e3); }
    });
    // 待確認：寫入價格的、使用者看過的先拿掉，再放進這次新的
    try {
      waCardPendingRemove_(ss, items.concat(clearP).concat(pending));
      if (pending.length) {
        var psh = waCardPendingSheet_(ss, true);
        pending.forEach(function (x) {
          var opts = (Array.isArray(x.opts) ? x.opts : []).slice(0, 8);
          if (opts.length && Number(x.row) >= 2) psh.appendRow([String(x.scope || "") === "生意" ? "生意" : "個人", Number(x.row), String(x.name || ""), stampAt, JSON.stringify(opts)]);
        });
      }
    } catch (e4) { Logger.log("卡片待確認寫入失敗：" + e4); }
  } finally {
    lock.releaseLock();
  }
  try { altHistRecord_(ss); } catch (e2) { Logger.log(e2); }
  if (!ok && fail.length) throw new Error(fail.join("\n"));
  if (!items.length) return { message: "已記下查價結果", detail: pending.length ? pending.length + " 張要你確認" : "", dashboard: waGetDashboard() };
  return { message: "已更新 " + ok + " 張卡的價格", detail: fail.length ? "有 " + fail.length + " 張沒更新：" + fail.join("；") : "折線圖也記了一筆", dashboard: waGetDashboard() };
}

// ============================================================
// 另類資產走勢：每樣資產的價值有變動就記一筆（同一天只留最新的），點資產進去可以看折線圖
// 「另類資產走勢」分頁：A 日期｜B 歸屬（個人／生意）｜C 名稱｜D 台幣價值｜E 幣別｜F 外幣價值
// ============================================================
var WA_ALT_HIST_SHEET_ = "另類資產走勢";
function altHistSheet_(ss, create) {
  var sh = ss.getSheetByName(WA_ALT_HIST_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(WA_ALT_HIST_SHEET_);
    sh.getRange(1, 1, 1, 6).setValues([["日期", "歸屬", "名稱", "台幣價值", "幣別", "外幣價值"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("A:A").setNumberFormat("@");
  }
  return sh;
}
function altHistDate_(v) { return v instanceof Date ? Utilities.formatDate(v, WA_TZ_, "yyyy-MM-dd") : String(v).trim().slice(0, 10); }
function altHistRecord_(ss) {
  var items = [];
  [["個人", "另類資產"], ["生意", WA_BIZ_ALT_SHEET_]].forEach(function (x) {
    var sh = ss.getSheetByName(x[1]);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(10, sh.getMaxColumns())).getValues().forEach(function (v) {
      var nm = String(v[0]).trim();
      if (!nm || String(v[1]).trim() === "股票") return;
      var cur = waAltCur_(v);
      items.push({ scope: x[0], name: nm, value: Math.round(waNum_(v[2])), cur: cur, fx: cur ? waNum_(v[8]) : "" });
    });
  });
  if (!items.length) return 0;
  var hs = altHistSheet_(ss, true), last = {}, n = hs.getLastRow();
  if (n >= 2) hs.getRange(2, 1, n - 1, 6).getValues().forEach(function (r, i) { last[r[1] + "|" + String(r[2]).trim()] = { row: i + 2, date: altHistDate_(r[0]), value: waNum_(r[3]), fx: r[5] === "" ? "" : waNum_(r[5]) }; });
  var today = Utilities.formatDate(new Date(), WA_TZ_, "yyyy-MM-dd"), add = [], wrote = 0;
  items.forEach(function (it) {
    var l = last[it.scope + "|" + it.name];
    if (l && l.value === it.value && String(l.fx) === String(it.fx)) return; // 沒變就不記
    if (l && l.date === today) { hs.getRange(l.row, 4, 1, 3).setValues([[it.value, it.cur, it.fx]]); wrote++; }
    else add.push([today, it.scope, it.name, it.value, it.cur, it.fx]);
  });
  if (add.length) { hs.getRange(hs.getLastRow() + 1, 1, add.length, 6).setValues(add); wrote += add.length; }
  return wrote;
}
// 存檔後：改名或搬到另一邊（個人↔生意）時，舊的走勢紀錄跟著改；然後記今天這一筆
function altHistAfterSave_(ss, oldName, name, fromBiz, toBiz) {
  try {
    var hs = altHistSheet_(ss, false), from = fromBiz ? "生意" : "個人", to = toBiz ? "生意" : "個人";
    if (hs && oldName && (oldName !== name || from !== to) && hs.getLastRow() >= 2) {
      var data = hs.getRange(2, 2, hs.getLastRow() - 1, 2).getValues();
      data.forEach(function (r, i) { if (r[0] === from && String(r[1]).trim() === oldName) hs.getRange(i + 2, 2, 1, 2).setValues([[to, name]]); });
    }
    altHistRecord_(ss);
  } catch (e) { Logger.log("另類資產走勢紀錄失敗：" + e); }
}
WA_READ_ONLY_.waAltHistory = 1;
function waAltHistory(p) {
  var ss = SS_(), name = String(p && p.name || "").trim(), scope = String(p && p.scope || "") === "生意" ? "生意" : "個人";
  var hs = altHistSheet_(ss, false), out = [];
  if (hs && hs.getLastRow() >= 2) hs.getRange(2, 1, hs.getLastRow() - 1, 6).getValues().forEach(function (r) {
    if (r[1] !== scope || String(r[2]).trim() !== name) return;
    out.push([altHistDate_(r[0]), waNum_(r[3]), r[4] ? String(r[4]) : "", r[5] === "" ? null : waNum_(r[5])]);
  });
  out.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  return { name: name, scope: scope, points: out };
}

function waDeleteAltItem(p) {
  var sh = SS_().getSheetByName(String(p.scope || "") === "生意" ? WA_BIZ_ALT_SHEET_ : "另類資產");
  var row = Number(p.row);
  if (!sh || !(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這一筆");
  if (String(sh.getRange(row, 2).getValue()).trim() === "股票") throw new Error("股票請到「資產」頁的「個股」刪除");
  var name = sh.getRange(row, 1).getValue();
  sh.deleteRow(row);
  return { message: "已刪除 " + name, detail: "", dashboard: waGetDashboard() };
}


// ============================================================
// 賣出另類資產／黃金：按賣出就好，不用再到記帳補一筆
// - 個人的：錢進投資現金（D10），成本轉進淨投入本金（B16），所以賺賠會算進報酬率、不算收入
//   （沒填成本＝當作不賺不賠，本金加上賣出金額）
// - 生意的：錢回到選的生意帳戶，不算營收（只是換個地方放）
// - 帳戶流水會記一筆，選的那個帳戶餘額會增加
// ============================================================
function waSellCost_(p, amount) {
  var c = String(p.cost === null || p.cost === undefined ? "" : p.cost).trim();
  if (c === "") return { known: false, cost: amount };
  if (!(Number(c) >= 0)) throw new Error("成本格式不正確");
  return { known: true, cost: Math.round(Number(c)) };
}
// 把賣出的錢記進去；回傳說明文字
function waSellBook_(ss, biz, flowFrom, acc, amount, costInfo, note) {
  if (biz) {
    waEnsureAccount_(ss, acc, "生意");
    waLogFlow_(ss, "生意資產", flowFrom, acc, amount, note);
    return "已存回 " + acc + "（不算營收）";
  }
  var sh = ss.getSheetByName("工作表1");
  var cash = waNum_(sh.getRange(R_(10), 4).getValue());
  var principal = waNum_(sh.getRange(R_(16), 2).getValue());
  sh.getRange(R_(10), 4).setValue(cash + amount);
  sh.getRange(R_(16), 2).setValue(principal + costInfo.cost);
  try { waEnsureAccount_(ss, acc); waLogFlow_(ss, "賣出資產", flowFrom, acc, amount, note); }
  catch (e) { Logger.log("賣出已完成，但帳戶流水寫入失敗：" + e); }
  if (WA_DEFER_) WA_NEED_TRIAL_ = true;
  var gain = amount - costInfo.cost;
  return (costInfo.known ? (gain >= 0 ? "賺 " : "賠 ") + Math.abs(Math.round(gain)).toLocaleString() + " 元・" : "") + "已加進投資現金（" + acc + "）";
}

// p: { row, scope, name（核對用）, amount（實際拿到的台幣）, cost（成本，可留空）, account }
function waSellAltItem(p) {
  var ss = SS_();
  var biz = String(p.scope || "") === "生意";
  var sh = ss.getSheetByName(biz ? WA_BIZ_ALT_SHEET_ : "另類資產");
  var row = Number(p.row);
  if (!sh || !(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這一筆");
  var amount = Math.round(Number(p.amount));
  if (!(amount > 0)) throw new Error("請輸入賣出拿到的金額（沒拿到錢的話請用「刪除」）");
  var acc = waCheckAccountName_(p.account);
  var costInfo = waSellCost_(p, amount);
  var msg, name;
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var v = sh.getRange(row, 1, 1, 2).getValues()[0];
    name = String(v[0]).trim();
    if (String(v[1]).trim() === "股票") throw new Error("股票請到「資產」頁的「個股」賣出");
    if (String(p.name || "").trim() !== name) throw new Error("清單剛剛有變動，請關掉重新點一次再賣");
    msg = waSellBook_(ss, biz, (biz ? "生意資產:" : "另類資產:") + name, acc, amount, costInfo, "賣出 " + name);
    sh.deleteRow(row);
  } finally {
    lock.releaseLock();
  }
  return { message: "已賣出 " + name + "・" + amount.toLocaleString() + " 元", detail: msg, dashboard: waGetDashboard() };
}

// p: { row, name（核對用）, weight（賣出的重量，跟這一筆同單位；留空＝全部）, amount, cost（賣掉那部分的成本，可留空）, account }
function waSellGold(p) {
  var ss = SS_();
  var sh = goldSheet_(ss);
  var row = Number(p.row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這一筆黃金");
  var amount = Math.round(Number(p.amount));
  if (!(amount > 0)) throw new Error("請輸入賣出拿到的金額（沒拿到錢的話請用「刪除」）");
  var acc = waCheckAccountName_(p.account);
  var costInfo = waSellCost_(p, amount);
  var msg, name, left = 0, unit = "";
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var v = sh.getRange(row, 1, 1, 5).getValues()[0];
    name = String(v[0]).trim();
    if (String(p.name || "").trim() !== name) throw new Error("清單剛剛有變動，請關掉重新點一次再賣");
    var have = waNum_(v[2]);
    unit = String(v[3] || "公克");
    var w = String(p.weight === null || p.weight === undefined ? "" : p.weight).trim() === "" ? have : Number(p.weight);
    if (!(w > 0)) throw new Error("請輸入賣出的重量");
    if (w > have + 1e-9) throw new Error("這一筆只有 " + have + " " + unit);
    left = Math.round((have - w) * 10000) / 10000;
    msg = waSellBook_(ss, false, "黃金:" + name, acc, amount, costInfo, "賣出 " + name + " " + w + " " + unit);
    if (left <= 0) {
      sh.deleteRow(row);
    } else {
      sh.getRange(row, 3).setValue(left);
      if (v[4] !== "") sh.getRange(row, 5).setValue(Math.max(0, Math.round(waNum_(v[4]) - (costInfo.known ? costInfo.cost : waNum_(v[4]) * w / have))));
    }
  } finally {
    lock.releaseLock();
  }
  return { message: "已賣出 " + name + (left > 0 ? "（還剩 " + left + " " + unit + "）" : "") + "・" + amount.toLocaleString() + " 元", detail: msg, dashboard: waGetDashboard() };
}

// ============================================================
// 信用卡：刷卡時先記在「未繳」清單（不動帳戶、不算支出、不扣總資產）；
// 按「已繳費」時才從銀行扣錢，並且照分類正式記成支出（個人的進收支紀錄、生意的進費用）
// ============================================================
var WA_CC_SHEET_ = "信用卡", WA_CC_LOG_SHEET_ = "信用卡紀錄";
function waCcSheet_(ss, create) {
  var sh = ss.getSheetByName(WA_CC_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(WA_CC_SHEET_);
    sh.getRange(1, 1, 1, 4).setValues([["卡片名稱", "連動帳戶（繳費扣款）", "狀態", "海外刷卡手續費%（空白＝1.5）"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function waCcLogSheet_(ss, create) {
  var sh = ss.getSheetByName(WA_CC_LOG_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(WA_CC_LOG_SHEET_);
    sh.getRange(1, 1, 1, 10).setValues([["日期", "卡片", "歸屬（個人 / 生意）", "分類", "金額", "備註", "一次性", "狀態（未繳 / 已繳）", "繳費日", "繳費帳戶"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function waCcList_(ss) {
  var sh = waCcSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().map(function (r, i) {
    return { row: i + 2, name: String(r[0]).trim(), account: String(r[1]).trim(), active: String(r[2]).trim() !== "停用", fee: waCcFee_(r[3]) };
  }).filter(function (c) { return c.name; });
}
// 海外刷卡手續費（%）：台灣發卡的信用卡幾乎都是 1.5%（國際組織約 1%＋發卡銀行約 0.5%），空白就用 1.5
var WA_CC_FX_FEE_ = 1.5;
function waCcFee_(v) {
  if (v === "" || v === null || v === undefined) return WA_CC_FX_FEE_;
  var n = Number(String(v).replace(/[%\s]/g, ""));
  return isFinite(n) && n >= 0 && n <= 10 ? n : WA_CC_FX_FEE_;
}
// 刷卡紀錄 K~N 欄：外幣刷卡才有（幣別、外幣金額、當時用的匯率、手續費%）
var WA_CC_FX_HEAD_ = ["外幣幣別", "外幣金額", "估算匯率（1外幣=?台幣）", "估算手續費%"];
function waCcFxOf_(r) {
  var code = String(r[10] || "").trim(), amt = waNum_(r[11]);
  if (!code || !(amt > 0)) return null;
  return { code: code, amt: amt, rate: waNum_(r[12]), fee: waNum_(r[13]) };
}
function waCcData_(ss) {
  var cards = waCcList_(ss);
  if (!cards.length) return [];
  var by = {};
  cards.forEach(function (c) { c.unpaid = 0; c.own = 0; c.biz = 0; c.items = []; by[c.name] = c; });
  var lg = waCcLogSheet_(ss, false);
  if (lg && lg.getLastRow() >= 2) lg.getRange(2, 1, lg.getLastRow() - 1, 14).getValues().forEach(function (r, i) {
    if (String(r[7]).trim() !== "未繳") return;
    var c = by[String(r[1]).trim()];
    if (!c) return;
    var amt = waNum_(r[4]), scope = String(r[2]).trim() === "生意" ? "生意" : "個人";
    c.unpaid += amt; if (scope === "生意") c.biz += amt; else c.own += amt;
    c.items.push({ row: i + 2, date: waDate_(r[0]), scope: scope, category: String(r[3]), amount: amt, note: String(r[5] || ""), oneTime: String(r[6]) === "是", fx: waCcFxOf_(r) });
  });
  return cards.map(function (c) { return { name: c.name, account: c.account, active: c.active, fee: c.fee, unpaid: c.unpaid, own: c.own, biz: c.biz, items: c.items }; });
}
function waCcName_(v) {
  var n = String(v || "").trim();
  if (!n) throw new Error("請輸入信用卡名稱");
  if (n.length > 30) throw new Error("信用卡名稱太長");
  if (/[:：]/.test(n)) throw new Error("信用卡名稱不能有冒號");
  return n;
}

// 新增／修改信用卡。p: { name, account（連動銀行）, oldName（改名或改連動銀行時帶原本的名字）, active }
function waCcSave(p) {
  var ss = SS_();
  var name = waCcName_(p.name), old = String(p.oldName || "").trim();
  var account = waCheckAccountName_(p.account);
  var accs = waAccountList_(ss);
  if (!accs.some(function (a) { return a.name === account; })) throw new Error("找不到帳戶「" + account + "」，請先在帳戶管理新增");
  if (accs.some(function (a) { return a.name === name; })) throw new Error("「" + name + "」已經是銀行帳戶的名字，信用卡請取不一樣的名字");
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var sh = waCcSheet_(ss, true), list = waCcList_(ss);
    var cur = old ? list.filter(function (c) { return c.name === old; })[0] : null;
    if (old && !cur) throw new Error("找不到信用卡「" + old + "」");
    if (list.some(function (c) { return c.name === name && (!cur || c.row !== cur.row); })) throw new Error("已經有一張叫「" + name + "」的信用卡");
    var status = p.active === false ? "停用" : "使用中";
    var fee = p.fxFee === undefined || p.fxFee === null || p.fxFee === "" ? (cur ? cur.fee : WA_CC_FX_FEE_) : Number(p.fxFee);
    if (!(isFinite(fee) && fee >= 0 && fee <= 10)) throw new Error("海外手續費請填 0～10 之間的 %");
    if (String(sh.getRange(1, 4).getValue()).trim() === "") sh.getRange(1, 4).setValue("海外刷卡手續費%（空白＝1.5）");
    if (cur) {
      sh.getRange(cur.row, 1, 1, 4).setValues([[name, account, status, fee]]);
      if (old !== name) {
        var lg = waCcLogSheet_(ss, false);
        if (lg && lg.getLastRow() >= 2) {
          var rg = lg.getRange(2, 2, lg.getLastRow() - 1, 1), vals = rg.getValues(), ch = false;
          vals.forEach(function (r) { if (String(r[0]).trim() === old) { r[0] = name; ch = true; } });
          if (ch) rg.setValues(vals);
        }
      }
    } else sh.appendRow([name, account, status, fee]);
  } finally { lock.releaseLock(); }
  return { message: (old ? "已更新 " : "已新增信用卡 ") + name, detail: "繳費時預設從 " + account + " 扣", dashboard: waGetDashboard() };
}

// 刪除信用卡（還有未繳的不能刪）
function waCcRemove(p) {
  var ss = SS_(), name = waCcName_(p.name);
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var c = waCcData_(ss).filter(function (x) { return x.name === name; })[0];
    if (!c) throw new Error("找不到信用卡「" + name + "」");
    if (c.items.length) throw new Error(name + " 還有 " + c.items.length + " 筆未繳，請先繳費或刪掉那幾筆");
    var row = waCcList_(ss).filter(function (x) { return x.name === name; })[0].row;
    waCcSheet_(ss, true).deleteRow(row);
  } finally { lock.releaseLock(); }
  return { message: "已刪除信用卡 " + name, detail: "", dashboard: waGetDashboard() };
}

// 刷卡：p: { card, scope: "個人" | "生意", amount, category, note, oneTime }
function waCcCharge(p) {
  var ss = SS_(), name = waCcName_(p.card);
  var category = String(p.category || "").trim();
  if (!category) throw new Error("請選擇分類");
  var scope = p.scope === "生意" ? "生意" : "個人";
  var card = waCcList_(ss).filter(function (c) { return c.name === name; })[0];
  if (!card) throw new Error("找不到信用卡「" + name + "」");
  // 外幣刷卡：p.fx = { code, amt }。台幣先用網路匯率＋這張卡的手續費估，繳卡費時可以改成帳單上的實際金額
  var fxCols = ["", "", "", ""], fxMsg = "";
  if (p.fx) {
    var code = typeof fxCode_ === "function" ? fxCode_(p.fx.code) : String(p.fx.code || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || code === "TWD") throw new Error("看不懂幣別「" + p.fx.code + "」");
    var fxAmt = Math.round(Number(p.fx.amt) * 100) / 100;
    if (!(fxAmt > 0)) throw new Error("請輸入大於 0 的外幣金額");
    var rate = Number(p.fx.rate) > 0 ? Number(p.fx.rate) : (typeof fxRates_ === "function" ? Number(fxRates_().rates[code]) || 0 : 0);
    if (!(rate > 0)) throw new Error("抓不到 " + code + " 的匯率，請稍後再試，或改用台幣金額記");
    p.amount = fxAmt * rate * (1 + card.fee / 100);
    fxCols = [code, fxAmt, rate, card.fee];
    fxMsg = "（" + code + " " + fxAmt.toLocaleString() + "，匯率 " + Number(rate.toPrecision(4)) + "＋手續費 " + card.fee + "% 估的）";
  }
  var amount = Math.round(Number(p.amount) * 100) / 100;
  if (!(amount > 0)) throw new Error("請輸入大於 0 的金額");
  var ccWhen = waEntryWhen_(p.date);
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var lgS = waCcLogSheet_(ss, true);
    if (p.fx && String(lgS.getRange(1, 11).getValue()).trim() === "") lgS.getRange(1, 11, 1, 4).setValues([WA_CC_FX_HEAD_]);
    lgS.appendRow([ccWhen, name, scope, category, amount, String(p.note || "").trim(), p.oneTime ? "是" : "否", "未繳", "", ""].concat(fxCols));
  } finally { lock.releaseLock(); }
  if (scope === "個人") { try { waLearnCategory_("EXPENSE_CATEGORIES", category); } catch (e) {} }
  return { message: "刷卡 " + category + " " + Math.round(amount).toLocaleString() + " 元已記在 " + name + fxMsg,
    detail: p.fx ? "還沒扣錢。繳卡費時可以把這筆改成帳單上的實際台幣金額" : "還沒扣錢。繳卡費時按「已繳費」，才會算進支出、從銀行扣", dashboard: waGetDashboard() };
}

// 刪掉一筆還沒繳的刷卡紀錄（記錯時用）
function waCcDeleteCharge(p) {
  var ss = SS_(), row = Number(p.row);
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var lg = waCcLogSheet_(ss, false);
    if (!lg || !(row >= 2 && row <= lg.getLastRow())) throw new Error("找不到這筆刷卡紀錄");
    var r = lg.getRange(row, 1, 1, 8).getValues()[0];
    if (String(r[7]).trim() !== "未繳") throw new Error("這筆已經繳過了，不能刪");
    if (p.card && String(r[1]).trim() !== String(p.card).trim()) throw new Error("紀錄已經變動，請重新整理再試");
    lg.deleteRow(row);
  } finally { lock.releaseLock(); }
  return { message: "已刪除這筆刷卡紀錄", detail: "", dashboard: waGetDashboard() };
}

// 已繳費。p: { card, rows: [紀錄列號], amount（實際繳的金額，預設＝勾選的合計）, accOwn（個人的從哪繳）, accBiz（生意的從哪繳） }
//   繳的比勾選的多 → 多的記成「其他」支出（手續費、利息）；比較少 → 當成回饋折抵，從金額最大的那一類扣掉
function waCcPay(p) {
  var ss = SS_(), name = waCcName_(p.card);
  var rows = (Array.isArray(p.rows) ? p.rows : []).map(Number).filter(function (r) { return r >= 2; });
  if (!rows.length) throw new Error("請勾選這次要繳的刷卡紀錄");
  var lg = waCcLogSheet_(ss, false);
  if (!lg) throw new Error("沒有刷卡紀錄");
  var last = lg.getLastRow();
  var all = last >= 2 ? lg.getRange(2, 1, last - 1, 14).getValues() : [];
  var items = rows.map(function (row) {
    var r = all[row - 2];
    if (!r || String(r[1]).trim() !== name || String(r[7]).trim() !== "未繳") throw new Error("刷卡紀錄已經變動，請重新整理再試");
    var fxi = waCcFxOf_(r), nt = String(r[5] || "").trim();
    if (fxi) nt = (nt ? nt + " " : "") + fxi.code + " " + fxi.amt.toLocaleString();
    return { row: row, scope: String(r[2]).trim() === "生意" ? "生意" : "個人", category: String(r[3]).trim() || "其他", amount: waNum_(r[4]), note: nt, oneTime: String(r[6]) === "是" };
  });
  // 繳費前把（外幣刷卡的）金額改成帳單上的實際台幣：p.adj = { 列號: 台幣金額 }
  var adj = p.adj && typeof p.adj === "object" ? p.adj : {};
  items.forEach(function (x) {
    if (adj[x.row] === undefined || adj[x.row] === null || adj[x.row] === "") return;
    var v = Math.round(Number(adj[x.row]) * 100) / 100;
    if (!(v > 0)) throw new Error("「" + x.category + "」的實際金額要大於 0");
    if (Math.abs(v - x.amount) < 0.005) return;
    x.amount = v;
    lg.getRange(x.row, 5).setValue(v);
  });
  var sum = Math.round(items.reduce(function (a, x) { return a + x.amount; }, 0) * 100) / 100;
  var amount = p.amount === undefined || p.amount === null || p.amount === "" ? sum : Math.round(Number(p.amount) * 100) / 100;
  if (!(amount > 0)) throw new Error("請輸入繳費金額");

  // 同分類合成一筆
  var groups = [], gi = {};
  items.forEach(function (x) {
    var k = x.scope + "|" + x.category + "|" + (x.scope === "個人" && x.oneTime ? 1 : 0);
    if (!gi[k]) { gi[k] = { scope: x.scope, category: x.category, oneTime: x.scope === "個人" && x.oneTime, amount: 0, rows: [], notes: [] }; groups.push(gi[k]); }
    gi[k].amount += x.amount; gi[k].rows.push(x.row); if (x.note) gi[k].notes.push(x.note);
  });
  var hasOwn = groups.some(function (g) { return g.scope === "個人"; }), hasBiz = groups.some(function (g) { return g.scope === "生意"; });
  var diff = Math.round((amount - sum) * 100) / 100, extraNote = "";
  if (diff > 0) {
    var es = hasOwn || !hasBiz ? "個人" : "生意";
    groups.push({ scope: es, category: "其他", oneTime: false, amount: diff, rows: [], notes: ["手續費／利息等差額"], extra: true });
    extraNote = "多繳的 " + Math.round(diff).toLocaleString() + " 元記成「其他」支出";
  } else if (diff < 0) {
    var big = groups.slice().sort(function (a, b) { return b.amount - a.amount; })[0];
    if (!(big.amount + diff > 0)) throw new Error("繳的金額比勾選的少太多。如果是有幾筆這期還沒繳，請取消勾選那幾筆");
    big.amount = Math.round((big.amount + diff) * 100) / 100;
    big.notes.unshift("已扣回饋折抵 " + Math.round(-diff).toLocaleString());
    extraNote = "少繳的 " + Math.round(-diff).toLocaleString() + " 元當成回饋折抵，從「" + big.category + "」扣掉";
  }

  // 付款帳戶：個人的要用個人或中轉帳戶，生意的要用生意或中轉帳戶（不然對帳會對不起來）
  var sc = {};
  waAccountList_(ss).forEach(function (a) { sc[a.name] = a.scope; });
  hasOwn = groups.some(function (g) { return g.scope === "個人"; }); hasBiz = groups.some(function (g) { return g.scope === "生意"; });
  var accOwn = hasOwn ? waCheckAccountName_(p.accOwn) : "", accBiz = hasBiz ? waCheckAccountName_(p.accBiz) : "";
  if (hasOwn && !(sc[accOwn] === "個人" || sc[accOwn] === "中轉")) throw new Error("個人的刷卡要從個人或中轉帳戶繳");
  if (hasBiz && !(sc[accBiz] === "生意" || sc[accBiz] === "中轉")) throw new Error("生意的刷卡要從生意或中轉帳戶繳");

  var today = new Date(), done = 0;
  var mark = function (g, acc) {
    g.rows.forEach(function (row) { lg.getRange(row, 8, 1, 3).setValues([["已繳", today, acc]]); });
    done += g.amount;
  };
  groups.forEach(function (g) {
    var note = ("刷卡 " + name + (g.rows.length > 1 ? "（" + g.rows.length + " 筆）" : "") + (g.notes.length ? "：" + g.notes.join("、") : "")).slice(0, 80);
    try {
      if (g.scope === "個人") waSubmitLedger({ type: "支出", amount: g.amount, category: g.category, oneTime: g.oneTime, note: note, account: accOwn, _noDash: true });
      else waBizRecord({ kind: "expense", amount: g.amount, category: g.category, note: note, account: accBiz, _noDash: true });
    } catch (e) {
      throw new Error((done > 0 ? "已經繳了 " + Math.round(done).toLocaleString() + " 元，但「" + g.category + "」這類沒有成功：" : "") + (e && e.message ? e.message : e));
    }
    mark(g, g.scope === "個人" ? accOwn : accBiz);
  });
  return { message: name + " 已繳 " + Math.round(amount).toLocaleString() + " 元",
    detail: "已從 " + [accOwn, accBiz].filter(function (a, i, arr) { return a && arr.indexOf(a) === i; }).join("、") + " 扣款，並記成支出" + (extraNote ? "。" + extraNote : ""),
    dashboard: waGetDashboard() };
}

// 每週傳配置圖片的提醒（每個使用者自己設定，預設關閉）。
// p: { on: 要不要提醒, day: 每週從星期幾開始算（0＝日 … 6＝六，預設 1）, who: 要傳給誰（顯示用）, sent: true＝這週傳過了／false＝取消 }
function waAllocRemind(p) {
  var cur = {};
  try { cur = JSON.parse(PROPS_().getProperty("ALLOC_REMIND") || "{}") || {}; } catch (e) {}
  p = p || {};
  if (typeof p.on === "boolean") cur.on = p.on;
  if (p.day !== undefined && Number(p.day) >= 0 && Number(p.day) <= 6) cur.day = Math.floor(Number(p.day));
  if (p.who !== undefined) cur.who = String(p.who || "").trim().slice(0, 20);
  if (p.sent === true) cur.sentAt = Date.now();
  if (p.sent === false) cur.sentAt = 0;
  PROPS_().setProperty("ALLOC_REMIND", JSON.stringify({ on: !!cur.on, sentAt: Number(cur.sentAt) || 0, day: cur.day >= 0 && cur.day <= 6 ? cur.day : 1, who: cur.who || "" }));
  return { message: p.sent === true ? "已記下這週傳過了" : cur.on ? "每週會提醒你傳配置圖片" : "不會提醒", detail: p.sent === true ? "下一週會再提醒" : "", dashboard: waGetDashboard() };
}

// ============================================================
// 收支查詢：選一天或一段日期，看花了多少、賺了多少（只算個人的收支；轉帳、換匯不算）
// p: { from: "yyyy-MM-dd", to: "yyyy-MM-dd", type: "all" | "支出" | "收入" }
// 信用卡算在「刷卡那天」：刷卡紀錄（不管繳了沒）照刷卡日算；收支紀錄裡繳卡費那幾筆就不重複算，
//   只留繳費時多繳的差額（手續費、利息）和回饋折抵，算在繳費那天
// ============================================================
function waDayKey_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, WA_TZ_, "yyyy-MM-dd");
  var m = String(v || "").match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  return m ? m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2) : "";
}
function waLedgerQuery(p) {
  p = p || {};
  var ok = function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")); };
  var from = String(p.from || ""), to = String(p.to || "");
  if (!ok(from) || !ok(to)) throw new Error("請選日期");
  if (from > to) { var tmp = from; from = to; to = tmp; }
  var want = p.type === "支出" || p.type === "收入" ? p.type : "all";
  var ss = SS_(), rows = [];
  var inRange = function (k) { return k && k >= from && k <= to; };

  // 信用卡：卡名（卡片表＋刷卡紀錄裡出現過的，刪掉的卡也認得）
  var cardNames = {};
  try { waCcList_(ss).forEach(function (c) { cardNames[c.name] = 1; }); } catch (e) {}
  var lg = waCcLogSheet_(ss, false);
  var ccRows = lg && lg.getLastRow() >= 2 ? lg.getRange(2, 1, lg.getLastRow() - 1, 14).getValues() : [];
  ccRows.forEach(function (r) { var n = String(r[1]).trim(); if (n) cardNames[n] = 1; });
  var cardOf = function (note) {
    var m = String(note || "").match(/^刷卡 (.+?)(（\d+ 筆）)?(：|$)/);
    return m && cardNames[m[1]] ? m[1] : "";
  };

  var led = ss.getSheetByName("收支紀錄");
  if (led && led.getLastRow() >= 2) led.getRange(2, 1, led.getLastRow() - 1, 6).getValues().forEach(function (r, i) {
    var type = String(r[1]).trim();
    if (type !== "支出" && type !== "收入") return;
    var day = waDayKey_(r[0]);
    if (!inRange(day)) return;
    var base = { src: "led", row: i + 2, day: day, date: waDate_(r[0]), type: type, category: String(r[2] || "").trim() || "其他",
      amount: waNum_(r[3]), note: String(r[4] || ""), oneTime: String(r[5]) === "是" };
    if (type === "支出" && base.category === "代墊生意") return; // 幫生意付的，算生意的花費，不算個人
    if (base.category === "帳務調整") return; // 對帳時補平的差額（數錯、期初對不上），不是真的收支
    if (base.category === "房貸本金") return; // 還房貸的本金：錢變成房子（負債變少），不是花掉
    var card = type === "支出" ? cardOf(base.note) : "";
    if (!card) { rows.push(base); return; }
    // 繳卡費的那幾筆：本來的消費已經照刷卡日算了，這裡只留差額
    if (base.note.indexOf("手續費／利息等差額") >= 0) { base.src = "ccfee"; base.card = card; rows.push(base); return; }
    var rb = base.note.match(/已扣回饋折抵 ([\d,]+)/);
    if (rb) rows.push({ src: "ccback", day: day, date: base.date, type: "支出", category: base.category, amount: -Number(rb[1].replace(/,/g, "")),
      note: "信用卡回饋折抵", oneTime: base.oneTime, card: card });
  });

  ccRows.forEach(function (r, i) {
    var card = String(r[1]).trim();
    if (!card || String(r[2]).trim() === "生意") return;
    if (typeof bizIsBound_ === "function" && bizIsBound_(r[3])) return; // 綁定生意的分類：算生意的
    var day = waDayKey_(r[0]);
    if (!inRange(day)) return;
    var fx = waCcFxOf_(r), note = String(r[5] || "").trim();
    if (fx) note = (note ? note + " " : "") + fx.code + " " + fx.amt.toLocaleString();
    rows.push({ src: "cc", ccRow: i + 2, day: day, date: waDate_(r[0]), type: "支出", category: String(r[3] || "").trim() || "其他",
      amount: waNum_(r[4]), note: note, oneTime: String(r[6]) === "是", card: card, paid: String(r[7]).trim() !== "未繳" });
  });

  var income = 0, expense = 0, oneTimeExp = 0, cats = { "支出": {}, "收入": {} };
  rows.forEach(function (x) {
    if (x.type === "收入") income += x.amount; else { expense += x.amount; if (x.oneTime) oneTimeExp += x.amount; }
    var c = cats[x.type][x.category] || (cats[x.type][x.category] = { name: x.category, amount: 0, n: 0 });
    c.amount += x.amount; if (x.src !== "ccback") c.n++;
  });
  var catList = function (t) {
    return Object.keys(cats[t]).map(function (k) { var c = cats[t][k]; c.amount = Math.round(c.amount * 100) / 100; return c; })
      .filter(function (c) { return Math.abs(c.amount) >= 0.005; }).sort(function (a, b) { return b.amount - a.amount; });
  };
  var shown = rows.filter(function (x) { return want === "all" || x.type === want; });
  shown.sort(function (a, b) { return a.day === b.day ? (b.row || b.ccRow || 0) - (a.row || a.ccRow || 0) : (a.day < b.day ? 1 : -1); });
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var first = rows.reduce(function (m, x) { return !m || x.day < m ? x.day : m; }, "");
  return { first: first, from: from, to: to, type: want, income: r2(income), expense: r2(expense), net: r2(income - expense), oneTimeExp: r2(oneTimeExp),
    count: shown.length, cats: { "支出": catList("支出"), "收入": catList("收入") }, rows: shown.slice(0, 400), more: Math.max(0, shown.length - 400) };
}
WA_READ_ONLY_.waLedgerQuery = 1;


// ==================== Core.gs ====================
      var STOCK_FIELD_TITLE_ = "個股代號（新增用，不在下拉選單時填這裡）";function checkPortfolioRebalance() {
  
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var logSheet = ss.getSheetByName("交易紀錄");
  var data = sheet.getRange(2, 1, LAY().n, 7).getValues();
  var alertMessages = [];

  for (var i = 0; i < data.length; i++) {
    var code = data[i][0];
    var currentPct = data[i][4];
    var targetPct = data[i][5];
    var status = data[i][6];

    if (status.toString().indexOf("超標") !== -1 || status.toString().indexOf("低配") !== -1) {
      var diff = ((currentPct - targetPct) * 100).toFixed(1);
      var msg = code + " 目前 " + (currentPct * 100).toFixed(1) + "% 目標 " + (targetPct * 100).toFixed(1) + "% 偏離 " + diff + "%";
      alertMessages.push(msg);
    }
  }

  var emailBody = "";
  if (alertMessages.length > 0) {
    emailBody += "以下標的偏離目標比例超過5%，建議檢視是否需要再平衡：\n\n" + alertMessages.join("\n") + "\n\n";
  }

  if (logSheet) {
    var logData = logSheet.getDataRange().getValues();
    var lastDate = null;
    for (var i = 1; i < logData.length; i++) {
      var d = new Date(logData[i][0]);
      if (d instanceof Date && !isNaN(d)) {
        if (!lastDate || d > lastDate) lastDate = d;
      }
    }
    if (lastDate) {
      var daysSince = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
      if (daysSince >= 30) {
        emailBody += "⏰ 提醒：距離上次操作已經 " + daysSince + " 天，記得檢視配置狀況。\n\n";
      }
    }
  }

  if (emailBody !== "") {
    SEND_MAIL_(NOTIFY_EMAIL_(), "資產配置提醒", emailBody);
  }

  // 每次執行都順便記錄一筆歷史配置快照
  snapshotAllocation();
}

// 這三個函式整段取代原本的 confirmPurchase()、confirmSell()、checkRebalanceFeasibility()
// 改動重點:買進股數/買進成交價/賣出股數/賣出成交價 全部改從「操作面板」分頁讀取,
// 工作表1 的 N欄(賣出股數)、Q欄(買進成交價)、R欄(賣出成交價)不再被使用,可以隱藏或刪除。
//
// 操作面板欄位(第2~9列對應同一批標的):
// A代號(公式) B即時股價(公式) C試算建議買進(公式) D本次買進股數(手動) E買進成交價(手動)
// F試算建議賣出(公式) G本次賣出股數(手動) H賣出成交價(手動)

function confirmPurchase() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('確認執行', '是否確定要執行「確認已購買」,這會更新持股與現金?', ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;

  var lock = LOCK_();
  try {
    lock.waitLock(10000);
  } catch (e) {
    ui.alert("系統忙碌中，請稍後再試一次。");
    return;
  }

  try {
    var cache = SCACHE_();
    var lastRun = cache.get('lastConfirmPurchase');
    var now = new Date().getTime();
    if (lastRun && (now - parseInt(lastRun)) < 15000) {
      var waitSec = Math.ceil((15000 - (now - parseInt(lastRun))) / 1000);
      ui.alert("請稍候 " + waitSec + " 秒再試一次。");
      return;
    }
    cache.put('lastConfirmPurchase', now.toString(), 30);

    var ss = SS_();
    var sheet = ss.getSheetByName("工作表1");
    var panel = ss.getSheetByName("操作面板");
    var logSheet = ss.getSheetByName("交易紀錄");
    var currentCash = sheet.getRange(R_(10), 4).getValue();

    var feeRate = Number(sheet.getRange(R_(21), 3).getValue()) || 0.001425;
    var minFee = Number(sheet.getRange(R_(23), 3).getValue()) || 20;

        var rows = [];
    var plannedSpent = 0;
    for (var row = 2; row <= LAY().last; row++) {
      var code = sheet.getRange(row, 1).getValue();
      var currentShares = sheet.getRange(row, 2).getValue();
      var quotePrice = sheet.getRange(row, 3).getValue();
      var currentCost = sheet.getRange(row, 12).getValue();

      var manualBuyShares = panel.getRange(row, 4).getValue();
      var buyShares = (typeof manualBuyShares === 'number' && manualBuyShares > 0) ? manualBuyShares : 0;

      var manualPrice = panel.getRange(row, 5).getValue();
      var actualPrice = (typeof manualPrice === 'number' && manualPrice > 0) ? manualPrice : quotePrice;
      
      if (actualPrice <= 0 || isNaN(actualPrice)) {
        ui.alert(code + " 的股價異常(0或無效)，已跳過這一檔的買進，請檢查即時股價或手動輸入的成交價。");
        buyShares = 0;
      }

      var grossCost = buyShares * actualPrice;
      var fee = buyShares > 0 ? Math.max(minFee, Math.round(grossCost * feeRate)) : 0;
      var totalCost = grossCost + fee;

      rows.push({ row: row, code: code, currentShares: currentShares, buyShares: buyShares, actualPrice: actualPrice, currentCost: currentCost, grossCost: grossCost, fee: fee, totalCost: totalCost });
      plannedSpent += totalCost;
    }

    var totalAssets = sheet.getRange(R_(14), 2).getValue();
    var maxSingleTradeRatio = 0.3;

    for (var i = 0; i < rows.length; i++) {
      if (totalAssets > 0 && rows[i].totalCost > totalAssets * maxSingleTradeRatio) {
        var confirmBig = ui.alert(
          '⚠️ 大額交易警示',
          rows[i].code + ' 這筆交易金額 ' + rows[i].totalCost.toFixed(0) + ' 元，超過目前總資產的 ' + (maxSingleTradeRatio * 100) + '%，請確認金額是否正確。\n\n確定要繼續嗎？',
          ui.ButtonSet.YES_NO
        );
        if (confirmBig !== ui.Button.YES) {
          ui.alert("已取消，請檢查操作面板的股數或金額是否有誤植。");
          return;
        }
      }
    }

    var cashDebt = sheet.getRange(R_(38), 2).getValue() || 0;
    if (cashDebt > 0) {
      var debtConfirm = ui.alert(
        '💳 現金欠款提醒',
        '目前有 ' + cashDebt.toFixed(0) + ' 元的現金欠款尚未補回(先前特殊開銷動用的緊急現金)。\n\n建議優先存入現金補回水位，是否仍要繼續買進？',
        ui.ButtonSet.YES_NO
      );
      if (debtConfirm !== ui.Button.YES) {
        ui.alert("已取消，建議先補回現金欠款。");
        return;
      }
    }

    if (plannedSpent > currentCash) {
      ui.alert("現金不足!本次需要 " + plannedSpent.toFixed(0) + " 元(含手續費),但目前現金只有 " + currentCash.toFixed(0) + " 元。");
      return;
    }

    var totalSpent = 0;
    var today = new Date();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].buyShares > 0) {
        sheet.getRange(rows[i].row, 2).setValue(rows[i].currentShares + rows[i].buyShares);
        sheet.getRange(rows[i].row, 12).setValue(rows[i].currentCost + rows[i].totalCost);
        totalSpent += rows[i].totalCost;
        if (logSheet) {
          logSheet.appendRow([today, rows[i].code, rows[i].buyShares, rows[i].actualPrice, rows[i].grossCost, rows[i].fee, 0, rows[i].totalCost, "買進"]);
        }
        panel.getRange(rows[i].row, 4).setValue("");
        panel.getRange(rows[i].row, 5).setValue("");
      }
    }

    sheet.getRange(R_(10), 4).setValue(currentCash - totalSpent);
    ui.alert("已完成!本次共投入 " + totalSpent.toFixed(0) + " 元(已含手續費),持股與現金已自動更新。");

  } finally {
    lock.releaseLock();
  }
}


function confirmSell() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('確認執行', '是否確定要執行「確認已賣出」,這會更新持股與現金?', ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;

  var lock = LOCK_();
  try {
    lock.waitLock(10000);
  } catch (e) {
    ui.alert("系統忙碌中，請稍後再試一次。");
    return;
  }

  try {
    var cache = SCACHE_();
    var lastRun = cache.get('lastConfirmSell');
    var now = new Date().getTime();
    if (lastRun && (now - parseInt(lastRun)) < 15000) {
      var waitSec = Math.ceil((15000 - (now - parseInt(lastRun))) / 1000);
      ui.alert("請稍候 " + waitSec + " 秒再試一次。");
      return;
    }
    cache.put('lastConfirmSell', now.toString(), 30);

    var ss = SS_();
    var sheet = ss.getSheetByName("工作表1");
    var panel = ss.getSheetByName("操作面板");
    var logSheet = ss.getSheetByName("交易紀錄");
    var currentCash = sheet.getRange(R_(10), 4).getValue();

    var feeRate = Number(sheet.getRange(R_(21), 3).getValue()) || 0.001425;
    var taxRate = Number(sheet.getRange(R_(22), 3).getValue()) || 0.003;
    var minFee = Number(sheet.getRange(R_(23), 3).getValue()) || 20;

        var rows = [];
    for (var row = 2; row <= LAY().last; row++) {
      var code = sheet.getRange(row, 1).getValue();
      var currentShares = sheet.getRange(row, 2).getValue();
      var quotePrice = sheet.getRange(row, 3).getValue();
      var currentCost = sheet.getRange(row, 12).getValue();

      var sellShares = panel.getRange(row, 7).getValue();
      sellShares = (typeof sellShares === 'number' && sellShares > 0) ? sellShares : 0;

      var manualPrice = panel.getRange(row, 8).getValue();
      var actualPrice = (typeof manualPrice === 'number' && manualPrice > 0) ? manualPrice : quotePrice;

      if (sellShares > 0 && (actualPrice <= 0 || isNaN(actualPrice))) {
        ui.alert(code + " 的股價異常(0或無效)，已跳過這一檔的賣出，請檢查即時股價或手動輸入的成交價。");
        sellShares = 0;
      }

      if (sellShares > currentShares) {
        ui.alert(code + " 賣出股數超過持有股數,請檢查操作面板G欄。");
        return;
      }
      rows.push({ row: row, code: code, currentShares: currentShares, sellShares: sellShares, actualPrice: actualPrice, currentCost: currentCost });
    }

    var totalNetProceeds = 0;
    var today = new Date();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].sellShares > 0) {
        var grossProceeds = rows[i].sellShares * rows[i].actualPrice;
        var fee = Math.max(minFee, Math.round(grossProceeds * feeRate));
        var tax = Math.round(grossProceeds * taxRate);
        var netProceeds = grossProceeds - fee - tax;

        var costPerShare = rows[i].currentShares > 0 ? rows[i].currentCost / rows[i].currentShares : 0;
        var costRemoved = Math.round(costPerShare * rows[i].sellShares);

        sheet.getRange(rows[i].row, 2).setValue(rows[i].currentShares - rows[i].sellShares);
        sheet.getRange(rows[i].row, 12).setValue(rows[i].currentCost - costRemoved);
        totalNetProceeds += netProceeds;

        if (logSheet) {
          logSheet.appendRow([today, rows[i].code, -rows[i].sellShares, rows[i].actualPrice, grossProceeds, fee, tax, netProceeds, "賣出"]);
        }
        panel.getRange(rows[i].row, 7).setValue("");
        panel.getRange(rows[i].row, 8).setValue("");
      }
    }

    sheet.getRange(R_(10), 4).setValue(currentCash + totalNetProceeds);
    ui.alert("已完成!本次共賣出淨入帳 " + totalNetProceeds.toFixed(0) + " 元(已扣手續費與證交稅),持股與現金已自動更新。");

  } finally {
    lock.releaseLock();
  }
}

function recordDeposit() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('存入現金', '請輸入本次存入金額：', ui.ButtonSet.OK_CANCEL);

  if (result.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var amount = parseFloat(result.getResponseText());
  if (isNaN(amount) || amount <= 0) {
    ui.alert("請輸入有效的正數金額。");
    return;
  }

  var sheet = SS_().getSheetByName("工作表1");
  var currentCash = Number(sheet.getRange(R_(10), 4).getValue()) || 0;
  var currentDeposit = Number(sheet.getRange(R_(16), 2).getValue()) || 0;

  sheet.getRange(R_(10), 4).setValue(currentCash + amount);
  sheet.getRange(R_(16), 2).setValue(currentDeposit + amount);

  ui.alert("已存入 " + amount.toFixed(0) + " 元，累計入金總額更新為 " + (currentDeposit + amount).toFixed(0) + " 元。");
}

// 把這個函式整段覆蓋掉原本的 checkRebalanceFeasibility()
// 更新重點:
// 1. 買進試算:優先用Q欄(買進成交價),沒填才用C欄即時股價;金額含手續費
// 2. 賣出試算:優先用R欄(賣出成交價),沒填才用C欄即時股價;金額已扣手續費+證交稅(淨額)
// 3. 跟 confirmPurchase()/confirmSell() 用同一套費率設定(C21手續費率/C22證交稅率/C23最低手續費)

// 把這個函式整段覆蓋掉原本的 checkRebalanceFeasibility()
// 這次新增:計算結果會寫回 S 欄(本次建議買進-資金調整後),永久顯示在表格上,
// 跟 O 欄(建議賣出股數)一樣隨時看得到,不用每次重新點按鈕看彈窗才知道。
// 執行前請先在 S1 填標題「本次建議買進(資金調整後)」

function checkRebalanceFeasibility() {
  var ui = SpreadsheetApp.getUi();
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var panel = ss.getSheetByName("操作面板");
  var currentCash = sheet.getRange(R_(10), 4).getValue();
 
  var feeRate = Number(sheet.getRange(R_(21), 3).getValue()) || 0.001425;
  var taxRate = Number(sheet.getRange(R_(22), 3).getValue()) || 0.003;
  var minFee = Number(sheet.getRange(R_(23), 3).getValue()) || 20;
 
  var rows = [];
  var totalSellNetProceeds = 0;
  var totalBuyTotalCost = 0;
 
  for (var row = 2; row <= LAY().last; row++) {
    var code = sheet.getRange(row, 1).getValue();
    var quotePrice = sheet.getRange(row, 3).getValue();
    var targetPct = sheet.getRange(row, 6).getValue(); // F欄 目標比例

    var suggestedBuy = sheet.getRange(row, 11).getValue(); // K欄
    var suggestedSell = sheet.getRange(row, 15).getValue(); // O欄
    var buyManualPrice = panel.getRange(row, 5).getValue(); // E欄
    var sellManualPrice = panel.getRange(row, 8).getValue(); // H欄
 
    var buyPrice = (buyManualPrice && buyManualPrice > 0) ? buyManualPrice : quotePrice;
    var sellPrice = (sellManualPrice && sellManualPrice > 0) ? sellManualPrice : quotePrice;
 
    var buyGross = suggestedBuy * buyPrice;
    var buyFee = suggestedBuy > 0 ? Math.max(minFee, Math.round(buyGross * feeRate)) : 0;
    var buyTotalCost = buyGross + buyFee;
 
    var sellGross = suggestedSell * sellPrice;
    var sellFee = suggestedSell > 0 ? Math.max(minFee, Math.round(sellGross * feeRate)) : 0;
    var sellTax = suggestedSell > 0 ? Math.round(sellGross * taxRate) : 0;
    var sellNetProceeds = sellGross - sellFee - sellTax;
 
    totalBuyTotalCost += buyTotalCost;
    totalSellNetProceeds += sellNetProceeds;
 
    rows.push({ row: row, code: code, targetPct: targetPct, buyShares: suggestedBuy, buyPrice: buyPrice, buyTotalCost: buyTotalCost, finalBuyShares: suggestedBuy });
  }
 
  var availableFunds = currentCash + totalSellNetProceeds;
  var shortfall = totalBuyTotalCost - availableFunds;
 
  var msg = "現金:" + currentCash.toFixed(0) + " 元\n";
  msg += "預估賣出淨回收:" + totalSellNetProceeds.toFixed(0) + " 元\n";
  msg += "可用資金合計:" + availableFunds.toFixed(0) + " 元\n";
  msg += "預估買進所需:" + totalBuyTotalCost.toFixed(0) + " 元\n\n";
 
  if (totalBuyTotalCost <= 0) {
    msg += "目前沒有低配的部位需要買進。";
  } else if (shortfall <= 0) {
    msg += "✅ 資金足夠,買進後剩餘現金約 " + (availableFunds - totalBuyTotalCost).toFixed(0) + " 元。";
  } else {
    msg += "⚠️ 資金不足,還差 " + shortfall.toFixed(0) + " 元。\n\n已依目標比例分配(結果寫入工作表1的S欄):\n\n";
    var buyRows = rows.filter(function (r) { return r.buyShares > 0; });

    var weightSum = 0;
    for (var w = 0; w < buyRows.length; w++) {
      weightSum += buyRows[w].targetPct;
    }

    for (var i = 0; i < buyRows.length; i++) {
      var r = buyRows[i];
      var weight = weightSum > 0 ? (r.targetPct / weightSum) : 0;
      var budget = availableFunds * weight;

      var shares = Math.floor(budget / r.buyPrice);
      if (shares > r.buyShares) shares = r.buyShares;
      while (shares > 0) {
        var gross = shares * r.buyPrice;
        var fee = Math.max(minFee, Math.round(gross * feeRate));
        if (gross + fee <= budget) break;
        shares--;
      }

      r.finalBuyShares = shares;
      if (shares >= r.buyShares && shares > 0) {
        msg += "✅ " + r.code + "（目標" + (r.targetPct * 100).toFixed(1) + "%）買進 " + shares + " 股\n";
      } else if (shares > 0) {
        msg += "⚠️ " + r.code + "（目標" + (r.targetPct * 100).toFixed(1) + "%）依比例分配只夠買 " + shares + " 股\n";
      } else {
        msg += "❌ " + r.code + "（目標" + (r.targetPct * 100).toFixed(1) + "%）分配金額不足,這次先不買\n";
      }
    }
  }
 
  for (var j = 0; j < rows.length; j++) {
    sheet.getRange(rows[j].row, 19).setValue(rows[j].finalBuyShares); // S欄
  }
 
  ui.alert("再平衡資金試算", msg, ui.ButtonSet.OK);
}

function simulateDropByCategory() {
  var html = HtmlService.createHtmlOutputFromFile('SimulateForm')
    .setWidth(400)
    .setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, '模擬下跌情境 - 各標的漲跌幅');
}

function processSimulation(data) {
  var sheet = SS_().getSheetByName("工作表1");
  
  var totalNow = 0;
  var totalAfter = 0;
  var msg = "各標的模擬漲跌幅：\n";
  
  for (var code in data) {
    msg += code + "：" + data[code] + "%\n";
  }
  msg += "\n";
  
  for (var row = 2; row <= LAY().last; row++) {
    var code = sheet.getRange(row, 1).getValue();
    var currentValue = sheet.getRange(row, 4).getValue();
    var dropPct = data[code] !== undefined ? data[code] : 0;
    var factor = 1 - (dropPct / 100);
    
    var afterValue = currentValue * factor;
    totalNow += currentValue;
    totalAfter += afterValue;
    if (currentValue > 0) {
      msg += code + "：" + currentValue.toFixed(0) + " 元 → " + afterValue.toFixed(0) + " 元\n";
    }
  }
  
  var cash = sheet.getRange(R_(10), 4).getValue();
  totalNow += cash;
  totalAfter += cash;
  
  msg += "\n現金（不受影響）：" + cash.toFixed(0) + " 元\n";
  msg += "\n目前總資產：" + totalNow.toFixed(0) + " 元\n";
  msg += "情境後總資產：" + totalAfter.toFixed(0) + " 元\n";
  var actualPct = totalNow !== 0 ? ((totalNow - totalAfter) / totalNow * 100).toFixed(1) : "0.0";
  msg += "整體變化：" + (totalNow - totalAfter).toFixed(0) + " 元（" + actualPct + "%）";
  
  SpreadsheetApp.getUi().alert("模擬下跌情境結果", msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function updateInvestmentSummary() {
  var ss = SS_();
  var logSheet = ss.getSheetByName("交易紀錄");
  
  if (!logSheet) {
    SpreadsheetApp.getUi().alert("找不到「交易紀錄」分頁，請先確認分頁名稱正確。");
    return;
  }
  
  var currentYear = new Date().getFullYear();
  var sheetName = "投入摘要_" + currentYear;
  var summarySheet = ss.getSheetByName(sheetName);
  
  if (!summarySheet) {
    summarySheet = ss.insertSheet(sheetName);
    summarySheet.getRange(1, 1, 1, 2).setValues([["期間", "投入金額"]]);
  }
  
  var data = logSheet.getDataRange().getValues();

  
  var monthWeekAmounts = [];
  for (var m = 0; m < 12; m++) {
    monthWeekAmounts.push([0, 0, 0, 0, 0]);
  }
  var monthAmounts = new Array(12).fill(0);
  var quarterAmounts = [0, 0, 0, 0];
  var yearTotal = 0;
  
  for (var i = 1; i < data.length; i++) {
    var date = new Date(data[i][0]);
    var amount = data[i][7]; // H欄 淨額(含手續費的實際投入成本)
    var type = data[i][8];   // I欄 類型
    
    if (type !== "買進" || !(date instanceof Date) || isNaN(date)) continue;
    if (date.getFullYear() !== currentYear) continue;
    
    var monthIndex = date.getMonth();
    var quarterIndex = Math.floor(monthIndex / 3);
    var weekOfMonth = Math.ceil(date.getDate() / 7) - 1;
    if (weekOfMonth > 4) weekOfMonth = 4;
    
    monthWeekAmounts[monthIndex][weekOfMonth] += amount;
    monthAmounts[monthIndex] += amount;
    quarterAmounts[quarterIndex] += amount;
    yearTotal += amount;
  }
  
  var output = [];
  var monthNames = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
  
  for (var m = 0; m < 12; m++) {
    for (var w = 0; w < 5; w++) {
      output.push([monthNames[m] + "第" + (w+1) + "週", monthWeekAmounts[m][w]]);
    }
    output.push([monthNames[m] + "合計", monthAmounts[m]]);
  }
  
  for (var q = 0; q < 4; q++) {
    output.push(["第" + (q+1) + "季", quarterAmounts[q]]);
  }
  
  output.push(["全年合計", yearTotal]);
  
  var lastRow = summarySheet.getLastRow();
  if (lastRow > 1) {
    summarySheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  }
  summarySheet.getRange(2, 1, output.length, 2).setValues(output);
  
  SpreadsheetApp.getUi().alert("「" + sheetName + "」已更新！共 " + output.length + " 列。");
}

function resetTestData() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    '⚠️ 重置確認',
    '這會清空持股、現金、成本、交易紀錄、歷史配置、收支紀錄，並將目前資料備份到新分頁。確定要執行嗎？',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) {
    return;
  }
  
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var logSheet = ss.getSheetByName("交易紀錄");
  var histSheet = ss.getSheetByName("歷史配置");
  var ledgerSheet = ss.getSheetByName("收支紀錄");
  
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
  var backupSheet = sheet.copyTo(ss);
  backupSheet.setName("備份_" + timestamp);
  
  if (logSheet) {
    var logBackup = logSheet.copyTo(ss);
    logBackup.setName("交易紀錄備份_" + timestamp);
  }
  
  if (histSheet) {
    var histBackup = histSheet.copyTo(ss);
    histBackup.setName("歷史配置備份_" + timestamp);
  }
  
  if (ledgerSheet) {
    var ledgerBackup = ledgerSheet.copyTo(ss);
    ledgerBackup.setName("收支紀錄備份_" + timestamp);
  }
  
  sheet.getRange(2, 2, LAY().n, 1).setValue(0);
  sheet.getRange(2, 12, LAY().n, 1).setValue(0);
  sheet.getRange(R_(10), 4).setValue(0);
  sheet.getRange(R_(16), 2).setValue(0);
  
  if (logSheet) {
    var lastRow = logSheet.getLastRow();
    if (lastRow > 1) {
      logSheet.getRange(2, 1, lastRow - 1, logSheet.getLastColumn()).clearContent();
    }
  }
  
  if (histSheet) {
    var histLastRow = histSheet.getLastRow();
    if (histLastRow > 1) {
      histSheet.getRange(2, 1, histLastRow - 1, histSheet.getLastColumn()).clearContent();
    }
  }
  
   if (ledgerSheet) {
    var ledgerLastRow = ledgerSheet.getLastRow();
    if (ledgerLastRow > 1) {
      ledgerSheet.getRange(2, 1, ledgerLastRow - 1, ledgerSheet.getLastColumn()).clearContent();
    }
  }

  // 徹底歸零：生活帳戶相關欄位（原本的重置沒有清到這幾格，導致殘值一直留著）
  sheet.getRange(R_(38), 2).setValue(0);   // B38 現金欠款累積
  sheet.getRange(R_(45), 2).setValue(0);   // B45 生活帳戶餘額
  sheet.getRange(R_(46), 2).setValue(0);   // B46 本月已花費
  sheet.getRange(R_(47), 2).setValue(0);   // B47 本週剩餘理論額度
  sheet.getRange(R_(48), 2).clearContent(); // B48 最近補繳提示

  // 手續費相關欄位也一併歸零，跟D10現金、交易紀錄一起重新開始
  sheet.getRange(R_(12), 2).setValue(0);   // B12 本月預估未回補手續費
  sheet.getRange(R_(13), 2).setValue(0);   // B13 上月實際已退回手續費
  if (typeof healthDrop_ === "function") healthDrop_("all");
  sheet.getRange(R_(24), 2).setFormula("=SUM('交易紀錄'!F2:G)");   // B24 累計已繳手續費+稅（公式；寫成 0 的話之後就不會再累計）

  ui.alert("已重置完成！生活帳戶、手續費相關欄位也已一併歸零。原始資料已備份到「備份_" + timestamp + "」、「交易紀錄備份_" + timestamp + "」、「歷史配置備份_" + timestamp + "」和「收支紀錄備份_" + timestamp + "」分頁，如需復原可從那裡手動複製回來。");
}

function snapshotAllocation() {
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var histSheet = ss.getSheetByName("歷史配置");
  
  var valueData = sheet.getRange(2, 4, LAY().n, 1).getValues(); // D 欄 目前市值(不是佔比)
  var cashAmount = sheet.getRange(R_(10), 4).getValue(); // D10 現金金額(不是佔比)
  var totalAssets = sheet.getRange(R_(14), 2).getValue(); // B14 目前總資產
  
  var row = [new Date()];
  for (var i = 0; i < 8; i++) {
    row.push(valueData[i][0]);
  }
  row.push(cashAmount);
  row.push(totalAssets);
  for (var x = 8; x < valueData.length; x++) row.push(valueData[x][0]); // 多加的標的放在最後面，舊的欄位不會跑掉
  
  histSheet.appendRow(row);
}
function exportFinancialSummary() {
  var ui = SpreadsheetApp.getUi();
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  
  var totalAssets = sheet.getRange(R_(14), 2).getValue();
  var totalReturn = sheet.getRange(R_(15), 2).getValue();
  var totalDeposit = sheet.getRange(R_(16), 2).getValue();
  var cash = sheet.getRange(R_(10), 4).getValue();
  var cashPct = sheet.getRange(R_(10), 5).getValue();
  
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm");
  
  var doc = DocumentApp.create("資產配置摘要_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss"));
  var body = doc.getBody();
  
  body.appendParagraph("資產配置財務摘要").setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph("報表時間：" + today);
  body.appendParagraph("");
  
  body.appendParagraph("整體概況").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("目前總資產：" + totalAssets.toFixed(0) + " 元");
  body.appendParagraph("累計入金總額：" + totalDeposit.toFixed(0) + " 元");
  body.appendParagraph("整體投資報酬率：" + (totalReturn * 100).toFixed(2) + "%");
  body.appendParagraph("現金：" + cash.toFixed(0) + " 元（佔比 " + (cashPct * 100).toFixed(1) + "%）");
  body.appendParagraph("");
  
  body.appendParagraph("各標的明細").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  
  var table = [["代號", "持有股數", "即時股價", "目前市值", "目前佔比", "目標比例", "偏離狀態", "報酬率"]];
  
  for (var row = 2; row <= LAY().last; row++) {
    var code = sheet.getRange(row, 1).getValue();
    var shares = sheet.getRange(row, 2).getValue();
    var price = sheet.getRange(row, 3).getValue();
    var value = sheet.getRange(row, 4).getValue();
    var pct = sheet.getRange(row, 5).getValue();
    var target = sheet.getRange(row, 6).getValue();
    var status = sheet.getRange(row, 7).getValue();
    var ret = sheet.getRange(row, 13).getValue();
    
    table.push([
      code,
      shares.toString(),
      price.toFixed(2),
      value.toFixed(0),
      (pct * 100).toFixed(1) + "%",
      (target * 100).toFixed(1) + "%",
      status,
      (ret * 100).toFixed(2) + "%"
    ]);
  }
  
  body.appendTable(table);
  
  doc.saveAndClose();
  
  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getAs("application/pdf");
  var pdfFile = DriveApp.createFile(pdfBlob).setName("資產配置摘要_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + ".pdf");
  
  // docFile.setTrashed(true);
  
  var pdfUrl = pdfFile.getUrl();
  ui.alert("財務摘要已產生！", "PDF 已存到你的雲端硬碟。\n\n連結：" + pdfUrl, ui.ButtonSet.OK);
}
// 4. 撤銷最後一筆交易紀錄,並復原對應的持股/成本/現金

// 1. 檢查是否該執行下一批投入
function checkNextInvestmentReminder() {
  var ui = SpreadsheetApp.getUi();
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var logSheet = ss.getSheetByName("交易紀錄");
  
  var minDays = 7; // 可自行調整:距離上次投入至少幾天才提醒
  var minCash = 10000; // 可自行調整:現金至少多少才值得執行
  
  var currentCash = sheet.getRange(R_(10), 4).getValue();
  var daysSince = 9999;
  
  if (logSheet) {
    var logData = logSheet.getDataRange().getValues();
    var lastDate = null;
    for (var i = 1; i < logData.length; i++) {
      var d = new Date(logData[i][0]);
      if (d instanceof Date && !isNaN(d)) {
        if (!lastDate || d > lastDate) lastDate = d;
      }
    }
    if (lastDate) {
      daysSince = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
    }
  }
  
  if (daysSince >= minDays && currentCash >= minCash) {
    ui.alert("💡 進場提醒", "距離上次投入已 " + daysSince + " 天，目前現金 " + currentCash.toFixed(0) + " 元，可以考慮執行下一批投入。", ui.ButtonSet.OK);
  } else {
    ui.alert("目前狀態", "距離上次投入 " + daysSince + " 天，現金 " + currentCash.toFixed(0) + " 元，尚未達到提醒門檻（" + minDays + "天 / " + minCash + "元）。", ui.ButtonSet.OK);
  }
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📱 快速操作')
    .addItem('✅ 確認已購買', 'confirmPurchase')
    .addItem('💡 該進場了嗎', 'checkNextInvestmentReminder')
    .addItem('🔍 再平衡試算（彈窗）', 'rebalanceTrialV4')
    .addItem('💰 預覽本月手續費回補', 'previewPendingFeeRebate')
    .addSeparator()
    .addItem('🏠 校準本週生活帳戶', 'refreshWeeklyLifeAccountV2')
    .addItem('🛠️ 修復記帳觸發器', 'switchExpenseTriggerToV2')
    .addToUi();
}
// ============================================
// 第一次執行:建立記帳用 Google 表單
// 執行方式:在 Apps Script 編輯器上方函數下拉選單選 setupExpenseForm,按執行(▶)
// 只需要執行一次,執行完會跳出表單網址,記得收藏/加到手機主畫面
// ============================================
// ============================================
// 第一次執行:建立新版記帳表單(金額→類型→分流分類→備註)
// 執行前請先刪除雲端硬碟裡舊的「記帳」表單,避免混淆
// 執行方式:函數下拉選單選 setupExpenseFormV2,按執行(▶)
// ============================================
// ============================================
// 執行前請先:
// 1. 雲端硬碟刪除舊的「記帳」表單
// 2. Apps Script「觸發條件」頁面刪除所有 onExpenseFormSubmit 觸發器
// 執行方式:函數下拉選單選 setupExpenseFormV3,按執行(▶),耐心等待2~3分鐘不要中斷
// ============================================
// ============================================
// 執行前請先:
// 1. 雲端硬碟刪除舊的「記帳」表單
// 2. Apps Script「觸發條件」頁面刪除所有 onExpenseFormSubmit 觸發器
// 執行方式:函數下拉選單選 setupExpenseFormV3,按執行(▶),耐心等待2~3分鐘不要中斷
// ============================================
function setupExpenseFormV3() {
  var ss = SS_();
  var form = FormApp.create('記帳');
  form.setDescription('隨手記一筆收入或支出');

  var incomeCategories = ['薪水', '獎金', '其他'];
  var expenseCategories = ['餐飲', '交通', '日常用品', '娛樂', '醫療', '其他'];

  form.addTextItem()
    .setTitle('金額')
    .setRequired(true);

  var typeItem = form.addMultipleChoiceItem()
    .setTitle('類型')
    .setRequired(true);

  var incomePage = form.addPageBreakItem().setTitle('收入分類');
  var incomeItem = form.addMultipleChoiceItem()
    .setTitle('收入分類')
    .setChoiceValues(incomeCategories)
    .showOtherOption(true)
    .setRequired(true);
  form.addTextItem().setTitle('備註').setRequired(false);
  incomePage.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  var expensePage = form.addPageBreakItem().setTitle('支出分類');
  var expenseItem = form.addMultipleChoiceItem()
    .setTitle('支出分類')
    .setChoiceValues(expenseCategories)
    .showOtherOption(true)
    .setRequired(true);
  form.addMultipleChoiceItem()
    .setTitle('是否為一次性大額支出（不列入可花費額度比較）')
    .setChoiceValues(['否', '是'])
    .setRequired(true);
  form.addTextItem().setTitle('備註').setRequired(false);
  expensePage.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  typeItem.setChoiceValues(['收入', '支出']);
  typeItem.setChoices([
    typeItem.createChoice('收入', incomePage),
    typeItem.createChoice('支出', expensePage)
  ]);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var props = PROPS_();
  props.setProperty('EXPENSE_FORM_ID', form.getId());
  props.setProperty('INCOME_CATEGORIES', JSON.stringify(incomeCategories));
  props.setProperty('EXPENSE_CATEGORIES', JSON.stringify(expenseCategories));

  ScriptApp.newTrigger('onExpenseFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

    var sheet = ss.getSheetByName("工作表1");
  if (sheet) {
    sheet.getRange(R_(49), 1).setValue("記帳表單網址");
    sheet.getRange(R_(49), 2).setValue(form.getPublishedUrl());
  }

  var ui = SpreadsheetApp.getUi();
  ui.alert(
    '表單建立完成！',
    '填寫網址已存入工作表1的B49儲存格，也可以直接點擊使用:\n\n' + form.getPublishedUrl(),
    ui.ButtonSet.OK
  );
}
function processNewExpenseResponses() {
  /*
   * 正式版已停用舊表單回覆補處理。
   *
   * 這個函式若重新處理歷史回覆，
   * 可能讓同一筆收入或支出重複記帳，
   * 並重複改動D10、B16及B45。
   */
  Logger.log(
    "processNewExpenseResponses已停用，" +
    "沒有重播任何收支紀錄。"
  );

  return;
}
function learnNewCategory(category, itemTitle, propertyKey) {
  if (!category) return;

  var props = PROPS_();
  var formId = props.getProperty('EXPENSE_FORM_ID');
  if (!formId) return;

  var existing = JSON.parse(props.getProperty(propertyKey) || '[]');
  if (existing.indexOf(category) !== -1) return;

  existing.push(category);
  props.setProperty(propertyKey, JSON.stringify(existing));

  var form = FormApp.openById(formId);
  var items = form.getItems(FormApp.ItemType.MULTIPLE_CHOICE);
  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === itemTitle) {
      var mcItem = items[i].asMultipleChoiceItem();
      mcItem.setChoiceValues(existing);
      mcItem.showOtherOption(true);
      break;
    }
  }
}
function resetLedgerData() {
  var ui = SpreadsheetApp.getUi();
  var props = PROPS_();
  var rawBaseline = props.getProperty('LIFE_ACCOUNT_TEST_BASELINE_V2');

  if (!rawBaseline) {
    ui.alert("尚未保存測試起點。請先執行 saveLifeAccountTestBaselineV2()，再開始測試。");
    return;
  }

  var response = ui.alert(
    '⚠️ 測試重置確認',
    '這會刪除保存測試起點之後新增的收支紀錄，並把 D10、B38、B45、B48 還原到測試前。確定要執行嗎？',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  
  var ss = SS_();
  var ledgerSheet = ss.getSheetByName('收支紀錄');
  var sheet = ss.getSheetByName('工作表1');
  
  if (!ledgerSheet) {
    ui.alert("找不到「收支紀錄」分頁。");
    return;
  }
  
  var baseline = JSON.parse(rawBaseline);
  var lastRow = ledgerSheet.getLastRow();
  var baselineLastRow = Math.max(1, Number(baseline.ledgerLastRow) || 1);

  if (lastRow > baselineLastRow) {
    ledgerSheet.deleteRows(baselineLastRow + 1, lastRow - baselineLastRow);
  }

  sheet.getRange(R_(10), 4).setValue(Number(baseline.cash) || 0);
  sheet.getRange(R_(38), 2).setValue(Number(baseline.cashDebt) || 0);
  sheet.getRange(R_(45), 2).setValue(Number(baseline.lifeAccount) || 0);
  sheet.getRange(R_(48), 2).setValue(baseline.notice || '');
  refreshLifeAccountDisplayV2_(ss);

  ui.alert("已回到測試起點；D10、B38、B45、B48與測試期間新增的收支紀錄均已還原。");
}

function saveLifeAccountTestBaselineV2() {
  var ss = SS_();
  var sheet = ss.getSheetByName('工作表1');
  var ledgerSheet = ss.getSheetByName('收支紀錄');
  if (!sheet || !ledgerSheet) {
    SpreadsheetApp.getUi().alert('找不到工作表1或收支紀錄分頁。');
    return;
  }

  var baseline = {
    cash: Number(sheet.getRange(R_(10), 4).getValue()) || 0,
    cashDebt: Number(sheet.getRange(R_(38), 2).getValue()) || 0,
    lifeAccount: Number(sheet.getRange(R_(45), 2).getValue()) || 0,
    notice: sheet.getRange(R_(48), 2).getValue() || '',
    ledgerLastRow: ledgerSheet.getLastRow(),
    savedAt: new Date().toISOString()
  };

  PROPS_()
    .setProperty('LIFE_ACCOUNT_TEST_BASELINE_V2', JSON.stringify(baseline));

  SpreadsheetApp.getUi().alert(
    '測試起點已保存',
    'D10=' + baseline.cash.toFixed(2) + '\nB38=' + baseline.cashDebt.toFixed(2) + '\nB45=' + baseline.lifeAccount.toFixed(2),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
function setupTradeFormV1() {
  var ss = SS_();
  var form = FormApp.create('股票交易登記');
  form.setDescription('記錄一筆買進或賣出');

  var codes = ['TPE:006208', 'TPE:00646', 'TPE:00662', 'TPE:00645', 'TPE:00709', 'TPE:00679B', 'TPE:00635U', 'TPE:00719B'];

  form.addMultipleChoiceItem()
    .setTitle('交易類型')
    .setChoiceValues(['買進', '賣出'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('標的代號')
    .setChoiceValues(codes)
    .setRequired(true);

  form.addTextItem()
    .setTitle('股數')
    .setRequired(true);

  form.addTextItem()
    .setTitle('成交價（選填，留空則用當下即時股價）')
    .setRequired(false);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var props = PROPS_();
  props.setProperty('TRADE_FORM_ID', form.getId());

  ScriptApp.newTrigger('onTradeFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  var ui = SpreadsheetApp.getUi();
  ui.alert(
    '交易表單建立完成！',
    '填寫網址(請收藏或加到手機主畫面):\n\n' + form.getPublishedUrl(),
    ui.ButtonSet.OK
  );
}

function processNewTradeResponses() {
  /*
   * 正式版已停用舊表單回覆補處理。
   *
   * 這個函式若重新處理歷史回覆，
   * 可能讓同一筆股票交易重複增加持股、
   * 重複扣除D10現金。
   */
  Logger.log(
    "processNewTradeResponses已停用，" +
    "沒有重播任何股票交易。"
  );

  return;
}
function getMonthSpentSoFar(ss) {
  var ledgerSheet = ss.getSheetByName('收支紀錄');
  if (!ledgerSheet || ledgerSheet.getLastRow() <= 1) return 0;

  var data = ledgerSheet.getRange(2, 1, ledgerSheet.getLastRow() - 1, 6).getValues();
  var today = new Date();
  var total = 0;

  for (var i = 0; i < data.length; i++) {
    var date = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    var type = String(data[i][1] || '').trim();
    var amount = Number(data[i][3]) || 0;
    var isOneTime = String(data[i][5] || '').trim();

    if (!isNaN(date.getTime()) &&
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        type === '支出' &&
        isOneTime !== '是') {
      total += amount;
    }
  }
  return total;
}



function refreshWeeklyLifeAccountLegacyDisabled_() {
  /*
   * 舊版生活帳戶校準已停用。
   * 正式版本使用下方的
   * refreshWeeklyLifeAccountV2()。
   */
  return;
}

function setupWeeklyLifeAccountTriggerV2() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'refreshWeeklyLifeAccountV2') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('refreshWeeklyLifeAccountV2')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  SpreadsheetApp.getUi().alert('每週一上午8點的生活帳戶校準已建立。');
}

// 執行一次即可：移除會重複處理同一筆表單的舊觸發器，只保留一個正式入口。
function repairExpenseFormTriggerV2() {
  var ss = SS_();
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === 'onExpenseFormSubmit' || handler === 'processNewExpenseResponses') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  ScriptApp.newTrigger('onExpenseFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  SpreadsheetApp.getUi().alert('記帳觸發器已修復：移除 ' + removed + ' 個舊觸發器，現在只保留1個正式入口。');
}
function onExpenseFormSubmit(e) {
  /*
   * 舊觸發器相容入口。
   * 即使還有舊觸發器誤呼叫，
   * 也全部交給正式V2處理。
   */
  return onExpenseFormSubmitV2(e);
}

function settleIncomeToLatestAllowanceV2_(ss, sheet, cash, lifeAccount) {
  var allowance = null;

  for (var i = 0; i < 10; i++) {
    sheet.getRange(R_(10), 4).setValue(cash);
    sheet.getRange(R_(45), 2).setValue(lifeAccount);
    SpreadsheetApp.flush();

    var monthSpent = getMonthSpentSoFar(ss);
    allowance = getLifeAllowanceV2_(sheet, monthSpent, new Date());
    var difference = allowance.target - lifeAccount;

    if (Math.abs(difference) < 0.005) {
      break;
    }

    if (difference > 0) {
      var transferToLife = Math.min(
        difference,
        Math.max(0, cash)
      );

      cash -= transferToLife;
      lifeAccount += transferToLife;

      if (transferToLife <= 0) {
        break;
      }

    } else {
      var transferToCash = -difference;

      lifeAccount -= transferToCash;
      cash += transferToCash;
    }
  }

  sheet.getRange(R_(10), 4).setValue(cash);
  sheet.getRange(R_(45), 2).setValue(lifeAccount);
  SpreadsheetApp.flush();

  return {
    cash: cash,
    lifeAccount: lifeAccount,
    allowance: allowance
  };
}



// 執行一次：把舊記帳觸發器改成V2
function switchExpenseTriggerToV2() {
  var ss =
    SS_();

  var triggers =
    ScriptApp.getProjectTriggers();

  var removed = 0;

  for (var i = 0; i < triggers.length; i++) {
    var handler =
      triggers[i].getHandlerFunction();

    if (
      handler === "onExpenseFormSubmit" ||
      handler === "onExpenseFormSubmitV2" ||
      handler === "processNewExpenseResponses"
    ) {
      ScriptApp.deleteTrigger(
        triggers[i]
      );

      removed++;
    }
  }

  ScriptApp
    .newTrigger("onExpenseFormSubmitV2")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  SpreadsheetApp
    .getUi()
    .alert(
      "生活帳戶V2已啟用",
      "已移除 " +
        removed +
        " 個舊記帳觸發器，並建立1個 onExpenseFormSubmitV2。",
      SpreadsheetApp
        .getUi()
        .ButtonSet.OK
    );
}
// 股票表單V2分流：不是股票表單就直接略過
function onTradeFormSubmitV2(e) {
  if (!e || !e.namedValues) {
    throw new Error("缺少表單提交事件資料。");
  }

  var responses = e.namedValues;

  if (
    !responses["交易類型"] ||
    !responses["標的代號"] ||
    !responses["股數"]
  ) {
    Logger.log("這不是股票交易表單，直接略過。");
    return;
  }

  // Feature B：如果填了自由輸入的個股代號，優先用它，並自動登記進A6~A9空格

  var customRaw = responses[STOCK_FIELD_TITLE_] ? responses[STOCK_FIELD_TITLE_][0] : "";
  var customCode = normalizeStockCode_(customRaw);

  if (customCode) {
    var slotRow = ensureStockSlot_(customCode);
    if (slotRow === -1) {
      SEND_MAIL_(
        NOTIFY_EMAIL_(),
        "交易表單異常",
        "個股代號「" + customCode + "」沒有空格可以登記（A6~A9都已經有持股或成本），本次交易沒有執行。"
      );
      return;
    }
    responses["標的代號"] = [customCode]; // 蓋掉下拉選單的值，改用這個新代號
  }

  // 確認是股票表單後，交給原本交易程式處理
  onTradeFormSubmit(e);
}

function refreshWeeklyLifeAccountV2() {
  var lock = LOCK_();

  try {
    lock.waitLock(10000);

  } catch (err) {
    Logger.log(
      "無法取得鎖，" +
      "每週生活帳戶校準略過：" +
      err
    );

    return;
  }

  try {
    var ss =
      SS_();

    var sheet =
      ss.getSheetByName("工作表1");

    if (!sheet) {
      throw new Error(
        "找不到工作表1。"
      );
    }

    var cashBefore =
      readFiniteNumberV2_(
        sheet.getRange(R_(10), 4),
        "D10現金"
      );

    var lifeBefore =
      readFiniteNumberV2_(
        sheet.getRange(R_(45), 2),
        "B45生活帳戶餘額"
      );

    if (
      cashBefore < 0 ||
      lifeBefore < 0
    ) {
      throw new Error(
        "D10或B45出現負數，" +
        "本次生活帳戶校準已停止。"
      );
    }

    var settled =
      settleIncomeToLatestAllowanceV2_(
        ss,
        sheet,
        cashBefore,
        lifeBefore
      );

    var cashAfter =
      settled.cash;

    var lifeAfter =
      settled.lifeAccount;

    var difference =
      lifeAfter - lifeBefore;

    refreshLifeAccountDisplayV2_(ss);

    var message = "";

    if (
      settled.allowance &&
      settled.allowance.isFallback
    ) {
      message =
        "股價或上游公式暫時異常；" +
        "本次沿用上次有效週額度" +
        "完成安全校準。";

    } else if (difference > 0.005) {
      message =
        "正常月額度：" +
        "已由D10補入" +
        difference.toFixed(2) +
        "元，並依最新週額度完成校準。";

    } else if (difference < -0.005) {
      message =
        "生活帳戶超額" +
        Math.abs(difference).toFixed(2) +
        "元，已轉回D10，" +
        "並依最新週額度完成校準。";

    } else {
      message =
        "生活帳戶已符合最新週額度，" +
        "無須移轉。";
    }

    Logger.log(message);

    sendLifeAccountNoticeV2_(
      sheet,
      message
    );

  } finally {
    lock.releaseLock();
  }
}
function refreshLifeAccountDisplayV2_(ss) {
  var sheet =
    ss.getSheetByName("工作表1");

  if (!sheet) {
    throw new Error("找不到工作表1。");
  }

  var monthSpent =
    getMonthSpentSoFar(ss);

  var allowance =
    getLifeAllowanceV2_(
      sheet,
      monthSpent,
      new Date()
    );

  sheet.getRange(R_(46), 2).setValue(monthSpent);
  sheet.getRange(R_(47), 2).setValue(allowance.target);
}


// ============================================
// 生活帳戶通知
// ============================================

function sendLifeAccountNoticeV2_(sheet, message) {
  var timestamp =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "MM/dd HH:mm"
    );

  Logger.log(message);

  sheet
    .getRange(R_(48), 2)
    .setValue(
      message +
      "（" +
      timestamp +
      "）"
    );

  try {
    SEND_MAIL_(
      NOTIFY_EMAIL_(),
      "生活帳戶通知",
      message
    );

  } catch (mailError) {
    Logger.log(
      "通知信寄送失敗，但生活帳戶處理已完成：" +
      mailError
    );
  }
}
function parseMoneyV2_(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return NaN;
  }

  var text = String(rawValue)
    .trim()
    .replace(/^NT\$/i, "")
    .replace(/[,，\s]/g, "");

  if (text === "") {
    return NaN;
  }

  var value = Number(text);

  return isFinite(value)
    ? value
    : NaN;
}


function readFiniteNumberV2_(range, label) {
  var value = Number(range.getValue());

  if (!isFinite(value)) {
    throw new Error(
      label +
      "目前不是有效數字，未執行任何變動。"
    );
  }

  return value;
}
function onTradeFormSubmit(e) {
  var lock = LOCK_();

  try {
    lock.waitLock(10000);
  } catch (err) {
    Logger.log("無法取得鎖，交易處理略過：" + err);
    return;
  }

  try {
    if (!e || !e.namedValues) {
      throw new Error(
        "缺少股票表單提交資料。請勿直接在編輯器執行此函式。"
      );
    }

    var ss = SS_();
    var sheet = ss.getSheetByName("工作表1");
    var logSheet = ss.getSheetByName("交易紀錄");

    if (!sheet) {
      throw new Error(
        "找不到工作表1，交易未執行。"
      );
    }

    if (!logSheet) {
      logSheet = ss.insertSheet("交易紀錄");

      logSheet
        .getRange(1, 1, 1, 10)
        .setValues([[
          "日期",
          "代號",
          "股數",
          "成交價",
          "金額(毛額)",
          "手續費",
          "證交稅",
          "淨額",
          "類型",
          "撤銷用成本"
        ]]);
    }

    var responses = e.namedValues;

    var type = responses["交易類型"]
      ? String(responses["交易類型"][0]).trim()
      : "";

    var code = responses["標的代號"]
      ? String(responses["標的代號"][0]).trim()
      : "";

    var sharesRaw = responses["股數"]
      ? responses["股數"][0]
      : "";

    var shares = parseMoneyV2_(sharesRaw);

    var priceTitle =
      "成交價（選填，留空則用當下即時股價）";

    var manualPriceRaw = responses[priceTitle]
      ? responses[priceTitle][0]
      : "";

    var manualPrice =
      String(manualPriceRaw).trim() === ""
        ? null
        : parseMoneyV2_(manualPriceRaw);

    if (
      (type !== "買進" && type !== "賣出") ||
      !code ||
      !isFinite(shares) ||
      shares <= 0 ||
      Math.floor(shares) !== shares
    ) {
      SEND_MAIL_(
        NOTIFY_EMAIL_(),
        "交易表單異常",
        "交易類型、代號或股數無效。" +
        "股數必須是大於0的整數。" +
        "本次沒有改變持股、成本或現金。"
      );

      return;
    }

    if (
      manualPrice !== null &&
      (!isFinite(manualPrice) || manualPrice <= 0)
    ) {
      SEND_MAIL_(
        NOTIFY_EMAIL_(),
        "交易表單異常",
        "成交價格式無效，輸入值：" +
        manualPriceRaw +
        "。本次交易沒有執行。"
      );

      return;
    }

    var targetRow = -1;

    for (var row = 2; row <= LAY().last; row++) {
      var cellValue =
        sheet.getRange(row, 1).getValue();

      if (String(cellValue).trim() === code) {
        targetRow = row;
        break;
      }
    }

    if (targetRow === -1) {
      SEND_MAIL_(
        NOTIFY_EMAIL_(),
        "交易表單異常",
        "工作表1找不到標的代號：" +
        code +
        "。本次交易沒有執行。"
      );

      return;
    }

    var quotePrice =
      sheet.getRange(targetRow, 3).getValue();

    var actualPrice =
      manualPrice !== null
        ? manualPrice
        : Number(quotePrice);

    if (
      !isFinite(actualPrice) ||
      actualPrice <= 0
    ) {
      SEND_MAIL_(
        NOTIFY_EMAIL_(),
        "交易未執行：股價無效",
        code +
        "的即時股價目前無法使用。" +
        "請稍後重試，或在表單填入有效成交價。" +
        "持股、成本與現金均未變動。"
      );

      return;
    }

    var currentShares =
      readFiniteNumberV2_(
        sheet.getRange(targetRow, 2),
        code + "持有股數"
      );

    var currentCost =
      readFiniteNumberV2_(
        sheet.getRange(targetRow, 12),
        code + "持有成本"
      );

    var currentCash =
      readFiniteNumberV2_(
        sheet.getRange(R_(10), 4),
        "D10現金"
      );

    if (
      currentShares < 0 ||
      currentCost < 0 ||
      currentCash < 0
    ) {
      throw new Error(
        "持股、持有成本或D10現金出現負數，" +
        "為避免擴大錯誤，本次交易未執行。"
      );
    }

    var feeRate =
      Number(sheet.getRange(R_(21), 3).getValue()) ||
      0.001425;

    var taxRate =
      Number(sheet.getRange(R_(22), 3).getValue()) ||
      0.003;

    var minFee =
      Number(sheet.getRange(R_(23), 3).getValue()) ||
      20;

    var today = new Date();

    if (type === "買進") {
      var grossCost =
        shares * actualPrice;

      var fee = Math.max(
        minFee,
        Math.round(grossCost * feeRate)
      );

      var totalCost =
        grossCost + fee;

      if (totalCost > currentCash) {
        SEND_MAIL_(
          NOTIFY_EMAIL_(),
          "交易失敗通知",
          code +
          "買進失敗：現金不足。" +
          "需要" +
          totalCost.toFixed(0) +
          "元，目前D10只有" +
          currentCash.toFixed(0) +
          "元。"
        );

        return;
      }

      try {
        sheet
          .getRange(targetRow, 2)
          .setValue(currentShares + shares);

        sheet
          .getRange(targetRow, 12)
          .setValue(currentCost + totalCost);

        sheet
          .getRange(R_(10), 4)
          .setValue(currentCash - totalCost);

        if (!logSheet.getRange(1, 10).getValue()) {
          logSheet
            .getRange(1, 10)
            .setValue("撤銷用成本");
        }

        logSheet.appendRow([
          today,
          code,
          shares,
          actualPrice,
          grossCost,
          fee,
          0,
          totalCost,
          "買進",
          totalCost
        ]);

      } catch (buyWriteError) {
        sheet
          .getRange(targetRow, 2)
          .setValue(currentShares);

        sheet
          .getRange(targetRow, 12)
          .setValue(currentCost);

        sheet
          .getRange(R_(10), 4)
          .setValue(currentCash);

        throw buyWriteError;
      }

      Logger.log(
        code +
        "買進完成：" +
        shares +
        "股，總支出" +
        totalCost +
        "元。"
      );

    } else if (type === "賣出") {
      if (shares > currentShares) {
        SEND_MAIL_(
          NOTIFY_EMAIL_(),
          "交易失敗通知",
          code +
          "賣出失敗：輸入賣出" +
          shares +
          "股，但目前只有" +
          currentShares +
          "股。"
        );

        return;
      }

      var grossProceeds =
        shares * actualPrice;

      var sellFee = Math.max(
        minFee,
        Math.round(grossProceeds * feeRate)
      );

      var tax =
        Math.round(grossProceeds * taxRate);

      var netProceeds =
        grossProceeds - sellFee - tax;

      var costPerShare =
        currentShares > 0
          ? currentCost / currentShares
          : 0;

      var costRemoved =
        Math.round(costPerShare * shares);

      try {
        sheet
          .getRange(targetRow, 2)
          .setValue(currentShares - shares);

        sheet
          .getRange(targetRow, 12)
          .setValue(
            Math.max(
              0,
              currentCost - costRemoved
            )
          );

        sheet
          .getRange(R_(10), 4)
          .setValue(
            currentCash + netProceeds
          );

        if (!logSheet.getRange(1, 10).getValue()) {
          logSheet
            .getRange(1, 10)
            .setValue("撤銷用成本");
        }

        logSheet.appendRow([
          today,
          code,
          -shares,
          actualPrice,
          grossProceeds,
          sellFee,
          tax,
          netProceeds,
          "賣出",
          costRemoved
        ]);

      } catch (sellWriteError) {
        sheet
          .getRange(targetRow, 2)
          .setValue(currentShares);

        sheet
          .getRange(targetRow, 12)
          .setValue(currentCost);

        sheet
          .getRange(R_(10), 4)
          .setValue(currentCash);

        throw sellWriteError;
      }

      Logger.log(
        code +
        "賣出完成：" +
        shares +
        "股，實收" +
        netProceeds +
        "元。"
      );
    }

  } finally {
    lock.releaseLock();
  }
}
function undoLastTransaction() {
  var ui = SpreadsheetApp.getUi();
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var logSheet = ss.getSheetByName("交易紀錄");

  if (!sheet || !logSheet) {
    ui.alert(
      "找不到工作表1或交易紀錄分頁。"
    );
    return;
  }

  var lastRow = logSheet.getLastRow();

  if (lastRow <= 1) {
    ui.alert(
      "目前沒有可撤銷的交易紀錄。"
    );
    return;
  }

  var preview =
    logSheet
      .getRange(lastRow, 1, 1, 10)
      .getValues()[0];

  var previewCode = preview[1];
  var previewShares = Number(preview[2]);
  var previewNetAmount = Number(preview[7]);
  var previewType = preview[8];

  var response = ui.alert(
    "⚠️ 撤銷確認",
    "將撤銷最後一筆交易：\n" +
      previewCode +
      " " +
      previewType +
      " " +
      Math.abs(previewShares) +
      " 股\n" +
      "淨額：" +
      previewNetAmount +
      " 元\n\n" +
      "確定要撤銷嗎？",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  var lock = LOCK_();

  try {
    lock.waitLock(10000);
  } catch (lockError) {
    ui.alert(
      "系統正在處理其他交易，請稍後再試。"
    );
    return;
  }

  try {
    // 按下確認後重新讀取，避免確認期間又新增其他交易
    lastRow = logSheet.getLastRow();

    if (lastRow <= 1) {
      ui.alert(
        "交易紀錄已改變，沒有執行撤銷。"
      );
      return;
    }

    var record =
      logSheet
        .getRange(lastRow, 1, 1, 10)
        .getValues()[0];

    var code = String(record[1]).trim();
    var shares = Number(record[2]);
    var netAmount = Number(record[7]);
    var type = String(record[8]).trim();

    var recordedCostRaw = record[9];

    var recordedCost =
      recordedCostRaw === "" ||
      recordedCostRaw === null
        ? NaN
        : Number(recordedCostRaw);

    if (
      code !== String(previewCode).trim() ||
      shares !== previewShares ||
      netAmount !== previewNetAmount ||
      type !== String(previewType).trim()
    ) {
      ui.alert(
        "你確認期間出現了另一筆交易，" +
        "為避免撤銷錯筆，本次已停止。"
      );
      return;
    }

    if (
      !isFinite(shares) ||
      shares === 0 ||
      !isFinite(netAmount) ||
      netAmount < 0
    ) {
      ui.alert(
        "最後一筆交易資料不完整，" +
        "已停止撤銷，資料沒有變動。"
      );
      return;
    }

    var targetRow = -1;

    for (var row = 2; row <= LAY().last; row++) {
      var rowCode =
        String(
          sheet.getRange(row, 1).getValue()
        ).trim();

      if (rowCode === code) {
        targetRow = row;
        break;
      }
    }

    if (targetRow === -1) {
      ui.alert(
        "找不到對應標的 " +
        code +
        "，無法撤銷。"
      );
      return;
    }

    var currentShares =
      readFiniteNumberV2_(
        sheet.getRange(targetRow, 2),
        code + "持有股數"
      );

    var currentCost =
      readFiniteNumberV2_(
        sheet.getRange(targetRow, 12),
        code + "持有成本"
      );

    var currentCash =
      readFiniteNumberV2_(
        sheet.getRange(R_(10), 4),
        "D10現金"
      );

    var restoredShares;
    var restoredCost;
    var restoredCash;

    if (type === "買進") {
      var buyShares = Math.abs(shares);

      if (
        !isFinite(recordedCost) ||
        recordedCost < 0
      ) {
        // 舊版買進紀錄可用H欄實際支出還原
        recordedCost = netAmount;
      }

      if (
        currentShares < buyShares ||
        currentCost < recordedCost
      ) {
        ui.alert(
          "目前持股或成本已低於該筆買進資料，" +
          "不能安全撤銷。資料沒有變動。"
        );
        return;
      }

      restoredShares =
        currentShares - buyShares;

      restoredCost =
        Math.max(
          0,
          currentCost - recordedCost
        );

      restoredCash =
        currentCash + netAmount;

    } else if (type === "賣出") {
      if (
        !isFinite(recordedCost) ||
        recordedCost < 0
      ) {
        ui.alert(
          "這是舊版賣出紀錄，" +
          "沒有保存當時移除的持有成本，" +
          "不能安全自動撤銷。"
        );
        return;
      }

      if (currentCash < netAmount) {
        ui.alert(
          "D10現金不足以退回這筆賣出所得，" +
          "不能撤銷。資料沒有變動。"
        );
        return;
      }

      restoredShares =
        currentShares + Math.abs(shares);

      restoredCost =
        currentCost + recordedCost;

      restoredCash =
        currentCash - netAmount;

    } else {
      ui.alert(
        "最後一筆交易類型無法辨識，" +
        "資料沒有變動。"
      );
      return;
    }

    try {
      sheet
        .getRange(targetRow, 2)
        .setValue(restoredShares);

      sheet
        .getRange(targetRow, 12)
        .setValue(restoredCost);

      sheet
        .getRange(R_(10), 4)
        .setValue(restoredCash);

      logSheet.deleteRow(lastRow);

    } catch (writeError) {
      // 任一步失敗就把三個數字恢復
      sheet
        .getRange(targetRow, 2)
        .setValue(currentShares);

      sheet
        .getRange(targetRow, 12)
        .setValue(currentCost);

      sheet
        .getRange(R_(10), 4)
        .setValue(currentCash);

      throw writeError;
    }

    ui.alert(
      "已撤銷最後一筆交易，" +
      "持股、持有成本與D10現金均已復原。"
    );

  } finally {
    lock.releaseLock();
  }
}
function getLifeAllowanceV2_(
  sheet,
  monthSpent,
  referenceDate
) {
  var monthlyRemainingRaw =
    sheet.getRange(R_(33), 2).getValue();

  var monthlyRemaining =
    Number(monthlyRemainingRaw);

  /*
   * B33因GOOGLEFINANCE或上游公式暫時錯誤時：
   * 先沿用B47最近一次有效週額度。
   * 如果B47也失效，就以目前B45為目標。
   * 這樣可以繼續記帳，但不會胡亂搬動現金。
   */
  if (
    monthlyRemainingRaw === "" ||
    !isFinite(monthlyRemaining)
  ) {
    var previousWeeklyTarget =
      Number(
        sheet.getRange(R_(47), 2).getValue()
      );

    var currentLifeAccount =
      Number(
        sheet.getRange(R_(45), 2).getValue()
      );

    var safeTarget =
      isFinite(previousWeeklyTarget) &&
      previousWeeklyTarget >= 0
        ? previousWeeklyTarget
        : Math.max(
            0,
            isFinite(currentLifeAccount)
              ? currentLifeAccount
              : 0
          );

    return {
      mode: "暫用上次週額度",
      target: safeTarget,
      monthlyLimit: null,
      isFallback: true
    };
  }

  var daysInMonth =
    new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() + 1,
      0
    ).getDate();

  var daysLeftInMonth =
    daysInMonth -
    referenceDate.getDate() +
    1;

  var daysLeftInWeek =
    referenceDate.getDay() === 0
      ? 1
      : 8 - referenceDate.getDay();

  var coveredDays =
    Math.min(
      daysLeftInMonth,
      daysLeftInWeek
    );

  var remainingAmount =
    Math.max(
      0,
      monthlyRemaining
    );

  return {
    mode:
      remainingAmount > 0
        ? "正常月額度"
        : "備用金額度",

    /*
     * B33本身已經反映B31支出，
     * 所以這裡不能再次扣除monthSpent。
     */
    target:
      remainingAmount /
      daysLeftInMonth *
      coveredDays,

    monthlyLimit:
      remainingAmount,

    isFallback:
      false
  };
}
function onExpenseFormSubmitV2(e) {
  var lock = LOCK_();

  try {
    lock.waitLock(10000);
  } catch (err) {
    Logger.log(
      "無法取得鎖，記帳處理略過：" +
      err
    );
    return;
  }

  try {
    if (!e || !e.namedValues) {
      throw new Error(
        "缺少表單提交資料。" +
        "請勿直接在編輯器執行此函式。"
      );
    }

    var responses = e.namedValues;

    // 股票表單送出時，記帳程式直接略過
    if (
      !responses["金額"] ||
      !responses["類型"]
    ) {
      Logger.log(
        "這不是記帳表單，" +
        "onExpenseFormSubmitV2略過。"
      );
      return;
    }

    var ss =
      SS_();

    var sheet =
      ss.getSheetByName("工作表1");

    var ledgerSheet =
      ss.getSheetByName("收支紀錄");

    if (!sheet) {
      throw new Error(
        "找不到工作表1。"
      );
    }

    if (!ledgerSheet) {
      ledgerSheet =
        ss.insertSheet("收支紀錄");

      ledgerSheet
        .getRange(1, 1, 1, 6)
        .setValues([[
          "日期",
          "類型",
          "分類",
          "金額",
          "備註",
          "一次性排除"
        ]]);
    }

    var amount =
      responses["金額"]
        ? parseMoneyV2_(
            responses["金額"][0]
          )
        : NaN;

    var type =
      responses["類型"]
        ? String(
            responses["類型"][0]
          ).trim()
        : "";

    var category = "";
    var isOneTime = "否";

    var note =
      responses["備註"]
        ? responses["備註"][0]
        : "";

    if (
      type === "收入" &&
      responses["收入分類"]
    ) {
      category =
        responses["收入分類"][0];

    } else if (
      type === "支出" &&
      responses["支出分類"]
    ) {
      category =
        responses["支出分類"][0];

      var oneTimeTitle =
        "是否為一次性大額支出（不列入可花費額度比較）";

      if (responses[oneTimeTitle]) {
        isOneTime =
          responses[oneTimeTitle][0];
      }
    }

    if (
      !isFinite(amount) ||
      amount <= 0 ||
      (
        type !== "收入" &&
        type !== "支出"
      )
    ) {
      throw new Error(
        "金額或收支類型無效，" +
        "沒有寫入任何資料。"
      );
    }

    var lifeAccount =
      readFiniteNumberV2_(
        sheet.getRange(R_(45), 2),
        "B45生活帳戶餘額"
      );

    var cash =
      readFiniteNumberV2_(
        sheet.getRange(R_(10), 4),
        "D10現金"
      );

    var principal =
      readFiniteNumberV2_(
        sheet.getRange(R_(16), 2),
        "B16淨投入本金"
      );

    if (
      lifeAccount < 0 ||
      cash < 0 ||
      principal < 0
    ) {
      throw new Error(
        "D10、B16或B45出現負數，" +
        "本筆收支已停止。"
      );
    }

    var cashBefore = cash;
    var lifeBefore = lifeAccount;
    var principalBefore = principal;

    var monthSpentBefore =
      getMonthSpentSoFar(ss);

    // 補記以前的日期：App 會帶「日期」（毫秒時間）。不是這個月的支出，不算進這個月已花的錢
    var entryNow = new Date();
    var entryDate = entryNow;
    if (responses["日期"] && responses["日期"][0]) {
      var entryMs = Number(responses["日期"][0]);
      if (entryMs > 0 && entryMs <= entryNow.getTime()) entryDate = new Date(entryMs);
    }
    var entryThisMonth =
      entryDate.getFullYear() === entryNow.getFullYear() &&
      entryDate.getMonth() === entryNow.getMonth();

    var countsAsNormal =
      type === "支出" &&
      isOneTime !== "是" &&
      entryThisMonth;

    var monthSpentAfter =
      monthSpentBefore +
      (
        countsAsNormal
          ? amount
          : 0
      );

    var allowanceAfter =
      getLifeAllowanceV2_(
        sheet,
        monthSpentAfter,
        new Date()
      );

    var noticeMsg = "";

    if (type === "收入") {
      // 收入先全部進生活帳戶
      lifeAccount += amount;

      // 超過本週額度的部分轉到D10
      if (
        lifeAccount >
        allowanceAfter.target
      ) {
        var excess =
          lifeAccount -
          allowanceAfter.target;

        lifeAccount -= excess;
        cash += excess;
      }

      /*
       * 薪水、獎金、整理出來的新現金：
       * 屬於外部新增資金，增加B16。
       *
       * 股息、股利、配息、利息及投資收益：
       * 是資產產生的報酬，不重複算成投入本金。
       */
      var normalizedCategory =
        String(category || "")
          .replace(/\s/g, "");

      var investmentReturnCategories = {
        "股息": true,
        "股利": true,
        "配息": true,
        "利息": true,
        "投資收益": true,
        "投資獲利": true
      };

      if (
        !investmentReturnCategories[
          normalizedCategory
        ]
      ) {
        principal += amount;
      }

    } else if (type === "支出") {
      /*
       * 生活帳戶不足時，
       * 只從D10補這筆支出的實際差額。
       */
      if (lifeAccount < amount) {
        var shortfall =
          amount - lifeAccount;

        if (cash < shortfall) {
          throw new Error(
            "D10現金不足：" +
            "本次還差" +
            shortfall.toFixed(2) +
            "元，但D10只有" +
            cash.toFixed(2) +
            "元。" +
            "本筆支出沒有執行。"
          );
        }

        cash -= shortfall;
        lifeAccount += shortfall;

        if (
          allowanceAfter.mode ===
          "備用金額度"
        ) {
          noticeMsg =
            "⚠️ 本月正常額度已用完；" +
            "本次由D10補足差額" +
            shortfall.toFixed(2) +
            "元後支付，" +
            "已進入備用金模式。";

        } else {
          noticeMsg =
            "ℹ️ 生活帳戶不足；" +
            "本次由D10補足差額" +
            shortfall.toFixed(2) +
            "元後支付。";
        }
      }

      lifeAccount -= amount;

      if (
        Math.abs(lifeAccount) <
        0.000001
      ) {
        lifeAccount = 0;
      }

      // 支出是資金離開系統
      principal =
        Math.max(
          0,
          principal - amount
        );
    }

    /*
     * D10、B45、B16及收支紀錄視為同一筆。
     * 任何一步失敗，都把三個帳戶還原。
     */
    try {
      sheet
        .getRange(R_(10), 4)
        .setValue(cash);

      sheet
        .getRange(R_(45), 2)
        .setValue(lifeAccount);

      sheet
        .getRange(R_(16), 2)
        .setValue(principal);

      ledgerSheet.appendRow([
        entryDate,
        type,
        category,
        amount,
        note,
        isOneTime
      ]);

    } catch (writeError) {
      sheet
        .getRange(R_(10), 4)
        .setValue(cashBefore);

      sheet
        .getRange(R_(45), 2)
        .setValue(lifeBefore);

      sheet
        .getRange(R_(16), 2)
        .setValue(principalBefore);

      throw writeError;
    }

    if (type === "收入") {
      /*
       * 更新表單分類失敗，
       * 不能反過來讓已完成的記帳失敗。
       */
      try {
        learnNewCategory(
          category,
          "收入分類",
          "INCOME_CATEGORIES"
        );

      } catch (categoryError) {
        Logger.log(
          "收入已完成，" +
          "但更新表單分類失敗：" +
          categoryError
        );
      }

      /*
       * 收入增加總資產後，
       * 按最新額度校準B45與D10。
       */
      var settled =
        settleIncomeToLatestAllowanceV2_(
          ss,
          sheet,
          cash,
          lifeAccount
        );

      cash = settled.cash;
      lifeAccount =
        settled.lifeAccount;

      var netToCash =
        cash - cashBefore;

      noticeMsg =
        "收入已先進生活帳戶；" +
        "依收入後最新週額度校準，" +
        "淨轉入D10 " +
        netToCash.toFixed(2) +
        "元。";

      if (
        settled.allowance &&
        settled.allowance.isFallback
      ) {
        noticeMsg +=
          "目前股價資料暫時異常，" +
          "這次沿用上次有效週額度。";
      }

    } else {
      try {
        learnNewCategory(
          category,
          "支出分類",
          "EXPENSE_CATEGORIES"
        );

      } catch (categoryError2) {
        Logger.log(
          "支出已完成，" +
          "但更新表單分類失敗：" +
          categoryError2
        );
      }
    }

    refreshLifeAccountDisplayV2_(ss);

    if (noticeMsg) {
      sendLifeAccountNoticeV2_(
        sheet,
        noticeMsg
      );
    }

  } finally {
    lock.releaseLock();
  }
}
function installSafeTriggersV3() {
  var ss =
    SS_();

  var triggers =
    ScriptApp.getProjectTriggers();

  var managedHandlers = {
    onExpenseFormSubmit: true,
    onExpenseFormSubmitV2: true,
    processNewExpenseResponses: true,

    onTradeFormSubmit: true,
    onTradeFormSubmitV2: true,
    processNewTradeResponses: true,

    weeklyLifeAccountDeposit: true,
    refreshWeeklyLifeAccountV2: true,
    monthEndSettlement: true
  };

  var removed = 0;

  for (
    var i = 0;
    i < triggers.length;
    i++
  ) {
    var handler =
      triggers[i].getHandlerFunction();

    if (managedHandlers[handler]) {
      ScriptApp.deleteTrigger(
        triggers[i]
      );

      removed++;
    }
  }

  ScriptApp
    .newTrigger(
      "onExpenseFormSubmitV2"
    )
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  ScriptApp
    .newTrigger(
      "onTradeFormSubmitV2"
    )
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  ScriptApp
    .newTrigger(
      "refreshWeeklyLifeAccountV2"
    )
    .timeBased()
    .onWeekDay(
      ScriptApp.WeekDay.MONDAY
    )
    .atHour(8)
    .create();

  SpreadsheetApp
    .getUi()
    .alert(
      "正式安全觸發器已安裝",
      "已移除 " +
        removed +
        " 個舊或重複觸發器。\n\n" +
        "目前已建立：\n" +
        "1. 記帳表單V2\n" +
        "2. 股票交易表單V2\n" +
        "3. 每週一生活帳戶校準",
      SpreadsheetApp
        .getUi()
        .ButtonSet.OK
    );
}
// ============================================
// 分批進場計畫（平均買 + 大跌分層加碼 + 低配分配）
// 設計原則：
// 1. 完全不動你原本的 checkRebalanceFeasibility() / confirmPurchase() / confirmSell()
// 2. 「這週該投入多少錢」（排程+跌幅加碼倍數）跟「怎麼把這筆錢分配到各標的」拆成兩層：
//    - executeStagedEntryWeek()：只管排程、跌幅判斷、算出這週金額 → 時間/資金調度層
//    - distributeAmountToPanelV1_()：只管把一筆錢分配到低配標的 → 分配層，
//      跟checkRebalanceFeasibility()同一套「K欄權重+手續費精算」邏輯，不再各寫一份
// 3. 只分配給「目前佔比 < 目標比例」的標的，維持你原本「不賣低」的精神；
//    現金不夠時，順便試算超標部位可回收多少現金寫進通知，但不自動賣出
// 4. 實際下單（買或賣）仍由你手動按「確認已購買/已賣出」觸發，保留人工確認這一步
// ============================================

// 建立/更新分批進場計畫
// totalAmount：這筆要分批投入的總金額
// weeks：預計分幾週投入完（平均買的基礎期數，例如10萬分10週，每週基礎1萬）
function setupStagedEntryPlan(totalAmount, weeks) {
  if (!totalAmount || totalAmount <= 0 || !weeks || weeks <= 0) {
    SpreadsheetApp.getUi().alert("金額或週數無效，未建立計畫。");
    return;
  }

  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var baselinePrice = getBenchmarkPriceV1_(sheet);

  if (!baselinePrice || baselinePrice <= 0) {
    SpreadsheetApp.getUi().alert("無法取得基準股價，請確認工作表1第2列的股價欄位正常。");
    return;
  }

  var plan = {
    totalAmount: totalAmount,
    weeks: weeks,
    baseAmountPerWeek: totalAmount / weeks,
    remainingAmount: totalAmount,
    baselinePrice: baselinePrice,
    startedAt: new Date().toISOString(),
    executedWeeks: 0
  };

  PROPS_()
    .setProperty('STAGED_ENTRY_PLAN', JSON.stringify(plan));

  // 先移除舊的週觸發器（避免重複建立）
  removeStagedEntryTrigger_();

  ScriptApp.newTrigger('executeStagedEntryWeek')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  SpreadsheetApp.getUi().alert(
    "分批進場計畫已建立",
    "總金額：" + totalAmount.toFixed(0) + " 元\n" +
    "分 " + weeks + " 週，每週基礎投入約 " + plan.baseAmountPerWeek.toFixed(0) + " 元\n" +
    "基準價（用來判斷大跌加碼）：" + baselinePrice.toFixed(2) + "\n\n" +
    "每週一上午9點會自動執行，把當週建議買進股數寫入操作面板，\n" +
    "仍需你手動按「確認已購買」才會真正下單。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// 用來判斷跌幅的基準價：預設抓工作表1第2列（第一檔標的）的即時股價
// 如果你想改用大盤指數或其他標的當基準，改這個函式即可
function getBenchmarkPriceV1_(sheet) {
  return Number(sheet.getRange(2, 3).getValue()) || 0;
}

// 每週一自動執行：平常投入「基礎週額」，遇到大跌時依跌幅分層加碼
function executeStagedEntryWeek() {
  var raw = PROPS_().getProperty('STAGED_ENTRY_PLAN');
  if (!raw) {
    Logger.log("沒有進行中的分批進場計畫，本週略過。");
    return;
  }

  var plan = JSON.parse(raw);
  if (plan.remainingAmount <= 0) {
    Logger.log("分批進場計畫已投入完畢，移除週觸發器。");
    removeStagedEntryTrigger_();
    return;
  }

  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var currentPrice = getBenchmarkPriceV1_(sheet);

  if (!currentPrice || currentPrice <= 0) {
    Logger.log("股價異常，本週略過（不投入、不消耗計畫金額），下週再嘗試。");
    return;
  }

  var dropPct = plan.baselinePrice > 0
    ? (plan.baselinePrice - currentPrice) / plan.baselinePrice
    : 0;

  // 跌幅分層門檻與加碼倍數，可自行調整
  var multiplier = 1;
  var tierNote = "正常週期，投入基礎額度";

  if (dropPct >= 0.30) {
    multiplier = 3;
    tierNote = "跌幅超過30%，本週加碼3倍";
  } else if (dropPct >= 0.20) {
    multiplier = 2;
    tierNote = "跌幅超過20%，本週加碼2倍";
  } else if (dropPct >= 0.10) {
    multiplier = 1.5;
    tierNote = "跌幅超過10%，本週加碼1.5倍";
  }

  var thisWeekAmount = Math.min(
    plan.baseAmountPerWeek * multiplier,
    plan.remainingAmount
  );

  // 先檢查現金夠不夠這週要投入的金額，不夠的話一併算出超標部位可回收多少（僅供參考）
  var funding = checkFundingGapForThisWeek_(ss, thisWeekAmount);

  distributeAmountToPanelV1_(ss, thisWeekAmount);

  plan.remainingAmount -= thisWeekAmount;
  plan.executedWeeks += 1;

  PROPS_()
    .setProperty('STAGED_ENTRY_PLAN', JSON.stringify(plan));

  var msg =
    "【分批進場】第 " + plan.executedWeeks + " 週\n" +
    "基準價：" + plan.baselinePrice.toFixed(2) +
    "，目前價：" + currentPrice.toFixed(2) +
    "（跌幅 " + (dropPct * 100).toFixed(1) + "%）\n" +
    tierNote + "\n" +
    "本週投入金額：" + thisWeekAmount.toFixed(0) + " 元\n" +
    "剩餘待投入：" + plan.remainingAmount.toFixed(0) + " 元\n\n" +
    "已依K欄權重（含手續費精算），把建議買進股數寫入操作面板D欄，\n" +
    "請至試算表確認後手動執行「確認已購買」。\n" +
    (funding.enough ? "" : "\n⚠️ " + funding.sellSuggestion);

  Logger.log(msg);

  // 沿用你原本已經有的通知機制（寫入B48 + 寄信），不需要另外重寫寄信邏輯
  try {
    sheet.getRange(R_(48), 2).setValue(msg);
    SEND_MAIL_(NOTIFY_EMAIL_(), "分批進場通知", msg);
  } catch (mailError) {
    Logger.log("分批進場已執行，但通知寄送失敗：" + mailError);
  }
}

// ============================================
// 共用分配核心：跟 checkRebalanceFeasibility() 用同一套邏輯
// - 用K欄「試算建議買進」的比重當權重（不是簡化版的E/F佔比差），跟你原本試算功能邏輯一致
// - 含手續費精算（跟confirmPurchase()同一套費率），避免算出來的股數因為手續費超預算
// - 只分配給「目前佔比 < 目標比例」的標的，超標部位完全不會被動用，維持「不賣低」精神
// 這個函式同時給「分批進場」跟未來如果要重構checkRebalanceFeasibility()時共用，
// 避免兩套邏輯各寫一份、結果對不起來
// ============================================
function distributeAmountToPanelV1_(ss, amount) {
  var sheet = ss.getSheetByName("工作表1");
  var panel = ss.getSheetByName("操作面板");

  var feeRate = Number(sheet.getRange(R_(21), 3).getValue()) || 0.001425;
  var minFee = Number(sheet.getRange(R_(23), 3).getValue()) || 20;

  var rows = [];
  var weightSum = 0;

  for (var row = 2; row <= LAY().last; row++) {
    var currentPct = Number(sheet.getRange(row, 5).getValue()) || 0; // E欄 目前佔比
    var targetPct = Number(sheet.getRange(row, 6).getValue()) || 0;  // F欄 目標比例
    var price = Number(sheet.getRange(row, 3).getValue()) || 0;

    // 只有低配（目前佔比 < 目標比例）的標的才參與這次分配：
    // 超標的標的完全不會被動用到，也不會被賣出
    if (targetPct > currentPct && price > 0) {
      var gap = targetPct - currentPct;
      rows.push({ row: row, gap: gap, price: price });
      weightSum += gap;
    }
  }

  if (weightSum <= 0 || rows.length === 0) {
    Logger.log("目前沒有低配部位，本次金額暫不分配（金額仍計入已投入，不會累積到下週）。");
    return;
  }

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var weight = r.gap / weightSum;
    var budget = amount * weight;

    // 跟confirmPurchase()同樣的手續費精算方式，避免股數買太多超出這次的預算
    var shares = Math.floor(budget / r.price);
    while (shares > 0) {
      var gross = shares * r.price;
      var fee = Math.max(minFee, Math.round(gross * feeRate));
      if (gross + fee <= budget) break;
      shares--;
    }

    var existing = Number(panel.getRange(r.row, 4).getValue()) || 0;
    panel.getRange(r.row, 4).setValue(existing + shares);
  }
}

// ============================================
// 輔助判斷：這次分批投入需要的錢，現金夠不夠？
// 不夠的話，順便算出「如果賣掉超標部位」能補多少，寫進通知讓你參考，
// 但不會自動填G欄、不會自動執行confirmSell() —— 賣不賣、賣多少，還是你自己判斷
// ============================================
function checkFundingGapForThisWeek_(ss, thisWeekAmount) {
  var sheet = ss.getSheetByName("工作表1");
  var panel = ss.getSheetByName("操作面板");
  var currentCash = Number(sheet.getRange(R_(10), 4).getValue()) || 0;

  if (thisWeekAmount <= currentCash) {
    return { enough: true, shortfall: 0, sellSuggestion: "" };
  }

  var shortfall = thisWeekAmount - currentCash;

  // 沿用checkRebalanceFeasibility()同一套「O欄建議賣出股數」試算邏輯，抓超標部位可回收的淨額
  var feeRate = Number(sheet.getRange(R_(21), 3).getValue()) || 0.001425;
  var taxRate = Number(sheet.getRange(R_(22), 3).getValue()) || 0.003;
  var minFee = Number(sheet.getRange(R_(23), 3).getValue()) || 20;

  var sellSuggestion = "";
  var totalRecoverable = 0;

  for (var row = 2; row <= LAY().last; row++) {
    var code = sheet.getRange(row, 1).getValue();
    var suggestedSell = Number(sheet.getRange(row, 15).getValue()) || 0; // O欄
    var sellManualPrice = Number(panel.getRange(row, 8).getValue()) || 0; // H欄
    var quotePrice = Number(sheet.getRange(row, 3).getValue()) || 0;
    var sellPrice = sellManualPrice > 0 ? sellManualPrice : quotePrice;

    if (suggestedSell > 0 && sellPrice > 0) {
      var gross = suggestedSell * sellPrice;
      var fee = Math.max(minFee, Math.round(gross * feeRate));
      var tax = Math.round(gross * taxRate);
      var net = gross - fee - tax;
      totalRecoverable += net;
      sellSuggestion += code + "：O欄建議賣" + suggestedSell + "股，約可回收" + net.toFixed(0) + "元\n";
    }
  }

  var note = "現金不足，本週還差 " + shortfall.toFixed(0) + " 元。\n";
  if (totalRecoverable > 0) {
    note += "工作表1的O欄目前有超標部位建議賣出，合計可回收約 " + totalRecoverable.toFixed(0) + " 元：\n" + sellSuggestion +
      "（這只是參考試算，不會自動賣出，你可以自行決定要不要去操作面板G欄填股數、執行「確認已賣出」）";
  } else {
    note += "目前沒有超標部位可以賣出補足，這週可能只能先投入現金能負擔的部分。";
  }

  return { enough: false, shortfall: shortfall, sellSuggestion: note };
}

// 手動中止分批進場計畫：移除觸發器 + 清除計畫資料
function cancelStagedEntryPlan() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    "確認中止",
    "這會移除每週自動執行的分批進場計畫，尚未投入的金額不會自動繼續執行。確定嗎？",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  removeStagedEntryTrigger_();
  ui.alert("分批進場計畫已中止。");
}

function removeStagedEntryTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'executeStagedEntryWeek') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  PROPS_().deleteProperty('STAGED_ENTRY_PLAN');
}
     function testSetup() {
       setupStagedEntryPlan(100000, 10);
     }
function resetAllExceptAlternativeAssets() {
  var ui = SpreadsheetApp.getUi();

  var answer = ui.alert(
    '確認重置',
    '系統將先建立完整備份，再清除：\n\n' +
    '・持有股數與股票成本\n' +
    '・現金與生活帳戶\n' +
    '・收支與交易紀錄\n' +
    '・測試提示與歷史紀錄\n\n' +
    '「另類資產」、商品代號、配置比例、公式及表單不會刪除。\n\n' +
    '確定繼續嗎？',
    ui.ButtonSet.YES_NO
  );

  if (answer !== ui.Button.YES) {
    return;
  }

  var lock = LOCK_();

  try {
    lock.waitLock(15000);

    var ss = SS_();
    var mainSheet = ss.getSheetByName('工作表1');

    if (!mainSheet) {
      throw new Error('找不到「工作表1」，已停止重置。');
    }

    // 先建立完整備份；備份失敗就不進行重置
    var timeZone = ss.getSpreadsheetTimeZone() || 'Asia/Taipei';
    var timestamp = Utilities.formatDate(
      new Date(),
      timeZone,
      'yyyy-MM-dd_HHmmss'
    );

    try {
      DriveApp
        .getFileById(ss.getId())
        .makeCopy(ss.getName() + '_重置前備份_' + timestamp);
    } catch (backupError) {
      throw new Error(
        '建立重置前備份失敗，因此沒有刪除任何資料。\n' +
        backupError.message
      );
    }

    if (typeof healthDrop_ === "function") healthDrop_("all");
    // 清除股票持有與交易輸入
    mainSheet.getRange('B2:B' + LAY().last).setValue(0);
    mainSheet.getRange('L2:L' + LAY().last).setValue(0);
    mainSheet.getRange('N2:N' + LAY().last).clearContent();
    mainSheet.getRange('Q2:R' + LAY().last).clearContent();

    // 現金與生活帳戶歸零
    mainSheet.getRange(A1_('D10')).setValue(0);
    mainSheet.getRange(A1_('B38')).setValue(0);
    mainSheet.getRange(A1_('B45')).setValue(0);
    mainSheet.getRange(A1_('B46')).setValue(0);
    mainSheet.getRange(A1_('B48')).clearContent();

    // 恢復報酬率與生活額度公式
    mainSheet.getRange(A1_('B15')).setFormula(
      A1_('=IF(OR(B16="",B16=0),0,(B14-B16)/B16)')
    );

    mainSheet.getRange(A1_('B29')).setFormula(
      A1_('=B14*1.5%/12')
    );

    mainSheet.getRange(A1_('B30')).setFormula(
      A1_('=B29*(MONTH(TODAY())-1)')
    );

    mainSheet.getRange(A1_('B31')).setFormula(
      A1_('=SUMIFS(' +
      "'收支紀錄'!D:D," +
      "'收支紀錄'!B:B,\"支出\"," +
      "'收支紀錄'!A:A,\">=\"&DATE(YEAR(TODAY()),1,1)," +
      "'收支紀錄'!A:A,\"<\"&DATE(YEAR(TODAY())+1,1,1)," +
      "'收支紀錄'!F:F,\"<>是\"" +
      ')')
    );

    mainSheet.getRange(A1_('B32')).setFormula(
      A1_('=MAX(0,B30+B29*(13-MONTH(TODAY()))-B31)')
    );

    mainSheet.getRange(A1_('B33')).setFormula(
      A1_('=IFERROR(B32/(13-MONTH(TODAY())),0)')
    );

    mainSheet.getRange(A1_('B34')).setFormula(
      A1_('=IFERROR(B32/((DATE(YEAR(TODAY()),12,31)-TODAY())/7),0)')
    );

    mainSheet.getRange(A1_('B35')).setFormula(
      A1_('=MAX(0,D10-B14*5.5%)')
    );

    mainSheet.getRange(A1_('B36')).setFormula(
      A1_('=B32+B35')
    );

    // 清除紀錄表，但保留第一列表頭
    var sheetsToReset = [
      '交易紀錄',
      '收支紀錄',
      '歷史配置',
      '支出評估紀錄'
    ];

    for (var i = 0; i < sheetsToReset.length; i++) {
      var recordSheet = ss.getSheetByName(sheetsToReset[i]);

      if (recordSheet && recordSheet.getLastRow() > 1) {
        recordSheet
          .getRange(
            2,
            1,
            recordSheet.getLastRow() - 1,
            recordSheet.getLastColumn()
          )
          .clearContent();
      }
    }

    // 清除兩張Google表單留下的測試回覆，但保留表頭
    var allSheets = ss.getSheets();

    for (var j = 0; j < allSheets.length; j++) {
      var sheetName = allSheets[j].getName();

      if (
        sheetName.indexOf('表單回覆') === 0 &&
        allSheets[j].getLastRow() > 1
      ) {
        allSheets[j]
          .getRange(
            2,
            1,
            allSheets[j].getLastRow() - 1,
            allSheets[j].getLastColumn()
          )
          .clearContent();
      }
    }

    SpreadsheetApp.flush();

    // 另類資產保留，因此以重置後的B14作為新本金基準
    var newTotalAssets = Number(
      mainSheet.getRange(A1_('B14')).getValue()
    );

    if (!isFinite(newTotalAssets) || newTotalAssets < 0) {
      throw new Error(
        'B14目前總資產不是有效數字，請檢查另類資產。'
      );
    }

    mainSheet.getRange(A1_('B16')).setValue(newTotalAssets);

    // 重新計算本月支出與本週理論額度
    SpreadsheetApp.flush();

    if (typeof refreshLifeAccountDisplayV2_ === 'function') {
      refreshLifeAccountDisplayV2_(ss);
    }

    mainSheet.getRange(A1_('B48')).clearContent();

    SpreadsheetApp.flush();

    ui.alert(
      '重置完成',
      '已完成安全重置。\n\n' +
      '另類資產已保留。\n' +
      '現金、股票、生活帳戶與紀錄已歸零。\n' +
      'B16已自動設定為重置後的B14：' +
      newTotalAssets.toFixed(2) +
      ' 元。\n\n' +
      '完整備份已存放在Google雲端硬碟。',
      ui.ButtonSet.OK
    );

  } catch (error) {
    ui.alert(
      '重置失敗',
      error.message,
      ui.ButtonSet.OK
    );
  } finally {
    lock.releaseLock();
  }
}
// ============================================
// 手續費月結退費（永豐「先收後退」制度專用）
// 設計原則：
// 1. 完全不改動 confirmPurchase() / confirmSell() —— 只要C21直接填「全額費率0.001425」，
//    這兩個函式扣款時本來就會用全額扣，跟銀行實際扣款金額一致，不需要動它們
// 2. 這裡另外做一套「月結」機制：讀交易紀錄，算出「已收全額手續費」跟「照優惠折數
//    應該收的手續費」之間的差額，每月固定日期把差額加回現金，並追蹤未回補金額
// 3. 折數規則（依你跟營業員確認的版本，之後她若更新請回來改這裡）：
//    - 當月成交金額(買+賣加總) 100萬元以內部分：2折
//    - 超過100萬元部分：2.8折
//    - 活動(2026年)結束後：統一2.8折 —— 這點營業員還沒明確回覆，先用這個假設，
//      等她確認後把 ACTIVITY_END_DATE 之後的邏輯改掉
// ============================================

var ACTIVITY_END_DATE_ = new Date("2026-12-31T23:59:59+08:00");
var TIER_THRESHOLD_ = 1000000; // 每月100萬門檻
var STANDARD_FEE_RATE_ = 0.001425; // 牌告全額費率，跟C21填的全額費率保持一致

function feeDiscountRate_(monthlyVolumeBeforeThisAmount, amountInTier) {
  // 回傳這筆交易「應該適用」的折扣後費率權重，依當月已累積成交金額判斷落在哪一段
  // 這裡簡化處理：直接對整月加總後的金額分段計算，不逐筆判斷（避免月中交易順序影響結果）
  return null; // 實際計算在 monthlyFeeRebate_() 裡對整月加總後一次算，這裡先保留擴充空間
}

// 手動執行一次：建立「每月15日自動月結退費」的排程
function setupMonthlyFeeRebate() {
  removeMonthlyFeeRebateTrigger_();

  ScriptApp.newTrigger('monthlyFeeRebate')
    .timeBased()
    .onMonthDay(15)
    .atHour(10)
    .create();

  SpreadsheetApp.getUi().alert(
    "已設定完成",
    "之後每月15日上午10點會自動執行月結退費，\n" +
    "把上個月已收的全額手續費跟優惠折扣後應收手續費的差額，加回D10現金，\n" +
    "並更新「未回補手續費」欄位。\n\n" +
    "如果想現在手動測試一次，可以直接執行 monthlyFeeRebate()。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function removeMonthlyFeeRebateTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'monthlyFeeRebate') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// 某個月的月退是不是已經結算過（避免同一個月退兩次；也用來判斷 15 號那次有沒有漏跑）
// 兩種記號擇一成立就算結過：指令碼屬性 FEE_MONTH_SETTLED（yyyy-MM，結到哪個月）、收支紀錄裡那個月的「手續費回補」
function feeMonthKey_(y, m) { return y + "-" + ("0" + (m + 1)).slice(-2); }
function feeMonthSettled_(ss, y, m) {
  var done = String(PROPS_().getProperty("FEE_MONTH_SETTLED") || "");
  if (done && done >= feeMonthKey_(y, m)) return true;
  var led = ss.getSheetByName("收支紀錄");
  if (!led || led.getLastRow() < 2) return false;
  var tag = y + "年" + (m + 1) + "月台股手續費月結退費";
  return led.getRange(2, 3, led.getLastRow() - 1, 3).getValues().some(function (r) {
    return String(r[0]).trim() === "手續費回補" && String(r[2]).indexOf(tag) === 0;
  });
}
// 15 號那次排程如果沒跑到（或排程不見了），每天下午記收盤價時補結一次
function feeMonthlyCatchUp_() {
  if (feeRule_().mode !== "月退") return;
  var now = new Date();
  if (Number(Utilities.formatDate(now, "Asia/Taipei", "d")) < 15) return;
  monthlyFeeRebate();
}

// 核心：計算上個月的手續費差額，加回現金，更新「未回補手續費」欄位
function monthlyFeeRebate() {
  if (feeRule_().mode !== "月退") { Logger.log("系統設定：手續費折讓方式不是月退，略過"); return; }
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var logSheet = ss.getSheetByName("交易紀錄");

  if (!logSheet) {
    Logger.log("找不到交易紀錄分頁，月結退費略過。");
    return;
  }

  var now = new Date();
  // 結算「上個月」：如果是1月執行，結算去年12月
  var targetMonth = now.getMonth() - 1;
  var targetYear = now.getFullYear();
  if (targetMonth < 0) {
    targetMonth = 11;
    targetYear -= 1;
  }

  if (feeMonthSettled_(ss, targetYear, targetMonth)) {
    Logger.log(targetYear + "年" + (targetMonth + 1) + "月已經結算過，不重複退。");
    return;
  }

  var data = logSheet.getDataRange().getValues();
  var monthlyVolume = 0; // 當月成交金額(買+賣加總的毛額)
  var monthlyFeePaid = 0; // 當月已收的全額手續費
  var perTrade = 0; // 券商的算法：每一筆各自算折讓，元以下無條件捨去，再加總（不是整個月加總後才算）
  var rule = typeof feeRule_ === "function" ? feeRule_() : null;

  for (var i = 1; i < data.length; i++) {
    var date = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    if (isNaN(date.getTime())) continue;
    if (date.getFullYear() !== targetYear || date.getMonth() !== targetMonth) continue;

    var grossAmount = Math.abs(Number(data[i][4]) || 0); // E欄 金額(毛額)
    var feePaid = Number(data[i][5]) || 0; // F欄 手續費

    if (rule) perTrade += Math.max(0, Math.floor(feePaid - Math.max(1, feeShouldPay_(monthlyVolume, grossAmount, date, rule)) + 1e-9));
    monthlyVolume += grossAmount;
    monthlyFeePaid += feePaid;
  }

  if (monthlyVolume <= 0) {
    Logger.log("上個月沒有交易紀錄，月結退費略過。");
    PROPS_().setProperty("FEE_MONTH_SETTLED", feeMonthKey_(targetYear, targetMonth));
    return;
  }

  // 依「設定 → 手續費」的折數（門檻、活動）算出「應該收的手續費」
  var shouldHavePaid = Math.round(feeShouldPay_(0, monthlyVolume, new Date(targetYear, targetMonth, 1)));

  var rebateAmount = rule ? perTrade : monthlyFeePaid - shouldHavePaid; // 跟券商一樣逐筆捨去（2026/10：整月一起算比永豐實際退的多 3 元）
  if (rebateAmount < 0) rebateAmount = 0; // 保護：理論上不該是負的，若計算異常就不退款，避免多退

  // 加回現金（先記「這個月結過了」，就算後面寄信或寫紀錄出錯，也不會再退第二次）
  PROPS_().setProperty("FEE_MONTH_SETTLED", feeMonthKey_(targetYear, targetMonth));
  var currentCash = Number(sheet.getRange(R_(10), 4).getValue()) || 0;
  sheet.getRange(R_(10), 4).setValue(currentCash + rebateAmount);

  // 順便在收支紀錄記一筆，方便你在記帳紀錄裡直接看到這筆手續費回補
  // 分類獨立標「手續費回補」，一次性排除填「是」——避免被誤算進每月正常可花費額度的計算
  var ledgerSheet = ss.getSheetByName("收支紀錄");
  if (ledgerSheet && rebateAmount > 0) {
    var monthLabelForNote = targetYear + "年" + (targetMonth + 1) + "月";
    ledgerSheet.appendRow([
      new Date(),
      "收入",
      "手續費回補",
      rebateAmount,
      monthLabelForNote + "台股手續費月結退費（永豐先收後退）",
      "是"
    ]);
  }

  // 更新「未回補手續費」顯示欄位（結算完為0，代表這個月的都已經退完）
  sheet.getRange(R_(12), 2).setValue(0);
  sheet.getRange(R_(13), 2).setValue(rebateAmount); // B13：這次(上月)實際退回的金額，方便你對帳
  // 同步記到 App 的帳戶流水，讓永豐大戶的帳戶餘額也加上這筆退款
  if (rebateAmount > 0) {
    try {
      waLogFlow_(ss, "收入", "收入:手續費回補", waStockAccount_(ss) || WA_STOCK_ACCOUNT_, rebateAmount,
        targetYear + "年" + (targetMonth + 1) + "月手續費月結退費");
    } catch (flowErr) { Logger.log("帳戶流水寫入失敗：" + flowErr); }
  }
  var monthLabel = targetYear + "年" + (targetMonth + 1) + "月";
  var msg = monthLabel + "手續費月結退費完成：\n" +
    "當月成交金額：" + monthlyVolume.toFixed(0) + " 元\n" +
    "已收全額手續費：" + monthlyFeePaid.toFixed(0) + " 元\n" +
    "折扣後應收手續費：" + shouldHavePaid.toFixed(0) + " 元\n" +
    "本次退回現金：" + rebateAmount.toFixed(0) + " 元";

  Logger.log(msg);

  try {
    SEND_MAIL_(NOTIFY_EMAIL_(), "手續費月結退費完成", msg);
  } catch (mailError) {
    Logger.log("寄信失敗：" + mailError);
  }
}

// 核心計算：算出「本月目前為止累積的未回補手續費」，只回傳數字，不跳彈窗、不寫入
// 讓「手動按鈕版」跟「自動即時更新版」共用同一套算法，確保兩邊數字一致
function computePendingFeeRebate_() {
  var feeMode = feeRule_().mode;
  if (feeMode === "日退") return pendingDailyRebate_();
  if (feeMode !== "月退") return null;
  var ss = SS_();
  var logSheet = ss.getSheetByName("交易紀錄");
  if (!logSheet) return null;

  var now = new Date();
  var data = logSheet.getDataRange().getValues();
  // 某一個月「已收 − 折扣後應收」
  var monthPending = function (y, m, when) {
    var vol = 0, sum = 0, rule = feeRule_(); // 跟月結一樣：逐筆算折讓、元以下捨去
    for (var i = 1; i < data.length; i++) {
      var date = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
      if (isNaN(date.getTime())) continue;
      if (date.getFullYear() !== y || date.getMonth() !== m) continue;
      var g = Math.abs(Number(data[i][4]) || 0), f = Number(data[i][5]) || 0;
      sum += Math.max(0, Math.floor(f - Math.max(1, feeShouldPay_(vol, g, date, rule)) + 1e-9));
      vol += g;
    }
    return sum;
  };
  var pending = monthPending(now.getFullYear(), now.getMonth(), now);
  // 上個月的要到這個月 15 號才退：還沒退之前也算在「還沒回補」裡，不然一換月就變 0，看起來像沒有要退
  var ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  try { if (!feeMonthSettled_(ss, ly, lm)) pending += monthPending(ly, lm, new Date(ly, lm, 1)); } catch (e) { Logger.log(e); }
  return pending;
}

// 手動按鈕版：算完寫入B12，並跳彈窗告訴你目前預估值
function previewPendingFeeRebate() {
  var pending = computePendingFeeRebate_();
  var ui = SpreadsheetApp.getUi();

  if (pending === null) {
    ui.alert("找不到交易紀錄分頁，或「系統設定」的手續費每月回補是「否」。");
    return;
  }

  var sheet = SS_().getSheetByName("工作表1");
  sheet.getRange(R_(12), 2).setValue(pending);

  ui.alert(
    "本月預估未回補手續費：" + pending.toFixed(0) + " 元\n" +
    "（這是預估值，實際退費要等下月15日執行 monthlyFeeRebate() 才會真正加回現金）"
  );
}

// ============================================
// B12 即時自動更新（不用手動點按鈕）
// 原理：Google試算表的onEdit本身無法讀「交易紀錄」以外分頁的觸發來源判斷，
// 這裡用「可安裝觸發器」監聽整個試算表的編輯事件，只要偵測到變動的是「交易紀錄」分頁，
// 就立刻重新計算並更新B12——效果等同即時，不用等排程時間、也不用手動點按鈕
// ============================================

// 手動執行一次：安裝「交易紀錄有變動就自動更新B12」的即時觸發器
function setupAutoFeePreview() {
  removeAutoFeePreviewTrigger_();

  ScriptApp.newTrigger('onLedgerEditUpdatePreview_')
    .forSpreadsheet(SS_())
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert(
  "之後只要「交易紀錄」分頁有任何新增或修改，B12會立刻自動重新計算更新，不用再手動點按鈕。"
);
}

function removeAutoFeePreviewTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onLedgerEditUpdatePreview_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// 觸發器實際執行的函式：只有編輯的分頁是「交易紀錄」時才重新計算，其他分頁的編輯完全略過
function onLedgerEditUpdatePreview_(e) {
  if (!e || !e.range) return;
    var editedSheetName = e.range.getSheet().getName();

  // 工作表1 的 A2:A9（代號）有變動 -> 自動同步表單選項
  if (editedSheetName === "工作表1" && e.range.getColumn() === 1 &&
      e.range.getRow() <= LAY().last && e.range.getLastRow() >= 2) {
    try { syncTradeFormCodes(); } catch (err) { Logger.log(err); }
    return;
  }

  if (editedSheetName !== "交易紀錄") return;

  var pending = computePendingFeeRebate_();
  if (pending === null) return;

  var sheet = SS_().getSheetByName("工作表1");
  sheet.getRange(R_(12), 2).setValue(pending);
}

// ============================================
// 再平衡資金試算 - 隨時查看 + 定期自動回報
// 設計原則：
// 1. 完全不動你原本的 checkRebalanceFeasibility() / confirmPurchase() / confirmSell()
// 2. 不另外發明分配邏輯 —— 跟 checkRebalanceFeasibility() 用「完全相同」的計算方式
//    （K欄權重分配、手續費精算、資金不足時依比例分配），確保兩邊算出來的數字永遠一致
// 3. 兩種觸發方式，共用同一套核心計算，數字保證一致：
//    - checkRebalanceFeasibilityV2()：你隨時想確認就按，立刻跳彈窗（跟原按鈕效果一樣）
//    - sendRebalanceEmailUpdate()：固定每3天自動執行一次，寄信提醒，
//      不看有沒有跌——不管漲跌都會回報，避免「等跌幅才提醒」導致平常沒訊息、忘記檢視
// 4. 只負責「算給你看」，不會寫入操作面板、不會自動下單，
//    跟原按鈕一樣，只會把結果寫回 S 欄
// ============================================

// 手動執行一次：建立「每3天自動試算一次，寄送再平衡建議」的排程
// 不看有沒有跌——不管漲跌，固定每3天都主動回報一次目前該買賣多少，
// 避免「等跌幅才提醒」導致平常沒收到訊息、忘記檢視配置
function setupPeriodicRebalanceEmail() {
  removePeriodicRebalanceTrigger_();

  ScriptApp.newTrigger('sendRebalanceEmailUpdate')
    .timeBased()
    .everyDays(3)
    .atHour(9)
    .create();

  SpreadsheetApp.getUi().alert(
    "已設定完成",
    "之後不管有沒有跌，每3天上午9點都會自動試算一次，\n" +
    "把「目前該買多少、該賣多少」的結果寄到你的信箱。\n\n" +
    "如果想隨時手動確認，可以到選單點「🔍 再平衡試算（彈窗）」，\n" +
    "會立刻跳出跟現在一樣的視窗給你看，用的是同一套計算邏輯，數字不會不一樣。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// 移除自動排程（想改回純手動按鈕時執行這個）
function removePeriodicRebalanceTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendRebalanceEmailUpdate') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// ============================================
// 把工作表1的M欄「報酬率」同步複製到操作面板L欄
// 寫在L欄是因為A~J欄你已經在用了，L欄目前是空的
// 這個函式會跟著再平衡試算一起執行（見下方computeRebalancePlan_最後一段），
// 不用你額外再按一次
// ============================================
function syncReturnRateToPanel_() {
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var panel = ss.getSheetByName("操作面板");

  panel.getRange(1, 12).setValue("報酬率"); // L1標題

  for (var row = 2; row <= LAY().last; row++) {
    var ret = sheet.getRange(row, 13).getValue(); // M欄 報酬率
    panel.getRange(row, 12).setValue(ret);
    panel.getRange(row, 12).setNumberFormat("0.00%"); // 跟工作表1的百分比格式一致
  }
}

// 核心邏輯：跟 checkRebalanceFeasibility() 完全相同的計算方式，
// 只是最後不跳彈窗，改成回傳文字內容，讓呼叫端決定要跳彈窗還是寄信

function fixTradeFormCodes() {
  var props = PROPS_();
  var formId = props.getProperty('TRADE_FORM_ID');

  if (!formId) {
    SpreadsheetApp.getUi().alert("找不到股票交易表單的ID，請確認TRADE_FORM_ID是否已設定，或表單是否還存在。");
    return;
  }

  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");

  var codes = [];
  for (var row = 2; row <= LAY().last; row++) {
    var code = String(sheet.getRange(row, 1).getValue()).trim();
    if (code) codes.push(code);
  }

  if (codes.length === 0) {
    SpreadsheetApp.getUi().alert("工作表1的A2:A9讀不到任何代號，已停止修正。");
    return;
  }

  var form = FormApp.openById(formId);
  var items = form.getItems(FormApp.ItemType.MULTIPLE_CHOICE);
  var found = false;

  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === "標的代號") {
      items[i].asMultipleChoiceItem().setChoiceValues(codes);
      found = true;
      break;
    }
  }

  if (!found) {
    SpreadsheetApp.getUi().alert("表單裡找不到「標的代號」這個題目，請檢查表單題目名稱是否被改過。");
    return;
  }

  SpreadsheetApp.getUi().alert(
    "已修正完成",
    "股票交易表單的「標的代號」選項，已更新成跟工作表1一致的8檔：\n\n" + codes.join("、"),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
// ============================================================
// v3 更新重點（取代 v2 的同名函式）：
// 進場比例改成「逐檔判斷」，不再是整個組合合出一個比例：
//   - 每一檔各自看自己過去3個交易日的漲跌
//   - 那一檔是漲的 -> 還是買，但只用最低5%比例（不會完全卡死不買）
//   - 那一檔平盤或跌 -> 依跌幅分層，跌越深比例越高（0~5%用10%、5~10%用20%、10~20%用30%、20%以上用50%）
// 這個比例會直接乘在該檔「建議買進股數」上，再送進原本的資金分配演算法，
// 所以不是額外加一層現金上限，是直接決定「這次要不要幫這一檔補到目標」。
//
// 這個檔案會取代：
//   - computeEntrySignals_()（v2版本，整組合併成一個比例 -> 改成逐檔）
//   - buildCombinedReport_()（v2版本 -> 改成顯示逐檔比例）
//   - computeRebalancePlan_()（你原本就有的函式，這次多加一個可選參數 entryRatioByRow）
//   - checkRebalanceFeasibilityV2() / dailyPortfolioCheck() / setupDailyPortfolioCheck()（呼叫方式微調，邏輯不變）
// Feature B（個股表單登記）跟v2完全一樣，不用重貼。
// ============================================================

// ---------- 共用設定 ----------
var ALERT_DROP_PCT_ = 5;     // 單檔3個交易日累計跌幅達到幾%才算「值得留意的下跌」
var ALERT_RISE_PCT_ = 10;    // 比你的平均成本漲幅達到幾%才提醒可以考慮賣一點

// 逐檔進場比例分層：dropPct(正數=跌) 對應的比例
var PER_TICKER_TIERS_ = [
  { minDrop: 20, ratio: 0.5 },
  { minDrop: 10, ratio: 0.3 },
  { minDrop: 5,  ratio: 0.2 },
    { minDrop: 0,  ratio: 0.15 }  // 平盤或跌幅在0~5%之間
];
var RISE_FLOOR_RATIO_ = 0.10; // 那一檔是漲的(dropPct<0)時，還是保留的最低比例，避免一路漲就永遠不買

// ---------- A-1. 一次性設定：T欄「3交易日前收盤價」公式（跟v2相同，已設定過不用再跑一次）----------
function setup3DayLookbackFormulas() {
  var sheet = SS_().getSheetByName("工作表1");
  sheet.getRange(1, 20).setValue("3交易日前收盤價(自動)"); // T1標題

  for (var row = 2; row <= LAY().last; row++) {
    var formula =
      '=IFERROR(INDEX(GOOGLEFINANCE($A' + row + ',"close",WORKDAY(TODAY(),-6),TODAY()),' +
      'ROWS(GOOGLEFINANCE($A' + row + ',"close",WORKDAY(TODAY(),-6),TODAY()))-3,2),"")';
    sheet.getRange(row, 20).setFormula(formula);
  }

  SpreadsheetApp.getUi().alert(
    "T欄已設定完成",
    "工作表1的T欄會自動抓「3個交易日前的收盤價」，之後每日檢查會拿它跟目前股價比較算跌幅。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ---------- A-2. 核心邏輯：逐檔算出進場比例 + 成本漲幅賣出訊號 ----------

function buildCombinedReport_() {
  return buildCombinedReportV4_();
}

// ---------- A-4. 手動按鈕版：取代你原本的 checkRebalanceFeasibilityV2() ----------
function checkRebalanceFeasibilityV2() {
  var msg = buildCombinedReport_();
  SpreadsheetApp.getUi().alert("再平衡試算 + 逐檔進場/賣出建議", msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------- A-5. 每日自動版：取代 sendRebalanceEmailUpdate() 跟舊的分批進場週報 ----------
// 跑完順便把 App 畫面算好存起來（打開 App 就是剛剛算好的結果）
// 一天只跑一次：12:00 準時那一個先跑，原本「12 點多」那個排程就當備用（12:00 那個沒跑才會跑）
function dailyPortfolioCheck() {
  var day = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  var props = PROPS_();
  if (props.getProperty("DPC_DONE_DAY") === day) { Logger.log("今天 12:00 已經試算過了"); return; }
  props.setProperty("DPC_DONE_DAY", day);
  try { admTrigRun_("每日試算", dailyPortfolioCheckRun_); } finally { dashPrebuild_("試算"); }
}
// 12:00 準時試算：Google 的「每天 12 點」排程其實是 12:00～13:00 之間隨便一個時間，
// 所以每天早上由每小時的排程另外訂一個「今天 12:00:00」的單次排程（這種通常 1～2 分鐘內就會跑）
var NOON_FN_ = "portfolioCheckAtNoon";
function portfolioCheckAtNoon() {
  noonClear_();
  dailyPortfolioCheck();
}
function noonClear_() {
  try { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === NOON_FN_) ScriptApp.deleteTrigger(t); }); } catch (e) { Logger.log(e); }
}
function noonSchedule_() {
  if (typeof hubDoGet_ !== "function") return; // 只有中央 App
  var now = new Date(), tz = "Asia/Taipei";
  if (Number(Utilities.formatDate(now, tz, "u")) > 5) return; // 週末不用
  var day = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var props = PROPS_();
  if (props.getProperty("DPC_NOON_DAY") === day || props.getProperty("DPC_DONE_DAY") === day) return;
  var at = new Date(day + "T12:00:00+08:00");
  if (at.getTime() - now.getTime() < 60000) return; // 已經 12 點了，交給備用的排程
  noonClear_(); // 清掉前幾天跑完留下來的
  ScriptApp.newTrigger(NOON_FN_).timeBased().at(at).create();
  props.setProperty("DPC_NOON_DAY", day);
}
function dailyPortfolioCheckRun_() {
  try { var up = JSON.parse(PROPS_().getProperty("USER_PREFS") || "{}"); if (up.etf === false) { Logger.log("沒有用 ETF 買進建議，不試算"); return; } } catch (upE) {}
  var tz = 'Asia/Taipei';
  var dow = Number(Utilities.formatDate(new Date(), tz, 'u')); // 1=週一...7=週日
  if (dow > 5) return; // 週末不寄

  try { if (fixPriceFormulas_()) { SpreadsheetApp.flush(); Utilities.sleep(5000); } } catch (pfE) { Logger.log(pfE); }
  // 兩套組合：過了生日、進到新的一年，目標比例往退休組合移一點（會寄信）
  try { if (typeof plan2Apply_ === "function") plan2Apply_(true); } catch (p2Err) { Logger.log("退休組合轉換失敗：" + p2Err); }

  var msg = buildCombinedReport_();
  var sheet = SS_().getSheetByName("工作表1");
  var timestamp = Utilities.formatDate(new Date(), tz, "MM/dd HH:mm");

  try { sheet.getRange(R_(48), 2).setValue(msg + "（" + timestamp + "）"); } catch (e1) { Logger.log(e1); }

  // 資料健檢：有新的問題才另外寄一封
  try { if (typeof healthDaily_ === "function") healthDaily_(); } catch (hErr) { Logger.log("資料健檢失敗：" + hErr); }
  try { if (typeof trendDaily_ === "function") trendDaily_(); } catch (tErr) { Logger.log("大跌保護檢查失敗：" + tErr); }

  // 寄信：每週第一次（通常是週一）固定寄一封；其他日子只有「出現新的事要做」才寄
  var reasons = null;
  try { reasons = portfolioMailReasons_(sheet, LAST_ENTRY_SIGNALS_); } catch (e3) { Logger.log("寄信判斷失敗，這次照舊寄出：" + e3); }
  if (reasons && !reasons.send) { Logger.log("今天沒有新的事要做，不寄信"); return; }
  var subject = !reasons ? "再平衡試算＋進場/賣出建議" : reasons.weekly ? "本週建議買進" : "有新的建議：" + reasons.list[0];
  var head = reasons && reasons.list.length ? "【今天寄這封信的原因】\n" + reasons.list.map(function (x) { return "・" + x; }).join("\n") + "\n\n" : "";
  try { SEND_MAIL_(NOTIFY_EMAIL_(), subject, head + msg); } catch (e2) { Logger.log(e2); }
}

// 決定今天要不要寄信，並記住這週已經通知過什麼（存在指令碼屬性 MAIL_WEEK_STATE）
// - 這週第一次：寄（每週建議買進），並記下各檔目前的進場比例
// - 之後：某一檔的進場比例比這週通知過的更高（跌到下一級）而且有要買的股數 → 寄
//         某一檔漲超過成本門檻、系統建議賣出，而且這週還沒通知過 → 寄
function portfolioMailReasons_(sheet, signals) {
  var props = PROPS_();
  var week = Utilities.formatDate(entryPeriodStart_(), "Asia/Taipei", "yyyy-MM-dd");
  var st = null;
  try { st = JSON.parse(props.getProperty("MAIL_WEEK_STATE") || "null"); } catch (e) { st = null; }
  var weekly = !st || st.week !== week;
  if (weekly) st = { week: week, ratios: {}, sells: [] };
  var list = [];
  var buys = sheet.getRange(2, 19, LAY().core, 1).getValues();
  ((signals && signals.entries) || []).forEach(function (e) {
    var prev = Number(st.ratios[e.code]) || 0;
    var shares = Number(buys[e.row - 2] && buys[e.row - 2][0]) || 0;
    if (!weekly && e.ratio > prev + 1e-9 && shares > 0) {
      list.push(e.code + " 進場比例升到 " + Math.round(e.ratio * 100) + "%，建議補買 " + shares + " 股");
    }
    if (weekly || e.ratio > prev) st.ratios[e.code] = e.ratio;
  });
  ((signals && signals.riseAlerts) || []).forEach(function (r) {
    if (!(r.suggestedSell > 0)) return;
    if (st.sells.indexOf(r.code) === -1) {
      st.sells.push(r.code);
      if (!weekly) list.push(r.code + " 比成本漲 " + r.pct.toFixed(1) + "%，建議賣出 " + r.suggestedSell + " 股");
    }
  });
  props.setProperty("MAIL_WEEK_STATE", JSON.stringify(st));
  return { send: weekly || list.length > 0, weekly: weekly, list: list };
}

// ---------- A-6. 一次性設定：停用舊的兩組排程，換成新的每日檢查（跟v2相同）----------
function setupDailyPortfolioCheck() {
  removePeriodicRebalanceTrigger_();     // 停用舊的「每3天再平衡email」（既有函式，沿用）
  removeStagedEntryTrigger_();           // 停用舊的「分批進場週報」（既有函式，沿用）
  removeDailyPortfolioCheckTrigger_();   // 避免重複建立這次的新觸發器

  ScriptApp.newTrigger('dailyPortfolioCheck')
    .timeBased()
    .everyDays(1)
    .atHour(12)
    .create();

  SpreadsheetApp.getUi().alert(
    "已設定完成",
    "已停用舊的「每3天再平衡email」跟「分批進場週報」。\n\n" +
    "之後每個交易日中午12點多會自動檢查一次；每週第一次固定寄一封，其他日子有新的事要做才寄。信的內容包含：\n" +
    "1. 每一檔比近3個月高點便宜多少 -> 對應的本週建議進場比例（創新高也會買一點，只是比例最低）\n" +
    "2. 有沒有標的比你的成本漲超過10%（附建議賣出股數）\n" +
    "3. 完整再平衡試算結果，S欄已經按上面的逐檔比例調整過\n\n" +
    "隨時想看的話，選單「🔍 再平衡試算（彈窗）」內容完全一樣。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function removeDailyPortfolioCheckTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dailyPortfolioCheck') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

// ============================================================
// v4：逐檔進場比例（容錯版）
// - 一次讀取整塊資料，速度比較快
// - T欄(3日前收盤價)如果讀不到，會等2秒重讀，最多重試3次
// - 還是讀不到的話，那一檔用最低5%，絕對不會被當成100%全額買進
// - 每一檔核心ETF「一定」會有比例，S欄不會再出現等於K欄的情況
// ============================================================
function computeEntrySignalsV4_() {
  var sheet = SS_().getSheetByName("工作表1");
  var readBlock = function () { return sheet.getRange(2, 1, LAY().core, 20).getValues(); }; // 核心 ETF 那幾列 A:T

  var data = readBlock();
  for (var attempt = 0; attempt < 3; attempt++) {
    var missing = false;
    for (var k = 0; k < LAY().core; k++) {
      if (String(data[k][0]).trim() && !(Number(data[k][19]) > 0)) missing = true;
    }
    if (!missing) break;
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
    data = readBlock();
  }

  var dropAlerts = [], riseAlerts = [], entries = [], ratioByRow = {};

  for (var k = 0; k < LAY().core; k++) {
    var row = k + 2;
    var code = String(data[k][0]).trim();
    if (!code) continue;

    var shares = Number(data[k][1]) || 0;
    var price = Number(data[k][2]) || 0;
    var cost = Number(data[k][11]) || 0;
    var suggestedSell = Number(data[k][14]) || 0;
    var pastClose = Number(data[k][19]) || 0;

    Logger.log("V4 row=" + row + " code=" + code + " price=" + price + " pastClose=" + pastClose);

    var ratio = RISE_FLOOR_RATIO_; // 預設最低比例
    var dropPct = null;

    if (price > 0 && pastClose > 0) {
      dropPct = (pastClose - price) / pastClose * 100;
      if (dropPct >= 0) {
        ratio = PER_TICKER_TIERS_[PER_TICKER_TIERS_.length - 1].ratio;
        for (var i = 0; i < PER_TICKER_TIERS_.length; i++) {
          if (dropPct >= PER_TICKER_TIERS_[i].minDrop) { ratio = PER_TICKER_TIERS_[i].ratio; break; }
        }
      }
      if (dropPct >= ALERT_DROP_PCT_) dropAlerts.push({ code: code, pct: dropPct });
    }

    ratioByRow[row] = ratio; // 每一檔都一定有比例
    entries.push({ row: row, code: code, dropPct: dropPct, ratio: ratio });

    if (shares > 0 && cost > 0 && price > 0) {
      var risePct = (price - cost / shares) / (cost / shares) * 100;
      if (risePct >= ALERT_RISE_PCT_) riseAlerts.push({ code: code, pct: risePct, suggestedSell: suggestedSell });
    }
  }

  return { dropAlerts: dropAlerts, riseAlerts: riseAlerts, entries: entries, ratioByRow: ratioByRow };
}

var LAST_ENTRY_SIGNALS_ = null; // 最近一次試算的訊號（每日檢查用來決定要不要寄信）
function buildCombinedReportV4_() {
     var signals = computeEntrySignalsV5_();
  LAST_ENTRY_SIGNALS_ = signals;
  var rebalanceMsg = computeRebalancePlan_(signals.ratioByRow);
  var msg = "";

  if (signals.dropAlerts.length || signals.riseAlerts.length) {
    msg += "【本次留意】\n";
    signals.dropAlerts.forEach(function (d) {
      msg += "📉 " + d.code + " 最近3個交易日累計下跌 " + d.pct.toFixed(1) + "%\n";
    });
    signals.riseAlerts.forEach(function (r) {
      if (r.suggestedSell > 0) {
        msg += "📈 " + r.code + " 已比平均成本上漲 " + r.pct.toFixed(1) + "%，系統建議賣出 " + r.suggestedSell + " 股（由你決定，不會自動執行）\n";
      } else {
        msg += "📈 " + r.code + " 已比平均成本上漲 " + r.pct.toFixed(1) + "%，但配置還沒超標，暫不建議賣出\n";
      }
    });
    msg += "\n";
  }

  msg += "💡 各標的本週進場比例（每週一重新算，同一週買滿就不再建議）：\n";
  signals.entries.forEach(function (e) {
    var label;
    if (e.bad) label = "價格資料怪怪的（可能剛換代號），這週先用最低比例";
    else if (e.dropPct === null) label = "過去股價暫時抓不到，先用最低比例";
    else if (e.basis === "high") {
      label = e.dropPct > 0.05 ? "比近" + e.highDays + "個交易日高點低" + e.dropPct.toFixed(1) + "%"
                            : "創近" + e.highDays + "個交易日新高";
    }
    else if (e.dropPct > 0) label = "3日跌" + e.dropPct.toFixed(1) + "%";
    else label = "3日漲" + Math.abs(e.dropPct).toFixed(1) + "%";
    msg += "  " + e.code + "：" + (e.ratio * 100).toFixed(0) + "%（" + label + "）\n";
  });

  msg += "\n──── 再平衡試算（S欄已依上面各檔比例調整過）────\n" + rebalanceMsg;
  // 記下這次試算的結果和時間：App 打開就直接顯示，不用再按一次「執行試算」
  try { PROPS_().setProperty("TRIAL_LAST", JSON.stringify({ at: Date.now(), report: msg.slice(0, 6000) })); } catch (saveErr) { Logger.log("試算結果沒有存到：" + saveErr); }
  // 試算完：通知開著的 App「資料變了」，一分鐘內自己重讀（不然中午收到信，App 還停在上次的建議）
  try { if (typeof waRevBump_ === "function") waRevBump_(); } catch (rbErr) { Logger.log(rbErr); }
  return msg;
}

function rebalanceTrialV4() {
  var msg = buildCombinedReportV4_();
  SpreadsheetApp.getUi().alert("再平衡試算 + 逐檔進場/賣出建議", msg, SpreadsheetApp.getUi().ButtonSet.OK);
}
// ---------- 找可以登記個股的空位（跟上一版相同，不管F欄多少，只看有沒有實際持股/成本）----------
function ensureStockSlot_(code) {
  var sheet = SS_().getSheetByName("工作表1");

  for (var row = 2; row <= LAY().last; row++) {
    if (String(sheet.getRange(row, 1).getValue()).trim() === code) return row;
  }

  for (var r = LAY().pickFirst; r <= LAY().last; r++) {
    var shares = Number(sheet.getRange(r, 2).getValue()) || 0;
    var cost = Number(sheet.getRange(r, 12).getValue()) || 0;
    if (shares === 0 && cost === 0) {
      sheet.getRange(r, 1).setValue(code);
      try { syncTradeFormCodes(); } catch (err) { Logger.log(err); }
      return r;
    }
  }
  return -1;
}

function setupStockCodeField() {
  var props = PROPS_();
  var formId = props.getProperty('TRADE_FORM_ID');

  if (!formId) {
    SpreadsheetApp.getUi().alert("找不到股票交易表單的ID，請確認TRADE_FORM_ID是否已設定。");
    return;
  }

  var form = FormApp.openById(formId);
  var items = form.getItems();
  var exists = items.some(function (item) {
    return item.getTitle() === STOCK_FIELD_TITLE_;
  });

  if (!exists) {
    form.addTextItem()
      .setTitle(STOCK_FIELD_TITLE_)
      .setHelpText("只有要交易的個股不在上面「標的代號」下拉選單時才填這裡，例如 TPE:2330。留空就照下拉選單的代號處理，這欄有填會優先用這欄。");
  }

  SpreadsheetApp.getUi().alert(
    "已新增欄位",
    "表單已新增「" + STOCK_FIELD_TITLE_ + "」欄位。之後下單新個股時，" +
    "下拉選單「標的代號」隨便選一個都可以，但只要這個新欄位填了代號，" +
    "系統會優先用這裡的代號，並自動登記進A6~A9的空格。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function normalizeStockCode_(raw) {
  var code = String(raw || "").trim();
  if (!code) return "";
  code = code.toUpperCase();
  if (code.indexOf(":") === -1 && /^\d/.test(code)) {
    code = "TPE:" + code; // 純數字代號預設補上TPE:
  }
  return code;
}
function checkConservativeShiftAlert_() {
  var sheet = SS_().getSheetByName("工作表1");
  var totalAssets = Number(sheet.getRange(R_(14), 2).getValue()) || 0;
  var threshold = Number(sheet.getRange(R_(40), 2).getValue()) || 0;

  if (threshold <= 0 || totalAssets < threshold) return "";

  var msg = "\n🛡️ 已達成財務自由門檻（總資產 " + totalAssets.toFixed(0) + " 元），建議改成以下保守配置：\n";
  msg += "  TPE:006208：22%\n";
  msg += "  TPE:00646：32%\n";
  msg += "  TPE:00935：6%\n";
  msg += "  TPE:00635U：6%\n";
  msg += "  現金：12%\n";
  msg += "  TPE:00679B（美債20年，避險效果較強）：14%\n";
  msg += "  TPE:00719B（美債1-3年，波動較小）：8%\n";
  msg += "以上僅供參考，系統不會自動修改F欄，要不要改由你自己決定。\n";

  return msg;
}
// ===== 補回：computeRebalancePlan_（原本的再平衡試算，內容不變）=====
// 房貸保留現金：每個月要繳的房貸（你負擔的部分）× 保留月數（預設 6 個月，一般建議的緊急預備金是 3～6 個月的固定支出）
function loanReserve_() {
  var months = 6; try { var o = JSON.parse(PROPS_().getProperty("USER_PREFS") || "{}"); if (o.reserveMonths >= 0) months = Number(o.reserveMonths); } catch (e) {}
  if (!(months > 0) || typeof reTotals_ !== "function") return { amount: 0, note: "", monthly: 0, months: months };
  var m = 0; (reTotals_(SS_()).list || []).forEach(function (x) { if (x.loan && x.loan.next && x.loan.next.t > 0) m += x.loan.next.t * (x.loanShare || 1); });
  return { amount: Math.round(m * months), monthly: Math.round(m), months: months, note: "每月房貸 " + Math.round(m).toLocaleString() + " 元 × " + months + " 個月" };
}
function computeRebalancePlan_(entryRatioByRow) {
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var panel = ss.getSheetByName("操作面板");
  var currentCash = sheet.getRange(R_(10), 4).getValue();

  var feeRate = Number(sheet.getRange(R_(21), 3).getValue()) || 0.001425;
  var taxRate = Number(sheet.getRange(R_(22), 3).getValue()) || 0.003;
  var minFee = Number(sheet.getRange(R_(23), 3).getValue()) || 20;

  var rows = [];
  var totalSellNetProceeds = 0;
  var totalBuyTotalCost = 0;

  var recentBuys = recentBuySharesByCode_(entryPeriodStart_()); // 這個禮拜（週一起）已買的股數

  for (var row = 2; row <= LAY().coreLast; row++) { // 只看核心ETF，個股(6~9)不參與試算
    var code = sheet.getRange(row, 1).getValue();
    var quotePrice = sheet.getRange(row, 3).getValue();
    var targetPct = sheet.getRange(row, 6).getValue();

    var suggestedBuy = Number(sheet.getRange(row, 11).getValue()) || 0;
    if (entryRatioByRow && typeof entryRatioByRow[row] === 'number') {
      // 本週額度扣掉這個禮拜已經買的：買滿就歸零，只買一部分就補剩下的；每週一重新開始
      var boughtRecently = recentBuys[String(code).trim()] || 0;
      suggestedBuy = Math.max(0, Math.floor((suggestedBuy + boughtRecently) * entryRatioByRow[row]) - boughtRecently);
    }

    var suggestedSell = sheet.getRange(row, 15).getValue();
    var buyManualPrice = panel.getRange(row, 5).getValue();
    var sellManualPrice = panel.getRange(row, 8).getValue();

    var buyPrice = (buyManualPrice && buyManualPrice > 0) ? buyManualPrice : quotePrice;
    var sellPrice = (sellManualPrice && sellManualPrice > 0) ? sellManualPrice : quotePrice;

    var buyGross = suggestedBuy * buyPrice;
    var buyFee = suggestedBuy > 0 ? Math.max(minFee, Math.round(buyGross * feeRate)) : 0;
    var buyTotalCost = buyGross + buyFee;

    var sellGross = suggestedSell * sellPrice;
    var sellFee = suggestedSell > 0 ? Math.max(minFee, Math.round(sellGross * feeRate)) : 0;
    var sellTax = suggestedSell > 0 ? Math.round(sellGross * taxRate) : 0;
    var sellNetProceeds = sellGross - sellFee - sellTax;

    totalBuyTotalCost += buyTotalCost;
    totalSellNetProceeds += sellNetProceeds;

    rows.push({ row: row, code: code, targetPct: targetPct, buyShares: suggestedBuy, buyPrice: buyPrice, buyTotalCost: buyTotalCost, finalBuyShares: suggestedBuy });
  }

  // 有房貸要繳：先留幾個月的房貸在現金裡，不拿去買股票（設定裡可以改月數，0＝不留）
  var reserve = 0, reserveNote = "";
  try { var rv = loanReserve_(); reserve = rv.amount; reserveNote = rv.note; } catch (rvE) { Logger.log("房貸保留現金：" + rvE); }
  var availableFunds = Math.max(0, currentCash - reserve) + totalSellNetProceeds;
  var shortfall = totalBuyTotalCost - availableFunds;

  var msg = "現金:" + currentCash.toFixed(0) + " 元\n";
  if (reserve > 0) msg += "保留給房貸:" + reserve.toFixed(0) + " 元（" + reserveNote + "，不拿去買）\n";
  msg += "預估賣出淨回收:" + totalSellNetProceeds.toFixed(0) + " 元\n";
  msg += "可用資金合計:" + availableFunds.toFixed(0) + " 元\n";
  msg += "預估買進所需(已依逐檔進場比例調整,僅核心ETF):" + totalBuyTotalCost.toFixed(0) + " 元\n\n";

  if (totalBuyTotalCost <= 0) {
    msg += "目前沒有低配的部位需要買進。";
  } else if (shortfall <= 0) {
    msg += "✅ 資金足夠,買進後剩餘現金約 " + (availableFunds - totalBuyTotalCost).toFixed(0) + " 元。";
  } else {
    msg += "⚠️ 資金不足,還差 " + shortfall.toFixed(0) + " 元。\n\n";
    msg += "已按「離目標缺口大小」分配資金(缺口越大分越多)，並把用不完的預算重新分給還沒補齊的標的，\n";
    msg += "確保操作後每個標的都平均往目標比例靠攏，不會有人補滿、有人分不到:\n\n";

    var buyRows = rows.filter(function (r) { return r.buyShares > 0; });
    for (var b = 0; b < buyRows.length; b++) {
      buyRows[b].filledShares = 0;
    }

    var remainingBudget = availableFunds;
    var maxRounds = buyRows.length + 1;

    for (var round = 0; round < maxRounds && remainingBudget > 0; round++) {
      var active = buyRows.filter(function (r) { return r.filledShares < r.buyShares; });
      if (active.length === 0) break;

      var totalNeed = 0;
      for (var n = 0; n < active.length; n++) {
        var neededShares = active[n].buyShares - active[n].filledShares;
        var gross = neededShares * active[n].buyPrice;
        var fee = Math.max(minFee, Math.round(gross * feeRate));
        active[n]._neededCost = gross + fee;
        totalNeed += active[n]._neededCost;
      }
      if (totalNeed <= 0) break;

      var budgetThisRound = remainingBudget;
      for (var a = 0; a < active.length; a++) {
        var r = active[a];
        var weight = r._neededCost / totalNeed;
        var thisBudget = budgetThisRound * weight;

        var prevShares = r.filledShares;
        var prevCost = prevShares > 0
          ? prevShares * r.buyPrice + Math.max(minFee, Math.round(prevShares * r.buyPrice * feeRate))
          : 0;

        var addShares = Math.floor(thisBudget / r.buyPrice);
        var maxAddShares = r.buyShares - r.filledShares;
        if (addShares > maxAddShares) addShares = maxAddShares;

        while (addShares > 0) {
          var newShares = prevShares + addShares;
          var newCost = newShares * r.buyPrice + Math.max(minFee, Math.round(newShares * r.buyPrice * feeRate));
          var marginalCost = newCost - prevCost;
          if (marginalCost <= thisBudget) break;
          addShares--;
        }

        if (addShares > 0) {
          var finalShares = prevShares + addShares;
          var finalCost = finalShares * r.buyPrice + Math.max(minFee, Math.round(finalShares * r.buyPrice * feeRate));
          var actualSpent = finalCost - prevCost;

          r.filledShares = finalShares;
          remainingBudget -= actualSpent;
        }
      }
    }

    for (var i2 = 0; i2 < buyRows.length; i2++) {
      var r2 = buyRows[i2];
      r2.finalBuyShares = r2.filledShares;
      if (r2.filledShares >= r2.buyShares && r2.filledShares > 0) {
        msg += "✅ " + r2.code + "（目標" + (r2.targetPct * 100).toFixed(1) + "%）買進 " + r2.filledShares + " 股（已補滿本次比例）\n";
      } else if (r2.filledShares > 0) {
        msg += "⚠️ " + r2.code + "（目標" + (r2.targetPct * 100).toFixed(1) + "%）缺口較大，這次先補 " + r2.filledShares + " 股\n";
      } else {
        msg += "❌ " + r2.code + "（目標" + (r2.targetPct * 100).toFixed(1) + "%）這次分配後暫時沒有餘額，先不買\n";
      }
    }
  }

  for (var j = 0; j < rows.length; j++) {
    sheet.getRange(rows[j].row, 19).setValue(rows[j].finalBuyShares); // S欄，只寫核心ETF那幾列
  }
  // 個股slot(6~9)的S欄清空，避免殘留舊數字造成誤解
  sheet.getRange(LAY().pickFirst, 19, LAY().pick, 1).clearContent();

  syncReturnRateToPanel_();

  return msg;
}
// ============================================================
// 每日收盤價紀錄表（分頁：每日收盤價）
// - 每個交易日下午3點自動把工作表1 A2:A9 各檔的收盤價存成固定數字
// - 算「3個交易日前收盤價」時優先查這張表，查不到才用T欄的GOOGLEFINANCE
// - 第一次使用請在編輯器依序執行：backfillDailyClose() → setupDailyCloseRecorder()
// ============================================================
var CLOSE_LOG_SHEET_ = "每日收盤價";
var CLOSE_LOG_TZ_ = "Asia/Taipei";
var CLOSE_LOOKBACK_DAYS_ = 3; // 往回看幾個交易日

function todayStr_() {
  return Utilities.formatDate(new Date(), CLOSE_LOG_TZ_, "yyyy-MM-dd");
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CLOSE_LOG_TZ_, "yyyy-MM-dd");
  return String(v).trim();
}

function getCloseLogSheet_() {
  var ss = SS_();
  var sh = ss.getSheetByName(CLOSE_LOG_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(CLOSE_LOG_SHEET_);
    sh.getRange("A:A").setNumberFormat("@"); // 日期存成文字，避免時區換算跑掉
    sh.getRange(1, 1, 1, 3).setValues([["日期", "代號", "收盤價"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function loadCloseLog_() {
  var sh = getCloseLogSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getValues();
}

// 新增紀錄，同一天同一檔已經有就跳過
function appendCloses_(records) {
  if (!records.length) return 0;
  var sh = getCloseLogSheet_();
  var log = loadCloseLog_();
  var seen = {};
  log.forEach(function (r) { seen[normDate_(r[0]) + "|" + String(r[1]).trim()] = true; });

  var toAdd = records.filter(function (r) {
    var key = r[0] + "|" + r[1];
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  if (!toAdd.length) return 0;

  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, toAdd.length, 1).setNumberFormat("@");
  sh.getRange(start, 1, toAdd.length, 3).setValues(toAdd);
  return toAdd.length;
}

// 某一檔在紀錄表裡「可以信」的收盤價：{ 日期: 價格 }（只取今天以前）
// 換過代號時，紀錄表可能混到舊標的的價格（例如那一格原本是債券 ETF），價格會突然差很多。
// ETF 一天漲跌超過 25% 幾乎不可能，所以從最新往回找，遇到跳超過 25% 的地方就把更舊的全部丟掉。
// curPrice（現在的價格）也一起比：跟最近一筆紀錄就差超過 25%，表示整段紀錄都不對，全部不用（改用 T 欄 Google 的資料）
var CLOSE_JUMP_MAX_ = 0.25;
function cleanCloseSeries_(log, code, todayStr, curPrice) {
  var map = {};
  for (var i = 0; i < log.length; i++) {
    if (String(log[i][1]).trim() !== code) continue;
    var d = normDate_(log[i][0]);
    var p = Number(log[i][2]) || 0;
    if (d < todayStr && p > 0) map[d] = p;
  }
  var dates = Object.keys(map).sort().reverse(); // 新 → 舊
  var keep = {}, prev = Number(curPrice) > 0 ? Number(curPrice) : 0;
  for (var j = 0; j < dates.length; j++) {
    var px = map[dates[j]];
    if (prev > 0 && Math.abs(px / prev - 1) > CLOSE_JUMP_MAX_) break;
    keep[dates[j]] = px; prev = px;
  }
  return keep;
}

// 查「今天以前第N個交易日」的收盤價，查不到回傳0
function getPastCloseFromLog_(log, code, todayStr, n, curPrice) {
  var map = cleanCloseSeries_(log, code, todayStr, curPrice);
  var dates = Object.keys(map).sort().reverse();
  return dates.length >= n ? map[dates[n - 1]] : 0;
}

// 查「今天以前最近 n 個交易日」裡最高的收盤價；紀錄太少（不到 5 天）回傳 null
var HIGH_LOOKBACK_DAYS_ = 60; // 大約 3 個月
function getRecentHighFromLog_(log, code, todayStr, n, curPrice) {
  var map = cleanCloseSeries_(log, code, todayStr, curPrice);
  var dates = Object.keys(map).sort().reverse().slice(0, n);
  if (dates.length < 5) return null;
  var high = 0;
  dates.forEach(function (d) { if (map[d] > high) high = map[d]; });
  return { high: high, days: dates.length };
}

// ---------- 每日自動執行：記錄今天收盤價 ----------
function recordDailyClose() {
  try { admTrigRun_("收盤紀錄", recordDailyCloseRun_); } finally { dashPrebuild_("收盤"); }
}
function recordDailyCloseRun_() {
  try { processDailyRebate_(); } catch (rebErr) { Logger.log("手續費日退失敗：" + rebErr); }
  try { feeMonthlyCatchUp_(); } catch (mErr) { Logger.log("手續費月退補結失敗：" + mErr); }
  if (typeof cardPriceDaily_ === "function") cardPriceDaily_(); // 收藏卡自動報價（週末也跑）
  var now = new Date();
  var dow = Number(Utilities.formatDate(now, CLOSE_LOG_TZ_, "u"));
  if (dow > 5) return; // 週末不記

  var today = todayStr_();
  var sheet = SS_().getSheetByName("工作表1");
  try { if (fixPriceFormulas_()) { SpreadsheetApp.flush(); Utilities.sleep(5000); } } catch (pfE) { Logger.log(pfE); } // 寫死別檔代號的股價公式先改正，免得記到錯的價格
  var data = sheet.getRange(2, 1, LAY().n, 3).getValues(); // A2:C9

  // 價格有缺就等一下重讀
  for (var attempt = 0; attempt < 3; attempt++) {
    var missing = data.some(function (r) { return String(r[0]).trim() && !(Number(r[2]) > 0); });
    if (!missing) break;
    SpreadsheetApp.flush();
    Utilities.sleep(3000);
    data = sheet.getRange(2, 1, LAY().n, 3).getValues();
  }

  // 找出每檔上一次記錄的價格，用來判斷是不是國定假日休市
  var log = loadCloseLog_();
  var lastDate = {}, lastPrice = {};
  log.forEach(function (r) {
    var c = String(r[1]).trim(), d = normDate_(r[0]);
    if (!lastDate[c] || d > lastDate[c]) { lastDate[c] = d; lastPrice[c] = Number(r[2]); }
  });

  var records = [], allSame = true, compared = 0;
  data.forEach(function (r) {
    var code = String(r[0]).trim();
    var price = Number(r[2]) || 0;
    if (!code || !(price > 0)) return;
    records.push([today, code, price]);
    if (lastPrice[code] !== undefined) {
      compared++;
      if (lastPrice[code] !== price) allSame = false;
    } else {
      allSame = false;
    }
  });

  if (records.length && compared >= 2 && allSame) {
    Logger.log("每一檔價格都跟上一次紀錄完全一樣，判斷今天休市，不記錄");
    return;
  }

  var added = appendCloses_(records);
  Logger.log("每日收盤價：新增 " + added + " 筆（" + today + "）");
}

// ---------- 一次性：補入最近幾週的歷史收盤價，讓紀錄表馬上可以用 ----------
function backfillDailyClose() {
  var sh = getCloseLogSheet_();
  var sheet = SS_().getSheetByName("工作表1");
  var codes = sheet.getRange(2, 1, LAY().n, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (c, i, arr) { return c && arr.indexOf(c) === i; });

  var temp = sh.getRange(1, 5); // 用E1當暫存格
  var records = [], failed = [];

  codes.forEach(function (code) {
    var rows = [];
    for (var attempt = 0; attempt < 3 && rows.length === 0; attempt++) {
      sh.getRange(1, 5, 40, 2).clearContent();
      temp.setFormula('=IFERROR(GOOGLEFINANCE("' + code + '","close",TODAY()-30,TODAY()-1),"")');
      SpreadsheetApp.flush();
      Utilities.sleep(2000);
      rows = sh.getRange(2, 5, 39, 2).getValues().filter(function (r) {
        return r[0] instanceof Date && Number(r[1]) > 0;
      });
    }
    if (!rows.length) { failed.push(code); return; }
    rows.forEach(function (r) { records.push([normDate_(r[0]), code, Number(r[1])]); });
  });

  sh.getRange(1, 5, 40, 2).clearContent();
  records.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  var added = appendCloses_(records);

  var msg = "已補入 " + added + " 筆歷史收盤價。";
  if (failed.length) msg += "\n這幾檔這次抓不到，可以等一下再執行一次：" + failed.join("、");
    Logger.log(msg);
  try { SpreadsheetApp.getUi().alert("每日收盤價補登完成", msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

// ---------- 一次性：設定每個交易日下午3點自動記錄 ----------
function setupDailyCloseRecorder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "recordDailyClose") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("recordDailyClose")
    .timeBased().everyDays(1).atHour(15).inTimezone(CLOSE_LOG_TZ_).create();
  getCloseLogSheet_();
    Logger.log("每日收盤價自動記錄已設定：每天下午3~4點執行");
  try {
    SpreadsheetApp.getUi().alert("每日收盤價自動記錄已設定",
      "每天下午3點到4點之間會自動把各檔收盤價記到「每日收盤價」分頁（週末和休市日不記）。",
      SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
}

// ============================================================
// v5：逐檔進場比例（優先查每日收盤價紀錄表，查不到才用T欄）

// ============================================================
// v5：逐檔進場比例（優先查每日收盤價紀錄表，查不到才用T欄）
// ============================================================
function computeEntrySignalsV5_() {
  var sheet = SS_().getSheetByName("工作表1");
  var today = todayStr_();
  var log = [];
  try { log = loadCloseLog_(); } catch (e) { Logger.log(e); }
  var fromLog = function (code, px) { return getPastCloseFromLog_(log, code, today, CLOSE_LOOKBACK_DAYS_, px); };

  var readBlock = function () { return sheet.getRange(2, 1, LAY().core, 20).getValues(); }; // 核心 ETF 那幾列 A:T
  var data = readBlock();
  for (var attempt = 0; attempt < 3; attempt++) {
    var missing = false;
    for (var k = 0; k < LAY().core; k++) {
      var c = String(data[k][0]).trim();
      if (c && !(fromLog(c, data[k][2]) > 0) && !(Number(data[k][19]) > 0)) missing = true;
    }
    if (!missing) break;
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
    data = readBlock();
  }

  var dropAlerts = [], riseAlerts = [], entries = [], ratioByRow = {};

  for (var k = 0; k < LAY().core; k++) {
    var row = k + 2;
    var code = String(data[k][0]).trim();
    if (!code) continue;

    var shares = Number(data[k][1]) || 0;
    var price = Number(data[k][2]) || 0;
    var cost = Number(data[k][11]) || 0;
    var suggestedSell = Number(data[k][14]) || 0;
    var logPast = fromLog(code, price);
    var tPast = Number(data[k][19]) || 0;
    var pastClose = logPast > 0 ? logPast : tPast;

    Logger.log("V5 row=" + row + " code=" + code + " price=" + price +
      " 紀錄表=" + logPast + " T欄=" + tPast);

    var ratio = RISE_FLOOR_RATIO_;
    var dropPct = null, basis = "3d", highDays = 0;

    // 短期：跟 3 個交易日前比（只用來發「最近急跌」的提醒，以及當作備用）
    var bad = false;
    if (price > 0 && pastClose > 0) {
      dropPct = (pastClose - price) / pastClose * 100;
      // 3 天漲跌超過 30%：ETF 幾乎不可能，多半是價格資料有問題（剛換代號、報價還沒更新）→ 這週先用最低比例，不發急跌提醒
      if (Math.abs(dropPct) > 30) { bad = true; dropPct = null; }
      else if (dropPct >= ALERT_DROP_PCT_) dropAlerts.push({ code: code, pct: dropPct });
    }
    // 主要依據：現在比最近約 3 個月的最高收盤價便宜多少。
    // 跌完之後只要價格還沒回去，就一直算便宜；不會因為「這 3 天沒再跌」就變回最低比例。
    var hi = price > 0 && !bad ? getRecentHighFromLog_(log, code, today, HIGH_LOOKBACK_DAYS_, price) : null;
    if (hi) {
      var fromHigh = (hi.high - price) / hi.high * 100;
      if (dropPct === null || fromHigh > dropPct) { dropPct = fromHigh; basis = "high"; highDays = hi.days; }
    }
    // 剛好在高點（例如休市日報價停在昨天收盤＝新高）不算「比較便宜」，維持最低比例
    if (dropPct !== null && dropPct > 0.05) {
      ratio = PER_TICKER_TIERS_[PER_TICKER_TIERS_.length - 1].ratio;
      for (var i = 0; i < PER_TICKER_TIERS_.length; i++) {
        if (dropPct >= PER_TICKER_TIERS_[i].minDrop) { ratio = PER_TICKER_TIERS_[i].ratio; break; }
      }
    }

    ratioByRow[row] = ratio;
    entries.push({ row: row, code: code, dropPct: dropPct, ratio: ratio, basis: basis, highDays: highDays, bad: bad });

    if (shares > 0 && cost > 0 && price > 0) {
      var risePct = (price - cost / shares) / (cost / shares) * 100;
      if (risePct >= ALERT_RISE_PCT_) riseAlerts.push({ code: code, pct: risePct, suggestedSell: suggestedSell });
    }
  }

  return { dropAlerts: dropAlerts, riseAlerts: riseAlerts, entries: entries, ratioByRow: ratioByRow };
}
// 把表單「標的代號」選項同步成工作表1 A2:A9（不跳彈窗，觸發器也能用）
function syncTradeFormCodes() {
  var formId = PROPS_().getProperty('TRADE_FORM_ID');
  if (!formId) { Logger.log("找不到TRADE_FORM_ID"); return; }

  var sheet = SS_().getSheetByName("工作表1");
  var codes = sheet.getRange(2, 1, LAY().n, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (c, i, arr) { return c && arr.indexOf(c) === i; });
  if (!codes.length) { Logger.log("A2:A9沒有代號"); return; }

  var items = FormApp.openById(formId).getItems(FormApp.ItemType.MULTIPLE_CHOICE);
  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === "標的代號") {
      items[i].asMultipleChoiceItem().setChoiceValues(codes);
      Logger.log("表單代號已同步：" + codes.join("、"));
      return;
    }
  }
  Logger.log("表單裡找不到「標的代號」題目");
}

// ---------- 給副本呼叫的公開名稱（程式庫裡結尾是 _ 的函式，副本叫不到） ----------
function onLedgerEditUpdatePreview(e) { return onLedgerEditUpdatePreview_(e); }


// ==================== Biz.gs ====================
// ============================================================
// 生意帳（美容店）：營收、客人儲值、進貨、庫存、耗材、費用、周轉金
// - 生意的錢放在「帳戶」分頁 C 欄標記為「生意」的帳戶，跟個人資產分開
// - 客人儲值／買課程：收到錢時是「預收款」（欠客人的服務），客人來消費時才算營收
// - 周轉金目標 =（近 3 個月平均每月付出的進貨＋費用）× 月數 ＋ 客人儲值餘額 ＋ 未付貨款
//   生意帳戶超過目標的部分，才建議提領到個人帳戶去投資
// 第一次使用：在編輯器執行一次 setupBizModule()
// ============================================================

var BIZ_SHEETS_ = {
  product: ["商品", ["名稱", "類型（販售 / 耗材 / 販售+耗材）", "單位", "安全庫存", "預設售價", "備註", "條碼（手機掃描用，多個用逗號分開）", "廠商（分類用）"]],
  purchase: ["進貨", ["日期", "廠商", "商品", "數量", "單價", "金額", "付款帳戶", "狀態（已付 / 未付）", "付款日期", "備註", "期別（哪一期貨款）", "預計付款日"]],
  revenue: ["營收", ["日期", "類型", "客人", "項目", "數量", "金額", "收款帳戶", "備註", "成本（商品銷售）", "付款方式"]],
  expense: ["費用", ["日期", "類別", "金額", "付款帳戶", "備註"]],
  consume: ["耗材領用", ["日期", "商品", "數量", "用途", "成本"]],
  setting: ["生意設定", ["項目", "數值", "說明"]]
};
var BIZ_REV_TYPES_ = ["療程", "商品銷售", "儲值", "使用儲值"];
// 療程／商品銷售用客人儲值付款時，「營收」分頁 G 欄（收款帳戶）寫這個，餘額會從客人儲值扣
var BIZ_PREPAID_PAY_ = "儲值扣款";
// 贈送（不收錢）：「營收」分頁 G 欄寫這個，金額 0、不進任何帳戶；商品照扣庫存，成本算進當月成本
var BIZ_GIFT_PAY_ = "（贈送）";
function bizPaidByPrepaid_(r) { return String(r[6]).trim() === BIZ_PREPAID_PAY_ && (String(r[1]) === "療程" || String(r[1]) === "商品銷售"); }
var BIZ_EXP_CATS_ = ["房租", "水電", "網路電話", "薪資", "雜支"];
var BIZ_WITHDRAW_CAT_ = "生意收入";

function setupBizModule() {
  var ss = SS_();
  Object.keys(BIZ_SHEETS_).forEach(function (k) { bizSheet_(ss, k); });
  var set = bizSheet_(ss, "setting");
  if (set.getLastRow() < 2) {
    set.getRange(2, 1, 2, 3).setValues([
      ["周轉金月數", 2, "保留幾個月的進貨＋費用當周轉金"],
      ["費用類別", BIZ_EXP_CATS_.join("、"), "用頓號分隔，可以自己增減"]
    ]);
  }
  // 預設兩個生意帳戶，可在「帳戶」分頁改名或新增
  waAccountSheet_(ss);
  waEnsureAccount_(ss, "店內現金", "生意");
  waEnsureAccount_(ss, "店帳戶（銀行）", "生意");
  Logger.log("生意模組已建立");
}

function bizSheet_(ss, key) {
  var def = BIZ_SHEETS_[key];
  var sh = ss.getSheetByName(def[0]);
  if (!sh) {
    sh = ss.insertSheet(def[0]);
    sh.getRange(1, 1, 1, def[1].length).setValues([def[1]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function bizRows_(ss, key) {
  return waMemo_("biz_" + key, function () { return bizRowsRaw_(ss, key); });
}
function bizRowsRaw_(ss, key) {
  var sh = ss.getSheetByName(BIZ_SHEETS_[key][0]);
  if (!sh || sh.getLastRow() < 2) return [];
  var n = BIZ_SHEETS_[key][1].length, mc = sh.getMaxColumns();
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(n, mc)).getValues();
  if (mc < n) v.forEach(function (r) { while (r.length < n) r.push(""); }); // 舊的分頁欄位比較少：補空白
  return v;
}
// 舊的分頁少了後來加的欄位：補欄、補標題（不動資料）
function bizEnsureCols_(sh, key) {
  var def = BIZ_SHEETS_[key][1], mc = sh.getMaxColumns();
  if (mc < def.length) sh.insertColumnsAfter(mc, def.length - mc);
  var head = sh.getRange(1, 1, 1, def.length).getValues()[0];
  for (var i = 0; i < def.length; i++) if (!String(head[i]).trim()) sh.getRange(1, i + 1).setValue(def[i]).setFontWeight("bold");
}

function bizDate_(v) {
  if (v instanceof Date) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function bizMonthKey_(d) { return Utilities.formatDate(d, WA_TZ_, "yyyy-MM"); }

function bizSetting_(ss, name, fallback) {
  var rows = bizRows_(ss, "setting");
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === name) return rows[i][1] === "" ? fallback : rows[i][1];
  return fallback;
}

// 生意帳戶＋中轉帳戶裡「生意的那一份」
function bizAccounts_(ss) {
  var out = [];
  waAccountBalances_(ss).forEach(function (a) {
    if (a.scope === "生意") out.push(a);
    else if (a.scope === "中轉") out.push({ name: a.name, active: a.active, scope: "中轉", role: a.role, balance: a.bizPart || 0, transit: true });
  });
  return out;
}

// ---------- 庫存：每樣商品的數量、平均成本 ----------
function bizInventory_(ss) {
  var products = bizRows_(ss, "product");
  var map = {};
  var order = [];
  products.forEach(function (r) {
    var n = String(r[0]).trim();
    if (!n) return;
    map[n] = { name: n, type: String(r[1] || "販售"), unit: String(r[2] || ""), safety: waNum_(r[3]), price: waNum_(r[4]),
      barcodes: bizCodes_(r[6]), vendor: String(r[7] || "").trim(), inQty: 0, inCost: 0, sold: 0, used: 0 };
    order.push(n);
  });
  var ensure = function (n) {
    if (!map[n]) { map[n] = { name: n, type: "販售", unit: "", safety: 0, price: 0, inQty: 0, inCost: 0, sold: 0, used: 0 }; order.push(n); }
    return map[n];
  };
  bizRows_(ss, "purchase").forEach(function (r) {
    var n = String(r[2]).trim(); if (!n) return;
    var p = ensure(n); p.inQty += waNum_(r[3]); p.inCost += waNum_(r[5]);
    var pv = String(r[1] || "").trim();
    if (pv && pv.charAt(0) !== "（") p.lastVendor = pv.replace(/（期初應付）$/, ""); // 沒指定廠商的商品，用最近一次進貨的廠商分類
  });
  bizRows_(ss, "revenue").forEach(function (r) {
    if (String(r[1]) !== "商品銷售") return;
    var n = String(r[3]).trim(); if (!n) return;
    ensure(n).sold += waNum_(r[4]);
  });
  bizRows_(ss, "consume").forEach(function (r) {
    var n = String(r[1]).trim(); if (!n) return;
    ensure(n).used += waNum_(r[2]);
  });
  return order.map(function (n) {
    var p = map[n];
    var avg = p.inQty > 0 ? p.inCost / p.inQty : 0;
    var qty = p.inQty - p.sold - p.used;
    return { name: p.name, type: p.type, unit: p.unit, safety: p.safety, price: p.price, barcodes: p.barcodes || [], vendor: p.vendor || p.lastVendor || "", sold: p.sold, qty: qty, avgCost: avg, inQty: p.inQty,
      value: Math.max(0, qty) * avg, low: p.safety > 0 && qty <= p.safety };
  });
}

// ---------- 商品的廠商（庫存用廠商分類）----------
// overwrite = false：商品已經有廠商就不動
function bizSetVendor_(ss, product, vendor, overwrite) {
  product = String(product || "").trim(); vendor = String(vendor || "").trim();
  if (!product || (!vendor && !overwrite)) return;
  var sh = bizSheet_(ss, "product");
  if (!String(sh.getRange(1, 8).getValue()).trim()) sh.getRange(1, 8).setValue(BIZ_SHEETS_.product[1][7]).setFontWeight("bold");
  var last = sh.getLastRow(), row = 0;
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { if (!row && String(r[0]).trim() === product) row = i + 2; });
  if (!row) { sh.appendRow([product, "販售", "", "", "", ""]); row = sh.getLastRow(); }
  var cell = sh.getRange(row, 8);
  if (!overwrite && String(cell.getValue()).trim()) return;
  cell.setValue(vendor);
}

// ---------- 商品條碼 ----------
// 「商品」分頁 G 欄：一個商品可以有好幾個條碼（逗號分開）。比對時不管開頭的 0（試算表會把 0 吃掉）
function bizCodeNorm_(c) { return String(c == null ? "" : c).replace(/[^0-9A-Za-z]/g, "").replace(/^0+/, "").toUpperCase(); }
function bizCodes_(cell) {
  return String(cell == null ? "" : cell).split(/[,，、\s]+/).map(function (x) { return x.trim(); }).filter(String);
}
function bizBarcodeOwner_(ss, code) {
  var n = bizCodeNorm_(code), owner = "";
  if (!n) return "";
  bizRowsRaw_(ss, "product").forEach(function (r) {
    if (bizCodes_(r[6]).some(function (c) { return bizCodeNorm_(c) === n; })) owner = String(r[0]).trim();
  });
  return owner;
}
// 把條碼記到商品上（商品清單裡還沒有這個商品就加一列）
function bizSetBarcode_(ss, product, code) {
  product = String(product || "").trim(); code = String(code || "").trim();
  if (!product || !bizCodeNorm_(code)) return;
  var owner = bizBarcodeOwner_(ss, code);
  if (owner === product) return;
  if (owner) throw new Error("這個條碼已經登記在「" + owner + "」");
  var sh = bizSheet_(ss, "product");
  if (!String(sh.getRange(1, 7).getValue()).trim()) sh.getRange(1, 7).setValue(BIZ_SHEETS_.product[1][6]).setFontWeight("bold");
  var last = sh.getLastRow(), row = 0;
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { if (!row && String(r[0]).trim() === product) row = i + 2; });
  if (!row) { sh.appendRow([product, "販售", "", "", "", ""]); row = sh.getLastRow(); }
  var cell = sh.getRange(row, 7);
  var cur = bizCodes_(cell.getValue());
  cur.push(code);
  cell.setNumberFormat("@").setValue(cur.join(","));
}
// 只把條碼綁到商品（不記進出貨）；p.remove = true 是拿掉這個條碼
function waBizSetBarcode(p) {
  var ss = SS_();
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    if (p && p.remove) {
      var sh = bizSheet_(ss, "product"), n = bizCodeNorm_(p.barcode), last = sh.getLastRow();
      if (last >= 2) sh.getRange(2, 7, last - 1, 1).getValues().forEach(function (r, i) {
        var cs = bizCodes_(r[0]), keep = cs.filter(function (c) { return bizCodeNorm_(c) !== n; });
        if (keep.length !== cs.length) sh.getRange(i + 2, 7).setNumberFormat("@").setValue(keep.join(","));
      });
      return { message: "已拿掉條碼", detail: String(p.barcode), dashboard: waGetDashboard() };
    }
    bizSetBarcode_(ss, p.product, p.barcode);
  } finally {
    lock.releaseLock();
  }
  return { message: "條碼已登記到「" + String(p.product).trim() + "」", detail: String(p.barcode), dashboard: waGetDashboard() };
}

// ---------- 客人資料、消費紀錄 ----------
// 每位客人：儲值餘額、累計消費、來過幾次、最近一次
function bizCustomers_(ss) {
  var map = {};
  bizRows_(ss, "revenue").forEach(function (r) {
    var who = String(r[2]).trim();
    if (!who) return;
    var type = String(r[1]), amt = waNum_(r[5]), via = bizPaidByPrepaid_(r);
    var c = map[who] || (map[who] = { name: who, balance: 0, spent: 0, count: 0, last: "", lastT: 0 });
    if (type === "儲值" || type === "期初儲值") c.balance += amt;
    else {
      if (type === "使用儲值" || via) c.balance -= amt;
      c.spent += amt; c.count++;
    }
    var d = bizDate_(r[0]);
    if (d && d.getTime() >= c.lastT) { c.lastT = d.getTime(); c.last = Utilities.formatDate(d, WA_TZ_, "yyyy/MM/dd"); }
  });
  return Object.keys(map).map(function (k) { var c = map[k]; delete c.lastT; c.balance = Math.round(c.balance); c.spent = Math.round(c.spent); return c; });
}
// 消費紀錄（最新的在前面）。p.customer 有填＝只看這位客人
WA_READ_ONLY_.waBizHistory = 1;
function waBizHistory(p) {
  var ss = SS_();
  var who = String(p && p.customer || "").trim();
  var rows = bizRowsRaw_(ss, "revenue"), out = [], max = who ? 500 : 400;
  for (var i = rows.length - 1; i >= 0 && out.length < max; i--) {
    var r = rows[i], name = String(r[2]).trim();
    if (who && name !== who) continue;
    var d = bizDate_(r[0]); if (!d) continue;
    var type = String(r[1]), via = bizPaidByPrepaid_(r);
    out.push({ row: i + 2, t: bizT_(d), date: Utilities.formatDate(d, WA_TZ_, "yyyy/MM/dd"), type: type, customer: name, item: String(r[3] || ""),
      qty: r[4] === "" ? "" : waNum_(r[4]), amount: waNum_(r[5]), pay: via ? "儲值扣款" : type === "使用儲值" ? "儲值扣款" : String(r[6] || ""), method: String(r[9] || ""), note: String(r[7] || "") });
  }
  out.sort(function (a, b) { return b.t - a.t || b.row - a.row; });
  return { customer: who, rows: out, total: rows.length };
}
// 自訂順序（庫存、客人）：存在「生意設定」分頁
// 自己加的付款方式（LINE Pay、轉帳、刷卡機…）：存在「生意設定」，每一種記住上次收進哪個帳戶
function bizPayMethods_(ss) {
  try {
    var v = JSON.parse(String(bizSetting_(ss, "付款方式", "[]")) || "[]");
    return Array.isArray(v) ? v.filter(function (x) { return x && x.name; }).map(function (x) { return { name: String(x.name), account: String(x.account || "") }; }) : [];
  } catch (e) { return []; }
}
function bizPayMethodsSave_(ss, list) {
  var sh = bizSheet_(ss, "setting"), last = sh.getLastRow(), row = 0;
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { if (!row && String(r[0]).trim() === "付款方式") row = i + 2; });
  var val = list.length ? JSON.stringify(list.slice(0, 30)) : "";
  if (row) sh.getRange(row, 2).setValue(val);
  else sh.appendRow(["付款方式", val, "App 裡自己加的付款方式，和各自上次收進的帳戶"]);
}
// 記一筆時順便記住：沒看過的付款方式加進清單；看過的更新成這次收進的帳戶
function bizPayMethodLearn_(ss, name, account) {
  name = String(name || "").trim();
  if (!name || name === "收錢" || name === BIZ_PREPAID_PAY_) return;
  var list = bizPayMethods_(ss), hit = list.filter(function (x) { return x.name === name; })[0];
  if (hit && (hit.account === account || !account)) return;
  if (hit) hit.account = account; else list.push({ name: name, account: account || "" });
  bizPayMethodsSave_(ss, list);
}
// 把一個付款方式從清單拿掉（以前的紀錄不會動）
function waBizPayMethodRemove(p) {
  var ss = SS_(), name = String(p && p.name || "").trim();
  bizPayMethodsSave_(ss, bizPayMethods_(ss).filter(function (x) { return x.name !== name; }));
  return { message: "已移除付款方式「" + name + "」", detail: "以前的紀錄不會變", dashboard: waGetDashboard() };
}
function bizOrder_(ss, key) {
  try { var v = JSON.parse(String(bizSetting_(ss, key, "[]")) || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch (e) { return []; }
}
WA_READ_ONLY_.waBizSaveOrder = 1;
function waBizSaveOrder(p) {
  var ss = SS_();
  var key = p && p.kind === "cust" ? "客人順序" : "商品順序";
  var order = (Array.isArray(p && p.order) ? p.order : []).map(function (x) { return String(x); }).slice(0, 3000);
  var sh = bizSheet_(ss, "setting"), last = sh.getLastRow(), row = 0;
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { if (!row && String(r[0]).trim() === key) row = i + 2; });
  var val = order.length ? JSON.stringify(order) : "";
  if (row) sh.getRange(row, 2).setValue(val);
  else sh.appendRow([key, val, "App 裡自己排的順序（清空＝照字母排）"]);
  try { UCACHE_().remove("wa_dash"); } catch (e) {}
  return { ok: true };
}

// ---------- 修改商品（庫存清單點進去）----------
// p: { name, newName, type, unit, safety, price, barcodes, qty（實際數量，選填）, avgCost（平均成本，選填）, remove }
function waBizEditProduct(p) {
  var ss = SS_();
  var name = String(p && p.name || "").trim();
  if (!name) throw new Error("找不到商品");
  var lock = LOCK_();
  lock.waitLock(10000);
  var notes = [];
  try {
    var inv = bizInventory_(ss).filter(function (x) { return x.name === name; })[0];
    if (!inv) throw new Error("商品清單裡沒有「" + name + "」");
    var psh = bizSheet_(ss, "product"), pur = bizSheet_(ss, "purchase"), rev = bizSheet_(ss, "revenue"), con = bizSheet_(ss, "consume");
    var findRow = function (nm) {
      var last = psh.getLastRow(), row = 0;
      if (last >= 2) psh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { if (!row && String(r[0]).trim() === nm) row = i + 2; });
      return row;
    };
    var colRows = function (sh, col, extra) { // 這個商品在某個分頁的所有列
      var last = sh.getLastRow(), out = [];
      if (last < 2) return out;
      sh.getRange(2, 1, last - 1, Math.max(col, 8)).getValues().forEach(function (r, i) { if (String(r[col - 1]).trim() === name && (!extra || extra(r))) out.push({ row: i + 2, r: r }); });
      return out;
    };
    var purRows = colRows(pur, 3), revRows = colRows(rev, 4, function (r) { return String(r[1]) === "商品銷售"; }), conRows = colRows(con, 2);

    if (p.remove) {
      if (revRows.length || conRows.length) throw new Error("這個商品已經有賣出或領用紀錄，不能刪除。不賣了的話把數量改成 0 就好");
      if (purRows.some(function (x) { var st = String(x.r[7]).trim(); return st === "已付" || st === "未付"; })) throw new Error("這個商品有進貨付款紀錄，不能直接刪除（錢已經記在帳上）。可以把數量改成 0");
      purRows.map(function (x) { return x.row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { pur.deleteRow(r); });
      var dr = findRow(name); if (dr) psh.deleteRow(dr);
      return { message: "已刪除「" + name + "」", detail: "", dashboard: waGetDashboard() };
    }

    // 1. 數量、平均成本：補一筆「盤點調整」，不動帳戶的錢，也不算進月報
    var now = new Date(), avg = inv.avgCost, inQty = inv.inQty;
    if (p.qty !== undefined && p.qty !== null && String(p.qty).trim() !== "") {
      var nq = Number(p.qty);
      if (!isFinite(nq) || nq < 0) throw new Error("數量格式不正確");
      var dq = Math.round((nq - inv.qty) * 10000) / 10000;
      if (dq !== 0) {
        pur.appendRow([now, "（盤點調整）", name, dq, Math.round(avg * 100) / 100, Math.round(dq * avg * 100) / 100, "", "期初", "", "數量 " + inv.qty + " → " + nq]);
        inQty += dq;
        notes.push("數量 " + inv.qty + " → " + nq);
      }
    }
    if (p.avgCost !== undefined && p.avgCost !== null && String(p.avgCost).trim() !== "") {
      var na = Number(p.avgCost);
      if (!isFinite(na) || na < 0) throw new Error("平均成本格式不正確");
      if (Math.abs(na - avg) >= 0.005) {
        if (!(inQty > 0)) throw new Error("還沒有進貨數量，沒辦法改平均成本");
        pur.appendRow([now, "（成本調整）", name, 0, 0, Math.round((na - avg) * inQty * 100) / 100, "", "期初", "", "平均成本 " + Math.round(avg * 100) / 100 + " → " + na]);
        notes.push("平均成本 → " + na);
      }
    }

    // 2. 商品資料
    var row = findRow(name);
    if (!row) { psh.appendRow([name, "販售", "", "", "", ""]); row = psh.getLastRow(); }
    var type = ["販售", "耗材", "販售+耗材"].indexOf(String(p.type)) >= 0 ? String(p.type) : inv.type;
    psh.getRange(row, 2, 1, 4).setValues([[type, String(p.unit == null ? inv.unit : p.unit).trim(), Number(p.safety) || "", Number(p.price) || ""]]);
    if (p.vendor !== undefined && p.vendor !== null) bizSetVendor_(ss, name, p.vendor, true);
    if (p.barcodes !== undefined && p.barcodes !== null) {
      var codes = bizCodes_(p.barcodes);
      codes.forEach(function (c) { var o = bizBarcodeOwner_(ss, c); if (o && o !== name) throw new Error("條碼 " + c + " 已經登記在「" + o + "」"); });
      if (!String(psh.getRange(1, 7).getValue()).trim()) psh.getRange(1, 7).setValue(BIZ_SHEETS_.product[1][6]).setFontWeight("bold");
      psh.getRange(row, 7).setNumberFormat("@").setValue(codes.join(","));
    }

    // 3. 改名：商品、進貨、營收、耗材領用裡的名稱一起改
    var newName = String(p.newName || "").trim();
    if (newName && newName !== name) {
      if (bizInventory_(ss).some(function (x) { return x.name === newName; })) throw new Error("已經有「" + newName + "」這個商品了");
      psh.getRange(row, 1).setValue(newName);
      colRows(pur, 3).forEach(function (x) { pur.getRange(x.row, 3).setValue(newName); });
      revRows.forEach(function (x) { rev.getRange(x.row, 4).setValue(newName); });
      conRows.forEach(function (x) { con.getRange(x.row, 2).setValue(newName); });
      notes.push("改名為 " + newName);
    }
  } finally {
    lock.releaseLock();
  }
  return { message: "已更新「" + (String(p.newName || "").trim() || name) + "」", detail: notes.join("・"), dashboard: waGetDashboard() };
}

// ---------- 客人儲值餘額 ----------
function bizPrepaid_(ss) {
  var map = {};
  bizRows_(ss, "revenue").forEach(function (r) {
    var type = String(r[1]), who = String(r[2]).trim() || "（未填客人）";
    var viaPrepaid = bizPaidByPrepaid_(r);
    if (type !== "儲值" && type !== "使用儲值" && type !== "期初儲值" && !viaPrepaid) return;
    if (!map[who]) map[who] = { name: who, balance: 0, last: "" };
    map[who].balance += (type === "使用儲值" || viaPrepaid) ? -waNum_(r[5]) : waNum_(r[5]);
    var d = bizDate_(r[0]); if (d) map[who].last = Utilities.formatDate(d, WA_TZ_, "yyyy/MM/dd");
  });
  return Object.keys(map).map(function (k) { map[k].balance = Math.round(map[k].balance); return map[k]; })
    .filter(function (c) { return c.balance !== 0; })
    .sort(function (a, b) { return b.balance - a.balance; });
}

// ---------- 月報與周轉金 ----------
function bizMonthly_(ss, bucket) {
  // bucket(日期) → 要算進哪一格（預設：月份 yyyy-MM）；回傳空的就不算（查詢某段日期時用）
  bucket = bucket || bizMonthKey_;
  var months = {};
  var m = function (d) {
    var k = bucket(d);
    if (!k) return null;
    if (!months[k]) months[k] = { key: k, treat: 0, sales: 0, usePrepaid: 0, fromPrepaid: 0, prepaidIn: 0, cogs: 0, consume: 0, expense: 0, purchasePaid: 0, cashIn: 0 };
    return months[k];
  };
  bizRows_(ss, "revenue").forEach(function (r) {
    var d = bizDate_(r[0]); if (!d) return;
    var x = m(d); if (!x) return;
    var amt = waNum_(r[5]), type = String(r[1]), viaPrepaid = bizPaidByPrepaid_(r);
    if (viaPrepaid) x.fromPrepaid += amt;
    if (type === "療程") { x.treat += amt; if (!viaPrepaid) x.cashIn += amt; }
    else if (type === "商品銷售") { x.sales += amt; if (!viaPrepaid) x.cashIn += amt; x.cogs += waNum_(r[8]); }
    else if (type === "儲值") { x.prepaidIn += amt; x.cashIn += amt; }
    else if (type === "使用儲值") { x.usePrepaid += amt; }
  });
  bizRows_(ss, "consume").forEach(function (r) { var d = bizDate_(r[0]); var x = d && m(d); if (x) x.consume += waNum_(r[4]); });
  bizRows_(ss, "expense").forEach(function (r) { var d = bizDate_(r[0]); var x = d && m(d); if (x) x.expense += waNum_(r[2]); });
  bizRows_(ss, "purchase").forEach(function (r) {
    if (String(r[7]).trim() !== "已付") return;
    var d = bizDate_(r[8]) || bizDate_(r[0]); var x = d && m(d); if (x) x.purchasePaid += waNum_(r[5]);
  });
  Object.keys(months).forEach(function (k) {
    var x = months[k];
    x.revenue = x.treat + x.sales + x.usePrepaid;
    x.profit = x.revenue - x.cogs - x.consume - x.expense;
    x.cashOut = x.purchasePaid + x.expense;
  });
  return months;
}

// 生意查詢：一段日期的營收、支出、淨利，和其中每個月。p: { from, to }（yyyy-MM-dd）
function waBizQuery(p) {
  var ss = SS_();
  if (!ss.getSheetByName(BIZ_SHEETS_.product[0])) throw new Error("還沒有設定生意模組");
  var ok = function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")); };
  var from = String(p && p.from || ""), to = String(p && p.to || "");
  if (!ok(from) || !ok(to)) throw new Error("請選日期");
  if (from > to) { var t0 = from; from = to; to = t0; }
  var day = function (d) { return Utilities.formatDate(d, WA_TZ_, "yyyy-MM-dd"); };
  var inR = function (d) { var k = day(d); return k >= from && k <= to; };
  var tot = bizMonthly_(ss, function (d) { return inR(d) ? "R" : ""; }).R ||
    { treat: 0, sales: 0, usePrepaid: 0, fromPrepaid: 0, prepaidIn: 0, cogs: 0, consume: 0, expense: 0, purchasePaid: 0, cashIn: 0, revenue: 0, profit: 0, cashOut: 0 };
  var mm = bizMonthly_(ss, function (d) { return inR(d) ? bizMonthKey_(d) : ""; });
  var months = Object.keys(mm).sort().reverse().map(function (k) { return mm[k]; });
  return { from: from, to: to, total: tot, months: months };
}
WA_READ_ONLY_.waBizQuery = 1;

// 還沒付的貨款：每一列一筆，App 再依廠商、期別分組（像信用卡帳單）
function bizPayables_(ss) {
  var out = [];
  bizRows_(ss, "purchase").forEach(function (r, i) {
    if (String(r[7]).trim() === "未付") {
      var d = bizDate_(r[0]), due = bizDate_(r[11]), v = String(r[1] || "").trim(), op = /（期初應付）$/.test(v);
      out.push({ row: i + 2, date: d ? Utilities.formatDate(d, WA_TZ_, "MM/dd") : "", day: d ? Utilities.formatDate(d, WA_TZ_, "yyyy-MM-dd") : "",
        vendor: v.replace(/（期初應付）$/, ""), item: String(r[2] || "") || (op ? "期初應付" : "貨款"), qty: waNum_(r[3]), amount: waNum_(r[5]),
        batch: String(r[10] || "").trim() || (op ? "期初應付" : ""), due: r[11] && due ? Utilities.formatDate(due, WA_TZ_, "yyyy-MM-dd") : "", note: String(r[9] || "") });
    }
  });
  return out;
}
// 以前用一個帳戶（例如叫「未付」）代表欠款：列出從這個帳戶「付」的進貨，讓使用者確認要不要轉成應付貨款
function bizConvertRows_(ss, acc) {
  var out = [];
  bizRows_(ss, "purchase").forEach(function (r, i) {
    if (String(r[7]).trim() === "已付" && String(r[6]).trim() === acc) {
      var d = bizDate_(r[0]);
      out.push({ row: i + 2, date: d ? Utilities.formatDate(d, WA_TZ_, "yyyy/MM/dd") : "", vendor: String(r[1] || ""), item: String(r[2] || ""), qty: waNum_(r[3]), amount: waNum_(r[5]) });
    }
  });
  return out;
}
WA_READ_ONLY_.waBizConvertPreview = 1;
function waBizConvertPreview(p) {
  var ss = SS_(), acc = String(p && p.account || "").trim();
  if (!acc) throw new Error("請選帳戶");
  var rows = bizConvertRows_(ss, acc), bal = null;
  bizAccounts_(ss).forEach(function (a) { if (a.name === acc) bal = a.balance; });
  return { account: acc, rows: rows, total: rows.reduce(function (a, x) { return a + x.amount; }, 0), balance: bal };
}

// 給 App 的生意資料；沒有設定生意模組時回傳 null（畫面就不顯示生意分頁）
function waBizData_(ss) {
  if (!ss.getSheetByName(BIZ_SHEETS_.product[0])) return null;
  var now = new Date();
  var thisKey = bizMonthKey_(now);
  var lastKey = bizMonthKey_(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  var months = bizMonthly_(ss);
  var empty = { revenue: 0, treat: 0, sales: 0, usePrepaid: 0, fromPrepaid: 0, prepaidIn: 0, cogs: 0, consume: 0, expense: 0, profit: 0, cashIn: 0, cashOut: 0 };

  // 近 3 個完整月份的平均每月付出
  var outs = [];
  for (var i = 1; i <= 3; i++) {
    var k = bizMonthKey_(new Date(now.getFullYear(), now.getMonth() - i, 15));
    if (months[k]) outs.push(months[k].cashOut);
  }
  if (!outs.length && months[thisKey]) outs.push(months[thisKey].cashOut); // 剛開始用、還沒有完整月份時，先用本月
  var avgOut = outs.length ? outs.reduce(function (a, b) { return a + b; }, 0) / outs.length : 0;

  var prepaid = bizPrepaid_(ss);
  var prepaidTotal = prepaid.reduce(function (a, c) { return a + Math.max(0, c.balance); }, 0);
  var payables = bizPayables_(ss);
  var payTotal = payables.reduce(function (a, p) { return a + p.amount; }, 0);
  var monthsBuf = waNum_(bizSetting_(ss, "周轉金月數", 2)) || 2;
  var target = avgOut * monthsBuf + prepaidTotal + payTotal;

  var accounts = bizAccounts_(ss);
  var cash = accounts.reduce(function (a, x) { return a + x.balance; }, 0);
  var inv = bizInventory_(ss);

  // 最近紀錄：每種取最後 15 筆（用已經讀進來的資料，不再多讀一次試算表），帶著列號和原始欄位讓 App 可以修改
  var recent = [];
  var ymd = function (d) { return d ? Utilities.formatDate(d, WA_TZ_, "yyyy-MM-dd") : ""; };
  var pushRecent = function (key, map) {
    var rows = bizRows_(ss, key);
    for (var ri = rows.length - 1; ri >= 0 && ri >= rows.length - 15; ri--) { var o = map(rows[ri]); if (o) { o.key = key; o.row = ri + 2; recent.push(o); } }
  };
  pushRecent("revenue", function (r) { var vp = bizPaidByPrepaid_(r); return { t: bizDate_(r[0]), kind: r[1], title: (String(r[6]).trim() === BIZ_GIFT_PAY_ ? "贈送・" : String(r[1]) + "・").replace(/・$/, r[3] ? "・" : "") + (r[3] || "") + (r[4] && String(r[1]) === "商品銷售" ? " × " + r[4] : "") + (vp ? "（儲值）" : ""), sub: String(r[2] || ""), amount: waNum_(r[5]), sign: (r[1] === "使用儲值" || r[1] === "期初儲值" || vp || String(r[6]).trim() === BIZ_GIFT_PAY_) ? 0 : 1,
    raw: { t: bizT_(r[0]), d: ymd(bizDate_(r[0])), type: String(r[1]), customer: String(r[2] || ""), item: String(r[3] || ""), qty: r[4] === "" ? "" : waNum_(r[4]), amount: waNum_(r[5]), pay: vp ? BIZ_PREPAID_PAY_ : String(r[6] || ""), note: String(r[7] || "") } }; });
  pushRecent("purchase", function (r) {
    var opening = String(r[7]) === "期初" || String(r[1]).indexOf("期初") >= 0;
    return { t: bizDate_(r[0]), kind: "進貨", title: (opening ? "期初・" : "進貨・") + (r[2] || "應付貨款") + (r[2] ? " × " + r[3] : ""),
      sub: String(r[1] || "") + (String(r[7]) === "未付" ? "・未付" : ""), amount: waNum_(r[5]), sign: opening ? 0 : -1,
      raw: { t: bizT_(r[0]), d: ymd(bizDate_(r[0])), vendor: String(r[1] || ""), product: String(r[2] || ""), qty: waNum_(r[3]), unit: waNum_(r[4]), amount: waNum_(r[5]), account: String(r[6] || ""), status: String(r[7] || ""), note: String(r[9] || "") } };
  });
  pushRecent("expense", function (r) { return { t: bizDate_(r[0]), kind: "費用", title: "費用・" + r[1], sub: String(r[4] || ""), amount: waNum_(r[2]), sign: -1,
    raw: { t: bizT_(r[0]), d: ymd(bizDate_(r[0])), cat: String(r[1] || ""), amount: waNum_(r[2]), account: String(r[3] || ""), note: String(r[4] || "") } }; });
  pushRecent("consume", function (r) { return { t: bizDate_(r[0]), kind: "耗材", title: "耗材・" + r[1] + " × " + r[2], sub: String(r[3] || ""), amount: waNum_(r[4]), sign: 0,
    raw: { t: bizT_(r[0]), d: ymd(bizDate_(r[0])), product: String(r[1] || ""), qty: waNum_(r[2]), note: String(r[3] || ""), amount: waNum_(r[4]) } }; });
  recent = recent.filter(function (x) { return x.t; }).sort(function (a, b) { return b.t - a.t || b.row - a.row; }).slice(0, 30)
    .map(function (x) { x.date = Utilities.formatDate(x.t, WA_TZ_, "MM/dd HH:mm"); delete x.t; return x; });

  var customers = {}, vendors = {}, treatments = {};
  bizRows_(ss, "revenue").forEach(function (r) { if (r[2]) customers[String(r[2]).trim()] = 1; if (r[1] === "療程" && r[3]) treatments[String(r[3]).trim()] = 1; });
  bizRows_(ss, "purchase").forEach(function (r) { var v = String(r[1] || "").trim(); if (v && v.charAt(0) !== "（") vendors[v.replace(/（期初應付）$/, "")] = 1; });
  bizRows_(ss, "product").forEach(function (r) { var v = String(r[7] || "").trim(); if (v) vendors[v] = 1; });

  return {
    thisMonth: months[thisKey] || empty, lastMonth: months[lastKey] || empty,
    thisKey: thisKey, lastKey: lastKey,
    accounts: accounts, cash: cash,
    working: { avgOut: avgOut, months: monthsBuf, prepaid: prepaidTotal, payables: payTotal, target: target, surplus: cash - target },
    inventory: inv, prepaid: prepaid, payables: payables, recent: recent,
    expenseCats: String(bizSetting_(ss, "費用類別", BIZ_EXP_CATS_.join("、"))).split(/[、,，]/).map(function (s) { return s.trim(); }).filter(String),
    customers: Object.keys(customers), vendors: Object.keys(vendors), treatments: Object.keys(treatments),
    payMethods: bizPayMethods_(ss),
    custList: bizCustomers_(ss), invOrder: bizOrder_(ss, "商品順序"), custOrder: bizOrder_(ss, "客人順序"),
    revTypes: BIZ_REV_TYPES_
  };
}

// 台北時間「一天裡的第幾毫秒」、某一天 00:00 的毫秒
function bizTod_(ms) { return ((ms + 8 * 3600000) % 86400000 + 86400000) % 86400000; }
function bizDayStart_(day) {
  var d = new Date(String(day) + "T00:00:00+08:00");
  if (isNaN(d.getTime())) throw new Error("日期格式不正確");
  return d.getTime();
}
function bizStamp_(day, at) {
  var now = Date.now(), today = Utilities.formatDate(new Date(now), WA_TZ_, "yyyy-MM-dd");
  var want = day && String(day) !== today ? bizDayStart_(day) + bizTod_(now) : now;
  var a = Number(at);
  // App 帶來的時間只在跟這裡算的差不到 15 分鐘時才用。一律取到整秒：試算表存日期會有 1 毫秒左右的誤差，比對時用「四捨五入到秒」才不會認錯
  return new Date(Math.floor((a > 0 && Math.abs(a - want) <= 15 * 60000 ? a : want) / 1000) * 1000);
}
// 一筆紀錄的身分：時間四捨五入到秒（毫秒）
function bizT_(v) { var d = bizDate_(v); return d ? Math.round(d.getTime() / 1000) * 1000 : 0; }
// 找出要改的那一列。有帶時間（t）就用時間認，不怕前面有別筆被刪掉造成列號位移；同一次送出的幾項再用項目名稱、金額分辨
function bizLocateRow_(ss, key, row, t, sig, ident, amtCol, nameCol) {
  t = Number(t);
  if (!(t > 0)) return row; // 舊版畫面沒帶時間：照舊用列號
  var rows = bizRowsRaw_(ss, key), cand = [];
  t = Math.round(t / 1000) * 1000;
  for (var i = 0; i < rows.length; i++) { if (bizT_(rows[i][0]) === t) cand.push(i); }
  if (!cand.length) throw new Error("找不到這筆紀錄（可能已經改過或刪掉了），請按右上角重新整理");
  var pick = function (list) { if (list.length <= 1) return list; var hint = list.filter(function (i) { return i + 2 === row; }); return hint.length ? hint : list; };
  var c = cand;
  if (ident !== undefined && ident !== null) { var c1 = c.filter(function (i) { return String(rows[i][nameCol] || "").trim() === String(ident).trim(); }); if (c1.length) c = c1; }
  if (sig !== undefined && sig !== null) { var c2 = c.filter(function (i) { return Math.abs(waNum_(rows[i][amtCol]) - Number(sig)) <= 0.5; }); if (c2.length) c = c2; else throw new Error("這筆紀錄已經變動，請重新整理再試"); }
  c = pick(c);
  return c[0] + 2;
}

// ---------- 記一筆生意帳 ----------
function waBizRecord(p) {
  var ss = SS_();
  if (!ss.getSheetByName(BIZ_SHEETS_.product[0])) throw new Error("還沒有設定生意模組，請先在編輯器執行 setupBizModule()");
  var kind = String(p.kind || "");
  var amount = Number(p.amount);
  // 每一次送出有自己的時間（精確到毫秒）：同一次送出的好幾項共用同一個時間，App 靠它把它們合成一筆、也靠它認出是哪一列
  // 補記以前的日期：那一天＋現在的時分秒。App 會自己帶時間（p.at）來，這樣它不用等伺服器就知道這筆的身分
  var date = bizStamp_(p.date, p.at);
  var note = String(p.note || "").trim();
  var msg = "", detail = "";

  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    // 「不經過帳戶」：補登以前的紀錄，只算進報表，不動任何帳戶餘額
    var noAcc = String(p.account || "") === "__none__";
    var needAcc = function () {
      if (noAcc) {
        if (kind === "withdraw") throw new Error("提領要選帳戶");
        return "";
      }
      var a = waCheckAccountName_(p.account);
      waEnsureAccount_(ss, a, "生意");
      return a;
    };
    // 掃條碼記帳：先確認這個條碼沒有被別的商品用掉，記完之後再把條碼綁到商品上
    var bcode = String(p.barcode || "").trim(), bprod = String(p.barcodeProduct || "").trim();
    if (bcode && bprod) {
      var bown = bizBarcodeOwner_(ss, bcode);
      if (bown && bown !== bprod) throw new Error("這個條碼已經登記在「" + bown + "」");
    }

    if (kind === "revenue") {
      // 一次可以記好幾項（例如同一位客人做療程又買商品）：p.lines = [{ type, item, qty, amount }]
      var lines = Array.isArray(p.lines) && p.lines.length ? p.lines : [{ type: p.type, item: p.item, qty: p.qty, amount: p.amount }];
      var customer = String(p.customer || "").trim();
      var invNow = bizInventory_(ss);
      var plan = lines.map(function (ln) {
        var type = String(ln.type || "");
        if (BIZ_REV_TYPES_.indexOf(type) === -1) throw new Error("請選擇營收類型");
        if ((type === "儲值" || type === "使用儲值") && lines.length > 1) throw new Error("儲值要單獨記一筆");
        var gift = p.payBy === "gift" && (type === "療程" || type === "商品銷售");
        var amt = gift ? 0 : Number(ln.amount);
        if (!gift && !(amt > 0)) throw new Error("請輸入" + (lines.length > 1 ? type : "") + "金額");
        var item = String(ln.item || "").trim();
        var qty = type === "商品銷售" ? Number(ln.qty) : "";
        var cost = "";
        if (type === "商品銷售") {
          if (!item) throw new Error("請選擇商品");
          if (!(qty > 0)) throw new Error("請輸入數量");
          var inv = invNow.filter(function (x) { return x.name === item; })[0];
          if (!inv) throw new Error("商品清單裡沒有「" + item + "」，請先進貨");
          if (inv.qty < qty) throw new Error("「" + item + "」庫存只剩 " + inv.qty + "，請確認數量或先補進貨紀錄");
          cost = Math.round(inv.avgCost * qty);
        }
        return { type: type, item: item, qty: qty, amount: amt, cost: cost, gift: gift, viaPrepaid: (type === "療程" || type === "商品銷售") && p.payBy === "prepaid" };
      });
      var useBal = plan.some(function (x) { return x.viaPrepaid || x.type === "使用儲值"; });
      if ((useBal || plan.some(function (x) { return x.type === "儲值"; })) && !customer) throw new Error("儲值要填客人名字，才能追蹤餘額");
      if (useBal) {
        var need = plan.reduce(function (a, x) { return a + ((x.viaPrepaid || x.type === "使用儲值") ? x.amount : 0); }, 0);
        var bal = 0;
        bizPrepaid_(ss).forEach(function (c) { if (c.name === customer) bal = c.balance; });
        if (need > bal) throw new Error(customer + " 的儲值餘額只剩 " + bal.toLocaleString() + " 元（這次要扣 " + need.toLocaleString() + "）");
      }
      var acc = plan.every(function (x) { return x.viaPrepaid || x.gift || x.type === "使用儲值"; }) ? "" : needAcc();
      var method = String(p.payMethod || "").trim().slice(0, 20);
      var total = 0;
      plan.forEach(function (x) {
        var payCol = x.viaPrepaid ? BIZ_PREPAID_PAY_ : x.gift ? BIZ_GIFT_PAY_ : (x.type === "使用儲值" ? "" : (acc || "（補登）"));
        bizSheet_(ss, "revenue").appendRow([date, x.type, customer, x.item, x.qty, x.amount, payCol, note, x.cost, acc && !x.viaPrepaid && !x.gift && x.type !== "使用儲值" ? method : ""]);
        if (acc && !x.viaPrepaid && !x.gift && x.type !== "使用儲值") waLogFlow_(ss, "營收", "營收:" + x.type, acc, x.amount, (customer ? customer + " " : "") + x.item);
        total += x.amount;
      });
      if (method && acc) {
        try {
          var rsh = bizSheet_(ss, "revenue");
          if (!String(rsh.getRange(1, 10).getValue()).trim()) rsh.getRange(1, 10).setValue("付款方式");
          bizPayMethodLearn_(ss, method, acc);
        } catch (pmE) { Logger.log("付款方式記憶失敗：" + pmE); }
      }
      var first = plan[0];
      msg = plan.length > 1 ? plan.map(function (x) { return x.type; }).join("＋") + " 共 " + Math.round(total).toLocaleString() + " 元已記錄"
        : first.type + " " + Math.round(total).toLocaleString() + " 元已記錄";
      if (first.gift) {
        msg = "贈送" + (customer ? " " + customer : "") + "：" + plan.map(function (x) { return x.item + (x.qty ? " × " + x.qty : ""); }).join("、") + " 已記錄";
        detail = "不收錢、不進帳。" + (plan.some(function (x) { return x.type === "商品銷售"; }) ? "庫存已扣，商品成本算進本月成本" : "");
      }
      if (first.viaPrepaid) detail = "用 " + customer + " 的儲值付款，算進營收，不會再進帳一次";
      if (first.type === "儲值") detail = "記為客人預收款，客人來消費時付款方式選「用客人儲值扣」才算營收";
      if (first.type === "使用儲值") detail = "從 " + customer + " 的儲值扣除，不會再進帳一次";

    } else if (kind === "purchase") {
      // 一次可以進好幾樣（同一家廠商、同一張單）：p.lines = [{ product, qty, unitPrice }]；舊的一次一樣也照收
      var plines = Array.isArray(p.lines) && p.lines.length ? p.lines : [{ product: p.product, qty: p.qty, unitPrice: p.unitPrice }];
      var vendor = String(p.vendor || "").trim();
      var paid = p.paid !== false;
      var batch = paid ? "" : String(p.batch || "").trim().slice(0, 30);
      var due = paid ? "" : String(p.due || "").trim();
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("預計付款日格式不對");
      var plan2 = plines.map(function (ln) {
        var product = String(ln.product || "").trim(), q = Number(ln.qty), unit = Number(ln.unitPrice);
        if (!product) throw new Error("請選擇或輸入商品");
        if (!(q > 0)) throw new Error("請輸入「" + product + "」的數量");
        if (!(unit >= 0) || ln.unitPrice === "" || ln.unitPrice === null || ln.unitPrice === undefined) throw new Error("請輸入「" + product + "」的進貨單價");
        return { product: product, q: q, unit: unit, total: Math.round(q * unit * 100) / 100 };
      });
      var pacc = paid ? needAcc() : ""; // 先欠著：不用選帳戶，付款時才選
      if (p.newProduct && plan2.length === 1) {
        var exists = bizInventory_(ss).some(function (x) { return x.name === plan2[0].product; });
        if (!exists) bizSheet_(ss, "product").appendRow([plan2[0].product, p.productType || "販售", p.productUnit || "", Number(p.safety) || "", Number(p.salePrice) || "", ""]);
      }
      var psh = bizSheet_(ss, "purchase");
      if (!paid) bizEnsureCols_(psh, "purchase");
      var dueD = due ? new Date(due + "T12:00:00+08:00") : "";
      plan2.forEach(function (x) {
        var row = [date, vendor, x.product, x.q, x.unit, x.total, paid ? (pacc || "（補登）") : "", paid ? "已付" : "未付", paid ? date : "", note];
        if (!paid) row.push(batch, dueD);
        psh.appendRow(row);
        if (paid && pacc) waLogFlow_(ss, "進貨", pacc, "進貨:" + (vendor || x.product), x.total, x.product + " × " + x.q);
        bizSetVendor_(ss, x.product, vendor, false);
      });
      var ptotal = plan2.reduce(function (a, x) { return a + x.total; }, 0);
      msg = "進貨 " + (plan2.length > 1 ? plan2.length + " 樣商品" : plan2[0].product + " × " + plan2[0].q) + " 已記錄";
      detail = "金額 " + Math.round(ptotal).toLocaleString() + " 元" + (paid ? "" : "・先欠著，列在「應付貨款」" + (batch ? "的「" + batch + "」" : "") + (due ? "，預計 " + due.slice(5).replace("-", "/") + " 付" : ""));

    } else if (kind === "payPayable" || kind === "payPayables") {
      // 付貨款：可以一次付好幾筆（同一期、好幾期都可以），每家廠商記成一筆付款
      var sh = bizSheet_(ss, "purchase");
      var prow = kind === "payPayable" ? [Number(p.row)] : (Array.isArray(p.rows) ? p.rows.map(Number) : []);
      if (!prow.length) throw new Error("請選要付的貨款");
      var payAcc = needAcc(), byV = {}, cnt = 0, sum = 0;
      var pv = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 10).getValues();
      var sigs = Array.isArray(p.sigs) ? p.sigs : null;
      prow.forEach(function (row, k) {
        if (!(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這筆進貨，請重新整理再試");
        var r = pv[row - 2];
        if (String(r[7]).trim() !== "未付") throw new Error("「" + (r[2] || r[1]) + "」這筆已經付過了，請重新整理再試");
        if (sigs && sigs[k] !== undefined && Math.abs(waNum_(r[5]) - Number(sigs[k])) > 0.5) throw new Error("貨款資料有變動，請重新整理再試");
      });
      prow.forEach(function (row) {
        var r = pv[row - 2], v = String(r[1] || "").trim().replace(/（期初應付）$/, "") || String(r[2] || "");
        sh.getRange(row, 7, 1, 3).setValues([[payAcc || "（補登）", "已付", date]]);
        (byV[v] = byV[v] || []).push(r); cnt++; sum += waNum_(r[5]);
      });
      if (payAcc) Object.keys(byV).forEach(function (v) {
        var rs = byV[v], tot = rs.reduce(function (a, r) { return a + waNum_(r[5]); }, 0);
        var what = rs.length === 1 ? (rs[0][2] ? rs[0][2] + " × " + rs[0][3] : "貨款") : rs.length + " 筆貨款";
        waLogFlow_(ss, "進貨", payAcc, "進貨:" + v, Math.round(tot * 100) / 100, what + "（付清貨款）");
      });
      msg = "已付 " + Object.keys(byV).join("、") + " 貨款 " + Math.round(sum).toLocaleString() + " 元";
      detail = (cnt > 1 ? cnt + " 筆，" : "") + (payAcc ? "從 " + payAcc + " 付款" : "不經過帳戶（補登）");

    } else if (kind === "payableConvert") {
      // 以前用一個帳戶（例如「未付」）記欠款：把從這個帳戶「付」的進貨改回「未付」，這個帳戶的餘額加回來
      var cacc = String(p.account || "").trim();
      if (!cacc) throw new Error("請選帳戶");
      var csh = bizSheet_(ss, "purchase"), list = bizConvertRows_(ss, cacc);
      var want = Array.isArray(p.rows) ? p.rows.map(Number) : null;
      if (want) list = list.filter(function (x) { return want.indexOf(x.row) >= 0; });
      if (!list.length) throw new Error("沒有要轉的進貨");
      bizEnsureCols_(csh, "purchase");
      var cb = String(p.batch || "").trim().slice(0, 30), ctot = 0;
      list.forEach(function (x) {
        csh.getRange(x.row, 7, 1, 3).setValues([["", "未付", ""]]);
        if (cb) csh.getRange(x.row, 11).setValue(cb);
        waLogFlow_(ss, "進貨", cacc, "進貨:" + (x.vendor || x.item), -x.amount, "更正：改成應付貨款（原本記在 " + cacc + "）");
        ctot += x.amount;
      });
      msg = list.length + " 筆進貨改成應付貨款，共 " + Math.round(ctot).toLocaleString() + " 元";
      detail = cacc + " 的餘額加回 " + Math.round(ctot).toLocaleString() + " 元；之後付款請到「應付貨款」按付款";

    } else if (kind === "expense") {
      var cat = String(p.category || "").trim();
      if (!cat) throw new Error("請選擇費用類別");
      if (!(amount > 0)) throw new Error("請輸入金額");
      var eacc = needAcc();
      bizSheet_(ss, "expense").appendRow([date, cat, amount, eacc || "（補登）", note]);
      if (eacc) waLogFlow_(ss, "費用", eacc, "費用:" + cat, amount, note);
      msg = cat + " " + Math.round(amount).toLocaleString() + " 元已記錄";

    } else if (kind === "consume") {
      var cp = String(p.product || "").trim();
      var cq = Number(p.qty);
      if (!cp) throw new Error("請選擇耗材");
      if (!(cq > 0)) throw new Error("請輸入用量");
      var ci = bizInventory_(ss).filter(function (x) { return x.name === cp; })[0];
      if (!ci) throw new Error("商品清單裡沒有「" + cp + "」");
      if (ci.qty < cq) throw new Error("「" + cp + "」庫存只剩 " + ci.qty);
      var ccost = Math.round(ci.avgCost * cq);
      bizSheet_(ss, "consume").appendRow([date, cp, cq, note, ccost]);
      msg = "耗材 " + cp + " × " + cq + " 已扣庫存";
      detail = "成本約 " + ccost.toLocaleString() + " 元，會算進本月成本";

    } else if (kind === "openingStock") {
      // 期初庫存：店裡本來就有的貨，只增加庫存，不動帳戶的錢
      var op = String(p.product || "").trim(), oq = Number(p.qty), oc = Number(p.unitCost);
      if (!op) throw new Error("請輸入商品名稱");
      if (!(oq > 0)) throw new Error("請輸入數量");
      if (!(oc >= 0)) throw new Error("請輸入單位成本");
      var known = bizInventory_(ss).some(function (x) { return x.name === op; });
      if (!known) bizSheet_(ss, "product").appendRow([op, p.productType || "販售", p.productUnit || "", Number(p.safety) || "", Number(p.salePrice) || "", ""]);
      bizSheet_(ss, "purchase").appendRow([date, "（期初庫存）", op, oq, oc, Math.round(oq * oc * 100) / 100, "", "期初", "", note]);
      bizSetVendor_(ss, op, p.vendor, true);
      msg = "期初庫存 " + op + " × " + oq + " 已登記";
      detail = "只增加庫存，不會扣帳戶的錢";

    } else if (kind === "openingPrepaid") {
      // 客人之前就儲值、還沒用完的餘額
      var oc2 = String(p.customer || "").trim(), ob = Number(p.amount);
      if (!oc2) throw new Error("請輸入客人名字");
      if (!(ob > 0)) throw new Error("請輸入儲值餘額");
      bizSheet_(ss, "revenue").appendRow([date, "期初儲值", oc2, "", "", ob, "", note || "開始使用 App 前的儲值餘額", ""]);
      msg = oc2 + " 期初儲值 " + Math.round(ob).toLocaleString() + " 元已登記";
      detail = "不算營收、不會進帳；之後客人消費記「使用儲值」";

    } else if (kind === "openingPayable") {
      // 之前就欠廠商、還沒付的貨款
      var ov = String(p.vendor || "").trim(), oa = Number(p.amount);
      if (!ov) throw new Error("請輸入廠商");
      if (!(oa > 0)) throw new Error("請輸入金額");
      bizSheet_(ss, "purchase").appendRow([date, ov + "（期初應付）", "", 0, 0, oa, "", "未付", "", note]);
      msg = "期初應付 " + ov + " " + Math.round(oa).toLocaleString() + " 元已登記";
      detail = "會列在「應付貨款」，付款時再按付款";

    } else if (kind === "withdraw") {
      if (!(amount > 0)) throw new Error("請輸入金額");
      var from = needAcc();
      var toAcc = waCheckAccountName_(p.toAccount);
      var fromBal = 0;
      bizAccounts_(ss).forEach(function (a) { if (a.name === from) fromBal = a.balance; });
      if (amount > fromBal) throw new Error(from + " 只有 " + Math.round(fromBal).toLocaleString() + " 元");
    } else {
      throw new Error("不明的紀錄類型");
    }
    if (bcode && bprod) bizSetBarcode_(ss, bprod, bcode);
    // 賣出時把這次的單價記下來，下次當參考
    var priceList = Array.isArray(p.prices) ? p.prices.slice() : [];
    if (Number(p.newSalePrice) > 0 && p.priceProduct) priceList.push({ product: p.priceProduct, price: p.newSalePrice });
    priceList = priceList.filter(function (x) { return x && Number(x.price) > 0 && String(x.product || "").trim(); });
    if (priceList.length) {
      var psh = bizSheet_(ss, "product"), plast = psh.getLastRow();
      if (plast >= 2) {
        var pnames = psh.getRange(2, 1, plast - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
        priceList.forEach(function (x) { var pi = pnames.indexOf(String(x.product).trim()); if (pi >= 0) psh.getRange(pi + 2, 5).setValue(Number(x.price)); });
      }
    }
  } finally {
    lock.releaseLock();
  }

  if (kind === "withdraw") {
    // 生意的錢轉到個人：先用原本的收入流程記一筆（個人現金、生活帳戶、淨投入本金都會正確更新），
    // 成功後才扣生意帳戶，避免一邊有記、一邊沒記
    var r2 = waSubmitLedger({ type: "收入", amount: amount, category: BIZ_WITHDRAW_CAT_, note: "從生意帳戶提領" + (note ? "・" + note : ""), account: p.toAccount });
    waLogFlow_(ss, "提領", String(p.account).trim(), "提領到個人", amount, "轉到 " + p.toAccount);
    r2.dashboard = waGetDashboard();
    return { message: "已從生意提領 " + Math.round(amount).toLocaleString() + " 元到 " + p.toAccount, detail: "已記為個人收入（" + BIZ_WITHDRAW_CAT_ + "）", dashboard: r2.dashboard };
  }
  return { message: msg, detail: detail, dashboard: p._noDash ? null : waGetDashboard() };
}

// ---------- 修改／刪除一筆生意紀錄（打錯時用）----------
// p: { key: revenue | purchase | expense | consume, row, sig（原本的金額，用來確認沒有對錯列）, del: true＝刪除,
//      date, customer, item, qty, amount, unitPrice, vendor, category, note }
// 報表、庫存、客人儲值都是從這幾個分頁算出來的，改完自然就對；帳戶餘額是靠金流紀錄算的，所以金額有變時補一筆「更正」的金流
function waBizEditRecord(p) {
  var ss = SS_(), key = String(p && p.key || ""), row = Number(p && p.row), del = !!(p && p.del);
  if (["revenue", "purchase", "expense", "consume"].indexOf(key) < 0) throw new Error("不能修改這種紀錄");
  var msg = "", detail = "";
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var sh = bizSheet_(ss, key), ncol = Math.min(BIZ_SHEETS_[key][1].length, bizSheet_(ss, key).getMaxColumns());
    var amtCol = key === "expense" ? 2 : key === "consume" ? 4 : 5;
    var nameCol = key === "revenue" ? 3 : key === "purchase" ? 2 : 1;
    row = bizLocateRow_(ss, key, row, p.t, p.sig, p.ident, amtCol, nameCol);
    if (!(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這筆紀錄，請重新整理再試");
    var r = sh.getRange(row, 1, 1, ncol).getValues()[0];
    var oldAmt = waNum_(r[amtCol]);
    if (p.sig !== undefined && p.sig !== null && Math.abs(oldAmt - Number(p.sig)) > 0.5) throw new Error("這筆紀錄已經變動，請重新整理再試");
    var oldD = bizDate_(r[0]), newDate = r[0];
    if (!del && p.date && (!oldD || Utilities.formatDate(oldD, WA_TZ_, "yyyy-MM-dd") !== String(p.date))) {
      // 只換「哪一天」，時分秒（含毫秒）不動：同一次送出的幾項改到同一天，還是會合在一起
      newDate = new Date(bizDayStart_(p.date) + (oldD ? bizTod_(bizT_(oldD)) : 12 * 3600000));
    }
    var txt = function (v, old) { return v === undefined || v === null ? String(old || "") : String(v).trim(); };
    var num = function (v, old) { return v === undefined || v === null || v === "" ? waNum_(old) : Number(v); };
    var realAcc = function (a) { a = String(a || "").trim(); return a && a !== "（補登）" && a !== BIZ_PREPAID_PAY_ && a !== BIZ_GIFT_PAY_ ? a : ""; };
    var money = function (n) { return Math.round(n).toLocaleString(); };
    var stock = function (name) { return bizInventory_(ss).filter(function (x) { return x.name === name; })[0] || { qty: 0, avgCost: 0 }; };
    var fix = function (type, from, to, delta, memo) { if (Math.abs(delta) >= 0.005) waLogFlow_(ss, type, from, to, Math.round(delta * 100) / 100, "更正：" + memo); };

    if (key === "revenue") {
      var type = String(r[1]), via = bizPaidByPrepaid_(r), usesBal = via || type === "使用儲值", addsBal = type === "儲值" || type === "期初儲值";
      var acc = usesBal || type === "期初儲值" ? "" : realAcc(r[6]);
      var oldWho = String(r[2]).trim(), who = del ? oldWho : txt(p.customer, r[2]);
      var giftRow = String(r[6]).trim() === BIZ_GIFT_PAY_;
      var amt = del || giftRow ? 0 : num(p.amount, r[5]);
      if (!del && !giftRow && !(amt > 0)) throw new Error("請輸入金額");
      if (!del && (usesBal || addsBal) && !who) throw new Error("儲值要填客人名字");
      var balOf = function (n) { var b0 = 0; bizPrepaid_(ss).forEach(function (c) { if (c.name === n) b0 = c.balance; }); return b0; };
      if (usesBal && !del) {
        var avail = balOf(who) + (who === oldWho ? oldAmt : 0);
        if (amt > avail) throw new Error(who + " 的儲值餘額只夠扣 " + money(avail) + " 元");
      }
      if (addsBal) {
        var left = balOf(oldWho) - oldAmt + (who === oldWho ? amt : 0);
        if (left < 0) throw new Error(oldWho + " 這筆儲值已經被用掉一部分，" + (del ? "不能刪" : "不能改這麼少") + "（會變成 " + money(left) + " 元）");
      }
      var item = String(r[3] || ""), qty = r[4], cost = r[8];
      if (type === "商品銷售") {
        var oq = waNum_(r[4]), nq = del ? 0 : num(p.qty, r[4]);
        if (!del && !(nq > 0)) throw new Error("請輸入數量");
        var inv = stock(String(r[3]).trim());
        if (inv.qty + oq - nq < 0) throw new Error("「" + r[3] + "」庫存不夠（最多可以賣 " + (Math.round((inv.qty + oq) * 100) / 100) + "）");
        qty = nq; cost = Math.round(inv.avgCost * nq);
      } else if (!del && type === "療程") item = txt(p.item, r[3]);
      if (del) sh.deleteRow(row);
      else sh.getRange(row, 1, 1, 9).setValues([[newDate, type, who, item, qty, amt, r[6], txt(p.note, r[7]), cost]]);
      if (acc) fix("營收", "營收:" + type, acc, amt - oldAmt, (oldWho ? oldWho + " " : "") + type + (item ? " " + item : "") + (del ? "（刪除）" : " " + money(oldAmt) + " → " + money(amt)));
      msg = del ? "已刪除這筆" + type : "已修改這筆" + type;
      if (acc && amt !== oldAmt) detail = acc + " 的餘額" + (amt > oldAmt ? "加回 " : "扣掉 ") + money(Math.abs(amt - oldAmt)) + " 元";

    } else if (key === "purchase") {
      var status = String(r[7]).trim(), pacc = status === "已付" ? realAcc(r[6]) : "", product = String(r[2]).trim();
      var total = 0, q2 = r[3], u2 = r[4];
      if (!del) {
        if (product) {
          q2 = num(p.qty, r[3]); u2 = num(p.unitPrice, r[4]);
          if (!(q2 > 0)) throw new Error("請輸入數量");
          if (!(u2 >= 0)) throw new Error("請輸入單價");
          total = Math.round(q2 * u2 * 100) / 100;
        } else { total = num(p.amount, r[5]); if (!(total > 0)) throw new Error("請輸入金額"); }
      }
      if (product) {
        var inv2 = stock(product), after = inv2.qty - waNum_(r[3]) + (del ? 0 : q2);
        if (after < -0.0001) throw new Error("「" + product + "」已經賣掉或用掉一部分，" + (del ? "不能刪這筆進貨" : "數量不能改這麼少") + "（庫存會變成 " + (Math.round(after * 100) / 100) + "）");
      }
      var vendor = del ? String(r[1] || "") : txt(p.vendor, r[1]);
      if (del) sh.deleteRow(row);
      else sh.getRange(row, 1, 1, 10).setValues([[newDate, vendor, r[2], q2, u2, total, r[6], r[7], r[8], txt(p.note, r[9])]]);
      if (pacc) fix("進貨", pacc, "進貨:" + (String(r[1] || "").trim() || product), total - oldAmt, (product || "貨款") + (del ? "（刪除）" : " " + money(oldAmt) + " → " + money(total)));
      msg = del ? "已刪除這筆進貨" : "已修改這筆進貨";
      if (pacc && total !== oldAmt) detail = pacc + " 的餘額" + (total < oldAmt ? "加回 " : "多扣 ") + money(Math.abs(total - oldAmt)) + " 元";

    } else if (key === "expense") {
      var eacc = realAcc(r[3]), cat = del ? String(r[1]) : txt(p.category, r[1]), eamt = del ? 0 : num(p.amount, r[2]);
      if (!del && !cat) throw new Error("請選擇費用類別");
      if (!del && !(eamt > 0)) throw new Error("請輸入金額");
      if (del) sh.deleteRow(row);
      else sh.getRange(row, 1, 1, 5).setValues([[newDate, cat, eamt, r[3], txt(p.note, r[4])]]);
      if (eacc) fix("費用", eacc, "費用:" + String(r[1]), eamt - oldAmt, String(r[1]) + (del ? "（刪除）" : " " + money(oldAmt) + " → " + money(eamt)));
      msg = del ? "已刪除這筆費用" : "已修改這筆費用";
      if (eacc && eamt !== oldAmt) detail = eacc + " 的餘額" + (eamt < oldAmt ? "加回 " : "多扣 ") + money(Math.abs(eamt - oldAmt)) + " 元";

    } else {
      var cprod = String(r[1]).trim(), coq = waNum_(r[2]), cnq = del ? 0 : num(p.qty, r[2]);
      if (!del && !(cnq > 0)) throw new Error("請輸入用量");
      var cinv = stock(cprod);
      if (cinv.qty + coq - cnq < -0.0001) throw new Error("「" + cprod + "」庫存不夠（最多可以用 " + (Math.round((cinv.qty + coq) * 100) / 100) + "）");
      if (del) sh.deleteRow(row);
      else sh.getRange(row, 1, 1, 5).setValues([[newDate, r[1], cnq, txt(p.note, r[3]), Math.round(cinv.avgCost * cnq)]]);
      msg = del ? "已刪除這筆耗材領用" : "已修改這筆耗材領用";
      detail = "庫存已經跟著調整";
    }
  } finally {
    lock.releaseLock();
  }
  return { message: msg, detail: detail || "報表、庫存、客人儲值都已經跟著更新", dashboard: waGetDashboard() };
}

// 期初設定用：確保帳戶存在而且歸屬是「生意」
function waEnsureBizAccount(p) {
  var ss = SS_();
  var name = waCheckAccountName_(p && p.account);
  waEnsureAccount_(ss, name, "生意");
  return { ok: true };
}


// ==================== Gold.gs ====================
// ============================================================
// 實體黃金（金條、足金飾品、K 金飾品）
// - 金價：臺灣銀行黃金牌價「本行買進」（元／公克），也就是拿去賣大概能拿到的價格
//   每小時自動更新一次；台銀抓不到時，改用國際金價換算當備援
// - 「黃金」分頁：一件一列，填名稱、種類、重量、單位，估值自動算
// - 「黃金設定」分頁：各種類的純度、回收折價（可以自己改，建議拿去銀樓問一次實際回收價再調整）
// 第一次使用：在編輯器執行一次 setupGoldModule()
// ============================================================

var GOLD_SHEET_ = "黃金";
var GOLD_SET_SHEET_ = "黃金設定";
var GOLD_UNITS_ = { "公克": 1, "台錢": 3.75, "台兩": 37.5 };
var GOLD_DEFAULT_TYPES_ = [
  // 種類, 純度, 回收折價（估計值，可自行調整）
  ["金條／金塊 9999", 0.9999, 0],
  ["足金飾品 9999", 0.9999, 0.03],
  ["足金飾品 999", 0.999, 0.03],
  ["18K 飾品", 0.75, 0.15],
  ["14K 飾品", 0.585, 0.15]
];

function setupGoldModule() {
  var ss = SS_();
  goldSettingsSheet_(ss);
  goldSheet_(ss);
  // 每小時更新金價的排程由副本的「一鍵安裝」建立（程式庫不能幫副本建排程）
  updateGoldPrice();
  Logger.log("實體黃金功能已設定：每小時自動更新金價");
}

function goldSettingsSheet_(ss) {
  var sh = ss.getSheetByName(GOLD_SET_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(GOLD_SET_SHEET_);
    sh.getRange("A1:B3").setValues([
      ["台銀本行買進（元／公克）", ""],
      ["更新時間", ""],
      ["價格來源", ""]
    ]);
    sh.getRange("A5:C5").setValues([["種類", "純度", "回收折價"]]);
    sh.getRange(6, 1, GOLD_DEFAULT_TYPES_.length, 3).setValues(GOLD_DEFAULT_TYPES_);
    sh.getRange(6, 2, 20, 1).setNumberFormat("0.00%");
    sh.getRange(6, 3, 20, 1).setNumberFormat("0%");
    sh.getRange("A5:C5").setFontWeight("bold");
    sh.getRange("E5").setValue("說明：純度＝含金比例；回收折價＝銀樓回收時扣掉的比例（估計值）。想新增種類就在下面加一列。");
  }
  return sh;
}

function goldSheet_(ss) {
  var sh = ss.getSheetByName(GOLD_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(GOLD_SHEET_);
    sh.getRange(1, 1, 1, 9).setValues([["名稱", "種類", "重量", "單位", "購入成本（選填）", "購入日期（選填）", "備註", "純金重量（公克）", "估值（台銀回收）"]]);
    sh.setFrozenRows(1);
    sh.getRange("A1:I1").setFontWeight("bold");
  }
  return sh;
}

// 金價（元／公克，估計的台銀回收價）。依序嘗試：
// 1. 國際金價 API（gold-api.com，美元/盎司）× 美元匯率 ÷ 31.1035，再乘 0.992
//    （0.992 是用 2026/09/29 台銀本行買進 4,221 反推的回收價差，約 0.8%）
// 2. 台銀網頁（目前有防機器人驗證，通常讀不到；如果之後開放就會自動用）
// 3. 手動金價（黃金設定 E1）
// 全部失敗時保留上一次的金價，錯誤原因寫在 B4
var GOLD_BANK_FACTOR_ = 0.992;

function goldUsdTwd_(set, errors) {
  try {
    var fx = JSON.parse(UrlFetchApp.fetch("https://open.er-api.com/v6/latest/USD", { muteHttpExceptions: true }).getContentText());
    if (fx && fx.rates && fx.rates.TWD > 20) return fx.rates.TWD;
  } catch (e) { errors.push("匯率 API 失敗"); }
  var tmp = set.getRange("H1");
  tmp.setFormula('=IFERROR(GOOGLEFINANCE("CURRENCY:USDTWD"),"")');
  SpreadsheetApp.flush();
  var v = Number(tmp.getValue()) || 0;
  tmp.clearContent();
  if (!(v > 20)) errors.push("匯率讀不到");
  return v;
}

function updateGoldPrice() {
  var ss = SS_();
  var set = goldSettingsSheet_(ss);
  var price = 0, source = "", quoted = "", errors = [];

  // 1. 國際金價
  try {
    var g = JSON.parse(UrlFetchApp.fetch("https://api.gold-api.com/price/XAU", { muteHttpExceptions: true }).getContentText());
    var usd = Number(g && g.price) || 0;
    if (usd > 500) {
      var twd = goldUsdTwd_(set, errors);
      if (twd > 0) {
        price = usd * twd / 31.1034768 * GOLD_BANK_FACTOR_;
        source = "國際金價換算（估計台銀回收價）";
        quoted = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm");
      }
    } else errors.push("國際金價 API 沒有回傳價格");
  } catch (e) { errors.push("國際金價 API 失敗：" + e.message); }

  // 2. 台銀網頁
  if (!(price > 0)) {
    try {
      var res = UrlFetchApp.fetch("https://rate.bot.com.tw/gold?Lang=zh-TW", { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0" } });
      var text = res.getContentText("UTF-8").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
      var m = text.match(/本行買進[^0-9]{0,60}([\d,]{4,7}(?:\.\d+)?)/);
      var v = m ? Number(m[1].replace(/,/g, "")) : 0;
      if (v >= 500 && v <= 50000) {
        price = v; source = "臺灣銀行黃金牌價（本行買進）";
        var t = text.match(/掛牌時間[：:]\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
        if (t) quoted = t[1];
      } else errors.push("台銀網頁有防機器人驗證，讀不到");
    } catch (e2) { errors.push("台銀連線失敗"); }
  }

  // 3. 手動
  if (!(price > 0)) {
    var manual = Number(set.getRange("E1").getValue()) || 0;
    if (manual > 0) { price = manual; source = "手動金價（黃金設定 E1）"; }
  }

  set.getRange("A4").setValue("最近一次錯誤");
  if (!String(set.getRange("D1").getValue())) set.getRange("D1").setValue("手動金價（每公克，自動抓不到時才用）");
  if (price > 0) {
    set.getRange("B1").setValue(Math.round(price * 100) / 100);
    if (typeof histGold_ === "function") histGold_(ss, Math.round(price * 100) / 100);
    set.getRange("B2").setValue(quoted || Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm"));
    set.getRange("B3").setValue(source);
    set.getRange("B4").setValue(errors.length ? errors.join("；") : "");
  } else {
    set.getRange("B4").setValue(Utilities.formatDate(new Date(), "Asia/Taipei", "MM/dd HH:mm") + " " + errors.join("；"));
  }
  Logger.log("金價：" + price + "｜" + source + "｜" + errors.join("；"));
  return price;
}

// 檢查用：在編輯器執行，看台銀網頁回傳什麼
function debugGoldFetch() {
  try {
    var res = UrlFetchApp.fetch("https://rate.bot.com.tw/gold?Lang=zh-TW", { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0" } });
    var txt = res.getContentText("UTF-8");
    Logger.log("回應碼：" + res.getResponseCode() + "，長度：" + txt.length);
    var i = txt.indexOf("本行買進");
    Logger.log(i >= 0 ? "找到「本行買進」附近：" + txt.slice(Math.max(0, i - 200), i + 400) : "網頁裡沒有「本行買進」。開頭：" + txt.slice(0, 500));
  } catch (e) {
    Logger.log("連線失敗：" + e);
  }
  Logger.log("更新結果：" + updateGoldPrice());
}

function goldTypes_(ss) {
  var set = goldSettingsSheet_(ss);
  var last = set.getLastRow();
  if (last < 6) return [];
  return set.getRange(6, 1, last - 5, 3).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return { name: String(r[0]).trim(), purity: waNum_(r[1]), deduct: waNum_(r[2]) }; });
}

// 給 App 的黃金資料；沒有「黃金」分頁時回傳 null（畫面就不顯示黃金區塊）
function waGoldData_(ss) {
  var sh = ss.getSheetByName(GOLD_SHEET_);
  if (!sh) return null;
  var set = goldSettingsSheet_(ss);
  var price = waNum_(set.getRange("B1").getValue());
  var types = goldTypes_(ss);
  var byName = {};
  types.forEach(function (t) { byName[t.name] = t; });

  var items = [];
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach(function (r, i) {
      if (!String(r[0]).trim() && !waNum_(r[2])) return;
      var t = byName[String(r[1]).trim()] || { purity: 0, deduct: 0 };
      var grams = waNum_(r[2]) * (GOLD_UNITS_[String(r[3]).trim()] || 1);
      var pure = grams * t.purity;
      items.push({
        row: i + 2, name: String(r[0]), type: String(r[1]), weight: waNum_(r[2]), unit: String(r[3] || "公克"),
        grams: grams, pure: pure, value: pure * price * (1 - t.deduct),
        cost: r[4] === "" ? null : waNum_(r[4]), note: String(r[6] || "")
      });
    });
  }
  var total = 0, pureTotal = 0, cost = 0;
  items.forEach(function (x) { total += x.value; pureTotal += x.pure; if (x.cost !== null) cost += x.cost; });
  return {
    price: price, updated: String(set.getRange("B2").getDisplayValue()), source: String(set.getRange("B3").getValue()),
    types: types, units: Object.keys(GOLD_UNITS_), items: items,
    total: total, pureGrams: pureTotal, cost: cost
  };
}

// 在「黃金」分頁寫一列，並填上試算表裡也看得到的公式
function goldWriteRow_(sh, row, p) {
  sh.getRange(row, 1, 1, 7).setValues([[p.name, p.type, p.weight, p.unit, p.cost === "" ? "" : Number(p.cost), p.date || "", p.note || ""]]);
  var unitF = 'IFS(D' + row + '="台兩",37.5,D' + row + '="台錢",3.75,TRUE,1)';
  var purity = "IFERROR(VLOOKUP(B" + row + ",'" + GOLD_SET_SHEET_ + "'!$A$6:$C$50,2,FALSE),0)";
  var deduct = "IFERROR(VLOOKUP(B" + row + ",'" + GOLD_SET_SHEET_ + "'!$A$6:$C$50,3,FALSE),0)";
  sh.getRange(row, 8).setFormula("=C" + row + "*" + unitF + "*" + purity);
  sh.getRange(row, 9).setFormula("=H" + row + "*'" + GOLD_SET_SHEET_ + "'!$B$1*(1-" + deduct + ")");
}

function waGoldValidate_(ss, p) {
  var name = String(p.name || "").trim();
  if (!name) throw new Error("請輸入名稱，例如「一兩金條」或「媽媽的金手鍊」");
  var types = goldTypes_(ss).map(function (t) { return t.name; });
  if (types.indexOf(p.type) === -1) throw new Error("請選擇黃金種類");
  if (!GOLD_UNITS_[p.unit]) throw new Error("請選擇單位");
  var w = Number(p.weight);
  if (!(w > 0)) throw new Error("請輸入重量");
  if (p.cost !== "" && p.cost !== null && p.cost !== undefined && !(Number(p.cost) >= 0)) throw new Error("購入成本格式不正確");
  return { name: name, type: p.type, unit: p.unit, weight: w, cost: (p.cost === null || p.cost === undefined) ? "" : p.cost, note: String(p.note || ""), date: p.date || "" };
}

function waAddGold(p) {
  var ss = SS_();
  var v = waGoldValidate_(ss, p);
  var sh = goldSheet_(ss);
  if (!(waNum_(goldSettingsSheet_(ss).getRange("B1").getValue()) > 0)) updateGoldPrice();
  goldWriteRow_(sh, sh.getLastRow() + 1, v);
  return { message: "已新增 " + v.name, detail: v.weight + " " + v.unit + "・" + v.type, dashboard: waGetDashboard() };
}

function waUpdateGold(p) {
  var ss = SS_();
  var sh = goldSheet_(ss);
  var row = Number(p.row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這一筆黃金");
  var v = waGoldValidate_(ss, p);
  goldWriteRow_(sh, row, v);
  return { message: "已更新 " + v.name, detail: v.weight + " " + v.unit, dashboard: waGetDashboard() };
}

function waDeleteGold(p) {
  var sh = goldSheet_(SS_());
  var row = Number(p.row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這一筆黃金");
  var name = sh.getRange(row, 1).getValue();
  sh.deleteRow(row);
  return { message: "已刪除 " + name, detail: "", dashboard: waGetDashboard() };
}

function waRefreshGoldPrice() {
  var price = updateGoldPrice();
  if (!(price > 0)) {
    var err = String(goldSettingsSheet_(SS_()).getRange("B4").getValue());
    throw new Error("金價抓不到：" + err + "。可以先在「黃金設定」E1 手動填每公克金價");
  }
  return { message: "金價已更新：每公克 " + price.toLocaleString() + " 元", detail: "", dashboard: waGetDashboard() };
}


// ==================== Fx.gs ====================
// ============================================================
// 外幣（跟現有的銀行帳戶聯動）
// 每一筆外幣都掛在「帳戶」分頁裡的某個銀行底下，例如：永豐大戶 → 美金、日圓
// - 「外幣帳戶」分頁：A 銀行帳戶（跟「帳戶」分頁同名）｜B 幣別｜C 外幣餘額｜D 台幣成本｜E 手動匯率（選填）｜F 備註｜G 更新時間
// - 「外幣流水」分頁：每一筆期初、換匯、利息、支出的紀錄
// - 換匯時從台幣帳戶扣款（預設同一家銀行），記在「帳戶流水」，所以帳戶餘額對得上
// - 匯率每小時自動更新（國際參考匯率，約等於銀行牌告中間價）；抓不到的幣別可以填手動匯率
// 第一次使用：在 Apps Script 選 setupFxModule 執行一次
// ============================================================

var FX_SHEET_ = "外幣帳戶";
var FX_LOG_SHEET_ = "外幣流水";
var FX_PROP_ = "FX_RATES";
var FX_HEADER_ = ["銀行帳戶（跟「帳戶」分頁同名）", "幣別", "外幣餘額", "台幣成本", "手動匯率（選填，1外幣=?台幣）", "備註", "更新時間", "算在誰（留空＝跟銀行；個人＝放在生意銀行的個人專款）"];

var FX_ALIASES_ = [
  ["美金", "USD"], ["美元", "USD"], ["日圓", "JPY"], ["日幣", "JPY"], ["日元", "JPY"],
  ["人民幣", "CNY"], ["歐元", "EUR"], ["港幣", "HKD"], ["港元", "HKD"], ["澳幣", "AUD"], ["澳元", "AUD"],
  ["英鎊", "GBP"], ["紐幣", "NZD"], ["紐元", "NZD"], ["加幣", "CAD"], ["加元", "CAD"], ["新加坡幣", "SGD"], ["新幣", "SGD"],
  ["瑞士法郎", "CHF"], ["瑞郎", "CHF"], ["泰銖", "THB"], ["韓元", "KRW"], ["韓幣", "KRW"], ["南非幣", "ZAR"],
  ["瑞典幣", "SEK"], ["越南盾", "VND"], ["馬幣", "MYR"], ["菲律賓比索", "PHP"], ["印尼盾", "IDR"]
];
var FX_NAMES_ = { USD: "美金", JPY: "日圓", CNY: "人民幣", EUR: "歐元", HKD: "港幣", AUD: "澳幣", GBP: "英鎊", NZD: "紐幣",
  CAD: "加幣", SGD: "新加坡幣", CHF: "瑞士法郎", THB: "泰銖", KRW: "韓元", ZAR: "南非幣", SEK: "瑞典克朗", VND: "越南盾",
  MYR: "馬幣", PHP: "菲律賓比索", IDR: "印尼盾", MOP: "澳門幣", INR: "印度盧比", PKR: "巴基斯坦盧比", BDT: "孟加拉塔卡",
  LKR: "斯里蘭卡盧比", NPR: "尼泊爾盧比", MMK: "緬甸元", KHR: "柬埔寨瑞爾", LAK: "寮國基普", MNT: "蒙古圖格里克", BND: "汶萊元",
  FJD: "斐濟元", NOK: "挪威克朗", DKK: "丹麥克朗", ISK: "冰島克朗", PLN: "波蘭茲羅提", CZK: "捷克克朗", HUF: "匈牙利福林",
  RON: "羅馬尼亞列伊", BGN: "保加利亞列弗", TRY: "土耳其里拉", RUB: "俄羅斯盧布", UAH: "烏克蘭格里夫納", MXN: "墨西哥披索",
  BRL: "巴西雷亞爾", ARS: "阿根廷披索", CLP: "智利披索", COP: "哥倫比亞披索", PEN: "秘魯索爾", EGP: "埃及鎊", MAD: "摩洛哥迪拉姆",
  NGN: "奈及利亞奈拉", KES: "肯亞先令", AED: "阿聯迪拉姆", SAR: "沙烏地里亞爾", QAR: "卡達里亞爾", KWD: "科威特第納爾",
  BHD: "巴林第納爾", OMR: "阿曼里亞爾", ILS: "以色列謝克爾", JOD: "約旦第納爾", KZT: "哈薩克堅戈", UZS: "烏茲別克索姆",
  GEL: "喬治亞拉里", MVR: "馬爾地夫拉菲亞", XPF: "太平洋法郎", PGK: "巴布亞紐幾內亞基那", TND: "突尼西亞第納爾" };

function fxCode_(s) {
  var t = String(s || "").trim();
  var up = t.toUpperCase();
  if (/^[A-Z]{3}$/.test(up)) return up;
  for (var i = 0; i < FX_ALIASES_.length; i++) if (t.indexOf(FX_ALIASES_[i][0]) >= 0) return FX_ALIASES_[i][1];
  for (var k in FX_NAMES_) if (t.indexOf(FX_NAMES_[k]) >= 0) return k;
  return t;
}

function setupFxModule() {
  var ss = SS_();
  fxSheet_(ss, true);
  fxLogSheet_(ss);
  // 每小時更新匯率的排程由副本的「一鍵安裝」建立
  updateFxRates();
  Logger.log("外幣已建立，匯率每小時自動更新");
}

function fxSheet_(ss, create) {
  var sh = ss.getSheetByName(FX_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(FX_SHEET_);
    sh.getRange(1, 1, 1, FX_HEADER_.length).setValues([FX_HEADER_]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  if (sh && String(sh.getRange(1, 6).getValue()).indexOf("歸屬") >= 0) { // 舊版格式（有「歸屬」欄）→ 轉成新版
    var n = sh.getLastRow();
    if (n >= 2) {
      var old = sh.getRange(2, 1, n - 1, 8).getValues();
      sh.getRange(2, 1, n - 1, 8).setValues(old.map(function (r) { return [r[0], r[1], r[2], r[3], r[4], r[6], r[7], ""]; }));
    }
    sh.getRange(1, 1, 1, 8).setValues([FX_HEADER_]);
  }
  if (sh && !String(sh.getRange(1, 8).getValue()).trim()) sh.getRange(1, 8).setValue(FX_HEADER_[7]);
  return sh;
}
function fxLogSheet_(ss) {
  var sh = ss.getSheetByName(FX_LOG_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(FX_LOG_SHEET_);
    sh.getRange(1, 1, 1, 7).setValues([["日期", "銀行帳戶", "幣別", "類型", "外幣金額", "台幣金額", "說明"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
function fxLog_(ss, bank, code, type, fx, twd, note) {
  fxLogSheet_(ss).appendRow([new Date(), bank, code, type, Math.round(fx * 10000) / 10000, twd === "" ? "" : Math.round(twd), note || ""]);
}
function fxLabel_(code) { return FX_NAMES_[code] || code; }
function fxFlowName_(x) { return "外幣:" + x.bank + " " + fxLabel_(x.code); }

// ---------- 匯率 ----------
// 回傳 { rates: {USD: 32.1, ...}（1 外幣 = 幾台幣）, ts, time, error }
function fxFetch_() {
  var res = UrlFetchApp.fetch("https://open.er-api.com/v6/latest/TWD", { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error("匯率網站回應 " + res.getResponseCode());
  var j = JSON.parse(res.getContentText());
  if (j.result !== "success" || !j.rates) throw new Error("匯率資料格式不正確");
  var rates = {};
  Object.keys(j.rates).forEach(function (k) {
    var v = Number(j.rates[k]);
    if (v > 0 && k !== "TWD") rates[k] = Number((1 / v).toPrecision(6));
  });
  return { ts: Date.now(), rates: rates, time: Utilities.formatDate(new Date(), WA_TZ_, "MM/dd HH:mm"), error: "" };
}
function updateFxRates() {
  var props = PROPS_();
  try {
    props.setProperty(FX_PROP_, JSON.stringify(fxFetch_()));
    try { waAltFxRefresh_(SS_()); } catch (ae) { Logger.log("外幣保單換算失敗：" + ae); }
  } catch (e) {
    var old = fxReadProp_();
    old.error = String(e.message || e);
    props.setProperty(FX_PROP_, JSON.stringify(old));
    Logger.log("匯率更新失敗：" + e);
  }
}
function fxReadProp_() {
  try { return JSON.parse(PROPS_().getProperty(FX_PROP_) || "null") || { ts: 0, rates: {}, time: "", error: "" }; }
  catch (e) { return { ts: 0, rates: {}, time: "", error: "" }; }
}
function fxRates_() {
  var obj = fxReadProp_();
  if (Date.now() - obj.ts > 6 * 3600 * 1000) { // 自動更新停掉時的備援
    updateFxRates();
    obj = fxReadProp_();
  }
  return obj;
}

// ---------- 讀取 ----------
function fxRows_(ss) {
  var sh = fxSheet_(ss);
  if (!sh || sh.getLastRow() < 2) return [];
  var out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().forEach(function (r, i) {
    if (!String(r[0]).trim() || !String(r[1]).trim()) return;
    out.push({ row: i + 2, bank: String(r[0]).trim(), code: fxCode_(r[1]), balance: waNum_(r[2]), cost: waNum_(r[3]),
      manual: waNum_(r[4]), note: String(r[5] || ""), owner: String(r[7] || "").trim() === "個人" ? "個人" : "" });
  });
  return out;
}
function fxFind_(ss, row) {
  var x = fxRows_(ss).filter(function (a) { return a.row === Number(row); })[0];
  if (!x) throw new Error("找不到這筆外幣");
  return x;
}

function waFxData_(ss) {
  var sh = fxSheet_(ss);
  if (!sh) return null;
  var fx = fxRates_();
  var scopeOf = {}, roleOf = {};
  waAccountList_(ss).forEach(function (a) { scopeOf[a.name] = a.scope; roleOf[a.name] = a.role; });
  var total = 0, cost = 0, bizTotal = 0, bizCost = 0, missing = [];
  var items = fxRows_(ss).map(function (x) {
    var rate = x.manual > 0 ? x.manual : (fx.rates[x.code] || 0);
    if (!(rate > 0) && x.balance) missing.push(x.bank + " " + fxLabel_(x.code));
    var value = Math.round(x.balance * rate);
    // 生意銀行底下的外幣另外算，不混進個人的外幣合計（個人總資產、淨資產、退休進度只看個人的）
    // 放在生意銀行、但標成「個人」的專款（例如專門繳保費的外幣）算個人的
    var bankScope = scopeOf[x.bank] || "個人";
    var sc = x.owner === "個人" || bankScope !== "生意" ? "個人" : "生意";
    if (sc === "生意") { bizTotal += value; bizCost += x.cost; } else { total += value; cost += x.cost; }
    return { row: x.row, bank: x.bank, code: x.code, cname: fxLabel_(x.code), balance: x.balance, cost: x.cost,
      rate: rate, manual: x.manual > 0, value: value, pl: value - x.cost, scope: sc, bankScope: bankScope, earmark: sc === "個人" && bankScope === "生意", note: x.note };
  });
  // 從台幣帳戶換進外幣的淨額（帳戶對帳用）
  var net = { "個人": 0, "生意": 0 }, byRole = {};
  var fxBank = {}; // "外幣:銀行 幣別" → 銀行
  fxRows_(ss).forEach(function (x) { fxBank[fxFlowName_(x)] = x.bank; });
  var add = function (acc, amt) { var sc = scopeOf[acc], ro = roleOf[acc]; if (!sc) return; net[sc] = (net[sc] || 0) + amt; byRole[ro] = (byRole[ro] || 0) + amt; };
  waFlowRows_(ss).forEach(function (r) {
    var from = String(r[2]).trim(), to = String(r[3]).trim(), amt = waNum_(r[4]);
    if (from.indexOf("外幣:") === 0 && to.indexOf("外幣:") === 0) { if (fxBank[from]) add(fxBank[from], -amt); if (fxBank[to]) add(fxBank[to], amt); } // 外幣換外幣
    else if (to.indexOf("外幣:") === 0 && scopeOf[from]) add(from, amt);
    else if (from.indexOf("外幣:") === 0 && scopeOf[to]) add(to, -amt);
    else if (from.indexOf("外幣:") === 0 && fxBank[from]) add(fxBank[from], -amt); // 用外幣付的支出
    else if (to.indexOf("外幣:") === 0 && fxBank[to]) add(fxBank[to], amt);       // 收進外幣的收入
  });
  var rates = {};
  Object.keys(FX_NAMES_).forEach(function (k) { if (fx.rates[k]) rates[k] = fx.rates[k]; });
  items.forEach(function (x) { if (x.rate) rates[x.code] = x.rate; });
  return { items: items, total: total, cost: cost, pl: total - cost, bizTotal: bizTotal, bizCost: bizCost, updated: fx.time || "", error: fx.error || "", rates: rates,
    missing: missing, twdNet: net, twdNetByRole: byRole, known: Object.keys(FX_NAMES_).map(function (k) { return FX_NAMES_[k] + " " + k; }) };
}

// ---------- 寫入 ----------
function fxAmt_(v, label) {
  var n = Number(v);
  if (!(n > 0)) throw new Error("請輸入" + label);
  return n;
}
function fxRateOf_(x) {
  if (x.manual > 0) return x.manual;
  return fxRates_().rates[x.code] || 0;
}

// p.kind：open 期初｜buy 台幣換外幣｜sell 外幣換回台幣｜income 利息｜spend 外幣支出｜edit 修改｜delete 刪除
function waFxRecord(p) {
  var ss = SS_();
  var sh = fxSheet_(ss, true);
  var kind = String(p.kind || "");
  var note = String(p.note || "").trim();
  var now = new Date();
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    if (kind === "open") {
      var bank = waCheckAccountName_(p.bank);
      var code = fxCode_(p.currency);
      if (!code) throw new Error("請輸入幣別，例如 美金 或 USD");
      if (fxRows_(ss).some(function (a) { return a.bank === bank && a.code === code; })) throw new Error(bank + " 已經有 " + fxLabel_(code) + " 了，點它就能換匯或校正");
      waEnsureAccount_(ss, bank, p.scope);
      var bal = Number(p.amount) || 0;
      if (bal < 0) throw new Error("餘額不能是負的");
      var manual = Number(p.manual) || 0;
      var rate = manual > 0 ? manual : (fxRates_().rates[code] || 0);
      if (bal > 0 && !(rate > 0)) throw new Error("抓不到「" + code + "」的匯率，請填手動匯率（1 外幣 = 幾台幣）");
      var costRaw = String(p.cost == null ? "" : p.cost).trim();
      var cost = costRaw === "" ? Math.round(bal * rate) : Number(costRaw);
      if (!(cost >= 0)) throw new Error("台幣成本格式不正確");
      sh.appendRow([bank, code, bal, cost, manual > 0 ? manual : "", note, now, p.owner === "個人" ? "個人" : ""]);
      if (bal > 0) fxLog_(ss, bank, code, "期初", bal, cost, note || "期初設定");
      return { message: bank + " 新增 " + fxLabel_(code), detail: fxLabel_(code) + " " + bal.toLocaleString() + "・台幣成本 " + Math.round(cost).toLocaleString() + " 元（期初，不扣台幣）", dashboard: waGetDashboard() };
    }

    var x = fxFind_(ss, p.row);
    var label = fxLabel_(x.code);
    var twdAcc = function () { // 台幣那一邊：沒選就用同一家銀行
      var acc = waCheckAccountName_(p.account || x.bank);
      waEnsureAccount_(ss, acc);
      return acc;
    };

    if (kind === "buy") {
      var fxIn = fxAmt_(p.fx, "換到的外幣金額");
      var twdOut = fxAmt_(p.twd, "付出的台幣金額");
      var from = twdAcc();
      sh.getRange(x.row, 3, 1, 2).setValues([[x.balance + fxIn, x.cost + twdOut]]);
      sh.getRange(x.row, 7).setValue(now);
      fxLog_(ss, x.bank, x.code, "台幣換外幣", fxIn, twdOut, note);
      waLogFlow_(ss, "換匯", from, fxFlowName_(x), twdOut, label + " " + fxIn.toLocaleString() + (note ? "・" + note : ""));
      return { message: x.bank + " 換入 " + label + " " + fxIn.toLocaleString(),
        detail: "台幣從 " + from + " 扣 " + Math.round(twdOut).toLocaleString() + " 元（匯率 " + (twdOut / fxIn).toFixed(4) + "）", dashboard: waGetDashboard() };
    }

    if (kind === "sell") {
      var fxOut = fxAmt_(p.fx, "換出的外幣金額");
      if (fxOut > x.balance + 1e-9) throw new Error("餘額只有 " + x.balance.toLocaleString());
      var twdIn = fxAmt_(p.twd, "拿回的台幣金額");
      var to = twdAcc();
      var costOut = x.balance > 0 ? x.cost * fxOut / x.balance : 0;
      sh.getRange(x.row, 3, 1, 2).setValues([[x.balance - fxOut, Math.max(0, Math.round(x.cost - costOut))]]);
      sh.getRange(x.row, 7).setValue(now);
      fxLog_(ss, x.bank, x.code, "換回台幣", -fxOut, twdIn, note);
      waLogFlow_(ss, "換匯", fxFlowName_(x), to, twdIn, label + " " + fxOut.toLocaleString() + (note ? "・" + note : ""));
      var gain = twdIn - costOut;
      return { message: label + " " + fxOut.toLocaleString() + " 換回台幣", detail: "存進 " + to + " " + Math.round(twdIn).toLocaleString() + " 元（" +
        (gain >= 0 ? "匯差賺 " : "匯差賠 ") + Math.abs(Math.round(gain)).toLocaleString() + " 元）", dashboard: waGetDashboard() };
    }

    if (kind === "income") {
      var inc = fxAmt_(p.fx, "金額");
      sh.getRange(x.row, 3).setValue(x.balance + inc);
      sh.getRange(x.row, 7).setValue(now);
      fxLog_(ss, x.bank, x.code, "利息", inc, 0, note);
      return { message: x.bank + " " + label + " 利息 " + inc.toLocaleString(), detail: "利息算收益，台幣成本不變", dashboard: waGetDashboard() };
    }

    if (kind === "spend") {
      var sp = fxAmt_(p.fx, "金額");
      if (sp > x.balance + 1e-9) throw new Error("餘額只有 " + x.balance.toLocaleString());
      var cOut = x.balance > 0 ? x.cost * sp / x.balance : 0;
      sh.getRange(x.row, 3, 1, 2).setValues([[x.balance - sp, Math.max(0, Math.round(x.cost - cOut))]]);
      sh.getRange(x.row, 7).setValue(now);
      fxLog_(ss, x.bank, x.code, "外幣支出", -sp, -Math.round(cOut), note);
      return { message: x.bank + " " + label + " 支出 " + sp.toLocaleString(), detail: "約台幣 " + Math.round(sp * fxRateOf_(x)).toLocaleString() + " 元", dashboard: waGetDashboard() };
    }

    if (kind === "edit") {
      var nb = Number(p.balance), nc = Number(p.cost), nm = String(p.manual == null ? "" : p.manual).trim();
      if (!(nb >= 0)) throw new Error("餘額格式不正確");
      if (!(nc >= 0)) throw new Error("台幣成本格式不正確");
      if (nm !== "" && !(Number(nm) > 0)) throw new Error("手動匯率要大於 0，不用的話留空");
      var newBank = p.bank ? waCheckAccountName_(p.bank) : x.bank;
      if (newBank !== x.bank) {
        if (fxRows_(ss).some(function (a) { return a.bank === newBank && a.code === x.code; })) throw new Error(newBank + " 已經有 " + label + " 了");
        waEnsureAccount_(ss, newBank);
      }
      sh.getRange(x.row, 1, 1, 7).setValues([[newBank, x.code, nb, nc, nm === "" ? "" : Number(nm), note, now]]);
      if (p.owner !== undefined && p.owner !== null) sh.getRange(x.row, 8).setValue(p.owner === "個人" ? "個人" : "");
      if (nb !== x.balance) fxLog_(ss, newBank, x.code, "校正", nb - x.balance, "", "校正餘額");
      return { message: "已更新 " + newBank + " " + label, detail: "", dashboard: waGetDashboard() };
    }

    if (kind === "delete") {
      sh.deleteRow(x.row);
      return { message: "已刪除 " + x.bank + " " + label, detail: "（登記錯誤用，不會把錢加回台幣）", dashboard: waGetDashboard() };
    }
  } finally {
    lock.releaseLock();
  }
  throw new Error("不支援的動作");
}

// ---------- 記帳用外幣 ----------
// 支出：從「這個帳戶的這個幣別」扣；收入：存進去（沒有就自動開一個，例如「外幣現金」）
// 預算（投資現金、生活帳戶）用即時匯率換成台幣算；帳戶流水記「外幣:銀行 幣別」，對帳才對得上
function fxLedgerPrep_(ss, type, code, bank, fxAmt) {
  code = fxCode_(code);
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("幣別請用代碼，例如 USD");
  var x = fxRows_(ss).filter(function (a) { return a.bank === bank && a.code === code; })[0] || null;
  if (type === "支出") {
    if (!x) throw new Error(bank + " 沒有" + fxLabel_(code) + "，請選有這個幣別的帳戶");
    if (fxAmt > x.balance + 1e-9) throw new Error(bank + " " + fxLabel_(code) + " 餘額只有 " + x.balance.toLocaleString());
  }
  var rate = x ? fxRateOf_(x) : (fxRates_().rates[code] || 0);
  if (!(rate > 0)) throw new Error("抓不到「" + code + "」的匯率，請到外幣那筆填手動匯率");
  var twd = Math.max(1, Math.round(fxAmt * rate));
  return { code: code, bank: bank, x: x, fx: fxAmt, rate: rate, twd: twd, tag: "〔" + code + " " + fxAmt + "〕" };
}
function fxLedgerApply_(ss, f, type, category, note) {
  var sh = fxSheet_(ss, true);
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var x = fxRows_(ss).filter(function (a) { return a.bank === f.bank && a.code === f.code; })[0] || null;
    if (!x) {
      waEnsureAccount_(ss, f.bank);
      sh.appendRow([f.bank, f.code, 0, 0, "", "", new Date()]);
      x = fxRows_(ss).filter(function (a) { return a.bank === f.bank && a.code === f.code; })[0];
    }
    var costD;
    if (type === "支出") {
      costD = x.balance > 0 ? Math.round(x.cost * f.fx / x.balance) : 0;
      sh.getRange(x.row, 3, 1, 2).setValues([[x.balance - f.fx, Math.max(0, x.cost - costD)]]);
      fxLog_(ss, x.bank, x.code, "記帳支出", -f.fx, -costD, category + (note ? "・" + note : ""));
      waLogFlow_(ss, "支出", fxFlowName_(x), "支出:" + category, f.twd, note + "｜成本 " + costD);
    } else {
      costD = f.twd;
      sh.getRange(x.row, 3, 1, 2).setValues([[x.balance + f.fx, x.cost + costD]]);
      fxLog_(ss, x.bank, x.code, "記帳收入", f.fx, costD, category + (note ? "・" + note : ""));
      waLogFlow_(ss, "收入", "收入:" + category, fxFlowName_(x), f.twd, note + "｜成本 " + costD);
    }
    sh.getRange(x.row, 7).setValue(new Date());
  } finally {
    lock.releaseLock();
  }
}
// 撤銷外幣記帳：把外幣餘額和台幣成本加回去（呼叫的地方已經拿著鎖）
function fxLedgerUndo_(ss, flow) {
  var from = String(flow[2]), to = String(flow[3]), note = String(flow[5] || "");
  var name = from.indexOf("外幣:") === 0 ? from : to.indexOf("外幣:") === 0 ? to : "";
  if (!name) return false;
  var m = note.match(/〔([A-Z]{3}) ([\d.]+)〕/), c = note.match(/｜成本 (-?[\d.]+)/);
  if (!m) return false;
  var fx = Number(m[2]), cost = c ? Number(c[1]) : 0;
  var x = fxRows_(ss).filter(function (a) { return fxFlowName_(a) === name; })[0];
  if (!x) return false;
  var spend = from === name;
  var nb = spend ? x.balance + fx : x.balance - fx;
  var nc = spend ? x.cost + cost : Math.max(0, x.cost - cost);
  fxSheet_(ss).getRange(x.row, 3, 1, 2).setValues([[nb, nc]]);
  fxLog_(ss, x.bank, x.code, "撤銷記帳", spend ? fx : -fx, spend ? cost : -cost, "撤銷");
  return true;
}

// ---------- 換匯（記帳頁的「換匯」）----------
// 兩邊金額都自己填（實際付出多少、實際拿到多少），不用參考匯率，手續費、匯差自然就包含在裡面
// p: { fromAcc, fromCur, fromAmt, toAcc, toCur, toAmt, note }  幣別留空或 TWD＝台幣
function waFxExchange(p) {
  var ss = SS_();
  var sh = fxSheet_(ss, true);
  var fromAcc = waCheckAccountName_(p.fromAcc), toAcc = waCheckAccountName_(p.toAcc);
  var norm = function (c) { c = String(c || "").trim(); if (!c || c.toUpperCase() === "TWD" || c === "台幣") return "TWD"; c = fxCode_(c); if (!/^[A-Z]{3}$/.test(c)) throw new Error("幣別請用代碼，例如 USD"); return c; };
  var fc = norm(p.fromCur), tc = norm(p.toCur);
  var fa = Number(p.fromAmt), ta = Number(p.toAmt);
  if (!(fa > 0)) throw new Error("請輸入付出的金額");
  if (!(ta > 0)) throw new Error("請輸入換到的金額");
  if (fc === "TWD" && tc === "TWD") throw new Error("兩邊都是台幣的話，請用「轉帳」");
  if (fc === tc && fromAcc === toAcc) throw new Error("同一個帳戶、同一種幣別不用換");
  var note = String(p.note || "").trim();
  var now = new Date();
  var find = function (bank, code) { return fxRows_(ss).filter(function (a) { return a.bank === bank && a.code === code; })[0] || null; };
  var ensure = function (bank, code) {
    var x = find(bank, code);
    if (x) return x;
    waEnsureAccount_(ss, bank);
    sh.appendRow([bank, code, 0, 0, "", "", now, p.owner === "個人" ? "個人" : ""]);
    return find(bank, code);
  };
  var lock = LOCK_();
  lock.waitLock(10000);
  var msg, detail;
  try {
    waEnsureAccount_(ss, fromAcc); waEnsureAccount_(ss, toAcc);
    if (fc === "TWD") {
      // 台幣 → 外幣
      var d1 = ensure(toAcc, tc);
      sh.getRange(d1.row, 3, 1, 2).setValues([[d1.balance + ta, d1.cost + fa]]);
      sh.getRange(d1.row, 7).setValue(now);
      fxLog_(ss, toAcc, tc, "台幣換外幣", ta, fa, note);
      waLogFlow_(ss, "換匯", fromAcc, fxFlowName_(d1), fa, fxLabel_(tc) + " " + ta.toLocaleString() + (note ? "・" + note : ""));
      msg = toAcc + " 換入 " + fxLabel_(tc) + " " + ta.toLocaleString();
      detail = "台幣從 " + fromAcc + " 扣 " + Math.round(fa).toLocaleString() + " 元（實際匯率 " + (fa / ta).toPrecision(5) + "）";
    } else {
      var src = find(fromAcc, fc);
      if (!src) throw new Error(fromAcc + " 沒有" + fxLabel_(fc));
      if (fa > src.balance + 1e-9) throw new Error(fromAcc + " " + fxLabel_(fc) + " 餘額只有 " + src.balance.toLocaleString());
      var cOut = src.balance > 0 ? src.cost * fa / src.balance : 0;
      sh.getRange(src.row, 3, 1, 2).setValues([[src.balance - fa, Math.max(0, Math.round(src.cost - cOut))]]);
      sh.getRange(src.row, 7).setValue(now);
      if (tc === "TWD") {
        // 外幣 → 台幣
        fxLog_(ss, fromAcc, fc, "換回台幣", -fa, ta, note);
        waLogFlow_(ss, "換匯", fxFlowName_(src), toAcc, ta, fxLabel_(fc) + " " + fa.toLocaleString() + (note ? "・" + note : ""));
        var gain = ta - cOut;
        msg = fxLabel_(fc) + " " + fa.toLocaleString() + " 換回台幣";
        detail = "存進 " + toAcc + " " + Math.round(ta).toLocaleString() + " 元（" + (gain >= 0 ? "匯差賺 " : "匯差賠 ") + Math.abs(Math.round(gain)).toLocaleString() + " 元）";
      } else {
        // 外幣 → 外幣（或同幣別搬到另一家銀行）：台幣成本跟著搬過去
        var d2 = ensure(toAcc, tc);
        if (d2.row === src.row) d2 = find(toAcc, tc);
        sh.getRange(d2.row, 3, 1, 2).setValues([[d2.balance + ta, Math.round(d2.cost + cOut)]]);
        sh.getRange(d2.row, 7).setValue(now);
        fxLog_(ss, fromAcc, fc, "換出", -fa, -Math.round(cOut), "換成 " + fxLabel_(tc) + (note ? "・" + note : ""));
        fxLog_(ss, toAcc, tc, "換入", ta, Math.round(cOut), "從 " + fxLabel_(fc) + (note ? "・" + note : ""));
        waLogFlow_(ss, "換匯", fxFlowName_(src), fxFlowName_(d2), Math.round(cOut), fxLabel_(fc) + " " + fa.toLocaleString() + " → " + fxLabel_(tc) + " " + ta.toLocaleString());
        msg = fxLabel_(fc) + " " + fa.toLocaleString() + " → " + fxLabel_(tc) + " " + ta.toLocaleString();
        detail = fromAcc === toAcc ? fromAcc : fromAcc + " → " + toAcc;
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { message: msg, detail: detail, dashboard: waGetDashboard() };
}

// ---------- 銀行明細（點銀行進去看）----------
// 回傳這家銀行最近的台幣金流和外幣紀錄
WA_READ_ONLY_.waBankDetail = 1;
function waBankDetail(p) {
  var ss = SS_();
  var name = String(p && p.account || "").trim();
  var pre = "外幣:" + name + " ";
  var flows = [];
  waLastRows_(waFlowSheet_(ss), 6, 400).forEach(function (r) {
    if (flows.length >= 30) return;
    var from = String(r[2]).trim(), to = String(r[3]).trim();
    var fxFrom = from.indexOf(pre) === 0, fxTo = to.indexOf(pre) === 0;
    if (from !== name && to !== name && !fxFrom && !fxTo) return;
    flows.push({ date: waDate_(r[0]), type: String(r[1]), from: from, to: to, amount: waNum_(r[4]),
      note: String(r[5] || "").replace(/｜成本 -?[\d.]+/, ""), dir: to === name ? 1 : from === name ? -1 : 0 });
  });
  var fx = [];
  var lg = ss.getSheetByName(FX_LOG_SHEET_);
  if (lg) waLastRows_(lg, 7, 400).forEach(function (r) {
    if (fx.length >= 30 || String(r[1]).trim() !== name) return;
    var code = fxCode_(r[2]);
    fx.push({ date: waDate_(r[0]), code: code, cname: fxLabel_(code), type: String(r[3]), fx: waNum_(r[4]), twd: r[5] === "" ? null : waNum_(r[5]), note: String(r[6] || "") });
  });
  return { account: name, flows: flows, fx: fx };
}

function waRefreshFx() {
  updateFxRates();
  var r = fxReadProp_();
  if (r.error) throw new Error("匯率沒有更新：" + r.error);
  return { message: "匯率已更新", detail: r.time, dashboard: waGetDashboard() };
}


// ==================== Retire.gs ====================
// ============================================================
// 退休規劃 + 隨年齡變保守的配置（適合 49 歲、65 歲退休）
// - 「退休規劃」分頁：年齡、退休年齡、每月生活費、退休金、通膨、報酬率
// - 「配置規則」分頁：每種資產在「規劃起點」和「退休時」的比例，
//   中間每年自動慢慢移動（股票變少、短債變多）
// - 實體黃金算在「黃金 10%」裡；股票、債券、現金的目標比例會自動換算成
//   「不含黃金的金融資產」比例，直接給工作表1 的 F 欄用
// 第一次使用：在編輯器執行一次 setupRetirePlan()，再把工作表1 F 欄連到配置規則（見下方說明）
// ============================================================

var RETIRE_SHEET_ = "退休規劃";
var ALLOC_SHEET_ = "配置規則";

function setupRetirePlan() {
  var ss = SS_();
  var r = ss.getSheetByName(RETIRE_SHEET_);
  if (!r) {
    r = ss.insertSheet(RETIRE_SHEET_);
    r.getRange("A1:C10").setValues([
      ["出生年（西元）", "", "用來自動算年齡（在 App 的「設定 → 退休規劃」填）"],
      ["目前年齡", "", "自動計算"],
      ["規劃起點年齡", "", "開始用這套配置的年齡（配置從這裡慢慢變保守）"],
      ["預計退休年齡", 65, ""],
      ["退休後每月生活費（今天的錢）", 100000, "會自動加上通膨"],
      ["預估每月退休金（今天的錢）", 0, "勞保老年年金、國民年金等，可以到勞保局網站試算後填入"],
      ["通膨率", 0.02, ""],
      ["預期年報酬率", 0.05, "依這套配置的長期保守估計"],
      ["每年可提領率", 0.04, "4% 法則：退休後每年領資產的 4%"],
      ["每月可投入金額", 0, "每個月大概能存下來投資的錢"]
    ]);
    r.getRange("B2").setFormula("=IF(B1=\"\",\"\",YEAR(TODAY())-B1)");
    r.getRange("B7:B9").setNumberFormat("0.0%");
    r.getRange("B5:B6").setNumberFormat("#,##0");
    r.getRange("B10").setNumberFormat("#,##0");
    r.getRange("A1:A10").setFontWeight("bold");
  }

  var a = ss.getSheetByName(ALLOC_SHEET_);
  if (!a) {
    a = ss.insertSheet(ALLOC_SHEET_);
    a.getRange("A1:F1").setValues([["資產", "代號", "規劃起點", "退休時", "目前目標（含黃金）", "工作表1 F欄用（不含黃金）"]]).setFontWeight("bold");
    a.getRange("A2:D7").setValues([
      ["台灣股票", "TPE:006208", 0.25, 0.15],
      ["美國股票", "TPE:00646", 0.35, 0.25],
      ["長天期美債", "TPE:00679B", 0.10, 0.15],
      ["短天期美債", "TPE:00719B", 0.15, 0.30],
      ["實體黃金", "（黃金分頁）", 0.10, 0.10],
      ["現金", "（工作表1 第10列）", 0.05, 0.05]
    ]);
    var t = "MAX(0,MIN(1,('" + RETIRE_SHEET_ + "'!$B$2-'" + RETIRE_SHEET_ + "'!$B$3)/('" + RETIRE_SHEET_ + "'!$B$4-'" + RETIRE_SHEET_ + "'!$B$3)))";
    for (var i = 2; i <= 7; i++) {
      a.getRange(i, 5).setFormula("=C" + i + "+(D" + i + "-C" + i + ")*" + t);
      a.getRange(i, 6).setFormula(i === 6 ? '="另外計算"' : "=E" + i + "/(1-$E$6)");
    }
    a.getRange("A8").setValue("合計");
    a.getRange("C8").setFormula("=SUM(C2:C7)");
    a.getRange("D8").setFormula("=SUM(D2:D7)");
    a.getRange("E8").setFormula("=SUM(E2:E7)");
    a.getRange("F8").setFormula("=SUM(F2:F5,F7)");
    a.getRange("C2:F8").setNumberFormat("0.0%");
    a.getRange("A10").setValue("說明：C、D 欄可以自己改，但每欄合計要是 100%。工作表1 的 F2:F5 請填 ='配置規則'!F2 到 F5，F10 請填 ='配置規則'!F7。");
  }
  Logger.log("退休規劃與配置規則已建立");
}

// 給 App 的退休資料；沒有「退休規劃」分頁時回傳 null
function waRetireData_(ss, totalAssets, investTotal, goldValue, fxValue) {
  var r = ss.getSheetByName(RETIRE_SHEET_);
  if (!r) return null;
  var raw = r.getRange("B1:B12").getValues();
  var v = raw.map(function (x) { return waNum_(x[0]); });
  // B11＝「退休那年」：每月生活費填的是退休那年的錢（不再乘通膨）；空白＝今天的錢（舊的填法）
  var futureMode = String(raw[10][0]).trim() === "退休那年";
  if (!v[0]) return null; // 還沒填出生年：先不顯示退休卡片（新手設定會提醒）
  var age = v[1], retireAge = v[3], need = v[4], pension = v[5], inf = v[6], ret = v[7], wr = v[8] || 0.04, pmt = v[9];
  // 每月投入：B12 空白或「自動」＝用最近 6 個月的收支紀錄估（收入 − 支出）；「手動」＝用 B10
  var pmtAuto = String(raw[11][0]).trim() !== "手動", pmtInfo = null;
  if (pmtAuto) {
    try { pmtInfo = waRetireAutoPmt_(); } catch (pe) { pmtInfo = null; }
    pmt = pmtInfo ? Math.max(0, pmtInfo.avg) : 0;
  }
  var n = Math.max(0, retireAge - age);
  var grow = Math.pow(1 + inf, n);
  var needFuture = futureMode ? need : need * grow;
  var needToday = grow > 0 ? needFuture / grow : needFuture;
  var pensionFuture = pension * grow;
  var gap = Math.max(0, needFuture - pensionFuture);
  var required = gap * 12 / wr;

  var assets = totalAssets + goldValue + (fxValue || 0); // 外幣也算退休資產
  var fvA = assets * Math.pow(1 + ret, n);
  var fvP = ret > 0 ? pmt * 12 * (Math.pow(1 + ret, n) - 1) / ret : pmt * 12 * n;
  var projected = fvA + fvP;
  var shortfall = Math.max(0, required - fvA);
  var needPmt = n > 0 ? (ret > 0 ? shortfall * ret / (Math.pow(1 + ret, n) - 1) / 12 : shortfall / n / 12) : 0;
  var sustainable = projected * wr / 12 / grow + pension; // 換算回今天的錢，每月可花多少
  var sustainableFuture = projected * wr / 12 + pensionFuture; // 退休那年的錢

  var alloc = [];
  var a = ss.getSheetByName(ALLOC_SHEET_);
  if (a) {
    a.getRange("A2:E7").getValues().forEach(function (x) {
      alloc.push({ name: String(x[0]), code: String(x[1]), start: waNum_(x[2]), end: waNum_(x[3]), now: waNum_(x[4]) });
    });
  }
  var goldTarget = 0;
  alloc.forEach(function (x) { if (x.name.indexOf("黃金") >= 0) goldTarget = x.now; });

  return {
    pmtAuto: pmtAuto, pmtInfo: pmtInfo,
    age: age, retireAge: retireAge, years: n, need: need, needMode: futureMode ? "future" : "today", needToday: needToday, sustainableFuture: sustainableFuture, pension: pension, inflation: inf, ret: ret, wr: wr, pmt: pmt,
    needFuture: needFuture, required: required, assets: assets, projected: projected,
    progress: required > 0 ? projected / required : 0, needPmt: needPmt, sustainable: sustainable,
    alloc: alloc,
    gold: { value: goldValue, pct: assets > 0 ? goldValue / (investTotal + goldValue) : 0, target: goldTarget }
  };
}

// 自動估每月投入：最近 6 個月（紀錄比較少就從第一筆算起）平均每月「收入 − 支出」
// 收支的算法跟「收支查詢」一樣：只算個人的、信用卡照刷卡日、轉帳換匯不算
function waRetireAutoPmt_() {
  var tz = WA_TZ_, now = new Date();
  var to = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var f = new Date(now.getTime()); f.setMonth(f.getMonth() - 6);
  var from = Utilities.formatDate(f, tz, "yyyy-MM-dd");
  var q = waLedgerQuery({ from: from, to: to, type: "all" });
  if (!q.first) return { avg: 0, months: 0, income: 0, expense: 0, from: from, none: true };
  var start = q.first > from ? q.first : from;
  var days = Math.round((new Date(to + "T00:00:00") - new Date(start + "T00:00:00")) / 86400000) + 1;
  var months = Math.max(days, 1) / 30.44;
  var avg = (q.income - q.expense) / Math.max(months, 1); // 不到一個月就當一個月算，免得放大
  return { avg: Math.round(avg), months: Math.round(months * 10) / 10, days: days, income: q.income, expense: q.expense, from: start, to: to, few: days < 60 };
}


// ==================== Other.gs ====================
// ============================================================
// 其他個股（工作表1 第 6～9 列放不下的個股，之後要調整的）
// - 放在「另類資產」分頁，B 欄類別填「股票」，H 欄代號、I 欄股數
// - C 欄估值用公式自動算（股數 × 即時股價），所以會算進總資產
// - G 欄是購入成本，報酬率公式會扣掉，所以報酬率正確
// - 不參與再平衡；賣出時用 App，錢回到投資現金（D10），成本轉進淨投入本金（B16）
// ============================================================

var OTHER_STOCK_CAT_ = "股票";
var ALT_SHEET_ = "另類資產";

function otherAltSheet_(ss) {
  var sh = ss.getSheetByName(ALT_SHEET_);
  if (!sh) throw new Error("找不到「另類資產」分頁");
  if (!String(sh.getRange("H1").getValue()).trim()) sh.getRange("H1:I1").setValues([["代號", "股數"]]);
  return sh;
}

function waOtherStocks_(ss) {
  var sh = ss.getSheetByName(ALT_SHEET_);
  if (!sh || sh.getLastRow() < 2) return [];
  var out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().forEach(function (r, i) {
    if (String(r[1]).trim() !== OTHER_STOCK_CAT_ || !String(r[7]).trim()) return;
    var shares = waNum_(r[8]), value = waNum_(r[2]);
    out.push({ row: i + 2, name: String(r[0]), code: String(r[7]).trim(), shares: shares,
      value: value, price: shares > 0 ? value / shares : 0, cost: waNum_(r[6]) });
  });
  return out;
}

// 先用 GOOGLEFINANCE，抓不到（上櫃股票、債券 ETF）就改從 Yahoo 股市抓
function otherPriceFormula_(row) {
  return '=IFERROR(GOOGLEFINANCE(H' + row + ')*I' + row + ',IFERROR(VALUE(IMPORTXML("https://tw.stock.yahoo.com/quote/"&SUBSTITUTE(H' + row +
    ',"TPE:",""),"//*[@id=\'main-0-QuoteHeader-Proxy\']/div/div[2]/div[1]/div/span[1]"))*I' + row + ',0))';
}

// 新增一檔「其他個股」（登記目前已經持有的，不會扣現金）
function waAddOtherStock(p) {
  var ss = SS_();
  var sh = otherAltSheet_(ss);
  var code = normalizeStockCode_(p.code);
  if (!code) throw new Error("請輸入代號，例如 2330");
  var shares = Number(p.shares), cost = Number(p.cost);
  if (!(shares > 0) || Math.floor(shares) !== shares) throw new Error("股數要是大於 0 的整數");
  if (!(cost >= 0)) throw new Error("請輸入購入成本（總金額）");
  var name = String(p.name || "").trim() || (WA_NAMES_[code] || code);
  var row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 9).setValues([[name, OTHER_STOCK_CAT_, "", new Date(), "其他個股（之後調整）", new Date(), cost, code, shares]]);
  sh.getRange(row, 3).setFormula(otherPriceFormula_(row));
  SpreadsheetApp.flush();
  var v = waNum_(sh.getRange(row, 3).getValue());
  return { message: "已登記 " + name + " " + shares + " 股",
    detail: v > 0 ? "目前市值約 " + Math.round(v).toLocaleString() + " 元" : "股價暫時抓不到（上櫃股票可能需要手動填 C 欄估值）",
    dashboard: waGetDashboard() };
}

// 賣出其他個股：錢進投資現金（D10），成本轉進淨投入本金（B16），報酬率不會失真
function waSellOtherStock(p) {
  var ss = SS_();
  var alt = otherAltSheet_(ss);
  var sh = ss.getSheetByName("工作表1");
  var row = Number(p.row);
  var x = waOtherStocks_(ss).filter(function (s) { return s.row === row; })[0];
  if (!x) throw new Error("找不到這檔股票");
  var shares = Number(p.shares);
  if (!(shares > 0) || Math.floor(shares) !== shares) throw new Error("股數要是大於 0 的整數");
  if (shares > x.shares) throw new Error("只持有 " + x.shares + " 股");
  var price = p.price === "" || p.price === null || p.price === undefined ? x.price : Number(p.price);
  if (!(price > 0)) throw new Error("抓不到即時股價，請填成交價");

  var feeRate = waNum_(sh.getRange(R_(21), 3).getValue()) || 0.001425;
  var taxRate = waNum_(sh.getRange(R_(22), 3).getValue()) || 0.003;
  var minFee = waNum_(sh.getRange(R_(23), 3).getValue()) || 20;
  var gross = shares * price;
  var fee = Math.max(minFee, Math.round(gross * feeRate));
  var tax = Math.round(gross * taxRate);
  var net = gross - fee - tax;
  var costRemoved = Math.round(x.shares > 0 ? x.cost * shares / x.shares : 0);

  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var cash = waNum_(sh.getRange(R_(10), 4).getValue());
    var principal = waNum_(sh.getRange(R_(16), 2).getValue());
    sh.getRange(R_(10), 4).setValue(cash + net);
    sh.getRange(R_(16), 2).setValue(principal + costRemoved);
    if (shares === x.shares) {
      alt.deleteRow(row);
    } else {
      alt.getRange(row, 9).setValue(x.shares - shares);
      alt.getRange(row, 7).setValue(Math.max(0, x.cost - costRemoved));
      alt.getRange(row, 6).setValue(new Date());
    }
  } finally {
    lock.releaseLock();
  }
  try {
    var acc = waStockAccount_(ss);
    if (acc) waLogFlow_(ss, "賣股", "股票:" + x.code, acc, net, x.name + " " + shares + " 股 @ " + price + "（其他個股）");
  } catch (e) { Logger.log(e); }

  var gain = net - costRemoved;
  return { message: "賣出 " + x.name + " " + shares + " 股完成",
    detail: "實收 " + Math.round(net).toLocaleString() + " 元（" + (gain >= 0 ? "賺 " : "賠 ") + Math.abs(Math.round(gain)).toLocaleString() + " 元），已加回投資現金",
    dashboard: waGetDashboard() };
}

// 修改股數或成本（例如登記錯了）
function waUpdateOtherStock(p) {
  var ss = SS_();
  var alt = otherAltSheet_(ss);
  var x = waOtherStocks_(ss).filter(function (s) { return s.row === Number(p.row); })[0];
  if (!x) throw new Error("找不到這檔股票");
  var shares = Number(p.shares), cost = Number(p.cost);
  if (!(shares > 0) || Math.floor(shares) !== shares) throw new Error("股數要是大於 0 的整數");
  if (!(cost >= 0)) throw new Error("成本格式不正確");
  alt.getRange(x.row, 7).setValue(cost);
  alt.getRange(x.row, 9).setValue(shares);
  alt.getRange(x.row, 6).setValue(new Date());
  return { message: "已更新 " + x.name, detail: "", dashboard: waGetDashboard() };
}

function waDeleteOtherStock(p) {
  var ss = SS_();
  var alt = otherAltSheet_(ss);
  var x = waOtherStocks_(ss).filter(function (s) { return s.row === Number(p.row); })[0];
  if (!x) throw new Error("找不到這檔股票");
  alt.deleteRow(x.row);
  return { message: "已刪除 " + x.name + "（登記錯誤用，不會加回現金）", detail: "", dashboard: waGetDashboard() };
}

// ============================================================
// 校正持股（期初登記已經持有的股票，不會動到現金）
// 工作表1 第 2～9 列：A 代號、B 股數、L 成本
// ============================================================
function waSetHolding(p) {
  if (typeof healthDrop_ === "function") healthDrop_("hold"); // 期初／校正持股：健檢的持股基準重新記
  var ss = SS_();
  var sh = ss.getSheetByName("工作表1");
  var row = Number(p.row);
  if (!(row >= 2 && row <= LAY().last)) throw new Error("找不到這個標的欄位");
  var shares = Number(p.shares), cost = Number(p.cost);
  if (!(shares >= 0) || Math.floor(shares) !== shares) throw new Error("股數要是 0 以上的整數");
  if (!(cost >= 0)) throw new Error("成本格式不正確");
  var oldCode = String(sh.getRange(row, 1).getValue()).trim();
  var code = p.code ? normalizeStockCode_(p.code) : oldCode;
  if (!code) throw new Error("請輸入代號");
  for (var r = 2; r <= LAY().last; r++) {
    if (r !== row && String(sh.getRange(r, 1).getValue()).trim() === code) throw new Error(code + " 已經在第 " + r + " 列了");
  }
  if (shares === 0 && cost > 0) throw new Error("股數是 0 時成本也要是 0");
  sh.getRange(row, 1).setValue(code);
  sh.getRange(row, 2).setValue(shares);
  sh.getRange(row, 12).setValue(cost);
  if (code !== oldCode) { try { syncTradeFormCodes(); } catch (e) { Logger.log(e); } }
  return { message: "已設定 " + (WA_NAMES_[code] || code) + "：" + shares + " 股", detail: "成本 " + Math.round(cost).toLocaleString() + " 元（期初登記，不會扣現金）", dashboard: waGetDashboard() };
}

// 期初現金（D10）與淨投入本金（B16）
function waSetOpening(p) {
  if (typeof healthDrop_ === "function") healthDrop_("acc");
  var sh = SS_().getSheetByName("工作表1");
  var cash = Number(p.cash), principal = p.principal === "auto" ? null : Number(p.principal);
  if (!(cash >= 0)) throw new Error("投資現金格式不正確");
  sh.getRange(R_(10), 4).setValue(cash);
  if (principal === null) {
    var costs = sh.getRange(2, 12, LAY().n, 1).getValues().reduce(function (a, r) { return a + (Number(r[0]) || 0); }, 0);
    principal = costs + cash;
  }
  if (!(principal >= 0)) throw new Error("淨投入本金格式不正確");
  sh.getRange(R_(16), 2).setValue(principal);
  return { message: "期初設定完成", detail: "投資現金 " + Math.round(cash).toLocaleString() + "・淨投入本金 " + Math.round(principal).toLocaleString(), dashboard: waGetDashboard() };
}


// ==================== Edit.gs ====================
// ============================================================
// 修改 / 撤銷 交易紀錄與收支紀錄（App 裡點明細就能改）
//
// 交易：跟原本「撤銷最後一筆交易」同一套還原方式（交易紀錄 J 欄＝撤銷用成本），
//       但可以選任何一筆。修改＝先還原舊的，再用新的股數、成交價重新計算一次，日期保留原本的。
// 收支：收入會讓（D10＋生活帳戶）增加、淨投入本金 B16 增加（股息、利息等投資收益不加 B16）；
//       支出相反。修改或撤銷就是把差額補回去，再照週額度重新校準生活帳戶。
// 帳戶流水裡對應的那一筆也會一起改或刪。
// ============================================================

var WA_RETURN_CATS_ = { "股息": 1, "股利": 1, "配息": 1, "利息": 1, "投資收益": 1, "投資獲利": 1 };

function waTradeLogSheet_(ss) {
  var sh = ss.getSheetByName("交易紀錄");
  if (!sh) throw new Error("找不到交易紀錄");
  return sh;
}

function waReadTradeRow_(log, row) {
  row = Number(row);
  if (!(row >= 2 && row <= log.getLastRow())) throw new Error("找不到這筆交易，請重新整理後再試");
  var r = log.getRange(row, 1, 1, 10).getValues()[0];
  var type = String(r[8]).trim();
  if (type !== "買進" && type !== "賣出") throw new Error("這一列不是買進或賣出紀錄");
  return { row: row, date: r[0], code: String(r[1]).trim(), shares: Math.abs(Number(r[2]) || 0), price: Number(r[3]) || 0,
    net: Number(r[7]) || 0, type: type, cost: r[9] === "" || r[9] === null ? NaN : Number(r[9]) };
}

function waHoldingRow_(sheet, code) {
  var codes = sheet.getRange(2, 1, LAY().n, 1).getValues();
  for (var i = 0; i < LAY().n; i++) if (String(codes[i][0]).trim() === code) return i + 2;
  throw new Error("工作表1 找不到 " + code + "，沒辦法修改這筆交易");
}

// 讀目前持股、成本、現金（還原失敗時用）
function waHoldingState_(sheet, hr) {
  return { shares: waNum_(sheet.getRange(hr, 2).getValue()), cost: waNum_(sheet.getRange(hr, 12).getValue()), cash: waNum_(sheet.getRange(R_(10), 4).getValue()) };
}
function waWriteHolding_(sheet, hr, st) {
  sheet.getRange(hr, 2).setValue(st.shares);
  sheet.getRange(hr, 12).setValue(st.cost);
  sheet.getRange(R_(10), 4).setValue(st.cash);
}

// 把一筆交易對持股、成本、現金的影響退回去（不寫入，回傳新狀態）
function waTradeReverse_(st, t) {
  if (t.type === "買進") {
    var rc = isFinite(t.cost) && t.cost >= 0 ? t.cost : t.net;
    if (st.shares < t.shares) throw new Error("目前持股比這筆買進還少（後面可能已經賣掉），不能撤銷這筆");
    return { shares: st.shares - t.shares, cost: Math.max(0, st.cost - rc), cash: st.cash + t.net };
  }
  if (!isFinite(t.cost)) throw new Error("這是舊版賣出紀錄，沒有記錄當時移除的成本，不能自動撤銷");
  if (st.cash < t.net) throw new Error("投資現金不夠退回這筆賣出所得，不能撤銷");
  return { shares: st.shares + t.shares, cost: st.cost + t.cost, cash: st.cash - t.net };
}

// 用新的股數、價格重新算一次（不寫入，回傳新狀態和交易紀錄要寫的欄位）
function waTradeApply_(sheet, st, type, shares, price) {
  var feeRate = waNum_(sheet.getRange(R_(21), 3).getValue()) || 0.001425;
  var taxRate = waNum_(sheet.getRange(R_(22), 3).getValue()) || 0.003;
  var minFee = waNum_(sheet.getRange(R_(23), 3).getValue()) || 20;
  var gross = shares * price;
  var fee = Math.max(minFee, Math.round(gross * feeRate));
  if (type === "買進") {
    var total = gross + fee;
    if (total > st.cash) throw new Error("投資現金不足：需要 " + Math.round(total).toLocaleString() + " 元");
    return { state: { shares: st.shares + shares, cost: st.cost + total, cash: st.cash - total },
      log: [shares, price, gross, fee, 0, total, "買進", total], net: total };
  }
  if (shares > st.shares) throw new Error("持股只有 " + st.shares + " 股");
  var tax = Math.round(gross * taxRate);
  var net = gross - fee - tax;
  var costRemoved = Math.round(st.shares > 0 ? st.cost / st.shares * shares : 0);
  return { state: { shares: st.shares - shares, cost: Math.max(0, st.cost - costRemoved), cash: st.cash + net },
    log: [-shares, price, gross, fee, tax, net, "賣出", costRemoved], net: net };
}

// 在帳戶流水找同一筆（時間差 15 分鐘內、類型和金額相同）
function waFindFlowRow_(ss, when, types, amount, match) {
  var sh = ss.getSheetByName(WA_FLOW_SHEET_);
  if (!sh || sh.getLastRow() < 2 || !(when instanceof Date)) return -1;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var best = -1, bestGap = 15 * 60000;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!(r[0] instanceof Date) || types.indexOf(String(r[1]).trim()) < 0) continue;
    if (Math.abs(waNum_(r[4]) - amount) > 1) continue;
    if (match && !match(r)) continue;
    var gap = Math.abs(r[0].getTime() - when.getTime());
    if (gap <= bestGap) { best = i + 2; bestGap = gap; }
  }
  return best;
}

function waEditTrade(p) {
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var log = waTradeLogSheet_(ss);
  var shares = Number(p.shares), price = Number(p.price);
  if (!(shares > 0) || Math.floor(shares) !== shares) throw new Error("股數要是大於 0 的整數");
  if (!(price > 0)) throw new Error("成交價格式不正確");
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var t = waReadTradeRow_(log, p.row);
    var hr = waHoldingRow_(sheet, t.code);
    var before = waHoldingState_(sheet, hr);
    var mid = waTradeReverse_(before, t);
    var res = waTradeApply_(sheet, mid, t.type, shares, price);
    try {
      waWriteHolding_(sheet, hr, res.state);
      log.getRange(t.row, 3, 1, 8).setValues([res.log]);
    } catch (e) { waWriteHolding_(sheet, hr, before); throw e; }
    try { // 帳戶流水跟著改金額
      var fr = waFindFlowRow_(ss, t.date, [t.type === "買進" ? "買股" : "賣股"], t.net, function (r) { return String(t.type === "買進" ? r[3] : r[2]).indexOf(t.code) >= 0; });
      if (fr > 0) {
        var fs = ss.getSheetByName(WA_FLOW_SHEET_);
        fs.getRange(fr, 5).setValue(Math.round(res.net * 100) / 100);
        fs.getRange(fr, 6).setValue((WA_NAMES_[t.code] || t.code) + " " + shares + " 股 @ " + price + "（已修改）");
      }
    } catch (fe) { Logger.log("帳戶流水沒有跟著改：" + fe); }
  } finally {
    lock.releaseLock();
  }
  if (WA_DEFER_) WA_NEED_TRIAL_ = true; else { try { buildCombinedReportV4_(); } catch (e2) {} }
  return { message: "已修改 " + (WA_NAMES_[t.code] || t.code) + " " + t.type, detail: shares + " 股 @ " + price + "・" + (t.type === "買進" ? "總支出 " : "實收 ") + Math.round(res.net).toLocaleString() + " 元", dashboard: waGetDashboard() };
}

function waUndoTrade(p) {
  var ss = SS_();
  var sheet = ss.getSheetByName("工作表1");
  var log = waTradeLogSheet_(ss);
  var lock = LOCK_();
  lock.waitLock(10000);
  try {
    var t = waReadTradeRow_(log, p.row);
    var hr = waHoldingRow_(sheet, t.code);
    var before = waHoldingState_(sheet, hr);
    var after = waTradeReverse_(before, t);
    try {
      waWriteHolding_(sheet, hr, after);
      log.deleteRow(t.row);
    } catch (e) { waWriteHolding_(sheet, hr, before); throw e; }
    try {
      var fr = waFindFlowRow_(ss, t.date, [t.type === "買進" ? "買股" : "賣股"], t.net, function (r) { return String(t.type === "買進" ? r[3] : r[2]).indexOf(t.code) >= 0; });
      if (fr > 0) ss.getSheetByName(WA_FLOW_SHEET_).deleteRow(fr);
    } catch (fe) { Logger.log("帳戶流水沒有跟著刪：" + fe); }
  } finally {
    lock.releaseLock();
  }
  if (WA_DEFER_) WA_NEED_TRIAL_ = true; else { try { buildCombinedReportV4_(); } catch (e2) {} }
  return { message: "已撤銷 " + (WA_NAMES_[t.code] || t.code) + " " + t.type + " " + t.shares + " 股", detail: "持股、成本、投資現金都已還原", dashboard: waGetDashboard() };
}

// ---------- 收支 ----------
function waLedgerEffect_(type, cat, amount) {
  if (type === "收入") return { money: amount, principal: WA_RETURN_CATS_[String(cat || "").replace(/\s/g, "")] ? 0 : amount };
  return { money: -amount, principal: -amount };
}

// 把（D10＋生活帳戶）調整 delta，B16 調整 dp，再照週額度重新校準
function waLedgerAdjust_(ss, delta, dp) {
  var sheet = ss.getSheetByName("工作表1");
  var cash = waNum_(sheet.getRange(R_(10), 4).getValue());
  var life = waNum_(sheet.getRange(R_(45), 2).getValue());
  var principal = waNum_(sheet.getRange(R_(16), 2).getValue());
  cash += delta;
  if (cash < 0) { life += cash; cash = 0; }
  if (life < -0.005) throw new Error("投資現金和生活帳戶加起來不夠扣，沒有修改");
  sheet.getRange(R_(10), 4).setValue(cash);
  sheet.getRange(R_(45), 2).setValue(Math.max(0, life));
  sheet.getRange(R_(16), 2).setValue(Math.max(0, principal + dp));
  return { sheet: sheet, cash: cash, life: Math.max(0, life) };
}
function waLedgerSettle_(ss, st) {
  try {
    if (typeof settleIncomeToLatestAllowanceV2_ === "function") settleIncomeToLatestAllowanceV2_(ss, st.sheet, st.cash, st.life);
    if (typeof refreshLifeAccountDisplayV2_ === "function") refreshLifeAccountDisplayV2_(ss);
  } catch (e) { Logger.log("生活帳戶校準失敗：" + e); }
}

function waReadLedgerRow_(sh, row) {
  row = Number(row);
  if (!sh || !(row >= 2 && row <= sh.getLastRow())) throw new Error("找不到這筆紀錄，請重新整理後再試");
  var r = sh.getRange(row, 1, 1, 6).getValues()[0];
  var type = String(r[1]).trim();
  if (type !== "收入" && type !== "支出") throw new Error("這一列不是收入或支出");
  return { row: row, date: r[0], type: type, category: String(r[2]), amount: waNum_(r[3]), note: String(r[4] || ""), oneTime: String(r[5]).trim() === "是" };
}
function waLedgerFlowRow_(ss, x) {
  var tag = (x.type === "支出" ? "支出:" : "收入:") + x.category;
  return waFindFlowRow_(ss, x.date, [x.type], x.amount, function (r) { return String(r[2]) === tag || String(r[3]) === tag; });
}

function waEditLedger(p) {
  var ss = SS_();
  var sh = ss.getSheetByName("收支紀錄");
  var amount = Number(p.amount);
  if (!(amount > 0)) throw new Error("請輸入大於 0 的金額");
  var lock = LOCK_();
  lock.waitLock(10000);
  var st, x, cat;
  try {
    x = waReadLedgerRow_(sh, p.row);
    cat = String(p.category || "").trim() || x.category;
    if (/〔[A-Z]{3} [\d.]+〕/.test(x.note) && Math.abs(amount - x.amount) > 0.5) throw new Error("外幣記帳不能改金額，請按「撤銷」後重記一筆");
    var oldE = waLedgerEffect_(x.type, x.category, x.amount), newE = waLedgerEffect_(x.type, cat, amount);
    var oneTime = x.type === "支出" ? (p.oneTime ? "是" : "否") : "否";
    st = waLedgerAdjust_(ss, newE.money - oldE.money, newE.principal - oldE.principal);
    // 改日期：只換「哪一天」，時分秒不動；帳戶流水那一筆跟著改，之後才對得起來
    var newDate = null, oldDay = x.date instanceof Date ? Utilities.formatDate(x.date, WA_TZ_, "yyyy-MM-dd") : "";
    var wantDay = String(p.date || "").trim();
    if (wantDay && wantDay !== oldDay) {
      if (!(x.date instanceof Date)) throw new Error("這一筆的日期格式特別，不能改日期");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wantDay)) throw new Error("日期格式不正確");
      if (wantDay > Utilities.formatDate(new Date(), WA_TZ_, "yyyy-MM-dd")) throw new Error("日期不能選未來");
      newDate = new Date(wantDay + "T" + Utilities.formatDate(x.date, WA_TZ_, "HH:mm:ss") + "+08:00");
      if (isNaN(newDate.getTime())) throw new Error("日期格式不正確");
    }
    var frBefore = -1;
    try { frBefore = waLedgerFlowRow_(ss, x); } catch (fe0) { Logger.log(fe0); }
    sh.getRange(x.row, 3, 1, 4).setValues([[cat, amount, String(p.note == null ? x.note : p.note), oneTime]]);
    if (newDate) sh.getRange(x.row, 1).setValue(newDate);
    try {
      var fr = frBefore;
      if (fr > 0) {
        if (newDate) ss.getSheetByName(WA_FLOW_SHEET_).getRange(fr, 1).setValue(newDate);
        var fs = ss.getSheetByName(WA_FLOW_SHEET_);
        var tag = (x.type === "支出" ? "支出:" : "收入:") + cat;
        fs.getRange(fr, x.type === "支出" ? 4 : 3).setValue(tag);
        fs.getRange(fr, 5).setValue(amount);
      }
    } catch (fe) { Logger.log("帳戶流水沒有跟著改：" + fe); }
    waLedgerSettle_(ss, st);
  } finally {
    lock.releaseLock();
  }
  try { waLearnCategory_(x.type === "收入" ? "INCOME_CATEGORIES" : "EXPENSE_CATEGORIES", cat); } catch (e) {}
  return { message: "已修改 " + x.type + " " + cat, detail: "$" + Math.round(x.amount).toLocaleString() + " → $" + Math.round(amount).toLocaleString() + (newDate ? "・日期改成 " + Utilities.formatDate(newDate, WA_TZ_, "M/d") : ""), dashboard: waGetDashboard() };
}

function waUndoLedger(p) {
  var ss = SS_();
  var sh = ss.getSheetByName("收支紀錄");
  var lock = LOCK_();
  lock.waitLock(10000);
  var x;
  try {
    x = waReadLedgerRow_(sh, p.row);
    var e = waLedgerEffect_(x.type, x.category, x.amount);
    var fr = -1;
    try { fr = waLedgerFlowRow_(ss, x); } catch (fe) {}
    var st = waLedgerAdjust_(ss, -e.money, -e.principal);
    sh.deleteRow(x.row);
    if (fr > 0) {
      try {
        var fsh = ss.getSheetByName(WA_FLOW_SHEET_);
        if (typeof fxLedgerUndo_ === "function") fxLedgerUndo_(ss, fsh.getRange(fr, 1, 1, 6).getValues()[0]);
        fsh.deleteRow(fr);
      } catch (de) { Logger.log(de); }
    }
    waLedgerSettle_(ss, st);
  } finally {
    lock.releaseLock();
  }
  return { message: "已撤銷 " + x.type + " " + x.category + " $" + Math.round(x.amount).toLocaleString(), detail: "投資現金、生活帳戶、淨投入本金都已還原", dashboard: waGetDashboard() };
}


// ==================== Wizard.gs ====================
// ============================================================
// 新手設定精靈：一步一步登記「開始用 App 之前就有的東西」
// 銀行餘額 → 外幣 → 股票 ETF → 保險 → 黃金 → 生意 → 退休 → 完成
// 每一步整批送出（一次存好幾筆），期初資料都不會扣任何帳戶的錢
// ============================================================

WA_READ_ONLY_.waWizPreview = 1;

function wizList_(p, key) {
  var a = p && p[key || "rows"];
  return Array.isArray(a) ? a.filter(function (r) { return r && typeof r === "object"; }) : [];
}
function wizBlank_(v) { return v === "" || v === null || v === undefined || String(v).trim() === ""; }
// 每一筆各自處理，有錯的列出來，其他照樣存
function wizEach_(rows, label, fn) {
  var ok = 0, errors = [];
  rows.forEach(function (r, i) {
    try { if (fn(r) !== false) ok++; } catch (e) { errors.push((label(r) || "第 " + (i + 1) + " 筆") + "：" + (e && e.message ? e.message : e)); }
  });
  return { ok: ok, errors: errors };
}
function wizResult_(what, res, extra) {
  if (!res.ok && res.errors.length) throw new Error(res.errors.join("\n"));
  return { message: res.ok ? what + "：已存 " + res.ok + " 筆" : "沒有新的資料", detail: res.errors.length ? "有 " + res.errors.length + " 筆沒存：" + res.errors.join("；") : (extra || ""),
    errors: res.errors, dashboard: waGetDashboard() };
}

// ---------- 0. 啟用功能 ----------
function waWizEnable(p) {
  var ss = SS_(), on = [];
  if (p && p.gold && !ss.getSheetByName(GOLD_SET_SHEET_)) { setupGoldModule(); on.push("實體黃金"); }
  if (p && p.fx && !(fxSheet_(ss, false))) { setupFxModule(); on.push("外幣"); }
  if (p && p.biz && !ss.getSheetByName(BIZ_SHEETS_.product[0])) { setupBizModule(); on.push("生意"); }
  var note = "";
  if (on.length) {
    if (typeof hubInstallTriggers_ === "function") { try { hubInstallTriggers_(); } catch (e) { Logger.log(e); } }
    else note = "記得到試算表選單按一次「⚙️ 一鍵安裝」，金價、匯率才會每小時自動更新";
  }
  return { message: on.length ? "已啟用 " + on.join("、") : "功能都準備好了", detail: note, dashboard: waGetDashboard() };
}

// ---------- 1. 銀行帳戶 ----------
// rows: [{ old, name, role, stock, balance, active }]
function waWizAccounts(p) {
  var rows = wizList_(p).filter(function (r) { return !wizBlank_(r.name); });
  if (rows.filter(function (r) { return r.stock; }).length > 1) throw new Error("股票交割帳戶只能選一個");
  var res = wizEach_(rows, function (r) { return String(r.name).trim(); }, function (r) {
    var name = String(r.name).trim();
    var role = WA_ROLES_.indexOf(String(r.role)) >= 0 ? String(r.role) : "混用";
    waSaveAccount({ old: String(r.old || "").trim(), name: name, role: role, stock: !!r.stock, active: r.active !== false });
    if (!wizBlank_(r.balance)) {
      var b = Number(String(r.balance).replace(/,/g, ""));
      if (!isFinite(b)) throw new Error("餘額要是數字");
      waAdjustBalance({ account: name, actual: b });
    }
  });
  return wizResult_("銀行帳戶", res);
}

// ---------- 2. 外幣 ----------
// rows: [{ bank, currency, amount, cost }]
function waWizFx(p) {
  var ss = SS_();
  var scopeOf = {};
  waAccountList_(ss).forEach(function (a) { scopeOf[a.name] = a.scope; });
  var rows = wizList_(p).filter(function (r) { return !wizBlank_(r.bank) && !wizBlank_(r.currency); });
  var res = wizEach_(rows, function (r) { return r.bank + " " + r.currency; }, function (r) {
    waFxRecord({ kind: "open", bank: r.bank, currency: r.currency, amount: r.amount, cost: wizBlank_(r.cost) ? "" : r.cost, scope: scopeOf[String(r.bank).trim()] || "個人" });
  });
  return wizResult_("外幣", res);
}

// ---------- 3. 股票、ETF ----------
// rows: 工作表1 第 2～9 列 [{ row, shares, cost }]；others: 其他個股 [{ code, name, shares, cost }]
function waWizHoldings(p) {
  if (typeof healthDrop_ === "function") healthDrop_("hold");
  var sh = SS_().getSheetByName("工作表1");
  var rows = wizList_(p).filter(function (r) { return Number(r.row) >= 2 && Number(r.row) <= LAY().last; });
  var res = wizEach_(rows, function (r) { return String(sh.getRange(Number(r.row), 1).getValue()).replace("TPE:", ""); }, function (r) {
    var code = String(sh.getRange(Number(r.row), 1).getValue()).trim();
    if (!code) return false;
    var shares = wizBlank_(r.shares) ? 0 : Number(r.shares), cost = wizBlank_(r.cost) ? 0 : Number(r.cost);
    if (shares > 0 && !(cost > 0)) throw new Error("請填成本（每股均價或總成本）");
    waSetHolding({ row: Number(r.row), shares: shares, cost: shares > 0 ? cost : 0 });
  });
  var others = wizList_(p, "others").filter(function (r) { return !wizBlank_(r.code); });
  var res2 = wizEach_(others, function (r) { return String(r.code); }, function (r) {
    waAddOtherStock({ code: r.code, name: r.name, shares: r.shares, cost: r.cost });
  });
  return wizResult_("股票", { ok: res.ok + res2.ok, errors: res.errors.concat(res2.errors) });
}

// ---------- 4. 保險、收藏品 ----------
// rows: [{ name, category, currency, value, cost, note }]
function waWizAlt(p) {
  var rows = wizList_(p).filter(function (r) { return !wizBlank_(r.name); });
  var res = wizEach_(rows, function (r) { return String(r.name); }, function (r) {
    if (wizBlank_(r.value)) throw new Error("請填目前價值（保險填解約金）");
    waSaveAltItem({ name: r.name, category: r.category || "保險", value: r.value, cost: wizBlank_(r.cost) ? "" : r.cost, currency: r.currency || "", note: r.note || "" });
  });
  return wizResult_("保險／另類資產", res);
}

// ---------- 5. 黃金 ----------
// rows: [{ name, type, weight, unit, cost }]
function waWizGold(p) {
  var rows = wizList_(p).filter(function (r) { return !wizBlank_(r.name) || !wizBlank_(r.weight); });
  var res = wizEach_(rows, function (r) { return String(r.name || "黃金"); }, function (r) {
    waAddGold({ name: r.name, type: r.type, weight: r.weight, unit: r.unit, cost: wizBlank_(r.cost) ? "" : r.cost, note: "" });
  });
  return wizResult_("黃金", res);
}

// ---------- 6. 生意 ----------
// accounts: [{ old, name, balance }]、stock: [{ product, qty, unitCost }]、prepaid: [{ customer, amount }]、payable: [{ vendor, amount }]
function waWizBiz(p) {
  var ss = SS_();
  var all = [], errors = [], ok = 0;
  var add = function (r) { ok += r.ok; errors = errors.concat(r.errors); };
  var exists = {};
  waAccountList_(ss).forEach(function (a) { exists[a.name] = a; });
  add(wizEach_(wizList_(p, "accounts").filter(function (r) { return !wizBlank_(r.name); }), function (r) { return String(r.name); }, function (r) {
    var name = String(r.name).trim(), old = String(r.old || "").trim();
    if (old && exists[old]) waSaveAccount({ old: old, name: name, role: "生意", stock: false, active: true });
    else if (exists[name]) waSetAccountRole({ account: name, role: "生意" });
    else waSaveAccount({ old: "", name: name, role: "生意", stock: false, active: true });
    if (!wizBlank_(r.balance)) waAdjustBalance({ account: name, actual: Number(String(r.balance).replace(/,/g, "")) });
  }));
  add(wizEach_(wizList_(p, "stock").filter(function (r) { return !wizBlank_(r.product); }), function (r) { return String(r.product); }, function (r) {
    waBizRecord({ kind: "openingStock", product: r.product, qty: r.qty, unitCost: wizBlank_(r.unitCost) ? 0 : r.unitCost, account: "__none__" });
  }));
  add(wizEach_(wizList_(p, "prepaid").filter(function (r) { return !wizBlank_(r.customer); }), function (r) { return String(r.customer); }, function (r) {
    waBizRecord({ kind: "openingPrepaid", customer: r.customer, amount: r.amount, account: "__none__" });
  }));
  add(wizEach_(wizList_(p, "payable").filter(function (r) { return !wizBlank_(r.vendor); }), function (r) { return String(r.vendor); }, function (r) {
    waBizRecord({ kind: "openingPayable", vendor: r.vendor, amount: r.amount, account: "__none__" });
  }));
  return wizResult_("生意", { ok: ok, errors: errors });
}

// ---------- 7. 完成：投資現金、淨投入本金、淨資產成長起點 ----------
// 投資現金（D10）＝ 投資、生活、混用帳戶的台幣合計 − 生活帳戶（B45）
// 淨投入本金（B16）＝ 持股成本 ＋ 投資現金
function wizCashPlan_(ss) {
  var sh = ss.getSheetByName("工作表1");
  var acc = 0;
  waAccountBalances_(ss).forEach(function (a) {
    if (a.scope !== "生意" && (a.role === "投資" || a.role === "生活" || a.role === "混用")) acc += a.balance;
  });
  var life = waNum_(sh.getRange(R_(45), 2).getValue());
  var cash = Math.max(0, Math.round(acc - life));
  var costs = sh.getRange(2, 12, LAY().n, 1).getValues().reduce(function (s, r) { return s + (Number(r[0]) || 0); }, 0);
  return { accounts: Math.round(acc), life: Math.round(life), cash: cash, costs: Math.round(costs), principal: Math.round(costs + cash),
    curCash: Math.round(waNum_(sh.getRange(R_(10), 4).getValue())), curPrincipal: Math.round(waNum_(sh.getRange(R_(16), 2).getValue())) };
}
function waWizPreview() { return wizCashPlan_(SS_()); }

function waWizFinish(p) {
  if (typeof healthDrop_ === "function") healthDrop_("all");
  var ss = SS_();
  var detail = [];
  if (p && p.setCash) {
    var plan = wizCashPlan_(ss);
    var sh = ss.getSheetByName("工作表1");
    sh.getRange(R_(10), 4).setValue(plan.cash);
    sh.getRange(R_(16), 2).setValue(plan.principal);
    detail.push("投資現金 " + plan.cash.toLocaleString() + "・淨投入本金 " + plan.principal.toLocaleString());
  }
  if (p && p.resetSnap) {
    var snap = ss.getSheetByName(WA_SNAP_SHEET_);
    if (snap && snap.getLastRow() >= 2) snap.deleteRows(2, snap.getLastRow() - 1);
    detail.push("淨資產成長從今天的成本開始算");
    PROPS_().deleteProperty("NW_FLOWS"); PROPS_().deleteProperty("NW_PRE");
  }
  PROPS_().setProperty("ONBOARD_DONE", "1");
  return { message: "設定完成 🎉", detail: detail.join("・"), dashboard: waGetDashboard() };
}


// ==================== Health.gs ====================
// ============================================================
// 資料健檢：自動檢查數字之間有沒有互相矛盾
// - 每個交易日下午跟試算一起跑一次；設定裡也可以按「現在檢查」
// - 只提醒、不會自己改數字。有新的問題才寄信，App 上方會顯示
// - 狀態存在指令碼屬性 HEALTH_STATE：{ at, issues:[{key,msg}], base:{hold:{代號:差}, acc:數字}, acked:{key:1} }
//   base 是「上次確認正常時」的基準：
//     hold[代號] = 持股 − 交易紀錄加總（期初登記的股數會在這裡，之後應該固定不變）
//     acc       = 個人帳戶餘額合計 −（投資現金＋生活帳戶）（沒校正過的人會有固定差額，之後應該固定不變）
// ============================================================
var HEALTH_KEY_ = "HEALTH_STATE";

function healthState_() {
  try { return JSON.parse(PROPS_().getProperty(HEALTH_KEY_) || "null") || {}; } catch (e) { return {}; }
}
function healthSave_(st) {
  st.issues = (st.issues || []).slice(0, 20);
  var ak = Object.keys(st.acked || {});
  if (ak.length > 80) { var keep = {}; ak.slice(-80).forEach(function (k) { keep[k] = 1; }); st.acked = keep; }
  PROPS_().setProperty(HEALTH_KEY_, JSON.stringify(st));
}
// 有人故意改了基準（期初登記、校正帳戶、改帳戶功能、重置）：把那一塊基準丟掉，下次檢查重新記
function healthDrop_(what) {
  try {
    var st = healthState_();
    if (!st.base) return;
    if (what === "all") delete st.base; else delete st.base[what];
    healthSave_(st);
  } catch (e) { Logger.log("健檢基準清除失敗：" + e); }
}

function healthIsErr_(disp) { return /^#(N\/A|REF!|ERROR!|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!)/.test(String(disp || "").trim()); }
function healthMoney_(n) { return Math.round(n).toLocaleString(); }

// 量一次。base：上次的基準（沒有的項目會補上）。回傳 { issues, base }
function healthMeasure_(ss, base, sinceMs) {
  base = base || {};
  var issues = [];
  var add = function (key, msg) { issues.push({ key: key, msg: msg }); };
  var sh = ss.getSheetByName("工作表1");
  if (!sh) return { issues: issues, base: base };
  var n = LAY().n, tz = "Asia/Taipei", now = new Date();

  // ---------- 持股那幾列＋現金列 ----------
  var rng = sh.getRange(2, 1, n + 1, 12);
  var rows = rng.getValues(), disp = rng.getDisplayValues();
  var blkR = sh.getRange(A1_("A12:B48"));
  var blk = blkR.getValues(), blkD = blkR.getDisplayValues(), blkF = blkR.getFormulas();
  var bad = function () {
    for (var i = 0; i < n; i++) if (Number(rows[i][1]) > 0 && (!(Number(rows[i][2]) > 0) || healthIsErr_(disp[i][2]))) return true;
    for (var j = 0; j < blkD.length; j++) if (healthIsErr_(blkD[j][1])) return true;
    return false;
  };
  if (bad()) { // 股價偶爾會晚幾秒才出來：等一下再讀一次，還是不對才算
    SpreadsheetApp.flush(); Utilities.sleep(4000);
    rows = rng.getValues(); disp = rng.getDisplayValues();
    blk = blkR.getValues(); blkD = blkR.getDisplayValues(); blkF = blkR.getFormulas();
  }
  var cell = function (r) { return blk[r - 12][1]; }, label = function (r) { return String(blk[r - 12][0] || "").trim() || ("B" + R_(r)); };

  var hold = {}, stockValue = 0, targetSum = 0, anyTarget = false;
  for (var i = 0; i < n; i++) {
    var code = String(rows[i][0]).trim(), shares = Number(rows[i][1]) || 0, price = Number(rows[i][2]), cost = Number(rows[i][11]) || 0, tgt = Number(rows[i][5]) || 0;
    if (tgt > 0) { anyTarget = true; targetSum += tgt; }
    if (!code) { if (shares !== 0) add("nocode:" + (i + 2), "第 " + (i + 2) + " 列有 " + shares + " 股，但沒有代號"); continue; }
    hold[code] = (hold[code] || 0) + shares;
    if (shares < 0 || Math.floor(shares) !== shares) add("shares:" + code, code + " 的持有股數是 " + shares + "，不是 0 以上的整數");
    if (cost < 0) add("cost:" + code, code + " 的累計成本是負的（" + healthMoney_(cost) + "）");
    if (shares > 0 && !(cost > 0)) add("cost0:" + code, code + " 有 " + shares + " 股，但成本是 0，報酬率會被高估");
    if (shares > 0 && (!(price > 0) || healthIsErr_(disp[i][2]))) add("price:" + code, code + " 有持股但股價抓不到，總資產和試算會算錯");
    else stockValue += shares * (price > 0 ? price : 0);
  }
  var cashRow = rows[n], cash = Number(cashRow[3]) || 0;
  if (Number(cashRow[5]) > 0) { anyTarget = true; targetSum += Number(cashRow[5]); }
  if (anyTarget && Math.abs(targetSum - 1) > 0.0006) add("target", "目標比例加起來是 " + (targetSum * 100).toFixed(2) + "%，不是 100%");

  // ---------- 重要的格子 ----------
  var total = Number(cell(14)) || 0, principal = Number(cell(16)) || 0, life = Number(cell(45)) || 0;
  if (cash < -0.5) add("neg:cash", "投資現金是負的（" + healthMoney_(cash) + "）");
  if (life < -0.5) add("neg:life", "生活帳戶是負的（" + healthMoney_(life) + "）");
  if (principal < -0.5) add("neg:principal", "淨投入本金是負的（" + healthMoney_(principal) + "）");
  [14, 15, 24, 29, 30, 31, 32, 33, 34, 35, 36].forEach(function (r) {
    var d = blkD[r - 12][1], f = blkF[r - 12][1];
    if (healthIsErr_(d)) { add("err:" + r, "「" + label(r) + "」顯示錯誤（" + d + "）"); return; }
    if (!String(blk[r - 12][0] || "").trim()) return; // 這一列沒有標題：版面不同，不檢查
    if (!f) add("formula:" + r, "「" + label(r) + "」應該是公式，現在是固定的數字，之後不會自己更新");
  });

  // ---------- 總資產重算：持股市值＋投資現金＋另類資產＋生活帳戶 ----------
  var altSum = 0, alt = ss.getSheetByName("另類資產");
  if (alt && alt.getLastRow() >= 2) alt.getRange(2, 3, alt.getLastRow() - 1, 1).getValues().forEach(function (r) { altSum += Number(r[0]) || 0; });
  var recomputed = stockValue + cash + altSum + life;
  if (!issues.some(function (x) { return /^(price|err:14|formula:14)/.test(x.key); }) && total > 0 && Math.abs(recomputed - total) > Math.max(50, total * 0.001)) {
    add("total", "總資產顯示 " + healthMoney_(total) + "，但用持股市值＋投資現金＋另類資產＋生活帳戶重算是 " + healthMoney_(recomputed) + "，差 " + healthMoney_(total - recomputed));
  }

  // ---------- 交易紀錄：持股對不對得上、手續費、重複、日期 ----------
  var tradeSum = {}, tsh = ss.getSheetByName("交易紀錄");
  if (tsh && tsh.getLastRow() >= 2) {
    var tr = tsh.getRange(2, 1, tsh.getLastRow() - 1, 9).getValues(), prev = null;
    tr.forEach(function (r, i) {
      var c = String(r[1]).trim(), type = String(r[8]).trim(), q = Math.abs(Number(r[2]) || 0);
      if (!c && !type) return;
      if (type === "買進") tradeSum[c] = (tradeSum[c] || 0) + q; else if (type === "賣出") tradeSum[c] = (tradeSum[c] || 0) - q;
      var d = r[0];
      if (!(d instanceof Date) || isNaN(d.getTime())) { add("tdate:" + (i + 2), "交易紀錄第 " + (i + 2) + " 列的日期不是日期格式"); prev = null; return; }
      if (d.getTime() > now.getTime() + 86400000) add("tfuture:" + (i + 2), "交易紀錄第 " + (i + 2) + " 列的日期是未來（" + Utilities.formatDate(d, tz, "yyyy/MM/dd") + "）");
      if (type === "買進" && Math.abs(Number(r[4]) || 0) >= 2000 && !(Number(r[5]) > 0)) add("fee0:" + (i + 2), "交易紀錄第 " + (i + 2) + " 列買進 " + c + " 的手續費是 0");
      if (prev && prev.c === c && prev.type === type && prev.q === q && Number(prev.p) === Number(r[3]) && Math.abs(d.getTime() - prev.t) <= 120000)
        add("tdup:" + (i + 2), "交易紀錄第 " + (i + 1) + "、" + (i + 2) + " 列一模一樣（" + type + " " + c + " " + q + " 股），可能重複送出");
      prev = { c: c, type: type, q: q, p: r[3], t: d.getTime() };
    });
  }
  var baseHold = base.hold || (base.hold = {});
  Object.keys(hold).forEach(function (c) {
    var off = hold[c] - (tradeSum[c] || 0);
    if (baseHold[c] === undefined) { baseHold[c] = off; return; }
    var diff = off - baseHold[c];
    if (Math.abs(diff) > 1e-9) add("hold:" + c, c + " 的持股跟交易紀錄對不上：持股比紀錄算出來的" + (diff > 0 ? "多 " : "少 ") + Math.abs(diff) + " 股（可能有交易漏記，或直接改了試算表）");
  });

  // ---------- 收支紀錄：日期、重複（只看最近 300 筆）----------
  var lsh = ss.getSheetByName("收支紀錄");
  if (lsh && lsh.getLastRow() >= 2) {
    var last = lsh.getLastRow(), start = Math.max(2, last - 299);
    var lr = lsh.getRange(start, 1, last - start + 1, 5).getValues(), lp = null;
    lr.forEach(function (r, i) {
      var row = start + i, d = r[0];
      if (!String(r[1]).trim() && !Number(r[3])) return;
      if (!(d instanceof Date) || isNaN(d.getTime())) { add("ldate:" + row, "收支紀錄第 " + row + " 列的日期不是日期格式，月統計會漏掉這一筆"); lp = null; return; }
      if (d.getTime() > now.getTime() + 86400000) add("lfuture:" + row, "收支紀錄第 " + row + " 列的日期是未來（" + Utilities.formatDate(d, tz, "yyyy/MM/dd") + "）");
      var sig = [r[1], r[2], Number(r[3]), r[4]].join("|");
      if (lp && lp.sig === sig && Math.abs(d.getTime() - lp.t) <= 60000) add("ldup:" + row, "收支紀錄第 " + (row - 1) + "、" + row + " 列一模一樣（" + r[1] + " " + r[2] + " " + healthMoney_(Number(r[3])) + "），可能重複送出");
      lp = { sig: sig, t: d.getTime() };
    });
  }

  // ---------- 帳戶的錢 vs 系統記錄的錢 ----------
  try {
    var accs = waAccountBalances_(ss).filter(function (a) { return a.scope !== "生意"; });
    if (accs.length) {
      var net = {};
      try { var fxd = typeof waFxData_ === "function" ? waFxData_(ss) : null; net = (fxd && fxd.twdNetByRole) || {}; } catch (fxe) { Logger.log(fxe); }
      var accTotal = 0, savingNames = {};
      accs.forEach(function (a) {
        var role = a.role || "混用";
        if (role === "儲蓄") { savingNames[a.name] = 1; return; }
        accTotal += a.scope === "中轉" ? (a.ownPart || 0) : a.balance;
      });
      ["投資", "生活", "混用", "中轉"].forEach(function (role) { accTotal += Math.round(net[role] || 0); });
      var accDiff = Math.round((accTotal - (cash + life)) * 100) / 100;
      // 這段時間有「校正」或動到儲蓄帳戶的流水：差額本來就會變，直接以現在為準
      var legit = false;
      if (sinceMs && typeof waFlowRows_ === "function") waFlowRows_(ss).forEach(function (r) {
        if (!(r[0] instanceof Date) || r[0].getTime() <= sinceMs) return;
        if (String(r[1]).trim() === "校正" || savingNames[String(r[2]).trim()] || savingNames[String(r[3]).trim()]) legit = true;
      });
      if (base.acc === undefined || legit) base.acc = accDiff;
      else if (Math.abs(accDiff - base.acc) > 1) {
        var dAcc = accDiff - base.acc;
        add("acc", "帳戶餘額跟系統記錄（投資現金＋生活帳戶）對不上：跟上次檢查比，帳戶這邊" + (dAcc > 0 ? "多了 " : "少了 ") + healthMoney_(Math.abs(dAcc)) + " 元。可能有一筆只記了一邊");
      }
    }
  } catch (accErr) { Logger.log("健檢：帳戶對帳失敗：" + accErr); }

  return { issues: issues, base: base };
}

// 跑一次健檢並存結果。opt.rebase＝「這些是正常的，以現在為準」
function healthRun_(opt) {
  opt = opt || {};
  var ss = SS_();
  try { if (typeof waFeeStatsFix_ === "function") waFeeStatsFix_(ss); } catch (e0) { Logger.log(e0); }
  var st = healthState_();
  var m = healthMeasure_(ss, opt.rebase ? {} : st.base, st.at || 0);
  var acked = st.acked || {};
  if (opt.rebase) m.issues.forEach(function (x) { acked[x.key] = 1; });
  var issues = m.issues.filter(function (x) { return !acked[x.key]; });
  var before = {};
  (st.issues || []).forEach(function (x) { before[x.key] = 1; });
  var fresh = issues.filter(function (x) { return !before[x.key]; });
  var out = { at: Date.now(), issues: issues, base: m.base, acked: acked };
  healthSave_(out);
  return { at: out.at, issues: issues.slice(0, 20), fresh: fresh };
}

// 給 App：上次檢查的結果（不重新檢查，很快）
function waHealthData_() {
  var st = healthState_();
  return { at: st.at || 0, issues: st.issues || [] };
}
// App 按「現在檢查」／「以現在為準」
WA_READ_ONLY_.waHealthRun = 1;
function waHealthRun(p) {
  var r = healthRun_({ rebase: !!(p && p.rebase) });
  return { at: r.at, issues: r.issues };
}

// 每日排程用：有新的問題才寄信
function healthDaily_() {
  var r = healthRun_();
  if (!r.fresh.length) return;
  var body = "資料健檢發現 " + r.fresh.length + " 個新的問題：\n\n" + r.fresh.map(function (x) { return "・" + x.msg; }).join("\n") +
    "\n\n系統只提醒，不會自己改數字。打開 App → 設定 → 資料健檢 可以看全部，確認是正常的話按「以現在為準」。";
  try { SEND_MAIL_(NOTIFY_EMAIL_(), "資料健檢：有 " + r.fresh.length + " 個地方對不上", body); } catch (e) { Logger.log(e); }
}


// ==================== Plan2.gs ====================
// ============================================================
// 兩套組合：退休前用「現在的組合」（比較積極的 ETF），
// 退休前 N 年（預設 10 年）開始，每年把目標比例往「退休組合」移一點，退休前一年剛好換完。
// - 存在指令碼屬性 PLAN2：{ on, years, A: { codes: {代號: 比例}, cash }, B: { codes: {...}, cash }, stage }
// - 工作表1 F 欄（目標比例）由這裡算好寫進去：目標 = (1−t)×現在的組合 ＋ t×退休組合
//   t = (今年年紀 − 開始年紀 + 1) ÷ N，介於 0～1（55 歲 10%、56 歲 20% … 64 歲 100%）
// - 不會自動賣：只改目標比例，試算會照新的目標建議買（超過目標的那一檔才會建議賣一些）
// - 每次往前一年：首頁顯示、寄一封通知信
// ============================================================
var PLAN2_PROP_ = "PLAN2";

function plan2Get_() {
  try { var o = JSON.parse(PROPS_().getProperty(PLAN2_PROP_) || "null"); if (o && o.A && o.B) return o; } catch (e) {}
  return null;
}
function plan2Save_(o) { PROPS_().setProperty(PLAN2_PROP_, JSON.stringify(o)); }

// 今年進行到哪：{ age, retireAge, startAge, years, t }
function plan2Progress_(o) {
  o = o || plan2Get_();
  var years = Math.max(1, Math.min(30, Math.round(Number(o && o.years) || 10)));
  var age = 0, retireAge = 0;
  try {
    var r = SS_().getSheetByName(RETIRE_SHEET_);
    if (r) { var v = r.getRange("B2:B4").getValues(); age = waNum_(v[0][0]); retireAge = waNum_(v[2][0]); }
  } catch (e) {}
  if (!(age > 0 && retireAge > 0)) return { age: age, retireAge: retireAge, startAge: 0, years: years, t: 0, noAge: true };
  var startAge = retireAge - years;
  var t = Math.max(0, Math.min(1, (age - startAge + 1) / years));
  return { age: age, retireAge: retireAge, startAge: startAge, years: years, t: Math.round(t * 1000) / 1000 };
}

// 混合後的目標：{ codes: {代號: 比例}, cash }
function plan2Mix_(o, t) {
  var out = {}, k;
  for (k in o.A.codes) out[k] = (out[k] || 0) + (1 - t) * Number(o.A.codes[k] || 0);
  for (k in o.B.codes) out[k] = (out[k] || 0) + t * Number(o.B.codes[k] || 0);
  for (k in out) out[k] = Math.round(out[k] * 10000) / 10000;
  return { codes: out, cash: Math.round(((1 - t) * Number(o.A.cash || 0) + t * Number(o.B.cash || 0)) * 10000) / 10000 };
}

// 把目標寫進工作表1。notify＝每日排程呼叫：進到新的一年就寄信
function plan2Apply_(notify) {
  var o = plan2Get_();
  if (!o || !o.on) return null;
  var ss = SS_(), sh = ss.getSheetByName("工作表1");
  var pg = plan2Progress_(o), mix = plan2Mix_(o, pg.t);
  var L = LAY();
  var codes = sh.getRange(2, 1, L.n, 1).getValues().map(function (r) { return String(r[0]).trim(); });
  // 退休組合裡要買、但工作表1 還沒有的標的：放進空的核心欄位（不夠就多開一個），才會算建議買幾股
  var added = [];
  Object.keys(mix.codes).forEach(function (c) {
    if (!(mix.codes[c] > 0) || codes.indexOf(c) >= 0) return;
    var idx = -1;
    for (var i = 0; i < L.core; i++) if (!codes[i]) { idx = i; break; }
    if (idx < 0) {
      waAddSlot({ group: "core" });
      L = LAY();
      codes = sh.getRange(2, 1, L.n, 1).getValues().map(function (r) { return String(r[0]).trim(); });
      for (var j = 0; j < L.core; j++) if (!codes[j]) { idx = j; break; }
      if (idx < 0) return;
    }
    sh.getRange(idx + 2, 1).setValue(c);
    codes[idx] = c;
    added.push(c);
  });
  var vals = codes.map(function (c) { return [c ? (mix.codes[c] || 0) : 0]; });
  sh.getRange(2, 6, L.n, 1).setValues(vals);
  sh.getRange(R_(10), 6).setValue(mix.cash);
  if (added.length) { try { syncTradeFormCodes(); } catch (e) { Logger.log(e); } try { fixPriceFormulas_(); } catch (e2) { Logger.log(e2); } }

  // 進到新的一年：記下來，寄信通知
  var stage = Math.round(pg.t * pg.years);
  if (notify && stage > (Number(o.stage) || 0)) {
    o.stage = stage; plan2Save_(o);
    try {
      waApplyCodeNames_();
      var nm = function (c) { return (WA_NAMES_[c] || "") + " " + String(c).replace("TPE:", ""); };
      var lines = Object.keys(mix.codes).filter(function (c) { return mix.codes[c] > 0; })
        .sort(function (a, b) { return mix.codes[b] - mix.codes[a]; })
        .map(function (c) { return "  " + nm(c) + "：" + (mix.codes[c] * 100).toFixed(1) + "%"; });
      var body = (stage >= pg.years ? "已經完全換成退休組合了。" : "今年開始換第 " + stage + " 年（共 " + pg.years + " 年），目標比例已經往退休組合移了 " + Math.round(pg.t * 100) + "%。") +
        "\n\n新的目標比例：\n" + lines.join("\n") + "\n  現金：" + (mix.cash * 100).toFixed(1) + "%\n\n" +
        "App 不會自動賣股票。之後新的錢會優先買退休組合缺的部分；超過目標太多的那一檔，試算會建議賣一些，要不要賣你自己決定。";
      SEND_MAIL_(NOTIFY_EMAIL_(), "退休組合轉換：" + (stage >= pg.years ? "已完成" : "第 " + stage + "／" + pg.years + " 年"), body);
    } catch (me) { Logger.log("退休組合通知信失敗：" + me); }
  } else if (stage < (Number(o.stage) || 0)) { o.stage = stage; plan2Save_(o); } // 改了退休年齡往後延
  return { t: pg.t, added: added };
}

// 給 App 看的狀態
function plan2Data_() {
  var o = plan2Get_();
  if (!o || !o.on) return null;
  var pg = plan2Progress_(o);
  return { on: true, years: pg.years, age: pg.age, retireAge: pg.retireAge, startAge: pg.startAge, t: pg.t, noAge: !!pg.noAge,
    A: o.A, B: o.B, now: plan2Mix_(o, pg.t) };
}


// ==================== BizBind.gs ====================
// ============================================================
// 個人記帳的分類「綁定生意」：例如「芝妮雅」是店裡的開銷，在記帳選它就自動記成生意支出
// - 綁定的分類存在指令碼屬性 BIZ_BOUND_CATS（陣列）
// - 付款帳戶是中轉／生意帳戶：直接記一筆生意費用，從那個帳戶出
// - 付款帳戶是個人的（例如現金）：錢確實從個人出去了，所以個人那邊記一筆「代墊生意」
//   （一次性、不算個人花費、不吃每週額度），生意那邊記一筆費用（不經過帳戶，只算進報表）
// - 設定綁定時可以把過去的紀錄一起移過去（同樣變成「代墊生意」＋生意費用，日期照原本的）
// ============================================================
var BIZ_BOUND_PROP_ = "BIZ_BOUND_CATS";
var BIZ_ADVANCE_CAT_ = "代墊生意";

function bizBoundList_() {
  try { var a = JSON.parse(PROPS_().getProperty(BIZ_BOUND_PROP_) || "[]"); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; }
}
function bizIsBound_(cat) { cat = String(cat || "").trim(); return !!cat && bizBoundList_().indexOf(cat) >= 0; }
function bizReady_(ss) { return typeof BIZ_SHEETS_ !== "undefined" && !!(ss || SS_()).getSheetByName(BIZ_SHEETS_.product[0]); }

// 記帳選到綁定的分類：改記成生意支出。回傳跟 waSubmitLedger 一樣的格式
function bizBoundSubmit_(p) {
  var ss = SS_(), cat = String(p.category).trim(), note = String(p.note || "").trim();
  var account = waCheckAccountName_(p.account);
  var scope = "個人";
  waAccountList_(ss).forEach(function (a) { if (a.name === account) scope = a.scope || "個人"; });
  var day = String(p.date || "").trim();
  if (scope === "中轉" || scope === "生意") {
    if (String(p.currency || "TWD").toUpperCase() !== "TWD") throw new Error("生意支出請用台幣記");
    waBizRecord({ kind: "expense", category: cat, amount: Number(p.amount), note: note, account: account, date: day, _noDash: true });
    return { message: cat + " " + Math.round(Number(p.amount)).toLocaleString() + " 元已記成生意支出", detail: "從 " + account + " 付", dashboard: p._noDash ? null : waGetDashboard() };
  }
  // 個人的錢付：個人記「代墊生意」，生意記費用（不經過帳戶）
  var r = waSubmitLedger({ type: "支出", amount: p.amount, category: BIZ_ADVANCE_CAT_, oneTime: true, note: cat + (note ? "：" + note : ""),
    account: account, date: day, currency: p.currency, _bound: true, _noDash: true });
  var led = ss.getSheetByName("收支紀錄"), twd = Number(p.amount);
  try { var last = led.getRange(led.getLastRow(), 1, 1, 4).getValues()[0]; if (String(last[2]) === BIZ_ADVANCE_CAT_) twd = waNum_(last[3]) || twd; } catch (e) {}
  try {
    waBizRecord({ kind: "expense", category: cat, amount: twd, account: "__none__", note: "個人「" + account + "」代付" + (note ? "・" + note : ""), date: day, _noDash: true });
  } catch (be) {
    throw new Error("個人那邊已經記了「代墊生意」，但生意那邊沒有記成功：" + (be && be.message ? be.message : be));
  }
  return { message: cat + " " + Math.round(twd).toLocaleString() + " 元已記成生意支出", detail: "用個人的「" + account + "」付，記成代墊生意，不算個人花費", dashboard: p._noDash ? null : waGetDashboard() };
}

// 過去有幾筆（給 App 問要不要一起移）
function waBizBoundPreview(p) {
  var cat = String(p && p.category || "").trim();
  var led = SS_().getSheetByName("收支紀錄"), n = 0, sum = 0;
  if (cat && led && led.getLastRow() >= 2) led.getRange(2, 2, led.getLastRow() - 1, 3).getValues().forEach(function (r) {
    if (String(r[0]).trim() === "支出" && String(r[1]).trim() === cat) { n++; sum += waNum_(r[2]); }
  });
  return { category: cat, count: n, sum: Math.round(sum) };
}

// 設定／取消綁定。p: { category, on, migrate }
function waSetBizBound(p) {
  var ss = SS_(), cat = String(p && p.category || "").trim();
  if (!cat) throw new Error("請選分類");
  if (cat === BIZ_ADVANCE_CAT_) throw new Error("這個分類不能設");
  if (p.on && !bizReady_(ss)) throw new Error("還沒有開生意功能");
  var list = bizBoundList_().filter(function (c) { return c !== cat; });
  if (p.on) list.push(cat);
  PROPS_().setProperty(BIZ_BOUND_PROP_, JSON.stringify(list));
  if (!p.on) return { message: "「" + cat + "」改回個人支出", detail: "以前移到生意的紀錄不會移回來", dashboard: waGetDashboard() };

  var moved = 0, total = 0;
  if (p.migrate) {
    var lock = LOCK_();
    lock.waitLock(20000);
    try {
      var led = ss.getSheetByName("收支紀錄");
      var last = led ? led.getLastRow() : 0;
      if (last >= 2) {
        var rows = led.getRange(2, 1, last - 1, 6).getValues(), bizRows = [];
        var fsh = ss.getSheetByName(WA_FLOW_SHEET_);
        rows.forEach(function (r, i) {
          if (String(r[1]).trim() !== "支出" || String(r[2]).trim() !== cat) return;
          var row = i + 2, amt = waNum_(r[3]), note = String(r[4] || "").trim();
          // 帳戶流水那一筆的標籤也跟著改（以後修改、撤銷才找得到）
          try {
            var fr = waLedgerFlowRow_(ss, { date: r[0], type: "支出", category: cat, amount: amt });
            if (fr > 0 && fsh) fsh.getRange(fr, 4).setValue("支出:" + BIZ_ADVANCE_CAT_);
          } catch (fe) { Logger.log(fe); }
          led.getRange(row, 3).setValue(BIZ_ADVANCE_CAT_);
          led.getRange(row, 5, 1, 2).setValues([[cat + (note ? "：" + note : ""), "是"]]);
          var d = r[0] instanceof Date ? new Date(Math.floor(r[0].getTime() / 1000) * 1000) : new Date();
          bizRows.push([d, cat, amt, "（補登）", "個人代付（從記帳移過來）" + (note ? "・" + note : "")]);
          moved++; total += amt;
        });
        if (bizRows.length) {
          var bsh = bizSheet_(ss, "expense");
          bsh.getRange(bsh.getLastRow() + 1, 1, bizRows.length, 5).setValues(bizRows);
        }
      }
    } finally { lock.releaseLock(); }
    // 「本月已花」和每週額度是存好的數字，要重新算一次才會扣掉移走的那些
    if (moved || p.refresh !== false) { try { refreshLifeAccountDisplayV2_(ss); } catch (re) { Logger.log("本月已花重算失敗：" + re); } }
  }
  return { message: "「" + cat + "」以後會記成生意支出", detail: moved ? "過去 " + moved + " 筆共 " + Math.round(total).toLocaleString() + " 元也移到生意了（個人那邊變成「代墊生意」，不算個人花費）" : "",
    dashboard: waGetDashboard() };
}
WA_READ_ONLY_.waBizBoundPreview = 1;


// ==================== Recon.gs ====================
// ============================================================
// 找差額：對帳（系統記錄 vs 帳戶合計）對不上的時候，一筆一筆比對，找出是哪幾筆造成的
// - 收支紀錄的每一筆，帳戶流水裡應該有一筆「收入:分類／支出:分類」同金額、同時間（15 分鐘內）
// - 交易紀錄的每一筆，帳戶流水裡應該有一筆「買股／賣股」同金額
// - 反過來，帳戶流水裡有、但收支紀錄或交易紀錄沒有的
// - 校正：帳戶餘額直接改成實際金額，跟系統記錄的差多少就會變成差額（最近 90 天列出來）
// 對帳的「差額」＝帳戶合計 − 系統記錄。每一項會寫它讓差額變多少（＋帳戶比較多／−帳戶比較少）
// ============================================================
function waReconDiag() {
  var ss = SS_(), items = [];
  var flowSh = ss.getSheetByName(WA_FLOW_SHEET_);
  var flows = flowSh && flowSh.getLastRow() >= 2 ? flowSh.getRange(2, 1, flowSh.getLastRow() - 1, 6).getValues() : [];
  var used = {}, firstFlow = null;
  flows.forEach(function (r) { if (r[0] instanceof Date && (!firstFlow || r[0] < firstFlow)) firstFlow = r[0]; });
  if (!firstFlow) return { items: [], sum: 0, note: "還沒有帳戶流水，沒辦法比對" };
  // 記帳會比帳戶流水早幾秒寫進去：第一筆記帳可能比第一筆流水早一點點，往前放寬 15 分鐘（不然第一筆會被誤報成「記帳裡找不到」）
  var floorT = new Date(firstFlow.getTime() - 15 * 60000);
  var scopeOf = {}, roleOf = {};
  waAccountList_(ss).forEach(function (a) { scopeOf[a.name] = a.scope || "個人"; roleOf[a.name] = a.role || "混用"; });
  var personal = function (acc) { acc = String(acc || "").trim(); if (acc.indexOf("外幣:") === 0) return true; var sc = scopeOf[acc]; return (sc === "個人" || sc === "中轉" || !sc) && roleOf[acc] !== "儲蓄"; };
  var fmt = function (d) { return d instanceof Date ? Utilities.formatDate(d, WA_TZ_, "yyyy/MM/dd HH:mm") : String(d); };
  var find = function (when, types, amount, match) {
    if (!(when instanceof Date)) return -1;
    var best = -1, gap = 15 * 60000;
    for (var i = 0; i < flows.length; i++) {
      if (used[i]) continue;
      var r = flows[i];
      if (!(r[0] instanceof Date) || types.indexOf(String(r[1]).trim()) < 0) continue;
      if (Math.abs(waNum_(r[4]) - amount) > 1) continue;
      if (match && !match(r)) continue;
      var g = Math.abs(r[0].getTime() - when.getTime());
      if (g <= gap) { best = i; gap = g; }
    }
    if (best >= 0) used[best] = 1;
    return best;
  };
  // 1. 收支紀錄 ↔ 帳戶流水
  var led = ss.getSheetByName("收支紀錄");
  if (led && led.getLastRow() >= 2) led.getRange(2, 1, led.getLastRow() - 1, 6).getValues().forEach(function (r, i) {
    var type = String(r[1]).trim();
    if ((type !== "收入" && type !== "支出") || !(r[0] instanceof Date) || r[0] < floorT) return;
    if (/^對帳差額（|^對帳：/.test(String(r[4] || ""))) return; // 補記校正差額的那筆：本來就沒有帳戶進出
    var amt = waNum_(r[3]), cat = String(r[2]).trim(), tag = type + ":" + cat;
    var hit = find(r[0], [type], amt, function (f) { return String(f[2]) === tag || String(f[3]) === tag; });
    if (hit < 0) hit = find(r[0], [type], amt, null); // 分類後來改過也算
    if (hit < 0) items.push({ kind: "led", row: i + 2, date: fmt(r[0]), title: type + " " + cat + (r[4] ? "・" + r[4] : ""),
      why: "記帳有這筆，但帳戶裡沒有" + (type === "支出" ? "扣錢" : "進錢"), effect: type === "支出" ? amt : -amt });
  });
  // 2. 交易紀錄 ↔ 帳戶流水
  var tl = ss.getSheetByName("交易紀錄");
  if (tl && tl.getLastRow() >= 2) tl.getRange(2, 1, tl.getLastRow() - 1, 9).getValues().forEach(function (r, i) {
    var type = String(r[8]).trim(), code = String(r[1]).trim();
    if ((type !== "買進" && type !== "賣出") || !(r[0] instanceof Date) || r[0] < floorT) return;
    var net = Math.abs(waNum_(r[7]));
    var hit = find(r[0], [type === "買進" ? "買股" : "賣股"], net, function (f) { return String(type === "買進" ? f[3] : f[2]).indexOf(code) >= 0; });
    if (hit < 0) items.push({ kind: "trade", row: i + 2, date: fmt(r[0]), title: type + " " + (WA_NAMES_[code] || code) + " " + Math.abs(waNum_(r[2])) + " 股",
      why: "交易紀錄有這筆，但帳戶裡沒有" + (type === "買進" ? "扣錢" : "進錢"), effect: type === "買進" ? net : -net });
  });
  // 3. 帳戶流水有、記帳或交易沒有（只看個人帳戶）
  flows.forEach(function (r, i) {
    if (used[i] || !(r[0] instanceof Date)) return;
    var t = String(r[1]).trim(), from = String(r[2]), to = String(r[3]), amt = waNum_(r[4]);
    if (t === "支出" && personal(from) && to.indexOf("支出:") === 0) items.push({ kind: "flow", row: i + 2, date: fmt(r[0]), title: from + " → " + to, why: "帳戶扣了錢，但記帳裡找不到這筆", effect: -amt });
    else if (t === "收入" && personal(to) && from.indexOf("收入:") === 0) items.push({ kind: "flow", row: i + 2, date: fmt(r[0]), title: from + " → " + to, why: "帳戶進了錢，但記帳裡找不到這筆", effect: amt });
    else if (t === "買股" && personal(from)) items.push({ kind: "flow", row: i + 2, date: fmt(r[0]), title: from + " → " + to, why: "帳戶扣了買股的錢，但交易紀錄找不到這筆（可能撤銷了交易）", effect: -amt });
    else if (t === "賣股" && personal(to)) items.push({ kind: "flow", row: i + 2, date: fmt(r[0]), title: from + " → " + to, why: "帳戶進了賣股的錢，但交易紀錄找不到這筆", effect: amt });
  });
  // 4. 最近 90 天的校正
  var since = new Date(Date.now() - 90 * 86400000);
  flows.forEach(function (r, i) {
    if (String(r[1]).trim() !== "校正" || !(r[0] instanceof Date) || r[0] < since) return;
    var to = String(r[3]), from = String(r[2]), amt = waNum_(r[4]);
    var acc = from.indexOf("校正:") === 0 ? to : from, sign = from.indexOf("校正:") === 0 ? 1 : -1;
    if (!personal(acc)) return;
    var first = Math.abs(r[0].getTime() - firstFlow.getTime()) < 3600000; // 第一次設定帳戶餘額（期初）
    var done = /已補記/.test(String(r[5]));
    var why = first ? "第一次設定帳戶餘額，不用管" : done ? "已經補記過了"
      : sign < 0 ? "這天把帳戶改成實際金額，比系統以為的少 $" + Math.round(amt).toLocaleString() + "，代表這段時間有錢出去但沒記到"
      : "這天把帳戶改成實際金額，比系統以為的多 $" + Math.round(amt).toLocaleString() + "，代表有錢進來但沒記到";
    items.push({ kind: "calib", row: i + 2, date: fmt(r[0]), title: "校正 " + acc + "（" + String(r[5] || "").replace(/（已補記.*$/, "") + "）", first: first, done: done, why: why, effect: sign * amt });
  });
  // 5. 上次「對齊」：那之前的差額都已經一起處理掉了，不再算進來（不然會重複算，看起來比實際亂）
  var alignAt = null;
  if (led && led.getLastRow() >= 2) led.getRange(2, 1, led.getLastRow() - 1, 5).getValues().forEach(function (r) {
    if (r[0] instanceof Date && /^對帳：系統記錄對齊/.test(String(r[4] || "")) && (!alignAt || r[0] > alignAt)) alignAt = r[0];
  });
  var toT = function (d) { var m = String(d).match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/); return m ? new Date(m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":00+08:00").getTime() : 0; };
  if (alignAt) items.forEach(function (x) {
    if (toT(x.date) > alignAt.getTime()) return;
    x.covered = true;
    if (x.kind === "calib" && !x.first && !x.done) { x.done = true; x.why = Utilities.formatDate(alignAt, WA_TZ_, "M/d") + " 已經用「對齊」一起處理過"; }
  });
  // 6. 帳戶功能改過（例如「生意」改成「中轉」）：算進個人對帳的錢會跟著變，這也會讓差額變動
  var roleLog = [];
  try { roleLog = JSON.parse(PROPS_().getProperty("ACC_ROLE_LOG") || "[]"); } catch (le) {}
  roleLog.forEach(function (x) {
    var d = new Date(x.t);
    if (alignAt && d <= alignAt) return;
    var eff = Math.round((Number(x.after) - Number(x.before)) * 100) / 100;
    if (Math.abs(eff) < 1) return;
    items.push({ kind: "role", row: 0, date: fmt(d), title: x.name + "：「" + x.from + "」改成「" + x.to + "」",
      why: eff > 0 ? "改了之後，這個帳戶有 $" + Math.round(eff).toLocaleString() + " 開始算進個人對帳" : "改了之後，這個帳戶有 $" + Math.round(-eff).toLocaleString() + " 不再算進個人對帳", effect: eff });
  });
  items.forEach(function (x) { x.effect = Math.round(x.effect * 100) / 100; });
  var sum = Math.round(items.filter(function (x) { return x.kind !== "calib" && x.kind !== "role" && !x.covered; }).reduce(function (a, x) { return a + x.effect; }, 0));
  return { items: items, sum: sum, since: fmt(firstFlow), alignAt: alignAt ? Utilities.formatDate(alignAt, WA_TZ_, "yyyy/MM/dd HH:mm") : "" };
}
WA_READ_ONLY_.waReconDiag = 1;

// 把一筆校正的差額補記成收支：系統記錄跟著調整，帳戶不再動（帳戶已經是校正後的實際金額）
// p: { row（帳戶流水的列號）, category }
function waReconAbsorb(p) {
  var ss = SS_(), fsh = ss.getSheetByName(WA_FLOW_SHEET_);
  var row = Number(p && p.row);
  if (!fsh || !(row >= 2 && row <= fsh.getLastRow())) throw new Error("找不到這筆校正，請重新整理");
  var r = fsh.getRange(row, 1, 1, 6).getValues()[0];
  if (String(r[1]).trim() !== "校正") throw new Error("這筆不是校正");
  if (/已補記/.test(String(r[5]))) throw new Error("這筆已經補記過了");
  var from = String(r[2]), to = String(r[3]), amt = waNum_(r[4]);
  var up = from.indexOf("校正:") === 0, acc = up ? to : from;
  if (acc.indexOf("外幣:") === 0) acc = acc.slice(3).replace(/\s+\S+$/, ""); // 外幣的校正：記帳時用那家銀行（帳戶進出之後會刪掉）
  // adjust＝不是真的花掉／賺到（數錯、一開始設定就對不上）：記成「帳務調整」，一次性、不算進收支統計
  var adj = !!p.adjust;
  var type = up ? "收入" : "支出", cat = adj ? "帳務調整" : (String(p.category || "").trim() || "其他");
  var day = Utilities.formatDate(r[0] instanceof Date ? r[0] : new Date(), WA_TZ_, "yyyy-MM-dd");
  var today = Utilities.formatDate(new Date(), WA_TZ_, "yyyy-MM-dd");
  waSubmitLedger({ type: type, amount: amt, category: cat, oneTime: adj, note: "對帳差額（" + acc + " " + day.slice(5).replace("-", "/") + " 校正）", account: acc, date: day === today ? "" : day, _noDash: true, _bound: adj });
  // 記帳會順手記一筆帳戶進出，但帳戶已經校正成實際金額了 → 把那筆刪掉，只留系統記錄的調整
  var led = ss.getSheetByName("收支紀錄"), lr = led.getRange(led.getLastRow(), 1, 1, 4).getValues()[0];
  var fr = waLedgerFlowRow_(ss, { date: lr[0], type: type, category: cat, amount: amt });
  if (fr > 0) fsh.deleteRow(fr);
  var cr = fr > 0 && fr < row ? row - 1 : row;
  fsh.getRange(cr, 6).setValue(String(r[5] || "") + "（已補記成" + type + "）");
  return { message: "已補記 " + type + " " + cat + " $" + Math.round(amt).toLocaleString(), detail: "系統記錄跟著調整，帳戶餘額不變，差額會少掉這筆", dashboard: waGetDashboard() };
}

// 把系統記錄（投資現金＋生活帳戶）整個對齊帳戶合計：記一筆「帳務調整」（一次性、不算收支統計、不動帳戶）
// 用在一開始設定就對不上（例如生意的錢被算進投資現金）。p: { amount（＝帳戶合計−系統記錄，App 算好的差額）, account（任一個人帳戶，只是記帳要填，帳戶不會動）}
function waReconAlign(p) {
  var amt = Math.round(Number(p && p.amount) * 100) / 100;
  if (!amt) throw new Error("差額是 0，不用調");
  var ss = SS_(), fsh = ss.getSheetByName(WA_FLOW_SHEET_);
  var type = amt > 0 ? "收入" : "支出", a = Math.abs(amt), acc = waCheckAccountName_(p.account);
  waSubmitLedger({ type: type, amount: a, category: "帳務調整", oneTime: true, note: "對帳：系統記錄對齊帳戶合計（" + (amt > 0 ? "+" : "−") + Math.round(a).toLocaleString() + "）", account: acc, _noDash: true, _bound: true });
  var led = ss.getSheetByName("收支紀錄"), lr = led.getRange(led.getLastRow(), 1, 1, 4).getValues()[0];
  var fr = waLedgerFlowRow_(ss, { date: lr[0], type: type, category: "帳務調整", amount: a });
  if (fr > 0 && fsh) fsh.deleteRow(fr); // 帳戶不動，只調系統記錄
  return { message: "系統記錄已對齊帳戶", detail: "投資現金" + (amt > 0 ? "加" : "減") + " $" + Math.round(a).toLocaleString() + "（淨投入本金一起調），差額歸零", dashboard: waGetDashboard() };
}

// 一次對所有帳戶：列出每個帳戶 App 記的餘額、上次校正是哪天（從沒校正過的排前面，最可能對不上）
function waAccountCheckData() {
  var ss = SS_(), fsh = ss.getSheetByName(WA_FLOW_SHEET_);
  var flows = fsh && fsh.getLastRow() >= 2 ? fsh.getRange(2, 1, fsh.getLastRow() - 1, 4).getValues() : [];
  var last = {}, cnt = {};
  flows.forEach(function (r) {
    var a = String(r[2]).trim(), b = String(r[3]).trim();
    [a, b].forEach(function (n) { cnt[n] = (cnt[n] || 0) + 1; });
    if (String(r[1]).trim() !== "校正" || !(r[0] instanceof Date)) return;
    var acc = a.indexOf("校正:") === 0 ? b : a;
    if (!last[acc] || r[0] > last[acc]) last[acc] = r[0];
  });
  var list = waAccountBalances_(ss).filter(function (a) { return a.active || Math.abs(a.balance) > 0.5; }).map(function (a) {
    var d = last[a.name];
    return { name: a.name, scope: a.scope || "個人", role: a.role || "", balance: Math.round(a.balance * 100) / 100,
      lastCalib: d ? Utilities.formatDate(d, WA_TZ_, "yyyy/MM/dd") : "", days: d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null, moves: cnt[a.name] || 0 };
  });
  list.sort(function (x, y) {
    var nx = x.lastCalib ? 1 : 0, ny = y.lastCalib ? 1 : 0;
    if (nx !== ny) return nx - ny;                       // 從沒校正過的排前面
    if (x.lastCalib !== y.lastCalib) return x.lastCalib < y.lastCalib ? -1 : 1; // 越久沒校正越前面
    return Math.abs(y.balance) - Math.abs(x.balance);
  });
  var fx = [];
  try {
    if (typeof fxRows_ === "function") {
      var rates = fxRates_().rates || {};
      fx = fxRows_(ss).map(function (x) {
        var rate = x.manual > 0 ? x.manual : (rates[x.code] || 0);
        return { row: x.row, bank: x.bank, code: x.code, cname: fxLabel_(x.code), balance: x.balance, value: Math.round(x.balance * rate) };
      });
    }
  } catch (fe) { Logger.log(fe); }
  return { accounts: list, fx: fx };
}
WA_READ_ONLY_.waAccountCheckData = 1;

// 一次校正好幾個帳戶。p: { items: [{ account, actual }] }（沒填的不會傳來）
function waAdjustBalances(p) {
  var ss = SS_(), items = Array.isArray(p && p.items) ? p.items : [];
  if (!items.length) throw new Error("沒有填任何帳戶的實際餘額");
  var lock = LOCK_();
  lock.waitLock(20000);
  var changed = [];
  try {
    var cur = {};
    waAccountBalances_(ss).forEach(function (a) { cur[a.name] = a.balance; }); // 先拿一次快照，再一起寫
    var fxs = typeof fxRows_ === "function" ? fxRows_(ss) : [];
    items.forEach(function (x) {
      if (x.fxRow) { // 外幣：改外幣餘額，台幣成本照原本的平均成本跟著調；帳戶流水記一筆台幣的校正，對帳才算得到
        var f = fxs.filter(function (y) { return y.row === Number(x.fxRow); })[0];
        if (!f) throw new Error("找不到這筆外幣，請重新整理");
        var nb = Number(String(x.actual).replace(/,/g, ""));
        if (!(nb >= 0)) throw new Error(f.bank + " " + fxLabel_(f.code) + " 的實際餘額不正確");
        var dfx = Math.round((nb - f.balance) * 100) / 100;
        if (!dfx) return;
        var unit = f.balance > 0 ? f.cost / f.balance : (fxRates_().rates[f.code] || 0);
        var dtwd = Math.round(dfx * unit);
        var fsh2 = fxSheet_(ss);
        fsh2.getRange(f.row, 3, 1, 2).setValues([[nb, Math.max(0, Math.round(f.cost + dtwd))]]);
        fsh2.getRange(f.row, 7).setValue(new Date());
        fxLog_(ss, f.bank, f.code, "校正", dfx, dtwd, "校正餘額為 " + nb);
        if (dtwd) {
          if (dtwd > 0) waLogFlow_(ss, "校正", "校正:差額", fxFlowName_(f), dtwd, "校正為 " + f.code + " " + nb);
          else waLogFlow_(ss, "校正", fxFlowName_(f), "校正:差額", -dtwd, "校正為 " + f.code + " " + nb);
        }
        changed.push(f.bank + " " + fxLabel_(f.code) + " " + (dfx > 0 ? "+" : "−") + Math.abs(dfx).toLocaleString());
        return;
      }
      var name = waCheckAccountName_(x.account), actual = Number(String(x.actual).replace(/,/g, ""));
      if (!isFinite(actual)) throw new Error(name + " 的實際餘額不是數字");
      var delta = Math.round((actual - (cur[name] || 0)) * 100) / 100;
      if (!delta) return;
      if (delta > 0) waLogFlow_(ss, "校正", "校正:差額", name, delta, "校正為 " + actual);
      else waLogFlow_(ss, "校正", name, "校正:差額", -delta, "校正為 " + actual);
      changed.push(name + " " + (delta > 0 ? "+" : "−") + Math.round(Math.abs(delta)).toLocaleString());
    });
  } finally { lock.releaseLock(); }
  return { message: changed.length ? "校正了 " + changed.length + " 個帳戶" : "全部本來就對", detail: changed.join("、"), dashboard: waGetDashboard() };
}


// ==================== StockExtra.gs ====================
// ============================================================
// 1) 股票名稱：持股頁每一檔都顯示「名稱＋代號」
//    名稱來源順序：自己設定過的 → 內建常用的 → 證交所／櫃買中心的公開資料（OpenAPI，第一次用到才抓，抓到就記住）
// 2) 賣出提醒：每一檔持股都可以設「漲超過成本幾 %」「漲到／跌到多少元」「漲破／跌破幾日均線」
//    盤中每小時（9～13 點）檢查一次，達到就用「通知方式」（日曆／Gmail）提醒；條件還在就每天提醒一次，直到關掉
// ============================================================

// ---------- 1) 名稱 ----------
var STOCK_NAME_MAP_KEY_ = "tw_stock_names_v1";

// 公開資料：上市（含 ETF）＋上櫃的「代號 → 中文名稱」。存在快取 6 小時
function stockNameMap_() {
  var c = SCACHE_();
  try { var hit = c.get(STOCK_NAME_MAP_KEY_); if (hit) return JSON.parse(hit); } catch (e) {}
  var map = {};
  var grab = function (url, codeKeys, nameKeys) {
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: "application/json" } });
      if (res.getResponseCode() !== 200) return;
      var arr = JSON.parse(res.getContentText());
      if (!Array.isArray(arr)) return;
      arr.forEach(function (o) {
        var code = "", name = "";
        codeKeys.forEach(function (k) { if (!code && o[k]) code = String(o[k]).trim(); });
        nameKeys.forEach(function (k) { if (!name && o[k]) name = String(o[k]).trim(); });
        if (code && name && /^[0-9A-Z]{4,6}$/.test(code)) map[code] = name;
      });
    } catch (e) { Logger.log("股票名稱抓取失敗：" + url + " " + e); }
  };
  grab("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", ["Code"], ["Name"]);
  grab("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", ["SecuritiesCompanyCode", "Code"], ["CompanyName", "Name"]);
  try { if (Object.keys(map).length) c.put(STOCK_NAME_MAP_KEY_, JSON.stringify(map), 21600); } catch (e2) { Logger.log(e2); }
  return map;
}

// 找不到名稱的代號：去公開資料查，查到就存進「自己的名稱表」（以後不用再查）
function stockNamesFill_(codes) {
  var missing = (codes || []).filter(function (c, i, a) { return c && a.indexOf(c) === i && !WA_NAMES_[c]; });
  if (!missing.length) return;
  var props = PROPS_(), tried = {};
  try { tried = JSON.parse(props.getProperty("CODE_NAMES_TRIED") || "{}"); } catch (e) {}
  var today = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  missing = missing.filter(function (c) { return tried[c] !== today; }); // 查不到的，一天只再試一次
  if (!missing.length) return;
  var map = stockNameMap_(), saved = {};
  try { saved = JSON.parse(props.getProperty(WA_CODE_NAMES_PROP_) || "{}"); } catch (e) {}
  var changed = false;
  missing.forEach(function (c) {
    var n = map[String(c).replace(/^TPE:/, "")];
    if (n) { WA_NAMES_[c] = n; saved[c] = n; changed = true; } else tried[c] = today;
  });
  if (changed) props.setProperty(WA_CODE_NAMES_PROP_, JSON.stringify(saved));
  props.setProperty("CODE_NAMES_TRIED", JSON.stringify(tried));
}

// ---------- 2) 賣出提醒 ----------
// SELL_ALERTS：{ "TPE:2330": { on, gain(小數，0.2＝20%), up(元), down(元), maN(日), maDir("below"跌破|"above"漲破), last("yyyy-MM-dd") } }
var SELL_ALERT_PROP_ = "SELL_ALERTS";
var SELL_MA_LIST_ = [5, 10, 20, 60, 120, 240];

function sellAlertsGet_() {
  try { var o = JSON.parse(PROPS_().getProperty(SELL_ALERT_PROP_) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
}
function sellAlertsSave_(o) { PROPS_().setProperty(SELL_ALERT_PROP_, JSON.stringify(o)); }

// 均線（用到昨天為止的收盤價算，一天只算一次，存起來）
function sellMaCacheGet_() { try { return JSON.parse(PROPS_().getProperty("SELL_MA_CACHE") || "{}"); } catch (e) { return {}; } }
function sellMa_(code, n, allowFetch) {
  var today = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  var cache = sellMaCacheGet_(), k = code + "|" + n;
  if (cache[k] && cache[k].d === today) return cache[k].v;
  if (!allowFetch) return cache[k] ? cache[k].v : null; // 畫面上先用上次算的
  var closes = sellCloses_(code, n);
  var v = closes.length >= n ? closes.slice(-n).reduce(function (a, b) { return a + b; }, 0) / n : null;
  if (v) v = Math.round(v * 100) / 100;
  // 只留今天用得到的，不讓屬性越長越大
  var keep = {};
  Object.keys(cache).forEach(function (x) { if (cache[x] && cache[x].d === today) keep[x] = cache[x]; });
  keep[k] = { d: today, v: v };
  PROPS_().setProperty("SELL_MA_CACHE", JSON.stringify(keep));
  return v;
}
// 最近的收盤價（舊到新，不含今天）：先用 GOOGLEFINANCE 歷史價，抓不到就用「每日收盤價」紀錄
function sellCloses_(code, n) {
  var ss = SS_(), out = [];
  try {
    var sh = ss.getSheetByName("均線暫存");
    if (!sh) { sh = ss.insertSheet("均線暫存"); try { sh.hideSheet(); } catch (h) {} }
    var days = Math.ceil(n * 1.6) + 15;
    for (var attempt = 0; attempt < 2 && out.length < n; attempt++) {
      sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), 2).clearContent();
      sh.getRange(1, 1).setFormula('=IFERROR(GOOGLEFINANCE("' + code.replace(/"/g, "") + '","close",TODAY()-' + days + ',TODAY()-1),"")');
      SpreadsheetApp.flush();
      Utilities.sleep(2000 + attempt * 2000);
      var last = sh.getLastRow();
      if (last >= 2) out = sh.getRange(2, 1, last - 1, 2).getValues()
        .filter(function (r) { return r[0] instanceof Date && Number(r[1]) > 0; })
        .map(function (r) { return Number(r[1]); });
    }
    sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).clearContent();
  } catch (e) { Logger.log("均線歷史價抓取失敗：" + code + " " + e); }
  if (out.length >= n) return out;
  try {
    var today = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
    var rows = loadCloseLog_().filter(function (r) { return String(r[1]).trim() === code && normDate_(r[0]) < today; })
      .sort(function (a, b) { return normDate_(a[0]) < normDate_(b[0]) ? -1 : 1; });
    var fromLog = rows.map(function (r) { return Number(r[2]); }).filter(function (x) { return x > 0; });
    if (fromLog.length > out.length) out = fromLog;
  } catch (e2) { Logger.log(e2); }
  return out;
}

// 一檔的狀態：哪些條件達到了
function sellAlertEval_(a, price, avgCost, ma) {
  var hits = [];
  if (!(price > 0)) return hits;
  if (a.gain > 0 && avgCost > 0 && price >= avgCost * (1 + a.gain)) hits.push("比成本漲 " + ((price / avgCost - 1) * 100).toFixed(1) + "%（設定 " + Math.round(a.gain * 1000) / 10 + "%）");
  if (a.up > 0 && price >= a.up) hits.push("漲到 " + price + " 元（設定 " + a.up + "）");
  if (a.down > 0 && price <= a.down) hits.push("跌到 " + price + " 元（設定 " + a.down + "）");
  if (a.maN > 0 && ma > 0) {
    if (a.maDir === "above" && price >= ma) hits.push("漲破 " + a.maN + " 日均線 " + ma);
    if (a.maDir !== "above" && price <= ma) hits.push("跌破 " + a.maN + " 日均線 " + ma);
  }
  return hits;
}

// 所有持股（核心、自選、其他個股）：{ code: { name, price, avgCost, shares } }
function sellAlertHoldings_(d) {
  var m = {};
  (d.holdings || []).forEach(function (h) { if (h.code) m[h.code] = { name: h.name || "", price: h.price, avgCost: h.avgCost, shares: h.shares }; });
  (d.otherStocks || []).forEach(function (o) {
    if (!o.code) return;
    var prev = m[o.code];
    var ac = o.shares > 0 ? o.cost / o.shares : 0;
    if (prev && prev.shares > 0) { // 同一檔兩邊都有：合起來算平均成本
      var sh = prev.shares + o.shares;
      m[o.code] = { name: prev.name || o.name, price: prev.price || o.price, avgCost: (prev.avgCost * prev.shares + o.cost) / sh, shares: sh };
    } else m[o.code] = { name: o.name, price: o.price, avgCost: ac, shares: o.shares };
  });
  return m;
}

// 給畫面用：每一檔設定＋現在的狀態（均線用今天已經算好的，不另外去抓）
function sellAlertStatus_(d) {
  var all = sellAlertsGet_(), out = {}, hold = sellAlertHoldings_(d);
  Object.keys(all).forEach(function (code) {
    var a = all[code], h = hold[code] || {};
    var ma = a.maN > 0 ? sellMa_(code, a.maN, false) : null;
    out[code] = { on: !!a.on, gain: a.gain || 0, up: a.up || 0, down: a.down || 0, maN: a.maN || 0, maDir: a.maDir || "below", last: a.last || "",
      ma: ma, hits: a.on ? sellAlertEval_(a, h.price, h.avgCost, ma) : [] };
  });
  return out;
}

// 排程：盤中每小時檢查，達到就通知（同一檔一天最多一次；條件還在，隔天會再提醒）
function sellAlertCheck_(d) {
  var tz = "Asia/Taipei", now = new Date();
  var dow = Number(Utilities.formatDate(now, tz, "u")), h = Number(Utilities.formatDate(now, tz, "H"));
  if (dow > 5 || h < 9 || h > 13) return 0;
  var all = sellAlertsGet_(), codes = Object.keys(all).filter(function (c) { return all[c] && all[c].on; });
  if (!codes.length) return 0;
  var today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var hold = sellAlertHoldings_(d), lines = [], changed = false;
  codes.forEach(function (code) {
    var a = all[code], x = hold[code];
    if (!x || !(x.shares > 0) || a.last === today) return; // 已經賣光的不提醒；今天提醒過了
    var ma = a.maN > 0 ? sellMa_(code, a.maN, true) : null;
    var hits = sellAlertEval_(a, x.price, x.avgCost, ma);
    if (!hits.length) return;
    a.last = today; changed = true;
    var label = (x.name && x.name !== code ? x.name + " " : "") + String(code).replace(/^TPE:/, "");
    lines.push("【" + label + "】現價 " + x.price + "，持有 " + Math.round(x.shares).toLocaleString() + " 股" + (x.avgCost > 0 ? "，平均成本 " + x.avgCost.toFixed(2) : "") + "\n  達到：" + hits.join("；"));
  });
  if (changed) sellAlertsSave_(all);
  if (!lines.length) return 0;
  var subject = "賣出提醒：" + lines.map(function (l) { return l.slice(1, l.indexOf("】")); }).join("、");
  var body = "你設定的賣出條件達到了：\n\n" + lines.join("\n\n") +
    "\n\n（股價大約延遲 20 分鐘。App 不會自動賣，要不要賣你自己決定。條件還在的話明天會再提醒，不想再收到就到 App 那一檔把提醒關掉。）";
  try { SEND_MAIL_(NOTIFY_EMAIL_(), subject, body); } catch (e) { Logger.log("賣出提醒寄送失敗：" + e); }
  return lines.length;
}

// App：讀一檔的設定（順便算好均線給你看）
WA_READ_ONLY_.waSellAlertGet = 1;
function waSellAlertGet(p) {
  var code = normalizeStockCode_(p && p.code);
  if (!code) throw new Error("沒有代號");
  var a = sellAlertsGet_()[code] || {};
  var mas = {};
  var n = Number(p && p.maN) || a.maN || 20;
  try { mas[n] = sellMa_(code, n, true); } catch (e) { mas[n] = null; }
  return { code: code, alert: a, ma: mas };
}
WA_READ_ONLY_.waSellMa = 1;
function waSellMa(p) {
  var code = normalizeStockCode_(p && p.code), n = Number(p && p.n);
  if (!code || SELL_MA_LIST_.indexOf(n) < 0) throw new Error("均線天數不對");
  return { n: n, ma: sellMa_(code, n, true) };
}
// App：存設定。p: { code, on, gainPct, up, down, maN, maDir }
function waSellAlertSave(p) {
  var code = normalizeStockCode_(p && p.code);
  if (!code) throw new Error("沒有代號");
  var num = function (v) { v = String(v === undefined || v === null ? "" : v).replace(/[,%\s]/g, ""); return v === "" ? 0 : Number(v); };
  var gain = num(p.gainPct) / 100, up = num(p.up), down = num(p.down), maN = Number(p.maN) || 0;
  if ([gain, up, down].some(function (x) { return !(x >= 0); })) throw new Error("數字格式不對");
  if (maN && SELL_MA_LIST_.indexOf(maN) < 0) throw new Error("均線天數不對");
  var all = sellAlertsGet_();
  if (!p.on && !all[code]) return { message: "沒有變更", detail: "" };
  if (p.on && !(gain > 0 || up > 0 || down > 0 || maN > 0)) throw new Error("至少要設一個條件");
  var old = all[code] || {};
  var a = { on: !!p.on, gain: gain, up: up, down: down, maN: maN, maDir: p.maDir === "above" ? "above" : "below", last: "" };
  // 條件沒改、只是再按一次儲存：保留「今天提醒過」，免得同一天又收到一次
  if (old.gain === a.gain && old.up === a.up && old.down === a.down && old.maN === a.maN && old.maDir === a.maDir && old.on && a.on) a.last = old.last || "";
  all[code] = a;
  sellAlertsSave_(all);
  waApplyCodeNames_();
  var nm = (WA_NAMES_[code] || "") + " " + code.replace(/^TPE:/, "");
  if (!a.on) return { message: "已關閉 " + nm + " 的賣出提醒", detail: "" };
  var cond = [];
  if (gain > 0) cond.push("比成本漲 " + Math.round(gain * 1000) / 10 + "%");
  if (up > 0) cond.push("漲到 " + up + " 元");
  if (down > 0) cond.push("跌到 " + down + " 元");
  if (maN > 0) cond.push((a.maDir === "above" ? "漲破 " : "跌破 ") + maN + " 日均線");
  return { message: "已設定 " + nm + " 的賣出提醒", detail: "任一個達到就通知：" + cond.join("、") + "（盤中每小時檢查）" };
}


// ==================== RELayout.gs ====================
// ---------- 格局圖（四面版）：從每一面的窗、景觀、棟距、陽台、房間，算採光、棟距、景觀、方位的調整 ----------
// 這個檔案的內容 App.html 也會用（build.py 會把它原封不動放進 App），所以只能用一般的 JavaScript，不能用 Apps Script 的功能。
var RE_LY_SIDES = ["上", "右", "下", "左"];
var RE_LY_DIRS = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
// 房間的重要性：景觀、棟距、西曬在客廳影響最大，浴室、廚房最小
var RE_LY_ROOMS = [["客廳", 1], ["餐廳", 0.6], ["主臥", 0.6], ["套房", 0.6], ["房間", 0.5], ["小房間", 0.4], ["書房", 0.5], ["廚房", 0.25], ["浴室", 0.25], ["後陽台", 0.2]];
// 景觀：[代號, 說明, %, 圖示, 分類]。每一面可以複選；同一面再選「遮擋」「視角」
var RE_LY_VIEWS = [
  ["g_tree", "近距離看到樹（行道樹、中庭花園）", 1.5, "🌳", "綠意"], ["g_blvd", "林蔭大道（敦化南路、仁愛路這種一整排大樹）", 5, "🌳🛣️", "綠意"],
  ["g_spark", "小公園、社區公園", 2.5, "🌲", "綠意"], ["g_bpark", "大公園", 4, "🏞️", "綠意"], ["g_fpark", "知名大公園（大安森林公園、青年公園、榮星花園…）", 6, "🏞️⭐", "綠意"],
  ["g_hill", "近距離的山坡、樹林（看到的是一面樹）", 1.5, "🌿", "綠意"], ["g_mount", "整座山的山景（看得到山的輪廓、層次）", 4, "⛰️", "綠意"],
  ["w_river", "河景", 5, "🏞️", "水景"], ["w_lake", "湖景", 5, "💧", "水景"], ["w_sea", "海景", 6, "🌊", "水景"],
  ["w_oc", "水的對面是城市天際線", 1.5, "🌆", "水景對面"], ["w_om", "水的對面是山", 1.5, "⛰️", "水景對面"],
  ["c_sky", "市中心的摩天大樓天際線、夜景", 4, "🏙️", "城市"], ["c_res", "一般的住宅大樓群", 1, "🏢", "城市"], ["c_low", "低矮的平房、老公寓屋頂（看得很遠）", 1.5, "🏘️", "城市"],
  ["l_101", "正面看得到 101", 8, "🗼", "地標"], ["l_other", "其他地標（圓山大飯店、摩天輪、大橋…）", 4, "🎡", "地標"],
  ["r_avenue", "筆直的大馬路一路看出去（視線延伸很遠）", 2, "🛣️", "道路交通"], ["r_train_far", "遠遠看得到捷運、火車、高鐵在跑（聽不太到）", 1, "🚆", "道路交通"],
  ["r_mid", "大馬路中間有高架橋或高架捷運（擋到一部分、有車聲）", -3, "🌉", "道路交通"], ["r_train_near", "鐵軌、捷運就在旁邊（看得到也聽得到）", -4, "🚇", "道路交通"],
  ["r_tunnel", "正對隧道口、彎道（車燈照進來、煞車聲）", -2, "🚗", "道路交通"], ["r_lusong", "路沖：一條路正對著這一面直直衝過來", -5, "⚠️", "道路交通"],
  ["b_bad", "不好的景觀（墓地、垃圾場、工廠、變電所）", -4, "🚫", "不好"]];
var RE_LY_FAC = [["gym", "健身房"], ["pool", "游泳池"], ["lounge", "交誼廳"], ["read", "閱覽室"], ["kids", "兒童遊戲室"], ["garden", "中庭花園"], ["roofg", "頂樓花園"], ["banq", "宴會廳"]];
var RE_LY_VIEW_ALIAS = { vw_green: "g_tree", vw_blvd: "g_blvd", vw_city: "c_sky", v_view: "w_river", vw_icon: "l_101", vw_bad: "b_bad" }; // 舊版的代號
// 從這一面看出去：正對對面外牆／看得到巷口、路口（部分開闊）／開闊沒有被擋
var RE_LY_LOOKS = [["wall", "正對對面房子的外牆", 0], ["gap", "看得到巷口、路口（有一部分是開的）", 0.5], ["open", "開闊，前面沒有東西擋", 1]];
// 窗戶型式：透氣小窗看出去的景、採光都打折；大面景觀窗、落地窗多一點
var RE_LY_WINS = [["small", "只有透氣小窗", 0.4], ["normal", "一般窗戶", 1], ["big", "大面景觀窗", 1.05], ["floor", "落地窗", 1.1]];
var RE_LY_BLOCKS = [["none", "完全沒擋、一整排都看得到", 1], ["some", "稍微被擋，看得到大部分", 0.6], ["corner", "只看得到一角", 0.3]];
var RE_LY_ELEVS = [["down", "俯瞰（從上往下看）", 1.1], ["level", "平視", 1], ["up", "要抬頭看（景比你高）", 0.9]];
// 對面房子的距離：用路的寬度來估（公尺）
var RE_LY_GAPS = [[1.5, "防火巷、縫隙", "約 1～2 公尺，伸手快碰到，白天也要開燈"], [4, "小巷子", "約 3～5 公尺，看得到對面家裡在做什麼"],
  [7, "一般巷道（單線）", "約 6～8 公尺"], [11, "雙向道", "約 10～12 公尺"], [19, "四線道", "約 18～20 公尺，不太有壓迫感"], [28, "六線以上大馬路", "約 25～30 公尺，例如信義路、基隆路"]];
// 被這個檔案取代的勾選項目（用了格局圖，這幾組就不用再勾）
var RE_LY_REPLACES = ["lt_1", "v_corner", "v_dark", "gp_wide", "v_space", "vw_bad", "vw_open", "vw_green", "vw_blvd", "vw_city", "v_view", "vw_icon", "dr_good", "v_west"];

// 用了格局圖時，「依屋況調整」裡哪些項目改由格局圖算（填了房間細節，套房、衛浴、廚房、陽台也改由格局圖算；選了高架、鐵軌，周遭環境的「高架、鐵路」就不重複扣）
function reLyDrops_(L) {
  if (!reLyOn_(L)) return [];
  var d = RE_LY_REPLACES.slice();
  if (L.det && L.det.on) d.push("v_suite", "v_kitchen", "ly_bath", "ly_store", "ly_nobal");
  if (L.cm && L.cm.on) d.push("v_single", "e_mgmt_good", "e_mgmt_bad", "cm_fac");
  if ((L.sides || []).some(function (s) { return (s.views || []).some(function (v) { return v === "r_mid" || v === "r_train_near"; }); })) d.push("en_viaduct");
  return d;
}
// 有沒有用格局圖（要按過「存起來」才算；只上傳照片不算）
function reLyOn_(L) { return !!(L && L.done && L.sides && L.sides.length === 4); }
function reLyRoomW_(rooms) {
  var w = 0;
  (rooms || []).forEach(function (r) { RE_LY_ROOMS.forEach(function (x) { if (x[0] === r && x[1] > w) w = x[1]; }); });
  return w || 0.4; // 沒說是哪個房間：當作一般房間的一半
}
function reLyDir_(L, i) { return L && L.rot !== null && L.rot !== undefined && L.rot !== "" && isFinite(L.rot) ? ((Number(L.rot) + 90 * i) % 360 + 360) % 360 : null; }
function reLyDirName_(deg) { return deg === null ? "" : RE_LY_DIRS[Math.round(deg / 45) % 8]; }
function reLyClean_(L) {
  if (!L || typeof L !== "object") return null;
  var ok = function (v) { return v === true || v === false ? v : null; };
  var vids = RE_LY_VIEWS.map(function (v) { return v[0]; }), rids = RE_LY_ROOMS.map(function (r) { return r[0]; });
  var out = { v: 1, rot: L.rot !== null && L.rot !== undefined && L.rot !== "" && isFinite(L.rot) ? ((Math.round(Number(L.rot) / 45) * 45) % 360 + 360) % 360 : null,
    done: !!L.done, rotSrc: String(L.rotSrc || "").slice(0, 20), img: String(L.img || "").slice(0, 80), sides: [] };
  for (var i = 0; i < 4; i++) {
    var s = (L.sides || [])[i] || {};
    var nb = s.nb === null || s.nb === undefined || s.nb === "" ? null : Math.max(1, Math.min(50, Number(s.nb) || 0));
    var pick = function (v, list) { return list.some(function (x) { return x[0] === v; }) ? v : null; };
    var views = []; (s.views || []).forEach(function (v) { v = RE_LY_VIEW_ALIAS[v] || v; if (vids.indexOf(v) >= 0 && views.indexOf(v) < 0) views.push(v); });
    var look = pick(s.look, RE_LY_LOOKS) || ((s.views || []).indexOf("vw_open") >= 0 ? "open" : null);
    out.sides.push({ win: ok(s.win), wt: pick(s.wt, RE_LY_WINS), look: look, views: views, block: pick(s.block, RE_LY_BLOCKS), elev: pick(s.elev, RE_LY_ELEVS), nb: nb, perm: !!s.perm,
      bal: Math.max(0, Math.min(10, Number(s.bal) || 0)), ter: !!s.ter, rooms: (s.rooms || []).filter(function (r) { return rids.indexOf(r) >= 0; }) });
  }
  var D = L.det && typeof L.det === "object" ? L.det : null;
  if (D) {
    var ci = function (v) { return Math.max(0, Math.min(9, Math.round(Number(v) || 0))); }, R = D.rooms || {};
    out.det = { on: !!D.on && !D.skip, skip: !!D.skip, rooms: { msuite: ci(R.msuite), suite: ci(R.suite), room: ci(R.room), small: ci(R.small), study: ci(R.study) },
      baths: (D.baths || []).slice(0, 8).map(function (b) { b = b || {}; return { full: b.full !== false, size: ["s", "m", "l"].indexOf(b.size) >= 0 ? b.size : "m", dw: !!b.dw, tub: !!b.tub, dbl: !!b.dbl, win: !!b.win }; }),
      kit: ["open", "sep", "small"].indexOf(D.kit) >= 0 ? D.kit : null, island: !!D.island || D.kit === "island", bar: !!D.bar, kwin: !!D.kwin,
      store: !!D.store, maid: ["room", "bath"].indexOf(D.maid) >= 0 ? D.maid : null, ent: ["foyer", "screen", "open", "through"].indexOf(D.ent) >= 0 ? D.ent : null,
      back: ["yes", "small", "no"].indexOf(D.back) >= 0 ? D.back : null };
    var od = out.det, any = od.baths.length || od.kit || od.back || od.island || od.bar || od.store || od.maid || od.ent || Object.keys(od.rooms).some(function (k) { return od.rooms[k] > 0; });
    if (!any) od.on = false; // 這頁什麼都沒填：照舊用「依屋況調整」勾的
  }
  var C = L.cm && typeof L.cm === "object" ? L.cm : null;
  if (C) {
    var one = function (v, list) { return list.indexOf(v) >= 0 ? v : null; };
    out.cm = { per: one(C.per, ["12", "34", "58", "9"]), mgmt: one(C.mgmt, ["pro24", "day", "self", "none"]), garbage: !!C.garbage,
      fac: (C.fac || []).filter(function (f) { return RE_LY_FAC.some(function (x) { return x[0] === f; }); }), elev: one(C.elev, ["ok", "wait"]),
      below: one(C.below, ["home", "shop", "food"]), roof: !!C.roof, facade: one(C.facade, ["good", "bad"]), pipes: one(C.pipes, ["new", "old"]),
      gas: one(C.gas, ["natural", "tank"]), sound: !!C.sound, fs: (C.fs || []).filter(function (f) { return ["toilet", "beam", "center"].indexOf(f) >= 0; }) };
    var oc = out.cm; oc.on = !!(oc.per || oc.mgmt || oc.garbage || oc.fac.length || oc.elev || oc.below || oc.roof || oc.facade || oc.pipes || oc.gas || oc.sound || oc.fs.length);
  }
  if (L.ter && typeof L.ter === "object") out.ter = { where: String(L.ter.where || "").slice(0, 10), shape: String(L.ter.shape || "").slice(0, 10) };
  return out;
}
// 回傳 { f: 乘數, lines: [[說明, %]], parts: {light, gap, view, dir} }
function reLayoutAdj_(L) {
  var lines = [], parts = { light: 0, gap: 0, view: 0, dir: 0, space: 0 };
  if (!L || !L.sides || L.sides.length !== 4) return { f: 1, lines: lines, parts: parts };
  var nm = function (i) { var d = reLyDir_(L, i); return RE_LY_SIDES[i] + "面" + (d === null ? "" : "（朝" + reLyDirName_(d) + "）"); };
  var rm = function (s) { return s.rooms && s.rooms.length ? s.rooms.join("、") : ""; };
  // 1. 採光：有窗的面數
  var known = 0, n = 0;
  L.sides.forEach(function (s) { if (s.win !== null) known++; if (s.win === true) n += s.wt === "small" ? 0.5 : 1; });
  if (known === 4 || n >= 2) {
    if (n <= 1.5) { parts.light = -3; lines.push(["只有 " + n + " 面採光（透氣小窗算半面）", -3]); }
    else if (n >= 3) { parts.light = 2; lines.push([n + " 面採光", 2]); }
    else if (n !== 2) lines.push([n + " 面採光（透氣小窗算半面）", 0]);
    else lines.push(["2 面採光（一般）", 0]);
  }
  // 2. 棟距：每一面有窗、有填對面距離的；陽台、露台的深度會把距離拉長；看窗在哪個房間決定影響多大
  var gap = 0;
  L.sides.forEach(function (s, i) {
    if (s.win !== true) return;
    var w = reLyRoomW_(s.rooms), c = 0, t = "";
    if (s.perm) { c = 2 * w; t = "前面以後不會蓋房子（永久棟距）"; }
    else if (s.nb !== null) {
      var d = s.nb + (s.bal || 0);
      c = (d < 4 ? -6 : d < 8 ? -4 : d < 12 ? -1.5 : d < 20 ? 0 : 0.5) * w;
      t = "對面房子約 " + s.nb + " 公尺" + (s.bal ? "＋陽台 " + s.bal + " 公尺" : "");
    } else return;
    gap += c; lines.push([nm(i) + (rm(s) ? rm(s) + "：" : "：") + t, Math.round(c * 10) / 10]);
  });
  parts.gap = Math.max(-8, Math.min(3, gap));
  // 3. 景觀：每一面看得到的（可以複選）× 遮擋 × 視角 × 房間的重要性；最好的算全額，其他的加一半
  var pos = [], neg = 0, mul = function (list, v) { var x = list.filter(function (z) { return z[0] === v; })[0]; return x ? x[2] : 1; };
  L.sides.forEach(function (s, i) {
    if (s.win === false) return;
    var w = reLyRoomW_(s.rooms), k = mul(RE_LY_BLOCKS, s.block) * mul(RE_LY_ELEVS, s.elev) * mul(RE_LY_WINS, s.wt), where = nm(i) + (rm(s) ? rm(s) : "");
    var lk = RE_LY_LOOKS.filter(function (x) { return x[0] === s.look; })[0];
    if (lk && lk[2] > 0) pos.push([lk[2] * w, where + "：" + lk[1].split("（")[0]]);
    var hasWater = (s.views || []).some(function (v) { return /^w_(river|lake|sea)$/.test(v); });
    (s.views || []).forEach(function (vid) {
      var v = RE_LY_VIEWS.filter(function (x) { return x[0] === vid; })[0]; if (!v) return;
      if (v[4] === "水景對面" && !hasWater) return; // 沒有選水景，「水的對面」不算
      var c = v[2] * w * (v[2] > 0 ? k : 1);
      var tag = (s.block === "some" ? "，稍微被擋" : s.block === "corner" ? "，只看到一角" : "") + (s.elev === "down" ? "，俯瞰" : s.elev === "up" ? "，仰看" : "");
      if (c > 0) pos.push([c, where + "：" + v[1].split("（")[0] + (tag ? "（" + tag.slice(1) + "）" : "")]);
      else { neg += c; lines.push([where + "：" + v[1].split("（")[0], Math.round(c * 10) / 10]); }
    });
  });
  pos.sort(function (a, b) { return b[0] - a[0]; });
  var view = neg;
  pos.forEach(function (p, k) { var c = k ? p[0] / 2 : p[0]; view += c; lines.push([p[1] + (k ? "（第二個以後加一半）" : ""), Math.round(c * 10) / 10]); });
  parts.view = Math.max(-6, Math.min(15, view));
  // 4. 方位：客廳、臥室朝西會西曬；客廳朝南（座北朝南）冬暖夏涼。不知道方位就不算
  var dir = 0;
  L.sides.forEach(function (s, i) {
    var d = reLyDir_(L, i); if (d === null || s.win !== true) return;
    var wl = s.rooms.indexOf("客廳") >= 0 ? 1 : (s.rooms.indexOf("主臥") >= 0 || s.rooms.indexOf("房間") >= 0) ? 0.5 : 0;
    var west = d === 270 ? 1 : (d === 225 || d === 315) ? 0.5 : 0, south = d === 180 ? 1 : (d === 135 || d === 225) ? 0.5 : 0;
    if (west && wl) { var c = -2 * west * wl; dir += c; lines.push([nm(i) + rm(s) + "西曬", Math.round(c * 10) / 10]); }
    if (south && s.rooms.indexOf("客廳") >= 0) { var c2 = 1 * south; dir += c2; lines.push([nm(i) + "客廳朝南（冬暖夏涼）", Math.round(c2 * 10) / 10]); }
  });
  parts.dir = Math.max(-3, Math.min(1, dir));
  // 5. 房間、衛浴、廚房、後陽台（有填「房間細節」才算）
  parts.space = 0;
  var D = L.det;
  if (D && D.on) {
    var R = D.rooms, sp = 0, add = function (t, c) { sp += c; lines.push([t, c]); };
    var suites = R.msuite + R.suite, beds = R.msuite + R.suite + R.room + R.small + R.study;
    if (suites >= 2) add(suites + " 間套房", 2);
    if (R.msuite) add("主臥套房有更衣室、步入式衣櫥", 1);
    if (R.small >= 2) add(R.small + " 間小房間（放不下雙人床）", -1);
    var full = D.baths.filter(function (b) { return b.full; }).length, half = D.baths.length - full;
    if (beds >= 3 && full <= 1) add(beds + " 房只有 " + full + " 套完整衛浴", -2);
    if (half) add(half + " 間半套衛浴（只有馬桶、洗臉盆）", 0.5);
    var bq = 0, bt = [];
    D.baths.forEach(function (b) { if (b.dw) bq += 0.3; if (b.tub) bq += 0.3; if (b.dbl) bq += 0.3; if (b.win) bq += 0.5; if (b.size === "l") bq += 0.3; if (b.size === "s" && b.full) bq -= 0.3; });
    if (bq) add("衛浴設備（乾濕分離、浴缸、雙面盆、對外窗、大小）", Math.round(Math.max(-1, Math.min(2, bq)) * 10) / 10);
    if (D.kit === "sep") add("獨立的大廚房", 0.5); else if (D.kit === "small") add("一字型小廚房", -0.5);
    if (D.island) add("有中島", 1); if (D.bar) add("有輕食吧台", 0.5); if (D.kwin) add("廚房有窗（通風）", 0.5);
    if (D.store) add("有儲藏室", 0.5); if (D.maid) add(D.maid === "bath" ? "佣人房（有自己的衛浴）" : "佣人房", D.maid === "bath" ? 1 : 0.5);
    if (D.ent === "foyer") add("大門進來有玄關", 0.5); else if (D.ent === "through") add("大門直對窗戶（穿堂煞）", -1);
    if (D.back === "yes") add("有後陽台、工作陽台", 0.5); else if (D.back === "no") add("沒有後陽台（不能在家曬衣服）", -2);
    parts.space = Math.max(-5, Math.min(5, sp));
  }
  // 6. 社區、管理、建築狀況（有填「社區管理」才算）
  parts.cm = 0;
  var C = L.cm;
  if (C && C.on !== false && C.fac) { // 存檔時沒填任何東西會是 on:false
    var cs = 0, ad = function (t, c) { cs += c; lines.push([t, c]); };
    if (C.per === "12") ad("一層 1～2 戶", 3); else if (C.per === "58") ad("一層 5～8 戶", -1); else if (C.per === "9") ad("一層 9 戶以上", -2);
    if (C.mgmt === "pro24") ad("物業公司、24 小時保全", 2); else if (C.mgmt === "day") ad("有日間管理員", 0.5); else if (C.mgmt === "none") ad("沒有管委會，沒人管", -2);
    if (C.garbage) ad("垃圾代收", 1);
    if (C.fac.length) ad("社區公設：" + C.fac.map(function (f) { return RE_LY_FAC.filter(function (x) { return x[0] === f; })[0][1]; }).join("、"), Math.min(2, C.fac.length * 0.5));
    if (C.elev === "wait") ad("電梯不夠，常常要等", -1);
    if (C.below === "food") ad("樓下是餐廳（油煙、吵）", -2);
    if (C.roof) ad("頂樓平台可以用（約定專用）", 3);
    if (C.facade === "good") ad("外牆整修過", 1); else if (C.facade === "bad") ad("外牆磁磚會掉、樓梯間老舊", -2);
    if (C.pipes === "old") ad("水電管線沒換過（老屋要重拉）", -2);
    if (C.gas === "tank") ad("桶裝瓦斯", -1);
    if (C.sound) ad("隔音差，聽得到鄰居", -1);
    var FS = { toilet: "開門見廁所", beam: "樑壓床", center: "廁所在房子正中間" };
    C.fs.forEach(function (f) { ad("風水：" + FS[f] + "（只影響在意風水的買方）", -1); });
    parts.cm = Math.max(-6, Math.min(6, cs));
  }
  var f = (1 + parts.light / 100) * (1 + parts.gap / 100) * (1 + parts.view / 100) * (1 + parts.dir / 100) * (1 + parts.space / 100) * (1 + parts.cm / 100);
  return { f: f, lines: lines, parts: parts };
}


// ==================== RealEstate.gs ====================
// ============================================================
// 房地產（第一階段）：房子＋房貸＋固定支出＋出租
// - 「房地產」分頁：A 編號｜B 名稱｜C 資料（JSON）｜D 更新時間。一間房子一列。
// - 房貸每月扣款日：自動記兩筆帳 ——「房貸利息」（算支出）和「房貸本金」（錢從帳戶出去，但不算花掉，
//   只是負債變少；收支統計不算它）。金額可以事後改（銀行實際扣多少就改成多少）。
// - 固定支出（管理費、房屋稅、地價稅、保險…）：到日子自動記「房屋支出」。
// - 出租：每間（整層出租就一間「整層」）各自填租金、合約起訖、收租日、押金；到收租日自動記「租金收入」，
//   沒收到可以標「未收」（會把那筆撤掉），之後收到再標「已收」。
// - 淨資產＋＝房屋估值 − 房貸餘額 − 押金（押金是要還給房客的錢）。
// - 這些帳都記成「一次性」，而且錢從「投資現金」出（不吃每週生活費）：房貸本金是把現金換成房子，
//   利息、管理費、稅是養房子的成本，都不該擠掉日常生活費；租金收入照一般收入進投資現金。
// - 估價（實價登錄）是第二階段，現在先手動填「目前估值」。
// ============================================================
var RE_SHEET_ = "房地產";
var RE_CAT_INT_ = "房貸利息", RE_CAT_PRIN_ = "房貸本金", RE_CAT_COST_ = "房屋支出", RE_CAT_RENT_ = "租金收入";
var RE_TYPES_ = ["大樓", "華廈", "公寓", "透天", "套房", "辦公室", "店面", "工廠／廠辦", "土地", "其他", "汽車", "機車"];

function reSheet_(ss, create) {
  ss = ss || SS_();
  var sh = ss.getSheetByName(RE_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(RE_SHEET_);
    sh.getRange(1, 1, 1, 4).setValues([["編號", "名稱", "資料（App 會自己維護，請不要手動改）", "更新時間"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 400);
  }
  return sh;
}
function reAll_(ss) {
  var sh = reSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2) return [];
  var out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r, i) {
    if (!String(r[0]).trim()) return;
    try { var o = JSON.parse(r[2] || "{}"); o.id = String(r[0]); o._row = i + 2; out.push(o); } catch (e) { Logger.log("房地產資料讀不到：" + r[0]); }
  });
  return out;
}
function reGet_(ss, id) {
  var p = reAll_(ss).filter(function (x) { return x.id === String(id); })[0];
  if (!p) throw new Error("找不到這間房子");
  return p;
}
function rePut_(ss, p) {
  var sh = reSheet_(ss, true), row = p._row;
  var copy = JSON.parse(JSON.stringify(p)); delete copy._row; delete copy.id;
  var vals = [[p.id, p.name || "", JSON.stringify(copy), new Date()]];
  if (row) sh.getRange(row, 1, 1, 4).setValues(vals);
  else { sh.appendRow(vals[0]); p._row = sh.getLastRow(); }
}

// ---------- 日期小工具 ----------
function reToday_() { return Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd"); }
function reYm_(d) { return String(d).slice(0, 7); }
function reAddM_(ym, n) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + "-" + ("0" + (m + 1)).slice(-2); }
function reMonths_(a, b) { return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)); }
// 某個月的第 day 天（月底不夠就用最後一天）
function reDue_(ym, day) {
  var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ym + "-" + ("0" + Math.min(Math.max(1, Number(day) || 1), last)).slice(-2);
}
function reNum_(v) { v = Number(String(v === undefined || v === null ? "" : v).replace(/[,\s]/g, "")); return isFinite(v) ? v : 0; }

// ---------- 房貸計算 ----------
// loan: { bank, amount, balance0, k0, term(月), grace(月), method:"annuity"|"equal", rates:[{from:"yyyy-mm", rate}],
//         payDay, account, first:"yyyy-mm"（第 k0+1 期的月份）, paid:{ym:{k,i,p,t,edited}}, prepays:[{date,amount,mode}], termAdj }
function reRate_(loan, ym) {
  var r = 0;
  (loan.rates || []).slice().sort(function (a, b) { return a.from < b.from ? -1 : 1; }).forEach(function (x) { if (x.from <= ym) r = Number(x.rate) || 0; });
  if (!r && loan.rates && loan.rates.length) r = Number(loan.rates[0].rate) || 0;
  return r;
}
function reK_(loan, ym) { return (Number(loan.k0) || 0) + reMonths_(loan.first, ym) + 1; }
// 第 ym 期繳之前的本金餘額
function reBalBefore_(loan, ym) {
  var bal = reNum_(loan.balance0);
  var due = reDue_(ym, loan.payDay);
  Object.keys(loan.paid || {}).forEach(function (k) { if (k < ym) bal -= reNum_(loan.paid[k].p); });
  (loan.prepays || []).forEach(function (x) { if (x.date < due) bal -= reNum_(x.amount); });
  return Math.max(0, Math.round(bal));
}
function reLeft_(loan, k) { return Math.max(1, (Number(loan.term) || 0) - (Number(loan.termAdj) || 0) - (k - 1)); }
// 算某一期該繳多少（還沒繳的期數用）
function reCalc_(loan, ym, balOverride) {
  var k = reK_(loan, ym), bal = balOverride === undefined ? reBalBefore_(loan, ym) : balOverride;
  var r = reRate_(loan, ym) / 1200, n = reLeft_(loan, k);
  if (bal <= 0) return { k: k, i: 0, p: 0, t: 0, bal: 0, rate: r * 1200 };
  var i = Math.round(bal * r), p;
  if (k <= (Number(loan.grace) || 0)) p = 0;
  else if (loan.method === "equal") p = Math.round(bal / n);
  else { var pmt = r > 0 ? bal * r / (1 - Math.pow(1 + r, -n)) : bal / n; p = Math.round(pmt) - i; }
  if (n <= 1 || p >= bal) p = bal;
  p = Math.max(0, p);
  return { k: k, i: i, p: p, t: i + p, bal: bal, rate: r * 1200 };
}
// 目前狀態＋往後預估
function reLoanSummary_(loan) {
  if (!loan || !(reNum_(loan.balance0) > 0) || !loan.first) return null;
  var today = reToday_(), ym = reYm_(today);
  var paidKeys = Object.keys(loan.paid || {}).sort();
  var interestPaid = 0, principalPaid = 0;
  paidKeys.forEach(function (k) { interestPaid += reNum_(loan.paid[k].i); principalPaid += reNum_(loan.paid[k].p); });
  // 下一期：還沒記帳的第一個月
  var next = loan.first;
  while (loan.paid && loan.paid[next]) next = reAddM_(next, 1);
  var balNow = reBalBefore_(loan, next);
  // 往後模擬到還完
  var sim = [], bal = balNow, m = next, totalInt = 0, guard = 0;
  while (bal > 0 && guard++ < 600) {
    var c = reCalc_(loan, m, bal);
    if (c.t <= 0 && c.p <= 0 && c.i <= 0) break;
    sim.push({ ym: m, due: reDue_(m, loan.payDay), k: c.k, i: c.i, p: c.p, t: c.t, bal: bal - c.p, rate: c.rate });
    totalInt += c.i; bal -= c.p; m = reAddM_(m, 1);
    if (c.p <= 0 && c.k > (Number(loan.grace) || 0) + 1 && guard > 2) break; // 防呆
  }
  var recent = paidKeys.slice(-12).reverse().map(function (k) { var x = loan.paid[k]; return { ym: k, due: reDue_(k, loan.payDay), k: x.k, i: x.i, p: x.p, t: x.t, edited: !!x.edited, fail: x.fail || "" }; });
  return { balance: balNow, interestPaid: interestPaid, principalPaid: principalPaid, next: sim[0] || null, remaining: sim.length,
    payoff: sim.length ? sim[sim.length - 1].ym : ym, interestLeft: totalInt, preview: sim.slice(0, 12), recent: recent,
    rate: reRate_(loan, next), pending: loan.pending || "" };
}

// ---------- 出租、固定支出 ----------
function reRoomMonths_(room, today) {
  // 該收租的月份：收租日落在合約期間內、而且從 autoFrom 開始、已經到了的
  var out = [];
  if (!room.start || !room.end || !room.autoFrom) return out;
  var m = room.autoFrom, guard = 0;
  while (guard++ < 120) {
    var due = reDue_(m, room.payDay);
    if (due > today || due > room.end) break;
    if (due >= room.start) out.push(m);
    m = reAddM_(m, 1);
  }
  return out;
}
function reCostMonths_(c, today) {
  var out = [];
  if (!c.autoFrom) return out;
  var m = c.autoFrom, guard = 0;
  while (guard++ < 120) {
    var due = reDue_(m, c.day);
    if (due > today) break;
    if (c.freq !== "y" || Number(m.slice(5, 7)) === Number(c.month)) out.push(m);
    m = reAddM_(m, 1);
  }
  return out;
}

// ---------- 自動記帳 ----------
function reTag_(pid, kind, ym, sub) { return "［房:" + pid + ":" + kind + ":" + ym + (sub ? ":" + sub : "") + "］"; }
function reFindRows_(ss, tag) {
  var sh = ss.getSheetByName("收支紀錄"), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var notes = sh.getRange(2, 5, sh.getLastRow() - 1, 1).getValues();
  for (var i = notes.length - 1; i >= 0; i--) if (String(notes[i][0]).indexOf(tag) >= 0) out.push(i + 2);
  return out;
}
function rePost_(ss, type, cat, amount, note, account, day) {
  amount = Math.round(amount);
  if (!(amount > 0)) return;
  var sh = ss.getSheetByName("工作表1"), lifeBefore = null;
  if (type === "支出" && sh) lifeBefore = waNum_(sh.getRange(R_(45), 2).getValue());
  waSubmitLedger({ type: type, amount: amount, category: cat, oneTime: type === "支出", note: note, account: account, date: day, _noDash: true, _bound: true });
  // 房子的錢（房貸、管理費、稅）從「投資現金」出，不吃每週生活費：
  // 記帳時預設從生活帳戶扣，這裡把被扣掉的那部分從投資現金補回生活帳戶
  if (lifeBefore !== null) {
    try {
      var cash = waNum_(sh.getRange(R_(10), 4).getValue()), lifeAfter = waNum_(sh.getRange(R_(45), 2).getValue());
      var used = Math.max(0, lifeBefore - lifeAfter), move = Math.min(used, cash);
      if (move > 0) {
        sh.getRange(R_(10), 4).setValue(cash - move);
        sh.getRange(R_(45), 2).setValue(lifeAfter + move);
        try { refreshLifeAccountDisplayV2_(ss); } catch (re) { Logger.log(re); }
      }
    } catch (e) { Logger.log("房屋支出改從投資現金扣失敗：" + e); }
  }
}
// 共同持有：持分（幾分之幾）；房貸可以另外設定自己負擔幾 %，沒設定就照持分
function reShare_(p) { var s = p && p.share, n = reNum_(s && s.n), d = reNum_(s && s.d); return n > 0 && d > 0 && n <= d ? n / d : 1; }
function reLoanShare_(p) { var v = reNum_(p && p.loan && p.loan.payShare); return v > 0 && v <= 100 ? v / 100 : reShare_(p); }
function reShareNote_(f) { return f < 1 ? "（你的 " + Math.round(f * 1000) / 10 + "%）" : ""; }
// 每天跑一次（每小時的排程、或打開 App 時）：把到期的房貸、固定支出、租金記起來；一次最多補 24 筆
function reProcess_(force) {
  var ss = SS_();
  if (!reSheet_(ss, false)) return 0;
  var today = reToday_(), props = PROPS_();
  if (!force && props.getProperty("RE_LAST_RUN") === today) return 0;
  props.setProperty("RE_LAST_RUN", today);
  var n = 0, cap = 24;
  reAll_(ss).forEach(function (p) {
    var changed = false;
    if (p.sold) return; // 賣掉了：房貸、固定支出、租金都不再記
    // 汽機車：里程 3 個月沒更新 → 寄通知（Gmail／日曆照「通知方式」），之後每 30 天再提醒一次，更新了就停
    if (reVehicle_(p)) {
      var V0 = p.vehicle || {}, kd = reKmDays_(V0);
      if (kd >= RE_KM_DAYS_ && (!V0.kmRemind || (new Date(today + "T00:00:00+08:00") - new Date(V0.kmRemind + "T00:00:00+08:00")) / 86400000 >= 30)) {
        try {
          SEND_MAIL_(NOTIFY_EMAIL_(), "該更新里程了：" + (p.name || p.type),
            (p.name || p.type) + " 的里程" + (V0.kmDate ? "上次是 " + V0.kmDate + " 更新的（" + Math.round(kd) + " 天前）" : "還沒填過") + "。\n" +
            "里程會影響估值（跑越多、越不值錢），大約 3 個月更新一次就好。\n\n打開 App →「持股」→ " + (p.type === "機車" ? "🛵 " : "🚗 ") + (p.name || "") + " → 按「更新里程」，看儀表板填目前的公里數。");
          V0.kmRemind = today; p.vehicle = V0; changed = true;
        } catch (me) { Logger.log("里程提醒寄送失敗：" + me); }
      }
    }
    // 房貸
    var L = p.loan;
    if (L && L.first && reNum_(L.balance0) > 0) {
      var ym = L.first, skip = 0;
      while (L.paid && L.paid[ym] && skip++ < 700) ym = reAddM_(ym, 1); // 從還沒記的那一期開始
      var guard = 0;
      while (n < cap && guard++ < 36) {
        var due = reDue_(ym, L.payDay);
        if (due > today) break;
        if (!(L.paid && L.paid[ym])) {
          var c = reCalc_(L, ym);
          if (c.bal <= 0) break;
          try {
            var tag = reTag_(p.id, "loan", ym), lbl = (p.name || "房子") + " 房貸第 " + c.k + " 期";
            var lsh = reLoanShare_(p), ln = reShareNote_(lsh);
            var myI = Math.round(c.i * lsh), myP = Math.round(c.t * lsh) - myI;
            rePost_(ss, "支出", RE_CAT_INT_, myI, lbl + "利息" + ln + " " + tag, L.account, due);
            rePost_(ss, "支出", RE_CAT_PRIN_, myP, lbl + "本金" + ln + " " + tag, L.account, due);
            L.paid = L.paid || {}; L.paid[ym] = { k: c.k, i: c.i, p: c.p, t: c.t };
            if (L.pending === ym) L.pending = "";
            n += 2; changed = true;
          } catch (e) {
            L.pending = ym; changed = true;
            try { admErr_("房貸自動記帳", (p.name || "") + " " + ym + "：" + (e && e.message ? e.message : e)); } catch (x) {}
            break;
          }
        }
        ym = reAddM_(ym, 1);
      }
    }
    // 固定支出
    (p.costs || []).forEach(function (c) {
      reCostMonths_(c, today).forEach(function (ym) {
        if (n >= cap || (c.hist && c.hist[ym])) return;
        try {
          rePost_(ss, "支出", reVehicle_(p) ? "交通" : RE_CAT_COST_, reNum_(c.amount) * reShare_(p), (p.name || "房子") + " " + (c.name || "固定支出") + reShareNote_(reShare_(p)) + " " + reTag_(p.id, "cost", ym, c.id), c.account, reDue_(ym, c.day));
          c.hist = c.hist || {}; c.hist[ym] = Math.round(reNum_(c.amount)); n++; changed = true;
        } catch (e) { try { admErr_("房屋支出自動記帳", (p.name || "") + " " + c.name + " " + ym + "：" + e.message); } catch (x) {} }
      });
    });
    // 租金
    (p.rooms || []).forEach(function (r) {
      reRoomMonths_(r, today).forEach(function (ym) {
        if (n >= cap || (r.hist && r.hist[ym])) return;
        try {
          rePost_(ss, "收入", RE_CAT_RENT_, reNum_(r.rent) * reShare_(p), (p.name || "房子") + " " + (r.name || "") + " " + ym.slice(5) + " 月租金" + reShareNote_(reShare_(p)) + " " + reTag_(p.id, "rent", ym, r.id), r.account, reDue_(ym, r.payDay));
          r.hist = r.hist || {}; r.hist[ym] = { s: "paid", a: Math.round(reNum_(r.rent)) }; n++; changed = true;
        } catch (e) { try { admErr_("租金自動記帳", (p.name || "") + " " + r.name + " " + ym + "：" + e.message); } catch (x) {} }
      });
      // 合約快到期：寄一次通知
      if (r.end && !r.endNotified) {
        var days = (new Date(r.end + "T00:00:00+08:00") - new Date(today + "T00:00:00+08:00")) / 86400000;
        if (days >= 0 && days <= 30) {
          r.endNotified = true; changed = true;
          try { SEND_MAIL_(NOTIFY_EMAIL_(), "租約快到期：" + (p.name || "") + " " + (r.name || ""), (p.name || "") + " " + (r.name || "") + " 的租約 " + r.end + " 到期（剩 " + Math.round(days) + " 天）。\n要續約的話，到 App「持股 → 🏠 房地產」改到期日；不續約記得安排退押金。"); } catch (me) {}
        }
      }
    });
    if (changed) rePut_(ss, p);
  });
  try { reValRefresh_(ss); } catch (ve) { Logger.log("自動重估失敗：" + ve); }
  return n;
}

// 里程多久沒更新（天）；沒填過＝很久
var RE_KM_DAYS_ = 90;
function reKmDays_(V) { return V && V.kmDate ? (new Date(reToday_() + "T00:00:00+08:00") - new Date(V.kmDate + "T00:00:00+08:00")) / 86400000 : 9999; }

// ---------- 給畫面的資料 ----------
function reSummary_(p) {
  if (p.sold) return { id: p.id, name: p.name, type: p.type, isVeh: !!reVehicle_(p), sold: p.sold, value: 0, myValue: 0, myLoan: 0, myDeposits: 0, price: reNum_(p.price),
    loanBalance: 0, deposits: 0, equity: 0, equityWhole: 0, share: reShare_(p), loanShare: reShare_(p), rentMonth: 0, costMonth: 0, unpaid: [], ending: [], todo: [], use: p.use || "", project: p.project || "", owed: 0 };
  var today = reToday_();
  var ls = p.loan ? reLoanSummary_(p.loan) : null;
  var value = reNum_(p.value && p.value.amount);
  // 沒有自己填估值、也沒按「採用」：有自動估價就用自動估價（每月實價登錄更新會自己跟著變），沒有才用買的價格
  if (!(value > 0) && !reVehicle_(p) && p.auto && p.auto.ok) { try { value = Math.round(reAdjAmt_(p.auto, p.auto.adj || 0) / 10000) * 10000; } catch (ae) { value = reNum_(p.auto.amount); } }
  if (!(value > 0)) value = reNum_(p.price);
  var vv = reVehicle_(p) ? reVehVal_(p) : null;
  if (vv && vv.ok && !(p.value && reNum_(p.value.amount) > 0)) value = vv.amount; // 交通工具：沒有自己填估值就用折舊算的
  var deposits = 0, unpaid = [], ending = [], rentMonth = 0;
  (p.rooms || []).forEach(function (r) {
    var active = r.end && r.end >= today && (!r.start || r.start <= today);
    if (active) { deposits += reNum_(r.deposit); rentMonth += reNum_(r.rent); }
    Object.keys(r.hist || {}).forEach(function (ym) { if (r.hist[ym].s === "unpaid") unpaid.push({ room: r.name, ym: ym, a: r.hist[ym].a }); });
    if (r.end) { var d = (new Date(r.end + "T00:00:00+08:00") - new Date(today + "T00:00:00+08:00")) / 86400000; if (d >= 0 && d <= 30) ending.push({ room: r.name, end: r.end, days: Math.round(d) }); }
  });
  var costMonth = 0;
  (p.costs || []).forEach(function (c) { costMonth += c.freq === "y" ? reNum_(c.amount) / 12 : reNum_(c.amount); });
  var loanBal = ls ? ls.balance : 0, sh = reShare_(p), lsh = p.loan ? reLoanShare_(p) : sh;
  // 預售屋還沒交屋：還沒付給建商的錢（總價 − 已付）是要付的，淨值要扣掉
  var owed = p.presale ? Math.max(0, reNum_(p.price) - reNum_(p.paid)) : 0;
  return { presale: !!p.presale, owed: owed, paid: reNum_(p.paid), id: p.id, name: p.name, project: p.project || "", use: p.use || "自住", value: value, valueDate: p.value && p.value.date || p.buyDate || "",
    share: sh, shareText: sh < 1 ? reNum_(p.share.n) + "/" + reNum_(p.share.d) : "", loanShare: lsh,
    myValue: Math.round(value * sh), myLoan: Math.round(loanBal * lsh), myDeposits: Math.round(deposits * sh), equityWhole: Math.round(value - loanBal - deposits - owed),
    price: reNum_(p.price), loanBalance: loanBal, deposits: deposits, equity: Math.round(value * sh - loanBal * lsh - deposits * sh - owed * sh),
    loan: ls, rentMonth: rentMonth, costMonth: Math.round(costMonth), unpaid: unpaid, ending: ending, unitInfo: reUnitInfo_(p, value),
    veh: vv, isVeh: !!reVehicle_(p), type: p.type,
    vinfo: reVehicle_(p) ? (function (V) { V = V || {}; return { cc: V.cc || reCcGuess_(V) || 0, ccGuess: !V.cc, fuel: V.fuel || "汽油", mcls: V.mcls || "", year: V.year || "",
      km: V.km || 0, kmDate: V.kmDate || "", cond: V.cond || "正常", brand: V.brand || "", model: V.model || "", body: V.body || "", orig: V.orig || "", used: V.used || "", newPrice: V.newPrice || 0,
      costs: (p.costs || []).map(function (c) { return { n: c.name, a: reNum_(c.amount), f: c.freq }; }), rq: p.vrq || {} }; })(p.vehicle) : null,
    tax: { seen: p.taxSeen || {}, ins: p.ins || {} },
    // 評級用：買入日、屋齡、地段、實價登錄估價重點、車子接下來每年跌多少
    buyDate: p.buyDate || "", builtYear: p.builtYear || "", priceUnknown: !!p.priceUnknown, buyYear: p.buyYear || "",
    rt: reVehicle_(p) ? null : reRateInfo_(p, ls), addr: String(p.address || "").slice(0, 6),
    est: p.auto && p.auto.ok ? (function (A) { var loc = 0; ((A.why && A.why.parts) || []).forEach(function (x) { if (x[0] === "地段") loc = x[1]; }); return { lo: A.lo, hi: A.hi, rent: A.rentMonth || 0, loc: loc, band: A.band || 0, n: A.hit || 0, presale: !!A.presale, land: !!A.land }; })(p.auto) : null,
    dep: vv && vv.ok ? (function () { var c0 = reVehCurve_(vv.tier, vv.age); return { d1: c0 > 0 ? 1 - reVehCurve_(vv.tier, vv.age + 1) / c0 : 0, d5: c0 > 0 ? 1 - reVehCurve_(vv.tier, vv.age + 5) / c0 : 0, tier: vv.tier, age: vv.age, lo: vv.lo, hi: vv.hi }; })() : null,
    todo: (function () { var t = []; if (reVehicle_(p)) { var V = p.vehicle || {}; if (reKmDays_(V) >= RE_KM_DAYS_) t.push(V.kmDate ? "里程 " + Math.floor(reKmDays_(V) / 30) + " 個月沒更新" : "還沒填里程"); if (V.quote && (Date.now() - new Date(V.quote.date).getTime()) / 86400000 > 365) t.push("看到的行情一年沒更新"); } if (p.auto && p.auto.stale) t.push("基本資料改過，要重新估價"); if (p.auto && p.auto.ok && p.auto.prev && p.auto.prev !== p.auto.amount && !p.auto.seenPrev) t.push("實價登錄更新了，估價變成 $" + Math.round(p.auto.amount).toLocaleString()); if (unpaid.length) t.push("有 " + unpaid.length + " 筆房租還沒收到"); if (ending.length) t.push("租約快到期"); return t; })() };
}
// 房地產評級要用的基本資料（App 那邊算分數）
function reRateInfo_(p, ls) {
  try {
    var ar = p.area || {}, A = p.auto && p.auto.ok ? p.auto : null, ad = reAddr_(p.address), L = p.layout;
    var lyF = null; try { if (reLyOn_(L)) lyF = reLayoutAdj_(L).f; } catch (e0) {}
    return { type: p.type || "", floor: String(p.floor || ""), floors: reNum_(p.floors) || 0, ping: A && A.ping ? A.ping : reNum_(ar.gross) || reNum_(ar.total) || 0, land: reNum_(ar.land) || 0,
      pub: reNum_(ar.public) || 0, parking: String(p.parking || ""), city: ad.city || "", dist: ad.city && ad.dist ? ad.city + ad.dist : "", zone: p.zone || "",
      items: A ? (A.items || []) : null, parts: A && A.why && A.why.parts ? A.why.parts.slice(0, 20) : [], hit: A ? String(A.hit || "") : "", n: A ? A.n || 0 : 0, unit: A ? A.unit || 0 : 0,
      lyF: lyF, rq: p.rq || {}, rooms: (p.rooms || []).length, roomsOn: (p.rooms || []).filter(function (r) { return r.end && r.end >= reToday_(); }).length,
      costs: (p.costs || []).map(function (c) { return { n: c.name, a: reNum_(c.amount), f: c.freq, est: !!c.est }; }),
      loanRate: ls ? ls.rate || 0 : 0, loanLeft: ls ? ls.remaining || 0 : 0, landPartial: !!p.landPartial, geo: p.geo || null, road: ad.road || "" };
  } catch (e) { return null; }
}
// 評級的補充資料（選填）：土地持分、都更進度、天災、管理、違建…
function waReRateSave(p) {
  var ss = SS_(), x = reGet_(ss, p.id), q = p.rq || {}, o = {};
  var one = function (k, list) { if (list.indexOf(q[k]) >= 0) o[k] = q[k]; };
  o.landPing = Math.max(0, Math.min(100000, reNum_(q.landPing))) || "";
  one("renew", ["none", "talk", "plan", "rights", "build"]);
  var nb = function (v, lo, hi) { var n = reNum_(v); return v == null || String(v).trim() === "" ? "" : Math.max(lo, Math.min(hi, n)); };
  if (o.renew && o.renew !== "none") { o.rnPing = nb(q.rnPing, 0, 1000); o.rnPk = nb(q.rnPk, 0, 20); if (o.rnPk !== "") o.rnPk = Math.round(o.rnPk); o.rnYr = nb(q.rnYr, 2000, 2080); o.rnPay = nb(q.rnPay, -100000, 100000); o.rnFl = nb(q.rnFl, 1, 120); o.rnTot = nb(q.rnTot, 1, 120); }
  one("flood", ["yes", "no"]); one("liquef", ["high", "mid", "low"]); one("fault", ["yes", "no"]);
  one("illegal", ["none", "roof", "out", "both"]); one("seaTest", ["ok", "bad", "none"]); one("industrial", ["yes", "no"]);
  one("fund", ["yes", "no"]); one("mrt", ["5", "10", "15", "far"]);
  one("splitOk", ["yes", "no"]); one("agent", ["yes", "no"]); one("tenant", ["brand", "local", "none"]); one("builder", ["listed", "small", "delay"]); one("guarantee", ["refund", "peer", "other"]);
  o.splitRooms = Math.max(0, Math.min(100, Math.round(reNum_(q.splitRooms)))) || "";
  o.mgmtFee = Math.max(0, Math.min(1000000, reNum_(q.mgmtFee))) || "";
  o.unique = (Array.isArray(q.unique) ? q.unique : []).filter(function (u) { return ["front", "lowd", "corner", "rare", "newsupply"].indexOf(u) >= 0; });
  x.rq = o; rePut_(ss, x);
  return { message: "已存", detail: "評級會用這些資料重新算" };
}
// 車子評級的補充資料（選填）
function waVehRateSave(p) {
  var ss = SS_(), x = reGet_(ss, p.id), q = p.rq || {}, o = {};
  var one = function (k, list) { if (list.indexOf(q[k]) >= 0) o[k] = q[k]; };
  one("maint", ["dealer", "shop", "none"]); one("owners", ["1", "2", "3"]); one("warranty", ["yes", "no"]); one("aeb", ["yes", "no"]); one("lane", ["yes", "no"]);
  one("abs", ["yes", "no"]); one("charge", ["yes", "no"]); one("battery", ["rent", "own"]); one("useDays", ["daily", "weekly", "rare"]); one("fit", ["ok", "small", "big"]);
  o.parkFee = Math.max(0, Math.min(100000, reNum_(q.parkFee))) || "";
  o.fuelM = Math.max(0, Math.min(100000, reNum_(q.fuelM))) || "";
  o.maintY = Math.max(0, Math.min(2000000, reNum_(q.maintY))) || "";
  o.soh = Math.max(0, Math.min(100, reNum_(q.soh))) || "";
  x.vrq = o; rePut_(ss, x);
  return { message: "已存", detail: "評級會用這些資料重新算" };
}
// 估值換算成每坪（扣車位、機車位、露台地下室這些），還有車位的坪數和價格：給列表、估值旁邊顯示
// 估值換算成每坪：跟實價登錄一樣，總價＝每坪（扣車位）× 坪數＋車位價；露台、增建、機車位、調整都算進每坪
function reUnitInfo_(p, value) {
  var A = p.auto && p.auto.ok && !p.auto.land && p.auto.ping > 0 ? p.auto : null;
  if (!A || !(value > 0)) return null;
  var pv = A.parkValue || 0;
  return { ppu: Math.round((value - pv) / A.ping), ping: A.ping, park: A.parkCount ? { type: A.parkType, count: A.parkCount, area: A.parkArea || 0, value: pv } : null };
}

// ============================================================
// 🚗 交通工具（汽車、機車）：跟房子放在一起（車貸、固定支出、到期提醒都共用），估值用折舊算
// 台灣沒有公開的中古車成交資料可以用（8891 這些網站不能自動去抓），所以：
//   估值＝新車價 × 這個品牌這個車齡大概剩幾成 × 里程 × 車色 × 車況（都是一般中古車行情的經驗值）
//   你有去看同車款的行情（例如 8891 上同年份、差不多里程的開價），填進來就改用那個，之後照折舊慢慢往下算
// ============================================================
// 每一年剩幾成（第 0～15 年）
var RE_VEH_CURVE_ = {
  // 汽車：台灣 8891 實際開價 156 筆（2014～2025、30 款車）為主，8 年內混 30% 台灣業界折舊口訣；10 年以上只用實際資料（口訣對老車太樂觀）
  // 之後每測一台就對照市場調整（2026/10：測 25 台，含性能車、超跑、頂級豪華）。開價先打成交折扣（國產 93%、進口 95%）
  A: [0.76, 0.72, 0.65, 0.59, 0.508, 0.456, 0.427, 0.381, 0.35, 0.317, 0.291, 0.257, 0.228, 0.209, 0.19, 0.171], // 保值：Toyota、Lexus、Honda、Porsche
  B: [0.74, 0.69, 0.61, 0.55, 0.49, 0.43, 0.39, 0.34, 0.29, 0.25, 0.21, 0.193, 0.174, 0.152, 0.138, 0.125], // 一般：其他日系、韓系、Ford、MINI…
  C: [0.8, 0.75, 0.67, 0.6, 0.53, 0.47, 0.42, 0.382, 0.33, 0.299, 0.231, 0.18, 0.15, 0.12, 0.1, 0.09], // 歐系：近新車在台灣搶手，8 年後掉很快
  V: [0.76, 0.72, 0.663, 0.637, 0.583, 0.514, 0.466, 0.421, 0.367, 0.304, 0.26, 0.23, 0.21, 0.2, 0.18, 0.17], // 電動車：Tesla、Audi Q4 e-tron 前幾年都跟 Toyota 差不多
  P: [0.86, 0.80, 0.74, 0.69, 0.65, 0.60, 0.56, 0.51, 0.46, 0.39, 0.33, 0.285, 0.255, 0.235, 0.22, 0.20], // 性能車：BMW M、AMG、Audi RS／R8、Alfa QV、McLaren（M3、RS6 各年份對照）
  F: [0.68, 0.61, 0.55, 0.50, 0.44, 0.36, 0.33, 0.30, 0.27, 0.24, 0.21, 0.18, 0.16, 0.14, 0.13, 0.12], // 旗艦大型房車：A8、7 系列、S-Class、LS（A8 三個年份對照）
  S: [0.90, 0.87, 0.84, 0.82, 0.80, 0.78, 0.76, 0.74, 0.72, 0.70, 0.67, 0.64, 0.61, 0.58, 0.56, 0.54], // 超跑：Ferrari、Lamborghini（台灣原廠認證成交價）
  R: [0.85, 0.80, 0.74, 0.68, 0.62, 0.57, 0.52, 0.48, 0.45, 0.42, 0.39, 0.36, 0.33, 0.31, 0.30, 0.29], // Rolls-Royce：12 年約 3 成
  L: [0.78, 0.72, 0.64, 0.57, 0.5, 0.44, 0.39, 0.34, 0.3, 0.26, 0.23, 0.19, 0.153, 0.14, 0.128, 0.119], // Bentley、Maserati：頂級豪華裡跌最快
  W: [0.85, 0.78, 0.70, 0.64, 0.58, 0.52, 0.48, 0.44, 0.40, 0.36, 0.32, 0.28, 0.24, 0.21, 0.19, 0.17], // Aston Martin 跑車（美國 CarEdge 5 年 51%、12 年 21%，台灣對得上）
  Q: [0.86, 0.82, 0.76, 0.7, 0.65, 0.6, 0.56, 0.52, 0.33, 0.27, 0.22, 0.17, 0.14, 0.12, 0.11, 0.1], // Porsche：比 Toyota 還保值（8891 Macan、718、Cayenne 對照）
  X: [0.7, 0.62, 0.557, 0.506, 0.46, 0.392, 0.345, 0.312, 0.268, 0.232, 0.208, 0.182, 0.162, 0.135, 0.121, 0.108], // 跌很快的品牌：Maserati、Jaguar、Luxgen、MG、Opel、Infiniti（8891 對照）
  K: [0.93, 0.89, 0.83, 0.78, 0.73, 0.69, 0.66, 0.63, 0.60, 0.58, 0.56, 0.54, 0.52, 0.50, 0.48, 0.45], // 收藏型小車：Fiat 500、Abarth、Smart、Jimny、Terios（車少、有人收，越放越不跌）
  M: [0.88, 0.78, 0.70, 0.64, 0.61, 0.59, 0.57, 0.56, 0.55, 0.54, 0.53, 0.52, 0.50, 0.47, 0.43, 0.40], // 機車（一般速克達、白牌檔車）：17gogo 147 台車行開價（2026/10），4 年後幾乎不跌
  E: [0.85, 0.70, 0.60, 0.50, 0.42, 0.36, 0.31, 0.27, 0.24, 0.22, 0.20, 0.18, 0.16, 0.14, 0.12, 0.10], // 電動機車（Gogoro 等）：換代快、舊款收購很低
  Y: [0.88, 0.82, 0.76, 0.644, 0.552, 0.46, 0.405, 0.35, 0.313, 0.276, 0.248, 0.221, 0.193, 0.166, 0.147, 0.138], // 黃牌重機（250～550cc）：大羊放久了跌很快
  H: [0.88, 0.8, 0.72, 0.62, 0.564, 0.517, 0.489, 0.451, 0.404, 0.357, 0.32, 0.291, 0.263, 0.244, 0.226, 0.207]  // 紅牌重機（550cc 以上）
};
var RE_VEH_TIER_NAME_ = { A: "保值的品牌", B: "一般", C: "歐系", V: "電動車", P: "性能車", F: "旗艦大型房車", S: "超跑", R: "Rolls-Royce", L: "頂級豪華", W: "Aston Martin 跑車", Q: "Porsche", X: "跌得快的品牌", K: "收藏型小車", M: "一般機車", E: "電動機車", Y: "黃牌重機", H: "紅牌重機" };
// 車身型式（App 裡選；沒選的照車型猜）
var RE_VEH_BODIES_ = ["轎車", "休旅", "掀背", "旅行車", "轎跑", "雙門跑車", "敞篷", "MPV", "商用車"];
var RE_VEH_BODY_GUESS_ = [
  ["商用車", /hilux|hiace|ranger|gladiator|town ?ace|veryca|菱利|j ?space|carry|caddy|pick ?up|貨卡|貨車|廂型/i],
  ["MPV", /alphard|vellfire|granvia|sienta|previa|wish|zinger|touran|sharan|carens|carnival|custin|odyssey|m7|serena|berlingo|v-class|\bv ?(250|300)\b|5008|g50|218i active|2 ?series active|colt plus/i],
  ["敞篷", /cabrio|convertible|spider|spyder|roadster|volante|\bgtc\b|dawn|boxster|500c|595c|敞篷/i],
  ["轎跑", /gran coupe|sportback(?!.*\b(q3|q5|q8|e-tron)\b)|\ba[57]\b|\bcla\b|cls|rapide|panamera|taycan|\bi4\b|\b408\b|\b4 ?series gran/i],
  ["雙門跑車", /coupe|coupé|cayman|\b911\b|\bgt-?r\b|\btt\b|\b86\b|brz|\bz\b ?nismo|\b370z|wraith|continental gt\b|vantage|db9|db11|db12|dbs|\b458\b|\b488\b|\bf8\b|\b296\b|huracan|aventador|570s|720s|600lt|\bm[248]\b|\b[24]\d\di\b(?!.*gran)|camaro|mustang|challenger|evora|fortwo|\bq60|雙門/i],
  ["旅行車", /avant|estate|wagon|touring|combi|shooting|\bv[4-9]0\b|levorg|outback|allroad|\bsw\b|旅行/i],
  ["休旅", /\b(x[1-7]|q[2-8]|gl[abcesk]|ml|xc\d\d|ix\d?|ex\d\d)\b|e-?pace|f-?pace|i-?pace|macan|cayenne|urus|bentayga|cullinan|levante|grecale|stelvio|tonale|junior|dbx|tiguan|t-?roc|t-?cross|touareg|kodiaq|karoq|kamiq|yeti|cr-?v|hr-?v|rav4|cross|cx-\d|forester|\bxv\b|crosstrek|outlander|eclipse|xforce|kuga|escape|tucson|santa ?fe|venue|kona|sportage|sorento|stonic|kicks|x-?trail|qashqai|juke|\bnx\b|\brx\b|\bux\b|\blx\b|lbx|\bgx\b|model [xy]|3008|2008|countryman|wrangler|cherokee|compass|renegade|defender|discovery|evoque|velar|range rover|u[56]|urx|n7|\bqx\d|fx\d\d|terios|jimny|\bhs\b|\bzs\b|mokka|grandland|escalade|h3|kyron|rexton|e-?tron(?! gt)/i],
  ["掀背", /yaris|fit|jazz|march|tiida|swift|baleno|ignis|picanto|\bi10\b|polo|golf|up!|mazda ?2|mazda ?3 ?5d|focus 5d|\bfocus\b(?!.*(wagon|4d))|\ba1\b|\ba3 sportback|\b1 ?series|\b1[1-4]\di\b|\ba ?(180|200|250)\b|cooper|\bone\b|\bc4\b|ds3|ds5|\b208|\b308|clio|megane|fabia|scala|forfour|\b500\b|595|695|sirion|prius c|auris|ct ?200h|q30|astra|\bi3\b|colt|s3/i],
  ["轎車", /./]
];
function reVehBody_(V) {
  if (RE_VEH_BODIES_.indexOf(V.body) >= 0) return V.body;
  var m = String(V.model || ""), hit = "轎車";
  RE_VEH_BODY_GUESS_.some(function (g) { if (g[1].test(m)) { hit = g[0]; return true; } return false; });
  return hit;
}
// 品牌加減分（8891 2026/10 全品牌 1,018 台對照，同組別裡特別保值／不保值的）
var RE_VEH_BRAND_ADJ_ = { "Mazda": 0.12, "Subaru": 0.08, "MINI": 0.10, "Kia": 0.12, "Hyundai": 0.08, "Suzuki": 0.15, "Lexus": 0.10, "Mitsubishi": -0.05, "Citroen": 0.15, "Peugeot": 0.06, "CMC": 0.05, "Alfa Romeo": 0.10, "Infiniti": -0.10, "Mercedes-Benz": 0.12, "Audi": -0.08, "Volvo": -0.05, "Smart": -0.33, "Daihatsu": -0.15, "Honda": -0.04 };
// 車型決定組別（優先於品牌）：[品牌（空＝不限）, 車型關鍵字, 組別]
var RE_VEH_GROUP_ = [
  ["BMW", /\bM[2-8]\b|\bX[3-7] ?M\b|\bM ?Performance\b/i, "P"], ["Mercedes-Benz", /\b(AMG ?)?(A|C|E|CLA|CLS|GLA|GLB|GLC|GLE|GLS|SL|SLK|SLC|GT) ?(35|43)\b/i, "C"], ["Mercedes-Benz", /AMG ?GT|\b(A|C|E|S|G|CLA|CLS|GLA|GLC|GLE|GLS|SL|ML|GL) ?(45|53|55|63|65)\b/i, "P"],
  ["Audi", /\bRS ?(\d|Q\d|e-?tron)|\bTT ?RS\b|\bR8\b|\bS[1-8]\b|\bSQ\d\b|\bTTS\b/i, "P"], ["Alfa Romeo", /Quadrifoglio|\bQV\b/i, "P"], ["Porsche", /\bGT[234]\b/i, "S"],
  ["Audi", /\bA8\b/i, "F"], ["BMW", /\b7 ?(Series|系列)\b|\b7[3-6]0/i, "F"], ["Mercedes-Benz", /S[- ]?Class|\bS ?(350|400|450|500|560|580)\b/i, "F"], ["Lexus", /\bLS\b/i, "F"],
  ["Aston Martin", /DBX/i, "C"], ["Suzuki", /jimny/i, "K"], ["Daihatsu", /terios/i, "K"]
];
// 個別車款加減分（台灣行情查證過才加）：[車型關鍵字, 加減 %, 說明, 品牌（空＝不限）, 最早年, 最晚年]
var RE_VEH_MODEL_ = [
  [/alphard|阿法/i, 0.20, "Alphard 在台灣特別搶手", ""],
  [/\b458\b/, 0.10, "458 是最後一代自然進氣中置 V8，收藏價值高", "Ferrari"],
  [/California|Portofino|GTC4/i, -0.15, "法拉利 GT 車款比中置引擎車款不保值", "Ferrari"],
  [/\bR8\b/i, -0.20, "第一代 R8（2015 以前）變速箱評價差、行情較弱", "Audi", 0, 2015],
  [/wrangler|gladiator/i, 0.40, "Wrangler／Gladiator 在台灣特別搶手", "Jeep"],
  [/cullinan/i, 0.20, "Cullinan 是 Rolls-Royce 最搶手的休旅", "Rolls-Royce"],
  [/e-?power/i, -0.15, "e-Power 中古行情偏弱", "Nissan"],
  [/\bS[3-8]\b|\bSQ\d\b|\bTTS\b/i, -0.10, "Audi S 系列比 RS 不保值", "Audi"],
  [/\bTT\b(?! ?RS)/i, 0.35, "TT 是經典跑車，老車行情撐得住", "Audi"],
  [/\b[24] ?(series|系列)|\b[24][1-4]0i\b|gran coupe/i, 0.12, "2／4 系列雙門、四門轎跑比較保值", "BMW"],
  [/\b5 ?(series|系列)|\b5[1-5]0[ide]\b/i, -0.08, "5 系列中古車多、行情偏弱", "BMW"]
];
var RE_VEH_BRANDS_ = { "Toyota": "A", "Lexus": "A", "Honda": "A", "Porsche": "Q", "Mazda": "B", "Nissan": "B", "Subaru": "B", "Suzuki": "B", "Mitsubishi": "B", "Ford": "B", "MINI": "B", "Jeep": "B", "Infiniti": "C", "MG": "X", "Opel": "X", "CMC": "B", "Daihatsu": "B", "Fiat": "K", "Abarth": "K", "Smart": "K", "Renault": "C", "Chevrolet": "B", "Cadillac": "C",
  "BMW": "C", "Mercedes-Benz": "C", "Audi": "C", "Volvo": "C", "Volkswagen": "C", "Skoda": "C", "Peugeot": "C", "Citroen": "C", "Land Rover": "C", "Jaguar": "X", "Alfa Romeo": "C", "Hyundai": "B", "Kia": "B", "Luxgen": "X", "Tesla": "V",
  "Ferrari": "S", "Lamborghini": "S", "McLaren": "P", "Lotus": "P", "Rolls-Royce": "R", "Bentley": "L", "Maserati": "X", "Aston Martin": "W", "其他": "B" };
var RE_VEH_MOTO_ = { "Yamaha": "M", "SYM 三陽": "M", "Kymco 光陽": "M", "Honda": "M", "Suzuki": "M", "PGO": "M", "宏佳騰 AEON": "M", "Vespa 偉士牌": "M", "Kawasaki": "M", "BMW": "M", "Ducati": "M", "Harley-Davidson": "M", "Triumph": "M", "KTM": "M", "Aprilia": "M", "CFMOTO": "M", "Gogoro": "E", "Ionex 光陽電動": "E", "eMOVING": "E", "其他": "M", "其他電動": "E" };
// 車型裡寫的排氣量（例如「勁戰 125」「RAV4 2.5」）
function reCcGuess_(V) {
  var m = String(V && V.model || ""), a = m.match(/(\d{3,4}) ?cc/i) || m.match(/\b(\d{2,4})\b(?!\s*(年|萬))/), b = m.match(/\b([1-6]\.\d)\s*[LT]?\b/i);
  if (a && Number(a[1]) >= 49 && Number(a[1]) <= 8000) return Number(a[1]);
  if (b) return Math.round(Number(b[1]) * 1000);
  return 0;
}
// 機車車種（App 裡選；沒選的照車型、排氣量猜）
var RE_MOTO_CLS_ = { "速克達": "M", "檔車": "M", "黃牌": "Y", "紅牌": "H", "電動": "E" };
function reMotoCls_(V) {
  if (RE_MOTO_CLS_[V.mcls]) return V.mcls;
  var m = String(V.model || ""), cc = (m.match(/(\d{3,4}) ?(cc|i\b)/i) || m.match(/\b(\d{3,4})\b/) || [])[1];
  if (V.fuel === "電動" || RE_VEH_MOTO_[V.brand] === "E") return "電動";
  if (/tmax|x-?adv|forza ?750|ak ?550|cv3|maxsym ?600|r7\b|mt-?0[79]|xsr ?[79]00|cb ?650|cbr ?[69]50|ninja ?[69]50|z ?[89]00|z ?1000|gsx-?[rs] ?(750|1000)|rebel ?1100|africa|f ?[89]00|s ?1000|r ?1250|panigale|monster|scrambler|multistrada|street ?triple|tiger|duke ?[789]90|tuareg|xg ?750|sportster|softail|fat ?boy/i.test(m) || /^(Ducati|Harley-Davidson|Triumph)$/.test(V.brand)) return "紅牌";
  if (/xmax|maxsym|joymax|xciting|刺激|adxtg|downtown|r3\b|mt-?03|ninja ?[34]00|z ?[34]00|rebel ?500|cbr ?500|cb ?500|450 ?sr|duke ?390|rc ?390|str ?300|elite ?300|gixxer ?250|gts ?300|tl ?50\d/i.test(m)) return "黃牌";
  if (cc) { cc = Number(cc); if (cc >= 550) return "紅牌"; if (cc >= 250) return "黃牌"; }
  return /r15|mt-?15|gsx-?[rs] ?150|ktr|野狼|檔車/i.test(m) ? "檔車" : "速克達";
}
var RE_MOTO_BRAND_ADJ_ = { "Yamaha": 0.05, "Kymco 光陽": -0.12, "Honda": 0.08, "Kawasaki": -0.10, "Harley-Davidson": -0.15, "Vespa 偉士牌": 0.10 };
// 外匯車：國外售價換成台灣落地價（匯率用大約值；歐元、英鎊售價含當地加值稅，先扣掉）
var RE_VEH_FX_ = { USD: [31, 1, "美元"], EUR: [34, 1.2, "歐元"], JPY: [0.21, 1.1, "日圓"], GBP: [40, 1.2, "英鎊"] };
function reVehImport_(fx) {
  var R = RE_VEH_FX_[fx && fx.cur] || RE_VEH_FX_.USD, p = reNum_(fx && fx.p); if (!(p > 0)) return null;
  var net = p * R[0] / R[1], cif = net * 1.04, duty = cif * 0.175, cargoR = fx.cc === "ev" ? 0 : fx.cc === "big" ? 0.30 : 0.25, cargo = (cif + duty) * cargoR;
  var vat = (cif + duty + cargo) * 0.05, lux = cif >= 3000000 ? cif * 0.10 : 0, cost = cif + duty + cargo + vat + lux, total = cost * 1.15;
  return { total: Math.round(total), lines: [R[2] + " " + Math.round(p).toLocaleString() + (R[1] > 1 ? "（扣當地稅）" : "") + " ≈ 台幣 " + Math.round(net).toLocaleString(), "＋運費保險 4%、關稅 17.5%、貨物稅 " + Math.round(cargoR * 100) + "%、營業稅 5%" + (lux ? "、奢侈稅 10%" : "") + "、外匯商利潤和驗車領牌約 15%"] };
}
function reVehicle_(p) { return p && (p.type === "汽車" || p.type === "機車"); }
function reVehClean_(v, old) {
  var n = function (x) { x = Number(String(x === undefined || x === null ? "" : x).replace(/[,\s]/g, "")); return isFinite(x) && x > 0 ? x : 0; };
  var o = { brand: reStr_(v.brand, 30), model: reStr_(v.model, 40), cc: v.cc === undefined ? old.cc || "" : Math.min(20000, Math.round(n(v.cc))) || "", year: Math.round(n(v.year)) || "", month: Math.min(12, Math.round(n(v.month))) || "", fuel: reStr_(v.fuel, 6) || "汽油", orig: v.orig === undefined ? old.orig || "" : (v.orig === "外匯" ? "外匯" : ""),
    newPrice: n(v.newPrice), color: reStr_(v.color, 6) || "白", cond: reStr_(v.cond, 8) || "正常",
    body: v.body === undefined ? old.body || "" : (RE_VEH_BODIES_.indexOf(v.body) >= 0 ? v.body : ""),
    mcls: v.mcls === undefined ? old.mcls || "" : (RE_MOTO_CLS_[v.mcls] ? v.mcls : ""),
    used: v.used === undefined ? old.used || "" : (/^(新車|二手)$/.test(v.used) ? v.used : ""), opt: v.opt === undefined ? old.opt || 0 : n(v.opt),
    km: v.km === undefined ? old.km || 0 : Math.round(n(v.km)), kmDate: v.km === undefined || v.km === "" || v.km === null ? old.kmDate || "" : (Math.round(n(v.km)) === old.km && old.kmDate ? old.kmDate : reToday_()),
    kmLog: old.kmLog || [], quote: old.quote || null,
    fx: v.fx === undefined ? old.fx || null : (v.fx && reNum_(v.fx.p) > 0 ? { p: reNum_(v.fx.p), cur: RE_VEH_FX_[v.fx.cur] ? v.fx.cur : "USD", cc: /^(small|big|ev)$/.test(v.fx.cc) ? v.fx.cc : "small" } : null) };
  if (o.year && (o.year < 1950 || o.year > 2100)) throw new Error("出廠年份不對");
  if (v.km !== undefined && v.km !== "" && (!old.kmLog || !old.kmLog.length || old.kmLog[old.kmLog.length - 1][1] !== o.km)) o.kmLog = (old.kmLog || []).concat([[reToday_(), o.km]]).slice(-30);
  return o;
}
function reVehCurve_(t, age) {
  var c = RE_VEH_CURVE_[t] || RE_VEH_CURVE_.B; if (!(age > 0)) return 1;
  if (age < 0.5) return 1 - (1 - c[0]) * age / 0.5; // 剛買：半年內從 100% 降到第 0 年的值
  var i = Math.floor(age), f = age - i;
  if (i >= c.length - 1) return Math.max(c[c.length - 1] * Math.pow(/^[PSWQKR]$/.test(t) ? 0.97 : 0.93, age - (c.length - 1)), 0.05); // 15 年以上：跑車、收藏車幾乎不再跌
  return c[i] + (c[i + 1] - c[i]) * f;
}
function reVehVal_(p, todayStr) {
  var V = p.vehicle || {}, car = p.type === "汽車";
  var mcls = car ? "" : reMotoCls_(V);
  var tier = car ? RE_VEH_BRANDS_[V.brand] || "B" : RE_MOTO_CLS_[mcls];
  if (car) { RE_VEH_GROUP_.some(function (g) { if ((!g[0] || g[0] === V.brand) && g[1].test(V.model || "")) { tier = g[2]; return true; } return false; }); if (V.fuel === "電動" && /^[ABC]$/.test(tier)) tier = "V"; }
  var rare = /^[SRLW]$/.test(tier);
  if (!(V.year > 1900)) return { ok: false, why: "要填出廠年份" };
  var now = todayStr ? new Date(todayStr) : new Date(), born = new Date(V.year, (V.month || 6) - 1, 15), age = Math.max(0, (now - born) / (365.25 * 86400000));
  var r = reVehCurve_(tier, age), parts = [];
  // 新車價：沒填就用買的價格回推（新車買的＝買價）
  var base = reNum_(V.newPrice), baseSrc = "新車價", imp = null;
  if (!(base > 0) && V.orig === "外匯" && V.fx) { imp = reVehImport_(V.fx); if (imp) { base = imp.total; baseSrc = "外匯車：國外售價推算台灣落地價"; } }
  // 買新車：買的價格就是新車價；買二手：先查同車型當年的新車價，查不到才用買的價格和買的時候的車齡回推
  if (!(base > 0) && V.used === "新車" && reNum_(p.price) > 0) { base = reNum_(p.price); baseSrc = "買的價格（買新車）"; }
  if (!(base > 0) && V.used === "二手") { var np = reVehNP_(V.brand, V.model, V.year, !car); if (np) { base = np.price; baseSrc = "系統查的當年新車價（參考：" + np.name + "）"; } }
  if (base > 0 && V.used === "二手" && reNum_(V.opt) > 0) { base += reNum_(V.opt); baseSrc += "＋選配 $" + Math.round(reNum_(V.opt)).toLocaleString(); }
  if (!(base > 0) && reNum_(p.price) > 0) {
    var bd = p.buyDate ? new Date(p.buyDate) : null, ageBuy = bd ? Math.max(0, (bd - born) / (365.25 * 86400000)) : 0;
    base = reNum_(p.price) / reVehCurve_(tier, ageBuy); baseSrc = ageBuy < 0.5 ? "買的價格" : "用買的價格回推新車價（買的時候車齡 " + Math.round(ageBuy * 10) / 10 + " 年）";
  }
  if (!(base > 0)) return { ok: false, why: "要填新車價或買的價格" };
  // 里程：一般一年汽車約 1.2 萬公里、機車約 4,000 公里；多跑的扣、少跑的加一點
  var per = car ? (tier === "S" ? 5000 : 12000) : 4000, step = car ? 10000 : 3000, kmEst = reNum_(V.km), kmNote = "";
  if (kmEst > 0 && V.kmDate) {
    var kd = new Date(V.kmDate), ageAtKm = Math.max(0.3, (kd - born) / (365.25 * 86400000)), rate = Math.min(per * 3, Math.max(per * 0.2, kmEst / ageAtKm));
    var extra = Math.max(0, (now - kd) / (365.25 * 86400000)) * rate; kmEst = Math.round(kmEst + extra);
    if (extra > 300) kmNote = "上次填 " + reNum_(V.km).toLocaleString() + " 公里（" + V.kmDate + "），照你的開車習慣推算現在約 " + kmEst.toLocaleString() + " 公里";
  }
  var kmAdj = 0;
  if (kmEst > 0) kmAdj = Math.max(-0.15, Math.min(tier === "S" ? 0.15 : rare || age >= 10 ? 0.04 : 0.08, -(car && tier !== "S" ? 0.01 : 0.02) * (kmEst - per * age) / step)); // 超跑：一年約 5 千公里、低里程差很多；頂級豪華、老車：低里程加分少 // 汽車：每多跑 1 萬公里約少 1%（台灣資料 0.8～1.2%）
  var colAdj = /^[PSW]$/.test(tier) ? 0 : /^(白|黑|銀|灰)$/.test(V.color || "白") ? 0 : V.color === "少見" ? -0.05 : -0.02; // 性能車、超跑的特殊色常是招牌色，不扣 // 美國 210 萬筆：常見色差 1% 內
  var mAdj = 0, mNote = "";
  if (car) RE_VEH_MODEL_.forEach(function (m) { if (!mAdj && m[0].test(V.model || "") && (!m[3] || m[3] === V.brand) && !(m[4] && V.year < m[4]) && !(m[5] && V.year > m[5])) { mAdj = m[1]; mNote = m[2]; } });
  var hybAdj = car && /^[ABC]$/.test(tier) && /油電|插電/.test(V.fuel || "") ? 0.05 : 0; // 油電車比較保值（美國 5 年少跌約 6 個百分點，取一半）
  var bAdj = 0, bNote = "", body = car ? reVehBody_(V) : "", brAdj = car ? (/^[ABCXK]$/.test(tier) ? RE_VEH_BRAND_ADJ_[V.brand] || 0 : 0) : RE_MOTO_BRAND_ADJ_[V.brand] || 0;
  if (car) { // 車身型式（8891 對照）：做生意的車最保值；MPV、歐系大轎車跌比較快；歐系休旅 4 年後跌比較快；老的豪華大轎車跌非常快
    var lux = /^[CLFXR]$/.test(tier), big = /^[FXR]$/.test(tier) || (tier === "C" && base >= 3000000), a1 = Math.max(0, age - 1);
    if (body === "商用車") { bAdj = 0.20; bNote = "做生意的車（貨卡、廂型車）很保值"; }
    else if (body === "MPV" && !mAdj) { bAdj = -0.10; bNote = "MPV 中古行情比較弱"; }
    else if (body === "轎車" && lux) { bAdj = -(tier === "F" ? 0 : Math.min(0.12, 0.04 * a1)) - (big ? Math.min(0.35, 0.06 * Math.max(0, age - 6)) : 0); bNote = big && age > 6 ? "大型豪華轎車放久了跌很快" : "歐系轎車比休旅不保值"; }
    else if (body === "休旅" && tier === "C" && base < 4000000) { bAdj = -Math.min(0.10, 0.03 * a1); bNote = "歐系休旅放幾年後跌比較快"; }
    else if ((body === "雙門跑車" || body === "敞篷") && tier === "Q") { bAdj = Math.min(0.8, 0.1 * Math.max(0, age - 4)); bNote = "911、718 這類跑車放久了比 Porsche 休旅、轎車保值"; }
    else if (body === "敞篷" && lux) { bAdj = -Math.min(0.25, 0.03 * age); bNote = "歐系敞篷車放久了不好賣"; }
    if (tier === "V" && base >= 3000000) { bAdj += -0.10; bNote = (bNote ? bNote + "；" : "") + "高價電動車跌比較快"; }
  }
  var condAdj = { "正常": 0, "小擦撞修過": -0.05, "大事故修過": -0.2, "泡水": -0.4 }[V.cond || "正常"] || 0;
  var model = base * r * (1 + kmAdj) * (1 + colAdj) * (1 + hybAdj) * (1 + mAdj) * (1 + bAdj) * (1 + brAdj) * (1 + condAdj);
  var floor = (car ? (age >= 8 ? Math.min(base * 0.2, 120000) : 0) : tier === "M" && age >= 6 ? Math.min(base * 0.3, 18000) : 0) * (1 + condAdj); // 還能開的車，市場上很少低於 10 幾萬；還能騎的速克達很少低於 1～2 萬
  if (model < floor) model = floor;
  parts.push([baseSrc, Math.round(base)], ["車齡 " + (Math.round(age * 10) / 10) + " 年剩 " + Math.round(r * 100) + "%（" + RE_VEH_TIER_NAME_[tier] + "）", Math.round(base * r)]);
  if (kmAdj) parts.push(["里程 " + kmEst.toLocaleString() + " 公里（同車齡一般約 " + Math.round(per * age).toLocaleString() + "）" + (kmAdj > 0 ? "+" : "") + Math.round(kmAdj * 1000) / 10 + "%", 0]);
  if (imp) imp.lines.forEach(function (l) { parts.push([l, 0]); });
  if (mAdj) parts.push([mNote + " " + (mAdj > 0 ? "+" : "") + Math.round(mAdj * 100) + "%", 0]);
  if (bAdj) parts.push([body + "：" + bNote + " " + (bAdj > 0 ? "+" : "") + Math.round(bAdj * 100) + "%", 0]);
  if (brAdj) parts.push([V.brand + (brAdj > 0 ? " 比同級車保值 +" : " 比同級車不保值 ") + Math.round(brAdj * 100) + "%", 0]);
  if (!car) parts.splice(2, 0, ["車種：" + mcls + (V.mcls ? "" : "（照車型判斷）"), 0]);
  if (floor && model === floor) parts.push([(car ? "還能開的車" : "還能騎的車") + "，行情很少低於 $" + Math.round(floor).toLocaleString(), 0]);
  if (rare) parts.push(["這類車台灣成交少、行情差很多，建議填看到的行情", 0]);
  if (V.orig === "外匯") parts.push(["外匯車：同年份行情差很多（配備、美規／加規不同），建議填看到的行情", 0]);
  if (hybAdj) parts.push(["油電車比較保值 +" + Math.round(hybAdj * 100) + "%", 0]);
  if (colAdj) parts.push(["車色 " + V.color + " " + Math.round(colAdj * 100) + "%", 0]);
  if (condAdj) parts.push(["車況 " + V.cond + " " + Math.round(condAdj * 100) + "%", 0]);
  var amount = model, src = "折舊推算", band = rare ? 0.25 : V.orig === "外匯" ? 0.2 : 0.15, qNote = "";
  // 有填看到的行情：開價通常比成交高 5～7%，再照折舊算到今天
  if (V.quote && V.quote.price > 0 && V.quote.date) {
    var qd = new Date(V.quote.date), ageQ = Math.max(0, (qd - born) / (365.25 * 86400000)), qy = (now - qd) / (365.25 * 86400000);
    var qf = car ? (/^[AB]$/.test(tier) && V.orig !== "外匯" ? 0.93 : 0.95) : 0.93; // 業者：國產標 35 萬成交 32～33 萬、進口標 125 萬成交 117～120 萬
    if (qy <= 2) { amount = V.quote.price * qf * reVehCurve_(tier, age) / reVehCurve_(tier, ageQ) * (1 + condAdj); src = "你看到的行情"; band = 0.08; qNote = V.quote.date + " 看到同車款開價 $" + Math.round(V.quote.price).toLocaleString() + "，成交通常低約 " + Math.round((1 - qf) * 100) + "%，再照折舊算到今天"; }
  }
  var rd = function (x) { return Math.round(x / 1000) * 1000; };
  if (!car) { // 機車：估值＝自己賣（私下賣）大概的價格；另外列車行收購價、車行開價（兩個差很多）
    var bf = tier === "E" ? Math.max(0.25, 0.8 - 0.1 * age) : tier === "M" ? Math.max(0.45, 0.9 - 0.035 * age) : Math.max(0.6, 0.85 - 0.02 * age);
    var r5 = function (x) { return Math.round(x / 500) * 500; };
    return { ok: true, amount: r5(amount), lo: r5(amount * bf), hi: r5(amount / 0.93), buy: r5(amount * bf), ask: r5(amount / 0.93), model: r5(model), src: src, qNote: qNote, kmEst: kmEst, kmNote: kmNote, age: Math.round(age * 10) / 10, tier: tier, mcls: mcls, parts: parts, search: (V.brand || "") + " " + (V.model || "") + " " + (V.year || "") };
  }
  return { ok: true, amount: rd(amount), lo: rd(amount * (1 - band)), hi: rd(amount * (1 + band)), model: rd(model), src: src, qNote: qNote, kmEst: kmEst, kmNote: kmNote, age: Math.round(age * 10) / 10, tier: tier, body: body, parts: parts, search: (V.brand || "") + " " + (V.model || "") + " " + (V.year || "") };
}
// 更新里程
function waVehKm(p) {
  var ss = SS_(), x = reGet_(ss, p.id); if (!reVehicle_(x)) throw new Error("這不是交通工具");
  var km = Math.round(Number(String(p.km).replace(/[,\s]/g, ""))); if (!(km >= 0)) throw new Error("請填數字");
  x.vehicle = reVehClean_({ brand: x.vehicle.brand, model: x.vehicle.model, year: x.vehicle.year, month: x.vehicle.month, fuel: x.vehicle.fuel, newPrice: x.vehicle.newPrice, color: x.vehicle.color, cond: x.vehicle.cond, km: km }, x.vehicle);
  rePut_(ss, x); var v = reVehVal_(x);
  return { message: "里程更新為 " + km.toLocaleString() + " 公里", detail: v.ok ? "估值約 $" + v.amount.toLocaleString() : "", dashboard: waGetDashboard() };
}
// 填看到的行情（同車款、同年份、差不多里程的開價）；0＝清掉
function waVehQuote(p) {
  var ss = SS_(), x = reGet_(ss, p.id); if (!reVehicle_(x)) throw new Error("這不是交通工具");
  var price = Math.round(Number(String(p.price).replace(/[,\s]/g, "")) || 0);
  x.vehicle.quote = price > 0 ? { price: price, date: reToday_() } : null; rePut_(ss, x); var v = reVehVal_(x);
  return { message: price > 0 ? "已用你看到的行情" : "改回折舊推算", detail: v.ok ? "估值約 $" + v.amount.toLocaleString() : "", dashboard: waGetDashboard() };
}
function reTotals_(ss) {
  var list = [];
  try { list = reAll_(ss).map(reSummary_); } catch (e) { Logger.log("房地產讀取失敗：" + e); }
  var t = { value: 0, loan: 0, deposits: 0, equity: 0, list: list };
  list.forEach(function (x) { if (x.sold) return; t.value += x.value; t.loan += x.loanBalance; t.deposits += x.deposits; t.equity += x.equity; });
  return t;
}

// ---------- App 呼叫 ----------
WA_READ_ONLY_.waReGet = 1;
function waReGet(p) {
  var ss = SS_(), x = reGet_(ss, p && p.id);
  var copy = JSON.parse(JSON.stringify(x)); delete copy._row;
  return { prop: copy, sum: reSummary_(x), types: RE_TYPES_ };
}
function reStr_(v, n) { return String(v === undefined || v === null ? "" : v).trim().slice(0, n || 100); }
function reDate_(v, label) { v = reStr_(v, 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + "日期格式不對"); return v; }
// 新增／修改基本資料。p: { id?, name, address, type, buyDate, price, use, area:{main,attach,balcony,terrace,public}, parking, builtYear, floor, floors, value, valueDate, note }
function waReSave(p) {
  var ss = SS_();
  var name = reStr_(p.name, 30);
  if (!name) throw new Error("請幫房子取個名字（例如：中和的家）");
  var x = p.id ? reGet_(ss, p.id) : { id: "P" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), loan: null, costs: [], rooms: [] };
  var oldAddr = x.address || "";
  x.name = name; x.address = reStr_(p.address, 80); x.type = RE_TYPES_.indexOf(p.type) >= 0 ? p.type : "其他";
  if (x.address && (x.address !== oldAddr || !x.geo) && x.type !== "汽車" && x.type !== "機車") x.geo = reGeo_(x.address);
  x.buyDate = reDate_(p.buyDate, "買入"); x.price = reNum_(p.price);
  x.use = ["自住", "整層出租", "分租", "空屋"].indexOf(p.use) >= 0 ? p.use : "自住";
  var a = p.area || {};
  x.area = { gross: reNum_(a.gross), land: reNum_(a.land), total: a.gross ? 0 : reNum_(a.total), main: reNum_(a.main), attach: reNum_(a.attach), balcony: reNum_(a.balcony), terrace: reNum_(a.terrace), public: reNum_(a.public), parking: reNum_(a.parking), bsmt: reNum_(a.bsmt), mezz: reNum_(a.mezz), addon: reNum_(a.addon), pk0: !!a.pk0, moto: Math.max(0, Math.min(20, Math.round(reNum_(a.moto)))), motoT: a.motoT === "own" ? "own" : "use", motoP: reNum_(a.motoP) };
  x.parking = reStr_(p.parking, 40); x.builtYear = reNum_(p.builtYear) || ""; x.floor = reStr_(p.floor, 10); x.floors = reNum_(p.floors) || "";
  x.note = reStr_(p.note, 300);
  if (x.type === "汽車" || x.type === "機車") x.vehicle = reVehClean_(p.vehicle || {}, x.vehicle || {});
  x.presale = !!p.presale; x.paid = x.presale ? Math.max(0, reNum_(p.paid)) : 0; x.unitNo = reStr_(p.unitNo, 20);
  if (x.presale && !(x.price > 0)) throw new Error("預售屋請填買入總價（合約總價）");
  if (x.presale && x.paid > x.price) throw new Error("已付金額不能超過合約總價");
  x.zone = RE_LAND_ZONES_.indexOf(p.zone) >= 0 ? p.zone : ""; x.landPartial = !!p.landPartial; x.wholeBldg = !!p.wholeBldg;
  x.project = reStr_(p.project, 30); x.builder = reStr_(p.builder, 30); x.contractor = reStr_(p.contractor, 30);
  var sn = Math.round(reNum_(p.shareN) || 1), sd = Math.round(reNum_(p.shareD) || 1);
  if (!(sn >= 1 && sd >= 1 && sn <= sd && sd <= 100000)) throw new Error("持分填幾分之幾，例如 1/2；分子不能比分母大");
  x.share = sn < sd ? { n: sn, d: sd } : null;
  // 估值沒改（表單帶回原本的數字）就保留原本的來源（例如「採用自動估價 +9.2%」），不要變成「自己填的」
  var nv = reNum_(p.value), ov = x.value;
  if (nv > 0 && !(ov && Math.round(reNum_(ov.amount)) === Math.round(nv) && (!p.valueDate || p.valueDate === ov.date))) x.value = { amount: nv, date: reDate_(p.valueDate, "估值") || reToday_() };
  if (x.auto) x.auto.stale = true; // 基本資料改過，自動估價要重算
  x.priceUnknown = !!p.priceUnknown && !x.presale;
  // 不記得價格：記「大約哪一年買的」，評級用那一年的房價往回推當時的價格
  var by0 = Math.round(reNum_(p.buyYear)), ty0 = Number(reToday_().slice(0, 4));
  x.buyYear = x.priceUnknown && by0 >= 1950 && by0 <= ty0 ? by0 : "";
  if (!(x.price > 0) && !(x.value && x.value.amount > 0) && !x.priceUnknown) throw new Error("請填買入總價或目前估值（至少一個）；很久以前買、不記得價格的話，勾「不記得買入價格」");
  rePut_(ss, x);
  return { message: (p.id ? "已更新 " : "已登記 ") + name, detail: p.id ? "" : "接著可以設定房貸、固定支出、出租", id: x.id };
}
function waReDelete(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  reSheet_(ss, false).deleteRow(x._row);
  return { message: "已刪除 " + x.name, detail: "以前自動記的帳不會刪，要的話到記帳那邊撤銷" };
}
// ---------- 賣出 ----------
// 賣房子、賣車：p: { id, date, price（成交價，整間／整台）, costs: [{ name, amount }]（你要付的費用）, payoff（要還清的貸款，你的部分）, account（錢進哪個帳戶）}
// 實拿＝成交價×持分 − 費用 − 還貸款；記一筆「一次性」收入到那個帳戶（實拿是負的就記支出）。賣掉之後不再記房貸、固定支出、租金
var RE_CAT_SELL_HOUSE_ = "賣房", RE_CAT_SELL_VEH_ = "賣車";
function waReSell(p) {
  var ss = SS_(), x = reGet_(ss, p && p.id);
  if (x.sold) throw new Error("這筆已經賣掉了");
  var day = reDate_(p.date, "賣出") || reToday_();
  if (day > reToday_()) throw new Error("賣出日期不能是未來");
  var price = reNum_(p.price);
  if (!(price > 0)) throw new Error("請填成交價");
  var sh = reShare_(x), myPrice = Math.round(price * sh);
  var costs = (Array.isArray(p.costs) ? p.costs : []).map(function (c) { return { name: reStr_(c.name, 20) || "費用", amount: Math.max(0, Math.round(reNum_(c.amount))) }; }).filter(function (c) { return c.amount > 0; });
  var costSum = costs.reduce(function (a, c) { return a + c.amount; }, 0);
  var payoff = Math.max(0, Math.round(reNum_(p.payoff)));
  var net = myPrice - costSum - payoff;
  var account = waCheckAccountName_(p.account);
  var isV = reVehicle_(x), cat = isV ? RE_CAT_SELL_VEH_ : RE_CAT_SELL_HOUSE_;
  var buy = Math.round(reNum_(x.price) * sh) + (isV ? 0 : 0);
  var gain = x.priceUnknown || !(reNum_(x.price) > 0) ? null : myPrice - costSum - buy;
  var tag = reTag_(x.id, "sell", day);
  var note = (x.name || (isV ? "車" : "房子")) + " 賣出：成交 $" + myPrice.toLocaleString() + (sh < 1 ? "（你的持分）" : "") +
    (costSum ? "－費用 $" + costSum.toLocaleString() : "") + (payoff ? "－還貸款 $" + payoff.toLocaleString() : "") + " " + tag;
  if (net > 0) rePost_(ss, "收入", cat, net, note, account, day);
  else if (net < 0) rePost_(ss, "支出", cat, -net, note, account, day);
  x.sold = { date: day, price: price, myPrice: myPrice, costs: costs, payoff: payoff, net: net, account: account, gain: gain, buy: buy };
  rePut_(ss, x);
  return { message: "已賣出 " + x.name, detail: (net >= 0 ? "實拿 $" + net.toLocaleString() + " 進「" + account + "」" : "還要補 $" + (-net).toLocaleString() + "（從「" + account + "」扣）") +
    (gain !== null ? "・" + (gain >= 0 ? "賺 $" + gain.toLocaleString() : "賠 $" + (-gain).toLocaleString()) + "（跟買的價格比，已扣費用）" : ""), dashboard: waGetDashboard() };
}
// 賣錯了：撤掉那筆收入／支出，回到還沒賣的樣子
function waReUnsell(p) {
  var ss = SS_(), x = reGet_(ss, p && p.id);
  if (!x.sold) throw new Error("這筆沒有賣出");
  var rows = reFindRows_(ss, reTag_(x.id, "sell", x.sold.date)); // 由下往上，刪了不會影響前面的列號
  rows.forEach(function (r) { waUndoLedger({ row: r }); });
  delete x.sold;
  rePut_(ss, x);
  return { message: "已取消賣出 " + x.name, detail: rows.length ? "那筆賣出的帳也撤掉了" : "", dashboard: waGetDashboard() };
}

// 房貸設定。loan: { bank, amount, balance0, k0, years, graceYears, method, rate, payDay, account, first }
function waReLoanSave(p) {
  var ss = SS_(), x = reGet_(ss, p.id), L = p.loan;
  if (!L) { x.loan = null; rePut_(ss, x); return { message: "已移除房貸設定", detail: "以前記的帳不會刪" }; }
  var old = x.loan || {};
  var amount = reNum_(L.amount), bal0 = reNum_(L.balance0) || amount, years = reNum_(L.years), rate = reNum_(L.rate);
  if (!(amount > 0)) throw new Error("請填貸款金額");
  if (!(years > 0 && years <= 50)) throw new Error("貸款年限要在 1～50 年");
  if (!(rate >= 0 && rate < 20)) throw new Error("利率填年利率 %，例如 2.185");
  var first = reStr_(L.first, 7);
  if (!/^\d{4}-\d{2}$/.test(first)) throw new Error("請選「下一期扣款」是哪個月");
  if (!reStr_(L.account)) throw new Error("請選從哪個帳戶扣款");
  waCheckAccountName_(L.account);
  var k0 = Math.max(0, Math.round(reNum_(L.k0)));
  if (k0 >= years * 12) throw new Error("已繳期數不能超過總期數");
  var nl = { bank: reStr_(L.bank, 30), amount: amount, balance0: Math.min(bal0, amount), k0: k0, term: Math.round(years * 12),
    grace: Math.round(reNum_(L.graceYears) * 12), method: L.method === "equal" ? "equal" : "annuity", payDay: Math.min(28, Math.max(1, Math.round(reNum_(L.payDay) || 1))),
    account: reStr_(L.account, 60), first: first, paid: old.first === first && old.k0 === k0 && old.balance0 === Math.min(bal0, amount) ? (old.paid || {}) : {},
    prepays: old.prepays || [], termAdj: old.termAdj || 0, rates: old.rates && old.rates.length ? old.rates : [],
    payShare: reNum_(L.payShare) > 0 ? Math.min(100, reNum_(L.payShare)) : null };
  // 利率：第一次設定就是全部；之後改的是「下一期開始」的利率
  var nextYm = first;
  while (nl.paid[nextYm]) nextYm = reAddM_(nextYm, 1);
  if (!nl.rates.length) nl.rates = [{ from: first, rate: rate }];
  else if (reRate_(nl, nextYm) !== rate) nl.rates = nl.rates.filter(function (r) { return r.from !== nextYm; }).concat([{ from: nextYm, rate: rate }]);
  if (!Object.keys(nl.paid).length && reDue_(first, nl.payDay) < reToday_())
    throw new Error("「下一期扣款」的日子已經過了。如果那一期已經扣了，請選下個月，並把「已繳期數」加 1（不會補記以前的帳）");
  x.loan = nl;
  rePut_(ss, x);
  var posted = 0;
  try { posted = reProcess_(true); } catch (pe) { Logger.log(pe); } // 今天就是扣款日的話，馬上記
  x = reGet_(ss, p.id); nl = x.loan;
  var s = reLoanSummary_(nl);
  return { message: "房貸已設定" + (posted ? "（今天到期的已記帳）" : ""), detail: s && s.next ? "下一期 " + s.next.due + " 扣 $" + s.next.t.toLocaleString() + "（利息 " + s.next.i.toLocaleString() + "・本金 " + s.next.p.toLocaleString() + "）" : "" };
}
// 升息／降息：從某個月開始改利率
function waReRate(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  if (!x.loan) throw new Error("還沒有房貸");
  var from = reStr_(p.from, 7), rate = reNum_(p.rate);
  if (!/^\d{4}-\d{2}$/.test(from)) throw new Error("請選從哪個月開始");
  if (!(rate >= 0 && rate < 20)) throw new Error("利率填年利率 %");
  x.loan.rates = (x.loan.rates || []).filter(function (r) { return r.from !== from; }).concat([{ from: from, rate: rate }]);
  rePut_(ss, x);
  var s = reLoanSummary_(x.loan);
  return { message: "利率已改成 " + rate + "%（" + from + " 起）", detail: s && s.next ? "下一期改成 $" + s.next.t.toLocaleString() : "" };
}
// 提前還款：mode "shorten"（月付不變、早點還完）｜"lower"（年限不變、月付變少）
function waRePrepay(p) {
  var ss = SS_(), x = reGet_(ss, p.id), L = x.loan;
  if (!L) throw new Error("還沒有房貸");
  var amt = Math.round(reNum_(p.amount)), day = reDate_(p.date, "還款") || reToday_();
  if (!(amt > 0)) throw new Error("請填提前還款金額");
  var s0 = reLoanSummary_(L);
  if (!s0 || amt > s0.balance) throw new Error("提前還款不能超過剩餘本金 " + (s0 ? s0.balance.toLocaleString() : 0));
  var before = s0.next;
  L.prepays = (L.prepays || []).concat([{ date: day, amount: amt, mode: p.mode === "lower" ? "lower" : "shorten" }]);
  if (p.mode !== "lower" && before && before.t > 0 && amt < s0.balance) {
    // 月付不變：算還要繳幾期，少掉的期數記在 termAdj
    var r = before.rate / 1200, bal = s0.balance - amt, pmt = before.t;
    var nNew = r > 0 ? Math.ceil(-Math.log(1 - bal * r / pmt) / Math.log(1 + r)) : Math.ceil(bal / pmt);
    var nOld = reLeft_(L, before.k);
    if (isFinite(nNew) && nNew > 0 && nNew < nOld) L.termAdj = (Number(L.termAdj) || 0) + (nOld - nNew);
  }
  // 錢從帳戶出去：記一筆「房貸本金」（不算花費）
  rePost_(ss, "支出", RE_CAT_PRIN_, amt * reLoanShare_(x), (x.name || "房子") + " 提前還款" + reShareNote_(reLoanShare_(x)) + " " + reTag_(x.id, "prepay", day), p.account || L.account, day);
  rePut_(ss, x);
  var s = reLoanSummary_(L);
  return { message: "已記提前還款 $" + amt.toLocaleString(), detail: s ? "剩餘本金 $" + s.balance.toLocaleString() + "・還要 " + s.remaining + " 期" + (s.next ? "・下期 $" + s.next.t.toLocaleString() : "") : "" };
}
// 改某一期實際扣款金額（利息照算，多的少的都算本金）
function waRePayEdit(p) {
  var ss = SS_(), x = reGet_(ss, p.id), L = x.loan;
  if (!L || !L.paid || !L.paid[p.ym]) throw new Error("這一期還沒有記帳");
  var total = Math.round(reNum_(p.total));
  if (!(total > 0)) throw new Error("請填實際扣款金額");
  var rec = L.paid[p.ym], i = Math.min(total, Math.round(reNum_(p.interest) > 0 ? reNum_(p.interest) : rec.i)), pr = total - i;
  var tag = reTag_(x.id, "loan", p.ym), rows = reFindRows_(ss, tag), sh = ss.getSheetByName("收支紀錄");
  var intRow = 0, prinRow = 0;
  rows.forEach(function (r) { var c = String(sh.getRange(r, 3).getValue()).trim(); if (c === RE_CAT_INT_) intRow = r; else if (c === RE_CAT_PRIN_) prinRow = r; });
  // 先改本金那筆（列號在後面，刪掉不會影響利息那一列）
  var lbl = (x.name || "房子") + " 房貸第 " + rec.k + " 期", lsh = reLoanShare_(x), ln = reShareNote_(lsh);
  var myI = Math.round(i * lsh), myPr = Math.round(total * lsh) - myI; // 記帳只記自己負擔的部分（總數先四捨五入，不會多一塊）
  if (prinRow) { if (myPr > 0) waEditLedger({ row: prinRow, amount: myPr, category: RE_CAT_PRIN_, oneTime: true }); else waUndoLedger({ row: prinRow }); }
  else if (myPr > 0) rePost_(ss, "支出", RE_CAT_PRIN_, myPr, lbl + "本金" + ln + " " + tag, L.account, reDue_(p.ym, L.payDay));
  if (intRow) { if (myI > 0) waEditLedger({ row: intRow, amount: myI, category: RE_CAT_INT_, oneTime: true }); }
  else rePost_(ss, "支出", RE_CAT_INT_, myI, lbl + "利息" + ln + " " + tag, L.account, reDue_(p.ym, L.payDay));
  x = reGet_(ss, p.id);
  x.loan.paid[p.ym] = { k: rec.k, i: i, p: pr, t: total, edited: true };
  rePut_(ss, x);
  return { message: p.ym + " 房貸改成 $" + total.toLocaleString(), detail: "利息 " + i.toLocaleString() + "・本金 " + pr.toLocaleString() };
}
// 固定支出：整份清單一起存。costs: [{id?, name, amount, freq:"m"|"y", month, day, account}]
function waReCostsSave(p) {
  var ss = SS_(), x = reGet_(ss, p.id), old = {};
  (x.costs || []).forEach(function (c) { old[c.id] = c; });
  var ym = reYm_(reToday_()), today = reToday_();
  x.costs = (p.costs || []).filter(function (c) { return reStr_(c.name) && reNum_(c.amount) > 0; }).map(function (c) {
    var o = old[c.id] || {};
    var nc = { id: c.id || ("C" + Date.now().toString(36) + Math.floor(Math.random() * 99)), name: reStr_(c.name, 20), amount: Math.round(reNum_(c.amount)),
      freq: c.freq === "y" ? "y" : "m", month: Math.min(12, Math.max(1, Math.round(reNum_(c.month) || 1))), day: Math.min(28, Math.max(1, Math.round(reNum_(c.day) || 1))),
      account: reStr_(c.account, 60), hist: o.hist || {} };
    if (!nc.account) throw new Error("「" + nc.name + "」請選從哪個帳戶付");
    waCheckAccountName_(nc.account);
    // 新加的：這個月日子還沒到就從這個月開始，過了就從下個月開始（不補記以前的）
    nc.autoFrom = o.autoFrom || (reDue_(ym, nc.day) >= today ? ym : reAddM_(ym, 1));
    return nc;
  });
  rePut_(ss, x);
  try { reProcess_(true); } catch (pe) { Logger.log(pe); }
  return { message: "固定支出已儲存", detail: x.costs.length + " 項，到日子會自動記「" + RE_CAT_COST_ + "」" };
}
// 出租：新增或修改一間。room: { id?, name, rent, start, end, payDay, deposit, account }
function waReRoomSave(p) {
  var ss = SS_(), x = reGet_(ss, p.id), R = p.room || {};
  var rent = Math.round(reNum_(R.rent));
  if (!(rent > 0)) throw new Error("請填月租金");
  var start = reDate_(R.start, "起租"), end = reDate_(R.end, "到期");
  if (!start || !end || end <= start) throw new Error("請填合約起訖日（到期日要在起租日之後）");
  if (!reStr_(R.account)) throw new Error("請選租金收進哪個帳戶");
  waCheckAccountName_(R.account);
  x.rooms = x.rooms || [];
  var old = R.id ? x.rooms.filter(function (r) { return r.id === R.id; })[0] : null;
  var today = reToday_(), ym = reYm_(today), payDay = Math.min(28, Math.max(1, Math.round(reNum_(R.payDay) || Number(start.slice(8, 10)) || 1)));
  var nr = { id: old ? old.id : "R" + Date.now().toString(36), name: reStr_(R.name, 20) || (x.use === "整層出租" ? "整層" : "套房"), rent: rent,
    start: start, end: end, payDay: payDay, deposit: Math.round(reNum_(R.deposit)), account: reStr_(R.account, 60), tenant: reStr_(R.tenant, 20),
    hist: old ? old.hist || {} : {}, endNotified: old && old.end === end ? old.endNotified : false };
  // 從什麼時候開始自動記：新的就從今天以後的第一個收租日（不補記以前的月份）
  nr.autoFrom = old && old.autoFrom ? old.autoFrom : (reDue_(ym, payDay) >= today ? ym : reAddM_(ym, 1));
  if (nr.autoFrom < reYm_(start)) nr.autoFrom = reYm_(start);
  if (old) x.rooms = x.rooms.map(function (r) { return r.id === old.id ? nr : r; }); else x.rooms.push(nr);
  rePut_(ss, x);
  try { reProcess_(true); } catch (pe) { Logger.log(pe); } // 今天就是收租日的話，馬上記
  return { message: (old ? "已更新 " : "已新增 ") + nr.name, detail: "每月 " + payDay + " 號自動記租金 $" + rent.toLocaleString() + "，記到 " + end };
}
function waReRoomDel(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  x.rooms = (x.rooms || []).filter(function (r) { return r.id !== p.roomId; });
  rePut_(ss, x);
  return { message: "已刪除這間", detail: "以前記的租金不會刪" };
}
// 標記某個月租金：received=false → 撤掉那筆收入、標未收；true → 補記收入
function waReRent(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  var r = (x.rooms || []).filter(function (z) { return z.id === p.roomId; })[0];
  if (!r) throw new Error("找不到這間");
  var ym = reStr_(p.ym, 7), tag = reTag_(x.id, "rent", ym, r.id);
  r.hist = r.hist || {};
  if (!p.received) {
    reFindRows_(ss, tag).forEach(function (row) { waUndoLedger({ row: row }); });
    x = reGet_(ss, p.id); r = x.rooms.filter(function (z) { return z.id === p.roomId; })[0]; r.hist = r.hist || {};
    r.hist[ym] = { s: "unpaid", a: Math.round(reNum_(p.amount) || r.rent) };
    rePut_(ss, x);
    return { message: ym + " " + r.name + " 標成未收", detail: "那筆租金收入已撤掉，收到時再按「已收」" };
  }
  var amt = Math.round(reNum_(p.amount) || (r.hist[ym] && r.hist[ym].a) || r.rent);
  if (!reFindRows_(ss, tag).length) rePost_(ss, "收入", RE_CAT_RENT_, amt * reShare_(x), (x.name || "房子") + " " + r.name + " " + ym.slice(5) + " 月租金" + reShareNote_(reShare_(x)) + " " + tag, r.account, reDate_(p.date, "收款") || reToday_());
  x = reGet_(ss, p.id); r = x.rooms.filter(function (z) { return z.id === p.roomId; })[0]; r.hist = r.hist || {};
  r.hist[ym] = { s: "paid", a: amt };
  rePut_(ss, x);
  return { message: ym + " " + r.name + " 已收 $" + amt.toLocaleString(), detail: "" };
}
// 立刻跑一次自動記帳（設定完不用等到明天）
function waReRun() {
  var n = reProcess_(true);
  return { message: n ? "已補記 " + n + " 筆" : "目前沒有到期要記的", detail: "" };
}

// ============================================================
// 第二階段：自動估價（實價登錄）
// - 估價表放在 GitHub 網站 re/base.json（係數、行政區、市場水準、車位價、區間、各區檔名）＋ re/d/dNN.json（路段、門牌區段、巷弄、同一棟的效果）。
//   每季用新的實價登錄重算一次，只要上傳檔案，不用重新部署。
// - 模型：log(每坪單價，扣車位) ＝ 常數＋行政區＋市場水準＋房屋條件（型態、屋齡、樓層、坪數、公設比…）＋地段（路段→區段→巷弄→同一棟，越細越少資料就越往上一層靠）。
// - 總價＝每坪單價 × 坪數（扣車位）＋ 車位（同縣市同類型成交中位數）。區間＝交叉驗證時 80% 的成交落在裡面的範圍。
// - 只支援臺北市、新北市、桃園市的大樓／華廈／公寓（套房算大樓）。
// ============================================================
var RE_VAL_URL_ = "https://casper1122-cyber.github.io/app-install/re/";
var RE_PARK_TYPES_ = ["子母車位", "坡道平面", "坡道機械", "升降平面", "升降機械", "塔式車位", "一樓平面", "其他"];  // 子母車位：前後兩格，要移車；照一個坡道平面的 1.5 倍算
var RE_CN_ = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };

// 地址 → { city, dist, road, lane, alley, no }；跟訓練時（Python）的規則一模一樣，對照表的鍵才對得上
function reAddr_(a) {
  a = String(a || "").replace(/[\s　]/g, "").replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/^台/, "臺");
  a = a.replace(/(\d+)[-－‐–](\d+)(號)/, "$1之$2$3");
  a = a.replace(/(\d+)段/, function (m0, n) { n = Number(n); return (n >= 1 && n <= 10 ? "零一二三四五六七八九十".charAt(n) : n) + "段"; });   // 1段 → 一段（實價登錄寫國字） // 7-1號 → 7之1號（實價登錄寫「之」）
  var m = a.match(/^(臺北市|新北市|桃園市)/), city = m ? m[1] : "";
  var d = a.match(/^(?:臺北市|新北市|桃園市)?([^區]{1,3}區)/), dist = d ? d[1] : "";
  a = a.replace(/^(?:臺北市|新北市|桃園市)?[^區]{1,3}區/, "").replace(/^[^路街道]{1,4}里/, "");
  m = a.match(/^(.+?(?:路|街|大道)(?:[一二三四五六七八九十]+段)?)?(?:(\d+)巷)?(?:(\d+)弄)?(?:(\d+)(?:之(\d+))?號)?/);
  return { city: city, dist: dist, road: m && m[1] || "", lane: m && m[2] || "", alley: m && m[3] || "", no: m && m[4] ? Number(m[4]) : null, sub: m && m[5] || "" };
}
// 找同一社區的其他門牌：自己這個門牌（同總樓層、同完工年）沒資料時才找；回傳 { key, no, ok } 或 null
function reNbBldg_(A, tot, by, Dd) {
  if (!A || !A.road || A.no === null || !Dd || !(tot > 0) || !(by > 1900)) return null;
  var pre = A.road + "|" + A.lane + "-" + A.alley + "|", own = pre + A.no + "|" + tot + "|" + by;
  if ((Dd.pub && own in Dd.pub) || (Dd.bldg && own in Dd.bldg)) return null;
  var best = null, seen = {};
  [Dd.pub || {}, Dd.bldg || {}].forEach(function (M) {
    Object.keys(M).forEach(function (k) {
      if (seen[k] || k.indexOf(pre) !== 0) return; seen[k] = 1;
      var p = k.slice(pre.length).split("|"), no = Number(p[0]);
      if (p.length !== 3 || p[0] === "" || Number(p[1]) !== tot || Math.abs(Number(p[2]) - by) > 1) return;  // 屋齡用「幾年」填，完工年可能差 1 年
      var d = Math.abs(no - A.no) + (Number(p[2]) !== by ? 0.5 : 0);
      if (no !== A.no && d <= 10.5 && (!best || d < best.d)) best = { key: k, no: no, d: d };
    });
  });
  return best ? { key: best.key, no: best.no, ok: true } : null;
}
// 特徵 → log 每坪單價（不含市場水準）。f: { typ:"住宅大樓|華廈|公寓", fl, tot, age, byear, ping, pub(null=不知道), hasp, pnoprice, elev, mgmt, rooms, notes:{add,bal,roof,furn,mezz}, distKey, A(地址) }
function reValLu_(f, B, Dd) {
  var F = B.feat, lu = B.const + (B.dist[f.distKey] || 0), age = f.age, t = f.typ, fl = f.fl, tot = f.tot;
  var add = function (k, on) { if (on) lu += F[k] || 0; };
  // 估價報告用：每一類條件讓價格變多少（log）
  var G = {}, lu0 = lu, last = lu, mk = function (k) { G[k] = (G[k] || 0) + lu - last; last = lu; };
  add("型態:華廈", t === "華廈"); add("型態:公寓", t === "公寓"); mk("型態");
  add("屋齡:0-2年(新成屋)", age < 2); add("屋齡:2-5年", age >= 2 && age < 5); add("屋齡:10-20年", age >= 10 && age < 20);
  add("屋齡:20-30年", age >= 20 && age < 30); add("屋齡:30-40年", age >= 30 && age < 40); add("屋齡:40年以上", age >= 40); mk("屋齡");
  var top = fl === tot && fl > 1, mid = fl > 1 && !top && f.elev;
  add("樓層:1樓", fl === 1); add("樓層:頂樓(公寓/華廈,無電梯)", top && !f.elev); add("樓層:頂樓(有電梯)", top && f.elev);
  add("有電梯:6-10樓", mid && fl >= 6 && fl <= 10); add("有電梯:11-15樓", mid && fl >= 11 && fl <= 15); add("有電梯:16-20樓", mid && fl >= 16 && fl <= 20); add("有電梯:21樓以上", mid && fl >= 21);
  add("無電梯:4樓", !f.elev && fl === 4 && !top);
  add("棟高:16-25層", tot >= 16 && tot <= 25); add("棟高:26層以上", tot >= 26);
  mk("樓層");
  add("有管理組織", f.mgmt); mk("管理");
  var p = f.ping;
  add("坪數:<15坪", p < 15); add("坪數:15-25坪", p >= 15 && p < 25); add("坪數:35-50坪", p >= 35 && p < 50); add("坪數:50-80坪", p >= 50 && p < 80); add("坪數:80坪以上", p >= 80); mk("坪數");
  // 公設比：自己填的 → 同一棟的成交 → 同型態同屋齡的中位數 → 全體中位數
  var pub = f.pub, pubSrc = "你填的";
  if (t === "透天厝" && (pub === null || pub === undefined || !isFinite(pub))) { pub = 0; pubSrc = "透天沒有公設"; }
  // 同一個社區、門牌不同號（51、53、55 號是同一棟）：同一條路／巷弄、總樓層和完工年一樣、門牌差 10 號以內
  var nbK = t !== "透天厝" ? reNbBldg_(f.A, tot, f.byear, Dd) : null;
  if (pub === null || pub === undefined || !isFinite(pub)) {
    var A0 = f.A, bk = A0 && A0.road ? A0.road + "|" + A0.lane + "-" + A0.alley + "|" + (A0.no === null ? "" : A0.no) + "|" + tot + "|" + f.byear : "";
    var uk = A0 && A0.road && A0.no !== null ? A0.road + "|" + A0.lane + "-" + A0.alley + "|" + A0.no + "|" + (A0.sub || "") + "|" + fl : "";
    if (uk && Dd && Dd.pubU && uk in Dd.pubU) { pub = Dd.pubU[uk]; pubSrc = "這一戶以前成交的權狀資料"; }
    else if (bk && Dd && Dd.pub && bk in Dd.pub) { pub = Dd.pub[bk]; pubSrc = "同一棟"; }
    else if (nbK && Dd.pub && nbK.key in Dd.pub) { pub = Dd.pub[nbK.key]; pubSrc = "同一社區（" + nbK.no + "號）的成交"; }
    else if (A0 && A0.road && Dd && Dd.pubL && f.byear > 1900) {
      // 附近同年代、同型態的其他大樓（每 5 年一組）：老華廈公設比常常只有 5～10%，用全市平均會估太低
      var y5 = Math.floor(f.byear / 5), sg = A0.lane !== "" ? Number(A0.lane) : (A0.no === null ? -1 : A0.no);
      var kb = A0.road + "|#" + Math.floor(sg / 100) + "|" + t + "|" + y5 + "|b", kr = A0.road + "|" + t + "|" + y5 + "|r";
      if (kb in Dd.pubL) { pub = Dd.pubL[kb]; pubSrc = "附近同年代" + (t === "住宅大樓" ? "大樓" : t) + "的中位數"; }
      else if (kr in Dd.pubL) { pub = Dd.pubL[kr]; pubSrc = "同一條路同年代" + (t === "住宅大樓" ? "大樓" : t) + "的中位數"; }
    }
    if ((pub === null || pub === undefined || !isFinite(pub)) && B.pubBy && B.pubBy[t]) {
      var ab = B.pubAge || [5, 10, 20, 30, 40], i = 0; while (i < ab.length && age >= ab[i]) i++;
      pub = B.pubBy[t][i]; pubSrc = "同型態、同屋齡的平均";
    }
    if (pub === null || pub === undefined || !isFinite(pub)) { pub = B.pubMed; pubSrc = "平均"; }
  }
  mk("其他"); lu += (F["公設比每+10%"] || 0) * (pub - 0.3) * 10; mk("公設比");
  add("車位:有(另計價)", f.hasp && !f.pnoprice); add("車位:有(沒拆價)", f.pnoprice); mk("車位");
  var n = f.notes || {};
  if (f.nfl > 1) { add("多層", true); add("多層x含1樓", fl === 1); add("多層x商", f.use === "商"); }
  add("含騎樓", f.arcade); add("帶租約", f.lease);
  add("備註:增建", n.add); add("備註:陽台外推", n.bal); add("備註:頂樓加蓋", n.roof); add("備註:含傢俱/裝潢", n.furn); add("備註:夾層", n.mezz); mk("其他");
  add("1樓x華廈", fl === 1 && t === "華廈"); add("1樓x公寓", fl === 1 && t === "公寓"); mk("樓層");
  var a10 = Math.min(age, 50) / 10;
  lu += (F["屋齡年x華廈"] || 0) * (t === "華廈" ? a10 : 0) + (F["屋齡年x公寓"] || 0) * (t === "公寓" ? a10 : 0) + (F["屋齡年x大樓"] || 0) * (t === "住宅大樓" ? a10 : 0); mk("屋齡");
  lu += (F["log坪"] || 0) * Math.log(p); last = lu; G["坪數"] = (G["坪數"] || 0) + (F["log坪"] || 0) * Math.log(p / 30); lu0 += (F["log坪"] || 0) * Math.log(30); // 坪數用 30 坪當基準
  add("房數多", f.rooms >= 4); add("沒有隔間房", f.rooms === 0); mk("其他");
  // 各行政區自己的折舊速度
  lu += ((B.distAge || {})[f.distKey] || 0) * Math.min(age, 50) / 10; mk("屋齡");
  // 透天、辦公、店面
  var th = t === "透天厝", use = f.use || "住";
  if (th) lu += (F["透天"] || 0) + (F["透天x屋齡"] || 0) * Math.min(age, 50) / 10 + (F["透天xlog地"] || 0) * Math.log((f.land || 0) + 1) + (F["透天xlog坪"] || 0) * Math.log(p) + (F["透天x層"] || 0) * tot;
  add("辦", use === "辦"); add("商", use === "商"); add("商x1F", use === "商" && fl === 1); add("辦x1F", use === "辦" && fl === 1); add("商x2F+", use === "商" && fl > 1);
  add("工", use === "工"); add("工x1F", use === "工" && fl === 1); add("工x透天", use === "工" && th); mk("型態");
  // 地段：路段 → 門牌區段 → 巷弄 → 同一棟
  var A = f.A, hit = "行政區", seen = false;
  if (A && A.road && Dd) {
    var road = A.road, lane = road + "|" + A.lane + "-" + A.alley;
    // 門牌區段：路上每 100 號一段；巷子用巷號算在哪一段（長街頭尾行情不同）
    var seg = A.lane !== "" ? Number(A.lane) : (A.no === null ? -1 : A.no), blk = road + "|#" + Math.floor(seg / 100);
    var blk2 = A.lane === "" ? road + "|#" + Math.floor((A.no === null ? -1 : A.no) / 100) : lane;
    var bldg = lane + "|" + (A.no === null ? "" : A.no) + "|" + tot + "|" + f.byear;
    var side = A.lane === "" && A.no !== null ? road + "|s" + (A.no % 2) + "|" + Math.floor(A.no / 50) : "";  // 路的同一邊（單號／雙號）
    var near = A.no !== null ? lane + "|n" + Math.floor(A.no / 20) : "";                                      // 同一條巷弄、門牌 20 號以內
    if (Dd.road && road in Dd.road) { lu += Dd.road[road]; hit = "路段"; }
    if (Dd.blk && blk in Dd.blk) { lu += Dd.blk[blk]; hit = "門牌區段"; }
    if (side && Dd.side && side in Dd.side) { lu += Dd.side[side]; hit = "同一側的門牌區段"; }
    if (Dd.blk2 && blk2 in Dd.blk2) { lu += Dd.blk2[blk2]; hit = A.lane ? "巷弄" : hit; }
    if (Dd.lane && lane in Dd.lane) { lu += Dd.lane[lane]; if (A.lane) hit = "巷弄"; }
    var shopMode = f.use === "商" && fl === 1 && Dd.shop;
    if (shopMode) {
      // 1 樓店面：不看樓上住宅的「附近門牌／同一棟」，改看這條路、這一段、這一側的店面成交
      var sh = Dd.shop, sAdj = 0;
      if (sh.road && road in sh.road) sAdj += sh.road[road];
      if (sh.blk && blk in sh.blk) sAdj += sh.blk[blk];
      if (side && sh.side && side in sh.side) sAdj += sh.side[side];
      lu += sAdj; if (sAdj) hit = "這段路的店面成交";
    } else if (near && Dd.near20 && near in Dd.near20) { lu += Dd.near20[near]; hit = "附近門牌"; }
    if (!shopMode && Dd.bldg && bldg in Dd.bldg) { lu += Dd.bldg[bldg]; hit = "同一棟"; seen = true; }
    // 辦公、商業樓層（大馬路上 8 層以上）：自己這個門牌沒成交，就用同一社區隔壁門牌的成交（驗證過：住宅用這招沒有比較準，所以只用在商辦）
    else if (!shopMode && nbK && nbK.ok && use !== "住" && A.lane === "" && tot >= 8 && Dd.bldg && nbK.key in Dd.bldg) { lu += Dd.bldg[nbK.key]; hit = "同一社區（" + nbK.no + "號）"; seen = true; }
  }
  mk("地段");
  // 巷弄裡近 3 年沒有任何成交（沒有可以直接比的）：系統平均會估低一點（台北約 1.7%），補回來
  var lonely = false;
  if (use === "住" && !th && !seen && A && A.road && A.lane !== "" && Dd && Dd.lane && B.lonely) {
    var lk = A.road + "|" + A.lane + "-" + A.alley;
    if (!(lk in Dd.lane)) { lu += B.lonely[f.distKey.slice(0, 3)] || 0; lonely = true; }
  }
  mk("地段");
  // 各地自己的價差（這一區 → 這條路 → 這一段）：大小坪數、新舊、樓層高低、公設比、1 樓，有的地方跟全市不一樣
  if (use === "住" && !th && Dd && Dd.sl) {
    var bkK = A && A.road ? A.road + "|#" + Math.floor((A.lane !== "" ? Number(A.lane) : (A.no === null ? -1 : A.no)) / 100) : "";
    var SX = { size: Math.max(-1.2, Math.min(1.2, Math.log(p / 30))), age: (Math.min(age, 50) - 30) / 10,
      floor: f.elev && fl > 1 ? (Math.max(1, Math.min(30, fl)) - 5) / 10 : 0, pub: Math.max(-3, Math.min(3, (pub - 0.3) * 10)), f1: fl === 1 ? 1 : 0 };
    Object.keys(Dd.sl).forEach(function (fn) {
      var S = Dd.sl[fn], ss = S.d || 0, xv = SX[fn] || 0;
      if (A && A.road) { ss += (S.road || {})[A.road] || 0; ss += (S.blk || {})[bkK] || 0; }
      lu += ss * xv; var gk = { size: "坪數", age: "屋齡", floor: "樓層", pub: "公設比", f1: "樓層" }[fn] || "其他"; G[gk] = (G[gk] || 0) + ss * xv;
    });
    last = lu;
  }
  var laneHas = !!(A && A.road && Dd && Dd.lane && (A.road + "|" + A.lane + "-" + A.alley) in Dd.lane);
  mk("其他");
  return { parts: G, base: lu0, lu: lu, hit: hit, seen: seen, lonely: lonely, laneHas: laneHas, pub: pub, pubSrc: pubSrc, blkKey: A && A.road ? A.road + "|#" + Math.floor((A.lane !== "" ? Number(A.lane) : (A.no === null ? -1 : A.no)) / 100) : "" };
}
function reValFetch_(path) {
  // 加上每 10 分鐘換一次的參數，避開 GitHub 網站的快取（上傳新資料後 10 分鐘內就會用到新的）
  var url = RE_VAL_URL_ + path.split("/").map(encodeURIComponent).join("/") + "?v=" + Math.floor(Date.now() / 600000);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}
function reValBase_() {
  var c = CacheService.getScriptCache(), k = "RE_VAL_BASE2", s = c.get(k);
  if (s) return JSON.parse(s);
  var b = reValFetch_("base.json");
  if (!b) throw new Error("估價資料暫時讀不到，等一下再試");
  try { c.put(k, JSON.stringify(b), 600); } catch (e) {} // 只快取 10 分鐘：base.json 跟各區檔案要同一版，不然會算錯
  return b;
}
// 用房子的基本資料估價；回傳 { ok, amount, lo, hi, unit, ping, parkValue, hit, through, n } 或 { ok:false, why }
function reValuate_(p, B, Dd) {
  if (p.presale) return rePresaleVal_(p, B, Dd);
  if (p.type === "土地") return reLandVal_(p, B, Dd);
  // 型態 → 模型裡的型態＋用途（住／辦／商／工）
  var kind = p.type, use = "住", typ = { "大樓": "住宅大樓", "套房": "住宅大樓", "華廈": "華廈", "公寓": "公寓", "透天": "透天厝" }[kind];
  if (kind === "辦公室") use = "辦"; else if (kind === "店面") use = "商";
  else if (kind === "工廠／廠辦") { use = "工"; if (p.wholeBldg) typ = "透天厝"; }
  if (!typ && use === "住") return { ok: false, why: "自動估價目前支援大樓、華廈、公寓、套房、透天、辦公室、店面、工廠／廠辦、土地" };
  var A = reAddr_(p.address);
  if (!A.city) return { ok: false, why: "自動估價目前只支援臺北市、新北市、桃園市（地址要從縣市開始寫）" };
  if (!A.dist) return { ok: false, why: "地址要寫到行政區，例如：新北市中和區…" };
  var distKey = A.city + A.dist;
  if (!B) B = reValBase_();
  if (!(distKey in B.dist)) return { ok: false, why: A.dist + "的成交太少，沒辦法自動估價" };
  var th = typ === "透天厝";
  // 樓層可以填好幾層（例如「1+2」「1-2」「1、2」）：每層各估一次再平均
  var flList = reFloorList_(p.floor), fl = th ? 1 : (flList[0] || NaN), tot = Math.round(reNum_(p.floors)), by = Math.round(reNum_(p.builtYear));
  var ar = p.area || {}, pk = reParkParse_(p.parking);
  // 坪數：權狀總坪數（含車位）扣掉車位坪數；沒填車位坪數用同類型車位的一般坪數
  var parkArea = 0, parkAreaSrc = "";
  var pArea1 = function (t) { var PA = B.parkArea || {}; return t === "子母車位" ? 2 * (PA["坡道平面"] || 9.8) : (PA[t] || PA["其他"] || 9); };
  if (pk.count && ar.pk0) { parkArea = 0; parkAreaSrc = "車位不在權狀坪數裡"; }
  else if (pk.count) { parkArea = reNum_(ar.parking) || pk.list.reduce(function (a, x) { return a + x.count * pArea1(x.type); }, 0); parkAreaSrc = reNum_(ar.parking) ? "你填的" : "一般" + pk.type + "車位"; }
  var ping = reNum_(ar.gross) ? reNum_(ar.gross) - parkArea : (reNum_(ar.total) || (reNum_(ar.main) + reNum_(ar.attach) + reNum_(ar.balcony) + reNum_(ar.public)));
  if (Dd === undefined) Dd = B.files && B.files[distKey] ? reValFetch_("d/" + B.files[distKey]) : null;
  var bi = !th && A.road && A.no !== null && Dd && Dd.bi ? Dd.bi[A.road + "|" + A.lane + "-" + A.alley + "|" + A.no] : null, filled = [];
  if (bi) {
    if (!(tot > 0)) { tot = bi[0]; filled.push("總樓層 " + tot); }
    if (!(by > 1900)) { by = bi[1]; filled.push("屋齡 " + Math.max(0, new Date().getFullYear() - by) + " 年"); }
    else if (Math.abs(bi[1] - by) <= 1 && bi[0] === tot) by = bi[1];
  }
  var miss = [];
  if (!(fl > 0)) miss.push("所在樓層"); if (!(tot > 0)) miss.push(th ? "樓層數（蓋幾層）" : "總樓層"); if (!(by > 1900)) miss.push("屋齡");
  if (!(ping > 3)) miss.push(th ? "建物坪數" : "權狀坪數");
  if (th && !(reNum_(ar.land) > 0)) miss.push("土地坪數");
  if (miss.length) return { ok: false, why: "要先在「基本資料」填：" + miss.join("、") + (bi || th ? "" : "（門牌在實價登錄裡找不到同一棟，所以沒辦法自動帶入）") };
  if (Math.max.apply(null, flList.length ? flList : [fl]) > tot) return { ok: false, why: "所在樓層比總樓層高，請檢查" };
  var now = new Date(Date.now() + 8 * 3600e3), ty = now.getUTCFullYear() + now.getUTCMonth() / 12 + 1 / 24;
  var pub = reNum_(ar.public) > 0 && ping > 0 ? reNum_(ar.public) / ping : null;
  var sameB = bi && bi[0] === tot && bi[1] === by;
  var typNote = "", TY = B.biTyp || ["住宅大樓", "華廈", "公寓", "透天厝"];
  if (use !== "住" && !th) typ = tot >= 11 ? "住宅大樓" : tot >= 6 ? "華廈" : (sameB && TY[bi[2]] ? TY[bi[2]] : "公寓"); // 辦公室、店面：照整棟高度
  else if (!th) {
    if (sameB && TY[bi[2]] && TY[bi[2]] !== typ && TY[bi[2]] !== "透天厝") { typNote = "實價登錄記錄這棟是" + (TY[bi[2]] === "住宅大樓" ? "大樓" : TY[bi[2]]) + "，用它算"; typ = TY[bi[2]]; }
    else if (!sameB && typ === "住宅大樓" && tot <= 10) { typNote = "大樓是 11 樓以上，" + tot + " 層樓用華廈算（沒電梯的話請把型態改成公寓）"; typ = "華廈"; }
  }
  var elev = th ? false : sameB ? !!bi[3] : typ !== "公寓", mgmt = th ? false : sameB ? !!bi[4] : elev;
  var ukey = A.road && A.no !== null ? A.road + "|" + A.lane + "-" + A.alley + "|" + A.no + "|" + (A.sub || "") + "|" + fl : "", unitPub = false;
  if (pub === null && ukey && Dd && Dd.pubU && ukey in Dd.pubU) { pub = Dd.pubU[ukey]; unitPub = true; filled.push("公設比 " + Math.round(pub * 1000) / 10 + "%（這一戶以前成交的權狀資料）"); }
  if (pub === null && sameB && isFinite(bi[5])) pub = bi[5], filled.push("公設比 " + Math.round(bi[5] * 1000) / 10 + "%");
  // 好幾層一起（1+2 樓）：實價登錄裡這種成交照「最低那層＋多層」算，跟資料一樣
  var nfl = th ? 1 : Math.max(1, flList.length);
  // 1 樓店面在大馬路上通常含騎樓
  var arcade = use !== "住" && !th && fl === 1 && A.lane === "";
  var leased = (p.rooms || []).some(function (rm) { return rm.end && rm.end >= reToday_() && (!rm.start || rm.start <= reToday_()); });
  var r = reValLu_({ typ: typ, use: use, land: reNum_(ar.land), fl: fl, nfl: nfl, arcade: arcade, lease: leased && use !== "住", tot: tot, age: Math.max(0, ty - by - 0.5), byear: by, ping: ping, pub: pub, hasp: pk.count > 0, pnoprice: !!(pk.count && ar.pk0),
    elev: elev, mgmt: mgmt, rooms: 3, notes: {}, distKey: distKey, A: A }, B, Dd);
  if (filled.length && r.pubSrc === "你填的" && pub !== null && reNum_(ar.public) === 0) r.pubSrc = unitPub ? "這一戶以前成交的權狀資料" : "同一棟";
  var unit = Math.exp(r.lu + (B.level[A.city] || 0));
  // 分租套房：實價登錄裡「隔成 4 間以上、幾乎每間都有衛浴」的成交，2025 年起跟一般住宅差不多（銀行對分租套房貸款變緊，投資客加價變少）；
  // 只有沒電梯的公寓頂樓還是貴一點（+3%：頂樓本來不好賣，隔成套房出租就沒差）；華廈、大樓隔成套房反而 -1%（自住的人要拆回來）
  var suiteAdj = 0, suiteNote = "";
  if (p.use === "分租" && use === "住" && !th) {
    suiteAdj = typ === "公寓" ? (fl === tot && !elev ? 0.03 : 0) : -0.01;
    suiteNote = typ === "公寓" ? (suiteAdj ? "分租套房：沒電梯的公寓頂樓隔成套房，成交比一般頂樓高約 3%" : "分租套房：公寓隔成套房，2025 年起成交價跟一般公寓差不多") : "分租套房：" + (typ === "華廈" ? "華廈" : "大樓") + "隔成套房，成交比一般的低約 1%（自住的人買了要拆回來）";
    unit *= 1 + suiteAdj;
  }
  // 租金（有在出租的房間）：給「租金投報率」用
  var rentMonth = 0, rentN = 0;
  (p.rooms || []).forEach(function (rm) { if ((!rm.end || rm.end >= reToday_()) && (!rm.start || rm.start <= reToday_()) && reNum_(rm.rent) > 0) { rentMonth += reNum_(rm.rent); rentN++; } });
  var parkTbl = B.park[A.city] || {}, parkOne = 0, parkSrc = "", parkValue = 0, parkSrcs = [];
  if (pk.count && ar.pk0) {
    // 車位不在權狀裡（老華廈、公寓的法定車位常見）：實價登錄這種成交的車位多半沒拆價，價格含在每坪單價裡（平均每坪多約 7%），所以不另外加車位價
    parkSrc = "不在權狀裡，車位價含在每坪單價（實價登錄這種成交平均每坪多約 7%）";
  } else if (pk.count) {
    var bp = sameB && bi[6] ? bi[6] : {}, vals = Object.keys(bp).map(function (k) { return bp[k]; }).sort(function (a, b) { return a - b; });
    pk.list.forEach(function (x) {
      var one = 0, src = "";
      if (x.type === "子母車位") {
        // 子母車位（前後兩格）：實價登錄有註明的很少（台北、新北合計十幾筆），市場一般當 1.3～1.6 個平面車位，用 1.5 倍
        if (bp["坡道平面"]) { one = Math.round(bp["坡道平面"] * 1.5); src = "同一棟坡道平面 × 1.5"; }
        else { one = Math.round((parkTbl["坡道平面"] || parkTbl["其他"] || 0) * 1.5); src = A.city + "坡道平面行情 × 1.5"; }
      } else if (bp[x.type]) { one = bp[x.type]; src = "同一棟"; }
      else if (vals.length && x.type === "其他") { one = vals[Math.floor(vals.length / 2)]; src = "同一棟"; }
      else { one = parkTbl[x.type] || parkTbl["其他"] || 0; src = A.city + "行情"; }
      parkValue += x.count * one; if (parkSrcs.indexOf(src) < 0) parkSrcs.push(src); if (!parkOne) parkOne = one;
    });
    parkSrc = parkSrcs.join("、");
  }
  var terrace = reNum_(ar.terrace), terraceValue = terrace > 0 ? Math.round(terrace * unit / 3) : 0;
  // 權狀裡沒有算的地下室、夾層：地下室多半當倉庫或租給特定行業，用 1 樓（這間）每坪的 3 成算；夾層天花板低，用 4 成算（經驗值）
  // 權狀外的增建（儲藏室、加蓋）：可以用，但不能貸款、有被拆的風險，買方通常只認 1/3（跟露台一樣）
  var addon = reNum_(ar.addon);
  var bsmt = reNum_(ar.bsmt), mezz = reNum_(ar.mezz), extraValue = Math.round((bsmt > 0 ? bsmt * unit * 0.3 : 0) + (mezz > 0 ? mezz * unit * 0.4 : 0) + (addon > 0 ? addon * unit / 3 : 0));
  terraceValue += extraValue;
  // 機車位：大部分社區的機車位是公設、沒有固定位置，不另外算錢。固定位置（有權狀或約定專用）的才算。
  // 實價登錄單獨買賣機車位：新北 3～45 萬（汐止約 30～45 萬、新店 5～6 萬），桃園預售約 10～15 萬；台北幾乎沒有資料，用 30 萬
  // 有權狀（可以單獨賣）的照上面的行情；沒有權狀、跟著房子用的（約定專用、分管）不能單獨賣，只有方便停車的價值：實價登錄這種大多 5～10 萬
  var motoOwn = ar.motoT === "own", moto = reNum_(ar.moto);
  var motoOne = reNum_(ar.motoP) > 0 ? reNum_(ar.motoP) : (motoOwn ? { "臺北市": 300000, "新北市": 200000, "桃園市": 100000 } : { "臺北市": 100000, "新北市": 80000, "桃園市": 50000 })[A.city] || (motoOwn ? 150000 : 60000);
  var motoValue = moto > 0 ? Math.round(moto * motoOne) : 0, motoSrc = reNum_(ar.motoP) > 0 ? "你填的" : A.city + (motoOwn ? "有權狀機車位" : "沒有權狀、跟著房子用的機車位") + "一般行情（經驗值）";
  var bk = use === "工" ? "工業" : th ? "透天" : use === "辦" ? "辦公" : use === "商" ? (fl === 1 ? "店面" : "商業") : typ;
  var bld = unit * ping + terraceValue, band = (r.seen ? B.bands.seen : B.bands.new)[bk] || 0.2;
  // 住宅：可能範圍看附近有沒有「類似的成交」（同一棟／同巷弄／這一段有沒有差不多坪數的），類似的越少範圍越寬
  var evid = "", sizes = Dd && Dd.bp && r.blkKey ? Dd.bp[r.blkKey + "|" + typ] : null, aty = false;
  if (use === "住" && !th && B.bands2 && B.bands2[typ]) {
    aty = !sizes || !sizes.some(function (x) { return Math.abs(Math.log(ping / x)) < 0.2; });
    var gk = r.seen ? "b" : r.laneHas ? "l" : "n";
    band = B.bands2[typ][gk + (aty ? "1" : "0")] || band;
    evid = gk === "b" && !aty ? "" : (gk === "b" ? "同一棟有成交" : gk === "l" ? "同一條巷弄有成交，但同一棟沒有" : "同一條巷弄近 3 年沒有成交") + (aty ? "；這一段也很少跟你差不多坪數（±20%）的成交" : "");
  }
  var round = function (v) { return Math.round(v / 10000) * 10000; };
  // 這一戶自己以前的成交（近 3 年、一般交易）：用市場漲跌換算到現在。
  // 驗證（同一戶賣兩次的 5,110 對）：隔 2 年以上的，模型和上次成交各一半最準（誤差中位數 8.2% → 7.1%）；隔不到 2 年的混了沒有比較準（很多是整修後再賣），只顯示
  var own = null, ownShift = 0, modelTotal = bld + parkValue + motoValue;
  var oR = ukey && Dd && Dd.own ? Dd.own[ukey] : null;
  if (oR && B.mIdx && B.mIdx[A.city]) {
    var MI = B.mIdx[A.city], ym0 = oR[0], mAt = function (ym) { return MI[String(ym)]; };
    var nb = [ym0 - 1, ym0, ym0 + 1].map(function (y) { return y % 100 === 0 ? y - 88 : y % 100 === 13 ? y + 88 : y; }).map(mAt).filter(function (v) { return v !== undefined; });
    var thenM = nb.length ? nb.reduce(function (a, b) { return a + b; }, 0) / nb.length : 0, g = Math.exp((B.level[A.city] || 0) - thenM);
    var ymL = Object.keys(MI).map(Number).sort(function (a, b) { return a - b; }).pop(), gap = ((Math.floor(ymL / 100) * 12 + ymL % 100) - (Math.floor(ym0 / 100) * 12 + ym0 % 100)) / 12;
    var spots = pk.list ? pk.list.reduce(function (a, x) { return a + x.count * (x.type === "子母車位" ? 2 : 1); }, 0) : 0;
    var sameSize = reNum_(ar.gross) > 0 && Math.abs(reNum_(ar.gross) / oR[2] - 1) < 0.03, samePark = spots === oR[3];
    var rs = oR[1] * 10000 * g, use2 = gap >= 2 && sameSize && samePark;
    own = { ym: Math.floor(ym0 / 100) + "/" + ("0" + ym0 % 100).slice(-2), price: oR[1] * 10000, park: oR[3], g: Math.round((g - 1) * 1000) / 10, now: round(rs), gap: Math.round(gap * 10) / 10, used: use2,
      why: use2 ? "" : !sameSize ? "坪數跟那次成交不一樣（可能不是同一戶，或權狀總坪數沒填）" : !samePark ? "車位數跟那次成交不一樣（那次 " + oR[3] + " 個車位，子母車位算 2 個）" : "隔不到 2 年，只給你參考" };
    if (use2) ownShift = Math.round(0.5 * rs - 0.5 * modelTotal);
  }
  // 附近最近 12 個月的成交（同一個門牌區段）
  var TY4 = ["大樓", "華廈", "公寓", "透天"], US = ["", "辦公", "店面", "工業"];
  var nearRaw = Dd && Dd.near && r.blkKey && Dd.near[r.blkKey] || [], nearShop = false;
  if (use === "商" && fl === 1 && !th) {
    // 1 樓店面：只列店面的成交（樓上住宅的價格不能比）。大馬路上的店先列同一條路大馬路上的，不夠再補這一段、這條路巷子裡的
    nearShop = true;
    var NS = Dd && Dd.nearS || {}, seenA = {}, pick = [];
    var srcs = A.lane === "" ? [(NS.m || {})[A.road], (NS.b || {})[r.blkKey], (NS.r || {})[A.road]] : [(NS.b || {})[r.blkKey], (NS.r || {})[A.road]];
    srcs.forEach(function (L0) { (L0 || []).forEach(function (x) { if (pick.length < 8 && !seenA[x[1] + x[0]]) { seenA[x[1] + x[0]] = 1; pick.push(x); } }); });
    nearRaw = pick;
  }
  if (use === "住") nearRaw = nearRaw.filter(function (x) { return !x[8]; }); // 住宅只列住宅的成交（店面、辦公室的價格不能比）
  var near = nearRaw.slice(0, 8).map(function (x) {
    return { ym: Math.floor(x[0] / 100) + "/" + ("0" + x[0] % 100).slice(-2), addr: x[1], fl: x[2], tot: x[3], age: x[4], ping: x[5], unit: x[6], typ: TY4[x[7]] || "", use: US[x[8]] || "" }; });
  return { ok: true, amount: round(bld + parkValue + motoValue + ownShift), lo: round(bld * (1 - band) + parkValue + motoValue + ownShift), hi: round(bld * (1 + band) + parkValue + motoValue + ownShift), own: own, modelAmount: round(modelTotal),
    unit: Math.round(unit), ping: Math.round(ping * 100) / 100, parkValue: parkValue, parkCount: pk.count, parkType: pk.type, parkList: pk.list, parkSrc: parkSrc, parkArea: Math.round(parkArea * 100) / 100, parkAreaSrc: parkAreaSrc,
    why: { base: Math.round(Math.exp(r.base + (B.level[A.city] || 0))), parts: ["地段", "型態", "屋齡", "樓層", "坪數", "公設比", "管理", "車位", "其他"].filter(function (k) { return Math.abs((r.parts || {})[k] || 0) >= 0.002; }).map(function (k) { return [k, Math.round((Math.exp(r.parts[k]) - 1) * 1000) / 10]; }), suite: suiteAdj, levelFrom: (B.levelFrom || {})[A.city] || "" },
    hit: r.hit, band: band, kind: kind, nearShop: nearShop, suiteAdj: suiteAdj, suiteNote: suiteNote, rentMonth: Math.round(rentMonth), rentN: rentN, useP: p.use || "", evid: evid, sparse: !!evid && (band >= 0.17),
    pub: Math.round(r.pub * 1000) / 10, pubSrc: r.pubSrc, filled: filled, fillTot: tot, fillBy: by, terrace: terrace, terraceValue: terraceValue, bsmt: bsmt, mezz: mezz, addon: addon, extraValue: extraValue, moto: moto, motoValue: motoValue, motoOne: motoOne, motoSrc: motoSrc,
    levelFrom: (B.levelFrom || {})[A.city] || "", typNote: typNote, near: near, floorsText: nfl > 1 ? flList.join("+") + " 樓" : "", arcade: arcade, leased: leased && use !== "住",
    through: B.through, from: B.from, n: B.cnt[distKey] || 0, area: distKey, season: B.season || "", dkey: (B.season || "") + "|" + (B.through || "") };
}
function reFloorList_(s) {
  s = String(s || "").replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  var m = s.match(/^\s*(\d+)\s*[-~～到至]\s*(\d+)/), out = [];
  if (m) { for (var i = Number(m[1]); i <= Number(m[2]) && out.length < 10; i++) out.push(i); return out; }
  (s.match(/\d+/g) || []).forEach(function (x) { var n = Number(x); if (n > 0 && out.indexOf(n) < 0) out.push(n); });
  return out.slice(0, 10);
}
function reParkParse_(s) {
  s = String(s || "");
  if (!s || /^無/.test(s)) return { type: "", count: 0, list: [] };
  // 可以有兩種車位：「坡道平面 1 個＋子母車位 1 個」
  var list = s.split(/[＋+]/).map(function (part) {
    var t = RE_PARK_TYPES_.filter(function (k) { return part.indexOf(k) >= 0; })[0] || "其他", m = part.match(/(\d+)\s*個/);
    return { type: t, count: m ? Math.max(1, Math.min(5, Number(m[1]))) : 1 };
  }).filter(function (x, i) { return i === 0 || x.type !== "其他" || /\d/.test(s.split(/[＋+]/)[i]); }).slice(0, 2);
  var n = list.reduce(function (a, x) { return a + x.count; }, 0);
  return { type: list.map(function (x) { return x.type; }).join("＋"), count: n, list: list };
}
// 自己調整的項目（跟 App 的 RE_ADJ_ 一樣；這裡只留 % 給伺服器算）
var RE_ADJ_PCT_ = {"c_leak": -6, "c_raw": -18, "c_old": -6, "c_light": 2, "c_new": 5, "c_high": 8, "c_lux": 10, "f_appl": 5, "f_full": 6, "lt_1": -3, "v_corner": 2, "v_dark": -5, "gp_wide": 1, "v_space": 2, "vw_bad": -4, "vw_open": 1, "vw_green": 2, "vw_blvd": 5, "vw_city": 4, "v_view": 6, "vw_icon": 8, "dr_good": 1, "v_west": -2, "v_layout": 3, "v_shape": -3, "ly_dark": -3, "ly_bath": 1, "v_suite": 2, "v_kitchen": 1, "ly_store": 1, "ly_nobal": -2, "ly_high": 3, "v_single": 3, "st_src": 2, "cm_fac": 2, "cm_small": 1, "e_mgmt_good": 2, "e_mgmt_bad": -3, "en_park": 3, "en_school": 3, "en_mrt": 3, "e_road": -3, "en_viaduct": -5, "en_market": -3, "en_temple": -5, "en_power": -8, "en_funeral": -12, "e_nimby": -8, "gf_yard": 4, "sw_n": -5, "sw_w": 5, "sw_x": 8, "sh_corner": 10, "sh_face_main": 12, "sh_side_lane": -12, "sh_hot": 8, "sh_quiet": -5, "sh_arcade": 2, "sh_block": -5, "sh_sign": 2, "sh_food": 3, "sh_brand": 3, "sh_water": 1, "of_a": 5, "of_old": -5, "of_res": -3, "of_whole": 3, "of_split": -2, "of_ac": 1, "of_raised": 1, "of_high": 2, "fc_reg": 5, "fc_illegal": -15, "fc_truck": 5, "fc_narrow": -8, "fc_lift": 3, "fc_load": 3, "fc_high": 4, "fc_power": 3, "lr_none": -30, "lr_small": -8, "lr_big": 8, "ld_corner": 8, "ld_square": 3, "ld_odd": -10, "ld_noline": -15, "ld_slope": -10, "ld_flood": -8, "ld_house": -3, "ld_occupied": -20, "ld_renew": 5, "th_garage": 4, "th_elev": 5, "th_wide": 3, "th_narrow": -5, "sc_leak": -16, "sc_old": -6, "sc_new": 3, "lg_ok": 3, "lg_bad": -5, "eq_win": 2, "eq_dark": -2, "eq_bath": 2, "eq_meter": 1, "eq_laundry": 1, "eq_fire": 1, "eq_water": 1, "eq_tiny": -3, "rt_full": 2, "rt_vac": -3, "a_roof": 8, "a_bal": 3, "a_add": 5, "a_mezz": 7, "b_brand": 3, "s_death": -35, "s_sea": -30, "s_struct": -15, "s_res": -8, "s_sup": -30, "s_renew": 33};
var RE_ADJ_ONE_ = {"c_leak": "cond", "c_raw": "cond", "c_old": "cond", "c_light": "cond", "c_new": "cond", "c_high": "cond", "c_lux": "cond", "f_appl": "furn", "f_full": "furn", "lt_1": "light", "v_corner": "light", "v_dark": "gap", "gp_wide": "gap", "v_space": "gap", "dr_good": "dir", "v_west": "dir", "e_mgmt_good": "mgmt", "e_mgmt_bad": "mgmt", "sw_n": "sw", "sw_w": "sw", "sw_x": "sw", "of_a": "ofg", "of_old": "ofg", "of_res": "ofg", "lr_none": "lr", "lr_small": "lr", "lr_big": "lr", "sc_leak": "sc", "sc_old": "sc", "sc_new": "sc", "lg_ok": "lg", "lg_bad": "lg", "rt_full": "rt", "rt_vac": "rt"};  // 同一組只能選一個
var RE_ADJ_SPECIAL_ = ["s_death", "s_sea", "s_struct", "s_res", "s_sup", "s_renew"];  // 不受加總上限限制
var RE_ADJ_VIEW_ = ["vw_bad", "vw_open", "vw_green", "vw_blvd", "vw_city", "v_view", "vw_icon"];  // 景觀可以複選：最好的算全額，其他加一半
var RE_ADJ_FIXED_ = ["lt_1", "v_corner", "v_dark", "gp_wide", "v_space", "vw_bad", "vw_open", "vw_green", "vw_blvd", "vw_city", "v_view", "vw_icon", "dr_good", "v_west", "v_layout", "v_shape", "ly_dark", "ly_bath", "v_suite", "v_kitchen", "ly_store", "ly_nobal", "ly_high", "v_single", "st_src", "cm_fac", "cm_small", "en_park", "en_school", "en_mrt", "e_road", "en_viaduct", "en_market", "en_temple", "en_power", "en_funeral", "e_nimby", "gf_yard", "sw_n", "sw_w", "sw_x", "sh_corner", "sh_face_main", "sh_side_lane", "sh_hot", "sh_quiet", "sh_arcade", "sh_block", "sh_sign", "of_a", "of_old", "of_res", "fc_reg", "fc_illegal", "fc_truck", "fc_narrow", "fc_lift", "fc_load", "fc_high", "fc_power", "th_garage", "th_elev", "th_wide", "th_narrow", "b_brand"];  // 房子本身不會變的條件（格局、景觀、結構、地點）：這一戶以前成交的價格已經包含，只加在模型那一半
var RE_ADJ_TYPES_ = {"c_leak": ["住", "透天", "店面", "辦公室", "工廠"], "c_raw": ["住", "透天", "店面", "辦公室", "工廠"], "c_old": ["住", "透天", "店面", "辦公室", "工廠"], "c_light": ["住", "透天", "店面", "辦公室", "工廠"], "c_new": ["住", "透天", "店面", "辦公室", "工廠"], "c_high": ["住", "透天", "店面", "辦公室", "工廠"], "c_lux": ["住", "透天", "店面", "辦公室", "工廠"], "f_appl": ["住", "透天", "辦公室"], "f_full": ["住", "透天", "辦公室"], "lt_1": ["住", "透天"], "v_corner": ["住", "透天"], "v_dark": ["住", "透天"], "gp_wide": ["住", "透天"], "v_space": ["住", "透天"], "vw_bad": ["住", "透天", "辦公室"], "vw_open": ["住", "透天", "辦公室"], "vw_green": ["住", "透天", "辦公室"], "vw_blvd": ["住", "透天", "辦公室"], "vw_city": ["住", "透天", "辦公室"], "v_view": ["住", "透天", "辦公室"], "vw_icon": ["住", "透天", "辦公室"], "dr_good": ["住", "透天"], "v_west": ["住", "透天"], "v_layout": ["住", "透天"], "v_shape": ["住", "透天"], "ly_dark": ["住", "透天"], "ly_bath": ["住", "透天"], "v_suite": ["住", "透天"], "v_kitchen": ["住", "透天"], "ly_store": ["住", "透天"], "ly_nobal": ["住", "透天"], "ly_high": ["住", "透天"], "v_single": ["住", "透天", "辦公室"], "st_src": ["住", "透天", "辦公室"], "cm_fac": ["住", "透天", "辦公室"], "cm_small": ["住", "透天", "辦公室"], "e_mgmt_good": ["住", "辦公室", "店面"], "e_mgmt_bad": ["住", "辦公室", "店面"], "en_park": ["住", "透天", "分租"], "en_school": ["住", "透天", "分租"], "en_mrt": ["住", "透天", "分租"], "e_road": ["住", "透天", "分租"], "en_viaduct": ["住", "透天", "分租"], "en_market": ["住", "透天", "分租"], "en_temple": ["住", "透天", "分租"], "en_power": ["住", "透天", "分租"], "en_funeral": ["住", "透天", "分租"], "e_nimby": ["住", "透天", "分租"], "gf_yard": ["住", "透天"], "sw_n": ["店面"], "sw_w": ["店面"], "sw_x": ["店面"], "sh_corner": ["店面"], "sh_face_main": ["店面"], "sh_side_lane": ["店面"], "sh_hot": ["店面"], "sh_quiet": ["店面"], "sh_arcade": ["店面"], "sh_block": ["店面"], "sh_sign": ["店面"], "sh_food": ["店面"], "sh_brand": ["店面"], "sh_water": ["店面"], "of_a": ["辦公室"], "of_old": ["辦公室"], "of_res": ["辦公室"], "of_whole": ["辦公室"], "of_split": ["辦公室"], "of_ac": ["辦公室"], "of_raised": ["辦公室"], "of_high": ["辦公室"], "fc_reg": ["工廠"], "fc_illegal": ["工廠"], "fc_truck": ["工廠"], "fc_narrow": ["工廠"], "fc_lift": ["工廠"], "fc_load": ["工廠"], "fc_high": ["工廠"], "fc_power": ["工廠"], "lr_none": ["土地"], "lr_small": ["土地"], "lr_big": ["土地"], "ld_corner": ["土地"], "ld_square": ["土地"], "ld_odd": ["土地"], "ld_noline": ["土地"], "ld_slope": ["土地"], "ld_flood": ["土地"], "ld_house": ["土地"], "ld_occupied": ["土地"], "ld_renew": ["土地"], "th_garage": ["透天"], "th_elev": ["透天"], "th_wide": ["透天"], "th_narrow": ["透天"], "sc_leak": ["分租"], "sc_old": ["分租"], "sc_new": ["分租"], "lg_ok": ["分租"], "lg_bad": ["分租"], "eq_win": ["分租"], "eq_dark": ["分租"], "eq_bath": ["分租"], "eq_meter": ["分租"], "eq_laundry": ["分租"], "eq_fire": ["分租"], "eq_water": ["分租"], "eq_tiny": ["分租"], "rt_full": ["分租"], "rt_vac": ["分租"], "a_roof": ["住", "透天", "店面", "工廠", "分租"], "a_bal": ["住", "透天", "店面", "工廠", "分租"], "a_add": ["住", "透天", "店面", "工廠", "分租"], "a_mezz": ["住", "透天", "店面", "工廠", "分租"], "b_brand": ["住", "透天", "辦公室"], "s_death": ["住", "透天", "店面", "辦公室", "工廠", "土地", "分租"], "s_sea": ["住", "透天", "店面", "辦公室", "工廠", "土地", "分租"], "s_struct": ["住", "透天", "店面", "辦公室", "工廠", "土地", "分租"], "s_res": ["住", "透天", "店面", "辦公室", "工廠", "土地", "分租"], "s_sup": ["住", "透天", "店面", "辦公室", "工廠", "土地", "分租"], "s_renew": ["住", "透天", "店面", "辦公室", "工廠", "土地", "分租"]};  // 每個項目適用的房子類型
function reAdjClean_(items, hit, L, type) {
  // 房子類型 → 勾選清單的分類（住宅、透天、店面、辦公室、工廠、土地）。寫在函式裡面，gen.py 重新產生清單時才不會被蓋掉
  function reAdjCat_(t) { return { "大樓": "住", "華廈": "住", "公寓": "住", "套房": "住", "透天": "透天", "店面": "店面", "辦公室": "辦公室", "工廠／廠辦": "工廠", "土地": "土地", "分租": "分租" }[t] || "住"; }
  var out = [], used = {}, ly = reLyOn_(L), drops = reLyDrops_(L), cat = type ? reAdjCat_(type) : "";
  (items || []).forEach(function (id) {
    id = String(id); if (!(id in RE_ADJ_PCT_) || out.indexOf(id) >= 0) return;
    if (cat && RE_ADJ_TYPES_[id] && RE_ADJ_TYPES_[id].length && RE_ADJ_TYPES_[id].indexOf(cat) < 0) return; // 這個類型的房子沒有這個選項
    if (ly && drops.indexOf(id) >= 0) return; // 用了格局圖：採光、棟距、景觀、方位（和房間細節）由格局圖算
    if (id === "b_brand" && (hit === "同一棟" || hit === "同建案")) return; // 同一棟有成交，品牌已經在價格裡
    // 同一棟（同一社區）有成交：整棟都一樣的條件（結構、社區公設、管理、學區、捷運、市場、嫌惡設施）已經在那些成交價裡，不要再加
    if (/^同一(棟|社區)|同建案/.test(String(hit || "")) && ["st_src", "cm_fac", "cm_small", "v_single", "e_mgmt_good", "e_mgmt_bad", "en_school", "en_mrt", "en_market", "en_power", "e_nimby", "b_brand"].indexOf(id) >= 0) return;
    var g = RE_ADJ_ONE_[id]; if (g) { if (used[g]) return; used[g] = 1; }  // 同一組只能選一個
    if ((id === "v_layout" && out.indexOf("v_shape") >= 0) || (id === "v_shape" && out.indexOf("v_layout") >= 0)) return; // 格局好、不方正只能一個
    out.push(id);
  });
  return out;
}
// 勾選項目合計：一般項目一項一項乘起來，最多 +35%、-45%（勾太多項乘起來會失真）；特殊狀況（凶宅、海砂屋…）和自己加減的不受限
var RE_ADJ_CAP_ = [-45, 35];
function reAdjPct_(items, custom, L, A) {
  var f = reLyOn_(L) ? reLayoutAdj_(L).f : 1, sp = 1, ff = f; // ff：不會變的條件（格局圖、景觀、結構、地點…）
  var vw = [];
  items.forEach(function (id) {
    var v = RE_ADJ_PCT_[id];
    if (RE_ADJ_SPECIAL_.indexOf(id) >= 0) sp *= 1 + v / 100;
    else if (RE_ADJ_VIEW_.indexOf(id) >= 0 && v > 0) vw.push(v);
    else { f *= 1 + v / 100; if (RE_ADJ_FIXED_.indexOf(id) >= 0) ff *= 1 + v / 100; }
  });
  vw.sort(function (a, b) { return b - a; }).forEach(function (v, i) { var k = 1 + (i ? v / 2 : v) / 100; f *= k; ff *= k; }); // 景觀：最好的全額，其他加一半
  f = Math.max(1 + RE_ADJ_CAP_[0] / 100, Math.min(1 + RE_ADJ_CAP_[1] / 100, f));
  // 估價有一半是這一戶以前的成交：那時候就有的條件（格局、景觀、結構、地點）已經在成交價裡，只加在模型那一半；屋況、裝潢、家具這些會變的兩半都加
  if (A && A.own && A.own.used && A.modelAmount > 0 && A.own.now > 0) {
    var wm = A.modelAmount, wr = A.own.now;
    f = (wm * f + wr * (f / ff)) / (wm + wr); // 模型那一半全部加；以前成交那一半只加會變的（f ÷ 不會變的）
  }
  f *= sp * (1 + Math.max(-50, Math.min(50, reNum_(custom))) / 100);
  return Math.round((f - 1) * 1000) / 10;
}
// 分租套房：勾選清單只看分租相關的，格局圖（自住的採光、景觀）不算
function reAdjT_(x) { return x.use === "分租" && ["大樓", "華廈", "公寓", "套房", "透天"].indexOf(x.type) >= 0 ? "分租" : x.type; }
// 基本資料填了增建坪數：「其他增建」的勾不算（不要算兩次）
function reAdjDropX_(items, x) { return x && x.area && reNum_(x.area.addon) > 0 ? items.filter(function (id) { return id !== "a_add"; }) : items; }
function reAdjL_(x) { return reAdjT_(x) === "分租" ? null : x.layout; }
// App：全部的房子一次重新估價（勾過的調整保留；估值是「採用自動估價」的跟著更新）
function waReValuateAll() {
  var ss = SS_(), B = reValBase_(), n = 0, fail = [];
  reAll_(ss).forEach(function (p) {
    if (p.sold) return;
    var r; try { r = reValuate_(p, B); } catch (e) { fail.push(p.name); return; }
    if (!r || !r.ok) { if (p.auto) fail.push(p.name); return; }
    r.date = reToday_();
    if (p.auto) { r.items = reAdjDropX_(reAdjClean_(p.auto.items || [], r.hit, reAdjL_(p), reAdjT_(p)), p); r.custom = p.auto.custom || 0; r.adj = reAdjPct_(r.items, r.custom, reAdjL_(p), r); if (p.auto.comp) r.comp = reCompRefresh_(p.auto.comp, r, p.auto); if (p.auto.amount && p.auto.amount !== r.amount) { r.prev = p.auto.amount; r.prevThrough = p.auto.through || ""; } }
    if (r.fillTot && !(reNum_(p.floors) > 0)) p.floors = r.fillTot;
    if (r.fillBy && !(reNum_(p.builtYear) > 1900)) p.builtYear = r.fillBy;
    if (p.value && p.value.src === "auto") p.value = { amount: Math.round(reAdjAmt_(r, r.adj || 0) / 10000) * 10000, date: reToday_(), src: "auto", adj: r.adj || 0 };
    p.auto = r; rePut_(ss, p); n++;
  });
  return { message: "已重新估價 " + n + " 間", detail: fail.length ? "這幾間沒辦法估：" + fail.join("、") : "估值是「採用自動估價」的已經跟著更新", dashboard: waGetDashboard() };
}
// App：看過「實價登錄更新後重估」的通知
function waReSeenPrev(p) { var ss = SS_(), x = reGet_(ss, p.id); if (x.auto) { x.auto.seenPrev = true; rePut_(ss, x); } return { ok: true }; }
// App：算一次自動估價（存起來，不會蓋掉自己填的估值；之前勾的調整項目留著）
function waReValuate(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  var r = reValuate_(x);
  if (!r.ok) throw new Error(r.why);
  r.date = reToday_();
  if (r.fillTot && !(reNum_(x.floors) > 0)) x.floors = r.fillTot;       // 從實價登錄帶入的，存回基本資料
  if (r.fillBy && !(reNum_(x.builtYear) > 1900)) x.builtYear = r.fillBy;
  if (x.auto) { r.items = x.auto.items || []; r.custom = x.auto.custom || 0; r.items = reAdjDropX_(reAdjClean_(r.items, r.hit, reAdjL_(x), reAdjT_(x)), x); r.adj = reAdjPct_(r.items, r.custom, reAdjL_(x), r); if (x.auto.comp) r.comp = reCompRefresh_(x.auto.comp, r, x.auto); }
  x.auto = r; rePut_(ss, x);
  return { message: "自動估價約 $" + r.amount.toLocaleString(), detail: "範圍 $" + r.lo.toLocaleString() + "～$" + r.hi.toLocaleString() + "（參考" + r.hit + "的成交）" };
}
// App：採用自動估價（可以加減自己調整的 %：裝潢、景觀、採光、噪音…）
function waReValAdopt(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  if (!x.auto || !x.auto.ok) throw new Error("還沒有自動估價");
  if (p.items) { x.auto.items = reAdjDropX_(reAdjClean_(p.items, x.auto.hit, reAdjL_(x), reAdjT_(x)), x); x.auto.custom = Math.max(-50, Math.min(50, reNum_(p.custom))); }
  var adj = reAdjPct_(reAdjDropX_(reAdjClean_(x.auto.items, x.auto.hit, reAdjL_(x), reAdjT_(x)), x), x.auto.custom, reAdjL_(x), x.auto), amt = Math.round(reAdjAmt_(x.auto, adj) / 10000) * 10000;
  x.auto.adj = adj;
  x.value = { amount: amt, date: reToday_(), src: "auto", adj: adj };
  rePut_(ss, x);
  return { message: "估值改成 $" + amt.toLocaleString(), detail: adj ? "自動估價 " + (adj > 0 ? "+" : "") + adj + "%" : "照自動估價" };
}

// App：存「依屋況調整」勾的項目（還沒採用）
function waReValAdj(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  if (!x.auto || !x.auto.ok) throw new Error("還沒有自動估價");
  x.auto.items = reAdjDropX_(reAdjClean_(p.items, x.auto.hit, reAdjL_(x), reAdjT_(x)), x); x.auto.custom = Math.max(-50, Math.min(50, reNum_(p.custom)));
  x.auto.adj = reAdjPct_(x.auto.items, x.auto.custom, reAdjL_(x), x.auto);
  rePut_(ss, x);
  var amt = Math.round(reAdjAmt_(x.auto, x.auto.adj) / 10000) * 10000;
  return { message: "調整 " + (x.auto.adj > 0 ? "+" : "") + x.auto.adj + "%，約 $" + amt.toLocaleString(), detail: "要用這個數字當估值，按「採用」" };
}

// App：存格局圖（四面版）。存了之後，採光、棟距、景觀、方位改由格局圖算
function waReLayoutSave(p) {
  var ss = SS_(), x = reGet_(ss, p.id), old = x.layout || {};
  var L = p.clear ? null : reLyClean_(p.layout);
  if (L) L.done = true;
  if (L && old.img && !L.img) L.img = old.img;
  if (L) x.layout = L; else { if (old.img) reLyImgPut_(ss, x.id, ""); delete x.layout; }
  var msg = L ? "格局圖已存" : "已刪除格局圖", detail = "";
  if (x.auto && x.auto.ok) {
    x.auto.items = reAdjDropX_(reAdjClean_(x.auto.items, x.auto.hit, reAdjL_(x), reAdjT_(x)), x);
    x.auto.adj = reAdjPct_(x.auto.items, x.auto.custom, reAdjL_(x), x.auto);
    var amt = Math.round(reAdjAmt_(x.auto, x.auto.adj) / 10000) * 10000;
    detail = "調整 " + (x.auto.adj > 0 ? "+" : "") + x.auto.adj + "%，約 $" + amt.toLocaleString() + "；要用這個數字當估值，按「採用」";
  }
  rePut_(ss, x);
  return { message: msg, detail: detail };
}
// 格局圖照片（仲介給的平面圖）：存在隱藏的工作表，一間房子一列，每格最多 45000 字
var RE_LY_IMG_SHEET_ = "_格局圖照片";
function reLyImgSheet_(ss) { var sh = ss.getSheetByName(RE_LY_IMG_SHEET_); if (!sh) { sh = ss.insertSheet(RE_LY_IMG_SHEET_); sh.hideSheet(); } return sh; }
function reLyImgPut_(ss, id, data) {
  var sh = reLyImgSheet_(ss), n = sh.getLastRow(), ids = n ? sh.getRange(1, 1, n, 1).getValues().map(function (r) { return String(r[0]); }) : [], row = ids.indexOf(String(id)) + 1;
  if (row) sh.getRange(row, 1, 1, sh.getMaxColumns()).clearContent();
  if (!data) { if (row) sh.deleteRow(row); return; }
  var cells = [String(id)]; for (var i = 0; i < data.length; i += 45000) cells.push(data.slice(i, i + 45000));
  if (sh.getMaxColumns() < cells.length) sh.insertColumnsAfter(sh.getMaxColumns(), cells.length - sh.getMaxColumns());
  sh.getRange(row || n + 1, 1, 1, cells.length).setValues([cells]);
}
function waReLayoutImg(p) {
  var data = String(p && p.data || "");
  if (data && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) throw new Error("圖片格式不正確");
  if (data.length > 900000) throw new Error("圖片太大，請換一張");
  var ss = SS_(), x = reGet_(ss, p.id);
  reLyImgPut_(ss, x.id, data);
  x.layout = x.layout || reLyClean_({ sides: [] });
  x.layout.img = data ? "1" : ""; rePut_(ss, x);
  return { message: data ? "格局圖照片已存" : "已刪除格局圖照片", detail: "" };
}
function waReLayoutImgGet(p) {
  var ss = SS_(), sh = ss.getSheetByName(RE_LY_IMG_SHEET_); if (!sh || !sh.getLastRow()) return { data: "" };
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getMaxColumns()).getValues();
  var r = vals.filter(function (v) { return String(v[0]) === String(p.id); })[0];
  return { data: r ? r.slice(1).join("") : "" };
}

// ---------- 預售屋：用同建案其他戶最近的成交估 ----------
function rePjNorm_(n) { return String(n || "").replace(/[\s　\-－—–_·‧・、,，.。()（）「」【】'"]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).toLowerCase(); }
function rePjFind_(Pj, name) {
  var n = rePjNorm_(name), keys = Object.keys(Pj || {});
  if (!n) return { list: keys };
  var ex = keys.filter(function (k) { return rePjNorm_(k) === n; });
  if (ex.length) return { key: ex[0] };
  var part = keys.filter(function (k) { var m = rePjNorm_(k); return m.indexOf(n) >= 0 || n.indexOf(m) >= 0; });
  if (part.length) { part.sort(function (a, b) { return Pj[b].r.length - Pj[a].r.length; }); return { key: part[0], fuzzy: true }; }
  // 找不到：用共同的字排出最像的
  var score = function (k) { var m = rePjNorm_(k), c = 0; for (var i = 0; i < n.length; i++) if (m.indexOf(n[i]) >= 0) c++; return c; };
  return { list: keys.sort(function (a, b) { return score(b) - score(a); }).slice(0, 8) };
}
function reMedian_(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; }
function reQuant_(a, q) { a = a.slice().sort(function (x, y) { return x - y; }); if (!a.length) return 0; var i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); }
function rePresaleVal_(p, B, Pj) {
  var A = reAddr_(p.address);
  if (!A.city || !A.dist) return { ok: false, why: "預售屋估價要地址寫到行政區，例如：新北市板橋區…（目前支援臺北市、新北市、桃園市）" };
  if (!rePjNorm_(p.project)) return { ok: false, why: "預售屋估價要在「基本資料」填建案名稱" };
  var fl = parseInt(String(p.floor || "").replace(/[^\d]/g, ""), 10), ar = p.area || {};
  var ping = reNum_(ar.total) || (reNum_(ar.main) + reNum_(ar.attach) + reNum_(ar.balcony) + reNum_(ar.public));
  var miss = []; if (!(fl > 0)) miss.push("所在樓層"); if (!(ping > 3)) miss.push("坪數（扣掉車位）");
  if (miss.length) return { ok: false, why: "要先在「基本資料」填：" + miss.join("、") };
  var distKey = A.city + A.dist;
  if (!B) B = reValBase_();
  if (Pj === undefined) Pj = B.pfiles && B.pfiles[distKey] ? reValFetch_("p/" + B.pfiles[distKey]) : null;
  if (!Pj) return { ok: false, why: A.dist + "最近沒有預售屋成交資料" };
  var f = rePjFind_(Pj, p.project);
  if (!f.key) return { ok: false, why: "在" + A.dist + "找不到「" + p.project + "」的預售成交。" + (f.list && f.list.length ? "這區有：" + f.list.join("、") + "。名稱要跟實價登錄一樣，改好再估一次" : "") };
  var rows = Pj[f.key].r;
  // 用最新的成交：最近 1 個月夠 5 筆就只用 1 個月，不夠再放寬到 2、3、6、12 個月，最後才用全部
  var mi = function (ym) { return Math.floor(ym / 100) * 12 + ym % 100; }, last = mi(rows[rows.length - 1][0]), use = rows, win = 0;
  [1, 2, 3, 6, 12].some(function (w) { var u = rows.filter(function (r) { return last - mi(r[0]) < w; }); if (u.length >= 5) { use = u; win = w; return true; } return false; });
  // 樓層價差：同建案裡高一層貴多少（資料夠就自己算，限制在 −0.5%～+1.5%；不夠用 0.6%）
  var slope = 0.006, fls = use.map(function (r) { return r[1]; });
  if (use.length >= 8 && Math.max.apply(null, fls) - Math.min.apply(null, fls) >= 3) {
    var mx = fls.reduce(function (a, b) { return a + b; }, 0) / fls.length, my = use.reduce(function (a, r) { return a + Math.log(r[3]); }, 0) / use.length, sxy = 0, sxx = 0;
    use.forEach(function (r) { sxy += (r[1] - mx) * (Math.log(r[3]) - my); sxx += (r[1] - mx) * (r[1] - mx); });
    if (sxx > 0) slope = Math.max(-0.005, Math.min(0.015, sxy / sxx));
  }
  var adj = use.map(function (r) { return r[3] * Math.exp(slope * (fl - r[1])); });
  // 範圍：同建案 20%～80% 的價格，至少 ±5%（預售合約價不等於現在轉手賣得到的價格）
  var unit = reMedian_(adj), lo = Math.min(reQuant_(adj, 0.2), unit * 0.95), hi = Math.max(reQuant_(adj, 0.8), unit * 1.05);
  // 車位：同建案同類型的中位數 → 同建案任何車位 → 縣市行情
  var pk = reParkParse_(p.parking), PT = B.ptypes || RE_PARK_TYPES_, ti = PT.indexOf(pk.type), parkOne = 0;
  if (pk.count) {
    var same = rows.filter(function (r) { return r[5] > 0 && r[6] === ti; }).map(function (r) { return r[5]; });
    var any = rows.filter(function (r) { return r[5] > 0; }).map(function (r) { return r[5]; });
    var tbl = (B.park || {})[A.city] || {};
    parkOne = same.length ? reMedian_(same) : any.length ? reMedian_(any) : (tbl[pk.type] || tbl["其他"] || 0);
  }
  var parkValue = Math.round(parkOne * pk.count), rnd = function (v) { return Math.round(v / 10000) * 10000; };
  var recent = rows.slice(-8).reverse().map(function (r) { return { ym: String(Math.floor(r[0] / 100)) + "/" + ("0" + (r[0] % 100)).slice(-2), fl: r[1], tot: r[2], unit: r[3], ping: r[4], park: r[5], no: r[7] }; });
  return { ok: true, presale: true, amount: rnd(unit * ping + parkValue), lo: rnd(lo * ping + parkValue), hi: rnd(hi * ping + parkValue),
    unit: Math.round(unit), ping: Math.round(ping * 100) / 100, parkValue: parkValue, parkCount: pk.count, parkType: pk.type,
    hit: "同建案", project: f.key, fuzzy: !!f.fuzzy, nUsed: use.length, nAll: rows.length, win: win, slope: Math.round(slope * 1000) / 10,
    recent: recent, through: B.pthrough || "", from: "", area: distKey, season: B.season || "" };
}

// 實價登錄資料更新後（base.json 的 season 變了）：有估過價的房子自動重估一次；
// 估值是「採用自動估價」的，估值也跟著更新（保留自己勾的調整）；自己填的估值不動
function reValRefresh_(ss) {
  var list = reAll_(ss).filter(function (p) { return !p.sold && p.auto && p.auto.ok; });
  if (!list.length) return 0;
  var B = reValBase_(), n = 0;
  if (!B.season) return 0;
  list.forEach(function (p) {
    // 實價登錄每月更新：資料的季別或「資料到哪個月」變了就自動重估（不用自己按）
    if ((p.auto.dkey || ((p.auto.season || "") + "|" + (p.auto.through || ""))) === (B.season || "") + "|" + (B.through || "")) return;
    var r; try { r = reValuate_(p, B); } catch (e) { return; }
    if (!r || !r.ok) return;
    r.date = reToday_(); r.prev = p.auto.amount; r.prevSeason = p.auto.season || ""; r.prevThrough = p.auto.through || "";
    r.items = reAdjDropX_(reAdjClean_(p.auto.items, r.hit, reAdjL_(p), reAdjT_(p)), p); r.custom = p.auto.custom || 0; r.adj = reAdjPct_(r.items, r.custom, reAdjL_(p), r);
    if (p.auto.comp) r.comp = reCompRefresh_(p.auto.comp, r, p.auto); // 選了附近成交比價的，照市場漲跌換算
    if (p.value && p.value.src === "auto") p.value = { amount: Math.round(reAdjAmt_(r, r.adj) / 10000) * 10000, date: reToday_(), src: "auto", adj: r.adj };
    p.auto = r; rePut_(ss, p); n++;
  });
  return n;
}

// 用附近某一筆實際成交比價（店面、商辦這種模型抓不準的，讓使用者自己挑最像的一筆）
// 估值＝那筆的每坪單價 × 你的坪數 ＋ 車位、露台；之後實價登錄更新時照市場漲跌同比例調整
// 調整的 % 只乘在房子本身（室內、露台、地下室這些），車位、機車位照原價：裝潢、景觀跟車位沒關係
function reAdjAmt_(A, adj) { var fx = (A.parkValue || 0) + (A.motoValue || 0); return (reAutoBase_(A) - fx) * (1 + (Number(adj) || 0) / 100) + fx; }
function reAutoBase_(A) {
  if (!A) return 0;
  if (A.comp && A.comp.unit > 0) return Math.round((A.comp.unit * (A.comp.adjF || 1) * A.ping + (A.parkValue || 0) + (A.terraceValue || 0) + (A.motoValue || 0)) / 10000) * 10000;
  return A.amount;
}
function reCompRefresh_(comp, rNew, rOld) {
  var f = rOld && rOld.unit > 0 && rNew.unit > 0 ? rNew.unit / rOld.unit : 1;
  var c = JSON.parse(JSON.stringify(comp)); c.adjF = Math.round((c.adjF || 1) * f * 1000) / 1000; return c;
}
function waReValComp(p) {
  var ss = SS_(), x = reGet_(ss, p.id);
  if (!x.auto || !x.auto.ok) throw new Error("還沒有自動估價");
  var i = Number(p.i);
  if (!(i >= 0)) { delete x.auto.comp; rePut_(ss, x); return { message: "改回模型估價", detail: "約 $" + x.auto.amount.toLocaleString() }; }
  var c = (x.auto.near || [])[i];
  if (!c) throw new Error("找不到那一筆成交");
  x.auto.comp = { unit: c.unit, ym: c.ym, addr: c.addr, fl: c.fl, ping: c.ping, adjF: 1 };
  rePut_(ss, x);
  var base = reAutoBase_(x.auto);
  return { message: "改用 " + c.addr + " 比價", detail: "每坪 $" + c.unit.toLocaleString() + " × " + x.auto.ping + " 坪，約 $" + base.toLocaleString() };
}

// ---------- 土地：使用分區＋行政區＋地段／小段＋面積＋是不是持分 ----------
var RE_LAND_ZONES_ = ["住宅區", "商業區", "工業區", "農業區", "保護區", "公設保留地", "都市其他", "甲建", "乙建", "丙建", "丁建", "農牧", "林業", "交通水利", "非都市其他"];
function reLandParse_(a) {
  a = String(a || "").replace(/[\s　]/g, "").replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/^台/, "臺");
  var m = a.match(/^(臺北市|新北市|桃園市)/), city = m ? m[1] : "";
  var d = a.match(/^(?:臺北市|新北市|桃園市)?([^區]{1,3}區)/), dist = d ? d[1] : "";
  a = a.replace(/^(?:臺北市|新北市|桃園市)?[^區]{1,3}區/, "");
  var s = a.match(/^(.*?段)(.*?小段)?(\d+)/);
  return { city: city, dist: dist, sec: s ? s[1] : "", sub: s && s[2] ? s[2] : "", no: s ? Number(s[3]) : -1 };
}
function reLandLu_(f, L, Ld) {
  var C = L.coef, z = f.zone, lu = C.const + (C["z_" + z] || 0) + (C["cz_" + f.city + "_" + z] || 0) + (L.dist[f.distKey] || 0);
  var la = Math.log(f.area); lu += (C["log面積"] || 0) * la + (C["log面積2"] || 0) * la * la;
  if (f.partial) lu += C["持分"] || 0;
  if (f.partial && z === "公設保留地") lu += C["公設x持分"] || 0;
  var hit = "行政區", zk = "|" + z, ks = zk + "|" + f.sec, ksub = ks + "|" + f.sub, kn = ksub + "|" + Math.floor(f.no / 100);
  if (Ld) {
    if (Ld.zk && zk in Ld.zk) { lu += Ld.zk[zk]; hit = "行政區同分區"; }
    if (f.sec && Ld.k_sec && ks in Ld.k_sec) { lu += Ld.k_sec[ks]; hit = "同地段"; }
    if (f.sec && Ld.k_sub && ksub in Ld.k_sub) { lu += Ld.k_sub[ksub]; hit = "同小段"; }
    if (f.sec && f.no >= 0 && Ld.k_no && kn in Ld.k_no) { lu += Ld.k_no[kn]; hit = "附近地號"; }
  }
  return { lu: lu, hit: hit, ksub: ksub };
}
function reLandVal_(p, B, Ld) {
  if (!B) B = reValBase_();
  var L = B.land;
  if (!L) return { ok: false, why: "土地估價資料還沒更新，等管理員更新實價登錄資料" };
  var A = reLandParse_(p.address);
  if (!A.city || !A.dist) return { ok: false, why: "土地的「地址」請寫地段地號，從縣市開始，例如：臺北市大安區懷生段一小段331地號" };
  var distKey = A.city + A.dist, zone = p.zone || "", area = reNum_((p.area || {}).land);
  if (L.zones.indexOf(zone) < 0) return { ok: false, why: "請在「基本資料」選土地的使用分區（看土地使用分區證明或地價稅單）" };
  if (!(area > 0)) return { ok: false, why: "請填土地坪數（你的持分部分，照權狀）" };
  if (!(distKey in L.dist) && !L.files[distKey]) return { ok: false, why: A.dist + "的土地成交太少，沒辦法估" };
  if (Ld === undefined) Ld = L.files[distKey] ? reValFetch_("l/" + L.files[distKey]) : null;
  var r = reLandLu_({ zone: zone, city: A.city, distKey: distKey, area: area, partial: !!p.landPartial, sec: A.sec, sub: A.sub, no: A.no }, L, Ld);
  var unit = Math.exp(r.lu), band = L.band[zone] || 0.5, rnd = function (v) { return Math.round(v / 10000) * 10000; };
  var near = (Ld && Ld.near && Ld.near[r.ksub] || []).slice(0, 8).map(function (x) { return { ym: Math.floor(x[0] / 100) + "/" + ("0" + x[0] % 100).slice(-2), addr: x[1], zone: x[2], ping: x[3], unit: x[4], partial: !!x[5] }; });
  return { ok: true, land: true, amount: rnd(unit * area), lo: rnd(unit * area * (1 - Math.min(band, 0.9))), hi: rnd(unit * area * (1 + band)), unit: Math.round(unit), ping: area,
    hit: r.hit, band: band, zone: zone, partial: !!p.landPartial, near: near, parkValue: 0, terraceValue: 0,
    through: L.through, from: L.from, area: distKey, season: B.season || "" };
}

// ---------- 🧾 繳費季：房屋稅（5 月）、地價稅（11 月）、牌照稅（4 月）、燃料費（7 月）、保險（到期前 30 天）----------
// App 每次打開都會跳表格，填好實際金額就存成這一戶／這台車的固定支出（每年自動記帳），明年照今年的金額往下估
// rows：[{ id, key, name, amount, month, day, expiry, none }]；none＝這筆不用繳（例如免稅、沒保這個險）
var RE_TAX_KEYS_ = { house: "房屋稅", land: "地價稅", lic: "牌照稅", fuel: "燃料費", comp: "強制險", opt: "任意險", fire: "住宅火險地震險" };
function waReTaxSave(p) {
  var ss = SS_(), year = Math.round(reNum_(p.year)) || Number(reToday_().slice(0, 4)), acc = reStr_(p.account, 60), byId = {}, n = 0;
  (p.rows || []).forEach(function (r) { if (r && r.id && RE_TAX_KEYS_[r.key]) (byId[r.id] = byId[r.id] || []).push(r); });
  Object.keys(byId).forEach(function (id) {
    var x = reGet_(ss, id); if (!x) return;
    x.taxSeen = x.taxSeen || {}; x.ins = x.ins || {}; x.costs = x.costs || [];
    byId[id].forEach(function (r) {
      var amt = Math.round(reNum_(r.amount)), nm = RE_TAX_KEYS_[r.key];
      var exp = reStr_(r.expiry, 10); if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) exp = "";
      if (/^(comp|opt|fire)$/.test(r.key)) { x.ins[r.key] = { expiry: exp, amount: r.none ? 0 : amt, none: !!r.none }; }
      x.taxSeen[year + "-" + r.key] = r.none ? 0 : amt;
      var old = x.costs.filter(function (c) { return c.tax === r.key || c.name === nm; })[0];
      if (r.none || !(amt > 0)) { if (old) x.costs = x.costs.filter(function (c) { return c !== old; }); n++; return; }
      if (!acc && !(old && old.account)) throw new Error("請選從哪個帳戶繳");
      var month = Math.min(12, Math.max(1, Math.round(reNum_(r.month)) || 1)), day = Math.min(28, Math.max(1, Math.round(reNum_(r.day)) || 28));
      if (exp) { month = Number(exp.slice(5, 7)); day = Math.min(28, Number(exp.slice(8, 10))); }
      var account = acc || old.account; waCheckAccountName_(account);
      if (old) { old.amount = amt; old.freq = "y"; old.month = month; old.day = day; old.account = account; old.tax = r.key; old.est = false; }
      else { var ym = reYm_(reToday_()); x.costs.push({ id: "C" + Date.now().toString(36) + Math.floor(Math.random() * 99) + r.key, name: nm, amount: amt, freq: "y", month: month, day: day, account: account, hist: {}, tax: r.key, autoFrom: reDue_(ym, day) >= reToday_() ? ym : reAddM_(ym, 1) }); }
      n++;
    });
    rePut_(ss, x);
  });
  return { message: "已存 " + n + " 筆", detail: "到繳費日會自動記帳；明年照這次的金額估" };
}


// 地址 → 經緯度（Apps Script 內建的 Google 地圖定位，不用另外申請金鑰）：天災風險、離市中心多遠要用
function reGeo_(addr) {
  try {
    var r = Maps.newGeocoder().setRegion("tw").setLanguage("zh-TW").geocode(String(addr));
    var g = r && r.results && r.results[0]; if (!g) return null;
    var L = g.geometry.location, t = g.geometry.location_type;   // ROOFTOP＝門牌、RANGE_INTERPOLATED＝路段推算、GEOMETRIC_CENTER／APPROXIMATE＝只到路或區
    if (!(L.lat > 21 && L.lat < 26.5 && L.lng > 118 && L.lng < 122.5)) return null;
    return { lat: Math.round(L.lat * 1e6) / 1e6, lng: Math.round(L.lng * 1e6) / 1e6, q: t || "", at: Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd") };
  } catch (e) { Logger.log("定位失敗：" + e); return null; }
}


// ==================== VehNP.gs ====================
// ============================================================
// 新車價參考表：二手車主通常不知道當年新車價，照品牌、車型、年份查一個大約的價格
// 來源：U-CAR、8891 車型頁的牌價和起價（2026/10 整理，一部分是推估），[品牌（機車前面加 M:）, 車型, 起年, 迄年, 元]
// ============================================================
var RE_VEH_NP_ = [["Toyota","Altis Hybrid GR",2023,2026,919000],["Toyota","Altis Hybrid",2019,2026,840000],["Toyota","Altis GR Sport",2020,2022,828000],["Toyota","Altis",2019,2026,749000],["Toyota","Altis 尊爵",2014,2018,780000],["Toyota","Altis",2014,2018,720000],["Toyota","Corolla Cross GR Sport Hybrid",2023,2023,990000],["Toyota","Corolla Cross GR Sport Hybrid",2024,2026,989000],["Toyota","Corolla Cross 豪華",2023,2023,859000],["Toyota","RAV4 2.0 旗艦",2019,2022,1060000],["Toyota","Camry",2024,2024,990000],["Toyota","Camry",2014,2014,899000],["Toyota","Sienta 七人",2022,2022,860000],["Toyota","Sienta 豪華",2019,2020,729000],["Toyota","Sienta 經典",2018,2018,699000],["Toyota","Yaris 經典",2019,2022,619000],["Toyota","Vios",2021,2021,580000],["Toyota","Alphard 3.5",2016,2016,2580000],["Toyota","Town Ace",2024,2024,625000],["Toyota","Yaris Cross",2024,2024,760000],["Lexus","ES 300h 旗艦",2019,2021,2250000],["Lexus","ES 300h",2019,2021,1980000],["Lexus","ES 200 頂級",2019,2021,1850000],["Lexus","ES 200",2019,2021,1750000],["Lexus","ES 200",2022,2024,1820000],["Lexus","NX 200t AWD F Sport",2015,2017,1990000],["Lexus","NX 200t",2015,2017,1780000],["Lexus","NX 300 F Sport",2018,2021,1980000],["Lexus","NX 200 菁英",2018,2021,1580000],["Lexus","NX 200",2018,2021,1570000],["Lexus","NX 200 豪華",2022,2025,1810000],["Lexus","NX 250 豪華",2022,2025,1975000],["Lexus","NX 250 頂級",2022,2025,2075000],["Lexus","RX 200t",2016,2018,2350000],["Lexus","RX 300 頂級",2019,2021,2650000],["Lexus","RX 300 旗艦",2022,2022,2850000],["Lexus","RX 350 頂級",2023,2024,2850000],["Lexus","RX 500h",2023,2025,3600000],["Lexus","UX 250h",2019,2022,1550000],["Lexus","CT 200h",2011,2013,1250000],["Lexus","CT 200h",2017,2017,1350000],["Honda","CR-V 1.5 VTi-S",2018,2019,1080000],["Honda","CR-V 1.5 S",2018,2019,1150000],["Honda","CR-V 1.5 S",2020,2023,1139000],["Honda","CR-V 1.5 VTi-S",2020,2023,1019000],["Honda","CR-V Prestige",2024,2025,1279000],["Honda","CR-V VTi-S",2025,2025,1059000],["Honda","CR-V 2.4 S",2013,2013,1120000],["Honda","CR-V 2.4 VTi-S",2016,2016,1090000],["Honda","HR-V S 1.8",2017,2021,819000],["Honda","HR-V Prestige",2022,2022,890000],["Honda","HR-V S",2023,2023,889000],["Honda","HR-V Prestige",2023,2024,959000],["Honda","Fit 1.5 S",2014,2016,709000],["Honda","Fit 1.5 S",2017,2020,729000],["Honda","Fit e:HEV",2022,2023,799000],["Honda","Fit Home",2023,2023,779000],["Honda","Civic e:HEV",2023,2023,1399000],["Nissan","Sentra 1.8 尊爵旗艦",2016,2019,800000],["Nissan","Sentra 1.8 尊爵",2016,2020,760000],["Nissan","Sentra 1.8 豪華",2016,2020,700000],["Nissan","Sentra 1.6 旗艦",2020,2020,850000],["Nissan","Sentra 尊爵智駕",2020,2023,829000],["Nissan","Sentra 尊爵",2022,2023,789000],["Nissan","Sentra 尊爵 BOSE",2025,2025,890000],["Nissan","Tiida 旗艦",2017,2022,739000],["Nissan","Tiida 5D 360",2021,2021,750000],["Nissan","Tiida 5D",2020,2020,699000],["Nissan","Kicks 智行旗艦",2019,2022,800000],["Nissan","Kicks 時尚",2019,2021,720000],["Nissan","Kicks 旗艦 1.6",2023,2023,835000],["Nissan","X-Trail e-Power 經典",2025,2025,1049000],["Mazda","Mazda3 尊榮",2015,2018,880000],["Mazda","Mazda3 旗艦",2019,2020,990000],["Mazda","Mazda3 4D",2020,2020,890000],["Mazda","Mazda3 Signature",2023,2025,960000],["Mazda","Mazda3 Premium",2025,2025,920000],["Mazda","CX-30 頂級",2020,2021,999000],["Mazda","CX-30 尊榮",2021,2021,950000],["Mazda","CX-30 旗艦",2021,2021,1030000],["Mazda","CX-3 尊貴",2016,2016,790000],["Mazda","CX-3 小改頂級",2018,2018,890000],["Mazda","CX-3 旗艦",2020,2020,910000],["Mazda","CX-3 旗艦",2023,2023,870000],["Mazda","CX-5 2WD 頂級",2017,2018,1080000],["Mazda","CX-5 20S Carbon",2022,2022,1050000],["Mazda","CX-5 25T AWD Signature",2022,2022,1390000],["Mitsubishi","Colt Plus",2016,2016,590000],["Mitsubishi","Colt Plus",2020,2022,550000],["Mitsubishi","Colt Plus",2023,2025,559000],["Mitsubishi","Zinger 2.4 精緻",2021,2021,740000],["Mitsubishi","Zinger 2.4 旗艦",2021,2024,830000],["Mitsubishi","Outlander 4WD",2015,2015,1000000],["Mitsubishi","Outlander 2.4 尊貴",2021,2024,950000],["Mitsubishi","Outlander S-AWC",2023,2023,1050000],["Mitsubishi","Eclipse Cross",2019,2020,1050000],["Ford","Focus 5D Lommel",2020,2021,899000],["Ford","Focus 5D ST-Line",2019,2019,849000],["Ford","Focus ST-Line Lommel",2020,2020,899000],["Ford","Focus Active",2021,2022,829000],["Ford","Focus 5D 1.6",2016,2017,660000],["Ford","Focus ST",2023,2023,1489000],["Ford","Focus Wagon",2023,2024,990000],["Ford","Kuga EcoBoost 180 旗艦",2021,2023,1059000],["Ford","Kuga EcoBoost 250",2021,2022,1269000],["Hyundai","Tucson GLT-B",2022,2023,989000],["Hyundai","Tucson GLTH-C",2024,2025,1259000],["Hyundai","Tucson N-Line",2024,2024,1099000],["Hyundai","Venue GLB",2022,2022,699000],["Hyundai","Venue GLC",2022,2022,759000],["Hyundai","Venue GLB",2024,2024,749000],["Hyundai","Venue GLC",2024,2024,799000],["Hyundai","Venue 1.6",2020,2020,679000],["Hyundai","Custin GLT-B",2024,2025,1329000],["Kia","Sportage X-Line 4WD",2023,2025,1389000],["Kia","Sportage Apex",2025,2025,1290000],["Kia","Picanto X-Line",2018,2022,629000],["Kia","Carnival 2.2 頂級",2021,2021,1899000],["Kia","Stonic",2022,2022,739000],["Subaru","Forester 2.0i-L",2019,2019,1080000],["Subaru","Forester 2.0 i-S",2019,2023,1180000],["Subaru","Forester 2.0i",2014,2014,998000],["Subaru","Forester 2.0 XT",2016,2017,1350000],["Subaru","XV 2.0 i-S",2022,2023,1128000],["Subaru","Crosstrek",2023,2023,1118000],["Subaru","Levorg 1.6",2016,2018,1250000],["Subaru","Levorg 2.0",2018,2020,1520000],["Subaru","WRX 2.0",2016,2020,1500000],["Subaru","WRX tS",2023,2023,1890000],["Subaru","Outback 2.5i-S",2015,2017,1400000],["Luxgen","U6 GT220",2018,2019,858000],["Luxgen","U6 GT",2018,2019,779000],["Luxgen","U6 GT 特仕",2021,2021,748000],["Luxgen","U6 Neo",2025,2025,758000],["Luxgen","URX 51",2022,2022,928000],["Luxgen","URX 7人",2024,2024,998000],["Luxgen","URX Neo 51",2023,2023,950000],["Luxgen","URX 5人",2022,2022,908000],["Luxgen","M7",2016,2021,998000],["Luxgen","n7 5人",2024,2024,999000],["Luxgen","n7 LR",2025,2025,1199000],["Mercedes-Benz","C300 AMG",2015,2016,2490000],["Mercedes-Benz","C200 Sedan",2017,2017,1950000],["Mercedes-Benz","C-Class Estate",2016,2016,2090000],["Mercedes-Benz","C300 Coupe",2014,2014,2690000],["Mercedes-Benz","C300 Cabriolet",2015,2018,2950000],["Mercedes-Benz","C43",2018,2019,3650000],["Mercedes-Benz","C63s Coupe",2018,2018,6300000],["Mercedes-Benz","E300 AMG",2017,2017,2990000],["Mercedes-Benz","E300 運動",2021,2021,3050000],["Mercedes-Benz","E350",2022,2022,3300000],["Mercedes-Benz","E200 CGI",2011,2011,2400000],["Mercedes-Benz","GLC 300",2019,2019,2840000],["Mercedes-Benz","GLC43",2018,2018,4000000],["Mercedes-Benz","GLC Coupe AMG 43",2022,2022,4400000],["Mercedes-Benz","GLC 200 4Matic",2024,2024,2680000],["Mercedes-Benz","GLC 300 4Matic",2024,2024,3130000],["Mercedes-Benz","GLC Coupe 300",2025,2025,3360000],["Mercedes-Benz","A180",2014,2015,1450000],["Mercedes-Benz","A180",2018,2018,1650000],["Mercedes-Benz","CLA 200",2014,2014,1750000],["Mercedes-Benz","CLA45",2017,2017,2800000],["Mercedes-Benz","CLA200 Shooting",2023,2023,2060000],["Mercedes-Benz","GLA 180",2019,2019,1750000],["Mercedes-Benz","GLA45",2016,2016,2800000],["Mercedes-Benz","A35",2022,2022,2650000],["Mercedes-Benz","GLB35",2023,2023,2950000],["BMW","320i",2013,2013,2100000],["BMW","520i",2019,2020,2750000],["BMW","520i",2018,2018,2690000],["BMW","520i Sport",2021,2021,2700000],["BMW","520d",2011,2011,2500000],["BMW","420i Gran Coupe",2023,2023,2500000],["BMW","420i Gran Coupe",2024,2024,2590000],["BMW","430i Gran Coupe",2016,2016,2800000],["BMW","X5 xDrive30d",2025,2025,4100000],["BMW","X5 xDrive25d",2021,2021,3430000],["BMW","X5 xDrive25d",2015,2015,3290000],["BMW","X6 xDrive40i",2022,2022,4300000],["BMW","X3 M40i",2023,2023,3900000],["BMW","X4 xDrive28i",2018,2018,2800000],["BMW","X4 xDrive20i",2019,2019,2600000],["BMW","X1 sDrive20i",2018,2018,1900000],["BMW","X1 sDrive20d",2011,2011,1900000],["BMW","318i Luxury",2022,2022,2090000],["BMW","318i",2018,2018,1850000],["BMW","320i M Sport",2017,2017,2350000],["BMW","118i",2015,2017,1500000],["BMW","116i",2012,2012,1350000],["BMW","750i",2018,2018,6500000],["BMW","i4 eDrive40",2022,2022,2790000],["BMW","i4 M50",2023,2023,3600000],["BMW","M235i Gran Coupe",2021,2021,2600000],["BMW","218i Active",2014,2014,1500000],["BMW","328i Convertible",2013,2014,3000000],["Audi","A3 Sportback 35 TFSI",2018,2020,1500000],["Audi","A3 Sportback 30 TFSI",2023,2023,1410000],["Audi","S3 Sportback",2022,2022,2300000],["Audi","A4 35 TFSI",2015,2016,1790000],["Audi","A4 Avant 1.8",2013,2013,1900000],["Audi","A4 Avant 40 TFSI PP",2018,2018,2050000],["Audi","A6 35 TFSI",2016,2018,2380000],["Audi","A6 40 TDI",2020,2020,2650000],["Audi","A6 2.0 TDI",2013,2013,2350000],["Audi","A6 Avant 35",2014,2014,2500000],["Audi","A6 Allroad",2017,2017,3100000],["Audi","A7 Sportback 3.0",2012,2012,3900000],["Audi","A8 50 TDI",2019,2019,4300000],["Audi","Q3 30 TFSI",2016,2016,1820000],["Audi","Q3 35 TFSI quattro",2018,2018,2000000],["Audi","Q3 Sportback 35",2022,2022,2200000],["Audi","Q3 35 TFSI",2024,2024,1950000],["Audi","Q5 45 TFSI",2018,2018,2600000],["Audi","Q5 45 TFSI S line",2020,2020,2680000],["Audi","Q5 40 TFSI",2014,2014,2480000],["Audi","Q5 Sportback 40",2024,2024,2700000],["Audi","Q7 45 TDI",2018,2018,3300000],["Audi","A5 Sportback 40 TFSI PP",2018,2018,2300000],["Audi","A5 Sportback 40 TFSI",2023,2023,2400000],["Audi","TT 2.0",2010,2010,2390000],["Audi","R8 5.2",2012,2012,10500000],["Audi","Q8 Sportback e-tron 50",2024,2024,3500000],["Audi","e-tron S Sportback",2022,2022,4600000],["Volkswagen","Tiguan 280 TSI CL",2017,2017,1258000],["Volkswagen","Tiguan 330 TSI CL",2019,2019,1380000],["Volkswagen","Tiguan 330 TSI Highline",2019,2019,1488000],["Volkswagen","Tiguan 280 TSI Elegance",2020,2021,1250000],["Volkswagen","Tiguan 380 R-Line",2022,2022,1670000],["Volkswagen","Tiguan Allspace 330",2019,2019,1600000],["Volkswagen","Golf 1.2 TSI",2015,2015,948000],["Volkswagen","Golf GTI",2019,2019,1550000],["Volkswagen","Golf GTI Performance",2019,2019,1650000],["Volkswagen","Golf 230 eTSI",2022,2022,980000],["Volkswagen","Golf 280 eTSI Style",2023,2023,1318000],["Volkswagen","Golf R",2023,2023,2200000],["Volkswagen","T-Roc 280",2021,2021,1140000],["Volkswagen","T-Roc R",2023,2023,1798000],["Volkswagen","T-Cross",2020,2022,990000],["Volkswagen","Touran 280",2017,2017,1180000],["Volkswagen","Touran 7人",2024,2024,1400000],["Volkswagen","Caddy Maxi TDI",2020,2020,1200000],["Volkswagen","Caddy Maxi TDI",2022,2022,1400000],["Volkswagen","Polo 230",2019,2019,800000],["Volvo","XC60 T6 Inscription",2018,2018,2590000],["Volvo","XC60 T6 R-Design",2018,2018,2640000],["Volvo","XC60 T5 R-Design",2019,2020,2542000],["Volvo","XC60 B4",2021,2021,2205000],["Volvo","XC60 B5 R-Design",2022,2022,2597000],["Volvo","XC60 B5",2022,2022,2500000],["Volvo","XC60 B4 Plus",2023,2023,2400000],["Volvo","XC60 B4",2022,2022,2250000],["Volvo","XC60 T5",2014,2014,2100000],["Volvo","XC60 T5 R-Design",2015,2015,2300000],["Volvo","XC40 T4",2019,2019,1699000],["Volvo","XC40 T3",2022,2022,1500000],["Volvo","XC40 B4",2022,2022,1750000],["Volvo","XC40 B4 Ultimate",2024,2024,2050000],["Volvo","XC90 T5",2017,2019,2800000],["Volvo","XC90 B5",2022,2022,3000000],["Volvo","XC90 B5 AWD Plus",2023,2023,3100000],["Volvo","V60 B4",2021,2022,1900000],["Volvo","V60 T5",2014,2014,1900000],["Volvo","S60 T4",2015,2015,1700000],["Volvo","S60 D4",2016,2016,1800000],["Volvo","V40",2013,2018,1250000],["Volvo","S90 B4",2022,2022,2400000],["Volvo","V90 Cross Country",2017,2017,2800000],["Porsche","Macan 2.0",2021,2023,2950000],["Porsche","Macan S",2018,2020,3400000],["Porsche","Macan GTS",2024,2024,4500000],["Porsche","Macan S Diesel",2015,2015,3300000],["Porsche","Cayenne Coupe 3.0T",2020,2020,3680000],["Porsche","Cayenne Coupe 3.0T",2021,2021,3800000],["Porsche","Cayenne Coupe 3.0T",2022,2023,4000000],["Porsche","Cayenne Coupe 3.0T",2024,2024,4600000],["Porsche","Cayenne 3.0T",2018,2019,3700000],["Porsche","Cayenne Diesel",2015,2015,3600000],["Porsche","718 Cayman 2.0T",2018,2018,3200000],["Porsche","718 Boxster T",2019,2019,3530000],["Porsche","718 Boxster T",2022,2022,3900000],["Porsche","718 Boxster GTS 4.0",2021,2021,4600000],["Porsche","911 Carrera S",2020,2020,7500000],["Porsche","Taycan RWD",2022,2022,3900000],["Porsche","Panamera 3.6",2011,2011,4500000],["Land Rover","Discovery Sport P200 SE",2020,2021,2200000],["Land Rover","Discovery Sport P250 R-DS",2021,2021,2500000],["Land Rover","Discovery Sport D180",2020,2020,2100000],["Land Rover","Discovery Sport P250 R-Dynamic SE",2023,2023,2500000],["Land Rover","Evoque P200 R-Dynamic S",2020,2021,2350000],["Land Rover","Evoque R-Dynamic",2021,2021,2300000],["Land Rover","Evoque SE",2016,2016,2300000],["Land Rover","Evoque Si4 HSE",2019,2019,2550000],["Land Rover","Evoque P250",2025,2025,2600000],["Land Rover","Velar P300",2018,2018,3600000],["Land Rover","Velar P250",2019,2019,3200000],["Land Rover","Velar P250 R-Dynamic",2023,2023,3400000],["Land Rover","Defender 110 P300 HSE",2021,2022,3300000],["Land Rover","Defender 90 D250",2023,2023,2900000],["Land Rover","Defender 110 P300 X-Dynamic",2024,2024,3500000],["Land Rover","Defender 110 D300",2024,2024,3700000],["Land Rover","Discovery 5 HSE",2018,2018,3900000],["Land Rover","Range Rover 3.0 SDV6",2019,2019,6000000],["Land Rover","Range Rover P400 SE SWB",2023,2023,7200000],["MINI","Cooper 5-Door",2015,2018,1450000],["MINI","Cooper 5D",2018,2018,1450000],["MINI","Cooper S 5-Door",2015,2017,1700000],["MINI","One",2018,2019,1200000],["MINI","One",2022,2022,1300000],["MINI","Cooper S",2020,2020,1750000],["MINI","Cooper S 5-Door",2022,2022,1850000],["MINI","Cooper S Hatch",2024,2024,1810000],["MINI","Cooper 5-Door C",2025,2025,1580000],["MINI","Countryman Cooper",2017,2017,1610000],["MINI","Countryman Cooper S",2018,2019,1890000],["MINI","Countryman Cooper",2021,2021,1350000],["MINI","Countryman Cooper",2023,2023,1450000],["MINI","Countryman Cooper S",2023,2023,1750000],["MINI","Countryman JCW",2020,2021,2450000],["MINI","Countryman JCW",2024,2024,2500000],["MINI","Clubman JCW",2020,2023,2400000],["Skoda","Kodiaq 2.0 TSI",2017,2020,1390000],["Skoda","Kodiaq 1.5 TSI",2022,2022,1419000],["Skoda","Kodiaq RS",2022,2023,1859000],["Skoda","Kodiaq 1.5 TSI",2024,2024,1538000],["Skoda","Kodiaq 2.0 TSI 4x4",2025,2025,1738000],["Skoda","Karoq",2019,2023,1180000],["Skoda","Octavia Combi 1.0",2019,2019,1000000],["Skoda","Octavia 1.0",2022,2022,1070000],["Skoda","Octavia 1.5",2023,2023,1200000],["Skoda","Superb 1.4",2017,2017,1300000],["Skoda","Superb Combi 2.0",2018,2018,1600000],["Skoda","Superb 1.5",2023,2023,1500000],["Skoda","Superb Combi 1.5",2025,2025,1350000],["Skoda","Kamiq",2021,2025,1000000],["Skoda","Scala",2020,2022,950000],["Skoda","Fabia",2019,2021,800000],["Peugeot","3008 GT 2.0",2018,2019,1600000],["Peugeot","3008 1.2 Allure",2019,2019,1198000],["Peugeot","3008 1.2 Allure",2021,2022,1309000],["Peugeot","3008 1.6 GT",2023,2023,1550000],["Peugeot","5008 1.6 Allure",2019,2021,1509000],["Peugeot","5008 1.6 GT",2021,2022,1680000],["Peugeot","5008 1.5 BlueHDi",2022,2022,1560000],["Peugeot","5008 1.6 GT",2024,2024,1650000],["Peugeot","2008 GT",2021,2024,1150000],["Peugeot","2008 Hybrid",2025,2025,1179000],["Peugeot","408 GT",2024,2024,1369000],["Peugeot","408 Hybrid",2025,2025,1400000],["Tesla","Model 3 Long Range",2019,2020,1900000],["Tesla","Model 3 Long Range",2021,2021,1958000],["Tesla","Model 3 Long Range",2022,2022,2197000],["Tesla","Model 3 SR",2019,2019,1600000],["Tesla","Model 3 Performance",2020,2020,2300000],["Tesla","Model Y Long Range",2022,2022,2299900],["Tesla","Model Y Long Range",2023,2024,2128000],["Tesla","Model Y Performance",2023,2023,2388000],["Tesla","Model Y RWD",2025,2025,1899900],["Tesla","Model X",2019,2021,4300000],["Tesla","Model X",2023,2024,4300000],["Jeep","Wrangler Rubicon 2.0",2021,2022,2650000],["Jeep","Wrangler Rubicon X",2023,2024,3300000],["Jeep","Wrangler Unlimited Willys",2020,2020,2500000],["Maserati","Ghibli 3.0",2015,2017,4500000],["Maserati","Ghibli S Q4",2015,2016,5600000],["Maserati","Ghibli Elite",2019,2019,4200000],["Maserati","Ghibli MHEV",2021,2021,4300000],["Maserati","Ghibli GT",2022,2022,4000000],["Maserati","Levante Elite",2020,2021,3780000],["Maserati","Levante S",2017,2017,6000000],["Maserati","Levante 350",2017,2017,5000000],["Maserati","Levante GT",2022,2022,4300000],["Maserati","Levante Trofeo",2019,2019,6980000],["Maserati","Grecale GT",2023,2023,3590000],["Maserati","Grecale Modena",2023,2023,4300000],["Maserati","Quattroporte 3.0",2015,2015,6000000],["Maserati","Quattroporte GTS",2013,2015,7500000],["Jaguar","E-Pace P200 S",2020,2020,1900000],["Jaguar","E-Pace P200 R-Dynamic",2022,2022,2150000],["Jaguar","E-Pace P250",2024,2024,2400000],["Jaguar","E-Pace P250",2019,2019,2150000],["Jaguar","F-Pace 35t",2016,2017,3300000],["Jaguar","F-Pace 25t",2018,2018,3000000],["Jaguar","F-Pace S AWD",2019,2019,4000000],["Jaguar","F-Pace P250",2021,2022,2900000],["Jaguar","XE P250",2020,2020,2300000],["Jaguar","XF 25t",2016,2016,2600000],["Jaguar","I-Pace EV400 HSE",2020,2020,3770000],["Jaguar","I-Pace EV400 S",2021,2021,3460000],["Jaguar","XJ Luxury 2.0",2014,2015,3900000],["Bentley","Continental GT V8",2012,2013,11000000],["Bentley","Continental GT W12",2012,2013,12500000],["Bentley","Continental GT V8 S",2016,2017,13000000],["Bentley","Continental GT Speed",2016,2016,15500000],["Bentley","Continental GT W12",2019,2019,14500000],["Bentley","Continental GTC V8",2021,2021,14500000],["Bentley","Continental GT V8",2023,2023,13800000],["Bentley","Flying Spur V8",2015,2015,11000000],["Bentley","Flying Spur V8S",2018,2018,12000000],["Bentley","Bentayga W12",2016,2016,14500000],["Bentley","Bentayga S",2023,2023,13300000],["Rolls-Royce","Ghost",2012,2012,20500000],["Rolls-Royce","Ghost EWB",2013,2014,24000000],["Rolls-Royce","Ghost EWB",2018,2018,25000000],["Rolls-Royce","Wraith",2014,2017,18880000],["Rolls-Royce","Wraith",2020,2020,19500000],["Rolls-Royce","Dawn",2016,2016,20500000],["Rolls-Royce","Cullinan",2019,2020,21880000],["McLaren","570S",2016,2017,11500000],["McLaren","570GT",2017,2017,12000000],["McLaren","720S",2017,2019,15500000],["McLaren","720S Spider",2019,2019,17000000],["McLaren","600LT",2019,2019,16000000],["McLaren","GT",2021,2021,12500000],["Lamborghini","Urus",2018,2020,12480000],["Lamborghini","Urus",2023,2023,13500000],["Lamborghini","Urus S",2024,2024,16000000],["Lamborghini","Huracan",2015,2015,14000000],["Ferrari","296 GTB",2023,2024,15500000],["Ferrari","488 GTB",2016,2016,13880000],["Ferrari","GTC4Lusso",2018,2018,15000000],["Ferrari","California 30",2012,2012,11000000],["Toyota","Auris",2019,2019,899000],["Toyota","86",2013,2013,1290000],["Toyota","Prius c",2021,2021,779000],["Toyota","Hilux",2023,2023,1350000],["Toyota","Hiace",2024,2024,1360000],["Lexus","IS 300h F Sport",2025,2026,2330000],["Lexus","IS 300h",2013,2013,1990000],["Lexus","IS 250",2010,2010,1890000],["Lexus","LX 570",2015,2015,5600000],["Lexus","LBX",2024,2024,1350000],["Honda","Civic 1.8",2011,2015,819000],["Honda","Civic 2.0",2013,2013,949000],["Volkswagen","Tiguan 330 TSI Elegance",2024,2024,1660000],["Nissan","X-Trail 2.0",2022,2022,999000],["Nissan","X-Trail 2.5",2022,2022,1150000],["Nissan","X-Trail e-Power",2023,2023,1519000],["Nissan","Altima",2019,2022,1200000],["Mazda","CX-60",2024,2024,1590000],["Mazda","CX-9 2WD",2018,2018,1580000],["Mazda","CX-9 AWD",2018,2018,1680000],["Mazda","Mazda2 豪華",2015,2015,699000],["Mazda","Mazda2 15S",2024,2024,780000],["Mazda","Mazda6",2017,2017,1040000],["Mitsubishi","XForce",2026,2026,849000],["Mitsubishi","Grand Lancer",2018,2018,749000],["Ford","Focus 5D S 1.6",2016,2016,699000],["Ford","Focus 5D",2023,2023,849000],["Ford","Ranger Wildtrak",2019,2019,1290000],["Ford","Ranger Wildtrak",2024,2024,1590000],["Ford","Kuga TDCi",2017,2017,1199000],["Ford","Focus 5D 1.5",2016,2016,869000],["BMW","323i",2011,2011,2160000],["BMW","M8",2021,2021,10800000],["BMW","i3",2018,2018,2100000],["Subaru","Impreza 5D",2018,2018,898000],["Subaru","Outback 2.5i-T",2021,2021,1598000],["Hyundai","Elantra Sport 1.6",2019,2019,899000],["Hyundai","Elantra Sport 1.8",2015,2017,729000],["Hyundai","Elantra 1.8 GLS",2014,2014,699000],["Hyundai","Tucson 1.6T",2020,2020,1059000],["Hyundai","Tucson 2.0 4WD",2016,2016,1099000],["Hyundai","Santa Fe GLD",2022,2022,1550000],["Hyundai","Santa Fe 2.2",2016,2016,1380000],["Hyundai","Custin 1.5 頂級",2026,2026,1479000],["Kia","Sorento",2021,2021,1599000],["Kia","Picanto APEX",2025,2025,649000],["Kia","Carens CRDI",2015,2015,990000],["Kia","Carens 2.0",2018,2018,899000],["Kia","Soul",2018,2018,950000],["Audi","A1 30",2016,2016,1200000],["Volvo","EX30",2026,2026,1550000],["Porsche","Cayenne Coupe E-Hybrid",2024,2024,5480000],["Porsche","718 Boxster Spyder",2021,2021,6500000],["Porsche","911 Turbo S Cabriolet",2025,2025,15880000],["Porsche","Macan Electric",2025,2025,3680000],["Porsche","Cayenne S Diesel",2014,2014,5200000],["Land Rover","Evoque Bronze",2023,2023,2600000],["Land Rover","Range Rover P400 HSE LWB",2023,2023,9000000],["MINI","Cooper S",2023,2023,1850000],["MINI","Countryman Cooper S",2017,2017,1890000],["MINI","Coupe",2015,2015,1500000],["MINI","Cooper JCW",2024,2025,2400000],["MINI","Countryman C",2025,2025,1650000],["MINI","Countryman S",2014,2014,1800000],["Skoda","Yeti",2015,2015,899000],["Skoda","Fabia",2017,2017,729000],["Skoda","Superb Combi SportLine",2023,2023,1750000],["Skoda","Octavia Combi RS",2016,2016,1350000],["Skoda","Superb Combi 1.4",2017,2017,1390000],["Skoda","Octavia Combi 1.4",2017,2017,1050000],["Skoda","Octavia 1.6 TDI",2016,2016,990000],["Peugeot","3008 1.6 BlueHDi",2016,2016,1099000],["Peugeot","308",2020,2020,1099000],["Peugeot","508 SW",2022,2022,1890000],["Peugeot","2008 1.2",2019,2019,899000],["Tesla","Model S",2017,2017,3800000],["Luxgen","U6 2.0",2015,2016,998000],["Luxgen","U5",2018,2018,769000],["Luxgen","S3",2017,2019,608000],["Luxgen","S5",2015,2015,838000],["Luxgen","U6 1.8",2016,2016,798000],["Jeep","Gladiator",2021,2021,2850000],["Maserati","GranTurismo",2013,2013,8000000],["Jaguar","XF 2.2D",2012,2014,2450000],["Infiniti","Q30 1.6",2017,2019,1390000],["Infiniti","Q30 2.0",2017,2017,1720000],["Infiniti","QX30",2018,2018,1750000],["Infiniti","Q50 2.0t 豪華",2014,2019,1890000],["Infiniti","Q50 2.0[tT] 旗艦",2015,2018,2190000],["Infiniti","QX50 (2.0t )風尚",2019,2023,1990000],["Infiniti","QX50 豪華",2019,2019,2190000],["Infiniti","QX50 旗艦",2019,2019,2390000],["Infiniti","QX55",2022,2022,2620000],["Infiniti","QX60 3.5 豪華",2014,2014,2390000],["Infiniti","QX60 3.5 旗艦",2017,2017,2590000],["Infiniti","QX60 Autograph",2024,2024,2990000],["Infiniti","G25",2011,2011,1750000],["Infiniti","FX35",2010,2012,2890000],["Infiniti","Q60",2017,2017,2290000],["Aston Martin","DB9 5.9",2006,2006,11000000],["Aston Martin","DB9 5.9",2013,2013,11500000],["Aston Martin","DB9 Carbon",2015,2015,13500000],["Aston Martin","Rapide 6.0",2010,2011,12000000],["Aston Martin","Rapide S",2014,2014,12500000],["Aston Martin","DB11 V8",2021,2021,12500000],["Aston Martin","DB11 Volante",2021,2021,13800000],["Alfa Romeo","Giulia Ti 2.0",2017,2017,1990000],["Alfa Romeo","Giulia (Veloce Ti )Q4",2017,2018,2390000],["Alfa Romeo","Giulia Veloce Q4",2021,2021,2390000],["Alfa Romeo","Giulia QV",2017,2019,4980000],["Alfa Romeo","Giulia Sprint",2026,2026,2250000],["Alfa Romeo","Stelvio (Q4 )2.0",2017,2018,2190000],["Alfa Romeo","Stelvio Ti Sport",2018,2018,2490000],["Alfa Romeo","Stelvio 2.0",2022,2022,2580000],["Alfa Romeo","Stelvio QV",2018,2019,5680000],["Alfa Romeo","Stelvio Sprint",2026,2026,2450000],["Alfa Romeo","Tonale",2024,2024,1890000],["Alfa Romeo","Junior",2026,2026,1590000],["Suzuki","Swift 1.4 GLX",2011,2013,599000],["Suzuki","Swift 1.4 GL",2013,2013,559000],["Suzuki","Swift 1.6 Sport",2012,2013,799000],["Suzuki","Swift 1.2 GL",2015,2015,599000],["Suzuki","Swift 1.0T",2018,2020,779000],["Suzuki","Swift 1.0 GLX",2019,2019,680000],["Suzuki","Swift Sport",2019,2019,988000],["Suzuki","Swift 1.2",2020,2023,699000],["Suzuki","Swift 1.2 輕油電",2023,2024,729000],["Suzuki","Jimny 1.3",2015,2015,699000],["Suzuki","Jimny 1.5",2021,2024,939000],["Suzuki","SX4 S-Cross",2024,2024,1090000],["Suzuki","SX4 1.4T",2020,2020,919000],["Suzuki","Baleno",2017,2017,699000],["Suzuki","Baleno",2020,2020,729000],["Suzuki","Ignis",2018,2018,559000],["Suzuki","Ignis",2023,2023,629000],["MG","HS 1.5T 旗艦",2023,2024,989000],["MG","HS 1.5 基礎",2023,2023,849000],["MG","HS 1.5T MAX",2024,2024,899000],["MG","HS 2.0T",2023,2024,1199000],["MG","HS PHEV",2023,2024,1299000],["MG","ZS 1.5 旗艦",2023,2026,729000],["MG","ZS 1.5 心動",2026,2026,669000],["MG","G50",2025,2026,1099000],["Citroen","長軸 XTR XL",2022,2023,1280000],["Citroen","長軸 Feel XL",2024,2024,1180000],["Citroen","長軸 Feel",2022,2022,1120000],["Citroen","長軸 XTR",2022,2022,1220000],["Citroen","短軸 XTR",2025,2025,1280000],["Citroen","短軸 Feel",2024,2024,1150000],["Citroen","E-C4",2023,2023,1590000],["Citroen","C4 Feel",2023,2023,1099000],["Citroen","DS5 THP",2015,2015,1590000],["Citroen","DS5 BlueHDi",2014,2014,1650000],["Citroen","DS3",2015,2017,990000],["Smart","Forfour 52kW Pure",2015,2016,820000],["Smart","Forfour 66kW Pure",2016,2018,890000],["Smart","Forfour 66kW Passion",2016,2017,940000],["Smart","Forfour 66kW 頂級",2018,2018,990000],["Smart","Forfour Brabus",2017,2017,1280000],["Smart","Fortwo 52kW Pure",2017,2017,880000],["Smart","Fortwo 52kW Passion",2016,2019,960000],["Smart","Fortwo 453",2019,2019,960000],["Smart","Fortwo mhd",2011,2015,860000],["Opel","Astra Elegance",2023,2023,1090000],["Opel","Astra GS",2024,2024,1290000],["Opel","Mokka",2023,2023,1090000],["Opel","Grandland GS",2023,2023,1250000],["Opel","Grandland Business",2024,2024,1350000],["Fiat","500 1.2",2013,2013,699000],["Fiat","500C 1.4",2011,2017,899000],["Fiat","Gucci",2012,2013,990000],["Fiat","TwinAir",2013,2013,790000],["Fiat","500S",2013,2013,920000],["Fiat","500 1.4",2018,2018,850000],["Fiat","RIVA",2017,2017,1250000],["Fiat","500E",2023,2023,1550000],["Abarth","595 Competizione",2013,2013,1350000],["Abarth","595 Competizione",2018,2018,1450000],["Abarth","Pista",2018,2018,1250000],["Abarth","695",2024,2024,1990000],["Abarth","695 70",2020,2020,1750000],["Abarth","124 Spider",2016,2016,1680000],["Abarth","最終版",2022,2022,1580000],["Abarth","595C",2016,2016,1550000],["Abarth","Scorpioneoro",2021,2021,1650000],["Abarth","Maserati",2012,2012,1750000],["Abarth","500 Abarth",2013,2013,1150000],["Abarth","500E",2023,2023,1990000],["CMC","Zinger 旗艦 1.5",2025,2025,729000],["CMC","Zinger 7人",2024,2024,799000],["CMC","Zinger 精緻 2.4",2021,2023,740000],["CMC","Zinger 標緻",2022,2023,700000],["CMC","Zinger 旗艦 2.4",2020,2022,830000],["CMC","Zinger 豪華 2.4",2019,2019,720000],["CMC","Zinger Pick Up",2020,2023,660000],["CMC","Veryca A180 5人",2023,2024,580000],["CMC","Veryca A190",2019,2023,490000],["CMC","Veryca A180 1.3",2018,2018,460000],["CMC","Veryca 1.3",2015,2017,420000],["CMC","J Space 廂型",2025,2025,669000],["Daihatsu","Terios 4WD",2010,2016,729000],["Daihatsu","Terios 2WD",2013,2013,649000],["Daihatsu","Sirion",2013,2013,599000],["Lotus","Evora S",2011,2011,6900000],["Lotus","Evora IPS",2012,2012,6500000],["Cadillac","Escalade",2011,2011,4000000],["Chevrolet","Camaro",2018,2018,2280000],["M:Yamaha","勁戰6代 ABS",2022,2022,93000],["M:Yamaha","勁戰5代",2018,2018,76000],["M:Yamaha","NMAX 155",2024,2024,105000],["M:Yamaha","FORCE 155",2017,2017,92000],["M:Yamaha","FORCE 155",2020,2020,92000],["M:Yamaha","FORCE 2.0",2022,2022,112000],["M:Yamaha","CUXI 115 碟煞",2019,2019,62000],["M:Yamaha","NEW CUXI 115",2016,2016,62000],["M:Yamaha","CUXI 115",2016,2016,62000],["M:Yamaha","CUXI 115 碟煞",2014,2014,60000],["M:Yamaha","CUXI 100",2010,2010,52000],["M:Yamaha","JOG FS 115",2016,2016,55000],["M:Yamaha","JOG 125",2021,2021,66000],["M:Yamaha","Sweet 115",2015,2015,57000],["M:Yamaha","Sweet 115",2018,2018,57000],["M:Yamaha","RAY 125",2014,2014,70000],["M:Yamaha","RS ZERO 100",2011,2011,52000],["M:Yamaha","BWS 125",2021,2021,95000],["M:Yamaha","LIMI 115",2018,2018,57000],["M:Yamaha","LIMI 125",2021,2021,66000],["M:Yamaha","R15 V3",2020,2020,115000],["M:Yamaha","R15 V4",2022,2022,125000],["M:Yamaha","R15 V4",2023,2023,125000],["M:Yamaha","R15M",2023,2023,138000],["M:Yamaha","XMAX 300",2021,2021,238000],["M:Yamaha","XMAX 300",2020,2020,238000],["M:Yamaha","R3",2015,2015,248000],["M:Yamaha","R3",2021,2021,258000],["M:Yamaha","R7",2022,2022,368000],["M:Yamaha","R7",2023,2023,368000],["M:Yamaha","XSR900",2023,2023,548000],["M:Yamaha","TMAX560",2021,2021,598000],["M:Yamaha","TMAX530",2017,2017,559000],["M:SYM 三陽","MII 110",2016,2016,53000],["M:SYM 三陽","WOO 100",2018,2018,52000],["M:SYM 三陽","WOO 100",2016,2016,52000],["M:SYM 三陽","WOO 115",2022,2022,59000],["M:SYM 三陽","KRN-BT",2022,2022,99000],["M:SYM 三陽","JET SR",2021,2021,89000],["M:SYM 三陽","JETS",2019,2019,76000],["M:SYM 三陽","JET S",2018,2018,76000],["M:SYM 三陽","JET SL TCS",2023,2023,92000],["M:SYM 三陽","SL+ 158",2024,2024,109000],["M:SYM 三陽","MMBCU 158",2023,2023,109000],["M:SYM 三陽","金發財 125",2019,2019,63000],["M:SYM 三陽","金發財 125",2012,2012,58000],["M:SYM 三陽","迪爵 125",2022,2022,66000],["M:SYM 三陽","迪爵 125 碟煞",2022,2022,66000],["M:SYM 三陽","新迪爵 125",2019,2019,63000],["M:SYM 三陽","新迪爵 125",2018,2018,63000],["M:SYM 三陽","新迪爵 125",2020,2020,63000],["M:SYM 三陽","新迪爵 125",2024,2024,69000],["M:SYM 三陽","MIO 115",2018,2018,59000],["M:SYM 三陽","DRG 158",2020,2020,102000],["M:SYM 三陽","VIVO 125",2019,2019,58000],["M:SYM 三陽","GT Fi 125",2016,2016,69000],["M:SYM 三陽","GT 125",2011,2011,68000],["M:SYM 三陽","Fighter 6代 150",2015,2015,89000],["M:SYM 三陽","Z1 125",2019,2019,69000],["M:SYM 三陽","Z1 ATTILA 125",2017,2017,69000],["M:SYM 三陽","Joymax Z+ 300",2023,2023,168000],["M:SYM 三陽","MAXSYM 400i",2014,2014,245000],["M:SYM 三陽","MAXSYM 400i",2015,2015,245000],["M:SYM 三陽","Maxsym 600i",2015,2015,299000],["M:SYM 三陽","TL500",2020,2020,299000],["M:SYM 三陽","TL508",2022,2022,329000],["M:SYM 三陽","ADXTG 400",2024,2024,278000],["M:Kymco 光陽","LIKE 125",2018,2018,79000],["M:Kymco 光陽","Racing S150 ABS",2022,2022,99000],["M:Kymco 光陽","雷霆S 150",2021,2021,99000],["M:Kymco 光陽","雷霆S 150",2018,2018,95000],["M:Kymco 光陽","雷霆S 125",2016,2016,89000],["M:Kymco 光陽","雷霆 Fi 150",2013,2013,89000],["M:Kymco 光陽","VJR 110",2016,2016,64000],["M:Kymco 光陽","VJR 125",2015,2015,72000],["M:Kymco 光陽","VJR 125",2016,2016,72000],["M:Kymco 光陽","VJR 125",2019,2019,76000],["M:Kymco 光陽","VJR 125 ABS",2019,2019,82000],["M:Kymco 光陽","VJR 125 ABS",2020,2020,82000],["M:Kymco 光陽","GP 125",2017,2017,57000],["M:Kymco 光陽","GP 125",2018,2018,57000],["M:Kymco 光陽","GP 125",2015,2015,57000],["M:Kymco 光陽","GP2 125",2013,2013,55000],["M:Kymco 光陽","GP 125",2023,2023,59000],["M:Kymco 光陽","NICE 100",2020,2020,49000],["M:Kymco 光陽","NICE 100",2021,2021,49000],["M:Kymco 光陽","G6 150",2014,2014,89000],["M:Kymco 光陽","G6 150",2015,2015,89000],["M:Kymco 光陽","G6 150",2023,2023,92000],["M:Kymco 光陽","MANY 110 碟煞",2018,2018,59000],["M:Kymco 光陽","MANY 110 碟煞",2015,2015,59000],["M:Kymco 光陽","CUE 100",2019,2019,50000],["M:Kymco 光陽","CUE 100",2017,2017,50000],["M:Kymco 光陽","CHERRY 100",2012,2012,46000],["M:Kymco 光陽","KRV 180 TCS",2023,2023,125000],["M:Kymco 光陽","RTS 135 TCS",2024,2024,98000],["M:Kymco 光陽","新名流 150",2019,2019,79000],["M:Kymco 光陽","FAMOUS 125",2019,2019,72000],["M:Kymco 光陽","Xciting 400S",2019,2019,268000],["M:Kymco 光陽","刺激 400",2013,2013,238000],["M:Kymco 光陽","CV3 550",2022,2022,438000],["M:Kymco 光陽","AK550",2023,2023,448000],["M:Kymco 光陽","AK550",2022,2022,448000],["M:Gogoro","S2",2021,2021,108000],["M:Gogoro","S2",2019,2019,108000],["M:Gogoro","S2",2018,2018,108000],["M:Gogoro","2 Delight",2020,2020,72000],["M:Gogoro","2 Delight",2019,2019,72000],["M:Gogoro","2 Delight",2021,2021,72000],["M:Gogoro","2 Plus",2018,2018,75000],["M:Gogoro","2 Plus",2017,2017,75000],["M:Gogoro","3 Plus",2019,2019,85000],["M:Gogoro","Viva Mix Belt",2021,2021,66000],["M:Gogoro","Viva XL Belt",2024,2024,78000],["M:其他電動","PGO Ur1",2022,2022,79000],["M:其他電動","PGO Ur1",2019,2019,79000],["M:Honda","Rebel 1100T",2023,2023,558000],["M:Honda","CB650R",2020,2020,368000],["M:Honda","CB650R",2022,2022,388000],["M:Honda","CB650R",2023,2023,388000],["M:Honda","Forza 750",2021,2021,498000],["M:Honda","Rebel 500S",2023,2023,298000],["M:Honda","CBR500R",2024,2024,298000],["M:Honda","CBR650R",2022,2022,398000],["M:Honda","X-ADV 750",2022,2022,568000],["M:其他","CFMOTO 450SRS",2024,2024,239000],["M:其他","CFMOTO 450SR",2023,2023,229000],["M:BMW","F900R",2020,2020,529000],["M:Kawasaki","Ninja 650",2021,2021,339000],["M:Kawasaki","Ninja 400",2019,2019,248000],["M:Kawasaki","Z1000",2014,2014,540000],["M:Harley-Davidson","XG750",2017,2017,499000],["M:Suzuki","GSX-R1000R",2018,2018,1050000],["M:其他","Aprilia Tuareg 660",2022,2022,589000],["M:其他","KTM RC390",2022,2022,269000],["M:其他","KTM Duke 390",2022,2022,259000],["M:其他","AEON STR 300",2023,2023,198000],["Toyota","Camry",2012,2013,1000000],["Toyota","Camry",2014,2017,950000],["Toyota","Camry",2018,2020,1130000],["Toyota","Camry",2021,2023,980000],["Toyota","Camry",2024,2026,1100000],["Toyota","RAV4",2013,2018,1000000],["Toyota","RAV4",2019,2020,980000],["Toyota","RAV4",2021,2024,1020000],["Toyota","RAV4 Hybrid",2019,2024,1200000],["Toyota","RAV4",2025,2026,1200000],["Toyota","Corolla Cross",2020,2026,850000],["Toyota","Corolla Cross Hybrid",2020,2026,950000],["Toyota","Sienta",2016,2018,740000],["Toyota","Sienta",2019,2021,720000],["Toyota","Sienta",2022,2026,850000],["Toyota","Yaris",2014,2017,600000],["Toyota","Yaris",2018,2020,620000],["Toyota","Yaris",2021,2023,660000],["Toyota","Vios",2014,2023,580000],["Toyota","Alphard",2018,2023,2800000],["Toyota","Alphard",2024,2026,3500000],["Honda","Fit",2014,2016,660000],["Honda","Fit",2017,2020,700000],["Honda","Fit",2021,2026,780000],["Honda","Civic",2016,2021,990000],["Honda","Civic",2022,2026,1150000],["Honda","CR-V",2017,2019,1080000],["Honda","CR-V",2020,2022,1040000],["Honda","CR-V",2023,2026,1170000],["Honda","HR-V",2017,2021,820000],["Honda","HR-V",2022,2026,880000],["Nissan","Sentra",2020,2022,780000],["Nissan","Sentra",2023,2026,820000],["Nissan","Kicks",2018,2021,740000],["Nissan","Kicks",2022,2026,820000],["Nissan","X-Trail",2015,2021,950000],["Nissan","X-Trail",2023,2026,1150000],["Mazda","Mazda3",2015,2018,850000],["Mazda","Mazda3",2019,2026,880000],["Mazda","CX-30",2020,2026,990000],["Mazda","CX-5",2017,2021,1120000],["Mazda","CX-5",2022,2026,1200000],["Mazda","CX-3",2016,2026,820000],["Mitsubishi","Outlander",2015,2022,980000],["Mitsubishi","Eclipse Cross",2018,2026,1000000],["Mitsubishi","Colt Plus",2014,2026,560000],["Ford","Focus",2015,2018,750000],["Ford","Focus",2019,2026,850000],["Ford","Kuga",2017,2020,1050000],["Ford","Kuga",2021,2026,1150000],["Hyundai","Tucson",2016,2021,1000000],["Hyundai","Tucson",2022,2026,1100000],["Hyundai","Santa Fe",2019,2023,1500000],["Hyundai","Santa Fe",2024,2026,1750000],["Lexus","NX",2015,2021,1750000],["Lexus","NX",2022,2026,1950000],["Lexus","RX",2016,2022,2600000],["Lexus","RX",2023,2026,3000000],["Lexus","ES",2019,2026,1950000],["Lexus","UX",2019,2026,1550000],["Mercedes-Benz","C",2015,2021,2200000],["Mercedes-Benz","C",2022,2026,2500000],["Mercedes-Benz","E",2017,2023,2900000],["Mercedes-Benz","E",2024,2026,3200000],["Mercedes-Benz","GLC",2016,2022,2600000],["Mercedes-Benz","GLC 300",2018,2018,2675000],["Mercedes-Benz","GLC",2023,2026,2900000],["Mercedes-Benz","A",2019,2026,1750000],["Mercedes-Benz","CLA",2014,2026,1850000],["Mercedes-Benz","GLA",2015,2026,1850000],["BMW","3",2012,2018,2200000],["BMW","3",2019,2026,2300000],["BMW","5",2017,2023,2900000],["BMW","5",2024,2026,3200000],["BMW","X1",2016,2022,1900000],["BMW","X1",2023,2026,2050000],["BMW","X3",2018,2024,2650000],["BMW","X5",2019,2026,3600000],["BMW","4 Gran Coupe",2021,2026,2550000],["Audi","A3",2014,2026,1450000],["Audi","A4",2016,2026,1950000],["Audi","A6",2019,2026,2700000],["Audi","Q3",2012,2026,1900000],["Audi","Q5",2017,2026,2550000],["Audi","Q7",2016,2026,3400000],["Volkswagen","Golf",2013,2020,1050000],["Volkswagen","Golf",2021,2026,1150000],["Volkswagen","Tiguan",2017,2024,1400000],["Volkswagen","Tiguan 380 TSI",2017,2020,1728000],["Volkswagen","Tiguan",2025,2026,1600000],["Volkswagen","T-Roc",2020,2026,1150000],["Volvo","XC40",2018,2026,1750000],["Volvo","XC60",2018,2026,2450000],["Volvo","XC90",2016,2026,3000000],["Porsche","Macan",2015,2026,3200000],["Porsche","Cayenne",2018,2026,4000000],["Porsche","911",2019,2026,7500000],["Tesla","Model 3",2019,2026,2000000],["Tesla","Model Y",2021,2026,2200000],["Audi","A8 55 TFSI",2021,2025,4500000],["Audi","R8 V10",2015,2015,10830000],["Audi","RS 6 Avant",2014,2023,7300000],["BMW","M3 Competition",2024,2024,6070000],["Ferrari","458 Italia",2013,2013,13450000],["Bentley","Continental GT V8",2015,2015,12300000],["Bentley","Mulsanne",2012,2012,22200000],["Rolls-Royce","Wraith",2014,2014,18880000],["Aston Martin","Vantage",2014,2020,8800000],["Aston Martin","DBX",2020,2020,9880000],["Alfa Romeo","Stelvio Sprint",2025,2025,2289000],["Audi","Q4 e-tron",2024,2024,2090000],["Audi","Q5 2.0 TFSI",2012,2012,2440000],["Audi","A4 Avant 40 TFSI",2018,2018,2050000]];
function reVehNPTok_(s) { var cn = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 }; return String(s || "").toLowerCase().replace(/[‐-–—]/g, "-").replace(/[一二三四五六七八九](?=代)/g, function (c) { return cn[c]; }); }
// 找最像的一筆：車型名稱裡的字（Tiguan、380、TSI…）對到越多越好，年份越近越好；同分的取中間價
function reVehNP_(brand, model, year, moto) {
  var key = (moto ? "M:" : "") + brand, raw = reVehNPTok_(model), flat = raw.replace(/[\s\-_.]/g, ""), y = Number(year) || 0;
  if (!flat || !y) return null;
  var has = function (t) {
    t = t.replace(/[\-_.]/g, ""); if (!t) return false;
    if (t.length >= 3 || /[^\x00-\x7f]/.test(t)) return flat.indexOf(t) >= 0;
    return new RegExp("(^|[^a-z0-9])" + t.replace(/[^a-z0-9]/g, "") + "(?![a-z])").test(raw.replace(/[\-_.]/g, " ")) || new RegExp("(^|[^a-z0-9])" + t + "(?![a-z])").test(raw);
  };
  var best = [], bs = -1e9;
  RE_VEH_NP_.forEach(function (e) {
    if (e[0] !== key) return;
    var toks = reVehNPTok_(e[1]).split(/\s+/).filter(String);
    if (!toks.length || !has(toks[0])) return; // 車型家族（第一個字）一定要對到
    var hit = 1, miss = 0; toks.slice(1).forEach(function (t) { if (has(t)) hit++; else miss++; });
    var dist = y < e[2] ? e[2] - y : y > e[3] ? y - e[3] : 0; if (dist > 4) return;
    var sc = hit - 0.5 * miss - 0.3 * dist;
    if (sc > bs + 1e-9) { bs = sc; best = [e]; } else if (Math.abs(sc - bs) < 1e-9) best.push(e);
  });
  if (!best.length || bs < 0.5) return null; // 太不像的不要硬猜
  best.sort(function (a, b) { return a[4] - b[4]; });
  var m = best[Math.floor((best.length - 1) / 2)];
  return { price: m[4], name: m[1], y0: m[2], y1: m[3], n: best.length };
}
// App 裡選完品牌、車型、年份，先查給你看
function waVehNP(p) {
  var r = reVehNP_(String(p && p.brand || ""), String(p && p.model || ""), Number(p && p.year), p && p.type === "機車");
  return r || { price: 0 };
}


// ==================== History.gs ====================
// ============================================================
// 📈 價格走勢：每一筆資產點進去，看它的價格／估值怎麼變
// - 股票、ETF、外幣：用 Google 試算表內建的 GOOGLEFINANCE 拿每天收盤價（買之前的也看得到，不用自己存）
// - 球員卡、保險、收藏品：原本就記在「另類資產走勢」分頁（價值有變就記，球員卡大約 3 天查一次成交價）
// - 房子、汽機車：記在「價格走勢」分頁
//     · 估值有變才記一筆（重新估價、改了估值、實價登錄更新…）
//     · 同一天變了好幾次，只留最後一次
//     · 汽機車的估值每天都會一點點往下（折舊），差 1% 以上或隔 30 天才記，不然一天一筆太多
// - 黃金：每小時更新金價時順便記，一天一筆（每一件黃金的走勢＝金價 × 純金重量）
// 分頁：A 日期（yyyy-MM-dd）｜B 項目（R:房子編號、GOLD）｜C 數值
// ============================================================
var HIST_SHEET_ = "價格走勢";

function histSheet_(ss, create) {
  var sh = ss.getSheetByName(HIST_SHEET_);
  if (!sh && create) {
    sh = ss.insertSheet(HIST_SHEET_);
    sh.getRange(1, 1, 1, 3).setValues([["日期", "項目（App 自己維護）", "價格／估值"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
function histToday_() { return Utilities.formatDate(new Date(), WA_TZ_, "yyyy-MM-dd"); }
function histLast_() { try { return JSON.parse(PROPS_().getProperty("HIST_LAST") || "{}") || {}; } catch (e) { return {}; } }

// 記一筆。mode：
//   "change"＝跟上一筆不一樣才記（同一天就改掉那一筆）
//   "daily"＝每天留一筆（同一天一直改那一筆）
//   {pct, days}＝差 pct 以上、或隔 days 天才記（汽機車）
// last：histLast_() 的物件（呼叫的人最後要存回去）。回傳有沒有寫
function histPut_(ss, last, key, value, day, mode) {
  value = Math.round(Number(value) * 100) / 100;
  if (!(value > 0) || !key) return false;
  day = day || histToday_();
  var L = last[key], sh = histSheet_(ss, true);
  if (L) {
    if (day < L.d) { // 比上一筆還早的日期（例如估值日期寫的是以前）：沒變就不記，變了就記在今天
      if (Math.abs(value - L.v) < 0.005) return false;
      day = histToday_();
    }
    var same = Math.abs(value - L.v) < 0.005;
    if (mode && typeof mode === "object") {
      var gap = (new Date(day + "T00:00:00+08:00") - new Date(L.d + "T00:00:00+08:00")) / 86400000;
      if (Math.abs(value - L.v) / (L.v || 1) < (mode.pct || 0.01) && gap < (mode.days || 30)) return false;
    } else if (same) return false;
    if (L.d === day && L.r >= 2 && L.r <= sh.getLastRow()) {
      var cur = sh.getRange(L.r, 1, 1, 2).getDisplayValues()[0];
      if (cur[0] === day && cur[1] === key) { sh.getRange(L.r, 3).setValue(value); last[key] = { d: day, v: value, r: L.r }; return true; }
    }
  }
  sh.appendRow([day, key, value]);
  sh.getRange(sh.getLastRow(), 1).setNumberFormat("@").setValue(day); // 日期存成文字，不會被試算表改格式
  last[key] = { d: day, v: value, r: sh.getLastRow() };
  return true;
}
function histSave_(last) { PROPS_().setProperty("HIST_LAST", JSON.stringify(last)); }

// 打開 App／每小時算畫面時：把房子、汽機車現在的估值記下來（有變才寫）
function histSnapshot_(d) {
  if (!d) return;
  var lock = LOCK_();
  if (!lock.tryLock(1500)) return; // 別的動作正在寫：這次跳過，下次再記
  try {
    var ss = SS_(), last = histLast_(), n = 0;
    var reL = (d.realEstate && d.realEstate.list) || [];
    if (reL.length) {
      var raw = {};
      try { reAll_(ss).forEach(function (p) { raw[p.id] = p; }); } catch (e) { Logger.log(e); }
      reL.forEach(function (x) {
        if (x.sold || !(x.value > 0)) return;
        var key = "R:" + x.id, p = raw[x.id] || {};
        // 第一次看到這間：先補一個「買的時候」的點，線才看得出從買到現在
        if (!last[key] && p.buyDate && /^\d{4}-\d{2}-\d{2}$/.test(p.buyDate) && reNum_(p.price) > 0 && p.buyDate < histToday_()) {
          if (histPut_(ss, last, key, reNum_(p.price), p.buyDate, "change")) n++;
        }
        var day = x.isVeh ? histToday_() : (p.value && /^\d{4}-\d{2}-\d{2}$/.test(p.value.date || "") ? p.value.date : histToday_());
        if (day > histToday_()) day = histToday_();
        if (histPut_(ss, last, key, x.value, day, x.isVeh ? { pct: 0.01, days: 30 } : "change")) n++;
        // 房子：每次「重新估價」的結果另外記一條（就算沒有按「採用」也看得到自動估價怎麼變）
        var A = p.auto;
        if (!x.isVeh && A && A.ok && /^\d{4}-\d{2}-\d{2}$/.test(A.date || "")) {
          var aAmt = 0; try { aAmt = Math.round(reAdjAmt_(A, A.adj || 0) / 10000) * 10000; } catch (ae) { aAmt = reNum_(A.amount); }
          if (aAmt > 0 && histPut_(ss, last, "RA:" + x.id, aAmt, A.date > histToday_() ? histToday_() : A.date, "change")) n++;
        }
      });
    }
    if (n) histSave_(last);
  } catch (e) { Logger.log("價格走勢紀錄失敗：" + e); }
  finally { lock.releaseLock(); }
}
// 金價：每小時更新時順便記，一天一筆
function histGold_(ss, price) {
  try { var last = histLast_(); if (histPut_(ss, last, "GOLD", price, histToday_(), "daily")) histSave_(last); } catch (e) { Logger.log("金價走勢紀錄失敗：" + e); }
}

// 讀某一個項目的全部紀錄：[[日期, 數值], ...]（舊到新）
function histSeries_(ss, key) {
  var sh = histSheet_(ss, false);
  if (!sh || sh.getLastRow() < 2) return [];
  var m = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues().forEach(function (r) {
    if (r[1] !== key) return;
    var v = Number(String(r[2]).replace(/,/g, ""));
    if (/^\d{4}-\d{2}-\d{2}$/.test(r[0]) && v > 0) m[r[0]] = v; // 同一天有兩筆：留後面那筆
  });
  return Object.keys(m).sort().map(function (k) { return [k, m[k]]; });
}

// 股票、外幣：GOOGLEFINANCE 每天收盤價（最多 3 年），存 6 小時快取
function histGf_(sym) {
  var ck = "gf:" + sym, uc = CacheService.getUserCache();
  try { var c = uc.get(ck); if (c) return JSON.parse(c); } catch (ce) {}
  var ss = SS_(), out = [];
  var sh = ss.getSheetByName("走勢暫存");
  if (!sh) { sh = ss.insertSheet("走勢暫存"); try { sh.hideSheet(); } catch (h) {} }
  var lock = LOCK_();
  lock.waitLock(20000); // 共用一張暫存表：同時有兩個人／兩支程式在抓要排隊
  try {
    for (var attempt = 0; attempt < 2 && !out.length; attempt++) {
      sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), 2).clearContent();
      sh.getRange(1, 1).setFormula('=IFERROR(GOOGLEFINANCE("' + String(sym).replace(/"/g, "") + '","close",TODAY()-1100,TODAY()),"")');
      SpreadsheetApp.flush();
      Utilities.sleep(1500 + attempt * 2500);
      var lr = sh.getLastRow();
      if (lr >= 2) out = sh.getRange(2, 1, lr - 1, 2).getValues()
        .filter(function (r) { return r[0] instanceof Date && Number(r[1]) > 0; })
        .map(function (r) { return [Utilities.formatDate(r[0], WA_TZ_, "yyyy-MM-dd"), Math.round(Number(r[1]) * 10000) / 10000]; });
    }
    sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).clearContent();
  } finally { lock.releaseLock(); }
  if (out.length) { try { uc.put(ck, JSON.stringify(out), 6 * 3600); } catch (pe) { Logger.log(pe); } }
  return out;
}

// App 點進一筆資產時呼叫。p: { kind: "stock"|"fx"|"key", code?, cur?, key? }
WA_READ_ONLY_.waPriceHist = 1;
function waPriceHist(p) {
  p = p || {};
  var ss = SS_(), kind = String(p.kind || "");
  if (kind === "stock") {
    var code = String(p.code || "").trim();
    if (!/^[A-Z]+:[A-Z0-9.]+$/i.test(code)) throw new Error("代號不對");
    var pts = histGf_(code), src = "每天收盤價（GOOGLEFINANCE）";
    if (pts.length < 2) { // 抓不到（例如剛上市）：改用 App 記的每日收盤價
      try {
        var m = {};
        loadCloseLog_().forEach(function (r) { if (String(r[1]).trim() === code && Number(r[2]) > 0) m[normDate_(r[0])] = Number(r[2]); });
        var lg = Object.keys(m).sort().map(function (k) { return [k, m[k]]; });
        if (lg.length > pts.length) { pts = lg; src = "App 記的每日收盤價"; }
      } catch (le) { Logger.log(le); }
    }
    // 買賣的時間點，畫在線上
    var marks = [];
    try {
      var tl = ss.getSheetByName("交易紀錄");
      if (tl && tl.getLastRow() >= 2) tl.getRange(2, 1, tl.getLastRow() - 1, 9).getValues().forEach(function (r) {
        var t = String(r[8]).trim();
        if (String(r[1]).trim() !== code || (t !== "買進" && t !== "賣出") || !(r[0] instanceof Date)) return;
        marks.push({ d: Utilities.formatDate(r[0], WA_TZ_, "yyyy-MM-dd"), t: t === "買進" ? "買" : "賣", price: waNum_(r[3]), shares: Math.abs(waNum_(r[2])) });
      });
    } catch (te) { Logger.log(te); }
    return { pts: pts, src: src, marks: marks.slice(-60) };
  }
  if (kind === "fx") {
    var cur = String(p.cur || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) throw new Error("幣別不對");
    return { pts: histGf_("CURRENCY:" + cur + "TWD"), src: "每天匯率（GOOGLEFINANCE）", marks: [] };
  }
  var key = String(p.key || "");
  if (!/^(R:|GOLD$)/.test(key)) throw new Error("不支援這個項目");
  if (key === "GOLD") return { pts: histSeries_(ss, key), src: "金價（每天一筆）", marks: [] };
  var rec = histSeries_(ss, key), x = null;
  try { x = reGet_(ss, key.slice(2)); } catch (ge) {}
  if (x && reVehicle_(x)) {
    var dv = histVehDerive_(x, rec);
    return { pts: dv.pts, src: dv.derived ? "以前的點照折舊推算（每個月一點），之後更新里程、行情就記實際的" : "估值變動 1% 以上記一筆", marks: [] };
  }
  return { pts: rec, pts2: histSeries_(ss, "RA:" + key.slice(2)), src: "實線＝估值（改了就記一筆）；綠色虛線＝每次重新估價的自動估價", marks: [] };
}

// 汽機車以前的估值：從買的那天（沒填就從出廠）每個月推算一點，照現在的折舊方式算，最後一點對齊現在的估值
// 推算時里程照「開到那時候大概跑多少」縮小；不用你看到的行情（那是今天的）
function histVehDerive_(p, rec) {
  var V = p.vehicle || {};
  if (!(V.year > 1900)) return { pts: rec, derived: false };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var born = V.year + "-" + pad(Math.min(12, Math.max(1, V.month || 6))) + "-15";
  var start = /^\d{4}-\d{2}-\d{2}$/.test(p.buyDate || "") && p.buyDate > born ? p.buyDate : born, today = histToday_();
  if (start >= today) return { pts: rec, derived: false };
  var bornT = new Date(born).getTime(), kmT = V.kmDate ? new Date(V.kmDate).getTime() : 0;
  var at = function (day) {
    var q = JSON.parse(JSON.stringify(p)), W = q.vehicle; delete W.quote;
    if (reNum_(V.km) > 0 && kmT > bornT) { var f = Math.min(1, Math.max(0, (new Date(day).getTime() - bornT) / (kmT - bornT))); W.km = Math.round(reNum_(V.km) * f); W.kmDate = day; }
    var r = reVehVal_(q, day); return r && r.ok ? r.amount : 0;
  };
  var nowR = reVehVal_(p), base = at(today);
  if (!(nowR && nowR.ok && base > 0)) return { pts: rec, derived: false };
  var k = nowR.amount / base, pts = [], m = {};
  if (reNum_(p.price) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.buyDate || "")) m[p.buyDate] = reNum_(p.price); // 買的價格是真的，不用推算
  var y = Number(start.slice(0, 4)), mo = Number(start.slice(5, 7)), guard = 0;
  while (guard++ < 360) {
    mo++; if (mo > 12) { mo = 1; y++; }
    var d = y + "-" + pad(mo) + "-01";
    if (d >= today) break;
    if (!m[d]) { var v = at(d); if (v > 0) m[d] = Math.round(v * k / 1000) * 1000; }
  }
  var first = rec.length ? rec[0][0] : today;
  Object.keys(m).forEach(function (d) { if (d < first) pts.push([d, m[d]]); });
  pts.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  return { pts: pts.concat(rec), derived: pts.length > 0 };
}


// ==================== Data.gs ====================
// ============================================================
// 📡 資料更新：桌面程式（資產配置資料更新.py）每天把整理好的資料放到 app-install 網站，App 讀網站上的最新版
//   data/status.json：每一項資料什麼時候更新、有沒有問題（只有管理員會收到提醒）
//   rate/latest.json：評級用的回測資料（App 網頁直接讀，伺服器不用處理）
// 交易時間每小時：股價備援、金價、匯率也更新一次（原本一天一兩次）
// 下單時：用富果（有填 API 金鑰）或證交所的即時行情，重新算股數和手續費
// ============================================================
var DATA_PAGES_ = "https://casper1122-cyber.github.io/app-install/";

// 誰收資料提醒信：中央 App 的管理員；自己的副本：擁有者
function dataIsAdmin_() { if (typeof admOn_ === "function" && !admOn_()) return true; return dataIsAdmin0_(); }
function dataIsAdmin0_() { try { return typeof hubIsAdmin_ === "function" && typeof hubEmail_ === "function" && hubIsAdmin_(hubEmail_()); } catch (e) { return false; } }
function dataStatusFetch_() {
  var c = SCACHE_(), hit = c.get("data_status");
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var o = null;
  try {
    var res = UrlFetchApp.fetch(DATA_PAGES_ + "data/status.json?t=" + Date.now(), { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) o = JSON.parse(res.getContentText());
  } catch (e) { Logger.log("資料狀態讀不到：" + e); }
  if (o) try { c.put("data_status", JSON.stringify(o), 1800); } catch (e2) {}
  return o;
}
// 有問題的項目：失敗、要你按一下、該請 Claude 更新、桌面程式超過 2 天沒跑
function dataIssues_(s) {
  var out = [];
  if (!s) return [{ name: "桌面的資料更新程式", state: "fail", msg: "網站上還沒有狀態檔（還沒裝或還沒跑過）" }];
  var age = (Date.now() - new Date(String(s.at || "").replace(" ", "T") + "+08:00").getTime()) / 86400000;
  if (age > 2.5) out.push({ name: "桌面的資料更新程式", state: "fail", msg: Math.floor(age) + " 天沒有跑了（電腦可能沒開，或自動排程被關掉）" });
  (s.items || []).forEach(function (x) { if (/^(fail|need-user)$/.test(x.state)) out.push(x); });
  return out;
}
// 後台「📡 資料」用（Admin.gs 的 dataStatus）
function dataStatusPayload_() {
  var s = dataStatusFetch_(), p = PROPS_();
  var gold = null; try { var gs = goldSettingsSheet_(SS_()); gold = String(gs.getRange("B2").getDisplayValue()); } catch (e) {}
  var fxAt = 0; try { fxAt = fxReadProp_().ts || 0; } catch (e) {}
  return { remote: s, issues: dataIssues_(s), fugle: fugleKeySet_(),
    local: [
      { name: "股價備援（上櫃債券 ETF 收盤價）", last: p.getProperty("PRICE_BAK_AT") || "", every: "交易時間每小時" },
      { name: "金價（台銀）", last: gold || "", every: "交易時間每小時" },
      { name: "外幣匯率", last: fxAt ? Utilities.formatDate(new Date(fxAt), "Asia/Taipei", "yyyy-MM-dd HH:mm") : "", every: "每小時" },
      { name: "股價（Google 財經）", last: "即時（約延遲 20 分鐘）", every: "試算表自動" }
    ] };
}
// 每小時排程呼叫：交易時間（週一～五 9～14 點）多更新股價備援、金價、匯率；早上 9 點檢查一次資料狀態（只寄給管理員）
function dataHourly_(h) {
  var wd = Number(Utilities.formatDate(new Date(), "Asia/Taipei", "u"));
  if (wd <= 5 && h >= 9 && h <= 14) {
    try { priceBackupRefresh_(true); } catch (e) { Logger.log("股價備援：" + e); }
    try { if (SS_().getSheetByName(GOLD_SHEET_)) updateGoldPrice(); } catch (e2) { Logger.log("金價：" + e2); }
    try { updateFxRates(); } catch (e3) { Logger.log("匯率：" + e3); }
  }
  if (h === 9) { try { dataDailyCheck_(); } catch (e4) { Logger.log("資料狀態檢查：" + e4); } }
}
function dataDailyCheck_() {
  if (!dataIsAdmin_()) return;
  var up = PropertiesService.getUserProperties(), today = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  if (up.getProperty("DATA_CHECK_AT") === today) return;
  up.setProperty("DATA_CHECK_AT", today);
  var iss = dataIssues_(dataStatusFetch_());
  if (!iss.length) return;
  var body = "下面這幾項資料需要處理：\n\n" + iss.map(function (x) { return "・" + x.name + "：" + (x.msg || x.state); }).join("\n") +
    "\n\n怎麼處理：\n・寫「要在網頁上按一下」的：按桌面的「資產配置資料更新」，照畫面做。\n・寫「失敗」的：按桌面的「資產配置資料更新」→ 選 3「打包給 Claude」，把桌面上的 zip 傳給 Claude。\n・寫「請 Claude…」的：直接跟 Claude 說要更新哪一項。\n\n（這封信只寄給管理員，一天最多一封。）";
  try { SEND_MAIL_(NOTIFY_EMAIL_(), "資產配置：有 " + iss.length + " 項資料要處理", body); } catch (e) { Logger.log(e); }
}

// ---------- 即時行情（下單時用）----------
// 富果金鑰：管理員在「後台 → 📡 資料」設一次，存在共用的指令碼屬性，所有使用者共用；沒有金鑰就試證交所的即時行情
function fugleSave_(k) {
  k = String(k || "").trim();
  if (k && !/^[A-Za-z0-9_=+\/-]{20,200}$/.test(k)) throw new Error("金鑰格式看起來不對");
  var sp = PropertiesService.getScriptProperties();
  if (k) sp.setProperty("FUGLE_KEY", k); else sp.deleteProperty("FUGLE_KEY");
  return { fugle: !!k };
}
WA_READ_ONLY_.waQuote = 1;
function waQuote(p) {
  var code = String(p && p.code || "").toUpperCase().replace(/^(TPE|TPEX|TW|TWO):/, "").trim();
  if (!/^[0-9A-Z]{4,6}$/.test(code)) throw new Error("代號不對");
  var c = SCACHE_(), hit = c.get("q_" + code);
  if (hit) return JSON.parse(hit);
  var key = fugleKey_(), q = null, why = "";
  if (key) {
    try {
      var r = UrlFetchApp.fetch("https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/" + code, { muteHttpExceptions: true, headers: { "X-API-KEY": key } });
      if (r.getResponseCode() === 200) {
        var j = JSON.parse(r.getContentText()), px = Number(j.lastPrice || j.closePrice || 0);
        if (px > 0) q = { code: code, price: px, time: j.lastUpdated ? Utilities.formatDate(new Date(Number(j.lastUpdated) / 1000), "Asia/Taipei", "HH:mm:ss") : "", src: "富果" };
      } else why = "富果 " + r.getResponseCode();
    } catch (e) { why = "富果：" + e; }
  }
  if (!q) {
    try {
      var lc = code.toLowerCase(), r2 = UrlFetchApp.fetch("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch=tse_" + lc + ".tw%7Cotc_" + lc + ".tw", { muteHttpExceptions: true });
      if (r2.getResponseCode() === 200) {
        var arr = (JSON.parse(r2.getContentText()).msgArray || []).filter(function (x) { return x && x.c; })[0];
        if (arr) {
          var z = Number(arr.z), bid = Number(String(arr.b || "").split("_")[0]), ask = Number(String(arr.a || "").split("_")[0]);
          var px2 = z > 0 ? z : bid > 0 && ask > 0 ? (bid + ask) / 2 : Number(arr.y) || 0;
          if (px2 > 0) q = { code: code, price: Math.round(px2 * 100) / 100, time: String(arr.t || ""), src: z > 0 ? "證交所" : "證交所（買賣價中間）" };
        }
      } else why += (why ? "；" : "") + "證交所 " + r2.getResponseCode();
    } catch (e2) { why += (why ? "；" : "") + "證交所：" + e2; }
  }
  if (!q) throw new Error("抓不到即時價（" + (why || "沒有資料") + "），先用試算表的價格");
  try { c.put("q_" + code, JSON.stringify(q), 20); } catch (e3) {}
  return q;
}
function fugleKey_() { return PropertiesService.getScriptProperties().getProperty("FUGLE_KEY") || PropertiesService.getUserProperties().getProperty("FUGLE_KEY") || ""; }
function fugleKeySet_() { return !!fugleKey_(); }

// ---------- 評級紀錄：每月存一次每一項資產的評級（看得出變好還是變差）----------
// 存在使用者自己的屬性：RATE_H_2026-10 ＝ {鍵: [評級, 風險, 名稱]}，留 60 個月
function rateHistYm_() { return Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM"); }
function rateHistInfo_() {
  var p = PROPS_(), ym = rateHistYm_(), keys = p.getKeys().filter(function (k) { return k.indexOf("RATE_H_") === 0; }).sort();
  var prevK = keys.filter(function (k) { return k.slice(7) < ym; }).pop(), prev = null;
  if (prevK) try { prev = JSON.parse(p.getProperty(prevK)); } catch (e) {}
  return { cur: keys.indexOf("RATE_H_" + ym) >= 0, ym: ym, prevYm: prevK ? prevK.slice(7) : "", prev: prev || {} };
}
WA_READ_ONLY_.waRateSnap = 1;
function waRateSnap(p) {
  var items = p && p.items && typeof p.items === "object" ? p.items : null;
  if (!items) throw new Error("沒有資料");
  var out = {};
  Object.keys(items).slice(0, 80).forEach(function (k) {
    var v = items[k]; if (!Array.isArray(v)) return;
    var g = String(v[0] || ""); if (!/^(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB|B|CCC)$/.test(g)) return;
    out[String(k).slice(0, 40)] = [g, Math.max(1, Math.min(5, Number(v[1]) || 3)), String(v[2] || "").slice(0, 20)];
  });
  var s = JSON.stringify(out); if (s.length > 8500) throw new Error("太多了");
  var pr = PROPS_(), ym = rateHistYm_();
  if (pr.getProperty("RATE_H_" + ym)) return { ok: true, already: true };
  pr.setProperty("RATE_H_" + ym, s);
  var keys = pr.getKeys().filter(function (k) { return k.indexOf("RATE_H_") === 0; }).sort();
  keys.slice(0, Math.max(0, keys.length - 60)).forEach(function (k) { pr.deleteProperty(k); });
  return { ok: true };
}


// ---------- 大跌保護（10 個月均線）：每天跑一次，資料換月份時檢查；有開的人，持有的股票 ETF 跌破或漲回 10 個月平均價就寄信 ----------
// 只通知，不改目標、不下單；App 首頁會顯示幫你填好的單
function trendDaily_() {
  var o = {}; try { o = JSON.parse(PROPS_().getProperty(WA_PREFS_) || "{}"); } catch (e) {}
  if (!o.reco || !o.reco.trend) return;
  var res = UrlFetchApp.fetch(DATA_PAGES_ + "rate/latest.json?t=" + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return;
  var R = JSON.parse(res.getContentText()), P = PROPS_(), st = {}; try { st = JSON.parse(P.getProperty("TREND_STATE") || "{}"); } catch (e) {}
  if (st._ym === R.last) return;   // 這個月的資料已經看過
  var sh = SS_().getSheetByName("工作表1"), L = LAY(), rows = sh.getRange(2, 1, L.n, 2).getValues(), off = [], back = [];
  rows.forEach(function (r) {
    var c = String(r[0]).trim().replace(/^TPE:/, ""), a = R.a && R.a[c];
    if (!c || !a || a.c !== "股" || a.ok === false || !a.r || a.r.length < 12) return;
    var v = [1]; a.r.forEach(function (x) { v.push(v[v.length - 1] * (1 + x / 10000)); });
    var n = v.length, ma = 0; for (var i = n - 10; i < n; i++) ma += v[i]; ma /= 10;
    var now = v[n - 1] < ma ? "off" : "on", nm = (WA_NAMES_[c] || a.n || "");
    if (now === "off" && st[c] !== "off" && waNum_(r[1]) > 0) off.push(c + " " + nm + "（比 10 個月平均低 " + Math.round((1 - v[n - 1] / ma) * 1000) / 10 + "%）");
    if (now === "on" && st[c] === "off") back.push(c + " " + nm);
    st[c] = now;
  });
  st._ym = R.last; P.setProperty("TREND_STATE", JSON.stringify(st));
  if (!off.length && !back.length) return;
  var body = (off.length ? "跌破過去 10 個月平均價：\n" + off.map(function (x) { return "・" + x; }).join("\n") + "\n\n照你開的大跌保護，建議先換成短期債券（00719B）。打開 App，首頁有幫你填好的單（賣幾股、買幾股）。\n\n" : "") +
    (back.length ? "漲回 10 個月平均價以上：\n" + back.map(function (x) { return "・" + x; }).join("\n") + "\n\n可以換回來了，App 的買進建議會照你的配置算。\n\n" : "") +
    "資料到 " + R.last + "。App 不會自動下單。這是減少大跌損失的方法，不保證每次都對。";
  try { SEND_MAIL_(NOTIFY_EMAIL_(), "大跌保護：" + (off.length ? off.length + " 檔跌破 10 個月平均價" : "可以換回來了"), body); } catch (e) { Logger.log(e); }
}


// ==================== HubAuth.gs ====================
// ============================================================
// 中央 App：Google 權限沒有全部允許時的引導（2026.10.50b）
// 第一次打開 App，Google 會先問權限；那個畫面可以「取消勾選」某幾項，
// 有人沒勾「全選」就按繼續，之後建立試算表、排程、寄信都會失敗，只看到一行英文錯誤。
// 這裡：打開 App 時先檢查權限，沒給齊就顯示一步一步的圖解，按一個按鈕重新允許。
// 只放在核心裡（中央.gs 不用換，裡面你填的 Email、範本 ID 不會被蓋掉）
// ============================================================

// 回傳 "" 代表權限都有；不然回傳重新授權的網址（拿不到網址時回傳 "need"）
function hubAuthUrl_() {
  try {
    var ai = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    if (ai.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) return String(ai.getAuthorizationUrl() || "") || "need";
  } catch (e) { Logger.log("hubAuthUrl_：" + e); }
  return "";
}

// Google 自己丟出來的「沒權限」錯誤（不含我們自己寫的中文提示）
function hubIsPermErr_(e) {
  var m = String(e && e.message || e || "");
  return /沒有存取所要求文件的權限|do not have permission|PERMISSION_DENIED|Authorization is required|需要授權|insufficient.*scope|access_denied/i.test(m);
}

// 歡迎頁按「建立／接上」：先看權限，不夠就回傳 needAuth，讓網頁顯示圖解
function hubStart(kind, url) {
  var a = hubAuthUrl_();
  if (a) return { needAuth: a === "need" ? "" : a };
  var up = PropertiesService.getUserProperties();
  try {
    if (kind === "link") hubLinkSheet(url);
    else if (up.getProperty(HUB_SHEET_PROP_)) hubAfterAttach_(false); // 上次複製好了但後面失敗：補做設定就好，不要再複製一份
    else {
      var how = "整份複製";
      try { hubCreateSheet(); }
      catch (ce) {
        // 整份複製被 Google 擋（少數帳號會這樣）：改成「開一份新的空白試算表，再把範本的每一頁搬過去」
        if (!hubIsPermErr_(ce) || hubAuthUrl_() || up.getProperty(HUB_SHEET_PROP_)) throw ce;
        try { admErr_("建立資料試算表：整份複製被擋，改用逐頁搬", String(ce.message || ce), hubDriveInfo_()); } catch (le) {}
        how = "逐頁搬";
        try { hubCreateSheetAlt_(); }
        catch (ae) {
          try { admErr_("建立資料試算表：逐頁搬也失敗", String(ae.message || ae), String(ae.stack || "")); } catch (le) {}
          if (PropertiesService.getUserProperties().getProperty(HUB_SHEET_PROP_)) throw ae;
          throw ce; // 交給下面：權限都有還是被擋 → 顯示「已通知管理員」
        }
      }
      hubDefaultPreset_();
      admVisit_(hubEmail_(), "✅ 建立試算表成功", "用" + how);
    }
    if (kind === "link") admVisit_(hubEmail_(), "✅ 接上原本的試算表");
    up.deleteProperty("HUB_SETUP_PENDING");
    return { ok: true };
  } catch (e) {
    if (up.getProperty(HUB_SHEET_PROP_)) up.setProperty("HUB_SETUP_PENDING", "1");
    if (hubIsPermErr_(e)) {
      var b = hubAuthUrl_();
      if (b) return { needAuth: b === "need" ? "" : b, err: String(e.message || e) };
      // 權限其實都給了，還是被擋：不是權限的問題，記到後台「錯誤」讓管理員看，不要叫使用者白走一趟
      var di = hubDriveInfo_();
      try { admErr_("建立資料試算表（權限都有了還是被擋）", String(e.message || e), String(e.stack || "") + "\n" + di); } catch (le) {}
      admVisit_(hubEmail_(), "❌ 建立試算表失敗", di);
      var full = hubDriveFull_();
      if (full) return { fail: "你的 Google 儲存空間滿了（" + full + "），Google 不讓你新增任何檔案，所以建立不了。\n\n" +
        "請刪掉一些不要的東西再按一次「建立」：\n① Google 相簿裡的照片、影片\n② Gmail 裡有大附件的舊信\n③ 雲端硬碟裡的大檔案（刪完要到「垃圾桶」清空才算）\n\n" +
        "也可以請管理員幫你建一份，再用下面「我已經有在用的資產配置試算表」接上。\n你現在登入的帳號：" + hubEmail_(), full: true, err: String(e.message || e) };
      return { fail: "Google 擋住了建立試算表（不是你按錯）。已經自動通知管理員，他會幫你處理。\n你現在登入的帳號：" + hubEmail_(), err: String(e.message || e) };
    }
    throw e;
  }
}

// 備用建立法：不用 Drive 的「整份複製」，改成新開一份試算表、把範本每一頁 copyTo 過去，公式重新填一次（避免跨頁參照變 #REF!）
function hubCreateSheetAlt_() {
  var up = PropertiesService.getUserProperties();
  if (up.getProperty(HUB_SHEET_PROP_)) return "already";
  var tpl = SpreadsheetApp.openById(HUB_TEMPLATE_ID_);
  var ss = SpreadsheetApp.create("我的資產配置");
  try { ss.setSpreadsheetLocale(tpl.getSpreadsheetLocale()); ss.setSpreadsheetTimeZone(tpl.getSpreadsheetTimeZone()); } catch (e) {}
  var blank = ss.getSheets()[0];
  blank.setName("__暫時__" + Date.now());
  var src = tpl.getSheets(), made = [];
  for (var i = 0; i < src.length; i++) {
    var c = src[i].copyTo(ss);
    c.setName(src[i].getName());
    made.push([src[i], c]);
  }
  ss.deleteSheet(blank);
  for (var j = 0; j < made.length; j++) {
    var a = made[j][0], b = made[j][1];
    try {
      ss.setActiveSheet(b); ss.moveActiveSheet(j + 1);
      var r = a.getDataRange(), f = r.getFormulas(), has = false;
      for (var y = 0; y < f.length && !has; y++) for (var x = 0; x < f[y].length; x++) if (f[y][x]) { has = true; break; }
      if (has) {
        for (var y2 = 0; y2 < f.length; y2++) for (var x2 = 0; x2 < f[y2].length; x2++) if (f[y2][x2]) b.getRange(y2 + 1, x2 + 1).setFormula(f[y2][x2]);
      }
      if (a.isSheetHidden()) b.hideSheet();
    } catch (e) { Logger.log("搬頁 " + a.getName() + "：" + e); }
  }
  up.setProperty(HUB_SHEET_PROP_, ss.getId());
  hubAfterAttach_(false);
  return "ok";
}

// 雲端空間 {u 已用, l 上限}（位元組）；查不到回傳 null
function hubDriveQuota_() {
  try { var q = Drive.About.get({ fields: "storageQuota" }).storageQuota; return { u: Number(q.usage) || 0, l: Number(q.limit) || 0 }; } catch (e) { return null; }
}
// 歡迎頁的自檢清單：已受邀、權限、雲端空間；空間滿了就先不給按「建立」
function hubCheckHtml_(email) {
  var q = hubDriveQuota_(), gb = function (n) { return (n / 1073741824).toFixed(1) + "GB"; };
  var full = q && q.l > 0 && q.u >= q.l * 0.995, low = q && q.l > 0 && !full && q.l - q.u < 100 * 1048576;
  var li = function (ok, t, sub) { return '<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;font-size:15px;line-height:1.5"><span>' + (ok === true ? "✅" : ok === "warn" ? "⚠️" : ok === false ? "❌" : "➖") + "</span><span>" + t + (sub ? '<br><small style="color:#8a958e">' + sub + "</small>" : "") + "</span></div>"; };
  var h = '<div style="background:#fafbfa;border-radius:12px;padding:8px 12px;margin:10px 0">' +
    '<div style="font-weight:700;margin-bottom:2px">開始前的檢查</div>' +
    li(true, "已經受邀", String(email || "").replace(/[<>&"]/g, "")) + li(true, "Google 權限都有勾") +
    (q ? li(full ? false : low ? "warn" : true, full ? "Google 空間<b>滿了</b>，建立不了" : low ? "Google 空間快滿了" : "Google 空間夠用", "已用 " + gb(q.u) + (q.l > 0 ? " / " + gb(q.l) : "（無上限）")) : li(null, "Google 空間查不到，先試試看")) + "</div>";
  if (full) h += '<div style="background:#fdecea;color:#8a1c1c;border-radius:12px;padding:10px 12px;font-size:15px;line-height:1.7">空間滿了，選一個方法：<br>' +
    '① <b>清空間</b>：刪掉 Google 相簿裡的影片、照片，或 Gmail 有大附件的舊信（雲端硬碟刪完要清垃圾桶）→ 再重新打開 App<br>' +
    '② <b>換一個 Gmail</b>：按最下面「換一個 Google 帳號登入」（新的 Gmail 要先請管理員邀請）<br>' +
    '③ <b>請管理員幫你建一份</b>，他傳網址給你，點下面「我已經有在用的資產配置試算表」貼上</div>';
  return { html: h, full: !!full };
}

// 儲存空間用完了嗎？用完回傳「已用 x / y」文字，沒滿或查不到回傳 ""
function hubDriveFull_() {
  try {
    var q = Drive.About.get({ fields: "storageQuota" }).storageQuota, u = Number(q.usage), l = Number(q.limit);
    if (!(l > 0) || u < l * 0.995) return "";
    return "已用 " + (u / 1073741824).toFixed(1) + "GB / " + (l / 1073741824).toFixed(0) + "GB";
  } catch (e) { return ""; }
}

// 錯誤報告附上雲端硬碟空間，方便判斷是不是空間滿了
function hubDriveInfo_() {
  try {
    var q = Drive.About.get({ fields: "storageQuota" }).storageQuota;
    var gb = function (n) { return n ? (Number(n) / 1073741824).toFixed(1) + "GB" : "無上限"; };
    return "雲端空間：已用 " + gb(q.usage) + " / " + gb(q.limit);
  } catch (e) { return "雲端空間：查不到（" + e + "）"; }
}

// 打開 App 時：上次建立到一半（權限不夠），現在權限有了就把剩下的設定補完
function hubFinishPending_() {
  var up = PropertiesService.getUserProperties();
  if (!up.getProperty("HUB_SETUP_PENDING")) return;
  try { hubAfterAttach_(false); up.deleteProperty("HUB_SETUP_PENDING"); } catch (e) { Logger.log("補完設定失敗：" + e); }
}

var HUB_CSS2_ = "body{font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;background:#eef2ee;margin:0;padding:16px;color:#17241d}" +
  ".card{background:#fff;border-radius:18px;padding:20px;max-width:460px;margin:20px auto;box-shadow:0 4px 14px rgba(0,0,0,.06)}" +
  "h2{margin:0 0 10px}p{line-height:1.6;color:#4b5a51}button{width:100%;padding:14px;border:0;border-radius:12px;font-size:16px;font-weight:700;margin-top:10px;cursor:pointer}" +
  ".pri{background:#1f5a3f;color:#fff}.sec{background:#e3efe7;color:#1f5a3f}input{width:100%;box-sizing:border-box;padding:12px;border:1.5px solid #e2e8e3;border-radius:10px;font-size:15px;margin-top:8px}" +
  ".msg{margin-top:12px;font-size:14px;color:#b83227;min-height:18px}.em{font-weight:700;color:#17241d;word-break:break-all}" +
  ".open{display:block;text-align:center;margin-top:12px;padding:14px;border-radius:12px;background:#1f5a3f;color:#fff;font-weight:700;font-size:16px;text-decoration:none}" +
  // 一步一步的引導（跟安裝頁同樣的樣子）
  ".dots{display:flex;gap:6px;justify-content:center;margin-bottom:12px}.dots i{width:8px;height:8px;border-radius:50%;background:#d6dcd8}.dots i.on{background:#1f5a3f;width:22px;border-radius:6px}" +
  "#auT{margin:0 0 6px;font-size:22px;line-height:1.35;text-align:center}#auS{font-size:17px;line-height:1.6;text-align:center;color:#333;margin:0 0 14px}#auS b{color:#0a6b3d}" +
  "#auM{position:relative;background:#f2f2f7;border-radius:16px;padding:14px;margin:0 0 14px;min-height:120px;font-size:13px;color:#333}" +
  ".gw{background:#fff;border-radius:12px;padding:12px}.gw .g{color:#777;font-size:12px}" +
  ".hl{font-weight:700;background:#fff7c2;border-radius:8px;box-shadow:0 0 0 3px #ffcc00;padding:2px 6px}" +
  ".arrow{position:absolute;font-size:40px;line-height:1;animation:bb 1s ease-in-out infinite;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));pointer-events:none}" +
  "@keyframes bb{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}" +
  ".lk{color:#1a73e8}.gb{display:inline-block;background:#1a73e8;color:#fff;border-radius:16px;padding:5px 14px}" +
  ".nav{display:flex;gap:8px}.nav button,.nav a{flex:1;margin:0;padding:14px 10px;border:0;border-radius:14px;font-size:17px;font-weight:700;text-align:center;text-decoration:none;display:block}" +
  ".nav .p{background:#1f5a3f;color:#fff}.nav .s{background:#eef1ef;color:#333;flex:0 0 32%}" +
  ".tip{font-size:13px;color:#6b5300;background:#fff7e0;border-radius:10px;padding:8px 10px;margin-top:10px;line-height:1.55}" +
  ".sm{display:block;margin:12px auto 0;background:none;border:0;color:#8a958e;font-size:14px;font-weight:400;width:auto;padding:4px}";

// 引導的網頁程式（歡迎頁、權限頁共用）：auStart(網址) 開始；網址空的＝改走「先取消舊權限再重來」
function hubAuthJs_(appUrl) {
  return "var AU={url:'',i:0,gone:false},APP_URL=" + JSON.stringify(appUrl) + ";" +
    "function auE(s){return String(s).replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/</g,'&lt;');}" +
    "function auSteps(){var u=AU.url;return [" +
    "{t:'等一下會跳到 Google',s:'Google 會問你 <b>3 個畫面</b>，有一個要特別注意。<br>先一頁一頁看怎麼按，大約 1 分鐘。',m:'<div class=\"gw\" style=\"text-align:center;font-size:15px;line-height:2\">① 選帳號<br>② 點「進階」→「前往」<br>③ <span class=\"hl\">勾「全選」</span>→「繼續」</div><div class=\"arrow\" style=\"right:10%;bottom:6px\">👈</div>'}," +
    "{t:'① 選你的 Google 帳號',s:'點<b>被邀請的那個帳號</b>。<br>（如果沒出現這個畫面，就直接看下一步）',m:'<div class=\"gw\"><div style=\"text-align:center;font-size:15px\"><b>選擇帳戶</b><div class=\"g\">以繼續使用「資產配置 App」</div></div><div class=\"hl\" style=\"display:flex;gap:10px;align-items:center;margin-top:10px;padding:8px\"><span style=\"width:30px;height:30px;border-radius:50%;background:#7b61ff;color:#fff;display:flex;align-items:center;justify-content:center\">你</span><span>你的名字<br><small class=\"g\">xxx@gmail.com</small></span></div></div><div class=\"arrow\" style=\"right:8%;top:74px\">👈</div>'}," +
    "{t:'② 點「進階」→「前往」',s:'看到 <b>「Google 尚未驗證這個應用程式」</b> 不用怕。<br>點左下角小字 <b>「進階」</b>，<br>再點最下面 <b>「前往 資產配置 App（不安全）」</b>。',m:'<div class=\"gw\"><b style=\"font-size:15px\">⚠️ Google 尚未驗證這個應用程式</b><div class=\"g\" style=\"margin:6px 0 10px\">這個應用程式要求存取你 Google 帳戶中的機密資訊…</div><div style=\"display:flex;justify-content:space-between;align-items:center\"><span class=\"hl lk\">進階</span><span class=\"gb\">返回安全頁面</span></div><div class=\"g\" style=\"margin-top:10px\">↓ 點完「進階」，下面會多一行</div><div style=\"margin-top:4px\"><span class=\"hl lk\" style=\"text-decoration:underline\">前往 資產配置 App（不安全）</span></div></div><div class=\"arrow\" style=\"left:30%;top:72px\">👈</div><div class=\"arrow\" style=\"right:4%;top:136px\">👈</div><div class=\"tip\">💡 寫「不安全」只是因為這個 App 是私人做的、沒送 Google 審查。你的資料只存在<b>你自己的</b> Google 雲端硬碟，做 App 的人看不到。</div>'}," +
    "{t:'③ 勾「全選」→「繼續」',s:'<b>最重要的一步！</b><br>勾最上面的 <b>「全選」</b>，確認<b>每一項都打勾</b>，<br>再按右下角 <b>「繼續」</b>。',m:'<div class=\"gw\"><b>資產配置 App 想要存取你的 Google 帳戶</b><div class=\"hl\" style=\"margin:8px 0 6px;padding:6px 8px\">☑️ 全選</div><div style=\"padding:3px 8px\">☑️ 查看、編輯、建立及刪除 Google 試算表</div><div style=\"padding:3px 8px\">☑️ 以你的身分傳送電子郵件</div><div class=\"g\" style=\"padding:3px 8px\">☑️ …（每一項都要打勾）</div><div style=\"text-align:right;margin-top:8px\"><span class=\"gb hl\" style=\"background:#1a73e8;color:#fff\">繼續</span></div></div><div class=\"arrow\" style=\"right:8%;top:44px\">👈</div><div class=\"arrow\" style=\"right:24%;top:150px\">👉</div>'}," +
    "(u?{t:'④ 準備好了，出發！',s:'按下面的 <b>「重新允許權限」</b>：<br>App 會先把舊的權限清掉、自己重新打開，<br>Google 再問一次時，照剛剛的 ①②③ 按。<br>（<b>資料不會不見</b>）',m:'<div class=\"gw\" style=\"text-align:center;font-size:15px;line-height:2\">① 選帳號<br>② 點「進階」→「前往」<br>③ <span class=\"hl\">勾「全選」</span>→「繼續」</div>',go:APP_URL+'?reauth=1',top:1}" +
    ":{t:'④ 先取消舊的權限',s:'按下面的按鈕打開 Google 的「連結的應用程式」，<br>在<b>搜尋框打「資產配置」</b>→ 點它 →<br>拉到最下面按<b>「刪除所有連結」</b>。<br>（只是取消權限，<b>資料不會不見</b>）',m:'<div class=\"gw\"><b>連結的應用程式</b><div class=\"hl\" style=\"margin-top:8px;padding:8px;color:#555\">🔍 資產配置</div><div style=\"margin-top:8px;display:flex;justify-content:space-between\"><span>📄 資產配置 App</span><span class=\"g\">›</span></div><div style=\"margin-top:10px;text-align:center\"><span class=\"hl\" style=\"color:#d93025\">刪除所有連結</span></div></div><div class=\"arrow\" style=\"right:8%;top:48px\">👈</div><div class=\"tip\">列表很長（Canva、充電寶…），用搜尋最快。刪完回到 App 重新打開，Google 會再問一次，照 ①②③ 按。</div>',go:'https://myaccount.google.com/connections'})," +
    "{t:'⑤ 按好了嗎？',s:'如果 ①②③ 都按好了，<br>按 <b>「重新整理」</b> 就可以開始用了 🎉',m:'<div class=\"gw\" style=\"text-align:center;font-size:15px;line-height:1.9\">☑️ 選了帳號<br>☑️ 點了「進階」→「前往」<br>☑️ <b>勾了「全選」</b>→「繼續」</div>',fin:1}];}" +
    "function auShow(i){var S=auSteps();AU.i=Math.max(0,Math.min(i,S.length-1));var g=S[AU.i];" +
    "document.getElementById('auD').innerHTML=S.map(function(x,k){return '<i'+(k===AU.i?' class=\"on\"':'')+'></i>';}).join('');" +
    "document.getElementById('auT').textContent=g.t;document.getElementById('auS').innerHTML=g.s;document.getElementById('auM').innerHTML=g.m;" +
    "var prev=AU.i?'<button class=\"s\" onclick=\"auShow(AU.i-1)\">上一步</button>':'';" +
    "var nx=g.go?'<a class=\"p\" href=\"'+auE(g.go)+'\" target=\"'+(g.top?'_top':'_blank')+'\" rel=\"noopener\" onclick=\"auGo()\">'+(AU.url?'重新允許權限':'打開 Google 帳戶')+'</a>'" +
    ":g.fin?'<a class=\"p\" href=\"'+auE(APP_URL)+'\" target=\"_top\">我按好了，重新整理</a>':'<button class=\"p\" onclick=\"auShow(AU.i+1)\">下一步</button>';" +
    "document.getElementById('auN').innerHTML=prev+nx;" +
    "document.getElementById('auX').style.display=g.fin&&AU.url?'block':'none';window.scrollTo(0,0);}" +
    "function auGo(){AU.gone=true;setTimeout(function(){auShow(99);},1500);}" +
    "document.addEventListener('visibilitychange',function(){if(!document.hidden&&AU.gone)auShow(99);});" +
    "function auStart(u){AU.url=u||'';AU.gone=false;var m=document.getElementById('main');if(m)m.style.display='none';document.getElementById('auth').style.display='block';auShow(0);}";
}

// 「換一個 Google 帳號」：先登出（只登出這個瀏覽器／主畫面 App 裡的 Google），再回到 App 讓他用另一個帳號登入；原本帳號的資料不會動
function hubSwitchUrl_(appUrl) { return "https://accounts.google.com/Logout?continue=" + encodeURIComponent(appUrl || ""); }
function hubSwitchHtml_(appUrl, email) {
  var msg = "要換成另一個 Google 帳號嗎？\n\n" + (email ? "現在的帳號（" + email + "）" : "現在的帳號") + "會先登出，資料不會刪掉，之後換回來就看得到。\n接著 Google 會請你登入：輸入要用的那個 Gmail 和密碼。\n\n（新的帳號要先被管理員邀請才能用）";
  return '<p style="text-align:center;margin-top:8px"><a href="' + hubSwitchUrl_(appUrl) + '" target="_top" onclick="return confirm(' + JSON.stringify(msg).replace(/"/g, "&quot;") + ')" style="color:#1f5a3f;font-weight:600;font-size:15px">👤 換一個 Google 帳號登入</a></p>' +
    '<p style="text-align:center;font-size:12px;color:#8a958e;margin-top:2px">登出後如果停在 Google 的頁面，把 App 關掉重新打開就好</p>';
}

function hubAuthBox_() {
  return '<div id="auth" style="display:none"><h2 style="text-align:center;font-size:17px;color:#b05a00;margin:0 0 12px">🔑 還差一步：允許 Google 權限</h2><div class="dots" id="auD"></div><h3 id="auT"></h3><p id="auS"></p><div id="auM"></div><div class="nav" id="auN"></div>' +
    '<button class="sm" id="auX" onclick="auStart(\'\')">按了還是一直回到這頁？換另一個方法</button></div>';
}

function hubPage2_(kind, email, opt) {
  opt = opt || {};
  var appUrl = ""; try { appUrl = ScriptApp.getService().getUrl(); } catch (e) {}
  var js = hubAuthJs_(appUrl), body;
  if (kind === "notInvited") {
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + HUB_CSS2_ + '</style><div class="card">' +
      "<h2>🔒 尚未受邀</h2><p>這個 App 是邀請制。請把下面這個 Email 告訴邀請你的人，他加進名單後重新整理這個頁面就能使用。</p>" +
      '<p class="em">' + String(email || "（沒有登入 Google 帳號）").replace(/[<>&"]/g, "") + "</p>" +
      "<p>如果你有好幾個 Google 帳號，請確認現在登入的是被邀請的那一個；不是的話按下面「換一個 Google 帳號登入」。</p>" +
      '<a class="open" href="' + appUrl + '" target="_top">已被加進名單，重新整理</a>' + hubSwitchHtml_(appUrl, email) + "</div>")
      .setTitle("資產配置").addMetaTag("viewport", "width=device-width, initial-scale=1");
  }
  if (kind === "reauth") {
    // 權限已經清掉：提醒一次要勾全選，自動重新打開 App（Google 會再問權限）
    var ru = JSON.stringify(appUrl);
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + HUB_CSS2_ + '</style><div class="card" style="text-align:center">' +
      '<h2>✅ 權限重設好了</h2><p style="font-size:17px">接下來 Google 會再問一次權限。<br>記得：<b>勾最上面的「全選」</b>，再按「繼續」。</p>' +
      '<div style="margin:12px auto;max-width:300px;text-align:left;font-size:15px;line-height:2;background:#fafbfa;border-radius:12px;padding:10px 16px">① 選你的帳號<br>② 點「進階」→「前往…（不安全）」<br>③ <span class="hl">勾「全選」</span>→「繼續」</div>' +
      '<a class="open" id="go" href="' + appUrl + '" target="_top">重新打開 App</a><p class="label" id="cd" style="margin-top:10px;color:#8a958e">5 秒後自動打開…</p></div>' +
      '<script>var n=5,t=setInterval(function(){n--;document.getElementById("cd").textContent=n>0?n+" 秒後自動打開…":"如果沒有自己打開，請按上面的綠色按鈕";if(n<=0){clearInterval(t);try{window.top.location.href=' + ru + ';}catch(x){}}},1000);</script>')
      .setTitle("資產配置").addMetaTag("viewport", "width=device-width, initial-scale=1");
  }
  if (kind === "auth") {
    var u = "reauth"; // 一律先請 Google 直接跳出授權畫面（拿不到授權網址也一樣可以）；不行再用「換另一個方法」
    body = hubAuthBox_() +
      '<p style="text-align:center;margin-top:18px;font-size:13px"><a href="' + appUrl + '?skipauth=1" target="_top" style="color:#8a958e">先略過，直接打開 App</a></p>' + hubSwitchHtml_(appUrl, email) +
      "<script>" + js + "auStart(" + JSON.stringify(u) + ");</script>";
  } else {
    var ck = hubCheckHtml_(email);
    body = '<div id="main"><h2>👋 歡迎</h2><p>第一次使用，要先準備一份存資料的試算表。它會放在<b>你自己的</b> Google 雲端硬碟，只有你看得到。</p>' + ck.html +
      (ck.full ? '<button class="pri" id="bc" disabled style="opacity:.45">建立新的資產配置（空間滿了，先處理）</button>' : '<button class="pri" id="bc" onclick="go(\'create\')">建立新的資產配置</button>') +
      '<details style="margin-top:16px"><summary style="cursor:pointer;color:#1f5a3f;font-weight:600">我已經有在用的資產配置試算表</summary>' +
      '<p>貼上試算表的網址，就會直接接上原本的資料。</p><input id="url" placeholder="https://docs.google.com/spreadsheets/d/…">' +
      '<button class="sec" onclick="go(\'link\')">接上我的試算表</button></details>' +
      '<div class="msg" id="msg" style="white-space:pre-line"></div>' +
      '<p style="margin-top:14px;font-size:13px;color:#8a958e;text-align:center;word-break:break-all">目前登入：' + String(email || "（讀不到）").replace(/[<>&"]/g, "") + '</p>' + hubSwitchHtml_(appUrl, email) + '</div>' + hubAuthBox_() +
      "<script>" + js + "var busy=false;" +
      "function go(k){if(busy)return;busy=true;var m=document.getElementById('msg');m.style.color='#4b5a51';m.textContent='處理中，大約 10～30 秒，請不要關掉…';" +
      "google.script.run.withSuccessHandler(function(r){busy=false;if(r&&r.fail){m.style.color='#b83227';m.textContent=r.fail;return;}if(r&&r.needAuth!==undefined){auStart(r.needAuth||'reauth');return;}m.style.color='#1f5a3f';m.innerHTML='✅ 完成！<a class=\"open\" href=\"'+APP_URL+'\" target=\"_top\">打開 App</a>';})" +
      ".withFailureHandler(function(e){busy=false;var t=String(e&&e.message||e);if(/沒有存取所要求文件的權限|do not have permission|PERMISSION_DENIED|Authorization is required|需要授權/i.test(t)){auStart('');return;}m.style.color='#b83227';m.textContent=t;})" +
      ".hubStart(k,k==='link'?document.getElementById('url').value:'');}</script>";
  }
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + HUB_CSS2_ + '</style><div class="card">' + body + "</div>")
    .setTitle("資產配置").addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// 新建立的試算表：預設用「保守」組合（範本裡是管理員自己用的比較積極的那組），之後到 ⚙️ 投資標的與目標比例 可以換
function hubDefaultPreset_() {
  try { ENV_ = null; CFG_ = null; LAY_ = null; waApplyPreset_("保守"); } catch (e) { Logger.log("套用保守組合失敗：" + e); }
}


// ==================== Admin.gs ====================
// ============================================================
// 後台用：中央 App 這一邊要記的東西（全部存在「指令碼屬性」，大家共用、只有管理員看得到）
//   ADM_U_<代碼>  每個使用者的狀態：最後打開時間、版本、自動排程最後一次跑的結果
//   ADM_E_<時間>  錯誤紀錄（App 跳出「程式出錯了」、排程失敗），只留最近 60 筆
//   ADM_F_<時間>  使用者意見（可以回覆，使用者在 App 裡看得到回覆），只留最近 100 筆
//   ADM_ANN       公告／維護模式
// 後台（另一個 Apps Script 專案）用管理員自己的身分呼叫這裡的 doPost 來讀寫（會檢查是不是管理員）
// 只有中央 App 模式才會動作；副本模式什麼都不做
// ============================================================
function admOn_() { return typeof hubDoGet_ === "function"; }
function admProps_() { return PropertiesService.getScriptProperties(); }
function admId_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s || ""));
  return b.slice(0, 6).map(function (x) { return ((x + 256) % 256).toString(16); }).map(function (h) { return h.length < 2 ? "0" + h : h; }).join("");
}
function admNow_() { return Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm"); }
function admEmail_() { try { return String(hubEmail_() || "").toLowerCase(); } catch (e) { return ""; } }
function admCut_(s, n) { s = String(s === undefined || s === null ? "" : s); return s.length > n ? s.slice(0, n) + "…" : s; }

// 改共用屬性時上鎖（很多人同時寫才不會互相蓋掉）
function admLocked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return null;
  try { return fn(); } finally { lock.releaseLock(); }
}
// 同一種開頭的 key 只留最新 keep 筆
function admTrim_(prefix, keep) {
  var p = admProps_();
  var keys = p.getKeys().filter(function (k) { return k.indexOf(prefix) === 0; }).sort();
  keys.slice(0, Math.max(0, keys.length - keep)).forEach(function (k) { p.deleteProperty(k); });
}
function admList_(prefix) {
  var all = admProps_().getProperties(), out = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(prefix) !== 0) return;
    try { var o = JSON.parse(all[k]); o._k = k; out.push(o); } catch (e) {}
  });
  return out;
}

// ---------- 使用者狀態 ----------
// kind: "open"（打開 App）或排程名稱；ok／err 只有排程才有
function admBeat_(kind, ok, err) {
  if (!admOn_()) return;
  try {
    var email = admEmail_();
    if (!email) return;
    if (kind === "open") { // 打開 App：10 分鐘內只記一次，不拖慢
      var c = CacheService.getUserCache();
      if (c.get("adm_beat")) return;
      c.put("adm_beat", "1", 600);
    }
    admLocked_(function () {
      var key = "ADM_U_" + admId_(email), p = admProps_(), o = {};
      try { o = JSON.parse(p.getProperty(key) || "{}") || {}; } catch (e) { o = {}; }
      o.email = email; o.ver = LIB_VERSION_; o.trig = o.trig || {};
      if (kind === "open") o.last = admNow_();
      else o.trig[kind] = { at: admNow_(), ok: !!ok, err: ok ? "" : admCut_(err, 160) };
      p.setProperty(key, JSON.stringify(o));
    });
  } catch (e) { Logger.log("記錄使用者狀態失敗：" + e); }
}
// ---------- 誰打開過 App（包含還沒受邀的）：後台「使用者」看得到用哪個 Gmail、卡在哪一步 ----------
// 同一個人同一步 10 分鐘內只記一次；只留最近 80 筆
function admVisit_(email, step, note) {
  if (!admOn_()) return;
  try {
    email = String(email || "").toLowerCase() || "（讀不到 Email）";
    var c = CacheService.getUserCache(), ck = "adm_v_" + admId_(email + "|" + step);
    if (!note && c.get(ck)) return;
    c.put(ck, "1", 600);
    admLocked_(function () {
      var p = admProps_(), a = [];
      try { a = JSON.parse(p.getProperty("ADM_VISITS") || "[]") || []; } catch (e) { a = []; }
      var t = admNow_(), hit = null;
      for (var i = 0; i < a.length; i++) if (a[i].e === email && a[i].s === step) { hit = a.splice(i, 1)[0]; break; }
      hit = hit || { e: email, s: step, n: 0, first: t };
      hit.t = t; hit.n = (hit.n || 0) + 1; hit.v = LIB_VERSION_;
      if (note) hit.note = admCut_(note, 160);
      a.unshift(hit);
      if (a.length > 80) a.length = 80;
      p.setProperty("ADM_VISITS", JSON.stringify(a));
    });
  } catch (e) { Logger.log("記錄打開紀錄失敗：" + e); }
}

// 排程外面包一層：記下成功／失敗；失敗也記一筆錯誤，然後照樣丟出去
function admTrigRun_(name, fn) {
  try { var r = fn(); admBeat_(name, true); return r; }
  catch (e) { admBeat_(name, false, e && e.message ? e.message : e); admErr_("排程 " + name, e && e.message ? e.message : e, e && e.stack); throw e; }
}

// ---------- 錯誤紀錄 ----------
function admErr_(where, msg, stack) {
  if (!admOn_()) return;
  try {
    admLocked_(function () {
      var o = { t: admNow_(), who: admEmail_(), ver: LIB_VERSION_, where: admCut_(where, 120), msg: admCut_(msg, 400), stack: admCut_(stack, 500) };
      admProps_().setProperty("ADM_E_" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), JSON.stringify(o));
      admTrim_("ADM_E_", 120);
    });
  } catch (e) { Logger.log("記錄錯誤失敗：" + e); }
}
// App 裡跳出「程式出錯了」時順便送過來（每人每小時最多 20 筆，避免洗版）
WA_READ_ONLY_.waLogError = 1;
function waLogError(p) {
  var c = CacheService.getUserCache(), n = Number(c.get("adm_errn") || 0);
  if (n >= 20) return { ok: false };
  c.put("adm_errn", String(n + 1), 3600);
  admErr_("App：" + admCut_(p && p.where, 100), p && p.msg, (p && p.ua ? "裝置：" + admCut_(p.ua, 150) + "\n" : "") + "畫面版本：" + admCut_(p && p.ver, 20));
  return { ok: true };
}

// ---------- 意見回饋 ----------
WA_READ_ONLY_.waFeedback = 1; // 只寫意見，不用重算畫面
function waFeedback(p) {
  if (!admOn_()) throw new Error("這個版本沒有意見回饋");
  var text = String(p && p.text || "").trim();
  if (!text) throw new Error("請輸入內容");
  if (text.length > 1000) throw new Error("最多 1000 字");
  var c = CacheService.getUserCache(), n = Number(c.get("adm_fbn") || 0);
  if (n >= 10) throw new Error("今天送太多了，明天再送");
  c.put("adm_fbn", String(n + 1), 86400);
  var id = "ADM_F_" + Date.now().toString(36);
  var r = admLocked_(function () {
    admProps_().setProperty(id, JSON.stringify({ t: admNow_(), who: admEmail_(), ver: LIB_VERSION_, text: text, read: false, reply: "", replyAt: "" }));
    admTrim_("ADM_F_", 100);
    return true;
  });
  if (!r) throw new Error("現在比較忙，等一下再送");
  return { message: "已送出，謝謝！", detail: "管理員回覆後，在這裡就看得到", list: waMyFeedback().list };
}
WA_READ_ONLY_.waMyFeedback = 1;
function waMyFeedback() {
  if (!admOn_()) return { list: [] };
  var me = admEmail_();
  var list = admList_("ADM_F_").filter(function (f) { return f.who === me; })
    .sort(function (a, b) { return a._k < b._k ? 1 : -1; })
    .map(function (f) { return { t: f.t, text: f.text, reply: f.reply || "", replyAt: f.replyAt || "" }; });
  return { list: list };
}

// ---------- 公告／維護模式 ----------
function admAnn_() {
  if (!admOn_()) return null;
  try { var o = JSON.parse(admProps_().getProperty("ADM_ANN") || "null"); return o && (o.text || o.maint) ? o : null; } catch (e) { return null; }
}
// 維護模式時，管理員以外的人打開 App 會看到這一頁
function admMaintPage_(ann) {
  var msg = String(ann && ann.text || "系統維護中，請稍後再打開").replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; });
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:system-ui,sans-serif;padding:48px 24px;text-align:center;color:#24453a">' +
    '<div style="font-size:48px">🛠️</div><h2>維護中</h2><p style="line-height:1.7">' + msg.replace(/\n/g, "<br>") + "</p><p style=\"color:#777;font-size:13px\">資料都在，不會不見。維護完成後重新打開就可以用。</p></div>")
    .setTitle("維護中").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- 後台呼叫的 API ----------
// 後台用管理員自己的 Google 身分呼叫（Authorization: Bearer ...），所以這裡看到的使用者就是管理員
function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    if (!admOn_()) return out({ ok: false, error: "這不是中央 App" });
    var email = admEmail_();
    var q = {};
    try { q = JSON.parse(e && e.postData && e.postData.contents || "{}") || {}; } catch (pe) { return out({ ok: false, error: "格式不對" }); }
    // 管理員本人，或是帶著「連線金鑰」的後台（後台建在別的帳號時用；金鑰只有能改這個專案的人才設得了）
    if (!hubIsAdmin_(email) && !admKeyOk_(q.key)) {
      return out({ ok: false, error: admProps_().getProperty("ADMIN_API_KEY") ? "連線金鑰不對（後台設定裡的金鑰要跟中央 App 指令碼屬性 ADMIN_API_KEY 一樣）" : "不是管理員（" + (email || "沒有登入") + "），而且中央 App 還沒設定連線金鑰 ADMIN_API_KEY" });
    }
    return out({ ok: true, data: admApi_(String(q.op || ""), q.arg || {}) });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
function admKeyOk_(key) {
  var want = String(admProps_().getProperty("ADMIN_API_KEY") || "").trim();
  key = String(key || "").trim();
  if (want.length < 32 || key.length !== want.length) return false;
  var d = 0;
  for (var i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ key.charCodeAt(i);
  return d === 0;
}
// 邀請名單（後台用：不經過 App 裡「只有管理員本人」的檢查，因為上面已經檢查過金鑰）
function admInviteSave_(a) {
  var email = String(a && a.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Email 格式不正確");
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var list = hubAllowList_().filter(function (x) { return String(x.email).toLowerCase() !== email; });
    if (!a.remove) list.push({ email: email, name: String(a.name || "").trim().slice(0, 20), added: Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd") });
    admProps_().setProperty(HUB_ALLOW_PROP_, JSON.stringify(list));
  } finally { lock.releaseLock(); }
  return { message: a.remove ? "已移除 " + email : "已邀請 " + email, list: hubAllowList_() };
}
function admApi_(op, a) {
  var p = admProps_();
  switch (op) {
    case "ping": return { ver: LIB_VERSION_, admin: String(HUB_ADMIN_).trim().toLowerCase(), caller: admEmail_(), now: admNow_() };
    case "visits": {
      var vs = []; try { vs = JSON.parse(p.getProperty("ADM_VISITS") || "[]") || []; } catch (e1) {}
      var al = {}; hubAllowList_().forEach(function (x) { al[String(x.email).toLowerCase()] = x.name || x.email; });
      var ad = String(HUB_ADMIN_).trim().toLowerCase();
      return { list: vs.map(function (v) { v.invited = !!al[v.e] || v.e === ad; v.name = al[v.e] || ""; return v; }) };
    }
    case "invites": return { list: hubAllowList_(), admin: String(HUB_ADMIN_).trim().toLowerCase() };
    case "inviteSave": return admInviteSave_(a);
    case "users": {
      var users = admList_("ADM_U_"), allow = hubAllowList_();
      var byEmail = {};
      users.forEach(function (u) { byEmail[u.email] = u; });
      var rows = allow.map(function (x) { var u = byEmail[String(x.email).toLowerCase()] || {}; return { email: x.email, name: x.name || "", added: x.added || "", last: u.last || "", ver: u.ver || "", trig: u.trig || {} }; });
      var adm = String(HUB_ADMIN_).trim().toLowerCase();
      if (!allow.some(function (x) { return String(x.email).toLowerCase() === adm; })) { var u0 = byEmail[adm] || {}; rows.unshift({ email: adm, name: "管理員", added: "", last: u0.last || "", ver: u0.ver || "", trig: u0.trig || {} }); }
      return { list: rows, ver: LIB_VERSION_ };
    }
    case "errors": { var dn = {}; try { dn = JSON.parse(p.getProperty("ADM_EDONE") || "{}"); } catch (e0) {} return { list: admList_("ADM_E_").sort(function (x, y) { return x._k < y._k ? 1 : -1; }), done: dn }; }
    // 一類錯誤標成「已處理」（sig＝後台算的分類代號；之後又出現同一類會自己跑回「未處理」）
    case "errDone": admLocked_(function () { var dn = {}; try { dn = JSON.parse(p.getProperty("ADM_EDONE") || "{}"); } catch (e0) {} var sig = String(a.sig || "").slice(0, 300); if (a.undo) delete dn[sig]; else dn[sig] = { at: Date.now(), note: String(a.note || "").slice(0, 200) }; var ks = Object.keys(dn); if (ks.length > 150) ks.sort(function (x, y) { return dn[x].at - dn[y].at; }).slice(0, ks.length - 150).forEach(function (k) { delete dn[k]; }); p.setProperty("ADM_EDONE", JSON.stringify(dn)); }); return { ok: true };
    case "errClear": admLocked_(function () { p.getKeys().forEach(function (k) { if (k.indexOf("ADM_E_") === 0) p.deleteProperty(k); }); }); return { ok: true };
    case "feedback": return { list: admList_("ADM_F_").sort(function (x, y) { return x._k < y._k ? 1 : -1; }) };
    case "fbUpdate": {
      var k = String(a.k || "");
      if (k.indexOf("ADM_F_") !== 0) throw new Error("找不到這則意見");
      admLocked_(function () {
        var o = JSON.parse(p.getProperty(k) || "null");
        if (!o) throw new Error("找不到這則意見");
        if (a.del) { p.deleteProperty(k); return; }
        if (a.reply !== undefined) { o.reply = admCut_(String(a.reply).trim(), 1000); o.replyAt = o.reply ? admNow_() : ""; }
        if (a.read !== undefined) o.read = !!a.read;
        p.setProperty(k, JSON.stringify(o));
      });
      return { ok: true };
    }
    case "dataStatus": return dataStatusPayload_();
    case "fugleSet": return fugleSave_(a.key);
    case "annGet": return { ann: admAnn_() };
    case "annSet": {
      var ann = { text: admCut_(String(a.text || "").trim(), 500), level: a.level === "warn" ? "warn" : "info", maint: !!a.maint, at: admNow_() };
      if (!ann.text && !ann.maint) p.deleteProperty("ADM_ANN"); else p.setProperty("ADM_ANN", JSON.stringify(ann));
      return { ann: admAnn_() };
    }
  }
  throw new Error("不支援的動作：" + op);
}

// ---------- 隱私與使用聲明：第一次使用（或聲明更新後）要看過、勾同意 ----------
var DISCLAIMER_VER_ = "2026-10-15";
function disclaimerState_() {
  var seen = "";
  try { seen = String(PROPS_().getProperty("DISCLAIMER_OK") || ""); } catch (e) {}
  return { need: seen.split("|")[0] !== DISCLAIMER_VER_, ver: DISCLAIMER_VER_, hub: admOn_() };
}
WA_READ_ONLY_.waDisclaimerAccept = 1;
function waDisclaimerAccept(p) {
  PROPS_().setProperty("DISCLAIMER_OK", DISCLAIMER_VER_ + "|" + Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm"));
  return { ok: true };
}


// ==================== Changelog.gs ====================
// ============================================================
// 更新日誌：每次更新寫在最上面（新的在前）。v 要跟 LIB_VERSION_ 一樣。
// - 更新後第一次打開 App：跳出視窗告訴你這次（和你還沒看過的）更新了什麼
// - 設定 →「📋 更新日誌」：看全部
// ============================================================
var CHANGELOG_ = [
  { v: "2026.10.54n", date: "2026-10-26", items: [
    "房子的評級：地段改用實際資料（全國有門牌座標的同一戶賣兩次 19,732 組）——比同區貴的地方之後每年漲得比同區少一點（每貴 10% 少約 0.2%），比同區便宜很多（2 成以上）的地方單一一間起伏大約 1.5 倍；時段外驗證誤差變小",
    "住宅臨大路、臨巷子：實際資料看不出大路漲得比較多（巷弄反而略多），漲幅影響拿掉，只留「好不好賣」",
    "住宅的土地持分：同區、同房型、同屋齡比，土地多的看不出漲得比較多，漲幅影響拿掉；土地不到一般一半的，起伏算大 1.47 倍。「一般的土地持分」改用實際成交中位數（照房型和屋齡）。店面、辦公室、工廠、土地沒有這種資料，照原本"
  ] },
  { v: "2026.10.54m", date: "2026-10-26", items: [
    "房子的評級：屋齡、坪數、房型對之後漲幅的影響改用實際資料（同一戶賣兩次 4.7 萬組）——新房子（10 年內）每年比同區少漲約 0.5%，20～40 年的老房子多漲約 0.3%；小坪數多漲、大坪數少漲；屋齡 25 年以上單一一間起伏大 2 成",
    "用前面年份算、拿後面年份測：誤差變小（4 個切點都變小）；以前用的「屋齡折舊曲線」是估計的，跟實際資料方向不同，已經換掉",
    "管理好不好：實際資料看不出對漲幅有影響，改成影響起伏（有管理的單一一間起伏小約 1 成）",
    "不記得買價、用年份往回推的時候，也改用同樣的屋齡資料"
  ] },
  { v: "2026.10.54l", date: "2026-10-26", items: [
    "臺中也有「以你家為中心」的新大樓行情（572 個建案驗證：只看行政區誤差 11.4%，這個方法 9.2%）",
    "臺北、新北的房子會自動算離最近的捷運出口多遠（臺北捷運 390 個出入口座標），不用自己填；評級裡捷運的影響改用實際資料：離捷運近的房價比同區貴，但之後漲幅少一點、起伏小 15%"
  ] },
  { v: "2026.10.54k", date: "2026-10-26", items: [
    "租金報酬率改用實價登錄 2024 年起的租屋和成交，算到行政區＋房型＋屋齡（933 組），不再是臺北 1.7%、其他 2%；驗證誤差從 20% 降到 5%。評級、退休模擬都用這個",
    "臺南、高雄也有「以你家為中心」的新大樓行情（都更估算用）"
  ] },
  { v: "2026.10.54j", date: "2026-10-25", items: [
    "房子估價的加減分有 10 項改用實價登錄的成交備註算（跟同區、同年、同類型、同坪數、同屋齡的一般成交比）：凶宅 −35%、毛胚要重做 −18%、漏水壁癌 −6%、含裝潢 +8%、含家具 +6%、含家電 +5%、頂樓加蓋 +8%、增建 +5%、夾層 +7%、都更危老範圍 +33%；每一項都寫了筆數和範圍"
  ] },
  { v: "2026.10.54i", date: "2026-10-25", items: [
    "房子評級的參數改用實價登錄算：單一一間的起伏照房型分開（重複交易 5.8 萬組）；店面、辦公室、工廠、土地的整體起伏和單間起伏分開算（各類指數＋重複交易）；急著賣要讓價幾成改用「急買急賣」的實際成交（住宅約 2 成、土地約 3 成半，原本只抓 5～15%）；賣房成本照仲介費上限 4%＋代書規費",
    "桌面程式開始抓實價登錄的租賃資料（之後租金報酬率算到行政區）、臺北捷運出入口座標（之後算離捷運多遠對房價的影響）"
  ] },
  { v: "2026.10.54h", date: "2026-10-25", items: [
    "單看一檔台股個股的評級改用實際結果：2007～2016 年每年買進、抱 10 年（扣通膨、含後來下市的，下市用最後成交價），照出事機率分 10 組的平均損失；不再用「單一股票最高 BB」的固定上限。最穩的一組平均只賠 2.5%，最危險的一組賠 26%"
  ] },
  { v: "2026.10.54g", date: "2026-10-25", items: [
    "個股股價資料自動抓錯：全部 1,977 檔逐月檢查，Yahoo 偶爾有「一個月漲幾十倍又跌回來」的錯誤資料（48 檔），改用證交所的收盤價或當那幾個月沒資料；評級頁會寫出來",
    "最近一年常常沒有成交的股票（可能停止交易、全額交割）會特別提醒：想賣不一定賣得掉"
  ] },
  { v: "2026.10.54f", date: "2026-10-25", items: [
    "單看一檔個股時，不再出現「加黃金、加債券、留現金」這種整個配置的建議（那是給整體配置的），改成說明這是只買這一檔的評級、要怎麼看它放進配置後的效果"
  ] },
  { v: "2026.10.54e", date: "2026-10-25", items: [
    "最慘跌接近歸零時寫到小數點（例如 −99.6%），不再四捨五入成 −100%",
    "已經登記的房子、車、保險、收藏品也可以補標「本來就有」：設定 → 期初資料補登 → 期初資料不算資產成長，App 會找出登記那天淨資產多出來的金額，勾起來就不算成長",
    "設定裡的紅點點過就不會再出現（改存在伺服器，換手機、清快取也一樣）"
  ] },
  { v: "2026.10.54d", date: "2026-10-25", items: [
    "單看一檔台股個股時，回測只用它自己有資料的期間（之前 2000 年以前用大盤估，會讓最慘跌、回本時間失真；例如台積電最久回本從 9.6 年改成實際的 7.2 年）"
  ] },
  { v: "2026.10.54c", date: "2026-10-25", items: [
    "台股個股評級改用這檔自己 2000 年起每個月的真實股價（含配息），不再用大盤 ×1.3 估",
    "個股多了「🔎 3 年內比大盤多跌一半的機率」：用證交所 2005 年起的資料（含已經下市的 192 檔）找出真的有關的條件——公司自己的波動、過去一年大跌或大漲、股價淨值比太高、虧損、沒發股利、殖利率；分 6 段時間驗證準確度 0.815。比一般股票高的會多扣評級，低的少扣；配置評級也一起算",
    "桌面程式每個月自動更新股價和這些條件"
  ] },
  { v: "2026.10.54b", date: "2026-10-25", items: [
    "都更估算（臺北、新北）改成以你家為中心：離你家最近的 5 個新建案（越近越重）和你家附近舊房子的行情各算一半；實價登錄的地址對到市政府門牌坐標（99% 對得到）。整個建案拿掉驗證：只看行政區誤差 9.3%，這個方法 7.0%",
    "更正：53x 說路段能把誤差降到 6.4%，那時同一棟的不同門牌被當成不同建案，算得太好看；重新驗證後路段溢價只用在有變準的縣市（全國 10.2% → 9.5%），新大樓單價也改用 2016 年起換算成現在價格的成交"
  ] },
  { v: "2026.10.54a", date: "2026-10-25", items: [
    "退休模擬把房子、保險、收藏品也算進去：房子用各自行政區的房價漲跌、出租的收租金、退休後還沒繳完的房貸照扣；錢不夠時先賣出租的房子、再解約保險；自住的房子另外算「最後賣掉改租房子」的機率"
  ] },
  { v: "2026.10.53z", date: "2026-10-25", items: [
    "退休規劃多了「🎲 錢用到 95 歲的機率」：用過去真實的漲跌（美國 1926 年起、你的 ETF 自己的歷史，都扣通膨）模擬 2,000 種未來，取比較保守的那套；也會算退休時一般和運氣差大約有多少、要到 90% 每月要多存或少花多少"
  ] },
  { v: "2026.10.53y", date: "2026-10-25", items: [
    "回測扣房貸利息改用每一季當時的房貸利率（五大行庫指數型房貸利率＋加碼，用央行新承做購屋貸款利率校正），不再固定 2.2%；桌面程式每天跟著更新"
  ] },
  { v: "2026.10.53x", date: "2026-10-25", items: [
    "都更估算細到路段：同一條路（段）有新建案就用那條路的新大樓單價；沒有的話用行政區單價再乘上這條路比同區貴或便宜多少（用 1 萬個建案驗證，誤差從 8.8% 降到 6.4%）",
    "沒填分回坪數時，照權利變換「照更新前價值分」的方式，依你住幾樓調整：無電梯公寓一樓約多分 25%、頂樓約少分 10%（實價登錄算的）；頂樓加蓋只拿拆除補償，不算坪數",
    "可以填分回在新大樓幾樓、總共幾層，高樓層單價會高一點"
  ] },
  { v: "2026.10.53w", date: "2026-10-25", items: [
    "都更、危老：選了階段之後可以填分回幾坪、幾個車位、預計哪年蓋好、要補多少錢；評級會算出完工後值多少（這區新大樓實價登錄每坪中位數＋車位價），再乘上這個階段最後真的蓋好的機率（臺北市都更處統計：有在談約 37%、核定後約 72%、在蓋了約 97%）和等待年數，得到現在的期望值",
    "還沒談好的都更，沒填分回坪數會照土地持分保守估"
  ] },
  { v: "2026.10.53v", date: "2026-10-25", items: [
    "店面、辦公室、工廠、土地的回測和「這區近 10 年」改用各自的指數（實價登錄 2012 年起：店面 6.8 萬筆、辦公 3 萬筆、工廠 1.8 萬筆、土地 18 萬筆）；縣市資料不夠穩的用全台同一類",
    "房子存檔時用 Google 地圖把地址轉成經緯度（之後天災風險自動查、離市中心多遠要用）"
  ] },
  { v: "2026.10.53u", date: "2026-10-25", items: [
    "還沒選種類的保單：每一張都有紅點和待辦「保單要重新登記種類」，點進去最上面選種類、填保證利率"
  ] },
  { v: "2026.10.53t", date: "2026-10-25", items: [
    "資產分布：收藏品照種類各自一塊（棒球卡、藝術品、名錶…），不再全部叫「另類資產」；太小的收藏類（不到 2%）併成「其他收藏」，主要類別一定分開列"
  ] },
  { v: "2026.10.53s", date: "2026-10-25", items: [
    "房子畫面整理：最上面是估值和淨值，下面一顆「📝 填資料（4 步）」；估價細節、房貸固定支出出租都收起來，要看再點開",
    "填資料 4 步：① 基本資料 ② 屋況和條件（先勾屋況裝潢景觀，再回答管理、違建、天災、稀缺）③ 房貸、固定支出、出租 ④ 格局圖；每一步旁邊打勾表示填過",
    "屋況那邊勾過的（頂樓加蓋、增建、海砂屋），條件那邊不會再問一次"
  ] },
  { v: "2026.10.53r", date: "2026-10-25", items: [
    "房子評級的「撐不撐得住」：除了銀行現金，每個月固定存下來的錢（記帳 2 個月以上）也算緩衝，最多算 2 年；有穩定收入的人不會因為帳戶現金少就被當成很可能急賣"
  ] },
  { v: "2026.10.53q", date: "2026-10-25", items: [
    "保單分 5 種：儲蓄還本、終身壽險、利率變動型年金、投資型、純保障；名稱有關鍵字會自動選，每種問不一樣的欄位",
    "評級只算保證的部分：用滿期金或保證（預定）利率；利變型用宣告利率當預期、多算往下調的風險；投資型照連結的標的扣掉費用",
    "沒填保證報酬的保單不再當成穩賺：先用近年常見的利率估、多算不確定，並在待辦提醒補資料",
    "可以抄保單的解約金表，算第幾年才拿回繳的保費；跟現在的定存利率比",
    "純保障型（醫療、意外、定期）不算資產，不用登記"
  ] },
  { v: "2026.10.53p", date: "2026-10-25", items: [
    "房貸對房子評級的影響重做：房貸每月都在還（照剩下期數和利率算 10 年後剩多少本金），還掉的本金算你另外投入的錢，不算房子賺的；之前把房貸當成 10 年都不變，有貸款就被評太差",
    "房子畫面同時寫「房子本身（不看房貸）」和「含你的房貸」兩個評級",
    "有記帳收入的話，看房貸月付占收入多少：超過一半比較可能被迫急賣，兩成以下比較安全"
  ] },
  { v: "2026.10.53o", date: "2026-10-25", items: [
    "修正（跟正式版 53e1 一樣）：手機把 App 放在背景太久再打開，輸入密碼出現「NetworkError：連線失敗 HTTP 0」。現在會自動再試一次；還是連不上就顯示「重新開啟 App」按鈕"
  ] },
  { v: "2026.10.53n", date: "2026-10-25", items: [
    "推薦配置：沒填過退休規劃的，第一題直接問出生年、幾歲退休（已經退休的按「已經退休了」）、每月生活費，不用再跳去別的畫面",
    "推薦配置：退休後先留 2 年的生活費（扣掉退休金）在定存，股市大跌時不用在低點賣；離退休 2 年內慢慢存（水桶法）",
    "推薦配置存檔改成一次送出，比較快",
    "我的配置：加起來不是 100% 時，有「🪄 自動調成 100%」按鈕；按試算時也會先問要不要自動調",
    "房子畫面：沒填買價的「每年增值」改顯示這區近 10 年每年漲多少；按鈕排整齊（改基本資料一整排、賣出和刪除一排）",
    "卡片報價小幫手 2.8：用測試網址（/dev）打開 App 也接得上（之前只認正式網址，所以一直顯示「有裝但還沒接上」）"
  ] },
  { v: "2026.10.53m", date: "2026-10-25", items: [
    "設定整理成 7 個資料夾：我的帳號、投資、帳戶和生活費、退休規劃、期初資料補登、通知、說明和工具；新功能有紅點，點過就消失",
    "舊帳號第一次打開會一個一個介紹這次更新了什麼（只跳一次，資料都沒動，不用重新設定）；之後可以在「說明和工具」再看",
    "期初資料不算資產成長：登記新的房子、車、保險、收藏品時會問「是本來就有的嗎」，本來就有的、和「一步一步設定」登記的，淨資產成長會扣掉",
    "測速移到管理員才看得到；拿掉「重新顯示新手設定」"
  ] },
  { v: "2026.10.53l", date: "2026-10-25", items: [
    "每一間房子的評級畫面加上「📈 這間房子的回測」：用它所在行政區的實價登錄指數，加上它自己的租金、房貸",
    "房價回測修正：拿掉「屋齡折價」。用同一戶賣兩次的 4.6 萬組成交、和 278 組同區同年代成交驗證，只用行政區指數最準（之前老公寓少算很多）",
    "自住的房子：房貸利息跟省下的房租大致抵銷，兩個都不算（之前只扣利息，有房貸的自住房被算太差）",
    "「10 年後購買力可能少多少」改成白話：用你自己的金額說明平均可能少掉多少購買力、數字多少算安全",
    "我的配置：把某一項調高，會從走勢跟它最像的先扣，加起來永遠 100%、現金至少 5%；調低的差額先放現金",
    "買了配置裡沒有的個股：跳窗問要不要放進配置（預設＝買完它占的比例，可以改），其他項目從最像的先扣"
  ] },
  { v: "2026.10.53k", date: "2026-10-25", items: [
    "全部資產回測的房價細到行政區和房型：用內政部實價登錄 2012 年起 124 萬筆住宅成交，自己算每個行政區、每種房型（大樓、華廈、公寓、透天）的季指數，2012 年以前接信義房價指數",
    "房子會一年一年變老：回測扣掉屋齡增加的折價（用同縣市實價登錄的屋齡係數）",
    "跟信義房價指數比對：各縣市長期走勢相關 0.96～0.99"
  ] },
  { v: "2026.10.53j", date: "2026-10-25", items: [
    "新功能「🧭 推薦配置」：回答 4 題（用你自己的錢問大跌時會怎麼做、5 年內要用的大錢、退休後要不要自動變保守、要不要大跌保護），照年紀算出推薦的配置，儲存後跳出重點數字",
    "年紀：離退休 25 年以上股票 90%，越接近越少，退休那年 55%，退休後 7～8 年降到 30%（目標日期基金的下滑路徑）；5 年內要用的錢和 6 個月生活費先放定存；退休的錢已經是需要的 1.5 倍以上，股票少 10%",
    "原本的 7 種建議配置也會照年紀把股票縮少",
    "退休後自動調：每月檢查，照年紀差 3% 以上才調目標比例（不會自動買賣）；沒開的會在首頁提醒",
    "大跌保護：股票 ETF 跌破過去 10 個月平均價，首頁顯示幫你填好的單，並寄信通知；只通知、不自動下單"
  ] },
  { v: "2026.10.53i", date: "2026-10-25", items: [
    "全部資產回測改成照現在的比例每一季重新平衡：每一項用自己的資料算漲跌——股票 ETF 黃金外幣照價格、現金照定存、車照它的折舊曲線、保險照保單保證報酬（美元保單加匯率）",
    "還沒有可靠漲跌資料的（收藏品等）會列出來，先當價格不動；還沒回本的「最久回本」會標「+」"
  ] },
  { v: "2026.10.53h", date: "2026-10-25", items: [
    "沒有買股票、ETF 的人也看得到「每年平均、扣通膨後每年、最慘跌、最久回本」：照你現在的資產比例，從 2001 年回測到現在",
    "房地產照所在縣市的信義房價季指數漲跌，加上租金扣掉成本；現金照台幣定存利率；有房貸的照現在的成數放大；金融資產照它自己的回測",
    "「全部資產」頁也加上這四個數字"
  ] },
  { v: "2026.10.53g", date: "2026-10-25", items: [
    "品質評級改用信用評等公司的方法：看「持有 10 年，扣掉通膨後購買力少掉的平均幅度」（預期損失），每一級對應一段固定的範圍",
    "金融配置：實際回測和美國 1926 年起的歷史各一半，加上最慘那 10 年的壓力測試",
    "房地產：長期每年實質增值約 1.3%（14 國百年研究）＋租金扣成本、信義房價指數的起伏、大跌情境、房貸放大、現金不夠被迫急賣、海砂屋違建這類突發事件，每一項只影響它真正影響的部分；自住省下的房租不算這間房子的報酬",
    "車子跟同價位、同車齡的一般車比（一般車＝BBB）；老歐系車最高 BBB、超過 12 年最高 BBB-、泡水最高 BB",
    "現金、黃金、外幣、保險、收藏品、全部資產綜合也都用同一個方法；評級頁多了「損失從哪裡來」和「改這些最有效」",
    "房子、車子的 6 個面向和細項改成「跟一般的比，拉高或拉低幾級」，一眼看出哪裡要調整",
    "「扣掉通膨」改成「扣通膨後每年」，避免看成通膨率"
  ] },
  { v: "2026.10.53f", date: "2026-10-25", items: [
    "不記得買價：改用信義房價指數（2001 年起，台北、新北、桃園、台中、台南、高雄、新竹）往回推當時的價格，再加回房子變舊的折舊；2001 年以前標粗估"
  ] },
  { v: "2026.10.53e", date: "2026-10-24", items: [
    "油錢改成照排氣量、車身、油電／柴油推估油耗；一年開幾公里只用你填的里程，沒填就用一般人的平均，畫面會寫清楚用哪一個",
    "房地產照 9 種類型用不同標準評：住宅自住、整層出租、分租套房、空屋、店面、商辦、工廠、土地、預售屋；各有自己的重點和專有細項（租金合不合行情、空租欠租、隔間合法、臨路人潮、大樓等級、合法登記、使用分區、有沒有路、建商、履約保證、交屋貸款、政策風險…），補資料的題目也跟著類型換",
    "🛡️ 保險獨立一張卡片；📦 另類資產按「＋ 新增」先選種類（球員卡、藝術品、名錶、名牌包、酒、錢幣郵票、珠寶、古董、公仔玩具、收藏車），自動帶出那一類要填的資料",
    "找不到的種類可以「新增分類」，先填基本資料，管理員會收到通知，之後做專用表格和自動查價",
    "自選股和其他個股合成同一張「📈 個股」卡片，只有一個「＋ 登記個股」"
  ] },
  { v: "2026.10.53d", date: "2026-10-24", items: [
    "股票、ETF 很少的人：持股頁一樣給評級，直接評全部資產怎麼分配，列出最拉低的 3 個問題",
    "房子、車子資料不夠時，「資產」分頁出現紅點和待辦：「有 N 項沒資料，補了評級會更準」，補過就消失；繳費季也列進待辦",
    "養車費用分開寫「每年實際要付（不含折舊）」和折舊；保養估價調低；補資料可以填每月油錢、每年保養",
    "從全部資產點進某一項，最上面有「← 回到全部資產」"
  ] },
  { v: "2026.10.53c", date: "2026-10-24", items: [
    "汽車、機車評級重做：價值、車況、花費、安全、風險、好不好賣 6 個面向，20 個細項（保值率、換車時機、里程、事故泡水、保養紀錄、保固、電池、每年養車成本、每公里成本跟叫車比、主動安全、維修風險、政策、車貸…）",
    "車子評級頁多一個「✏️ 補資料讓評級更準」：保養紀錄、幾手車、保固、安全配備、電池、停車費",
    "收藏型車款（超跑、經典車）會註明之後放到收藏品另外評"
  ] },
  { v: "2026.10.53b", date: "2026-10-24", items: [
    "房地產評級重做：位置、價格、房子本身、產權法規、財務、好不好賣 6 個面向，底下 26 個細項（地段、捷運、嫌惡設施、天災、稀缺性、耐震年代、公設比、管理、土地持分、都更、海砂屋、違建、租金、現金流、跟換成 ETF 比、賣掉的稅費、這區成交量…）",
    "自住和出租分開看：自住重視位置和房子本身，出租重視財務",
    "房子評級頁多一個「✏️ 補資料讓評級更準」：土地持分、捷運、都更進度、違建、天災、海砂檢測、修繕基金、稀缺性，全部選填",
    "不記得買價：多問「大約哪一年買的」，用房價走勢往回推當時的價格（標「推算」）",
    "🧾 繳費季：房屋稅（5 月）、地價稅（11 月）、汽機車牌照稅（4 月）、燃料費（7 月）、保險到期前 30 天，每次打開 App 都會跳表格，填好實際金額才停；填好的自動變成固定支出、到期自動記帳，明年照今年的金額估",
    "汽機車多一個「排氣量」欄位，用來算牌照稅、燃料費（政府的稅表）；電動車免牌照稅、燃料費"
  ] },
  { v: "2026.10.53a", date: "2026-10-24", items: [
    "沒填的資料（例如房子沒填買價、買入日期）不再當成 50 分拉低或拉高評級：只用有資料的項目評，沒資料的標「資料不夠」",
    "共有持分的房子只算你的那一份；預售屋還沒付的尾款算進負債",
    "自住的房子和車子是生活要用的：變現能力、集中度改成只看「可以動用的資產」（理財規劃的可投資資產）",
    "屋齡亂填（例如打了文字）不會再出現 NaN"
  ] },
  { v: "2026.10.52z", date: "2026-10-24", items: [
    "綜合評級修正：全部都是房地產也算集中（不只看最大的一間）；新增「每月現金流」（租金扣掉房貸和房子費用）",
    "緊急預備金至少要付得出房貸和房子的固定費用；不知道生活費時用現金占總資產粗估，不再顯示「還不能評」",
    "有一項很差（CCC）就不能靠其他項平均回來：家庭財務健康最高只到 BB；現金太少的現金評級最高也只到 BB",
    "金融資產太少（不到 10 萬）時不評配置，改看全部資產綜合評級"
  ] },
  { v: "2026.10.52y", date: "2026-10-24", items: [
    "評級旁邊都加上白話標籤（優秀／良好／普通／偏弱／差／很差），拿掉「投機等級・幾分」這種看不懂的寫法",
    "現金、每一件黃金、每一筆外幣都有自己的評級：緊急預備金夠不夠、每家銀行有沒有超過存款保險 300 萬、現金是不是放太多被通膨吃掉、金飾工錢、外幣用途",
    "全部資產綜合評級重做：一半看每一項資產本身，一半看家庭財務健康 7 項（變現能力、集中度、負債比、幣別、抗通膨、緊急預備金、退休進度）",
    "每月自動存一次評級紀錄，看得到上個月是什麼等級",
    "只有真的嚴重才在首頁提醒（評到 CCC、現金不夠 1 個月、存款超過保額 100 萬以上、單一個股超過 4 成、負債比超過 7 成），按「知道了」就不再出現"
  ] },
  { v: "2026.10.52x", date: "2026-10-24", items: [
    "「📡 資料狀態」和富果金鑰搬到後台（後台多一個「📡 資料」分頁），App 的設定選單和首頁都不再出現"
  ] },
  { v: "2026.10.52w", date: "2026-10-24", items: [
    "富果即時報價金鑰改成管理員設一次、所有人共用，不用每個人自己申請",
    "「📡 資料狀態」只有管理員看得到（一般使用者的設定選單更簡單）",
    "台灣 CPI、存款利率抓不到時直接用估計值，不再要你按；券商費率改成每年一月提醒一次，不算「要處理」"
  ] },
  { v: "2026.10.52v", date: "2026-10-24", items: [
    "評級用的資料會自動更新：電腦上的「資產配置資料更新」每天下午在背景抓最新的價格、匯率、利率、通膨，整理好放到網站，App 打開時自動讀最新的",
    "⚙️ 設定 →「📡 資料狀態」：每一項資料多久前更新、下次什麼時候、有沒有問題；有要處理的，首頁會提醒（只有管理員看得到），也會寄信",
    "交易時間（平日 9～14 點）每小時更新一次股價備援、金價、匯率",
    "下單時抓即時價：有填富果金鑰用富果（延遲幾秒），沒有就試證交所；「建議買 N 股」會用即時價重算"
  ] },
  { v: "2026.10.52u", date: "2026-10-24", items: [
    "美股帳戶可以選「複委託」或「海外券商」（Firstrade、IBKR、嘉信等），海外券商多了匯款手續費、一年匯幾次，也會提醒美國遺產稅",
    "手續費照你的實際買法算：每次買多少、一年買幾次、打算放幾年。碰到最低手續費會直接告訴你（例如每次 300 美元、低消 3 美元＝1%）",
    "台股手續費設定多了「你的買法」，填完馬上算每買一次實際付多少",
    "同類比較、美股小字、每一檔的分析，都改用你的實際成本，並把成本怎麼來的拆開寫"
  ] },
  { v: "2026.10.52t", date: "2026-10-24", items: [
    "評級最上面多了 4 個大數字：每年平均、扣掉通膨、最慘跌（哪一年）、最久回本；下面一行是 1972 年起長期歷史的同樣數字。跟著你實際持有的東西變動",
    "每一筆資產都可以按「📊 評級」看分析：股票、ETF 用回測；房子看保值、地段、房貸占比、租金報酬、買價；車看折舊；保險看解約金和滿期報酬；收藏品看成本和行情",
    "「📦 全部資產綜合評級」：把房地產、車、保險、收藏品和金融資產一起算，看每一項占多少、各自的評級",
    "評級都有標「僅供參考」"
  ] },
  { v: "2026.10.52s", date: "2026-10-24", items: [
    "建議配置改用同類裡長期報酬最好的：台股大盤用 006208（跟 0050 同指數、費用低），黃金改用黃金存摺（比 00635U 每年多約 3.6%）",
    "黃金存摺有自己的目標比例：資產頁的黃金會算「還要再買幾公克」，用銀行黃金存摺買（買賣價差約 1～1.3%、不用手續費）",
    "台股 ETF 下面會用小字寫「用美金在美股買同類的，每年差多少」；設定美股帳戶（複委託）後，用你自己的手續費和換匯算，美股比較划算就自動選美股",
    "手續費設定可以選證券商：自動帶入最低手續費、日退或月退；折數一律空白要自己跟營業員確認後填，按儲存會跳窗提醒，沒填不能存",
    "美股帳戶（複委託）設定：選券商帶入最低手續費，手續費率和換匯價差要自己填"
  ] },
  { v: "2026.10.52r", date: "2026-10-24", items: [
    "調整配置只剩一個地方：⚙️ 設定 →「📊 我的配置」。選建議配置或自己配、先試算看評級，按「儲存成我的配置」就好；欄位不夠會自動多加，不用再自己按",
    "原本的「投資標的與目標比例」變成「進階設定」（跟著年紀變保守、兩套組合、手動改代號才需要）",
    "上櫃的債券 ETF（例如 00697B、00679B）不用再到試算表按「允許存取」也有價格：App 每天會從證交所、櫃買中心抓收盤價當備援",
    "配置評級的現金改成算進所有個人帳戶（投資、生活、儲蓄），生意的帳戶不算",
    "用美元計算時，會說明為什麼數字跟台幣不一樣"
  ] },
  { v: "2026.10.52q", date: "2026-10-24", items: [
    "評級裡「扣掉通膨」的數字改用主計總處的正式 CPI（1981 年起每個月），不再用估計值"
  ] },
  { v: "2026.10.52p", date: "2026-10-24", items: [
    "評級用的回測資料更完整：美元匯率改用美國聯準會的正式資料（1983 年起），台幣定存利率改用中央銀行五大銀行的資料（2001 年起）；建議配置的回測從 2004 年往前推到 1997 年，包含亞洲金融風暴和 2000 年網路泡沫"
  ] },
  { v: "2026.10.52o", date: "2026-10-24", items: [
    "「🧪 自己配配看」改成先選大類（台股大盤、美股 S&P 500、中期美債、黃金…），再選同一類要買哪一檔；旁邊會寫跟同類比每年多賺或少賺幾 %（例如 006208 比 0050、美股複委託的 VOO 比 00646，已經扣掉手續費和換匯）",
    "可以選用台幣或美元計算",
    "現金一定要留：建議配置都至少 5% 現金，自己配的少於 5% 不能試算，儲存時少於 5% 會提醒",
    "個股等短線／價差型也可以放進去試算，會跳窗提醒「風險和報酬自負」，比例一樣算進配置、評級也會算進去",
    "風險太高（R5 或投機等級）的配置會跳窗警告，持股頁也會顯示紅色提醒",
    "評級報告和持股頁多了「配置明細」：依大類列出每一檔占幾 %（現金、個股都算）",
    "修正回測資料：0050 2014 年、0056 2009／2011／2012 年的配息資料錯誤"
  ] },
  { v: "2026.10.52n", date: "2026-10-24", items: [
    "持股頁最上面多了「我的配置評級」：品質評級（AAA～CCC，跟美國債券評級一樣）和風險等級（R1～R5），下面 8 個指標（報酬力、抗跌力、回本速度…）也各有評級",
    "右上角 ⓘ 可以看分析原因：重點說明、建議、每一項怎麼評的，還有等級說明（AAA 最高、BBB- 以上是投資等級）",
    "建議配置從 3 種變成 7 種（保本、保守、穩守、穩健、成長、積極、全攻），每一種都標好評級、風險和大約報酬；新增黃金 00635U、中期美債 00697B；欄位不夠會自動多加",
    "「🧪 自己配配看」：自己選 ETF、債券、黃金、現金和比例，先試算看回測和評級，跟 7 種建議配置比一比，滿意再套用；個股、槓桿、單一產業不能放進配置",
    "個股比例過高會提醒：單一個股超過 10%、個股合計超過 30%"
  ] },
  { v: "2026.10.52m", date: "2026-10-23", items: [
    "進貨可以選「先欠著，之後付」：不用選帳戶，記到「應付貨款」，可以算在哪一期（例如 10月貨款，自己取名）、填預計哪天付",
    "進貨一次可以選好幾樣商品（同一張單），數量、單價各自填；沒庫存的商品也能選",
    "應付貨款像信用卡帳單：依廠商、期別分組，勾好幾期一起付，付款時才選帳戶和日期；付款日到了會出現在「要處理的事」",
    "以前用一個帳戶（例如叫「未付」）記欠款的，可以一鍵轉成應付貨款，那個帳戶的錢會加回來"
  ] },
  { v: "2026.10.52l", date: "2026-10-22", items: [
    "歡迎頁多了「開始前的檢查」：已受邀、權限、Google 空間；空間滿了會先告訴你怎麼辦，不會按了建立才失敗",
    "下載網站的開場教學多一頁檢查清單（Gmail、密碼、空間、全選），4 項都打勾才去登入"
  ] },
  { v: "2026.10.52k", date: "2026-10-22", items: [
    "可以換 Google 帳號了：⚙️ 設定 →「👤 換一個 Google 帳號」；歡迎頁、權限圖解、「尚未受邀」頁也有。不用刪掉 App，原本帳號的資料也不會刪"
  ] },
  { v: "2026.10.52j", date: "2026-10-22", items: [
    "建立試算表時如果 Google 儲存空間已經滿了，會直接告訴使用者「空間滿了」和怎麼清，不再只說「被擋住」"
  ] },
  { v: "2026.10.52i", date: "2026-10-22", items: [
    "後台「使用者」多了「最近打開 App 的人」：用哪個 Gmail、卡在哪一步（沒受邀／權限沒勾全選／還沒建立／建立失敗／正常），沒受邀的可以直接按邀請",
    "歡迎頁下面會顯示「目前登入」的 Gmail，建立失敗時也會顯示"
  ] },
  { v: "2026.10.52h", date: "2026-10-22", items: [
    "修正：少數帳號「建立試算表」會被 Google 擋（你沒有存取所要求文件的權限），現在會自動改用另一種方法建立；錯誤報告也會附上對方的雲端硬碟空間"
  ] },
  { v: "2026.10.52g", date: "2026-10-22", items: [
    "修正：權限沒勾全選時，按「重新允許權限」會自動把舊的權限清掉、重新打開 App，Google 會像第一次一樣完整問一次（之前按了只會回到第一頁）；資料不會不見"
  ] },
  { v: "2026.10.52f", date: "2026-10-22", items: [
    "修正：權限沒勾全選時，按「打開 Google 授權」改成直接跳出 Google 的授權畫面，按完自動回到 App（之前有人會被帶到 Google 帳戶的連結清單，找不到要按哪裡）",
    "權限其實都給了、建立資料試算表還是被擋的：不再叫你去取消權限，改成自動通知管理員（後台「錯誤」看得到原因）",
    "備用方法（取消舊權限）的說明改成跟 Google 實際畫面一樣：用搜尋框打「資產配置」"
  ] },
  { v: "2026.10.52e", date: "2026-10-22", items: [
    "新裝的 App 第一次打開，會先一頁一頁看使用教學（App 能做什麼、怎麼記帳、卡住按 🆘、登入 Google 的 3 個畫面要按哪裡），看完按「開始登入」；之後打開就直接進 App",
    "App 最上面多一個「?」，或 ⚙️ 設定 →「📺 使用教學」，隨時可以再看一次"
  ] },
  { v: "2026.10.52d", date: "2026-10-22", items: [
    "簡單模式首頁多一格「📒 這個月收支」：收入、支出、存下（或超支）多少，點一下看每一筆"
  ] },
  { v: "2026.10.52c", date: "2026-10-22", items: [
    "簡單模式首頁「我現在總共有多少錢」改成「我的總資產」，下面寫清楚包含哪些（股票、現金、黃金、房子扣掉貸款…），不是都能馬上拿來花，並另外列出其中有多少現金"
  ] },
  { v: "2026.10.52b", date: "2026-10-22", items: [
    "一句話記帳改成一步完成：打完按「填好」，會跳出「這樣記對嗎？」（金額、分類、帳戶、備註），按「✅ 記下來」就記好，不用再到記帳畫面找按鈕；要改按「改一下」",
    "沒說帳戶的，自動用你這類最常用的帳戶；金額沒認出來的，才打開記帳畫面讓你自己填"
  ] },
  { v: "2026.10.52a", date: "2026-10-22", items: [
    "記帳的分類會自動判斷：先找你自己的分類，再看你以前一樣的東西記在哪一類（例如以前「紀念品」記在旅行），再用常見的字判斷（電腦、手機→3C，衣服→服飾，剪頭髮→美容…）",
    "都沒有符合的分類，就自動開一個新分類填進去（例如「電腦」「烤箱」），記了就會加進分類清單，不會卡住",
    "一般記帳打完備註、還沒選分類的，也會照備註自動選好分類（可以再改）"
  ] },
  { v: "2026.10.52", date: "2026-10-22", items: [
    "👵 簡單模式（⚙️ 設定 →「簡單模式、ETF、生活帳戶」打開）：字和按鈕放大，首頁只放四樣——我的總資產（含走勢圖）、記一筆、這週還能花多少、要處理的事（每件都有「去處理」）；其他功能都還在，按「看全部功能」就有",
    "⚡ 一句話記帳：在記帳最上面打「午餐 120 現金」「Line Pay 咖啡豆 2550」，自動填好類型、分類、金額、帳戶、備註，看過再按「記一筆」；按鍵盤 🎤 用講的也可以（只用規則判斷，資料不會傳出去）",
    "🆘 我卡住了：簡單模式最上面的 🆘 按鈕（首頁下面也有），按了會通知管理員你停在哪個畫面、最近有沒有出錯，不用自己解釋",
    "投資標的設定可以一鍵套用建議組合：🛡️ 保守（股票 25%、債券 60%、現金 15%）、⚖️ 穩健、🚀 積極；新建立的資產配置預設用保守型",
    "房子沒有自己填估值、也沒按「採用」的，估值改用自動估價（每月實價登錄更新會自己跟著變），不會一直停在買的價格"
  ] },
  { v: "2026.10.51a", date: "2026-10-21", items: [
    "汽機車的估值走勢：以前的部分照折舊每個月推算一點（從買的那天，沒填就從出廠），一打開就有完整的線，之後更新里程、行情記實際的",
    "房子的走勢多一條綠色虛線：每次按「重新估價」的自動估價（沒按「採用」也看得到）",
    "修正：改完估值、里程再點進去，走勢圖沒有馬上更新；「💰 賣出」按鈕字被擠成兩行"
  ] },
  { v: "2026.10.51", date: "2026-10-21", items: [
    "📈 每一筆資產點進去都有走勢圖：股票、ETF 是每天收盤價（買之前的也看得到，線上標出你買、賣的點，虛線是你的平均成本）；外幣看匯率；黃金照每天的金價算這一件值多少；球員卡、保險、收藏品是價值有變就記一筆（球員卡大約 3 天查一次）；房子、汽機車是重新估價或估值變動時記一筆",
    "走勢圖可以選 1 個月、3 個月、1 年、全部，手指按住線看每一天的數字；核心 ETF 和自選股按「📈 股價走勢」",
    "汽機車：里程 3 個月沒更新，會出現紅點，並寄 Gmail／加日曆提醒（照「通知方式」設定），之後每 30 天再提醒一次，更新了就停",
    "房子、汽機車可以「💰 賣出」：先幫你估好費用（房子：仲介費、代書費、履約保證費、土地增值稅、房地合一稅、提前清償違約金、退押金；車：過戶代辦費、寄賣費），還清貸款，算出實拿多少、跟買的價格比賺賠多少；按賣出就把實拿的錢記進帳戶",
    "賣掉的房子、車放到「已賣出」，不再算進淨資產，也不再自動記貸款、固定支出、租金；記錯了可以「取消賣出」，那筆帳一起撤掉"
  ] },
  { v: "2026.10.50c", date: "2026-10-21", items: [
    "修正：「找差額」把第一筆記帳誤報成「帳戶進了錢，但記帳裡找不到」（記帳比帳戶紀錄早寫入幾秒，被當成範圍外）",
    "找差額：上次「對齊」之前的校正和差異已經一起處理過，改放到收起來的區塊，不再重複算",
    "找差額：帳戶功能改過（例如「生意」改成「中轉」）會列出來，寫清楚因此多算或少算了多少",
    "按「對齊」前會先列出沒算進個人的帳戶（生意、儲蓄、中轉裡生意的部分），提醒裡面如果其實是個人的錢，要先改帳戶功能再對齊"
  ] },
  { v: "2026.10.50b", date: "2026-10-21", items: [
    "修正：新朋友第一次打開 App，Google 問權限時沒勾「全選」，按「建立新的資產配置」只跳一行看不懂的英文錯誤。現在 App 會先檢查權限，沒給齊就顯示一步一步的圖解（進階→前往→全選→繼續），按一個按鈕重新允許",
    "建立到一半因為權限失敗的人，權限補好後打開 App 會自動把剩下的設定（自動排程）做完，不會多複製一份"
  ] },
  { v: "2026.10.50a", date: "2026-10-19", items: [
    "修正：中午 12 點試算完、信也寄了，開著的 App 卻還停在上次的建議（要自己按重新整理）。現在試算完，開著的 App 一分鐘內會自己更新"
  ] },
  { v: "2026.10.50", date: "2026-10-18", items: [
    "修正：新版發佈後「有新版本」一直跳、要按好幾次。新版剛發佈的幾分鐘，Google 有些伺服器還在跑舊版，App 會被搞混；現在只認比目前新的版本、連續確認兩次才跳，按過更新的 5 分鐘內不會重複跳（右上角 ↓ 的黃點還在，隨時可以按）"
  ] },
  { v: "2026.10.49", date: "2026-10-18", items: [
    "修正：手續費月退（和日退）改成跟券商一樣「每一筆各自算折讓、元以下捨去，再加總」。之前是整個月加總後才算，會比券商實際退的多幾塊（9 月多算 3 元）",
    "本月預估未回補手續費也用同一個算法"
  ] },
  { v: "2026.10.48", date: "2026-10-18", items: [
    "新增保險、黃金、外幣、生意、銀行帳戶，都改成跟新手設定一樣的畫面一步一步帶你填，不管以前有沒有登記過；存好自動關掉",
    "新手設定第一步不會再預先打勾，沒有的不用勾，之後要加再到資產頁按「＋ 新增」",
    "已經在用 App 的人（有期初資料或總資產）不會一直跳「新手設定沒做完」的提醒",
    "⚙️ 啟用黃金、外幣、生意後，直接一步一步帶你登記第一筆"
  ] },
  { v: "2026.10.47", date: "2026-10-18", items: [
    "記帳時常用的帳戶自動排在最前面：看你以前的紀錄，支出大多從哪個帳戶付、收入大多進哪個帳戶（越近的紀錄算越重），最常用的標「最常用」",
    "選了分類會再照那個分類排，例如「午餐」大多用現金，就把現金排第一；轉帳、生意的費用和營收、買股票也一樣",
    "一樣要自己點一下選帳戶，不會自動幫你選，避免記錯"
  ] },
  { v: "2026.10.46", date: "2026-10-18", items: [
    "保險改成照實際能領回的錢看：成本欄說明改成「實際繳的保費加起來，不是保險金額」，沒填顯示「實繳保費待確認」",
    "保險的「解約金減保費」改叫差額、用灰色顯示，也不算進資產報酬率（保費有一部分是買過去的保障，不完全是賠賺）",
    "保險多了「保單資料」（都選填，只當備註、不算進資產）：解約金查詢日期、保險金額、身故給付、滿期日、滿期金、是否繳清",
    "填了滿期日和滿期金，會算「留到滿期一年大約多少報酬」，方便比較哪張值得留、要用錢先解哪張",
    "保險的解約金超過一年沒更新，會出現在任務提醒"
  ] },
  { v: "2026.10.45", date: "2026-10-17", items: [
    "汽車、機車的價格那一步先問「買新車」還是「買二手車」：買新車，買的價格就是新車價；買二手，系統照品牌、車型、年份自動查當年的新車價（約 880 款），不用自己找",
    "買二手可以另外填「選配多少錢」（知道才填）；查不到新車價的車，用買的價格和買的時候的車齡回推",
    "以前登記的車沒有選新車／二手的，照舊算；二手車改一下「基本資料」選「買二手車」會更準"
  ] },
  { v: "2026.10.44", date: "2026-10-17", items: [
    "機車估價重做：拿 17gogo 上 147 台中古機車的開價、加上車行收購行情表對照；一般速克達放 4 年後幾乎不跌、還能騎的很少低於 1～2 萬，黃牌大羊放久了跌很快，Gogoro 舊款收購很低",
    "機車估價改成「自己賣（私下賣給別人）大概賣得到的價格」，下面另外列「賣給車行（收購價）」和「車行賣出（開價）」，兩邊一眼看得到",
    "新增機車「車種」選項（一般速克達、白牌檔車、黃牌、紅牌、電動），沒選的照車型和排氣量自動判斷；Yamaha、Honda、偉士牌比較保值，光陽、Kawasaki、Harley 比較不保值",
    "機車品牌選單補上宏佳騰、偉士牌、Triumph、KTM、Aprilia、CFMOTO、eMOVING"
  ] },
  { v: "2026.10.43", date: "2026-10-17", items: [
    "生意：修正「庫存明明有，賣出時卻找不到」——之前進貨選過某個廠牌，賣出的商品清單會一直只列那一家；現在進貨、賣出各自篩選，切換就重來，篩選中會提示「看全部」",
    "生意：設成「耗材」但還有庫存的商品，賣出時也找得到（標「耗材」）；有庫存的排前面",
    "生意：庫存收起來時也看得到廠牌按鈕，按一下直接展開那一家；選了廠牌再搜尋＝只在那一家裡面找",
    "汽車估價第二輪：拿 8891 上 45 個品牌、1,018 台在賣的車對照，各品牌、各車身、各車齡的中位誤差大多壓在 ±5% 內",
    "新增「車身」選項（轎車、休旅、掀背、旅行車、轎跑、雙門跑車、敞篷、MPV、商用車），沒選的自動判斷：貨卡廂型車很保值、MPV 和歐系大轎車跌比較快、老的豪華大轎車跌非常快",
    "新增分組：Porsche（比 Toyota 還保值）、跌得快的品牌（Maserati、Jaguar、Luxgen、MG、Opel）、收藏型小車（Fiat 500、Abarth、Smart、Jimny、Terios）",
    "品牌選單補上 Infiniti、MG、Opel、Fiat、Abarth、Smart、CMC 中華、Daihatsu、Renault、Chevrolet、Cadillac",
    "Audi S 系列、TT RS、RS Q8 這類寫法正確歸到性能車；C300 AMG 這種 AMG 套件不再當性能車；Wrangler、Cullinan、TT、BMW 2／4 系列加分，5 系列、e-Power 減分",
    "還能開的老車估價不會低於 10 幾萬；15 年以上的跑車、收藏車幾乎不再跌"
  ] },
  { v: "2026.10.42", date: "2026-10-17", items: [
    "汽車估價大改：拿 26 台真實行情對照（一般車、性能車、超跑、頂級豪華、外匯車），有直接對照的平均誤差從 20% 降到約 3%",
    "新增車種分組：性能車（BMW M、AMG、Audi RS／R8、Alfa QV）、超跑（Ferrari、Lamborghini）、旗艦房車（A8、7 系列、S-Class）、Rolls-Royce、Bentley／Maserati、Aston Martin，照車型自動判斷",
    "10 年以上老車改用台灣實際行情（原本估太高）；老車和頂級豪華車的低里程加分變少，超跑的低里程加分變多",
    "外匯車可以填國外售價（美元／歐元／日圓／英鎊），自動加運費、關稅、貨物稅、營業稅、外匯商利潤算出台灣落地價",
    "品牌選單補齊：Alfa Romeo、Ferrari、Lamborghini、McLaren、Bentley、Rolls-Royce、Maserati、Aston Martin、Jeep、Lotus…",
    "性能車、超跑的特殊車色不扣錢"
  ] },
  { v: "2026.10.41a", date: "2026-10-17", items: [
    "新增汽車時可以選「外匯車」：提示新車價填台灣總代理同級車款，估價範圍放寬，建議填看到的行情",
    "特別保值的車款會加分（先加入 Alphard +15%，之後查證一款加一款）"
  ] },
  { v: "2026.10.41", date: "2026-10-17", items: [
    "汽車估價改用台灣實際行情：用 8891 上 30 款車、156 筆開價，加上台灣業界折舊算法和國外研究重新算折舊曲線，比之前更貼近台灣中古車價",
    "里程影響改成每多跑 1 萬公里約少 1%；油電車比較保值 +5%；Tesla 等電動車改成自己一組（台灣前 5 年很保值）",
    "填看到的開價：國產車扣 7%、進口車扣 5% 當成交價"
  ] },
  { v: "2026.10.40a", date: "2026-10-17", items: [
    "「全部重新估價」做完後如果畫面更新失敗，會自動等 3 秒再試一次，不用自己按重新整理",
    "後台錯誤紀錄：同一種錯誤合在一起，分「未處理／已處理」，可以一鍵複製錯誤報告"
  ] },
  { v: "2026.10.40", date: "2026-10-17", items: [
    "新增「🚗 交通工具」：汽車、機車一步一步登記（品牌、車型、出廠年、價格、里程、車色、車況），照品牌的保值程度、車齡、里程、車色、車況自動折舊估價，每個月自動更新",
    "可以填在中古車網站看到的同車款開價，估價改用那個（扣掉開價和成交的差距，之後照折舊往下算），一年後提醒再看一次；里程每半年提醒更新，沒更新照你的開車習慣推算",
    "車貸每月自動記帳，牌照稅、燃料稅、保險到期自動記（記成「交通」）；淨值算進淨資產和資產分布，不算進退休目標和投資報酬",
    "房貸保留現金也包含車貸"
  ] },
  { v: "2026.10.39", date: "2026-10-17", items: [
    "有房貸的話，再平衡試算會先留 6 個月的房貸在現金裡，不拿去買股票（⚙️ 設定 →「ETF、房貸保留、生活帳戶」可以改月數，0＝不留）",
    "ETF 買進建議變成可以關掉（預設開）：關掉就不試算、不寄試算信、不顯示試算和提醒"
  ] },
  { v: "2026.10.38b", date: "2026-10-17", items: [
    "修正：登記土地時出現「RE_ZN」錯誤",
    "修正：iPhone 一直在背景跳「The operation is insecure」錯誤（App 圖示數字、自動更新在 iPhone 上不能用，改成跳「有新版」讓你按一下）"
  ] },
  { v: "2026.10.38a", date: "2026-10-17", items: [
    "任務提醒的「去處理」會直接帶你做：中午試算建議買的幫你填好買進單、房子要重新估價的一鍵全部重估、對不上的打開找差額；每一件都寫按了會做什麼，點進房子也會在最上面列出要處理的、要按的按鈕旁邊有紅點",
    "ETF 提醒改成只看中午試算建議要買的（不會因為還沒買齊就一直出現），可以在 ⚙️ 設定 →「提醒與生活帳戶」關掉",
    "生活帳戶改成只當參考：錢都留在投資現金，只顯示這週還可以花多少；要改回每週真的撥錢，在同一個設定關掉",
    "打開 App 會自己檢查：自動排程不見了就重新安裝，今天中午的試算沒跑到就補跑"
  ] },
  { v: "2026.10.38", date: "2026-10-16", items: [
    "任務提醒：有要處理的事（股票比目標少可以補、超過目標、達到賣出條件、球員卡查到新價格要確認、房租沒收到、估價要更新、資料對不上…），底下的分頁會出現紅色數字，點進去最上面列出來，按「去處理」會捲到那裡並用紅框標出來",
    "裝成 App 的，App 圖示右上角會顯示要處理的件數（手機、電腦有支援的才會有）",
    "每天 9 點新版上線後，App 會在你沒有輸入東西的時候自動換成新版，換好跳出這次更新了什麼",
    "登記房子改成一步一步問（什麼房子、在哪、幾樓、多大、車位、價格、用途），存好自動估價，接著帶你填屋況、設定房貸；新手設定也多了「房子、土地」這一步",
    "房地產多了「全部重新估價」；實價登錄每月更新後，每天的自動排程會自己重新估價，不用按"
  ] },
  { v: "2026.10.37", date: "2026-10-16", items: [
    "房子的估值照實價登錄的寫法：總價＝每坪（扣車位）× 坪數＋車位價，數字對得上；露台、增建、機車位、勾選的調整都算進每坪",
    "房貸、押金、淨值另外放一塊，不跟估值混在一起",
    "自動估價只留總價、每坪、車位（調整後也一樣三行），公設比、露台、附近成交這些細節移到「價格評估報告」"
  ] },
  { v: "2026.10.36d", date: "2026-10-16", items: [
    "估值下面把總價拆開：室內（每坪 × 坪數）、露台／地下室／夾層／增建、車位、機車位，加起來就是估值；每坪的算法也改成跟這個一致"
  ] },
  { v: "2026.10.36c", date: "2026-10-16", items: [
    "登記房子存好後會自動估價，接著帶你填實價登錄看不到的條件：住宅、透天可以選格局圖（填完接著勾屋況裝潢）或直接勾選，沒填估值的會直接用調整後的價格當估值",
    "改基本資料存起來後自動重新估價，不用再按「重新估價」"
  ] },
  { v: "2026.10.36b", date: "2026-10-16", items: [
    "「持股」分頁改名「資產」",
    "房子的估值旁邊顯示每坪（扣車位）和車位的坪數、價格；房地產列表也顯示每坪",
    "勾選的調整 % 只乘在房子本身，車位、機車位照原價（之前連車位一起乘，每坪會算太高）",
    "同一棟（同一社區）有成交時，整棟都一樣的條件（結構、社區公設、管理、學區、捷運、市場、嫌惡設施）不再列出、不重複加",
    "住宅的「附近成交」只列住宅（不會再出現店面、辦公室）"
  ] },
  { v: "2026.10.36a", date: "2026-10-16", items: [
    "自動估價的「每坪（扣車位）」改成最後的價格：含你勾的條件、跟這一戶上次成交各一半，扣掉車位、機車位、露台地下室，除以室內坪數；賣房開價、跟附近成交比就看這個。報告的結論也列出來，另外附含車位的每坪"
  ] },
  { v: "2026.10.36", date: "2026-10-16", items: [
    "總覽多了「負債」：房貸、預售屋尾款、房客押金、信用卡未繳的合計，還有負債比、每月房貸；點開看每一筆",
    "房子的自動估價多了「價格評估報告」：從這一區的基準每坪開始，地段、型態、屋齡、樓層、坪數、公設比、車位各讓價格變多少，再到總價、這一戶以前的成交、你勾的調整、範圍為什麼這麼寬、跟附近成交比"
  ] },
  { v: "2026.10.35q", date: "2026-10-16", items: [
    "估價有用到這一戶以前的成交時，「依屋況調整」裡不會變的條件（格局、景觀、採光、結構、社區、地點、格局圖）自動只加在模型那一半，屋況、裝潢、家具照全部算；照實際情況勾就好"
  ] },
  { v: "2026.10.35p", date: "2026-10-16", items: [
    "自動估價裡「這一戶上次成交」「車位含在單價」兩行排版整理，數字不會被擠到換行"
  ] },
  { v: "2026.10.35o", date: "2026-10-16", items: [
    "機車位可以選有沒有權狀：沒有權狀、跟著房子用的（預設）台北 10 萬、新北 8 萬、桃園 5 萬一個；有權狀、可以單獨賣的台北 30 萬、新北 20 萬、桃園 10 萬"
  ] },
  { v: "2026.10.35n", date: "2026-10-16", items: [
    "修正：改基本資料（例如車位）存起來之後，「採用自動估價 +x%」的估值會被標成「自己填的」"
  ] },
  { v: "2026.10.35m", date: "2026-10-16", items: [
    "自動估價會找這一戶自己近 3 年的成交，用市場漲跌換算到現在顯示出來；隔 2 年以上、坪數和車位數一樣的，估價用模型和這筆各一半（同一戶賣兩次的資料驗證過比較準）",
    "需要新的實價登錄資料（re_v15）"
  ] },
  { v: "2026.10.35l", date: "2026-10-16", items: [
    "校正帳戶餘額時可以直接選差額是什麼：沒記到的收支（補記成分類）、數錯或設定錯（帳務調整）、或先不管；選前兩個，系統記錄會跟著改，對帳不會出現差額。帳戶第一次校正會自動當成設定餘額（帳務調整，不算收支）"
  ] },
  { v: "2026.10.35k", date: "2026-10-16", items: [
    "可以勾「車位不在權狀坪數裡」（權狀上車位 0 坪，老華廈、公寓常見）：坪數不扣車位，車位價照實價登錄這種成交的算法含在每坪單價裡（平均每坪多約 7%），不另外加"
  ] },
  { v: "2026.10.35j", date: "2026-10-16", items: [
    "車位可以填兩種（例如一個坡道平面＋一個子母車位）：在「坪數明細、車位數量」填「第二種車位」，價格、坪數分開算再加起來"
  ] },
  { v: "2026.10.35i", date: "2026-10-16", items: [
    "車位可以選「子母車位」：價格照一個坡道平面車位的 1.5 倍（同一棟有成交用同一棟的），權狀裡的車位坪數用兩格算"
  ] },
  { v: "2026.10.35h", date: "2026-10-16", items: [
    "基本資料可以填「增建」坪數（權狀外的儲藏室、加蓋）：用每坪 1/3 價算進估價；填了坪數，勾選清單的「其他增建」就不重複算"
  ] },
  { v: "2026.10.35g", date: "2026-10-16", items: [
    "基本資料可以填機車位（固定位置、有權狀或約定專用的）：沒填價格用台北 30 萬、新北 20 萬、桃園 10 萬一個算進估價；公設隨便停的不算"
  ] },
  { v: "2026.10.35f", date: "2026-10-16", items: [
    "用途是「分租」的住宅：「依屋況調整」只列分租套房的條件（屋況、合不合法、每間有沒有窗和衛浴、獨立電表、消防、水電、隔太多間、出租狀況），加上周遭環境、增建、特殊狀況；景觀、採光、格局圖這些自住條件不列、不算"
  ] },
  { v: "2026.10.35e", date: "2026-10-16", items: [
    "用途是「分租」的房子：照實價登錄隔成套房的成交調整（沒電梯公寓頂樓 +3%、華廈／大樓 -1%、其他公寓不變）",
    "有在收租的房子：自動估價下面顯示租金投報率（年租金 ÷ 估價）；分租套房另外提醒違規隔間、貸款成數的風險"
  ] },
  { v: "2026.10.35d", date: "2026-10-16", items: [
    "1 樓店面的「附近成交」只列店面（原本會混到樓上住宅、公寓的成交）：先列同一條路大馬路上的店面，不夠再補這一段、這條路巷子裡的，看最近 3 年"
  ] },
  { v: "2026.10.35c", date: "2026-10-16", items: [
    "修正：房地產重新估價、存調整時出現「reAdjCat_ is not defined」"
  ] },
  { v: "2026.10.35b", date: "2026-10-16", items: [
    "店面、辦公室、工廠的「依屋況調整」最上面提示地下室、夾層要在基本資料填坪數"
  ] },
  { v: "2026.10.35a", date: "2026-10-16", items: [
    "「依屋況調整」照房子類型顯示不同的選項：店面（面寬、三角窗、巷口、人潮、騎樓、能不能做餐飲、租客）、辦公室（A 級商辦、整層、中央空調、高架地板、挑高）、工廠（能不能登記、大貨車進出、貨梯、樓板載重、挑高、電力）、土地（臨路寬度、角地、地形、建築線、坡地、淹水、占用、都更）、透天（車庫、電梯、路寬）；格局圖只給住宅和透天用",
    "基本資料可以填權狀裡沒算的地下室（算 3 成價）和夾層（算 4 成價）"
  ] },
  { v: "2026.10.35", date: "2026-10-16", items: [
    "估價的可能範圍改成看附近有沒有類似的成交：同一棟有成交約 ±13%，同巷弄有約 ±16%，巷弄沒有成交、坪數在這一段又少見的最寬約 ±23%；類似成交很少時，直接顯示範圍並說明原因，不再只給一個數字",
    "同一棟的公設比、總樓層、完工年改用所有年份、所有成交（包括親友交易）的權狀資料；這一戶自己以前成交過的，直接用它的公設比"
  ] },
  { v: "2026.10.34d", date: "2026-10-16", items: [
    "格局圖每一面多問窗戶型式（透氣小窗、一般窗、大面景觀窗、落地窗）；房間細節多了廚房（封閉／開放、中島、輕食吧台、有沒有窗）、儲藏室、佣人房、大門進來看到什麼（玄關、屏風、穿堂煞）",
    "格局圖新增「社區管理」頁：一層幾戶、管理方式、垃圾代收、社區公設、電梯夠不夠、樓下是不是餐廳、頂樓平台、外牆、水電管線、瓦斯、隔音、風水"
  ] },
  { v: "2026.10.34c", date: "2026-10-16", items: [
    "格局圖新增「房間細節」：幾間主臥套房（更衣室、步入式衣櫥）、套房、一般房間、小房間、書房；每間衛浴是完整還是半套、大小、乾濕分離、浴缸、雙面盆、對外窗；廚房（中島、獨立、開放、一字型）；後陽台",
    "格局圖的房間多了套房、小房間、後陽台；景觀多了「道路交通」：筆直大馬路、遠處的捷運火車、大馬路中間的高架、旁邊的鐵軌捷運、隧道口彎道、路沖"
  ] },
  { v: "2026.10.34b", date: "2026-10-16", items: [
    "格局圖的景觀分得更細：先選前面是外牆、巷口路口、還是開闊；對面房子用路寬估（防火巷、小巷、雙向道、四線道、六線大馬路）；景分綠意（行道樹、林蔭大道、小公園、大公園、知名公園、山坡、整座山）、水景（河、湖、海，對面是城市還是山）、城市（摩天大樓、住宅大樓、低矮平房）、地標；再選有沒有被擋、是俯瞰還是平視"
  ] },
  { v: "2026.10.34a", date: "2026-10-16", items: [
    "景觀多了「看得出去、很開闊」（+1%）和「林蔭大道」（仁愛路、敦化南路這種，+5%），格局圖和勾選都有"
  ] },
  { v: "2026.10.34", date: "2026-10-16", items: [
    "估價改用近 3 年的實價登錄（越新的成交越重要，每 2 年權重減半）：透天、辦公、工業、住宅都更準",
    "估價會找同一社區的其他門牌（例如 51、53、55 號同一棟）：自己門牌沒成交時，用它的公設比；大馬路上的商辦也參考它的成交",
    "沒填公設比時，改用附近同年代、同型態大樓的公設比（老華廈常常只有 5～10%，以前用全市平均會估太低）",
    "大小坪數、新舊、樓層高低、公設比、1 樓的價差都改成各地自己算（行政區 → 路 → 門牌區段），先換算到同一個月的行情再比：整體誤差 7.04% → 6.91%",
    "巷弄裡近 3 年沒有其他成交的房子，系統平均會估低一點（台北約 1.7%），現在自動補回來",
    "新增「格局圖」小幫手：用四面方塊一步一步填每一面的窗、景觀（可複選）、對面房子多遠、陽台、哪個房間，自動算採光、棟距、景觀、西曬；不知道方位可以用下午西曬、早上陽光或手機指北針推；可以上傳仲介給的平面圖當參考",
    "「依屋況調整」改成更細的選項：裝潢分 7 種、景觀可以複選（最好的算全額、其他加一半）、採光、棟距、坐向、格局、結構、社區、周遭環境、1 樓店面，每個選項都有白話說明；一般項目合計最多 +35%、−45%",
  ] },
  { v: "2026.10.33a", date: "2026-10-15", items: [
    "房地產自動估價（臺北市、新北市、桃園市的大樓／華廈／公寓）：用近兩年的實價登錄，依地段（細到同一棟）、屋齡、樓層、坪數、公設比、車位估現在的行情，附上可能範圍；可以自己加減 % 再按「採用」",
    "自動估價沒填的總樓層、完工年、公設比、車位價，會先用實價登錄裡同一棟的資料，找不到才用同型態、同屋齡或縣市的行情",
    "自動估價的市場行情改用最新 1 個月的成交（太少才用 2 個月）；單筆偏離太多的成交不會把整棟帶歪；預售屋同建案先用最近 1 個月，不夠才往前放寬，也排除親友、特殊關係這類交易",
    "自動估價支援透天（要填土地坪數）、辦公室、店面；地段再細分到「同一側的門牌」和「附近 20 號以內」，各行政區有自己的折舊速度",
    "好幾層一起的（例如 1+2 樓店面、商辦）：所在樓層填「1+2」，照實價登錄裡多層成交的價差算；1 樓大馬路店面算含騎樓、有租約的算帶租約",
    "實價登錄裡寫「一層，騎樓」「五層，陽臺」「一層，二層」的成交以前沒讀進來，現在補進來了（多了約 6,000 筆，很多是店面）",
    "店面、商辦可以在「附近最近成交」挑一筆最像的「用這筆比價」，估值改用那筆的每坪單價",
    "1 樓店面改看「這條路、這一段、這一側」的店面成交，不再被樓上住宅的價格拉低",
    "上傳新的估價資料後，最慢 10 分鐘就會用到（以前會用舊資料最多 6 小時，舊資料跟新資料混在一起會算錯）",
    "新增「工廠／廠辦」估價（工業用的成交；整棟工廠要填土地坪數）",
    "新增「土地」估價：填地段地號、使用分區、坪數，有沒有持分；參考同小段、附近地號的土地成交（土地差異大，範圍很寬，當行情參考）",
    "估價下面可以展開「附近最近一年的實際成交」，自己對照行情",
    "金額（買入總價、估值、已付、房貸金額、提前還款）改用「萬」輸入；權狀坪數照權狀填（含車位），App 會自己扣掉車位坪數",
    "自動估價分得出長街的頭尾：巷子會照巷號算在哪一段（例如吳興街 156 巷跟 450 巷行情不同）；門牌寫「7-1號」也認得；型態選大樓但只有 10 層以下會改用華廈算，實價登錄有這棟就照登錄的型態",
    "登記房子：屋齡直接填年數；存不進去時剛剛打的內容會留著；可以勾「不記得買入價格」；露台填坪數會用室內單價 1/3 算進估價",
    "依屋況調整：景觀和永久棟距分開，多了「一層一戶／兩戶」",
    "實價登錄每季更新後，有估過價的房子會自動重估；估值是「採用自動估價」的會跟著更新（自己勾的調整會保留），自己填的估值不會動",
    "預售屋：勾「預售屋（還沒交屋）」，填合約總價、已付金額、建案名稱；還沒付給建商的錢會從淨值扣掉，自動估價改用同建案其他戶最近的預售成交（會依樓層調整）",
    "登記房子多了「權狀坪數」、車位種類，還有建案名稱、建商、營造廠（建案名稱會顯示在房子名字旁邊）",
    "自動估價的「依屋況調整」：屋況、增建、景觀採光、周遭環境、建商品牌、特殊狀況（凶宅、海砂屋…）共 22 項，勾一勾就算好；標「資料」的是用實價登錄算出來的"
  ] },
  { v: "2026.10.32d", date: "2026-10-15", items: [
    "總覽的「目前總資產」加上房地產淨值（估值－房貸－押金），跟淨資產走勢圖的數字一致；退休目標進度還是只算可以拿來花的錢",
    "總覽多一個「資產分布」小圓餅圖：ETF、個股、現金、黃金、外幣、房地產各占多少，點標題可以收起來",
    "房地產：可以設定共同持有的持分（例如 1/2），淨值、租金、管理費都只算你的部分；房貸可以另外設定你負擔幾 %"
  ] },
  { v: "2026.10.32c", date: "2026-10-15", items: [
    "房貸、管理費、房屋稅這些房子的錢改從「投資現金」扣，不會吃掉每週的生活費"
  ] },
  { v: "2026.10.32b", date: "2026-10-15", items: [
    "對帳：總數對得上、只是錢放的帳戶跟系統不一樣時，不再顯示紅色差額，改成說明要怎麼調整",
    "房地產：設定房貸、出租、固定支出後，今天到期的會馬上記帳"
  ] },
  { v: "2026.10.32a", date: "2026-10-15", items: [
    "新增「📜 隱私與使用聲明」：說明資料存在哪裡、管理員看得到什麼；第一次使用要勾同意（設定裡隨時可以再看）",
    "新增「🏠 房地產」（持股頁）：登記房子、房貸、管理費和稅、出租",
    "房貸每月扣款日自動記帳，拆成利息（算支出）和本金（不算花掉）；可以改成銀行實際扣的金額，也能記升息和提前還款",
    "出租：每間各自填租金和合約，到收租日自動記租金，沒收到可以標「未收」；租約到期前 30 天通知",
    "淨資產會加上房地產淨值（估值 − 房貸 − 押金）"
  ] },
  { v: "2026.10.31b", date: "2026-10-15", items: [
    "持股頁每一檔在股價下面多顯示平均成本（均價）和現在比均價漲跌幾 %；其他個股也會顯示均價"
  ] },
  { v: "2026.10.31a", date: "2026-10-14", items: [
    "新增「💬 意見回饋」（設定裡）：想要的功能、哪裡不好用可以直接傳給管理員，回覆會顯示在同一頁",
    "App 出錯時會自動回報給管理員，不用再截圖",
    "首頁最上面會顯示管理員的公告；系統維護時打開會看到「維護中」",
    "配合新的管理後台（只有管理員用得到；後台可以用連線金鑰連線）"
  ] },
  { v: "2026.10.30b", date: "2026-10-14", items: [
    "有新版本時，一打開 App（或從背景切回來）就馬上跳出更新，不用等資料讀完；有密碼鎖的話在密碼畫面就會跳"
  ] },
  { v: "2026.10.30a", date: "2026-10-14", items: [
    "持股頁每一檔都顯示「名稱＋代號」，沒登記名稱的會自動從證交所／櫃買中心的公開資料查",
    "新增賣出提醒：每一檔持股都能設「比成本漲幾 %」「漲到／跌到多少元」「漲破／跌破幾日均線」",
    "盤中 9～13 點每小時檢查，達到就用日曆（像鬧鐘）／Gmail 通知；條件還在每天提醒一次，直到你關掉"
  ] },
  { v: "2026.10.29g", date: "2026-10-13", items: [
    "走勢圖的金額刻度會看漲跌幅度自動多給小數，百萬以上也看得出差別（例如 268.3萬、268.5萬，不會三條都寫 268萬）"
  ] },
  { v: "2026.10.29f", date: "2026-10-13", items: [
    "新增更新日誌：更新後第一次打開會跳出這個視窗，設定裡也可以看以前每一次的更新"
  ] },
  { v: "2026.10.29e", date: "2026-10-13", items: [
    "淨資產走勢圖變細：每小時記一個點，多了「1 天」「1 週」可以看盤中漲跌",
    "走勢圖加高，加上金額刻度、格線和起點虛線",
    "按住線會有圓點跟著走，顯示那個時間的金額和比起點漲跌多少"
  ] },
  { v: "2026.10.29d", date: "2026-10-13", items: [
    "其他個股按「修改」可以直接填每股均價，總成本會自動算（改總成本，均價也會跟著變）"
  ] },
  { v: "2026.10.29c", date: "2026-10-13", items: [
    "每天的再平衡試算改成 12:00 準時跑（以前是 12～13 點之間隨機），通常 12:02 前就算好",
    "萬一 12:00 那次沒跑，13 點前會自動補跑"
  ] },
  { v: "2026.10.29b", date: "2026-10-13", items: [
    "沒開 App 的時候，每小時（7～23 點）會先把畫面算好，打開就直接看到結果，不用等轉圈",
    "中午試算完、下午收盤記完，也會各算一次"
  ] },
  { v: "2026.10.29a", items: [
    "日曆通知：每天的試算結果、提醒可以寫進 Google 日曆（設定 → 通知），也可以跟 Gmail 兩個都要",
    "對帳：一鍵找出差額在哪裡、可以一次對所有帳戶（含外幣），差額可以記成「帳務調整」",
    "生意：可以把記帳的某個分類（例如芝妮雅）綁定成生意支出，過去的紀錄也能一起移過去",
    "記帳和生意頁最上面顯示收入、支出、收支；可以查某一天或一段日期的明細，點進去能修改",
    "退休規劃改成只填「退休那年每個月要多少」，每月投入會用最近半年的收支自動算",
    "目標比例可以設兩套：現在用積極的組合，退休前 10 年慢慢換成退休組合",
    "外幣刷卡：選幣別自動帶匯率和海外手續費，繳卡費時可以調整實際台幣",
    "有新版本時，打開 App 會直接跳出更新按鈕",
    "股價公式自動修復：換了代號、抓不到價格時會自己修好，不會再出現跌 60% 這種錯的數字"
  ] }
];

WA_READ_ONLY_.waChangelog = 1;
function waChangelog() { return { list: CHANGELOG_, ver: LIB_VERSION_ }; }

// 還沒看過的更新（第一次用的人只給最新一則）
function changelogUnseen_() {
  var seen = String(PROPS_().getProperty("CHANGELOG_SEEN") || "");
  if (!seen) return CHANGELOG_.slice(0, 1);
  return CHANGELOG_.filter(function (c) { return c.v > seen; }).slice(0, 8);
}
// 看完了：記住看到哪一版（只寫一個屬性，不用重算畫面）
WA_READ_ONLY_.waChangelogSeen = 1;
function waChangelogSeen(p) {
  var v = String(p && p.v || LIB_VERSION_).replace(/[^0-9A-Za-z.\-]/g, "").slice(0, 20);
  PROPS_().setProperty("CHANGELOG_SEEN", v);
  return { ok: true };
}


