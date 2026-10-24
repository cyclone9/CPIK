# CPIK - CyClone Power Icon Kit

[فارسی](README.md) | [English](README.en.md)

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/cpik-lockup-on-dark.svg"><img src="assets/cpik-lockup-on-light.svg" alt="CPIK" width="300"></picture></p>

Version 0.1.0. See [CHANGELOG.md](CHANGELOG.md).

**Iranian brands. One icon kit.**

CPIK is an icon kit of Iranian banks, platforms, services and brands. Link one stylesheet and each icon is a class name away, sharp at any size and coloured with CSS like the text beside it. The logos belong to their owners.

Browse and search every icon on the preview page: https://cyclone9.github.io/CPIK/

## Quick start

1. Download `cpik-<version>.zip` from the [latest release](https://github.com/cyclone9/CPIK/releases/latest).
2. Put `cpik.css`, `cpik.woff2` and `cpik.woff` together in one folder of your site, for example `assets/cpik/`.
3. Link the stylesheet in the page's `<head>`:

```html
<link rel="stylesheet" href="./assets/cpik/cpik.css">
```

4. Give an element the icon's class:

```html
<i class="cpik-bank-melli" aria-hidden="true"></i>
```

Every icon is a single class, `cpik-` followed by the icon's name. The copy button on each card of the preview page gives you the exact HTML.

### From a CDN or npm

Without downloading anything, link the stylesheet from jsDelivr. Pin the version, because a class can still change before 1.0.0:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/cpik@0.1.0/dist/cpik.css">
```

With a build tool, install the package and import `cpik/cpik.css`:

```sh
npm install cpik
```

## Size and colour

An icon is a character of the font, so it follows the text around it. Set the size with `font-size` and the colour with `color`:

```css
.cpik-cpik {
  font-size: 48px;
  color: #4A5CF0;
}
```

When a button shows only an icon, give the button itself an accessible name, because the icon is hidden from screen readers:

```html
<button type="button" aria-label="Pay with Bank Melli">
  <i class="cpik-bank-melli" aria-hidden="true"></i>
</button>
```

## Icons

Icon names start with their category:

| Prefix | Category |
|---|---|
| `bank-` | Banks |
| `finance-` | Payments |
| `crypto-` | Crypto exchanges |
| `shop-` | Shops |
| `platform-` | Video platforms |
| `channel-` | TV channels |
| `news-` | News |
| `socialmedia-` | Social media |
| `map-` | Maps |

A few icons have no prefix, such as `irancell`, `rightel`, `post` and `tipax`. `cpik.json` lists every icon with its codepoint.

An icon's codepoint never changes, and a removed icon's codepoint is never given to another one, so updating the kit does not swap icons on your pages.

## Building from source

Requires Node.js 24 or later.

```sh
npm ci
npm run build              # writes the font, the stylesheet and the preview page to dist/
npm run preview -- 8080    # serves dist/ on http://127.0.0.1:8080
```

To add an icon:

1. Save it as a one-colour SVG in `icons/`, named `<prefix>-<name>.svg` in lower-case letters, digits and hyphens.
2. Add its Persian and English names and its search keywords to `config/metadata.json`.
3. Run `npm run build`.

Before the font is built, every SVG is checked and rebuilt into a single outline, because a font keeps only filled shapes. The build fixes evenodd fills, overlapping shapes, transforms, clip paths and white shapes drawn over the artwork, then compares the result with the original. It stops with a message naming the file when an SVG uses something a font cannot show: images, text, masks, or shapes drawn only with a stroke. Outline those in the design tool and build again.

## License

The kit's code, font files and stylesheet are released under the MIT License, Copyright (c) 2026 CyClone (https://cyclone9.ir). The full text is in [LICENSE](LICENSE).

The MIT License does not cover the logos inside the kit. Each logo is a trademark of its owner. CPIK only displays them, and using one does not imply a partnership with the brand. The CPIK logo in [assets/](assets/) belongs to CyClone, all rights reserved. Vazirmatn, used by the preview page, is under the SIL Open Font License ([assets/fonts/OFL.txt](assets/fonts/OFL.txt)).
