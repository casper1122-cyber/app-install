"""Run the consolidated OFFLINE checks. Passing is not release approval."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import importlib.util

p=argparse.ArgumentParser()
p.add_argument('app',type=Path)
p.add_argument('--backend',type=Path,required=True)
p.add_argument('--report',type=Path,required=True)
p.add_argument('--program-checks-only',action='store_true',help='Development diagnostics only; never release readiness')
a=p.parse_args()
root=Path(__file__).resolve().parents[2]
app=a.app.resolve();backend=a.backend.resolve()
commands=[
 ('app_regressions',['node','tests/gas/regression.cjs',str(app)]),
 ('coverage_and_chart_rendering',['node','tests/gas/coverage-panel.test.cjs',str(app)]),
 ('own_history_provenance',['node','tests/gas/provenance.test.cjs',str(app)]),
 ('release_gate',['node','tests/gas/release-gate.test.cjs',str(backend)]),
 ('loss_math_kernel',[sys.executable,'tests/gas/test_el_math.py',str(app),'--report',str(a.report.resolve().with_name('el-math-run.json'))]),
 ('updater_publication_safety',[sys.executable,'-W','error::ResourceWarning','-m','unittest','discover','-s','tests/updater','-v'])]
def run(item):
 name,cmd=item
 r=subprocess.run(cmd,cwd=root,text=True,capture_output=True)
 return {'suite':name,'command':cmd,'exit_code':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(run,commands))
spec=importlib.util.spec_from_file_location('model_evidence',root/'tools/audit/check_model_evidence.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
research=module.evaluate(root/'docs/audit/model-evidence-registry.json',root,app)
program_pass=all(r['exit_code']==0 for r in results)
report={'scope':'offline program checks, not market validation or live GAS acceptance',
 'app_sha256':hashlib.sha256(app.read_bytes()).hexdigest(),
 'backend_sha256':hashlib.sha256(backend.read_bytes()).hexdigest(),
 'all_program_checks_passed':program_pass,
 'research_gate':research,
 'all_checks_passed':program_pass and research['passed'],
 'diagnostic_only':a.program_checks_only,
 'release_approval_granted':False,'requirements_ledger':'docs/MASTER_BACKLOG.md',
 'results':results}
a.report.parent.mkdir(parents=True,exist_ok=True)
a.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for r in results:print(('PASS' if r['exit_code']==0 else 'FAIL')+' '+r['suite'])
print('Research gate: '+('PASS' if research['passed'] else 'BLOCKED ('+str(len(research['blockers']))+' outstanding items)'))
print('Saved report:',a.report)
print('This result does not approve a release or close outstanding backlog acceptance criteria.')
sys.exit(0 if report['all_checks_passed'] or (a.program_checks_only and program_pass) else (1 if not program_pass else 2))
