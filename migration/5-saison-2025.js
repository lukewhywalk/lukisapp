/**
 * Flugsaison 2025 nachtragen, aus "Daten.csv" der PGI-Abrechnung.
 *
 * Anwendung:
 *   1. https://lukewhywalk.github.io/lukisapp/ im Desktop-Browser oeffnen
 *   2. Anmelden, warten bis die Liste geladen ist
 *   3. Strg+Umschalt+J -> diesen Code komplett einfuegen -> Enter
 *
 * Abbildung der Spalte "Person" auf die Kategorien der App:
 *   PGI Flug        -> VKPI      (315)
 *   PGI Chalet      -> PGI       (108)
 *   PGI Double Air  -> DA VKPI     (5)
 *   PGI Foto+Video  -> nicht erfasst, wird in der Rechnung von Hand gezaehlt
 *
 * Die Tage stehen exakt in der Quelle, die Uhrzeiten nicht. Alle Fluege eines
 * Tages bekommen deshalb 12:00 Uhr -- eine erfundene Verteilung ueber den Tag
 * waere Genauigkeit, die es nicht gibt. Fuer Tages-, Monats- und Jahreszahlen
 * spielt die Uhrzeit keine Rolle.
 *
 * Die Dokument-IDs sind aus Datum, Kategorie und laufender Nummer gebildet.
 * Ein zweiter Durchlauf ueberschreibt deshalb dieselben Eintraege, statt
 * Duplikate anzulegen.
 */
(async () => {
  // Vereinheitlichte Schreibweise -- die Quelle 2024 nennt denselben Schirm
  // "Beta 6 24", die Quelle 2025 "Bibeta6 2024".
  const GLIDER = "Bibeta 6 2024";
  const REMARK = "Nachtrag";

  // [Datum, { Kategorie: Anzahl }] -- 58 Flugtage, 428 Fluege
  const DAYS = [
    ["2025-06-21", {"VKPI": 4, "PGI": 2}],
    ["2025-06-22", {"VKPI": 4, "DA VKPI": 1, "PGI": 4}],
    ["2025-06-26", {"VKPI": 7}],
    ["2025-06-27", {"VKPI": 6, "PGI": 3}],
    ["2025-06-29", {"VKPI": 6}],
    ["2025-07-01", {"VKPI": 7, "DA VKPI": 1}],
    ["2025-07-03", {"VKPI": 9}],
    ["2025-07-04", {"PGI": 4, "VKPI": 3}],
    ["2025-07-10", {"VKPI": 9}],
    ["2025-07-12", {"VKPI": 9}],
    ["2025-07-13", {"VKPI": 4, "PGI": 5}],
    ["2025-07-17", {"VKPI": 8}],
    ["2025-07-19", {"VKPI": 2, "PGI": 5}],
    ["2025-07-21", {"VKPI": 9}],
    ["2025-07-26", {"PGI": 6}],
    ["2025-07-29", {"VKPI": 9}],
    ["2025-07-30", {"VKPI": 7, "DA VKPI": 1}],
    ["2025-07-31", {"VKPI": 9}],
    ["2025-08-01", {"VKPI": 3, "PGI": 1}],
    ["2025-08-02", {"VKPI": 4, "PGI": 2}],
    ["2025-08-03", {"VKPI": 4, "PGI": 5}],
    ["2025-08-04", {"VKPI": 9}],
    ["2025-08-05", {"VKPI": 8}],
    ["2025-08-08", {"VKPI": 6, "PGI": 3}],
    ["2025-08-11", {"VKPI": 9}],
    ["2025-08-12", {"VKPI": 9}],
    ["2025-08-14", {"VKPI": 9}],
    ["2025-08-20", {"VKPI": 6}],
    ["2025-08-21", {"VKPI": 3, "PGI": 4}],
    ["2025-08-29", {"PGI": 2, "VKPI": 3}],
    ["2025-08-30", {"VKPI": 3, "PGI": 6}],
    ["2025-08-31", {"VKPI": 7, "PGI": 2}],
    ["2025-09-01", {"VKPI": 1}],
    ["2025-09-03", {"VKPI": 9}],
    ["2025-09-05", {"PGI": 6}],
    ["2025-09-09", {"VKPI": 7}],
    ["2025-09-12", {"PGI": 5, "VKPI": 1}],
    ["2025-09-14", {"VKPI": 2, "PGI": 5, "DA VKPI": 1}],
    ["2025-09-16", {"VKPI": 7}],
    ["2025-09-17", {"VKPI": 8}],
    ["2025-09-18", {"VKPI": 9}],
    ["2025-09-22", {"VKPI": 3}],
    ["2025-09-23", {"VKPI": 1}],
    ["2025-09-26", {"PGI": 2, "VKPI": 1}],
    ["2025-09-27", {"VKPI": 1, "DA VKPI": 1, "PGI": 3}],
    ["2025-09-28", {"VKPI": 8, "PGI": 1}],
    ["2025-09-30", {"VKPI": 9}],
    ["2025-10-01", {"PGI": 3, "VKPI": 5}],
    ["2025-10-03", {"VKPI": 2, "PGI": 7}],
    ["2025-10-04", {"VKPI": 5, "PGI": 2}],
    ["2025-10-05", {"VKPI": 9}],
    ["2025-10-08", {"VKPI": 7, "PGI": 2}],
    ["2025-10-10", {"PGI": 5, "VKPI": 3}],
    ["2025-10-11", {"VKPI": 8, "PGI": 1}],
    ["2025-10-12", {"PGI": 1, "VKPI": 7}],
    ["2025-10-22", {"VKPI": 1, "PGI": 4}],
    ["2025-10-28", {"PGI": 6, "VKPI": 1}],
    ["2025-10-31", {"VKPI": 5, "PGI": 1}]
  ];

  const SDK = "https://www.gstatic.com/firebasejs/11.3.1";
  const { getApps } = await import(`${SDK}/firebase-app.js`);
  const { getAuth } = await import(`${SDK}/firebase-auth.js`);
  const { getFirestore, collection, doc, getDocs, writeBatch } = await import(
    `${SDK}/firebase-firestore.js`
  );

  const app = getApps()[0];
  if (!app) throw new Error("Keine Firebase-App gefunden -- ist die App wirklich geladen?");
  const user = getAuth(app).currentUser;
  if (!user) throw new Error("Nicht angemeldet -- zuerst 'Sign in with Google' klicken.");
  if (app.options.projectId !== "paragliding-app-c3885") {
    throw new Error(`Falsches Projekt: ${app.options.projectId} -- Abbruch.`);
  }

  const db = getFirestore(app);
  const col = collection(db, "users", user.uid, "entries");

  // Bestehende Eintraege aus 2025, die nicht aus einem Nachtrag stammen, waeren
  // ein Zeichen dafuer, dass die Saison teilweise schon erfasst ist.
  const snap = await getDocs(col);
  const foreign = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => String(e.savedAt).startsWith("2025-") && !e.id.startsWith("hist-"));
  if (foreign.length) {
    console.error(
      `${foreign.length} bestehende Eintraege aus 2025 gefunden, die nicht aus einem Nachtrag stammen. ` +
        "Abbruch -- sonst wird die Saison doppelt gezaehlt."
    );
    return;
  }

  const planned = [];
  for (const [date, counts] of DAYS) {
    const [y, m, d] = date.split("-").map(Number);
    const savedAt = new Date(y, m - 1, d, 12, 0, 0).toISOString();
    for (const [category, count] of Object.entries(counts)) {
      for (let i = 1; i <= count; i++) {
        planned.push({
          id: `hist-${date}-${category.replace(/\s+/g, "_")}-${String(i).padStart(3, "0")}`,
          savedAt,
          category,
          glider: GLIDER,
          remark: REMARK,
          createdByUid: user.uid,
          createdByEmail: user.email || "",
        });
      }
    }
  }

  const summary = planned.reduce((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + 1), acc), {});
  console.log(`${DAYS.length} Flugtage, ${planned.length} Fluege:`, summary);

  const CHUNK = 400; // Firestore erlaubt max. 500 Operationen pro Batch
  for (let i = 0; i < planned.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const entry of planned.slice(i, i + CHUNK)) batch.set(doc(col, entry.id), entry);
    await batch.commit();
    console.log(`  ${Math.min(i + CHUNK, planned.length)}/${planned.length}`);
  }
  console.log("Fertig. Der Stats-Tab sollte die Saison 2025 jetzt zeigen.");
})();
