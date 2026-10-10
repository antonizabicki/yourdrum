(() => {
  'use strict';
  const data = window.YOURDRUM_DOWNLOADS;
  if (!data?.builds?.length) return;
  const root = document.getElementById('downloads');
  const search = document.getElementById('searchInput');
  const empty = document.getElementById('emptyState');
  let filter = 'all';
  const icons = {
    windows: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M4 8l18-2v17H4zm21-2l19-3v20H25zM4 26h18v17L4 41zm21 0h19v20l-19-3z"/></svg>',
    macos: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M30 10c3-3 3-6 3-8-3 0-6 2-8 4-2 3-3 5-2 7 2 0 5-1 7-3zm8 14c0-5 4-8 5-9-3-4-7-5-10-5-4 0-6 2-9 2-2 0-5-2-8-2-6 0-12 6-12 15 0 8 3 16 7 20 2 2 4 2 6 1 3-1 4-2 7-2s5 1 7 2c3 1 5 0 7-2 3-4 5-8 6-11-4-2-6-5-6-9z"/></svg>'
  };
  const node = (tag, className, text) => {
    const element = document.createElement(tag); element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  function card(build, index) {
    const article = node('article', 'download-card'); article.dataset.platform = build.platform;
    const top = node('div', 'card-top');
    const icon = node('div', 'platform-icon'); icon.innerHTML = icons[build.platform];
    top.append(icon, node('span', 'card-index', `0${index + 1} / ${build.architecture.toUpperCase()}`));
    const title = node('h2', '', build.name);
    const info = node('p', '', build.requirements);
    const format = node('div', 'format', `VST3 INSTRUMENT / ${build.version} BETA`);
    const download = node('a', 'download-btn'); download.href = build.directory; download.download = '';
    download.append(node('span', '', `Download for ${build.name}`), node('span', '', '↗'));
    const size = node('div', 'file-size', `${build.size} / ${build.format} INSTALLER`);
    const manual = node('a', 'manual', 'Manual VST3 ZIP ↗'); manual.href = build.manual; manual.download = '';
    const details = node('details', 'checksum');
    const summary = node('summary', '', 'Verify download / SHA-256');
    const checksum = node('code', '', build.sha256);
    const copy = node('button', '', 'Copy checksum'); copy.type = 'button'; copy.setAttribute('aria-label', `Copy ${build.name} installer checksum`);
    const status = node('span', 'copy-status'); status.setAttribute('role', 'status');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(build.sha256); status.textContent = 'Checksum copied.'; }
      catch { const range = document.createRange(); range.selectNodeContents(checksum); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); status.textContent = 'Checksum selected. Press Ctrl+C or ⌘C to copy.'; }
    });
    details.append(summary, checksum, copy, status);
    article.append(top, title, info, format, download, size, manual, details);
    return article;
  }
  function render() {
    const query = search.value.trim().toLowerCase();
    const builds = data.builds.filter(build => (filter === 'all' || build.platform === filter) && `${build.name} ${build.version} ${build.requirements} ${build.architecture}`.toLowerCase().includes(query));
    root.replaceChildren(...builds.map(card)); empty.hidden = builds.length !== 0;
  }
  document.querySelectorAll('[data-platform]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.platform;
    document.querySelectorAll('button[data-platform]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  search.addEventListener('input', render); render();
})();
