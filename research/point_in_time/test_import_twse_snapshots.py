import json,tempfile,unittest
from pathlib import Path
from import_twse_snapshots import import_directory
from asof_join import asof_join
SAMPLE={'date':'20251231','stat':'OK','fields':['證券代號','本益比','股價淨值比','殖利率(%)'],'data':[['2330','25.5','6.4','1.8'],['1101','--','1.4','2.1']]}
class Tests(unittest.TestCase):
 def test_verified_vs_sensitivity(self):
  with tempfile.TemporaryDirectory() as t:
   Path(t,'20251231.json').write_text(json.dumps(SAMPLE))
   r,s=import_directory(Path(t),'2026-10-26T10:00:00+08:00')
   self.assertEqual(s['features'],5);self.assertEqual(s['publication_times_verified'],0)
   q=[{'asset_id':'2330','feature':'pe','decision_at':'2026-01-02T09:00:00+08:00'}]
   self.assertFalse(asof_join(r,q,mode='strict')['joined'])
   self.assertEqual(asof_join(r,q,mode='sensitivity')['joined'][0]['evidence'],'assumed')
 def test_invalid(self):
  with tempfile.TemporaryDirectory() as t:
   Path(t,'20251231.json').write_text('{bad')
   _,s=import_directory(Path(t));self.assertEqual(len(s['rejected_files']),1)
if __name__=='__main__':unittest.main()
