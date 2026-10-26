/*
 * Build CPIK into dist/:
 *   1. prepare-icons.js     icons/*.svg -> .build/icons/*.svg (checked, one path each)
 *   2. generate-codepoints  fixed Private Use Area codepoints in config/codepoints.json
 *   3. fantasticon          cpik.woff2, cpik.woff, cpik.css, cpik.json, index.html
 *   4. cpik.js              names, keywords, categories and aliases for the preview page
 *   5. assets               fonts, favicons and link-preview image for the preview page
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

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }

    return 0;
}

function writeMetadata(version) {
    const icons = fs.readdirSync(ICONS)
        .filter(file => file.endsWith('.svg'))
        .map(file => file.slice(0, -4))
        .sort();
    const metadata = readJson('config/metadata.json');
    const categories = readJson('config/categories.json');
    const codepoints = readJson('config/codepoints.json');
    const data = {};

    for (const icon of icons) {
        if (!Object.hasOwn(metadata, icon)) {
            console.log(`warn  ${icon}: no entry in config/metadata.json; ` +
                'the preview shows its file name and it has no keywords');
        } else if (!metadata[icon].added) {
            console.log(`warn  ${icon}: no "added" version in config/metadata.json`);
        }

        const entry = metadata[icon] || { name: { fa: icon, en: icon }, keywords: [] };

        // "New" means added in the version being built or in one still to come (icons added
        // since the last release). Stored per icon rather than read from git tags, so a CI
        // checkout without tag history builds the same dist/.
        data[icon] = {
            ...entry,
            codepoint: codepoints[icon].toString(16),
            isNew: Boolean(entry.added) && compareVersions(entry.added, version) >= 0
        };
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
        `window.CPIK_ALIASES = ${JSON.stringify(readJson('config/aliases.json'), null, 2)};`,
        ''
    ].join('\n');

    fs.writeFileSync(path.join(DIST, 'cpik.js'), script, 'utf8');
}

/*
 * A renamed icon keeps its old class name as an alias (config/aliases.json:
 * old name -> new name), so pages that already use the old class keep
 * showing the same glyph.
 */
function appendAliases(prefix) {
    const aliases = readJson('config/aliases.json');
    const codepoints = readJson('config/codepoints.json');
    const rules = [];

    for (const [oldName, newName] of Object.entries(aliases)) {
        if (!Object.hasOwn(codepoints, newName)) {
            throw new Error(`config/aliases.json: "${oldName}" points at unknown icon "${newName}"`);
        }

        if (Object.hasOwn(codepoints, oldName)) {
            throw new Error(`config/aliases.json: "${oldName}" is still an icon of its own`);
        }

        rules.push(`.${prefix}-${oldName}::before {\n    content: "\\${
            codepoints[newName].toString(16)}";\n}`);
    }

    if (rules.length) {
        fs.appendFileSync(path.join(DIST, 'cpik.css'),
            `\n/* Old class names of renamed icons */\n${rules.join('\n')}\n`, 'utf8');
    }
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
    appendAliases(config.prefix);
    bustCache(['cpik.css', 'cpik.js']);
    // Only what the preview page uses; the README's video, cover and lockups stay out of dist/.
    for (const item of ['fonts', 'favicon', 'cpik-social-preview.png']) {
        fs.cpSync(path.join(ROOT, 'assets', item), path.join(DIST, 'assets', item), { recursive: true });
    }
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
