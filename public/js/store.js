// Data layer. Live mode: Firebase Auth + Firestore, synced on every device.
// With no Firebase config it runs a demo saved only in this browser.
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const live = !!cfg.apiKey;
  const listeners = [];
  const DEFAULT_SETTINGS = { rate: 89500, lpb: 6, tol: 10000 };
  const DEFAULT_MENU = [
    { id: "meat", name: "Meat Shawarma", ar: "شاورما لحمة", amount: 6, cur: "USD", bread: 1, color: "meat", big: true, order: 1 },
    { id: "chicken", name: "Chicken Shawarma", ar: "شاورما دجاج", amount: 6, cur: "USD", bread: 1, color: "chicken", big: true, order: 2 },
    { id: "fries", name: "Fries", ar: "بطاطا", amount: 350000, cur: "LBP", bread: 0, color: "side", order: 3 },
    { id: "pepsi", name: "Pepsi", ar: "بيبسي", amount: 150000, cur: "LBP", bread: 0, color: "drink", order: 4 },
    { id: "7up", name: "7Up", ar: "سفن أب", amount: 150000, cur: "LBP", bread: 0, color: "drink", order: 5 },
    { id: "mirinda", name: "Mirinda", ar: "ميرندا", amount: 150000, cur: "LBP", bread: 0, color: "drink", order: 6 },
    { id: "almaza", name: "Almaza", ar: "ألمازة", amount: 150000, cur: "LBP", bread: 0, color: "drink", order: 7 },
    { id: "water", name: "Water", ar: "مياه", amount: 50000, cur: "LBP", bread: 0, color: "drink", order: 8 }
  ];
  // People who sign in with a PIN on the shared till login (pos@...). Seeded once; the owner sets the PINs.
  const DEFAULT_STAFF = [
    { id: "jiji", name: "JIJI", role: "owner", order: 1 },
    { id: "tita", name: "TITA", role: "owner", order: 2 },
    { id: "abdallah", name: "ABDALLAH", role: "cashier", order: 3 }
  ];
  const db = { settings: { ...DEFAULT_SETTINGS }, menu: [], state: {}, days: [], sales: [], checks: [], users: [], staff: [], debts: [], allDebts: [] };
  // account: the Firebase login. user: who is using the app now (the account, or the PIN person on a shared till).
  const Store = { live, db, user: null, account: null, person: null, ready: false, DEFAULT_MENU };
  const emit = () => listeners.forEach(f => f());
  Store.onChange = f => listeners.push(f);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  Store.uid = uid;
  Store.isOwner = () => !!Store.user && Store.user.role === "owner";
  Store.isStaff = () => !!Store.user && ["cashier", "owner"].includes(Store.user.role);
  Store.isShared = () => !!Store.account && !!Store.account.pos && Store.account.role === "owner";
  Store.needsPin = () => Store.isShared() && !Store.person;
  const PKEY = "kj-person";
  // Works out who is using the app: on a shared till, the PIN person; otherwise the login itself.
  function setUser() {
    const a = Store.account;
    if (!a) { Store.user = null; Store.person = null; return; }
    if (!(a.pos && a.role === "owner")) { Store.person = null; Store.user = { ...a }; return; }
    let pid = Store.person && Store.person.id;
    if (!pid) { try { pid = localStorage.getItem(PKEY); } catch (e) {} }
    const p = pid && db.staff.find(x => x.id === pid);
    Store.person = p || null;
    Store.user = p ? { ...a, name: p.name, role: p.role, personId: p.id } : { ...a, role: "locked" };
  }
  async function pinHash(id, pin) {
    const data = new TextEncoder().encode("kababjiji:" + id + ":" + pin);
    const h = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // Returns true when the PIN is right, and makes that person the user of this till.
  Store.unlock = async (id, pin) => {
    const p = db.staff.find(x => x.id === id); if (!p || !p.pinHash) return false;
    if ((await pinHash(id, pin)) !== p.pinHash) return false;
    try { localStorage.setItem(PKEY, id); } catch (e) {}
    Store.person = p; setUser(); emit(); return true;
  };
  Store.lock = () => { try { localStorage.removeItem(PKEY); } catch (e) {} Store.person = null; setUser(); emit(); };
  Store.setPin = async (id, pin) => {
    const h = await pinHash(id, pin);
    if (!live) { db.staff.find(x => x.id === id).pinHash = h; demoSave(); emit(); return; }
    return settle(fs.collection("staff").doc(id).update({ pinHash: h, pinSetAt: Date.now() }));
  };
  Store.saveStaff = (id, data) => {
    if (!live) { const p = db.staff.find(x => x.id === id); if (p) Object.assign(p, data); else db.staff.push({ id, ...data }); demoSave(); setUser(); emit(); return; }
    return settle(fs.collection("staff").doc(id).set(data, { merge: true }));
  };
  Store.removeStaff = id => {
    if (!live) { db.staff = db.staff.filter(x => x.id !== id); demoSave(); setUser(); emit(); return; }
    return settle(fs.collection("staff").doc(id).delete());
  };
  Store.currentDay = () => db.state.dayId ? db.days.find(d => d.id === db.state.dayId) || null : null;

  // ---------- Demo mode ----------
  const KEY = "kababjiji-demo-v1";
  function demoLoad() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (s && !s.checks) s.checks = [];
    if (s && !s.debts) s.debts = [];
    if (s && !s.allDebts) s.allDebts = s.debts.map(x => ({ ...x }));
    if (s && !s.staff) s.staff = DEFAULT_STAFF.map(x => ({ ...x }));
    if (s && s.users && !s.users.some(u => u.pos)) s.users.push({ id: "demo-pos", name: "Shop till", email: "pos@demo", role: "owner", pos: true });
    if (!s || !s.menu) s = { settings: { ...DEFAULT_SETTINGS }, menu: DEFAULT_MENU.map(x => ({ ...x })), state: {}, days: [], sales: [],
      users: [{ id: "demo-owner", name: "Owner", email: "owner@demo", role: "owner" }, { id: "demo-cashier", name: "Abdallah", email: "abdallah@demo", role: "cashier" },
        { id: "demo-pos", name: "Shop till", email: "pos@demo", role: "owner", pos: true }], staff: DEFAULT_STAFF.map(x => ({ ...x })), debts: [], allDebts: [] };
    Object.assign(db, s);
  }
  function demoSave() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  // ---------- Live mode ----------
  let fs, auth, unsubs = [], salesUnsub = null, checksUnsub = null, salesDay = null, signingUp = false, claimTried = false;
  const stamp = d => ({ ...d, by: Store.user.id, byName: Store.user.name || "", ...(Store.person ? { personId: Store.person.id } : {}), at: firebase.firestore.FieldValue.serverTimestamp() });
  // Firestore saves on the device at once and uploads by itself when the internet is back,
  // so never block the till waiting for the upload. Online, wait a moment so a refusal still shows.
  const settle = p => Promise.race([p, new Promise(ok => setTimeout(ok, navigator.onLine ? 1500 : 0))]);

  function watch(ref, set) {
    let first = true;
    return new Promise(ok => unsubs.push(ref.onSnapshot(s => { set(s); if (first) { first = false; ok(); } else emit(); },
      err => { console.error(err); if (first) { first = false; ok(); } })));
  }
  function watchSales() {
    const d = db.state.dayId || null;
    if (d === salesDay && salesUnsub) return;
    if (salesUnsub) salesUnsub(); if (checksUnsub) checksUnsub();
    salesUnsub = checksUnsub = null; salesDay = d; db.sales = []; db.checks = [];
    if (!d) { emit(); return; }
    // Open checks (eat first, pay later): every till sees all of today's open checks.
    checksUnsub = fs.collection("checks").where("dayId", "==", d).where("status", "==", "open")
      .onSnapshot(s => { db.checks = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.t - b.t); emit(); }, err => console.error("checks", err));
    let q = fs.collection("sales").where("dayId", "==", d);
    // A cashier only loads their own sales of today (for order numbers), never the day's totals.
    if (Store.account.role !== "owner") q = q.where("by", "==", Store.user.id);
    salesUnsub = q.onSnapshot(s => { db.sales = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.t - b.t); emit(); }, err => console.error("sales", err));
  }
  async function subscribe() {
    unsubs.forEach(u => u()); unsubs = []; if (salesUnsub) salesUnsub(); if (checksUnsub) checksUnsub(); salesUnsub = checksUnsub = null; salesDay = null;
    Store.ready = false;
    const owner = Store.account.role === "owner";
    const jobs = [
      // Unpaid debts stay open across days until the client pays.
      watch(fs.collection("debts").where("status", "==", "open"), s => { db.debts = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.t - b.t); }),
      watch(fs.collection("staff"), s => { db.staff = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); setUser(); }),
      watch(fs.collection("settings").doc("main"), s => { db.settings = { ...DEFAULT_SETTINGS, ...(s.exists ? s.data() : {}) }; }),
      watch(fs.collection("menu"), s => { db.menu = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); }),
      watch(fs.collection("state").doc("current"), s => { db.state = s.exists ? s.data() : {}; if (Store.ready) watchSales(); })
    ];
    if (owner) {
      jobs.push(watch(fs.collection("days"), s => { db.days = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.openedAt - b.openedAt); }));
      // Clients & debts page: every debt ever, paid or not.
      jobs.push(watch(fs.collection("debts"), s => { db.allDebts = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => b.t - a.t); }));
      jobs.push(watch(fs.collection("users"), s => { db.users = s.docs.map(x => ({ id: x.id, ...x.data() })); }));
    }
    await Promise.all(jobs);
    // First owner login on a new project: put in the starting menu and settings.
    if (owner && !db.menu.length) await Store.saveMenu(DEFAULT_MENU.map(x => ({ ...x })));
    // Once: put in the PIN people for the shared till.
    if (owner && !db.staff.length && !db.settings.staffSeeded) {
      const b = fs.batch(); DEFAULT_STAFF.forEach(({ id, ...x }) => b.set(fs.collection("staff").doc(id), x));
      b.set(fs.collection("settings").doc("main"), { staffSeeded: true }, { merge: true }); await settle(b.commit());
    }
    setUser();
    Store.ready = true; watchSales(); emit();
  }

  Store.init = function () {
    if (!live) { demoLoad(); Store.account = { ...db.users[0] }; setUser(); Store.ready = true; emit(); return; }
    firebase.initializeApp(cfg);
    auth = firebase.auth(); fs = firebase.firestore();
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); // keeps selling through internet cuts
    let userUnsub = null;
    auth.onAuthStateChanged(u => {
      if (userUnsub) userUnsub(); userUnsub = null;
      unsubs.forEach(x => x()); unsubs = []; if (salesUnsub) salesUnsub(); if (checksUnsub) checksUnsub(); salesUnsub = checksUnsub = null; salesDay = null;
      if (!u) { Store.account = null; setUser(); Store.ready = true; emit(); return; }
      const ref = fs.collection("users").doc(u.uid);
      userUnsub = ref.onSnapshot(async snap => {
        if (!snap.exists && snap.metadata.fromCache) return; // offline: wait, never treat as a new account
        if (!snap.exists) { if (signingUp) return; await ref.set({ name: u.displayName || u.email.split("@")[0], email: u.email, role: "pending" }); return; }
        const prev = Store.account && Store.account.role;
        Store.account = { id: u.uid, email: u.email, ...snap.data() }; setUser();
        // Nobody is owner yet (a new project): a waiting account claims it.
        if (Store.account.role === "pending" && !claimTried) {
          claimTried = true;
          try {
            const own = fs.collection("state").doc("owner");
            if (!(await own.get()).exists) { const bt = fs.batch(); bt.set(own, { uid: u.uid, at: Date.now() }); bt.update(ref, { role: "owner" }); await bt.commit(); return; }
          } catch (e) { console.warn("owner claim", e); }
        }
        if (["cashier", "owner"].includes(Store.account.role)) { if (prev !== Store.account.role) subscribe(); else emit(); }
        else { Store.ready = true; emit(); }
      }, err => { console.error("user", err); Store.ready = true; emit(); });
    });
  };

  Store.signIn = (email, pw) => auth.signInWithEmailAndPassword(email, pw);
  Store.resetPassword = email => auth.sendPasswordResetEmail(email);
  // The very first account on a new project becomes the owner; everyone after waits for the owner's approval.
  Store.signUp = async (name, email, pw) => {
    signingUp = true;
    try {
      const r = await auth.createUserWithEmailAndPassword(email, pw);
      await r.user.updateProfile({ displayName: name });
      const me = fs.collection("users").doc(r.user.uid), own = fs.collection("state").doc("owner");
      let first = false;
      try { first = !(await own.get()).exists; } catch (e) {}
      if (first) {
        try { const b = fs.batch(); b.set(own, { uid: r.user.uid, at: Date.now() }); b.set(me, { name, email, role: "owner" }); await b.commit(); return; } catch (e) { console.warn("owner claim", e); }
      }
      await me.set({ name, email, role: "pending" });
    } finally { signingUp = false; }
  };
  Store.signOut = () => { try { localStorage.removeItem(PKEY); } catch (e) {} Store.person = null; if (live) return auth.signOut(); };
  // Demo only: switch between owner, cashier and the shared till to see each screen.
  Store.setDemoRole = role => { Store.account = { ...db.users.find(u => role === "pos" ? u.pos : u.role === role && !u.pos) }; Store.person = null; setUser(); emit(); };
  // "pos" in the People list means a shared till login: owner rights in the database, people pick themselves by PIN.
  const roleData = role => role === "pos" ? { role: "owner", pos: true } : { role, pos: false };

  // Owner adds a login: made on a second Firebase app so the owner stays signed in.
  Store.createUser = async (name, email, pw, role) => {
    if (!live) { db.users.push({ id: uid(), name, email, ...roleData(role) }); demoSave(); emit(); return; }
    const app2 = firebase.apps.find(a => a.name === "adder") || firebase.initializeApp(cfg, "adder");
    const a2 = app2.auth();
    const r = await a2.createUserWithEmailAndPassword(email, pw);
    await r.user.updateProfile({ displayName: name });
    await app2.firestore().collection("users").doc(r.user.uid).set({ name, email, role: "pending" });
    await a2.signOut();
    await fs.collection("users").doc(r.user.uid).update(roleData(role));
  };
  Store.setRole = (id, role) => {
    if (!live) { Object.assign(db.users.find(u => u.id === id), roleData(role)); demoSave(); emit(); return; }
    return settle(fs.collection("users").doc(id).update(roleData(role)));
  };

  Store.saveSettings = s => {
    if (!live) { db.settings = { ...db.settings, ...s }; demoSave(); emit(); return; }
    return settle(fs.collection("settings").doc("main").set(s, { merge: true }));
  };
  Store.saveMenu = list => {
    list = list.map((x, i) => ({ ...x, id: x.id || uid(), order: i + 1 }));
    if (!live) { db.menu = list; demoSave(); emit(); return; }
    const b = fs.batch(), keep = new Set(list.map(x => x.id));
    db.menu.filter(x => !keep.has(x.id)).forEach(x => b.delete(fs.collection("menu").doc(x.id)));
    list.forEach(({ id, ...x }) => b.set(fs.collection("menu").doc(id), x));
    return settle(b.commit());
  };

  Store.openDay = d => {
    const id = new Date().toISOString().slice(0, 10) + "-" + uid().slice(0, 4);
    const day = { breadMoves: [], carried: 0, ...d, status: "open", openedAt: Date.now(), addedLoaves: 0, breadCount: null, cashCount: null };
    if (!live) { db.days.push({ id, ...day }); db.state = { dayId: id }; db.sales = []; db.checks = []; demoSave(); emit(); return; }
    const b = fs.batch();
    b.set(fs.collection("days").doc(id), stamp(day));
    b.set(fs.collection("state").doc("current"), { dayId: id, openedAt: day.openedAt });
    return settle(b.commit());
  };
  Store.updateDay = (id, patch) => {
    if (!live) { Object.assign(db.days.find(d => d.id === id), patch); demoSave(); emit(); return; }
    return settle(fs.collection("days").doc(id).update(patch));
  };
  Store.closeDay = (id, summary) => {
    const patch = { status: "closed", closedAt: Date.now(), summary };
    if (!live) { Object.assign(db.days.find(d => d.id === id), patch); db.salesArchive = [...(db.salesArchive || []), ...db.sales]; db.state = {}; db.sales = []; db.checks = []; demoSave(); emit(); return; }
    const b = fs.batch();
    b.update(fs.collection("days").doc(id), patch);
    b.set(fs.collection("state").doc("current"), { dayId: null });
    return settle(b.commit());
  };

  Store.addSale = sale => {
    if (!live) { const s = { id: uid(), ...sale, by: Store.user.id, byName: Store.user.name, ...(Store.person ? { personId: Store.person.id } : {}) }; db.sales.push(s); demoSave(); emit(); return s; }
    const ref = fs.collection("sales").doc(), s = stamp(sale);
    settle(ref.set(s)).catch(e => { console.error(e); if (Store.onError) Store.onError(e); });
    return { id: ref.id, ...s };
  };
  // Open checks. A check is saved with its lines; paying it makes a normal sale and marks the check paid.
  Store.saveCheck = (id, data) => {
    if (!live) {
      if (id) Object.assign(db.checks.find(c => c.id === id), data);
      else db.checks.push({ id: uid(), ...data, status: "open", by: Store.user.id, byName: Store.user.name });
      demoSave(); emit(); return;
    }
    if (id) { settle(fs.collection("checks").doc(id).update({ ...data, editedBy: Store.user.name || "" })).catch(e => Store.onError && Store.onError(e)); return; }
    settle(fs.collection("checks").doc().set(stamp({ ...data, status: "open" }))).catch(e => Store.onError && Store.onError(e));
  };
  Store.payCheck = (id, sale) => {
    if (!live) { const s = Store.addSale({ ...sale, checkId: id }); db.checks = db.checks.filter(c => c.id !== id); demoSave(); emit(); return s; }
    const ref = fs.collection("sales").doc(), s = stamp({ ...sale, checkId: id }), b = fs.batch();
    b.set(ref, s); b.update(fs.collection("checks").doc(id), { status: "paid", saleId: ref.id, paidBy: Store.user.name || "" });
    settle(b.commit()).catch(e => { console.error(e); if (Store.onError) Store.onError(e); });
    return { id: ref.id, ...s };
  };
  // Debt: the client takes the food now and pays another day. Saved as a sale with no money in the drawer,
  // plus a debt with the client's name and phone. An open check can be turned into a debt.
  Store.addDebt = (sale, client, checkId) => {
    if (!live) {
      const d = { id: uid(), ...client, lines: sale.lines, totalL: sale.totalL, rate: sale.rate, dayId: sale.dayId, t: sale.t, status: "open", by: Store.user.id, byName: Store.user.name };
      const s = Store.addSale({ ...sale, debt: true, debtId: d.id, label: client.name, ...(checkId ? { checkId } : {}) });
      db.debts.push(d); db.allDebts.unshift({ ...d }); if (checkId) db.checks = db.checks.filter(c => c.id !== checkId); demoSave(); emit(); return s;
    }
    const dref = fs.collection("debts").doc(), sref = fs.collection("sales").doc(), b = fs.batch();
    const s = stamp({ ...sale, debt: true, debtId: dref.id, label: client.name, ...(checkId ? { checkId } : {}) });
    b.set(sref, s);
    b.set(dref, stamp({ ...client, lines: sale.lines, totalL: sale.totalL, rate: sale.rate, dayId: sale.dayId, t: sale.t, saleId: sref.id, status: "open" }));
    if (checkId) b.update(fs.collection("checks").doc(checkId), { status: "debt", debtId: dref.id, paidBy: Store.user.name || "" });
    settle(b.commit()).catch(e => { console.error(e); if (Store.onError) Store.onError(e); });
    return { id: sref.id, ...s };
  };
  // A client pays an old debt: the money goes into today's drawer as a debt payment (not a new sale).
  Store.payDebt = (id, pay) => {
    const d = db.debts.find(x => x.id === id); if (!d) return null;
    const sale = { ...pay, lines: [], totalL: d.totalL, debtPay: id, label: d.name, void: false };
    if (!live) { const s = Store.addSale(sale); db.debts = db.debts.filter(x => x.id !== id);
      Object.assign(db.allDebts.find(x => x.id === id) || {}, { status: "paid", paidAt: Date.now(), paidBy: Store.user.name }); demoSave(); emit(); return s; }
    const sref = fs.collection("sales").doc(), b = fs.batch(), s = stamp(sale);
    b.set(sref, s);
    b.update(fs.collection("debts").doc(id), { status: "paid", paidAt: Date.now(), paidDayId: pay.dayId, paidSaleId: sref.id, paidBy: Store.user.name || "" });
    settle(b.commit()).catch(e => { console.error(e); if (Store.onError) Store.onError(e); });
    return { id: sref.id, ...s };
  };
  Store.cancelCheck = id => {
    if (!live) { db.checks = db.checks.filter(c => c.id !== id); demoSave(); emit(); return; }
    return settle(fs.collection("checks").doc(id).update({ status: "cancelled", cancelledBy: Store.user.name || "" }));
  };
  Store.voidSale = id => {
    const patch = { void: true, voidBy: Store.user.name || "", voidAt: Date.now() };
    if (!live) { Object.assign(db.sales.find(s => s.id === id), patch); demoSave(); emit(); return; }
    return settle(fs.collection("sales").doc(id).update(patch));
  };
  // Reports: every sale made between two times (owner only).
  Store.fetchSales = async (from, to) => {
    if (!live) return [...(db.salesArchive || []), ...db.sales].filter(x => x.t >= from && x.t < to);
    const q = await fs.collection("sales").where("t", ">=", from).where("t", "<", to).get();
    return q.docs.map(x => ({ id: x.id, ...x.data() }));
  };
  Store.resetDemo = () => { try { localStorage.removeItem(KEY); } catch (e) {} demoLoad(); Store.account = { ...db.users[0] }; setUser(); emit(); };

  window.Store = Store;
})();
