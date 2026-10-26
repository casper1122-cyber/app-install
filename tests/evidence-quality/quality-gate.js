/* Evidence gate. No synthetic risk estimates; does not change the live grading engine. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.AssetEvidenceGate=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function check(record){
const errors=[];
if(!record||typeof record!=="object")return {status:"insufficient",grade:null,reasons:["沒有評級輸入資料"]};
if(!record.assetId)errors.push("缺資產唯一識別");
if(!record.modelVersion)errors.push("缺模型版本");
if(!record.asOf||!/^\d{4}-\d{2}-\d{2}$/.test(record.asOf))errors.push("缺有效資料截至日期");
if(!record.source||!record.source.name||!record.source.url||!record.source.retrievedAt)errors.push("缺可追溯資料來源");
if(!record.peerDefinition)errors.push("缺同類比較母體定義");
if(!Array.isArray(record.transactions)||record.transactions.length===0)errors.push("沒有逐筆可核驗的成交資料");
else if(record.transactions.some(t=>!t.date||!finite(t.price)||t.price<=0||!t.currency||!t.sourceId))errors.push("存在不完整成交紀錄");
if(!record.calibration||!record.calibration.method||!record.calibration.testPeriod||!finite(record.calibration.outOfSampleError))errors.push("缺校準方法及樣本外誤差");
if(!record.risk||!finite(record.risk.expectedRealLoss10y)||record.risk.expectedRealLoss10y<0||!record.risk.method)errors.push("缺經驗證的十年實質預期損失");
if(errors.length)return {status:"insufficient",grade:null,reasons:errors};
return {status:"evidence-ready",grade:null,reasons:[],expectedRealLoss10y:record.risk.expectedRealLoss10y,note:"來源完整性通過；須另經模型與評級映射驗證，不預設CCC"};
}
return {check};
});