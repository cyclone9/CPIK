/*
 * fantasticon 4.1.0 builds its SVG search pattern with path.join(), which
 * gives backslashes on Windows. glob treats a backslash as an escape, so
 * no icons are found there. This rewrites the pattern with forward
 * slashes. It runs after every npm install and is safe to run again.
 *
 * Usage: node scripts/patch-fantasticon.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
    'node_modules/fantasticon/dist/index.cjs',
    'node_modules/fantasticon/dist/cli/index.cjs'
];
const BROKEN = /const globPath = \(0, import_path\d+\.join\)\(dir, `\*\*\/\*\.\$\{ASSETS_EXTENSION\}`\);/;
const FIXED = 'const globPath = dir.replace(/\\\\/g, "/").replace(/\\/+$/, "") + ' +
    '`/**/*.${ASSETS_EXTENSION}`;';

for (const file of FILES) {
    const target = path.join(ROOT, file);

    if (!fs.existsSync(target)) {
        continue;
    }

    const source = fs.readFileSync(target, 'utf8');

    if (BROKEN.test(source)) {
        fs.writeFileSync(target, source.replace(BROKEN, FIXED));
        console.log(`Patched ${file}`);
    }
}
