import json,unittest,tempfile
from pathlib import Path
from unittest.mock import patch
from official_pilot import api_url,check
class Tests(unittest.TestCase):
 def test_two_markets(self):
  self.assertIn("date=20251230",api_url("TWSE","2025-12-30"))
  self.assertIn("2025%2F12%2F30",api_url("TPEX","2025-12-30"))
 def test_twse_accepts_dated_records_not_publication_proof(self):
  a={"stat":"OK","date":"20251230","fields":["證券代號","本益比"],"data":[["2330","20"]]}
  r=check("TWSE",json.dumps(a).encode(),"2025-12-30")
  self.assertTrue(r["response_date_verified"]);self.assertFalse(r["strict_historical_backtest_allowed"])
 def test_tpex_quarantines_missing_response_date_evidence(self):
  a={"stat":"ok","tables":[{"fields":["股票代號","公司名稱","本益比","殖利率(%)","股價淨值比"],"data":[["8069","元太","25","2.0","3.2"]]}]}
  r=check("TPEX",json.dumps(a).encode(),"2025-12-30")
  self.assertFalse(r["response_date_verified"])
 def test_tpex_historical_fields_and_date(self):
  a={"stat":"ok","date":"20251230","tables":[{"fields":["股票代號","公司名稱","本益比","殖利率(%)","股價淨值比"],"data":[["8069","元太","25","2.0","3.2"]]}]}
  r=check("TPEX",json.dumps(a).encode(),"2025-12-30")
  self.assertEqual(r["rows"],1);self.assertTrue(r["response_date_verified"])
 def test_wrong_tpex_day_rejected(self):
  a={"stat":"ok","date":"20251229","tables":[{"fields":["股票代號","公司名稱","本益比","殖利率(%)","股價淨值比"],"data":[["8069","元太","25","2.0","3.2"]]}]}
  with self.assertRaisesRegex(ValueError,"wrong source date"):check("TPEX",json.dumps(a).encode(),"2025-12-30")
 def test_old_tpex_schema_rejected(self):
  a={"iTotalRecords":1,"aaData":[["8069","元太","25"]]}
  with self.assertRaisesRegex(ValueError,"TPEx status"):check("TPEX",json.dumps(a).encode(),"2025-12-30")
 def test_wrong_day_refused(self):
  a={"stat":"OK","date":"20251229","fields":["證券代號","本益比"],"data":[["2330","20"]]}
  with self.assertRaisesRegex(ValueError,"wrong source date"):
   check("TWSE",json.dumps(a).encode(),"2025-12-30")
 def test_reject_conflicting_official_dates(self):
  a={"stat":"ok","date":"20251230","tables":[{"date":"20251229","fields":["股票代號","公司名稱","本益比","殖利率(%)","股價淨值比"],"data":[["8069","元太","25","2.0","3.2"]]}]}
  with self.assertRaisesRegex(ValueError,"conflicting official response dates"):
   check("TPEX",json.dumps(a).encode(),"2025-12-30")
 def test_reject_duplicate_stock_code(self):
  row=["8069","元太","25","2.0","3.2"]
  a={"stat":"ok","date":"20251230","tables":[{"fields":["股票代號","公司名稱","本益比","殖利率(%)","股價淨值比"],"data":[row,row]}]}
  with self.assertRaisesRegex(ValueError,"duplicate security code"):
   check("TPEX",json.dumps(a).encode(),"2025-12-30")
 def test_undated_sources_are_quarantined(self):
  from official_pilot import run
  class Resp:
   def __init__(self,payload):self.payload=payload
   def __enter__(self):return self
   def __exit__(self,*args):return False
   def read(self,*args):return self.payload
  def fake(request,timeout=25):
   if "twse.com.tw" in request.full_url:
    return Resp(json.dumps({"stat":"OK","fields":["證券代號","本益比"],"data":[["2330","20"]]}).encode())
   return Resp(json.dumps({"stat":"ok","tables":[{"fields":["股票代號","本益比","殖利率(%)","股價淨值比"],"data":[["8069","25","2","3"]]}]}).encode())
  with tempfile.TemporaryDirectory() as folder:
   with patch("official_pilot.urlopen",side_effect=fake):result=run(folder)
   self.assertEqual(result["downloaded"],0)
   self.assertEqual(len(list(Path(folder).glob("*.quarantine"))),4)
if __name__=="__main__":unittest.main()
