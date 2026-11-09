"""Buckler match collection. Never persist upstream payloads or participant identities."""
import html
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

NEXT = re.compile(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', re.S)
ORIGIN = 'https://www.streetfighter.com'
MODES = {1: 'ranked', 2: 'casual', 3: 'hub', 4: 'custom'}


def match_key(replay_id):
    if not isinstance(replay_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{4,100}', replay_id):
        raise ValueError('Replay identifier unavailable')
    return hashlib.sha256(('sf6-reco:match:v1:' + replay_id).encode()).hexdigest()


def result_from_rounds(own, opponent):
    if not isinstance(own, list) or not own or not isinstance(opponent, list) or len(own) != len(opponent):
        return 'unknown'
    wins = losses = draws = 0
    for a, b in zip(own, opponent):
        if type(a) is not int or type(b) is not int or a not in range(9) or b not in range(9):
            return 'unknown'
        if a == b == 4:
            draws += 1
        elif a in (1, 2, 3, 5, 6, 7, 8) and b == 0:
            wins += 1
        elif b in (1, 2, 3, 5, 6, 7, 8) and a == 0:
            losses += 1
        else:
            return 'unknown'
    return 'win' if wins > losses else 'loss' if losses > wins else 'draw' if draws else 'unknown'


def character(participant):
    for key in ('playing_character_tool_name', 'character_tool_name', 'playing_character_name', 'character_name'):
        value = participant.get(key)
        if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9 _.-]{1,50}', value):
            return {'GOUKI': 'AKUMA'}.get(value.upper(), value.upper().replace(' ', '_'))
    return 'UNKNOWN'


def control(participant):
    name = participant.get('battle_input_type_name')
    if isinstance(name, str):
        for pattern, label in (('classic', 'classic'), ('クラシック', 'classic'),
                               ('modern', 'modern'), ('モダン', 'modern'),
                               ('dynamic', 'dynamic'), ('ダイナミック', 'dynamic')):
            if pattern in name.lower():
                return label
    return 'unknown'


def number(value):
    return value if type(value) is int and 0 <= value <= 10_000_000 else None


def explicit_phase(participant, replay):
    for obj in (participant, replay):
        for key in ('master_league_phase', 'phase_id', 'current_phase', 'current_phase_id'):
            value = obj.get(key)
            if type(value) is int and 1 <= value <= 100:
                return str(value)
    return 'unknown'


def normalize(replay, player, fetched_at):
    key = match_key(replay.get('replay_id'))
    sides = [replay.get('player1_info') or {}, replay.get('player2_info') or {}]
    mine = [i for i, p in enumerate(sides) if str((p.get('player') or {}).get('short_id')) == str(player)]
    if len(mine) != 1:
        raise ValueError('Participant identification unavailable')
    side = mine[0]
    own, other = sides[side], sides[1 - side]
    epoch = replay.get('uploaded_at')
    timestamp = (datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
                 if type(epoch) is int and 1_680_000_000 <= epoch <= 4_102_444_800 else None)
    outcome = result_from_rounds(own.get('round_results'), other.get('round_results'))
    mode = MODES.get(replay.get('replay_battle_type'), 'unknown')
    missing = [name for name, value in (('timestamp', timestamp), ('own_mr_before', number(own.get('master_rating'))),
               ('own_lp_before', number(own.get('league_point')))) if value is None]
    if outcome == 'unknown':
        missing.append('outcome')
    if mode == 'unknown':
        missing.append('mode')
    return {'key': key, 'occurred_at': timestamp, 'time_basis': 'buckler_uploaded_at',
            'character': character(own), 'opponent_character': character(other),
            'own_side': side + 1, 'outcome': outcome, 'outcome_basis': 'paired_round_results',
            'mode': mode, 'own_control': control(own), 'opponent_control': control(other),
            'mr_before': number(own.get('master_rating')), 'lp_before': number(own.get('league_point')),
            'opponent_mr_before': number(other.get('master_rating')), 'opponent_lp_before': number(other.get('league_point')),
            'phase': explicit_phase(own, replay), 'mr_delta': None, 'lp_delta': None,
            'delta_basis': 'unavailable_no_verified_post_match_rating',
            'fetched_at': fetched_at, 'source': 'buckler_battlelog', 'missing': missing}


def read_json(path, default):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def load_archive(folder):
    index = read_json(folder / 'index.json', {'schema': 1, 'months': [], 'count': 0})
    by_month, known = {}, set()
    for month in index['months']:
        if not re.fullmatch(r'(?:\d{4}-\d{2}|undated)', month['month']):
            raise ValueError('Invalid match archive index')
        records = read_json(folder / (month['month'] + '.json'), None)
        if records is None or not isinstance(records.get('matches'), list):
            raise ValueError('Match archive unavailable')
        by_month[month['month']] = records['matches']
        known.update(row['key'] for row in records['matches'])
    return index, by_month, known


def save_archive(folder, index, by_month, additions, fetched_at):
    changed = set()
    for row in additions:
        month = row['occurred_at'][:7] if row['occurred_at'] else 'undated'
        by_month.setdefault(month, []).append(row)
        changed.add(month)
    for month in changed:
        by_month[month].sort(key=lambda row: (row['occurred_at'] or '', row['key']))
        write_json(folder / (month + '.json'), {'schema': 1, 'matches': by_month[month]})
    months = []
    for month, records in sorted(by_month.items()):
        raw = (folder / (month + '.json')).read_bytes()
        dates = [r['occurred_at'] for r in records if r['occurred_at']]
        months.append({'month': month, 'path': month + '.json', 'count': len(records),
                       'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
                       'first_at': min(dates) if dates else None, 'last_at': max(dates) if dates else None})
    index.update(schema=1, months=months, count=sum(m['count'] for m in months), last_success=fetched_at,
                 time_basis='buckler_uploaded_at', archive_scope='only_matches_actually_fetched')
    write_json(folder / 'index.json', index)


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith(ORIGIN + '/6/buckler/') or '/auth/' in newurl:
            raise RuntimeError('Battle log authentication redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_page(build_id, locale, player, page, cookie):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', build_id or '') or not re.fullmatch(r'[a-z-]{2,10}', locale or ''):
        raise ValueError('Battle log route unavailable')
    url = f'{ORIGIN}/6/buckler/_next/data/{build_id}/{locale}/profile/{player}/battlelog.json?page={page}'
    req = urllib.request.Request(url, headers={'Cookie': 'buckler_id=' + cookie,
        'User-Agent': 'Mozilla/5.0 (compatible; PersonalSF6Tracker/1.0)',
        'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.8',
        'Referer': f'{ORIGIN}/6/buckler/{locale}/profile/{player}/battlelog'})
    try:
        with urllib.request.build_opener(SameOriginRedirect()).open(req, timeout=20) as response:
            raw = response.read(3_000_001)
            if len(raw) > 3_000_000:
                raise ValueError('Battle log response exceeded size limit')
        payload = json.loads(raw)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'Battle log HTTP {exc.code}') from None
    page_props = payload.get('pageProps', {})
    if page_props.get('common', {}).get('statusCode') in (401, 403, 429) or '__N_REDIRECT' in page_props:
        raise RuntimeError('Battle log authentication or access rejected')
    if not isinstance(page_props.get('replay_list'), list):
        raise ValueError('Battle log schema unavailable')
    return page_props


def safe_error(exc):
    message = str(exc)
    if re.fullmatch(r'Battle log HTTP \d{3}', message) or message in (
        'Battle log authentication redirect', 'Battle log authentication or access rejected',
        'Battle log route unavailable', 'Battle log schema unavailable', 'Match archive unavailable'):
        return message
    return 'Battle log collection failed (' + type(exc).__name__ + ')'


def capture(raw, player, cookie, folder, fetched_at, fetcher=fetch_page, delay=time.sleep, clock=None):
    """One shared archive supplies all match, session and matchup views."""
    status = read_json(folder / 'status.json', {'last_success': None, 'events': []})
    clock = clock or (lambda: datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'))
    event = {'at': fetched_at, 'run_id': os.environ.get('GITHUB_RUN_ID'), 'result': 'failure',
             'pages': 0, 'added': 0, 'duplicates': 0, 'invalid': 0, 'error': None}
    additions = []
    index = by_month = None
    try:
        root, initial = decode_page(raw)
        index, by_month, known = load_archive(folder)
        previously_known = set(known)
        # First page was already fetched for MR/LP. Its normalized rows cost no request.
        def accept(page, page_fetched_at):
            page_keys = []
            for replay in page['replay_list']:
                try:
                    row = normalize(replay, player, page_fetched_at)
                except (ValueError, TypeError, OverflowError):
                    event['invalid'] += 1
                    continue
                page_keys.append(row['key'])
                if row['key'] in known:
                    event['duplicates'] += 1
                else:
                    known.add(row['key']); additions.append(row)
            return bool(page_keys) and all(key in previously_known for key in page_keys)
        accept(initial, fetched_at)
        max_pages = max(1, min(10, int(os.environ.get('MATCH_MAX_PAGES', '2'))))
        total = 1
        stop = 'page_limit'
        overlap = False
        for page_number in range(1, max_pages + 1):
            if page_number > 1:
                delay(2)
            page = fetcher(root.get('buildId'), root.get('locale') or 'en', player, page_number, cookie)
            event['pages'] += 1
            total = page.get('total_page')
            if type(total) is not int or not 1 <= total <= 100:
                raise ValueError('Battle log schema unavailable')
            if page.get('current_page', page_number) != page_number:
                raise ValueError('Battle log schema unavailable')
            overlap = overlap or any(match_key(row.get('replay_id')) in previously_known
                                      for row in page['replay_list'] if isinstance(row.get('replay_id'), str)
                                      and re.fullmatch(r'[A-Za-z0-9_-]{4,100}', row['replay_id']))
            old_page = accept(page, clock())
            if old_page and index.get('source_window_scanned'):
                stop = 'known_page'; break
            if page_number >= min(total, 10):
                stop = 'exposed_end'; break
        index['source_window_scanned'] = bool(index.get('source_window_scanned') or stop == 'exposed_end')
        if index.get('count', 0) and stop == 'exposed_end' and not overlap:
            index['possible_gap_detected_at'] = fetched_at
        index['coverage_note'] = 'Only the exposed recent source window is available; gaps and older uncollected matches cannot be reconstructed.'
        completed_at = clock()
        save_archive(folder, index, by_month, additions, completed_at)
        event.update(result='success', added=len(additions), stop_reason=stop, source_total_pages=total)
        status.update(last_success=completed_at, last_error=None, route='mixed_battlelog', source_total_pages=total)
    except Exception as exc:
        event['error'] = safe_error(exc)
        status['last_error'] = {'at': fetched_at, 'message': event['error']}
        # Persist valid pages already obtained, even if a later page failed.
        if additions and index is not None and by_month is not None:
            try:
                save_archive(folder, index, by_month, additions, clock())
                event.update(result='partial', added=len(additions))
            except Exception:
                event['error'] = 'Match archive write failed'
    event['finished_at'] = clock()
    status['events'] = (status.get('events') or [])[-199:] + [event]
    status['last_attempt'] = fetched_at
    write_json(folder / 'status.json', status)
    print(f'Battle log: {event["result"]}; pages={event["pages"]}; new={event["added"]}; duplicate={event["duplicates"]}; invalid={event["invalid"]}')
    return event


def decode_page(raw):
    match = NEXT.search(raw)
    if not match:
        raise ValueError('Battle log page data absent')
    root = json.loads(html.unescape(match.group(1)))
    page = root.get('props', {}).get('pageProps', {})
    if page.get('common', {}).get('statusCode') in (401, 403, 429):
        raise ValueError('Battle log authentication or access rejected')
    if '__N_REDIRECT' in page or not isinstance(page.get('replay_list'), list):
        raise ValueError('Battle log schema unavailable')
    return root, page


def inspect_page(raw, player):
    root, page = decode_page(raw)
    rows = page['replay_list']
    fields = lambda obj: sorted(k for k in obj if re.fullmatch(r'[a-z][a-z0-9_]{0,50}', k))
    participants = [row.get(side, {}) for row in rows for side in ('player1_info', 'player2_info')]
    identity_count = sum(any(str(row.get(side, {}).get('player', {}).get('short_id')) == player
                             for side in ('player1_info', 'player2_info')) for row in rows)
    return {'schema': 1, 'result': 'probe_success', 'build_id_present': isinstance(root.get('buildId'), str),
            'locale': root.get('locale') if root.get('locale') in ('en', 'ja', 'ja-jp', 'en-us') else None,
            'current_page': page.get('current_page'), 'total_page': page.get('total_page'),
            'entry_count': len(rows), 'identified_count': identity_count,
            'replay_id_count': sum(bool(row.get('replay_id')) for row in rows),
            'replay_fields': fields(rows[0]) if rows else [],
            'participant_fields': fields(participants[0]) if participants else [],
            'round_codes': sorted({c for p in participants for c in p.get('round_results', []) if type(c) is int}),
            'mode_codes': sorted({row['replay_battle_type'] for row in rows if type(row.get('replay_battle_type')) is int}),
            'client_assets': re.findall(r'<script[^>]+src=["\']([^"\']*static/chunks/pages/profile/[^"\']+)["\']', raw)[:5]}
