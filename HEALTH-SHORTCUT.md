# Kurzbefehl „Lebensapp-Health“

Der Kurzbefehl liest die Daten des **Vortags** aus Apple Health und legt sie als `health/JJJJ-MM-TT.json` in deinem privaten Daten-Repo ab. Die App liest die Datei beim nächsten Öffnen.

| Wert | Zeitraum |
|---|---|
| Schritte | Summe des Vortags |
| Gewicht | letzte Messung am Vortag (z. B. Withings-Waage) |
| Schlaf | die Nacht, die am Morgen des Vortags endet, mit Tief-, REM- und Kernschlaf |
| Ruhepuls, HRV | vom Vortag (z. B. vom Oura Ring oder der Watch) |

Workouts sind (noch) nicht dabei: Der eingebaute Kurzbefehl kann den Workout-Typ nicht zuverlässig auslesen. Training trägst du weiter mit einem Tap in der App ein.

---

## 1. Kurzbefehl hinzufügen (2 Minuten)

1. Auf dem **iPhone in Safari** diese Datei öffnen:
   **https://marcobalzano222-hub.github.io/lebensapp/shortcuts/Lebensapp-Health.shortcut**
   (oder in der App: **Setup → Apple Health → „Kurzbefehl laden“**)
2. Die Kurzbefehle-App öffnet sich → **Kurzbefehl hinzufügen**.
3. Es kommen zwei Fragen:
   - **Token:** deinen Fine-grained Token (`github_pat_…`) einfügen.
   - **Daten-Repo:** so lassen (`marcobalzano222-hub/lebensapp-data-satoshi`). Andere Personen tragen ihr eigenes Repo ein.

## 2. Einmal testen

1. In der Kurzbefehle-App auf **Lebensapp-Health** (mit Herz-Symbol) tippen.
2. iOS fragt nach Zugriff auf Health → **alle Kategorien erlauben**.
   Bei der Frage, ob Daten an `api.github.com` gesendet werden dürfen → **Immer erlauben**.
3. Lebensapp öffnen → **Setup → Apple Health**: Dort steht jetzt „Letzte Health-Daten: …“ mit dem gestrigen Datum.

Danach unter **Setup → Apple Health** auf **„Kurzbefehl ist installiert“** tippen. Fehlen die Daten von gestern, zeigt der Reiter **Heute** dann oben einen Knopf **„♥ Apple-Health-Daten von gestern holen“**.

## 3. Automatisch jeden Morgen (optional)

1. Kurzbefehle → **Automation** → **+**.
2. **Tageszeit** → `09:00` · *Täglich* → **Sofort ausführen**, *Bei Ausführung benachrichtigen* aus.
3. **Weiter** → **Lebensapp-Health** auswählen.

> iOS gibt Health-Daten nur heraus, wenn das iPhone entsperrt ist. Läuft die Automation bei gesperrtem Handy, kommen keine Daten an. Dafür gibt es den Knopf im Reiter Heute.

## 4. Gewicht aus Health verwenden

**Setup → Kennzahlen → Gewicht → Quelle: Apple Health.** Dann verschwindet das Gewicht aus dem Reiter Heute und kommt nur noch von der Waage.

---

## Wenn etwas nicht klappt

Schick einen Screenshot der Fehlermeldung (ohne Token). Häufige Ursachen:

| Problem | Lösung |
|---|---|
| Rote/leere Aktion nach dem Import | Die Aktion antippen und den Health-Typ (z. B. *Gewicht*) aus der Liste wählen. |
| Keine Daten in der App | Token oder Repo-Name falsch. Im Kurzbefehl das erste bzw. zweite Textfeld prüfen. |
| Schritte weichen stark von der Health-App ab | iPhone und Watch zählen doppelt. Bitte melden, dann wird die Summe angepasst. |

---

## Technisches

- Die Datei wird aus [`tools/build_health_shortcut.py`](tools/build_health_shortcut.py) erzeugt und auf einem Mac mit `shortcuts sign --mode anyone` signiert. Token und Repo sind nicht enthalten; sie werden beim Hinzufügen abgefragt.
- Format von `health/JJJJ-MM-TT.json` (alle Werte als Text, eine Zeile pro Messung):

```json
{
  "date": "2026-10-01",
  "source": "shortcut",
  "steps": "2026-10-01T00:00:00+02:00|8423",
  "weight": "2026-10-01T07:12:00+02:00|82,1",
  "sleep": "Kern|2026-09-30T23:30:00+02:00|2026-10-01T02:00:00+02:00|Oura\nREM|…",
  "restingHr": "2026-10-01T03:12:00+02:00|52|Oura",
  "hrv": "2026-10-01T03:12:00+02:00|48|Oura",
  "debug": "tag=… schrittSamples=… schlafSamples=…"
}
```

Zusätzlich liefert der Kurzbefehl alle Schritt-Einzelwerte als Spalten `stepsStart`, `stepsEnd`, `stepsValue`, `stepsSource` (eine Zeile pro Messung). Die Tagesgruppierung von iOS addiert nämlich alle Quellen (iPhone, Watch, Ring); die App rechnet Überschneidungen heraus wie die Health-App (Watch vor iPhone vor anderen Apps).

iOS filtert „Startdatum ist zwischen“ nur tageweise. Deshalb liefert der Kurzbefehl Zeitstempel mit, und die App wählt selbst aus: Schritte des Tages (ohne Doppelzählung), die letzte Gewichtsmessung des Tages und die Schlafphasen, die zwischen 18:00 am Vortag und 12:00 beginnen. „Im Bett“ und „Wach“ zählen nicht als Schlaf; Überschneidungen werden nicht doppelt gezählt. `debug` enthält Zeitfenster und Anzahl gefundener Messungen zur Fehlersuche. Optional versteht die App auch `workouts` als Zeilen `Typ|Start|Minuten`.
