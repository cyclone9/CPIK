/*
 * Give every icon in icons/ a fixed codepoint in the Unicode Private Use
 * Area and keep the mapping in config/codepoints.json.
 *
 * Existing assignments never change, so a site that uses an icon keeps
 * working after new icons are added. The codepoint of a removed icon stays
 * reserved and is not reused.
 *
 * Usage: node scripts/generate-codepoints.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const iconsDir = path.join(ROOT, 'icons');
const codepointsFile = path.join(ROOT, 'config', 'codepoints.json');

const PUA_START = 0xE000;
const PUA_END = 0xF8FF;

let codepoints = {};

if (fs.existsSync(codepointsFile)) {
    codepoints = JSON.parse(fs.readFileSync(codepointsFile, 'utf8'));
}

const icons = fs.readdirSync(iconsDir)
    .filter(file => file.toLowerCase().endsWith('.svg'))
    .map(file => path.basename(file, '.svg'))
    .sort();

const usedCodepoints = new Set(Object.values(codepoints).map(Number));

let nextCodepoint = PUA_START;

for (const icon of icons) {
    if (Object.hasOwn(codepoints, icon)) {
        continue;
    }

    while (usedCodepoints.has(nextCodepoint) && nextCodepoint <= PUA_END) {
        nextCodepoint++;
    }

    if (nextCodepoint > PUA_END) {
        throw new Error('No free Unicode Private Use Area codepoint available.');
    }

    codepoints[icon] = nextCodepoint;
    usedCodepoints.add(nextCodepoint);

    console.log(`Added: ${icon} → U+${nextCodepoint
        .toString(16)
        .toUpperCase()
        .padStart(4, '0')}`);

    nextCodepoint++;
}

const removed = Object.keys(codepoints).filter(icon => !icons.includes(icon));

for (const icon of removed) {
    console.log(`Reserved: ${icon} (no SVG; its codepoint is kept unused)`);
}

fs.writeFileSync(
    codepointsFile,
    JSON.stringify(codepoints, null, 2) + '\n',
    'utf8'
);

console.log(`Codepoints: ${icons.length} icon(s), ` +
    `${Object.keys(codepoints).length} assigned.`);
