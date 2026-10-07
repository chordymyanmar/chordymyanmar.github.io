const API = "api.json";
const LYRICS = (f) => "lyrics/" + encodeURIComponent(f);

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadSongs() {
  const res = await fetch(API);
  if (!res.ok) throw new Error("api.json " + res.status);
  return (await res.json()).songs || [];
}

function fileOf(s) {
  const f = s.file ? String(s.file).trim() : String(s.id);
  return f.endsWith(".cho") ? f : f + ".cho";
}

async function initList() {
  const list = $("list");
  let songs;
  try {
    songs = await loadSongs();
  } catch (e) {
    list.innerHTML = '<div class="msg">Data ကို မဖတ်နိုင်ပါ။</div>';
    return;
  }

  const nameOf = (s) => s.singer_mm || s.singer_en;
  const counts = {};
  songs.forEach((s) => nameOf(s) && (counts[nameOf(s)] = (counts[nameOf(s)] || 0) + 1));
  const singers = Object.keys(counts).sort((x, y) => counts[y] - counts[x] || x.localeCompare(y));
  let singer = "";
  const chips = $("singers");
  const drawChips = () => {
    chips.innerHTML =
      `<button class="chip${singer === "" ? " on" : ""}" data-s="">အားလုံး</button>` +
      singers
        .map((n) => `<button class="chip${singer === n ? " on" : ""}" data-s="${esc(n)}">${esc(n)} <i>${counts[n]}</i></button>`)
        .join("");
  };
  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    singer = b.dataset.s;
    drawChips();
    render();
  });

  const render = () => {
    const q = $("q").value.trim().toLowerCase();
    const rows = songs.filter((s) => {
      if (singer && nameOf(s) !== singer) return false;
      if (!q) return true;
      return [s.song_mm, s.song_en, s.singer_mm, s.singer_en].some((v) => (v || "").toLowerCase().includes(q));
    });
    $("count").textContent = rows.length + " songs";
    list.innerHTML = rows.length
      ? rows
          .map(
            (s) => `<a class="song" href="song.html?id=${encodeURIComponent(s.id)}">
              <div class="t">${esc(s.song_mm || s.song_en)}</div>
              <div class="s">${esc(s.singer_mm || s.singer_en)}</div>
            </a>`
          )
          .join("")
      : '<div class="msg">မတွေ့ပါ။</div>';
  };

  $("q").addEventListener("input", render);
  drawChips();
  render();
}

function parseCho(text) {
  const meta = {};
  const out = [];
  let chorus = false;
  const push = (x) => out.push({ ...x, ch: chorus });
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const d = line.trim().match(/^\{\s*(\w+)\s*(?:[:\s]\s*(.*?))?\s*\}$/);
    if (d) {
      const k = d[1].toLowerCase();
      const v = d[2] || "";
      if (k === "comment" || k === "c") push({ t: "section", v });
      else if (k === "start_of_chorus" || k === "soc") chorus = true;
      else if (k === "end_of_chorus" || k === "eoc") chorus = false;
      else meta[k] = v;
      continue;
    }
    if (!line.trim()) {
      const prev = out[out.length - 1];
      if (prev && prev.t !== "gap" && prev.t !== "section") push({ t: "gap" });
    } else if (line.trim().startsWith("|")) {
      push({ t: "bars", v: line.trim() });
    } else {
      const segs = [];
      let cur = { c: "", l: "" };
      let last = 0;
      for (const m of line.matchAll(/\[([^\]]+)\]/g)) {
        cur.l = line.slice(last, m.index);
        if (cur.c || cur.l) segs.push(cur);
        cur = { c: m[1], l: "" };
        last = m.index + m[0].length;
      }
      cur.l = line.slice(last);
      if (cur.c || cur.l) segs.push(cur);
      push({ t: "line", v: segs });
    }
  }
  return { meta, out };
}

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function shiftNote(n, acc, shift, pref) {
  if (shift === 0 && !pref) return n + acc;
  const i = (((NOTE[n] + (acc === "#" ? 1 : acc === "b" ? -1 : 0) + shift) % 12) + 12) % 12;
  return (pref === "flat" ? FLAT : SHARP)[i];
}

function tChord(ch, st) {
  const m = ch.match(/^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/);
  if (!m) return ch;
  let r = shiftNote(m[1], m[2], st.shift, st.acc) + m[3];
  if (m[4]) r += "/" + shiftNote(m[4], m[5], st.shift, st.acc);
  return r;
}

function renderCho({ out }, st) {
  let html = "";
  let open = false;
  for (const x of out) {
    if (x.ch !== open) {
      html += x.ch ? '<div class="chorus">' : "</div>";
      open = x.ch;
    }
    if (x.t === "gap") html += '<div class="gap"></div>';
    else if (x.t === "section") html += `<div class="section">${esc(x.v)}</div>`;
    else if (x.t === "bars") {
      const v = x.v.replace(/\[([^\]]+)\]/g, (_, c) => tChord(c, st)).replace(/_/g, " ").replace(/\s+/g, " ").trim();
      html += `<div class="bars">${esc(v)}</div>`;
    } else {
      html +=
        '<div class="line">' +
        x.v.map((s) => `<span class="seg"><span class="c">${esc(s.c ? tChord(s.c, st) : "")}</span><span class="l">${esc(s.l)}</span></span>`).join("") +
        "</div>";
    }
  }
  return html + (open ? "</div>" : "");
}

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

async function initSong() {
  const box = $("song");
  const id = new URLSearchParams(location.search).get("id");
  try {
    const songs = await loadSongs();
    const s = songs.find((x) => String(x.id) === id);
    if (!s) throw new Error("not found");
    const res = await fetch(LYRICS(fileOf(s)));
    if (!res.ok) throw new Error("lyrics " + res.status);
    const cho = parseCho(await res.text());
    const title = s.song_mm || s.song_en;
    document.title = title + " – Chordy Myanmar";

    const st = {
      shift: 0,
      acc: null,
      fs: LS.get("fs", 1.1),
      chords: LS.get("chords", true),
      speed: LS.get("speed", 4),
    };

    box.innerHTML =
      `<h1>${esc(title)}</h1>` +
      `<div class="meta">${esc(s.singer_mm || s.singer_en)}<span id="keyline"></span></div>` +
      (s.youtube_url ? `<a class="yt" href="${esc(s.youtube_url)}" target="_blank" rel="noopener">YouTube</a>` : "") +
      `<div class="tools">
        <div class="grp"><button data-a="fs-">A−</button><button data-a="fs+">A+</button></div>
        <div class="grp"><button data-a="k-">−</button><span class="val" id="kval"></span><button data-a="k+">+</button><button data-a="k0">Reset</button></div>
        <div class="grp"><button data-a="acc" id="accb">♯ / ♭</button><button data-a="chords" id="chb">Chords</button></div>
        <div class="grp"><button data-a="scroll" id="scb">▶ Scroll</button><input id="spd" type="range" min="1" max="10" aria-label="Scroll speed"></div>
      </div>` +
      `<div id="lyrics"></div>`;

    const lyr = $("lyrics");
    const draw = () => {
      lyr.style.fontSize = st.fs + "rem";
      lyr.classList.toggle("nochords", !st.chords);
      lyr.innerHTML = renderCho(cho, st);
      $("chb").classList.toggle("on", st.chords);
      $("accb").textContent = st.acc === "flat" ? "♭" : st.acc === "sharp" ? "♯" : "♯ / ♭";
      $("accb").classList.toggle("on", !!st.acc);
      const key = cho.meta.key ? tChord(cho.meta.key, st) : "";
      $("keyline").innerHTML =
        (key ? ` · Key <b>${esc(key)}</b>` : "") +
        (cho.meta.capo ? ` · Capo <b>${esc(cho.meta.capo)}</b>` : "") +
        (cho.meta.composer ? ` · ${esc(cho.meta.composer)}` : "");
      $("kval").textContent = (st.shift > 0 ? "+" : "") + st.shift;
    };

    let timer = null;
    let held = false;
    let pausedUntil = 0;
    const stop = () => {
      if (timer) cancelAnimationFrame(timer);
      timer = null;
      $("scb").textContent = "▶ Scroll";
      $("scb").classList.remove("on");
    };
    const start = () => {
      let last = performance.now(), acc = 0;
      $("scb").textContent = "⏸ Stop";
      $("scb").classList.add("on");
      const step = (now) => {
        const dt = now - last;
        last = now;
        if (held || now < pausedUntil) return void (timer = requestAnimationFrame(step));
        acc += (dt / 1000) * st.speed * 12;
        const px = Math.floor(acc);
        if (px) { window.scrollBy(0, px); acc -= px; }
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) return stop();
        timer = requestAnimationFrame(step);
      };
      timer = requestAnimationFrame(step);
    };

    $("spd").value = st.speed;
    $("spd").addEventListener("input", (e) => { st.speed = +e.target.value; LS.set("speed", st.speed); });
    // Manual scrolling pauses auto-scroll briefly instead of turning it off.
    window.addEventListener("wheel", () => (pausedUntil = performance.now() + 800), { passive: true });
    window.addEventListener("touchstart", () => (held = true), { passive: true });
    ["touchend", "touchcancel"].forEach((ev) =>
      window.addEventListener(ev, () => { held = false; pausedUntil = performance.now() + 800; }, { passive: true })
    );

    box.querySelector(".tools").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "fs-") st.fs = Math.max(0.8, +(st.fs - 0.1).toFixed(2));
      else if (a === "fs+") st.fs = Math.min(2.2, +(st.fs + 0.1).toFixed(2));
      else if (a === "k-") st.shift = Math.max(st.shift - 1, -11);
      else if (a === "k+") st.shift = Math.min(st.shift + 1, 11);
      else if (a === "k0") { st.shift = 0; st.acc = null; }
      else if (a === "acc") st.acc = st.acc === "sharp" ? "flat" : st.acc === "flat" ? null : "sharp";
      else if (a === "chords") st.chords = !st.chords;
      else if (a === "scroll") return timer ? stop() : start();
      LS.set("fs", st.fs);
      LS.set("chords", st.chords);
      draw();
    });
    draw();
  } catch (e) {
    box.innerHTML = '<div class="msg">သီချင်းကို မဖတ်နိုင်ပါ။</div>';
  }
}
