const assert=require("node:assert/strict");const {check}=require("./quality-gate.js");
assert.equal(check({assetId:"card"}).grade,null);
const f={assetId:"card",modelVersion:"test",asOf:"2026-10-26",source:{name:"fixture",url:"https://example.org",retrievedAt:"2026-10-26"},peerDefinition:"same item and grade",transactions:[{date:"2026-01-01",price:100,currency:"USD",sourceId:"synthetic"}],calibration:{method:"holdout",testPeriod:"2025",outOfSampleError:0.1},risk:{expectedRealLoss10y:0.1,method:"synthetic fixture"}};
assert.equal(check(f).status,"evidence-ready");assert.equal(check(f).grade,null);
delete f.transactions[0].sourceId;assert.equal(check(f).status,"insufficient");
console.log("PASS (fixtures only; no real-world performance validated)");
