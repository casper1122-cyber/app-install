"""Build an INTERNAL math correction; does not validate market assumptions or deploy."""
import argparse,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('app',type=Path);p.add_argument('core',type=Path);p.add_argument('output_dir',type=Path);a=p.parse_args()
if hashlib.sha256(a.app.read_bytes()).hexdigest()!='3eea02ca2a99dcb094470addca0546cf6a8bb78bad7aba92d533d7db902216be':raise SystemExit('Unknown source revision')
for f,n in [(a.app,'App.html'),(a.core,'核心.gs')]:
 if f.resolve()==(a.output_dir/n).resolve():raise SystemExit('Refusing original overwrite')
s=a.app.read_text();start=s.index('function elCalc(P) {');end=s.index('// 本息平均攤還',start)
s=s[:start]+Path(__file__).with_name('el-calc-exact.js').read_text()+'\n'+s[end:]
s=s.replace('//   用高斯－埃爾米特積分算（不用亂數，每次算出來都一樣）','//   使用截斷對數常態解析期望值；既有EL_GH保留作舊碼比較，不再用於此函式')
c=a.core.read_text()
if c.count('var LIB_VERSION_ = "2026.10.54q";')!=1:raise SystemExit('Unexpected core marker')
a.output_dir.mkdir(parents=True,exist_ok=True)
(a.output_dir/'App.html').write_text(s)
(a.output_dir/'核心.gs').write_text(c.replace('var LIB_VERSION_ = "2026.10.54q";','var LIB_VERSION_ = "2026.10.54r";'))
print('Created internal math candidate:',a.output_dir)
