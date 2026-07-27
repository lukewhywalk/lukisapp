/**
 * EINMALIG -- Schirm bei bestehenden Buchungen nachtragen.
 *
 * Alle Fluege, die vor der Schirm-Auswahl erfasst wurden, haben kein
 * glider-Feld. Dieses Skript setzt bei genau diesen "Takoo 6 2026". Eintraege,
 * bei denen bereits ein Schirm steht, bleiben unangetastet -- das Skript kann
 * also gefahrlos mehrfach laufen.
 *
 * Anwendung:
 *   1. https://lukewhywalk.github.io/lukisapp/ im Desktop-Browser oeffnen
 *   2. Anmelden, warten bis die Liste geladen ist
 *   3. Strg+Umschalt+J -> diesen Code komplett einfuegen -> Enter
 */
(async () => {
  const GLIDER = "Takoo 6 2026";
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
  const todo = snap.docs.filter((d) => !d.data().glider);
  console.log(`${snap.size} Eintraege gesamt, ${todo.length} ohne Schirm.`);
  if (!todo.length) {
    console.log("Nichts zu tun.");
    return;
  }

  const CHUNK = 400; // Firestore erlaubt max. 500 Operationen pro Batch
  for (let i = 0; i < todo.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const d of todo.slice(i, i + CHUNK)) {
      batch.set(doc(col, d.id), { glider: GLIDER }, { merge: true });
    }
    await batch.commit();
    console.log(`  ${Math.min(i + CHUNK, todo.length)}/${todo.length}`);
  }
  console.log(`Fertig -- ${todo.length} Eintraege auf "${GLIDER}" gesetzt.`);
})();
