"""Buckler match collection. Never persist upstream payloads or participant identities."""
import html
import json
import re

NEXT = re.compile(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', re.S)


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
