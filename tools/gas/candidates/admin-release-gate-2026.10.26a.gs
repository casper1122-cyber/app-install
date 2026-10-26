// ============================================================
// 資產配置・管理後台（獨立的 Apps Script 專案，用你自己的身分執行）
// 網頁放在 GitHub（casper1122-cyber.github.io/app-install/admin/），這裡只負責：
//   1. 登入（帳號＋密碼，密碼只存雜湊；錯 5 次鎖 15 分鐘；每次登入都記錄）
//   2. 幫你更新中央 App：上傳檔案 → 建立版本 → 把正式網址換到新版本（網址不變），也能回到以前的版本
//   3. 用你的 Google 身分去問中央 App：邀請名單、使用者狀態、錯誤紀錄、意見、公告
// 第一次用：在編輯器選「showSetupCode」按執行，把執行紀錄裡的設定碼抄到後台網頁的「第一次設定」
// ============================================================
var API_ = "https://script.googleapis.com/v1/projects/";
var ADMIN_VER_ = "2026.10.26a"; // 後台程式的版本（「⚙️ 設定 → 更新後台程式」會顯示）
var SESSION_DAYS_REMEMBER_ = 30, SESSION_HOURS_ = 12;
var HASH_ROUNDS_ = 3000;

function P_() { return PropertiesService.getScriptProperties(); }
function now_() { return Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm"); }
function hex_(bytes) { return bytes.map(function (b) { var h = ((b + 256) % 256).toString(16); return h.length < 2 ? "0" + h : h; }).join(""); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function rand_() { return sha_(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random()); }
// 密碼雜湊：加鹽、重複算很多次（別人拿到雜湊也很難反推密碼）
function pwHash_(pw, salt) {
  var h = sha_(salt + "|" + pw);
  for (var i = 0; i < HASH_ROUNDS_; i++) h = sha_(h + salt);
  return h;
}
function same_(a, b) { // 比對時每個字都比，不提早結束
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- 第一次設定 ----------
// 在 Apps Script 編輯器執行這個，執行紀錄會出現一組設定碼（30 分鐘內有效，用過就失效）
function showSetupCode() {
  var code = rand_().slice(0, 8).toUpperCase();
  CacheService.getScriptCache().put("setup_code", code, 1800);
  Logger.log("後台設定碼：" + code + "（30 分鐘內到後台網頁輸入）");
  return code;
}
// 忘記密碼：在編輯器執行這個，會清掉帳號密碼和所有登入（其他設定保留），再用 showSetupCode 重新設定
function resetAdminPassword() {
  var p = P_();
  ["ADMIN_USER", "ADMIN_SALT", "ADMIN_HASH"].forEach(function (k) { p.deleteProperty(k); });
  p.getKeys().forEach(function (k) { if (k.indexOf("S_") === 0) p.deleteProperty(k); });
  Logger.log("已清除帳號密碼。請執行 showSetupCode 重新設定。");
}

// ---------- 網頁呼叫 ----------
function doGet() { return out_({ ok: true, data: { name: "資產配置後台", ready: !!P_().getProperty("ADMIN_HASH") } }); }
function doPost(e) {
  var q = {};
  try { q = JSON.parse(e && e.postData && e.postData.contents || "{}") || {}; } catch (pe) { return out_({ ok: false, error: "格式不對" }); }
  try {
    var op = String(q.op || ""), a = q.arg || {};
    if (op === "status") return out_({ ok: true, data: { ready: !!P_().getProperty("ADMIN_HASH") } });
    if (op === "setup") return out_({ ok: true, data: setup_(a) });
    if (op === "login") return out_({ ok: true, data: login_(a) });
    var ses = session_(q.token);
    if (!ses) return out_({ ok: false, error: "請重新登入", relogin: true });
    return out_({ ok: true, data: api_(op, a, ses) });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function setup_(a) {
  var p = P_();
  if (p.getProperty("ADMIN_HASH")) throw new Error("已經設定過了。忘記密碼請在編輯器執行 resetAdminPassword");
  var code = CacheService.getScriptCache().get("setup_code");
  if (!code || !same_(String(a.code || "").trim().toUpperCase(), code)) throw new Error("設定碼不對或過期了，請在編輯器重新執行 showSetupCode");
  var user = String(a.user || "").trim(), pw = String(a.pass || "");
  if (!/^[A-Za-z0-9_.@-]{3,40}$/.test(user)) throw new Error("帳號 3～40 個字，只能用英文、數字和 _ . @ -");
  pwCheck_(pw);
  var salt = rand_().slice(0, 32);
  p.setProperties({ ADMIN_USER: user, ADMIN_SALT: salt, ADMIN_HASH: pwHash_(pw, salt) });
  CacheService.getScriptCache().remove("setup_code");
  log_("設定帳號", true, a.device);
  return { message: "設定完成，請登入" };
}
function pwCheck_(pw) {
  if (pw.length < 10) throw new Error("密碼至少 10 個字（後台可以部署程式，要設長一點）");
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new Error("密碼要同時有英文和數字");
}

// ---------- 登入 ----------
function login_(a) {
  var p = P_(), c = CacheService.getScriptCache();
  if (!p.getProperty("ADMIN_HASH")) throw new Error("還沒有設定帳號");
  var fails = Number(c.get("login_fail") || 0);
  if (fails >= 5) { log_("登入被擋（錯太多次）", false, a.device); throw new Error("密碼錯太多次，15 分鐘後再試"); }
  var okUser = same_(String(a.user || "").trim().toLowerCase(), String(p.getProperty("ADMIN_USER")).toLowerCase());
  var okPw = same_(pwHash_(String(a.pass || ""), p.getProperty("ADMIN_SALT")), p.getProperty("ADMIN_HASH"));
  if (!okUser || !okPw) {
    c.put("login_fail", String(fails + 1), 900);
    log_("登入失敗（帳號：" + String(a.user || "").slice(0, 40) + "）", false, a.device);
    throw new Error("帳號或密碼不對" + (fails + 1 >= 5 ? "，已經鎖 15 分鐘" : "（還可以試 " + (4 - fails) + " 次）"));
  }
  c.remove("login_fail");
  var token = rand_() + rand_().slice(0, 16);
  var ms = a.remember ? SESSION_DAYS_REMEMBER_ * 86400000 : SESSION_HOURS_ * 3600000;
  p.setProperty("S_" + sha_(token).slice(0, 40), JSON.stringify({ exp: Date.now() + ms, at: now_(), device: String(a.device || "").slice(0, 80) }));
  cleanSessions_();
  log_("登入成功", true, a.device);
  return { token: token, user: p.getProperty("ADMIN_USER"), days: a.remember ? SESSION_DAYS_REMEMBER_ : 0 };
}
function session_(token) {
  if (!token || String(token).length < 40) return null;
  var key = "S_" + sha_(token).slice(0, 40), raw = P_().getProperty(key);
  if (!raw) return null;
  var s = JSON.parse(raw);
  if (!(s.exp > Date.now())) { P_().deleteProperty(key); return null; }
  s.key = key;
  return s;
}
function cleanSessions_() {
  var p = P_(), all = p.getProperties(), now = Date.now();
  var ses = Object.keys(all).filter(function (k) { return k.indexOf("S_") === 0; });
  ses.forEach(function (k) { try { if (!(JSON.parse(all[k]).exp > now)) p.deleteProperty(k); } catch (e) { p.deleteProperty(k); } });
}
// 登入紀錄：只留最近 100 筆
function log_(what, ok, device) {
  var p = P_();
  p.setProperty("L_" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), JSON.stringify({ t: now_(), what: what, ok: !!ok, device: String(device || "").slice(0, 80) }));
  var keys = p.getKeys().filter(function (k) { return k.indexOf("L_") === 0; }).sort();
  keys.slice(0, Math.max(0, keys.length - 100)).forEach(function (k) { p.deleteProperty(k); });
}

// ---------- 登入後可以做的事 ----------
function api_(op, a, ses) {
  var p = P_();
  switch (op) {
    case "me": return { user: p.getProperty("ADMIN_USER"), cfg: cfg_(), sessions: sessionsList_(ses), theme: themeMeta_() };
    // 外觀同步：顏色、深淺色、背景圖（背景圖切成小塊存）
    case "themeGet": { var m = themeMeta_(); if (m && m.n) { var parts = []; for (var i = 0; i < m.n; i++) parts.push(p.getProperty("THEME_BG_" + i) || ""); m.bg = parts.join(""); } return { theme: m }; }
    case "themeSet": return { theme: themeSet_(a) };
    case "logout": p.deleteProperty(ses.key); return { ok: true };
    case "logoutAll": p.getKeys().forEach(function (k) { if (k.indexOf("S_") === 0) p.deleteProperty(k); }); log_("登出所有裝置", true, a.device); return { ok: true };
    case "changePass": {
      if (!same_(pwHash_(String(a.old || ""), p.getProperty("ADMIN_SALT")), p.getProperty("ADMIN_HASH"))) throw new Error("原本的密碼不對");
      pwCheck_(String(a.pass || ""));
      var salt = rand_().slice(0, 32);
      p.setProperties({ ADMIN_SALT: salt, ADMIN_HASH: pwHash_(String(a.pass), salt) });
      p.getKeys().forEach(function (k) { if (k.indexOf("S_") === 0 && k !== ses.key) p.deleteProperty(k); }); // 其他裝置都要重新登入
      log_("更改密碼", true, a.device);
      return { message: "密碼已更改，其他裝置要重新登入" };
    }
    case "cfgSet": {
      var sid = String(a.scriptId || "").trim(), url = String(a.hubUrl || "").trim();
      if (sid && !/^[A-Za-z0-9_-]{20,80}$/.test(sid)) throw new Error("指令碼 ID 格式不對");
      var m = url.match(/^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
      if (url && !m) throw new Error("App 網址要是 https://script.google.com/macros/s/…/exec");
      if (sid) p.setProperty("HUB_SCRIPT_ID", sid);
      if (m) { p.setProperty("HUB_URL", "https://script.google.com/macros/s/" + m[1] + "/exec"); p.setProperty("HUB_DEPLOY_ID", m[1]); }
      return { cfg: cfg_() };
    }
    case "logins": return { list: listPrefix_("L_") };
    // 連線金鑰：後台跟管理員不是同一個 Google 帳號時，中央 App 靠這個認後台
    case "genKey": {
      var k = (rand_() + rand_()).slice(0, 48);
      p.setProperty("HUB_API_KEY", k);
      log_("產生新的連線金鑰", true, a.device);
      return { key: k, cfg: cfg_() };
    }
    // ---- 部署 ----
    case "deployInfo": return deployInfo_();
    case "upload": return upload_(a);
    case "deploy": return deploy_(a);
    case "hotfix": return hotfix_(a);
    case "prodFiles": return prodFiles_();
    case "autoSet": return autoSet_(!!a.on);
    case "rollback": return rollback_(a);
    case "fixAccess": { var r = deploy_({ desc: "修正存取設定", device: a.device }); return r; }
    case "liveVer": return { ver: liveVer_() };
    case "selfInfo": return selfInfo_();
    case "selfUpdate": return selfUpdate_(a);
    case "selfRollback": return selfRollback_(a);
    case "reData": return reData_();
    case "todoList": return todoList_();
    case "todoAdd": return todoAdd_(a);
    case "todoDone": return todoDone_(a);
    case "todoDel": return todoDel_(a);
    case "calSync": return calSync_();
    // ---- 轉給中央 App ----
    case "hub": return hub_(String(a.op || ""), a.arg || {});
  }
  throw new Error("不支援的動作：" + op);
}
function themeMeta_() { try { return JSON.parse(P_().getProperty("THEME_META") || "null"); } catch (e) { return null; } }
function themeSet_(a) {
  var p = P_(), old = themeMeta_() || {};
  var m = { brand: /^#[0-9a-fA-F]{6}$/.test(a.brand || "") ? a.brand : "#1f5f4a", mode: a.mode === "light" || a.mode === "dark" ? a.mode : "",
    dim: Math.max(0, Math.min(0.8, Number(a.dim) || 0)), ver: Date.now(), n: old.n || 0, bgId: old.bgId || "" };
  if (a.bg !== undefined) { // 有傳背景才改背景（只改顏色時不用重傳圖片）
    var bg = String(a.bg || "");
    if (bg && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(bg)) throw new Error("圖片格式不對");
    if (bg.length > 320000) throw new Error("圖片太大，請換一張或再縮小");
    for (var i = 0; i < (old.n || 0); i++) p.deleteProperty("THEME_BG_" + i);
    var CH = 8500, n = Math.ceil(bg.length / CH), o = {};
    for (var j = 0; j < n; j++) o["THEME_BG_" + j] = bg.substr(j * CH, CH);
    if (n) p.setProperties(o);
    m.n = n; m.bgId = bg ? String(m.ver) : "";
  }
  p.setProperty("THEME_META", JSON.stringify(m));
  return m;
}
function cfg_() { var p = P_(); return { scriptId: p.getProperty("HUB_SCRIPT_ID") || "", hubUrl: p.getProperty("HUB_URL") || "", deployId: p.getProperty("HUB_DEPLOY_ID") || "", hasKey: !!p.getProperty("HUB_API_KEY") }; }
function listPrefix_(prefix) {
  var all = P_().getProperties();
  return Object.keys(all).filter(function (k) { return k.indexOf(prefix) === 0; }).sort().reverse()
    .map(function (k) { try { return JSON.parse(all[k]); } catch (e) { return null; } }).filter(Boolean);
}
function sessionsList_(cur) {
  var all = P_().getProperties();
  return Object.keys(all).filter(function (k) { return k.indexOf("S_") === 0; }).map(function (k) {
    var s = JSON.parse(all[k]); return { at: s.at, device: s.device, exp: Utilities.formatDate(new Date(s.exp), "Asia/Taipei", "yyyy-MM-dd"), me: k === cur.key };
  });
}

// ---------- Google Apps Script API ----------
function gapiOpt_(method, body) {
  var opt = { method: method, muteHttpExceptions: true, headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, contentType: "application/json" };
  if (body !== undefined) opt.payload = JSON.stringify(body);
  return opt;
}
function gapi_(method, path, body) {
  var c = cfg_();
  if (!c.scriptId) throw new Error("還沒填中央 App 的指令碼 ID（設定分頁）");
  return gapiRes_(UrlFetchApp.fetch(API_ + c.scriptId + path, gapiOpt_(method, body)));
}
// 好幾個查詢一起送（同時跑，比一個一個等快很多）；回傳順序跟 paths 一樣，失敗的那格是 Error
function gapiAll_(paths) {
  var c = cfg_();
  if (!c.scriptId) throw new Error("還沒填中央 App 的指令碼 ID（設定分頁）");
  var reqs = paths.map(function (p) { var o = gapiOpt_("get"); o.url = API_ + c.scriptId + p; return o; });
  return UrlFetchApp.fetchAll(reqs).map(function (res) { try { return gapiRes_(res); } catch (e) { return e; } });
}
function gapiRes_(res) {
  var code = res.getResponseCode(), txt = res.getContentText();
  var j = {};
  try { j = JSON.parse(txt || "{}"); } catch (e) {}
  if (code >= 300) {
    var msg = j.error && j.error.message ? j.error.message : txt.slice(0, 300);
    var hint = "";
    var proj = (msg.match(/project[= ](\d{5,})/) || [])[1];
    if (/User has not enabled the Apps Script API/i.test(msg)) hint = "（你的帳號還沒打開：到 https://script.google.com/home/usersettings 打開「Google Apps Script API」）";
    else if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) hint = "（是「後台這個專案」用的 Google Cloud 專案" + (proj ? " " + proj : "") + " 沒有啟用 Apps Script API，要把後台接到自己的 Cloud 專案，照設定頁的說明做）";
    else if (code === 403 || code === 404) hint = "（後台的擁有者帳號可能沒有中央 App 的編輯權限，或指令碼 ID 填錯）";
    throw new Error("Google 回覆錯誤（" + code + "）" + hint + "｜原文：" + msg.slice(0, 300));
  }
  return j;
}
function deployInfo_() {
  var c = cfg_();
  if (!c.scriptId || !c.deployId) return { needCfg: true, cfg: c };
  // 四個查詢同時送（以前一個等一個，加上每次都把正式版的程式整包下載下來比對，所以很慢）
  var r = gapiAll_(["/content", "/deployments/" + c.deployId, "/versions?pageSize=50", "/deployments?pageSize=50"]);
  if (r[0] instanceof Error) throw r[0];
  if (r[1] instanceof Error) throw r[1];
  var content = r[0], dep = r[1];
  var files = (content.files || []).map(function (f) { return { name: f.name, type: f.type, size: String(f.source || "").length, ver: verIn_(f.source) }; });
  var cur = dep.deploymentConfig ? dep.deploymentConfig.versionNumber : null;
  var wa = webappOf_(dep);
  var accessOk = !wa || (wa.access === HUB_WEBAPP_.access && wa.executeAs === HUB_WEBAPP_.executeAs);
  var vers = r[2] instanceof Error ? [] : (r[2].versions || []);
  vers = vers.map(function (v) { return { n: v.versionNumber, desc: v.description || "", at: v.createTime ? Utilities.formatDate(new Date(v.createTime), "Asia/Taipei", "yyyy-MM-dd HH:mm") : "" }; })
    .sort(function (x, y) { return y.n - x.n; }).slice(0, 30);
  var dev = "";
  if (!(r[3] instanceof Error)) { var head = (r[3].deployments || []).filter(function (d) { return !d.deploymentConfig || !d.deploymentConfig.versionNumber; })[0]; if (head) dev = "https://script.google.com/macros/s/" + head.deploymentId + "/dev"; }
  return { cfg: c, files: files, current: cur, versions: vers, webapp: wa, accessOk: accessOk, headVer: files.map(function (f) { return f.ver; }).filter(Boolean)[0] || "",
    devUrl: dev, pending: pending_(content, cur), auto: autoInfo_() };
}
// 測試網址：Google 內建的測試部署（/dev），永遠跑專案裡最新上傳的檔案；只有中央 App 有編輯權限的帳號打得開
function devUrl_() {
  try {
    var list = gapi_("get", "/deployments?pageSize=50").deployments || [];
    var head = list.filter(function (d) { return !d.deploymentConfig || !d.deploymentConfig.versionNumber; })[0];
    return head ? "https://script.google.com/macros/s/" + head.deploymentId + "/dev" : "";
  } catch (e) { return ""; }
}
// 專案裡的檔案（測試版）跟正式網址用的版本一不一樣：一樣就不用發佈
function filesSig_(files) { return JSON.stringify((files || []).map(function (f) { return [f.name, f.type, f.source]; }).sort()); }
function sigHash_(files) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, filesSig_(files), Utilities.Charset.UTF_8)); }
// 正式版某一版的內容永遠不會變：比對用的指紋算一次就記住，之後不用再整包下載
function verSig_(n) {
  var k = "VSIG_" + n, p = P_(), h = p.getProperty(k);
  if (!h) { h = sigHash_(gapi_("get", "/content?versionNumber=" + n).files); p.setProperty(k, h); }
  return h;
}
function pending_(content, cur) {
  if (!cur) return true;
  try { return sigHash_(content.files) !== verSig_(cur); } catch (e) { return null; }
}
// 每天早上 9 點：測試版有新東西，就自動發佈成正式版（除錯要馬上發佈的，按「立刻發佈」）
function autoInfo_() {
  var on = false, err = "";
  try { on = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "autoPromote"; }); }
  catch (e) { err = "後台還沒授權建立排程：到後台的 Apps Script 編輯器，上面選「authorizeOnce」按「執行」，照畫面允許"; }
  return { on: on, last: P_().getProperty("AUTO_LAST") || "", err: err };
}
// 第一次用（或加了新權限後）在編輯器執行一次，讓 Google 跳出授權畫面；不會改任何東西
function authorizeOnce() { ScriptApp.getProjectTriggers(); UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true }); CalendarApp.getDefaultCalendar().getName(); Logger.log("授權完成"); }
function autoSet_(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "autoPromote") ScriptApp.deleteTrigger(t); });
  if (on) ScriptApp.newTrigger("autoPromote").timeBased().everyDays(1).atHour(9).nearMinute(0).inTimezone("Asia/Taipei").create();
  log_(on ? "打開每天 9 點自動發佈" : "關掉每天 9 點自動發佈", true, "");
  return autoInfo_();
}
function autoPromoteUnlocked_() {
  var stamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm");
  try {
    var c = cfg_(); if (!c.scriptId || !c.deployId) return;
    var content = gapi_("get", "/content"), dep = gapi_("get", "/deployments/" + c.deployId);
    var cur = dep.deploymentConfig ? dep.deploymentConfig.versionNumber : null;
    var pending = pending_(content, cur);
    if (pending === null) throw new Error("無法核對正式版指紋，停止自動發布");
    if (pending === false) { P_().setProperty("AUTO_LAST", stamp + " 沒有新東西，不用發佈"); return; }
    releaseApproval_(content, c, cur);
    var hv = (content.files || []).map(function (f) { return verIn_(f.source); }).filter(Boolean)[0] || "";
    // 測試版比正式版舊（例如用「除錯發佈」直接把新版發到正式版、測試版沒跟上）：不要自動發佈，不然正式版會被退回舊版
    var pv = "";
    try { pv = (gapi_("get", "/content?versionNumber=" + cur).files || []).map(function (f) { return verIn_(f.source); }).filter(Boolean)[0] || ""; } catch (pe) {}
    if (hv && pv && verCmp_(hv, pv) < 0) {
      P_().setProperty("AUTO_LAST", stamp + " 沒有發佈：測試版（" + hv + "）比正式版（" + pv + "）舊");
      log_("9 點自動發佈跳過：測試版 " + hv + " 比正式版 " + pv + " 舊，請把最新檔案上傳到測試版", false, "自動排程");
      return;
    }
    var r = deploy_({ desc: (hv || "更新") + "（每天 9 點自動發佈）", device: "自動排程", autoRelease: true });
    P_().setProperty("AUTO_LAST", stamp + " 發佈第 " + r.version + " 版（" + hv + "）");
  } catch (e) {
    P_().setProperty("AUTO_LAST", stamp + " 失敗：" + String(e && e.message || e).slice(0, 200));
    log_("每天 9 點自動發佈失敗：" + String(e && e.message || e).slice(0, 100), false, "自動排程");
  }
}
// 比版本：2026.10.52m 這種格式（年.月.號碼＋字母）；a 比 b 舊回傳負數，看不懂回傳 0
function verCmp_(a, b) {
  var p = function (v) { var m = String(v || "").match(/^(\d+)\.(\d+)\.(\d+)([a-z]*)$/); return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4]] : null; };
  var x = p(a), y = p(b);
  if (!x || !y) return 0;
  for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  if (x[3].length !== y[3].length) return x[3].length - y[3].length;
  return x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : 0;
}
// 從程式碼裡找版本號（var LIB_VERSION_ = "2026.10.31a"）
function verIn_(src) { var m = String(src || "").match(/LIB_VERSION_\s*=\s*"([^"]+)"/); return m ? m[1] : ""; }

// 上傳：files [{ target: 專案裡的檔名, source }]；只會取代已經存在的檔案，不會新增或刪除
function uploadUnlocked_(a) {
  var list = a.files || [];
  if (!list.length) throw new Error("沒有檔案");
  var content = gapi_("get", "/content"), files = content.files || [];
  var names = files.map(function (f) { return f.name; });
  var changed = [];
  list.forEach(function (u) {
    var i = names.indexOf(String(u.target));
    if (i < 0) throw new Error("中央 App 裡沒有「" + u.target + "」這個檔案（有的是：" + names.join("、") + "）");
    var src = String(u.source || "");
    if (src.length < 20) throw new Error("「" + u.target + "」內容是空的");
    if (files[i].type === "JSON") JSON.parse(src); // 設定檔格式要對
    if (files[i].type === "SERVER_JS" && /<\/?html|<!doctype/i.test(src.slice(0, 500))) throw new Error("「" + u.target + "」看起來是網頁檔，不是程式檔，是不是選錯了？");
    if (files[i].type === "HTML" && /^\s*(var|function|\/\/)/.test(src) && !/<html|<script|<div/i.test(src.slice(0, 3000))) throw new Error("「" + u.target + "」看起來是程式檔，不是網頁檔，是不是選錯了？");
    files[i] = { name: files[i].name, type: files[i].type, source: src };
    changed.push(u.target);
  });
  gapi_("put", "/content", { files: files });
  log_("上傳檔案：" + changed.join("、"), true, a.device);
  return { changed: changed, headVer: files.map(function (f) { return verIn_(f.source); }).filter(Boolean)[0] || "" };
}
// 部署：把目前的檔案存成一個新版本，正式網址換到這個版本
// 中央 App 一定要是「用打開的人的身分執行、任何有 Google 帳號的人都能開」，不然別人會看到「無法開啟這個檔案」。
// 用 API 部署時，這兩個設定是照專案裡 appsscript.json 的 webapp 來的，所以部署前先確認、不對就改好。
var HUB_WEBAPP_ = { executeAs: "USER_ACCESSING", access: "ANYONE" };
function hubManifestFix_(content) {
  var files = content.files || [], i = -1;
  files.forEach(function (f, k) { if (f.name === "appsscript" && f.type === "JSON") i = k; });
  if (i < 0) throw new Error("中央 App 找不到 appsscript.json");
  var m = JSON.parse(files[i].source || "{}"), w = m.webapp || {};
  if (w.executeAs === HUB_WEBAPP_.executeAs && w.access === HUB_WEBAPP_.access) return false;
  m.webapp = { executeAs: HUB_WEBAPP_.executeAs, access: HUB_WEBAPP_.access };
  files[i] = { name: files[i].name, type: files[i].type, source: JSON.stringify(m, null, 2) };
  gapi_("put", "/content", { files: files });
  return true;
}
function webappOf_(dep) {
  var w = null;
  (dep && dep.entryPoints || []).forEach(function (e) { if (e.entryPointType === "WEB_APP" && e.webApp) w = e.webApp.entryPointConfig || {}; });
  return w;
}
function deployUnlocked_(a) {
  var c = cfg_();
  var content = gapi_("get", "/content");
  var approved = null;
  if (a.autoRelease) {
    var currentDep = gapi_("get", "/deployments/" + c.deployId);
    approved = releaseApproval_(content, c, currentDep.deploymentConfig && currentDep.deploymentConfig.versionNumber);
  }
  var fixed = a.autoRelease ? false : hubManifestFix_(content);
  if (fixed) { log_("部署前修正中央 App 的網頁存取設定", true, a.device); content = gapi_("get", "/content"); }
  var hv = (content.files || []).map(function (f) { return verIn_(f.source); }).filter(Boolean)[0] || "";
  var desc = String(a.desc || "").trim() || hv || now_();
  var v = gapi_("post", "/versions", { description: desc.slice(0, 200) });
  if (approved) {
    // Check immutable version content, not mutable HEAD, before touching production.
    var frozen = gapi_("get", "/content?versionNumber=" + v.versionNumber);
    var cfgNow = cfg_(), depNow = gapi_("get", "/deployments/" + c.deployId);
    var nowApproval = releaseApproval_(frozen, cfgNow, depNow.deploymentConfig && depNow.deploymentConfig.versionNumber);
    if (cfgNow.scriptId !== c.scriptId || cfgNow.deployId !== c.deployId ||
        nowApproval.record !== approved.record || nowApproval.signature !== approved.signature)
      throw new Error("建立版本期間內容、核准或正式部署已變更，停止發布");
  }
  P_().deleteProperty(RELEASE_APPROVAL_PROP_);
  var dep = gapi_("put", "/deployments/" + c.deployId, { deploymentConfig: { scriptId: c.scriptId, versionNumber: v.versionNumber, manifestFileName: "appsscript", description: desc.slice(0, 200) } });
  log_("部署第 " + v.versionNumber + " 版（" + desc.slice(0, 40) + "）", true, a.device);
  return { version: v.versionNumber, desc: desc, deployed: dep.deploymentConfig ? dep.deploymentConfig.versionNumber : v.versionNumber, fixedAccess: fixed };
}
// 除錯發佈：拿「正式網址現在用的版本」的檔案，換掉這次上傳的幾個，發佈成正式版；
// 專案裡的檔案（測試版）先存起來，發佈完放回去，所以測試中的新功能不會被一起發佈，測試版也不會被蓋掉
function hotfixUnlocked_(a) {
  var c = cfg_(), list = a.files || [];
  if (!list.length) throw new Error("沒有檔案");
  var dep0 = gapi_("get", "/deployments/" + c.deployId), cur = dep0.deploymentConfig ? dep0.deploymentConfig.versionNumber : null;
  if (!cur) throw new Error("正式網址還沒有版本，請先用一般的發佈");
  var head = gapi_("get", "/content"), headFiles = head.files || [];
  var prod = (gapi_("get", "/content?versionNumber=" + cur).files || []).map(function (f) { return { name: f.name, type: f.type, source: f.source }; });
  var names = prod.map(function (f) { return f.name; }), changed = [];
  list.forEach(function (u) {
    var i = names.indexOf(String(u.target));
    if (i < 0) throw new Error("正式版裡沒有「" + u.target + "」這個檔案");
    var src = String(u.source || "");
    if (src.length < 20) throw new Error("「" + u.target + "」內容是空的");
    if (prod[i].type === "JSON") JSON.parse(src);
    prod[i] = { name: prod[i].name, type: prod[i].type, source: src };
    changed.push(u.target);
  });
  var hv = prod.map(function (f) { return verIn_(f.source); }).filter(Boolean)[0] || "";
  var desc = (String(a.desc || "").trim() || hv || "除錯") + "（除錯發佈，測試版不動）", r = null;
  try {
    gapi_("put", "/content", { files: prod });
    r = deploy_({ desc: desc, device: a.device });
  } finally {
    gapi_("put", "/content", { files: headFiles }); // 測試版放回去
  }
  log_("除錯發佈：" + changed.join("、") + "（以第 " + cur + " 版為底，測試版已放回）", true, a.device);
  return { version: r.version, desc: desc, base: cur, changed: changed, ver: hv };
}
// 正式版的程式（給 Claude 除錯用：要用正式版當底改）
function prodFiles_() {
  var c = cfg_(), dep = gapi_("get", "/deployments/" + c.deployId), cur = dep.deploymentConfig ? dep.deploymentConfig.versionNumber : null;
  if (!cur) throw new Error("正式網址還沒有版本");
  var files = (gapi_("get", "/content?versionNumber=" + cur).files || []).map(function (f) { return { name: f.name, type: f.type, source: f.source }; });
  return { version: cur, ver: files.map(function (f) { return verIn_(f.source); }).filter(Boolean)[0] || "", files: files };
}
// 回到以前的版本（只換正式網址用的版本，檔案不動；下次上傳部署就是新的）
function rollbackUnlocked_(a) {
  var c = cfg_(), n = Number(a.version);
  if (!(n > 0)) throw new Error("請選版本");
  var dep = gapi_("put", "/deployments/" + c.deployId, { deploymentConfig: { scriptId: c.scriptId, versionNumber: n, manifestFileName: "appsscript", description: "回到第 " + n + " 版" } });
  log_("回到第 " + n + " 版", true, a.device);
  return { deployed: dep.deploymentConfig ? dep.deploymentConfig.versionNumber : n };
}

// ---------- 更新後台自己（手機上傳 後台.gs 就好，不用開 Apps Script 編輯器）----------
function selfApi_(method, path, body) { return gapiRes_(UrlFetchApp.fetch(API_ + ScriptApp.getScriptId() + path, gapiOpt_(method, body))); }
function selfDepId_() { var m = String(ScriptApp.getService().getUrl() || "").match(/\/s\/([A-Za-z0-9_-]+)\/(exec|dev)/); return m ? m[1] : ""; }
function selfInfo_() {
  var dep = null, vers = [], depId = selfDepId_();
  try { if (depId) dep = selfApi_("get", "/deployments/" + depId); } catch (e) {}
  try { vers = (selfApi_("get", "/versions?pageSize=50").versions || []).sort(function (a, b) { return b.versionNumber - a.versionNumber; }).slice(0, 6).map(function (v) { return { n: v.versionNumber, desc: v.description || "", at: v.createTime || "" }; }); } catch (e) {}
  return { ver: ADMIN_VER_, deployId: depId, current: dep && dep.deploymentConfig ? dep.deploymentConfig.versionNumber : null, versions: vers };
}
// 檢查上傳的程式：要是後台的程式、不能有錯字（語法錯誤會讓後台整個打不開）
function selfCheck_(src) {
  src = String(src || "");
  if (src.length < 2000) throw new Error("檔案太短，不像是完整的後台程式");
  if (!/function doPost\(/.test(src) || !/function api_\(/.test(src) || !/ADMIN_VER_/.test(src)) throw new Error("這不是後台的程式（後台.gs）。中央 App 的檔案請到「🚀 部署」上傳");
  try { new Function(src); } catch (e) { if (e instanceof SyntaxError) throw new Error("程式有錯字，沒有更新：" + e.message); }
  var m = src.match(/ADMIN_VER_\s*=\s*"([^"]+)"/);
  return m ? m[1] : "";
}
function selfUpdate_(a) {
  var src = String(a.source || ""), nv = selfCheck_(src), depId = selfDepId_();
  if (!depId) throw new Error("讀不到後台自己的網址，請到 Apps Script 編輯器手動部署一次");
  var content = selfApi_("get", "/content"), files = content.files || [];
  var srv = files.filter(function (f) { return f.type === "SERVER_JS"; });
  var tgt = srv.length === 1 ? srv[0] : srv.filter(function (f) { return /function doPost\(/.test(f.source || ""); })[0];
  if (!tgt) throw new Error("找不到後台的程式檔");
  var oldSrc = tgt.source;
  if (oldSrc === src) return { same: true, ver: nv };
  var dep0 = selfApi_("get", "/deployments/" + depId), prev = dep0.deploymentConfig ? dep0.deploymentConfig.versionNumber : null;
  tgt.source = src;
  selfApi_("put", "/content", { files: files });
  var v = selfApi_("post", "/versions", { description: ("後台 " + (nv || "") + " 手機更新").slice(0, 200) });
  selfApi_("put", "/deployments/" + depId, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: v.versionNumber, manifestFileName: "appsscript", description: ("後台 " + (nv || "")).slice(0, 200) } });
  // 確認新版打得開；打不開就自動退回原本的版本，程式也放回去
  var ok = false;
  for (var t = 0; t < 4 && !ok; t++) { // 新版剛上線可能要等幾秒
    if (t) Utilities.sleep(2500);
    try { var r = UrlFetchApp.fetch(ScriptApp.getService().getUrl(), { muteHttpExceptions: true, followRedirects: true }); ok = r.getResponseCode() === 200 && /資產配置後台/.test(r.getContentText()); } catch (e) {}
  }
  if (!ok && prev) {
    selfApi_("put", "/deployments/" + depId, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: prev, manifestFileName: "appsscript", description: "自動退回（新版打不開）" } });
    tgt.source = oldSrc; selfApi_("put", "/content", { files: files });
    log_("更新後台失敗，已自動退回第 " + prev + " 版", false, a.device);
    throw new Error("新的後台程式打不開，已經自動退回原本的版本（第 " + prev + " 版），沒有任何改變");
  }
  log_("更新後台程式到 " + (nv || "新版") + "（第 " + v.versionNumber + " 版）", true, a.device);
  return { version: v.versionNumber, ver: nv, prev: prev };
}
function selfRollback_(a) {
  var n = Number(a.version), depId = selfDepId_();
  if (!(n > 0) || !depId) throw new Error("請選版本");
  selfApi_("put", "/deployments/" + depId, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: n, manifestFileName: "appsscript", description: "後台回到第 " + n + " 版" } });
  log_("後台回到第 " + n + " 版", true, a.device);
  return { deployed: n };
}

// ---------- 用你的身分問中央 App ----------
// 中央 App 是「用打開的人的身分執行」，所以帶著你的 Google 憑證去問，它就知道是管理員
function hubFetch_(method, body) {
  var url = cfg_().hubUrl;
  if (!url) throw new Error("還沒填中央 App 的網址（設定分頁）");
  var opt = { method: method, muteHttpExceptions: true, followRedirects: true, headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } };
  if (body !== undefined) { opt.payload = JSON.stringify(body); opt.contentType = "text/plain"; }
  return UrlFetchApp.fetch(url, opt);
}
function hub_(op, arg) {
  if (!/^[A-Za-z]{2,20}$/.test(op)) throw new Error("動作不對");
  var res = hubFetch_("post", { op: op, arg: arg, key: P_().getProperty("HUB_API_KEY") || "" });
  var txt = res.getContentText(), j = null;
  try { j = JSON.parse(txt); } catch (e) {}
  if (!j) {
    var title = (txt.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
    var body = txt.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error("中央 App 沒有正常回覆（" + res.getResponseCode() + "）。" + (/doPost/.test(txt) ? "正式網址還是舊版（沒有 doPost），請把中央 App 部署成新版本。" : "") + "｜" + title + " " + body);
  }
  if (!j.ok) throw new Error(j.error || "中央 App 回覆錯誤");
  return j.data;
}
// 正式網址現在實際跑的是哪一版（問中央 App 自己）
function liveVer_() {
  try { return String(hub_("ping", {}).ver || ""); } catch (e) { return ""; }
}

// 🏠 實價登錄估價資料：GitHub 上的 re/base.json 是哪一季的、該不該更新
// 內政部每季結束後下個月的 1、11、21 日陸續公布；保守一點，季後第一個月 11 日以後算「已經公布」
function reSeasonAvail_() {
  var d = new Date(Date.now() + 8 * 3600e3), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  var q = Math.floor((m - 1) / 3); // 現在這一季之前的那一季：q（0＝去年第4季）
  var firstMonthOfThisQ = q * 3 + 1;
  if (m === firstMonthOfThisQ && day < 11) q -= 1; // 季後第一個月 11 日前，上一季還不算公布
  var yy = y - 1911; if (q <= 0) { q += 4; yy -= 1; }
  return yy + "S" + q;
}
function reSeasonNext_(s) { var y = parseInt(s, 10), q = Number(s.slice(-1)); q++; if (q > 4) { q = 1; y++; } return y + "S" + q; }
function reSeasonCmp_(a, b) { var f = function (s) { return parseInt(s, 10) * 10 + Number(String(s).slice(-1)); }; return f(a) - f(b); }
function reData_() {
  var url = "https://casper1122-cyber.github.io/app-install/re/base.json", res = UrlFetchApp.fetch(url + "?t=" + Date.now(), { muteHttpExceptions: true });
  var avail = reSeasonAvail_();
  if (res.getResponseCode() !== 200) return { ok: false, why: "讀不到 GitHub 上的 re/base.json（" + res.getResponseCode() + "）", avail: avail };
  var b = JSON.parse(res.getContentText()), cur = b.season || "", need = [];
  if (cur) { var s = reSeasonNext_(cur), g = 0; while (reSeasonCmp_(s, avail) <= 0 && g++ < 12) { need.push(s); s = reSeasonNext_(s); } }
  var mo = reMonthDue_(b.through || "");
  return { ok: true, season: cur, avail: avail, need: need, through: b.through || "", pthrough: b.pthrough || "", n: b.n || 0, monthNeed: mo.need, expect: mo.expect, nextDue: mo.next };
}
// 每月更新：內政部每月 1、11、21 日公布新一期；11 日以後上個月的成交大多登錄了。資料只到上上個月以前就該更新
function reMonthDue_(through) {
  var d = new Date(Date.now() + 8 * 3600e3), yy = d.getUTCFullYear() - 1911, mm = d.getUTCMonth() + 1, day = d.getUTCDate();
  var back = day >= 11 ? 1 : 2, y = yy, m = mm - back; while (m <= 0) { m += 12; y--; }
  var exp = y + "/" + ("0" + m).slice(-2), need = !!through && through < exp;
  var nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (day >= 11 ? 1 : 0), 11));
  return { need: need, expect: exp, next: need ? Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd") : Utilities.formatDate(nd, "UTC", "yyyy-MM-dd") };
}

// ---------- 📅 待辦日曆：要處理的事（實價登錄每月更新＋自己加的），可以同步到 Google 日曆 ----------
function todos_() { try { return JSON.parse(P_().getProperty("TODOS") || "[]"); } catch (e) { return []; } }
function todosPut_(l) { P_().setProperty("TODOS", JSON.stringify(l.slice(-200))); }
function todoList_() {
  var r = {}; try { r = reData_(); } catch (e) {}
  var auto = [];
  if (r.ok) auto.push({ id: "auto_re", date: r.nextDue, title: "更新實價登錄資料" + (r.monthNeed ? "（該更新了：資料到 " + r.through + "，應該要有 " + r.expect + "）" : "（每月 11 日後）"), auto: true, warn: !!r.monthNeed });
  var cal = P_().getProperty("CAL_RE_SERIES") || "";
  return { list: auto.concat(todos_().filter(function (t) { return !t.done; })).sort(function (a, b) { return a.date < b.date ? -1 : 1; }), done: todos_().filter(function (t) { return t.done; }).slice(-20).reverse(), calRe: !!cal };
}
function calEvent_(t) {
  var cal = CalendarApp.getDefaultCalendar(), d = new Date(t.date + "T09:00:00+08:00");
  var ev = cal.createEvent("【資產配置】" + t.title, d, new Date(d.getTime() + 30 * 60000), { description: (t.note || "") + "\n\n從資產配置後台加的" });
  ev.addPopupReminder(60); ev.addEmailReminder(24 * 60);
  return ev.getId();
}
function todoAdd_(a) {
  var date = String(a.date || ""), title = String(a.title || "").trim().slice(0, 80);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式不對");
  if (!title) throw new Error("請填要做什麼");
  var t = { id: "T" + Date.now().toString(36), date: date, title: title, note: String(a.note || "").slice(0, 300), done: false };
  if (a.cal) t.evId = calEvent_(t);
  var l = todos_(); l.push(t); todosPut_(l);
  return todoList_();
}
function todoDone_(a) { var l = todos_(); l.forEach(function (t) { if (t.id === a.id) { t.done = !t.done; t.doneAt = now_(); } }); todosPut_(l); return todoList_(); }
function todoDel_(a) {
  var l = todos_(), t = l.filter(function (x) { return x.id === a.id; })[0];
  if (t && t.evId) { try { var ev = CalendarApp.getDefaultCalendar().getEventById(t.evId); if (ev) ev.deleteEvent(); } catch (e) {} }
  todosPut_(l.filter(function (x) { return x.id !== a.id; })); return todoList_();
}
// 每月 11 日早上 9 點的重複提醒（只建一次）
function calSync_() {
  var p = P_(), old = p.getProperty("CAL_RE_SERIES");
  if (old) { try { var s0 = CalendarApp.getDefaultCalendar().getEventSeriesById(old); if (s0) return { ok: true, already: true, list: todoList_() }; } catch (e) {} }
  var d = new Date(), y = d.getFullYear(), m = d.getMonth() + (d.getDate() >= 11 ? 1 : 0), st = new Date(Date.UTC(y, m, 11, 1, 0)); // 台北 9:00
  var desc = "內政部每月 1、11、21 日公布新一期實價登錄。\n1. 打開 https://plvr.land.moi.gov.tw/DownloadOpenData\n2. 下載上次更新之後的每一期（CSV、進階下載，臺北市、新北市、桃園市的「不動產買賣」「預售屋買賣」）\n3. zip 傳給 Claude，說「更新實價登錄」\n4. 照 Claude 說的傳到 GitHub 的 app-install/re";
  var ser = CalendarApp.getDefaultCalendar().createEventSeries("【資產配置】更新實價登錄資料", st, new Date(st.getTime() + 30 * 60000), CalendarApp.newRecurrence().addMonthlyRule().onlyOnMonthDay(11), { description: desc });
  ser.addPopupReminder(60); ser.addEmailReminder(24 * 60);
  p.setProperty("CAL_RE_SERIES", ser.getId());
  return { ok: true, list: todoList_() };
}
// Automatic releases require explicit approval of exact content and production base.
var RELEASE_APPROVAL_PROP_ = "RELEASE_APPROVAL_V1";
var RELEASE_LOCK_DEPTH_ = 0;
function withReleaseLock_(fn) {
  if (RELEASE_LOCK_DEPTH_ > 0) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  RELEASE_LOCK_DEPTH_++;
  try { return fn(); }
  finally { RELEASE_LOCK_DEPTH_--; lock.releaseLock(); }
}
function releaseManifestCheck_(content) {
  var f = (content.files || []).filter(function (f) { return f.name === "appsscript" && f.type === "JSON"; })[0];
  var m = f && JSON.parse(f.source), w = m && m.webapp;
  if (!w || w.executeAs !== HUB_WEBAPP_.executeAs || w.access !== HUB_WEBAPP_.access)
    throw new Error("中央存取設定不正確，請先核對修正並重新測試；自動發布不會代改設定");
}
function releaseApproval_(content, cfg, current) {
  var raw = P_().getProperty(RELEASE_APPROVAL_PROP_), a;
  try { a = JSON.parse(raw || "null"); } catch (e) { a = null; }
  if (!a || !a.signature || a.scriptId !== cfg.scriptId || a.deployId !== cfg.deployId ||
      a.baseVersion !== current || a.signature !== sigHash_(content.files))
    throw new Error("尚未核准這份測試版，或核准後程式／正式版本已變更；保留正式版");
  releaseManifestCheck_(content);
  return { record: raw, signature: a.signature };
}
// Run in the backend editor only AFTER testing. This does not deploy or change triggers.
function approveTestRelease() {
  return withReleaseLock_(function () {
    var c = cfg_();
    if (!c.scriptId || !c.deployId) throw new Error("請先設定中央專案與正式部署");
    var content = gapi_("get", "/content"), dep = gapi_("get", "/deployments/" + c.deployId);
    var cur = dep.deploymentConfig && dep.deploymentConfig.versionNumber;
    if (!cur || pending_(content, cur) !== true) throw new Error("無法確認有待發布變更，不予核准");
    releaseManifestCheck_(content);
    var a = { scriptId: c.scriptId, deployId: c.deployId, baseVersion: cur,
      signature: sigHash_(content.files), approvedAt: now_() };
    P_().setProperty(RELEASE_APPROVAL_PROP_, JSON.stringify(a));
    log_("已人工確認測試通過，核准目前內容於排程發布；修改後需重新核准", true, "編輯器");
    return { approved: true, signature: a.signature, baseVersion: cur };
  });
}
function revokeTestRelease() {
  return withReleaseLock_(function () {
    P_().deleteProperty(RELEASE_APPROVAL_PROP_);
    return { approved: false };
  });
}
function upload_(a) { return withReleaseLock_(function () { P_().deleteProperty(RELEASE_APPROVAL_PROP_); return uploadUnlocked_(a); }); }
function deploy_(a) { return withReleaseLock_(function () { return deployUnlocked_(a); }); }
function hotfix_(a) { return withReleaseLock_(function () { P_().deleteProperty(RELEASE_APPROVAL_PROP_); return hotfixUnlocked_(a); }); }
function rollback_(a) { return withReleaseLock_(function () { P_().deleteProperty(RELEASE_APPROVAL_PROP_); return rollbackUnlocked_(a); }); }
function autoPromote() { return withReleaseLock_(function () { return autoPromoteUnlocked_(); }); }
