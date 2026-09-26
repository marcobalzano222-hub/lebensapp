# Kurzbefehl „Lebensapp Health“

Der Kurzbefehl läuft jeden Morgen automatisch. Er liest die Daten des **Vortags** aus Apple Health und legt sie als `health/JJJJ-MM-TT.json` in deinem privaten Daten-Repo ab. Die App liest diese Datei beim nächsten Öffnen.

| Wert | Zeitraum |
|---|---|
| Schritte | Summe des Vortags |
| Gewicht | letzte Messung am Vortag (z. B. Withings-Waage) |
| Schlaf | die Nacht, die am Morgen des Vortags endet (18:00 davor bis 12:00) |
| Workouts | alle Workouts, die am Vortag begonnen haben (Typ und Minuten) |

**Was die App daraus macht:**
- Workouts werden nach Typ zugeordnet: Krafttraining → Kraft, HIIT → HIT, Gehen/Laufen/Radfahren usw. → Zone 2. Ändern kannst du das unter **Setup → Apple Health**.
- Gibt es für einen Tag Health-Workouts einer Art (z. B. Kraft), zählen nur diese. Manuelle Einträge derselben Art werden dann durchgestrichen angezeigt und nicht gezählt. Arten ohne Health-Daten (z. B. Sauna) trägst du weiter manuell ein.
- Stellst du im Setup unter **Kennzahlen → Gewicht** die Quelle auf **Apple Health**, verschwindet das Gewicht aus dem Morgen-Check-in.
- Schritte und Schlaf erscheinen im Reiter **Woche**.

---

## Vorbereitung

- Du brauchst den **Fine-grained Token** für dein Daten-Repo. Das kann derselbe sein wie in der App. Hast du ihn nicht mehr, leg einen neuen mit denselben Einstellungen an (siehe README).
- Den Kurzbefehl baust du auf dem iPhone in der App **Kurzbefehle**. Plane dafür etwa 20 Minuten ein.

> **Tipp zum Bauen:** Aktionen findest du über die Suchleiste unten („Aktion suchen“). Variablen fügst du ein, indem du in ein Feld tippst und oben über der Tastatur die gewünschte Variable wählst. Tippst du auf eine eingefügte Variable, kannst du eine **Eigenschaft** (z. B. „Startdatum“) und beim Datum das **Format** wählen.

---

## Teil 1: Kurzbefehl anlegen

Kurzbefehle → **+** (oben rechts) → Name oben antippen → **Lebensapp Health**.
Dann die folgenden Aktionen **in dieser Reihenfolge** hinzufügen.

### A. Token und Datum

1. **Text** → deinen Token (`github_pat_…`) einfügen.
2. **Variable festlegen** → Name: `Token`, Eingabe: *Text*.
3. **Datum** → *Aktuelles Datum*.
4. **Datum anpassen** → *Subtrahieren* · `1` · *Tage* · von *Datum*.
5. **Datum anpassen** → *Anfang von Tag* · von *Angepasstes Datum* (aus Schritt 4).
6. **Variable festlegen** → Name: `Tag`.
7. **Datum anpassen** → *Hinzufügen* · `1` · *Tage* · zu `Tag`.
   **Variable festlegen** → Name: `TagEnde`.
8. **Datum anpassen** → *Subtrahieren* · `6` · *Stunden* · von `Tag`.
   **Variable festlegen** → Name: `SchlafStart`.
9. **Datum anpassen** → *Hinzufügen* · `12` · *Stunden* · zu `Tag`.
   **Variable festlegen** → Name: `SchlafEnde`.
10. **Datum formatieren** → `Tag` · Datumsformat *Eigene* → `yyyy-MM-dd` · Zeitformat *Ohne*.
    **Variable festlegen** → Name: `Datum`.

### B. Schritte

11. **Health-Samples suchen** (engl. *Find Health Samples*)
    - Typ: *Schritte*
    - Filter: *Startdatum* · *liegt zwischen* · `Tag` und `TagEnde`
    - Falls vorhanden: *Gruppieren nach* → *Tag* (verhindert doppelte Zählung von iPhone und Watch)
12. **Statistik berechnen** → *Summe* von *Health-Samples*.
    **Variable festlegen** → Name: `Schritte`.

### C. Gewicht

13. **Health-Samples suchen**
    - Typ: *Gewicht*
    - Filter: *Startdatum* · *liegt zwischen* · `Tag` und `TagEnde`
    - Sortieren nach: *Startdatum* · Reihenfolge: *Neueste zuerst* · Begrenzen: *an*, `1`
14. **Details von Health-Samples abrufen** → *Wert*.
    **Variable festlegen** → Name: `Gewicht`.

### D. Schlaf

15. **Health-Samples suchen**
    - Typ: *Schlafanalyse*
    - Filter: *Startdatum* · *liegt zwischen* · `SchlafStart` und `SchlafEnde`
16. **Wiederholen mit jedem** → *Health-Samples*.
    Innerhalb der Wiederholung eine Aktion **Text** mit genau diesem Aufbau (senkrechte Striche `|` dazwischen):
    `[Wiederholungsobjekt → Wert]|[Wiederholungsobjekt → Startdatum]|[Wiederholungsobjekt → Enddatum]`
    - Bei **Startdatum** und **Enddatum** jeweils auf die Variable tippen → Datumsformat **ISO 8601** und *Uhrzeit einbeziehen* einschalten.
17. Nach *Ende der Wiederholung*: **Text kombinieren** → *Wiederholungsergebnisse* · Trennzeichen *Neue Zeile*.
    **Variable festlegen** → Name: `Schlaf`.

### E. Workouts

18. **Workouts suchen** (engl. *Find Workouts*)
    - Filter: *Startdatum* · *liegt zwischen* · `Tag` und `TagEnde`
19. **Wiederholen mit jedem** → *Workouts*. Innerhalb der Wiederholung:
    - **Zeit zwischen Datumsangaben abrufen** (engl. *Get Time Between Dates*) → von *Wiederholungsobjekt → Startdatum* bis *Wiederholungsobjekt → Enddatum* · in *Minuten*
    - **Text**: `[Wiederholungsobjekt → Typ]|[Wiederholungsobjekt → Startdatum]|[Zeit zwischen Datumsangaben]`
      (Startdatum wieder im Format **ISO 8601**.)
20. Nach *Ende der Wiederholung*: **Text kombinieren** → *Wiederholungsergebnisse* · *Neue Zeile*.
    **Variable festlegen** → Name: `Workouts`.

### F. Datei bauen

21. **Wörterbuch** mit diesen Einträgen, alle vom Typ **Text**:

    | Schlüssel | Wert |
    |---|---|
    | `date` | `Datum` |
    | `source` | `shortcut` |
    | `steps` | `Schritte` |
    | `weight` | `Gewicht` |
    | `sleep` | `Schlaf` |
    | `workouts` | `Workouts` |

22. **Base64-Kodierung** → *Kodieren* · Eingabe: *Wörterbuch* · Zeilenumbrüche: **Keine**.
    **Variable festlegen** → Name: `Inhalt`.

### G. Nach GitHub schreiben

23. **Inhalte von URL abrufen**
    - URL: `https://api.github.com/repos/marcobalzano222-hub/lebensapp-data-satoshi/contents/health/[Datum].json`
      (Benutzername und Repo anpassen, falls es nicht deins ist; `[Datum]` ist die Variable.)
    - Methode: *GET*
    - Header: `Authorization` = `Bearer [Token]` und `Accept` = `application/vnd.github+json`
24. **Wörterbuchwert abrufen** → Schlüssel `sha` in *Inhalte der URL*.
    **Variable festlegen** → Name: `SHA`.
25. **Wenn** → `SHA` · *hat einen beliebigen Wert*
    - **Inhalte von URL abrufen**: dieselbe URL und dieselben Header wie in Schritt 23 · Methode **PUT** · Hauptteil der Anfrage: **JSON** mit drei Text-Feldern:
      `message` = `health: [Datum]` · `content` = `Inhalt` · `sha` = `SHA`
    - **Sonst**
    - **Inhalte von URL abrufen**: genauso, aber **ohne** das Feld `sha`.
    - **Ende Wenn**

Fertig. Oben auf **Fertig** tippen.

---

## Teil 2: Einmal von Hand testen

1. Den Kurzbefehl antippen.
2. Beim ersten Mal fragt iOS nach Zugriff auf Health → **alles erlauben**. Bei der Frage, ob Daten an `api.github.com` gesendet werden dürfen → **Immer erlauben**.
3. In der Lebensapp **Setup → Apple Health** öffnen (App vorher einmal schließen und neu öffnen). Dort sollte „Letzte Health-Daten: …“ mit dem gestrigen Datum stehen.

Mehrmals am Tag ausführen ist kein Problem: Die Datei wird dann einfach überschrieben.

## Teil 3: Automatisch jeden Morgen

1. Kurzbefehle → unten **Automation** → **+** (bzw. *Neue Automation*).
2. **Tageszeit** → `09:00` · *Täglich*.
3. **Sofort ausführen** wählen (und *Bei Ausführung benachrichtigen* ausschalten).
4. **Weiter** → Kurzbefehl **Lebensapp Health** auswählen.

> **Hinweis:** iOS gibt Health-Daten nur heraus, wenn das iPhone seit dem Einschalten mindestens einmal entsperrt wurde. Kommen morgens keine Daten an, stell die Uhrzeit auf einen Moment, an dem du das Handy sicher schon benutzt hast, oder starte den Kurzbefehl zusätzlich von Hand.

---

## Fehlersuche

| Problem | Lösung |
|---|---|
| Kein Datum unter „Letzte Health-Daten“ | Kurzbefehl von Hand starten und das Ergebnis der letzten Aktion ansehen. `Bad credentials` = Token falsch. `Not Found` = URL (Benutzername/Repo) falsch oder der Token hat keinen Zugriff. |
| `Invalid request` / `sha` | In Schritt 25 fehlt die Wenn/Sonst-Aufteilung, oder im Sonst-Zweig ist doch ein `sha`-Feld. |
| Schlaf fehlt | Bei Start-/Enddatum ist nicht **ISO 8601** eingestellt. |
| Workout zählt falsch | In der App unter **Setup → Apple Health** den Workout-Typ zuordnen oder auf *Ignorieren* stellen. |

**Format der Datei**, falls du selbst prüfen möchtest (`health/2026-10-01.json` im Daten-Repo):

```json
{
  "date": "2026-10-01",
  "source": "shortcut",
  "steps": "8423",
  "weight": "82,1",
  "sleep": "Kern|2026-09-30T23:30:00+02:00|2026-10-01T02:00:00+02:00\nREM|…",
  "workouts": "Traditionelles Krafttraining|2026-10-01T18:30:00+02:00|55"
}
```
