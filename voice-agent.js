/* ==========================================================================
   Telza: AI Voice Agent page interactions
   Runs after script.js (shared navbar, reveals, counters, waveforms, etc.).
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (s) => `${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  /** Observe visibility: calls onChange(true/false) as the element enters/leaves the viewport. */
  const watchVisibility = (el, onChange, threshold = 0.2) => {
    if (!hasIO) { onChange(true); return; }
    new IntersectionObserver(([entry]) => onChange(entry.isIntersecting), { threshold }).observe(el);
  };

  /** Ease a number from → to, calling update(value) each frame. */
  const tween = (from, to, duration, update) => {
    if (reduceMotion || from === to) { update(to); return; }
    const start = performance.now();
    const step = (now) => {
      // rAF timestamps can be slightly earlier than `start`, so clamp to [0, 1]
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      update(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* ---------- Hero: "Try AI Voice" female voice demo ----------
     Sources, in order: pre-generated ElevenLabs MP3 (data-voice-src) → optional
     server TTS endpoint (data-tts-endpoint, returns audio for ?text=…) → browser
     Speech Synthesis with a female English voice. Never autoplays: playback only
     starts from a click/tap on the orb or the "Try AI Voice" button. */
  const VOICE_SCRIPT = "Hello! Thank you for calling Telza AI. I'm your virtual assistant. How can I help you today? I can answer your questions, schedule appointments, and connect you with the right team. How may I assist you?";

  // Natural-sounding female English voices commonly shipped by browsers/OSes, best first.
  const FEMALE_VOICES = ['Aria', 'Jenny', 'Ava', 'Emma', 'Michelle', 'Sonia', 'Libby', 'Natasha', 'Clara',
    'Samantha', 'Google UK English Female', 'Google US English', 'Karen', 'Moira', 'Tessa', 'Serena',
    'Victoria', 'Fiona', 'Allison', 'Susan', 'Zira', 'Hazel', 'Heera', 'Catherine'];

  function initHeroVoice() {
    const stage = $('.voice-stage');
    if (!stage) return;
    const ui = {
      caption: $('[data-va-caption]', stage),
      timer: $('[data-va-timer]', stage),
      latency: $('[data-va-latency]', stage),
      badge: $('[data-va-badge]', stage),
      orb: $('[data-voice-orb]', stage),
      main: $('[data-voice-main]', stage),
      mainLabel: $('[data-voice-main-label]', stage),
      replay: $('[data-voice-replay]', stage),
      note: $('[data-voice-note]', stage),
      bars: $$('.voice-stage__wave span', stage),
    };
    const text = stage.dataset.voiceScript || VOICE_SCRIPT;
    const sentences = (text.match(/[^.!?]+[.!?]+/g) || [text]).map((s) => s.trim());
    const fileSrc = stage.dataset.voiceSrc || '';
    const endpoint = stage.dataset.ttsEndpoint || '';
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const nativePause = !/Android/i.test(navigator.userAgent); // Android cancels on pause(), so resume per sentence there
    const canAnalyse = /^https?:$/.test(location.protocol) && !!(window.AudioContext || window.webkitAudioContext);

    const LABELS = {
      ready: ['Ready to talk', 'Try AI Voice', 'Try AI Voice: play a sample greeting'],
      loading: ['Connecting to Telza AI…', 'Connecting…', 'Connecting'],
      speaking: ['Telza AI is speaking...', 'Pause', 'Pause the AI voice'],
      paused: ['Paused', 'Resume', 'Resume the AI voice'],
    };

    let state = 'ready';
    let engine = null;          // 'audio' | 'speech'
    let fileStatus = fileSrc ? 'unknown' : 'missing';
    let clickAt = 0;
    let seconds = 0;
    let timerId = null;
    let sentenceIndex = 0;
    let speakToken = 0;
    let voice = null;
    let raf = 0;
    let energy = 0;
    let lastBump = 0;
    let gap = false;
    let audioCtx = null;
    let analyser = null;
    let freq = null;
    let silentFrames = 0;
    let watchdog = null;

    const audio = new Audio();
    audio.preload = 'auto';

    /* ----- UI state ----- */
    const showNote = (msg) => { if (ui.note) { ui.note.textContent = msg; ui.note.hidden = false; } };
    const hideNote = () => { if (ui.note) ui.note.hidden = true; };

    const startTimer = () => {
      if (timerId) return;
      timerId = setInterval(() => { seconds += 1; ui.timer.textContent = clock(seconds); }, 1000);
    };
    const stopTimer = () => { clearInterval(timerId); timerId = null; };

    const setState = (next) => {
      state = next;
      stage.dataset.state = next;
      const [caption, label, aria] = LABELS[next];
      ui.caption.textContent = caption;
      ui.mainLabel.textContent = label;
      ui.main.setAttribute('aria-label', aria);
      ui.orb.setAttribute('aria-label', aria);
      ui.orb.setAttribute('aria-pressed', String(next === 'speaking'));
      if (ui.badge) ui.badge.textContent = next === 'ready' ? 'Voice demo' : 'Live call';
      if (next === 'speaking') { startTimer(); startMeter(); } else { stopTimer(); stopMeter(); }
      if (next !== 'loading') { clearTimeout(watchdog); watchdog = null; }
    };

    // If a voice source never starts (blocked, muted engine, slow network), never leave the UI stuck.
    const armWatchdog = (ms = 5000) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (state !== 'loading') return;
        if (engine === 'audio') { fallback(); return; }
        stopAll();
        showNote("Couldn't start the voice on this device. Check your sound and tap Try AI Voice again.");
        setState('ready');
      }, ms);
    };

    const markLatency = () => {
      if (!clickAt) return;
      ui.latency.textContent = `${Math.round(performance.now() - clickAt)} ms`;
      clickAt = 0;
    };

    /* ----- Waveform driven by the voice ----- */
    const drive = (t) => {
      const n = ui.bars.length;
      let sum = 0;
      if (analyser) {
        analyser.getByteFrequencyData(freq);
        for (let k = 0; k < freq.length; k++) sum += freq[k];
        silentFrames = sum === 0 ? silentFrames + 1 : 0;
        if (silentFrames > 45) analyser = null; // no signal (e.g. blocked by CORS): use the envelope below
      }
      if (!analyser && !gap && t - lastBump > 120 + Math.random() * 140) {
        energy = Math.max(energy, 0.55 + Math.random() * 0.45); // syllable-like bumps
        lastBump = t;
      }
      ui.bars.forEach((bar, i) => {
        const edge = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2); // 0 at centre → 1 at edges
        let v;
        if (analyser) {
          const bin = Math.floor((1 - edge) * freq.length * 0.55);
          v = (freq[bin] / 255) * 1.15;
        } else {
          const wobble = 0.5 + 0.5 * Math.sin(t / 85 + i * 0.75) * Math.sin(t / 210 + i * 0.33);
          v = (0.18 + energy * 0.82) * (0.35 + 0.65 * wobble) * (1 - edge * 0.45);
        }
        bar.style.transform = `scaleY(${Math.min(1, Math.max(0.1, v)).toFixed(3)})`;
      });
      energy *= 0.93;
      raf = requestAnimationFrame(drive);
    };
    const startMeter = () => {
      if (reduceMotion || raf) return;
      stage.classList.add('is-driven');
      raf = requestAnimationFrame(drive);
    };
    const stopMeter = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      stage.classList.remove('is-driven');
      ui.bars.forEach((bar) => { bar.style.transform = ''; });
    };

    /* ----- Audio engine (ElevenLabs MP3 or server endpoint) ----- */
    const setupAnalyser = () => {
      if (!canAnalyse || analyser) return;
      try {
        if (new URL(audio.currentSrc || audio.src, location.href).origin !== location.origin) return; // cross-origin would be muted
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
      } catch (err) {
        analyser = null;
      }
    };

    const playAudio = (src) => {
      engine = 'audio';
      if (audio.getAttribute('src') !== src) audio.src = src;
      try { audio.currentTime = 0; } catch (err) { /* not seekable yet */ }
      setupAnalyser();
      const p = audio.play(); // called inside the click handler, so it counts as user-initiated
      if (p && typeof p.catch === 'function') p.catch(() => { if (engine === 'audio' && state === 'loading') fallback(); });
    };

    audio.addEventListener('canplaythrough', () => { if (fileStatus === 'unknown' && audio.getAttribute('src') === fileSrc) fileStatus = 'ok'; });
    audio.addEventListener('error', () => {
      if (audio.getAttribute('src') === fileSrc) fileStatus = 'missing';
      if (engine === 'audio' && (state === 'loading' || state === 'speaking')) fallback();
    });
    audio.addEventListener('playing', () => { if (engine !== 'audio') return; markLatency(); gap = false; setState('speaking'); });
    audio.addEventListener('ended', () => { if (engine === 'audio') finish(); });

    if (fileSrc) { audio.src = fileSrc; audio.load(); } // probe only: loading is not playing

    /* ----- Browser Speech Synthesis engine ----- */
    const rank = (v) => (/Natural|Neural|Online|Premium|Enhanced/i.test(v.name) ? 0 : 1);
    const pickVoice = () => {
      if (!synth) return null;
      const english = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
      if (!english.length) return null;
      for (const name of FEMALE_VOICES) {
        const hits = english.filter((v) => v.name.includes(name)).sort((a, b) => rank(a) - rank(b));
        if (hits.length) return hits[0];
      }
      return english.find((v) => /female|woman/i.test(v.name)) || english.find((v) => /en[-_]US/i.test(v.lang)) || english[0];
    };
    if (synth) {
      voice = pickVoice();
      const onVoices = () => { voice = pickVoice(); };
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', onVoices);
      else synth.onvoiceschanged = onVoices;
    }

    const speakSentence = (token) => {
      if (token !== speakToken) return;
      if (sentenceIndex >= sentences.length) { finish(); return; }
      const u = new SpeechSynthesisUtterance(sentences[sentenceIndex]);
      voice = voice || pickVoice();
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }
      u.rate = 0.98;
      u.pitch = 1.05;
      u.volume = 1;
      u.onstart = () => {
        if (token !== speakToken) return;
        gap = false;
        markLatency();
        if (state !== 'speaking') setState('speaking');
      };
      u.onboundary = () => { energy = 1; };
      u.onend = () => {
        if (token !== speakToken) return;
        sentenceIndex += 1;
        gap = true; // short natural pause between sentences
        setTimeout(() => speakSentence(token), 160);
      };
      u.onerror = (e) => {
        if (token !== speakToken || e.error === 'interrupted' || e.error === 'canceled') return;
        showNote('Voice playback was blocked by this browser. Please tap again or try Chrome, Edge or Safari.');
        stopAll();
        setState('ready');
      };
      synth.speak(u);
    };

    const startSpeech = () => {
      if (!synth) {
        showNote("This browser can't play the AI voice. Try Chrome, Edge or Safari.");
        setState('ready');
        return;
      }
      engine = 'speech';
      speakToken += 1;
      synth.cancel();
      if (synth.paused) synth.resume(); // clears a stuck paused queue in some browsers
      speakSentence(speakToken);
    };

    /* ----- Controls ----- */
    const stopAll = () => {
      speakToken += 1;
      if (synth) synth.cancel();
      audio.pause();
      engine = null;
    };

    function fallback() {
      // MP3 missing or blocked: try the server endpoint once, then the browser voice.
      armWatchdog(); // give the next source its own time to start
      if (engine === 'audio' && endpoint && audio.getAttribute('src') !== endpointUrl()) { playAudio(endpointUrl()); return; }
      startSpeech();
    }
    const endpointUrl = () => `${endpoint}${endpoint.includes('?') ? '&' : '?'}text=${encodeURIComponent(text)}`;

    function finish() {
      stopAll();
      sentenceIndex = 0;
      ui.replay.disabled = false;
      setState('ready');
    }

    const start = () => {
      hideNote();
      stopAll();
      clickAt = performance.now();
      seconds = 0;
      sentenceIndex = 0;
      ui.timer.textContent = '00:00';
      ui.replay.disabled = false;
      setState('loading');
      armWatchdog();
      if (fileSrc && fileStatus !== 'missing') playAudio(fileSrc);
      else if (endpoint) playAudio(endpointUrl());
      else startSpeech();
    };

    const pause = () => {
      if (engine === 'audio') audio.pause();
      else if (synth && nativePause && synth.speaking) synth.pause();
      else if (synth) { speakToken += 1; synth.cancel(); } // resume restarts the current sentence
      setState('paused');
    };

    const resume = () => {
      if (engine === 'audio') {
        setupAnalyser();
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => setState('paused'));
        return; // 'playing' event switches the state back to speaking
      }
      if (!synth) return;
      if (nativePause && synth.paused) {
        synth.resume();
        setState('speaking');
      } else {
        speakToken += 1;
        synth.cancel();
        speakSentence(speakToken);
        setState('speaking');
      }
    };

    const toggle = () => {
      if (state === 'ready') start();
      else if (state === 'speaking') pause();
      else if (state === 'paused') resume();
    };

    ui.main.addEventListener('click', toggle);
    ui.orb.addEventListener('click', toggle);
    ui.replay.addEventListener('click', start);

    // Don't keep talking in a background tab, and stop cleanly when leaving the page.
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'speaking') pause(); });
    window.addEventListener('pagehide', () => { stopAll(); });

    setState('ready');
  }

  /* ---------- Real-time AI conversation ---------- */
  const SCENARIOS = {
    booking: {
      caller: 'Maria G.',
      number: 'Inbound · +1 (415) ••• 2291',
      intent: 'Reschedule appointment',
      outcome: 'Appointment rescheduled',
      sentiment: [62, 84, 95],
      turns: [
        { who: 'user', text: 'Hi, I need to move my appointment on Thursday.' },
        { who: 'ai', steps: [['Caller verified', 140], ['Appointment found · Thu 9:00 AM', 180]],
          text: 'Of course, Maria. I see your Thursday 9 AM visit with Dr. Patel. Would Friday at 10:30 AM or 2:15 PM work better?' },
        { who: 'user', text: 'Friday at 2:15, please.' },
        { who: 'ai', steps: [['Calendar checked', 120], ['Booked · Fri 2:15 PM', 160], ['SMS confirmation queued', 90]],
          text: "Done! You're booked for Friday at 2:15 PM, and I've texted you a confirmation. Anything else I can help with?",
          actions: ['Appointment booked', 'SMS sent'] },
        { who: 'user', text: "No, that's everything. Thank you!" },
        { who: 'ai', steps: [['Call summary saved to CRM', 110]], text: 'You’re welcome, Maria. Have a great day!' },
      ],
    },
    order: {
      caller: 'James K.',
      number: 'Inbound · +44 20 ••• 8812',
      intent: 'Order status · Delivery change',
      outcome: 'Delivery rerouted',
      sentiment: [44, 76, 91],
      turns: [
        { who: 'user', text: "Hey, where's my order? It was supposed to arrive yesterday." },
        { who: 'ai', steps: [['Caller matched to account', 130], ['Order #4821 · in transit', 170]],
          text: 'Sorry about the delay, James. Order 4821 was held at the depot and is out for delivery today before 6 PM.' },
        { who: 'user', text: 'Can you send it to my office instead?' },
        { who: 'ai', steps: [['Office address found', 110], ['Courier reroute confirmed', 190]],
          text: "Sure. I've rerouted it to your office on King Street and sent you the new tracking link.",
          actions: ['Delivery rerouted', 'Tracking link sent'] },
        { who: 'user', text: 'Perfect, thanks.' },
        { who: 'ai', steps: [['Ticket closed · CSAT survey queued', 100]], text: 'Happy to help! Enjoy the rest of your day.' },
      ],
    },
    lead: {
      caller: 'Sara L.',
      number: 'Outbound · Web lead · 2 min ago',
      intent: 'Qualify lead · Book viewing',
      outcome: 'Lead qualified · Viewing booked',
      sentiment: [70, 82, 94],
      turns: [
        { who: 'ai', steps: [['Lead loaded from CRM', 120], ['Listing details fetched', 140]],
          text: 'Hi Sara, this is Ava from Northwind Homes. You asked about the three-bedroom on Elm Street. Is now a good time?' },
        { who: 'user', text: 'Yes! Is it still available?' },
        { who: 'ai', steps: [['Availability checked', 150]],
          text: 'It is. Are you hoping to move in the next three months, and are you pre-approved for a mortgage?' },
        { who: 'user', text: "Within two months, and yes, I'm pre-approved." },
        { who: 'ai', steps: [['Lead scored · Hot (92)', 130], ['Agent calendar checked', 140], ['Viewing booked · Sat 11 AM', 160]],
          text: "Great! I've booked a viewing with Daniel for Saturday at 11 AM. You'll get a confirmation by text shortly.",
          actions: ['Lead qualified · Hot', 'Viewing booked'] },
      ],
    },
  };

  function initRealtime() {
    const root = $('[data-rt]');
    if (!root) return;
    const q = (sel) => $(sel, root);
    const ui = {
      messages: q('[data-rt-messages]'),
      steps: q('[data-rt-steps]'),
      brain: q('[data-rt-brain]'),
      timer: q('[data-rt-timer]'),
      intent: q('[data-rt-intent]'),
      sentiment: q('[data-rt-sentiment]'),
      sentimentLabel: q('[data-rt-sentiment-label]'),
      latency: q('[data-rt-latency]'),
      ratio: q('[data-rt-ratio]'),
      outcome: q('[data-rt-outcome]'),
      outcomeText: q('[data-rt-outcome-text]'),
      caller: q('[data-rt-caller]'),
      number: q('[data-rt-number]'),
      userAvatar: q('[data-speaker="user"] .speaker__avatar'),
      toggle: q('[data-rt-toggle]'),
      restart: q('[data-rt-restart]'),
    };
    const speakers = { user: q('[data-speaker="user"]'), ai: q('[data-speaker="ai"]') };
    const buttons = $$('[data-scenario]', root);
    const CANCEL = Symbol('cancel');

    let scenarioKey = buttons[0] ? buttons[0].dataset.scenario : 'booking';
    let runId = 0;
    let paused = false;
    let visible = false;
    let started = false;
    let playing = false;
    let seconds = 0;
    let words = { user: 0, ai: 0 };

    /* Wait that respects pause/visibility and aborts when a newer run starts. */
    const wait = async (ms, id) => {
      let left = ms;
      while (left > 0) {
        if (id !== runId) throw CANCEL;
        await sleep(50);
        if (!paused && visible) left -= 50;
      }
      if (id !== runId) throw CANCEL;
    };

    const setSpeaker = (who, mode) => {
      Object.entries(speakers).forEach(([key, el]) => {
        if (!el) return;
        const active = key === who;
        el.classList.toggle('is-speaking', active && mode === 'speaking');
        el.classList.toggle('is-thinking', active && mode === 'thinking');
        let label = 'Listening';
        if (mode === 'idle') label = 'Idle';
        else if (active) label = mode === 'speaking' ? 'Speaking' : 'Thinking';
        $('.speaker__state', el).textContent = label;
      });
    };

    const setSentiment = (value) => {
      ui.sentiment.style.left = `${value}%`;
      ui.sentimentLabel.textContent = value >= 75 ? 'Positive' : value >= 52 ? 'Neutral' : 'Frustrated';
    };

    const updateRatio = () => {
      const total = words.user + words.ai;
      ui.ratio.style.width = `${total ? Math.round((words.ai / total) * 100) : 50}%`;
    };

    const scrollDown = () => { ui.messages.scrollTop = ui.messages.scrollHeight; };

    const addMessage = (who, name) => {
      const wrap = document.createElement('div');
      wrap.className = `rt-msg rt-msg--${who}`;
      const label = document.createElement('span');
      label.className = 'rt-msg__who';
      label.textContent = name;
      const p = document.createElement('p');
      p.className = 'is-typing';
      wrap.append(label, p);
      ui.messages.appendChild(wrap);
      scrollDown();
      return { wrap, p };
    };

    const addActions = (wrap, actions) => {
      const row = document.createElement('div');
      row.className = 'rt-msg__actions';
      actions.forEach((text) => {
        const chip = document.createElement('span');
        chip.className = 'rt-chip';
        chip.innerHTML = '<svg class="icon"><use href="#i-check"/></svg>';
        chip.append(text);
        row.appendChild(chip);
      });
      wrap.appendChild(row);
      scrollDown();
    };

    const typeWords = async (p, text, perWord, who, id) => {
      const list = text.split(' ');
      for (let i = 0; i < list.length; i++) {
        p.textContent += (i ? ' ' : '') + list[i];
        words[who] += 1;
        updateRatio();
        scrollDown();
        await wait(perWord + (list[i].length > 7 ? 50 : 0), id);
      }
      p.classList.remove('is-typing');
    };

    const runSteps = async (steps, id) => {
      ui.steps.innerHTML = '';
      ui.brain.classList.add('is-busy');
      let total = 0;
      for (const [label, ms] of steps) {
        const li = document.createElement('li');
        li.className = 'rt__step';
        li.innerHTML = '<span class="rt__step-icon"></span><span></span><span class="rt__step-ms"></span>';
        li.children[1].textContent = label;
        ui.steps.appendChild(li);
        await wait(ms * 3, id); // slowed down so viewers can follow each step
        li.classList.add('is-done');
        li.children[2].textContent = `${ms} ms`;
        total += ms;
      }
      ui.brain.classList.remove('is-busy');
      return total;
    };

    const reset = (sc) => {
      seconds = 0;
      words = { user: 0, ai: 0 };
      ui.timer.textContent = '00:00';
      ui.messages.innerHTML = '';
      ui.steps.innerHTML = '<li class="rt__step rt__step--idle">Waiting for the conversation…</li>';
      ui.intent.textContent = 'Detecting intent…';
      ui.intent.classList.remove('is-set');
      ui.latency.textContent = '— ms';
      ui.outcome.classList.remove('is-shown');
      ui.caller.textContent = sc.caller;
      ui.number.textContent = sc.number;
      ui.userAvatar.textContent = sc.caller.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      setSentiment(50);
      updateRatio();
      setSpeaker(null, 'listen');
    };

    const finish = (sc) => {
      ui.outcomeText.textContent = sc.outcome;
      ui.outcome.classList.add('is-shown');
      setSpeaker(null, 'idle');
    };

    const play = async (id) => {
      const sc = SCENARIOS[scenarioKey];
      let aiTurn = 0;
      await wait(600, id);
      for (const turn of sc.turns) {
        if (turn.who === 'user') {
          setSpeaker('user', 'speaking');
          await wait(250, id);
          const { p } = addMessage('user', sc.caller);
          await typeWords(p, turn.text, 200, 'user', id);
          setSpeaker(null, 'listen');
          await wait(300, id);
        } else {
          setSpeaker('ai', 'thinking');
          const total = await runSteps(turn.steps, id);
          if (aiTurn === 0) {
            ui.intent.textContent = sc.intent;
            ui.intent.classList.add('is-set');
          }
          ui.latency.textContent = `${total + 260} ms`;
          setSentiment(sc.sentiment[aiTurn] ?? 85);
          setSpeaker('ai', 'speaking');
          const { wrap, p } = addMessage('ai', 'Telza AI');
          await typeWords(p, turn.text, 150, 'ai', id);
          if (turn.actions) addActions(wrap, turn.actions);
          setSpeaker(null, 'listen');
          aiTurn += 1;
          await wait(450, id);
        }
      }
      playing = false;
      finish(sc);
      await wait(5500, id);
      start(); // loop the scenario
    };

    const start = () => {
      runId += 1;
      const id = runId;
      started = true;
      playing = true;
      reset(SCENARIOS[scenarioKey]);
      play(id).catch((err) => { if (err !== CANCEL) console.error(err); });
    };

    /* Reduced motion: show the whole conversation at once. */
    const renderStatic = () => {
      const sc = SCENARIOS[scenarioKey];
      reset(sc);
      let aiTurn = 0;
      let lastSteps = [];
      sc.turns.forEach((turn) => {
        const { wrap, p } = addMessage(turn.who, turn.who === 'ai' ? 'Telza AI' : sc.caller);
        p.textContent = turn.text;
        p.classList.remove('is-typing');
        words[turn.who] += turn.text.split(' ').length;
        if (turn.who === 'ai') {
          if (turn.actions) addActions(wrap, turn.actions);
          lastSteps = turn.steps;
          aiTurn += 1;
        }
      });
      ui.steps.innerHTML = '';
      lastSteps.forEach(([label, ms]) => {
        const li = document.createElement('li');
        li.className = 'rt__step is-done';
        li.innerHTML = '<span class="rt__step-icon"></span><span></span><span class="rt__step-ms"></span>';
        li.children[1].textContent = label;
        li.children[2].textContent = `${ms} ms`;
        ui.steps.appendChild(li);
      });
      ui.intent.textContent = sc.intent;
      ui.intent.classList.add('is-set');
      ui.latency.textContent = `${lastSteps.reduce((a, [, ms]) => a + ms, 0) + 260} ms`;
      setSentiment(sc.sentiment[Math.max(0, aiTurn - 1)] ?? 85);
      updateRatio();
      ui.messages.scrollTop = 0;
      finish(sc);
    };

    // Scenario picker
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        scenarioKey = btn.dataset.scenario;
        buttons.forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        if (reduceMotion) renderStatic();
        else start();
      });
    });

    // Pause / resume and restart
    ui.toggle?.addEventListener('click', () => {
      paused = !paused;
      root.classList.toggle('is-paused', paused);
      ui.toggle.setAttribute('aria-label', paused ? 'Resume demo' : 'Pause demo');
    });
    ui.restart?.addEventListener('click', () => {
      paused = false;
      root.classList.remove('is-paused');
      ui.toggle?.setAttribute('aria-label', 'Pause demo');
      if (reduceMotion) renderStatic();
      else start();
    });

    if (reduceMotion) {
      if (ui.toggle) ui.toggle.hidden = true;
      renderStatic();
      return;
    }

    // Call timer (only while playing, visible and not paused)
    setInterval(() => {
      if (!playing || paused || !visible) return;
      seconds += 1;
      ui.timer.textContent = clock(seconds);
    }, 1000);

    watchVisibility(root, (isVisible) => {
      visible = isVisible;
      if (visible && !started) start();
    }, 0.25);
  }

  /* ---------- Inbound card: soft ringtone on hover ----------
     Synthesised with Web Audio (dual 440/480 Hz tone, gentle trill, UK-style
     double ring), so there is no file to download and it stops instantly.
     Browsers only allow sound after a user gesture, so the audio engine is
     unlocked on the visitor's first click/tap/key press; hovering before that
     stays silent. Only one ring can play at a time. */
  function initInboundRing() {
    const zone = $('[data-ring-zone]');
    const toggle = $('[data-ring-mute]');
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!zone || !toggle) return;
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!AC || !canHover) { toggle.hidden = true; return; } // touch screens have no hover

    const VOLUME = 0.05;      // subtle
    const CYCLE = 3;          // seconds per ring cycle
    const CYCLES = 20;        // scheduled up front (one minute of ringing)
    const STORE_KEY = 'telza-ring-muted';

    let ctx = null;
    let master = null;
    let current = null;
    let hovering = false;
    let muted = false;
    try { muted = localStorage.getItem(STORE_KEY) === '1'; } catch (err) { /* storage unavailable */ }

    const renderToggle = () => {
      toggle.setAttribute('aria-pressed', String(muted));
      const label = muted ? 'Unmute ringtone' : 'Mute ringtone';
      toggle.setAttribute('aria-label', label);
      toggle.title = ctx ? label : `${label} (sound starts after your first click on the page)`;
    };

    const stopRing = () => {
      if (!current) return;
      const { out, sources } = current;
      current = null;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.03); // fast fade avoids a click
      sources.forEach((s) => { try { s.stop(now + 0.05); } catch (err) { /* already stopped */ } });
      setTimeout(() => out.disconnect(), 150);
    };

    const voiceDemoSpeaking = () => $('.voice-stage')?.dataset.state === 'speaking';

    const startRing = () => {
      if (muted || !ctx || ctx.state !== 'running' || voiceDemoSpeaking()) return;
      stopRing(); // never more than one ring at a time

      const t0 = ctx.currentTime + 0.02;
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(master);

      // Ring cadence envelope: 0.4 s on, 0.2 s off, 0.4 s on, 2 s silence
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      for (let c = 0; c < CYCLES; c++) {
        const base = t0 + c * CYCLE;
        [[0, 0.4], [0.6, 1.0]].forEach(([on, off]) => {
          env.gain.setValueAtTime(0, base + on);
          env.gain.linearRampToValueAtTime(1, base + on + 0.02);
          env.gain.setValueAtTime(1, base + off - 0.03);
          env.gain.linearRampToValueAtTime(0, base + off);
        });
      }

      // Gentle 20 Hz trill like a real phone ringer (gain swings between 0.6 and 1)
      const trill = ctx.createGain();
      trill.gain.value = 0.8;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 20;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.2;
      lfo.connect(lfoDepth).connect(trill.gain);

      const toneA = ctx.createOscillator();
      const toneB = ctx.createOscillator();
      toneA.frequency.value = 440;
      toneB.frequency.value = 480;
      toneA.connect(env);
      toneB.connect(env);
      env.connect(trill).connect(out);

      const sources = [toneA, toneB, lfo];
      sources.forEach((s) => s.start(t0));
      const end = t0 + CYCLES * CYCLE;
      sources.forEach((s) => s.stop(end));
      current = { out, sources };
    };

    // Unlock audio on the first user gesture (autoplay policy)
    const unlock = (e) => {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = VOLUME;
        const soften = ctx.createBiquadFilter(); // take the edge off the tones
        soften.type = 'lowpass';
        soften.frequency.value = 1800;
        master.connect(soften).connect(ctx.destination);
        renderToggle();
      }
      const ready = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
      ready.then(() => {
        const onToggle = e && e.target && e.target.closest && e.target.closest('[data-ring-mute]');
        if (hovering && !onToggle) startRing();
      }).catch(() => {});
      ['pointerdown', 'keydown'].forEach((type) => window.removeEventListener(type, unlock, true));
    };
    ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, unlock, true));

    zone.addEventListener('pointerenter', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      hovering = true;
      startRing(); // replays from the start on every new hover
    });
    zone.addEventListener('pointerleave', () => {
      hovering = false;
      stopRing(); // stop immediately on mouse leave
    });

    toggle.addEventListener('click', () => {
      muted = !muted;
      try { localStorage.setItem(STORE_KEY, muted ? '1' : '0'); } catch (err) { /* ignore */ }
      renderToggle();
      if (muted) stopRing();
      else if (hovering && ctx) (ctx.state === 'running' ? Promise.resolve() : ctx.resume()).then(startRing).catch(() => {});
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) stopRing(); });
    window.addEventListener('pagehide', stopRing);
    renderToggle();
  }

  /* ---------- Outbound dialer: rotating lane statuses ---------- */
  function initDialer() {
    const wrap = $('[data-lanes]');
    if (!wrap || reduceMotion) return;
    const lanes = $$('[data-lane]', wrap);
    const states = [
      ['ringing', 'Ringing'],
      ['talking', 'Talking'],
      ['qualified', 'Qualified'],
      ['booked', 'Meeting booked'],
      ['voicemail', 'Voicemail · retry 4 PM'],
    ];
    let visible = false;
    watchVisibility(wrap, (v) => { visible = v; });
    setInterval(() => {
      if (!visible) return;
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      const current = states.findIndex(([key]) => key === lane.dataset.status);
      const [key, label] = states[(current + 1) % states.length];
      lane.dataset.status = key;
      $('.lane__status', lane).textContent = label;
      lane.classList.remove('is-changed');
      void lane.offsetWidth;
      lane.classList.add('is-changed');
    }, 2200);
  }

  /* ---------- Animated call workflow ---------- */
  function initWorkflow() {
    const root = $('[data-wf]');
    if (!root) return;
    const nodes = $$('.wf__node', root);
    const total = $('[data-wf-total]', root);
    const ms = nodes.map((n) => parseInt(n.dataset.ms || '0', 10));
    const sum = ms.reduce((a, b) => a + b, 0);

    if (reduceMotion) {
      nodes.forEach((n) => n.classList.add('is-done'));
      total.textContent = `${sum} ms`;
      return;
    }

    let index = -1;
    let acc = 0;
    let timer = null;
    const render = () => {
      nodes.forEach((n, k) => {
        n.classList.toggle('is-done', k < index || index >= nodes.length);
        n.classList.toggle('is-active', k === index);
      });
    };
    const tick = () => {
      index += 1;
      if (index > nodes.length + 1) { // hold on the finished state, then restart
        index = -1;
        acc = 0;
        total.textContent = '0 ms';
        render();
        return;
      }
      if (index < nodes.length) {
        const from = acc;
        acc += ms[index];
        tween(from, acc, 700, (v) => { total.textContent = `${Math.round(v)} ms`; });
      }
      render();
    };
    watchVisibility(root, (visible) => {
      if (visible && !timer) { tick(); timer = setInterval(tick, 1100); }
      if (!visible && timer) { clearInterval(timer); timer = null; }
    }, 0.3);
  }

  /* ---------- Call analytics dashboard ---------- */
  // Placeholder data: replace with real analytics.
  const RANGES = {
    '7d': {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      ai: [1210, 1384, 1296, 1522, 1688, 982, 861],
      human: [158, 190, 171, 206, 238, 118, 96],
      kpi: { resolution: 88, aht: 128, csat: 4.8 },
      delta: { calls: '+9%', resolution: '+2 pts', aht: '−18s', csat: '+0.1' },
      outcomes: { resolved: 66, booked: 18, transferred: 11, voicemail: 5 },
      sentiment: { pos: 78, neu: 17, neg: 5 },
    },
    '30d': {
      labels: ['1', '4', '7', '10', '13', '16', '19', '22', '25', '28'],
      ai: [3920, 4105, 3870, 4410, 4630, 4380, 4790, 5020, 4860, 5240],
      human: [520, 540, 505, 560, 590, 555, 600, 610, 585, 620],
      kpi: { resolution: 87, aht: 134, csat: 4.8 },
      delta: { calls: '+14%', resolution: '+3 pts', aht: '−22s', csat: '+0.2' },
      outcomes: { resolved: 64, booked: 19, transferred: 12, voicemail: 5 },
      sentiment: { pos: 74, neu: 20, neg: 6 },
    },
    '90d': {
      labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'],
      ai: [8100, 8420, 8260, 8900, 9150, 9480, 9320, 9870, 10240, 10110, 10650, 11020],
      human: [1220, 1250, 1190, 1290, 1310, 1330, 1300, 1360, 1390, 1370, 1420, 1450],
      kpi: { resolution: 85, aht: 141, csat: 4.7 },
      delta: { calls: '+31%', resolution: '+6 pts', aht: '−41s', csat: '+0.3' },
      outcomes: { resolved: 61, booked: 20, transferred: 13, voicemail: 6 },
      sentiment: { pos: 71, neu: 22, neg: 7 },
    },
  };

  function initDashboard() {
    const root = $('[data-dash]');
    if (!root) return;
    const W = 600;
    const H = 220;
    const chart = $('[data-chart]', root);
    const plot = $('[data-chart-plot]', root);
    const area = $('[data-chart-area]', root);
    const line = $('[data-chart-line]', root);
    const line2 = $('[data-chart-line2]', root);
    const clip = $('[data-chart-clip]', root);
    const labels = $('[data-chart-labels]', root);
    const cursor = $('[data-chart-cursor]', root);
    const dot = $('[data-chart-dot]', root);
    const tip = $('[data-chart-tip]', root);
    const rangeButtons = $$('[data-range]', root);

    const state = { calls: 0, resolution: 0, aht: 0, csat: 0 };
    let current = null;
    let points = [];

    const toPoints = (values, max) => values.map((v, i) => [
      (i / (values.length - 1)) * W,
      H - 8 - (v / max) * (H - 30),
    ]);
    // Smooth curve through points (Catmull-Rom → cubic Bézier)
    const smooth = (pts) => pts.reduce((d, p, i, a) => {
      if (i === 0) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      const p0 = a[i - 2] || a[i - 1];
      const p1 = a[i - 1];
      const p3 = a[i + 1] || p;
      const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6];
      const c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
      return `${d} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    }, '');

    const aht = (s) => `${Math.floor(s / 60)}m ${pad(Math.round(s % 60))}s`;

    const render = (key) => {
      const data = RANGES[key];
      if (!data) return;
      current = key;

      // Chart
      const max = Math.max(...data.ai) * 1.12;
      points = toPoints(data.ai, max);
      const linePath = smooth(points);
      line.setAttribute('d', linePath);
      area.setAttribute('d', `${linePath} L${W},${H} L0,${H} Z`);
      line2.setAttribute('d', smooth(toPoints(data.human, max)));
      labels.innerHTML = data.labels.map((l) => `<span>${l}</span>`).join('');
      tween(0, W + 20, 1200, (v) => clip.setAttribute('width', String(v)));

      // KPIs
      const calls = data.ai.reduce((a, b) => a + b, 0) + data.human.reduce((a, b) => a + b, 0);
      const target = { calls, resolution: data.kpi.resolution, aht: data.kpi.aht, csat: data.kpi.csat };
      tween(state.calls, target.calls, 1000, (v) => { $('[data-kpi="calls"]', root).textContent = fmt(v); });
      tween(state.resolution, target.resolution, 1000, (v) => { $('[data-kpi="resolution"]', root).textContent = `${Math.round(v)}%`; });
      tween(state.aht, target.aht, 1000, (v) => { $('[data-kpi="aht"]', root).textContent = aht(v); });
      tween(state.csat, target.csat, 1000, (v) => { $('[data-kpi="csat"]', root).textContent = v.toFixed(1); });
      Object.assign(state, target);
      Object.entries(data.delta).forEach(([k, v]) => { const el = $(`[data-delta="${k}"]`, root); if (el) el.textContent = v; });

      // Donut + outcome legend
      let offset = 0;
      Object.entries(data.outcomes).forEach(([k, pct]) => {
        const seg = $(`[data-donut="${k}"]`, root);
        if (seg) {
          seg.style.strokeDasharray = `${Math.max(pct - 0.6, 0)} ${100 - Math.max(pct - 0.6, 0)}`;
          seg.style.strokeDashoffset = String(-offset);
        }
        offset += pct;
        const label = $(`[data-outcome="${k}"]`, root);
        if (label) label.textContent = `${pct}%`;
      });
      const handled = data.outcomes.resolved + data.outcomes.booked;
      const totalEl = $('[data-donut-total]', root);
      const prevHandled = parseInt(totalEl.textContent, 10) || 0;
      tween(prevHandled, handled, 1000, (v) => { totalEl.textContent = `${Math.round(v)}%`; });

      // Sentiment bars
      Object.entries(data.sentiment).forEach(([k, pct]) => {
        const bar = $(`[data-sent="${k}"]`, root);
        if (bar) bar.style.width = `${pct}%`;
        const label = $(`[data-sent-label="${k}"]`, root);
        if (label) label.textContent = `${pct}%`;
      });

      chart.classList.remove('is-hover');
    };

    // Range switcher
    rangeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        rangeButtons.forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        render(btn.dataset.range);
      });
    });

    // Hover / touch tooltip
    const showPoint = (clientX) => {
      if (!current || !points.length) return;
      const data = RANGES[current];
      const r = plot.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
      const i = Math.round(ratio * (points.length - 1));
      const xPct = (points[i][0] / W) * 100;
      const yPct = (points[i][1] / H) * 100;
      cursor.style.left = `${xPct}%`;
      dot.style.left = `${xPct}%`;
      dot.style.top = `${yPct}%`;
      tip.style.left = `${Math.min(Math.max(xPct, 14), 86)}%`;
      const prefix = current === '30d' ? 'Day ' : '';
      tip.innerHTML = `<strong>${prefix}${data.labels[i]}</strong><br><b>${fmt(data.ai[i])}</b> AI-handled · ${fmt(data.human[i])} transferred`;
      chart.classList.add('is-hover');
    };
    plot.addEventListener('pointermove', (e) => showPoint(e.clientX));
    plot.addEventListener('pointerdown', (e) => showPoint(e.clientX));
    plot.addEventListener('pointerleave', () => chart.classList.remove('is-hover'));

    // First render when the dashboard scrolls into view
    let rendered = false;
    const initial = (rangeButtons.find((b) => b.classList.contains('is-active')) || rangeButtons[0])?.dataset.range || '30d';
    if (!hasIO || reduceMotion) { render(initial); rendered = true; return; }
    clip.setAttribute('width', '0');
    watchVisibility(root, (visible) => {
      if (visible && !rendered) { rendered = true; render(initial); }
    }, 0.2);
  }

  /* ---------- Boot ---------- */
  const init = () => {
    initHeroVoice();
    initRealtime();
    initInboundRing();
    initDialer();
    initWorkflow();
    initDashboard();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
