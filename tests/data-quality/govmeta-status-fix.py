# 測試候選修正：政府資料集元資料下載狀態不得把 0 成功記為成功
# 這是原 2026-10-25s 中 h_govmeta 的替換片段（勿直接執行為獨立程式）。
def h_govmeta(it):
    out = {}
    for did in it.get("ids", []):
        try:
            out[str(did)] = gov_meta(did)
        except Exception as e:
            out[str(did)] = {"id": did, "err": str(e)[:120]}
        time.sleep(1)
    gh_put("rawdata/gov/meta.json", json.dumps(out, ensure_ascii=False, indent=1).encode("utf-8"), "政府資料集說明")
    ok = len([1 for v in out.values() if not v.get("err") and v.get("dist")])
    total = len(out)
    if total == 0:
        raise RuntimeError("政府資料清單為空：未完成任何檢查")
    if ok < total:
        raise RuntimeError("政府資料集成功 %d/%d，失敗或無可用下載資源 %d（已保存詳細錯誤，會於下次重試）" % (ok, total, total - ok))
    return "查了 %d 個資料集（%d 個成功）" % (total, ok)
