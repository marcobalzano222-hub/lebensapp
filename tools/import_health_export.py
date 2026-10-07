#!/usr/bin/env python3
"""
Apple-Health-Export (export.xml) → kompakte Tageswerte für die Lebensapp.

    python3 tools/import_health_export.py <export.xml> <ausgabe.json> [Quelle1,Quelle2,…]

Die Ausgabe gehört ins private Daten-Repo als history/daily.json. Pro Tag (nur vorhandene Werte):
  steps, sleepMin, deepMin, remMin, coreMin, awakeMin, bed, wake ("HH:MM"), weight, bpSys, bpDia,
  hrv, restingHr, exerciseMin (Apple-Trainingsminuten), workouts [[Typ, Minuten], …]
Regeln wie in der App: Schlaf = Nacht, die am Morgen des Tages endet (Beginn 18:00 Vortag bis 12:00),
nur die oberste Quelle zählt; Schritte/Trainingsminuten = Quelle mit der höchsten Tagessumme.
"""
import collections, json, re, sys
from datetime import datetime, timedelta

ATTR = re.compile(r'(\w+)="([^"]*)"')
WANT = {
    'HKQuantityTypeIdentifierStepCount': 'steps',
    'HKQuantityTypeIdentifierAppleExerciseTime': 'exercise',
    'HKQuantityTypeIdentifierBodyMass': 'weight',
    'HKQuantityTypeIdentifierBloodPressureSystolic': 'sys',
    'HKQuantityTypeIdentifierBloodPressureDiastolic': 'dia',
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': 'hrv',
    'HKQuantityTypeIdentifierRestingHeartRate': 'rhr',
    'HKCategoryTypeIdentifierSleepAnalysis': 'sleep',
}


def parse_time(s):
    # "2026-10-06 23:12:45 +0200" → lokale Uhrzeit des Geräts (ohne Zeitzone)
    return datetime.strptime(s[:19], '%Y-%m-%d %H:%M:%S')


def main(src, out, order):
    def rank(s):
        if s in order:
            return order.index(s)
        return len(order) + (0 if re.search('watch', s, re.I) else 2 if re.search('iphone', s, re.I) else 1)

    per_src_sum = {'steps': collections.defaultdict(float), 'exercise': collections.defaultdict(float)}
    points = collections.defaultdict(list)   # (kind, date) → [(zeit, wert, quelle)]
    sleep = []                                # (start, ende, phase, quelle)
    workouts = collections.defaultdict(list)  # date → [(start, typ, min, quelle)]
    with open(src, 'rb') as fh:
        for raw in fh:
            line = raw.decode('utf-8', 'replace').lstrip()
            if line.startswith('<Workout '):
                a = dict(ATTR.findall(line))
                t = parse_time(a['startDate'])
                dur = float(a.get('duration') or 0)
                if a.get('durationUnit', 'min') == 's':
                    dur /= 60
                elif a.get('durationUnit') == 'hr':
                    dur *= 60
                name = re.sub(r'(?<!^)(?=[A-Z])', ' ', a.get('workoutActivityType', '').replace('HKWorkoutActivityType', ''))
                workouts[t.strftime('%Y-%m-%d')].append((t, name, dur, a.get('sourceName', '')))
                continue
            if not line.startswith('<Record '):
                continue
            m = re.search(r'type="([^"]+)"', line)
            kind = WANT.get(m.group(1)) if m else None
            if not kind:
                continue
            a = dict(ATTR.findall(line))
            s, e, srcn = parse_time(a['startDate']), parse_time(a['endDate']), a.get('sourceName', '')
            if kind == 'sleep':
                v = a.get('value', '')
                if 'InBed' in v:
                    continue
                stage = 'awake' if 'Awake' in v else 'deep' if 'Deep' in v else 'rem' if 'REM' in v else 'core' if 'Core' in v else 'asleep'
                sleep.append((s, e, stage, srcn))
                continue
            try:
                v = float(a['value'])
            except (KeyError, ValueError):
                continue
            d = s.strftime('%Y-%m-%d')
            if kind in per_src_sum:
                per_src_sum[kind][(d, srcn)] += v
            else:
                if kind == 'weight' and a.get('unit') == 'lb':
                    v *= 0.45359237
                points[(kind, d)].append((s, v, srcn))

    days = collections.defaultdict(dict)
    for kind, sums in per_src_sum.items():
        by_day = collections.defaultdict(dict)
        for (d, srcn), v in sums.items():
            by_day[d][srcn] = v
        for d, per in by_day.items():
            if kind == 'exercise':
                # Watch zuerst; das iPhone meldet gelegentlich Unsinn (z. B. 1440 min an einem Tag)
                watch = {s: v for s, v in per.items() if re.search('watch', s, re.I)}
                v = max((watch or per).values())
                if v > 720:
                    continue
            else:
                v = max(per.values())
            if v > 0:
                days[d]['steps' if kind == 'steps' else 'exerciseMin'] = round(v)

    for (kind, d), lst in points.items():
        top = min(lst, key=lambda x: rank(x[2]))[2]
        mine = sorted((x for x in lst if x[2] == top), key=lambda x: x[0])
        if kind == 'weight':
            days[d]['weight'] = round(mine[-1][1], 1)
        elif kind in ('hrv', 'rhr'):
            days[d]['hrv' if kind == 'hrv' else 'restingHr'] = round(sum(x[1] for x in mine) / len(mine))
    # Blutdruck: letzte Messung des Tages, Systole/Diastole zum selben Zeitpunkt
    for (kind, d), lst in points.items():
        if kind != 'sys':
            continue
        dia = points.get(('dia', d), [])
        for t, v, _ in sorted(lst, key=lambda x: x[0], reverse=True):
            match = [x for x in dia if abs((x[0] - t).total_seconds()) <= 300]
            if match:
                days[d]['bpSys'], days[d]['bpDia'] = round(v), round(match[0][1])
                break

    # Schlaf: Nacht, die am Morgen von d endet
    nights = collections.defaultdict(list)
    for s, e, stage, srcn in sleep:
        if e <= s:
            continue
        d = (s + timedelta(hours=12)).strftime('%Y-%m-%d') if s.hour >= 18 else s.strftime('%Y-%m-%d')
        if s.hour >= 12 and s.hour < 18:
            continue
        nights[d].append((s, e, stage, srcn))

    def union(iv):
        total, cur = 0, None
        for a, b in sorted(iv):
            if not cur or a > cur[1]:
                if cur:
                    total += (cur[1] - cur[0]).total_seconds()
                cur = [a, b]
            else:
                cur[1] = max(cur[1], b)
        if cur:
            total += (cur[1] - cur[0]).total_seconds()
        return round(total / 60)

    for d, lst in nights.items():
        asleep = [x for x in lst if x[2] != 'awake']
        if not asleep:
            continue
        top = min({x[3] for x in asleep}, key=lambda s: (rank(s), s))
        mine = [x for x in asleep if x[3] == top]
        total = union([(x[0], x[1]) for x in mine])
        if total < 60:
            continue
        rec = days[d]
        rec['sleepMin'] = total
        for st in ('deep', 'rem', 'core'):
            iv = [(x[0], x[1]) for x in mine if x[2] == st]
            if iv:
                rec[st + 'Min'] = union(iv)
        bed, wake = min(x[0] for x in mine), max(x[1] for x in mine)
        aw = [(x[0], x[1]) for x in lst if x[2] == 'awake' and x[3] == top and x[0] >= bed and x[1] <= wake]
        if aw:
            rec['awakeMin'] = union(aw)
        rec['bed'], rec['wake'] = bed.strftime('%H:%M'), wake.strftime('%H:%M')

    # Workouts: gleiche Einheit aus mehreren Quellen (Start ±5 min, gleicher Typ) nur einmal
    for d, lst in workouts.items():
        kept = []
        for t, name, dur, srcn in sorted(lst, key=lambda x: (rank(x[3]), x[0])):
            if any(k[1] == name and abs((k[0] - t).total_seconds()) <= 300 for k in kept):
                continue
            kept.append((t, name, dur, srcn))
        ws = [[name, round(dur)] for t, name, dur, _ in sorted(kept) if dur >= 1]
        if ws:
            days[d]['workouts'] = ws

    ordered = {d: days[d] for d in sorted(days) if days[d]}
    result = {
        'version': 1,
        'source': 'apple-health-export',
        'generated': datetime.now().strftime('%Y-%m-%dT%H:%M'),
        'from': min(ordered), 'to': max(ordered),
        'days': ordered,
    }
    with open(out, 'w') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(ordered)} Tage, {result["from"]} … {result["to"]}')


if __name__ == '__main__':
    order = sys.argv[3].split(',') if len(sys.argv) > 3 else []
    main(sys.argv[1], sys.argv[2], order)
