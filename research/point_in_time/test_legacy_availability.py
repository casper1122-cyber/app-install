import unittest
from legacy_availability import available_by
X={"asset_id":"2330","feature":"pe","observed_at":"2025-12-31","source_url":"https://www.twse.com.tw/"}
class TestLegacy(unittest.TestCase):
 def test_strict_rejects_unverified(self):self.assertFalse(available_by(X,"2026-01-01"))
 def test_explicit_sensitivity(self):self.assertTrue(available_by(X,"2026-01-01",mode="sensitivity"))
 def test_no_same_day(self):self.assertFalse(available_by(X,"2025-12-31",mode="sensitivity"))
 def test_timestamp_not_proof(self):self.assertFalse(available_by(X,"2026-01-02",verified_publication="2026-01-01T09:00:00+08:00"))
if __name__=="__main__":unittest.main()
