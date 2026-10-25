/* node test.js — the shelf's logic from app.js, then api/library.php for real
   (a throwaway copy served by `php -S`, so no library of yours is touched). */

const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const { spawn } = require("child_process");

/* ---- app.js: everything above the DOM marker is plain logic ---- */
const src = fs.readFileSync(__dirname + "/app.js", "utf8");
const cut = src.indexOf("/* ---- DOM ---- */");
assert.ok(cut > 0, "DOM marker moved — update test.js");
const names = "spineWidth, arrange, genresOf, matches, words, hits, settle, inkFor, worst, yearText, linkHost, blocks, spans, plain";
const { spineWidth, arrange, genresOf, matches, words, hits, settle, inkFor, worst, yearText, linkHost, blocks, spans, plain } =
  new Function(src.slice(0, cut) + `\nreturn { ${names} };`)();

/* the page's scripts share one scope (app.js, then home.js): a name declared
   twice there would silently replace the first */
const seen = new Map();
for (const f of ["app.js", "home.js"]) {
  for (const m of fs.readFileSync(`${__dirname}/${f}`, "utf8").matchAll(/^(?:async\s+)?function\*?\s+([\w$]+)|^(?:const|let|var|class)\s+([\w$]+)/gm)) {
    const name = m[1] || m[2];
    assert.ok(!seen.has(name), `"${name}" is declared in ${seen.get(name)} and again in ${f}`);
    seen.set(name, f);
  }
}
new (require("vm").Script)(["app.js", "home.js"].map(f => fs.readFileSync(`${__dirname}/${f}`, "utf8")).join("\n"));

/* spines */
assert.strictEqual(spineWidth(1), 16, "thin pamphlets still get a readable spine");
assert.strictEqual(spineWidth(5000), 92, "doorstops are capped");
assert.ok(spineWidth(400) > spineWidth(200), "more pages, thicker book");
for (const c of ["#ffffff", "#000000", "#808080", "#c20257", "#dabd8e", "#424962", "#7f7f00"]) {
  const bg = settle(c);
  assert.ok(worst(bg, inkFor(bg)) >= 4.5, `spine lettering stays readable on ${c} (got ${bg})`);
}
assert.strictEqual(yearText(-375), "375 BC");
assert.strictEqual(yearText(1866), "1866");
assert.strictEqual(yearText(null), "");
assert.strictEqual(linkHost("https://www.gutenberg.org/ebooks/2600"), "gutenberg.org", "a reading link shows its site");
assert.strictEqual(linkHost("javascript:alert(1)"), "", "and only web addresses ever become links");
assert.strictEqual(linkHost("drive.google.com/file/d/x"), "");

/* genres: two at once are two genres, never a new combined one */
assert.deepStrictEqual(genresOf({ genre: "Philosophy & religion" }), ["Philosophy", "Religion"]);
assert.deepStrictEqual(genresOf({ genre: " poetry / Sufism; history,," }), ["Poetry", "Sufism", "History"]);
assert.deepStrictEqual(genresOf({ genre: "" }), []);

/* the shelf's order */
const b = (title, author, genre) => ({ kind: "book", title, author, genre, pages: 100 });
const g = arrange([
  b("The Idiot", "Fyodor Dostoevsky", "Fiction"),
  { kind: "scroll", title: "My essay", genre: "Philosophy", text: "On walking" },
  b("Meditations", "Marcus Aurelius", "Philosophy & Stoicism"),
  b("The Stranger", "Albert Camus", " fiction , Classics"),
  b("Loose notes", "", ""),
]);
assert.deepStrictEqual(g.map(x => x.name), ["Fiction", "Philosophy", "Unsorted"], "first genres A–Z, case-insensitive, Unsorted last");
assert.deepStrictEqual(g[0].items.map(x => x.title), ["The Stranger", "The Idiot"], "shelved by author surname");
assert.deepStrictEqual(g[1].items.map(x => x.kind), ["book", "scroll"], "scrolls stand after the books of their genre");

/* search */
const muq = { title: "The Muqaddimah", author: "Ibn Khaldun", genre: "History", remarks: "Asabiyyah: why **dynasties** rise and fall in about four generations.", year: 1377 };
assert.ok(matches(muq, words("dynasties generations")), "words from remarks, not next to each other");
assert.ok(matches(muq, words("  GENERATIONS khaldun ")), "any case, any order, across fields");
assert.ok(matches(muq, words("1377")), "the year is searchable");
assert.ok(!matches(muq, words("dynasties empires")), "every word must be there");
assert.ok(matches({ title: "One Hundred Years", author: "Gabriel García Márquez" }, words("marquez garcia")), "accents ignored");
assert.ok(matches(muq, []), "an empty search shows everything");
const name = "Gabriel García Márquez";
assert.deepStrictEqual(hits(name, words("marquez garcia")).map(([a, e]) => name.slice(a, e)), ["García", "Márquez"], "marks the words as written");
assert.deepStrictEqual(hits("rise and rise", words("rise ris")), [[0, 4], [9, 13]], "overlapping finds merge");

/* text formatting */
assert.deepStrictEqual(blocks("## Lectures\nfirst line\nsecond line\n\n- a\n- b\n1. c\n> quoted"), [
  { type: "h", lines: ["Lectures"] }, { type: "p", lines: ["first line", "second line"] },
  { type: "ul", lines: ["a", "b"] }, { type: "ol", lines: ["c"] }, { type: "quote", lines: ["quoted"] },
]);
assert.deepStrictEqual(spans("a **bold** and _soft_ word"), [
  { t: "", text: "a " }, { t: "b", text: "bold" }, { t: "", text: " and " }, { t: "i", text: "soft" }, { t: "", text: " word" },
]);
assert.deepStrictEqual(spans("snake_case_name"), [{ t: "", text: "snake_case_name" }], "underscores inside words are left alone");
assert.strictEqual(plain("## Big\n- **one**\n- _two_"), "Big one two", "the hover card shows remarks without marks");

/* ---- the server ---- */

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDn6KKKxPTP/9k=";
const GUARD = "<?php http_response_code(404); exit; ?>\n";

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "archive-"));
  fs.mkdirSync(tmp + "/api");
  fs.mkdirSync(tmp + "/data/covers", { recursive: true });
  fs.copyFileSync(`${__dirname}/api/library.php`, `${tmp}/api/library.php`);
  const jpeg = Buffer.from(JPEG.split(",")[1], "base64");
  const library = items => fs.writeFileSync(tmp + "/data/library.php", GUARD + JSON.stringify(items));
  library([
    { id: "aaaaaaaa-1", kind: "book", title: "Dune", author: "Frank Herbert", pages: 412, remarks: "Worth it.", notes: "kept to myself", private: false, cover: "v1" },
    { id: "bbbbbbbb-2", kind: "book", title: "Secret", pages: 9, private: true, cover: "v1" },
    { id: "cccccccc-3", kind: "scroll", title: "Diary", text: "Very personal.", private: true },
    { id: "dddddddd-4", kind: "scroll", title: "On walking", text: "Out loud." },
  ]);
  for (const id of ["aaaaaaaa-1", "bbbbbbbb-2"]) fs.writeFileSync(`${tmp}/data/covers/${id}.jpg`, jpeg);
  const port = 8100 + Math.floor(Math.random() * 800);
  const phpLog = tmp + "-php.log";   // every warning, notice or error PHP raises: there must be none
  const php = spawn("php", ["-d", "log_errors=1", "-d", `error_log=${phpLog}`, "-S", `127.0.0.1:${port}`, "-t", tmp], { stdio: "ignore" });
  const site = `http://127.0.0.1:${port}`, url = site + "/api/library.php";
  const get = q => fetch(url + (q || ""));

  try {
    for (let i = 0; ; i++) {
      try { await fetch(url); break; } catch { if (i > 50) throw new Error("php -S did not start"); await new Promise(r => setTimeout(r, 100)); }
    }

    /* the shelf, as anyone sees it */
    let r = await get();
    assert.strictEqual(r.headers.get("cache-control"), "no-store");
    const { items } = await r.json();
    assert.deepStrictEqual(items.map(i => i.id), ["aaaaaaaa-1", "dddddddd-4"], "private books and scrolls are never sent");
    assert.ok(items.every(i => !("notes" in i) && !("private" in i)), "nor anyone's notes");
    assert.strictEqual(items[0].remarks, "Worth it.", "remarks are public");
    assert.match(items[0].cover, /^api\/library\.php\?cover=aaaaaaaa-1&v=v1$/, "covers are served by the server, not straight from disk");

    /* covers */
    r = await get("?cover=aaaaaaaa-1");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers.get("content-type"), "image/jpeg");
    assert.strictEqual((await get("?cover=bbbbbbbb-2")).status, 404, "a private book's cover is not shown");
    assert.strictEqual((await get("?cover=../../data/library")).status, 404, "only real ids are looked up");
    assert.strictEqual((await get("?cover[]=1")).status, 404);

    /* nothing can be changed, and the data can't be read directly */
    assert.strictEqual((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 405, "this server only reads");
    r = await fetch(site + "/data/library.php");
    assert.strictEqual(r.status, 404);
    assert.strictEqual(await r.text(), "", "requesting the library file directly shows nothing");

    /* no library yet, and a damaged one */
    fs.rmSync(tmp + "/data/library.php");
    assert.deepStrictEqual(await (await get()).json(), { items: [] }, "no library file yet: an empty shelf");
    fs.writeFileSync(tmp + "/data/library.php", GUARD + "{broken");
    r = await get();
    assert.strictEqual(r.status, 500);
    assert.ok(!(await r.text()).includes("library"), "no file names for visitors");

    const logged = fs.existsSync(phpLog) ? fs.readFileSync(phpLog, "utf8") : "";
    assert.strictEqual(logged, "", "PHP raised no warning, notice or error in any of this");
    console.log("all good");
  } finally {
    php.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(phpLog, { force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
