/**
 * Historische Monate nachtragen, von denen nur die Monatssummen bekannt sind.
 *
 * Anwendung:
 *   1. https://lukewhywalk.github.io/lukisapp/ im Desktop-Browser oeffnen
 *   2. Anmelden, warten bis die Liste geladen ist
 *   3. Strg+Umschalt+J -> diesen Code komplett einfuegen -> Enter
 *
 * Weitere Monate: eine Zeile in HISTORY ergaenzen und erneut ausfuehren.
 *
 * Zu den erzeugten Eintraegen: die Tagesverteilung innerhalb des Monats ist
 * nicht bekannt, also wird sie auch nicht erfunden. Alle Fluege eines Monats
 * bekommen den letzten Tag des Monats, 12:00 Uhr, und die Bemerkung
 * "Nachtrag" -- damit sind sie in der Liste als Sammeleintrag erkennbar und
 * verfaelschen keine Tagesstatistik. Fuer die Monats- und Jahreszahlen im
 * Stats-Tab und fuer die Rechnung ist das Datum innerhalb des Monats egal.
 *
 * Die Dokument-IDs sind aus Monat, Kategorie und laufender Nummer gebildet.
 * Ein zweiter Durchlauf ueberschreibt deshalb dieselben Eintraege, statt
 * Duplikate anzulegen.
 */
(async () => {
  const HISTORY = [
    { month: "2026-02", counts: { PGI: 35, VKPI: 8 } },
  ];

  const GLIDER = "Takoo 6 2026";
  const REMARK = "Nachtrag";

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
  const snap = await getDocs(col);
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const monthOf = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? null
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const planned = [];
  for (const { month, counts } of HISTORY) {
    // Schon vorhandene Eintraege in diesem Monat, die NICHT von diesem Skript
    // stammen -- sonst wuerde der Nachtrag doppelt zaehlen.
    const foreign = existing.filter((e) => monthOf(e.savedAt) === month && !e.id.startsWith("hist-"));
    if (foreign.length) {
      console.error(
        `${month}: ${foreign.length} bestehende Eintraege gefunden, die nicht aus einem Nachtrag stammen. ` +
          `Abbruch -- bitte zuerst pruefen, ob die Monatssumme diese schon enthaelt.`
      );
      return;
    }

    const [year, mon] = month.split("-").map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const savedAt = new Date(year, mon - 1, lastDay, 12, 0, 0).toISOString();

    for (const [category, count] of Object.entries(counts)) {
      for (let i = 1; i <= count; i++) {
        planned.push({
          id: `hist-${month}-${category.replace(/\s+/g, "_")}-${String(i).padStart(3, "0")}`,
          savedAt,
          category,
          glider: GLIDER,
          remark: REMARK,
          createdByUid: user.uid,
          createdByEmail: user.email || "",
        });
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`${month}: ${total} Fluege (${Object.entries(counts).map(([c, n]) => `${c} ${n}`).join(", ")}) auf ${savedAt.slice(0, 10)}`);
  }

  console.log(`Schreibe ${planned.length} Eintraege ...`);
  const CHUNK = 400; // Firestore erlaubt max. 500 Operationen pro Batch
  for (let i = 0; i < planned.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const entry of planned.slice(i, i + CHUNK)) batch.set(doc(col, entry.id), entry);
    await batch.commit();
    console.log(`  ${Math.min(i + CHUNK, planned.length)}/${planned.length}`);
  }
  console.log("Fertig. Der Stats-Tab sollte die Monate jetzt zeigen.");
})();
