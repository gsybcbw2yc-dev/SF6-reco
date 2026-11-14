"""Synthetic data only: tests full PLAY character league readings, not private profiles."""
import json
import unittest
from unittest.mock import patch
from collector import play_leagues as p


def page(rows, **extra):
    data={'props':{'pageProps':{'play':{'character_league_infos':rows},**extra}}}
    return '<script id="__NEXT_DATA__">'+json.dumps(data)+'</script>'


def league(name,mr,lp,played=True,**extra):
    return {'character_alpha':name,'is_played':played,
            'league_info':{'master_rating':mr,'league_point':lp,**extra}}


class PlayCharacterLeaguesTests(unittest.TestCase):
    def test_all_played_characters_not_just_favorite(self):
        raw=page([league('GOUKI',1403,114555),
                  league('TERRY',0,23119),
                  league('KEN',-1,18960),
                  league('LUKE',0,0,False)],
                 current_phase=14,
                 fighter_banner_info={'favorite_character_alpha':'TERRY'})
        rows=p.parse_play(raw)
        self.assertEqual([x['character'] for x in rows],['AKUMA','TERRY','KEN'])
        self.assertEqual([(x['mr'],x['lp']) for x in rows],
                         [(1403,114555),(0,23119),(None,18960)])
        self.assertTrue(all(x['phase']=='14' and
                            x['phase_source']=='play_page.current_phase'
                            for x in rows))
        self.assertTrue(all(x['rating_source']=='play_character_league_infos'
                            and x['rating_view']=='latest_default' for x in rows))

    def test_no_phase_guessing_and_zero_lp_rookie(self):
        rows=p.parse_play(page([league('RYU',None,0,True)]))
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['mr'],None)
        self.assertEqual(rows[0]['lp'],0)
        self.assertEqual(rows[0]['phase'],'unknown')

    def test_invalid_unplayed_and_duplicate_are_guarded(self):
        rows=p.parse_play(page([
            league('TERRY',0,22600),league('TERRY',0,22900),
            league('CHUN-LI',1500,25000,False),
            league('BISON',None,None,True),
            league('LUKE',10000001,25000,True)]))
        self.assertEqual([x['character'] for x in rows],['TERRY','CHUN-LI'])
        self.assertEqual(rows[0]['lp'],22900)

    def test_schema_rejects_non_play_and_login_redirect(self):
        for raw in ('<body>sign in</body>','<script id="__NEXT_DATA__">{}</script>',
                    '<script id="__NEXT_DATA__">'+json.dumps({'props':{'pageProps':{
                    '__N_REDIRECT':'/auth/login','play':{'character_league_infos':[]}}}})+'</script>'):
            with self.assertRaises((ValueError,AttributeError)):
                p.parse_play(raw)

    def test_probe_only_persists_keys(self):
        data={'play':{'character_league_infos':[
            {'character_alpha':'GOUKI','league_info':{'master_rating':1403,
             'league_point':114555,'secret':'SHOULD_NOT_PERSIST'}}]},
             'account_token':'PRIVATE_TOKEN'}
        result=p.key_structure(data)
        encoded=json.dumps(result)
        self.assertNotIn('PRIVATE_TOKEN',encoded)
        self.assertNotIn('SHOULD_NOT_PERSIST',encoded)
        self.assertNotIn('1403',encoded)

    def test_safe_errors_never_echo_credentials(self):
        self.assertEqual(p.safe_issue(RuntimeError('buckler_id=SECRET')),
                         'play_collection_RuntimeError')
        self.assertEqual(p.safe_issue(ValueError('play_next_data_missing')),
                         'play_next_data_missing')


if __name__=='__main__':
    unittest.main()
