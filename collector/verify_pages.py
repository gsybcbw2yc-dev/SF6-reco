"""Check that Pages serves the same last collection event as the repository."""
import json
import hashlib
import os
import time
import urllib.request
from pathlib import Path

BASE = 'https://gsybcbw2yc-dev.github.io/SF6-reco/data/'
DATA = Path(__file__).resolve().parents[1] / 'web' / 'data'


def published_bytes(path, version):
    request = urllib.request.Request(BASE + path + '?verify=' + version,
                                     headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read(5_000_001)


def verify_matches(expected_id):
    folder = DATA / 'matches'
    if not (folder / 'status.json').exists():
        return True
    expected_status = json.loads((folder / 'status.json').read_text())
    if expected_status['events'][-1]['run_id'] != expected_id:
        return True  # A skipped MR run did not fetch a new battle log.
    actual_status = json.loads(published_bytes('matches/status.json', expected_id))
    if actual_status['events'][-1] != expected_status['events'][-1]:
        return False
    if not (folder / 'index.json').exists():
        return True  # Failure state is visible; it is not a successful match import.
    expected = json.loads((folder / 'index.json').read_text())
    actual = json.loads(published_bytes('matches/index.json', expected_id))
    if actual != expected:
        return False
    for month in expected['months']:
        raw = published_bytes('matches/' + month['path'], month['sha256'])
        if hashlib.sha256(raw).hexdigest() != month['sha256']:
            return False
    print('Pages match archive verified: ' + str(expected['count']) + ' sanitized matches')
    return True


def verify():
    expected = json.loads((DATA / 'runs.json').read_text())['events'][-1]
    expected_id = expected['run_id']
    if not expected_id:
        raise RuntimeError('Missing expected collection run ID')
    if os.environ.get('GITHUB_RUN_ID') and expected_id != os.environ['GITHUB_RUN_ID']:
        raise RuntimeError('Collection did not write a run event for this workflow')
    for attempt in range(6):
        try:
            request = urllib.request.Request(BASE + 'runs.json?verify=' + expected_id,
                                             headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=15) as response:
                actual = json.load(response)['events'][-1]
            if actual['run_id'] == expected_id and actual['started_at'] == expected['started_at'] and verify_matches(expected_id):
                print('Pages serves current collection run ID ' + expected_id)
                return
        except (OSError, ValueError, KeyError, IndexError):
            pass
        if attempt < 5:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('Pages does not yet serve the current collection run')


if __name__ == '__main__':
    verify()
