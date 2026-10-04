// Browser helpers shared by every game page (called from Kotlin/Wasm via js("window.axar...")).
(function () {
  const memory = {};
  let ctx = null;
  const buffers = [];
  const voices = new Map();
  const clips = {};
  let nextVoice = 1;

  function audio() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      ctx = C ? new C() : null;
    }
    return ctx;
  }

  // Browsers start audio muted until the first touch, click or key.
  function unlock() {
    const c = audio();
    if (c && c.state !== 'running') c.resume().catch(() => {});
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
  });

  function wasmGcSupported() {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0]));
    } catch (e) {
      return false;
    }
  }

  window.axar = {
    boot(script) {
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
      if (!wasmGcSupported()) {
        const l = document.getElementById('loading');
        l.querySelector('.bar').remove();
        const p = document.createElement('p');
        p.innerHTML = 'This browser is too old for the game. Please update it (iPhone: iOS 18.2 or newer; Android: latest Chrome).<br><br><a href="../">Back to all games</a>';
        l.appendChild(p);
        return;
      }
      const s = document.createElement('script');
      s.src = script;
      document.head.appendChild(s);
    },
    ready() {
      const l = document.getElementById('loading');
      if (!l) return;
      l.style.opacity = '0';
      setTimeout(() => l.remove(), 350);
    },

    get(key) {
      try { return window.localStorage.getItem(key); } catch (e) { return key in memory ? memory[key] : null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (e) { memory[key] = value; }
    },

    soundLoad(b64, rate) {
      const c = audio();
      if (!c) return -1;
      const bin = atob(b64);
      const n = bin.length >> 1;
      const buf = c.createBuffer(1, Math.max(1, n), rate);
      const out = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
        if (v >= 32768) v -= 65536;
        out[i] = v / 32768;
      }
      buffers.push(buf);
      return buffers.length - 1;
    },
    soundPlay(id, volume, rate, loop) {
      const c = audio();
      if (!c || id < 0 || c.state !== 'running') return -1;
      const src = c.createBufferSource();
      src.buffer = buffers[id];
      src.loop = loop;
      src.playbackRate.value = rate;
      const gain = c.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(c.destination);
      const voice = nextVoice++;
      voices.set(voice, src);
      src.onended = () => voices.delete(voice);
      src.start();
      return voice;
    },
    soundForget(id) {
      if (id >= 0) buffers[id] = null;
    },

    // Recorded clips (Tiny Toybox animal sounds): 'loading' until decoded, 'missing' if there is no file.
    clipLoad(key, url) {
      const c = audio();
      if (!c || clips[key]) return;
      clips[key] = 'loading';
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((b) => new Promise((ok, fail) => c.decodeAudioData(b, ok, fail)))
        .then((buf) => { clips[key] = buf; })
        .catch(() => { clips[key] = 'missing'; });
    },
    clipPlay(key) {
      const v = clips[key];
      if (!v || v === 'missing') return false;
      if (v === 'loading') return true;
      const c = audio();
      if (c.state !== 'running') return true;
      const src = c.createBufferSource();
      src.buffer = v;
      src.connect(c.destination);
      src.start();
      return true;
    },

    // The browser's own voice (Web Speech). The toybox words are English.
    speak(text, rate, pitch) {
      const s = window.speechSynthesis;
      if (!s || typeof SpeechSynthesisUtterance === 'undefined') return;
      s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate;
      u.pitch = pitch;
      s.speak(u);
    },

    soundRate(voice, rate) {
      const src = voices.get(voice);
      if (src) src.playbackRate.value = rate;
    },
    soundStop(voice) {
      const src = voices.get(voice);
      if (src) { try { src.stop(); } catch (e) {} voices.delete(voice); }
    },

    vibrate(ms) {
      if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
    },
    copy(text) {
      const fallback = () => {
        const t = document.createElement('textarea');
        t.value = text;
        t.style.position = 'fixed';
        t.style.opacity = '0';
        document.body.appendChild(t);
        t.select();
        try { document.execCommand('copy'); } catch (e) {}
        t.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback); else fallback();
    },
    share(text, onCopied) {
      if (navigator.share) {
        navigator.share({ text }).catch(() => {});
      } else {
        window.axar.copy(text);
        onCopied();
      }
    },
    open(url) {
      window.open(url, '_blank', 'noopener');
    },
    catalog() {
      window.location.href = '../';
    },
    pageUrl() {
      return window.location.origin + window.location.pathname;
    },
    today() {
      return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    },
  };
})();
