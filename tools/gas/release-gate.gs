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
