/*
 * Minify dist/cpik.css into dist/cpik.min.css with CPWO, https://github.com/cyclone9/CPWO
 *
 * The pinned release is kept in .build/cpwo/, so only a cold .build/ needs the network.
 * CPWO runs on a folder holding a copy of cpik.css alone, because it scans recursively
 * and leaves a .cpwo-output file behind.
 *
 * Usage: node scripts/minify-css.js
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.build', 'cpwo');
const TIMEOUT = 120_000;

const VERSION = '1.0.0';

// Pinned here because a checksums.txt fetched from the release could change along with the binary.
const CHECKSUMS = {
    'cpwo_1.0.0_darwin_amd64.tar.gz': '6ffe5d86458cda3294dcd61a5416ca9c73ded44a61b80eba709ef1098ba32be3',
    'cpwo_1.0.0_darwin_arm64.tar.gz': 'b078d3f74decfabbed5cf5c132ac0fd6dfe71b34ea97929bf06c55f3004f2564',
    'cpwo_1.0.0_linux_amd64.tar.gz': '2790c2dae22a3f7c1f09931f376ea7968331f2d44e8be834d8ab1ac6befa8299',
    'cpwo_1.0.0_linux_arm64.tar.gz': 'e3f4ff8d1007e98e475e053d680a9e52f5c63a18bb8b9399c3bbfdfbfd0a934b',
    'cpwo_1.0.0_windows_amd64.zip': '6c31a9c08504474edf8cdf838328ed668b655687b903cb56750304e279ef27fe',
    'cpwo_1.0.0_windows_arm64.zip': '897c326f9c0971b180afb87dd9a7f436963d4642149cedbbcfc6826298ed1ffd'
};

const WINDOWS = process.platform === 'win32';

function assetName() {
    const os = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[process.platform];
    const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];

    if (!os || !arch) {
        throw new Error(`CPWO ${VERSION} has no release for ${process.platform}/${process.arch}`);
    }

    return `cpwo_${VERSION}_${os}_${arch}.${WINDOWS ? 'zip' : 'tar.gz'}`;
}

async function download(name) {
    const url = `https://github.com/cyclone9/CPWO/releases/download/v${VERSION}/${name}`;

    console.log(`Downloading ${url}`);

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        throw new Error(`Could not download CPWO from ${url}: ${error.cause?.message || error.message}`);
    }
}

function verify(name, data) {
    const actual = crypto.createHash('sha256').update(data).digest('hex');

    if (actual !== CHECKSUMS[name]) {
        throw new Error(`Checksum mismatch for ${name}: expected ${CHECKSUMS[name]}, got ${actual}. ` +
            'If a broken download was kept, delete .build/cpwo/ and build again.');
    }
}

async function fetchArchive() {
    const name = assetName();
    const file = path.join(CACHE, name);
    const cached = fs.existsSync(file);
    const data = cached ? fs.readFileSync(file) : await download(name);

    verify(name, data);

    if (!cached) {
        fs.writeFileSync(file, data);
    }

    return name;
}

function extract(archive) {
    const binary = WINDOWS ? 'cpwo.exe' : 'cpwo';
    const dir = path.join(CACHE, 'bin');

    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);

    // Windows ships bsdtar, which reads .zip. The GNU tar of Git for Windows can be first on PATH.
    const tar = WINDOWS ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';

    // Relative paths: GNU tar would take the colon in C:\... for a remote host.
    execFileSync(tar, ['-xf', archive, '-C', 'bin', binary], { cwd: CACHE, stdio: 'inherit' });

    return path.join(dir, binary);
}

function minify(cpwo) {
    const source = path.join(DIST, 'cpik.css');
    const work = path.join(CACHE, 'work');

    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work);
    fs.copyFileSync(source, path.join(work, 'cpik.css'));

    execFileSync(cpwo, ['-css', work], { stdio: 'inherit' });

    const output = path.join(work, 'cpik.min.css');

    if (!fs.existsSync(output)) {
        throw new Error('CPWO did not produce cpik.min.css');
    }

    // CPWO copies a file it cannot parse instead of failing.
    if (fs.statSync(output).size >= fs.statSync(source).size) {
        throw new Error('CPWO did not minify cpik.css');
    }

    if (!fs.readFileSync(output, 'utf8').startsWith('/*!')) {
        throw new Error('cpik.min.css lost the licence banner of cpik.css');
    }

    fs.copyFileSync(output, path.join(DIST, 'cpik.min.css'));
    fs.rmSync(work, { recursive: true, force: true });
}

async function main() {
    fs.mkdirSync(CACHE, { recursive: true });

    minify(extract(await fetchArchive()));
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});
