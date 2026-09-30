#!/usr/bin/env python3
"""Publish committed static application files; preserve the gh-pages history."""
import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--push', action='store_true', help='Push the prepared deployment commit to origin/gh-pages')
args = parser.parse_args()
repository = Path(__file__).resolve().parents[3]

def git(*arguments, input=None):
    return subprocess.check_output(['git', *arguments], cwd=repository, input=input, text=True).strip()

if git('status', '--porcelain', '--', 'projects/theater-production-os'):
    raise SystemExit('Commit project changes before publishing; uncommitted files would be omitted.')
source = git('rev-parse', 'HEAD')
prefix = 'projects/theater-production-os/'
root = {}
count = 0
for entry in git('ls-tree', '-r', source, '--', prefix).splitlines():
    metadata, name = entry.split('\t', 1)
    mode, kind, oid = metadata.split()
    relative = name.removeprefix(prefix)
    allowed = relative in ['index.html', 'dashboard.html', 'calendar.html'] or (
        relative.startswith(('shared/', 'modules/')) and relative.endswith(('.js', '.css', '.html'))
    ) or (relative.startswith('samples/') and relative.endswith('.json'))
    if not allowed:
        continue
    if kind != 'blob' or mode != '100644':
        raise SystemExit('Unexpected deployment file: ' + relative)
    node = root
    parts = relative.split('/')
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = (mode, oid)
    count += 1
if 'index.html' not in root:
    raise SystemExit('Missing application entry')
root['.nojekyll'] = ('100644', git('hash-object', '-w', '--stdin', input=''))

def make_tree(node):
    entries = []
    for name, value in node.items():
        entries.append(('040000 tree ' + make_tree(value) if isinstance(value, dict) else value[0] + ' blob ' + value[1]) + '\t' + name)
    return git('mktree', input='\n'.join(entries) + '\n')

parent = None
if git('ls-remote', 'origin', 'refs/heads/gh-pages'):
    subprocess.run(['git', 'fetch', '--no-tags', 'origin', 'refs/heads/gh-pages'], cwd=repository, check=True)
    parent = git('rev-parse', 'FETCH_HEAD')
commit_args = ['commit-tree', make_tree(root)]
if parent:
    commit_args.extend(['-p', parent])
deployment = git(*commit_args, input='deploy: publish theater production OS MVP\n\nSource commit: ' + source + '\n')
print(json.dumps({'source': source, 'deployment': deployment, 'application_files': count}, indent=2))
if args.push:
    subprocess.run(['git', 'push', 'origin', deployment + ':refs/heads/gh-pages'], cwd=repository, check=True)
    remote = git('ls-remote', 'origin', 'refs/heads/gh-pages').split()[0]
    if remote != deployment:
        raise SystemExit('Published commit verification failed')
    print('origin/gh-pages verified')
else:
    print('Prepared only. Use --push to publish. Pages configuration is not changed.')
