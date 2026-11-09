"""Offline checks: coverage, variable references, script syntax. No API calls."""
import json
import re
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parent
collection = json.loads((root / 'TicketNow.postman_collection.json').read_text(encoding='utf-8'))
environment = json.loads((root / 'TicketNow.local.postman_environment.json').read_text(encoding='utf-8'))
variables = {v['key']: v['value'] for v in environment['values']}
requests = [i for folder in collection['item'] for i in folder['item']]
assert len(requests) == 81
assert len({i['name'] for i in requests}) == len(requests)
assert all(not value for key, value in variables.items() if 'password' in key or 'token' in key)
refs = set(re.findall(r'\{\{([a-z_]+)\}\}', json.dumps(collection)))
assert refs <= variables.keys(), refs - variables.keys()
# Extract each controller's mappings and compare with collection business paths.
expected = set()
controller_dirs = [
    root.parent / 'eventservice/src/main/java/com/minh/eventservice/controller',
    root.parent / 'seat-inventory/src/main/java/com/minh/seatinventory/controller',
    root.parent / 'booking-service/src/main/java/com/minh/bookingservice/controller',
    root.parent / 'payment-service/src/main/java/com/minh/paymentservice/controller',
    root.parent / 'ticket-service/src/main/java/com/minh/ticketservice/controller'
]
for c_dir in controller_dirs:
    for path in c_dir.glob('*Controller.java'):
        source = path.read_text(encoding='utf-8')
        prefix = re.search(r'@RequestMapping\("([^"]+)"\)', source).group(1)
        for match in re.finditer(r'@(Get|Post|Put|Delete)Mapping(?:\("([^"]*)"\))?', source):
            url = prefix + (match.group(2) or '')
            url = re.sub(r'\{[^}]+\}', ':id', url)
            expected.add((match.group(1).upper(), url))
actual = set()
for item in requests:
    request = item['request']
    if request['url'].startswith('{{base_url}}'):
        url = request['url'].replace('{{base_url}}', '').split('?')[0]
        url = re.sub(r'\{\{[^}]+\}\}', ':id', url)
        actual.add((request['method'], url))
    for e in item['event']:
        code = '\n'.join(e['script']['exec'])
        result = subprocess.run(['node', '--check'], input=code, text=True, capture_output=True)
        assert result.returncode == 0, (item['name'], result.stderr)
assert expected == actual, {'missing': list(expected-actual), 'extra': list(actual-expected)}
assert len(expected) == 46
print(f'PASS: {len(requests)} requests; all {len(expected)} controller operations covered; variables resolved; scripts parse; no saved tokens/passwords.')
