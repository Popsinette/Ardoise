/* Petit serveur statique pour le banc d'essai.
   Il sert /home/user, donc l'app se trouve à /Ardoise/ — exactement la forme
   qu'elle aura sur GitHub Pages, ce qui teste réellement les chemins relatifs,
   la portée du service worker et le manifeste sous sous-chemin. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const RACINE = '/home/user';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.sql': 'text/plain; charset=utf-8',
};

export function demarrerServeur(port = 8099) {
  const serveur = http.createServer(async (req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    let fichier = path.join(RACINE, chemin);
    try {
      if ((await stat(fichier)).isDirectory()) fichier = path.join(fichier, 'index.html');
      const contenu = await readFile(fichier);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(contenu);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
    }
  });
  return new Promise((ok) => serveur.listen(port, '127.0.0.1', () => ok(serveur)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await demarrerServeur();
  console.log('serveur d’essai sur http://127.0.0.1:8099/Ardoise/');
}
