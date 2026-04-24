import urllib.request, json, time, sys

# 1. Fetch all controls
req = urllib.request.Request('http://localhost:8000/controls-library/all-controls')
resp = urllib.request.urlopen(req, timeout=10)
data = json.loads(resp.read())
controls = data['controls']
print(f'Fetched {len(controls)} controls', flush=True)

if not controls:
    print('No controls found — nothing to cache.')
    sys.exit(0)

# 2. Send to quality-analysis (will cache results)
payload = {'controls': [
    {'control_id': c['control_id'], 'name': c['control_name'], 'description': c['description']}
    for c in controls
]}

req2 = urllib.request.Request(
    'http://localhost:8000/controls-library/quality-analysis',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'}
)
print(f'Sending {len(payload["controls"])} controls for analysis...', flush=True)
start = time.time()
resp2 = urllib.request.urlopen(req2, timeout=600)
result = json.loads(resp2.read())
elapsed = time.time() - start
print(f'Received {len(result["results"])} results in {elapsed:.1f}s', flush=True)

# 3. Stats
placeholder_count = sum(1 for r in result['results'] if r['score'] == 0 and r['rag'] == 'red')
score_dist = {}
for r in result['results']:
    s = r['score']
    score_dist[s] = score_dist.get(s, 0) + 1
print(f'Placeholder results (all red): {placeholder_count}', flush=True)
print('Score distribution:', dict(sorted(score_dist.items())), flush=True)

# 4. Verify cache works by calling again
print('Verifying cache...', flush=True)
start2 = time.time()
resp3 = urllib.request.urlopen(req2, timeout=30)
result2 = json.loads(resp3.read())
elapsed2 = time.time() - start2
print(f'Cached response returned {len(result2["results"])} results in {elapsed2:.1f}s', flush=True)
