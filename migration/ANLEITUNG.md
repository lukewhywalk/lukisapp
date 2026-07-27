# Umzug auf eigenes GitHub + eigenes Firebase

Die App liegt auf GitHub Pages, die Daten liegen in Firebase Firestore. Beides muss
getrennt uebernommen werden. Reihenfolge einhalten.

## 1. Firebase-Projekt anlegen

<https://console.firebase.google.com>

1. **Projekt hinzufuegen** -- Name z. B. `lukisapp-lukas`. Google Analytics kann abgewaehlt werden.
2. **Web-App hinzufuegen** (Symbol `</>`), Name z. B. `lukis`. Hosting NICHT aktivieren
   (Hosting macht GitHub Pages). Die angezeigte `firebaseConfig` kopieren.
3. **Firestore Database -> Datenbank erstellen** -- *Production mode*, Region `eur3`
   oder `europe-west6`.
4. **Authentication -> Sign-in method -> Google** aktivieren.
5. **Authentication -> Settings -> Authorized domains** -- `<dein-github-user>.github.io`
   hinzufuegen. Ohne diesen Eintrag schlaegt der Login auf der GitHub-Pages-Seite fehl.
6. **Firestore -> Regeln** -- Inhalt von `../firestore.rules.local` einfuegen und
   **veroeffentlichen**. Diese Datei enthaelt bereits die richtige E-Mail-Adresse und ist
   per `.gitignore` vom Commit ausgeschlossen.

## 2. Repo auf eigenes GitHub

1. <https://github.com/msallin/lukisapp> -> **Fork**.
2. Dieses lokale Verzeichnis auf den eigenen Fork umbiegen:

   ```bash
   git remote set-url origin https://github.com/<dein-github-user>/lukisapp.git
   ```

3. In `../firebase-config.js` die sechs `TODO`-Werte durch die eigene Config aus
   Schritt 1.2 ersetzen. (Diese Werte sind kein Geheimnis -- der Schutz kommt aus
   den Firestore-Regeln.)
4. Committen und pushen.
5. Im Fork: **Settings -> Pages -> Source: Deploy from a branch**, Branch `main`,
   Ordner `/ (root)`. Die App laeuft danach unter
   `https://<dein-github-user>.github.io/lukisapp/`.

`sw.js` wurde bereits von `lukis-v11` auf `lukis-v12` hochgezaehlt, damit
installierte Geraete die neue Config laden statt der zwischengespeicherten alten.

## 3. Daten migrieren

Am Desktop-Browser, nicht am Handy (dort gibt es keine Konsole).

1. **Sicherheitsnetz:** in der alten App auf **Export** klicken und die CSV aufbewahren.
2. `1-export-alt.js` ausfuehren -- Anleitung steht im Kopf der Datei.
   Ergebnis: `lukis-export.json`.
3. In der neuen App einmal mit Google anmelden.
4. `2-import-neu.js` ausfuehren, `lukis-export.json` auswaehlen.
5. Pruefen, ob Anzahl und aelteste/neueste Eintraege stimmen.

Erst wenn das passt: alte PWA vom Homescreen loeschen, neue URL aufrufen und
"Zum Homescreen hinzufuegen". Die Daten im alten Firebase-Projekt bleiben unangetastet
-- sie koennen als Backup einfach liegen bleiben.
