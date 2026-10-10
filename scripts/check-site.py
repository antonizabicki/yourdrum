#!/usr/bin/env python3
"""Check deployable assets, references and release metadata without dependencies."""
import json
import re
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

root = Path(__file__).resolve().parents[1] / 'site'
redirects = {}
for line in (root / '_redirects').read_text().splitlines():
    source, target, status = line.split()
    assert status == '301'
    assert target == '/buy/'
    redirects[source] = target
assert redirects == {'/beta': '/buy/', '/beta/*': '/buy/'}

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

homepage = (root / 'index.html').read_text()
purchase = (root / 'buy/index.html').read_text()
assert 'Official release' in homepage
assert 'OFFICIAL RELEASE' in purchase
assert all('beta' not in file.read_text().lower() for file in root.rglob('*.html'))
assert homepage.count('data-gumroad') == 4
assert purchase.count('data-gumroad') == 1
store_url = re.search(r"const YOURDRUM_GUMROAD_URL = '([^']+)';", (root / 'assets/store.js').read_text()).group(1)
assert urlsplit(store_url).scheme == 'https'
assert urlsplit(store_url).hostname == 'gumroad.com' or urlsplit(store_url).hostname.endswith('.gumroad.com')
notes = json.loads((root / 'assets/releases.js').read_text().removeprefix('window.YOURDRUM_RELEASES = ').strip().removesuffix(';'))
assert notes == json.loads((root / 'release-notes.json').read_text())
assert 'download=' not in (homepage + purchase)
assert not (root / 'beta').exists()
assert not (root / 'assets/beta-data.js').exists()
assert '/buy/' in (root / 'sitemap.xml').read_text()
assert '/beta/' not in (root / 'sitemap.xml').read_text()
files = [file for file in root.rglob('*') if file.is_file()]
assert len(files) < 20000
assert max(file.stat().st_size for file in files) <= 25 * 1024 * 1024
assert not any(file.suffix.lower() in ['.exe', '.pkg', '.zip'] for file in files)
print(f'OK: {len(files)} public assets, {len(pages)} pages, five Gumroad purchase links, legacy routes redirected to the purchase page.')
