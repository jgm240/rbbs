// The rBBS web terminal: a local demo (hostbbs in a Web Worker) or a live server over a WebSocket.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { return localStorage.getItem("rbbs." + k) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("rbbs." + k, v); } catch (e) { /* private window */ } },
  };

  // ---- terminal ------------------------------------------------------------------------------
  const VGA = { background: "#000000", foreground: "#aaaaaa", cursor: "#aaaaaa", cursorAccent: "#000000", selectionBackground: "#555555",
    black: "#000000", red: "#aa0000", green: "#00aa00", yellow: "#aa5500", blue: "#0000aa", magenta: "#aa00aa", cyan: "#00aaaa", white: "#aaaaaa",
    brightBlack: "#555555", brightRed: "#ff5555", brightGreen: "#55ff55", brightYellow: "#ffff55", brightBlue: "#5555ff",
    brightMagenta: "#ff55ff", brightCyan: "#55ffff", brightWhite: "#ffffff" };
  const COLS = 80, ROWS = 25;
  const term = new Terminal({ cols: COLS, rows: ROWS, theme: VGA, cursorBlink: true, scrollback: 500,
    fontFamily: '"Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace', fontSize: 14, allowProposedApi: false });
  term.open($("#term"));
  function fit() {
    const w = $("#screen").clientWidth - 24;
    const fs = Math.max(6, Math.min(18, Math.floor(w / (COLS * 0.602))));
    if (term.options.fontSize !== fs) term.options.fontSize = fs;
  }
  window.addEventListener("resize", fit);
  fit();

  // ---- sound: the bell and ANSI music -----------------------------------------------------------------
  let audio = null;
  function ensureAudio() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } }
    if (audio && audio.state === "suspended") audio.resume();
  }
  function tone(freq, start, dur, type = "square", gain = 0.05) {
    if (!audio) return;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(audio.destination); o.start(start); o.stop(start + dur + 0.02);
  }
  term.onBell(() => { if (audio) tone(880, audio.currentTime, 0.15, "square", 0.04); });
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function playMusic(src) {                           // BASIC PLAY strings: T O L < > A-G + - # . N P R
    if (!audio || !$("#music").checked) return;
    const s = src.toUpperCase().replace(/\s+/g, "");
    let i = 0, tempo = 120, oct = 4, len = 4, t = audio.currentTime + 0.05;
    const num = () => { let n = ""; while (i < s.length && s[i] >= "0" && s[i] <= "9") n += s[i++]; return n ? parseInt(n, 10) : 0; };
    const dots = () => { let d = 1, add = 0.5; while (s[i] === ".") { d += add; add /= 2; i++; } return d; };
    const secs = (l, d) => (60 / tempo) * (4 / l) * d;
    while (i < s.length) {
      const c = s[i++];
      if (c === "T") tempo = Math.max(32, Math.min(255, num() || 120));
      else if (c === "O") oct = Math.max(0, Math.min(6, num()));
      else if (c === "L") len = num() || 4;
      else if (c === "<") oct = Math.max(0, oct - 1);
      else if (c === ">") oct = Math.min(6, oct + 1);
      else if (c === "M") i++;
      else if (c === "P" || c === "R") { const l = num() || len; t += secs(l, dots()); }
      else if (c === "N") { const n = num(), d = dots(); if (n > 0) tone(440 * Math.pow(2, (n + 11 - 69) / 12), t, secs(len, d) * 0.9); t += secs(len, d); }
      else if (SEMI[c] !== undefined) {
        let semi = SEMI[c];
        while (s[i] === "+" || s[i] === "#" || s[i] === "-") semi += s[i++] === "-" ? -1 : 1;
        const l = num() || len, d = dots();
        tone(440 * Math.pow(2, (12 * (oct + 1) + semi - 69) / 12), t, secs(l, d) * 0.9);
        t += secs(l, d);
      }
    }
  }

  // ---- telnet-in-a-WebSocket plumbing ----------------------------------------------------------------------
  const IAC = 255;
  let iac = 0, utf8 = new TextDecoder("utf-8"), held = "";
  function resetStream() { iac = 0; utf8 = new TextDecoder("utf-8"); held = ""; }
  function stripIac(buf) {                            // remove telnet negotiation, keep the text
    const out = [];
    for (const b of buf) {
      switch (iac) {
        case 0: if (b === IAC) iac = 1; else out.push(b); break;
        case 1: if (b === IAC) { out.push(b); iac = 0; } else if (b >= 251 && b <= 254) iac = 2; else if (b === 250) iac = 3; else iac = 0; break;
        case 2: iac = 0; break;
        case 3: if (b === IAC) iac = 4; break;
        case 4: iac = b === 240 ? 0 : 3; break;
      }
    }
    return Uint8Array.from(out);
  }
  function onBytes(u8) {
    held += utf8.decode(stripIac(u8), { stream: true });
    let out = "";
    for (;;) {                                        // ESC [ M ... Ctrl-N is ANSI music: play it, do not print it
      const i = held.indexOf("\x1b[M");
      if (i < 0) {
        const keep = held.endsWith("\x1b[") ? 2 : held.endsWith("\x1b") ? 1 : 0;
        out += held.slice(0, held.length - keep); held = held.slice(held.length - keep); break;
      }
      const j = held.indexOf("\x0e", i);
      if (j < 0) { out += held.slice(0, i); held = held.slice(i); break; }
      out += held.slice(0, i); playMusic(held.slice(i + 3, j)); held = held.slice(j + 1);
    }
    if (out) term.write(out);
  }
  const NEGOTIATE = Uint8Array.from([255, 253, 1, 255, 253, 3, 255, 251, 31, 255, 250, 31, 0, COLS, 0, ROWS, 255, 240]);

  // ---- transports ------------------------------------------------------------------------------------------------
  let mode = "local", worker = null, workerReady = false, readyWaiters = [], ws = null, online = false;
  const enc = new TextEncoder();
  const latin1 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return s; };
  function send(u8) {
    if (!online) return;
    if (mode === "local") worker.postMessage({ t: "in", d: latin1(u8) });
    else if (ws && ws.readyState === 1) ws.send(u8);
  }
  term.onData((d) => send(enc.encode(d)));
  window.rbbs = { term, send, onBytes: (u) => onBytes(u), get online() { return online; } };   // (for debugging in the console)

  function setStatus(msg, kind) { const el = $("#status"); el.textContent = msg; el.dataset.kind = kind || ""; }
  function setOnline(v) {
    online = v;
    $("#dial").hidden = v; $("#hangup").hidden = !v;
    $("#dial").disabled = false;
    $("#options").classList.toggle("disabled", v);
  }
  function hangup(text) {
    if (ws) { try { ws.close(); } catch (e) { /* closed already */ } ws = null; }
    if (online) term.write("\r\n\x1b[0;37m[" + (text || "Connection closed") + "]\x1b[0m\r\n");
    setOnline(false);
    setStatus(text || "Not connected", "");
  }

  function startWorker() {
    if (worker) return;
    worker = new Worker("worker.js");
    worker.onmessage = (e) => {
      const { t, d } = e.data;
      if (t === "status") setStatus(d, "busy");
      else if (t === "ready") { workerReady = true; readyWaiters.splice(0).forEach((f) => f()); }
      else if (t === "out") onBytes(Uint8Array.from(d, (c) => c.charCodeAt(0)));
      else if (t === "closed") { if (mode === "local" && online) hangup("The BBS hung up"); }
      else if (t === "reset-done") location.reload();
      else if (t === "error") { setStatus("Error: " + d, "error"); if (online) hangup("Error: " + d); }
    };
    worker.onerror = (e) => setStatus("The demo could not start: " + (e.message || "worker error"), "error");
    worker.postMessage({ t: "init", base: new URL(".", location.href).href, tz: -new Date().getTimezoneOffset() });
  }

  async function dialLocal() {
    startWorker();
    if (!workerReady) await new Promise((r) => readyWaiters.push(r));
    resetStream(); term.reset(); fit();
    setOnline(true); setStatus("Connected to the demo BBS (running in your browser)", "ok");
    worker.postMessage({ t: "connect", opts: { baud: +$("#baud").value, music: $("#music").checked } });
    send(NEGOTIATE);
    term.focus();
  }

  function dialLive() {
    const url = $("#server").value.trim();
    if (!/^wss?:\/\//i.test(url)) { setStatus("Enter a server address starting with wss:// (or ws://localhost for a local test)", "error"); $("#dial").disabled = false; return; }
    store.set("server", url);
    resetStream(); term.reset(); fit();
    setStatus("Connecting to " + url + "...", "busy");
    try { ws = new WebSocket(url); } catch (e) { setStatus("Cannot open that address: " + e.message, "error"); $("#dial").disabled = false; return; }
    ws.binaryType = "arraybuffer";
    ws.onopen = () => { setOnline(true); setStatus("Connected to " + url, "ok"); ws.send(NEGOTIATE); term.focus(); };
    ws.onmessage = (e) => onBytes(new Uint8Array(e.data));
    ws.onerror = () => { if (!online) { setStatus("Could not connect to " + url + ". Is the server's web terminal on, and is the address wss:// with a valid certificate?", "error"); $("#dial").disabled = false; } };
    ws.onclose = () => { if (online) hangup("The server hung up"); };
  }

  $("#dial").addEventListener("click", () => {
    ensureAudio();
    store.set("baud", $("#baud").value); store.set("music", $("#music").checked ? "1" : "0");
    $("#dial").disabled = true;
    if (mode === "local") dialLocal().catch((e) => { setStatus("Error: " + e, "error"); $("#dial").disabled = false; });
    else dialLive();
  });
  $("#hangup").addEventListener("click", () => hangup("You hung up"));
  $("#reset").addEventListener("click", () => {
    if (!confirm("Delete the demo BBS data stored in this browser (your account, posts, scores)?")) return;
    startWorker();
    const go = () => worker.postMessage({ t: "reset" });
    if (workerReady) go(); else readyWaiters.push(go);
  });
  for (const r of document.querySelectorAll('input[name="mode"]')) {
    r.addEventListener("change", () => {
      mode = r.value; store.set("mode", mode);
      $("#local-opts").hidden = mode !== "local"; $("#live-opts").hidden = mode !== "live";
      setStatus(mode === "local" ? "Not connected" : "Enter a server address", "");
    });
  }
  $("#baud").value = store.get("baud", "0");
  $("#music").checked = store.get("music", "0") === "1";
  $("#server").value = store.get("server", "");
  const q = new URLSearchParams(location.search);
  if (q.get("server")) { $("#server").value = q.get("server"); document.querySelector('input[name="mode"][value="live"]').click(); }
  else if (store.get("mode", "local") === "live") document.querySelector('input[name="mode"][value="live"]').click();
  term.focus = term.focus.bind(term);
  $("#term").addEventListener("click", () => term.focus());

  // ---- art gallery: the connect screens, rendered from the same .ans files the BBS shows -----------------------------------
  fetch("art/gallery.json").then((r) => r.json()).then((items) => {
    const box = $("#gallery");
    items.forEach((it) => {
      const fig = document.createElement("figure");
      fig.innerHTML = '<pre class="ans" aria-label="' + it.name + '">' + it.html + "</pre><figcaption>" + it.name + "</figcaption>";
      box.appendChild(fig);
    });
  }).catch(() => { $("#gallery-section").hidden = true; });
})();
