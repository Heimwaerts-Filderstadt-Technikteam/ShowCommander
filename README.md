# ShowCommander

Selbst gehostete Rundown-App nach Vorbild von Rundown Studio – mit **ChurchTools-Ablauf-Integration**.
Der Ablauf eines Events wird aus ChurchTools geholt, du kannst eigene Punkte dazwischen setzen,
und beim erneuten Synchronisieren bleiben deine Punkte an ihrer Stelle.

Keine npm-Abhängigkeiten – läuft mit reinem Node.js (≥ 20) oder per Docker.

➡ **Alle Voraussetzungen als Checkliste: [VORAUSSETZUNGEN.md](VORAUSSETZUNGEN.md)**

## Funktionen

- **ChurchTools-Import**: Event auswählen → Ablauf mit Abschnitten, Liedern (Titel, Arrangement, Tonart), Verantwortlichen, Dauer und CT-Notizen
- **Eigene Punkte**: zwischen jeden CT-Punkt einfügen (Hover über die Trennlinie → „＋ Punkt / ＋ Abschnitt“), per Drag & Drop verschieben
- **Sync mit Merge**: neue CT-Punkte kommen dazu, geänderte werden aktualisiert, gelöschte verschwinden. Eigene Punkte bleiben hinter dem CT-Punkt, hinter dem sie standen
- **Lokale Änderungen an CT-Punkten** (Titel, Verantwortlich, Info, Dauer) werden als „geändert“ markiert und beim Sync nicht überschrieben – im Detail-Dialog jederzeit zurücksetzbar
- **CT-Punkt entfernen** bleibt dauerhaft entfernt (über „Gelöschte CT-Punkte zurückholen“ wiederherstellbar); „Überspringen“ blendet nur aus
- **Automatische Zeiten**: Startzeiten rechnen sich aus der Dauer, feste Startzeiten (⚑) pro Punkt möglich
- **Live-Showcalling**: Start / Weiter / Zurück / Pause / ±1 min, Restzeit, Über/Unter, erwartetes Ende, erwartete Startzeit jeder kommenden Position, Auto-Weiter pro Punkt, „Folgen“ scrollt mit
- **Nächsten Punkt vormerken**: Klick auf die Nummer; Doppelklick startet den Punkt sofort
- **Eigene Spalten** (z. B. Kamera, Licht, Ton) – Spaltenkopf anklicken zum Umbenennen/Löschen
- **Output-Ansicht** (Bühnenmonitor/Confidence): große Restzeit, aktueller und nächster Punkt, gelb in der letzten Minute, rot bei Überzug. `?mode=up` zählt hoch
- **Prompter**: Prompter-Text pro Punkt, folgt automatisch dem aktuellen Punkt, Spiegeln, Tempo, Schriftgröße
- **Teilen**: `/view/<id>` ist eine schreibgeschützte Live-Ansicht für Team/Band
- **Export**: CSV (Excel-tauglich, Semikolon) und Drucken/PDF
- **Vorlagen**: wiederkehrende eigene Punkte und Technik-Infos automatisch in jeden Ablauf einsortieren
- **Import aus Dateien**: PDF, Word, LibreOffice, Excel, CSV oder Text – mit Vorschau zum Korrigieren
- **Automatisch löschen** nach 14 Tagen (einstellbar, einzelne Abläufe behaltbar)
- **Benutzerkonten mit Rollen** (Nur ansehen, Steuern, Bearbeiten, Admin) und eigener Login-Seite
- **Vor- & Nachbereitung**: Todos mit Rückwärtsrechnung vor dem Event, Vorwärtsrechnung danach, frei festlegbares „Fertig bis“
- **Alle Einstellungen per `.env`**
- **ProPresenter 7.9+**: Restzeit als ProPresenter-Timer und „Jetzt / Danach“ als Stage-Message, dazu ein transparentes Overlay
- **Stream Deck**: eigenes Companion-Modul, natives Stream-Deck-Plugin oder einfache HTTP-Tasten

Tastatur im Editor: `Leertaste` Weiter · `B` Zurück · `P` Pause · `+`/`−` ±1 min
Tastatur im Prompter: `Leertaste` Scrollen an/aus · `↑/↓` Tempo · `+/−` Schrift · `M` Spiegeln · `F` Folgen

## Vorlagen

Vorlagen sind wiederverwendbare Abläufe (Bereich „Vorlagen“ im Dashboard). Sie werden **nie automatisch gelöscht**.

- **Anlegen:** „＋ Neue Vorlage“, oder bei einem Ablauf „Als Vorlage“ bzw. im Editor „Als Vorlage speichern“
- **Neuer Ablauf daraus:** übernimmt alle Punkte, Spalten und Technik-Infos
- **Beim ChurchTools- oder Datei-Import anwenden** (Auswahl im Import-Dialog) bzw. im Editor „Vorlage anwenden“:
  - Punkte mit **CT-Markierung** in der Vorlage sind Platzhalter. Sie werden nicht eingefügt, sondern ihre Notizen, eigenen Spalten, Farbe, Prompter-Text, feste Startzeit und Auto-Weiter werden auf den **gleichnamigen Punkt** im Ablauf übertragen (nur wo noch nichts steht).
  - Alle **anderen Punkte** werden eingefügt – hinter dem Punkt, der in der Vorlage direkt davor steht (Abgleich über den Titel). Ohne Treffer landen sie am Ende, Punkte ganz oben in der Vorlage am Anfang.
  - Mehrfaches Anwenden fügt nichts doppelt ein; eingefügte Punkte bleiben beim ChurchTools-Sync an ihrer Stelle.
- Im Vorlagen-Editor legst du die CT-Markierung pro Punkt im Detail-Dialog (⚙) fest.
- Beim ersten Start wird eine Beispielvorlage „Gottesdienst mit Livestream“ angelegt.

## Automatisch löschen

Abläufe löschen sich standardmäßig **14 Tage nach dem Gottesdienst bzw. nach der letzten Änderung** (je nachdem, was später ist). Das Datum steht auf jeder Karte und im Editor.

- **„📌 behalten“** schützt einen einzelnen Ablauf dauerhaft
- **Vorlagen** und **gerade laufende Shows** werden nie gelöscht
- Tage ändern: ⚙︎ Einstellungen → „Automatisch löschen“ (0 = nie) oder Umgebungsvariable `RETENTION_DAYS`
- Geprüft wird beim Start und danach stündlich

## Import aus Dateien

„⬆ Aus Datei importieren“ im Dashboard (neuer Ablauf) oder „⬆ Importieren“ im Editor (Punkte anhängen).

| Format | Hinweise |
|---|---|
| **PDF** | wird im Browser gelesen (pdf.js ist mitgeliefert, kein Internet nötig). Nur PDFs mit echtem Text – eingescannte PDFs (Bilder) gehen nicht |
| **Word .docx** | Tabellen und Fließtext, Überschriften werden erkannt |
| **LibreOffice .odt** | wie Word |
| **Excel .xlsx** | erstes Tabellenblatt; Uhrzeiten aus Excel werden umgerechnet |
| **CSV** | Trennzeichen `;`, `,` oder Tab wird automatisch erkannt |
| **Text** | Datei (.txt) oder direkt einfügen, z. B. aus einer E-Mail |
| .doc / .xls | alte Formate bitte vorher als .docx/.xlsx oder PDF speichern |

**Was erkannt wird**
- **Tabellen:** Spaltenköpfe wie Zeit/Uhrzeit, Dauer/Länge, Programmpunkt/Titel, Wer/Verantwortlich, Bemerkung/Technik. Ohne Kopfzeile wird anhand des Inhalts geraten. Die Zuordnung lässt sich in der Vorschau pro Spalte ändern.
- **Fließtext:** eine Zeile pro Punkt, z. B. `10:15 Begrüßung (5 min) – Anna` oder `19:20 Lieder 1–3 (12 min) – Band`
- **Abschnitte:** Zeilen in GROSSBUCHSTABEN, Überschriften oder kurze Zeilen mit Doppelpunkt
- **Dauer:** `5`, `5 min`, `5'`, `0:05`, `1 Std`, `90 s` – fehlt sie, wird sie aus dem Abstand der Uhrzeiten berechnet
- **Name, Datum, Startzeit:** aus Überschrift, Datum im Text (`19.10.2026`) und erster Uhrzeit
- Seitenzahlen und wiederholte Tabellenköpfe (mehrseitige PDFs) werden ignoriert

In der **Vorschau** kannst du jeden Punkt an- oder abwählen, zwischen Punkt/Abschnitt umschalten und Titel, Verantwortliche, Dauer und Notizen korrigieren – erst dann wird der Ablauf angelegt. Optional lässt sich dabei direkt eine Vorlage anwenden.

## Starten

### Einstellungen in `.env`

Alle Einstellungen (Port, erster Admin, API-Key, ChurchTools, ProPresenter, Aufbewahrung …) stehen in einer Datei `.env`.
Die Vorlage mit Erklärungen zu jeder Variable ist `.env.example`:

```bash
cp .env.example .env
nano .env
```

Die `.env` wird nicht ins Git-Repo übernommen (steht in `.gitignore`). Sie funktioniert mit Docker und auch beim Start mit `node server.js`.
Werte, die in `.env` gesetzt sind (z. B. `CT_URL`, `PP_HOST`), sind in der App fest und dort nicht änderbar.

### Docker (Linux-Server)

```bash
cp .env.example .env    # anpassen
docker compose up -d --build
```

Nach Änderungen an `.env` reicht `docker compose up -d`. Daten (Abläufe, Benutzer, Einstellungen) liegen in `./data`.

Hinter Nginx Proxy Manager: einfach als Proxy-Host anlegen und in `.env` `TRUST_PROXY=true` setzen. Die Live-Updates laufen per
Server-Sent Events; der Server setzt `X-Accel-Buffering: no`, damit Nginx nicht puffert. Websocket-Support ist nicht nötig.

### Lokal testen

```bash
node server.js
# → http://localhost:8080
```

Ohne ChurchTools ausprobieren: in einem zweiten Terminal `node test/mock-churchtools.js` starten und in den
Einstellungen URL `http://localhost:4010` mit Token `testtoken` eintragen.

### Erster Start

Beim ersten Aufruf gibt es noch keine Benutzer. Entweder

- **in der App:** `http://<server>:8080` öffnen → die Login-Seite zeigt „Admin-Konto anlegen“ (wer zuerst kommt, wird Admin – also gleich nach der Installation erledigen), oder
- **per `.env`:** `ADMIN_USERNAME` und `ADMIN_PASSWORD` setzen – der Admin wird beim Start angelegt, solange es noch keine Benutzer gibt. Danach kannst du das Passwort aus der `.env` wieder löschen.

## ChurchTools einrichten

1. In ChurchTools am besten einen eigenen Benutzer anlegen, der Events und Abläufe lesen darf
2. Dessen **Login-Token** kopieren (in ChurchTools in der Personenansicht des Benutzers bei den Berechtigungen bzw. Login-Einstellungen)
3. In ShowCommander → ⚙︎ Einstellungen: URL (`https://deinegemeinde.church.tools`) und Token eintragen → „Verbindung testen“

Alternativ fest in der `.env` über `CT_URL` und `CT_TOKEN`. Der Token bleibt auf dem Server und wird nie an den Browser geschickt.

Verwendete Endpunkte: `GET /api/events`, `GET /api/events/{id}`, `GET /api/events/{id}/agenda`, `GET /api/whoami`.

## Benutzer & Rollen

Jede Person bekommt ein eigenes Konto (Benutzername + Passwort). Admins legen Konten in der App an: Benutzermenü oben rechts → **Benutzer verwalten**.

| Rolle | Darf |
|---|---|
| **Nur ansehen** | Übersicht und Abläufe inkl. Vorbereitung ansehen |
| **Steuern** | zusätzlich Show bedienen (Start/Weiter/Pause/±Zeit), Vorbereitungs-Todos abhaken, an ProPresenter senden |
| **Bearbeiten** | zusätzlich Abläufe, Vorlagen und Todos anlegen/ändern/löschen, Import aus ChurchTools und Dateien |
| **Admin** | zusätzlich Einstellungen (ChurchTools, ProPresenter, Aufbewahrung) und Benutzerverwaltung |

- Jeder kann unter **Mein Konto** Namen und Passwort ändern; nach einer Passwortänderung werden andere Geräte abgemeldet.
- Admins können Passwörter neu setzen, Konten sperren oder löschen. Rollenänderungen und Sperren wirken sofort.
- Es bleibt immer mindestens ein aktiver Admin.
- Passwörter werden mit scrypt gehasht in `data/users.json` gespeichert. Nach 10 Fehlversuchen von einer IP ist die Anmeldung 15 Minuten gesperrt.
- **Ohne Anmeldung erreichbar** (für Bühnenmonitore): `/output/…`, `/prompter/…`, `/overlay/…` und die geteilte Ansicht `/view/…`.
- **Companion / Stream Deck** melden sich mit dem `API_KEY` aus der `.env` an; dessen Rechte legt `API_KEY_ROLE` fest (Standard: Bearbeiten).
- `AUTH_ENABLED=false` schaltet die Anmeldung ganz ab – nur in einem abgeschotteten Netz verwenden.

## Vor- & Nachbereitung (Todos)

Zwei getrennte Blöcke im Editor: **Vorbereitung** steht über dem Ablauf (Aufbau, Soundcheck, Stream-Test …), **Nachbereitung** darunter (Stream beenden, Abbau, Video hochladen …). Jeder Block hat eigenen Puffer, lässt sich einzeln ein- und ausklappen und hat ein eigenes „Häkchen zurücksetzen“.

**Vorbereitung** – rückwärts vom Show-Start
- Pro Aufgabe **Dauer** und optional **Wer** eintragen. ShowCommander rechnet aus, wann jede Aufgabe **spätestens beginnen** muss und bis wann sie **fertig** sein muss.
- Die Reihenfolge ist die Arbeitsreihenfolge – die letzte Aufgabe muss zum Start (minus **Puffer**) fertig sein.
- Oben steht, wann die Vorbereitung insgesamt spätestens beginnen muss.

**Nachbereitung** – vorwärts ab Show-Ende
- Startet am Ende des Events plus **Puffer**. Das Ende ergibt sich automatisch aus dem Ablauf – oder du trägst es oben neben „Start“ im Feld **Ende** selbst ein (leer bzw. ↺ = wieder automatisch). Schiebst du das Ende nach hinten oder ziehst es vor, wandert die ganze Nachbereitung mit.
- Läuft die Show länger als geplant, verschieben sich die Zeiten ebenfalls automatisch.
- Angezeigt werden „Beginn ab“, „Fertig bis“ und wann alles erledigt ist.

**„Fertig bis“ selbst festlegen**
- In der Spalte *Fertig bis* einfach eine Uhrzeit eintippen (z. B. `9:00`). Die Aufgabe wird dann an diesem Termin ausgerichtet und **die übrigen Aufgaben rechnen von dort aus weiter** (davor liegende rutschen entsprechend früher).
- Fest eingetragene Zeiten sind blau markiert. **↺** oder Feld leeren = wieder automatisch berechnen.
- Uhrzeiten vor dem Event, die nach dem Start lägen, gelten als **Vortag** (z. B. Aufbau Samstag 18:00); Zeiten nach dem Event, die vor dem Show-Ende lägen, als **Folgetag**.
- Passt ein fester Termin nicht in die Kette (z. B. Soundcheck fertig erst, wenn der Stream-Test schon laufen müsste), erscheint **⚠ passt nicht in die Kette**.
- Feste Termine werden relativ zum Start gespeichert und wandern deshalb in Vorlagen mit.

**Allgemein**
- **⇉ parallel:** läuft gleichzeitig mit der vorherigen Aufgabe (gleiche Fertig-Zeit vor dem Event bzw. gleicher Beginn danach).
- **↑ / ↓** oder Drag & Drop verschiebt Aufgaben zwischen Vor- und Nachbereitung.
- Status: geplant · *jetzt beginnen* · *läuft jetzt* · *überfällig* · erledigt.
- Abhaken darf schon die Rolle *Steuern*; gespeichert wird, wer wann abgehakt hat. Die Dashboard-Karte zeigt den Stand.
- Todos werden in **Vorlagen** übernommen, beim Anwenden einer Vorlage ergänzt und beim Kopieren eines Ablaufs zurückgesetzt.

## ProPresenter

Ab **ProPresenter 7.9** (offizielle Netzwerk-API). Einrichtung in ShowCommander → ⚙︎ Einstellungen → ProPresenter.

Bei jedem Steuerbefehl (Start, Weiter, Pause, ±Zeit, Ende, Auto-Weiter) schickt der Server an ProPresenter:

- **Timer „ShowCommander“** (Name änderbar): wird auf die Restzeit des aktuellen Punkts gesetzt und gestartet bzw. bei Pause angehalten. Überzieht ein Punkt, zählt ProPresenter ins Minus weiter. Der Timer wird beim ersten Test automatisch angelegt.
- **Stage-Message** mit frei wählbarem Text, Platzhalter: `{current}` `{who}` `{info}` `{next}` `{nextWho}` `{end}` `{number}` `{rundown}`
- Bei Show-Ende: Timer auf 0 und Stage-Message löschen (abschaltbar)

In ProPresenter dann ein **Stage-Layout** mit Timer-Element („ShowCommander“) und Stage-Message-Element anlegen und dem Bühnenbildschirm zuweisen. Den Timer kannst du auch als Timer-Token auf eine normale Folie legen.

Der Button **„→ ProPresenter“** im Editor schickt den aktuellen Stand sofort neu (z. B. nachdem ProPresenter neu gestartet wurde).

Ohne ProPresenter testen: `node test/mock-propresenter.js` (Port 1025) und als Host `127.0.0.1` eintragen.

### Overlay als Video-Ebene

`/overlay/<id>` ist eine transparente 1920×1080-Seite für NDI/OBS/vMix oder Web-Quellen:

| Parameter | Werte |
|---|---|
| `layout` | `lower` (Bauchbinde mit Restzeit, Standard), `timer` (große Restzeit mittig), `corner` (kleine Restzeit oben rechts) |
| `bg` | `transparent` (Standard), `black`, `green` (Chroma-Key) |
| `scale` | z. B. `1.5` |
| `title` | `0` blendet beim Layout `timer` den Titel aus |

Beispiel: `http://server:8080/overlay/active?layout=corner&bg=green`

Weg nach ProPresenter z. B.: OBS-Browserquelle → NDI-Ausgabe (DistroAV) → in ProPresenter als NDI-Eingang.

## Stream Deck & Companion

Drei Wege – je nachdem, was bei euch läuft:

### A) Companion-Modul (empfohlen, wenn ihr Companion nutzt)

Ordner `companion-module-showcommander/`. Bringt Aktionen, Variablen, Feedbacks und fertige **Presets** mit (GO mit Restzeit, Pause, ±Zeit, Ende, Restzeit-/Jetzt-/Danach-Anzeigen, Punkt 1–32 mit Titel auf der Taste, rot = aktuell).

Installation als Entwickler-Modul:

1. Ordner `companion-module-showcommander` auf den Companion-Rechner kopieren, z. B. nach `~/companion-modules/companion-module-showcommander`
2. Darin einmalig `npm install` ausführen (braucht Node.js 18+ und Internet)
3. Im **Companion-Launcher** (Zahnrad / erweiterte Einstellungen) den **„Developer modules path“** auf den Ordner `~/companion-modules` setzen und Companion neu starten
4. In Companion → Connections → „ShowCommander“ hinzufügen, Server-IP, Port `8080`, Ablauf `active` (und ggf. API-Key) eintragen
5. Presets → ShowCommander auf die Tasten ziehen

Alternativ lässt sich mit `npm run package` ein Modul-Paket (`.tgz`) bauen, das neuere Companion-Versionen über die Modulverwaltung importieren können.

Variablen u. a.: `$(showcommander:remaining)`, `current_title`, `current_who`, `next_title`, `over_under`, `projected_end`, `status_text`, `cue_N_title`.

### B) Stream-Deck-Plugin (ohne Companion, mit der Elgato-Software)

Ordner `streamdeck-plugin/de.showcommander.sdPlugin` kopieren nach

- **macOS:** `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
- **Windows:** `%APPDATA%\Elgato\StreamDeck\Plugins\`

Stream-Deck-Software beenden und neu starten. Unter „ShowCommander“ erscheinen die Aktionen:

| Aktion | Taste zeigt | Drücken |
|---|---|---|
| GO (Start / Weiter) | START bzw. Restzeit + nächster Punkt, gelb < 1 min, rot überzogen | Start / Weiter |
| Zurück | – | vorheriger Punkt |
| Pause / Weiter | Pausenstatus | umschalten |
| Zeit ± anpassen | z. B. +1:00 (Sekunden einstellbar) | verlängern/kürzen |
| Punkt starten | Nummer + Titel, rot wenn aktuell | Punkt sofort starten |
| Anzeige | Restzeit, Jetzt, Danach, Über/Unter, Ende oder Uhrzeit | bei „Danach“: Weiter |
| Show beenden | – | **lang drücken** (0,7 s), kurz = Warnsymbol |

In irgendeiner ShowCommander-Taste die Verbindung eintragen (Server z. B. `192.168.1.20:8080`, Ablauf `active`) – sie gilt für alle Tasten.

### C) Einfache HTTP-Tasten

Für Companion „Generic HTTP“ oder Stream-Deck-Plugins wie „API Ninja“. Die Adressen zeigt der Button **„Stream Deck“** im Editor. `active` steht für den zuletzt gesteuerten Ablauf.

| Aktion | Request |
|---|---|
| Start | `POST http://server:8080/api/rundowns/active/control/start` |
| Weiter | `POST …/control/next` |
| Zurück | `POST …/control/prev` |
| Pause/Weiter | `POST …/control/toggle` |
| +1 min / −1 min | `POST …/control/adjust?arg=60` bzw. `?arg=-60` |
| Ende | `POST …/control/end` |
| Punkt 3 starten | `POST …/control/goto?arg=3` (Nummer wie im Editor oder Item-ID) |
| Punkt 3 vormerken | `POST …/control/arm?arg=3` |
| ChurchTools-Sync | `POST …/sync` |
| An ProPresenter senden | `POST …/pp-push` |

Bei aktiver Anmeldung den `API_KEY` aus der `.env` als `?key=DEIN_KEY` anhängen oder als Header `X-API-Key` setzen. GET funktioniert für die Steuerbefehle ebenfalls.
Status: `GET /api/rundowns/active/state` (Restzeit, Jetzt, Danach, Über/Unter, Punktliste …).

## Live-Daten für eigene Tools

`GET /api/rundowns/<id>/events` ist ein Server-Sent-Events-Stream (`type: "rundown"` bei Änderungen,
`type: "live"` bei Steuerbefehlen). Damit lässt sich z. B. CueGFX anbinden, um Bauchbinden automatisch zu füllen.

## Datenmodell (kurz)

Jeder Punkt hat `source` (`ct` oder `custom`), bei CT-Punkten die `ctId`, außerdem `title`, `who`, `info`,
`duration` (Sekunden), `notes`, `script` (Prompter), `color`, `skip`, `hardStart` (`HH:MM`), `autoNext`, `cells` (eigene Spalten)
und `overrides` (lokal geänderte CT-Felder).

## Drittanbieter

`public/vendor/pdfjs/` enthält **pdf.js 3.11.174** von Mozilla (Apache License 2.0, siehe `public/vendor/pdfjs/LICENSE`) für den PDF-Import im Browser.
