## ShowCommander

Steuert einen ShowCommander-Server (Rundown mit ChurchTools-Integration).

**Konfiguration**
- **Server / Port**: Adresse des ShowCommander-Servers, z. B. `192.168.1.20` und `8080`
- **Ablauf-ID**: `active` = immer der zuletzt gesteuerte Ablauf. Alternativ die ID aus der Editor-URL `/edit/<ID>`
- **API-Key**: der `API_KEY` aus der `.env` des Servers (nötig, sobald dort Benutzerkonten aktiv sind). Seine Rechte legt `API_KEY_ROLE` fest – für alle Aktionen mindestens `editor`, für reines Showcalling reicht `operator`

**Presets**
- *Steuerung*: GO mit Restzeit, Zurück, Pause, ±30 s, ±1 min, Ende, ChurchTools-Sync, An ProPresenter senden
- *Anzeige*: Restzeit, Jetzt, Danach, Über/Unter, erwartetes Ende, Status
- *Punkte*: Punkt 1–32 direkt starten, mit Titel auf der Taste und Rot = aktuell

**Variablen** (Auswahl): `remaining`, `remaining_s`, `current_title`, `current_who`, `next_title`, `over_under`, `projected_end`, `status_text`, `cue_N_title`

**Feedbacks**: Status, Restzeit unter X s, überzogen, Show zu spät/früh, Punkt X aktuell/als Nächstes, offline
