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
- `js/main.js` - hero viewport (Three.js), pricing demo, negotiation demo, supply demo, trial form
- `assets/logo.svg` - mark

External dependencies load from CDNs: Three.js 0.160 from cdnjs, Archivo and IBM Plex Mono from Google Fonts.

## Placeholders to replace

Search the HTML for `Placeholder` comments. Customer wordmarks, the shop list, the quote-time figures, and plan prices are stand-ins until pilot data exists. The trial and login forms have no backend yet.

## Working on it

Branch from `main`, open a pull request, merge when the checks are green. Vercel posts a preview link on every PR; the buyer app is at `/app` and the shop app at `/app/shop` on that preview.

```
npm install          # once, installs jsdom for the tests
npm run check        # scripts parse, local asset links resolve, landing copy follows house style
npm test             # drives the buyer and shop apps headlessly and checks the main flows
```

The same two commands run in GitHub Actions on every pull request and on every push to `main` (`.github/workflows/pr.yml`). The PR template lists what to fill in.
