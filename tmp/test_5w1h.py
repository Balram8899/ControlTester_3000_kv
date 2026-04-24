import urllib.request, json, time

req = urllib.request.Request('http://localhost:8000/controls-library/all-controls')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
controls = data['controls']
print('Fetched', len(controls), 'controls')

payload = {'controls': [
    {'control_id': c['control_id'], 'name': c['control_name'], 'description': c['description']}
    for c in controls
]}

req2 = urllib.request.Request(
    'http://localhost:8000/controls-library/quality-analysis',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'}
)
print('Sending', len(payload['controls']), 'controls for analysis...')
start = time.time()
try:
    resp2 = urllib.request.urlopen(req2, timeout=600)
    result = json.loads(resp2.read())
    elapsed = time.time() - start
    print(f'Received {len(result["results"])} results in {elapsed:.1f}s')
    placeholder_count = sum(1 for r in result['results'] if r['score'] == 0 and r['rag'] == 'red')
    print(f'Placeholder results (all red): {placeholder_count}')
    for r in result['results'][:3]:
        print(f"  {r['control_id']}: score={r['score']}, rag={r['rag']}")
except Exception as e:
    print('ERROR:', e)
