/*
 * Build CPIK into dist/:
 *   1. prepare-icons.js     icons/*.svg -> .build/icons/*.svg (checked, one path each)
 *   2. generate-codepoints  fixed Private Use Area codepoints in config/codepoints.json
 *   3. fantasticon          cpik.woff2, cpik.woff, cpik.css, cpik.json, index.html
 *   4. cpik.js              names, keywords and categories for the preview page
 *   5. assets               fonts and logo for the preview page
 *
 * dist/ is rebuilt from scratch each time, so removed icons disappear.
 *
 * Usage: node scripts/build.js [--force]   (--force rebuilds every SVG)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ICONS = path.join(ROOT, 'icons');

const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

function run(script, args = []) {
    execFileSync(process.execPath, [path.join(__dirname, script), ...args], {
        cwd: ROOT,
        stdio: 'inherit'
    });
}

function writeMetadata(version) {
    const icons = fs.readdirSync(ICONS)
        .filter(file => file.endsWith('.svg'))
        .map(file => file.slice(0, -4))
        .sort();
    const metadata = readJson('config/metadata.json');
    const categories = readJson('config/categories.json');
    const data = {};

    for (const icon of icons) {
        if (!Object.hasOwn(metadata, icon)) {
            console.log(`warn  ${icon}: no entry in config/metadata.json; ` +
                'the preview shows its file name and it has no keywords');
        }

        data[icon] = metadata[icon] || { name: { fa: icon, en: icon }, keywords: [] };
    }

    for (const key of Object.keys(metadata)) {
        if (!icons.includes(key)) {
            console.log(`warn  config/metadata.json: "${key}" has no icon`);
        }
    }

    const script = [
        '/* CPIK preview data. Icons do not need this file. */',
        `window.CPIK_VERSION = ${JSON.stringify(version)};`,
        `window.CPIK_CATEGORIES = ${JSON.stringify(categories, null, 2)};`,
        `window.CPIK_DATA = ${JSON.stringify(data, null, 2)};`,
        ''
    ].join('\n');

    fs.writeFileSync(path.join(DIST, 'cpik.js'), script, 'utf8');
}

/*
 * Servers may let browsers keep cpik.css for a day (cpik.cp1.ir does), so a
 * new build could show new icon cards with an old stylesheet and empty
 * glyphs. The page links each file with a hash of its content instead: a
 * change forces a fresh download, an unchanged file keeps the same URL.
 */
function bustCache(files) {
    const page = path.join(DIST, 'index.html');
    let html = fs.readFileSync(page, 'utf8');

    for (const file of files) {
        const hash = crypto.createHash('sha1')
            .update(fs.readFileSync(path.join(DIST, file)))
            .digest('hex')
            .slice(0, 10);
        const pattern = new RegExp(`((?:href|src)="(?:\\./)?${file.replace('.', '\\.')})"`, 'g');

        html = html.replace(pattern, `$1?v=${hash}"`);
    }

    fs.writeFileSync(page, html, 'utf8');
}

async function main() {
    const force = process.argv.includes('--force') ? ['--force'] : [];
    const { version } = readJson('package.json');

    run('prepare-icons.js', force);
    run('generate-codepoints.js');

    fs.rmSync(DIST, { recursive: true, force: true });
    fs.mkdirSync(DIST, { recursive: true });

    const { generateFonts } = require('fantasticon');
    const config = readJson('config/icons.json');

    await generateFonts({
        ...config,
        inputDir: path.join(ROOT, config.inputDir),
        outputDir: DIST,
        codepoints: readJson('config/codepoints.json'),
        templates: Object.fromEntries(Object.entries(config.templates)
            .map(([type, file]) => [type, path.join(ROOT, file)])),
        pathOptions: { html: path.join(DIST, 'index.html') }
    });

    writeMetadata(version);
    bustCache(['cpik.css', 'cpik.js']);
    fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

    const files = fs.readdirSync(DIST).filter(file => !file.startsWith('.'));

    console.log(`\nBuilt CPIK ${version} into dist/: ${files.join(', ')}`);
}

main().catch(error => {
    if (error.status === undefined) {
        console.error(error.message || error);
    }

    process.exit(1);
});
