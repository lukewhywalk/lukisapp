# Öffnet einen Outlook-Entwurf mit der zuletzt gespeicherten Rechnung im Anhang.
#
# Ablauf: in der App die Rechnung erstellen, "Drucken / Als PDF speichern"
# (landet in Downloads), dann dieses Skript ausführen. Es sucht die neueste
# Datei "Rechnung Paragliding*.pdf", hängt sie an und füllt Empfänger, Betreff
# und Text aus. Gesendet wird nichts -- der Entwurf geht nur auf.
#
# Voraussetzung: klassisches Outlook für Windows. Das neue Outlook (Store-App)
# hat keine COM-Schnittstelle; dort bleibt der Weg über den Button in der App.
#
# Bequem als Verknüpfung:
#   Rechtsklick auf den Desktop -> Neu -> Verknüpfung, als Ziel eintragen:
#   powershell.exe -ExecutionPolicy Bypass -File "<Pfad zu dieser Datei>"

$ErrorActionPreference = 'Stop'

$Empfaenger = 'tom@paragliding-interlaken.ch'

$ordner = Join-Path $env:USERPROFILE 'Downloads'
$pdf = Get-ChildItem -Path $ordner -Filter 'Rechnung Paragliding*.pdf' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $pdf) {
    Write-Host "Keine Rechnung in $ordner gefunden." -ForegroundColor Red
    Write-Host 'Zuerst in der App "Drucken / Als PDF speichern" ausfuehren.'
    Read-Host 'Enter zum Schliessen'
    exit 1
}

$alter = (Get-Date) - $pdf.LastWriteTime
Write-Host "Gefunden: $($pdf.Name)"
Write-Host ("Gespeichert vor {0:N0} Minuten" -f $alter.TotalMinutes)
if ($alter.TotalHours -gt 24) {
    Write-Host 'Achtung: diese Datei ist aelter als ein Tag.' -ForegroundColor Yellow
}

# "Rechnung Paragliding Lukas Hachen Juni 2026" -> "Juni 2026"
$zeitraum = $pdf.BaseName -replace '^Rechnung Paragliding Lukas Hachen\s*', ''

try {
    $outlook = New-Object -ComObject Outlook.Application
} catch {
    Write-Host 'Outlook laesst sich nicht ansteuern.' -ForegroundColor Red
    Write-Host 'Das neue Outlook (Store-App) unterstuetzt das nicht -- klassisches Outlook noetig.'
    Read-Host 'Enter zum Schliessen'
    exit 1
}

$mail = $outlook.CreateItem(0)   # 0 = MailItem
$mail.To = $Empfaenger
$mail.Subject = "Rechnung Paragliding Lukas Hachen $zeitraum"
$mail.Body = @"
Guten Tag Tom

Im Anhang die Rechnung für die im $zeitraum durchgeführten Tandemflüge.

Freundliche Grüsse
Lukas Hachen
"@
$mail.Attachments.Add($pdf.FullName) | Out-Null
$mail.Display()   # Entwurf anzeigen, nicht senden

Write-Host 'Outlook-Entwurf geoeffnet. Pruefen und senden.' -ForegroundColor Green

