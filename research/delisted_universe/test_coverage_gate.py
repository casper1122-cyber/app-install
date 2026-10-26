import unittest
from pathlib import Path
from coverage_gate import load_54h,check
class Smoke(unittest.TestCase):
 def test_known_absent_codes_and_transfer(self):
  p=Path('/mnt/data/網站_54h.zip')
  if not p.exists():self.skipTest('user 54h backup not mounted')
  a=load_54h(p)
  self.assertEqual(len(a),1977)
  for code in ('2841','2384','2398'):self.assertNotIn(code,a)
  self.assertEqual(a['6423']['mk'],'上櫃')
 def test_corporate_action_is_not_100pct_loss(self):
  x=check({'6423':{'n':'億而得','mk':'上櫃'}},[
   {'code':'6423','name':'億而得-創','date':'2026-01-22'},
   {'code':'2841','name':'台開','date':'2022-08-04'}])
  self.assertEqual(x['missing'],1)
  self.assertEqual(x['ambiguous_or_migrated'],1)
  self.assertFalse(x['can_derive_loss_probability'])
if __name__=='__main__':unittest.main()
