/* ==========================================================================
   Telza: Fillo page interactions
   Runs after script.js (shared navbar, reveals, tabs, steps, accordion, forms).
   All numbers and feed items here are SAMPLE data for the illustrative UI.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;

  const onVisible = (el, cb, threshold = 0.3) => {
    if (!el) return;
    if (!hasIO) { cb(true); return; }
    new IntersectionObserver(([entry]) => cb(entry.isIntersecting), { threshold }).observe(el);
  };

  /* ---------- Hero preview: count-up sample metrics ---------- */
  function initHeroCounters() {
    const els = $$('[data-fapp-count]');
    if (!els.length) return;
    const render = (el, v) => { el.textContent = `${Math.round(v).toLocaleString('en-US')}${el.dataset.suffix || ''}`; };
    let done = false;
    onVisible($('.fapp'), (visible) => {
      if (!visible || done) return;
      done = true;
      els.forEach((el) => {
        const target = parseFloat(el.dataset.fappCount);
        if (reduceMotion) { render(el, target); return; }
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min(Math.max((now - start) / 1600, 0), 1);
          render(el, target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        render(el, 0);
        requestAnimationFrame(tick);
      });
    });
  }

  /* ---------- Hero preview: live sample activity feed ---------- */
  function initHeroFeed() {
    const feed = $('[data-fapp-feed]');
    if (!feed || reduceMotion) return;
    // EDIT: replace with real Fillo activity examples
    const samples = [
      ['New sample item added', ''],
      ['Sample task completed', ''],
      ['Sample report generated', 'teal'],
      ['Sample update synced', 'teal'],
      ['Sample suggestion ready', ''],
    ];
    let i = 0;
    let visible = false;
    onVisible(feed, (v) => { visible = v; }, 0.2);
    setInterval(() => {
      if (!visible || document.hidden) return;
      const [text, tone] = samples[i % samples.length];
      i += 1;
      const li = document.createElement('li');
      li.className = 'is-new';
      const dot = document.createElement('span');
      dot.className = `fapp__dot${tone ? ` fapp__dot--${tone}` : ''}`;
      const time = document.createElement('time');
      time.textContent = 'now';
      li.append(dot, text, time);
      // age the older items' timestamps, keep three rows
      $$('time', feed).forEach((t, k) => { t.textContent = `${(k + 1) * 2}m`; });
      feed.prepend(li);
      while (feed.children.length > 3) feed.lastElementChild.remove();
    }, 3200);
  }

  /* ---------- Fillo live voice agent demo ----------
     A scripted phone call between a caller and Fillo, shown as a live call:
     phone UI with voice orb + waveform, word-by-word transcript, action steps,
     call timer and outcome. Silent by default; with sound on the agent and caller
     speak (recorded clips if present, otherwise the browser's voices) and the
     transcript/waveform follow the speech. */
  const FD_TURNS = [
    { who: 'ai', text: 'Hello! Thank you for calling. How can I help you today?' },
    { who: 'user', text: "Hi, I'd like to book an appointment.", intent: 'Book appointment' },
    { who: 'ai', text: "Absolutely! I'd be happy to help. What day works best for you?" },
    { who: 'user', text: 'Tomorrow afternoon.' },
    { who: 'ai', text: 'Perfect! Let me check the available slots for you.', action: { label: 'Checking calendar availability…', done: '2 slots found · 2:00 PM and 3:30 PM', ms: 1700 } },
    { who: 'ai', text: 'I have 2 PM or 3:30 PM tomorrow. Which would you prefer?' },
    { who: 'user', text: '3:30 works great.' },
    { who: 'ai', text: "You're all set for tomorrow at 3:30 PM. You'll get a confirmation text shortly.", results: ['Appointment booked · Tomorrow, 3:30 PM', 'SMS confirmation sent'], outcome: 'Appointment booked' },
    { who: 'user', text: 'Perfect, thank you!', sentiment: 'Positive' },
    { who: 'ai', text: "You're welcome! Have a wonderful day." },
  ];
  const FD_AUDIO_DIR = 'assets/audio/fillo-demo/'; // turn-1.mp3 … turn-10.mp3 (optional)
  const FD_FEMALE = ['Aria', 'Jenny', 'Ava', 'Emma', 'Michelle', 'Sonia', 'Libby', 'Samantha', 'Google US English', 'Google UK English Female', 'Karen', 'Moira', 'Tessa', 'Serena', 'Zira', 'Susan', 'Hazel'];
  const FD_MALE = ['Guy', 'Andrew', 'Brian', 'Christopher', 'Eric', 'Davis', 'Roger', 'Ryan', 'Daniel', 'Alex', 'Google UK English Male', 'David', 'Mark', 'Aaron', 'Arthur', 'Fred'];

  /* Phone-line sound effects (Web Audio): ringback, connect beep, line hiss, end tone */
  function createPhoneSfx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let master = null;
    let noise = null;
    let hiss = null;
    const ensure = () => {
      if (!AC) return false;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.6;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    };
    const tone = (freq, start, dur, gain) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + 0.02);
      g.gain.setValueAtTime(gain, start + dur - 0.04);
      g.gain.linearRampToValueAtTime(0, start + dur);
      o.connect(g).connect(master);
      o.start(start);
      o.stop(start + dur + 0.02);
    };
    return {
      ensure,
      ringback() { if (!ensure()) return; const t = ctx.currentTime + 0.05; [0, 1.8].forEach((o) => { tone(440, t + o, 1.0, 0.035); tone(480, t + o, 1.0, 0.035); }); },
      connect() { if (!ensure()) return; const t = ctx.currentTime + 0.02; tone(880, t, 0.09, 0.05); tone(1320, t + 0.12, 0.12, 0.05); },
      end() { if (!ensure()) return; const t = ctx.currentTime + 0.02; [620, 520, 420].forEach((f, i) => tone(f, t + i * 0.16, 0.13, 0.05)); },
      hiss(on) {
        if (!ensure()) return;
        if (on && !hiss) {
          const src = ctx.createBufferSource();
          src.buffer = noise;
          src.loop = true;
          const band = ctx.createBiquadFilter();
          band.type = 'bandpass';
          band.frequency.value = 1800;
          band.Q.value = 0.5;
          const g = ctx.createGain();
          g.gain.value = 0.004; // barely audible phone-line texture
          src.connect(band).connect(g).connect(master);
          src.start();
          hiss = src;
        } else if (!on && hiss) { hiss.stop(); hiss = null; }
      },
      suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
      resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    };
  }

  function initVoiceDemo() {
    const root = $('[data-fdemo]');
    if (!root) return;
    const q = (sel) => $(sel, root);
    const stage = q('[data-fd-stage]');
    const list = q('[data-fd-list]');
    const wave = q('[data-fd-wave]');
    const statusEl = q('[data-fd-status]');
    const timerEl = q('[data-fd-timer]');
    const speakingEl = $('span', q('[data-fd-speaking]'));
    const latencyEl = q('[data-fd-latency]');
    const intentEl = q('[data-fd-intent]');
    const outcomeEl = q('[data-fd-outcome]');
    const sentimentEl = q('[data-fd-sentiment]');
    const liveEl = q('[data-fd-live]');
    const startBtn = q('[data-fd-start]');
    const toggleBtn = q('[data-fd-toggle]');
    const restartBtn = q('[data-fd-restart]');
    const track = q('[data-fd-track]');
    const clockEl = q('[data-fd-clock]');
    const soundBtn = q('[data-fd-sound]');
    const soundLabel = q('[data-fd-sound-label]');
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const nativePause = !/Android/i.test(navigator.userAgent);
    const sfx = createPhoneSfx();
    const CANCEL = Symbol('cancel');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const pad = (n) => String(n).padStart(2, '0');
    const clock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

    // Waveform bars
    const BAR_N = 26;
    const bars = Array.from({ length: BAR_N }, () => { const b = document.createElement('span'); wave.appendChild(b); return b; });

    // Progress track: one segment per turn, sized by its length
    const segs = FD_TURNS.map((turn, i) => {
      const seg = document.createElement('button');
      seg.type = 'button';
      seg.className = `fdemo__seg${turn.who === 'user' ? ' is-user' : ''}`;
      seg.style.setProperty('--w', String(turn.text.split(' ').length + 2));
      seg.setAttribute('aria-label', `Turn ${i + 1}: ${turn.who === 'ai' ? 'Fillo' : 'Caller'} – ${turn.text}`);
      seg.appendChild(document.createElement('i'));
      seg.addEventListener('click', () => jump(i, true));
      track.appendChild(seg);
      return seg;
    });

    // Optional recorded clips (ElevenLabs): probe the first one
    let clipsOk = null;
    const clip = new Audio();
    clip.preload = 'auto';
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => { clipsOk = true; });
    probe.addEventListener('error', () => { clipsOk = false; });
    probe.src = `${FD_AUDIO_DIR}turn-1.mp3`;

    // Browser voices: a female voice for Fillo, a different (male) voice for the caller
    let aiVoice = null;
    let userVoice = null;
    const pickVoices = () => {
      if (!synth) return;
      const en = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
      if (!en.length) return;
      const rank = (v) => (/Natural|Neural|Online|Premium|Enhanced/i.test(v.name) ? 0 : 1);
      const pick = (names) => {
        for (const n of names) {
          const hits = en.filter((v) => v.name.includes(n)).sort((a, b) => rank(a) - rank(b));
          if (hits.length) return hits[0];
        }
        return null;
      };
      aiVoice = pick(FD_FEMALE) || en.find((v) => /female|woman/i.test(v.name)) || en[0];
      userVoice = pick(FD_MALE.filter((n) => !aiVoice.name.includes(n))) || en.find((v) => v !== aiVoice) || aiVoice;
    };
    if (synth) {
      pickVoices();
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', pickVoices);
      else synth.onvoiceschanged = pickVoices;
    }

    let runId = 0;
    let started = false;
    let playing = false;
    let userPaused = false;
    let soundOn = false;
    let audioBroken = false;
    let connected = false;
    let ended = false;
    let turnIdx = 0;
    let seconds = 0;
    let speaker = null;
    let energy = 0;
    let curWords = [];

    /* ----- UI helpers ----- */
    const setSpeaker = (who, text) => {
      speaker = who;
      if (who) stage.dataset.speaker = who; else delete stage.dataset.speaker;
      if (speakingEl) speakingEl.textContent = text;
    };
    const setStatus = (text) => { statusEl.textContent = text; };
    const setFoot = (el, text) => { el.textContent = text; el.classList.toggle('is-set', text !== '—' && !/…|progress/i.test(text)); };
    const renderTime = () => { timerEl.textContent = clock(seconds); clockEl.textContent = clock(seconds); };
    const scroll = () => { list.scrollTop = list.scrollHeight; };
    const setSeg = (i, p) => segs.forEach((s, k) => s.style.setProperty('--p', (k < i ? 1 : k === i ? p : 0).toFixed(3)));

    const addMsg = (turn) => {
      const row = document.createElement('div');
      row.className = `fmsg fmsg--${turn.who} is-current`;
      const avatar = document.createElement('span');
      avatar.className = 'fmsg__avatar';
      if (turn.who === 'ai') avatar.innerHTML = '<svg class="icon"><use href="#i-layers"/></svg>';
      else avatar.textContent = 'C';
      const body = document.createElement('div');
      const who = document.createElement('span');
      who.className = 'fmsg__who';
      who.textContent = turn.who === 'ai' ? 'Fillo AI' : 'Caller';
      const time = document.createElement('time');
      time.textContent = clock(seconds);
      who.appendChild(time);
      const p = document.createElement('p');
      p.className = 'fmsg__text';
      const words = turn.text.split(' ').map((w, i, arr) => {
        const span = document.createElement('span');
        span.textContent = w;
        p.appendChild(span);
        if (i < arr.length - 1) p.appendChild(document.createTextNode(' '));
        return span;
      });
      body.append(who, p);
      row.append(avatar, body);
      list.appendChild(row);
      scroll();
      return { row, words };
    };
    const addSys = (text, done) => {
      const el = document.createElement('div');
      el.className = `fsys${done ? ' is-done' : ''}`;
      el.innerHTML = '<span class="fsys__icon"></span><span></span>';
      el.lastChild.textContent = text;
      list.appendChild(el);
      scroll();
      return el;
    };
    const finishSys = (el, text) => { el.classList.add('is-done'); el.lastChild.textContent = text; };
    const revealUpTo = (words, k) => {
      words.forEach((w, j) => { w.classList.toggle('is-on', j <= k); w.classList.toggle('is-now', j === k); });
      setSeg(turnIdx, Math.min((k + 1) / words.length, 1));
    };

    /* ----- Pausable waits (cancelled by restarts / seeks) ----- */
    const wait = async (ms, id) => {
      let left = ms;
      while (left > 0) {
        if (id !== runId) throw CANCEL;
        await sleep(40);
        if (playing) left -= 40;
      }
      if (id !== runId) throw CANCEL;
    };

    /* ----- Speaking a turn: silent pacing, recorded clip or browser voice ----- */
    const paceSilently = async (turn, words, id) => {
      const rate = turn.who === 'ai' ? 300 : 320;
      for (let k = 0; k < words.length; k++) {
        revealUpTo(words, k);
        energy = 1;
        await wait(rate + (words[k].textContent.length > 6 ? 70 : 0), id);
      }
    };
    const playClip = (n, words, id) => new Promise((resolve) => {
      let iv = null;
      const done = (result) => { clearInterval(iv); clip.onended = null; clip.onerror = null; resolve(result); };
      clip.onended = () => { revealUpTo(words, words.length - 1); done('ok'); };
      clip.onerror = () => { clipsOk = false; done('fallback'); };
      clip.src = `${FD_AUDIO_DIR}turn-${n + 1}.mp3`;
      iv = setInterval(() => {
        if (id !== runId) { clip.pause(); done('cancel'); return; }
        if (clip.duration && !clip.paused) {
          revealUpTo(words, Math.min(Math.floor((clip.currentTime / clip.duration) * words.length), words.length - 1));
          energy = Math.max(energy, 0.6 + Math.random() * 0.4);
        }
      }, 60);
      const p = clip.play();
      if (p && typeof p.catch === 'function') p.catch(() => done('fallback'));
    });
    const speakVoice = (turn, words, id) => new Promise((resolve) => {
      if (!aiVoice) pickVoices();
      const u = new SpeechSynthesisUtterance(turn.text);
      const v = turn.who === 'ai' ? aiVoice : userVoice;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      const sameVoice = aiVoice && userVoice === aiVoice;
      u.rate = turn.who === 'ai' ? 1 : 1.04;
      u.pitch = turn.who === 'ai' ? 1.05 : sameVoice ? 0.78 : 1;
      const starts = [];
      let pos = 0;
      turn.text.split(' ').forEach((w) => { starts.push(pos); pos += w.length + 1; });
      let k = -1;
      let begun = false;
      let boundaries = false;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearInterval(pace);
        clearTimeout(watchdog);
        if (result !== 'cancel') revealUpTo(words, words.length - 1);
        resolve(result);
      };
      // If the browser gives no word timings, advance the highlight at speaking pace instead
      const pace = setInterval(() => {
        if (id !== runId) { finish('cancel'); return; }
        if (begun && !boundaries && playing && k < words.length - 2) { k += 1; revealUpTo(words, k); }
      }, turn.who === 'ai' ? 300 : 320);
      const watchdog = setTimeout(() => { if (!begun) { audioBroken = true; synth.cancel(); finish('fallback'); } }, 5000);
      u.onstart = () => { begun = true; };
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        boundaries = true;
        let idx = 0;
        for (let j = 0; j < starts.length; j++) if (e.charIndex >= starts[j]) idx = j;
        k = idx;
        revealUpTo(words, k);
        energy = 1;
      };
      u.onend = () => finish('ok');
      u.onerror = () => finish(id === runId ? 'ok' : 'cancel');
      synth.speak(u);
    });
    const speakTurn = async (turn, words, id, n) => {
      if (soundOn && !audioBroken) {
        let result = 'fallback';
        if (clipsOk === true) result = await playClip(n, words, id);
        if (result === 'fallback' && synth) result = await speakVoice(turn, words, id);
        if (result === 'cancel') throw CANCEL;
        if (result === 'ok') return;
        if (audioBroken) disableSound();
      }
      await paceSilently(turn, words, id);
    };

    /* ----- The call ----- */
    const run = async (id, from) => {
      ended = false;
      liveEl.classList.add('is-live');
      if (from === 0) {
        connected = false;
        stage.classList.remove('is-connected');
        setStatus('Calling…');
        setSpeaker(null, 'Connecting to Fillo…');
        if (soundOn) sfx.ringback();
        await wait(soundOn ? 3300 : 1800, id);
      }
      connected = true;
      stage.classList.add('is-connected');
      setStatus('Connected');
      if (from === 0 && soundOn) sfx.connect();
      if (soundOn) sfx.hiss(true);
      await wait(from === 0 ? 450 : 150, id);

      for (let i = from; i < FD_TURNS.length; i++) {
        turnIdx = i;
        const turn = FD_TURNS[i];
        if (turn.who === 'ai' && i > 0 && FD_TURNS[i - 1].who === 'user') {
          setSpeaker('think', 'Fillo is thinking…');
          latencyEl.textContent = `Response ${380 + Math.round(Math.random() * 240)} ms`;
          await wait(420, id);
        }
        const { row, words } = addMsg(turn);
        curWords = words;
        setSpeaker(turn.who, turn.who === 'ai' ? 'Fillo is speaking' : 'Caller is speaking');
        await speakTurn(turn, words, id, i);
        if (id !== runId) throw CANCEL;
        row.classList.remove('is-current');
        words.forEach((w) => w.classList.remove('is-now'));
        setSeg(i, 1);
        if (turn.intent) setFoot(intentEl, turn.intent);
        if (turn.sentiment) setFoot(sentimentEl, turn.sentiment);
        setSpeaker(null, turn.who === 'ai' ? 'Fillo is listening' : 'Fillo is listening');
        if (turn.action) {
          setSpeaker('think', 'Fillo is checking the calendar…');
          const el = addSys(turn.action.label, false);
          await wait(turn.action.ms, id);
          finishSys(el, turn.action.done);
        }
        if (turn.results) {
          for (const r of turn.results) { await wait(380, id); addSys(r, true); }
        }
        if (turn.outcome) setFoot(outcomeEl, turn.outcome);
        await wait(380, id);
      }

      // Call ends
      connected = false;
      ended = true;
      stage.classList.remove('is-connected');
      liveEl.classList.remove('is-live');
      setStatus('Call ended');
      setSpeaker(null, 'Call ended');
      if (soundOn) { sfx.end(); sfx.hiss(false); }
      const card = document.createElement('div');
      card.className = 'fsummary';
      card.innerHTML = '<strong></strong><p></p><button type="button" class="btn btn--primary btn--sm">Replay the call</button>';
      card.querySelector('strong').textContent = `Call completed · ${clock(seconds)}`;
      card.querySelector('p').textContent = 'Appointment booked for tomorrow at 3:30 PM, with a confirmation text sent to the caller.';
      card.querySelector('button').addEventListener('click', () => restart(true));
      list.appendChild(card);
      scroll();
      if (!soundOn && !reduceMotion) {
        await wait(7000, id); // loop silently, like a looping product video
        restart(false);
      } else setPlaying(false);
    };

    /* ----- Transport ----- */
    const setPlaying = (p) => {
      playing = p;
      root.classList.toggle('is-playing', p);
      toggleBtn.setAttribute('aria-label', p ? 'Pause demo' : 'Play demo');
      if (!soundOn) return;
      if (p) {
        sfx.resume();
        if (synth && synth.paused) synth.resume();
        if (clip.src && clip.paused && !clip.ended && clip.currentTime > 0) clip.play().catch(() => {});
      } else {
        sfx.suspend();
        if (synth && synth.speaking) { if (nativePause) synth.pause(); else synth.cancel(); }
        if (!clip.paused) clip.pause();
      }
    };
    const stopAudio = () => {
      if (synth) { synth.cancel(); if (synth.paused) synth.resume(); }
      clip.pause();
    };
    const resetCallUI = () => {
      list.innerHTML = '';
      setFoot(intentEl, 'Listening…');
      setFoot(outcomeEl, 'In progress');
      setFoot(sentimentEl, '—');
      latencyEl.textContent = 'Response —';
      setSeg(0, 0);
    };
    // Rebuild the transcript up to turn i, then continue the call from there
    function jump(i, fromSeek) {
      runId += 1;
      const id = runId;
      stopAudio();
      started = true;
      stage.classList.add('is-started');
      resetCallUI();
      let est = 0;
      for (let t = 0; t < i; t++) {
        const turn = FD_TURNS[t];
        turnIdx = t;
        const { row, words } = addMsg(turn);
        row.classList.remove('is-current');
        words.forEach((w) => w.classList.add('is-on'));
        est += Math.round(turn.text.split(' ').length * 0.32) + 1;
        if (turn.intent) setFoot(intentEl, turn.intent);
        if (turn.sentiment) setFoot(sentimentEl, turn.sentiment);
        if (turn.action) addSys(turn.action.done, true);
        if (turn.results) turn.results.forEach((r) => addSys(r, true));
        if (turn.outcome) setFoot(outcomeEl, turn.outcome);
      }
      setSeg(i, 0);
      if (fromSeek || i === 0) { seconds = i === 0 ? 0 : est + 2; renderTime(); }
      if (!playing) setPlaying(true);
      run(id, i).catch((err) => { if (err !== CANCEL) console.error(err); });
    }
    function restart(byUser) {
      if (byUser) userPaused = false;
      jump(0, true);
    }
    const start = () => { userPaused = false; jump(0, true); };
    const toggle = () => {
      if (!started) { start(); return; }
      if (ended && !playing) { restart(true); return; }
      userPaused = playing;
      setPlaying(!playing);
    };

    /* ----- Sound on/off (real audio only; disabled if the browser can't play any) ----- */
    function disableSound() {
      soundOn = false;
      soundBtn.disabled = true;
      soundBtn.setAttribute('aria-pressed', 'false');
      soundBtn.setAttribute('aria-label', 'Audio is not available in this browser');
      soundBtn.title = 'Audio is not available in this browser';
      if (soundLabel) soundLabel.textContent = 'No audio';
    }
    const renderSound = () => {
      soundBtn.setAttribute('aria-pressed', String(soundOn));
      soundBtn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
      if (soundLabel) soundLabel.textContent = soundOn ? 'Sound on' : 'Sound off';
    };
    soundBtn.addEventListener('click', () => {
      if (!soundOn) {
        if (!synth && clipsOk !== true) { disableSound(); return; }
        sfx.ensure(); // unlock Web Audio inside the click
        if (synth) { const unlock = new SpeechSynthesisUtterance(' '); unlock.volume = 0; synth.speak(unlock); } // unlock speech on iOS
        soundOn = true;
        audioBroken = false;
        renderSound();
        userPaused = false;
        if (!started || ended) { jump(0, true); return; }
        if (connected) sfx.hiss(true);
        jump(turnIdx, false); // replay the current turn, now with voice
      } else {
        soundOn = false;
        renderSound();
        stopAudio();
        sfx.hiss(false);
        if (started && !ended) jump(turnIdx, false); // continue silently from the current turn
      }
    });

    startBtn.addEventListener('click', start);
    toggleBtn.addEventListener('click', toggle);
    restartBtn.addEventListener('click', () => restart(true));

    // Waveform + orb level (driven by speech activity)
    setInterval(() => {
      if (!playing) return;
      if (speaker === 'ai' || speaker === 'user') {
        if (Math.random() < 0.35) energy = Math.max(energy, 0.45 + Math.random() * 0.55);
      }
      energy *= 0.86;
      const amp = speaker === 'ai' ? energy : speaker === 'user' ? energy * 0.55 : 0;
      stage.style.setProperty('--amp', amp.toFixed(3));
      bars.forEach((b, i) => {
        const edge = Math.abs(i - (BAR_N - 1) / 2) / ((BAR_N - 1) / 2);
        const v = speaker === 'ai' || speaker === 'user' ? Math.max(0.08, energy * (0.35 + 0.65 * Math.random()) * (1 - edge * 0.55)) : 0.08;
        b.style.transform = `scaleY(${v.toFixed(3)})`;
      });
    }, 45);

    // Call timer
    setInterval(() => { if (playing && connected && !ended) { seconds += 1; renderTime(); } }, 1000);

    // Starts silently when on screen (like a muted product video); pauses when scrolled away
    onVisible(stage, (visible) => {
      if (visible) {
        if (reduceMotion || userPaused) return;
        if (!started) start();
        else if (!playing && !ended) setPlaying(true);
      } else if (playing) setPlaying(false);
    }, 0.35);
    document.addEventListener('visibilitychange', () => { if (document.hidden && playing) setPlaying(false); });
    window.addEventListener('pagehide', stopAudio);

    if (!synth && !(window.AudioContext || window.webkitAudioContext)) disableSound();
    renderSound();
    renderTime();
  }

  /* ---------- Product showcase: animate each view when it is shown ---------- */
  function initShowcase() {
    const panels = $$('.fshow__panel');
    if (!panels.length) return;
    $$('.fshow__bars i').forEach((bar, n) => bar.style.setProperty('--n', String(n)));
    let sectionVisible = false;

    const show = (panel) => {
      panel.classList.remove('is-shown');
      void panel.offsetWidth; // restart the CSS transitions
      requestAnimationFrame(() => panel.classList.add('is-shown'));
    };
    const current = () => panels.find((p) => !p.hidden);

    // script.js (initTabs) toggles the [hidden] attribute; react to it
    const mo = new MutationObserver(() => {
      const p = current();
      if (p && sectionVisible) show(p);
    });
    panels.forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ['hidden'] }));

    onVisible($('.fshow'), (visible) => {
      const wasVisible = sectionVisible;
      sectionVisible = visible;
      if (visible && !wasVisible) { const p = current(); if (p) show(p); }
    }, 0.25);

    // Workflow view: steps progress one after another while visible
    const flow = $('[data-fflow]');
    if (!flow) return;
    const steps = $$('.fflow__step', flow);
    const labels = steps.map((s) => $('.fflow__state', s));
    let index = 0;
    const paint = () => {
      steps.forEach((s, k) => {
        s.classList.toggle('is-done', k < index);
        s.classList.toggle('is-active', k === index);
        if (labels[k]) labels[k].textContent = k < index ? 'Done' : k === index ? 'Running' : 'Queued';
      });
    };
    if (reduceMotion) { index = steps.length; paint(); return; }
    paint();
    setInterval(() => {
      if (!sectionVisible || flow.closest('[hidden]') || document.hidden) return;
      index = index >= steps.length ? 0 : index + 1;
      paint();
    }, 1400);
  }

  /* ---------- How it works: interactive call journey ----------
     Four steps on a timeline; the active step's mini interface animates in.
     Auto-advances while visible (pauses on hover/focus and after a manual choice). */
  function initJourney() {
    const root = $('[data-journey]');
    if (!root) return;
    const steps = $$('[data-jstep]', root);
    const panels = $$('[data-jpanel]', root);
    const count = $('[data-jcount]', root);
    const STEP_MS = 6200;
    const last = panels.length - 1;
    let active = 0;
    let elapsed = 0;
    let visible = false;
    let hovering = false;
    let holdUntil = 0;

    // Build the listening waveform and the word-by-word caller sentence
    const wave = $('[data-jwave]', root);
    if (wave) {
      for (let i = 0; i < 40; i++) {
        const bar = document.createElement('i');
        bar.style.setProperty('--i', String(i));
        bar.style.setProperty('--h', String(30 + Math.round(Math.abs(Math.sin(i * 0.5)) * 60 + Math.random() * 10)));
        wave.appendChild(bar);
      }
    }
    const typed = $('[data-jtype]', root);
    if (typed) {
      const words = typed.textContent.trim().split(/\s+/);
      typed.textContent = '';
      words.forEach((w, i) => {
        const span = document.createElement('span');
        span.textContent = w;
        span.style.setProperty('--i', String(i));
        typed.appendChild(span);
        if (i < words.length - 1) typed.appendChild(document.createTextNode(' '));
      });
    }

    const setActive = (i, byUser) => {
      active = (i + panels.length) % panels.length;
      elapsed = 0;
      steps.forEach((s, k) => {
        s.classList.toggle('is-active', k === active);
        s.classList.toggle('is-done', k < active);
        s.setAttribute('aria-pressed', String(k === active));
        s.style.setProperty('--p', '0');
      });
      panels.forEach((p, k) => {
        if (k === active) {
          p.classList.remove('is-active');
          void p.offsetWidth; // replay this step's animations
          p.classList.add('is-active');
          p.removeAttribute('aria-hidden');
        } else {
          p.classList.remove('is-active');
          p.setAttribute('aria-hidden', 'true');
        }
      });
      root.style.setProperty('--jp', (active / last).toFixed(3));
      if (count) count.textContent = String(active + 1).padStart(2, '0');
      if (byUser) holdUntil = performance.now() + 12000; // let the visitor explore before auto-advancing again
    };

    steps.forEach((s, k) => {
      s.addEventListener('click', () => setActive(k, true));
      s.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const next = (k + (e.key === 'ArrowRight' ? 1 : -1) + steps.length) % steps.length;
          setActive(next, true);
          steps[next].focus();
        }
      });
    });
    $('[data-jprev]', root)?.addEventListener('click', () => setActive(active - 1, true));
    $('[data-jnext]', root)?.addEventListener('click', () => setActive(active + 1, true));
    root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
    root.addEventListener('pointerleave', () => { hovering = false; });
    root.addEventListener('focusin', () => { hovering = true; });
    root.addEventListener('focusout', () => { hovering = false; });

    // Auto-advance with a progress ring on the active step and a filling timeline
    setInterval(() => {
      if (reduceMotion || !visible || hovering || document.hidden || performance.now() < holdUntil) return;
      elapsed += 50;
      const p = Math.min(elapsed / STEP_MS, 1);
      steps[active].style.setProperty('--p', p.toFixed(3));
      root.style.setProperty('--jp', Math.min((active + p) / last, 1).toFixed(3));
      if (elapsed >= STEP_MS) setActive(active + 1);
    }, 50);

    let first = true;
    onVisible(root, (v) => {
      visible = v;
      if (v && first) { first = false; setActive(0); } // start the story when it scrolls into view
    }, 0.3);
    setActive(0);
  }

  /* ---------- What Fillo does: Answer · Assist · Convert ----------
     Tabs switch the animated scene (replayed on every switch) and the details;
     a highlight slides to the active tab; the canvas tilts toward the pointer. */
  function initPillars() {
    const root = $('[data-pillars]');
    if (!root) return;
    const tabs = $$('[data-ptab]', root);
    const scenes = $$('[data-pscene]', root);
    const panels = $$('[data-ppanel]', root);
    const indicator = $('.pillars__indicator', root);
    const canvas = $('[data-pcanvas]', root);
    const inner = $('.pcanvas__inner', root);
    let active = 0;

    const placeIndicator = () => {
      const t = tabs[active];
      if (!indicator || !t) return;
      indicator.style.setProperty('--it', `${t.offsetTop}px`);
      indicator.style.setProperty('--il', `${t.offsetLeft}px`);
      indicator.style.setProperty('--iw', `${t.offsetWidth}px`);
      indicator.style.setProperty('--ih', `${t.offsetHeight}px`);
    };
    const replay = (el, on) => {
      el.classList.remove('is-active');
      if (!on) return;
      void el.offsetWidth; // restart this element's entrance animations
      el.classList.add('is-active');
    };
    const show = (i, focus) => {
      active = (i + tabs.length) % tabs.length;
      tabs.forEach((t, k) => {
        t.classList.toggle('is-active', k === active);
        t.setAttribute('aria-pressed', String(k === active));
      });
      scenes.forEach((s, k) => replay(s, k === active));
      panels.forEach((p, k) => { p.hidden = k !== active; replay(p, k === active); });
      placeIndicator();
      if (focus) tabs[active].focus();
    };

    tabs.forEach((t, k) => {
      t.addEventListener('click', () => show(k));
      t.addEventListener('keydown', (e) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        show(k + step, true);
      });
    });

    // Gentle 3D tilt toward the pointer (mouse only)
    if (canvas && inner && !reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      canvas.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        inner.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
        inner.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
      });
      canvas.addEventListener('pointerleave', () => {
        inner.style.setProperty('--ry', '0deg');
        inner.style.setProperty('--rx', '0deg');
      });
    }

    if ('ResizeObserver' in window) new ResizeObserver(placeIndicator).observe(root);
    else window.addEventListener('resize', placeIndicator);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeIndicator);

    // Play the first scene's animation when the section scrolls into view
    let first = true;
    onVisible(root, (v) => { if (v && first) { first = false; show(active); } }, 0.3);
    show(0);
  }

  const init = () => {
    initHeroCounters();
    initHeroFeed();
    initVoiceDemo();
    initJourney();
    initPillars();
    initShowcase();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
