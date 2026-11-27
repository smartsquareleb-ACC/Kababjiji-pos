// Kabab Jiji POS screens. Cashier: Sell only. Owner: Sell, Bread, Cash check, Sales, Settings.
(function () {
  const SHOP = { name: "KABAB JIJI", place: "Batroun", phone: "81536003", footer: "Sahtein w hana! Thanks for visiting KABAB JIJI" };
  const db = Store.db;
  const $ = id => document.getElementById(id);
  const num = v => { const n = parseFloat(String(v ?? "").replace(/[, ]/g, "")); return isFinite(n) ? n : 0; };
  const S = () => db.settings;
  const R = () => S().rate;
  // Language: English or Lebanese Arabic, remembered on this device.
  let AR = false; try { AR = localStorage.getItem("kj-lang") === "ar"; } catch (e) {}
  const T = (en, ar) => AR ? ar : en;
  const L = n => Math.round(n).toLocaleString("en-US") + T(" LBP", " ل.ل.");
  const U = n => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
  const LtoU = l => l / R();
  const priceL = it => Calc.priceL(it, R());
  const priceText = it => it.cur === "USD" ? `$${it.amount} · ${L(priceL(it))}` : `${L(it.amount)} · ${U(LtoU(it.amount))}`;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const loc = () => AR ? "ar-LB-u-nu-latn" : [];
  const fmtTime = t => new Date(t).toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit" });
  const fmtDate = t => new Date(t).toLocaleDateString(loc(), { weekday: "short", day: "numeric", month: "short" });
  // Item name in the current language (lines keep the English name; Arabic comes from the menu).
  // Old Pepsi / 7Up / Diet / Mirinda lines show as "Soft Drink".
  const nameOf = l => { const al = Calc.aliasMap(db.menu)[l.id], it = db.menu.find(i => i.id === (al || l.id)); if (!AR) return al && it ? it.name : l.name; return (it && it.ar) || l.name; };
  function applyLang() {
    document.documentElement.lang = AR ? "ar" : "en"; document.documentElement.dir = AR ? "rtl" : "ltr";
    document.querySelectorAll("[data-ar]").forEach(el => { if (el.dataset.en == null) el.dataset.en = el.textContent; el.textContent = AR ? el.dataset.ar : el.dataset.en; });
    const b = $("btnLang"); b.textContent = AR ? "English" : "عربي"; b.lang = AR ? "en" : "ar";
  }
  function toast(msg) { document.querySelectorAll(".toast").forEach(t => t.remove()); const d = document.createElement("div"); d.className = "toast"; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }
  Store.onError = e => toast(T("Not saved: ", "ما انحفظ: ") + (e.code === "permission-denied" ? T("you don't have access to do that", "ما عندك صلاحية") : e.message));
  const modalOpen = () => !!$("modalRoot").innerHTML;
  const closeModal = () => { $("modalRoot").innerHTML = ""; };

  const day = () => Store.currentDay();
  // Items counted by the piece at the start and close of the day (drinks by default).
  const isCounted = i => i.count != null ? !!i.count : i.color === "drink";
  const drinks = () => db.menu.filter(isCounted);
  // Old drink ids (Pepsi, 7Up, Diet, Mirinda) now counted as one "Soft Drink".
  const alias = () => Calc.aliasMap(db.menu);
  const dName = i => esc(AR ? i.ar || i.name : i.name);
  const drinkFields = (pre, vals) => `<div class="row" style="flex-wrap:wrap">${drinks().map(i => `<div class="field" style="flex:1 1 30%;min-width:96px"><label for="${pre}${i.id}">${dName(i)}</label><input id="${pre}${i.id}" inputmode="numeric" value="${vals ? vals[i.id] ?? "" : ""}"></div>`).join("")}</div>`;
  const readDrinks = pre => { const o = {}; drinks().forEach(i => { const el = $(pre + i.id); if (el && el.value.trim() !== "") o[i.id] = Math.max(0, Math.round(num(el.value))); }); return o; };
  const sum = () => Calc.summary(day(), db.sales, S().lpb, db.checks);
  const menuLoafL = () => { const it = db.menu.find(i => i.bread > 0); return it ? priceL(it) / it.bread : 0; };
  const bread = () => Calc.breadCheck(day(), sum(), S().lpb, menuLoafL());

  /* ---------- nav ---------- */
  let currentView = "sell";
  document.querySelectorAll("#nav button[data-view]").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  $("btnLogout").addEventListener("click", () => { cart = {}; Store.signOut(); if (!Store.live) { toast(T("Demo mode has no logins", "وضع التجربة ما فيه حسابات")); } });
  $("demoRole").addEventListener("change", e => { Store.setDemoRole(e.target.value); go("sell"); });
  function go(v) {
    if (v !== "sell" && !Store.isOwner()) v = "sell";
    if (v === "reports") rpKey = ""; // fresh numbers each time the Reports tab is opened
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
    if (u && u.role === "pending") body = `<h2>${T("Waiting for the owner", "ناطرين المالك")}</h2><p class="hint">${T(`Your account (${esc(u.email)}) is created. The owner needs to give you access from Settings → People.`, `حسابك (${esc(u.email)}) انعمل. لازم المالك يعطيك صلاحية من الإعدادات ← الأشخاص.`)}</p><button class="btn" id="auOut">${T("Log out", "خروج")}</button>`;
    else if (u && u.role === "blocked") body = `<h2>${T("No access", "ما في صلاحية")}</h2><p class="hint">${T("This account has been turned off by the owner.", "المالك وقّف هالحساب.")}</p><button class="btn" id="auOut">${T("Log out", "خروج")}</button>`;
    else body = `<h2>${authMode === "up" ? T("Create an account", "عمول حساب") : T("Log in", "دخول")}</h2>
      ${authMode === "up" ? `<div class="field"><label for="auName">${T("Your name", "اسمك")}</label><input id="auName" autocomplete="name"></div>` : ""}
      <div class="field"><label for="auEmail">${T("Email", "الإيميل")}</label><input id="auEmail" type="email" autocomplete="username"></div>
      <div class="field"><label for="auPw">${T("Password", "كلمة السر")}</label><input id="auPw" type="password" autocomplete="${authMode === "up" ? "new-password" : "current-password"}"></div>
      <div class="err" id="auErr"></div>
      <button class="btn primary" style="width:100%" id="auGo">${authMode === "up" ? T("Create account", "عمول الحساب") : T("Log in", "دخول")}</button>
      <div class="row" style="margin-top:8px"><button class="linkbtn" id="auSwitch">${authMode === "up" ? T("I already have an account", "عندي حساب") : T("Create an account", "عمول حساب")}</button>
      ${authMode === "in" ? `<button class="linkbtn" id="auReset" style="text-align:end">${T("Forgot password", "نسيت كلمة السر")}</button>` : ""}</div>`;
    $("v-auth").innerHTML = `<div class="panel auth"><img class="biglogo" src="assets/logo.png" alt="Kabab Jiji, fresh meat">${body}</div>`;
  }
  $("v-auth").addEventListener("click", async e => {
    const id = e.target.id;
    if (id === "auOut") Store.signOut();
    if (id === "auSwitch") { authMode = authMode === "up" ? "in" : "up"; renderAuth(); }
    if (id === "auReset") { const em = $("auEmail").value.trim(); if (!em) { $("auErr").textContent = T("Type your email first", "اكتب الإيميل أول"); return; } try { await Store.resetPassword(em); toast(T("Password reset email sent", "انبعت إيميل لتغيير كلمة السر")); } catch (err) { $("auErr").textContent = err.message; } }
    if (id === "auGo") {
      const em = $("auEmail").value.trim(), pw = $("auPw").value;
      e.target.disabled = true;
      try { authMode === "up" ? await Store.signUp($("auName").value.trim() || em.split("@")[0], em, pw) : await Store.signIn(em, pw); }
      catch (err) { $("auErr").textContent = /password|credential|user-not-found/.test(err.code || "") ? T("Wrong email or password", "الإيميل أو كلمة السر غلط") : err.message; e.target.disabled = false; }
    }
  });
  $("v-auth").addEventListener("keydown", e => { if (e.key === "Enter" && $("auGo")) $("auGo").click(); });

  /* ---------- start day ---------- */
  function openDayModal() {
    const last = db.days.filter(d => d.status === "closed").slice(-1)[0], lpb = S().lpb;
    const h = last && last.summary || {};
    const leftL = h.breadLeftLoaves != null ? h.breadLeftLoaves : h.breadLeftBundles != null ? h.breadLeftBundles * lpb : 0;
    const ls = Calc.splitBread(Math.max(0, leftL), lpb);
    const f = (id, label, v) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" inputmode="numeric" value="${v}"></div>`;
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><img src="assets/logo.png" alt="Kabab Jiji" style="display:block;width:200px;margin:0 auto 8px">${Store.isOwner() ? `<button id="odX" aria-label="${T("Close", "سكّر")}" style="float:inline-end;border:1px solid var(--line);background:var(--soft);border-radius:10px;width:40px;height:40px;font-size:18px;font-weight:700">✕</button>` : ""}<h3>${T("Start the day", "افتح النهار")}</h3>
    <h2 style="font-size:15px;margin:12px 0 4px">${T("Bread left from yesterday", "خبز باقي من مبارح")}</h2>
    <p class="hint">${last ? T("Filled in from yesterday's close. Change it if your count is different.", "معبّى من تسكيرة مبارح. غيّرو إذا عدّك مختلف.") : T("Enter any bread already in the shop.", "اكتب الخبز الموجود بالمحل.")}</p>
    <div class="row">${f("odLB", T("Bundles", "ربطات"), ls.bundles)}${f("odLL", T("Loose loaves", "أرغفة فرط"), ls.loose)}</div>
    <div class="row">${f("odMove", T("Move to main shop (loaves)", "نقل عالمحل الرئيسي (أرغفة)"), 0)}${f("odWaste", T("Waste (loaves)", "تالف (أرغفة)"), 0)}</div>
    <h2 style="font-size:15px;margin:12px 0 4px">${T("New bread for today", "خبز جديد لليوم")}</h2>
    <div class="row">${f("odB", T("Bundles", "ربطات"), last ? 0 : 20)}${f("odL", T("Loose loaves", "أرغفة فرط"), 0)}</div>
    <p class="hint" id="odHint"></p><div class="err" id="odErr"></div>
    ${drinks().length ? `<h2 style="font-size:15px;margin:12px 0 4px">${T("Count the drinks (pieces)", "عدّ المشروبات (حبّة)")}</h2>
    <p class="hint">${h.drinksLeft ? T("Filled in from yesterday's close. Change it if your count is different.", "معبّى من تسكيرة مبارح. غيّرو إذا عدّك مختلف.") : T("Count every drink in the fridge and the stock.", "عدّ كل المشروبات بالبراد والمخزون.")}</p>
    ${drinkFields("odD-", Calc.regroup(h.drinksLeft, alias()) || null)}<div class="err" id="odDErr"></div>` : ""}
    <h2 style="font-size:15px;margin:12px 0 4px">${T("Cash in the drawer (float)", "مصاري بالصندوق (أول النهار)")}</h2>
    <div class="row"><div class="field"><label for="odU">${T("US$", "دولار")}</label><input id="odU" inputmode="decimal" value="0"></div>
    <div class="field"><label for="odLBP">${T("LBP", "ليرة")}</label><input id="odLBP" inputmode="numeric" value="0"></div></div>
    <button class="btn primary" style="width:100%" id="odGo">${T("Start selling", "بلّش البيع")}</button></div></div>`;
    const v = id => Math.max(0, Math.round(num($(id).value)));
    const calc = () => { const left = v("odLB") * lpb + v("odLL"), mv = v("odMove"), ws = v("odWaste"), nw = v("odB") * lpb + v("odL"); return { left, mv, ws, nw, keep: left - mv - ws }; };
    const hint = () => { const c = calc();
      $("odErr").textContent = c.keep < 0 ? T(`You are moving or wasting ${c.mv + c.ws} loaves but only ${c.left} are left.`, `عم تنقل أو تتلف ${c.mv + c.ws} رغيف بس الباقي ${c.left} بس.`) : "";
      $("odHint").innerHTML = T(`Kept from yesterday <b>${Math.max(0, c.keep)}</b> + new <b>${c.nw}</b> = <b>${Math.max(0, c.keep) + c.nw} loaves</b> to sell today (${lpb} per bundle).`, `باقي من مبارح <b>${Math.max(0, c.keep)}</b> + جديد <b>${c.nw}</b> = <b>${Math.max(0, c.keep) + c.nw} رغيف</b> للبيع اليوم (${lpb} بالربطة).`); };
    ["odLB", "odLL", "odMove", "odWaste", "odB", "odL"].forEach(i => $(i).addEventListener("input", hint)); hint();
    if ($("odX")) $("odX").addEventListener("click", () => { skipStart = true; closeModal(); render(); });
    $("odGo").addEventListener("click", async () => {
      const c = calc(); if (c.keep < 0) return;
      const ds = readDrinks("odD-");
      if (drinks().some(i => ds[i.id] == null)) { $("odDErr").textContent = T("Count every drink (0 if none)", "عدّ كل المشروبات (0 إذا ما في)"); return; }
      $("odGo").disabled = true;
      const t = Date.now(), moves = [];
      if (c.mv) moves.push({ type: "move", loaves: c.mv, t, note: "from yesterday" });
      if (c.ws) moves.push({ type: "waste", loaves: c.ws, t, note: "from yesterday" });
      await Store.openDay({ drinksStart: ds, drinksAdded: {}, carried: c.left, breadMoves: moves, startBundles: v("odB"), startLoose: v("odL"),
        openUSD: num($("odU").value), openLBP: Math.round(num($("odLBP").value)) });
      closeModal(); render();
    });
  }

  /* ---------- sell ---------- */
  let cart = {}, changeMode = "lbp", activeCheck = null; // activeCheck: id of the open check loaded in the order
  const cartLines = () => db.menu.filter(i => cart[i.id] > 0).map(i => ({ id: i.id, name: i.name, qty: cart[i.id], priceL: priceL(i), bread: i.bread || 0 }));
  const cartTotalL = () => cartLines().reduce((a, l) => a + l.priceL * l.qty, 0);
  const cartBread = () => cartLines().reduce((a, l) => a + l.bread * l.qty, 0);
  // Only the owner's device knows the bread stock; the cashier is never blocked.
  const checkOf = id => db.checks.find(c => c.id === id);
  const linesBread = lines => lines.reduce((a, l) => a + (l.bread || 0) * l.qty, 0);
  // The loaded check's bread is already counted as used, so only extra loaves need stock.
  const breadOk = it => !Store.isOwner() || !(it.bread > 0) || sum().breadLeft + (activeCheck && checkOf(activeCheck) ? linesBread(checkOf(activeCheck).lines) : 0) - cartBread() >= it.bread;
  function renderMenu() {
    $("menu").innerHTML = db.menu.map(i => `<button class="item c-${esc(i.color || "side")}${i.big ? " big" : ""}" data-add="${esc(i.id)}">
      <span><span class="nm">${esc(AR ? i.ar || i.name : i.name)}</span><br><span class="ar">${esc(AR ? (i.ar ? i.name : "") : i.ar || "")}</span></span>
      <span style="display:flex;justify-content:space-between;align-items:flex-end;gap:6px"><span class="pr">${priceText(i)}</span>${cart[i.id] ? `<span class="qtyb">${cart[i.id]}</span>` : ""}</span></button>`).join("")
      || `<p class="hint">${T("The menu is loading…", "المنيو عم يحمّل…")}</p>`;
  }
  $("stockbar").addEventListener("click", e => { if (e.target.id === "btnStartDay") { skipStart = false; openDayModal(); } });
  $("menu").addEventListener("click", e => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    const it = db.menu.find(i => i.id === b.dataset.add); if (!it) return;
    if (!breadOk(it)) { toast(T("No bread left. Add bread first.", "ما في خبز. زيد خبز أول.")); return; }
    cart[it.id] = (cart[it.id] || 0) + 1; renderSell();
  });
  let skipStart = false; // the owner closed the Start-the-day screen for now
  function renderStock() {
    if (!Store.isOwner()) return;
    if (!day()) { $("stockbar").innerHTML = `<button class="btn primary" id="btnStartDay">${T("Start the day", "افتح النهار")}</button>`; return; }
    const s = sum(), left = s.breadLeft, sp = Calc.splitBread(left, S().lpb);
    const cls = left <= 0 ? "out" : left <= S().lpb * 2 ? "low" : "";
    $("stockbar").innerHTML = `<span class="chip ${cls}">${T("Bread left", "خبز باقي")} <b>${left}</b> ${T("loaves", "رغيف")}</span>
    <span class="chip ${cls}"><b>${sp.bundles}</b> ${T("bundles", "ربطة")} + <b>${sp.loose}</b> ${T("loose", "فرط")}</span>
    <span class="chip">${T("Sandwiches sold", "سندويشات مبيوعة")} <b>${s.breadSold}</b></span>${s.checkBread ? `<span class="chip">${T("On open checks", "عالحسابات المفتوحة")} <b>${s.checkBread}</b></span>` : ""}`;
  }
  function renderChecks() {
    if (activeCheck && !checkOf(activeCheck)) { activeCheck = null; cart = {}; } // paid or cancelled on another device
    const tot = c => c.lines.reduce((a, l) => a + l.priceL * l.qty, 0);
    $("checksBar").innerHTML = db.checks.length ? `<span class="lbl">${T("Open checks · tap to add items or pay", "حسابات مفتوحة · كبوس لتزيد أو تدفع")}</span>` + db.checks.map(c =>
      `<button class="ck" data-check="${c.id}" aria-pressed="${c.id === activeCheck}">${esc(c.label)}<small>${L(tot(c))} · ${fmtTime(c.t)}</small></button>`).join("") : "";
    $("orderTitle").textContent = activeCheck && checkOf(activeCheck) ? T("Check: ", "حساب: ") + checkOf(activeCheck).label : T("Current order", "الطلب الحالي");
    $("btnCheck").textContent = activeCheck ? T("Save changes, keep check open", "احفظ وخلّي الحساب مفتوح") : T("Save as open check (pay later)", "احفظ كحساب مفتوح (يدفع بعدين)");
    $("btnClear").textContent = activeCheck ? T("Close without paying", "سكّر بلا دفع") : T("Clear order", "امسح الطلب");
    $("btnDebt").textContent = activeCheck ? T("Move this check to debt (pays another day)", "حوّل الحساب لدين (بيدفع يوم تاني)") : T("Save as debt (pays another day)", "سجّل دين (بيدفع يوم تاني)");
    $("btnDebts").hidden = !db.debts.length;
    $("btnDebts").textContent = T(`Debts: ${db.debts.length} · ${L(db.debts.reduce((a, d) => a + d.totalL, 0))} · tap to pay`, `ديون: ${db.debts.length} · ${L(db.debts.reduce((a, d) => a + d.totalL, 0))} · كبوس لتدفع`);
  }
  $("checksBar").addEventListener("click", e => {
    const b = e.target.closest("[data-check]"); if (!b) return;
    if (b.dataset.check === activeCheck) return;
    if (!activeCheck && cartLines().length) { toast(T("Finish or save the current order first", "خلّص أو احفظ الطلب الحالي أول")); return; }
    const c = checkOf(b.dataset.check); if (!c) return;
    activeCheck = c.id; cart = {}; c.lines.forEach(l => { const id = alias()[l.id] || l.id; if (db.menu.some(i => i.id === id)) cart[id] = (cart[id] || 0) + l.qty; });
    $("paidUSD").value = ""; $("paidLBP").value = ""; changeMode = "lbp"; renderSell();
  });
  $("btnCheck").addEventListener("click", () => {
    const lines = cartLines(); if (!lines.length) { toast(T("Tap an item first", "كبوس على صنف أول")); return; }
    if (activeCheck) { Store.saveCheck(activeCheck, { lines }); toast(T("Check updated", "الحساب تحدّث")); activeCheck = null; clearOrder(); return; }
    const n = db.checks.length + 1;
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3>${T("Open check", "حساب مفتوح")}</h3><p class="hint">${T("Name it so you can find it later: a table, a name or what they wear.", "سمّيه لتلاقيه بعدين: طاولة، اسم، أو شو لابسين.")}</p>
      <div class="field"><label for="ckLabel">${T("Table or name", "طاولة أو اسم")}</label><input id="ckLabel" value="${T("Table", "طاولة")} ${n}" autocomplete="off"></div>
      <div class="row"><button class="btn" id="ckNo">${T("Cancel", "إلغاء")}</button><button class="btn primary" id="ckGo">${T("Save check", "احفظ الحساب")}</button></div></div></div>`;
    $("ckLabel").select();
    $("ckNo").addEventListener("click", closeModal);
    const go = () => { Store.saveCheck(null, { label: $("ckLabel").value.trim() || `${T("Table", "طاولة")} ${n}`, lines, dayId: db.state.dayId, t: Date.now() }); closeModal(); toast(T("Check saved. Pay it when they finish.", "الحساب انحفظ. ادفعو بس يخلصوا.")); clearOrder(); };
    $("ckGo").addEventListener("click", go); $("ckLabel").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  });
  function renderSell() {
    renderChecks(); renderStock(); renderMenu();
    const lines = cartLines();
    $("lines").innerHTML = lines.length ? lines.map(l => `<div class="line"><span class="ln">${esc(nameOf(l))}<small>${L(l.priceL * l.qty)} · ${U(LtoU(l.priceL * l.qty))}</small></span>
      <span class="qty"><button data-dec="${esc(l.id)}" aria-label="${T("One less", "واحد أقل")}">−</button><span>${l.qty}</span><button data-inc="${esc(l.id)}" aria-label="${T("One more", "واحد زيادة")}">+</button></span><span></span></div>`).join("")
      : `<div class="empty">${T("Tap an item to start an order", "كبوس على صنف لتبلّش الطلب")}</div>`;
    const t = cartTotalL();
    $("totL").textContent = L(t); $("totU").textContent = U(LtoU(t));
    renderChange();
  }
  $("lines").addEventListener("click", e => {
    const d = e.target.closest("[data-dec]"), i = e.target.closest("[data-inc]");
    if (d) { cart[d.dataset.dec]--; if (cart[d.dataset.dec] <= 0) delete cart[d.dataset.dec]; }
    if (i) { const it = db.menu.find(x => x.id === i.dataset.inc); if (!breadOk(it)) { toast(T("No bread left. Add bread first.", "ما في خبز. زيد خبز أول.")); return; } cart[i.dataset.inc]++; }
    renderSell();
  });
  const payCalc = () => { const t = cartTotalL(), pu = num($("paidUSD").value), pl = Math.round(num($("paidLBP").value)); return { t, pu, pl, ...Calc.change(t, pu, pl, R(), changeMode) }; };
  function renderChange() {
    const c = payCalc(), el = $("change");
    if (!c.t) { el.className = "change"; el.innerHTML = `<span class="hint" style="margin:0">${T("Enter what the customer gave to see the change.", "اكتب شو عطاك الزبون لتشوف الباقي.")}</span>`; $("btnPay").disabled = true; return; }
    if (!c.paid) { el.className = "change"; el.innerHTML = `<span>${T("To pay:", "المطلوب:")} <b>${L(c.t)}</b> ${T("or", "أو")} <b>${U(LtoU(c.t))}</b></span><span class="hint" style="margin:0">${T("Type what the customer gave, or tap <b>Paid exact in $</b> / <b>Paid exact in LBP</b>. The sale can't be completed before that.", "اكتب شو عطاك الزبون، أو كبوس <b>دفع المبلغ تماماً بالدولار</b> / <b>بالليرة</b>. ما فيك تكمّل البيع قبل هيك.")}</span>`; $("btnPay").disabled = true; return; }
    if (c.change < 0) { el.className = "change due"; el.innerHTML = `<span>${T("Still owed", "بعد ناقص")}</span><span class="big">${L(c.owed)}</span><span>${U(LtoU(c.owed))}</span>`; $("btnPay").disabled = true; return; }
    el.className = "change ok";
    const give = changeMode === "lbp" ? L(c.changeLBP) : changeMode === "usd" ? U(c.changeUSD) : `${U(c.changeUSD)} + ${L(c.changeLBP)}`;
    el.innerHTML = `<span>${T("Give back", "رجّعلو")}</span><span class="big">${give}</span><span class="hint" style="margin:0">${T("Total change", "كل الباقي")} ${L(c.change)} = ${U(LtoU(c.change))}</span>
    <div class="seg" role="group" aria-label="${T("Change currency", "عملة الباقي")}"><button data-cm="lbp" aria-pressed="${changeMode === "lbp"}">${T("All in LBP", "كلو ليرة")}</button><button data-cm="mix" aria-pressed="${changeMode === "mix"}">${T("$ + LBP", "دولار + ليرة")}</button><button data-cm="usd" aria-pressed="${changeMode === "usd"}">${T("All in $", "كلو دولار")}</button></div>`;
    $("btnPay").disabled = false;
  }
  $("change").addEventListener("click", e => { const b = e.target.closest("[data-cm]"); if (b) { changeMode = b.dataset.cm; renderChange(); } });
  ["paidUSD", "paidLBP"].forEach(id => $(id).addEventListener("input", renderChange));
  document.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { $(b.dataset.clear).value = ""; renderChange(); }));
  function clearOrder() { cart = {}; activeCheck = null; $("paidUSD").value = ""; $("paidLBP").value = ""; changeMode = "lbp"; renderSell(); }
  $("btnClear").addEventListener("click", clearOrder);
  // One tap when the customer pays the exact amount: fills it in and completes the sale.
  function payExact(cur) {
    const t = cartTotalL(); if (!t) { toast(T("Tap an item first", "كبوس على صنف أول")); return; }
    $("paidUSD").value = cur === "usd" ? (Math.ceil(t / R() * 100) / 100).toString() : "";
    $("paidLBP").value = cur === "lbp" ? t.toLocaleString("en-US") : "";
    changeMode = "lbp"; renderChange(); $("btnPay").click();
  }
  $("btnExactUSD").addEventListener("click", () => payExact("usd"));
  $("btnExactLBP").addEventListener("click", () => payExact("lbp"));
  $("btnPay").addEventListener("click", () => {
    const c = payCalc(); if (!c.t) return;
    if (!db.state.dayId) { toast(T("Start the day first", "افتح النهار أول")); return; }
    // The customer's money must be entered and must cover the total.
    if (!c.paid) { toast(T("Enter how much the customer gave", "اكتب قديش عطاك الزبون")); return; }
    if (c.change < 0) return;
    const exact = false;
    const sale = { dayId: db.state.dayId, no: db.sales.length + 1, t: Date.now(), lines: cartLines(), totalL: c.t, rate: R(),
      paidUSD: exact ? 0 : c.pu, paidLBP: exact ? c.t : c.pl, changeUSD: exact ? 0 : c.changeUSD, changeLBP: exact ? 0 : c.changeLBP, void: false };
    const saved = activeCheck && checkOf(activeCheck) ? Store.payCheck(activeCheck, { ...sale, label: checkOf(activeCheck).label }) : Store.addSale(sale);
    clearOrder(); showReceipt(saved);
  });
  const canPrint = (() => { try { return window.self === window.top; } catch (e) { return false; } })();
  function receiptHTML(s) {
    const r = s.rate || R(), u = l => "$" + (l / r).toFixed(2), n = v => Math.round(v).toLocaleString("en-US");
    return `<div class="receipt" id="receipt">
    <img class="rlogo" src="assets/logo.png" alt=""><div class="c">${esc(SHOP.place)}</div><div class="c">${T("Tel", "هاتف")} ${esc(SHOP.phone)}</div>
    <hr>${s.label ? `<div class="c"><b>${esc(s.label)}</b>${s.phone ? " · " + esc(s.phone) : ""}</div>` : ""}${s.debt ? `<div class="c"><b>${T("DEBT, NOT PAID", "دين، ما اندفع")}</b></div>` : ""}${s.debtPay ? `<div class="c"><b>${T("DEBT PAYMENT", "دفع دين")}</b></div>` : ""}<div class="r"><span>${T("Order", "طلب")} #${s.no || ""}</span><span>${new Date(s.t).toLocaleString(loc(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div><hr>
    ${s.lines.map(l => `<div class="r"><span>${l.qty} x ${esc(nameOf(l))}</span><span>${n(l.priceL * l.qty)}</span></div>`).join("")}
    <hr><div class="r tot"><span>${T("TOTAL LBP", "المجموع ليرة")}</span><span>${n(s.totalL)}</span></div>
    <div class="r"><span>${T("TOTAL USD", "المجموع دولار")}</span><span>${u(s.totalL)}</span></div>
    ${s.paidUSD ? `<div class="r"><span>${T("Paid USD", "مدفوع دولار")}</span><span>$${(+s.paidUSD).toFixed(2)}</span></div>` : ""}
    ${s.paidLBP ? `<div class="r"><span>${T("Paid LBP", "مدفوع ليرة")}</span><span>${n(s.paidLBP)}</span></div>` : ""}
    ${s.changeUSD ? `<div class="r"><span>${T("Change USD", "الباقي دولار")}</span><span>$${(+s.changeUSD).toFixed(2)}</span></div>` : ""}
    ${s.changeLBP ? `<div class="r"><span>${T("Change LBP", "الباقي ليرة")}</span><span>${n(s.changeLBP)}</span></div>` : ""}
    <div class="r"><span>${T("Rate", "السعر")}</span><span>$1 = ${n(r)} ${T("LBP", "ل.ل.")}</span></div>
    <hr><div class="c">${esc(SHOP.footer)}</div></div>`;
  }
  function showReceipt(s) {
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3>${T("Sale saved", "البيع انحفظ")}</h3>${receiptHTML(s)}
    <div class="row" style="margin-top:10px">${canPrint ? `<button class="btn dark" id="rcPrint">${T("Print receipt", "اطبع الفاتورة")}</button>` : ""}<button class="btn primary" id="rcDone">${T("Next order", "الطلب الجاي")}</button></div></div></div>`;
    if (canPrint) $("rcPrint").addEventListener("click", () => window.print());
    $("rcDone").addEventListener("click", () => { closeModal(); render(); });
  }

  /* ---------- bread ---------- */
  function breadText(n) { const s = Calc.splitBread(n, S().lpb); return T(`${n} loaves (${s.bundles} bundle${Math.abs(s.bundles) === 1 ? "" : "s"} + ${s.loose})`, `${n} رغيف (${s.bundles} ربطة + ${s.loose})`); }
  function renderBread() {
    const d = day(), s = sum(), lv = T("loaves", "رغيف");
    const moved = (d.breadMoves || []).filter(m => m.type === "move").reduce((a, m) => a + m.loaves, 0), wasted = (d.breadMoves || []).filter(m => m.type === "waste").reduce((a, m) => a + m.loaves, 0);
    renderDrinksPanel();
    $("breadKV").innerHTML = `<dt>${T("Left from yesterday", "باقي من مبارح")}</dt><dd>${d.carried || 0} ${lv}</dd>
    <dt>${T("New bread at the start", "خبز جديد أول النهار")}</dt><dd>${d.startBundles} ${T("bundles", "ربطة")} + ${d.startLoose} ${T("loose", "فرط")}</dd>
    <dt>${T("Added during the day", "انزاد خلال النهار")}</dt><dd>${d.addedLoaves || 0} ${lv}</dd>
    <dt>${T("Moved to main shop", "انتقل عالمحل الرئيسي")}</dt><dd>${moved} ${lv}</dd>
    <dt>${T("Waste", "تالف")}</dt><dd>${wasted} ${lv}</dd>
    <dt>${T("Total bread today", "كل الخبز اليوم")}</dt><dd>${breadText(s.breadTotal)}</dd>
    <dt>${T("Used by paid sales", "انصرف ببيع مدفوع")}</dt><dd>${s.breadSold} ${lv}</dd>
    <dt>${T("On open checks (not paid yet)", "عالحسابات المفتوحة (ما اندفعت)")}</dt><dd>${s.checkBread} ${lv}</dd>
    <dt>${T("Should be left", "لازم يكون باقي")}</dt><dd>${breadText(s.breadLeft)}</dd>
    <dt>${T("Loaves per bundle", "أرغفة بالربطة")}</dt><dd>${S().lpb}</dd>`;
    const c = bread(), el = $("breadVerdict");
    if (!c) { el.innerHTML = ""; return; }
    if (c.invalid) { el.innerHTML = `<div class="verdict warn"><div class="h">${T("Check the count", "راجع العدّ")}</div><p>${T(`You counted ${breadText(c.counted)} but the day only had ${breadText(sum().breadTotal)}. Count again, or add the bread that was delivered first.`, `عدّيت ${breadText(c.counted)} بس النهار كان فيه ${breadText(sum().breadTotal)} بس. عدّ مرة تانية، أو زيد الخبز اللي وصل أول.`)}</p></div>`; return; }
    if (c.missing > 0) el.innerHTML = `<div class="verdict bad"><div class="h">${T(`${c.missing} loaves not rung up`, `${c.missing} رغيف ما انسجلوا`)}</div><p>${T(`${c.used} loaves were used but only ${c.sold} sandwiches were sold${c.onChecks ? ` and ${c.onChecks} are on open checks` : ""}. That is about <b>${L(c.missingL)}</b> (${U(LtoU(c.missingL))}) missing, unless bread was thrown away or eaten by staff.`, `انصرف ${c.used} رغيف بس انباع ${c.sold} سندويشة بس${c.onChecks ? ` و${c.onChecks} عالحسابات المفتوحة` : ""}. يعني تقريباً <b>${L(c.missingL)}</b> (${U(LtoU(c.missingL))}) ناقصين، إلا إذا الخبز انكب أو أكلو الموظفين.`)}</p></div>`;
    else if (c.missing < 0) el.innerHTML = `<div class="verdict warn"><div class="h">${T(`${-c.missing} extra loaves on the shelf`, `${-c.missing} رغيف زيادة عالرف`)}</div><p>${T("More bread is left than expected. Check the count, or bread was added without being entered.", "باقي خبز أكتر من المتوقع. راجع العدّ، أو في خبز انزاد وما انسجل.")}</p></div>`;
    else el.innerHTML = `<div class="verdict good"><div class="h">${T("Bread matches sales", "الخبز مظبوط مع البيع")}</div><p>${T(`${c.used} loaves used, ${c.sold} sandwiches sold.`, `انصرف ${c.used} رغيف، وانباع ${c.sold} سندويشة.`)}</p></div>`;
  }
  function renderDrinksPanel() {
    const d = day(); if (!d) return;
    const ids = drinks().map(i => i.id), r = Calc.drinkCheck(d.drinksStart, d.drinksAdded, db.sales, null, ids, alias());
    $("drinksToday").innerHTML = !d.drinksStart ? `<p class="hint">${T("Drinks were not counted at the start of this day.", "المشروبات ما انعدّت أول هالنهار.")}</p>`
      : `<dl class="kv">${drinks().map(i => `<dt>${dName(i)}</dt><dd>${r[i.id].expected} <small style="font-weight:500">(${r[i.id].start} + ${r[i.id].added} − ${r[i.id].sold} ${T("sold", "انباع")})</small></dd>`).join("")}</dl>`;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#drinksAdd")) return;
    $("drinksAdd").innerHTML = drinkFields("adD-");
  }
  $("btnAddDrinks").addEventListener("click", async () => {
    const add = readDrinks("adD-"), d = day(); if (!d) return;
    const n = Object.values(add).reduce((a, v) => a + v, 0); if (!n) { toast(T("Enter how many arrived", "اكتب قديش وصل")); return; }
    const cur = { ...(d.drinksAdded || {}) }; Object.entries(add).forEach(([k, v]) => cur[k] = (cur[k] || 0) + v);
    await Store.updateDay(d.id, { drinksAdded: cur }); document.activeElement.blur(); $("drinksAdd").innerHTML = ""; toast(T(`Added ${n} drinks`, `انزاد ${n} مشروب`)); render();
  });
  $("btnAddBread").addEventListener("click", async () => {
    const n = Math.round(num($("addBundles").value)) * S().lpb + Math.round(num($("addLoose").value));
    if (!n) return; await Store.updateDay(day().id, { addedLoaves: (day().addedLoaves || 0) + n });
    $("addBundles").value = 0; $("addLoose").value = 0; toast(T(`Added ${n} loaves`, `انزاد ${n} رغيف`)); render();
  });
  async function breadOut(type) {
    const n = Math.round(num($("outBundles").value)) * S().lpb + Math.round(num($("outLoose").value));
    if (n <= 0) { toast(T("Enter how much bread", "اكتب قديش خبز")); return; }
    if (n > sum().breadLeft) { toast(T(`Only ${sum().breadLeft} loaves should be left`, `لازم يكون باقي ${sum().breadLeft} رغيف بس`)); return; }
    await Store.updateDay(day().id, { breadMoves: [...(day().breadMoves || []), { type, loaves: n, t: Date.now() }] });
    $("outBundles").value = 0; $("outLoose").value = 0; toast(type === "move" ? T(`${n} loaves moved to the main shop`, `${n} رغيف انتقلوا عالمحل الرئيسي`) : T(`${n} loaves marked as waste`, `${n} رغيف انسجلوا تالف`)); render();
  }
  $("btnMove").addEventListener("click", () => breadOut("move"));
  $("btnWaste").addEventListener("click", () => breadOut("waste"));
  $("btnCountBread").addEventListener("click", async () => {
    if ($("cntBundles").value === "" && $("cntLoose").value === "") { toast(T("Enter the bread you counted", "اكتب الخبز اللي عدّيتو")); return; }
    const bundles = Math.max(0, Math.round(num($("cntBundles").value))), loose = Math.max(0, Math.round(num($("cntLoose").value)));
    const counted = bundles * S().lpb + loose, total = sum().breadTotal;
    if (counted > total) { toast(T(`That is ${counted} loaves, but today only had ${total}. Check the count or add the delivered bread first.`, `هيدا ${counted} رغيف، بس اليوم كان في ${total} بس. راجع العدّ أو زيد الخبز اللي وصل أول.`)); return; }
    await Store.updateDay(day().id, { breadCount: { bundles, loose, t: Date.now() } }); render();
  });

  /* ---------- cash ---------- */
  function verdictMoney(diff, title) {
    const v = Calc.verdict(diff, S().tol);
    if (v === "ok") return `<div class="verdict good"><div class="h">${title}: ${T("drawer is correct", "الصندوق مظبوط")}</div><p>${T("Difference", "الفرق")} ${L(diff)}.</p></div>`;
    if (v === "short") return `<div class="verdict bad"><div class="h">${title}: ${T("short", "ناقص")} ${L(-diff)}</div><p>${T(`That is ${U(LtoU(-diff))} missing from the drawer.`, `يعني ${U(LtoU(-diff))} ناقصين من الصندوق.`)}</p></div>`;
    return `<div class="verdict warn"><div class="h">${title}: ${T("over by", "زيادة")} ${L(diff)}</div><p>${T(`${U(LtoU(diff))} more than expected. A sale may not have been entered.`, `${U(LtoU(diff))} أكتر من المتوقع. يمكن في بيعة ما انسجلت.`)}</p></div>`;
  }
  function renderCash() {
    const d = day(), s = sum();
    $("expKV").innerHTML = `<dt>${T("Orders", "الطلبات")}</dt><dd>${s.orders}</dd>
    <dt>${T("Sales total", "مجموع البيع")}</dt><dd>${L(s.totalL)} · ${U(LtoU(s.totalL))}</dd>
    <dt>${T("Starting float", "مصاري أول النهار")}</dt><dd>${U(d.openUSD || 0)} + ${L(d.openLBP || 0)}</dd>
    <dt>${T("Open checks, not paid yet", "حسابات مفتوحة، ما اندفعت")}</dt><dd>${s.openChecks} · ${L(s.checksL)}</dd>
    ${s.debts ? `<dt>${T("Sold on debt today, not in drawer", "انباع دين اليوم، مش بالصندوق")}</dt><dd>${s.debts} · ${L(s.debtL)}</dd>` : ""}
    ${s.debtPaidL ? `<dt>${T("Old debts paid today", "ديون قديمة اندفعت اليوم")}</dt><dd>${L(s.debtPaidL)}</dd>` : ""}
    <dt>${T("Cash taken in (after change)", "مصاري فاتت (بعد الباقي)")}</dt><dd>${U(s.inUSD)} + ${L(s.inLBP)}</dd>
    <dt><b>${T("Dollars that should be in drawer", "الدولار اللي لازم يكون بالصندوق")}</b></dt><dd>${U(s.expUSD)}</dd>
    <dt><b>${T("Lira that should be in drawer", "الليرة اللي لازم تكون بالصندوق")}</b></dt><dd>${L(s.expLBP)}</dd>
    <dt>${T("All together at", "كلو سوا عسعر")} ${R().toLocaleString("en-US")}</dt><dd>${L(s.expLBP + Math.round(s.expUSD * R()))}</dd>`;
    const b = bread(), c = Calc.cashCheck(d, s, R(), b);
    if (!c) { $("cashVerdict").innerHTML = ""; $("breadCashVerdict").innerHTML = ""; return; }
    $("cashVerdict").innerHTML = verdictMoney(c.diff, T("By sales", "حسب البيع")) +
      `<dl class="kv" style="margin-top:10px"><dt>${T("Dollars counted / expected", "دولار معدود / متوقع")}</dt><dd>${U(c.usd)} / ${U(s.expUSD)}</dd><dt>${T("Lira counted / expected", "ليرة معدودة / متوقعة")}</dt><dd>${L(c.lbp)} / ${L(s.expLBP)}</dd></dl>`;
    $("breadCashVerdict").innerHTML = b && !b.invalid ? verdictMoney(c.diffBread, T("By bread used", "حسب الخبز المصروف")) + `<p class="hint" style="margin-top:6px">${T(`Every loaf that left the shelf should be a paid sandwich. ${b.paidUsed} loaves used for paid sales × ${L(b.loafL)} + drinks and fries sold + starting float = ${L(c.byBread)} should be in the drawer.`, `كل رغيف طلع من الرف لازم يكون سندويشة مدفوعة. ${b.paidUsed} رغيف للبيع المدفوع × ${L(b.loafL)} + المشروبات والبطاطا + مصاري أول النهار = ${L(c.byBread)} لازم يكونوا بالصندوق.`)}</p>`
      : b && b.invalid ? `<p class="hint" style="margin-top:10px">${T("The bread count on the Bread page is higher than the bread you had today. Fix it there to check the drawer against bread used.", "عدّ الخبز بصفحة الخبز أكتر من الخبز اللي كان عندك اليوم. صلّحو هونيك لتفحص الصندوق حسب الخبز.")}</p>`
      : `<p class="hint" style="margin-top:10px">${T("Count the bread on the Bread page to also check the drawer against bread used.", "عدّ الخبز بصفحة الخبز لتفحص الصندوق كمان حسب الخبز المصروف.")}</p>`;
  }
  $("btnCountCash").addEventListener("click", async () => {
    if ($("cntUSD").value === "" && $("cntLBP").value === "") { toast(T("Enter the cash you counted", "اكتب المصاري اللي عدّيتها")); return; }
    await Store.updateDay(day().id, { cashCount: { usd: num($("cntUSD").value), lbp: Math.round(num($("cntLBP").value)), t: Date.now() } }); render();
  });

  /* ---------- sales report ---------- */
  function renderReport() {
    const s = sum(), rows = Object.entries(s.byItem).sort((a, b) => b[1].totalL - a[1].totalL);
    $("byItem").innerHTML = `<thead><tr><th>${T("Item", "الصنف")}</th><th class="n">${T("Qty", "العدد")}</th><th class="n">${T("LBP", "ليرة")}</th><th class="n">${T("USD", "دولار")}</th></tr></thead><tbody>` +
      (rows.length ? rows.map(([n, v]) => `<tr><td>${esc(nameOf({ name: n, id: (db.menu.find(i => i.name === n) || {}).id }))}</td><td class="n">${v.qty}</td><td class="n">${Math.round(v.totalL).toLocaleString("en-US")}</td><td class="n">${U(LtoU(v.totalL))}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">${T("No sales yet today", "ما في بيع بعد اليوم")}</td></tr>`) +
      `<tr><td><b>${T("Total", "المجموع")}</b></td><td></td><td class="n"><b>${Math.round(s.totalL).toLocaleString("en-US")}</b></td><td class="n"><b>${U(LtoU(s.totalL))}</b></td></tr></tbody>`;
    $("openChecks").innerHTML = `<thead><tr><th>${T("Check", "الحساب")}</th><th>${T("Items", "الأصناف")}</th><th class="n">${T("Total", "المجموع")}</th><th></th></tr></thead><tbody>` + (db.checks.length ? db.checks.map(c => `<tr><td>${esc(c.label)}<br><small>${fmtTime(c.t)} · ${esc(c.byName || "")}</small></td><td>${c.lines.map(l => l.qty + "× " + esc(nameOf(l))).join("، ")}</td><td class="n">${L(c.lines.reduce((a, l) => a + l.priceL * l.qty, 0))}</td><td><button class="mini" data-cancel="${c.id}">${T("Cancel", "إلغاء")}</button></td></tr>`).join("") : `<tr><td colspan="4" class="empty">${T("No open checks", "ما في حسابات مفتوحة")}</td></tr>`) + "</tbody>";
    $("debtsTbl").innerHTML = `<thead><tr><th>${T("Client", "الزبون")}</th><th>${T("Items", "الأصناف")}</th><th class="n">${T("Owes", "عليه")}</th><th></th></tr></thead><tbody>` + (db.debts.length ? db.debts.map(d => `<tr><td>${esc(d.name)}<br><small>${esc(d.phone)} · ${fmtDate(d.t)}</small></td><td>${d.lines.map(l => l.qty + "× " + esc(nameOf(l))).join("، ")}</td><td class="n">${L(d.totalL)}<br><small>${U(LtoU(d.totalL))}</small></td><td><button class="mini" data-paydebt="${d.id}">${T("Pay", "ادفع")}</button></td></tr>`).join("")
      + `<tr><td><b>${T("Total", "المجموع")}</b></td><td></td><td class="n"><b>${L(db.debts.reduce((a, d) => a + d.totalL, 0))}</b></td><td></td></tr>` : `<tr><td colspan="4" class="empty">${T("No debts", "ما في ديون")}</td></tr>`) + "</tbody>";
    const ss = [...db.sales].reverse();
    $("orders").innerHTML = `<thead><tr><th>${T("Time", "الوقت")}</th><th>${T("Items", "الأصناف")}</th><th class="n">${T("Total", "المجموع")}</th><th>${T("By", "مين")}</th><th></th></tr></thead><tbody>` +
      (ss.length ? ss.map(x => `<tr class="${x.void ? "void" : ""}"><td>${x.no ? "#" + x.no + " " : ""}${fmtTime(x.t)}</td><td>${x.debtPay ? `<b>${T("Debt paid", "دين اندفع")}:</b> ${esc(x.label || "")}` : x.lines.map(l => l.qty + "× " + esc(nameOf(l))).join("، ")}${x.debt ? ` <b style="color:var(--warn)">· ${T("debt", "دين")}: ${esc(x.label || "")}</b>` : ""}</td><td class="n">${L(x.totalL)}</td><td>${esc(x.byName || "")}</td><td>${x.void ? T("Voided", "ملغى") : x.debt || x.debtPay ? "" : `<button class="mini" data-void="${x.id}">${T("Void", "إلغاء")}</button>`}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">${T("No orders yet", "ما في طلبات بعد")}</td></tr>`) + "</tbody>";
    const hist = db.days.filter(d => d.status === "closed" && d.summary).reverse();
    $("history").innerHTML = `<thead><tr><th>${T("Day", "النهار")}</th><th class="n">${T("Sales", "البيع")}</th><th class="n">${T("Sandwiches", "سندويشات")}</th><th class="n">${T("Drawer", "الصندوق")}</th></tr></thead><tbody>` +
      (hist.length ? hist.map(d => { const h = d.summary; return `<tr data-day="${d.id}" style="cursor:pointer"><td>${fmtDate(d.openedAt)}<br><small style="color:var(--accent)">${T("Tap for report", "كبوس للتقرير")}</small></td><td class="n">${L(h.salesL)}</td><td class="n">${h.sandwiches}${h.breadMissing > 0 ? ` <span style="color:var(--bad)">(${h.breadMissing} ${T("missing", "ناقص")})</span>` : ""}</td><td class="n" style="color:${h.drawerDiff == null ? "var(--muted)" : h.drawerDiff < -S().tol ? "var(--bad)" : "var(--good)"}">${h.drawerDiff == null ? T("Not counted", "ما انعدّ") : (h.drawerDiff < 0 ? T("Short ", "ناقص ") : "") + L(Math.abs(h.drawerDiff))}</td></tr>`; }).join("") : `<tr><td colspan="4" class="empty">${T("No closed days yet", "ما في أيام مسكّرة بعد")}</td></tr>`) + "</tbody>";
  }
  $("openChecks").addEventListener("click", async e => {
    const b = e.target.closest("[data-cancel]"); if (!b) return;
    if (b.dataset.sure) { await Store.cancelCheck(b.dataset.cancel); toast(T("Check cancelled", "الحساب انلغى")); render(); return; }
    b.dataset.sure = "1"; b.textContent = T("Tap again to cancel", "كبوس كمان مرة للإلغاء"); b.style.color = "var(--bad)";
  });
  $("orders").addEventListener("click", async e => {
    const b = e.target.closest("[data-void]"); if (!b) return;
    if (b.dataset.sure) { await Store.voidSale(b.dataset.void); toast(T("Order voided", "الطلب انلغى")); render(); return; }
    b.dataset.sure = "1"; b.textContent = T("Tap again to void", "كبوس كمان مرة للإلغاء"); b.style.color = "var(--bad)";
  });
  // Close day: on Cash check and on Sales. Asks once inside the page before closing.
  const closeBtn = () => `<button class="btn danger" data-close="ask">${T("Close day", "سكّر النهار")}</button>`;
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-close]"); if (!b) return;
    const area = b.closest(".close-area"), what = b.dataset.close;
    if (what === "ask") { const oc = db.checks.length;
      // The day cannot close while a check is open: it must be paid or saved as a debt first.
      if (oc) { area.innerHTML = `<div class="verdict bad" style="margin-bottom:8px"><div class="h">${T(`Can't close: ${oc} open check${oc > 1 ? "s" : ""}`, `ما فيك تسكّر: في ${oc} حساب مفتوح`)}</div><p>${T(`${L(sum().checksL)} is still on open checks. On the Sell screen, get each one paid or tap <b>Save as debt</b>.`, `في ${L(sum().checksL)} عالحسابات المفتوحة. من شاشة البيع، خلّي كل حساب يندفع أو كبوس <b>سجّل دين</b>.`)}</p></div><div class="row"><button class="btn" data-close="no">${T("OK", "تمام")}</button></div>`; return; }
      closeDayModal(); return; }
    if (what === "no") { area.innerHTML = closeBtn(); return; }
  });
  // Closing the day, step by step: what should be there, count the bread and the drawer, decide about the
  // leftover bread, then close. The closing report is kept in Sales → Past days.
  function closeDayModal() {
    const d = day(); if (!d) return;
    const s = sum(), lpb = S().lpb, sp = Calc.splitBread(Math.max(0, s.breadLeft), lpb);
    const f = (id, label, v, mode) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" inputmode="${mode || "numeric"}" value="${v}"></div>`;
    const h2 = t => `<h2 style="font-size:16px;margin:16px 0 6px">${t}</h2>`;
    $("modalRoot").innerHTML = `<div class="modal"><div class="box" style="max-width:560px"><h3>${T("Close the day", "سكّر النهار")}</h3>
      ${h2(T("1. Today's report", "1. تقرير اليوم"))}
      <dl class="kv"><dt>${T("Orders", "الطلبات")}</dt><dd>${s.orders}</dd><dt>${T("Sales total", "مجموع البيع")}</dt><dd>${L(s.totalL)}</dd>
      ${s.debts ? `<dt>${T("Sold on debt, not in drawer", "انباع دين، مش بالصندوق")}</dt><dd>${L(s.debtL)}</dd>` : ""}
      <dt>${T("Bread that should be left", "الخبز اللي لازم يكون باقي")}</dt><dd>${s.breadLeft} ${T("loaves", "رغيف")} (${sp.bundles} ${T("bundles", "ربطة")} + ${sp.loose})</dd>
      <dt><b>${T("Dollars that should be in drawer", "الدولار اللي لازم يكون بالصندوق")}</b></dt><dd><b>${U(s.expUSD)}</b></dd>
      <dt><b>${T("Lira that should be in drawer", "الليرة اللي لازم تكون بالصندوق")}</b></dt><dd><b>${L(s.expLBP)}</b></dd></dl>
      ${h2(T("2. Count the bread left", "2. عدّ الخبز الباقي"))}
      <div class="row">${f("cdB", T("Bundles", "ربطات"), "")}${f("cdL", T("Loose loaves", "أرغفة فرط"), "")}</div><div id="cdBreadV"></div>
      ${drinks().length ? h2(T("3. Count the drinks (pieces)", "3. عدّ المشروبات (حبّة)")) + drinkFields("cdD-") + '<div id="cdDrinkV"></div>' : ""}
      ${h2(T("4. Count the drawer", "4. عدّ الصندوق"))}
      <div class="row">${f("cdU", T("Dollars in drawer (US$)", "دولار بالصندوق"), "", "decimal")}${f("cdLBP", T("Lira in drawer (LBP)", "ليرة بالصندوق"), "")}</div><div id="cdCashV"></div>
      ${h2(T("5. What to do with the bread left?", "5. شو بدك تعمل بالخبز الباقي؟"))}
      <div class="row">${f("cdMove", T("Move to main shop (loaves)", "نقل عالمحل الرئيسي (أرغفة)"), 0)}${f("cdWaste", T("Waste (loaves)", "تالف (أرغفة)"), 0)}</div>
      <p class="hint" id="cdKeep"></p><div class="err" id="cdErr"></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="cdNo">${T("Cancel", "إلغاء")}</button><button class="btn danger" id="cdGo" disabled>${T("Close the day", "سكّر النهار")}</button></div></div></div>`;
    const v = id => Math.max(0, Math.round(num($(id).value))), filled = id => $(id).value.trim() !== "";
    const calc = () => {
      const breadIn = filled("cdB") || filled("cdL"), cashIn = filled("cdU") || filled("cdLBP");
      const counted = v("cdB") * lpb + v("cdL");
      const dd = { ...d, breadCount: breadIn ? { bundles: v("cdB"), loose: v("cdL"), t: Date.now() } : null,
        cashCount: cashIn ? { usd: num($("cdU").value), lbp: Math.round(num($("cdLBP").value)), t: Date.now() } : null };
      const br = breadIn ? Calc.breadCheck(dd, s, lpb, menuLoafL()) : null, c = cashIn ? Calc.cashCheck(dd, s, R(), br) : null;
      const mv = v("cdMove"), ws = v("cdWaste"), keep = counted - mv - ws;
      const dc = readDrinks("cdD-"), drinksIn = drinks().every(i => dc[i.id] != null);
      const dk = Calc.drinkCheck(d.drinksStart, d.drinksAdded, db.sales, dc, drinks().map(i => i.id), alias());
      const dMissL = drinks().reduce((a, i) => a + Math.max(0, dk[i.id].missing || 0) * priceL(i), 0);
      return { breadIn, cashIn, counted, dd, br, c, mv, ws, keep, dc, drinksIn, dk, dMissL };
    };
    const show = () => { const x = calc();
      $("cdBreadV").innerHTML = !x.br ? "" : x.br.invalid ? `<div class="verdict warn"><div class="h">${T("Check the count", "راجع العدّ")}</div><p>${T(`That is more than the ${s.breadTotal} loaves you had today.`, `هيدا أكتر من الـ ${s.breadTotal} رغيف اللي كانوا عندك اليوم.`)}</p></div>`
        : x.br.missing > 0 ? `<div class="verdict bad"><div class="h">${T(`${x.br.missing} loaves not rung up`, `${x.br.missing} رغيف ما انسجلوا`)}</div><p>${T("About", "تقريباً")} ${L(x.br.missingL)} (${U(LtoU(x.br.missingL))})</p></div>`
        : x.br.missing < 0 ? `<div class="verdict warn"><div class="h">${T(`${-x.br.missing} extra loaves`, `${-x.br.missing} رغيف زيادة`)}</div></div>`
        : `<div class="verdict good"><div class="h">${T("Bread matches sales", "الخبز مظبوط مع البيع")}</div></div>`;
      if ($("cdDrinkV")) $("cdDrinkV").innerHTML = !d.drinksStart ? `<p class="hint">${T("Drinks were not counted at the start of this day, so only today's count is saved.", "المشروبات ما انعدّت أول هالنهار، فبينحفظ عدّ اليوم بس.")}</p>`
        : `<div class="tbl"><table><thead><tr><th>${T("Drink", "المشروب")}</th><th class="n">${T("Had", "كان")}</th><th class="n">${T("Sold", "انباع")}</th><th class="n">${T("Should be", "لازم")}</th><th class="n">${T("Missing", "ناقص")}</th></tr></thead><tbody>${drinks().map(i => { const r = x.dk[i.id];
          return `<tr><td>${dName(i)}</td><td class="n">${r.start + r.added}</td><td class="n">${r.sold}</td><td class="n"><b>${r.expected}</b></td><td class="n" style="color:${r.missing > 0 ? "var(--bad)" : r.missing < 0 ? "var(--warn)" : "var(--good)"}">${r.missing == null ? "" : r.missing > 0 ? r.missing : r.missing < 0 ? "+" + -r.missing : "✓"}</td></tr>`; }).join("")}</tbody></table></div>
          ${x.drinksIn ? x.dMissL > 0 ? `<div class="verdict bad"><div class="h">${T("Drinks missing", "مشروبات ناقصة")}: ${L(x.dMissL)}</div><p>${U(LtoU(x.dMissL))}</p></div>` : `<div class="verdict good"><div class="h">${T("Drinks match sales", "المشروبات مظبوطة مع البيع")}</div></div>` : ""}`;
      $("cdCashV").innerHTML = x.c ? verdictMoney(x.c.diff, T("Drawer", "الصندوق")) : "";
      $("cdKeep").innerHTML = x.breadIn ? T(`Kept for tomorrow: <b>${Math.max(0, x.keep)} loaves</b>`, `بيبقى لبكرا: <b>${Math.max(0, x.keep)} رغيف</b>`) : "";
      $("cdErr").textContent = x.br && x.br.invalid ? T("Fix the bread count", "صلّح عدّ الخبز") : x.keep < 0 ? T(`Only ${x.counted} loaves are left to move or waste.`, `في ${x.counted} رغيف بس باقيين للنقل أو التالف.`) : "";
      $("cdGo").disabled = !x.breadIn || !x.cashIn || !x.drinksIn || x.keep < 0 || (x.br && x.br.invalid);
    };
    ["cdB", "cdL", "cdU", "cdLBP", "cdMove", "cdWaste", ...drinks().map(i => "cdD-" + i.id)].forEach(i => $(i).addEventListener("input", show)); show();
    $("cdNo").addEventListener("click", closeModal);
    $("cdGo").addEventListener("click", async () => {
      if (db.checks.length) { toast(T("Pay or save the open checks as debt first", "ادفع أو سجّل الحسابات المفتوحة كدين أول")); return; }
      const x = calc(); if ($("cdGo").disabled) return;
      $("cdGo").disabled = true;
      await Store.updateDay(d.id, { breadCount: x.dd.breadCount, cashCount: x.dd.cashCount });
      await Store.closeDay(d.id, { salesL: s.totalL, orders: s.orders, sandwiches: s.breadSold, breadMissing: x.br ? x.br.missing : null,
        drawerDiff: x.c ? x.c.diff : null, expUSD: s.expUSD, expLBP: s.expLBP, countedUSD: x.dd.cashCount.usd, countedLBP: x.dd.cashCount.lbp,
        breadCounted: x.counted, closeMove: x.mv, closeWaste: x.ws, breadLeftBundles: Math.floor(x.keep / lpb), breadLeftLoaves: x.keep,
        rate: R(), debtL: s.debtL, debtPaidL: s.debtPaidL, closedBy: Store.user.name || "",
        drinksLeft: x.dc, drinksMissingL: d.drinksStart ? x.dMissL : null,
        drinks: d.drinksStart ? Object.fromEntries(drinks().map(i => [i.id, { name: i.name, ar: i.ar || "", ...x.dk[i.id] }])) : null });
      closeModal(); skipStart = false; document.querySelectorAll(".close-area").forEach(a => a.innerHTML = closeBtn()); toast(T("Day closed", "النهار تسكّر")); go("sell");
    });
  }
  // The closing report of a past day.
  function dayReport(id) {
    const d = db.days.find(x => x.id === id); if (!d || !d.summary) return; const h = d.summary;
    const row = (k, v) => v == null ? "" : `<dt>${k}</dt><dd>${v}</dd>`;
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3>${fmtDate(d.openedAt)}</h3><dl class="kv">
      ${row(T("Orders", "الطلبات"), h.orders)}${row(T("Sales total", "مجموع البيع"), L(h.salesL))}${row(T("Sandwiches", "سندويشات"), h.sandwiches)}
      ${h.debtL ? row(T("Sold on debt", "انباع دين"), L(h.debtL)) : ""}${h.debtPaidL ? row(T("Old debts paid", "ديون قديمة اندفعت"), L(h.debtPaidL)) : ""}
      ${row(T("Dollars expected / counted", "دولار متوقع / معدود"), h.expUSD == null ? null : `${U(h.expUSD)} / ${U(h.countedUSD || 0)}`)}
      ${row(T("Lira expected / counted", "ليرة متوقعة / معدودة"), h.expLBP == null ? null : `${L(h.expLBP)} / ${L(h.countedLBP || 0)}`)}
      ${row(T("Drawer", "الصندوق"), h.drawerDiff == null ? T("Not counted", "ما انعدّ") : Calc.verdict(h.drawerDiff, S().tol) === "ok" ? T("Correct", "مظبوط") : (h.drawerDiff < 0 ? T("Short ", "ناقص ") : T("Over ", "زيادة ")) + L(Math.abs(h.drawerDiff)))}
      ${h.drinks ? row(T("Drinks missing", "مشروبات ناقصة"), Object.values(h.drinks).filter(r => r.missing).map(r => `${esc(AR ? r.ar || r.name : r.name)} ${r.missing > 0 ? r.missing : "+" + -r.missing}`).join("، ") || "✓") + (h.drinksMissingL ? row(T("Drinks missing value", "قيمة المشروبات الناقصة"), L(h.drinksMissingL)) : "") : ""}
      ${row(T("Bread counted at close", "الخبز المعدود عالتسكير"), h.breadCounted)}${row(T("Loaves not rung up", "أرغفة ما انسجلت"), h.breadMissing)}
      ${row(T("Moved to main shop", "انتقل عالمحل الرئيسي"), h.closeMove)}${row(T("Waste", "تالف"), h.closeWaste)}${row(T("Kept for next day", "بقي للنهار الجاي"), h.breadLeftLoaves)}
      ${row(T("Closed by", "سكّر"), h.closedBy ? esc(h.closedBy) : null)}</dl>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="drOk">${T("Close", "سكّر")}</button></div></div></div>`;
    $("drOk").addEventListener("click", closeModal);
  }
  $("history").addEventListener("click", e => { const r = e.target.closest("[data-day]"); if (r) dayReport(r.dataset.day); });

  /* ---------- shared till: who is working + PIN ---------- */
  let pinFor = null, pinBuf = "", pinFirst = null;
  // Nobody can set a PIN on the till itself, except the very first owner when no owner has a PIN yet.
  const canSetOwnPin = p => p && !p.pinHash && p.role === "owner" && !db.staff.some(x => x.role === "owner" && x.pinHash);
  function renderPin() {
    const p = pinFor && db.staff.find(x => x.id === pinFor);
    if (!p) {
      pinFor = null;
      $("v-pin").innerHTML = `<div class="panel auth" style="max-width:640px"><img class="biglogo" src="assets/logo.png" alt="Kabab Jiji"><h2 style="text-align:center">${T("Who is working?", "مين عم يشتغل؟")}</h2>
        <div class="who">${db.staff.map(x => `<button data-who="${x.id}">${esc(x.name)}<small>${x.role === "owner" ? T("Owner", "المالك") : T("Cashier", "كاشير")}</small></button>`).join("") || `<p class="hint">${T("No people yet. Log in as the owner and add them in Settings.", "ما في أشخاص بعد. فوت كمالك وزيدهم من الإعدادات.")}</p>`}</div>
        <div class="row" style="margin-top:14px"><button class="linkbtn" id="pinOut">${T("Log out of this device", "اطلع من هالجهاز")}</button></div></div>`;
      return;
    }
    const setting = canSetOwnPin(p);
    const title = setting ? (pinFirst == null ? T("Choose your PIN (4 to 6 digits)", "اختار PIN (4 لـ 6 أرقام)") : T("Type the same PIN again", "اكتب نفس الـ PIN كمان مرة")) : T("Type your PIN", "اكتب الـ PIN تبعك");
    const body = !p.pinHash && !setting ? `<p class="hint" style="text-align:center">${T("No PIN yet. Ask the owner to set it in Settings → Till people.", "ما في PIN بعد. خلّي المالك يحطّو من الإعدادات ← أشخاص التيل.")}</p>`
      : `<p class="hint" style="text-align:center">${title}</p><div class="pindots">${"●".repeat(pinBuf.length) || "&nbsp;"}</div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join("")}<button data-k="del" aria-label="${T("Delete", "امحي")}">⌫</button><button data-k="0">0</button><button data-k="ok" style="background:var(--good);color:#fff">OK</button></div>`;
    $("v-pin").innerHTML = `<div class="panel auth"><h2 style="text-align:center;font-size:28px">${esc(p.name)}</h2>${body}
      <div class="row" style="margin-top:14px"><button class="btn" id="pinBack" style="width:100%">${T("Back", "رجوع")}</button></div></div>`;
  }
  async function pinEnter() {
    const p = db.staff.find(x => x.id === pinFor); if (!p) return;
    if (pinBuf.length < 4) { toast(T("PIN must be 4 to 6 digits", "الـ PIN لازم يكون 4 لـ 6 أرقام")); return; }
    const pin = pinBuf;
    if (canSetOwnPin(p)) {
      if (pinFirst == null) { pinFirst = pin; pinBuf = ""; renderPin(); return; }
      if (pinFirst !== pin) { pinFirst = null; pinBuf = ""; toast(T("The two PINs are different. Try again.", "الرقمين مش متل بعض. جرّب كمان مرة.")); renderPin(); return; }
      await Store.setPin(p.id, pin);
    }
    pinBuf = ""; pinFirst = null;
    const ok = await Store.unlock(p.id, pin).catch(() => false);
    if (!ok) { toast(T("Wrong PIN", "الـ PIN غلط")); renderPin(); return; }
    pinFor = null; cart = {}; activeCheck = null; currentView = "sell"; toast(T(`Hello ${p.name}`, `أهلا ${p.name}`)); render();
  }
  $("v-pin").addEventListener("click", e => {
    const w = e.target.closest("[data-who]"), k = e.target.closest("[data-k]");
    if (w) { pinFor = w.dataset.who; pinBuf = ""; pinFirst = null; renderPin(); return; }
    if (e.target.id === "pinBack") { pinFor = null; pinBuf = ""; pinFirst = null; renderPin(); return; }
    if (e.target.id === "pinOut") { Store.signOut(); return; }
    if (!k) return;
    if (k.dataset.k === "del") pinBuf = pinBuf.slice(0, -1);
    else if (k.dataset.k === "ok") { pinEnter(); return; }
    else if (pinBuf.length < 6) pinBuf += k.dataset.k;
    renderPin();
  });
  document.addEventListener("keydown", e => {
    if ($("v-pin").hidden || !pinFor) return;
    if (/^\d$/.test(e.key) && pinBuf.length < 6) { pinBuf += e.key; renderPin(); }
    else if (e.key === "Backspace") { pinBuf = pinBuf.slice(0, -1); renderPin(); }
    else if (e.key === "Enter") pinEnter();
  });
  $("btnSwitch").addEventListener("click", () => {
    if (cartLines().length) { toast(T("Finish or save the current order first", "خلّص أو احفظ الطلب الحالي أول")); return; }
    cart = {}; activeCheck = null; closeModal(); Store.lock();
  });

  /* ---------- debts: the client pays another day ---------- */
  $("btnDebt").addEventListener("click", () => {
    const lines = cartLines(); if (!lines.length) { toast(T("Tap an item first", "كبوس على صنف أول")); return; }
    if (!db.state.dayId) return;
    const t = cartTotalL(), chk = activeCheck && checkOf(activeCheck);
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3>${T("Save as debt", "سجّل دين")}</h3>
      <p class="hint">${T("The client takes it now and pays another day. Name and phone are required.", "الزبون بياخد هلق وبيدفع يوم تاني. الاسم والتلفون لازم.")}</p>
      <p style="font-size:20px;font-weight:800;margin:6px 0">${L(t)} · ${U(LtoU(t))}</p>
      <div class="field"><label for="dbName">${T("Client name", "اسم الزبون")}</label><input id="dbName" autocomplete="off" value="${chk && !/^(Table|طاولة) \d+$/.test(chk.label) ? esc(chk.label) : ""}"></div>
      <div class="field"><label for="dbPhone">${T("Phone number", "رقم التلفون")}</label><input id="dbPhone" type="tel" inputmode="tel" autocomplete="off"></div>
      <div class="err" id="dbErr"></div>
      <div class="row"><button class="btn" id="dbNo">${T("Cancel", "إلغاء")}</button><button class="btn primary" id="dbGo">${T("Save debt", "احفظ الدين")}</button></div></div></div>`;
    $("dbName").focus();
    $("dbNo").addEventListener("click", closeModal);
    $("dbGo").addEventListener("click", () => {
      const name = $("dbName").value.trim(), phone = $("dbPhone").value.trim(), digits = phone.replace(/\D/g, "");
      if (!name) { $("dbErr").textContent = T("Enter the client's name", "اكتب اسم الزبون"); $("dbName").focus(); return; }
      if (digits.length < 6) { $("dbErr").textContent = T("Enter a real phone number", "اكتب رقم تلفون صحيح"); $("dbPhone").focus(); return; }
      const sale = { dayId: db.state.dayId, no: db.sales.length + 1, t: Date.now(), lines, totalL: t, rate: R(), paidUSD: 0, paidLBP: 0, changeUSD: 0, changeLBP: 0, void: false, phone };
      const saved = Store.addDebt(sale, { name, phone }, chk ? chk.id : null);
      cart = {}; activeCheck = null; $("paidUSD").value = ""; $("paidLBP").value = ""; changeMode = "lbp";
      toast(T(`Debt saved for ${name}`, `انسجل دين على ${name}`)); showReceipt(saved);
    });
  });
  // Pay an old debt (from the Sell screen or the Sales page).
  function debtsModal(onlyId) {
    if (!db.state.dayId) { toast(T("Start the day first", "افتح النهار أول")); return; }
    const list = onlyId ? db.debts.filter(d => d.id === onlyId) : db.debts;
    $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3>${T("Debts", "الديون")}</h3>
      ${list.map(d => `<div class="line" style="grid-template-columns:1fr auto"><span class="ln"><b>${esc(d.name)}</b> · ${esc(d.phone)}<small>${fmtDate(d.t)} · ${d.lines.map(l => l.qty + "× " + esc(nameOf(l))).join("، ")}</small></span>
        <span style="text-align:end"><b>${L(d.totalL)}</b><br><button class="btn primary" style="padding:8px 14px;font-size:15px;margin-top:4px" data-dpay="${d.id}">${T("Pay", "ادفع")}</button></span></div>`).join("") || `<p class="empty">${T("No debts", "ما في ديون")}</p>`}
      <div id="dpArea"></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="dpClose">${T("Close", "سكّر")}</button></div></div></div>`;
    $("dpClose").addEventListener("click", () => { closeModal(); render(); });
    $("modalRoot").querySelectorAll("[data-dpay]").forEach(b => b.addEventListener("click", () => payDebtForm(b.dataset.dpay)));
    if (onlyId) payDebtForm(onlyId);
  }
  function payDebtForm(id) {
    const d = db.debts.find(x => x.id === id); if (!d) return;
    $("dpArea").innerHTML = `<div class="panel" style="margin-top:10px"><h2 style="font-size:16px">${T("Payment from", "دفعة من")} ${esc(d.name)}: ${L(d.totalL)} · ${U(LtoU(d.totalL))}</h2>
      <div class="row"><div class="field"><label for="dpU">${T("Gave US$", "عطا دولار")}</label><input id="dpU" inputmode="decimal"></div><div class="field"><label for="dpL">${T("Gave LBP", "عطا ليرة")}</label><input id="dpL" inputmode="numeric"></div></div>
      <div class="row exact"><button class="btn" id="dpExU">${T("Exact in $", "المبلغ تماماً بالدولار")}</button><button class="btn" id="dpExL">${T("Exact in LBP", "المبلغ تماماً بالليرة")}</button></div>
      <p class="hint" id="dpHint"></p><button class="btn primary" style="width:100%" id="dpGo">${T("Confirm payment", "أكّد الدفع")}</button></div>`;
    const calc = () => Calc.change(d.totalL, num($("dpU").value), Math.round(num($("dpL").value)), R(), "lbp");
    const hint = () => { const c = calc(); $("dpHint").innerHTML = !c.paid ? "" : c.change < 0 ? `${T("Still owed", "بعد ناقص")} <b>${L(c.owed)}</b>` : `${T("Give back", "رجّعلو")} <b>${L(c.changeLBP)}</b>`; };
    ["dpU", "dpL"].forEach(i => $(i).addEventListener("input", hint));
    $("dpExU").addEventListener("click", () => { $("dpU").value = (Math.ceil(d.totalL / R() * 100) / 100).toString(); $("dpL").value = ""; hint(); });
    $("dpExL").addEventListener("click", () => { $("dpL").value = d.totalL.toLocaleString("en-US"); $("dpU").value = ""; hint(); });
    $("dpGo").addEventListener("click", () => {
      const c = calc(); if (!c.paid) { toast(T("Enter what the client gave", "اكتب شو عطا الزبون")); return; }
      if (c.change < 0) { toast(T("Not enough. The debt is paid in full only.", "مش كفاية. الدين بينْدفع كامل بس.")); return; }
      const saved = Store.payDebt(id, { dayId: db.state.dayId, no: db.sales.length + 1, t: Date.now(), rate: R(), paidUSD: num($("dpU").value), paidLBP: Math.round(num($("dpL").value)), changeUSD: 0, changeLBP: c.changeLBP, phone: d.phone });
      if (saved) { toast(T(`${d.name} paid`, `${d.name} دفع`)); showReceipt(saved); }
    });
    $("dpU").focus();
  }
  $("btnDebts").addEventListener("click", () => debtsModal());
  $("debtsTbl").addEventListener("click", e => { const b = e.target.closest("[data-paydebt]"); if (b) debtsModal(b.dataset.paydebt); });

  /* ---------- clients & debts (owner) ---------- */
  // Clients are grouped by phone number; each shows what they owe now and every debt they ever had.
  function renderClients() {
    const all = db.allDebts && db.allDebts.length ? db.allDebts : db.debts, q = $("clSearch").value.trim().toLowerCase(), qd = q.replace(/\D/g, "");
    const by = {};
    for (const d of all) { const k = String(d.phone || "").replace(/\D/g, "") || d.name; (by[k] = by[k] || []).push(d); }
    let list = Object.values(by).map(ds => { ds.sort((a, b) => b.t - a.t); const open = ds.filter(d => d.status === "open");
      return { name: ds[0].name, phone: ds[0].phone, ds, open, owed: open.reduce((a, d) => a + d.totalL, 0) }; });
    list.sort((a, b) => b.owed - a.owed || b.ds[0].t - a.ds[0].t);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (qd && String(c.phone).replace(/\D/g, "").includes(qd)));
    const owedAll = db.debts.reduce((a, d) => a + d.totalL, 0), owing = new Set(db.debts.map(d => String(d.phone).replace(/\D/g, ""))).size;
    $("clientsSum").innerHTML = `<span class="chip">${T("Owed to the shop", "مستحق للمحل")} <b>${L(owedAll)}</b> · ${U(LtoU(owedAll))}</span><span class="chip">${T("Clients owing", "زباين عليهم")} <b>${owing}</b></span>`;
    $("clients").innerHTML = list.length ? list.map(c => `<div class="panel" style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div><b style="font-size:19px">${esc(c.name)}</b><br><a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ""))}">${esc(c.phone)}</a></div>
        <div style="text-align:end">${c.owed ? `<span style="color:var(--bad);font-weight:800;font-size:19px">${T("Owes", "عليه")} ${L(c.owed)}</span><br><small>${U(LtoU(c.owed))}</small>` : `<span style="color:var(--good);font-weight:700">${T("Paid up", "مدفوع كلو")}</span>`}</div></div>
      <div class="tbl" style="margin-top:8px"><table><thead><tr><th>${T("Date", "التاريخ")}</th><th>${T("Items", "الأصناف")}</th><th class="n">${T("Amount", "المبلغ")}</th><th></th></tr></thead><tbody>
      ${c.ds.map(d => `<tr><td>${fmtDate(d.t)}<br><small>${esc(d.byName || "")}</small></td><td>${d.lines.map(l => l.qty + "× " + esc(nameOf(l))).join("، ")}</td><td class="n">${L(d.totalL)}</td>
        <td>${d.status === "open" ? `<button class="mini" data-clpay="${d.id}">${T("Pay", "ادفع")}</button>` : `<small style="color:var(--good)">${T("Paid", "اندفع")}${d.paidAt ? " " + fmtDate(d.paidAt) : ""}</small>`}</td></tr>`).join("")}
      </tbody></table></div></div>`).join("") : `<p class="empty">${q ? T("No client found", "ما في زبون هيك") : T("No debts yet", "ما في ديون بعد")}</p>`;
  }
  $("clSearch").addEventListener("input", renderClients);
  $("clients").addEventListener("click", e => { const b = e.target.closest("[data-clpay]"); if (b) debtsModal(b.dataset.clpay); });

  /* ---------- reports (owner): any date range ---------- */
  let rpRange = "today", rpData = null, rpKey = "", rpBusy = false;
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const isoDay = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  function rpBounds() {
    const now = Date.now(), t0 = dayStart(now), D = 864e5;
    if (rpRange === "yesterday") return [t0 - D, t0];
    if (rpRange === "week") { const wd = (new Date(t0).getDay() + 6) % 7; return [t0 - wd * D, t0 + D]; } // from Monday
    if (rpRange === "month") { const d = new Date(t0); d.setDate(1); return [d.getTime(), t0 + D]; }
    if (rpRange === "custom") { const f = $("rpFrom").value, to = $("rpTo").value;
      const a = f ? new Date(f + "T00:00").getTime() : t0, b = to ? new Date(to + "T00:00").getTime() + D : t0 + D; return [Math.min(a, b - D), b]; }
    return [t0, t0 + D];
  }
  // Everything for the period, worked out from the sales, the day closings and the debts.
  function rpCompute(sales, from, to) {
    const live = sales.filter(x => !x.void), sold = live.filter(x => !x.debtPay), lpb = S().lpb;
    const r = { from, to, orders: sold.length, totalL: 0, inUSD: 0, inLBP: 0, items: {}, hours: Array(24).fill(0), hoursN: Array(24).fill(0), people: {} };
    for (const x of live) { r.inUSD += (x.paidUSD || 0) - (x.changeUSD || 0); r.inLBP += (x.paidLBP || 0) - (x.changeLBP || 0); }
    for (const x of sold) {
      r.totalL += x.totalL;
      const h = new Date(x.t).getHours(); r.hours[h] += x.totalL; r.hoursN[h]++;
      const who = x.byName || "?"; const p = r.people[who] || (r.people[who] = { orders: 0, totalL: 0, closes: 0, diff: 0 }); p.orders++; p.totalL += x.totalL;
      for (const l of x.lines) { const k = nameOf(l); const it = r.items[k] || (r.items[k] = { qty: 0, totalL: 0 }); it.qty += l.qty; it.totalL += l.priceL * l.qty; }
    }
    r.avgL = r.orders ? r.totalL / r.orders : 0;
    r.days = db.days.filter(d => d.openedAt >= from && d.openedAt < to).sort((a, b) => a.openedAt - b.openedAt);
    const b = r.bread = { carriedIn: 0, received: 0, moved: 0, wasted: 0, carriedOver: 0, used: 0, sandwiches: 0, missing: 0, counted: 0 };
    for (const d of r.days) {
      const mv = (d.breadMoves || []).reduce((a, m) => { a[m.type] = (a[m.type] || 0) + m.loaves; return a; }, {});
      b.carriedIn += d.carried || 0; b.received += (d.startBundles || 0) * lpb + (d.startLoose || 0) + (d.addedLoaves || 0);
      b.moved += (mv.move || 0); b.wasted += (mv.waste || 0);
      const h = d.summary; if (!h) continue;
      b.moved += h.closeMove || 0; b.wasted += h.closeWaste || 0; b.carriedOver += h.breadLeftLoaves || 0; b.sandwiches += h.sandwiches || 0;
      if (h.breadMissing != null) b.missing += h.breadMissing;
      if (h.breadCounted != null) { b.counted++; b.used += Calc.breadTotal(d, lpb) - h.breadCounted; }
      if (h.drawerDiff != null && h.closedBy) { const p = r.people[h.closedBy] || (r.people[h.closedBy] = { orders: 0, totalL: 0, closes: 0, diff: 0 }); p.closes++; p.diff += h.drawerDiff; }
    }
    r.drinks = {}; r.drinksMissingL = 0; const al = alias();
    for (const d of r.days) { const h = d.summary; if (!h || !h.drinks) continue; r.drinksMissingL += h.drinksMissingL || 0;
      for (const [id0, x0] of Object.entries(h.drinks)) { const id = al[id0] || id0, it = db.menu.find(i => i.id === id), x = it ? { ...x0, name: it.name, ar: it.ar } : x0;
        const o = r.drinks[id] || (r.drinks[id] = { name: x.name, ar: x.ar, sold: 0, missing: 0 }); o.sold += x.sold || 0; o.missing += x.missing || 0; } }
    const all = db.allDebts && db.allDebts.length ? db.allDebts : db.debts;
    const nd = all.filter(d => d.t >= from && d.t < to), pd = all.filter(d => d.paidAt && d.paidAt >= from && d.paidAt < to);
    r.debts = { newN: nd.length, newL: nd.reduce((a, d) => a + d.totalL, 0), paidN: pd.length, paidL: pd.reduce((a, d) => a + d.totalL, 0), openN: db.debts.length, openL: db.debts.reduce((a, d) => a + d.totalL, 0) };
    r.sales = sold.sort((a, b) => a.t - b.t);
    return r;
  }
  async function rpLoad() {
    const [from, to] = rpBounds(), key = from + "-" + to;
    if (rpBusy || (rpKey === key && rpData)) return;
    rpBusy = true; $("rpBody").innerHTML = `<div class="panel"><p class="hint">${T("Loading…", "عم يحمّل…")}</p></div>`;
    try { const sales = await Store.fetchSales(from, to); rpKey = key; rpData = rpCompute(sales, from, to); }
    catch (e) { console.error(e); $("rpBody").innerHTML = `<div class="panel"><p class="err">${T("Could not load the report: ", "ما قدرنا نحمّل التقرير: ")}${esc(e.message)}</p></div>`; rpBusy = false; return; }
    rpBusy = false; renderReports();
  }
  function renderReports() {
    document.querySelectorAll("#rpRange [data-rg]").forEach(b => b.setAttribute("aria-pressed", b.dataset.rg === rpRange));
    $("rpCustom").hidden = rpRange !== "custom";
    const [from, to] = rpBounds();
    if (!rpData || rpKey !== from + "-" + to) { rpLoad(); return; }
    const r = rpData, P = (t, body) => `<div class="panel" style="margin-top:12px"><h2>${t}</h2>${body}</div>`;
    const kv = rows => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
    const tbl = (head, rows, empty) => `<div class="tbl"><table><thead><tr>${head.map(h => `<th${h[1] ? ' class="n"' : ""}>${h[0]}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${head.length}" class="empty">${empty || T("Nothing in this period", "ما في شي بهالفترة")}</td></tr>`}</tbody></table></div>`;
    const period = isoDay(from) === isoDay(to - 1) ? fmtDate(from) : fmtDate(from) + " → " + fmtDate(to - 1);
    const items = Object.entries(r.items).sort((a, b) => b[1].qty - a[1].qty);
    const maxH = Math.max(1, ...r.hours), hrs = r.hours.map((v, h) => [h, v]).filter(([h]) => r.hoursN[h]);
    const diffTxt = v => v == null ? T("Not counted", "ما انعدّ") : Calc.verdict(v, S().tol) === "ok" ? `<span style="color:var(--good)">${T("Correct", "مظبوط")}</span>` : `<span style="color:${v < 0 ? "var(--bad)" : "var(--warn)"}">${v < 0 ? T("Short ", "ناقص ") : T("Over ", "زيادة ")}${L(Math.abs(v))}</span>`;
    const b = r.bread, dbt = r.debts;
    $("rpBody").innerHTML =
      P(T("Sales", "المبيع") + ` · <small style="font-weight:600">${period}</small>`, kv([
        [T("Orders", "الطلبات"), r.orders], [T("Sales total", "مجموع البيع"), `${L(r.totalL)} · ${U(LtoU(r.totalL))}`],
        [T("Average order", "معدّل الطلب"), `${L(r.avgL)} · ${U(LtoU(r.avgL))}`],
        [T("Cash taken in (after change)", "مصاري فاتت (بعد الباقي)"), `${U(r.inUSD)} + ${L(r.inLBP)}`]])) +
      P(T("Best sellers", "الأكتر مبيع"), tbl([[T("Item", "الصنف")], [T("Qty", "العدد"), 1], [T("Total", "المجموع"), 1]], items.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${v.qty}</td><td class="n">${L(v.totalL)}</td></tr>`))) +
      P(T("Sales by hour", "المبيع حسب الساعة"), tbl([[T("Hour", "الساعة")], [T("Orders", "طلبات"), 1], [T("Total", "المجموع"), 1]], hrs.map(([h, v]) => `<tr><td style="white-space:nowrap">${String(h).padStart(2, "0")}:00<div style="height:8px;border-radius:4px;background:var(--accent);width:${Math.max(4, Math.round(v / maxH * 100))}%;min-width:4px;margin-top:3px"></div></td><td class="n">${r.hoursN[h]}</td><td class="n">${L(v)}</td></tr>`))) +
      P(T("By person", "حسب الشخص"), tbl([[T("Name", "الاسم")], [T("Orders", "طلبات"), 1], [T("Sales", "البيع"), 1], [T("Days closed", "أيام سكّرها"), 1], [T("Drawer difference", "فرق الصندوق"), 1]],
        Object.entries(r.people).sort((a, b) => b[1].totalL - a[1].totalL).map(([n, p]) => `<tr><td>${esc(n)}</td><td class="n">${p.orders}</td><td class="n">${L(p.totalL)}</td><td class="n">${p.closes}</td><td class="n">${p.closes ? diffTxt(p.diff) : "–"}</td></tr>`))) +
      P(T("Daily closings", "تسكير الأيام"), tbl([[T("Day", "النهار")], [T("Expected", "المتوقع"), 1], [T("Counted", "المعدود"), 1], [T("Drawer", "الصندوق"), 1], [T("Closed by", "سكّر")]],
        r.days.map(d => { const h = d.summary; return !h ? `<tr><td>${fmtDate(d.openedAt)}</td><td colspan="4" class="hint">${T("Still open", "بعدو مفتوح")}</td></tr>` :
          `<tr data-day="${d.id}" style="cursor:pointer"><td>${fmtDate(d.openedAt)}</td><td class="n">${h.expUSD != null ? `${U(h.expUSD)}<br>${L(h.expLBP)}` : "–"}</td><td class="n">${h.countedUSD != null ? `${U(h.countedUSD)}<br>${L(h.countedLBP)}` : "–"}</td><td class="n">${diffTxt(h.drawerDiff)}</td><td>${esc(h.closedBy || "")}</td></tr>`; }))) +
      P(T("Bread", "الخبز"), kv([
        [T("Left from the day before", "باقي من النهار اللي قبل"), b.carriedIn], [T("New bread received", "خبز جديد وصل"), b.received],
        [T("Moved to main shop", "انتقل عالمحل الرئيسي"), b.moved], [T("Waste", "تالف"), b.wasted], [T("Kept for the next day", "بقي للنهار الجاي"), b.carriedOver],
        [T("Loaves used (from counts)", "أرغفة انصرفت (من العدّ)"), b.counted ? b.used : "–"], [T("Sandwiches sold", "سندويشات انباعت"), b.sandwiches],
        [T("Loaves not rung up", "أرغفة ما انسجلت"), b.missing > 0 ? `<span style="color:var(--bad)">${b.missing}</span>` : b.missing]]) + `<p class="hint">${T("Counted in loaves, from closed days.", "بالأرغفة، من الأيام المسكّرة.")}</p>`) +
      (Object.keys(r.drinks).length ? P(T("Drinks (pieces)", "المشروبات (حبّة)"), tbl([[T("Drink", "المشروب")], [T("Sold", "انباع"), 1], [T("Missing", "ناقص"), 1]],
        Object.values(r.drinks).map(x => `<tr><td>${esc(AR ? x.ar || x.name : x.name)}</td><td class="n">${x.sold}</td><td class="n" style="color:${x.missing > 0 ? "var(--bad)" : "inherit"}">${x.missing}</td></tr>`)) +
        (r.drinksMissingL ? `<p class="hint">${T("Value of missing drinks", "قيمة المشروبات الناقصة")}: <b>${L(r.drinksMissingL)}</b></p>` : "")) : "") +
      P(T("Debts", "الديون"), kv([
        [T("New debts", "ديون جديدة"), `${dbt.newN} · ${L(dbt.newL)}`], [T("Debts paid", "ديون اندفعت"), `${dbt.paidN} · ${L(dbt.paidL)}`],
        [T("Owed now (all clients)", "مستحق هلق (كل الزباين)"), `${dbt.openN} · ${L(dbt.openL)}`]]));
  }
  $("rpRange").addEventListener("click", e => { const b = e.target.closest("[data-rg]"); if (!b) return; rpRange = b.dataset.rg;
    if (rpRange === "custom" && !$("rpFrom").value) { $("rpFrom").value = isoDay(Date.now() - 6 * 864e5); $("rpTo").value = isoDay(Date.now()); } renderReports(); });
  ["rpFrom", "rpTo"].forEach(i => $(i).addEventListener("change", renderReports));
  $("rpBody").addEventListener("click", e => { const r = e.target.closest("[data-day]"); if (r) dayReport(r.dataset.day); });
  // Excel opens CSV directly; the BOM keeps Arabic readable.
  function rpCsv() {
    const r = rpData; if (!r) return;
    const q = v => { const t = String(v ?? ""); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const rows = [["KABAB JIJI report", isoDay(r.from), isoDay(r.to - 1)], [], ["Orders", r.orders], ["Sales total LBP", Math.round(r.totalL)], ["Sales total USD", (r.totalL / R()).toFixed(2)],
      ["Average order LBP", Math.round(r.avgL)], ["Cash in USD", r.inUSD.toFixed(2)], ["Cash in LBP", Math.round(r.inLBP)], [],
      ["Best sellers"], ["Item", "Qty", "Total LBP"], ...Object.entries(r.items).sort((a, b) => b[1].qty - a[1].qty).map(([n, v]) => [n, v.qty, Math.round(v.totalL)]), [],
      ["By person"], ["Name", "Orders", "Sales LBP", "Days closed", "Drawer difference LBP"], ...Object.entries(r.people).map(([n, p]) => [n, p.orders, Math.round(p.totalL), p.closes, p.closes ? Math.round(p.diff) : ""]), [],
      ["Daily closings"], ["Day", "Expected USD", "Expected LBP", "Counted USD", "Counted LBP", "Drawer difference LBP", "Closed by", "Loaves not rung up", "Kept bread"],
      ...r.days.filter(d => d.summary).map(d => { const h = d.summary; return [isoDay(d.openedAt), h.expUSD ?? "", h.expLBP ?? "", h.countedUSD ?? "", h.countedLBP ?? "", h.drawerDiff ?? "", h.closedBy || "", h.breadMissing ?? "", h.breadLeftLoaves ?? ""]; }), [],
      ["Bread (loaves)"], ["Left from day before", r.bread.carriedIn], ["New bread received", r.bread.received], ["Moved to main shop", r.bread.moved], ["Waste", r.bread.wasted],
      ["Kept for next day", r.bread.carriedOver], ["Loaves used", r.bread.used], ["Sandwiches sold", r.bread.sandwiches], ["Loaves not rung up", r.bread.missing], [],
      ["Drinks (pieces)"], ["Drink", "Sold", "Missing"], ...Object.values(r.drinks).map(x => [x.name, x.sold, x.missing]), ["Value of missing drinks LBP", Math.round(r.drinksMissingL)], [],
      ["Debts"], ["New", r.debts.newN, Math.round(r.debts.newL)], ["Paid", r.debts.paidN, Math.round(r.debts.paidL)], ["Owed now", r.debts.openN, Math.round(r.debts.openL)], [],
      ["All sales"], ["Date", "Time", "Order", "Items", "Total LBP", "Paid USD", "Paid LBP", "Change USD", "Change LBP", "By", "Debt"],
      ...r.sales.map(x => [isoDay(x.t), new Date(x.t).toTimeString().slice(0, 5), x.no || "", x.lines.map(l => l.qty + "x " + l.name).join("; "), Math.round(x.totalL), x.paidUSD || 0, x.paidLBP || 0, x.changeUSD || 0, x.changeLBP || 0, x.byName || "", x.debt ? (x.label || "yes") : ""])];
    const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kababjiji-report-${isoDay(r.from)}${isoDay(r.from) !== isoDay(r.to - 1) ? "-to-" + isoDay(r.to - 1) : ""}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function rpText() {
    const r = rpData, d = r.debts, b = r.bread;
    const top = Object.entries(r.items).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5).map(([n, v]) => `• ${n}: ${v.qty}`).join("\n");
    const closes = r.days.filter(x => x.summary && x.summary.drawerDiff != null).map(x => `• ${isoDay(x.openedAt)}: ${Calc.verdict(x.summary.drawerDiff, S().tol) === "ok" ? T("correct", "مظبوط") : (x.summary.drawerDiff < 0 ? T("short ", "ناقص ") : T("over ", "زيادة ")) + L(Math.abs(x.summary.drawerDiff))}${x.summary.closedBy ? " (" + x.summary.closedBy + ")" : ""}`).join("\n");
    return [`*KABAB JIJI* · ${isoDay(r.from)}${isoDay(r.from) !== isoDay(r.to - 1) ? " → " + isoDay(r.to - 1) : ""}`,
      `${T("Orders", "الطلبات")}: ${r.orders}`, `${T("Sales", "المبيع")}: ${L(r.totalL)} (${U(LtoU(r.totalL))})`, `${T("Average order", "معدّل الطلب")}: ${L(r.avgL)}`,
      `${T("Cash in", "مصاري فاتت")}: ${U(r.inUSD)} + ${L(r.inLBP)}`, top ? `\n*${T("Best sellers", "الأكتر مبيع")}*\n${top}` : "",
      closes ? `\n*${T("Drawer", "الصندوق")}*\n${closes}` : "",
      `\n*${T("Bread", "الخبز")}*: ${T("sandwiches", "سندويشات")} ${b.sandwiches}, ${T("not rung up", "ما انسجلوا")} ${b.missing}, ${T("waste", "تالف")} ${b.wasted}, ${T("moved", "انتقل")} ${b.moved}`,
      `*${T("Debts", "الديون")}*: ${T("new", "جديدة")} ${L(d.newL)}, ${T("paid", "اندفعت")} ${L(d.paidL)}, ${T("owed now", "مستحق هلق")} ${L(d.openL)}`].filter(Boolean).join("\n");
  }
  $("rpCsv").addEventListener("click", () => { if (!rpData) return; rpCsv(); toast(T("Report downloaded", "التقرير نزل")); });
  $("rpWa").addEventListener("click", () => { if (!rpData) return; window.open("https://wa.me/?text=" + encodeURIComponent(rpText()), "_blank"); });

  /* ---------- settings ---------- */
  let editMenu = null;
  function renderSettings() {
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#v-settings")) return; // don't wipe what the owner is typing
    $("setRate").value = S().rate; $("setLpb").value = S().lpb; $("setTol").value = S().tol;
    editMenu = db.menu.map(x => ({ ...x })); renderMenuEdit(); renderStaff();
    $("users").innerHTML = `<thead><tr><th>${T("Name", "الاسم")}</th><th>${T("Email", "الإيميل")}</th><th>${T("Role", "الدور")}</th></tr></thead><tbody>` + db.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.id === Store.account.id ? (u.pos ? T("Shared till (this device)", "تيل مشترك (هالجهاز)") : T("Owner (you)", "المالك (إنت)")) :
      `<select data-role="${u.id}" aria-label="${T("Role for", "دور")} ${esc(u.name)}">${[["pending", T("Waiting", "ناطر")], ["cashier", T("Cashier", "كاشير")], ["owner", T("Owner", "المالك")], ["pos", T("Shared till (PINs)", "تيل مشترك (PIN)")], ["blocked", T("No access", "ما في صلاحية")]].map(([v, t]) => `<option value="${v}" ${(u.pos && u.role === "owner" ? "pos" : u.role) === v ? "selected" : ""}>${t}</option>`).join("")}</select>`}</td></tr>`).join("") + "</tbody>";
  }
  function renderStaff() {
    $("staffTbl").innerHTML = `<thead><tr><th>${T("Name", "الاسم")}</th><th>${T("Role", "الدور")}</th><th>PIN</th><th></th></tr></thead><tbody>` + db.staff.map(p => `<tr><td><b>${esc(p.name)}</b></td>
      <td><select data-srole="${p.id}" aria-label="${T("Role for", "دور")} ${esc(p.name)}">${[["owner", T("Owner", "المالك")], ["cashier", T("Cashier", "كاشير")]].map(([v, t]) => `<option value="${v}" ${p.role === v ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><div style="display:flex;gap:6px;align-items:center"><input id="sp-${p.id}" inputmode="numeric" type="password" autocomplete="new-password" maxlength="6" placeholder="${p.pinHash ? "••••" : T("not set", "مش محطوط")}" style="width:72px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--soft)" aria-label="PIN ${esc(p.name)}"><button class="mini" data-spin="${p.id}">${p.pinHash ? T("Change", "غيّر") : T("Set", "حط")}</button></div></td>
      <td><button class="mini" data-sdel="${p.id}" aria-label="${T("Remove", "شيل")}">✕</button></td></tr>`).join("") + "</tbody>";
  }
  const pinOk = v => /^\d{4,6}$/.test(v);
  $("staffTbl").addEventListener("click", async e => {
    const b = e.target.closest("[data-spin]"), d = e.target.closest("[data-sdel]");
    if (b) { const v = $("sp-" + b.dataset.spin).value.trim(); if (!pinOk(v)) { toast(T("PIN must be 4 to 6 digits", "الـ PIN لازم يكون 4 لـ 6 أرقام")); return; }
      await Store.setPin(b.dataset.spin, v); document.activeElement.blur(); toast(T("PIN saved", "الـ PIN انحفظ")); render(); }
    if (d) { if (d.dataset.sure) { await Store.removeStaff(d.dataset.sdel); toast(T("Removed", "انشال")); render(); return; } d.dataset.sure = "1"; d.textContent = T("Sure?", "أكيد؟"); d.style.color = "var(--bad)"; }
  });
  $("staffTbl").addEventListener("change", async e => { const s = e.target.closest("[data-srole]"); if (s) { await Store.saveStaff(s.dataset.srole, { role: s.value }); document.activeElement.blur(); toast(T("Role updated", "الدور تحدّث")); render(); } });
  $("btnAddStaff").addEventListener("click", async () => {
    const name = $("nsName").value.trim().toUpperCase(), pin = $("nsPin").value.trim();
    if (!name) { toast(T("Enter a name", "اكتب اسم")); return; }
    if (pin && !pinOk(pin)) { toast(T("PIN must be 4 to 6 digits", "الـ PIN لازم يكون 4 لـ 6 أرقام")); return; }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Store.uid();
    if (db.staff.some(p => p.id === id)) { toast(T("That name is already there", "هالاسم موجود")); return; }
    await Store.saveStaff(id, { name, role: $("nsRole").value, order: db.staff.length + 1 });
    if (pin) await Store.setPin(id, pin);
    $("nsName").value = ""; $("nsPin").value = ""; document.activeElement.blur(); toast(T(`${name} added`, `انزاد ${name}`)); render();
  });
  function renderMenuEdit() {
    $("menuEdit").innerHTML = `<span class="hd">${T("Name", "الاسم")}</span><span class="hd">${T("Arabic", "بالعربي")}</span><span class="hd">${T("Price", "السعر")}</span><span class="hd">${T("Currency", "العملة")}</span><span class="hd">${T("Bread", "خبز")}</span><span class="hd">${T("Count", "عدّ")}</span><span class="hd"></span>` +
      editMenu.map((i, k) => `<input id="me-n-${k}" value="${esc(i.name)}" aria-label="Name"><input id="me-a-${k}" value="${esc(i.ar || "")}" dir="rtl" aria-label="Arabic name">
      <input id="me-p-${k}" value="${i.amount}" inputmode="decimal" aria-label="Price"><select id="me-c-${k}" aria-label="Currency"><option ${i.cur === "USD" ? "selected" : ""}>USD</option><option ${i.cur === "LBP" ? "selected" : ""}>LBP</option></select>
      <input id="me-b-${k}" value="${i.bread || 0}" inputmode="numeric" aria-label="Loaves used"><label style="display:flex;gap:4px;align-items:center;font-size:13px"><input type="checkbox" id="me-k-${k}" ${isCounted(i) ? "checked" : ""} style="width:22px;height:22px">${T("pieces", "بالحبّة")}</label><button class="mini" data-del="${k}" aria-label="Remove item">✕</button>`).join("");
  }
  const readMenuEdit = () => editMenu.map((i, k) => ({ ...i, name: $("me-n-" + k).value.trim() || "Item", ar: $("me-a-" + k).value.trim(), amount: num($("me-p-" + k).value), cur: $("me-c-" + k).value, bread: Math.max(0, Math.round(num($("me-b-" + k).value))), count: $("me-k-" + k).checked }));
  $("menuEdit").addEventListener("click", e => { const b = e.target.closest("[data-del]"); if (!b) return; editMenu = readMenuEdit(); editMenu.splice(+b.dataset.del, 1); renderMenuEdit(); });
  $("btnAddItem").addEventListener("click", () => { editMenu = readMenuEdit(); editMenu.push({ id: Store.uid(), name: "New item", ar: "", amount: 100000, cur: "LBP", bread: 0, color: "side" }); renderMenuEdit(); });
  $("btnSaveMenu").addEventListener("click", async () => { await Store.saveMenu(readMenuEdit().map(i => ({ ...i, color: i.color || (i.bread > 0 ? "meat" : "side") }))); document.activeElement.blur(); toast(T("Menu saved on all devices", "المنيو انحفظ على كل الأجهزة")); render(); });
  $("btnSaveSettings").addEventListener("click", async () => {
    const r = Math.round(num($("setRate").value)), l = Math.round(num($("setLpb").value));
    if (r < 1000 || l < 1) { toast(T("Check the rate and loaves per bundle", "راجع السعر وعدد الأرغفة بالربطة")); return; }
    await Store.saveSettings({ rate: r, lpb: l, tol: Math.max(0, Math.round(num($("setTol").value))) }); document.activeElement.blur(); toast(T("Settings saved on all devices", "الإعدادات انحفظت على كل الأجهزة")); render();
  });
  $("users").addEventListener("change", async e => { const s = e.target.closest("[data-role]"); if (s) { await Store.setRole(s.dataset.role, s.value); toast(T("Access updated", "الصلاحية تحدّثت")); } });
  $("btnAddUser").addEventListener("click", async () => {
    const name = $("nuName").value.trim(), email = $("nuEmail").value.trim(), pw = $("nuPw").value;
    if (!name || !email || pw.length < 6) { toast(T("Enter a name, an email and a password of 6+ characters", "اكتب اسم وإيميل وكلمة سر 6 أحرف أو أكتر")); return; }
    try { await Store.createUser(name, email, pw, $("nuRole").value); ["nuName", "nuEmail", "nuPw"].forEach(i => $(i).value = ""); document.activeElement.blur(); toast(T(`${name} can now log in`, `${name} فيه يفوت هلق`)); render(); }
    catch (err) { toast(err.message); }
  });

  /* ---------- render ---------- */
  function render() {
    const u = Store.user;
    $("demoBox").hidden = Store.live;
    if (!Store.ready && Store.live) { showView("auth"); $("v-auth").innerHTML = `<div class="panel auth"><img class="biglogo" src="assets/logo.png" alt="Kabab Jiji"><p class="hint" style="text-align:center">${T("Loading…", "عم يحمّل…")}</p></div>`; $("nav").hidden = true; return; }
    $("btnSwitch").hidden = !Store.isShared() || Store.needsPin();
    if (Store.needsPin()) { closeModal(); $("nav").hidden = false; document.querySelectorAll("#nav > button[data-view]").forEach(b => b.hidden = true); $("whoLabel").textContent = ""; $("dayLabel").textContent = ""; showView("pin"); renderPin(); return; }
    document.querySelectorAll('#nav > button[data-view="sell"]').forEach(b => b.hidden = false);
    if (!u || !Store.isStaff()) { closeModal(); $("nav").hidden = true; $("dayLabel").textContent = ""; showView("auth"); renderAuth(); return; }
    $("nav").hidden = false;
    document.querySelectorAll("[data-owner]").forEach(el => el.hidden = !Store.isOwner());
    $("whoLabel").textContent = u.name || u.email || "";
    $("demoRole").value = Store.isShared() ? "pos" : Store.account.role;
    if (currentView !== "sell" && !Store.isOwner()) currentView = "sell";
    const d = day();
    if (!d) {
      // An owner who closed the Start-the-day screen can still use Sales, Clients and Settings.
      const v = skipStart && Store.isOwner() && ["report", "clients", "reports", "settings"].includes(currentView) ? currentView : "sell";
      $("dayLabel").textContent = ""; showView(v); renderSell();
      if (v === "report") renderReport(); if (v === "clients") renderClients(); if (v === "reports") renderReports(); if (v === "settings") renderSettings();
      if (!modalOpen() && !(skipStart && Store.isOwner())) {
        // Whoever is on a till that can open the day must fill it in; only an owner can close it with ✕.
        if (Store.account && Store.account.role === "owner") openDayModal();
        else $("modalRoot").innerHTML = `<div class="modal"><div class="box"><h3 id="notStarted">${T("The day has not started", "النهار ما بلّش بعد")}</h3><p class="hint">${T("The owner opens the day with the bread and starting cash. This screen opens by itself as soon as they do.", "المالك بيفتح النهار بالخبز ومصاري أول النهار. هالشاشة بتفتح لحالها أول ما يفتحو.")}</p></div></div>`;
      }
      return;
    }
    if (modalOpen() && $("notStarted")) closeModal();
    if (modalOpen() && $("odGo")) closeModal(); // the day was opened from another device
    $("dayLabel").textContent = fmtDate(d.openedAt) + " · $1 = " + R().toLocaleString("en-US") + T(" LBP", " ل.ل.");
    showView(currentView);
    if (currentView === "sell") renderSell();
    if (currentView === "bread") renderBread();
    if (currentView === "cash") renderCash();
    if (currentView === "report") renderReport();
    if (currentView === "settings") renderSettings();
    if (currentView === "clients") renderClients();
    if (currentView === "reports") renderReports();
  }

  // Offline badge: sales are kept on the device and sent when the internet is back.
  function syncBadge() { const off = !navigator.onLine; $("sync").hidden = !off || !Store.live; $("sync").textContent = T("Offline: sales are saved and will sync", "ما في إنترنت: البيع محفوظ وبينبعت بعدين"); }
  window.addEventListener("online", syncBadge); window.addEventListener("offline", syncBadge);

  // Pick up a new version: when the app comes back on screen (and every 5 minutes), reload if it changed.
  async function checkUpdate() {
    const v = window.APP_VERSION; if (!v || v === "__V__") return;
    try { const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" }); const n = (await r.text()).trim();
      if (r.ok && n && n !== v && !modalOpen() && !cartLines().length) location.reload(); } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
  setInterval(checkUpdate, 5 * 60 * 1000);

  Store.onChange(() => { if (!modalOpen() || $("odGo") || $("notStarted")) render(); });
  $("btnLang").addEventListener("click", () => {
    AR = !AR; try { localStorage.setItem("kj-lang", AR ? "ar" : "en"); } catch (e) {}
    applyLang(); syncBadge();
    document.querySelectorAll(".close-area").forEach(a => a.innerHTML = closeBtn());
    // Rebuild open screens that hold no typing (start day and receipt keep their inputs).
    if (!modalOpen() || $("notStarted") || $("odGo") || $("rcDone")) { if ($("odGo") || $("rcDone")) closeModal(); render(); }
    else render();
  });
  applyLang();
  render();
  Store.init();
  syncBadge();
  if ("serviceWorker" in navigator && Store.live) navigator.serviceWorker.register("sw.js").catch(e => console.warn("sw", e));
})();
