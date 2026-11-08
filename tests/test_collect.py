import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from collector import collect
from collector import verify_pages


def page(banner, **extra):
    payload = {'props': {'pageProps': {'fighter_banner_info': banner, **extra}}}
    return '<script id="__NEXT_DATA__">' + json.dumps(payload) + '</script>'


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.item = {'character': 'AKUMA', 'mr': 1500, 'lp': 30000, 'phase': 'unknown', 'phase_source': None}

    def test_parse_character_and_phase_diagnostic(self):
        banner = {'favorite_character_alpha': 'AKUMA', 'favorite_character_league_info': {'master_rating': 1514, 'league_point': 32000, 'master_league': 4}}
        items, keys = collect.parse_page(page(banner), diagnostic=True)
        self.assertEqual((items[0]['mr'], items[0]['lp'], items[0]['phase']), (1514, 32000, 'unknown'))
        self.assertEqual(keys, [])  # master_league is a tier, never a phase.

    def test_explicit_phase_and_all_characters(self):
        banner = {'favorite_character_alpha': 'AKUMA', 'favorite_character_league_info': {'master_rating': 1500, 'league_point': 30000}}
        items, keys = collect.parse_page(page(banner, current_phase=9, play={'character_league_infos': [
            {'character_alpha': 'Ryu', 'league_info': {'master_rating': -1, 'league_point': 18000}}]}), diagnostic=True)
        self.assertEqual({x['character'] for x in items}, {'AKUMA', 'Ryu'})
        self.assertEqual({x['phase'] for x in items}, {'9'})
        self.assertEqual(keys, ['page.current_phase'])
        self.assertIsNone(next(x for x in items if x['character'] == 'Ryu')['mr'])

    def test_missing_fields_fails_closed(self):
        with self.assertRaises(ValueError):
            collect.parse_page(page({'favorite_character_alpha': 'AKUMA'}))

    def test_migrate_legacy_without_inventing_deltas(self):
        legacy = {'schema': 1, 'observations': [dict(self.item, observed_at='2026-01-01T00:00:00Z')]}
        upgraded = collect.migrate(legacy)
        self.assertEqual(upgraded['schema'], 2)
        self.assertEqual(upgraded['observations'][0]['observation_type'], 'legacy')
        self.assertIsNone(upgraded['observations'][0]['delta_mr'])

    def test_change_heartbeat_and_phase_reset(self):
        history = {'schema': 2, 'observations': []}
        self.assertEqual(collect.record([self.item], '2026-01-01T00:00:00Z', history), (1, []))
        self.assertEqual(collect.record([self.item], '2026-01-01T00:30:00Z', history), (0, []))
        self.assertEqual(collect.record([self.item], '2026-01-01T06:00:00Z', history), (1, []))
        changed = dict(self.item, mr=1510)
        self.assertEqual(collect.record([changed], '2026-01-01T06:30:00Z', history), (1, ['AKUMA']))
        self.assertEqual(history['observations'][-1]['delta_mr'], 10)
        reset = dict(self.item, phase='10', phase_source='page.current_phase', mr=1500)
        self.assertEqual(collect.record([reset], '2026-02-01T00:00:00Z', history), (1, []))
        self.assertIsNone(history['observations'][-1]['delta_mr'])
        self.assertEqual(history['observations'][-1]['observation_type'], 'phase_start')

    def test_success_and_failure_runs(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(collect, 'DATA', Path(folder)), \
                patch.dict('os.environ', {'GITHUB_EVENT_NAME': 'workflow_dispatch',
                                          'COLLECTION_ORIGIN': 'manual', 'EXTERNAL_TRIGGER_UNIX': ''}):
            with patch.object(collect, 'collect', return_value=([self.item], [])):
                self.assertEqual(collect.main(), 0)
            with patch.object(collect, 'collect', side_effect=RuntimeError('HTTP 403 (cloudfront)')):
                self.assertEqual(collect.main(), 1)
            runs = collect.load('runs.json', {})['events']
            self.assertEqual([x['result'] for x in runs], ['success', 'failure'])
            self.assertEqual(runs[0]['character_count'], 1)
            self.assertEqual(len(collect.load('history.json', {})['observations']), 1)
            self.assertIsNotNone(collect.load('status.json', {})['last_success'])
            self.assertEqual(collect.load('status.json', {})['auth_health'], 'needs_review')

    def test_schedule_slot_is_an_estimate_and_never_invents_old_slot(self):
        self.assertEqual(collect.planned_slot('2026-11-08T00:12:00Z', '11 * * * *'),
                         ('2026-11-08T00:11:00Z', 60))
        self.assertEqual(collect.planned_slot('2026-11-08T00:35:00Z', '11 * * * *'), (None, None))

    def test_redundant_schedule_is_logged_without_fetch_or_overwriting_success(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(collect, 'DATA', Path(folder)):
            collect.save('status.json', {'last_success': '2026-11-08T00:00:00Z', 'last_attempt': '2026-11-08T00:00:00Z'})
            with patch.object(collect, 'now', return_value='2026-11-08T00:10:00Z'), \
                    patch.dict('os.environ', {'GITHUB_EVENT_NAME': 'schedule', 'GITHUB_EVENT_SCHEDULE': '11 * * * *'}), \
                    patch.object(collect, 'collect', side_effect=AssertionError('must not fetch')):
                self.assertEqual(collect.main(), 0)
            self.assertEqual(collect.load('runs.json', {})['events'][0]['result'], 'skipped_recent_success')
            self.assertEqual(collect.load('status.json', {})['last_attempt'], '2026-11-08T00:00:00Z')

    def test_error_message_cannot_echo_secret_or_response(self):
        self.assertEqual(collect.safe_error(RuntimeError('cookie=secret')), 'Unexpected collection or parsing error (RuntimeError)')
        self.assertEqual(collect.safe_error(RuntimeError('HTTP 403 (cloudfront)')), 'HTTP 403 (cloudfront)')

    def test_external_dispatch_marker_and_overlap(self):
        self.assertEqual(collect.external_trigger('2026-11-08T00:13:05Z', 'cron_job_org', '1794096780'),
                         '2026-11-08T00:13:00Z')
        self.assertIsNone(collect.external_trigger('2026-11-08T00:13:05Z', 'manual', '1794096780'))
        self.assertIsNone(collect.external_trigger('2026-11-08T00:13:05Z', 'cron_job_org', '1794090000'))
        with tempfile.TemporaryDirectory() as folder, patch.object(collect, 'DATA', Path(folder)):
            collect.save('status.json', {'last_success': '2026-11-08T00:11:00Z'})
            with patch.object(collect, 'now', return_value='2026-11-08T00:13:05Z'), \
                    patch.dict('os.environ', {'GITHUB_EVENT_NAME': 'workflow_dispatch',
                                              'COLLECTION_ORIGIN': 'cron_job_org',
                                              'EXTERNAL_TRIGGER_UNIX': '1794096780'}), \
                    patch.object(collect, 'collect', side_effect=AssertionError('must not fetch')):
                self.assertEqual(collect.main(), 0)
            event = collect.load('runs.json', {})['events'][0]
            self.assertEqual((event['trigger'], event['result']), ('external_dispatch', 'skipped_recent_success'))

    def test_pages_check_rejects_stale_run_before_network(self):
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(verify_pages, 'DATA', Path(folder)), \
                patch.dict('os.environ', {'GITHUB_RUN_ID': 'new-run'}):
            (Path(folder) / 'runs.json').write_text(json.dumps({'events': [
                {'run_id': 'old-run', 'started_at': '2026-01-01T00:00:00Z'}]}))
            with self.assertRaisesRegex(RuntimeError, 'did not write a run event'):
                verify_pages.verify()


if __name__ == '__main__':
    unittest.main()
