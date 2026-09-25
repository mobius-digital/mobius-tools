"""Push a brand's Claude copy skill into Locus (2026-09-25).

    python sync-copy-skill.py "<skill folder>" "<Brand name in Locus>" [--repo <git dir>]

Sends SKILL.md and every .md under the folder to the account-health worker
(/api/voice/skill-sync), which stores it as the brand's copy skill: the Copy desk in
Locus > Brand > Brand info then writes with the exact same files Claude uses.

It runs by itself from the Lucky Golf repo's post-commit hook whenever a commit touches
.claude/skills/lucky-golf-copy. The token lives OUTSIDE every repo, in
~/.config/mobius/skill-sync-token (the worker's SKILL_SYNC_TOKEN secret).
"""
import json, os, subprocess, sys, urllib.request

URL = 'https://mobius-account-health.mobius-digital.workers.dev/api/voice/skill-sync'

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        sys.exit(__doc__)
    folder, brand = args[0], args[1]
    repo = sys.argv[sys.argv.index('--repo') + 1] if '--repo' in sys.argv else folder
    files = []
    for root, _, names in os.walk(folder):
        for n in sorted(names):
            if n.lower().endswith('.md'):
                p = os.path.join(root, n)
                files.append({'path': os.path.relpath(p, folder).replace(os.sep, '/'), 'content': open(p, encoding='utf-8').read()})
    try:
        commit = subprocess.run(['git', '-C', repo, 'log', '-1', '--format=%h %s', '--', folder], capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = ''
    token = open(os.path.expanduser('~/.config/mobius/skill-sync-token'), encoding='utf-8').read().strip()
    body = json.dumps({'brand': brand, 'files': files, 'commit': commit[:60], 'repo': (subprocess.run(['git', '-C', repo, 'remote', 'get-url', 'origin'], capture_output=True, text=True).stdout.strip().rstrip('/').split('/')[-1].removesuffix('.git') or os.path.basename(os.path.abspath(repo)))}).encode('utf-8')
    req = urllib.request.Request(URL, data=body, method='POST', headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'mobius-skill-sync'})
    with urllib.request.urlopen(req, timeout=60) as r:
        print('Locus:', r.read().decode('utf-8'))

if __name__ == '__main__':
    main()
