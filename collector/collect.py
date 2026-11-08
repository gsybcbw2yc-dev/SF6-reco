#!/usr/bin/env python3
"""Read-only Buckler observation collector. No third-party dependencies or raw response persistence."""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web' / 'data'
PROFILE = re.compile(r'^\d{6,15}$')
NEXT = re.compile(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', re.S)
PHASE_KEYS = ('master_league_phase', 'phase_id', 'current_phase', 'current_phase_id')
SCHEDULE_MINUTES = (11, 41)
MIN_COLLECTION_GAP = timedelta(minutes=25)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def planned_slot(started, expression):
    """Approximate the scheduled slot; GitHub does not expose an exact event timestamp.

    A run delayed past the next hourly occurrence is ambiguous, so leave it null.
    """
    if not re.fullmatch(r'\d{1,2} \* \* \* \*', expression or ''):
        return None, None
    minute = int(expression.split()[0])
    if minute not in SCHEDULE_MINUTES:
        return None, None
    actual = instant(started)
    candidates = [actual.replace(minute=minute, second=0, microsecond=0) + timedelta(hours=h)
                  for h in (-1, 0, 1)]
    slot = min(candidates, key=lambda x: abs((x - actual).total_seconds()))
    delay = round((actual - slot).total_seconds())
    if not -120 <= delay <= 20 * 60:
        return None, None
    return slot.isoformat(timespec='seconds').replace('+00:00', 'Z'), delay


def external_trigger(started, origin, epoch):
    """Only accept a fresh cron-job.org execution marker, never raw input in logs."""
    if origin != 'cron_job_org' or not re.fullmatch(r'\d{10}', epoch or ''):
        return None
    trigger = datetime.fromtimestamp(int(epoch), timezone.utc)
    if not 0 <= (instant(started) - trigger).total_seconds() <= 600:
        return None
    return trigger.isoformat(timespec='seconds').replace('+00:00', 'Z')


def safe_error(exc):
    # Never persist arbitrary exception strings (URLs, request headers and secrets).
    message = str(exc)
    if isinstance(exc, RuntimeError) and re.fullmatch(r'HTTP \d{3} \((?:cloudfront|other)\)', message):
        return message
    if isinstance(exc, RuntimeError) and message in ('URLError', 'TimeoutError', 'Fetch failed'):
        return message
    if isinstance(exc, ValueError) and message in (
        'Missing or invalid collection configuration', 'Buckler page data absent',
        'Profile banner absent', 'MR/LP fields absent', 'Invalid rating field',
        'Rating outside expected range', 'Profile page exceeded size limit'):
        return message
    return 'Unexpected collection or parsing error (' + type(exc).__name__ + ')'


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


def rating(value):
    if value is None or value == '' or value == -1:
        return None
    if isinstance(value, bool):
        raise ValueError('Invalid rating field')
    number = int(str(value).replace(',', ''))
    if not 0 <= number <= 10_000_000:
        raise ValueError('Rating outside expected range')
    return number


def phase_value(league, page):
    # master_league is a rank/tier, not a phase. Accept only explicit fields.
    for source, obj in (('league', league), ('page', page)):
        for key in PHASE_KEYS:
            value = obj.get(key)
            if type(value) is int and 1 <= value <= 100:
                return str(value), source + '.' + key
            if isinstance(value, str) and re.fullmatch(r'\d{1,2}', value) and int(value) > 0:
                return str(int(value)), source + '.' + key
    return 'unknown', None


def phase_key_paths(page):
    """Only schema key names, never values, IDs, response bodies or arbitrary object keys."""
    paths = set()
    stack = [(page, 'page', 0)]
    seen = 0
    while stack and seen < 20_000:
        obj, path, depth = stack.pop()
        seen += 1
        if depth > 7:
            continue
        if isinstance(obj, dict):
            for key, value in obj.items():
                if not re.fullmatch(r'[a-z][a-z0-9_]{0,40}', key):
                    continue
                next_path = path + '.' + key
                if key in PHASE_KEYS or key in ('phase', 'season', 'season_id', 'act', 'act_id'):
                    paths.add(next_path)
                if isinstance(value, (dict, list)):
                    stack.append((value, next_path, depth + 1))
        elif isinstance(obj, list) and obj:
            stack.append((obj[0], path + '[]', depth + 1))
    return sorted(paths)[:30]


def parse_page(raw, diagnostic=False):
    match = NEXT.search(raw)
    if not match:
        raise ValueError('Buckler page data absent')
    page = json.loads(html.unescape(match.group(1)))['props']['pageProps']
    banner = page.get('fighter_banner_info') or {}
    if not banner:
        raise ValueError('Profile banner absent')
    candidates = [banner]
    play = page.get('play') or {}
    for key in ('character_league_info', 'character_league_infos', 'character_rank_info'):
        values = play.get(key) or page.get(key) or banner.get(key) or []
        candidates += list(values.values()) if isinstance(values, dict) else values if isinstance(values, list) else []
    items = []
    for entry in candidates:
        if not isinstance(entry, dict):
            continue
        league = entry.get('favorite_character_league_info') or entry.get('league_info') or entry
        if not isinstance(league, dict):
            continue
        char = (entry.get('favorite_character_alpha') or entry.get('favorite_character_name') or
                entry.get('favorite_character_tool_name') or entry.get('character_alpha') or
                entry.get('character_name') or entry.get('character_tool_name') or league.get('character_name'))
        if isinstance(char, dict):
            char = char.get('en') or char.get('ja')
        if not isinstance(char, str) or not char.strip():
            continue
        mr, lp = league.get('master_rating'), league.get('league_point', league.get('league_points', league.get('lp')))
        if mr is None and lp is None:
            continue
        phase, source = phase_value(league, page)
        items.append({'character': char.strip(), 'mr': rating(mr), 'lp': rating(lp),
                      'phase': phase, 'phase_source': source})
    if not items:
        raise ValueError('MR/LP fields absent')
    items = list({x['character']: x for x in items}.values())
    return (items, phase_key_paths(page)) if diagnostic else items


def collect():
    player = os.environ.get('CFN_PLAYER_ID', '')
    cookie = os.environ.get('BUCKLER_ID', '').strip().strip('"\'')
    if cookie.lower().startswith('buckler_id='):
        cookie = cookie.split('=', 1)[1]
    if not PROFILE.fullmatch(player) or not cookie or '\n' in cookie or ';' in cookie:
        raise ValueError('Missing or invalid collection configuration')
    url = f'https://www.streetfighter.com/6/buckler/profile/{player}/battlelog/rank'
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; PersonalSF6Tracker/1.0)',
        'Cookie': 'buckler_id=' + cookie, 'Accept-Language': 'en-US,en;q=0.8'})
    error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read(3_000_001)
            if len(raw) > 3_000_000:
                raise ValueError('Profile page exceeded size limit')
            return parse_page(raw.decode('utf-8'), diagnostic=True)
        except urllib.error.HTTPError as exc:
            # Classify metadata only; never persist headers, body or cookie.
            server = (exc.headers.get('Server') or '').lower()
            cache = (exc.headers.get('X-Cache') or '').lower()
            edge = 'cloudfront' if 'cloudfront' in server or 'cloudfront' in cache else 'other'
            error = f'HTTP {exc.code} ({edge})'
            if exc.code in (401, 403, 404, 429):
                break
        except (urllib.error.URLError, TimeoutError) as exc:
            error = type(exc).__name__
        if attempt < 2:
            time.sleep(2 ** attempt)
    raise RuntimeError(error or 'Fetch failed')


def migrate(history):
    """Keep every v1 observation; do not invent phase or historical change times."""
    if history.get('schema') == 2:
        return history
    for observation in history.get('observations', []):
        observation.setdefault('phase_source', None)
        observation.setdefault('delta_mr', None)
        observation.setdefault('delta_lp', None)
        observation.setdefault('observation_type', 'legacy')
    history['schema'] = 2
    return history


def record(items, timestamp, history):
    existing = history['observations']
    added, changed = 0, []
    for item in items:
        previous = next((x for x in reversed(existing) if x['character'] == item['character']), None)
        same_phase = previous is not None and previous['phase'] == item['phase']
        rating_changed = previous is not None and (previous['mr'] != item['mr'] or previous['lp'] != item['lp'])
        if previous and not rating_changed and same_phase and instant(timestamp) - instant(previous['observed_at']) < timedelta(hours=6):
            continue
        row = dict(item, observed_at=timestamp, source='periodic_buckler_snapshot',
                   delta_mr=(item['mr'] - previous['mr'] if same_phase and previous['mr'] is not None and item['mr'] is not None else None),
                   delta_lp=(item['lp'] - previous['lp'] if same_phase and previous['lp'] is not None and item['lp'] is not None else None),
                   observation_type='phase_start' if previous and not same_phase else 'change' if rating_changed else 'heartbeat' if previous else 'initial')
        existing.append(row)
        added += 1
        if rating_changed and same_phase:
            changed.append(item['character'])
    return added, changed


def main():
    started = now()
    status = load('status.json', {'last_success': None, 'last_error': None, 'errors': []})
    history = migrate(load('history.json', {'schema': 2, 'observations': []}))
    runs = load('runs.json', {'schema': 1, 'events': []})
    trigger = os.environ.get('GITHUB_EVENT_NAME', 'manual')
    planned, delay = planned_slot(started, os.environ.get('GITHUB_EVENT_SCHEDULE', '')) if trigger == 'schedule' else (None, None)
    external_at = external_trigger(started, os.environ.get('COLLECTION_ORIGIN', ''),
                                   os.environ.get('EXTERNAL_TRIGGER_UNIX', '')) if trigger == 'workflow_dispatch' else None
    source = 'external_dispatch' if external_at else trigger
    event = {'started_at': started, 'finished_at': None,
             'trigger': source, 'external_trigger_at': external_at,
             'scheduled_for_estimate': planned, 'estimated_delay_seconds': delay,
             'run_id': os.environ.get('GITHUB_RUN_ID'),
             'attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
             'result': 'failure', 'character_count': 0, 'observations_added': 0,
             'changed_characters': [], 'error': None}
    last_success = status.get('last_success')
    if source in ('schedule', 'external_dispatch') and last_success and timedelta(0) <= instant(started) - instant(last_success) < MIN_COLLECTION_GAP:
        event.update(result='skipped_recent_success', finished_at=now())
        runs['events'].append(event)
        save('runs.json', runs)
        print('Skipped redundant scheduled collection after recent success')
        return 0
    status['last_attempt'] = started
    try:
        items, phase_paths = collect()
        observed = now()
        added, changed = record(items, observed, history)
        status['last_success'] = observed
        status['last_error'] = None
        status['auth_health'] = 'ok'
        status['latest'] = items
        status['phase_diagnostic'] = {'candidate_paths': phase_paths,
                                      'reason': None if all(x['phase'] != 'unknown' for x in items)
                                      else 'No verified explicit phase value in this profile response'}
        if changed:
            status['last_rating_change'] = observed
        event.update(result='success', character_count=len(items), observations_added=added,
                     changed_characters=changed)
        save('history.json', history)
        print(f'Collected {len(items)} characters; {added} observations; {len(changed)} changed')
        result = 0
    except Exception as exc:
        # Error messages are generated by this module; no upstream body or secret is logged.
        message = safe_error(exc)
        if message.startswith(('HTTP 401 ', 'HTTP 403 ')):
            status['auth_health'] = 'needs_review'
        status['last_error'] = {'at': now(), 'message': message}
        status['errors'] = (status.get('errors') or [])[-19:] + [status['last_error']]
        event['error'] = message
        print('Collector failed: ' + message, file=sys.stderr)
        save('history.json', history)  # v1 migration is retained even on failure.
        result = 1
    event['finished_at'] = now()
    runs['events'].append(event)
    save('runs.json', runs)
    save('status.json', status)
    return result


if __name__ == '__main__':
    sys.exit(main())
