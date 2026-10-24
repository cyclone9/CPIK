/*
 * Serve dist/ on http://127.0.0.1:8080 to look at the preview page.
 *
 * Usage: node scripts/serve.js [port]
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.argv[2]) || 8080;
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8'
};

http.createServer((request, response) => {
    const url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.join(DIST, url.endsWith('/') ? `${url}index.html` : url);

    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) ||
        !fs.statSync(file).isFile()) {
        response.writeHead(404).end('Not found');
        return;
    }

    response.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'
    });
    fs.createReadStream(file).pipe(response);
}).on('error', error => {
    console.error(error.code === 'EADDRINUSE' ?
        `Port ${PORT} is in use. Try: npm run preview -- <port>` : error.message);
    process.exit(1);
}).listen(PORT, '127.0.0.1', () => {
    console.log(`CPIK preview: http://127.0.0.1:${PORT}/`);
});
