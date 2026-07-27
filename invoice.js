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

const CREDITOR = {
  iban: "CH0808440258875652004",
  name: "Lukas Hachen",
  street: "Breitenackerstrasse",
  building: "19",
  zip: "3853",
  city: "Niederried",
  vat: "CHE-498.690.683",
};

const DEBTOR = {
  name: "Paragliding Interlaken GmbH",
  street: "Jungfraustrasse",
  building: "44",
  zip: "3800",
  city: "Interlaken",
};

// Per mille rather than percent, because the maths runs on integers: 4805.00 at
// 8.1% is exactly 389.205, and 480500 * 81 / 1000 lands on 389.205 precisely,
// where 480500 * 8.1 / 100 comes out a hair below it and would round down.
const VAT_PERMILLE = 81;
const TERMS = "Fällig 15 Tage nach Erhalt";

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
  const rows = invoice.items
    .filter((item) => item.count > 0)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td class="num">CHF ${escapeHtml(money(item.price))}</td>
          <td class="num">${item.count}</td>
          <td class="num">CHF ${escapeHtml(money(item.amount))}</td>
        </tr>`
    )
    .join("");

  return `
    <div class="sheet">
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
            <tr><th>BESCHREIBUNG</th><th class="num">Preis</th><th class="num">Anzahl</th><th class="num">BETRAG</th></tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="sum"><td colspan="3">Total</td><td class="num">CHF ${escapeHtml(money(invoice.subtotal))}</td></tr>
            <tr><td colspan="3">Zzgl. MWST ${escapeHtml(String(VAT_PERMILLE / 10))}%</td><td class="num">CHF ${escapeHtml(money(invoice.vat))}</td></tr>
            <tr class="grand"><td colspan="3">Betrag inkl. MWST</td><td class="num">CHF ${escapeHtml(money(invoice.total))}</td></tr>
          </tbody>
        </table>

        <div class="inv-foot">
          <p class="inv-label">ZAHLUNGSBEDINGUNGEN</p>
          <p>${escapeHtml(TERMS)}</p>
          <p>
            Kontoangaben:<br>
            ${escapeHtml(formatIban(CREDITOR.iban))}<br>
            ${escapeHtml(CREDITOR.name)}<br>
            ${escapeHtml(`${CREDITOR.street} ${CREDITOR.building}`)}<br>
            ${escapeHtml(`${CREDITOR.zip} ${CREDITOR.city}`)}
          </p>
          <p>MWST Nr: ${escapeHtml(CREDITOR.vat)}</p>
          <p>Vielen Dank für die Zusammenarbeit!</p>
        </div>
      </div>
      ${qrBillHtml(invoice)}
    </div>`;
}

/* --------------------------------- Wiring -------------------------------- */

function build() {
  const invoice = readForm();
  if (!invoice.items.some((item) => item.count > 0)) {
    document.getElementById("inv-sheet").innerHTML =
      '<p class="muted">Keine Positionen — mindestens eine Anzahl muss grösser als null sein.</p>';
    return;
  }
  document.getElementById("inv-sheet").innerHTML = sheetHtml(invoice);
  document.getElementById("inv-print").hidden = false;
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

export function initInvoice() {
  const today = new Date();
  document.getElementById("inv-date").value =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  document.getElementById("inv-month").addEventListener("change", syncCounts);
  document.getElementById("inv-build").addEventListener("click", build);
  document.getElementById("inv-print").addEventListener("click", () => window.print());
}
