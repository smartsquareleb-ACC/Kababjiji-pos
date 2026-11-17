// Money and bread maths for Kabab Jiji. Pure functions: used by the app and by the tests in node.
// All money is kept in whole LBP. A sale stores the dollar rate it was made at.
(function (root) {
  const C = {};

  C.priceL = (item, rate) => item.cur === "USD" ? Math.round(item.amount * rate) : Math.round(item.amount);

  // 125 loaves at 6 a bundle -> 20 bundles + 5 loose
  C.splitBread = (n, lpb) => {
    const sign = n < 0 ? -1 : 1, a = Math.abs(n);
    return { bundles: sign * Math.floor(a / lpb), loose: sign * (a % lpb) };
  };

  // What the customer gave, and the change to give back.
  // mode: "lbp" all change in lira, "mix" whole dollars + the rest in lira, "usd" all in dollars.
  C.change = (totalL, paidUSD, paidLBP, rate, mode) => {
    const paid = Math.round(paidLBP || 0) + Math.round((paidUSD || 0) * rate);
    const ch = paid - totalL;
    let usd = 0, lbp = ch;
    if (ch > 0 && mode === "mix") { usd = Math.floor(ch / rate); lbp = ch - Math.round(usd * rate); }
    if (ch > 0 && mode === "usd") { usd = Math.round(ch / rate * 100) / 100; lbp = 0; }
    return { paid, change: ch, owed: ch < 0 ? -ch : 0, changeUSD: ch > 0 ? usd : 0, changeLBP: ch > 0 ? lbp : 0 };
  };

  // Bread in the shop today: kept from yesterday + new bread at the start + deliveries, minus bread moved to the
  // main shop or thrown away. Moved and wasted loaves never count as sandwiches, so they stay out of the cash check.
  C.breadOut = day => (day && day.breadMoves || []).reduce((a, m) => a + (m.loaves || 0), 0);
  C.breadTotal = (day, lpb) => day ? (day.carried || 0) + (day.startBundles || 0) * lpb + (day.startLoose || 0) + (day.addedLoaves || 0) - C.breadOut(day) : 0;

  // Everything the owner needs about one day, from the day document and its sales.
  C.summary = (day, sales, lpb, checks) => {
    const live = (sales || []).filter(s => !s.void);
    let totalL = 0, breadSold = 0, inUSD = 0, inLBP = 0, breadQ = 0, breadM = 0, otherL = 0, debtL = 0, debtPaidL = 0, debts = 0, orders = 0;
    const byItem = {};
    for (const s of live) {
      inUSD += (s.paidUSD || 0) - (s.changeUSD || 0);
      inLBP += (s.paidLBP || 0) - (s.changeLBP || 0);
      // An old debt paid today: money comes into the drawer, but it is not a new sale and uses no bread.
      if (s.debtPay) { debtPaidL += s.totalL; continue; }
      orders++; totalL += s.totalL;
      // Sold on debt today: bread is used and it is a sale, but no money is in the drawer.
      if (s.debt) { debtL += s.totalL; debts++; }
      for (const l of s.lines) {
        const m = l.priceL * l.qty;
        const k = byItem[l.name] || (byItem[l.name] = { qty: 0, totalL: 0 });
        k.qty += l.qty; k.totalL += m;
        if (l.bread > 0) { breadSold += l.bread * l.qty; breadQ += l.bread * l.qty; breadM += m; } else otherL += m;
      }
    }
    // Sandwiches on open checks (eaten, not paid yet) use bread but no money is in the drawer yet.
    let checkBread = 0, checksL = 0;
    for (const c of checks || []) for (const l of c.lines) { checkBread += (l.bread || 0) * l.qty; checksL += l.priceL * l.qty; }
    const breadTotal = C.breadTotal(day, lpb);
    return {
      orders, totalL, debts, debtL, debtPaidL, breadTotal, breadSold, breadLeft: breadTotal - breadSold - checkBread,
      openChecks: (checks || []).length, checkBread, checksL,
      inUSD, inLBP, byItem, otherL,
      // money one loaf should bring in: the average price of bread items sold today
      loafL: breadQ ? breadM / breadQ : null,
      expUSD: (day ? day.openUSD || 0 : 0) + inUSD,
      expLBP: (day ? day.openLBP || 0 : 0) + inLBP
    };
  };

  // Bread count: loaves physically left vs what the sales say should be left.
  C.breadCheck = (day, sum, lpb, fallbackLoafL) => {
    if (!day || !day.breadCount) return null;
    const counted = day.breadCount.bundles * lpb + day.breadCount.loose;
    const used = sum.breadTotal - counted, missing = used - sum.breadSold - (sum.checkBread || 0);
    // More bread counted than there was today: the count (or the starting stock) was typed wrong.
    if (used < 0) return { counted, used, sold: sum.breadSold, invalid: true };
    const loafL = sum.loafL || fallbackLoafL || 0;
    // Money is expected only for paid sandwiches; loaves on open checks are not missing.
    return { counted, used, sold: sum.breadSold, onChecks: sum.checkBread || 0, missing, missingL: Math.round(missing * loafL), loafL, paidUsed: used - (sum.checkBread || 0) };
  };

  // Drawer count vs expected. diff < 0 means money is missing. Values in LBP at the rate given.
  C.cashCheck = (day, sum, rate, bread) => {
    if (!day || !day.cashCount) return null;
    const counted = Math.round(day.cashCount.lbp) + Math.round(day.cashCount.usd * rate);
    const expected = Math.round(sum.expLBP) + Math.round(sum.expUSD * rate);
    const out = { counted, expected, diff: counted - expected, usd: day.cashCount.usd, lbp: day.cashCount.lbp };
    if (bread && !bread.invalid) {
      const float = Math.round(day.openLBP || 0) + Math.round((day.openUSD || 0) * rate);
      out.byBread = float + Math.round(bread.paidUsed * bread.loafL) + sum.otherL - (sum.debtL || 0) + (sum.debtPaidL || 0);
      out.diffBread = counted - out.byBread;
    }
    return out;
  };

  C.verdict = (diff, tol) => Math.abs(diff) <= tol ? "ok" : diff < 0 ? "short" : "over";

  if (typeof module !== "undefined" && module.exports) module.exports = C; else root.Calc = C;
})(this);
