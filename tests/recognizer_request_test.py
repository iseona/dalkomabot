import importlib.util
import os
from pathlib import Path
import shutil
import sys
import tempfile
import types

class FakeDynamo:
    class exceptions:
        ConditionalCheckFailedException = type('ConditionalCheckFailedException', (Exception,), {})

fake_boto3 = types.ModuleType('boto3')
fake_boto3.client = lambda name: FakeDynamo() if name == 'dynamodb' else object()
sys.modules['boto3'] = fake_boto3
os.environ['OPENAI_SECRET_ID'] = 'test-secret'
os.environ['RATE_TABLE'] = 'test-rate-table'
with tempfile.TemporaryDirectory() as directory:
    package = Path(directory)
    shutil.copy('aws/recognizer.py', package / 'recognizer.py')
    shutil.copy('dist/data.json', package / 'data.json')
    spec = importlib.util.spec_from_file_location('recognizer', package / 'recognizer.py')
    recognizer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recognizer)

request = recognizer.build_request(['data:image/jpeg;base64,AA=='], 'test prompt')
schema = request['text']['format']['schema']
assert request['text']['format']['strict'] is True
assert schema['type'] == 'object'
assert set(schema['required']) == {'schemaVersion', 'kind', 'slots', 'sides'}
assert set(schema['properties']) == {'schemaVersion', 'kind', 'slots', 'sides'}
assert schema['properties']['kind']['enum'] == ['party', 'lead']
assert schema['properties']['slots']['maxItems'] == 6
assert schema['properties']['sides']['properties']['mine']['maxItems'] == 6
assert request['input'][0]['content'][1]['type'] == 'input_image'

def contains_one_of(value):
    if isinstance(value, dict):
        return 'oneOf' in value or any(contains_one_of(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_one_of(item) for item in value)
    return False

assert not contains_one_of(schema)

def slots():
    return [{'slot': index, 'name': None, 'item': None, 'ability': None, 'nature': None,
             'moves': [], 'evs': [None] * 6, 'confidence': 0, 'notes': ''}
            for index in range(1, 7)]

assert recognizer.sanitize({'schemaVersion': 1, 'kind': 'party', 'slots': slots(),
                            'sides': {'mine': [], 'opp': []}}, 'party')['slots'][0]['slot'] == 1
assert recognizer.sanitize({'schemaVersion': 1, 'kind': 'lead', 'slots': [],
                            'sides': {'mine': slots(), 'opp': slots()}}, 'lead')['sides']['opp'][5]['slot'] == 6
print('PASS: recognition request uses a single Structured Outputs root schema without oneOf.')
