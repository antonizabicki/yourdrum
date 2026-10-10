(() => {
  'use strict';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loader = document.getElementById('siteLoader');
  const images = [...document.images];
  let completed = 0;
  const total = images.length + 1;
  function progress() {
    completed += 1;
    const percentage = Math.round(completed / total * 100);
    document.getElementById('loaderProgress').style.width = `${percentage}%`;
    document.getElementById('loaderPercent').textContent = `${percentage}`.padStart(2, '0') + '%';
    document.getElementById('loaderStatus').textContent = percentage === 100 ? 'Ready to make some noise' : 'Loading the interface';
  }
  const imageTasks = images.map(image => new Promise(resolve => {
    if (image.complete) { progress(); resolve(); return; }
    const done = () => { progress(); resolve(); };
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  }));
  const fonts = Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 2500))]).then(progress);
  Promise.race([Promise.all([...imageTasks, fonts]), new Promise(resolve => setTimeout(resolve, 5000))]).then(() => {
    const delay = reducedMotion ? 0 : Math.max(0, 650 - (performance.now() - window.yourdrumLoadStarted));
    setTimeout(() => {
      clearTimeout(window.yourdrumFailSafe);
      document.documentElement.classList.remove('is-loading');
      document.body.classList.add('loaded');
      setTimeout(() => loader?.remove(), reducedMotion ? 0 : 500);
    }, delay);
  });
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
  let context, buffers, loading, offlineData;
  let sources = [], playing = false, offset = 0, startedAt = 0, duration = 14.22, activeMode = 'bypassed', soloStem = null, animation;
  const nodes = new Map();
  const audible = (stem, mode) => mode === activeMode && (!soloStem || stem === soloStem);
  const position = () => playing ? (offset + Math.max(0, context.currentTime - startedAt)) % duration : offset;
  function renderClock() {
    const time = position();
    const format = value => value.toFixed(2).padStart(5, '0');
    clock.textContent = `${format(time)} / ${format(duration)}`;
    bar.style.width = `${time / duration * 100}%`;
    for (const stem of stems) {
      const node = nodes.get(`${stem}:${activeMode}`);
      let level = 0;
      if (playing && audible(stem, activeMode) && node) {
        node.analyser.getByteTimeDomainData(node.data);
        level = Math.min(1, Math.max(...node.data.map(value => Math.abs(value - 128))) / 96);
      }
      meters[stem].style.width = `${level * 100}%`;
    }
    if (playing) animation = requestAnimationFrame(renderClock);
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
    if (context) for (const [key, node] of nodes) {
      const [stem, mode] = key.split(':');
      node.gain.gain.cancelScheduledValues(context.currentTime);
      node.gain.gain.setTargetAtTime(audible(stem, mode) ? .7 : 0, context.currentTime, .008);
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
  async function readAudio(url) {
    if (location.protocol === 'file:') {
      await loadOfflineData();
      const encoded = window.YOURDRUM_AUDIO[url];
      if (!encoded) throw new Error('Missing audio file');
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      return context.decodeAudioData(bytes.buffer);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try { response = await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error('Demo download failed');
    return context.decodeAudioData(await response.arrayBuffer());
  }
  async function loadAudio() {
    if (buffers) return;
    if (!loading) loading = (async () => {
      const entries = [];
      // Bound concurrent requests for small local servers and slow connections.
      for (let index = 0; index < audioElements.length; index += 2) {
        const pair = await Promise.all(audioElements.slice(index, index + 2).map(async audio => {
          const buffer = await readAudio(audio.getAttribute('src'));
          return [`${audio.dataset.stemAudio}:${audio.dataset.mode}`, buffer];
        }));
        entries.push(...pair);
      }
      return entries;
    })().then(entries => {
      buffers = new Map(entries);
      duration = Math.min(14.22, ...entries.map(([,buffer]) => buffer.duration));
    }).finally(() => { loading = null; });
    return loading;
  }
  function stop() {
    if (playing) offset = position();
    playing = false; cancelAnimationFrame(animation);
    sources.forEach(source => { try { source.stop(); } catch {} source.disconnect(); });
    nodes.forEach(node => { node.gain.disconnect(); node.analyser.disconnect(); });
    sources = []; nodes.clear(); demo.classList.remove('playing');
    play.textContent = 'Play'; play.setAttribute('aria-label', 'Play demo'); renderClock();
  }
  async function start() {
    if (play.disabled) return;
    play.disabled = true; play.textContent = 'Loading…'; demo.setAttribute('aria-busy', 'true');
    errorBox.hidden = true;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Web Audio unavailable');
      context ||= new Audio();
      // Resume within the user gesture, before downloading or decoding audio.
      await context.resume();
      await loadAudio();
      startedAt = context.currentTime + .05;
      for (const [key, buffer] of buffers) {
        const [stem, mode] = key.split(':');
        const source = context.createBufferSource(), gain = context.createGain(), analyser = context.createAnalyser();
        source.buffer = buffer; source.loop = true; source.loopEnd = duration;
        gain.gain.value = audible(stem, mode) ? .7 : 0; analyser.fftSize = 256;
        source.connect(gain).connect(analyser).connect(context.destination);
        sources.push(source); nodes.set(key, { gain, analyser, data: new Uint8Array(analyser.fftSize) });
        source.start(startedAt, offset % duration);
      }
      playing = true; demo.classList.add('playing'); play.textContent = 'Pause'; play.setAttribute('aria-label', 'Pause demo'); renderClock();
      if (document.hidden) stop();
    } catch (error) {
      console.warn('YOURDRUM demo could not start:', error);
      stop(); errorBox.textContent = 'The demo could not load. Check the audio files and try Play again.'; errorBox.hidden = false;
    } finally { play.disabled = false; demo.removeAttribute('aria-busy'); }
  }
  play.addEventListener('click', () => playing ? stop() : start());
  modes.forEach(button => button.addEventListener('click', () => { activeMode = button.dataset.mode; updateControls(); }));
  solos.forEach(button => button.addEventListener('click', () => { soloStem = soloStem === button.dataset.solo ? null : button.dataset.solo; updateControls(); }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop(); });
  window.addEventListener('pagehide', stop);
  updateControls(); renderClock();
})();
