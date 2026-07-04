Archive only — not read at runtime. `roster/index.html` never references
this folder; only `scraper/scrape_kt.js` (writes here) and
`scraper/write_firebase_kt.js` (reads from here to push into Firebase)
touch it. Firebase is the sole runtime source for the deployed app.
