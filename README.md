# Lukis

Logbook for tandem flights. Tap one of four category buttons and the flight is
recorded with a timestamp, the wing being flown and an optional remark. Flights
sync to Firebase Firestore behind a Google sign-in, and the app installs as a PWA
that keeps working offline. It also produces the monthly invoice to the operator,
with a Swiss QR-bill, and exports everything to CSV.

Forked from [msallin/lukisapp](https://github.com/msallin/lukisapp) and grown a
long way since.

## Live app

https://lukewhywalk.github.io/lukisapp/

## Install on a phone

1. Open the link in the phone's browser (Chrome on Android, Safari on iOS).
2. Android: menu -> **Install app**. iOS: Share -> **Add to Home Screen**.
3. Launch it from the home-screen icon. It opens full-screen and works offline.

## The four tabs

**Log** -- pick the wing, optionally type a remark, then tap a category
(**PGI**, **VKPI**, **DA PGI**, **DA VKPI**). Each has its own colour so it is
found by position rather than by reading. The date and time default to now and
can be adjusted before tapping, which is how a flight gets logged after the fact.
Every button carries the number of flights it has taken today, and the day's
total sits above the grid. The wing survives a flight and a restart -- it is
flown for weeks at a time.

**All** -- the full list, grouped by day. Pencil edits a flight, the bin deletes
it. **Export** builds a CSV; on a phone it opens the share sheet, on desktop it
downloads. **Clear** removes everything, after asking.

**Stats** -- the all-time figure, a bar per year, records, the wings as a career
with the span each was flown over, and a card per year that folds open to a month
by month table with the average per day flown.

**Invoice** -- see below.

## The invoice

Pick a month and the flight counts fill themselves in: PGI and VKPI are billed as
Big Blue, DA PGI and DA VKPI as Double Air. F+V is not logged and is typed in.
Prices are prefilled with whatever was last used, so a rate change needs no
deploy.

"Rechnung erstellen" renders a print-ready A4 sheet; "Drucken / Als PDF
speichern" produces the file that gets sent. Set **margins to none** and **scale
to 100 %** in the print dialog, otherwise the QR-bill is no longer the size the
standard requires. Page two carries the payment part with a Swiss QR code, drawn
by [`qr.js`](qr.js) -- a small QR encoder vendored on purpose, so a payment code
never depends on a CDN being reachable.

Party data -- IBAN, addresses, VAT number, the client's mail address -- is
entered in the **Rechnungsdaten** card and stored in Firestore. It is deliberately
not in the source: this page is served publicly, so anything in it is public too,
private repository or not.

[`tools/outlook-rechnung.ps1`](tools/outlook-rechnung.ps1) prepares the mail on
Windows. It reads recipient, salutation and sender from `tools/empfaenger.local.txt`
(three lines, git-ignored) and finds the newest invoice in Downloads. With
classic Outlook it attaches the PDF itself; the new Outlook has no automation
interface, so there it puts the file on the clipboard and opens the draft --
Ctrl+V attaches it.

## Backfilling history

[`migration/`](migration/) holds one-off console scripts that were used to move
in from the previous app and to add seventeen seasons of records from
spreadsheets and accounting exports. They are kept because they document exactly
how each figure was derived. Each is idempotent -- document ids are derived from
the data, so a second run overwrites rather than duplicates -- and each refuses a
period that already holds entries from another source.

Months known only as a monthly total sit on the last day of that month and carry
the remark `Nachtrag Monatssumme`. The stats recognise it and leave such days out
of the best-day record and the per-day average, because that date is not a day
anyone flew.

## Changing categories or wings

Edit `CATEGORIES`, `CATEGORY_COLORS` or `GLIDERS` at the top of
[`app.js`](app.js); buttons, dropdowns and the edit dialog all follow. The
current wing goes first in `GLIDERS` -- it is the default on a fresh install.

After changing any precached file, bump `CACHE` in [`sw.js`](sw.js) (e.g.
`lukis-v30` -> `lukis-v31`), otherwise installed devices keep serving the cached
old version.

## CSV format

Columns are `Saved at`, `Category`, `Glider`, `Remark`, `Created by`, separated
by `;` with a UTF-8 BOM, which de-CH/de-DE Excel opens cleanly. Each flight also
stores the creator's uid and email.

## Where the data lives

Flights and invoice details are stored in Firebase Firestore under the signed-in
account, with the offline cache enabled so the app works with no network and
syncs when it returns. Security rules restrict access to an allow-list of
addresses, and each account to its own documents. The CSV export remains useful
as a portable backup.

## Firebase setup

The web config in [`firebase-config.js`](firebase-config.js) is not a secret and
is safe to commit -- it names the project and grants nothing. Access is decided
by the rules. To point the app at a Firebase project:

1. Create the project, add a **Web app**, paste its config into
   `firebase-config.js`.
2. **Firestore**: create a database in Native mode, database id `(default)`.
3. **Auth**: enable the **Google** sign-in provider and set a support address.
4. **Auth -> Settings -> Authorized domains**: add `<user>.github.io`. Without
   it sign-in fails with `auth/unauthorized-domain`.
5. **Firestore -> Rules**: publish `firestore.rules.local` -- see below.

## Who may sign in

Google sign-in authenticates any Google account, and Firebase has no built-in
allow-list for it. The rules enforce one instead: anyone can press "Sign in with
Google", but every read and write is denied unless the address is listed. The app
then does nothing for them and the data stays untouched.

The real addresses belong only in the published rules, never in this repository.
Hence two files:

- [`firestore.rules.example`](firestore.rules.example) -- the template, with a
  placeholder address. **Publishing it verbatim locks the real account out of its
  own data**, and the app reports `Missing or insufficient permissions`.
- `firestore.rules.local` -- the real thing, git-ignored, and the file to paste
  into the console. Create it by copying the template and replacing the address.

Republish after changing them; it takes up to a minute to take effect.

## Deploy (GitHub Pages)

1. Push to `main`.
2. Repo **Settings -> Pages -> Source: Deploy from a branch -> `main` / `/ (root)`**.
3. Wait for the build, then open `https://<user>.github.io/lukisapp/`.

Asset paths are relative on purpose, so the app runs from that project subpath
unchanged. The service worker precaches with `cache: "reload"`, which bypasses
the browser's HTTP cache -- without it a worker installing right after a deploy
can pick up a stale file from GitHub Pages' ten-minute reuse window and then
serve it indefinitely.

## Icons

The PNG icons are generated from a background colour and the letter "L" by
[`make-icons.ps1`](make-icons.ps1) (Windows PowerShell). Re-run it after changing
the colour or glyph.
