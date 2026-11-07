import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from collector import collect

class CollectorTests(unittest.TestCase):
    def page(self, banner):
        return '<script id="__NEXT_DATA__">' + json.dumps({'props': {'pageProps': {'fighter_banner_info': banner}}}) + '</script>'
    def test_parse(self):
        got = collect.parse_page(self.page({'favorite_character_name':'Akuma','favorite_character_league_info':{'master_rating':1514,'league_point':32000}}))
        self.assertEqual(got[0]['mr'],1514)
        self.assertEqual(got[0]['lp'],32000)
    def test_all_characters_from_play(self):
        payload={'props': {'pageProps': {'fighter_banner_info': {'favorite_character_alpha':'Gouki','favorite_character_league_info':{'master_rating':1500,'league_point':25000}},'play': {'character_league_infos':[{'character_alpha':'Ryu','league_info':{'master_rating':-1,'league_point':18000}}]}}}}
        got=collect.parse_page('<script id="__NEXT_DATA__">'+json.dumps(payload)+'</script>')
        self.assertEqual({x['character'] for x in got},{'Gouki','Ryu'})
        self.assertIsNone(next(x for x in got if x['character']=='Ryu')['mr'])
    def test_missing_fails(self):
        with self.assertRaises(ValueError): collect.parse_page(self.page({'favorite_character_name':'Akuma'}))
    def test_dedup_phase(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(collect,'DATA',Path(folder)):
            item={'character':'Akuma','mr':1500,'lp':30000,'phase':'10'}
            self.assertEqual(collect.record([item],'2026-01-01T00:00:00Z'),1)
            self.assertEqual(collect.record([item],'2026-01-01T00:30:00Z'),0)
            self.assertEqual(collect.record([dict(item,phase='11')],'2026-02-01T00:00:00Z'),1)
            self.assertEqual(len(collect.load('history.json',{})['observations']),2)
if __name__=='__main__': unittest.main()
