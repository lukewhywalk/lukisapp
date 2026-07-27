/**
 * SCHRITT 2 -- Daten in die NEUE App (eigenes Firebase-Projekt) einspielen.
 *
 * Voraussetzung: Schritt 1 erledigt, lukis-export.json liegt lokal vor.
 *
 * Anwendung:
 *   1. https://<dein-github-user>.github.io/lukisapp/ im Desktop-Browser oeffnen
 *   2. Mit demselben Google-Konto anmelden (die Anmeldung legt das Benutzerkonto an)
 *   3. F12 -> Konsole -> diesen Code komplett hineinkopieren -> Enter
 *   4. Im Dateidialog lukis-export.json auswaehlen
 *
 * createdByUid/createdByEmail werden neu gesetzt: die Firebase-UID ist pro Projekt
 * verschieden, auch beim gleichen Google-Konto.
 *
 * Der Import ist idempotent (setDoc auf die originale Dokument-ID) -- ein zweiter
 * Durchlauf erzeugt keine Duplikate.
 */
(async () => {
  const SDK = "https://www.gstatic.com/firebasejs/11.3.1";
  const { getApps } = await import(`${SDK}/firebase-app.js`);
  const { getAuth } = await import(`${SDK}/firebase-auth.js`);
  const { getFirestore, collection, doc, writeBatch } = await import(`${SDK}/firebase-firestore.js`);

  const app = getApps()[0];
  if (!app) throw new Error("Keine Firebase-App gefunden -- ist die Lukis-App wirklich geladen?");
  const user = getAuth(app).currentUser;
  if (!user) throw new Error("Nicht angemeldet -- zuerst 'Sign in with Google' klicken.");
  console.log(`Ziel: ${user.email} (uid ${user.uid}), Projekt ${app.options.projectId}`);

  // Datei waehlen. Falls sich kein Dialog oeffnet (Browser blockt den Klick aus
  // der Konsole): stattdessen unten die Zeile ROWS_INLINE verwenden.
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  const file = await new Promise((resolve) => {
    input.onchange = () => resolve(input.files[0]);
    input.click();
  });
  const rows = JSON.parse(await file.text());
  // const rows = ROWS_INLINE; // Alternative: JSON-Array direkt hier einfuegen

  if (!Array.isArray(rows) || !rows.length) throw new Error("Datei enthaelt keine Eintraege.");
  console.log(`${rows.length} Eintraege gelesen, schreibe ...`);

  const db = getFirestore(app);
  const col = collection(db, "users", user.uid, "entries");
  const CHUNK = 400; // Firestore erlaubt max. 500 Operationen pro Batch
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const e of rows.slice(i, i + CHUNK)) {
      batch.set(doc(col, e.id), { ...e, createdByUid: user.uid, createdByEmail: user.email });
    }
    await batch.commit();
    console.log(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  console.log("Fertig. Die Eintraege sollten jetzt in der App erscheinen.");
})();
