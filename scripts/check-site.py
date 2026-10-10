#!/usr/bin/env python3
"""Check deployable assets, references and release metadata without dependencies."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re

root = Path(__file__).resolve().parents[1] / 'site'
redirects = {}
for line in (root / '_redirects').read_text().splitlines():
    source, target, status = line.split()
    assert status == '302'
    assert target.startswith('https://github.com/antonizabicki/yourdrum/releases/download/v1.0.0-beta/')
    redirects[source] = target

class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls, self.ids = [], set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for attr in ['src', 'href']:
            if attr in attrs:
                self.urls.append(attrs[attr])
        if 'id' in attrs:
            self.ids.add(attrs['id'])

pages = {}
for file in root.rglob('*.html'):
    page = References()
    page.feed(file.read_text())
    pages[file.resolve()] = page
for file, page in pages.items():
    for reference in page.urls:
        url = urlsplit(reference)
        if url.scheme or url.netloc:
            continue
        target = ((root / unquote(url.path.lstrip('/'))) if url.path.startswith('/') else file.parent / unquote(url.path)).resolve() if url.path else file
        route = '/' + target.relative_to(root).as_posix()
        if route in redirects:
            continue
        assert target == root or root in target.parents, reference
        if target.is_dir():
            target = target / 'index.html'
        assert target.is_file(), (file.name, reference)
        if url.fragment and target in pages:
            assert url.fragment in pages[target].ids, (file.name, reference)

data = json.loads((root / 'beta/beta-downloads.json').read_text())
embedded = (root / 'assets/beta-data.js').read_text().removeprefix('window.YOURDRUM_DOWNLOADS = ').strip().removesuffix(';')
assert data == json.loads(embedded)
sums = dict(line.split('  ')[::-1] for line in (root / 'beta/downloads/SHA256SUMS.txt').read_text().splitlines())
for build in data['builds']:
    for field, hash_field in [('directory', 'sha256'), ('manual', 'manualSha256')]:
        name = Path(build[field]).name
        assert '/beta/' + build[field] in redirects
        assert redirects['/beta/' + build[field]].endswith('/' + name)
        assert re.fullmatch('[a-f0-9]{64}', build[hash_field])
        assert sums[name] == build[hash_field]
assert len(redirects) == 4
files = [file for file in root.rglob('*') if file.is_file()]
assert len(files) < 20000
assert max(file.stat().st_size for file in files) <= 25 * 1024 * 1024
assert not any(file.suffix.lower() in ['.exe', '.pkg', '.zip'] for file in files)
print(f'OK: {len(files)} public assets, {len(pages)} pages, four release download routes, matching catalog and checksums.')
