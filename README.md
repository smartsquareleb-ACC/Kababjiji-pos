# Kabab Jiji POS

Till for Kabab Jiji (Batroun, tel 81536003). Shawarma sandwiches, fries and drinks, priced in USD and LBP.

- **Cashier** (Abdallah): the Sell screen only. Big buttons, change calculator in $ and LBP, receipt. No totals, bread stock, cash check or settings.
- **Owner**: everything. Start the day (bread bundles + starting cash), add bread, count bread left, count the drawer, sales by item, void orders, close the day, past days, dollar rate, menu and prices, people.

The point of it: catch cash shortages. Every sandwich uses one loaf, so bread used × sandwich price + drinks and fries + float = what should be in the drawer, next to the check against recorded sales.

## Code layout
Plain static web app in `public/`, no build step (same setup as BF Diesel):
- `js/calc.js`: money and bread maths (pure functions, tested in `tests/`).
- `js/store.js`: Firestore in live mode, browser storage in demo mode.
- `js/app.js`: the screens.
- `assets/`: logo, header mark, app icons.

## Run locally
Serve `public/` with any static server (e.g. `npx serve public`). With an empty `apiKey` in `public/js/firebase-config.js` it runs in **demo mode** (owner/cashier switch in the header, data saved in the browser).
Tests: `node --test tests/*.test.cjs`.

## Live
Firebase project `kababjiji-pos`. Every push to `main` runs the tests and deploys hosting and Firestore rules (`.github/workflows/deploy.yml`, secret `FIREBASE_SERVICE_ACCOUNT`). Open apps reload to the new version within 5 minutes or when brought back to the screen. Menu, prices, rate and sales sync live on every device.

The first account created in the app becomes the owner. Everyone after that waits until the owner gives them a role in Settings → People, or the owner adds them there directly.

## Data (Firestore)
`settings/main {rate, lpb, tol}`, `menu {name, ar, amount, cur, bread, color, big, order}`, `state/current {dayId}`, `days {startBundles, startLoose, addedLoaves, openUSD, openLBP, breadCount, cashCount, status, summary}`, `sales {dayId, no, t, lines, totalL, rate, paidUSD, paidLBP, changeUSD, changeLBP, void, by, byName, at}`, `users {name, email, role: pending|cashier|owner|blocked}`. Rules in `firestore.rules`: cashiers read the menu and add their own sales; days, totals and everything else are owner only.
