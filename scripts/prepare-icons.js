/*
 * Prepare the source SVGs in icons/ for the icon font.
 *
 * An icon font keeps only one filled outline per glyph, drawn with the
 * nonzero winding rule. SVG files from design tools often rely on things
 * the font drops or draws differently, so every icon is rebuilt here into
 * a single path and written to .build/icons/. The files in icons/ are never
 * changed.
 *
 * Handled:
 *   - fill-rule="evenodd", as an attribute, in style="" or in a <style> class
 *   - shapes that overlap with opposite winding (they would cancel out)
 *   - transforms on shapes and groups, <use> references, clip paths
 *   - rect, circle, ellipse, polygon, polyline and path elements
 *   - white shapes drawn on top of the artwork, which become cut-outs
 *   - hidden shapes (display:none, visibility:hidden, opacity 0)
 *
 * Errors (the build stops): invalid file names, unreadable XML, no viewBox
 * or size, images, text, masks, stroke-only shapes, empty icons,
 * and a rebuilt outline that does not match the original artwork.
 *
 * Warnings: dropped strokes, gradients and transparency drawn as solid,
 * artwork outside the viewBox, very wide icons.
 *
 * Usage: node scripts/prepare-icons.js [--force]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const paper = require('paper');
const { DOMParser } = require('@xmldom/xmldom');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'icons');
const OUTPUT_DIR = path.join(ROOT, '.build', 'icons');
const CACHE_FILE = path.join(ROOT, '.build', 'prepare-cache.json');

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ASPECT = 4;
const SAMPLES = 160;
const MISMATCH_ERROR = 0.005;
const MISMATCH_WARN = 0.0005;
const PRECISION = 3;

const IGNORED = new Set([
  'title', 'desc', 'metadata', 'style', 'defs', 'symbol',
  'linearGradient', 'radialGradient', 'stop', 'filter'
]);
const UNSUPPORTED = new Set([
  'image', 'text', 'tspan', 'textPath', 'foreignObject', 'pattern',
  'mask', 'clipPath', 'svg', 'switch', 'video', 'audio', 'canvas'
]);
const SHAPES = new Set([
  'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'
]);
const INHERITED = [
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width',
  'visibility', 'clip-rule'
];

const force = process.argv.includes('--force');
const scriptHash = hash(fs.readFileSync(__filename));

paper.setup(new paper.Size(1000, 1000));

function hash(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

/*
 * CSS from <style> elements: simple selectors only (.class, #id, tag,
 * tag.class), which is what design tools export.
 */
function parseStyleSheets(document) {
  const rules = [];
  const styles = document.getElementsByTagName('style');

  for (let i = 0; i < styles.length; i++) {
    const css = styles[i].textContent
      .replace(/\/\*[\s\S]*?\*\//g, '');

    for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const declarations = parseDeclarations(match[2]);

      for (const selector of match[1].split(',')) {
        const parsed = selector.trim()
          .match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/);

        if (!parsed || !selector.trim()) {
          continue;
        }

        const parts = parsed[2].match(/[.#][\w-]+/g) || [];

        rules.push({
          tag: parsed[1] || null,
          classes: parts.filter(p => p[0] === '.').map(p => p.slice(1)),
          ids: parts.filter(p => p[0] === '#').map(p => p.slice(1)),
          declarations
        });
      }
    }
  }

  return rules;
}

function parseDeclarations(text) {
  const result = {};

  for (const part of String(text || '').split(';')) {
    const index = part.indexOf(':');

    if (index > 0) {
      result[part.slice(0, index).trim().toLowerCase()] =
        part.slice(index + 1).trim();
    }
  }

  return result;
}

function ownStyle(element, rules) {
  const style = {};

  for (const name of [...INHERITED, 'display', 'opacity', 'clip-path',
    'mask', 'filter']) {
    if (element.hasAttribute(name)) {
      style[name] = element.getAttribute(name).trim();
    }
  }

  const classes = (element.getAttribute('class') || '')
    .split(/\s+/).filter(Boolean);
  const id = element.getAttribute('id');

  for (const rule of rules) {
    if (rule.tag && rule.tag !== element.localName) continue;
    if (!rule.classes.every(c => classes.includes(c))) continue;
    if (!rule.ids.every(i => i === id)) continue;
    if (!rule.tag && !rule.classes.length && !rule.ids.length) continue;

    Object.assign(style, rule.declarations);
  }

  Object.assign(style, parseDeclarations(element.getAttribute('style')));

  return style;
}

function parseNumbers(text) {
  return (String(text || '').match(
    /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g
  ) || []).map(Number);
}

function parseLength(value, fallback = 0) {
  const number = parseFloat(value);

  return Number.isFinite(number) ? number : fallback;
}

function parseTransform(text) {
  const matrix = new paper.Matrix();

  for (const match of String(text || '')
    .matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const values = parseNumbers(match[2]);
    const step = new paper.Matrix();

    switch (match[1]) {
      case 'matrix':
        step.set(...values);
        break;
      case 'translate':
        step.translate(values[0] || 0, values[1] || 0);
        break;
      case 'scale':
        step.scale(values[0], values[1] ?? values[0]);
        break;
      case 'rotate':
        step.rotate(values[0] || 0, new paper.Point(values[1] || 0,
          values[2] || 0));
        break;
      case 'skewX':
        step.skew(values[0] || 0, 0);
        break;
      case 'skewY':
        step.skew(0, values[0] || 0);
        break;
    }

    matrix.append(step);
  }

  return matrix;
}

/*
 * Colour helpers: a shape counts as white (a cut-out) when its fill is
 * light enough that a designer drew it to show the background through.
 */
const NAMED_COLORS = {
  white: [255, 255, 255], black: [0, 0, 0], transparent: null
};

function parseColor(value) {
  const text = String(value).trim().toLowerCase();

  if (Object.hasOwn(NAMED_COLORS, text)) {
    return NAMED_COLORS[text];
  }

  let match = text.match(/^#([0-9a-f]{3,8})$/);

  if (match) {
    let hex = match[1];

    if (hex.length <= 4) {
      hex = [...hex].map(c => c + c).join('');
    }

    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  }

  match = text.match(/^rgba?\(([^)]*)\)$/);

  if (match) {
    return parseNumbers(match[1]).slice(0, 3);
  }

  return [0, 0, 0];
}

function isLight(rgb) {
  const [r, g, b] = rgb.map(v => v / 255);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.85;
}

function shapeItem(element) {
  const attr = name => element.getAttribute(name);
  const num = (name, fallback = 0) => parseLength(attr(name), fallback);

  switch (element.localName) {
    case 'path':
      return attr('d') && attr('d').trim() ?
        new paper.CompoundPath(attr('d')) : null;

    case 'rect': {
      const width = num('width');
      const height = num('height');

      if (width <= 0 || height <= 0) return null;

      let rx = element.hasAttribute('rx') ? num('rx') : null;
      let ry = element.hasAttribute('ry') ? num('ry') : null;

      rx = rx ?? ry ?? 0;
      ry = ry ?? rx;

      return new paper.Path.Rectangle({
        rectangle: [num('x'), num('y'), width, height],
        radius: [Math.min(rx, width / 2), Math.min(ry, height / 2)],
        insert: false
      });
    }

    case 'circle':
      return num('r') > 0 ? new paper.Path.Circle({
        center: [num('cx'), num('cy')], radius: num('r'), insert: false
      }) : null;

    case 'ellipse':
      return num('rx') > 0 && num('ry') > 0 ? new paper.Path.Ellipse({
        center: [num('cx'), num('cy')],
        radius: [num('rx'), num('ry')],
        insert: false
      }) : null;

    case 'polygon':
    case 'polyline': {
      const points = parseNumbers(attr('points'));

      if (points.length < 6) return null;

      const item = new paper.Path({ insert: false, closed: true });

      for (let i = 0; i + 1 < points.length; i += 2) {
        item.add(new paper.Point(points[i], points[i + 1]));
      }

      return item;
    }

    default:
      return null;
  }
}

/*
 * Walk the document in paint order and collect every filled shape with
 * its final transform, fill rule and role (fill or cut-out).
 */
function collectShapes(document, report) {
  const rules = parseStyleSheets(document);
  const root = document.documentElement;
  const byId = new Map();
  const shapes = [];

  (function index(node) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1) {
        if (child.getAttribute('id')) {
          byId.set(child.getAttribute('id'), child);
        }

        index(child);
      }
    }
  })(root);

  function visit(element, inherited, matrix, depth, out = shapes,
    clipping = false, clipped = false) {
    if (depth > 32) {
      report.error('<use> references nest too deep or form a loop');
      return;
    }

    const own = ownStyle(element, rules);
    const style = { ...inherited };

    for (const name of INHERITED) {
      if (own[name] !== undefined && own[name] !== 'inherit') {
        style[name] = own[name];
      }
    }

    if (own.display === 'none' || parseLength(own.opacity, 1) <= 0) {
      return;
    }

    if (own.mask && own.mask !== 'none') {
      report.error(`<${element.localName}> uses a mask; flatten it in ` +
        'the design tool first');
    }

    if (own.filter && own.filter !== 'none') {
      report.warn(`<${element.localName}> has a filter, which is dropped`);
    }

    if (parseLength(own.opacity, 1) < 0.5) {
      report.warn(`<${element.localName}> is semi-transparent ` +
        `(opacity ${own.opacity}) and is drawn solid`);
    }

    const current = matrix.clone().append(
      parseTransform(element.getAttribute('transform'))
    );
    const name = element.localName;
    const clipRef = !clipped && own['clip-path'] &&
      own['clip-path'] !== 'none' ? own['clip-path'] : null;

    /*
     * A clipped element is combined on its own, intersected with the
     * clip region, and added to the artwork as one shape.
     */
    if (clipRef) {
      const id = (clipRef.match(/url\(\s*['"]?#([^'")\s]+)/) || [])[1];
      const clip = id && byId.get(id);

      if (!clip || clip.localName !== 'clipPath') {
        report.error(`clip-path points at a missing clipPath: ${clipRef}`);
        return;
      }

      if (clip.getAttribute('clipPathUnits') === 'objectBoundingBox') {
        report.error('clipPathUnits="objectBoundingBox" is not supported; ' +
          'release the clipping mask in the design tool');
        return;
      }

      const art = [];
      const region = [];
      const clipMatrix = current.clone().append(
        parseTransform(clip.getAttribute('transform'))
      );

      visit(element, inherited, matrix, depth, art, clipping, true);

      for (let child = clip.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) {
          visit(child, {}, clipMatrix, depth + 1, region, true);
        }
      }

      if (art.length && region.length) {
        out.push({
          item: combine(art, report).intersect(combine(region, report),
            { insert: false }),
          light: false
        });
      }

      return;
    }

    if (name === 'use') {
      const href = (element.getAttribute('href') ||
        element.getAttribute('xlink:href') || '').replace(/^#/, '');
      const target = byId.get(href);

      if (!target) {
        report.error(`<use> points at a missing element "#${href}"`);
        return;
      }

      const offset = new paper.Matrix().translate(
        parseLength(element.getAttribute('x')),
        parseLength(element.getAttribute('y'))
      );

      visit(target, style, current.clone().append(offset), depth + 1, out,
        clipping);
      return;
    }

    if (name === 'g' || name === 'a' || element === root) {
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) {
          visit(child, style, current, depth, out, clipping);
        }
      }
      return;
    }

    if (element.namespaceURI &&
      element.namespaceURI !== 'http://www.w3.org/2000/svg') {
      return;
    }

    if (UNSUPPORTED.has(name)) {
      report.error(`<${name}> cannot go into an icon font; convert it ` +
        'to outlined paths in the design tool');
      return;
    }

    if (IGNORED.has(name)) {
      return;
    }

    if (!SHAPES.has(name)) {
      report.warn(`unknown element <${name}> is ignored`);
      return;
    }

    if (style.visibility === 'hidden' || style.visibility === 'collapse') {
      return;
    }

    // Inside a clipPath only the geometry counts, never the paint.
    if (clipping) {
      const item = shapeItem(element);

      if (item) {
        for (const child of item.children || [item]) {
          child.closed = true;
        }

        item.transform(current);
        item.fillRule = style['clip-rule'] === 'evenodd' ?
          'evenodd' : 'nonzero';
        out.push({ item, light: false });
      }

      return;
    }

    const fill = (style.fill ?? 'black').trim();
    const stroke = (style.stroke ?? 'none').trim();
    const strokeWidth = parseLength(style['stroke-width'], 1);
    const hasStroke = stroke !== 'none' && stroke !== 'transparent' &&
      strokeWidth > 0;
    const hasFill = fill !== 'none' && fill !== 'transparent' &&
      parseLength(style['fill-opacity'], 1) > 0;

    if (!hasFill || name === 'line') {
      if (hasStroke) {
        report.error(`<${name}> is drawn with a stroke only; outline the ` +
          'stroke in the design tool (Outline Stroke / Stroke to Path)');
      }
      return;
    }

    if (hasStroke) {
      report.warn(`<${name}> has a stroke, which the font drops (only the ` +
        'fill is kept)');
    }

    if (/^url\(/.test(fill)) {
      report.warn(`<${name}> has a gradient or pattern fill, drawn solid`);
    } else if (parseLength(style['fill-opacity'], 1) < 0.5) {
      report.warn(`<${name}> has a semi-transparent fill, drawn solid`);
    }

    const item = shapeItem(element);

    if (!item) {
      return;
    }

    for (const child of item.children || [item]) {
      child.closed = true;
    }

    item.transform(current);
    item.fillRule = style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero';

    const color = /^url\(/.test(fill) ? [0, 0, 0] : parseColor(fill);

    out.push({
      item,
      light: Boolean(color) && isLight(color)
    });
  }

  visit(root, {}, new paper.Matrix(), 0);

  return shapes;
}

function readViewBox(root, report) {
  const values = parseNumbers(root.getAttribute('viewBox'));

  if (values.length === 4 && values[2] > 0 && values[3] > 0) {
    return values;
  }

  const width = parseLength(root.getAttribute('width'));
  const height = parseLength(root.getAttribute('height'));

  if (width > 0 && height > 0) {
    report.warn('no viewBox; using width and height');
    return [0, 0, width, height];
  }

  report.error('no valid viewBox, width or height');
  return null;
}

/*
 * Paint the shapes in order: dark shapes are added, light shapes drawn
 * over existing artwork are cut out. Each step is a boolean operation, so
 * the result is one outline that fills correctly with the nonzero rule.
 */
function combine(shapes, report) {
  let result = null;
  let cutouts = 0;

  for (const shape of shapes) {
    // A white shape with no artwork under it is part of the icon itself.
    shape.cut = Boolean(result) && shape.light &&
      result.bounds.intersects(shape.item.bounds);

    if (!result) {
      result = shape.item.unite(new paper.Path({ insert: false }),
        { insert: false });
    } else if (shape.cut) {
      result = result.subtract(shape.item, { insert: false });
      cutouts++;
    } else {
      result = result.unite(shape.item, { insert: false });
    }
  }

  if (cutouts) {
    report.warn(`${cutouts} white shape(s) drawn over the artwork were ` +
      'cut out of it');
  }

  return result;
}

/*
 * Scanline winding: for one horizontal line, the x positions where an
 * outline crosses it and the direction of each crossing. Curves are split
 * into y-monotone pieces, and each piece counts on a half-open y range so
 * a line through a vertex is not counted twice.
 */
function monoCurves(item) {
  const curves = [];

  for (const path of item.children || [item]) {
    for (const curve of path.curves) {
      for (const v of paper.Curve.getMonoCurves(curve.getValues(), false)) {
        if (v[1] !== v[7]) {
          curves.push(v);
        }
      }
    }
  }

  return curves;
}

function crossings(curves, y) {
  const result = [];
  const roots = [];

  for (const v of curves) {
    const up = v[7] > v[1];
    const low = up ? v[1] : v[7];
    const high = up ? v[7] : v[1];

    if (y < low || y >= high) {
      continue;
    }

    const count = paper.Curve.solveCubic(v, 1, y, roots, 0, 1);
    const t = count > 0 ? roots[0] : (Math.abs(v[1] - y) <
      Math.abs(v[7] - y) ? 0 : 1);

    result.push({ x: paper.Curve.getPoint(v, t).x, dir: up ? 1 : -1 });
  }

  return result.sort((a, b) => a.x - b.x);
}

/*
 * Fill state of each sample on a row: winding is the sum of the crossing
 * directions to the left of the sample.
 */
function rowFill(curves, evenodd, y, xs) {
  const list = crossings(curves, y);
  const filled = new Array(xs.length);
  let index = 0;
  let winding = 0;

  for (let i = 0; i < xs.length; i++) {
    while (index < list.length && list[index].x < xs[i]) {
      winding += list[index++].dir;
    }

    filled[i] = evenodd ? Math.abs(winding) % 2 === 1 : winding !== 0;
  }

  return filled;
}

/*
 * Compare the rebuilt outline with the original artwork on a grid of
 * sample points. The artwork is painted in order (the last shape that
 * covers a point decides, with its own fill rule); the rebuilt outline is
 * filled the way the font fills it (nonzero).
 */
function compare(shapes, result, viewBox) {
  const [x, y, width, height] = viewBox;
  const xs = Array.from({ length: SAMPLES },
    (_, i) => x + (i + 0.5) * width / SAMPLES);
  const painted = shapes.map(shape => ({
    curves: monoCurves(shape.item),
    evenodd: shape.item.fillRule === 'evenodd',
    bounds: shape.item.bounds,
    cut: shape.cut
  }));
  const rebuilt = monoCurves(result);
  let total = 0;
  let mismatched = 0;

  for (let j = 0; j < SAMPLES; j++) {
    const rowY = y + (j + 0.5) * height / SAMPLES;
    const expected = new Array(SAMPLES).fill(false);

    for (const shape of painted) {
      if (rowY < shape.bounds.top || rowY > shape.bounds.bottom) {
        continue;
      }

      const filled = rowFill(shape.curves, shape.evenodd, rowY, xs);

      for (let i = 0; i < SAMPLES; i++) {
        if (filled[i]) expected[i] = !shape.cut;
      }
    }

    const actual = rowFill(rebuilt, false, rowY, xs);

    for (let i = 0; i < SAMPLES; i++) {
      total += expected[i];
      mismatched += expected[i] !== actual[i];
    }
  }

  return total ? mismatched / total : (mismatched ? 1 : 0);
}

function round(value) {
  return Number(value.toFixed(PRECISION));
}

function prepare(file, source, report) {
  let parseError = null;
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') parseError = message;
    }
  }).parseFromString(source, 'image/svg+xml');
  const root = document && document.documentElement;

  if (parseError || !root || root.localName !== 'svg') {
    report.error(`not a readable SVG file${parseError ?
      `: ${String(parseError).split('\n')[0]}` : ''}`);
    return null;
  }

  const viewBox = readViewBox(root, report);

  if (!viewBox) {
    return null;
  }

  const shapes = collectShapes(document, report);

  if (report.failed) {
    return null;
  }

  if (!shapes.length) {
    report.error('the icon has no filled shapes');
    return null;
  }

  const result = combine(shapes, report);

  if (!result || result.isEmpty() || !(Math.abs(result.area) > 0)) {
    report.error('the icon is empty after combining its shapes');
    return null;
  }

  const mismatch = compare(shapes, result, viewBox);
  const percent = (mismatch * 100).toFixed(2);

  if (mismatch > MISMATCH_ERROR) {
    report.error(`the rebuilt outline differs from the artwork by ` +
      `${percent}%; simplify overlapping shapes in the design tool`);
    return null;
  }

  if (mismatch > MISMATCH_WARN) {
    report.warn(`the rebuilt outline differs from the artwork by ${percent}%`);
  }

  const [vx, vy, vw, vh] = viewBox;
  const bounds = result.bounds;
  const tolerance = Math.max(vw, vh) * 0.01;

  if (bounds.left < vx - tolerance || bounds.top < vy - tolerance ||
    bounds.right > vx + vw + tolerance ||
    bounds.bottom > vy + vh + tolerance) {
    report.warn('artwork reaches outside the viewBox');
  }

  if (vw / vh > MAX_ASPECT || vh / vw > MAX_ASPECT) {
    report.warn(`very wide or tall (${round(vw / vh)}:1); it will look ` +
      'small next to the other icons');
  }

  const data = result.getPathData(null, PRECISION);

  if (!data || /NaN|Infinity/.test(data)) {
    report.error('path conversion failed');
    return null;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${
    viewBox.map(round).join(' ')}"><path d="${data}"/></svg>\n`;
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`No icons folder: ${SOURCE_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let cache = {};

  if (!force && fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      cache = {};
    }
  }

  const files = fs.readdirSync(SOURCE_DIR)
    .filter(file => file.toLowerCase().endsWith('.svg'))
    .sort();
  const names = new Map();
  const nextCache = {};
  let errors = 0;
  let warnings = 0;
  let built = 0;

  for (const file of files) {
    const name = file.slice(0, -4);
    const messages = [];
    const report = {
      failed: false,
      error(message) {
        this.failed = true;
        messages.push(['error', message]);
      },
      warn(message) {
        messages.push(['warn', message]);
      }
    };

    if (!NAME_PATTERN.test(name)) {
      report.error('file name must be lower-case letters, digits and ' +
        `single hyphens, like bank-melli.svg (suggested: ${
          name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')}.svg)`);
    } else if (names.has(name.toLowerCase())) {
      report.error(`same name as ${names.get(name.toLowerCase())}`);
    }

    names.set(name.toLowerCase(), file);

    const source = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
    const key = hash(scriptHash + source);
    const output = path.join(OUTPUT_DIR, file);
    const cached = cache[file];

    if (!report.failed && cached && cached.key === key &&
      fs.existsSync(output)) {
      nextCache[file] = cached;
      for (const message of cached.messages) messages.push(message);
    } else if (!report.failed) {
      const result = prepare(file, source, report);

      paper.project.clear();

      if (result) {
        fs.writeFileSync(output, result, 'utf8');
        nextCache[file] = { key, messages };
        built++;
      }
    }

    if (report.failed) {
      fs.rmSync(output, { force: true });
    }

    const counted = new Map();

    for (const [level, message] of messages) {
      const key = `${level === 'error' ? 'ERROR' : 'warn '} ${file}: ${message}`;

      counted.set(key, (counted.get(key) || 0) + 1);
      if (level === 'error') errors++; else warnings++;
    }

    for (const [line, count] of counted) {
      console.log(count > 1 ? `${line} (${count} times)` : line);
    }
  }

  // Remove output for icons that no longer exist in icons/.
  for (const file of fs.readdirSync(OUTPUT_DIR)) {
    if (!files.includes(file)) {
      fs.rmSync(path.join(OUTPUT_DIR, file), { force: true });
    }
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(nextCache, null, 2) + '\n');

  console.log('');
  console.log(`Icons: ${files.length}, rebuilt: ${built}, ` +
    `warnings: ${warnings}, errors: ${errors}`);

  if (errors) {
    console.error('Fix the errors above before building the font.');
    process.exit(1);
  }
}

main();
