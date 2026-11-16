import json
import time

import pytest
from fastapi.testclient import TestClient

from backend.server import app

EDIT = {'layer': 6, 'neuron': 123, 'mode': 'add', 'value': 5}


@pytest.fixture(scope='module')
def client():
    """Start the app and wait until the model is ready."""
    with TestClient(app) as c:
        deadline = time.monotonic() + 600
        while c.get('/api/status').json()['state'] not in ('ready', 'error'):
            assert time.monotonic() < deadline, 'Model load timed out'
            time.sleep(0.1)
        status = c.get('/api/status').json()
        assert status['state'] == 'ready', status['error']
        yield c


def run(client, **body):
    response = client.post('/api/generate', json={'prompt': 'The ocean', 'run_id': 'api-test', 'max_new': 4, **body})
    assert response.status_code == 200
    return [json.loads(line) for line in response.text.splitlines()]


def test_invalid_requests():
    c = TestClient(app)
    base = {'prompt': 'The ocean', 'run_id': 'validation-test', 'max_new': 4}
    for invalid in [{**EDIT, 'layer': 12}, {**EDIT, 'neuron': -1}, {**EDIT, 'mode': 'unknown'}, {**EDIT, 'value': 10001}]:
        assert c.post('/api/generate', json={**base, 'edits': [invalid]}).status_code == 422
    assert c.post('/api/generate', json={**base, 'edits': [EDIT, EDIT]}).status_code == 422
    assert c.post('/api/generate', json={**base, 'max_new': 257}).status_code == 422
    assert c.post('/api/generate', json={**base, 'run_id': 'not valid'}).status_code == 422
    assert c.post('/api/analyze', json={'prompt': ''}).status_code == 422


def test_analysis_endpoints(client):
    a = client.post('/api/analyze', json={'prompt': 'The ocean is full of life.'}).json()
    count = len(a['tokens'])
    peak = client.get(f'/api/analysis/{a["id"]}/layers/6').json()
    assert len(peak['values']) == len(peak['positions']) == 3072
    assert all(0 <= p < count for p in peak['positions'])
    trace = client.get(f'/api/analysis/{a["id"]}/layers/6/neurons/123').json()['trace']
    assert len(trace) == count
    assert max(trace, key=abs) == pytest.approx(peak['values'][123])
    at_token = client.get(f'/api/analysis/{a["id"]}/layers/6', params={'token': 2}).json()
    assert at_token['values'][123] == pytest.approx(trace[2])
    assert client.get(f'/api/analysis/{a["id"]}/layers/6', params={'token': count}).status_code == 400
    assert client.get(f'/api/analysis/{a["id"]}/layers/12').status_code == 422
    assert client.get('/api/analysis/unknown/layers/6').status_code == 404
    assert client.post('/api/analyze', json={'prompt': ' hello' * 1025}).status_code == 400


def test_generate_stream(client):
    events = run(client)
    assert events[0]['type'] == 'start' and events[-1] == {'type': 'done', 'cancelled': False}
    text = {e['branch']: e['text'] for e in events if e['type'] == 'text'}
    assert text['baseline'] == text['modified'] != ''
    timing = [e for e in events if e['type'] == 'timing']
    assert [e['branch'] for e in timing] == ['baseline', 'modified']
    assert all(e['tokens'] == 4 and e['first_token_seconds'] <= e['seconds'] for e in timing)
    probabilities = next(e['items'] for e in events if e['type'] == 'probabilities')
    assert all(p['baseline'] == pytest.approx(p['modified']) for p in probabilities)

    edited = run(client, edits=[{**EDIT, 'neuron': 2130, 'value': 20}])
    shifted = next(e['items'] for e in edited if e['type'] == 'probabilities')
    assert any(abs(p['baseline'] - p['modified']) > 1e-4 for p in shifted)

    disabled = run(client, edits=[{**EDIT, 'neuron': 2130, 'value': 20, 'enabled': False}])
    unchanged = next(e['items'] for e in disabled if e['type'] == 'probabilities')
    assert all(p['baseline'] == pytest.approx(p['modified']) for p in unchanged)


def test_generate_reports_errors(client):
    events = run(client, prompt=' hello' * 1024)
    assert [e['type'] for e in events] == ['error', 'done']
    assert client.get('/api/status').json()['busy'] is False
