import unittest, tempfile, json
from pathlib import Path
from twse_openapi_adapter import adapt_openapi
from import_twse_snapshots import import_directory
S=[{'Date':'20251231','Code':'2330','PEratio':'25.5','PBratio':'6.4','DividendYield':'1.8'}, {'Date':'20251231','Code':'1101','PEratio':'--','PBratio':'1.4','DividendYield':'2.1'}]
class Test(unittest.TestCase):
 def test_valid(self):
  with tempfile.TemporaryDirectory() as t:
   Path(t,'20251231.json').write_text(json.dumps(S))
   rows,stats=import_directory(Path(t))
   self.assertEqual(stats['accepted_files'],1)
   self.assertEqual(len(rows),5)
   self.assertTrue(all(r['published_at'] is None for r in rows))
 def test_row_date_mismatch(self):
  with tempfile.TemporaryDirectory() as t:
   bad=[dict(S[0]),dict(S[1],Date='20251230')]
   Path(t,'20251231.json').write_text(json.dumps(bad))
   rows,stats=import_directory(Path(t))
   self.assertEqual(rows,[])
   self.assertIn('date mismatch',stats['rejected_files'][0]['reason'])
 def test_missing_row_date(self):
  with self.assertRaisesRegex(ValueError,'missing Date'):adapt_openapi([{'Code':'2330'}],'2025-12-31')
 def test_missing_row_code(self):
  with self.assertRaisesRegex(ValueError,'security code'):adapt_openapi([{'Date':'20251231'}],'2025-12-31')
 def test_empty(self):
  with self.assertRaisesRegex(ValueError,'nonempty'):adapt_openapi([],'2025-12-31')
if __name__=='__main__':unittest.main()
