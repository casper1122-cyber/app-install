import tempfile,unittest
from pathlib import Path
from audit_archive import create_ledger,validate_ledger
class TestArchive(unittest.TestCase):
 def test_modified_bytes_detected(self):
  with tempfile.TemporaryDirectory() as t:
   f=Path(t,'20251231.json');f.write_text('{"v":1}')
   rows=[{'asset_id':'2330','feature':'pe','observed_at':'2025-12-31','value':2,'local_archive':f.name}]
   ledger=create_ledger(t,rows)
   self.assertTrue(validate_ledger(t,ledger))
   self.assertEqual(rows[0]['raw_sha256'],ledger['files'][f.name]['sha256'])
   f.write_text('{"v":2}')
   self.assertFalse(validate_ledger(t,ledger))
 def test_conflicts_fail(self):
  with tempfile.TemporaryDirectory() as t:
   f=Path(t,'20251231.json');f.write_text('{}')
   item={'asset_id':'2330','feature':'pe','observed_at':'2025-12-31','local_archive':f.name}
   self.assertEqual(create_ledger(t,[dict(item,value=2),dict(item,value=3)])['status'],'fail')
 def test_missing_source_fails(self):
  with tempfile.TemporaryDirectory() as t:
   with self.assertRaisesRegex(ValueError,'missing source'):
    create_ledger(t,[{'asset_id':'2330','feature':'pe','observed_at':'2025-12-31','value':2,'local_archive':'none.json'}])
if __name__=='__main__':unittest.main()
