"""Safe read-only probe for Buckler PLAY per-character latest MR/LP.

No cookies, response bodies, user identifiers or raw HTML/JSON are persisted.
Run through existing GitHub Actions secret BUCKLER_ID (do not print it).
"""
import html
import json
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone

NEXT = re.compile(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', re.S)
ORIGIN = 'https://www.streetfighter.com'
ALLOWED_ROUTES = ('/6/buckler/profile/{player}/play', '/6/buckler/en/profile/{player}/play')
KEY = re.compile(r'^[a-z][a-z0-9_]{0,65}$')
RELEVANT = ('character', 'league', 'master', 'rate', 'rank', 'play', 'point')


def key_structure(page):
    """Persist structural paths and list element *keys*, never private data."""
    paths = []
    groups = []
    pending = [(page, 'page', 0)]
    seen = 0
    while pending and seen < 3000:
        node, path, depth = pending.pop()
        seen += 1
        if depth > 5:
            continue
        if isinstance(node, dict):
            for k, v in node.items():
                if not isinstance(k, str) or not KEY.fullmatch(k):
                    continue
                loc = path + '.' + k
                if any(token in k for token in RELEVANT):
                    paths.append(loc)
                if isinstance(v, (dict, list)):
                    pending.append((v, loc, depth+1))
        elif isinstance(node, list) and node:
            sample = next((x for x in node if isinstance(x, dict)), None)
            if sample:
                keys = [k for k in sample if isinstance(k, str) and KEY.fullmatch(k)]
                if any(any(t in k for t in RELEVANT) for k in keys):
                    groups.append({'path':path,'count':len(node),'element_keys':sorted(keys)[:45]})
                pending.append((sample,path+'[]',depth+1))
    return {'candidate_paths': sorted(set(paths))[:140], 'lists': groups[:18]}


def probe(player, cookie, fetched_at):
    output = {'schema':1,'checked_at':fetched_at,
              'source':'buckler_play_character_latest','result':'unavailable',
              'route':None,'structure':None,'error':None}
    if not re.fullmatch(r'\d{6,15}', player or '') or not cookie or '\n' in cookie or ';' in cookie:
        output['error']='invalid_config'
        return output
    if cookie.lower().startswith('buckler_id='):
        cookie=cookie.split('=',1)[1]
    for route in ALLOWED_ROUTES:
        url=ORIGIN+route.format(player=player)
        req=urllib.request.Request(url,headers={
            'User-Agent':'Mozilla/5.0 (compatible; PersonalSF6Tracker/1.0)',
            'Cookie':'buckler_id='+cookie,
            'Accept-Language':'en-US,en;q=0.8'})
        try:
            with urllib.request.urlopen(req,timeout=18) as response:
                raw=response.read(2_500_001)
                final=response.geturl()
            if len(raw)>2_500_000:
                output['error']='oversize';continue
            if not final.startswith(ORIGIN+'/6/buckler/'):
                output['error']='redirect_outside_buckler';continue
            match=NEXT.search(raw.decode('utf-8'))
            if not match:
                output['error']='next_data_missing';continue
            obj=json.loads(html.unescape(match.group(1)))
            page=obj.get('props',{}).get('pageProps',{})
            if not isinstance(page,dict) or '__N_REDIRECT' in page or page.get('common',{}).get('statusCode') in (401,403,429):
                output['error']='login_or_schema';continue
            output.update(result='page_available',route=route.split('/profile/')[0].replace('/6/buckler','')+'/profile/{player}/play',
                          structure=key_structure(page),error=None)
            return output
        except urllib.error.HTTPError as exc:
            output['error']='http_'+str(exc.code)
        except (ValueError,KeyError,UnicodeError,TimeoutError,urllib.error.URLError):
            output['error']='request_or_schema_failed'
    return output



# Buckler's PLAY page serves the full per-character league array (not only
# the favorite-character banner). The unfiltered default view shows 'latest'
# in the official page UI; do not mistake the separate maximum MR for latest.
PLAY_URL = ORIGIN+'/6/buckler/profile/{player}/play'


def normalize_character(entry):
    char = (entry.get('character_alpha') or entry.get('character_tool_name') or
            entry.get('character_name'))
    if isinstance(char, dict):
        char = char.get('en') or char.get('ja')
    if not isinstance(char, str) or not re.fullmatch(r'[A-Za-z0-9 _.-]{1,60}', char):
        return None
    char = char.strip().upper().replace(' ', '_')
    return {'GOUKI': 'AKUMA'}.get(char, char)


def normalized_rating(value):
    if value is None or value == '' or value == -1:
        return None
    if type(value) not in (int, str):
        raise ValueError('invalid_numeric_rating')
    if isinstance(value, str) and not re.fullmatch(r'-?\d{1,9}', value):
        raise ValueError('invalid_numeric_rating')
    num = int(value)
    if num == -1:
        return None
    if not 0 <= num <= 10_000_000:
        raise ValueError('invalid_numeric_rating')
    return num




def parse_play(raw):
    match = NEXT.search(raw)
    if not match:
        raise ValueError('play_next_data_missing')
    root = json.loads(html.unescape(match.group(1)))
    page = root.get('props', {}).get('pageProps', {})
    if not isinstance(page, dict) or '__N_REDIRECT' in page:
        raise ValueError('play_auth_or_schema')
    play = page.get('play', {})
    leagues = play.get('character_league_infos') if isinstance(play, dict) else None
    if not isinstance(leagues, list):
        raise ValueError('play_character_leagues_missing')
    phase = 'unknown'
    phase_source = None
    # The official PLAY page's active Act selector is backed by
    # pageProps.play.current_season_id (verified as 14 against the official UI).
    # Do not infer the current Act from season_ids (a list of historical options).
    current_season = play.get('current_season_id')
    if type(current_season) is int and 1 <= current_season <= 100:
        phase = str(current_season)
        phase_source = 'play_page.play.current_season_id'
    # Compatibility with other explicit phase fields, only if the current
    # season was absent. Never infer a phase from MR, date or dropdown history.
    for k in ('master_league_phase','phase_id','current_phase','current_phase_id'):
        value=page.get(k)
        if phase == 'unknown' and type(value) is int and 1 <= value <= 100:
            phase=str(value);phase_source='play_page.'+k;break
    result = {}
    for entry in leagues:
        if not isinstance(entry,dict):
            continue
        char=normalize_character(entry)
        info=entry.get('league_info')
        if not char or not isinstance(info, dict):
            continue
        try:
            mr=normalized_rating(info.get('master_rating'))
            lp=normalized_rating(info.get('league_point'))
        except ValueError:
            continue
        # Unplayed characters frequently have empty shells. Do not pollute
        # the rating history with zeros for fighters the user never selected.
        if mr is None and lp is None:
            continue
        # Buckler's is_played marker can be true while the latest Act has
        # no rating: master_rating=0, league_point=null. These are NOT valid
        # current MR/LP observations, even for an otherwise played fighter.
        if (mr is None or mr == 0) and lp is None:
            continue
        if not entry.get('is_played') and not (mr and mr > 0) and not (lp and lp > 0):
            continue
        result[char] = {'character':char,'mr':mr,'lp':lp,'phase':phase,
                         'phase_source':phase_source,
                         'rating_source':'play_character_league_infos',
                         'rating_view':'latest_default'}
    if not result:
        raise ValueError('play_has_no_played_ratings')
    return list(result.values())


def fetch_latest(player, cookie):
    """One authenticated GET to the known PLAY route; no raw payload persisted."""
    if not re.fullmatch(r'\d{6,15}', player or '') or not cookie or '\n' in cookie or ';' in cookie:
        raise ValueError('invalid_config')
    cookie=cookie.strip().strip('"\'')
    if cookie.lower().startswith('buckler_id='):
        cookie=cookie.split('=',1)[1]
    req=urllib.request.Request(PLAY_URL.format(player=player),headers={
        'User-Agent':'Mozilla/5.0 (compatible; PersonalSF6Tracker/1.0)',
        'Cookie':'buckler_id='+cookie,
        'Accept-Language':'en-US,en;q=0.8'})
    with urllib.request.urlopen(req, timeout=20) as response:
        raw=response.read(2_500_001)
        final=response.geturl()
    if len(raw)>2_500_000:
        raise ValueError('play_response_too_large')
    if not final.startswith(ORIGIN+'/6/buckler/') or '/auth/' in final:
        raise ValueError('play_auth_redirect')
    return parse_play(raw.decode('utf-8'))


def safe_issue(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return 'play_http_'+str(exc.code)
    if isinstance(exc, ValueError) and str(exc) in (
        'invalid_config','play_next_data_missing','play_auth_or_schema',
        'play_character_leagues_missing','play_has_no_played_ratings',
        'play_response_too_large','play_auth_redirect'):
        return str(exc)
    return 'play_collection_'+type(exc).__name__

def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
