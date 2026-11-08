"""Check that Pages serves the same last collection event as the repository."""
import json
import os
import time
import urllib.request
from pathlib import Path

BASE = 'https://gsybcbw2yc-dev.github.io/SF6-reco/data/'
DATA = Path(__file__).resolve().parents[1] / 'web' / 'data'


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
            if actual['run_id'] == expected_id and actual['started_at'] == expected['started_at']:
                print('Pages serves current collection run ID ' + expected_id)
                return
        except (OSError, ValueError, KeyError, IndexError):
            pass
        if attempt < 5:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('Pages does not yet serve the current collection run')


if __name__ == '__main__':
    verify()
