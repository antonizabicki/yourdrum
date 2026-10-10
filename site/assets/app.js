(() => {
  'use strict';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reducedMotion) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    document.querySelectorAll('.reveal-block, .belief-card, .demo-section, .price-section').forEach(node => {
      node.classList.add('will-reveal'); observer.observe(node);
    });
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    history.replaceState(null, '', `#${id}`);
    if (link.classList.contains('skip-link')) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
  }));

  const releases = window.YOURDRUM_RELEASES?.notes || [];
  const releaseList = document.getElementById('releaseNotesList');
  if (releases.length) {
    releaseList.replaceChildren(...releases.slice(0, 3).map(note => {
      const li = document.createElement('li');
      const version = document.createElement('span');
      version.className = 'release-version'; version.textContent = note.version;
      const text = document.createElement('span'); text.textContent = `${note.title} — ${note.changes.join(' ')}`;
      li.append(version, text); return li;
    }));
  }

  const demo = document.getElementById('stemDemo');
  if (!demo) return;
  const play = demo.querySelector('[data-action="play"]');
  const modes = [...demo.querySelectorAll('button[data-mode]')];
  const solos = [...demo.querySelectorAll('[data-solo]')];
  const errorBox = document.getElementById('audioError');
  const clock = document.getElementById('demoClock');
  const bar = document.getElementById('demoProgress');
  const audioElements = [...demo.querySelectorAll('audio')];
  const stems = ['kick', 'snare', 'hat', 'shaker'];
  const meters = Object.fromEntries(stems.map(stem => [stem, demo.querySelector(`[data-stem="${stem}"] .stem-meter span`)]));
  let context, loading, offlineData, prefetch;
  let sources = [], playing = false, starting = false, offset = 0, startedAt = 0, duration = 14.22, activeMode = 'bypassed', soloStem = null, animation;
  let startRequest = 0, lastFrame = 0;
  const buffers = new Map();
  const downloads = new Map();
  const nodes = new Map();
  const analysers = new Map();
  const format = value => value.toFixed(2).padStart(5, '0');
  const audible = (stem, mode) => mode === activeMode && (!soloStem || stem === soloStem);
  const position = () => playing ? (offset + Math.max(0, context.currentTime - startedAt)) % duration : offset;
  function renderClock(timestamp = 0) {
    if (playing) {
      animation = requestAnimationFrame(renderClock);
      if (timestamp && timestamp - lastFrame < (reducedMotion ? 100 : 1000 / 30)) return;
      lastFrame = timestamp;
    }
    const time = position();
    const text = `${format(time)} / ${format(duration)}`;
    if (clock.textContent !== text) clock.textContent = text;
    bar.style.transform = `scaleX(${time / duration})`;
    for (const stem of stems) {
      const node = analysers.get(stem);
      let level = 0;
      if (playing && audible(stem, activeMode) && node) {
        node.analyser.getByteTimeDomainData(node.data);
        let peak = 0;
        for (let index = 0; index < node.data.length; index += 1) peak = Math.max(peak, Math.abs(node.data[index] - 128));
        level = Math.min(1, peak / 96);
      }
      meters[stem].style.transform = `scaleX(${level})`;
    }
  }
  function updateControls() {
    modes.forEach(button => {
      const active = button.dataset.mode === activeMode;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    solos.forEach(button => {
      const active = button.dataset.solo === soloStem;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    demo.querySelectorAll('.stem-row').forEach(row => {
      row.classList.toggle('soloed', row.dataset.stem === soloStem);
      row.classList.toggle('muted-row', Boolean(soloStem && row.dataset.stem !== soloStem));
    });
    if (context) for (const [key, gain] of nodes) {
      const [stem, mode] = key.split(':');
      if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(context.currentTime);
      else gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(audible(stem, mode) ? .7 : 0, context.currentTime, .008);
    }
  }
  function loadOfflineData() {
    if (offlineData) return offlineData;
    offlineData = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'assets/audio-data.js';
      script.onload = resolve; script.onerror = () => { offlineData = null; script.remove(); reject(new Error('Offline demo data unavailable')); };
      document.head.append(script);
    });
    return offlineData;
  }
  function readAudio(url) {
    if (downloads.has(url)) return downloads.get(url);
    const download = (async () => {
      if (location.protocol === 'file:') {
        await loadOfflineData();
        const encoded = window.YOURDRUM_AUDIO[url];
        if (!encoded) throw new Error('Missing audio file');
        return Uint8Array.from(atob(encoded), char => char.charCodeAt(0)).buffer;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Demo download failed');
        return await response.arrayBuffer();
      } finally { clearTimeout(timeout); }
    })();
    downloads.set(url, download);
    download.catch(() => { if (downloads.get(url) === download) downloads.delete(url); });
    return download;
  }
  async function eachAudio(task) {
    let index = 0;
    const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
      while (index < audioElements.length) await task(audioElements[index++]);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  function warmAudio() {
    if (location.protocol === 'file:' || loading || buffers.size === audioElements.length || prefetch) return;
    // Download near the demo; create/resume the audio context only on Play.
    prefetch = eachAudio(audio => readAudio(audio.getAttribute('src'))).catch(() => { prefetch = null; });
  }
  async function loadAudio() {
    if (buffers.size === audioElements.length) return;
    if (!loading) loading = eachAudio(async audio => {
      const key = `${audio.dataset.stemAudio}:${audio.dataset.mode}`;
      if (buffers.has(key)) return;
      const buffer = await context.decodeAudioData((await readAudio(audio.getAttribute('src'))).slice(0));
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid demo audio');
      buffers.set(key, buffer);
    }).then(() => {
      duration = Math.min(14.22, ...[...buffers.values()].map(buffer => buffer.duration));
      downloads.clear();
    }).finally(() => { loading = null; });
    return loading;
  }
  function prepareGraph() {
    if (nodes.size) return;
    for (const stem of stems) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(context.destination);
      analysers.set(stem, { analyser, data: new Uint8Array(analyser.fftSize) });
    }
    for (const key of buffers.keys()) {
      const [stem, mode] = key.split(':');
      const gain = context.createGain();
      gain.gain.value = audible(stem, mode) ? .7 : 0;
      gain.connect(analysers.get(stem).analyser);
      nodes.set(key, gain);
    }
  }
  function stop() {
    startRequest += 1;
    if (playing) offset = position();
    playing = false; starting = false; cancelAnimationFrame(animation);
    sources.forEach(source => { try { source.stop(); } catch {} source.disconnect(); });
    sources = []; demo.classList.remove('playing'); demo.removeAttribute('aria-busy');
    play.disabled = false; play.textContent = 'Play'; play.setAttribute('aria-label', 'Play demo'); renderClock();
    if (context && context.state !== 'closed') context.suspend().catch(() => {});
  }
  async function start() {
    if (starting || playing) return;
    const request = ++startRequest;
    starting = true;
    play.disabled = true; play.textContent = 'Loading…'; play.setAttribute('aria-label', 'Loading demo'); demo.setAttribute('aria-busy', 'true');
    errorBox.hidden = true;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Web Audio unavailable');
      if (!context) {
        context = new Audio();
        context.addEventListener('statechange', () => { if (playing && context.state !== 'running') stop(); });
      }
      // Resume within the user gesture, before downloading or decoding audio.
      await context.resume();
      await loadAudio();
      if (request !== startRequest || document.hidden) return;
      await context.resume();
      if (request !== startRequest || document.hidden) return;
      prepareGraph();
      updateControls();
      startedAt = context.currentTime + .05;
      for (const [key, buffer] of buffers) {
        const source = context.createBufferSource();
        source.buffer = buffer; source.loop = true; source.loopEnd = duration;
        source.connect(nodes.get(key));
        sources.push(source);
        source.start(startedAt, offset % duration);
      }
      playing = true; lastFrame = 0; demo.classList.add('playing'); play.textContent = 'Pause'; play.setAttribute('aria-label', 'Pause demo'); renderClock();
    } catch (error) {
      if (request !== startRequest) return;
      console.warn('YOURDRUM demo could not start:', error);
      stop(); errorBox.textContent = 'The demo could not load. Check your connection and try Play again.'; errorBox.hidden = false;
    } finally {
      if (request === startRequest) {
        starting = false; play.disabled = false; demo.removeAttribute('aria-busy');
        if (!playing) stop();
      }
    }
  }
  play.addEventListener('click', () => playing ? stop() : start());
  modes.forEach(button => button.addEventListener('click', () => { activeMode = button.dataset.mode; updateControls(); }));
  solos.forEach(button => button.addEventListener('click', () => { soloStem = soloStem === button.dataset.solo ? null : button.dataset.solo; updateControls(); }));
  if ('IntersectionObserver' in window) {
    const preload = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { preload.disconnect(); warmAudio(); }
    }, { rootMargin: '300px' });
    preload.observe(demo);
  }
  demo.addEventListener('pointerenter', warmAudio, { once: true });
  demo.addEventListener('focusin', warmAudio, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (playing || starting)) stop(); });
  window.addEventListener('pagehide', stop);
  updateControls(); renderClock();
})();
