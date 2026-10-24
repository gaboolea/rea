// Empaqueta el cliente compilado (dist/) en un único HTML autónomo. Sin
// servidor, ese archivo arranca en modo sin conexión (entrenamiento con bots).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\/?(assets\/[^"]+\.js)"><\/script>/, (_, f) => {
  const js = readFileSync(join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\/?(assets\/[^"]+\.css)">/, (_, f) => `<style>\n${readFileSync(join(dist, f), 'utf8')}\n</style>`);
if (/src="\/?assets\//.test(html) || /href="\/?assets\//.test(html)) throw new Error('Quedan recursos sin incrustar');

const out = join(root, 'dist-single', 'jelly-rumble.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Generado ${out} (${(html.length / 1024).toFixed(0)} KB)`);

// Variante sin <html>/<head>/<body> para publicarla como página de Claude
// (la plataforma añade su propio esqueleto de documento).
const page = html
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>/gi, '')
  .trim();
writeFileSync(join(root, 'dist-single', 'jelly-rumble-page.html'), `${page}\n`);
