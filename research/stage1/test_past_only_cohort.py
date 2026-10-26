import unittest
from past_only_cohort import month_cohort,previous_months
class Tests(unittest.TestCase):
 def assets(self):
  past=previous_months(2025,1)
  return {"1111":("test",{**{k:.1 for k in past},"2025-01":-.3}),
          "2222":("test",{k:.3 for k in past}),
          "3333":("test",{**{k:.2 for k in past},"2025-01":.05})}
 def test_year_rollover(self):self.assertEqual(previous_months(2025,1)[0],"2024-01")
 def test_missing_target_is_in_cohort(self):
  x=month_cohort(self.assets(),2025,1)
  self.assertEqual(len(x),3)
  self.assertEqual(sum(r["label_status"]=="missing" for r in x),1)
 def test_target_return_does_not_re_rank(self):
  a=self.assets()
  before={r["ticker"]:r["risk_decile"] for r in month_cohort(a,2025,1)}
  a["2222"][1]["2025-01"]=-.99
  after={r["ticker"]:r["risk_decile"] for r in month_cohort(a,2025,1)}
  self.assertEqual(before,after)
 def test_gapped_history_excluded(self):
  a=self.assets();del a["1111"][1]["2024-01"]
  self.assertNotIn("1111",[r["ticker"] for r in month_cohort(a,2025,1)])
if __name__=="__main__":unittest.main()
