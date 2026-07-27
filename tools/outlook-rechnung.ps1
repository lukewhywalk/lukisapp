# Bereitet die Rechnungsmail vor: sucht die neueste Rechnung in Downloads,
# legt sie in die Zwischenablage und öffnet den vorausgefüllten Mailentwurf.
#
# Ablauf: in der App die Rechnung erstellen, "Drucken / Als PDF speichern"
# (landet in Downloads), dann dieses Skript ausführen. Im Mailfenster einmal
# Strg+V drücken -- damit hängt der PDF an. Gesendet wird nichts.
#
# Warum der Umweg über die Zwischenablage: das neue Outlook (Store-App) hat
# keine Automatisierungsschnittstelle, und mailto kann von sich aus keine Datei
# anhängen. Ist klassisches Outlook installiert, nimmt das Skript stattdessen
# den direkten Weg und hängt den PDF selbst an.
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
$betreff = "Rechnung Paragliding Lukas Hachen $zeitraum"
$text = @(
    'Guten Tag Tom',
    '',
    "Im Anhang die Rechnung für die im $zeitraum durchgeführten Tandemflüge.",
    '',
    'Freundliche Grüsse',
    'Lukas Hachen'
) -join "`r`n"

# Weg 1: klassisches Outlook, falls vorhanden -- haengt den PDF selbst an.
$outlook = $null
try { $outlook = New-Object -ComObject Outlook.Application } catch { }

if ($outlook) {
    $mail = $outlook.CreateItem(0)   # 0 = MailItem
    $mail.To = $Empfaenger
    $mail.Subject = $betreff
    $mail.Body = $text
    $mail.Attachments.Add($pdf.FullName) | Out-Null
    $mail.Display()                  # Entwurf anzeigen, nicht senden
    Write-Host 'Outlook-Entwurf mit Anhang geoeffnet. Pruefen und senden.' -ForegroundColor Green
    exit 0
}

# Weg 2: neues Outlook -- PDF in die Zwischenablage, Entwurf per mailto oeffnen.
Set-Clipboard -Path $pdf.FullName
$url = 'mailto:{0}?subject={1}&body={2}' -f $Empfaenger,
    [uri]::EscapeDataString($betreff),
    [uri]::EscapeDataString($text)
Start-Process $url

# Den Ordner mit markierter Datei daneben oeffnen -- damit ist der PDF sofort
# greifbar, falls das Einfuegen aus der Zwischenablage nicht angenommen wird.
Start-Process explorer.exe -ArgumentList ('/select,"{0}"' -f $pdf.FullName)

Write-Host ''
Write-Host 'Entwurf geoeffnet. Der PDF liegt in der Zwischenablage,' -ForegroundColor Green
Write-Host 'und der Downloads-Ordner steht mit markierter Datei bereit.' -ForegroundColor Green
Write-Host ''
Write-Host 'Anhaengen auf zwei Arten:'
Write-Host '  1. Im Mailfenster in den Text klicken, Strg+V'
Write-Host '  2. Oder die markierte Datei aus dem Explorer ins Mailfenster ziehen'


