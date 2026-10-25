# Saeed's Archive

A personal bookshelf on the web: an endless, slowly drifting shelf of 3D books
with their real covers, each spine coloured from its cover. Live at
[archive.saeedzafar.se](https://archive.saeedzafar.se).

This repository is the public part of the site: the bookshelf itself, read-only.
Adding and editing books, and everything else behind the owner's sign-in, lives
in a private repository.

## What it does

- **The shelf** drifts by on its own and loops endlessly. Scroll, drag or use
  the arrow keys to move it. Spine thickness follows the page count, and the
  spine lettering is always readable (4.5:1 contrast).
- **Hover** a book for a card with its details; **click** it and it flies off
  the shelf into a large view with its year, pages, rating, genres, remarks
  and, where there is one, a link to read it online.
- **Scrolls** (writings) stand among the books and unroll when opened.
- **Currently reading**: books being read stand face out below the shelf.
- **Search** across titles, authors, genres, remarks, years and scroll text: any words, any
  order, accents and capitals ignored. **Genre pills** filter the shelf.
- Slow, quiet motion, and none at all with "reduce motion" switched on.

## How it's built

Plain HTML, CSS and JavaScript, and one PHP file. No build step, no npm, no
database.

| File | Role |
|---|---|
| `index.html` | The page. |
| `app.js` | Plain logic (shelf order, search, spine colours, text formatting), then small DOM helpers. |
| `home.js` | The shelf, the hover card, the book window, the typing heading. |
| `styles.css` | Everything visual. Self-hosted fonts, no external requests. |
| `api/library.php` | Sends the shelf as JSON, and the covers. Read-only. |
| `data/` | The library itself (not in this repository; see below). |
| `sample/library.php` | A small library to try it with. |
| `test.js` | Tests for the logic and for the real server. |

## Run it on your computer

You need PHP 8.

```sh
cp sample/library.php data/
php -S localhost:8000
```

Then open <http://localhost:8000>. Without a library file the shelf is simply
empty.

## The data

`data/library.php` is a guard line followed by a JSON array of books and
scrolls:

```
<?php http_response_code(404); exit; ?>
[{ "id": "sample-01", "kind": "book", "title": "War and Peace", ... }]
```

The guard line means that, should the file ever be requested directly, PHP
runs that line and nothing of the file is shown.

- **Every item**: `id`, `kind` (`book` or `scroll`), `title`, `author`, `genre`
  (several separated by `,` `&` `/` or `;`), `year` (negative for BC, or
  `null`), `rating` (0–5), `remarks`, `added` (`YYYY-MM-DD`). Items with
  `"private": true`, and any `notes`, are never sent to the page.
- **Books**: `pages`, `isbn`, `link` (a web address to read it), `reading`
  (`true` puts it below the shelf), `color` (`#rrggbb`, or `""` for one
  chosen from the title), `cover` (`""`, or a version string when
  `data/covers/<id>.jpg` exists).
- **Scrolls**: `text`.

Remarks and scrolls take a few marks: `**bold**`, `_italic_`, `## ` for a
heading, `- ` and `1. ` for lists, `> ` for a quote.

## Security

- The page allows no inline script or style (a strict Content Security
  Policy), and text from the library is only ever inserted as text, never as
  HTML.
- Only the site's own files can be fetched (`.htaccess`); everything else,
  including the data folder, answers 403. Covers are served through
  `api/library.php`, which checks them.
- Private items and notes are left out on the server, not merely hidden on
  the page.

## Tests

```sh
node test.js
```

Needs Node 18 or later and PHP 8. It runs the logic, then the real server on a
throwaway copy.

## License

MIT (see `LICENSE`). The fonts (Cormorant Garamond, Karla, Space Mono) are
under the SIL Open Font License; their licences are in `fonts/`. The site's
icons are not included.
