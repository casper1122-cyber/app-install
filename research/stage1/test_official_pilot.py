import json,unittest
from official_pilot import api_url,check
class Tests(unittest.TestCase):
 def test_two_markets(self):
  self.assertIn("date=20251230",api_url("TWSE","2025-12-30"))
  self.assertIn("114%2F12%2F30",api_url("TPEX","2025-12-30"))
 def test_twse_accepts_dated_records_not_publication_proof(self):
  a={"stat":"OK","date":"20251230","fields":["證券代號","本益比"],"data":[["2330","20"]]}
  r=check("TWSE",json.dumps(a).encode(),"2025-12-30")
  self.assertTrue(r["response_date_verified"]);self.assertFalse(r["strict_historical_backtest_allowed"])
 def test_tpex_quarantines_missing_response_date_evidence(self):
  a={"iTotalRecords":1,"aaData":[["2330","X","25"]]}
  r=check("TPEX",json.dumps(a).encode(),"2025-12-30")
  self.assertFalse(r["response_date_verified"])
 def test_wrong_day_refused(self):
  a={"stat":"OK","date":"20251229","fields":["證券代號","本益比"],"data":[["2330","20"]]}
  with self.assertRaisesRegex(ValueError,"wrong source date"):
   check("TWSE",json.dumps(a).encode(),"2025-12-30")
if __name__=="__main__":unittest.main()
