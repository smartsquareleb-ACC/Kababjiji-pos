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
  const db = { settings: { ...DEFAULT_SETTINGS }, menu: [], state: {}, days: [], sales: [], users: [] };
  const Store = { live, db, user: null, ready: false, DEFAULT_MENU };
  const emit = () => listeners.forEach(f => f());
  Store.onChange = f => listeners.push(f);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  Store.uid = uid;
  Store.isOwner = () => !!Store.user && Store.user.role === "owner";
  Store.isStaff = () => !!Store.user && ["cashier", "owner"].includes(Store.user.role);
  Store.currentDay = () => db.state.dayId ? db.days.find(d => d.id === db.state.dayId) || null : null;

  // ---------- Demo mode ----------
  const KEY = "kababjiji-demo-v1";
  function demoLoad() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s || !s.menu) s = { settings: { ...DEFAULT_SETTINGS }, menu: DEFAULT_MENU.map(x => ({ ...x })), state: {}, days: [], sales: [],
      users: [{ id: "demo-owner", name: "Owner", email: "owner@demo", role: "owner" }, { id: "demo-cashier", name: "Abdallah", email: "abdallah@demo", role: "cashier" }] };
    Object.assign(db, s);
  }
  function demoSave() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  // ---------- Live mode ----------
  let fs, auth, unsubs = [], salesUnsub = null, salesDay = null, signingUp = false;
  const stamp = d => ({ ...d, by: Store.user.id, byName: Store.user.name || "", at: firebase.firestore.FieldValue.serverTimestamp() });
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
    if (salesUnsub) salesUnsub();
    salesUnsub = null; salesDay = d; db.sales = [];
    if (!d) { emit(); return; }
    let q = fs.collection("sales").where("dayId", "==", d);
    // A cashier only loads their own sales of today (for order numbers), never the day's totals.
    if (!Store.isOwner()) q = q.where("by", "==", Store.user.id);
    salesUnsub = q.onSnapshot(s => { db.sales = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.t - b.t); emit(); }, err => console.error("sales", err));
  }
  async function subscribe() {
    unsubs.forEach(u => u()); unsubs = []; if (salesUnsub) salesUnsub(); salesUnsub = null; salesDay = null;
    Store.ready = false;
    const owner = Store.isOwner();
    const jobs = [
      watch(fs.collection("settings").doc("main"), s => { db.settings = { ...DEFAULT_SETTINGS, ...(s.exists ? s.data() : {}) }; }),
      watch(fs.collection("menu"), s => { db.menu = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); }),
      watch(fs.collection("state").doc("current"), s => { db.state = s.exists ? s.data() : {}; if (Store.ready) watchSales(); })
    ];
    if (owner) {
      jobs.push(watch(fs.collection("days"), s => { db.days = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.openedAt - b.openedAt); }));
      jobs.push(watch(fs.collection("users"), s => { db.users = s.docs.map(x => ({ id: x.id, ...x.data() })); }));
    }
    await Promise.all(jobs);
    // First owner login on a new project: put in the starting menu and settings.
    if (owner && !db.menu.length) await Store.saveMenu(DEFAULT_MENU.map(x => ({ ...x })));
    Store.ready = true; watchSales(); emit();
  }

  Store.init = function () {
    if (!live) { demoLoad(); Store.user = { ...db.users[0] }; Store.ready = true; emit(); return; }
    firebase.initializeApp(cfg);
    auth = firebase.auth(); fs = firebase.firestore();
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); // keeps selling through internet cuts
    let userUnsub = null;
    auth.onAuthStateChanged(u => {
      if (userUnsub) userUnsub(); userUnsub = null;
      unsubs.forEach(x => x()); unsubs = []; if (salesUnsub) salesUnsub(); salesUnsub = null; salesDay = null;
      if (!u) { Store.user = null; Store.ready = true; emit(); return; }
      const ref = fs.collection("users").doc(u.uid);
      userUnsub = ref.onSnapshot(async snap => {
        if (!snap.exists && snap.metadata.fromCache) return; // offline: wait, never treat as a new account
        if (!snap.exists) { if (signingUp) return; await ref.set({ name: u.displayName || u.email.split("@")[0], email: u.email, role: "pending" }); return; }
        const prev = Store.user && Store.user.role;
        Store.user = { id: u.uid, email: u.email, ...snap.data() };
        if (Store.isStaff()) { if (prev !== Store.user.role) subscribe(); else emit(); }
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
  Store.signOut = () => { if (live) return auth.signOut(); };
  // Demo only: switch between owner and cashier to see both screens.
  Store.setDemoRole = role => { Store.user = { ...db.users.find(u => u.role === role) }; emit(); };

  // Owner adds a login: made on a second Firebase app so the owner stays signed in.
  Store.createUser = async (name, email, pw, role) => {
    if (!live) { db.users.push({ id: uid(), name, email, role }); demoSave(); emit(); return; }
    const app2 = firebase.apps.find(a => a.name === "adder") || firebase.initializeApp(cfg, "adder");
    const a2 = app2.auth();
    const r = await a2.createUserWithEmailAndPassword(email, pw);
    await r.user.updateProfile({ displayName: name });
    await app2.firestore().collection("users").doc(r.user.uid).set({ name, email, role: "pending" });
    await a2.signOut();
    await fs.collection("users").doc(r.user.uid).update({ role });
  };
  Store.setRole = (id, role) => {
    if (!live) { db.users.find(u => u.id === id).role = role; demoSave(); emit(); return; }
    return settle(fs.collection("users").doc(id).update({ role }));
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
    const day = { ...d, status: "open", openedAt: Date.now(), addedLoaves: 0, breadCount: null, cashCount: null };
    if (!live) { db.days.push({ id, ...day }); db.state = { dayId: id }; db.sales = []; demoSave(); emit(); return; }
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
    if (!live) { Object.assign(db.days.find(d => d.id === id), patch); db.state = {}; db.sales = []; demoSave(); emit(); return; }
    const b = fs.batch();
    b.update(fs.collection("days").doc(id), patch);
    b.set(fs.collection("state").doc("current"), { dayId: null });
    return settle(b.commit());
  };

  Store.addSale = sale => {
    if (!live) { const s = { id: uid(), ...sale, by: Store.user.id, byName: Store.user.name }; db.sales.push(s); demoSave(); emit(); return s; }
    const ref = fs.collection("sales").doc(), s = stamp(sale);
    settle(ref.set(s)).catch(e => { console.error(e); if (Store.onError) Store.onError(e); });
    return { id: ref.id, ...s };
  };
  Store.voidSale = id => {
    const patch = { void: true, voidBy: Store.user.name || "", voidAt: Date.now() };
    if (!live) { Object.assign(db.sales.find(s => s.id === id), patch); demoSave(); emit(); return; }
    return settle(fs.collection("sales").doc(id).update(patch));
  };
  Store.resetDemo = () => { try { localStorage.removeItem(KEY); } catch (e) {} demoLoad(); Store.user = { ...db.users[0] }; emit(); };

  window.Store = Store;
})();
