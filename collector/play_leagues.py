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


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
