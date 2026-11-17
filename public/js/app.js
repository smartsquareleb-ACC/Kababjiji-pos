// Kabab Jiji POS screens. Cashier: Sell only. Owner: Sell, Bread, Cash check, Sales, Settings.
(function () {
  const SHOP = { name: "KABAB JIJI", place: "Batroun", phone: "81536003", footer: "Sahtein w hana! Thanks for visiting KABAB JIJI" };
  const db = Store.db;
  const $ = id => document.getElementById(id);
  const num = v => { const n = parseFloat(String(v ?? "").replace(/[, ]/g, "")); return isFinite(n) ? n : 0; };
  const S = () => db.settings;
  const R = () => S().rate;
  const L = n => Math.round(n).toLocaleString("en-US") + " LBP";
  const U = n => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
  const LtoU = l => l / R();
  const priceL = it => Calc.priceL(it, R());
  const priceText = it => it.cur === "USD" ? `$${it.amount} · ${L(priceL(it))}` : `${L(it.amount)} · ${U(LtoU(it.amount))}`;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtDate = t => new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  function toast(msg) { const d = document.createElement("div"); d.className = "toast"; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }
  Store.onError = e => toast("Not saved: " + (e.code === "permission-denied" ? "you don't have access to do that" : e.message));
  const modalOpen = () => !!$("modalRoot").innerHTML;
  const closeModal = () => { $("modalRoot").innerHTML = ""; };

  const day = () => Store.currentDay();
  const sum = () => Calc.summary(day(), db.sales, S().lpb);
  const menuLoafL = () => { const it = db.menu.find(i => i.bread > 0); return it ? priceL(it) / it.bread : 0; };
  const bread = () => Calc.breadCheck(day(), sum(), S().lpb, menuLoafL());

  /* ---------- nav ---------- */
  let currentView = "sell";
  document.querySelectorAll("#nav button[data-view]").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  $("btnLogout").addEventListener("click", () => { cart = {}; Store.signOut(); if (!Store.live) { toast("Demo mode has no logins"); } });
  $("demoRole").addEventListener("change", e => { Store.setDemoRole(e.target.value); go("sell"); });
  function go(v) {
    if (v !== "sell" && !Store.isOwner()) v = "sell";
    currentView = v;
    document.querySelectorAll("#nav button[data-view]").forEach(b => b.setAttribute("aria-current", b.dataset.view === v ? "page" : "false"));
    render();
  }
  function showView(id) { document.querySelectorAll(".view").forEach(s => s.hidden = s.id !== "v-" + id); }

  /* ---------- login ---------- */
  let authMode = "in";
  function renderAuth() {
    const u = Store.user;
    let body;
    if (u && u.role === "pending") body = `<h2>Waiting for the owner</h2><p class="hint">Your account (${esc(u.email)}) is created. The owner needs to give you access from Settings → People.</p><button class="btn" id="auOut">Log out</button>`;
    else if (u && u.role === "blocked") body = `<h2>No access</h2><p class="hint">This account has been turned off by the owner.</p><button class="btn" id="auOut">Log out</button>`;
    else body = `<h2>${authMode === "up" ? "Create an account" : "Log in"}</h2>
      ${authMode === "up" ? `<div class="field"><label for="auName">Your name</label><input id="auName" autocomplete="name"></div>` : ""}
      <div class="field"><label for="auEmail">Email</label><input id="auEmail" type="email" autocomplete="username"></div>
      <div class="field"><label for="auPw">Password</label><input id="auPw" type="password" autocomplete="${authMode === "up" ? "new-password" : "current-password"}"></div>
      <div class="err" id="auErr"></div>
      <button class="btn primary" style="width:100%" id="auGo">${authMode === "up" ? "Create account" : "Log in"}</button>
      <div class="row" style="margin-top:8px"><button class="linkbtn" id="auSwitch">${authMode === "up" ? "I already have an account" : "Create an account"}</button>
      ${authMode === "in" ? `<button class="linkbtn" id="auReset" style="text-align:end">Forgot password</button>` : ""}</div>`;
    $("v-auth").innerHTML = `<div class="panel auth"><img class="biglogo" src="assets/logo.png" alt="Kabab Jiji, fresh meat">${body}</div>`;
  }
  $("v-auth").addEventListener("click", async e => {
    const id = e.target.id;
    if (id === "auOut") Store.signOut();
    if (id === "auSwitch") { authMode = authMode === "up" ? "in" : "up"; renderAuth(); }
    if (id === "auReset") { const em = $("auEmail").value.trim(); if (!em) { $("auErr").textContent = "Type your email first"; return; } try { await Store.resetPassword(em); toast("Password reset email sent"); } catch (err) { $("auErr").textContent = err.message; } }
    if (id === "auGo") {
      const em = $("auEmail").value.trim(), pw = $("auPw").value;
      e.target.disabled = true;
      try { authMode === "up" ? await Store.signUp($("auName").value.trim() || em.split("@")[0], em, pw) : await Store.signIn(em, pw); }
      catch (err) { $("auErr").textContent = /password|credential|user-not-found/.test(err.code || "") ? "Wrong email or password" : err.message; e.target.disabled = false; }
    }
  });
  $("v-auth").addEventListener("keydown", e => { if (e.key === "Enter" && $("auGo")) $("auGo").click(); });

  /* ---------- start day ---------- */
  function openDayModal() {
    const last = db.days.filter(d => d.status === "closed").slice(-1)[0];
    const left = last && last.summary ? last.summary.breadLeftBundles : 20;
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><img src="assets/logo.png" alt="Kabab Jiji" style="display:block;width:200px;margin:0 auto 8px"><h3>Start the day</h3>
    <p class="hint">Enter the bread you are starting with and the cash already in the drawer (the float).</p>
    <div class="row"><div class="field"><label for="odB">Bread bundles</label><input id="odB" inputmode="numeric" value="${left ?? 20}"></div>
    <div class="field"><label for="odL">Loose loaves</label><input id="odL" inputmode="numeric" value="0"></div></div>
    <p class="hint" id="odHint"></p>
    <div class="row"><div class="field"><label for="odU">Float in US$</label><input id="odU" inputmode="decimal" value="0"></div>
    <div class="field"><label for="odLBP">Float in LBP</label><input id="odLBP" inputmode="numeric" value="0"></div></div>
    <button class="btn primary" style="width:100%" id="odGo">Start selling</button></div></div>`;
    const hint = () => { const n = num($("odB").value) * S().lpb + num($("odL").value); $("odHint").textContent = `= ${n} loaves (${S().lpb} per bundle) = ${n} sandwiches`; };
    ["odB", "odL"].forEach(i => $(i).addEventListener("input", hint)); hint();
    $("odGo").addEventListener("click", async () => {
      $("odGo").disabled = true;
      await Store.openDay({ startBundles: Math.max(0, Math.round(num($("odB").value))), startLoose: Math.max(0, Math.round(num($("odL").value))),
        openUSD: num($("odU").value), openLBP: Math.round(num($("odLBP").value)) });
      closeModal(); render();
    });
  }

  /* ---------- sell ---------- */
  let cart = {}, changeMode = "lbp";
  const cartLines = () => db.menu.filter(i => cart[i.id] > 0).map(i => ({ id: i.id, name: i.name, qty: cart[i.id], priceL: priceL(i), bread: i.bread || 0 }));
  const cartTotalL = () => cartLines().reduce((a, l) => a + l.priceL * l.qty, 0);
  const cartBread = () => cartLines().reduce((a, l) => a + l.bread * l.qty, 0);
  // Only the owner's device knows the bread stock; the cashier is never blocked.
  const breadOk = it => !Store.isOwner() || !(it.bread > 0) || sum().breadLeft - cartBread() >= it.bread;
  function renderMenu() {
    $("menu").innerHTML = db.menu.map(i => `<button class="item c-${esc(i.color || "side")}${i.big ? " big" : ""}" data-add="${esc(i.id)}">
      <span><span class="nm">${esc(i.name)}</span><br><span class="ar">${esc(i.ar || "")}</span></span>
      <span style="display:flex;justify-content:space-between;align-items:flex-end;gap:6px"><span class="pr">${priceText(i)}</span>${cart[i.id] ? `<span class="qtyb">${cart[i.id]}</span>` : ""}</span></button>`).join("")
      || `<p class="hint">The menu is loading…</p>`;
  }
  $("menu").addEventListener("click", e => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    const it = db.menu.find(i => i.id === b.dataset.add); if (!it) return;
    if (!breadOk(it)) { toast("No bread left. Add bread first."); return; }
    cart[it.id] = (cart[it.id] || 0) + 1; renderSell();
  });
  function renderStock() {
    if (!Store.isOwner()) return;
    const s = sum(), left = s.breadLeft, sp = Calc.splitBread(left, S().lpb);
    const cls = left <= 0 ? "out" : left <= S().lpb * 2 ? "low" : "";
    $("stockbar").innerHTML = `<span class="chip ${cls}">Bread left <b>${left}</b> loaves</span>
    <span class="chip ${cls}"><b>${sp.bundles}</b> bundles + <b>${sp.loose}</b> loose</span>
    <span class="chip">Sandwiches sold <b>${s.breadSold}</b></span>`;
  }
  function renderSell() {
    renderStock(); renderMenu();
    const lines = cartLines();
    $("lines").innerHTML = lines.length ? lines.map(l => `<div class="line"><span class="ln">${esc(l.name)}<small>${L(l.priceL * l.qty)} · ${U(LtoU(l.priceL * l.qty))}</small></span>
      <span class="qty"><button data-dec="${esc(l.id)}" aria-label="One less">−</button><span>${l.qty}</span><button data-inc="${esc(l.id)}" aria-label="One more">+</button></span><span></span></div>`).join("")
      : '<div class="empty">Tap an item to start an order</div>';
    const t = cartTotalL();
    $("totL").textContent = L(t); $("totU").textContent = U(LtoU(t));
    renderChange();
  }
  $("lines").addEventListener("click", e => {
    const d = e.target.closest("[data-dec]"), i = e.target.closest("[data-inc]");
    if (d) { cart[d.dataset.dec]--; if (cart[d.dataset.dec] <= 0) delete cart[d.dataset.dec]; }
    if (i) { const it = db.menu.find(x => x.id === i.dataset.inc); if (!breadOk(it)) { toast("No bread left. Add bread first."); return; } cart[i.dataset.inc]++; }
    renderSell();
  });
  const payCalc = () => { const t = cartTotalL(), pu = num($("paidUSD").value), pl = Math.round(num($("paidLBP").value)); return { t, pu, pl, ...Calc.change(t, pu, pl, R(), changeMode) }; };
  function renderChange() {
    const c = payCalc(), el = $("change");
    if (!c.t) { el.className = "change"; el.innerHTML = '<span class="hint" style="margin:0">Enter what the customer gave to see the change.</span>'; $("btnPay").disabled = true; return; }
    if (!c.paid) { el.className = "change"; el.innerHTML = `<span>To pay: <b>${L(c.t)}</b> or <b>${U(LtoU(c.t))}</b></span><span class="hint" style="margin:0">Leave both boxes empty and press Complete sale if the customer paid the exact amount.</span>`; $("btnPay").disabled = false; return; }
    if (c.change < 0) { el.className = "change due"; el.innerHTML = `<span>Still owed</span><span class="big">${L(c.owed)}</span><span>${U(LtoU(c.owed))}</span>`; $("btnPay").disabled = true; return; }
    el.className = "change ok";
    const give = changeMode === "lbp" ? L(c.changeLBP) : changeMode === "usd" ? U(c.changeUSD) : `${U(c.changeUSD)} + ${L(c.changeLBP)}`;
    el.innerHTML = `<span>Give back</span><span class="big">${give}</span><span class="hint" style="margin:0">Total change ${L(c.change)} = ${U(LtoU(c.change))}</span>
    <div class="seg" role="group" aria-label="Change currency"><button data-cm="lbp" aria-pressed="${changeMode === "lbp"}">All in LBP</button><button data-cm="mix" aria-pressed="${changeMode === "mix"}">$ + LBP</button><button data-cm="usd" aria-pressed="${changeMode === "usd"}">All in $</button></div>`;
    $("btnPay").disabled = false;
  }
  $("change").addEventListener("click", e => { const b = e.target.closest("[data-cm]"); if (b) { changeMode = b.dataset.cm; renderChange(); } });
  ["paidUSD", "paidLBP"].forEach(id => $(id).addEventListener("input", renderChange));
  document.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { $(b.dataset.clear).value = ""; renderChange(); }));
  $("qUSD").innerHTML = [1, 5, 10, 20, 50, 100].map(v => `<button data-qu="${v}">+$${v}</button>`).join("");
  $("qLBP").innerHTML = [10000, 20000, 50000, 100000, 500000, 1000000].map(v => `<button data-ql="${v}">+${v >= 1000000 ? v / 1000000 + "M" : v / 1000 + "k"}</button>`).join("");
  $("qUSD").addEventListener("click", e => { const b = e.target.closest("[data-qu]"); if (b) { $("paidUSD").value = num($("paidUSD").value) + num(b.dataset.qu); renderChange(); } });
  $("qLBP").addEventListener("click", e => { const b = e.target.closest("[data-ql]"); if (b) { $("paidLBP").value = (Math.round(num($("paidLBP").value)) + num(b.dataset.ql)).toLocaleString("en-US"); renderChange(); } });
  function clearOrder() { cart = {}; $("paidUSD").value = ""; $("paidLBP").value = ""; changeMode = "lbp"; renderSell(); }
  $("btnClear").addEventListener("click", clearOrder);
  $("btnPay").addEventListener("click", () => {
    const c = payCalc(); if (!c.t || !db.state.dayId) return;
    if (c.paid && c.change < 0) return;
    const exact = !c.paid;
    const sale = { dayId: db.state.dayId, no: db.sales.length + 1, t: Date.now(), lines: cartLines(), totalL: c.t, rate: R(),
      paidUSD: exact ? 0 : c.pu, paidLBP: exact ? c.t : c.pl, changeUSD: exact ? 0 : c.changeUSD, changeLBP: exact ? 0 : c.changeLBP, void: false };
    const saved = Store.addSale(sale);
    clearOrder(); showReceipt(saved);
  });
  const canPrint = (() => { try { return window.self === window.top; } catch (e) { return false; } })();
  function receiptHTML(s) {
    const r = s.rate || R(), u = l => "$" + (l / r).toFixed(2), n = v => Math.round(v).toLocaleString("en-US");
    return `<div class="receipt" id="receipt">
    <img class="rlogo" src="assets/logo.png" alt=""><div class="c">${esc(SHOP.place)}</div><div class="c">Tel ${esc(SHOP.phone)}</div>
    <hr><div class="r"><span>Order #${s.no || ""}</span><span>${new Date(s.t).toLocaleString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div><hr>
    ${s.lines.map(l => `<div class="r"><span>${l.qty} x ${esc(l.name)}</span><span>${n(l.priceL * l.qty)}</span></div>`).join("")}
    <hr><div class="r tot"><span>TOTAL LBP</span><span>${n(s.totalL)}</span></div>
    <div class="r"><span>TOTAL USD</span><span>${u(s.totalL)}</span></div>
    ${s.paidUSD ? `<div class="r"><span>Paid USD</span><span>$${(+s.paidUSD).toFixed(2)}</span></div>` : ""}
    ${s.paidLBP ? `<div class="r"><span>Paid LBP</span><span>${n(s.paidLBP)}</span></div>` : ""}
    ${s.changeUSD ? `<div class="r"><span>Change USD</span><span>$${(+s.changeUSD).toFixed(2)}</span></div>` : ""}
    ${s.changeLBP ? `<div class="r"><span>Change LBP</span><span>${n(s.changeLBP)}</span></div>` : ""}
    <div class="r"><span>Rate</span><span>$1 = ${n(r)} LBP</span></div>
    <hr><div class="c">${esc(SHOP.footer)}</div></div>`;
  }
  function showReceipt(s) {
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3>Sale saved</h3>${receiptHTML(s)}
    <div class="row" style="margin-top:10px">${canPrint ? '<button class="btn dark" id="rcPrint">Print receipt</button>' : ""}<button class="btn primary" id="rcDone">Next order</button></div></div></div>`;
    if (canPrint) $("rcPrint").addEventListener("click", () => window.print());
    $("rcDone").addEventListener("click", () => { closeModal(); render(); });
  }

  /* ---------- bread ---------- */
  function breadText(n) { const s = Calc.splitBread(n, S().lpb); return `${n} loaves (${s.bundles} bundle${Math.abs(s.bundles) === 1 ? "" : "s"} + ${s.loose})`; }
  function renderBread() {
    const d = day(), s = sum();
    $("breadKV").innerHTML = `<dt>Started with</dt><dd>${d.startBundles} bundles + ${d.startLoose} loose</dd>
    <dt>Added during the day</dt><dd>${d.addedLoaves || 0} loaves</dd>
    <dt>Total bread today</dt><dd>${breadText(s.breadTotal)}</dd>
    <dt>Used by recorded sales</dt><dd>${s.breadSold} loaves</dd>
    <dt>Should be left</dt><dd>${breadText(s.breadLeft)}</dd>
    <dt>Loaves per bundle</dt><dd>${S().lpb}</dd>`;
    const c = bread(), el = $("breadVerdict");
    if (!c) { el.innerHTML = ""; return; }
    if (c.missing > 0) el.innerHTML = `<div class="verdict bad"><div class="h">${c.missing} loaves not rung up</div><p>${c.used} loaves were used but only ${c.sold} sandwiches were sold. That is about <b>${L(c.missingL)}</b> (${U(LtoU(c.missingL))}) missing, unless bread was thrown away or eaten by staff.</p></div>`;
    else if (c.missing < 0) el.innerHTML = `<div class="verdict warn"><div class="h">${-c.missing} extra loaves on the shelf</div><p>More bread is left than expected. Check the count, or bread was added without being entered.</p></div>`;
    else el.innerHTML = `<div class="verdict good"><div class="h">Bread matches sales</div><p>${c.used} loaves used, ${c.sold} sandwiches sold.</p></div>`;
  }
  $("btnAddBread").addEventListener("click", async () => {
    const n = Math.round(num($("addBundles").value)) * S().lpb + Math.round(num($("addLoose").value));
    if (!n) return; await Store.updateDay(day().id, { addedLoaves: (day().addedLoaves || 0) + n });
    $("addBundles").value = 0; $("addLoose").value = 0; toast(`Added ${n} loaves`); render();
  });
  $("btnCountBread").addEventListener("click", async () => {
    if ($("cntBundles").value === "" && $("cntLoose").value === "") { toast("Enter the bread you counted"); return; }
    await Store.updateDay(day().id, { breadCount: { bundles: Math.round(num($("cntBundles").value)), loose: Math.round(num($("cntLoose").value)), t: Date.now() } }); render();
  });

  /* ---------- cash ---------- */
  function verdictMoney(diff, title) {
    const v = Calc.verdict(diff, S().tol);
    if (v === "ok") return `<div class="verdict good"><div class="h">${title}: drawer is correct</div><p>Difference ${L(diff)}.</p></div>`;
    if (v === "short") return `<div class="verdict bad"><div class="h">${title}: short ${L(-diff)}</div><p>That is ${U(LtoU(-diff))} missing from the drawer.</p></div>`;
    return `<div class="verdict warn"><div class="h">${title}: over by ${L(diff)}</div><p>${U(LtoU(diff))} more than expected. A sale may not have been entered.</p></div>`;
  }
  function renderCash() {
    const d = day(), s = sum();
    $("expKV").innerHTML = `<dt>Orders</dt><dd>${s.orders}</dd>
    <dt>Sales total</dt><dd>${L(s.totalL)} · ${U(LtoU(s.totalL))}</dd>
    <dt>Starting float</dt><dd>${U(d.openUSD || 0)} + ${L(d.openLBP || 0)}</dd>
    <dt>Cash taken in (after change)</dt><dd>${U(s.inUSD)} + ${L(s.inLBP)}</dd>
    <dt><b>Dollars that should be in drawer</b></dt><dd>${U(s.expUSD)}</dd>
    <dt><b>Lira that should be in drawer</b></dt><dd>${L(s.expLBP)}</dd>
    <dt>All together at ${R().toLocaleString("en-US")}</dt><dd>${L(s.expLBP + Math.round(s.expUSD * R()))}</dd>`;
    const b = bread(), c = Calc.cashCheck(d, s, R(), b);
    if (!c) { $("cashVerdict").innerHTML = ""; $("breadCashVerdict").innerHTML = ""; return; }
    $("cashVerdict").innerHTML = verdictMoney(c.diff, "By sales") +
      `<dl class="kv" style="margin-top:10px"><dt>Dollars counted / expected</dt><dd>${U(c.usd)} / ${U(s.expUSD)}</dd><dt>Lira counted / expected</dt><dd>${L(c.lbp)} / ${L(s.expLBP)}</dd></dl>`;
    $("breadCashVerdict").innerHTML = b ? verdictMoney(c.diffBread, "By bread used") + `<p class="hint" style="margin-top:6px">${b.used} loaves used × ${L(b.loafL)} + drinks and fries + float = ${L(c.byBread)} expected.</p>`
      : '<p class="hint" style="margin-top:10px">Count the bread on the Bread page to also check the drawer against bread used.</p>';
  }
  $("btnCountCash").addEventListener("click", async () => {
    if ($("cntUSD").value === "" && $("cntLBP").value === "") { toast("Enter the cash you counted"); return; }
    await Store.updateDay(day().id, { cashCount: { usd: num($("cntUSD").value), lbp: Math.round(num($("cntLBP").value)), t: Date.now() } }); render();
  });

  /* ---------- sales report ---------- */
  function renderReport() {
    const s = sum(), rows = Object.entries(s.byItem).sort((a, b) => b[1].totalL - a[1].totalL);
    $("byItem").innerHTML = `<thead><tr><th>Item</th><th class="n">Qty</th><th class="n">LBP</th><th class="n">USD</th></tr></thead><tbody>` +
      (rows.length ? rows.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${v.qty}</td><td class="n">${Math.round(v.totalL).toLocaleString("en-US")}</td><td class="n">${U(LtoU(v.totalL))}</td></tr>`).join("") : '<tr><td colspan="4" class="empty">No sales yet today</td></tr>') +
      `<tr><td><b>Total</b></td><td></td><td class="n"><b>${Math.round(s.totalL).toLocaleString("en-US")}</b></td><td class="n"><b>${U(LtoU(s.totalL))}</b></td></tr></tbody>`;
    const ss = [...db.sales].reverse();
    $("orders").innerHTML = `<thead><tr><th>Time</th><th>Items</th><th class="n">Total</th><th>By</th><th></th></tr></thead><tbody>` +
      (ss.length ? ss.map(x => `<tr class="${x.void ? "void" : ""}"><td>${x.no ? "#" + x.no + " " : ""}${fmtTime(x.t)}</td><td>${x.lines.map(l => l.qty + "× " + esc(l.name)).join(", ")}</td><td class="n">${L(x.totalL)}</td><td>${esc(x.byName || "")}</td><td>${x.void ? "Voided" : `<button class="mini" data-void="${x.id}">Void</button>`}</td></tr>`).join("") : '<tr><td colspan="5" class="empty">No orders yet</td></tr>') + "</tbody>";
    const hist = db.days.filter(d => d.status === "closed" && d.summary).reverse();
    $("history").innerHTML = `<thead><tr><th>Day</th><th class="n">Sales</th><th class="n">Sandwiches</th><th class="n">Drawer</th></tr></thead><tbody>` +
      (hist.length ? hist.map(d => { const h = d.summary; return `<tr><td>${fmtDate(d.openedAt)}</td><td class="n">${L(h.salesL)}</td><td class="n">${h.sandwiches}${h.breadMissing > 0 ? ` <span style="color:var(--bad)">(${h.breadMissing} missing)</span>` : ""}</td><td class="n" style="color:${h.drawerDiff == null ? "var(--muted)" : h.drawerDiff < -S().tol ? "var(--bad)" : "var(--good)"}">${h.drawerDiff == null ? "Not counted" : (h.drawerDiff < 0 ? "Short " : "") + L(Math.abs(h.drawerDiff))}</td></tr>`; }).join("") : '<tr><td colspan="4" class="empty">No closed days yet</td></tr>') + "</tbody>";
  }
  $("orders").addEventListener("click", async e => {
    const b = e.target.closest("[data-void]"); if (!b) return;
    if (b.dataset.sure) { await Store.voidSale(b.dataset.void); toast("Order voided"); render(); return; }
    b.dataset.sure = "1"; b.textContent = "Tap again to void"; b.style.color = "var(--bad)";
  });
  $("closeArea").addEventListener("click", async e => {
    if (e.target.id === "btnClose") { $("closeArea").innerHTML = `<p><b>Close today and start a new day?</b></p><div class="row"><button class="btn" id="ccNo">Cancel</button><button class="btn danger" id="ccYes">Yes, close day</button></div>`; return; }
    if (e.target.id === "ccNo") { $("closeArea").innerHTML = '<button class="btn danger" id="btnClose">Close day</button>'; return; }
    if (e.target.id === "ccYes") {
      const s = sum(), b = bread(), c = Calc.cashCheck(day(), s, R(), b), left = b ? b.counted : s.breadLeft;
      await Store.closeDay(day().id, { salesL: s.totalL, orders: s.orders, sandwiches: s.breadSold, breadMissing: b ? b.missing : null,
        drawerDiff: c ? c.diff : null, breadLeftBundles: Math.floor(left / S().lpb), rate: R() });
      $("closeArea").innerHTML = '<button class="btn danger" id="btnClose">Close day</button>'; go("sell");
    }
  });

  /* ---------- settings ---------- */
  let editMenu = null;
  function renderSettings() {
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#v-settings")) return; // don't wipe what the owner is typing
    $("setRate").value = S().rate; $("setLpb").value = S().lpb; $("setTol").value = S().tol;
    editMenu = db.menu.map(x => ({ ...x })); renderMenuEdit();
    $("users").innerHTML = `<thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>` + db.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.id === Store.user.id ? "Owner (you)" :
      `<select data-role="${u.id}" aria-label="Role for ${esc(u.name)}">${[["pending", "Waiting"], ["cashier", "Cashier"], ["owner", "Owner"], ["blocked", "No access"]].map(([v, t]) => `<option value="${v}" ${u.role === v ? "selected" : ""}>${t}</option>`).join("")}</select>`}</td></tr>`).join("") + "</tbody>";
  }
  function renderMenuEdit() {
    $("menuEdit").innerHTML = '<span class="hd">Name</span><span class="hd">Arabic</span><span class="hd">Price</span><span class="hd">Currency</span><span class="hd">Bread</span><span class="hd"></span>' +
      editMenu.map((i, k) => `<input id="me-n-${k}" value="${esc(i.name)}" aria-label="Name"><input id="me-a-${k}" value="${esc(i.ar || "")}" dir="rtl" aria-label="Arabic name">
      <input id="me-p-${k}" value="${i.amount}" inputmode="decimal" aria-label="Price"><select id="me-c-${k}" aria-label="Currency"><option ${i.cur === "USD" ? "selected" : ""}>USD</option><option ${i.cur === "LBP" ? "selected" : ""}>LBP</option></select>
      <input id="me-b-${k}" value="${i.bread || 0}" inputmode="numeric" aria-label="Loaves used"><button class="mini" data-del="${k}" aria-label="Remove item">✕</button>`).join("");
  }
  const readMenuEdit = () => editMenu.map((i, k) => ({ ...i, name: $("me-n-" + k).value.trim() || "Item", ar: $("me-a-" + k).value.trim(), amount: num($("me-p-" + k).value), cur: $("me-c-" + k).value, bread: Math.max(0, Math.round(num($("me-b-" + k).value))) }));
  $("menuEdit").addEventListener("click", e => { const b = e.target.closest("[data-del]"); if (!b) return; editMenu = readMenuEdit(); editMenu.splice(+b.dataset.del, 1); renderMenuEdit(); });
  $("btnAddItem").addEventListener("click", () => { editMenu = readMenuEdit(); editMenu.push({ id: Store.uid(), name: "New item", ar: "", amount: 100000, cur: "LBP", bread: 0, color: "side" }); renderMenuEdit(); });
  $("btnSaveMenu").addEventListener("click", async () => { await Store.saveMenu(readMenuEdit().map(i => ({ ...i, color: i.color || (i.bread > 0 ? "meat" : "side") }))); document.activeElement.blur(); toast("Menu saved on all devices"); render(); });
  $("btnSaveSettings").addEventListener("click", async () => {
    const r = Math.round(num($("setRate").value)), l = Math.round(num($("setLpb").value));
    if (r < 1000 || l < 1) { toast("Check the rate and loaves per bundle"); return; }
    await Store.saveSettings({ rate: r, lpb: l, tol: Math.max(0, Math.round(num($("setTol").value))) }); document.activeElement.blur(); toast("Settings saved on all devices"); render();
  });
  $("users").addEventListener("change", async e => { const s = e.target.closest("[data-role]"); if (s) { await Store.setRole(s.dataset.role, s.value); toast("Access updated"); } });
  $("btnAddUser").addEventListener("click", async () => {
    const name = $("nuName").value.trim(), email = $("nuEmail").value.trim(), pw = $("nuPw").value;
    if (!name || !email || pw.length < 6) { toast("Enter a name, an email and a password of 6+ characters"); return; }
    try { await Store.createUser(name, email, pw, $("nuRole").value); ["nuName", "nuEmail", "nuPw"].forEach(i => $(i).value = ""); document.activeElement.blur(); toast(`${name} can now log in`); render(); }
    catch (err) { toast(err.message); }
  });

  /* ---------- render ---------- */
  function render() {
    const u = Store.user;
    $("demoBox").hidden = Store.live;
    if (!Store.ready && Store.live) { showView("auth"); $("v-auth").innerHTML = '<div class="panel auth"><img class="biglogo" src="assets/logo.png" alt="Kabab Jiji"><p class="hint" style="text-align:center">Loading…</p></div>'; $("nav").hidden = true; return; }
    if (!u || !Store.isStaff()) { closeModal(); $("nav").hidden = true; $("dayLabel").textContent = ""; showView("auth"); renderAuth(); return; }
    $("nav").hidden = false;
    document.querySelectorAll("[data-owner]").forEach(el => el.hidden = !Store.isOwner());
    $("whoLabel").textContent = u.name || u.email || "";
    $("demoRole").value = u.role;
    if (currentView !== "sell" && !Store.isOwner()) currentView = "sell";
    const d = day();
    if (!d) {
      $("dayLabel").textContent = ""; showView("sell"); renderSell();
      if (!modalOpen()) {
        if (Store.isOwner()) openDayModal();
        else $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3>The day has not started</h3><p class="hint">The owner opens the day with the bread and starting cash. This screen opens by itself as soon as they do.</p></div></div>`;
      }
      return;
    }
    if (modalOpen() && $("modalRoot").querySelector("h3") && /not started/.test($("modalRoot").querySelector("h3").textContent)) closeModal();
    if (modalOpen() && $("odGo")) closeModal(); // the day was opened from another device
    $("dayLabel").textContent = fmtDate(d.openedAt) + " · $1 = " + R().toLocaleString("en-US") + " LBP";
    showView(currentView);
    if (currentView === "sell") renderSell();
    if (currentView === "bread") renderBread();
    if (currentView === "cash") renderCash();
    if (currentView === "report") renderReport();
    if (currentView === "settings") renderSettings();
  }

  // Offline badge: sales are kept on the device and sent when the internet is back.
  function syncBadge() { const off = !navigator.onLine; $("sync").hidden = !off || !Store.live; $("sync").textContent = "Offline: sales are saved and will sync"; }
  window.addEventListener("online", syncBadge); window.addEventListener("offline", syncBadge);

  // Pick up a new version: when the app comes back on screen (and every 5 minutes), reload if it changed.
  async function checkUpdate() {
    const v = window.APP_VERSION; if (!v || v === "__V__") return;
    try { const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" }); const n = (await r.text()).trim();
      if (r.ok && n && n !== v && !modalOpen() && !cartLines().length) location.reload(); } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
  setInterval(checkUpdate, 5 * 60 * 1000);

  Store.onChange(() => { if (!modalOpen() || $("odGo") || ($("modalRoot").querySelector("h3") || {}).textContent === "The day has not started") render(); });
  render();
  Store.init();
  syncBadge();
  if ("serviceWorker" in navigator && Store.live) navigator.serviceWorker.register("sw.js").catch(e => console.warn("sw", e));
})();
