"""Exercise the real release verification shell with a simulated npm registry."""
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


MOCK_NPM = r'''#!/usr/bin/env python3
import io, json, os, pathlib, sys, tarfile
root = pathlib.Path(os.environ['MOCK_ROOT'])
state_path = root / 'state.json'
state = json.loads(state_path.read_text()) if state_path.exists() else {'view': 0, 'pack': 0}
plan = json.loads(os.environ['MOCK_PLAN'])
kind = sys.argv[1]
assert kind in state
with (root / 'calls.jsonl').open('a') as f:
    f.write(json.dumps(sys.argv[1:]) + '\n')
values = plan.get(kind, ['ok'])
result = values[min(state[kind], len(values) - 1)]
state[kind] += 1
state_path.write_text(json.dumps(state))
if result in ('404', 'network', 'integrity'):
    print('simulated ' + result, file=sys.stderr)
    sys.exit(1)
if kind == 'view':
    print('0.0.67' if result == 'wrong-version' else '0.0.68')
else:
    assert '--ignore-scripts' in sys.argv
    destination = pathlib.Path(next(a.split('=', 1)[1] for a in sys.argv if a.startswith('--pack-destination=')))
    archive = destination / 'release.tgz'
    if result == 'corrupt':
        archive.write_bytes(b'not a tarball')
    else:
        with tarfile.open(archive, 'w:gz') as t:
            data = b'export {}'
            info = tarfile.TarInfo('package/README.md' if result == 'missing-entry' else 'package/dist/index.js')
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
'''


class ReleaseVerificationTests(unittest.TestCase):
    def run_verification(self, plan, success, expected_views, expected_packs):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            npm = root / 'npm'
            npm.write_text(MOCK_NPM)
            npm.chmod(0o755)
            sleep = root / 'sleep'
            sleep.write_text('#!/bin/bash\necho "$1" >> "$MOCK_ROOT/sleeps"\n')
            sleep.chmod(0o755)
            environment = dict(os.environ, MOCK_ROOT=directory, MOCK_PLAN=json.dumps(plan))
            environment['PATH'] = directory + os.pathsep + os.environ['PATH']
            script = Path(__file__).with_name('verify-npm-release.sh')
            result = subprocess.run(
                ['bash', str(script), '@tscircuit/copper-pour-solver', '0.0.68'],
                env=environment, capture_output=True, text=True, timeout=30,
            )
            self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
            state = json.loads((root / 'state.json').read_text())
            self.assertEqual(state, {'view': expected_views, 'pack': expected_packs})
            sleeps = (root / 'sleeps').read_text().splitlines() if (root / 'sleeps').exists() else []
            self.assertEqual(len(sleeps), expected_views - 1)
            self.assertTrue(all(delay == '15' for delay in sleeps))
            calls = [json.loads(line) for line in (root / 'calls.jsonl').read_text().splitlines()]
            view_caches = []
            for call in calls:
                self.assertIn('--prefer-online', call)
                self.assertIn('--fetch-retries=0', call)
                self.assertIn('--fetch-timeout=15000', call)
                self.assertIn('--registry=https://registry.npmjs.org/', call)
                cache = next(argument for argument in call if argument.startswith('--cache='))
                self.assertFalse(Path(cache.split('=', 1)[1]).parent.exists(), 'Temporary files must be removed')
                if call[0] == 'view':
                    view_caches.append(cache)
            self.assertEqual(len(view_caches), len(set(view_caches)), 'Each attempt must have a fresh cache')

    def test_immediately_available(self):
        self.run_verification({}, True, 1, 1)

    def test_metadata_propagation_delay(self):
        self.run_verification({'view': ['404', '404', 'ok']}, True, 3, 1)

    def test_tarball_propagation_delay(self):
        self.run_verification({'pack': ['404', 'ok']}, True, 2, 2)

    def test_transient_network_failure(self):
        self.run_verification({'view': ['network', 'ok']}, True, 2, 1)

    def test_wrong_metadata_version(self):
        self.run_verification({'view': ['wrong-version', 'ok']}, True, 2, 1)

    def test_integrity_failure(self):
        self.run_verification({'pack': ['integrity', 'ok']}, True, 2, 2)

    def test_corrupt_archive(self):
        self.run_verification({'pack': ['corrupt', 'ok']}, True, 2, 2)

    def test_missing_runtime_entry(self):
        self.run_verification({'pack': ['missing-entry', 'ok']}, True, 2, 2)

    def test_metadata_never_appears(self):
        self.run_verification({'view': ['404']}, False, 20, 0)

    def test_tarball_never_appears(self):
        self.run_verification({'pack': ['404']}, False, 20, 20)

    def test_permanent_wrong_version(self):
        self.run_verification({'view': ['wrong-version']}, False, 20, 0)


if __name__ == '__main__':
    unittest.main()
