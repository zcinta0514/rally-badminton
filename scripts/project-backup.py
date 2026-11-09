#!/usr/bin/env python3
"""Content-addressed, read-only snapshots of Git worktrees and ignored sources.

Requires Python 3.9+, Git and zstd. No network, credential access or Git mutation.
Restore with restore-project.py; dependencies and private runtime data are excluded.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile

SKIP_DIRS = {'.git', 'node_modules', 'dist', '.cindy-worktrees', '__pycache__',
             '.cache', '.npm-cache', '.venv', 'venv', '.vscode', '.idea'}
SKIP_SUFFIXES = {'.pyc', '.log', '.pem', '.key', '.p12', '.pfx', '.crt'}


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def excluded(name):
    return (name in {'.git', '.DS_Store', 'Thumbs.db'} or
            (name.startswith('.env') and name != '.env.example') or
            name.startswith(('credentials', 'service-account')) or
            Path(name).suffix in SKIP_SUFFIXES or name.endswith('.local'))


def create(root, output, chunk_bytes=1024**3):
    root = root.resolve()
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    manifest = {'schema': 1, 'repository': git(root, 'remote', 'get-url', 'origin'),
                'excludedDirectories': sorted(SKIP_DIRS),
                'excludedFiles': [], 'unavailableWorktrees': [], 'worktrees': [],
                'objects': {}, 'archive': {'format': 'tar.zst', 'parts': []}}
    bundle = output / 'history.bundle'
    subprocess.run(['git', '-C', str(root), 'bundle', 'create', str(bundle), '--all'], check=True)
    subprocess.run(['git', '-C', str(root), 'bundle', 'verify', str(bundle)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    manifest['bundle'] = {'name': bundle.name, 'sha256': digest(bundle), 'bytes': bundle.stat().st_size}
    unique = {}
    inode_cache = {}
    raw = git(root, 'worktree', 'list', '--porcelain')
    for block in raw.split('\n\n'):
        fields = dict(line.split(' ', 1) for line in block.splitlines() if ' ' in line)
        path = Path(fields['worktree'])
        check = subprocess.run(['git', '-C', str(path), 'rev-parse', 'HEAD'], capture_output=True, text=True)
        if check.returncode:
            manifest['unavailableWorktrees'].append(path.name)
            continue
        label = 'primary' if path.resolve() == root else path.name
        if any(w['name'] == label for w in manifest['worktrees']):
            raise ValueError('Duplicate worktree name: ' + label)
        before = git(path, 'status', '--porcelain=v1', '--untracked-files=no')
        w = {'name': label, 'head': check.stdout.strip(),
             'branch': fields.get('branch', '').removeprefix('refs/heads/'),
             'trackedStatus': before, 'files': {}, 'symlinks': {}}
        for base, dirs, files in os.walk(path, followlinks=False):
            base = Path(base)
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and
                             not excluded(d) and (base/d).resolve() != output and
                             not (base == path and d == 'data'))
            # Directory symlinks are metadata, never followed.
            for d in list(dirs):
                if (base/d).is_symlink():
                    dirs.remove(d)
                    files.append(d)
            for name in sorted(files):
                p = base / name
                rel = p.relative_to(path).as_posix()
                if excluded(name):
                    manifest['excludedFiles'].append(label + '/' + rel)
                    continue
                if p.is_symlink():
                    target = os.readlink(p)
                    if os.path.isabs(target) or not p.resolve().is_relative_to(path.resolve()):
                        manifest['excludedFiles'].append(label + '/' + rel + ' (external symlink)')
                        continue
                    w['symlinks'][rel] = target
                    continue
                s = p.stat()
                if not stat.S_ISREG(s.st_mode):
                    raise ValueError('Unsupported special file: ' + str(p))
                key = (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns)
                sha = inode_cache.get(key)
                if not sha:
                    sha = digest(p)
                    inode_cache[key] = sha
                if p.stat().st_mtime_ns != s.st_mtime_ns or p.stat().st_size != s.st_size:
                    raise ValueError('File changed during snapshot: ' + str(p))
                unique.setdefault(sha, (p, key))
                manifest['objects'][sha] = s.st_size
                w['files'][rel] = {'sha256': sha, 'mode': stat.S_IMODE(s.st_mode)}
        if before != git(path, 'status', '--porcelain=v1', '--untracked-files=no'):
            raise ValueError('Worktree changed during snapshot: ' + label)
        manifest['worktrees'].append(w)
        print('Scanned', label, len(w['files']), 'files;', len(unique), 'unique objects', flush=True)
    print('Unique bytes:', sum(manifest['objects'].values()), flush=True)
    # Compress objects in one stream, split below GitHub's per-asset limit.
    process = subprocess.Popen(['zstd', '-T4', '-3', '-q', '-c'], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE)
    # Feed tar on a thread while draining compressed output to avoid pipe deadlock.
    import threading
    failure = []

    def produce():
        try:
            with tarfile.open(fileobj=process.stdin, mode='w|') as tar:
                for sha, (p, old) in unique.items():
                    s = p.stat()
                    if (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns) != old:
                        raise ValueError('Source changed before archiving: ' + str(p))
                    info = tarfile.TarInfo('objects/' + sha)
                    info.size = s.st_size
                    info.mode = 0o600
                    with open(p, 'rb') as f:
                        tar.addfile(info, f)
        except BaseException as e:
            failure.append(e)
        finally:
            process.stdin.close()

    thread = threading.Thread(target=produce)
    thread.start()
    number = 0
    while True:
        first = process.stdout.read(min(chunk_bytes, 8*1024**2))
        if not first:
            break
        name = 'sources.tar.zst.part-' + str(number).zfill(4)
        p = output / name
        h = hashlib.sha256()
        size = 0
        with open(p, 'wb') as f:
            data = first
            while data:
                f.write(data)
                h.update(data)
                size += len(data)
                if size == chunk_bytes:
                    break
                data = process.stdout.read(min(chunk_bytes-size, 8*1024**2))
        manifest['archive']['parts'].append({'name': name, 'sha256': h.hexdigest(), 'bytes': size})
        print('Packed', name, size, flush=True)
        number += 1
    thread.join()
    process.stdout.close()
    if process.wait() or failure:
        raise RuntimeError('Archive failed: ' + repr(failure))
    # Re-read actual source inputs: a successfully packed snapshot must not race writers.
    for sha, (p, old) in unique.items():
        s = p.stat()
        if (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns) != old:
            raise ValueError('Source changed during archiving: ' + str(p))
    (output/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    (output/'SHA256SUMS').write_text(''.join(
        item['sha256']+'  '+item['name']+'\n'
        for item in [manifest['bundle'], *manifest['archive']['parts']]) +
        digest(output/'manifest.json')+'  manifest.json\n')
    print('Snapshot complete:', output, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    create(args.root, args.output)
