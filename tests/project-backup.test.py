"""Round-trip worktree sources, deletions, deduplication and corrupt input."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts'/filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('backup', 'project-backup.py')
restore = load('restore', 'restore-project.py')


class RoundTrip(unittest.TestCase):
    def test_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp).resolve()
            source = tmp/'source'
            source.mkdir()
            def git(*args):
                return subprocess.check_output(['git', '-C', str(source), *args], text=True).strip()
            git('init', '-b', 'main')
            git('config', 'user.name', 'Backup Test')
            git('config', 'user.email', 'test@example.invalid')
            git('config', 'commit.gpgsign', 'false')
            git('config', 'core.hooksPath', '/dev/null')
            git('remote', 'add', 'origin', 'https://github.com/example/fixture.git')
            (source/'tracked.txt').write_text('before')
            (source/'deleted.txt').write_text('delete me')
            (source/'.gitignore').write_text('artifacts/\nnode_modules/\n.env\n')
            git('add', 'tracked.txt', 'deleted.txt', '.gitignore')
            git('commit', '-m', 'baseline')
            other = tmp/'other'
            git('worktree', 'add', '-b', 'other', str(other))
            (source/'tracked.txt').write_text('unfinished')
            (source/'deleted.txt').unlink()
            (source/'artifacts').mkdir()
            (source/'artifacts/model.blend').write_bytes(b'local authoring data')
            (source/'duplicate.blend').write_bytes(b'local authoring data')
            (source/'.env').write_text('DO_NOT_COPY=secret')
            (source/'node_modules').mkdir()
            (source/'node_modules/private').write_text('DO_NOT_COPY')
            (source/'alias').symlink_to('tracked.txt')
            (source/'external').symlink_to('/etc/passwd')
            output = tmp/'snapshot'
            backup.create(source, output, chunk_bytes=256)
            data = json.loads((output/'manifest.json').read_text())
            primary = next(w for w in data['worktrees'] if w['name'] == 'primary')
            self.assertNotIn('.env', primary['files'])
            self.assertNotIn('node_modules/private', primary['files'])
            self.assertNotIn('external', primary['symlinks'])
            self.assertEqual(primary['files']['duplicate.blend']['sha256'], primary['files']['artifacts/model.blend']['sha256'])
            self.assertGreater(len(data['archive']['parts']), 1)
            destination = tmp/'restored'
            restore.restore(output, destination)
            self.assertEqual((destination/'primary/tracked.txt').read_text(), 'unfinished')
            self.assertFalse((destination/'primary/deleted.txt').exists())
            self.assertEqual((destination/'primary/artifacts/model.blend').read_bytes(), b'local authoring data')
            self.assertEqual((destination/'primary/alias').read_text(), 'unfinished')
            self.assertEqual((destination/'other/tracked.txt').read_text(), 'before')
            self.assertEqual(subprocess.check_output(['git', '-C', str(destination/'primary'), 'remote', 'get-url', 'origin'], text=True).strip(), data['repository'])
            with self.assertRaises(ValueError):
                restore.restore(output, destination)
            part = output/data['archive']['parts'][0]['name']
            part.write_bytes(b'corrupt')
            with self.assertRaises(ValueError):
                restore.restore(output, tmp/'corrupted')
            self.assertFalse((tmp/'corrupted').exists())

    def test_unsafe_paths(self):
        for name in ['.', '..', '../escape', '/tmp/escape', '.git/config', 'a\\b']:
            with self.assertRaises(ValueError):
                restore.safe_name(name)


if __name__ == '__main__':
    unittest.main()
