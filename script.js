/* ==========================================================================
   Telza — site interactions (vanilla JS, no dependencies)
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDesktopNav = () => window.matchMedia('(min-width: 1101px)').matches;
  const hasIO = 'IntersectionObserver' in window;

  /** Run `fn` at most once per animation frame for scroll/resize-heavy work. */
  const onFrame = (fn) => {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { fn(); queued = false; });
    };
  };

  /* ---------- Header state + back-to-top ---------- */
  function initScrollState() {
    const header = $('.header');
    const toTop = $('.to-top');
    const update = () => {
      const y = window.scrollY;
      header?.classList.toggle('is-scrolled', y > 10);
      toTop?.classList.toggle('is-visible', y > 700);
    };
    window.addEventListener('scroll', onFrame(update), { passive: true });
    update();
    toTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
  }

  /* ---------- Navigation: mobile menu, dropdowns, active link ---------- */
  function initNav() {
    const toggle = $('.nav-toggle');
    const nav = $('#primary-nav');
    const dropdownItems = $$('.nav__item--dropdown');

    const setMenu = (open) => {
      if (!toggle || !nav) return;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
    };

    const closeDropdowns = (except) => {
      dropdownItems.forEach((item) => {
        if (item === except) return;
        item.classList.remove('is-open');
        $('.nav__link', item)?.setAttribute('aria-expanded', 'false');
      });
    };

    toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));

    dropdownItems.forEach((item) => {
      const trigger = $('.nav__link', item);
      trigger.addEventListener('click', () => {
        const open = !item.classList.contains('is-open');
        closeDropdowns(item);
        item.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
      });
      // On desktop, hover opens the menu via CSS; leaving resets any click-opened state.
      item.addEventListener('mouseleave', () => {
        if (!isDesktopNav()) return;
        item.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav__item--dropdown')) closeDropdowns();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeDropdowns();
      setMenu(false);
    });

    // Close menus after following any in-page link (CSS handles the smooth scroll).
    $$('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', () => { closeDropdowns(); setMenu(false); });
    });

    window.addEventListener('resize', () => { if (isDesktopNav()) setMenu(false); });

    // Scroll-spy: highlight the nav entry for the section in view.
    if (!hasIO) return;
    const links = $$('.nav a[href^="#"]').filter((a) => a.getAttribute('href').length > 1);
    const ids = [...new Set(links.map((a) => a.getAttribute('href').slice(1)))];
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const href = `#${entry.target.id}`;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === href));
        dropdownItems.forEach((item) => {
          const owns = $$('.dropdown a', item).some((a) => a.getAttribute('href') === href);
          $('.nav__link', item).classList.toggle('is-active', owns);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    const items = $$('.reveal');
    items.forEach((el) => { if (el.dataset.delay) el.style.setProperty('--d', el.dataset.delay); });

    if (!hasIO) { items.forEach((el) => el.classList.add('is-visible')); return; }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        el.classList.add('is-visible');
        // Once revealed, drop the reveal transition so hover effects aren't delayed.
        const done = (e) => {
          if (e.target !== el || e.propertyName !== 'opacity') return;
          el.removeEventListener('transitionend', done);
          el.classList.remove('reveal');
          el.style.removeProperty('--d');
        };
        el.addEventListener('transitionend', done);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach((el) => io.observe(el));
  }

  /* ---------- Animated counters ---------- */
  function initCounters() {
    const els = $$('[data-count]');
    if (!els.length) return;

    const render = (el, value) => {
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const num = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      el.textContent = `${el.dataset.prefix || ''}${num}${el.dataset.suffix || ''}`;
    };

    const animate = (el) => {
      const target = parseFloat(el.dataset.count);
      if (reduceMotion) { render(el, target); return; }
      const duration = 1800;
      const start = performance.now();
      el.dataset.counting = 'true';
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        render(el, target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
        else delete el.dataset.counting;
      };
      requestAnimationFrame(tick);
    };

    if (!hasIO) return; // markup already contains the final values
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        animate(entry.target);
      });
    }, { threshold: 0.6 });

    els.forEach((el) => {
      if (!reduceMotion) render(el, 0);
      io.observe(el);
    });
  }

  /* ---------- Audio waveforms (generated bars) ---------- */
  function initWaves() {
    $$('[data-wave]').forEach((wave) => {
      const count = parseInt(wave.dataset.wave, 10) || 24;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const bar = document.createElement('span');
        const h = 30 + Math.round(Math.abs(Math.sin(i * 0.55)) * 55 + Math.random() * 15);
        bar.style.setProperty('--h', String(h));
        bar.style.setProperty('--i', String(i));
        frag.appendChild(bar);
      }
      wave.appendChild(frag);
    });
  }

  /* ---------- Live call timer in the hero console ---------- */
  function initCallTimer() {
    const el = $('[data-timer]');
    if (!el || reduceMotion) return;
    let seconds = 42;
    const pad = (n) => String(n).padStart(2, '0');
    setInterval(() => {
      seconds = seconds >= 599 ? 0 : seconds + 1;
      el.textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
    }, 1000);
  }

  /* ---------- Agent builder: voice styles with real female voice samples ----------
     Each style (Warm / Professional / Energetic) plays its own sample:
       1. assets/audio/voice-{style}.mp3 if present (ElevenLabs, see tools/generate-voice-styles.ps1)
       2. otherwise the browser's Speech Synthesis, with a female English voice tuned per style.
     Nothing plays until the visitor clicks a style chip or the Preview button. */
  const VOICE_STYLES = {
    warm: {
      label: 'Warm',
      text: "Hello! Welcome to Telza. It's lovely to hear from you. How can I help you today?",
      rate: 0.93, pitch: 1.08,
      prefer: ['Aria', 'Samantha', 'Libby', 'Google US English', 'Hazel', 'Natasha'],
    },
    professional: {
      label: 'Professional',
      text: "Thank you for contacting us. I'm Telza's AI assistant, and I'm here to help you with your request.",
      rate: 0.98, pitch: 0.97,
      prefer: ['Jenny', 'Sonia', 'Google UK English Female', 'Karen', 'Serena', 'Susan', 'Zira'],
    },
    energetic: {
      label: 'Energetic',
      text: "Hey there! Thanks for calling Telza. I'm excited to help you today. What can I do for you?",
      rate: 1.1, pitch: 1.22,
      prefer: ['Ava', 'Emma', 'Michelle', 'Tessa', 'Moira', 'Google US English', 'Samantha'],
    },
  };
  const FEMALE_VOICE_NAMES = ['Aria', 'Jenny', 'Ava', 'Emma', 'Michelle', 'Sonia', 'Libby', 'Natasha', 'Clara',
    'Samantha', 'Google UK English Female', 'Google US English', 'Karen', 'Moira', 'Tessa', 'Serena',
    'Victoria', 'Fiona', 'Allison', 'Susan', 'Zira', 'Hazel', 'Catherine'];

  function initBuilder() {
    const group = $('[data-chip-group]');
    const preview = $('[data-voice-preview]');
    if (!group || !preview) return;
    const chips = $$('.chip[data-voice-style]', group);
    const playBtn = $('[data-voice-toggle]', preview);
    const replayBtn = $('[data-voice-replay]', preview);
    const label = $('[data-voice-label]', preview);
    const status = $('[data-voice-status]', preview);
    const bars = $$('.wave span', preview);
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const nativePause = !/Android/i.test(navigator.userAgent); // Android cancels on pause(): resume per sentence there
    const canAnalyse = /^https?:$/.test(location.protocol) && !!(window.AudioContext || window.webkitAudioContext);
    const srcFor = (key) => (preview.dataset.voiceSrc || '').replace('{style}', key);
    const STATUS = { ready: 'Preview', loading: 'Loading…', playing: 'Playing', paused: 'Paused' };

    let key = (chips.find((c) => c.classList.contains('is-active')) || chips[0]).dataset.voiceStyle;
    let state = 'ready';
    let engine = null;
    let token = 0;
    let sentences = [];
    let sentenceIndex = 0;
    let watchdog = null;
    let raf = 0;
    let energy = 0;
    let lastBump = 0;
    let gap = false;
    let audioCtx = null;
    let analyser = null;
    let freq = null;
    let silentFrames = 0;
    const fileStatus = {}; // style → 'unknown' | 'ok' | 'missing'

    const audio = new Audio();
    audio.preload = 'auto';

    // Probe the optional ElevenLabs files (loading metadata only, never playing)
    Object.keys(VOICE_STYLES).forEach((k) => {
      const src = srcFor(k);
      if (!src) { fileStatus[k] = 'missing'; return; }
      fileStatus[k] = 'unknown';
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.addEventListener('loadedmetadata', () => { fileStatus[k] = 'ok'; });
      probe.addEventListener('error', () => { fileStatus[k] = 'missing'; });
      probe.src = src;
    });

    /* ----- UI ----- */
    const render = () => {
      const name = VOICE_STYLES[key].label;
      chips.forEach((c) => {
        const on = c.dataset.voiceStyle === key;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', String(on));
        c.classList.toggle('is-playing', on && state === 'playing');
        c.classList.toggle('is-paused', on && state === 'paused');
      });
      preview.classList.toggle('is-playing', state === 'playing');
      preview.classList.toggle('is-loading', state === 'loading');
      label.textContent = `${name} voice`;
      if (status) status.textContent = STATUS[state];
      playBtn.setAttribute('aria-pressed', String(state === 'playing'));
      playBtn.setAttribute('aria-label', state === 'playing' ? `Pause ${name} voice` : state === 'paused' ? `Resume ${name} voice` : `Play ${name} voice preview`);
      if (state === 'playing') startMeter(); else stopMeter();
      if (state !== 'loading') { clearTimeout(watchdog); watchdog = null; }
    };
    const setState = (next) => { state = next; render(); };

    /* ----- Waveform driven by the voice ----- */
    const drive = (t) => {
      const n = bars.length;
      if (analyser) {
        analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < freq.length; i++) sum += freq[i];
        silentFrames = sum === 0 ? silentFrames + 1 : 0;
        if (silentFrames > 45) analyser = null; // no signal available: fall back to the envelope
      }
      if (!analyser && !gap && t - lastBump > 110 + Math.random() * 130) {
        energy = Math.max(energy, 0.55 + Math.random() * 0.45);
        lastBump = t;
      }
      bars.forEach((bar, i) => {
        const edge = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);
        let v;
        if (analyser) v = (freq[Math.floor((1 - edge) * freq.length * 0.55)] / 255) * 1.15;
        else {
          const wobble = 0.5 + 0.5 * Math.sin(t / 85 + i * 0.75) * Math.sin(t / 210 + i * 0.33);
          v = (0.18 + energy * 0.82) * (0.35 + 0.65 * wobble) * (1 - edge * 0.4);
        }
        bar.style.transform = `scaleY(${Math.min(1, Math.max(0.12, v)).toFixed(3)})`;
      });
      energy *= 0.93;
      raf = requestAnimationFrame(drive);
    };
    const startMeter = () => {
      if (reduceMotion || raf) return;
      preview.classList.add('is-driven');
      raf = requestAnimationFrame(drive);
    };
    const stopMeter = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      preview.classList.remove('is-driven');
      bars.forEach((bar) => { bar.style.transform = ''; });
    };

    /* ----- Audio files (ElevenLabs) ----- */
    const setupAnalyser = () => {
      if (!canAnalyse || analyser) return;
      try {
        if (new URL(audio.currentSrc || audio.src, location.href).origin !== location.origin) return;
        if (!audioCtx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          audioCtx = new Ctx();
          const source = audioCtx.createMediaElementSource(audio);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          source.connect(analyser);
          analyser.connect(audioCtx.destination);
          freq = new Uint8Array(analyser.frequencyBinCount);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        silentFrames = 0;
      } catch (err) { analyser = null; }
    };
    const playAudio = (src) => {
      engine = 'audio';
      if (audio.getAttribute('src') !== src) audio.src = src;
      try { audio.currentTime = 0; } catch (err) { /* not seekable yet */ }
      setupAnalyser();
      const p = audio.play(); // inside the click handler, so it is user-initiated
      if (p && typeof p.catch === 'function') p.catch(() => { if (engine === 'audio' && state === 'loading') speak(key); });
    };
    audio.addEventListener('playing', () => { if (engine === 'audio') { gap = false; setState('playing'); } });
    audio.addEventListener('ended', () => { if (engine === 'audio') finish(); });
    audio.addEventListener('error', () => {
      const k = Object.keys(VOICE_STYLES).find((s) => audio.getAttribute('src') === srcFor(s));
      if (k) fileStatus[k] = 'missing';
      if (engine === 'audio' && (state === 'loading' || state === 'playing')) speak(key);
    });

    /* ----- Browser Speech Synthesis fallback ----- */
    const rank = (v) => (/Natural|Neural|Online|Premium|Enhanced/i.test(v.name) ? 0 : 1);
    const pickVoice = (prefer) => {
      if (!synth) return null;
      const english = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
      if (!english.length) return null;
      for (const name of [...prefer, ...FEMALE_VOICE_NAMES]) {
        const hits = english.filter((v) => v.name.includes(name)).sort((a, b) => rank(a) - rank(b));
        if (hits.length) return hits[0];
      }
      return english.find((v) => /female|woman/i.test(v.name)) || english.find((v) => /en[-_]US/i.test(v.lang)) || english[0];
    };
    if (synth) synth.getVoices(); // warm up the voice list (some browsers load it lazily)

    const speakSentence = (t) => {
      if (t !== token) return;
      if (sentenceIndex >= sentences.length) { finish(); return; }
      const style = VOICE_STYLES[key];
      const u = new SpeechSynthesisUtterance(sentences[sentenceIndex]);
      const v = pickVoice(style.prefer);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = style.rate;
      u.pitch = style.pitch;
      u.volume = 1;
      u.onstart = () => { if (t !== token) return; gap = false; if (state !== 'playing') setState('playing'); };
      u.onboundary = () => { energy = 1; };
      u.onend = () => {
        if (t !== token) return;
        sentenceIndex += 1;
        gap = true;
        setTimeout(() => speakSentence(t), 140);
      };
      u.onerror = (e) => {
        if (t !== token || e.error === 'interrupted' || e.error === 'canceled') return;
        stopAll();
        setState('ready');
      };
      synth.speak(u);
    };
    const speak = (k) => {
      if (!synth) { setState('ready'); return; }
      engine = 'speech';
      token += 1;
      sentences = (VOICE_STYLES[k].text.match(/[^.!?]+[.!?]+/g) || [VOICE_STYLES[k].text]).map((s) => s.trim());
      sentenceIndex = 0;
      synth.cancel();
      if (synth.paused) synth.resume();
      speakSentence(token);
    };

    /* ----- Controls ----- */
    function stopAll() {
      token += 1;
      if (synth) synth.cancel();
      audio.pause();
      engine = null;
    }
    function finish() {
      stopAll();
      setState('ready');
    }
    const play = (k) => {
      stopAll(); // never two samples at once
      key = k;
      replayBtn.disabled = false;
      setState('loading');
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { if (state === 'loading') { stopAll(); setState('ready'); } }, 6000);
      const src = srcFor(k);
      if (src && fileStatus[k] !== 'missing') playAudio(src);
      else speak(k);
    };
    const pause = () => {
      if (engine === 'audio') audio.pause();
      else if (synth && nativePause && synth.speaking) synth.pause();
      else if (synth) { token += 1; synth.cancel(); } // resume restarts the current sentence
      setState('paused');
    };
    const resume = () => {
      if (engine === 'audio') {
        setupAnalyser();
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => setState('paused'));
        return; // the 'playing' event switches the state back
      }
      if (!synth) return;
      if (nativePause && synth.paused) synth.resume();
      else { token += 1; synth.cancel(); speakSentence(token); }
      setState('playing');
    };
    const toggle = () => {
      if (state === 'playing') pause();
      else if (state === 'paused') resume();
      else if (state === 'ready') play(key);
    };

    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip[data-voice-style]');
      if (!chip) return;
      const k = chip.dataset.voiceStyle;
      if (k === key && state !== 'ready') { toggle(); return; } // same style: pause / resume
      play(k); // new style: stop the previous sample and play this one
    });
    playBtn.addEventListener('click', toggle);
    replayBtn.addEventListener('click', () => play(key));

    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });
    window.addEventListener('pagehide', stopAll);
    render();
  }

  /* ---------- Parallax: mouse depth in hero + scroll depth on blobs ---------- */
  function initParallax() {
    if (reduceMotion) return;

    const hero = $('.hero');
    const depthEls = $$('[data-depth]');
    if (hero && depthEls.length && window.matchMedia('(hover: hover)').matches) {
      let px = 0;
      let py = 0;
      const apply = onFrame(() => {
        depthEls.forEach((el) => {
          const d = parseFloat(el.dataset.depth);
          el.style.translate = `${(px * d).toFixed(1)}px ${(py * d).toFixed(1)}px`;
        });
      });
      hero.addEventListener('mousemove', (e) => {
        const r = hero.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - 0.5;
        py = (e.clientY - r.top) / r.height - 0.5;
        apply();
      });
      hero.addEventListener('mouseleave', () => { px = 0; py = 0; apply(); });
    }

    const scrollEls = $$('[data-parallax]');
    if (!scrollEls.length) return;
    const update = () => {
      const y = window.scrollY;
      if (y > window.innerHeight * 1.5) return; // hero is off-screen; skip work
      scrollEls.forEach((el) => { el.style.translate = `0 ${(y * parseFloat(el.dataset.parallax)).toFixed(1)}px`; });
    };
    window.addEventListener('scroll', onFrame(update), { passive: true });
  }

  /* ---------- Cursor-following glow on cards ---------- */
  function initGlowCards() {
    $$('.glow-card').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- Industry tabs (ARIA tabs pattern) ---------- */
  function initTabs() {
    const tablist = $('[role="tablist"]');
    if (!tablist) return;
    const tabs = $$('[role="tab"]', tablist);

    const activate = (tab, focus = false) => {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      if (focus) tab.focus({ preventScroll: true });
      // On mobile the tab bar scrolls sideways: keep the active tab in view without moving the page.
      if (tablist.scrollWidth > tablist.clientWidth) {
        tablist.scrollTo({ left: tab.offsetLeft - tablist.offsetLeft - 20, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (e) => {
        const map = {
          ArrowRight: tabs[(i + 1) % tabs.length],
          ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
          Home: tabs[0],
          End: tabs[tabs.length - 1],
        };
        const next = map[e.key];
        if (!next) return;
        e.preventDefault();
        activate(next, true);
      });
    });

    // Industry links in the nav open the matching tab.
    $$('[data-tab-link]').forEach((link) => {
      link.addEventListener('click', () => {
        const tab = document.getElementById(`tab-${link.dataset.tabLink}`);
        if (tab) activate(tab);
      });
    });
  }

  /* ---------- "How it works" progress line ---------- */
  function initSteps() {
    const wrap = $('.steps');
    if (!wrap) return;
    const steps = $$('.step', wrap);
    const update = () => {
      const r = wrap.getBoundingClientRect();
      const vh = window.innerHeight;
      const raw = (vh * 0.8 - r.top) / (r.height + vh * 0.2);
      const progress = Math.min(Math.max(raw, 0), 1);
      wrap.style.setProperty('--progress', progress.toFixed(3));
      steps.forEach((step, i) => {
        const threshold = steps.length > 1 ? i / (steps.length - 1) : 0;
        step.classList.toggle('is-active', progress > 0 && progress >= threshold - 0.02);
      });
    };
    window.addEventListener('scroll', onFrame(update), { passive: true });
    window.addEventListener('resize', onFrame(update));
    update();
  }

  /* ---------- Integration marquees (duplicate items for a seamless loop) ---------- */
  function initMarquee() {
    $$('.marquee').forEach((marquee) => {
      const track = $('.marquee__track', marquee);
      if (!track) return;
      Array.from(track.children).forEach((item) => {
        const clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });
      marquee.classList.add('is-ready');
    });
  }

  /* ---------- Testimonial slider ---------- */
  function initSlider() {
    const slider = $('[data-slider]');
    if (!slider) return;
    const viewport = $('.slider__viewport', slider);
    const track = $('.slider__track', slider);
    const slides = $$('.testimonial', track);
    const prev = $('[data-slider-prev]', slider);
    const next = $('[data-slider-next]', slider);
    const dotsWrap = $('.slider__dots', slider);
    if (!slides.length) return;

    let index = 0;
    let timer = null;

    const measure = () => {
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const width = slides[0].getBoundingClientRect().width;
      const perView = Math.max(1, Math.round((track.clientWidth + gap) / (width + gap)));
      return { step: width + gap, perView, max: Math.max(0, slides.length - perView) };
    };
    let m = measure();

    const go = (i) => {
      index = Math.min(Math.max(i, 0), m.max);
      track.style.transform = `translateX(${-index * m.step}px)`;
      $$('.slider__dot', dotsWrap).forEach((dot, di) => {
        dot.classList.toggle('is-active', di === index);
        dot.setAttribute('aria-current', di === index ? 'true' : 'false');
      });
      prev.disabled = index === 0;
      next.disabled = index === m.max;
      slides.forEach((s, si) => s.setAttribute('aria-hidden', String(si < index || si >= index + m.perView)));
    };

    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      if (reduceMotion) return;
      stop();
      timer = setInterval(() => go(index >= m.max ? 0 : index + 1), 6000);
    };

    const buildDots = () => {
      dotsWrap.innerHTML = '';
      for (let i = 0; i <= m.max; i++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'slider__dot';
        dot.setAttribute('aria-label', `Show testimonial ${i + 1}`);
        dot.addEventListener('click', () => { go(i); start(); });
        dotsWrap.appendChild(dot);
      }
    };

    prev.addEventListener('click', () => { go(index - 1); start(); });
    next.addEventListener('click', () => { go(index + 1); start(); });
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
    slider.addEventListener('focusin', stop);
    slider.addEventListener('focusout', start);

    // Basic swipe support
    let startX = null;
    viewport.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; stop(); }, { passive: true });
    viewport.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      startX = null;
      start();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { m = measure(); buildDots(); go(index); }, 150);
    });

    buildDots();
    go(0);
    start();
  }

  /* ---------- FAQ accordion ---------- */
  function initAccordion() {
    $$('[data-accordion]').forEach((acc) => {
      const items = $$('.acc-item', acc);
      items.forEach((item) => {
        const trigger = $('.acc-trigger', item);
        trigger.addEventListener('click', () => {
          const open = !item.classList.contains('is-open');
          items.forEach((other) => {
            other.classList.remove('is-open');
            $('.acc-trigger', other).setAttribute('aria-expanded', 'false');
          });
          item.classList.toggle('is-open', open);
          trigger.setAttribute('aria-expanded', String(open));
        });
      });
    });
  }

  /* ---------- WhatsApp chat demo (plays when visible) ---------- */
  function initChat() {
    const body = $('[data-chat]');
    if (!body) return;
    const messages = $$('.msg', body);
    const typing = $('.typing', body);
    const showAll = () => { messages.forEach((m) => m.classList.add('is-shown')); typing?.classList.remove('is-shown'); };

    body.dataset.ready = 'true';
    if (reduceMotion || !hasIO || !typing) { showAll(); return; }

    let runId = 0;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const play = async (id) => {
      while (id === runId) {
        messages.forEach((m) => m.classList.remove('is-shown'));
        for (const msg of messages) {
          if (id !== runId) return;
          if (msg.classList.contains('msg--ai')) {
            body.insertBefore(typing, msg);
            typing.classList.add('is-shown');
            await sleep(1300);
            typing.classList.remove('is-shown');
          } else {
            await sleep(900);
          }
          if (id !== runId) return;
          msg.classList.add('is-shown');
          await sleep(450);
        }
        await sleep(4500);
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      runId += 1;
      if (entry.isIntersecting) play(runId);
      else showAll();
    }, { threshold: 0.35 });
    io.observe(body);
  }

  /* ---------- Forms (demo request + newsletter) ---------- */
  function initForms() {
    $$('[data-form]').forEach((form) => {
      const input = $('input[type="email"]', form);
      const out = $(form.dataset.form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!input || !out) return;
        const valid = input.value.trim() !== '' && input.checkValidity();
        if (!valid) {
          out.textContent = 'Please enter a valid email address.';
          out.className = 'form-msg is-error';
          input.focus();
          return;
        }
        // Hook up your backend / CRM endpoint here.
        out.textContent = form.dataset.success || "Thanks! We'll be in touch shortly.";
        out.className = 'form-msg is-success';
        form.reset();
      });
      input?.addEventListener('input', () => {
        if (out?.classList.contains('is-error')) { out.textContent = ''; out.className = 'form-msg'; }
      });
    });
  }

  /* ---------- Footer year ---------- */
  function initYear() {
    const el = $('#year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ==========================================================================
     Motion enhancements (additive layer)
     ========================================================================== */
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Top scroll progress bar ---------- */
  function initScrollProgress() {
    const bar = $('.scroll-progress span');
    if (!bar) return;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
    };
    window.addEventListener('scroll', onFrame(update), { passive: true });
    window.addEventListener('resize', onFrame(update));
    update();
  }

  /* ---------- Hero neural-network canvas (pauses when off-screen) ---------- */
  function initNetwork() {
    const canvas = $('.hero__network');
    const hero = $('.hero');
    if (!canvas || !hero || reduceMotion || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let nodes = [];
    let raf = 0;
    let visible = true;
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 768 ? 22 : 46;
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.4 + 0.7,
        green: Math.random() < 0.18,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const maxD = w < 768 ? 100 : 135;
      const maxD2 = maxD * maxD;

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > maxD2) continue;
          ctx.strokeStyle = `rgba(20, 201, 184, ${((1 - Math.sqrt(d2) / maxD) * 0.16).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        // Links to the cursor
        const mx = a.x - mouse.x;
        const my = a.y - mouse.y;
        const md2 = mx * mx + my * my;
        if (md2 < 180 * 180) {
          ctx.strokeStyle = `rgba(57, 255, 20, ${((1 - Math.sqrt(md2) / 180) * 0.22).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        ctx.fillStyle = n.green ? 'rgba(57, 255, 20, .75)' : 'rgba(20, 201, 184, .6)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(draw); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    resize();
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 200); });
    if (finePointer) {
      hero.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        mouse.x = e.clientX - r.left;
        mouse.y = e.clientY - r.top;
      });
      hero.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if (hasIO) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        visible ? start() : stop();
      }).observe(hero);
    }
    start();
  }

  /* ---------- Live "Calls today" ticker in the hero console ---------- */
  function initLiveKpi() {
    const el = $('.kpi strong');
    if (!el || reduceMotion) return;
    setTimeout(() => {
      setInterval(() => {
        if (el.dataset.counting) return; // let the count-up finish first
        const value = parseInt(el.textContent.replace(/[^\d]/g, ''), 10);
        if (Number.isNaN(value)) return;
        el.textContent = (value + 1 + Math.floor(Math.random() * 3)).toLocaleString('en-US');
        el.classList.remove('is-ticking');
        void el.offsetWidth; // restart the flash animation
        el.classList.add('is-ticking');
      }, 3200);
    }, 4000);
  }

  /* ---------- Directional reveal variants (assigned before observing) ---------- */
  function initRevealVariants() {
    if (window.matchMedia('(min-width: 1101px)').matches) {
      $$('.split').forEach((split) => {
        const reverse = split.classList.contains('split--reverse');
        $('.split__content', split)?.classList.add(reverse ? 'reveal--right' : 'reveal--left');
        $('.split__visual', split)?.classList.add(reverse ? 'reveal--left' : 'reveal--right');
      });
    }
    $$('.stat, .solutions-grid .card, .bento .card, .testimonial').forEach((el) => {
      if (el.classList.contains('reveal')) el.classList.add('reveal--scale');
    });
  }

  /* ---------- Word-by-word section headings ---------- */
  function initSplitTitles() {
    if (reduceMotion) return;
    $$('.section-title').forEach((title) => {
      if (title.children.length) return; // only plain-text headings
      const words = title.textContent.trim().split(/\s+/);
      title.textContent = '';
      words.forEach((word, i) => {
        const outer = document.createElement('span');
        const inner = document.createElement('span');
        outer.className = 'w';
        inner.textContent = word;
        inner.style.setProperty('--wi', String(i));
        outer.appendChild(inner);
        title.appendChild(outer);
        if (i < words.length - 1) title.appendChild(document.createTextNode(' '));
      });
      title.classList.add('split-words');
    });
  }

  /* ---------- More count-up numbers (auto-detected from existing markup) ---------- */
  function initExtraCounters() {
    const selector = '.kpi strong, .mini-stat strong, .camp-stat strong, .progress__top strong, .panel-metric strong, .integration-stats strong';
    $$(selector).forEach((el) => {
      if (el.dataset.count || el.children.length) return;
      const match = el.textContent.trim().match(/^([^\d]*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/);
      if (!match) return; // skips values like "24/7", "2m 14s" or "REST"
      const [, prefix, num, suffix] = match;
      el.dataset.count = num.replace(/,/g, '');
      if (prefix) el.dataset.prefix = prefix;
      if (suffix) el.dataset.suffix = suffix;
      const decimals = (num.split('.')[1] || '').length;
      if (decimals) el.dataset.decimals = String(decimals);
    });
  }

  /* ---------- Section transitions: beam along the divider ---------- */
  function initSectionBeams() {
    const sections = $$('.section');
    if (!hasIO) { sections.forEach((s) => s.classList.add('in-view')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    sections.forEach((s) => io.observe(s));
  }

  /* ---------- Floating ambient AI elements in darker sections ---------- */
  function initAmbient() {
    if (reduceMotion) return;
    $$('.section--alt').forEach((section) => {
      for (let i = 1; i <= 3; i++) {
        const dot = document.createElement('span');
        dot.className = `ambient ambient--${i}`;
        dot.setAttribute('aria-hidden', 'true');
        section.appendChild(dot);
      }
    });
  }

  /* ---------- 3D tilt on service & feature cards ---------- */
  function initTilt() {
    if (reduceMotion || !finePointer) return;
    $$('.solutions-grid .card, .bento .card').forEach((card) => {
      card.classList.add('tilt');
      const max = card.classList.contains('card--wide') ? 4 : 8;
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- Buttons: click ripple + magnetic pull ---------- */
  function initButtonEffects() {
    if (reduceMotion) return;
    $$('.btn, .icon-btn, .tab, .chip, .play-btn').forEach((el) => {
      el.classList.add('has-ripple');
      el.addEventListener('pointerdown', (e) => {
        const r = el.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2;
        const ink = document.createElement('span');
        ink.className = 'ripple';
        ink.style.width = ink.style.height = `${size}px`;
        ink.style.left = `${e.clientX - r.left - size / 2}px`;
        ink.style.top = `${e.clientY - r.top - size / 2}px`;
        el.appendChild(ink);
        ink.addEventListener('animationend', () => ink.remove());
      });
    });

    if (!finePointer) return;
    $$('.btn--primary, .btn--ghost.btn--lg').forEach((btn) => {
      btn.classList.add('is-magnetic');
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        btn.style.translate = `${(x * 0.18).toFixed(1)}px ${(y * 0.3).toFixed(1)}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  /* ---------- Scroll parallax on product mockups ---------- */
  function initSectionParallax() {
    if (reduceMotion || !finePointer) return;
    // [element to measure, element to move, speed]
    const targets = [];
    $$('.split__visual').forEach((wrap) => {
      const visual = $('.mock, .phone', wrap);
      const glow = $('.visual-glow', wrap);
      if (visual) targets.push([wrap, visual, -0.06]);
      if (glow) targets.push([wrap, glow, 0.12]);
    });
    if (!targets.length) return;
    const update = () => {
      const vh = window.innerHeight;
      targets.forEach(([measure, el, speed]) => {
        const r = measure.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const offset = (r.top + r.height / 2 - vh / 2) * speed;
        el.style.translate = `0 ${offset.toFixed(1)}px`;
      });
    };
    window.addEventListener('scroll', onFrame(update), { passive: true });
    window.addEventListener('resize', onFrame(update));
    update();
  }

  /* ---------- Integration hub: pause SVG motion when reduced motion is on ---------- */
  function initHub() {
    const svg = $('.hub__lines');
    if (svg && reduceMotion && typeof svg.pauseAnimations === 'function') svg.pauseAnimations();
  }

  /* ==========================================================================
     Ecosystem section ("Works with the tools your business already uses")
     ========================================================================== */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const svgNode = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  };
  const sysCompact = () => window.matchMedia('(max-width: 900px)').matches;

  /* Part 1: connector frames, tile hover and entrance */
  function initSysShowcase(section) {
    const stage = $('[data-sys]', section);
    if (!stage) return;
    const svg = $('.sys-lines', stage);
    const coreEl = $('.sys-core', stage);
    const groups = $$('[data-sys-group]', stage);
    stage.setAttribute('data-sys-js', '');
    let tileLines = new Map();

    const roundedRect = (x0, y0, x1, y1, r) =>
      `M${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} ` +
      `H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`;

    // Positions use offsetLeft/Top so hover lifts and float animations don't skew the lines.
    const layout = () => {
      svg.innerHTML = '';
      tileLines = new Map();
      if (sysCompact()) return;
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const cx = coreEl.offsetLeft + coreEl.offsetWidth / 2;

      groups.forEach((group, gi) => {
        const tiles = $$('.sys-tile', group);
        if (!tiles.length) return;
        const pos = tiles.map((t) => ({
          t,
          x: Math.round(group.offsetLeft + t.offsetLeft + t.offsetWidth / 2),
          top: group.offsetTop + t.offsetTop,
          bottom: group.offsetTop + t.offsetTop + t.offsetHeight,
        }));
        const xs = [...new Set(pos.map((p) => p.x))].sort((a, b) => a - b);
        const top = Math.min(...pos.map((p) => p.top)) - 26;
        const bottom = Math.max(...pos.map((p) => p.bottom)) + 26;
        const left = gi === 0 ? xs[0] : cx;
        const right = gi === 0 ? cx : xs[xs.length - 1];
        const g = svgNode('g', { class: 'sys-group-frame' });
        const id = `sys-frame-${gi}`;
        g.appendChild(svgNode('path', { class: 'sys-frame', id, d: roundedRect(left, top, right, bottom, 16) }));
        xs.forEach((x) => {
          const line = svgNode('line', { class: 'sys-col', x1: x, y1: top, x2: x, y2: bottom });
          g.appendChild(line);
          pos.filter((p) => p.x === x).forEach((p) => tileLines.set(p.t, { line, g }));
        });
        if (!reduceMotion) {
          // data pulses travelling around the frame, in opposite directions
          [['sys-pulse', '0;1', 0], ['sys-pulse sys-pulse--teal', '1;0', 3.5]].forEach(([cls, points, delay]) => {
            const dot = svgNode('circle', { class: cls, r: 3 });
            const motion = svgNode('animateMotion', {
              dur: '7s', repeatCount: 'indefinite', keyPoints: points, keyTimes: '0;1',
              calcMode: 'linear', begin: `${-(delay + gi * 1.7)}s`,
            });
            const mpath = svgNode('mpath', { href: `#${id}` });
            mpath.setAttributeNS(XLINK_NS, 'xlink:href', `#${id}`);
            motion.appendChild(mpath);
            dot.appendChild(motion);
            g.appendChild(dot);
          });
        }
        svg.appendChild(g);
      });
    };

    const highlight = (tile) => {
      $$('.is-active', svg).forEach((el) => el.classList.remove('is-active'));
      stage.classList.toggle('has-hover', !!tile);
      const hit = tile && tileLines.get(tile);
      if (hit) { hit.line.classList.add('is-active'); hit.g.classList.add('is-active'); }
    };
    $$('.sys-tile', stage).forEach((tile) => {
      tile.addEventListener('pointerenter', () => highlight(tile));
      tile.addEventListener('pointerleave', () => highlight(null));
      tile.addEventListener('focus', () => highlight(tile));
      tile.addEventListener('blur', () => highlight(null));
    });

    const reveal = () => stage.classList.add('is-in');
    if (!hasIO || reduceMotion) reveal();
    else {
      const io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        reveal();
        io.disconnect();
      }, { threshold: 0.2 });
      io.observe(stage);
    }

    const relayout = onFrame(layout);
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(stage);
    else window.addEventListener('resize', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    layout();
  }

  /* Spine: from the showcase core down to the call engine's Telza lane, filled on scroll */
  function initSysSpine(section) {
    const spine = $('.sys-spine', section);
    const core = $('.sys-core__disc', section);
    const node = $('.ladder__node--ai', section);
    if (!spine || !core || !node) return;
    const update = () => {
      if (sysCompact()) { spine.style.height = '0px'; return; }
      const s = section.getBoundingClientRect();
      const c = core.getBoundingClientRect();
      const n = node.getBoundingClientRect();
      const top = c.bottom - s.top;
      const height = Math.max(0, n.top - c.bottom);
      spine.style.top = `${top.toFixed(1)}px`;
      spine.style.height = `${height.toFixed(1)}px`;
      const progress = reduceMotion ? 1 : Math.min(Math.max((window.innerHeight * 0.62 - (c.bottom)) / (height || 1), 0), 1);
      spine.style.setProperty('--p', progress.toFixed(3));
    };
    const tick = onFrame(update);
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', tick);
    if ('ResizeObserver' in window) new ResizeObserver(tick).observe(section);
    update();
  }

  /* Part 2a: rotating dotted globe (canvas), paused when off-screen */
  function initSysGlobe(section) {
    const canvas = $('.sys-globe', section);
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const pts = [];
    const N = 2600;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      const lat = Math.asin(y);
      const lon = Math.atan2(z, x);
      // smooth pseudo-continents
      const f = Math.sin(lat * 3.1 + 1.3) * Math.cos(lon * 2) + 0.6 * Math.sin(lon * 3.7 + lat * 1.7) + 0.4 * Math.cos(lat * 5.3 - lon * 2.9);
      pts.push({ x, y, z, land: f > 0.3 && Math.abs(lat) < 1.3, green: Math.random() < 0.14 });
    }
    let w = 0;
    let h = 0;
    let R = 0;
    let cx = 0;
    let cy = 0;
    let angle = 0.6;
    let raf = 0;
    let visible = false;
    const tilt = 0.38;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const halo = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.06);
      halo.addColorStop(0, 'rgba(20, 201, 184, 0)');
      halo.addColorStop(0.85, 'rgba(20, 201, 184, 0.10)');
      halo.addColorStop(1, 'rgba(20, 201, 184, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
      ctx.fill();
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      for (const p of pts) {
        const x1 = p.x * ca + p.z * sa;
        const z1 = -p.x * sa + p.z * ca;
        const y2 = p.y * ct - z1 * st;
        const z2 = p.y * st + z1 * ct;
        if (z2 < 0) continue; // far side
        const sx = cx + x1 * R;
        const sy = cy - y2 * R;
        if (sy > h + 4 || sy < -4) continue;
        const depth = 0.3 + 0.7 * z2;
        if (p.land) {
          const size = 3 * (0.65 + 0.45 * z2);
          ctx.fillStyle = p.green ? `rgba(57, 255, 20, ${(0.35 + 0.55 * depth).toFixed(3)})` : `rgba(20, 201, 184, ${(0.35 + 0.6 * depth).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(20, 201, 184, ${(0.06 + 0.12 * depth).toFixed(3)})`;
          ctx.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6);
        }
      }
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(w * 0.48, h * 0.92);
      cx = w / 2;
      cy = R + 24;
      draw();
    };
    const loop = () => {
      angle += 0.0016;
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && visible && !reduceMotion && !document.hidden) raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(onFrame(resize)).observe(canvas);
    else window.addEventListener('resize', onFrame(resize));
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    if (hasIO) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); }).observe(canvas);
    }
  }

  /* Part 2b: live call timeline (inbound / outbound / WhatsApp) */
  const LADDER_POS = ['0.1667', '0.5', '0.8333']; // lane centres as fractions of the track
  const LADDER_FLOWS = {
    inbound: {
      title: 'Inbound call',
      cols: ['Caller', 'Telza AI · Voice agent', 'Your team'],
      rows: [
        { t: '0:00', from: 0, to: 1, code: 'RING', text: 'Call comes in' },
        { t: '0:01', from: 1, to: 0, code: 'ANSWERED', text: 'Greeted in 0.4s' },
        { talk: true, note: 'Appointment booked in Google Calendar', mark: 'GC', c: '#1d4ed8' },
        { t: '2:16', from: 1, to: 2, code: 'HANDOFF', text: 'With full context', hl: true },
        { t: '2:17', from: 2, to: 1, code: 'JOINED', text: 'Agent picked up' },
      ],
    },
    outbound: {
      title: 'Outbound call',
      cols: ['Lead', 'Telza AI · Outbound', 'Your CRM'],
      rows: [
        { t: '0:00', from: 2, to: 1, code: 'NEW LEAD', text: 'Web form submitted' },
        { t: '0:03', from: 1, to: 0, code: 'DIALING', text: 'Called within seconds' },
        { t: '0:09', from: 0, to: 1, code: 'CONNECTED', text: 'Lead picked up' },
        { talk: true, note: 'Lead qualified and scored in HubSpot', mark: 'HS', c: '#c2410c' },
        { t: '2:40', from: 1, to: 2, code: 'SYNC', text: 'Meeting booked and logged', hl: true },
      ],
    },
    whatsapp: {
      title: 'WhatsApp conversation',
      cols: ['Customer', 'Telza AI · WhatsApp', 'Your team'],
      rows: [
        { t: '0:00', from: 0, to: 1, code: 'MESSAGE', text: '"Where is my order?"' },
        { t: '0:02', from: 1, to: 0, code: 'REPLY', text: 'Tracking link sent' },
        { talk: true, chat: true, note: 'Delivery address updated in Shopify', mark: 'SH', c: '#4d7c0f' },
        { t: '1:30', from: 1, to: 2, code: 'HANDOFF', text: 'Refund request', hl: true },
        { t: '1:31', from: 2, to: 1, code: 'JOINED', text: 'Agent took over' },
      ],
    },
  };

  function initSysLadder(section) {
    const root = $('[data-ladder]', section);
    if (!root) return;
    const rowsEl = $('[data-ladder-rows]', root);
    const titleEl = $('[data-ladder-title]', root);
    const timeEl = $('[data-ladder-time]', root);
    const colEls = $$('[data-ladder-col]', root);
    const tabs = $$('[data-flow]', root);
    const CANCEL = Symbol('cancel');
    const bars = Array.from({ length: 26 }, (_, k) =>
      `<i style="--h:${30 + Math.round(Math.abs(Math.sin(k * 0.7)) * 60)};--k:${k}"></i>`).join('');
    let key = 'inbound';
    let runId = 0;
    let visible = false;
    let started = false;

    const span = (el, a, b) => {
      el.style.setProperty('--a', LADDER_POS[Math.min(a, b)]);
      el.style.setProperty('--b', LADDER_POS[Math.max(a, b)]);
    };
    const make = (cls) => { const el = document.createElement('div'); el.className = cls; return el; };

    const build = () => {
      const flow = LADDER_FLOWS[key];
      titleEl.textContent = flow.title;
      colEls.forEach((el, i) => { el.textContent = flow.cols[i]; });
      timeEl.textContent = '0:00';
      rowsEl.innerHTML = '';
      flow.rows.forEach((r) => {
        const row = make(r.talk ? 'lrow lrow--talk' : 'lrow');
        if (r.talk) {
          const talk = make('ltalk');
          span(talk, 0, 1);
          talk.innerHTML = r.chat
            ? '<i class="ltalk__dot"></i><span class="ltalk__typing"><i></i><i></i><i></i></span><span class="ltalk__label">Live chat</span>'
            : `<i class="ltalk__dot"></i><span class="ltalk__bars">${bars}</span>`;
          const note = make('lnote');
          span(note, 1, 2);
          const pill = document.createElement('span');
          pill.className = 'lnote__pill';
          const icon = document.createElement('span');
          icon.className = 'lnote__icon';
          icon.style.setProperty('--c', r.c);
          icon.textContent = r.mark;
          pill.append(icon, r.note);
          note.appendChild(pill);
          row.append(talk, note);
        } else {
          const time = document.createElement('span');
          time.className = 'lrow__time';
          time.textContent = r.t;
          const msg = make(`lmsg ${r.from < r.to ? 'lmsg--r' : 'lmsg--l'}${r.hl ? ' lmsg--hl' : ''}`);
          span(msg, r.from, r.to);
          const dot = document.createElement('span');
          dot.className = 'lmsg__dot';
          const pill = document.createElement('span');
          pill.className = 'lpill';
          const code = document.createElement('code');
          code.textContent = r.code;
          pill.append(code, r.text);
          msg.append(dot, pill);
          row.append(time, msg);
        }
        rowsEl.appendChild(row);
      });
      return $$('.lrow', rowsEl);
    };

    const wait = async (ms, id) => {
      let left = ms;
      while (left > 0) {
        if (id !== runId) throw CANCEL;
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (visible && !document.hidden) left -= 80;
      }
      if (id !== runId) throw CANCEL;
    };

    const play = async (id) => {
      for (;;) {
        const rows = build();
        const flow = LADDER_FLOWS[key];
        await wait(500, id);
        for (let i = 0; i < rows.length; i++) {
          rows[i].classList.add('is-in');
          if (flow.rows[i].t) timeEl.textContent = flow.rows[i].t;
          await wait(flow.rows[i].talk ? 1700 : 950, id);
        }
        await wait(4500, id);
      }
    };

    const start = () => {
      runId += 1;
      started = true;
      if (reduceMotion) {
        const rows = build();
        rows.forEach((r) => r.classList.add('is-in'));
        const last = LADDER_FLOWS[key].rows.filter((r) => r.t).pop();
        if (last) timeEl.textContent = last.t;
        return;
      }
      play(runId).catch((err) => { if (err !== CANCEL) console.error(err); });
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        key = tab.dataset.flow;
        tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-pressed', String(on));
        });
        start();
      });
    });

    build(); // static first frame (also the no-JS-animation state)
    if (!hasIO) { visible = true; start(); return; }
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !started) start();
    }, { threshold: 0.3 }).observe(root);
  }

  function initSystems() {
    const section = $('#ecosystem');
    if (!section || !$('[data-sys]', section)) return;
    initSysShowcase(section);
    initSysLadder(section);
    initSysSpine(section);
    initSysGlobe(section);
  }

  /* ---------- Product showcase: pinned row, travelled left → right on scroll ----------
     The section is made taller than the screen; while its inner panel is sticky,
     scroll progress (0→1) moves the view from Fillo (left) to the last card (right).
     Phones, short screens and reduced motion get a plain stacked grid instead. */
  function initProductShowcase() {
    const sec = $('[data-ps]');
    if (!sec) return;
    const pin = $('.ps__pin', sec);
    const vp = $('.ps__viewport', sec);
    const track = $('.ps__track', sec);
    const cards = $$('.pcard', track);
    const count = $('[data-ps-count]', sec);
    const bar = $('[data-ps-bar]', sec);
    const prev = $('[data-ps-prev]', sec);
    const next = $('[data-ps-next]', sec);
    const staticMQ = window.matchMedia('(max-width: 900px), (max-height: 600px), (prefers-reduced-motion: reduce)');
    const n = cards.length - 1;
    let pinned = false;
    let travel = 0;
    let dist = 0;

    const progress = () => {
      if (!dist) return 0;
      return Math.min(Math.max(-sec.getBoundingClientRect().top / dist, 0), 1);
    };

    const update = () => {
      if (!pinned) return;
      const p = progress();
      track.style.transform = `translate3d(${(-travel * p).toFixed(1)}px, 0, 0)`;
      // Cards fade/scale in as they enter from the right edge (layered entrance)
      const vpRight = vp.getBoundingClientRect().right;
      const zone = vp.clientWidth * 0.28;
      cards.forEach((card) => {
        const x = vpRight - card.getBoundingClientRect().right + card.offsetWidth * 0.35;
        card.style.setProperty('--e', Math.min(Math.max(x / zone, 0), 1).toFixed(3));
      });
      const idx = Math.round(p * n);
      if (count) count.textContent = String(idx + 1).padStart(2, '0');
      if (bar) bar.style.transform = `scaleX(${(0.14 + p * 0.86).toFixed(3)})`;
      if (prev) prev.disabled = p <= 0.002;
      if (next) next.disabled = p >= 0.998;
    };

    const layout = () => {
      pinned = !staticMQ.matches;
      sec.classList.toggle('ps--static', !pinned);
      if (!pinned) {
        sec.style.height = '';
        track.style.transform = '';
        cards.forEach((c) => c.style.removeProperty('--e'));
        return;
      }
      travel = Math.max(0, track.scrollWidth - vp.clientWidth);
      dist = travel * 1.25; // a little more scroll than movement = calmer pace
      sec.style.height = `${pin.offsetHeight + dist}px`;
      update();
    };

    const go = (dir) => {
      if (!pinned) return;
      const target = Math.min(Math.max(Math.round(progress() * n) + dir, 0), n) / n;
      const top = window.scrollY + sec.getBoundingClientRect().top + target * dist;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    prev?.addEventListener('click', () => go(-1));
    next?.addEventListener('click', () => go(1));

    window.addEventListener('scroll', onFrame(update), { passive: true });
    window.addEventListener('resize', onFrame(layout));
    if (typeof staticMQ.addEventListener === 'function') staticMQ.addEventListener('change', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

    // Mini-UI animations only run while the section is visible
    if (hasIO) new IntersectionObserver(([e]) => sec.classList.toggle('is-active', e.isIntersecting), { threshold: 0.05 }).observe(sec);
    else sec.classList.add('is-active');

    layout();
  }

  /* ---------- Mouse glow: soft green light behind the native cursor ----------
     A main glow that stays tight to the pointer plus a short fading trail of
     smaller glows. Mouse/trackpad only; the cursor itself is never changed.
     The rAF loop only runs while something is still moving. */
  function initMouseGlow() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const make = (cls) => {
      const el = document.createElement('div');
      el.className = `mglow ${cls}`.trim();
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      return el;
    };
    // trail first so the main glow is painted on top
    const trail = reduceMotion ? [] : [make('mglow--trail3'), make('mglow--trail2'), make('mglow--trail1')].reverse();
    const main = make('');
    const parts = [main, ...trail].map((el, i) => ({ el, x: 0, y: 0, ease: i === 0 ? (reduceMotion ? 1 : 0.55) : 0.42 }));
    let mx = 0;
    let my = 0;
    let raf = 0;
    let placed = false;

    const loop = () => {
      let moving = false;
      parts.forEach((p, i) => {
        const tx = i === 0 ? mx : parts[i - 1].x; // each trail glow follows the one ahead of it
        const ty = i === 0 ? my : parts[i - 1].y;
        p.x += (tx - p.x) * p.ease;
        p.y += (ty - p.y) * p.ease;
        p.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        if (Math.abs(tx - p.x) + Math.abs(ty - p.y) > 0.3) moving = true;
      });
      raf = moving ? requestAnimationFrame(loop) : 0;
    };

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      mx = e.clientX;
      my = e.clientY;
      if (!placed) { placed = true; parts.forEach((p) => { p.x = mx; p.y = my; }); } // appear at the cursor, no sweep-in
      parts.forEach((p) => p.el.classList.add('is-on'));
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    const hide = () => parts.forEach((p) => p.el.classList.remove('is-on'));
    document.documentElement.addEventListener('mouseleave', hide);
    window.addEventListener('blur', hide);
  }

  /* ---------- Boot ---------- */
  const init = () => {
    initWaves();
    initScrollState();
    initScrollProgress();
    initNav();
    initSplitTitles();
    initRevealVariants();
    initReveal();
    initExtraCounters();
    initCounters();
    initLiveKpi();
    initNetwork();
    initSectionBeams();
    initAmbient();
    initTilt();
    initButtonEffects();
    initSectionParallax();
    initHub();
    initSystems();
    initProductShowcase();
    initMouseGlow();
    initCallTimer();
    initBuilder();
    initParallax();
    initGlowCards();
    initTabs();
    initSteps();
    initMarquee();
    initSlider();
    initAccordion();
    initChat();
    initForms();
    initYear();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
