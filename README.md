# Canyon

AI-native marketplace for custom machined parts. Upload a STEP file, get a price band and lead time from the model itself, and let a buyer agent negotiate with verified shop agents.

## Landing page

Static site, no build step.

```
python3 -m http.server 8080
```

Then open http://localhost:8080. The page needs a local server (not `file://`) because `js/main.js` is an ES module.

Files:

- `index.html` - landing page
- `login.html` - customer login
- `css/styles.css` - design tokens and layout
- `js/main.js` - hero viewport (Three.js) with one camera pose per section, audience toggle, staggered scroll reveals, the steps rail, the two negotiation threads, the demo video slot, trial form
- `assets/logo.svg` - mark

External dependencies load from CDNs: Three.js 0.160 from cdnjs, Archivo and IBM Plex Mono from Google Fonts.

## Placeholders to replace

Search the HTML for `Placeholder` comments. The wordmark strip and the plan prices are stand-ins until pilot data exists. The trial and login forms have no backend yet.

**The demo video.** `#video` carries the Loom walkthrough (about seven minutes, 4:3) in `data-src`. To swap it, change that URL: Loom, YouTube and Vimeo embed URLs all work, and the script adds the right autoplay parameter. Emptying it hides the play button.

**Numbers.** The landing page is written in words on purpose: the only figures on it are the pricing plan and the demo length. Every number behind the copy (bands, quotes, the negotiation, the cost model) lives in the consoles (`app/buyer.js`, `app/shop/shop.js`) and in the demo, so the landing page can never disagree with them.

## Working on it

Branch from `main`, open a pull request, merge when the checks are green. Vercel posts a preview link on every PR; the buyer app is at `/app` and the shop app at `/app/shop` on that preview.

```
npm install          # once, installs jsdom for the tests
npm run check        # scripts parse, local asset links resolve, landing copy follows house style
npm test             # drives the buyer and shop apps headlessly and checks the main flows
```

The same two commands run in GitHub Actions on every pull request and on every push to `main` (`.github/workflows/pr.yml`). The PR template lists what to fill in.
