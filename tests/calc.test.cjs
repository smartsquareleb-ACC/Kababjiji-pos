// Money and bread maths. Run: node --test tests/*.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const C = require("../public/js/calc.js");
const rate = 89500, lpb = 6;

test("prices in USD convert to LBP at the rate", () => {
  assert.strictEqual(C.priceL({ amount: 6, cur: "USD" }, rate), 537000);
  assert.strictEqual(C.priceL({ amount: 150000, cur: "LBP" }, rate), 150000);
});

test("change: customer pays $20 for 1,574,000 LBP", () => {
  const c = C.change(1574000, 20, 0, rate, "lbp");
  assert.strictEqual(c.change, 216000);
  assert.strictEqual(c.changeLBP, 216000);
  const m = C.change(587000, 20, 0, rate, "mix"); // 1,203,000 change = $13 + 39,500
  assert.deepStrictEqual([m.changeUSD, m.changeLBP], [13, 39500]);
  assert.strictEqual(C.change(587000, 5, 0, rate, "lbp").owed, 139500);
});

test("bread split into bundles and loose loaves", () => {
  assert.deepStrictEqual(C.splitBread(117, lpb), { bundles: 19, loose: 3 });
});

const day = { startBundles: 20, startLoose: 0, addedLoaves: 0, openUSD: 0, openLBP: 1000000 };
const sale = (lines, paidUSD, paidLBP, changeLBP) => ({ lines, totalL: lines.reduce((a, l) => a + l.priceL * l.qty, 0), paidUSD, paidLBP, changeUSD: 0, changeLBP, void: false });
const sw = q => ({ name: "Meat Shawarma", qty: q, priceL: 537000, bread: 1 });
const pepsi = q => ({ name: "Pepsi", qty: q, priceL: 150000, bread: 0 });

test("day summary, bread check and drawer check find a shortage", () => {
  const sales = [sale([sw(2), pepsi(1)], 20, 0, 566000), sale([sw(1)], 0, 537000, 0), { ...sale([sw(1)], 0, 537000, 0), void: true }];
  const s = C.summary(day, sales, lpb);
  assert.strictEqual(s.orders, 2);
  assert.strictEqual(s.breadSold, 3);
  assert.strictEqual(s.breadLeft, 117);
  assert.strictEqual(s.expUSD, 20);
  assert.strictEqual(s.expLBP, 1000000 - 566000 + 537000);
  // counted 19 bundles + 1 loose = 115 loaves, so 5 used for 3 sold: 2 missing
  const b = C.breadCheck({ ...day, breadCount: { bundles: 19, loose: 1 } }, s, lpb);
  assert.strictEqual(b.missing, 2);
  assert.strictEqual(b.missingL, 1074000);
  const c = C.cashCheck({ ...day, cashCount: { usd: 20, lbp: 500000 } }, s, rate, b);
  assert.strictEqual(c.diff, 500000 - 971000);
  assert.strictEqual(C.verdict(c.diff, 10000), "short");
  assert.strictEqual(c.byBread, 1000000 + 5 * 537000 + 150000);
});

test("a bread count higher than the day's stock is flagged, not turned into negative loaves", () => {
  const s = C.summary(day, [], lpb);
  const b = C.breadCheck({ ...day, breadCount: { bundles: 50, loose: 0 } }, s, lpb, 537000);
  assert.strictEqual(b.invalid, true);
  const c = C.cashCheck({ ...day, cashCount: { usd: 98, lbp: 0 } }, s, rate, b);
  assert.strictEqual(c.byBread, undefined);
});

test("leftover bread, moves and waste: kept bread is stock, moved and wasted bread is not", () => {
  const d = { carried: 10, startBundles: 5, startLoose: 0, addedLoaves: 6, breadMoves: [{ type: "move", loaves: 4 }, { type: "waste", loaves: 2 }] };
  assert.strictEqual(C.breadTotal(d, lpb), 10 + 30 + 6 - 6);
});

test("open checks hold bread: not missing, not expected in the drawer yet", () => {
  const checks = [{ lines: [sw(2)] }];
  const s = C.summary(day, [sale([sw(1)], 0, 537000, 0)], lpb, checks);
  assert.strictEqual(s.breadLeft, 120 - 1 - 2);
  assert.strictEqual(s.checksL, 1074000);
  const b = C.breadCheck({ ...day, breadCount: { bundles: 19, loose: 3 } }, s, lpb); // 117 left -> 3 used = 1 sold + 2 on checks
  assert.strictEqual(b.missing, 0);
  const c = C.cashCheck({ ...day, cashCount: { usd: 0, lbp: 1537000 } }, s, rate, b);
  assert.strictEqual(c.diffBread, 0);
});

test("debts: bread used and counted as a sale, but no money expected until it is paid", () => {
  const debtSale = { ...sale([sw(2)], 0, 0, 0), debt: true };
  const s = C.summary(day, [sale([sw(1)], 0, 537000, 0), debtSale], lpb);
  assert.strictEqual(s.orders, 2);
  assert.strictEqual(s.debtL, 1074000);
  assert.strictEqual(s.expLBP, 1000000 + 537000);
  const b = C.breadCheck({ ...day, breadCount: { bundles: 19, loose: 3 } }, s, lpb);
  assert.strictEqual(b.missing, 0);
  const c = C.cashCheck({ ...day, cashCount: { usd: 0, lbp: 1537000 } }, s, rate, b);
  assert.strictEqual(c.diff, 0);
  assert.strictEqual(c.diffBread, 0);
  // Paid on another day: drawer money, not a sale, no bread.
  const pay = { lines: [], totalL: 1074000, paidUSD: 0, paidLBP: 1074000, changeUSD: 0, changeLBP: 0, debtPay: "d1" };
  const s2 = C.summary(day, [pay], lpb);
  assert.strictEqual(s2.orders, 0);
  assert.strictEqual(s2.totalL, 0);
  assert.strictEqual(s2.expLBP, 1000000 + 1074000);
  assert.strictEqual(s2.breadSold, 0);
});
