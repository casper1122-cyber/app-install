"""Conservative research readiness check. Does not certify evidence truth or approve GAS."""
import hashlib,json
from pathlib import Path

def evaluate(registry_path, root, app_path=None):
    root=Path(root).resolve();j=json.loads(Path(registry_path).read_text());problems=[]
    if j.get('complete_parameter_inventory') is not True:
        problems.append('影響結果的參數尚未完成全量登錄與程式追溯')
    groups=j.get('groups')
    if not isinstance(groups,list) or not groups:problems.append('沒有模型證據登錄');groups=[]
    ids=set()
    for g in groups:
        ident=g.get('id','未命名')
        if g.get('kind') not in ('market_model','mathematics_only','policy_and_assumptions'):problems.append(ident+'：未知證據類型')
        if not g.get('symbols'):problems.append(ident+'：缺少程式參數追溯')
        if ident in ids:problems.append(ident+'：重複識別')
        ids.add(ident)
        if g.get('review_status')!='verified_for_intended_use':
            problems.append(ident+'：尚未完成適用範圍內的研究驗證');continue
        evidence=g.get('evidence',[])
        if not evidence:problems.append(ident+'：沒有可核對證據檔')
        for e in evidence:
            path=(root/e.get('path','')).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                problems.append(ident+'：證據檔缺失或超出儲存庫');continue
            if not e.get('sha256') or hashlib.sha256(path.read_bytes()).hexdigest()!=e['sha256']:
                problems.append(ident+'：證據雜湊不符')
            if g.get('kind')=='mathematics_only' and app_path is not None:
                try:
                    result=json.loads(path.read_text())
                    if result.get('passed') is not True or result.get('tested_app_sha256')!=hashlib.sha256(Path(app_path).read_bytes()).hexdigest():
                        problems.append(ident+'：數學測試未通過或不是這份候選檔')
                except (ValueError,OSError):problems.append(ident+'：無法讀取數學測試證據')
        if g.get('kind')=='market_model':
            for field in ('source_provenance_review','time_split_oos_review','benchmark_comparison_review','uncertainty_and_applicability_review'):
                if g.get(field) is not True:problems.append(ident+'：缺少'+field)
    return {'passed':not problems,'groups_reviewed':len(groups),'blockers':problems,
            'scope':'Registry completeness, review declarations and artifact integrity; not an independent market audit.'}

if __name__=='__main__':
    import sys
    root=Path(__file__).resolve().parents[2]
    result=evaluate(sys.argv[1],root)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['passed'] else 2)
