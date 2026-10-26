"""Build a complete backend candidate from the reviewed upload. Never deploys."""
import argparse
import hashlib
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('source', type=Path)
p.add_argument('output', type=Path)
a = p.parse_args()
if a.source.resolve() == a.output.resolve():
    raise SystemExit('Refusing to overwrite original source')
if hashlib.sha256(a.source.read_bytes()).hexdigest() != '230cc0832f9a8526967177b01b83d9645af6971dcc253fbc7b7043ff4c946773':
    raise SystemExit('Unknown backend revision; review before porting')
s = a.source.read_text()
def replace(old, new):
    global s
    if s.count(old) != 1:
        raise SystemExit('Unexpected source anchor: ' + old[:80])
    s = s.replace(old, new)
replace('var ADMIN_VER_ = "2026.10.24a";', 'var ADMIN_VER_ = "2026.10.26a";')
for old, new in [('upload_', 'uploadUnlocked_'), ('deploy_', 'deployUnlocked_'), ('hotfix_', 'hotfixUnlocked_'), ('rollback_', 'rollbackUnlocked_'), ('autoPromote', 'autoPromoteUnlocked_')]:
    replace('function ' + old + '(', 'function ' + new + '(')
replace('    if (pending_(content, cur) === false) {', '    var pending = pending_(content, cur);\n    if (pending === null) throw new Error("無法核對正式版指紋，停止自動發布");\n    if (pending === false) {')
replace('    var hv = (content.files || []).map', '    releaseApproval_(content, c, cur);\n    var hv = (content.files || []).map')
replace('device: "自動排程" });\n    P_().setProperty("AUTO_LAST"', 'device: "自動排程", autoRelease: true });\n    P_().setProperty("AUTO_LAST"')
replace('  var fixed = hubManifestFix_(content);', '''  var approved = null;
  if (a.autoRelease) {
    var currentDep = gapi_("get", "/deployments/" + c.deployId);
    approved = releaseApproval_(content, c, currentDep.deploymentConfig && currentDep.deploymentConfig.versionNumber);
  }
  var fixed = a.autoRelease ? false : hubManifestFix_(content);''')
replace('  var dep = gapi_("put", "/deployments/" + c.deployId, { deploymentConfig: { scriptId: c.scriptId, versionNumber: v.versionNumber,', '''  if (approved) {
    // Check immutable version content, not mutable HEAD, before touching production.
    var frozen = gapi_("get", "/content?versionNumber=" + v.versionNumber);
    var cfgNow = cfg_(), depNow = gapi_("get", "/deployments/" + c.deployId);
    var nowApproval = releaseApproval_(frozen, cfgNow, depNow.deploymentConfig && depNow.deploymentConfig.versionNumber);
    if (cfgNow.scriptId !== c.scriptId || cfgNow.deployId !== c.deployId ||
        nowApproval.record !== approved.record || nowApproval.signature !== approved.signature)
      throw new Error("建立版本期間內容、核准或正式部署已變更，停止發布");
  }
  P_().deleteProperty(RELEASE_APPROVAL_PROP_);
  var dep = gapi_("put", "/deployments/" + c.deployId, { deploymentConfig: { scriptId: c.scriptId, versionNumber: v.versionNumber,''')
s += '\n' + Path(__file__).with_name('release-gate.gs').read_text()
a.output.parent.mkdir(parents=True, exist_ok=True)
a.output.write_text(s)
print('Created offline backend candidate:', a.output)
