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
