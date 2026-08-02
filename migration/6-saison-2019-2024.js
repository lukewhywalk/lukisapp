/**
 * Flugsaisons 2019 bis 2024 nachtragen, aus "exportXLS.xls" der PGI-Abrechnung.
 *
 * Anwendung:
 *   1. https://lukewhywalk.github.io/lukisapp/ im Desktop-Browser oeffnen
 *   2. Anmelden, warten bis die Liste geladen ist
 *   3. Strg+Umschalt+J -> diesen Code komplett einfuegen -> Enter
 *
 * Abbildung der Spalte "Kategorie" auf die Kategorien der App:
 *   Tandemflug, Chalet                        -> PGI      (1057)
 *   Tandemflug Hohwald / Amisbuehl / Luegi    -> VKPI     (1366)
 *   Double Air Hohwald / Amisbueel / Luegi    -> DA VKPI    (33)
 *   Double Air Chalet                         -> DA PGI, kommt in den Daten nicht vor
 *   Foto+Video, Foto, Spezial                 -> nicht erfasst
 *   Zeilen vom Typ "Ausgabe"                  -> nicht erfasst
 *
 * Schirme: die Quelle vermerkt einen Schirm nur beim Wechsel, danach gilt er
 * fort bis zum naechsten Vermerk. Genau so ist er hier aufgeloest. Die 168
 * Fluege vor dem ersten Vermerk (Februar bis Mai 2019) bleiben ohne Schirm und
 * erscheinen in der Statistik unter "-".
 *
 * Die Namen sind vereinheitlicht: "Beta 6 22" und "Beta 6 24" der Quelle sind
 * dieselben Schirme wie "Bibeta 6 2022" und "Bibeta 6 2024".
 *
 * Die Tage stehen exakt in der Quelle, die Uhrzeiten nicht. Alle Fluege eines
 * Tages bekommen deshalb 12:00 Uhr.
 *
 * Die Dokument-IDs sind aus Datum, Kategorie und laufender Nummer gebildet.
 * Ein zweiter Durchlauf ueberschreibt deshalb dieselben Eintraege, statt
 * Duplikate anzulegen.
 */
(async () => {
  const REMARK = "Nachtrag";

  // [Datum, Schirm, { Kategorie: Anzahl }] -- 391 Flugtage, 2456 Fluege
  const DAYS = [
    ["2019-02-02", "", { PGI: 6 }],
    ["2019-03-02", "", { PGI: 8 }],
    ["2019-03-09", "", { PGI: 5, VKPI: 2 }],
    ["2019-03-19", "", { VKPI: 5 }],
    ["2019-03-20", "", { VKPI: 6 }],
    ["2019-03-26", "", { VKPI: 4 }],
    ["2019-03-30", "", { PGI: 6 }],
    ["2019-03-31", "", { PGI: 6 }],
    ["2019-04-02", "", { VKPI: 6 }],
    ["2019-04-03", "", { VKPI: 4 }],
    ["2019-04-05", "", { PGI: 8 }],
    ["2019-04-06", "", { PGI: 8 }],
    ["2019-04-07", "", { PGI: 2, VKPI: 5 }],
    ["2019-04-08", "", { VKPI: 3 }],
    ["2019-04-09", "", { VKPI: 7 }],
    ["2019-04-10", "", { VKPI: 4 }],
    ["2019-05-01", "", { VKPI: 8 }],
    ["2019-05-02", "", { VKPI: 3 }],
    ["2019-05-03", "", { PGI: 8 }],
    ["2019-05-04", "", { PGI: 5 }],
    ["2019-05-07", "", { VKPI: 7 }],
    ["2019-05-08", "", { VKPI: 3 }],
    ["2019-05-09", "", { VKPI: 2 }],
    ["2019-05-10", "", { PGI: 9 }],
    ["2019-05-12", "", { PGI: 4 }],
    ["2019-05-14", "", { VKPI: 3 }],
    ["2019-05-15", "", { VKPI: 9 }],
    ["2019-05-16", "", { VKPI: 6 }],
    ["2019-05-22", "", { VKPI: 6 }],
    ["2019-05-22", "Bibeta 6 2019", { VKPI: 1 }],
    ["2019-05-23", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-05-24", "Bibeta 6 2019", { PGI: 2, VKPI: 4 }],
    ["2019-05-30", "Bibeta 6 2019", { VKPI: 8 }],
    ["2019-05-31", "Bibeta 6 2019", { PGI: 4, VKPI: 5 }],
    ["2019-06-01", "Bibeta 6 2019", { PGI: 6, VKPI: 3 }],
    ["2019-06-02", "Bibeta 6 2019", { PGI: 7, VKPI: 2 }],
    ["2019-06-04", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-06-05", "Bibeta 6 2019", { VKPI: 7 }],
    ["2019-06-06", "Bibeta 6 2019", { VKPI: 3 }],
    ["2019-06-07", "Bibeta 6 2019", { PGI: 1, VKPI: 3 }],
    ["2019-06-08", "Bibeta 6 2019", { PGI: 5, VKPI: 4 }],
    ["2019-06-09", "Bibeta 6 2019", { PGI: 8, VKPI: 1 }],
    ["2019-06-11", "Bibeta 6 2019", { PGI: 1, VKPI: 6 }],
    ["2019-06-12", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-06-13", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-06-14", "Bibeta 6 2019", { PGI: 5, VKPI: 4 }],
    ["2019-06-18", "Bibeta 6 2018", { VKPI: 5 }],
    ["2019-06-18", "Bibeta 6 2019", { VKPI: 2 }],
    ["2019-06-19", "Bibeta 6 2018", { VKPI: 3 }],
    ["2019-06-20", "Bibeta 6 2018", { VKPI: 6 }],
    ["2019-06-21", "Bibeta 6 2018", { PGI: 6, VKPI: 1 }],
    ["2019-06-24", "Bibeta 6 2018", { VKPI: 9 }],
    ["2019-06-29", "Bibeta 6 2018", { VKPI: 9 }],
    ["2019-06-30", "Bibeta 6 2018", { PGI: 5, VKPI: 4 }],
    ["2019-07-02", "Bibeta 6 2018", { "DA VKPI": 1, VKPI: 6 }],
    ["2019-07-03", "Bibeta 6 2018", { VKPI: 7 }],
    ["2019-07-04", "Bibeta 6 2018", { VKPI: 4 }],
    ["2019-07-05", "Bibeta 6 2018", { VKPI: 5 }],
    ["2019-07-07", "Bibeta 6 2018", { PGI: 4, VKPI: 1 }],
    ["2019-07-09", "Bibeta 6 2018", { VKPI: 7 }],
    ["2019-07-10", "Bibeta 6 2018", { VKPI: 9 }],
    ["2019-07-14", "Bibeta 6 2018", { "DA VKPI": 1, PGI: 3, VKPI: 4 }],
    ["2019-07-15", "Bibeta 6 2018", { PGI: 1, VKPI: 7 }],
    ["2019-07-16", "Bibeta 6 2018", { "DA VKPI": 1, VKPI: 8 }],
    ["2019-07-20", "Bibeta 6 2018", { PGI: 5, VKPI: 4 }],
    ["2019-07-23", "Bibeta 6 2018", { VKPI: 9 }],
    ["2019-07-24", "Bibeta 6 2018", { VKPI: 9 }],
    ["2019-07-25", "Bibeta 6 2018", { VKPI: 9 }],
    ["2019-07-26", "Bibeta 6 2018", { PGI: 1, VKPI: 7 }],
    ["2019-07-27", "Bibeta 6 2019", { PGI: 3, VKPI: 3 }],
    ["2019-07-30", "Bibeta 6 2019", { "DA VKPI": 1, VKPI: 8 }],
    ["2019-07-31", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-08-01", "Bibeta 6 2019", { VKPI: 4 }],
    ["2019-08-02", "Bibeta 6 2019", { PGI: 3, VKPI: 3 }],
    ["2019-08-04", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-08-06", "Bibeta 6 2019", { VKPI: 7 }],
    ["2019-08-07", "Bibeta 6 2019", { VKPI: 5 }],
    ["2019-08-08", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-08-09", "Bibeta 6 2019", { VKPI: 8 }],
    ["2019-08-13", "Bibeta 6 2019", { VKPI: 8 }],
    ["2019-08-14", "Bibeta 6 2019", { "DA VKPI": 1, VKPI: 8 }],
    ["2019-08-15", "Bibeta 6 2019", { VKPI: 6 }],
    ["2019-09-03", "Bibeta 6 2019", { "DA VKPI": 1, VKPI: 8 }],
    ["2019-09-04", "Bibeta 6 2019", { "DA VKPI": 1, VKPI: 7 }],
    ["2019-09-05", "Bibeta 6 2019", { VKPI: 3 }],
    ["2019-09-07", "Bibeta 6 2019", { PGI: 8, VKPI: 1 }],
    ["2019-09-10", "Bibeta 6 2019", { VKPI: 7 }],
    ["2019-09-11", "Bibeta 6 2019", { VKPI: 8 }],
    ["2019-09-12", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-09-13", "Bibeta 6 2019", { PGI: 1, VKPI: 7 }],
    ["2019-09-15", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 1, VKPI: 7 }],
    ["2019-09-18", "Bibeta 6 2019", { VKPI: 9 }],
    ["2019-09-19", "Bibeta 6 2019", { "DA VKPI": 1, VKPI: 5 }],
    ["2019-09-20", "Bibeta 6 2019", { PGI: 1, VKPI: 8 }],
    ["2019-09-25", "Bibeta 6 2019", { VKPI: 7 }],
    ["2019-09-26", "Bibeta 6 2019", { VKPI: 7 }],
    ["2019-09-27", "Bibeta 6 2019", { PGI: 5, VKPI: 3 }],
    ["2019-10-06", "Bibeta 6 2019", { PGI: 8 }],
    ["2019-10-08", "Bibeta 6 2019", { VKPI: 7 }],
    ["2019-10-09", "Bibeta 6 2019", { VKPI: 2 }],
    ["2019-10-10", "Bibeta 6 2019", { VKPI: 3 }],
    ["2019-10-11", "Bibeta 6 2019", { PGI: 4, VKPI: 3 }],
    ["2019-10-13", "Bibeta 6 2019", { PGI: 8 }],
    ["2019-10-15", "Bibeta 6 2019", { VKPI: 1 }],
    ["2019-10-16", "Bibeta 6 2019", { VKPI: 6 }],
    ["2019-10-18", "Bibeta 6 2019", { PGI: 3, VKPI: 1 }],
    ["2019-10-23", "Bibeta 6 2019", { VKPI: 5 }],
    ["2019-10-24", "Bibeta 6 2019", { VKPI: 2 }],
    ["2019-10-27", "Bibeta 6 2019", { PGI: 4, VKPI: 3 }],
    ["2019-11-03", "Bibeta 6 2019", { PGI: 1, VKPI: 2 }],
    ["2019-11-04", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-03-01", "Bibeta 6 2019", { PGI: 4 }],
    ["2020-03-03", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-03-06", "Bibeta 6 2019", { PGI: 1 }],
    ["2020-03-07", "Bibeta 6 2019", { PGI: 5 }],
    ["2020-03-08", "Bibeta 6 2019", { PGI: 5 }],
    ["2020-03-11", "Bibeta 6 2019", { VKPI: 4 }],
    ["2020-06-13", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-06-20", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-06-23", "Bibeta 6 2019", { PGI: 2 }],
    ["2020-06-25", "Bibeta 6 2019", { PGI: 1, VKPI: 2 }],
    ["2020-06-26", "Bibeta 6 2019", { PGI: 1, VKPI: 1 }],
    ["2020-06-27", "Bibeta 6 2019", { PGI: 3, VKPI: 1 }],
    ["2020-07-09", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-07-12", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 3, VKPI: 2 }],
    ["2020-07-13", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 1, VKPI: 2 }],
    ["2020-07-15", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-07-16", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-07-18", "Bibeta 6 2019", { PGI: 1, VKPI: 6 }],
    ["2020-07-20", "Bibeta 6 2019", { VKPI: 8 }],
    ["2020-07-23", "Bibeta 6 2019", { VKPI: 5 }],
    ["2020-07-25", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 3, VKPI: 2 }],
    ["2020-07-26", "Bibeta 6 2019", { PGI: 3, VKPI: 2 }],
    ["2020-07-27", "Bibeta 6 2019", { VKPI: 6 }],
    ["2020-08-17", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-08-20", "Bibeta 6 2019", { VKPI: 7 }],
    ["2020-08-21", "Bibeta 6 2019", { "DA VKPI": 1, VKPI: 4 }],
    ["2020-08-22", "Bibeta 6 2019", { PGI: 3, VKPI: 1 }],
    ["2020-08-23", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 1, VKPI: 1 }],
    ["2020-08-24", "Bibeta 6 2019", { VKPI: 4 }],
    ["2020-08-25", "Bibeta 6 2019", { VKPI: 4 }],
    ["2020-08-26", "Bibeta 6 2019", { VKPI: 3 }],
    ["2020-08-27", "Bibeta 6 2019", { VKPI: 5 }],
    ["2020-08-28", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-08-31", "Bibeta 6 2019", { VKPI: 4 }],
    ["2020-09-03", "Bibeta 6 2019", { VKPI: 5 }],
    ["2020-09-07", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-09-08", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-09-09", "Bibeta 6 2019", { VKPI: 6 }],
    ["2020-09-11", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-09-13", "Bibeta 6 2019", { VKPI: 6 }],
    ["2020-09-14", "Bibeta 6 2019", { VKPI: 7 }],
    ["2020-09-19", "Bibeta 6 2019", { VKPI: 5 }],
    ["2020-09-21", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-09-22", "Bibeta 6 2019", { VKPI: 2 }],
    ["2020-09-23", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-09-25", "Bibeta 6 2019", { PGI: 1 }],
    ["2020-10-11", "Bibeta 6 2019", { PGI: 1 }],
    ["2020-10-15", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-10-19", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-10-24", "Bibeta 6 2019", { VKPI: 1 }],
    ["2020-10-25", "Bibeta 6 2019", { PGI: 1, VKPI: 4 }],
    ["2021-07-10", "Bibeta 6 2019", { PGI: 1, VKPI: 5 }],
    ["2021-07-11", "Bibeta 6 2019", { VKPI: 6 }],
    ["2021-07-18", "Bibeta 6 2019", { PGI: 3 }],
    ["2021-07-24", "Bibeta 6 2019", { PGI: 3, VKPI: 2 }],
    ["2021-08-28", "Bibeta 6 2019", { PGI: 4, VKPI: 1 }],
    ["2021-08-29", "Bibeta 6 2019", { PGI: 5, VKPI: 1 }],
    ["2021-09-05", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 2, VKPI: 3 }],
    ["2021-09-11", "Bibeta 6 2019", { PGI: 3, VKPI: 3 }],
    ["2021-09-12", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 4, VKPI: 2 }],
    ["2021-09-18", "Bibeta 6 2019", { PGI: 3, VKPI: 4 }],
    ["2021-09-22", "Bibeta 6 2019", { VKPI: 2 }],
    ["2021-09-25", "Bibeta 6 2019", { PGI: 4, VKPI: 5 }],
    ["2021-09-26", "Bibeta 6 2019", { PGI: 4, VKPI: 1 }],
    ["2021-10-10", "Bibeta 6 2019", { PGI: 4, VKPI: 4 }],
    ["2021-11-06", "Bibeta 6 2019", { PGI: 4, VKPI: 3 }],
    ["2022-01-02", "Bibeta 6 2019", { PGI: 6 }],
    ["2022-01-22", "Bibeta 6 2019", { PGI: 3 }],
    ["2022-02-13", "Bibeta 6 2019", { PGI: 2 }],
    ["2022-02-26", "Bibeta 6 2019", { PGI: 6 }],
    ["2022-03-19", "Bibeta 6 2019", { PGI: 5 }],
    ["2022-03-20", "Bibeta 6 2019", { PGI: 1 }],
    ["2022-04-10", "Bibeta 6 2019", { PGI: 5, VKPI: 1 }],
    ["2022-04-18", "Bibeta 6 2019", { PGI: 2, VKPI: 7 }],
    ["2022-04-23", "Bibeta 6 2019", { PGI: 4, VKPI: 4 }],
    ["2022-04-24", "Bibeta 6 2019", { PGI: 3 }],
    ["2022-05-01", "Bibeta 6 2019", { PGI: 3, VKPI: 4 }],
    ["2022-05-08", "Bibeta 6 2019", { PGI: 4, VKPI: 5 }],
    ["2022-05-14", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 2, VKPI: 6 }],
    ["2022-05-15", "Bibeta 6 2019", { PGI: 3, VKPI: 6 }],
    ["2022-06-06", "Bibeta 6 2019", { VKPI: 9 }],
    ["2022-06-11", "Bibeta 6 2019", { VKPI: 9 }],
    ["2022-06-18", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 2, VKPI: 7 }],
    ["2022-06-19", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 1, VKPI: 8 }],
    ["2022-07-02", "Bibeta 6 2019", { PGI: 1, VKPI: 8 }],
    ["2022-07-10", "Bibeta 6 2019", { VKPI: 8 }],
    ["2022-07-23", "Bibeta 6 2019", { PGI: 1, VKPI: 4 }],
    ["2022-08-14", "Bibeta 6 2019", { PGI: 5, VKPI: 4 }],
    ["2022-08-21", "Bibeta 6 2019", { PGI: 3, VKPI: 6 }],
    ["2022-08-28", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 3, VKPI: 5 }],
    ["2022-09-10", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 5, VKPI: 2 }],
    ["2022-09-24", "Bibeta 6 2019", { PGI: 4 }],
    ["2022-10-22", "Bibeta 6 2019", { "DA VKPI": 1, PGI: 5, VKPI: 2 }],
    ["2022-10-23", "Bibeta 6 2019", { PGI: 4, VKPI: 1 }],
    ["2022-11-06", "Bibeta 6 2019", { PGI: 6 }],
    ["2022-11-06", "Bibeta 6 2022", { PGI: 1 }],
    ["2022-11-12", "Bibeta 6 2022", { PGI: 7 }],
    ["2022-11-19", "Bibeta 6 2022", { PGI: 6, VKPI: 1 }],
    ["2022-11-27", "Bibeta 6 2022", { PGI: 7 }],
    ["2022-12-04", "Bibeta 6 2022", { PGI: 3 }],
    ["2022-12-11", "Bibeta 6 2022", { PGI: 5 }],
    ["2023-01-22", "Bibeta 6 2022", { PGI: 2, VKPI: 2 }],
    ["2023-02-03", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-02-04", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-02-12", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-02-13", "Bibeta 6 2022", { PGI: 8 }],
    ["2023-02-17", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-02-19", "Bibeta 6 2022", { PGI: 8 }],
    ["2023-02-21", "Bibeta 6 2022", { PGI: 8 }],
    ["2023-02-25", "Bibeta 6 2022", { PGI: 6 }],
    ["2023-02-26", "Bibeta 6 2022", { PGI: 1 }],
    ["2023-03-05", "Bibeta 6 2022", { PGI: 4, VKPI: 4 }],
    ["2023-03-06", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-03-07", "Bibeta 6 2022", { PGI: 5, VKPI: 3 }],
    ["2023-03-12", "Bibeta 6 2022", { PGI: 2 }],
    ["2023-03-16", "Bibeta 6 2022", { PGI: 8 }],
    ["2023-03-19", "Bibeta 6 2022", { PGI: 5 }],
    ["2023-03-20", "Bibeta 6 2022", { PGI: 2, VKPI: 1 }],
    ["2023-03-21", "Bibeta 6 2022", { PGI: 2, VKPI: 6 }],
    ["2023-03-26", "Bibeta 6 2022", { PGI: 2, VKPI: 2 }],
    ["2023-03-29", "Bibeta 6 2022", { PGI: 6 }],
    ["2023-04-01", "Bibeta 6 2022", { PGI: 4, VKPI: 4 }],
    ["2023-04-02", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-04-04", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2023-04-11", "Bibeta 6 2022", { PGI: 1 }],
    ["2023-04-19", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2023-04-21", "Bibeta 6 2022", { PGI: 4, VKPI: 4 }],
    ["2023-04-22", "Bibeta 6 2022", { PGI: 7, VKPI: 2 }],
    ["2023-04-23", "Bibeta 6 2022", { PGI: 5, VKPI: 3 }],
    ["2023-05-03", "Bibeta 6 2022", { PGI: 3, VKPI: 5 }],
    ["2023-05-08", "Bibeta 6 2022", { VKPI: 8 }],
    ["2023-05-09", "Bibeta 6 2022", { VKPI: 7 }],
    ["2023-05-14", "Bibeta 6 2022", { PGI: 1 }],
    ["2023-05-16", "Bibeta 6 2022", { PGI: 1 }],
    ["2023-05-18", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-05-20", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2023-05-26", "Bibeta 6 2022", { PGI: 3, VKPI: 6 }],
    ["2023-05-30", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-06-01", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-06-04", "Bibeta 6 2022", { PGI: 3, VKPI: 5 }],
    ["2023-06-05", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-06-07", "Bibeta 6 2022", { "DA VKPI": 1, VKPI: 8 }],
    ["2023-06-09", "Bibeta 6 2022", { "DA VKPI": 1, PGI: 2, VKPI: 6 }],
    ["2023-06-27", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-06-30", "Bibeta 6 2022", { PGI: 5, VKPI: 1 }],
    ["2023-07-04", "Bibeta 6 2022", { VKPI: 5 }],
    ["2023-07-05", "Bibeta 6 2022", { VKPI: 4 }],
    ["2023-07-08", "Bibeta 6 2022", { "DA VKPI": 1, PGI: 5, VKPI: 2 }],
    ["2023-07-09", "Bibeta 6 2022", { "DA VKPI": 1, PGI: 5, VKPI: 3 }],
    ["2023-07-12", "Bibeta 6 2022", { VKPI: 7 }],
    ["2023-07-14", "Bibeta 6 2022", { PGI: 2, VKPI: 7 }],
    ["2023-07-19", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-07-20", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-07-25", "Bibeta 6 2022", { VKPI: 6 }],
    ["2023-07-26", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-08-05", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2023-08-11", "Bibeta 6 2022", { PGI: 2, VKPI: 3 }],
    ["2023-08-14", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-08-18", "Bibeta 6 2022", { PGI: 4, VKPI: 1 }],
    ["2023-08-19", "Bibeta 6 2022", { PGI: 5, VKPI: 4 }],
    ["2023-08-20", "Bibeta 6 2022", { PGI: 2, VKPI: 7 }],
    ["2023-08-23", "Bibeta 6 2022", { "DA VKPI": 1, VKPI: 8 }],
    ["2023-08-27", "Bibeta 6 2022", { PGI: 6 }],
    ["2023-08-29", "Bibeta 6 2022", { VKPI: 5 }],
    ["2023-08-31", "Bibeta 6 2022", { "DA VKPI": 1, VKPI: 7 }],
    ["2023-09-04", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-09-09", "Bibeta 6 2022", { "DA VKPI": 1, PGI: 2, VKPI: 5 }],
    ["2023-09-10", "Bibeta 6 2022", { "DA VKPI": 1, PGI: 3, VKPI: 5 }],
    ["2023-09-11", "Bibeta 6 2022", { VKPI: 5 }],
    ["2023-09-15", "Bibeta 6 2022", { PGI: 4, VKPI: 1 }],
    ["2023-09-16", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2023-09-17", "Bibeta 6 2022", { PGI: 2, VKPI: 5 }],
    ["2023-09-20", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-09-22", "Bibeta 6 2022", { PGI: 4 }],
    ["2023-09-24", "Bibeta 6 2022", { PGI: 3, VKPI: 6 }],
    ["2023-09-27", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-10-02", "Bibeta 6 2022", { VKPI: 9 }],
    ["2023-10-04", "Bibeta 6 2022", { PGI: 6, VKPI: 3 }],
    ["2023-10-07", "Bibeta 6 2022", { PGI: 4, VKPI: 5 }],
    ["2023-10-08", "Bibeta 6 2022", { PGI: 5, VKPI: 4 }],
    ["2023-10-17", "Bibeta 6 2022", { PGI: 6, VKPI: 2 }],
    ["2023-10-22", "Bibeta 6 2022", { PGI: 3, VKPI: 5 }],
    ["2023-10-25", "Bibeta 6 2022", { PGI: 7, VKPI: 1 }],
    ["2023-10-27", "Bibeta 6 2022", { PGI: 4 }],
    ["2023-10-29", "Bibeta 6 2022", { PGI: 7, VKPI: 1 }],
    ["2023-11-23", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-11-27", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-11-29", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-12-04", "Bibeta 6 2022", { PGI: 5 }],
    ["2023-12-06", "Bibeta 6 2022", { PGI: 3 }],
    ["2023-12-09", "Bibeta 6 2022", { PGI: 6 }],
    ["2023-12-10", "Bibeta 6 2022", { PGI: 5 }],
    ["2023-12-20", "Bibeta 6 2022", { PGI: 4 }],
    ["2023-12-26", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-12-28", "Bibeta 6 2022", { PGI: 7 }],
    ["2023-12-30", "Bibeta 6 2022", { PGI: 6 }],
    ["2024-01-02", "Bibeta 6 2022", { PGI: 1 }],
    ["2024-01-04", "Bibeta 6 2022", { PGI: 6 }],
    ["2024-01-05", "Bibeta 6 2022", { PGI: 4 }],
    ["2024-01-09", "Bibeta 6 2022", { PGI: 4 }],
    ["2024-01-17", "Bibeta 6 2022", { PGI: 2 }],
    ["2024-01-20", "Bibeta 6 2022", { PGI: 5 }],
    ["2024-01-21", "Bibeta 6 2022", { PGI: 5 }],
    ["2024-01-23", "Bibeta 6 2022", { PGI: 6 }],
    ["2024-01-27", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-01-28", "Bibeta 6 2022", { PGI: 5 }],
    ["2024-01-30", "Bibeta 6 2022", { PGI: 5 }],
    ["2024-02-04", "Bibeta 6 2022", { PGI: 5 }],
    ["2024-02-10", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-02-11", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-02-16", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-02-17", "Bibeta 6 2022", { PGI: 4, VKPI: 3 }],
    ["2024-02-18", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-02-23", "Bibeta 6 2022", { PGI: 8 }],
    ["2024-02-24", "Bibeta 6 2022", { PGI: 7, VKPI: 1 }],
    ["2024-02-25", "Bibeta 6 2022", { PGI: 3, VKPI: 2 }],
    ["2024-02-28", "Bibeta 6 2022", { PGI: 1 }],
    ["2024-02-29", "Bibeta 6 2022", { PGI: 3 }],
    ["2024-03-08", "Bibeta 6 2022", { PGI: 6 }],
    ["2024-03-12", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-03-13", "Bibeta 6 2022", { PGI: 2 }],
    ["2024-03-14", "Bibeta 6 2022", { PGI: 3 }],
    ["2024-03-15", "Bibeta 6 2022", { PGI: 4 }],
    ["2024-03-16", "Bibeta 6 2022", { PGI: 5 }],
    ["2024-03-17", "Bibeta 6 2022", { PGI: 5 }],
    ["2024-03-20", "Bibeta 6 2022", { PGI: 6, VKPI: 2 }],
    ["2024-03-21", "Bibeta 6 2022", { PGI: 2 }],
    ["2024-03-27", "Bibeta 6 2022", { PGI: 2 }],
    ["2024-03-30", "Bibeta 6 2022", { PGI: 3 }],
    ["2024-03-31", "Bibeta 6 2022", { PGI: 3 }],
    ["2024-04-01", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-04-02", "Bibeta 6 2022", { PGI: 6, VKPI: 2 }],
    ["2024-04-03", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-04-05", "Bibeta 6 2022", { PGI: 6, VKPI: 1 }],
    ["2024-04-06", "Bibeta 6 2022", { PGI: 4, VKPI: 4 }],
    ["2024-04-07", "Bibeta 6 2022", { PGI: 9 }],
    ["2024-04-08", "Bibeta 6 2022", { PGI: 4 }],
    ["2024-04-27", "Bibeta 6 2022", { PGI: 2 }],
    ["2024-04-28", "Bibeta 6 2022", { PGI: 8 }],
    ["2024-04-29", "Bibeta 6 2022", { PGI: 8 }],
    ["2024-05-01", "Bibeta 6 2022", { PGI: 2, VKPI: 3 }],
    ["2024-05-03", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2024-05-05", "Bibeta 6 2022", { PGI: 7, VKPI: 2 }],
    ["2024-05-09", "Bibeta 6 2022", { VKPI: 8 }],
    ["2024-05-12", "Bibeta 6 2022", { PGI: 5, VKPI: 4 }],
    ["2024-05-13", "Bibeta 6 2022", { "DA VKPI": 1, VKPI: 7 }],
    ["2024-05-15", "Bibeta 6 2022", { VKPI: 4 }],
    ["2024-05-17", "Bibeta 6 2022", { PGI: 7, VKPI: 2 }],
    ["2024-05-20", "Bibeta 6 2022", { VKPI: 9 }],
    ["2024-05-21", "Bibeta 6 2022", { VKPI: 4 }],
    ["2024-05-22", "Bibeta 6 2024", { VKPI: 9 }],
    ["2024-05-23", "Bibeta 6 2024", { VKPI: 2 }],
    ["2024-05-26", "Bibeta 6 2024", { PGI: 1, VKPI: 8 }],
    ["2024-05-27", "Bibeta 6 2024", { VKPI: 7 }],
    ["2024-05-29", "Bibeta 6 2024", { VKPI: 9 }],
    ["2024-06-01", "Bibeta 6 2024", { PGI: 9 }],
    ["2024-06-03", "Bibeta 6 2024", { VKPI: 7 }],
    ["2024-06-06", "Bibeta 6 2022", { "DA VKPI": 1, VKPI: 7 }],
    ["2024-06-07", "Bibeta 6 2022", { PGI: 6, VKPI: 3 }],
    ["2024-06-08", "Bibeta 6 2022", { PGI: 7, VKPI: 2 }],
    ["2024-06-09", "Bibeta 6 2022", { PGI: 7 }],
    ["2024-06-10", "Bibeta 6 2022", { VKPI: 7 }],
    ["2024-06-12", "Bibeta 6 2022", { VKPI: 9 }],
    ["2024-06-13", "Bibeta 6 2022", { VKPI: 9 }],
    ["2024-06-14", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2024-06-18", "Bibeta 6 2022", { VKPI: 5 }],
    ["2024-06-19", "Bibeta 6 2022", { VKPI: 9 }],
    ["2024-06-21", "Bibeta 6 2022", { PGI: 3, VKPI: 1 }],
    ["2024-06-22", "Bibeta 6 2022", { PGI: 4, VKPI: 1 }],
    ["2024-06-23", "Bibeta 6 2022", { PGI: 7, VKPI: 1 }],
    ["2024-06-24", "Bibeta 6 2022", { VKPI: 9 }],
    ["2024-06-26", "Bibeta 6 2022", { VKPI: 7 }],
    ["2024-06-29", "Bibeta 6 2022", { PGI: 5, VKPI: 2 }],
    ["2024-06-30", "Bibeta 6 2022", { PGI: 8, VKPI: 1 }],
    ["2024-07-01", "Bibeta 6 2022", { VKPI: 7 }],
    ["2024-07-02", "Bibeta 6 2022", { "DA VKPI": 1, VKPI: 8 }],
    ["2024-07-03", "Bibeta 6 2022", { VKPI: 6 }],
    ["2024-07-05", "Bibeta 6 2022", { PGI: 3, VKPI: 6 }],
    ["2024-07-07", "Bibeta 6 2022", { VKPI: 4 }],
    ["2024-07-08", "Bibeta 6 2022", { VKPI: 9 }],
    ["2024-07-09", "Bibeta 6 2022", { VKPI: 9 }],
    ["2024-07-10", "Bibeta 6 2022", { VKPI: 8 }],
    ["2024-07-12", "Bibeta 6 2022", { PGI: 6, VKPI: 2 }]
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

  // Bestehende Eintraege aus 2019-2024, die nicht aus einem Nachtrag stammen,
  // waeren ein Zeichen dafuer, dass die Jahre teilweise schon erfasst sind.
  const snap = await getDocs(col);
  const foreign = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => /^20(19|2[0-4])-/.test(String(e.savedAt)) && !e.id.startsWith("hist-"));
  if (foreign.length) {
    console.error(
      `${foreign.length} bestehende Eintraege aus 2019-2024 gefunden, die nicht aus einem ` +
        "Nachtrag stammen. Abbruch -- sonst werden die Jahre doppelt gezaehlt."
    );
    return;
  }

  const planned = [];
  const seq = new Map(); // laufende Nummer je Tag und Kategorie, ueber Schirme hinweg
  for (const [date, glider, counts] of DAYS) {
    const [y, m, d] = date.split("-").map(Number);
    const savedAt = new Date(y, m - 1, d, 12, 0, 0).toISOString();
    for (const [category, count] of Object.entries(counts)) {
      const key = `${date}|${category}`;
      for (let i = 0; i < count; i++) {
        const n = (seq.get(key) || 0) + 1;
        seq.set(key, n);
        planned.push({
          id: `hist-${date}-${category.replace(/\s+/g, "_")}-${String(n).padStart(3, "0")}`,
          savedAt,
          category,
          glider,
          remark: REMARK,
          createdByUid: user.uid,
          createdByEmail: user.email || "",
        });
      }
    }
  }

  const byCat = planned.reduce((a, e) => ((a[e.category] = (a[e.category] || 0) + 1), a), {});
  const byGlider = planned.reduce((a, e) => ((a[e.glider || "-"] = (a[e.glider || "-"] || 0) + 1), a), {});
  console.log(`${planned.length} Fluege an ${new Set(DAYS.map((x) => x[0])).size} Tagen`);
  console.log("  Kategorien:", byCat);
  console.log("  Schirme:", byGlider);

  const CHUNK = 400; // Firestore erlaubt max. 500 Operationen pro Batch
  for (let i = 0; i < planned.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const entry of planned.slice(i, i + CHUNK)) batch.set(doc(col, entry.id), entry);
    await batch.commit();
    console.log(`  ${Math.min(i + CHUNK, planned.length)}/${planned.length}`);
  }
  console.log("Fertig. Der Stats-Tab sollte die Jahre 2019-2024 jetzt zeigen.");
})();
