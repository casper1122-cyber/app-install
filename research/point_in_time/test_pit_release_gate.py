import unittest
from pit_release_gate import judge,ts
BASE={'asset_id':'2330','source_url':'https://www.twse.com.tw/','observed_at':'2025-12-31'}
class Tests(unittest.TestCase):
 def test_no_proof(self):self.assertFalse(judge(BASE,'2026-01-02T09:00:00+08:00')['allowed'])
 def test_sensitivity(self):
  r=judge(BASE,'2026-01-02T09:00:00+08:00','sensitivity');self.assertTrue(r['allowed']);self.assertEqual(r['quality'],'assumption')
 def test_same_day(self):self.assertFalse(judge(BASE,'2025-12-31T23:00:00+08:00','sensitivity')['allowed'])
 def test_official(self):
  a=dict(BASE,published_at='2026-01-01T18:00:00+08:00',publication_proof={'kind':'archived_official','url':'https://example.org/archive'})
  self.assertTrue(judge(a,'2026-01-02T09:00:00+08:00')['allowed'])
 def test_after(self):
  a=dict(BASE,published_at='2026-01-02T11:00:00+08:00',publication_proof={'kind':'archived_official','url':'https://example.org/archive'})
  self.assertFalse(judge(a,'2026-01-02T09:00:00+08:00')['allowed'])
 def test_naive(self):
  with self.assertRaises(ValueError):ts('2026-01-02T09:00:00')
if __name__=='__main__':unittest.main()
