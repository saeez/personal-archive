/* Saeed's Archive — the home page: one endless shelf. Books are 3D boxes with
   their real cover and a spine coloured from it; writings stand among them as
   scrolls. */
"use strict";

const rail = $("rail"), track = $("track"), card = $("card"), search = $("q"), chips = $("chips");
const shelves = document.querySelector("main"), reading = $("reading"), readingTrack = $("reading-track");
const detail = $("detail");
const GAP = 6;                    // space after each thing on the shelf, px (matches .slot margin)

let items = [];
let genre = "";                  // the genre chosen above the shelf, lower-case; "" for all
let looping = false, offset = 0, glide = 0, vel = 0, idleUntil = 0, lastT = 0;
let hoverSlot = null, cardFor = null, follow = null, drag = null, swallowClick = false;
let detailSlot = null, closing = false;

const byId = id => items.find(i => i.id === id);

const marked = (tag, cls, text) => markInto(el(tag, cls), text, words(search.value));

/* Formatted text (remarks, scrolls) as real elements: headings, lists, quotes, bold, italic. */
function rich(cls, text, ws = words(search.value)) {
  const box = el("div", "rich " + cls);
  const inline = (parent, line) => {
    for (const s of spans(line)) {
      if (!s.t) { markInto(parent, s.text, ws); continue; }
      parent.append(markInto(el(s.t === "b" ? "strong" : "em"), s.text, ws));
    }
  };
  for (const b of blocks(text)) {
    if (b.type === "ul" || b.type === "ol") {
      const list = el(b.type);
      for (const l of b.lines) { const li = el("li"); inline(li, l); list.append(li); }
      box.append(list);
      continue;
    }
    const e = el(b.type === "h" ? "h4" : b.type === "quote" ? "blockquote" : "p");
    b.lines.forEach((l, i) => { if (i) e.append(el("br")); inline(e, l); });
    box.append(e);
  }
  return box;
}

function stars(n) {
  const s = el("p", "stars", "★".repeat(n) + "☆".repeat(5 - n));
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", `${n} of 5 stars`);
  return s;
}

/* ---- books, scrolls and the shelf ---- */

/* A book as a 3D box H px tall: cover, back, spine, page edges. The spine
   faces you on the shelf; the cover faces you when it is taken down. */
function bookBox(it, H) {
  const k = H / RAIL_H, W = Math.round(H * .66), T = Math.round(spineWidth(it.pages) * k);
  const bg = it.color || settle(FALLBACK[hash(it.title + "|" + it.author) % FALLBACK.length]);
  const box = el("div", "box");
  for (const [name, v] of [["--bh", H], ["--bw", W], ["--bt", T]]) box.style.setProperty(name, v + "px");
  box.style.setProperty("--spine", bg);
  box.style.setProperty("--spine-ink", inkFor(bg));

  const cover = el("div", "face cover");
  if (it.cover) cover.style.backgroundImage = `url("${it.cover}")`;
  else cover.append(el("span", "cover-title", it.title), el("span", "cover-author", it.author || ""));

  const spine = el("div", "face spine");
  const author = it.author && T >= 34 * k;
  const [fs, lines] = spineFont(it.title, T / k, RAIL_H - 56 - (author ? 50 : 0));
  spine.style.setProperty("--fs", fs * k + "px");
  spine.dataset.lines = lines;
  spine.append(el("span", "spine-title", it.title));
  if (author) spine.append(el("span", "spine-author", lastName(it.author)));

  box.append(cover, el("div", "face back"), spine, el("div", "face fore"), el("div", "face top"), el("div", "face bottom"));
  box.dims = { W, H, T };
  return box;
}

function slot(it, k = 1) {
  const b = el("button", `slot item ${it.kind}`);
  b.type = "button";
  b.dataset.id = it.id;
  if (it.kind === "book") {
    const box = bookBox(it, Math.round(k * (212 + (hash(it.title + "|" + it.author) >>> 4) % 46)));
    for (const name of ["--bh", "--bw", "--bt"]) b.style.setProperty(name, box.style.getPropertyValue(name));
    b.setAttribute("aria-label", `${it.title}${it.author ? " by " + it.author : ""}`);
    b.append(box);
  } else {
    b.style.setProperty("--rh", 184 + hash(it.id) % 36 + "px");
    b.setAttribute("aria-label", `Scroll: ${it.title}`);
    const roll = el("span", "roll");
    roll.append(el("span", "roll-title", it.title));
    b.append(roll);
  }
  return b;
}

/* One pill per genre above the shelf, "All" first. */
function fillGenres() {
  const names = new Map();
  for (const it of items) for (const g of genresOf(it)) if (!names.has(g.toLowerCase())) names.set(g.toLowerCase(), g);
  const sorted = [...names].sort((a, b) => a[1].localeCompare(b[1]));
  if (!names.has(genre)) genre = "";
  chips.replaceChildren(...[["", "All"], ...sorted].map(([key, name]) => {
    const b = el("button", "chip", name);
    b.type = "button";
    b.dataset.genre = key;
    b.setAttribute("aria-pressed", String(key === genre));
    return b;
  }));
}

function render() {
  fillGenres();
  const ws = words(search.value), g = genre;
  const fits = it => matches(it, ws) && (!g || genresOf(it).some(x => x.toLowerCase() === g));
  const out = [], shelf = items.filter(it => !it.reading);
  let shown = 0;
  for (const grp of arrange(shelf)) {
    const list = grp.items.filter(fits);
    if (!list.length) continue;
    out.push(...list.map(it => slot(it)));
    shown += list.length;
  }
  if (!shown) out.push(el("p", "label empty-shelf", shelf.length ? "Nothing on the shelf matches your search." : "The shelf is empty."));
  track.replaceChildren(...out);
  // books being read stand below the shelf, face out
  const now = items.filter(it => it.reading && fits(it));
  readingTrack.replaceChildren(...now.map(it => slot(it, .8)));
  reading.hidden = !now.length;
  shown += now.length;
  offset = glide = 0;
  hideCard();
  layout();

  const books = items.filter(i => i.kind === "book");
  $("stats").textContent = !items.length ? "An empty shelf"
    : ws.length || g ? `${shown} of ${items.length} found`
    : [count(books.length, "book"), items.length > books.length && count(items.length - books.length, "scroll"),
       count(books.reduce((n, b) => n + b.pages, 0), "page")].filter(Boolean).join(" · ");
}

/* The shelf loops endlessly: whatever drifts off one end is moved to the
   other, and copies keep it full on wide screens. Only a very small shelf
   (fewer than 8 things, narrower than the screen) stands still instead of
   repeating the same few books. */
function layout() {
  for (const c of track.querySelectorAll(".clone")) c.remove();
  const real = [...track.children], width = track.scrollWidth;
  looping = real.length > 1 && (real.length >= 8 || width > rail.clientWidth);
  rail.classList.toggle("looping", looping);
  if (!looping) { offset = glide = 0; track.style.transform = ""; return; }
  for (let n = Math.ceil((rail.clientWidth + 600) / width); n > 0; n--) {
    for (const r of real) {
      const c = r.cloneNode(true);
      c.classList.add("clone");
      c.setAttribute("aria-hidden", "true");
      c.tabIndex = -1;
      track.append(c);
    }
  }
}

const span = e => e.offsetWidth + GAP;
function normalize() {
  for (let first = track.firstElementChild; offset > span(first); first = track.firstElementChild) {
    offset -= span(first);
    track.append(first);
  }
  while (offset < 0) {
    const last = track.lastElementChild;
    track.prepend(last);
    offset += span(last);
  }
}

/* Every frame: drift when nobody is looking at anything, ease to a stop
   when they are, and glide smoothly wherever wheel, keys or focus send it. */
function tick(t) {
  const dt = Math.min(.05, (t - lastT) / 1000 || 0);
  lastT = t;
  if (looping && !drag) {
    const still = calm.matches || hoverSlot || document.querySelector("dialog[open]") || follow || t < idleUntil;
    vel += ((still ? 0 : DRIFT) - vel) * (1 - Math.exp(-dt * 1.4));
    if (follow) glide = follow.offsetLeft + follow.offsetWidth / 2 - rail.clientWidth / 2 - offset;
    const g = glide * (1 - Math.exp(-dt * (calm.matches ? 60 : 3.5)));
    glide -= g;
    offset += vel * dt + g;
    normalize();
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  }
  if (cardFor) placeCard();
  requestAnimationFrame(tick);
}

rail.addEventListener("wheel", e => {
  if (!looping) return;
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  glide += d * (e.deltaMode === 1 ? 30 : 1);
  follow = null;
  idleUntil = performance.now() + 2500;
}, { passive: false });

rail.addEventListener("pointerdown", e => {
  swallowClick = false;
  if (looping && e.button === 0) drag = { id: e.pointerId, last: e.clientX, moved: 0, v: 0 };
});
addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.last;
  drag.last = e.clientX;
  drag.moved += Math.abs(dx);
  drag.v = dx;
  offset -= dx;
  normalize();
  track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  if (drag.moved > 6) { rail.classList.add("dragging"); hoverSlot = null; hideCard(); }
});
const endDrag = () => {
  if (!drag) return;
  if (drag.moved > 6) { swallowClick = true; glide -= drag.v * 12; }
  drag = null;
  follow = null;
  rail.classList.remove("dragging");
  idleUntil = performance.now() + 2500;
};
addEventListener("pointerup", endDrag);
addEventListener("pointercancel", endDrag);
rail.addEventListener("click", e => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);

rail.addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const list = [...track.querySelectorAll(".item:not(.clone)")], i = list.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  list[(i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length].focus({ preventScroll: true });
});
shelves.addEventListener("focusin", e => {
  const s = e.target.closest(".item");
  if (!s) return;
  if (rail.contains(s)) follow = s;
  if (s.matches(":focus-visible")) showCard(s);
});
shelves.addEventListener("focusout", () => { follow = null; if (!hoverSlot) hideCard(); });
rail.addEventListener("scroll", () => { rail.scrollLeft = 0; });   // focus must not scroll the clipped shelf

shelves.addEventListener("pointerover", e => {
  if (e.pointerType !== "mouse" || drag?.moved > 6) return;
  const s = e.target.closest(".item");
  if (s && s !== hoverSlot) { hoverSlot = s; showCard(s); }
});
shelves.addEventListener("pointerout", e => {
  const s = e.target.closest(".item");
  if (s && !s.contains(e.relatedTarget)) { hoverSlot = null; hideCard(); }
});
shelves.addEventListener("click", e => {
  const s = e.target.closest(".item");
  if (s) (s.classList.contains("book") ? openBook : openScroll)(s);
});

/* ---- the floating card ---- */

function showCard(s) {
  const it = byId(s.dataset.id);
  if (!it) return;
  cardFor = s;
  const facts = it.kind === "book"
    ? [yearText(it.year), it.pages && `${it.pages.toLocaleString()} pp`]
    : [it.year ? yearText(it.year) : "", "written " + day(it.added), it.text && count(it.text.split(/\s+/).filter(Boolean).length, "word")];
  const parts = [
    el("p", "label", [it.kind === "book" ? "Book" : "Scroll", ...genresOf(it)].join(" · ")),
    el("h3", "", it.title),
  ];
  if (it.author) parts.push(el("p", "by", it.author));
  parts.push(el("p", "label facts-line", facts.filter(Boolean).join(" · ")));
  if (it.rating) parts.push(stars(it.rating));
  if (it.remarks) {
    const p = plain(it.remarks);
    parts.push(el("p", "excerpt", p.length > 120 ? p.slice(0, 118).trimEnd() + "…" : p));
  }
  card.replaceChildren(...parts);
  placeCard();
  card.classList.add("on");
}
function hideCard() { cardFor = null; card.classList.remove("on"); }
function placeCard() {
  if (!cardFor.isConnected) return hideCard();
  const r = cardFor.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
  const x = Math.max(16, Math.min(innerWidth - w - 16, r.left + r.width / 2 - w / 2));
  const y = r.top - h - 70 > 12 ? r.top - h - 70 : Math.min(innerHeight - h - 12, r.bottom + 18);
  card.style.left = x + "px";
  card.style.top = y + "px";
}

/* ---- taking a book down ---- */

const size = () => innerWidth < 760 ? Math.round(Math.min(innerHeight * .42, 380)) : Math.round(Math.min(innerHeight * .64, 560));

function info(it) {
  const a = el("article", "info");
  a.append(marked("p", "label", [it.kind === "book" ? "Book" : "Scroll", ...genresOf(it)].join(" · ")),
    marked("h2", "title", it.title));
  if (it.author) a.append(marked("p", "by", it.author));
  const facts = el("dl", "facts");
  const fact = (k, v) => { if (!v) return; const d = el("div"); d.append(el("dt", "label", k), el("dd", "", v)); facts.append(d); };
  fact("Year", yearText(it.year));
  if (it.kind === "book") fact("Pages", it.pages.toLocaleString());
  else fact("Words", it.text && it.text.split(/\s+/).filter(Boolean).length.toLocaleString());
  fact(it.kind === "book" ? "Shelved" : "Written", day(it.added));
  const host = linkHost(it.link || "");
  if (host) {
    const d = el("div", "read"), dd = el("dd"), go = el("a", "", host + " ↗");
    go.href = it.link;
    go.target = "_blank";
    go.rel = "noopener noreferrer";
    dd.append(go);
    d.append(el("dt", "label", "Read online"), dd);
    facts.append(d);
  }
  a.append(facts);
  if (it.rating) a.append(stars(it.rating));
  const tags = genresOf(it);
  if (tags.length) {
    const ul = el("ul", "tags");
    for (const t of tags) ul.append(marked("li", "label", t));
    a.append(ul);
  }
  if (it.remarks) a.append(el("h3", "label remarks", "Remarks"), rich("notes", it.remarks));
  return a;
}

function chrome(it) {
  const tools = el("div", "detail-tools");
  const close = iconBtn("i-close", "Close");
  close.onclick = closeDetail;
  tools.append(close);
  return tools;
}

/* The flight between shelf and stage, as transforms of the stage's box:
   `at` the shelf, lifted `out` of it, and `home` on the stage. A book being
   read already faces you (turned as in .reading .slot .box). */
function flight(s, box, float) {
  const sr = s.getBoundingClientRect(), fr = float.getBoundingClientRect(), { W, H } = box.dims;
  const sc = s.offsetHeight / H, dx = sr.left + sr.width / 2 - (fr.left + fr.width / 2), dy = sr.bottom - sc * H / 2 - (fr.top + fr.height / 2);
  const [z, turn] = reading.contains(s) ? [0, 10] : [-W / 2, 90];
  return {
    at: `translate(${dx}px, ${dy}px) scale3d(${sc}, ${sc}, ${sc}) translateZ(${z}px) rotateY(${turn}deg)`,
    out: `translate(${dx}px, ${dy - 80}px) scale3d(${sc * 1.08}, ${sc * 1.08}, ${sc * 1.08}) translateZ(${z + 40}px) rotateY(${turn - 10}deg)`,
    home: "translate(0px, 0px) scale3d(1, 1, 1) translateZ(0px) rotateY(14deg)",
  };
}

function openBook(s) {
  const it = byId(s.dataset.id);
  if (!it || detail.open) return;
  hoverSlot = null;
  hideCard();
  const box = bookBox(it, size()), float = el("div", "float"), stage = el("div", "stage"), panel = info(it);
  for (const name of ["--bw", "--bh"]) float.style.setProperty(name, box.style.getPropertyValue(name));
  float.append(box);
  stage.append(float);
  const grid = el("div", "detail-grid");
  grid.append(stage, panel);
  detail.className = "book";
  detail.replaceChildren(chrome(it), grid);
  detail.showModal();
  detailSlot = s;
  panel.querySelector("mark")?.scrollIntoView({ block: "center" });
  if (calm.matches) return float.classList.add("bobbing");

  const f = flight(s, box, float);
  s.style.visibility = "hidden";
  box.animate([{ transform: f.at }, { transform: f.out, offset: .3 }, { transform: f.home }],
    { duration: 1700, easing: "cubic-bezier(.45,.05,.25,1)" }).finished.then(() => float.classList.add("bobbing"), () => {});
  panel.animate([{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }],
    { duration: 1100, delay: 900, easing: "cubic-bezier(.22,.61,.36,1)", fill: "backwards" });
}

function openScroll(s) {
  const it = byId(s.dataset.id);
  if (!it || detail.open) return;
  hoverSlot = null;
  hideCard();
  const paper = el("div", "parchment"), sheet = el("div", "sheet");
  sheet.append(info(it));
  sheet.querySelector(".facts").after(rich("text", it.text || ""));
  paper.append(el("div", "rod"), sheet, el("div", "rod"));
  detail.className = "scroll";
  detail.replaceChildren(chrome(it), paper);
  detail.showModal();
  detailSlot = s;
  sheet.querySelector("mark")?.scrollIntoView({ block: "center" });
  if (calm.matches) return;
  const cs = getComputedStyle(sheet);
  sheet.animate([
    { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
    { height: sheet.offsetHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
  ], { duration: 1400, easing: "cubic-bezier(.3,.6,.3,1)" });
  paper.animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "ease-out" });
}

function finishDetail() {
  detail.close();
  if (detailSlot) detailSlot.style.visibility = "";
  detailSlot = null;
  closing = false;
}

/* The book drifts back into its gap on the shelf; a scroll rolls itself up. */
async function closeDetail() {
  if (closing || !detail.open) return;
  closing = true;
  const s = detailSlot, box = detail.querySelector(".stage .box"), sheet = detail.querySelector(".sheet");
  if (!calm.matches) {
    let dim;
    try { dim = detail.animate({ opacity: [1, 0] }, { duration: 1300, pseudoElement: "::backdrop", fill: "forwards" }); } catch {}
    for (const p of detail.querySelectorAll(".info, .detail-tools")) {
      if (box) p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" });
    }
    if (box && s?.isConnected) {
      const float = box.parentElement;
      float.classList.remove("bobbing");
      const f = flight(s, box, float);
      await box.animate([{ transform: f.home }, { transform: f.out, offset: .7 }, { transform: f.at }],
        { duration: 1300, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" }).finished.catch(() => {});
    } else if (sheet) {
      const cs = getComputedStyle(sheet);
      await sheet.animate([
        { height: sheet.offsetHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
        { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
      ], { duration: 800, easing: "cubic-bezier(.6,0,.4,1)", fill: "forwards" }).finished.catch(() => {});
      await detail.querySelector(".parchment").animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(24px)" }],
        { duration: 450, fill: "forwards" }).finished.catch(() => {});
    }
    finishDetail();
    dim?.cancel();
    return;
  }
  finishDetail();
}

detail.addEventListener("cancel", e => { e.preventDefault(); closeDetail(); });
detail.addEventListener("click", e => { if (e.target === detail || e.target.classList.contains("detail-grid")) closeDetail(); });

/* ---- arrivals ---- */

function centerOn(s) {
  if (!looping || !rail.contains(s)) return;
  offset = s.offsetLeft + s.offsetWidth / 2 - rail.clientWidth / 2;
  glide = 0;
  normalize();
  track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  idleUntil = performance.now() + 4000;
}

const slotOf = id => shelves.querySelector(`.item:not(.clone)[data-id="${id}"]`);

/* A new book floats down into its place on the shelf. */
function land(id) {
  const s = slotOf(id);
  if (!s) return;
  (rail.contains(s) ? rail : s).scrollIntoView({ block: "center", behavior: calm.matches ? "auto" : "smooth" });
  centerOn(s);
  if (calm.matches) return;
  if (s.classList.contains("scroll")) return rollUp(s, byId(id));
  s.animate([{ transform: "translateY(-220px)", opacity: 0 }, { opacity: 1, offset: .5 }, { transform: "none", opacity: 1 }],
    { duration: 2000, easing: "cubic-bezier(.22,.61,.36,1)" });
}

/* A new scroll appears open, rolls itself up, and stands in its place. */
async function rollUp(target, it) {
  target.style.visibility = "hidden";
  const p = el("div", "parchment rolling"), sheet = el("div", "sheet");
  sheet.append(el("h2", "title", it.title), rich("text", (it.text || "").slice(0, 600), []));
  p.append(el("div", "rod"), sheet, el("div", "rod"));
  p.setAttribute("aria-hidden", "true");
  document.body.append(p);
  const cs = getComputedStyle(sheet);
  await p.animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 700, easing: "ease-out" }).finished;
  await sheet.animate([
    { height: sheet.offsetHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
    { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
  ], { duration: 1100, easing: "cubic-bezier(.6,0,.4,1)", fill: "forwards" }).finished;
  const from = p.getBoundingClientRect(), to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
  await p.animate([{ transform: "none" }, {
    transform: `translate(${dx}px, ${dy}px) rotate(90deg) scale(${to.height / from.width}, ${to.width / from.height})`,
  }], { duration: 1000, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" }).finished;
  p.remove();
  target.style.visibility = "";
}

function glow(id) {
  const s = slotOf(id);
  if (!s) return;
  centerOn(s);
  if (!calm.matches) s.animate([{ filter: "brightness(1.35) drop-shadow(0 0 18px oklch(0.85 0.1 75))" }, { filter: "none" }], 1800);
}

/* ---- the heading types itself ---- */

function typeHeading() {
  const out = $("typed"), parts = [["Welcome to my ", ""], ["archive", "em"], [".", ""]];
  const total = parts.reduce((n, [t]) => n + t.length, 0);
  const done = () => document.body.classList.add("ready");
  const show = n => {
    out.replaceChildren();
    for (const [text, tag] of parts) {
      const piece = text.slice(0, Math.max(0, n));
      n -= text.length;
      if (piece) out.append(tag ? el(tag, "", piece) : piece);
    }
  };
  if (calm.matches) { show(total); return done(); }
  let i = 0;
  const step = () => {
    show(++i);
    if (i >= total) return setTimeout(done, 300);
    setTimeout(step, 50 + Math.random() * 60 + (i === parts[0][0].length ? 180 : 0));   // a breath before "archive"
  };
  setTimeout(step, 500);
}

let resizing = 0;
addEventListener("resize", () => { cancelAnimationFrame(resizing); resizing = requestAnimationFrame(layout); });
search.addEventListener("input", render);
chips.addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (b) { genre = b.dataset.genre; render(); }
});

typeHeading();
requestAnimationFrame(tick);
fetch("api/library.php", { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(d => {
    items = Array.isArray(d.items) ? d.items : [];
    render();
  })
  .catch(() => track.replaceChildren(el("p", "label empty-shelf", "The archive could not be loaded. Refresh the page to try again.")));
