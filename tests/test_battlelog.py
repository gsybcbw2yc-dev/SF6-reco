"""Synthetic fixtures only. No cookies or upstream response snapshots."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from collector import battlelog as b

PLAYER = '1866568348'
AT = '2026-11-09T08:10:00Z'


def replay(key='SYNTHETIC01', side=1):
    own = {'player': {'short_id': int(PLAYER), 'fighter_id': 'SYNTHETIC_PRIVATE_NAME'},
           'character_tool_name': 'gouki', 'battle_input_type_name': 'Classic',
           'master_rating': 1500, 'league_point': 50000, 'round_results': [1, 8]}
    other = {'player': {'short_id': 9999999999, 'fighter_id': 'SYNTHETIC_OPPONENT'},
             'character_tool_name': 'ryu', 'battle_input_type_name': 'Modern',
             'master_rating': 1510, 'league_point': 51000, 'round_results': [0, 0]}
    return {'replay_id': key, 'uploaded_at': 1794211800, 'replay_battle_type': 1,
            'player1_info': own if side == 1 else other, 'player2_info': other if side == 1 else own}


def raw(rows):
    return '<script id="__NEXT_DATA__">' + json.dumps({'buildId': 'synthetic-build', 'locale': 'en',
        'props': {'pageProps': {'current_page': 1, 'total_page': 3, 'replay_list': rows}}}) + '</script>'


class BattleLogTests(unittest.TestCase):
    def test_side_result_controls_and_privacy(self):
        one = b.normalize(replay(), PLAYER, AT)
        two = b.normalize(replay(side=2), PLAYER, AT)
        self.assertEqual(one['key'], two['key'])
        self.assertEqual(two['own_side'], 2)
        self.assertEqual(one['outcome'], 'win')
        self.assertEqual(one['character'], 'AKUMA')
        self.assertEqual(one['opponent_control'], 'modern')
        self.assertIsNone(one['mr_delta'])
        self.assertEqual(one['mr_before'], 1500)
        exported = json.dumps(one)
        for private in ('SYNTHETIC01', 'SYNTHETIC_OPPONENT', 'SYNTHETIC_PRIVATE_NAME', '9999999999', PLAYER):
            self.assertNotIn(private, exported)

    def test_draw_unknown_mode_missing_and_mirror(self):
        self.assertEqual(b.result_from_rounds([0, 0], [1, 6]), 'loss')
        self.assertEqual(b.result_from_rounds([4, 4], [4, 4]), 'draw')
        self.assertEqual(b.result_from_rounds([0], [0]), 'unknown')
        self.assertEqual(b.result_from_rounds([99], [0]), 'unknown')
        r = replay(); r['player2_info']['character_tool_name'] = 'gouki'
        r['replay_battle_type'] = 2
        row = b.normalize(r, PLAYER, AT)
        self.assertEqual(row['character'], row['opponent_character'])
        self.assertEqual(row['mode'], 'casual')
        r['player1_info']['master_rating'] = -1
        r['player1_info']['phase_id'] = 12
        self.assertIsNone(b.normalize(r, PLAYER, AT)['mr_before'])
        self.assertEqual(b.normalize(r, PLAYER, AT)['phase'], '12')

    def test_no_ambiguous_identity_or_missing_key(self):
        r = replay(); r['player2_info']['player']['short_id'] = int(PLAYER)
        with self.assertRaises(ValueError): b.normalize(r, PLAYER, AT)
        with self.assertRaises(ValueError): b.match_key(None)

    def test_rematch_edges_backfill_without_identity(self):
        first, second, third = replay('EDGE0001'), replay('EDGE0002'), replay('EDGE0003', 2)
        first['player2_info']['player']['short_id'] = 1111111111
        second['uploaded_at'] += 120
        third['uploaded_at'] += 240
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'MATCH_MAX_PAGES': '1'}):
            folder = Path(tmp) / 'matches'
            def fetch(*_): return {'total_page': 1, 'replay_list': [third, second, first]}
            rows = [third, second, first]
            event = b.capture(raw(rows), PLAYER, 'TEST_SECRET', folder, AT, fetch, lambda _: None)
            self.assertEqual(event['added'], 3)
            index = json.loads((folder / 'index.json').read_text())
            records = json.loads((folder / index['months'][0]['path']).read_text())['matches']
            self.assertNotIn('rematch_edge', records[0])
            self.assertEqual(records[1]['rematch_edge'], {'previous': records[0]['key'], 'same': False})
            self.assertEqual(records[2]['rematch_edge'], {'previous': records[1]['key'], 'same': True})
            self.assertNotIn('9999999999', json.dumps(records))
            self.assertNotIn('1111111111', json.dumps(records))
            # A prior archive lacking links is enriched when records reappear.
            for row in records: row.pop('rematch_edge', None)
            b.write_json(folder / index['months'][0]['path'], {'schema': 1, 'matches': records})
            event = b.capture(raw(rows), PLAYER, 'TEST_SECRET', folder, AT, fetch, lambda _: None)
            self.assertEqual(event['added'], 0)
            enriched = json.loads((folder / index['months'][0]['path']).read_text())['matches']
            self.assertTrue(enriched[2]['rematch_edge']['same'])

    def test_pagination_archive_dedupe_and_failure_preserves(self):
        calls = []
        def fetch(build, locale, player, page, cookie):
            calls.append(page)
            return {'total_page': 2, 'replay_list': [replay(), replay('SYNTHETIC02', 2)]}
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'MATCH_MAX_PAGES': '2'}):
            path = Path(folder)
            event = b.capture(raw([replay()]), PLAYER, 'SYNTHETIC_NOT_A_COOKIE', path, AT, fetch, lambda _: None)
            self.assertEqual(event['result'], 'success')
            self.assertEqual(event['added'], 2)
            index = json.loads((path / 'index.json').read_text())
            self.assertEqual(index['count'], 2)
            self.assertTrue(index['source_window_scanned'])
            original = (path / index['months'][0]['path']).read_bytes()
            event = b.capture(raw([replay()]), PLAYER, 'SYNTHETIC_NOT_A_COOKIE', path, AT, fetch, lambda _: None)
            self.assertEqual(event['added'], 0)
            self.assertEqual(event['stop_reason'], 'known_page')
            self.assertEqual(original, (path / index['months'][0]['path']).read_bytes())
            def rejected(*_): raise RuntimeError('Battle log HTTP 403')
            event = b.capture(raw([replay()]), PLAYER, 'SYNTHETIC_NOT_A_COOKIE', path, AT, rejected)
            self.assertEqual(event['result'], 'failure')
            self.assertEqual(original, (path / index['months'][0]['path']).read_bytes())


    def test_independent_rating_evidence_preserves_real_match_time(self):
        """Backfill only ranked pre-match values, never invent a 30m snapshot."""
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'matches'
            folder.mkdir()
            ranked_akuma = b.normalize(replay('AAA00001'), PLAYER, AT)
            ranked_terry = dict(b.normalize(replay('BBB00002'), PLAYER, AT),
                                character='TERRY', mr_before=0, lp_before=23119)
            custom = dict(b.normalize(replay('CCC00003'), PLAYER, AT),
                          mode='custom', character='TERRY', lp_before=23119)
            no_time = dict(b.normalize(replay('DDD00004'), PLAYER, AT),
                           occurred_at=None, character='TERRY')
            evidence = b.make_rating_evidence(
                {'2026-11': [ranked_akuma, ranked_terry, custom, no_time]}, AT)
            self.assertEqual(evidence['schema'], 1)
            self.assertEqual(len(evidence['events']), 2)
            self.assertEqual(set(evidence['characters']), {'AKUMA', 'TERRY'})
            self.assertTrue(all(x['source'] == 'battlelog_pre_match'
                                and x['rating_basis'] == 'pre_match'
                                and x['time_basis'] == 'buckler_uploaded_at'
                                for x in evidence['events']))
            self.assertEqual(evidence['characters']['TERRY']['last_pre_match_lp'], 23119)
            self.assertEqual(evidence['characters']['TERRY']['last_pre_match_mr'], 0)
            self.assertEqual(evidence['events'][0]['observed_at'], ranked_akuma['occurred_at'])
            # Preserve all raw timestamps (including equal-time records); no 30m interpolation.
            b.write_rating_evidence(folder, {'2026-11': [ranked_akuma, ranked_terry]}, AT)
            saved = json.loads((Path(temp) / 'rating-evidence.json').read_text())
            self.assertEqual(saved, b.make_rating_evidence(
                {'2026-11': [ranked_akuma, ranked_terry]}, AT))
            self.assertFalse((folder / 'rating-evidence.json').exists())
            self.assertEqual(len(saved['events']), 2)
            self.assertTrue(all('observed_at' in x and 'fetched_at' not in x for x in saved['events']))
            self.assertNotIn('SYNTHETIC_OPPONENT', json.dumps(saved))
            self.assertNotIn(PLAYER, json.dumps(saved))

    def test_capture_regenerates_separate_rating_evidence_even_if_no_new_games(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'MATCH_MAX_PAGES': '1'}):
            folder = Path(temp) / 'matches'
            folder.mkdir()
            def fetch(build, locale, player, page, cookie):
                return {'current_page': 1, 'total_page': 1,
                        'replay_list': [replay('TEST0001')]}
            result = b.capture(raw([replay('TEST0001')]), PLAYER, 'TEST_SECRET', folder,
                               AT, fetch, lambda _: None)
            self.assertEqual(result['result'], 'success')
            saved = json.loads((Path(temp) / 'rating-evidence.json').read_text())
            self.assertEqual(len(saved['events']), 1)
            self.assertEqual(saved['characters']['AKUMA']['last_pre_match_mr'], 1500)
            self.assertTrue(saved['checked_at'].endswith('Z'))
            result = b.capture(raw([replay('TEST0001')]), PLAYER, 'TEST_SECRET', folder,
                               '2026-11-09T08:40:00Z', fetch, lambda _: None)
            self.assertEqual(result['result'], 'success')
            newest = json.loads((Path(temp) / 'rating-evidence.json').read_text())
            self.assertEqual(len(newest['events']), 1)
            self.assertNotEqual(newest['checked_at'], '')
            self.assertEqual(newest['events'], saved['events'])  # no fictitious heartbeat per character

    def test_auth_and_schema_fail_closed(self):
        with self.assertRaises(ValueError): b.decode_page('<html>Sign in</html>')
        with self.assertRaises(ValueError): b.decode_page(raw([]).replace('"replay_list": []', '"__N_REDIRECT": "auth/login"'))
        self.assertNotIn('cookie', b.safe_error(RuntimeError('cookie=secret')))

    def test_valid_first_page_survives_later_access_rejection(self):
        def fetch(build, locale, player, page, cookie):
            if page == 2:
                raise RuntimeError('Battle log HTTP 429')
            return {'current_page': 1, 'total_page': 3, 'replay_list': [replay('SYNTHETIC02')]}
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'MATCH_MAX_PAGES': '3'}):
            event = b.capture(raw([replay()]), PLAYER, 'SYNTHETIC_NOT_A_COOKIE', Path(folder), AT, fetch, lambda _: None)
            self.assertEqual(event['result'], 'partial')
            self.assertEqual(event['added'], 2)
            self.assertEqual(event['pages'], 1)
            self.assertEqual(json.loads((Path(folder) / 'index.json').read_text())['count'], 2)


if __name__ == '__main__':
    unittest.main()

