<?php
/* Saeed's Archive — the shelf's server: its books, and their covers.

   GET                  → {items}: the shelf (private items and private notes are never sent)
   GET ?cover=<id>      → a cover image, unless its book is private

   The books live in data/library.php: a guard line, then JSON (see README). */

declare(strict_types=1);

ini_set('display_errors', '0');      /* errors go to the server log, never to the page */
error_reporting(E_ALL);
header_remove('X-Powered-By');

const DATA      = __DIR__ . '/../data/library.php';
const COVERS    = __DIR__ . '/../data/covers';
/* The first line of every data file. Should a misconfigured server ever serve
   one, PHP runs this line and nothing of the file is shown. */
const GUARD     = "<?php http_response_code(404); exit; ?>\n";
const ID_RE     = '/^[a-z0-9-]{8,40}$/';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

function reply(int $status, $body = null): void {
  http_response_code($status);
  if ($body !== null) echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

/* An array; [] when the file doesn't exist yet; false when it is damaged.
   Read as data, never loaded as code. */
function read_data(string $file) {
  if (!is_file($file)) return [];
  $s = (string)file_get_contents($file);
  $v = str_starts_with($s, GUARD) ? json_decode(substr($s, strlen(GUARD)), true) : null;
  return is_array($v) ? $v : false;
}

/* What may be shown: no private items and no notes. Covers become addresses
   that this file serves (and checks) itself. */
function view(array $items): array {
  $out = [];
  foreach ($items as $it) {
    if (!is_array($it) || !empty($it['private'])) continue;
    unset($it['notes'], $it['private']);
    if (isset($it['cover'])) $it['cover'] = $it['cover'] === '' ? '' : "api/library.php?cover={$it['id']}&v={$it['cover']}";
    $out[] = $it;
  }
  return $out;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') reply(405, ['error' => 'Not allowed.']);
$items = read_data(DATA);
if ($items === false) reply(500, ['error' => 'The archive is unavailable right now.']);
if (!isset($_GET['cover'])) reply(200, ['items' => view($items)]);

$id = is_string($_GET['cover']) ? $_GET['cover'] : '';
$at = preg_match(ID_RE, $id) ? array_search($id, array_column($items, 'id'), true) : false;
$file = COVERS . "/$id.jpg";
if ($at === false || ($items[$at]['cover'] ?? '') === '' || !empty($items[$at]['private']) || !is_file($file)) reply(404);
header('Content-Type: image/jpeg');
header('Cache-Control: public, max-age=31536000, immutable');   /* the address changes when the cover does */
header('Content-Length: ' . filesize($file));
readfile($file);
exit;
