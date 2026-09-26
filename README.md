# Lebensapp

Minimalistische Web-App (PWA) zum Erfassen von Gewohnheiten und Gesundheitsdaten – zwei kurze Check-ins am Tag, zusammen unter 30 Sekunden.

- **App:** https://marcobalzano222-hub.github.io/lebensapp/
- **Daten:** liegen *nicht* hier, sondern in einem eigenen, privaten Repo pro Person (`config.json`, `days/JJJJ-MM-TT.json`).
- **Kein Backend, kein Konto:** Die App spricht direkt mit der GitHub-API. Der Zugangs-Token bleibt nur auf deinem Gerät.

---

## Einrichtung für eine neue Person

Du brauchst ein GitHub-Konto. Alles Weitere dauert etwa 5 Minuten.

### 1. Privates Daten-Repo anlegen

1. Auf GitHub oben rechts **+ → New repository**.
2. Name, z. B. `lebensapp-data-deinname`.
3. **Private** auswählen (wichtig – es geht um Gesundheitsdaten).
4. **Create repository**. Das Repo darf leer bleiben.

### 2. Fine-grained Token anlegen

1. GitHub → Profilbild → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   (direkt: https://github.com/settings/personal-access-tokens/new)
2. **Token name:** z. B. `Lebensapp iPhone`
3. **Expiration:** ein Ablaufdatum wählen (z. B. 1 Jahr). Danach einfach einen neuen Token anlegen und in der App eintragen.
4. **Repository access:** **Only select repositories** → nur dein Daten-Repo auswählen.
5. **Permissions → Repository permissions → Contents:** **Read and write**.
   (*Metadata: Read-only* wird automatisch gesetzt. Sonst nichts ändern.)
6. **Generate token** und den Token (`github_pat_…`) kopieren. Er wird nur einmal angezeigt.

> Der Token kann nur dein eigenes Daten-Repo lesen und schreiben – nicht die Daten anderer Personen.

### 3. App öffnen und verbinden

1. Auf dem iPhone in **Safari** die App-URL öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**. Ab jetzt die App über das Icon starten.
3. GitHub-Benutzername, Name des Daten-Repos und Token eingeben → **Verbindung testen**.
4. Ist das Repo leer, legt die App eine Standardkonfiguration an und öffnet **Setup**. Dort Gewohnheiten, Kennzahlen, Training, Ziele, Mahlzeiten, Tagesablauf und Pause-Modi anpassen. Jede Änderung wird automatisch gespeichert.

Mehrere Personen nutzen dieselbe App-URL – jede mit eigenem Repo und eigenem Token.

---

## Bedienung

| Reiter | Inhalt |
|---|---|
| **Heute** | Morgen- bzw. Abend-Check-in (wechselt automatisch nach Tageszeit). Wischen nach rechts = Vortag, nach links = zurück Richtung heute; Tap auf das Datum = heute. |
| **Woche** | Wochenziele Training, Gewohnheiten-Raster, Wochenschnitt mit kleinen 8-Wochen-Verläufen. Wischen = andere Wochen. |
| **Setup** | Alles aus `config.json`. |
| **Sync** | Verbindungsstatus, „Jetzt synchronisieren“, Export (JSON/CSV) über das Teilen-Menü, Token entfernen. |

- **Kachel antippen** = erledigt, nochmal = zurück. **Lange drücken** = ausdrücklich „nicht gemacht“.
- **Blutdruck und Gewicht** sind mit dem letzten Wert vorbelegt (grau). „Übernehmen“ oder mit −/+ korrigieren; Tap auf die Zahl öffnet den Ziffernblock.
- **Nach Mitternacht:** Einträge bis zum Ende des Abendfensters (Standard 05:59) zählen zum Vortag.
- **Pause** (z. B. krank, Reise): Der Tag zählt nicht in Durchschnitte und Wochenziele. Eingaben bleiben möglich.
- **Sync-Punkt oben rechts:** grün = synchron, gelb = ausstehend/offline, rot = Fehler (Details im Reiter Sync).

Offline eingegebene Daten werden lokal gespeichert und automatisch übertragen, sobald wieder Netz da ist.
Löscht Safari den lokalen Speicher, startet die App im Onboarding. Nach erneuter Token-Eingabe sind alle synchronisierten Daten wieder da.

---

## Datenformat

```
lebensapp-data-<name>/
├── config.json            Einstellungen (Setup-Reiter)
└── days/2026-10-01.json   manuelle Eingaben, eine Datei pro Tag
```

- Nicht erfasste Werte fehlen in der Datei; `false` heißt „nicht gemacht“.
- `refersTo: "previousDay"` (z. B. „Kein Handy vorm Schlafen“) wird morgens eingegeben, aber in der Datei des Vortags gespeichert.
- Mahlzeiten speichern zusätzlich `mealsSnapshot` mit den Makros zum Zeitpunkt der Eingabe.
- Deaktivieren im Setup löscht nichts (`active: false`); IDs bleiben beim Umbenennen stabil.

**CSV-Export** (Long-Format): `date, source, category, key, value, pause`

| category | key | value |
|---|---|---|
| `habit` | Gewohnheits-ID | `true` / `false` |
| `metric` | z. B. `weight`, `body`, `bp_sys`, `bp_dia`, `bp_pulse` | Zahl |
| `training` | Trainings-ID (eine Zeile pro Einheit) | Minuten oder leer |
| `meal` | Mahlzeiten-ID | Anzahl |
| `nutrition` | `kcal`, `protein`, `carbs` | Tagessumme |
| `day` | `pause` | Pause-Modus |

---

## Entwicklung

Vanilla HTML/CSS/JS, kein Build-Schritt.

```bash
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen. Auf `localhost` ist der Service Worker abgeschaltet, damit Änderungen sofort sichtbar sind (erzwingen mit `?sw=1`).

**Release:** Änderungen nach `main` pushen und in `sw.js` die `CACHE_VERSION` erhöhen, sonst sehen installierte Apps das Update nicht.

## Bewusst nicht in V1

Health-Kurzbefehl (V1.1), Spieler-Level (V1.2), Benachrichtigungen, Statistiken/Korrelationen in der App, Journal/Freitext, Streaks, Konten/Backend.
