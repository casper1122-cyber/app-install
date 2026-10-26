import unittest
from twse_pit import convert_snapshot, available_by, num, normalize_day
class Tests(unittest.TestCase):
 def setUp(self):
  snap={'pe':{'f':['證券代號','本益比','股價淨值比','殖利率(%)'],'r':[['2330','25.5','6.4','1.8'],['1101','--','1.4','2.1'],['無效','23','1','1']]}}
  self.rows=convert_snapshot(snap,observed_day='2025-12-31',source_url='https://www.twse.com.tw/test',downloaded_at='2026-10-26T12:00:00+08:00')
 def test_count(self):self.assertEqual(len(self.rows),5)
 def test_unverified(self):self.assertTrue(all(r['published_at'] is None for r in self.rows))
 def test_strict_rejects(self):self.assertFalse(available_by(self.rows[0],'2026-01-01'))
 def test_sensitivity(self):self.assertTrue(available_by(self.rows[0],'2026-01-01',mode='sensitivity'))
 def test_invalid_value(self):self.assertIsNone(num('NaN'));self.assertIsNone(num('--'))
 def test_roc_date(self):self.assertEqual(str(normalize_day('114-12-31')),'2025-12-31')
if __name__=='__main__':unittest.main()
