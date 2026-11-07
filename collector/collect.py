#!/usr/bin/env python3
"""Conservative, read-only Buckler snapshot collector. No third-party dependencies."""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web' / 'data'
PROFILE = re.compile(r'^\d{6,15}$')
NEXT = re.compile(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', re.S)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def load(name, default):
    try:
        return json.loads((DATA / name).read_text())
    except FileNotFoundError:
        return default


def save(name, value):
    DATA.mkdir(parents=True, exist_ok=True)
    temp = DATA / (name + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(DATA / name)


def parse_page(raw):
    match = NEXT.search(raw)
    if not match:
        raise ValueError('Buckler page data absent (login expired or page structure changed)')
    page = json.loads(html.unescape(match.group(1)))['props']['pageProps']
    banner = page.get('fighter_banner_info') or {}
    if not banner:
        raise ValueError('Profile banner absent')
    items = []
    candidates = [banner]
    # Only take character entries with identifiable names; avoid treating aggregate metrics as characters.
    for key in ('character_league_info', 'character_league_infos', 'character_rank_info'):
        values = (page.get('play') or {}).get(key) or page.get(key) or banner.get(key) or []
        candidates += list(values.values()) if isinstance(values, dict) else values if isinstance(values, list) else []
    for entry in candidates:
        if not isinstance(entry, dict):
            continue
        league = entry.get('favorite_character_league_info') or entry.get('league_info') or entry
        if not isinstance(league, dict):
            continue
        char = (entry.get('favorite_character_alpha') or entry.get('favorite_character_name') or entry.get('favorite_character_tool_name') or entry.get('character_alpha') or entry.get('character_name') or entry.get('character_tool_name') or league.get('character_name'))
        if isinstance(char, dict):
            char = char.get('en') or char.get('ja')
        if not isinstance(char, str) or not char.strip():
            continue
        mr = league.get('master_rating')
        lp = league.get('league_point', league.get('league_points'))
        if lp is None:
            lp = league.get('lp')
        if mr is None and lp is None:
            continue
        def number(v):
            if v is None or v == '':
                return None
            if isinstance(v, bool):
                raise ValueError('Invalid rating')
            n = int(str(v).replace(',', ''))
            if n == -1:
                return None
            if n < 0 or n > 10000000:
                raise ValueError('Rating outside expected range')
            return n
        items.append({'character': char.strip(), 'mr': number(mr), 'lp': number(lp), 'phase': str(league.get('master_league_phase') or league.get('phase') or 'unknown')})
    if not items:
        raise ValueError('MR/LP fields absent; refusing to record guessed values')
    return list({x['character']: x for x in items}.values())


def collect():
    player = os.environ.get('CFN_PLAYER_ID', '')
    cookie = os.environ.get('BUCKLER_ID', '')
    if not PROFILE.fullmatch(player) or not cookie or '\n' in cookie or ';' in cookie:
        raise ValueError('Set numeric CFN_PLAYER_ID and BUCKLER_ID in environment/secrets')
    url = f'https://www.streetfighter.com/6/buckler/profile/{player}/battlelog/rank'
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; PersonalSF6Tracker/1.0)', 'Cookie': 'buckler_id=' + cookie, 'Accept-Language': 'en-US,en;q=0.8'})
    error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read(3_000_001)
            if len(raw) > 3_000_000:
                raise ValueError('Profile page exceeded size limit')
            return parse_page(raw.decode('utf-8'))
        except urllib.error.HTTPError as exc:
            # Only classify response metadata; never persist headers, body, URL, or cookies.
            server = (exc.headers.get('Server') or '').lower()
            cache = (exc.headers.get('X-Cache') or '').lower()
            content = (exc.headers.get('Content-Type') or '').lower()
            edge = 'cloudfront' if 'cloudfront' in server or 'cloudfront' in cache else 'other'
            kind = 'html' if 'text/html' in content else 'json' if 'json' in content else 'other'
            error = f'HTTP {exc.code} (edge={edge}, content={kind})'
            if exc.code in (401, 403, 404, 429):
                break
        except (urllib.error.URLError, TimeoutError) as exc:
            error = type(exc).__name__
        if attempt < 2:
            time.sleep(2 ** attempt)
    raise RuntimeError(error or 'Fetch failed')


def record(items, timestamp=None):
    timestamp = timestamp or now()
    history = load('history.json', {'schema': 1, 'observations': []})
    existing = history['observations']
    new = 0
    for item in items:
        previous = next((x for x in reversed(existing) if x['character'] == item['character'] and x['phase'] == item['phase']), None)
        # A repeated value within a phase is one observation; subsequent changes retain exact poll time.
        if previous and previous['mr'] == item['mr'] and previous['lp'] == item['lp']:
            continue
        existing.append(dict(item, observed_at=timestamp, source='periodic_buckler_snapshot'))
        new += 1
    save('history.json', history)
    return new


def main():
    status = load('status.json', {'last_success': None, 'last_error': None, 'errors': []})
    try:
        items = collect()
        count = record(items)
        status['last_success'] = now()
        status['last_error'] = None
        status['latest'] = items
        print(f'Collected {len(items)} characters, recorded {count} changed snapshots')
    except Exception as exc:
        # Never log credential values, URLs containing private identifiers, or response bodies.
        message = str(exc)[:180]
        status['last_error'] = {'at': now(), 'message': message}
        status['errors'] = (status.get('errors') or [])[-19:] + [status['last_error']]
        print('Collector failed: ' + message, file=sys.stderr)
        save('status.json', status)
        return 1
    save('status.json', status)
    return 0


if __name__ == '__main__':
    sys.exit(main())
