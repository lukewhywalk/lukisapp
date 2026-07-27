/**
 * SCHRITT 1 -- Daten aus der ALTEN App auslesen.
 *
 * Anwendung:
 *   1. https://msallin.github.io/lukisapp/ im Desktop-Browser oeffnen (Chrome/Edge/Firefox)
 *   2. Mit Google anmelden, warten bis die Eintraege sichtbar sind
 *   3. F12 -> Konsole -> diesen Code komplett hineinkopieren -> Enter
 *
 * Ergebnis: Download der Datei "lukis-export.json" mit allen Eintraegen
 * (inkl. Dokument-IDs und den originalen savedAt-Zeitstempeln).
 */
(async () => {
  const SDK = "https://www.gstatic.com/firebasejs/11.3.1";
  const { getApps } = await import(`${SDK}/firebase-app.js`);
  const { getAuth } = await import(`${SDK}/firebase-auth.js`);
  const { getFirestore, collection, getDocs } = await import(`${SDK}/firebase-firestore.js`);

  const app = getApps()[0];
  if (!app) throw new Error("Keine Firebase-App gefunden -- ist die Lukis-App wirklich geladen?");
  const user = getAuth(app).currentUser;
  if (!user) throw new Error("Nicht angemeldet -- zuerst 'Sign in with Google' klicken.");

  const snap = await getDocs(collection(getFirestore(app), "users", user.uid, "entries"));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`${rows.length} Eintraege von ${user.email} (uid ${user.uid})`);
  if (!rows.length) throw new Error("Keine Eintraege gefunden -- Abbruch.");

  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lukis-export.json";
  a.click();
  console.log("Download gestartet: lukis-export.json");
})();
