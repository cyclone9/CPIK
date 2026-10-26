<div dir="rtl">

# CPIK - CyClone Power Icon Kit

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/cpik-lockup-on-dark.svg"><img src="assets/cpik-lockup-on-light.svg" alt="CPIK" width="300"></picture></p>

نسخه‌ی 0.1.3. تغییرات را در [CHANGELOG.md](CHANGELOG.md) ببینید.

**برندهای ایرانی، در یک کیت آیکون.**

کیت CPIK آیکون بانک‌ها، پلتفرم‌ها، سرویس‌ها و برندهای ایرانی را یک‌جا می‌دهد. یک فایل استایل را لینک کنید تا هر آیکون با یک نام کلاس در دسترس باشد؛ در هر اندازه‌ای واضح می‌ماند و مثل متن کنارش با CSS رنگ می‌گیرد. لوگوها متعلق به صاحبانشان است.

همه‌ی آیکون‌ها را در صفحه‌ی پیش‌نمایش ببینید و جستجو کنید: https://cyclone9.github.io/CPIK/

## شروع سریع

۱. فایل `cpik-<version>.zip` را از [آخرین نسخه‌ی منتشرشده](https://github.com/cyclone9/CPIK/releases/latest) دانلود کنید.

۲. فایل‌های `cpik.css`، `cpik.woff2` و `cpik.woff` را کنار هم در یک پوشه از سایت بگذارید؛ مثلاً `assets/cpik/`.

۳. فایل استایل را در `<head>` صفحه لینک کنید:

<div dir="ltr">

```html
<link rel="stylesheet" href="./assets/cpik/cpik.css">
```

</div>

۴. کلاس آیکون را به یک المان بدهید:

<div dir="ltr">

```html
<i class="cpik-cpik" aria-hidden="true"></i>
```

</div>

هر آیکون فقط یک کلاس دارد: `cpik-` و بعد نام آیکون. دکمه‌ی کپی روی هر کارت در صفحه‌ی پیش‌نمایش، کد HTML همان آیکون را می‌دهد.

### از CDN یا npm

بدون دانلود هم می‌توانید فایل استایل را از jsDelivr لینک کنید. نسخه را ثابت بگذارید، چون تا نسخه‌ی ۱.۰.۰ ممکن است نام کلاسی عوض شود:

<div dir="ltr">

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@cyclone9/cpik@0.1.3/dist/cpik.css">
```

</div>

در پروژه‌ای که ابزار build دارد، بسته را نصب کنید و `@cyclone9/cpik/cpik.css` را import کنید:

<div dir="ltr">

```sh
npm install @cyclone9/cpik
```

</div>

## اندازه و رنگ

آیکون یک کاراکتر از فونت است و مثل متن اطرافش رفتار می‌کند. اندازه را با `font-size` و رنگ را با `color` تنظیم کنید:

<div dir="ltr">

```css
.cpik-cpik {
  font-size: 48px;
  color: #4A5CF0;
}
```

</div>

اگر دکمه‌ای فقط آیکون دارد، به خود دکمه یک نام دسترس‌پذیر بدهید؛ آیکون از صفحه‌خوان‌ها پنهان است:

<div dir="ltr">

```html
<button type="button" aria-label="Pay with Bank Melli">
  <i class="cpik-bank-melli" aria-hidden="true"></i>
</button>
```

</div>

## آیکون‌ها

نام هر آیکون با دسته‌ی آن شروع می‌شود:

| پیشوند | دسته |
|---|---|
| `bank-` | بانک‌ها |
| `finance-` | پرداخت |
| `crypto-` | صرافی‌های رمزارز |
| `shop-` | فروشگاه‌ها |
| `platform-` | پلتفرم‌های ویدیو |
| `channel-` | شبکه‌های تلویزیونی |
| `news-` | خبری |
| `socialmedia-` | شبکه‌های اجتماعی |
| `map-` | نقشه‌ها |

چند آیکون پیشوند ندارند، مثل `irancell`، `rightel`، `post` و `tipax`. فهرست همه‌ی آیکون‌ها با کدپوینتشان در `cpik.json` است.

کدپوینت هر آیکون هیچ‌وقت عوض نمی‌شود و کدپوینت آیکونی که حذف شده به آیکون دیگری داده نمی‌شود؛ پس با به‌روز کردن کیت، آیکون‌های صفحه‌هایتان جابه‌جا نمی‌شوند.

## ساختن از روی سورس

به Node.js نسخه‌ی ۲۴ یا بالاتر نیاز دارد.

<div dir="ltr">

```sh
npm ci
npm run build              # writes the font, the stylesheet and the preview page to dist/
npm run preview -- 8080    # serves dist/ on http://127.0.0.1:8080
```

</div>

برای افزودن آیکون:

۱. آن را به‌صورت SVG تک‌رنگ در پوشه‌ی `icons/` ذخیره کنید، با نام `<prefix>-<name>.svg` و فقط با حروف کوچک لاتین، رقم و خط تیره.

۲. نام فارسی و انگلیسی و کلیدواژه‌های جستجوی آن را به `config/metadata.json` اضافه کنید.

۳. دستور `npm run build` را اجرا کنید.

فونت فقط شکل‌های پرشده را نگه می‌دارد؛ برای همین هر SVG پیش از ساخت فونت بررسی و به یک مسیر واحد تبدیل می‌شود. ساخت، پرشدگی evenodd، شکل‌های روی هم، تبدیل‌ها (transform)، clip path و شکل‌های سفیدی را که روی طرح کشیده شده‌اند خودش درست می‌کند و نتیجه را با طرح اصلی مقایسه می‌کند. اگر SVG چیزی داشته باشد که فونت نمی‌تواند نشان دهد، مثل تصویر، متن، ماسک یا شکلی که فقط با خط دور (stroke) کشیده شده، ساخت با پیامی که نام فایل را می‌گوید متوقف می‌شود. آن بخش را در نرم‌افزار طراحی به مسیر تبدیل کنید و دوباره بسازید.

## مجوز

کد، فایل‌های فونت و فایل استایل کیت با مجوز MIT منتشر شده‌اند، Copyright (c) 2026 CyClone (https://cyclone9.ir). متن کامل مجوز در [LICENSE](LICENSE) است.

مجوز MIT شامل لوگوهای داخل کیت نمی‌شود. هر لوگو علامت تجاری صاحب آن است. کیت CPIK فقط آن‌ها را نمایش می‌دهد و استفاده از هر لوگو به معنای همکاری با آن برند نیست. لوگوی CPIK در پوشه‌ی [assets/](assets/) متعلق به CyClone است و همه‌ی حقوق آن محفوظ است. فونت وزیرمتن که صفحه‌ی پیش‌نمایش از آن استفاده می‌کند، مجوز SIL Open Font License دارد ([assets/fonts/OFL.txt](assets/fonts/OFL.txt)).

</div>
