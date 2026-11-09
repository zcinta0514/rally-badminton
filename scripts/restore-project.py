#!/usr/bin/env python3
"""Verify/extract a project-backup snapshot and restore selected independent clones.

Never modifies an existing destination. Run in a trusted snapshot downloaded from
the project's GitHub Release. Requires Python 3.9+, Git and zstd.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(8*1024**2), b''):
            h.update(b)
    return h.hexdigest()


def safe_name(value):
    p = PurePosixPath(value)
    if not value or value == '.' or p.is_absolute() or '\\' in value or any(x in {'.', '..', '.git'} for x in p.parts):
        raise ValueError('Unsafe snapshot path: ' + value)
    return value


def load_snapshot(source):
    manifest = json.loads((source/'manifest.json').read_text())
    if manifest.get('schema') != 1:
        raise ValueError('Unsupported snapshot schema')
    expected = {}
    for line in (source/'SHA256SUMS').read_text().splitlines():
        sha, name = line.split('  ', 1)
        safe_name(name)
        if '/' in name or not re.fullmatch('[a-f0-9]{64}', sha):
            raise ValueError('Invalid checksum entry')
        expected[name] = sha
    if digest(source/'manifest.json') != expected.get('manifest.json'):
        raise ValueError('Manifest checksum mismatch')
    for item in [*manifest['bundle'].get('parts', [manifest['bundle']]), *manifest['archive']['parts']]:
        name = safe_name(item['name'])
        if '/' in name or item['sha256'] != expected.get(name):
            raise ValueError('Archive checksum metadata mismatch: ' + name)
        p = source/name
        if p.stat().st_size != item['bytes'] or digest(p) != item['sha256']:
            raise ValueError('Archive checksum mismatch: ' + name)
        print('Verified', name, flush=True)
    for sha in manifest['objects']:
        if not re.fullmatch('[a-f0-9]{64}', sha):
            raise ValueError('Invalid object hash')
    names = set()
    for w in manifest['worktrees']:
        name = safe_name(w['name'])
        if '/' in name or name in names or not re.fullmatch('[a-f0-9]{40,64}', w['head']):
            raise ValueError('Invalid worktree metadata')
        names.add(name)
        for p, item in w['files'].items():
            safe_name(p)
            if item['sha256'] not in manifest['objects']:
                raise ValueError('Unknown object in manifest')
        for p, target in w['symlinks'].items():
            safe_name(p)
            if os.path.isabs(target) or '\\' in target:
                raise ValueError('Unsafe symlink target')
            # Normalize relative targets and reject escaping the worktree.
            parts = list(PurePosixPath(p).parent.parts)
            for part in PurePosixPath(target).parts:
                if part == '..':
                    if not parts:
                        raise ValueError('Escaping symlink')
                    parts.pop()
                elif part != '.':
                    parts.append(part)
    return manifest


def unpack(source, manifest, cache):
    process = subprocess.Popen(['zstd', '-d', '-q', '-c'], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE)
    import threading
    failure = []

    def feed():
        try:
            for item in manifest['archive']['parts']:
                with open(source/item['name'], 'rb') as f:
                    shutil.copyfileobj(f, process.stdin, 8*1024**2)
        except BaseException as e:
            failure.append(e)
        finally:
            process.stdin.close()

    t = threading.Thread(target=feed)
    t.start()
    seen = set()
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|') as tar:
            for member in tar:
                sha = member.name.removeprefix('objects/')
                if (not member.isfile() or member.name != 'objects/'+sha or
                        sha not in manifest['objects'] or sha in seen or
                        member.size != manifest['objects'][sha]):
                    raise ValueError('Unexpected archive member: ' + member.name)
                h = hashlib.sha256()
                with open(cache/sha, 'xb') as out:
                    inp = tar.extractfile(member)
                    for b in iter(lambda: inp.read(8*1024**2), b''):
                        h.update(b)
                        out.write(b)
                if h.hexdigest() != sha:
                    raise ValueError('Object checksum mismatch: ' + sha)
                seen.add(sha)
        # Drain padding through zstd to verify its complete frame checksum.
        while process.stdout.read(8*1024**2):
            pass
    except BaseException:
        process.kill()
        t.join()
        process.wait()
        raise
    t.join()
    process.stdout.close()
    if process.wait() or failure or seen != set(manifest['objects']):
        raise ValueError('Incomplete or corrupt object archive')
    print('Verified all', len(seen), 'source objects', flush=True)


def restore(source, destination=None, names=None, verify_only=False):
    source = source.resolve()
    manifest = load_snapshot(source)
    selected = [w for w in manifest['worktrees'] if not names or w['name'] in names]
    if names and set(names) != {w['name'] for w in selected}:
        raise ValueError('Unknown worktree selection')
    if not verify_only and (destination is None or destination.exists()):
        raise ValueError('Destination must be a new directory')
    with tempfile.TemporaryDirectory(prefix='rally-objects-') as temp:
        cache = Path(temp)
        unpack(source, manifest, cache)
        if verify_only:
            return manifest
        destination.mkdir(parents=True)
        bundle = source/manifest['bundle']['name']
        if manifest['bundle'].get('parts'):
            bundle = cache/'history.bundle'
            with open(bundle, 'wb') as out:
                for item in manifest['bundle']['parts']:
                    with open(source/item['name'], 'rb') as inp:
                        shutil.copyfileobj(inp, out, 8*1024**2)
            if digest(bundle) != manifest['bundle']['sha256']:
                raise ValueError('Combined Git bundle checksum mismatch')
        pool = destination/'.history.git'
        subprocess.run(['git', 'clone', '--mirror', str(bundle), str(pool)], check=True)
        subprocess.run(['git', '-C', str(pool), 'remote', 'set-url', 'origin', manifest['repository']], check=True)
        for w in selected:
            target = destination/w['name']
            subprocess.run(['git', 'clone', '--shared', '--no-checkout', str(pool), str(target)], check=True)
            alternates = target/'.git/objects/info/alternates'
            alternates.write_text(os.path.relpath(pool/'objects', target/'.git/objects')+'\n')
            subprocess.run(['git', '-C', str(target), 'switch', '--detach', w['head']], check=True)
            if w['branch']:
                subprocess.run(['git', '-C', str(target), 'switch', '-C', w['branch']], check=True)
            subprocess.run(['git', '-C', str(target), 'remote', 'set-url', 'origin', manifest['repository']], check=True)
            # Restore deletions as well as modifications and untracked/ignored files.
            tracked = subprocess.check_output(['git', '-C', str(target), 'ls-files', '-z']).decode().split('\0')
            for p in filter(None, tracked):
                if p not in w['files'] and p not in w['symlinks']:
                    q = target/safe_name(p)
                    if q.is_symlink() or q.is_file():
                        q.unlink()
            for p, item in w['files'].items():
                q = target/p
                # Never traverse a checked-out symlink while restoring source files.
                for ancestor in [q, *q.parents]:
                    if ancestor == target:
                        break
                    if ancestor.is_symlink():
                        ancestor.unlink()
                q.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(cache/item['sha256'], q)
                q.chmod(item['mode'] & 0o777)
            for p, link in w['symlinks'].items():
                q = target/p
                for ancestor in q.parents:
                    if ancestor == target:
                        break
                    if ancestor.is_symlink():
                        raise ValueError('Symlink ancestor in snapshot: ' + p)
                q.parent.mkdir(parents=True, exist_ok=True)
                if q.is_symlink() or q.is_file():
                    q.unlink()
                q.symlink_to(link)
            actual = subprocess.check_output(['git', '-C', str(target), 'status', '--porcelain=v1', '--untracked-files=no'], text=True).strip()
            if actual != w['trackedStatus']:
                raise ValueError('Restored Git status differs: ' + w['name'])
            print('Restored', w['name'], w['head'], flush=True)
    return manifest


if __name__ == '__main__':
    import tarfile
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--destination', type=Path)
    p.add_argument('--worktree', action='append', help='Snapshot name; repeat to restore several; default all')
    p.add_argument('--verify-only', action='store_true')
    a = p.parse_args()
    restore(a.source, a.destination, a.worktree, a.verify_only)
