/**
 * Lukis -- flight-booking logger PWA with cloud sync.
 *
 * Two views: "Log" (tap one of the category buttons to book it now, with an
 * optional remark) and "All" (the full list, each row editable or deletable,
 * plus CSV export). Each booking is { category, remark, savedAt } and lives in
 * Firebase Firestore under the signed-in user, with offline persistence on, so
 * the app keeps working with no network and syncs when it returns. Sign-in is
 * Google. The CSV export opens cleanly in Excel.
 *
 * To change the booking categories, edit CATEGORIES -- the buttons and the edit
 * dropdown are both derived from it.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initInvoice, setInvoiceEntries, setInvoiceSettings, fitPreview } from "./invoice.js";

// The four flight categories. Each becomes a quick-book button and an option in
// the edit dropdown. Add or rename here to change them everywhere.
const CATEGORIES = ["PGI", "VKPI", "DA PGI", "DA VKPI"];

// The gliders to choose from. The Log view remembers the last pick across
// sessions, so this only needs touching when a wing joins or leaves the fleet.
// Der aktuelle Schirm steht zuoberst -- er ist die Vorauswahl bei einer frischen
// Installation. Ältere Schirme bleiben in der Liste, damit nachgetragene Flüge
// im Bearbeiten-Dialog eine passende Auswahl haben.
const GLIDERS = [
  "Takoo 6 2026",
  "Bibeta 6 2024",
  "Bibeta 6 2022",
  "Bibeta 6 2019",
  "Bibeta 6 2018",
];

// One hue per category. The two Big Blue products share the blue family and the
// two Double Air ones the violet family, so the button is found by colour and
// position before the label is read. Anything not listed falls back to the
// app's primary, which keeps adding a category a one-line change.
const CATEGORY_COLORS = {
  PGI: "#2563eb",
  VKPI: "#0284c7",
  "DA PGI": "#7c3aed",
  "DA VKPI": "#9333ea",
};

const GLIDER_KEY = "lukis.glider"; // localStorage key for the remembered pick

const APP_NAME = "Lukis";

/* -------------------------------- Firebase ------------------------------- */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// persistentLocalCache keeps an IndexedDB copy so reads/writes work offline and
// sync when the connection returns.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

let currentUser = null;
let entriesCache = []; // latest snapshot of the signed-in user's bookings
let entriesUnsub = null; // active Firestore listener teardown
let settingsUnsub = null; // ditto, for the invoice settings document
let editingId = null; // id of the booking being edited, or null
const expandedDates = new Set(); // which All-view day groups are expanded
let expandInitialized = false; // default-expand today only on the first render

function entriesCol(uid) {
  return collection(db, "users", uid, "entries");
}

async function saveEntry(uid, entry) {
  // The entry id is the document id, so create and edit are the same operation.
  await setDoc(doc(entriesCol(uid), entry.id), entry);
}

async function deleteEntry(uid, id) {
  await deleteDoc(doc(entriesCol(uid), id));
}

// Subscribes to the user's bookings. onSnapshot fires immediately from the local
// cache and again on every remote change, so the UI stays live without manual
// refreshes.
function subscribeEntries(uid) {
  unsubscribeEntries();
  entriesUnsub = onSnapshot(
    entriesCol(uid),
    (snap) => {
      entriesCache = snap.docs.map((d) => d.data());
      renderEntries(entriesCache);
    },
    (err) => {
      console.error("Entries listener failed", err);
      toast("Sync error.");
    }
  );
}

function unsubscribeEntries() {
  if (entriesUnsub) {
    entriesUnsub();
    entriesUnsub = null;
  }
  entriesCache = [];
  renderEntries(entriesCache);
}

// The invoice party data -- IBAN, addresses, the client's mail address. Kept out
// of the source because that is served publicly, and behind the same sign-in as
// the flights.
function settingsDoc(uid) {
  return doc(db, "users", uid, "settings", "invoice");
}

function subscribeSettings(uid) {
  unsubscribeSettings();
  settingsUnsub = onSnapshot(
    settingsDoc(uid),
    (snap) => setInvoiceSettings(snap.exists() ? snap.data() : null),
    (err) => {
      console.error("Settings listener failed", err);
      toast("Could not load invoice details.");
    }
  );
}

function unsubscribeSettings() {
  if (settingsUnsub) {
    settingsUnsub();
    settingsUnsub = null;
  }
  setInvoiceSettings(null);
}

async function saveInvoiceSettings(values) {
  if (!currentUser) throw new Error("Not signed in");
  await setDoc(settingsDoc(currentUser.uid), values);
}

/* ---------------------------------- Auth --------------------------------- */

async function onGoogleSignIn() {
  const provider = new GoogleAuthProvider();
  const btn = document.getElementById("google-signin-btn");
  btn.disabled = true;
  try {
    await signInWithPopup(auth, provider);
    // Success is handled by onAuthStateChanged.
  } catch (err) {
    // Popups are often blocked in an installed PWA; fall back to a full-page
    // redirect (its result is picked up by getRedirectResult on next load).
    if (
      err.code === "auth/popup-blocked" ||
      err.code === "auth/cancelled-popup-request" ||
      err.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (err.code !== "auth/popup-closed-by-user") {
      console.error("Google sign-in failed", err);
      setAuthStatus(`Sign-in failed (${err.code || "error"}).`);
    }
  } finally {
    btn.disabled = false;
  }
}

async function onSignOut() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Sign-out failed", err);
  }
}

function setAuthStatus(message) {
  document.getElementById("signin-status").textContent = message;
}

function handleAuthState(user) {
  currentUser = user;
  if (user) {
    showApp(user);
    subscribeEntries(user.uid);
    subscribeSettings(user.uid);
  } else {
    unsubscribeEntries();
    unsubscribeSettings();
    showAuthView();
  }
}

/* ---------------------------------- CSV ---------------------------------- */

// Escapes one value for a semicolon-separated CSV. Swiss/German Excel expects
// ";" as the column separator (and buildCsv adds a UTF-8 BOM so umlauts
// survive). Wrap in quotes when the value contains ; " or a line break, and
// double any embedded quotes.
// Input:  he said "hi"; bye   ->   "he said ""hi""; bye"
function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[;"\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Builds the CSV: one row per booking, columns timestamp / category / remark.
function buildCsv(entries) {
  const rows = [["Saved at", "Category", "Glider", "Remark", "Created by"]];
  for (const e of entries) {
    rows.push([
      formatTimestamp(e.savedAt),
      e.category || "",
      e.glider || "",
      e.remark || "",
      e.createdByEmail || "",
    ]);
  }
  // Lead with a UTF-8 BOM and use CRLF line endings -- that combination is what
  // Excel opens most reliably (correct encoding and one row per line).
  return "﻿" + rows.map((cells) => cells.map(csvCell).join(";")).join("\r\n");
}

/* -------------------------------- Helpers -------------------------------- */

function pad(n) {
  return String(n).padStart(2, "0");
}

// Small builder to keep the stats tables readable.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Local, sortable timestamp for display and CSV, e.g. "2026-06-19 14:05".
function formatTimestamp(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local "YYYY-MM-DD" for the date group headers in the list.
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Local "HH:mm" for the per-booking row.
function formatTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local value for an <input type="datetime-local">, e.g. "2026-06-20T14:30".
function localDatetimeValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function exportFilename() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `lukis-${stamp}.csv`;
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ----------------------------- Log view (book) --------------------------- */

function renderCategoryButtons() {
  const grid = document.getElementById("cat-grid");
  grid.innerHTML = "";
  for (const category of CATEGORIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-btn";
    btn.dataset.category = category;
    if (CATEGORY_COLORS[category]) btn.style.setProperty("--btn", CATEGORY_COLORS[category]);
    btn.append(el("span", "cat-name", category), el("span", "cat-count"));
    btn.addEventListener("click", () => bookCategory(category));
    grid.appendChild(btn);
  }
}

// Today's tally, shown on the buttons themselves. Counted by booking time, so a
// back-dated entry lands on the day it was flown rather than the day it was
// typed in. A category with nothing yet stays blank instead of showing a zero.
function updateCategoryCounts(entries) {
  const today = formatDate(new Date().toISOString());
  const counts = new Map();
  let total = 0;
  for (const entry of entries) {
    if (formatDate(entry.savedAt) !== today) continue;
    const category = entry.category || "—";
    counts.set(category, (counts.get(category) || 0) + 1);
    total += 1; // counted here, not off the buttons, so a retired category still shows up
  }
  for (const btn of document.querySelectorAll(".cat-btn")) {
    btn.querySelector(".cat-count").textContent = counts.get(btn.dataset.category) || "";
  }

  const host = document.getElementById("today-total");
  host.innerHTML = "";
  if (!total) {
    host.append("No flights yet today");
  } else {
    host.append(el("strong", null, String(total)), total === 1 ? "flight today" : "flights today");
  }
}

function renderCategoryOptions() {
  const select = document.getElementById("edit-category");
  select.innerHTML = "";
  for (const category of CATEGORIES) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }
}

// Fills both glider dropdowns. The edit one gets a leading blank option so
// bookings made before gliders existed keep an empty glider unless one is
// picked deliberately.
function renderGliderOptions() {
  for (const [id, withBlank] of [["glider", false], ["edit-glider", true]]) {
    const select = document.getElementById(id);
    select.innerHTML = "";
    if (withBlank) {
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "—";
      select.appendChild(blank);
    }
    for (const glider of GLIDERS) {
      const option = document.createElement("option");
      option.value = glider;
      option.textContent = glider;
      select.appendChild(option);
    }
  }
}

// A wing is flown for weeks at a time, so the Log view restores the last pick
// instead of resetting after every booking.
function restoreGlider() {
  let stored = null;
  try {
    stored = localStorage.getItem(GLIDER_KEY);
  } catch {
    /* storage can be unavailable in private mode -- fall back to the default */
  }
  if (stored && GLIDERS.includes(stored)) document.getElementById("glider").value = stored;
}

function rememberGlider() {
  try {
    localStorage.setItem(GLIDER_KEY, document.getElementById("glider").value);
  } catch {
    /* best-effort only */
  }
}

// Sets the booking date/time field to now.
function resetBookingDatetime() {
  document.getElementById("book-datetime").value = localDatetimeValue(new Date());
}

// One-tap booking: records the chosen category at the (adjustable) date/time,
// defaulting to now, with the current remark.
async function bookCategory(category) {
  if (!currentUser) return;
  const remarkEl = document.getElementById("remark");
  const dt = document.getElementById("book-datetime").value;
  const entry = {
    id: newId(),
    savedAt: dt ? new Date(dt).toISOString() : new Date().toISOString(),
    category,
    glider: document.getElementById("glider").value,
    remark: remarkEl.value.trim(),
    createdByUid: currentUser.uid,
    createdByEmail: currentUser.email || "",
  };
  try {
    await saveEntry(currentUser.uid, entry);
  } catch (err) {
    console.error("Failed to save booking", err);
    toast("Could not save.");
    return;
  }
  remarkEl.value = ""; // the remark is per-booking; clear it for the next one
  resetBookingDatetime(); // back to "now" for the next booking
  // The glider is deliberately left as-is -- the next flight is on the same wing.
  toast(`${category} booked`);
}

/* ----------------------------- Edit a booking ---------------------------- */

function startEdit(id) {
  const entry = entriesCache.find((e) => e.id === id);
  if (!entry) {
    toast("Entry no longer exists.");
    return;
  }
  editingId = id;
  document.getElementById("edit-datetime").value = localDatetimeValue(new Date(entry.savedAt));
  document.getElementById("edit-category").value = entry.category;
  // An unknown or missing glider falls back to the blank option.
  document.getElementById("edit-glider").value = GLIDERS.includes(entry.glider) ? entry.glider : "";
  document.getElementById("edit-remark").value = entry.remark || "";
  showEditCard();
  setView("log");
}

async function onEditSubmit(event) {
  event.preventDefault();
  if (!currentUser || !editingId) return;
  // Preserve the original id and booking time; only category/remark change.
  const existing = entriesCache.find((e) => e.id === editingId) || {
    id: editingId,
    savedAt: new Date().toISOString(),
  };
  const dt = document.getElementById("edit-datetime").value;
  const updated = {
    ...existing,
    savedAt: dt ? new Date(dt).toISOString() : existing.savedAt,
    category: document.getElementById("edit-category").value,
    glider: document.getElementById("edit-glider").value,
    remark: document.getElementById("edit-remark").value.trim(),
  };
  try {
    await saveEntry(currentUser.uid, updated);
  } catch (err) {
    console.error("Failed to update booking", err);
    toast("Could not save.");
    return;
  }
  editingId = null;
  showQuickBook();
  toast("Updated");
  setView("all");
}

function cancelEdit() {
  editingId = null;
  showQuickBook();
  setView("all");
}

/* --------------------------------- Views --------------------------------- */

function hideAllViews() {
  for (const id of ["view-loading", "view-auth", "view-log", "view-all", "view-stats", "view-invoice"]) {
    document.getElementById(id).hidden = true;
  }
}

function showAuthView() {
  hideAllViews();
  document.getElementById("tabs").hidden = true;
  document.getElementById("view-auth").hidden = false;
}

function showApp(user) {
  document.getElementById("tabs").hidden = false;
  document.getElementById("account-email").textContent = user.email || "";
  showQuickBook();
  setView("log");
}

function showQuickBook() {
  document.getElementById("quickbook").hidden = false;
  document.getElementById("editcard").hidden = true;
  resetBookingDatetime(); // default the booking time to now whenever shown
}

function showEditCard() {
  document.getElementById("quickbook").hidden = true;
  document.getElementById("editcard").hidden = false;
}

function setView(view) {
  document.getElementById("view-loading").hidden = true;
  document.getElementById("view-auth").hidden = true;
  document.getElementById("view-log").hidden = view !== "log";
  document.getElementById("view-all").hidden = view !== "all";
  document.getElementById("view-stats").hidden = view !== "stats";
  document.getElementById("view-invoice").hidden = view !== "invoice";
  // A hidden element measures zero, so the sheets can only be scaled to the
  // column once this tab is actually on screen.
  if (view === "invoice") fitPreview();
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  }
  window.scrollTo(0, 0);
}

function renderEntries(entries) {
  updateCategoryCounts(entries);
  renderStats(entries);
  setInvoiceEntries(entries);

  const sorted = [...entries].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)); // newest first

  document.getElementById("count").textContent = sorted.length
    ? `${sorted.length} ${sorted.length === 1 ? "flight" : "flights"}`
    : "";

  const list = document.getElementById("entry-list");
  list.innerHTML = "";
  document.getElementById("empty-note").style.display = sorted.length ? "none" : "block";

  // Group consecutive same-day bookings (already sorted newest-first).
  const groups = [];
  let current = null;
  for (const entry of sorted) {
    const date = formatDate(entry.savedAt);
    if (!current || current.date !== date) {
      current = { date, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }

  // On the first render, expand only today's group; the rest start collapsed.
  if (!expandInitialized) {
    expandedDates.add(formatDate(new Date().toISOString()));
    expandInitialized = true;
  }

  for (const group of groups) list.appendChild(renderDateGroup(group));
}

// One collapsible day: a header (date + booking count, tap to toggle) and its
// rows. Expanded state lives in expandedDates so it survives re-renders when a
// new booking syncs in.
function renderDateGroup(group) {
  const expanded = expandedDates.has(group.date);

  const li = document.createElement("li");
  li.className = "date-group";

  const header = document.createElement("button");
  header.type = "button";
  header.className = "date-header";
  header.setAttribute("aria-expanded", expanded ? "true" : "false");

  const caret = document.createElement("span");
  caret.className = "date-caret";
  caret.textContent = "▾";

  const label = document.createElement("span");
  label.className = "date-label";
  label.textContent = group.date;

  const count = document.createElement("span");
  count.className = "date-count";
  count.textContent = group.entries.length;

  header.append(caret, label, count);

  const rows = document.createElement("ul");
  rows.className = "date-rows";
  rows.hidden = !expanded;
  for (const entry of group.entries) rows.appendChild(renderEntryRow(entry));

  header.addEventListener("click", () => toggleDate(group.date, header, rows));

  li.append(header, rows);
  return li;
}

function toggleDate(date, header, rows) {
  const willExpand = rows.hidden;
  rows.hidden = !willExpand;
  header.setAttribute("aria-expanded", willExpand ? "true" : "false");
  if (willExpand) expandedDates.add(date);
  else expandedDates.delete(date);
}

// Inline icons rather than the "✎" and "×" glyphs: those sat differently in
// every font and could not be sized with the row. Fixed markup, no user data.
const ICON_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_DELETE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>' +
  '<path d="M10 11v6M14 11v6"/></svg>';

function renderEntryRow(entry) {
  const li = document.createElement("li");
  li.className = "entry-row";

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(entry.savedAt);

  const cat = document.createElement("span");
  cat.className = "cat";
  const label = entry.category || "—";
  cat.textContent = entry.glider ? `${label} · ${entry.glider}` : label;

  const actions = document.createElement("div");
  actions.className = "entry-actions";

  const edit = document.createElement("button");
  edit.className = "entry-edit";
  edit.type = "button";
  edit.setAttribute("aria-label", "Edit flight");
  edit.innerHTML = ICON_EDIT;
  edit.addEventListener("click", () => startEdit(entry.id));

  const del = document.createElement("button");
  del.className = "entry-del";
  del.type = "button";
  del.setAttribute("aria-label", "Delete flight");
  del.innerHTML = ICON_DELETE;
  del.addEventListener("click", () => onDelete(entry.id));

  actions.appendChild(edit);
  actions.appendChild(del);

  li.appendChild(time);
  li.appendChild(cat);
  li.appendChild(actions);
  return li;
}

/* --------------------------------- Stats --------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Which year cards are open. With seventeen seasons on file only the current
// one starts expanded; the rest fold away and stay as the reader leaves them.
const expandedYears = new Set();
let expandedYearsInitialised = false;

// Months backfilled from a total alone carry this remark. Their bookings all sit
// on the last day of the month, which is not a day anyone flew -- so those days
// are kept out of the best-day record. Month and year figures are unaffected,
// and the marker is set by migration/4-history-nachtragen.js.
const AGGREGATE_REMARK = "Nachtrag Monatssumme";

// One pass over the bookings, producing everything the view needs: the
// year/month/category breakdown, the per-day totals behind the records, and
// each wing with the span it was flown over.
function buildStats(entries) {
  const years = new Map();
  const gliders = new Map();
  const days = new Map();
  const aggregateDays = new Set();
  let total = 0;
  let first = null;
  let last = null;

  for (const entry of entries) {
    const d = new Date(entry.savedAt);
    if (Number.isNaN(d.getTime())) continue; // ignore an unparseable timestamp
    const glider = entry.glider || "—"; // bookings from before gliders existed
    const day = formatDate(entry.savedAt);

    let year = years.get(d.getFullYear());
    if (!year) {
      year = { months: new Map(), total: 0, flown: 0, days: new Set() };
      years.set(d.getFullYear(), year);
    }
    let month = year.months.get(d.getMonth());
    if (!month) {
      month = { total: 0, flown: 0, days: new Set() };
      year.months.set(d.getMonth(), month);
    }

    month.total += 1;
    year.total += 1;
    // The per-day average is built only from days actually flown. A month known
    // just as a total sits on one substitute date, which would otherwise read as
    // a single day with a hundred flights on it.
    if (entry.remark !== AGGREGATE_REMARK) {
      month.flown += 1;
      month.days.add(day);
      year.flown += 1;
      year.days.add(day);
    }

    let wing = gliders.get(glider);
    if (!wing) {
      wing = { count: 0, first: day, last: day };
      gliders.set(glider, wing);
    }
    wing.count += 1;
    if (day < wing.first) wing.first = day;
    if (day > wing.last) wing.last = day;

    days.set(day, (days.get(day) || 0) + 1);
    if (entry.remark === AGGREGATE_REMARK) aggregateDays.add(day);
    total += 1;
    if (first === null || day < first) first = day;
    if (last === null || day > last) last = day;
  }

  // Days actually flown, and the bookings on them. Backfilled month totals are
  // left out of both, otherwise a month parked on one date would read as a
  // single enormous flying day and drag the average with it.
  let flyingDays = 0;
  let flyingDayTotal = 0;
  for (const [day, count] of days) {
    if (aggregateDays.has(day)) continue;
    flyingDays += 1;
    flyingDayTotal += count;
  }

  return { years, gliders, days, aggregateDays, flyingDays, flyingDayTotal, total, first, last };
}

function renderStats(entries) {
  const host = document.getElementById("stats-body");
  host.innerHTML = "";
  document.getElementById("stats-empty").style.display = entries.length ? "none" : "block";
  if (!entries.length) return;

  const stats = buildStats(entries);
  const years = [...stats.years.keys()].sort((a, b) => b - a);
  if (!expandedYearsInitialised) {
    expandedYears.add(years[0]);
    expandedYearsInitialised = true;
  }

  host.appendChild(renderOverview(stats, years));
  host.appendChild(renderRecords(stats));
  host.appendChild(renderGliderCareer(stats.gliders));
  for (const year of years) host.appendChild(renderYearCard(year, stats.years.get(year)));
}

// The headline: everything at once, then a bar per year. Without this the page
// opened straight into sixteen collapsed cards and never named a total.
function renderOverview(stats, years) {
  const card = el("div", "card");

  const hero = el("div", "stat-hero");
  hero.append(
    el("span", "num", String(stats.total)),
    el("span", "lbl", stats.total === 1 ? "flight" : "flights")
  );
  card.appendChild(hero);
  card.appendChild(
    el("p", "stat-sub", `${stats.first} to ${stats.last} · ${stats.flyingDays} flying days`)
  );

  const busiest = Math.max(...years.map((y) => stats.years.get(y).total));
  const bars = el("div", "year-bars");
  for (const year of years) {
    const count = stats.years.get(year).total;
    const fill = el("div", "fill");
    fill.style.width = `${Math.max(2, Math.round((count / busiest) * 100))}%`;
    const track = el("div", "track");
    track.appendChild(fill);
    const row = el("div", "year-bar");
    row.append(el("span", "yr", String(year)), track, el("span", "val", String(count)));
    bars.appendChild(row);
  }
  card.appendChild(bars);
  return card;
}

function renderRecords(stats) {
  let bestDay = null;
  for (const [day, count] of stats.days) {
    if (stats.aggregateDays.has(day)) continue; // a month total, not a day flown
    if (!bestDay || count > bestDay.count) bestDay = { day, count };
  }
  let bestMonth = null;
  let bestYear = null;
  for (const [year, data] of stats.years) {
    if (!bestYear || data.total > bestYear.total) bestYear = { year, total: data.total };
    for (const [month, m] of data.months) {
      if (!bestMonth || m.total > bestMonth.total) bestMonth = { year, month, total: m.total };
    }
  }

  const card = el("div", "card");
  card.appendChild(el("h2", "card-title", "Records"));
  const rows = [
    ["Best day", bestDay ? `${bestDay.day} · ${bestDay.count}` : "–"],
    ["Best month", `${MONTHS[bestMonth.month]} ${bestMonth.year} · ${bestMonth.total}`],
    ["Best year", `${bestYear.year} · ${bestYear.total}`],
    ["First flight", stats.first],
  ];
  for (const [label, value] of rows) {
    const row = el("div", "record-row");
    row.append(el("span", "k", label), el("span", "v", value));
    card.appendChild(row);
  }
  return card;
}

// Wings as a career rather than repeated under every year: which one, over what
// span, how many flights. Newest last flight first.
function renderGliderCareer(gliders) {
  const card = el("div", "card");
  card.appendChild(el("h2", "card-title", "Gliders"));
  const sorted = [...gliders.entries()].sort((a, b) => (a[1].last < b[1].last ? 1 : -1));
  for (const [name, data] of sorted) {
    const left = el("div");
    left.append(el("div", null, name), el("div", "period", `${data.first} – ${data.last}`));
    const row = el("div", "glider-row");
    row.append(left, el("span", "val", String(data.count)));
    card.appendChild(row);
  }
  return card;
}

function renderYearCard(year, data) {
  const expanded = expandedYears.has(year);
  const card = el("div", "card");

  const header = document.createElement("button");
  header.type = "button";
  header.className = "year-header";
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  header.append(
    el("span", "caret", "▾"),
    el("h2", null, String(year)),
    el("span", "cnt", String(data.total))
  );

  const body = el("div", "year-body");
  body.hidden = !expanded;
  body.appendChild(yearTable(year, data));

  header.addEventListener("click", () => {
    const willExpand = body.hidden;
    body.hidden = !willExpand;
    header.setAttribute("aria-expanded", willExpand ? "true" : "false");
    if (willExpand) expandedYears.add(year);
    else expandedYears.delete(year);
  });

  card.append(header, body);
  return card;
}

function yearTable(year, data) {
  const headRow = el("tr");
  headRow.append(
    el("th", null, "Month"),
    el("th", "col-total", "Flights"),
    el("th", "col-avg", "Avg/day")
  );
  const thead = el("thead");
  thead.appendChild(headRow);

  // The running year reads newest first, so the current month is on top. A
  // finished season reads in order, the way its curve actually ran.
  const running = year === new Date().getFullYear();
  const months = [...data.months.keys()].sort((a, b) => (running ? b - a : a - b));

  // Bars are scaled to the busiest month of this year, so each card reads on its
  // own terms instead of being flattened by an exceptional season elsewhere.
  const busiest = Math.max(...[...data.months.values()].map((m) => m.total));
  const tbody = el("tbody");
  for (const month of months) {
    const stats = data.months.get(month);
    tbody.appendChild(statsRow(MONTHS[month], stats, null, stats.total / busiest));
  }
  tbody.appendChild(statsRow("Total", data, "total-row", 0));

  const table = el("table", "stats-table");
  table.append(thead, tbody);
  const wrap = el("div", "table-wrap");
  wrap.appendChild(table);
  return wrap;
}

// One table row: the label, the count with a bar behind it scaled to the
// busiest month of that year, and the average per day flown. A stretch known
// only as a month total has no day count, so it shows a dash rather than a
// number that would pretend to a precision the source never had.
function statsRow(label, stats, className, ratio) {
  const row = el("tr", className);
  const total = el("td", "col-total", stats.total);
  if (ratio > 0) total.style.setProperty("--bar", `${Math.round(ratio * 100)}%`);
  const average = stats.days.size ? (stats.flown / stats.days.size).toFixed(1) : "–";
  row.append(el("td", null, label), total, el("td", "col-avg", average));
  return row;
}

/* ------------------------------ List actions ----------------------------- */

async function onDelete(id) {
  if (!currentUser) return;
  try {
    await deleteEntry(currentUser.uid, id);
  } catch (err) {
    console.error("Failed to delete booking", err);
    toast("Could not delete.");
    return;
  }
  if (editingId === id) cancelEdit(); // the open edit target is gone
}

async function onClear() {
  if (!currentUser) return;
  if (!entriesCache.length) {
    toast("Nothing to clear.");
    return;
  }
  if (!confirm(`Delete all ${entriesCache.length} flights? This cannot be undone.`)) return;
  try {
    await Promise.all(entriesCache.map((e) => deleteEntry(currentUser.uid, e.id)));
  } catch (err) {
    console.error("Failed to clear bookings", err);
    toast("Could not clear.");
    return;
  }
  if (editingId) cancelEdit();
  toast("All flights deleted");
}

async function onExport() {
  if (!entriesCache.length) {
    toast("Nothing to export yet.");
    return;
  }
  const entries = [...entriesCache].sort((a, b) => (a.savedAt < b.savedAt ? -1 : 1)); // oldest first

  const csv = buildCsv(entries);
  const filename = exportFilename();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const file = new File([blob], filename, { type: "text/csv" });

  // On a phone this opens the OS share sheet (Mail, WhatsApp, ...). Browsers
  // without file sharing (most desktops) fall through to a plain download.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: APP_NAME, text: `${APP_NAME} export` });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // user dismissed the share sheet
      console.warn("Share failed, falling back to download", err);
    }
  }
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* --------------------------------- Toast --------------------------------- */

let toastTimer = null;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------------------------------- Init --------------------------------- */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const register = () =>
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

async function init() {
  registerServiceWorker();

  renderCategoryButtons();
  renderCategoryOptions();
  renderGliderOptions();
  restoreGlider();
  initInvoice({ saveSettings: saveInvoiceSettings });
  document.getElementById("glider").addEventListener("change", rememberGlider);
  document.getElementById("edit-form").addEventListener("submit", onEditSubmit);
  document.getElementById("edit-cancel").addEventListener("click", cancelEdit);
  document.getElementById("export-btn").addEventListener("click", onExport);
  document.getElementById("clear-btn").addEventListener("click", onClear);
  document.getElementById("google-signin-btn").addEventListener("click", onGoogleSignIn);
  document.getElementById("signout-btn").addEventListener("click", onSignOut);
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  }

  // Ask the browser to keep our data, reducing the chance of automatic eviction.
  if (navigator.storage && navigator.storage.persist) {
    try {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch {
      /* best-effort only */
    }
  }

  // React to sign-in/out, and surface any error from a completed redirect.
  onAuthStateChanged(auth, handleAuthState);
  getRedirectResult(auth).catch((err) => {
    console.error("Redirect sign-in failed", err);
    setAuthStatus(`Sign-in failed (${err.code || "error"}).`);
  });
}

init();
