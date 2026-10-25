/* Saeed's Archive — the shelf's logic first (test.js runs
   everything above the DOM marker), then small helpers for the page. */
"use strict";

const RAIL_H = 240;               // a typical book's height on the shelf, px
const PX_PER_PAGE = 0.075;        // spine thickness per page: tune if books look too fat or thin
const MIN_SPINE = 16, MAX_SPINE = 92;
const DRIFT = 16;                 // px per second the shelf floats by on its own
const CREAM = "#f7f0e3", INK = "#2a1d14";
const FALLBACK = ["#6b2a2a", "#2f4a63", "#3e5a3c", "#7a4e26", "#5b3a5e", "#2e2a26",
                  "#7d6531", "#6d3b25", "#2d5656", "#4a4a6a", "#8c4a3a", "#55613a"];

const spineWidth = pages => Math.round(Math.min(MAX_SPINE, Math.max(MIN_SPINE, 12 + pages * PX_PER_PAGE)));
const hash = s => { let h = 0; for (const ch of s) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0; return h; };
const lastName = a => (a || "").trim().split(/\s+/).pop();
const byAuthor = (a, b) => lastName(a.author).toLowerCase().localeCompare(lastName(b.author).toLowerCase()) || a.title.localeCompare(b.title);
const count = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
/* A book can have several genres: "Philosophy, Religion", "Mystery & Thriller"
   and "Poetry / Sufism" each mean two, and the book shows under both pills. */
const genresOf = it => (it.genre || "").split(/[,&/;]/).map(g => g.trim()).filter(Boolean).map(g => g[0].toUpperCase() + g.slice(1));
const yearText = y => y == null ? "" : y < 0 ? `${-y} BC` : String(y);
/* Where a book's reading link goes, shown as its site ("drive.google.com");
   "" unless it is a real http(s) address, so javascript: links never render. */
const linkHost = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

/* The shelf runs genre by genre: A–Z by each item's first genre, Unsorted
   last. Within a genre, books stand by author surname, then scrolls follow
   in the order they were written. */
function arrange(items) {
  const map = new Map();
  for (const it of items) {
    const name = genresOf(it)[0] || "Unsorted", key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { key, name, items: [] });
    map.get(key).items.push(it);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => (a.kind === "scroll") - (b.kind === "scroll") || (a.kind === "book" && b.kind === "book" ? byAuthor(a, b) : 0));
  }
  return [...map.values()].sort((a, b) => (a.key === "unsorted") - (b.key === "unsorted") || a.name.localeCompare(b.name));
}

/* Search ignores case and accents ("marquez" finds "Márquez"). Every word
   typed must appear somewhere in the book or scroll, in any order. */
const fold = s => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = q => fold(q).split(/\s+/).filter(Boolean);
const matches = (it, ws) => {
  const hay = fold([it.title, it.author, it.genre, it.remarks, it.text, yearText(it.year)].join("\n"));
  return ws.every(w => hay.includes(w));
};

/* Where the words occur in `text`, as merged [start, end) ranges of the
   original string, so they can be marked without changing what you wrote. */
function hits(text, ws) {
  let folded = "";
  const at = [];                       // at[i] = index in text of folded[i]
  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i)), f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) at.push(i);
    i += ch.length;
  }
  at.push(text.length);
  const found = [];
  for (const w of ws) {
    for (let j = folded.indexOf(w); j >= 0; j = folded.indexOf(w, j + 1)) {
      if (at[j + w.length] > at[j]) found.push([at[j], at[j + w.length]]);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of found) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else merged.push([s, e]);
  }
  return merged;
}

/* Font size and line count for a spine title at shelf scale: one line if it
   fits, two on a wider spine. `room` is the spine length free for it, px. */
function spineFont(title, w, room) {
  const one = room / (title.length * .5);          // ~0.5em per character
  if (one >= 10.5 || w < 30) return [Math.max(9, Math.min(13, w * .32, one)), 1];
  return [Math.max(9, Math.min(12, (w - 12) / 2.3, 2 * one)), 2];
}

/* ---- colour ---- */

const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hexOf = c => "#" + c.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const q = rgbOf(b); return hexOf(rgbOf(a).map((x, i) => x + (q[i] - x) * t)); };
const lum = h => {
  const [r, g, b] = rgbOf(h).map(x => (x /= 255) <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

/* A spine's lighting runs from 12% lighter to 30% darker than its colour, and
   its lettering has to read across all of it (4.5:1). */
const worst = (bg, ink) => Math.min(contrast(mix(bg, "#ffffff", .12), ink), contrast(mix(bg, "#000000", .3), ink));
const inkFor = bg => worst(bg, CREAM) >= worst(bg, INK) ? CREAM : INK;
function settle(bg) {
  for (let i = 0; i < 40 && worst(bg, inkFor(bg)) < 4.5; i++) bg = mix(bg, inkFor(bg) === CREAM ? "#000000" : "#ffffff", .06);
  return bg;
}

/* ---- text formatting ----
   Remarks and scrolls are plain text with a few marks: **bold**,
   _italic_, "## " heading, "- " bullets, "1. " numbers, "> " quotes. */

/* Text → blocks: { type: p | h | ul | ol | quote, lines }. A blank line
   ends a block; neighbouring lines of the same kind join it. */
function blocks(text) {
  const out = [];
  let gap = true;
  for (const line of text.split("\n")) {
    if (!line.trim()) { gap = true; continue; }
    let type = "p", body = line, m;
    if ((m = /^## (.*)/.exec(line))) [type, body] = ["h", m[1]];
    else if ((m = /^[-*] (.*)/.exec(line))) [type, body] = ["ul", m[1]];
    else if ((m = /^\d+\. (.*)/.exec(line))) [type, body] = ["ol", m[1]];
    else if ((m = /^> ?(.*)/.exec(line))) [type, body] = ["quote", m[1]];
    const last = out[out.length - 1];
    if (last && !gap && last.type === type && type !== "h") last.lines.push(body);
    else out.push({ type, lines: [body] });
    gap = false;
  }
  return out;
}

/* A line → spans of plain (""), bold ("b") and italic ("i") text. */
function spans(line) {
  const out = [], re = /\*\*(.+?)\*\*|(?<![\p{L}\p{N}])_(.+?)_(?![\p{L}\p{N}])/gu;
  let from = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > from) out.push({ t: "", text: line.slice(from, m.index) });
    out.push(m[1] != null ? { t: "b", text: m[1] } : { t: "i", text: m[2] });
    from = re.lastIndex;
  }
  if (from < line.length) out.push({ t: "", text: line.slice(from) });
  return out;
}

const plain = text => blocks(text).map(b => b.lines.map(l => spans(l).map(s => s.text).join("")).join(" ")).join(" ");

/* ---- DOM ---- */

const $ = id => document.getElementById(id);
const calm = matchMedia("(prefers-reduced-motion: reduce)");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function icon(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#" + id);
  svg.append(use);
  return svg;
}
function iconBtn(id, label, cls = "icon-btn") {
  const b = el("button", cls);
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(icon(id));
  return b;
}

/* Text with the searched-for words marked. Built from text nodes, never HTML. */
function markInto(e, text, ws) {
  let from = 0;
  for (const [s, t] of hits(text, ws)) {
    e.append(text.slice(from, s), el("mark", "", text.slice(s, t)));
    from = t;
  }
  e.append(text.slice(from));
  return e;
}


const day = iso => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });   // 23 Oct 2026
