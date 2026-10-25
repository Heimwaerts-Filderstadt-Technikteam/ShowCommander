# Voraussetzungen – ShowCommander

Checkliste für alles, was du brauchst. Nicht alles ist Pflicht: Teile 1 und 2 sind die Basis, 3–6 nur, wenn du die jeweilige Anbindung nutzt.

---

## 1. Server (Pflicht)

| Was | Details |
|---|---|
| Rechner | Linux-Server, NAS, Mini-PC oder Raspberry Pi 4/5 – läuft 24/7 oder zumindest während der Gottesdienste |
| Software | **Docker** + **Docker Compose** (Plugin `docker compose`) **oder** Node.js **20 oder neuer** ohne Docker |
| Abhängigkeiten | Keine – kein `npm install` nötig |
| Port | **8080/TCP** (änderbar über `PORT` bzw. das Port-Mapping in `docker-compose.yml`) |
| Speicher | wenige MB; Daten liegen in `./data` (JSON-Dateien) → ins Backup aufnehmen |
| Aufbewahrung | Abläufe löschen sich nach 14 Tagen selbst (einstellbar, `RETENTION_DAYS`); Vorlagen bleiben. Wer Abläufe länger braucht: „📌 behalten“ oder Backup von `./data` |
| Zeitzone | `TZ=Europe/Berlin` ist im Compose-File gesetzt |
| Uhrzeit | Server-Uhr per NTP synchron halten (alle Bildschirme gleichen sich mit der Server-Uhr ab) |

**Netzwerk – wichtig für ProPresenter:**
Der Server ruft ProPresenter **aktiv** auf. Er muss deshalb **im selben Netz wie der ProPresenter-Rechner** stehen (oder per VPN verbunden sein). Ein Server im Rechenzentrum/VPS kann ProPresenter in der Gemeinde nicht erreichen.

**Optional: Zugriff von außen / HTTPS**
- Reverse-Proxy (z. B. Nginx Proxy Manager) mit SSL-Zertifikat
- Kein WebSocket-Support nötig; Live-Updates laufen über Server-Sent Events. Der Server sendet `X-Accel-Buffering: no`, damit Nginx nicht puffert
- `APP_PASSWORD` setzen, sobald der Server aus dem Internet erreichbar ist

## 2. Endgeräte (Pflicht)

- Aktueller Browser: Chrome, Edge, Safari oder Firefox
- **Editor/Showcaller**: Laptop oder Desktop (Tastatursteuerung: Leertaste = Weiter)
- **Output/Bühnenmonitor**: beliebiges Gerät mit Browser (Smart-TV-Browser, Tablet, Mini-PC, Raspberry Pi im Kiosk-Modus)
- **Prompter**: Tablet/Monitor mit Browser; für Spiegelglas-Prompter „Spiegeln“ aktivieren
- Alle Geräte müssen den Server erreichen (gleiches WLAN/LAN oder über die öffentliche Adresse)

## 2a. Datei-Import (optional)

- Keine zusätzliche Software: PDF wird im Browser gelesen (pdf.js ist mitgeliefert), Word/Excel/LibreOffice/CSV/Text liest der Server selbst
- Funktioniert ohne Internet im Gemeinde-Netz
- PDFs müssen echten Text enthalten (aus Word/Pages/ChurchTools exportiert). **Eingescannte PDFs** (Fotos/Scans) werden nicht erkannt
- Alte Formate **.doc/.xls** vorher als .docx/.xlsx oder PDF speichern
- Maximale Dateigröße ca. 30 MB

## 3. ChurchTools (für den Ablauf-Import)

| Was | Details |
|---|---|
| ChurchTools | Eigene Instanz (`https://<gemeinde>.church.tools`) mit Modul **Events** und gepflegten **Abläufen** |
| Benutzer | Am besten ein eigener Benutzer nur für ShowCommander |
| Rechte | Dieser Benutzer muss die gewünschten **Events und deren Abläufe sehen** dürfen (Rechte im Modul Events / Dienste bzw. für die betreffenden Kalender) |
| Login-Token | Login-Token dieses Benutzers (in ChurchTools in der Personenansicht bei den Berechtigungen bzw. Login-Einstellungen) |
| Netzwerk | Der Server braucht ausgehenden HTTPS-Zugriff auf deine ChurchTools-Adresse |

Test: In ShowCommander → ⚙︎ Einstellungen → „ChurchTools testen“ muss „Verbunden als …“ anzeigen.

Verwendet werden nur **lesende** Endpunkte (`/api/events`, `/api/events/{id}`, `/api/events/{id}/agenda`, `/api/whoami`). ShowCommander ändert nichts in ChurchTools.

## 4. ProPresenter (optional)

| Was | Details |
|---|---|
| Version | **ProPresenter 7.9 oder neuer** (Mac oder Windows) – erst ab 7.9 gibt es die offizielle Netzwerk-API |
| Netzwerk-API | ProPresenter → Einstellungen → **Netzwerk** → Netzwerk aktivieren, **Port** notieren |
| Erreichbarkeit | Der ShowCommander-Server muss IP und Port des ProPresenter-Rechners erreichen; Firewall des ProPresenter-Rechners muss den Port eingehend erlauben |
| Feste IP | Für den ProPresenter-Rechner feste IP oder DHCP-Reservierung einrichten |
| Stage-Layout | Ein Stage-Layout mit einem **Timer-Element** (Timer „ShowCommander“ auswählen) und einem **Stage-Message-Element** anlegen und dem Bühnenbildschirm zuweisen |

ShowCommander legt den Timer „ShowCommander“ beim ersten Test automatisch an. Danach: ⚙︎ Einstellungen → ProPresenter → „ProPresenter testen“.

**Overlay als Bild in ProPresenter (optional):**
Die Seite `/overlay/<id>` (transparent, 1920×1080) zeigt Restzeit und Jetzt/Danach als Bauchbinde. Um sie als Video-Ebene in ProPresenter zu bekommen, brauchst du einen Weg, eine Webseite als Videoquelle bereitzustellen, z. B.:
- **OBS Studio** mit Browser-Quelle + **NDI-Ausgabe** (Plugin DistroAV, benötigt die **NDI-Runtime**) → in ProPresenter als **NDI-Eingang** (Live Video) einbinden
- oder vMix/Bildmischer mit Browser-Eingang
- oder eine Web-Quelle in ProPresenter, falls deine Version eine anbietet

Für Bühnenmonitore ist der native Weg (Timer + Stage-Message) einfacher und braucht nichts davon.

## 5. Bitfocus Companion (optional)

| Was | Details |
|---|---|
| Companion | **Version 3.4 oder neuer** (inkl. 4.x), auf einem Rechner im selben Netz |
| Modul | Ordner `companion-module-showcommander` aus diesem Paket |
| Zum Einrichten des Moduls einmalig | **Node.js 18+** und Internet auf dem Rechner, auf dem du das Modul vorbereitest (für `npm install`, lädt `@companion-module/base`) |
| Hardware | Stream Deck (beliebiges Modell), Stream Deck+ / XL, oder Companion-Satellite, oder nur die Web-Buttons |
| Netzwerk | Companion-Rechner muss den ShowCommander-Server auf Port 8080 erreichen |
| Wichtig | Wenn Companion das Stream Deck nutzt, muss die **Elgato-Software beendet** sein (beide können das Gerät nicht gleichzeitig verwenden) |

## 6. Stream Deck ohne Companion (optional)

| Was | Details |
|---|---|
| Software | **Elgato Stream Deck** Software (Version 6 oder neuer empfohlen) auf macOS 10.14+ oder Windows 10+ |
| Plugin | Ordner `streamdeck-plugin/de.showcommander.sdPlugin` aus diesem Paket |
| Netzwerk | Der Rechner mit dem Stream Deck muss den ShowCommander-Server erreichen |

## 7. Sicherheit (empfohlen)

- `APP_PASSWORD` in `docker-compose.yml` ändern (schützt Editor, Einstellungen und Steuerung)
- `API_KEY` setzen, wenn Companion/Stream Deck steuern sollen und ein Passwort gesetzt ist – dann im Modul bzw. Plugin eintragen
- Output, Prompter, Overlay und `/view/…` bleiben ohne Passwort lesbar (für Bühnenbildschirme)
- Der ChurchTools-Token bleibt auf dem Server und wird nie an Browser oder Tasten geschickt

---

### Kurz-Check vor dem ersten Gottesdienst

- [ ] Server läuft, `http://<server>:8080` öffnet die Übersicht
- [ ] ChurchTools-Test grün, Event importiert
- [ ] Output auf dem Bühnenmonitor geöffnet (Vollbild)
- [ ] ProPresenter-Test grün, Timer im Stage-Layout sichtbar
- [ ] Companion-Verbindung grün bzw. Stream-Deck-Tasten zeigen „START“ statt „OFFLINE“
- [ ] Einmal Start → Weiter → Pause → Ende durchgespielt
