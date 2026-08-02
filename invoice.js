/**
 * Monthly invoice for Paragliding Interlaken, with a Swiss QR-bill payment part.
 *
 * The flight counts come from the bookings: PGI and VKPI are billed as "Big
 * Blue", DA PGI and DA VKPI as "Double Air". F+V has no counterpart in the log
 * and is typed in. Prices are prefilled and editable, so a rate change needs no
 * code change.
 *
 * Output is a print-ready A4 sheet -- "Print -> Save as PDF" produces the file
 * that gets sent.
 */

import { qrMatrix } from "./qr.js";

// Deliberately empty. This file is served to anyone who opens the page, so an
// IBAN, a VAT number, a home address and a client's mail address have no place
// in it. The real values live in the settings document in Firestore, behind the
// same sign-in as the flights, and land here via setInvoiceSettings.
let CREDITOR = { iban: "", name: "", street: "", building: "", zip: "", city: "", vat: "" };
let DEBTOR = { name: "", street: "", building: "", zip: "", city: "" };
let MAIL_TO = "";
let TERMS = "";

// Form field -> settings key. The ids in index.html are `inv-set-<key>`.
const SETTING_KEYS = [
  "creditor-name", "creditor-street", "creditor-building", "creditor-zip",
  "creditor-city", "creditor-iban", "creditor-vat",
  "debtor-name", "debtor-street", "debtor-building", "debtor-zip", "debtor-city",
  "mail-to", "mail-greeting", "terms",
];

// Everything an invoice cannot be printed without. The mail fields are not on
// the list -- a bill can be handed over on paper -- and the VAT number only
// applies once registered.
const OPTIONAL_KEYS = ["mail-to", "mail-greeting", "creditor-vat"];
const REQUIRED_KEYS = SETTING_KEYS.filter((k) => !OPTIONAL_KEYS.includes(k));

// Per mille rather than percent, because the maths runs on integers: 4805.00 at
// 8.1% is exactly 389.205, and 480500 * 81 / 1000 lands on 389.205 precisely,
// where 480500 * 8.1 / 100 comes out a hair below it and would round down.
const VAT_PERMILLE = 81;

// Prices are the standing rates, not a per-invoice figure -- whatever was last
// entered becomes the default for the next month. The fallbacks apply only to a
// browser that has never had them set.
const PRICE_KEY = "lukis.prices";
const DEFAULT_PRICES = { bigblue: 100, doubleair: 170, fv: 33 };

// Which booking categories roll up into which invoice line.
const LINES = [
  { key: "bigblue", label: "Tandemflug Big Blue", categories: ["PGI", "VKPI"] },
  { key: "doubleair", label: "Tandemflug Double Air", categories: ["DA PGI", "DA VKPI"] },
  { key: "fv", label: "Tandemflug F+V", categories: null }, // not logged -- entered by hand
];

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

let entriesCache = [];

/* -------------------------------- Helpers -------------------------------- */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

// Every amount below is an integer number of rappen. Francs only exist at the
// edges -- read off the form, printed back out -- so no total can drift by a
// centime along the way.
function toRappen(francs) {
  return Math.round(francs * 100);
}

function formatRappen(rappen, separator) {
  const sign = rappen < 0 ? "-" : "";
  const abs = Math.abs(rappen);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

// The invoice body separates thousands with an apostrophe: 3'800.00
function money(rappen) {
  return formatRappen(rappen, "'");
}

// The QR-bill uses a space instead: 5 194.21
function billAmount(rappen) {
  return formatRappen(rappen, " ");
}

function formatIban(iban) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------- Settings -------------------------------- */

let settingsValues = {};
let saveSettings = null; // provided by app.js -- writes the settings document

// Runs on every snapshot of the settings document. A field being edited is left
// alone, so a save arriving mid-typing does not overwrite what is being typed.
export function setInvoiceSettings(data) {
  settingsValues = data || {};
  for (const key of SETTING_KEYS) {
    const field = document.getElementById(`inv-set-${key}`);
    if (field && document.activeElement !== field) field.value = settingsValues[key] || "";
  }
  applySettings();
  updateSettingsState();
}

function applySettings() {
  const at = (key) => (settingsValues[key] || "").trim();
  CREDITOR = {
    name: at("creditor-name"),
    street: at("creditor-street"),
    building: at("creditor-building"),
    zip: at("creditor-zip"),
    city: at("creditor-city"),
    iban: at("creditor-iban").replace(/\s+/g, ""), // stored spaced or not, used bare
    vat: at("creditor-vat"),
  };
  DEBTOR = {
    name: at("debtor-name"),
    street: at("debtor-street"),
    building: at("debtor-building"),
    zip: at("debtor-zip"),
    city: at("debtor-city"),
  };
  MAIL_TO = at("mail-to");
  TERMS = at("terms");
}

function missingSettings() {
  return REQUIRED_KEYS.filter((key) => !(settingsValues[key] || "").trim());
}

function readSettingsForm() {
  const values = {};
  for (const key of SETTING_KEYS) {
    values[key] = (document.getElementById(`inv-set-${key}`).value || "").trim();
  }
  return values;
}

function updateSettingsState() {
  const missing = missingSettings();
  const status = document.getElementById("inv-set-status");
  if (missing.length) {
    status.textContent =
      `${missing.length} Pflichtangabe${missing.length === 1 ? "" : "n"} fehlt noch — ` +
      "ohne diese lässt sich keine Rechnung erstellen.";
    document.getElementById("inv-settings").open = true;
  } else {
    status.textContent = "";
  }
}

async function onSaveSettings() {
  const button = document.getElementById("inv-set-save");
  const status = document.getElementById("inv-set-status");
  button.disabled = true;
  try {
    await saveSettings(readSettingsForm());
    status.textContent = "Gespeichert.";
  } catch (err) {
    console.error("Failed to save invoice settings", err);
    status.textContent = "Speichern fehlgeschlagen.";
  } finally {
    button.disabled = false;
  }
}

/* ------------------------------ Form state ------------------------------- */

// Every month that has bookings, plus the previous month even when empty --
// that is the one usually being invoiced.
function availableMonths() {
  const months = new Set();
  for (const entry of entriesCache) {
    const d = new Date(entry.savedAt);
    if (!Number.isNaN(d.getTime())) months.add(monthKey(d));
  }
  const previous = new Date();
  previous.setDate(1);
  previous.setMonth(previous.getMonth() - 1);
  months.add(monthKey(previous));
  return [...months].sort().reverse();
}

function countFor(key, month) {
  const line = LINES.find((l) => l.key === key);
  if (!line || !line.categories) return 0;
  return entriesCache.filter((entry) => {
    const d = new Date(entry.savedAt);
    return !Number.isNaN(d.getTime()) && monthKey(d) === month && line.categories.includes(entry.category);
  }).length;
}

// Refills the counts from the bookings of the selected month. F+V is left alone
// -- it is not derived from anything.
function syncCounts() {
  const month = document.getElementById("inv-month").value;
  document.getElementById("inv-count-bigblue").value = countFor("bigblue", month);
  document.getElementById("inv-count-doubleair").value = countFor("doubleair", month);
}

function restorePrices() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(PRICE_KEY) || "null");
  } catch {
    /* unreadable or unavailable -- fall back to the defaults */
  }
  for (const line of LINES) {
    const saved = stored ? Number(stored[line.key]) : NaN;
    const value = Number.isFinite(saved) && saved >= 0 ? saved : DEFAULT_PRICES[line.key];
    document.getElementById(`inv-price-${line.key}`).value = value;
  }
}

function rememberPrices() {
  const prices = {};
  for (const line of LINES) {
    prices[line.key] = Number(document.getElementById(`inv-price-${line.key}`).value) || 0;
  }
  try {
    localStorage.setItem(PRICE_KEY, JSON.stringify(prices));
  } catch {
    /* best-effort only */
  }
}

function readForm() {
  const number = (id) => {
    const value = Number(document.getElementById(id).value);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const month = document.getElementById("inv-month").value;
  const items = LINES.map((line) => {
    const count = number(`inv-count-${line.key}`);
    const price = toRappen(number(`inv-price-${line.key}`));
    return { label: line.label, count, price, amount: count * price };
  });
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const vat = Math.round((subtotal * VAT_PERMILLE) / 1000);
  return {
    month,
    date: document.getElementById("inv-date").value,
    items,
    subtotal,
    vat,
    total: subtotal + vat,
    message: `Tandemgleitschirmflüge ${monthLabel(month)}`,
  };
}

/* ------------------------------- QR-bill --------------------------------- */

// The Swiss QR Code payload: 31 elements, one per line. The IBAN is an ordinary
// one rather than a QR-IBAN, so the reference type is NON and the reference
// itself stays empty -- a structured reference would be rejected.
function qrPayload(invoice) {
  return [
    "SPC",
    "0200",
    "1",
    CREDITOR.iban,
    "S",
    CREDITOR.name,
    CREDITOR.street,
    CREDITOR.building,
    CREDITOR.zip,
    CREDITOR.city,
    "CH",
    "", "", "", "", "", "", "", // ultimate creditor: unused
    (invoice.total / 100).toFixed(2),
    "CHF",
    "S",
    DEBTOR.name,
    DEBTOR.street,
    DEBTOR.building,
    DEBTOR.zip,
    DEBTOR.city,
    "CH",
    "NON",
    "",
    invoice.message,
    "EPD",
  ].join("\n");
}

// 46 x 46 mm as the specification demands, with the Swiss cross centred on top.
function qrSvg(payload) {
  const matrix = qrMatrix(payload);
  const size = matrix.length;
  const unit = 46 / size;
  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r][c]) continue;
      rects += `<rect x="${(c * unit).toFixed(3)}" y="${(r * unit).toFixed(3)}" width="${unit.toFixed(3)}" height="${unit.toFixed(3)}"/>`;
    }
  }
  // 7 x 7 mm black square on a white margin, bars 1.17 x 3.89 mm.
  const cross =
    '<rect x="19.3" y="19.3" width="7.4" height="7.4" fill="#fff"/>' +
    '<rect x="19.5" y="19.5" width="7" height="7" fill="#000"/>' +
    '<rect x="22.415" y="21.055" width="1.17" height="3.89" fill="#fff"/>' +
    '<rect x="21.055" y="22.415" width="3.89" height="1.17" fill="#fff"/>';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="46mm" height="46mm" viewBox="0 0 46 46" shape-rendering="crispEdges">` +
    `<rect width="46" height="46" fill="#fff"/><g fill="#000">${rects}</g>${cross}</svg>`
  );
}

function creditorBlock() {
  return `${escapeHtml(formatIban(CREDITOR.iban))}<br>${escapeHtml(CREDITOR.name)}<br>` +
    `${escapeHtml(`${CREDITOR.street} ${CREDITOR.building}`)}<br>${escapeHtml(`${CREDITOR.zip} ${CREDITOR.city}`)}`;
}

function debtorBlock() {
  return `${escapeHtml(DEBTOR.name)}<br>${escapeHtml(`${DEBTOR.street} ${DEBTOR.building}`)}<br>` +
    `${escapeHtml(`${DEBTOR.zip} ${DEBTOR.city}`)}`;
}

function qrBillHtml(invoice) {
  const amount = billAmount(invoice.total);
  return `
    <div class="qrbill">
      <div class="qr-receipt">
        <p class="qr-title">Empfangsschein</p>
        <p class="qr-h-s">Konto / Zahlbar an</p>
        <p class="qr-v-s">${creditorBlock()}</p>
        <p class="qr-h-s">Zahlbar durch</p>
        <p class="qr-v-s">${debtorBlock()}</p>
        <div class="qr-amount">
          <div><p class="qr-h-s">Währung</p><p class="qr-v-s">CHF</p></div>
          <div><p class="qr-h-s">Betrag</p><p class="qr-v-s">${escapeHtml(amount)}</p></div>
        </div>
        <p class="qr-accept">Annahmestelle</p>
      </div>
      <div class="qr-payment">
        <div class="qr-left">
          <p class="qr-title">Zahlteil</p>
          <div class="qr-code">${qrSvg(qrPayload(invoice))}</div>
          <div class="qr-amount">
            <div><p class="qr-h-p">Währung</p><p class="qr-v-p">CHF</p></div>
            <div><p class="qr-h-p">Betrag</p><p class="qr-v-p">${escapeHtml(amount)}</p></div>
          </div>
        </div>
        <div class="qr-right">
          <p class="qr-h-p">Konto / Zahlbar an</p>
          <p class="qr-v-p">${creditorBlock()}</p>
          <p class="qr-h-p">Zusätzliche Informationen</p>
          <p class="qr-v-p">${escapeHtml(invoice.message)}</p>
          <p class="qr-h-p">Zahlbar durch</p>
          <p class="qr-v-p">${debtorBlock()}</p>
        </div>
      </div>
    </div>`;
}

/* -------------------------------- Sheet ---------------------------------- */

function sheetHtml(invoice) {
  // The currency sits in the column heading rather than on every line -- three
  // repetitions of "CHF" down a column is noise, and bare figures line up.
  const rows = invoice.items
    .filter((item) => item.count > 0)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td class="num">${escapeHtml(money(item.price))}</td>
          <td class="num">${item.count}</td>
          <td class="num">${escapeHtml(money(item.amount))}</td>
        </tr>`
    )
    .join("");

  return `
    <div class="sheet">
      <div class="page">
        <div class="sheet-body">
        <div class="inv-top">
          <div>
            ${escapeHtml(CREDITOR.name)}<br>
            ${escapeHtml(`${CREDITOR.street} ${CREDITOR.building}`)}<br>
            ${escapeHtml(`${CREDITOR.zip} ${CREDITOR.city}`)}
          </div>
          <div class="inv-meta">
            Datum: ${escapeHtml(formatDate(invoice.date))}<br>
            Rechnung vom: ${escapeHtml(monthLabel(invoice.month))}
          </div>
        </div>

        <h1 class="inv-title">RECHNUNG</h1>

        <p class="inv-label">RECHNUNGSADRESSE</p>
        <p class="inv-to">${debtorBlock()}</p>

        <p class="inv-subject">Durchführung Tandemgleitschirmflüge</p>

        <table class="inv-items">
          <thead>
            <tr>
              <th>Beschreibung</th>
              <th class="num">Preis CHF</th>
              <th class="num">Anzahl</th>
              <th class="num">Betrag CHF</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="inv-totals">
          <div class="inv-sum"><span>Total</span><span>${escapeHtml(money(invoice.subtotal))}</span></div>
          <div class="inv-sum"><span>Zzgl. MWST ${escapeHtml(String(VAT_PERMILLE / 10))}%</span><span>${escapeHtml(money(invoice.vat))}</span></div>
          <div class="inv-sum inv-grand"><span>Betrag inkl. MWST</span><span>CHF ${escapeHtml(money(invoice.total))}</span></div>
        </div>

        <p class="inv-thanks">Vielen Dank für die Zusammenarbeit!</p>

        <div class="inv-foot">
          <div>
            <p class="inv-label">ZAHLUNGSBEDINGUNGEN</p>
            <p>${escapeHtml(TERMS)}</p>
          </div>
          <div>
            <p class="inv-label">KONTOANGABEN</p>
            <p>
              ${escapeHtml(formatIban(CREDITOR.iban))}<br>
              ${escapeHtml(CREDITOR.name)}<br>
              ${escapeHtml(`${CREDITOR.street} ${CREDITOR.building}`)}<br>
              ${escapeHtml(`${CREDITOR.zip} ${CREDITOR.city}`)}
            </p>
          </div>
          <div>
            <p class="inv-label">MWST-NUMMER</p>
            <p>${escapeHtml(CREDITOR.vat)}</p>
          </div>
        </div>
        </div>
      </div>
      <div class="page page-bill">
        <p class="bill-note">${escapeHtml(subjectFor(monthLabel(invoice.month)))} — Zahlteil</p>
        ${qrBillHtml(invoice)}
      </div>
    </div>`;
}

/* --------------------------------- Wiring -------------------------------- */

let built = null; // the invoice currently shown, needed for the PDF file name

// The sheet is a fixed 210 mm wide, which overflows the column on anything
// narrower than a desktop. Scale it down to fit rather than clipping it; the
// print rules drop the transform so paper output stays at true size.
function fitPreview() {
  const host = document.getElementById("inv-sheet");
  const sheet = host.querySelector(".sheet");
  if (!sheet) return;
  sheet.style.transform = "none";
  host.style.height = "";
  const scale = Math.min(1, host.clientWidth / sheet.offsetWidth);
  sheet.style.transformOrigin = "top left";
  sheet.style.transform = `scale(${scale})`;
  host.style.height = `${sheet.offsetHeight * scale}px`;
}

function build() {
  const missing = missingSettings();
  if (missing.length) {
    document.getElementById("inv-sheet").innerHTML =
      '<p class="muted">Rechnungsdaten unvollständig — bitte oben ausfüllen und speichern.</p>';
    document.getElementById("inv-print").hidden = true;
    document.getElementById("inv-mail").hidden = true;
    built = null;
    updateSettingsState();
    return;
  }

  const invoice = readForm();
  if (!invoice.items.some((item) => item.count > 0)) {
    document.getElementById("inv-sheet").innerHTML =
      '<p class="muted">Keine Positionen — mindestens eine Anzahl muss grösser als null sein.</p>';
    document.getElementById("inv-print").hidden = true;
    document.getElementById("inv-mail").hidden = true;
    built = null;
    return;
  }
  built = invoice;
  document.getElementById("inv-sheet").innerHTML = sheetHtml(invoice);
  document.getElementById("inv-print").hidden = false;
  document.getElementById("inv-mail").hidden = false;
  fitPreview();
}

// Doubles as the PDF file name -- see print(). tools/outlook-rechnung.ps1 finds
// the file by the same pattern.
function subjectFor(period) {
  return `Rechnung Paragliding ${CREDITOR.name} ${period}`;
}

// Opens the mail client with everything but the attachment filled in. mailto
// cannot carry a file -- no browser permits it -- so the PDF still gets dragged
// in by hand. tools/outlook-rechnung.ps1 does that part on this PC.
function mail() {
  if (!built) return;
  if (!MAIL_TO) {
    document.getElementById("inv-set-status").textContent =
      "Keine Mailadresse hinterlegt — bitte in den Rechnungsdaten eintragen.";
    document.getElementById("inv-settings").open = true;
    return;
  }
  const period = monthLabel(built.month);
  const body = [
    (settingsValues["mail-greeting"] || "Guten Tag").trim(),
    "",
    `Im Anhang die Rechnung für die im ${period} durchgeführten Tandemflüge.`,
    "",
    "Freundliche Grüsse",
    CREDITOR.name,
  ].join("\r\n");
  window.location.href =
    `mailto:${MAIL_TO}?subject=${encodeURIComponent(subjectFor(period))}&body=${encodeURIComponent(body)}`;
}

// "Save as PDF" takes its file name from the document title, so swap the title
// for the duration of the print dialog and put it back afterwards.
function print() {
  if (!built) return;
  const original = document.title;
  document.title = subjectFor(monthLabel(built.month));
  window.addEventListener("afterprint", () => { document.title = original; }, { once: true });
  window.print();
}

// Called on every snapshot so the month list and the counts follow the data.
export function setInvoiceEntries(entries) {
  entriesCache = entries;
  const select = document.getElementById("inv-month");
  const previous = select.value;
  select.innerHTML = "";
  for (const key of availableMonths()) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = monthLabel(key);
    select.appendChild(option);
  }
  if (previous && [...select.options].some((o) => o.value === previous)) select.value = previous;
  syncCounts();
}

export function initInvoice(handlers) {
  saveSettings = handlers.saveSettings;
  document.getElementById("inv-set-save").addEventListener("click", onSaveSettings);

  const today = new Date();
  document.getElementById("inv-date").value =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  restorePrices();
  for (const line of LINES) {
    document.getElementById(`inv-price-${line.key}`).addEventListener("change", rememberPrices);
  }
  document.getElementById("inv-month").addEventListener("change", syncCounts);
  document.getElementById("inv-build").addEventListener("click", build);
  document.getElementById("inv-print").addEventListener("click", print);
  document.getElementById("inv-mail").addEventListener("click", mail);
  window.addEventListener("resize", fitPreview);
}
