import json
import time
import uuid
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = 'http://127.0.0.1:8791/api'

def api(path, data=None):
    req = urllib.request.Request(BASE + path, data=None if data is None else json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as response:
        return json.load(response)

def generate(name, prompt, edits, count=32):
    body = dict(prompt=prompt, edits=edits, max_new=count, run_id=str(uuid.uuid4()))
    req = urllib.request.Request(BASE + '/generate', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    result = dict(name=name, prompt=prompt, edits=edits, max_new=count, baseline='', modified='')
    with urllib.request.urlopen(req, timeout=180) as response:
        for line in response:
            e = json.loads(line)
            if e['type'] == 'error': raise RuntimeError(e['message'])
            if e['type'] == 'text': result[e['branch']] = e['text']
            if e['type'] == 'probabilities': result['probabilities'] = e['items']
    with (ROOT / 'runs.jsonl').open('a', encoding='utf-8') as f:
        f.write(json.dumps(result) + '\n')
    print(json.dumps({k:result[k] for k in ('name','edits','baseline','modified')}), flush=True)
    return result

def edit(layer, neuron, mode, value):
    return dict(layer=layer, neuron=neuron, mode=mode, value=value, enabled=True)

if __name__ == '__main__':
    for _ in range(90):
        try:
            if api('/status')['state'] == 'ready': break
        except Exception: pass
        time.sleep(1)
    print(json.dumps(api('/status')), flush=True)
    city = 'The city was quiet after the rain. In the distance,'
    for dose in (0, 5, 10, 20, -20, 50):
        generate(f'city-dose-{dose}', city, [edit(6,2130,'add',dose)])
    prompts = {
        'fact': 'The capital of France is',
        'arithmetic': '1 + 1 = 2\n2 + 2 = 4\n3 + 3 =',
        'code': 'def fibonacci(n):\n    if n <= 1:\n        return n\n    return',
        'positive': 'The movie was wonderful. The acting was brilliant and the story was',
        'negative': 'The movie was terrible. The acting was awful and the story was',
        'french': 'Le soleil brille dans le ciel. Les oiseaux chantent et',
    }
    for name, prompt in prompts.items():
        a = api('/analyze', {'prompt':prompt})
        for layer in (6,11):
            d = api(f'/analysis/{a["id"]}/layers/{layer}')
            n = max(range(3072), key=lambda i:abs(d['values'][i]))
            print(json.dumps(dict(analysis=name,layer=layer,neuron=n,activation=d['values'][n],token=a['tokens'][d['positions'][n]])), flush=True)
            for mode, value in [('ablate',0),('add',20)]:
                generate(f'{name}-L{layer}-{mode}',prompt,[edit(layer,n,mode,value)])
