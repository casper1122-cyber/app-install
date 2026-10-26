"""Offline regressions: execute real updater functions without interactive startup.
Fixtures validate publication behavior, not market/model performance.
"""
import ast
import copy
import datetime
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock

SOURCE = Path(__file__).resolve().parents[2] / 'tools' / 'prog.py'


def functions():
    tree = ast.parse(SOURCE.read_text())
    selected = {'h_rate', 'h_govmeta', 'ym_add', 'ym_idx'}
    module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in selected], type_ignores=[])
    scope = {}
    exec(compile(module, str(SOURCE), 'exec'), scope)
    return scope


class FixedDate(datetime.date):
    @classmethod
    def today(cls):
        return cls(2026, 10, 26)


class PublicationSafety(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.b = {
            'last': '2026-09', 'base': '2026-08', 'cpi': [100, 100],
            'fxs': '2026-08', 'fxr': [0, 0],
            'a': {'TWDCASH': {'s': '2026-08', 'r': [10, 10]},
                  'TEST': {'s': '2026-08', 'r': [100, 100], 'src': {'y': 'TEST'}}},
            'L': {'s': '2026-08', 'stock': [0], 'bond': [0], 'cash': [0], 'gold': [0], 'cpi': [100]},
        }
        self.months = {'2026-07': 100, '2026-08': 100, '2026-09': 100}
        self.scope = functions()
        self.put = Mock()
        self.scope.update(
            datetime=types.SimpleNamespace(date=FixedDate, datetime=datetime.datetime),
            json=json, os=__import__('os'), CACHE=self.tmp.name,
            rate_base=lambda: copy.deepcopy(self.b),
            fred_monthly=lambda sid: dict(self.months),
            ycache=lambda sym: None,
            month_tr=lambda *args: (dict(self.months), '2026-09-30'),
            tw_dep=lambda: {}, tw_cpi=lambda: {}, mort_series=lambda *args: {'r': [1]},
            gh_put=self.put, time=types.SimpleNamespace(sleep=lambda _: None),
            gov_meta=lambda did: {'id': did},
        )

    def rate(self):
        return self.scope['h_rate']({})

    def assert_blocked(self, message):
        with self.assertRaisesRegex(RuntimeError, message):
            self.rate()
        self.put.assert_not_called()
        self.assertFalse((Path(self.tmp.name) / 'rate_latest.json').exists())

    def test_observed_zero_is_preserved_and_publish_succeeds(self):
        self.rate()
        self.put.assert_called_once()
        result = json.loads(self.put.call_args.args[1])
        self.assertEqual(result['a']['TEST']['r'], [0, 0])
        self.assertEqual(result['L']['stock'], [0, 0])
        self.assertEqual(self.b['a']['TEST']['r'], [100, 100])

    def test_short_optional_asset_does_not_get_zero_padding(self):
        self.b['a']['SHORT'] = {'s': '2026-08', 'r': [10], 'ok': False}
        self.assert_blocked('SHORT 缺月報酬')

    def test_missing_fx_does_not_become_zero(self):
        self.b['fxr'] = [0]
        self.scope['fred_monthly'] = lambda sid: {'2026-09': 100}
        self.assert_blocked('缺匯率月報酬')

    def test_each_missing_long_term_asset_blocks_publish(self):
        for symbol in ('SPY', 'IEF', 'BIL', 'GC=F'):
            with self.subTest(symbol=symbol):
                self.scope['month_tr'] = lambda sym, *args: (({} if sym == symbol else dict(self.months)), '2026-09-30')
                self.assert_blocked('缺月報酬')

    def test_existing_failure_threshold_runs_before_publish(self):
        self.b['L'].update({key: [0, 0] for key in ('stock', 'bond', 'cash', 'gold', 'cpi')})
        for i in range(4):
            self.b['a'][str(i)] = {'s': '2026-08', 'r': [0, 0], 'src': {'y': str(i)}}
        self.scope['month_tr'] = lambda *args: (None, None)
        self.assert_blocked('沒接上')

    def test_empty_government_request_is_not_success(self):
        with self.assertRaisesRegex(RuntimeError, '沒有政府資料集'):
            self.scope['h_govmeta']({'ids': []})
        self.put.assert_not_called()

    def test_failed_or_partial_government_fetch_preserves_remote_data(self):
        def fetch(did):
            if did == 2:
                raise RuntimeError('fixture unavailable')
            return {'id': did}
        self.scope['gov_meta'] = fetch
        for ids in ([2], [1, 2]):
            with self.subTest(ids=ids), self.assertRaises(RuntimeError):
                self.scope['h_govmeta']({'ids': ids})
            self.put.assert_not_called()

    def test_successful_government_fetch_publishes(self):
        result = self.scope['h_govmeta']({'ids': [1, 2]})
        self.assertIn('2 個成功', result)
        self.put.assert_called_once()
        self.assertEqual(set(json.loads(self.put.call_args.args[1])), {'1', '2'})


if __name__ == '__main__':
    unittest.main()
