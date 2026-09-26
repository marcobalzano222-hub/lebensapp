#!/usr/bin/env python3
"""Erzeugt den iOS-Kurzbefehl „Lebensapp Health“ als XML-Plist.

Signieren (nur auf einem Mac):
    python3 tools/build_health_shortcut.py /tmp/lebensapp-health.xml
    shortcuts sign --mode anyone --input /tmp/lebensapp-health.xml --output "Lebensapp Health.shortcut"

Der Kurzbefehl liest Schritte, Gewicht und Schlaf des Vortags aus Apple Health und schreibt sie als
health/JJJJ-MM-TT.json ins private Daten-Repo (Format: siehe HEALTH-SHORTCUT.md).
Token und Repo werden beim Hinzufügen abgefragt (Import-Fragen).
"""
import plistlib
import sys
import uuid

OBJ = '￼'  # Platzhalter für Variablen in Textfeldern


def uid():
    return str(uuid.uuid4()).upper()


def out(action_uuid, name, *aggr):
    a = {'Type': 'ActionOutput', 'OutputUUID': action_uuid, 'OutputName': name}
    if aggr:
        a['Aggrandizements'] = list(aggr)
    return a


def var(name, *aggr):
    a = {'Type': 'Variable', 'VariableName': name}
    if aggr:
        a['Aggrandizements'] = list(aggr)
    return a


def prop(name):
    return {'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': name}


def datefmt(pattern):
    return {'Type': 'WFDateFormatVariableAggrandizement', 'WFDateFormatStyle': 'Custom',
            'WFDateFormat': pattern, 'WFISO8601IncludeTime': False}


ISO = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
DAY = 'yyyy-MM-dd'


def tokens(*parts):
    """Textfeld aus festen Teilen (str) und Variablen (dict)."""
    s, att = '', {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            pos = len(s.encode('utf-16-le')) // 2
            att[f'{{{pos}, 1}}'] = p
            s += OBJ
    return {'Value': {'string': s, 'attachmentsByRange': att}, 'WFSerializationType': 'WFTextTokenString'}


def attach(a):
    return {'Value': a, 'WFSerializationType': 'WFTextTokenAttachment'}


def fields(pairs):
    items = []
    for k, v in pairs:
        items.append({'WFItemType': 0, 'WFKey': tokens(k), 'WFValue': v if isinstance(v, dict) and 'Value' in v else tokens(*v)})
    return {'Value': {'WFDictionaryFieldValueItems': items}, 'WFSerializationType': 'WFDictionaryFieldValue'}


actions = []


def act(ident, **params):
    params.setdefault('UUID', uid())
    actions.append({'WFWorkflowActionIdentifier': f'is.workflow.actions.{ident}', 'WFWorkflowActionParameters': params})
    return params['UUID']


def comment(text):
    actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.comment',
                    'WFWorkflowActionParameters': {'WFCommentActionText': text}})


def adjust(src, name, op, amount=1, unit='days'):
    return act('adjustdate', CustomOutputName=name, WFDate=tokens(out(src, 'Datum')), WFAdjustOperation=op,
               WFDuration={'Value': {'Magnitude': amount, 'Unit': unit}, 'WFSerializationType': 'WFQuantityFieldValue'})


def find_health(kind, start, end, name, latest_one=False, group_by_day=False):
    rows = [
        {'Bounded': True, 'Operator': 4, 'Property': 'Type', 'Removable': False,
         'Values': {'Enumeration': {'Value': kind, 'WFSerializationType': 'WFStringSubstitutableState'}}},
        {'Bounded': True, 'Operator': 1003, 'Property': 'Start Date', 'Removable': True,
         'Values': {'Date': attach(out(start[0], start[1])), 'AnotherDate': attach(out(end[0], end[1]))}},
    ]
    params = dict(CustomOutputName=name, WFContentItemFilter={
        'Value': {'WFActionParameterFilterPrefix': 1, 'WFContentPredicateBoundedDate': False,
                  'WFActionParameterFilterTemplates': rows},
        'WFSerializationType': 'WFContentPredicateTableTemplate'})
    if group_by_day:
        params['WFHKSampleFilteringGroupBy'] = 'Day'
    if latest_one:
        params.update(WFContentItemSortProperty='Start Date', WFContentItemSortOrder='Latest First',
                      WFContentItemLimitEnabled=True, WFContentItemLimitNumber=1)
    return act('filter.health.quantity', **params)


def lines_of(samples_uuid, samples_name, fields_, result_name):
    """Wiederholen mit jedem Sample → eine Textzeile je Sample → mit Zeilenumbrüchen kombinieren."""
    group = uid()
    act('repeat.each', GroupingIdentifier=group, WFControlFlowMode=0, WFInput=attach(out(samples_uuid, samples_name)))
    parts = []
    for i, f in enumerate(fields_):
        if i:
            parts.append('|')
        parts.append(f)
    act('gettext', WFTextActionText=tokens(*parts))
    end = act('repeat.each', GroupingIdentifier=group, WFControlFlowMode=2)
    return act('text.combine', CustomOutputName=result_name, WFTextSeparator='New Lines',
               text=attach(out(end, 'Repeat Results')))


def github_request(method, url_parts, token, body=None):
    params = dict(WFHTTPMethod=method, WFURL=tokens(*url_parts), ShowHeaders=True,
                  WFHTTPHeaders=fields([('Authorization', ['Bearer ', token]),
                                        ('Accept', ['application/vnd.github+json']),
                                        ('X-GitHub-Api-Version', ['2022-11-28'])]))
    if body:
        params.update(WFHTTPBodyType='JSON', WFJSONValues=fields(body))
    return act('downloadurl', **params)


# ---------- Aufbau ----------

# Index 0 und 1: werden beim Hinzufügen abgefragt (Import-Fragen)
token = act('gettext', CustomOutputName='Token', WFTextActionText='github_pat_…')
repo = act('gettext', CustomOutputName='Repo', WFTextActionText='marcobalzano222-hub/lebensapp-data-satoshi')

comment('Lebensapp Health (Version 3): schreibt Schritte, Gewicht und Schlaf des Vortags als health/JJJJ-MM-TT.json in dein privates Daten-Repo. Token und Repo stehen in den beiden Textfeldern oben.')

now = act('date', CustomOutputName='Jetzt', WFDateActionMode='Current Date')
yesterday = adjust(now, 'Gestern', 'Subtract', 1, 'days')
day = adjust(yesterday, 'Tag', 'Get Start of Day')
day_end = adjust(day, 'Tagesende', 'Add', 1, 'days')
sleep_start = adjust(day, 'Schlaf ab', 'Subtract', 6, 'hr')
sleep_end = adjust(day, 'Schlaf bis', 'Add', 12, 'hr')

comment('Schritte: pro Tag gruppiert (iOS rechnet doppelte iPhone-/Watch-Schritte heraus). Die App nimmt die Zeile des Vortags.')
steps_found = find_health('Steps', (day, 'Tag'), (day_end, 'Tagesende'), 'Schritt-Samples', group_by_day=True)
steps = lines_of(steps_found, 'Schritt-Samples', [
    var('Repeat Item', prop('Start Date'), datefmt(ISO)),
    var('Repeat Item', prop('Value')),
], 'Schritte')

comment('Gewicht: alle Messungen im Zeitraum. Die App nimmt die letzte Messung des Vortags.')
weight_found = find_health('Weight', (day, 'Tag'), (day_end, 'Tagesende'), 'Gewicht-Samples')
weight = lines_of(weight_found, 'Gewicht-Samples', [
    var('Repeat Item', prop('Start Date'), datefmt(ISO)),
    var('Repeat Item', prop('Value')),
], 'Gewicht')
step_count = act('count', CustomOutputName='Anzahl Schritt-Samples', WFCountType='Items',
                 WFInput=attach(out(steps_found, 'Schritt-Samples')), Input=attach(out(steps_found, 'Schritt-Samples')))

comment('Schritte einzeln mit Quelle (iPhone, Watch, Ring …). Die App zählt überlappende Zeiträume nur einmal, wie die Health-App.')
steps_raw = find_health('Steps', (day, 'Tag'), (day_end, 'Tagesende'), 'Schritt-Einzelwerte')
def column(prop_name, name, *aggr):
    d = act('properties.health.quantity', CustomOutputName=f'{name} (Liste)', WFContentItemPropertyName=prop_name,
            WFInput=attach(out(steps_raw, 'Schritt-Einzelwerte')))
    return act('text.combine', CustomOutputName=name, WFTextSeparator='New Lines',
               text=attach(out(d, f'{name} (Liste)', *aggr)))
col_start = column('Start Date', 'Schritt-Start', datefmt(ISO))
col_end = column('End Date', 'Schritt-Ende', datefmt(ISO))
col_value = column('Value', 'Schritt-Wert')
col_source = column('Source', 'Schritt-Quelle')


comment('Schlaf: alle Schlaf-Phasen der Nacht, die am Morgen des Vortags endet (die App rechnet die Dauer aus)')
sleep_found = find_health('Sleep', (sleep_start, 'Schlaf ab'), (sleep_end, 'Schlaf bis'), 'Schlaf-Samples')
sleep_count = act('count', CustomOutputName='Anzahl Schlaf-Samples', WFCountType='Items',
                  WFInput=attach(out(sleep_found, 'Schlaf-Samples')), Input=attach(out(sleep_found, 'Schlaf-Samples')))
sleep = lines_of(sleep_found, 'Schlaf-Samples', [
    var('Repeat Item', prop('Value')),
    var('Repeat Item', prop('Start Date'), datefmt(ISO)),
    var('Repeat Item', prop('End Date'), datefmt(ISO)),
], 'Schlaf')

comment('Datei zusammenbauen')
day_str = out(day, 'Tag', datefmt(DAY))
data = act('dictionary', CustomOutputName='Health-Daten', WFItems=fields([
    ('date', [day_str]),
    ('source', ['shortcut']),
    ('steps', [out(steps, 'Schritte')]),
    ('weight', [out(weight, 'Gewicht')]),
    ('sleep', [out(sleep, 'Schlaf')]),
    ('stepsStart', [out(col_start, 'Schritt-Start')]),
    ('stepsEnd', [out(col_end, 'Schritt-Ende')]),
    ('stepsValue', [out(col_value, 'Schritt-Wert')]),
    ('stepsSource', [out(col_source, 'Schritt-Quelle')]),
    # Diagnose: Zeitfenster und Anzahl gefundener Messungen (die App ignoriert das Feld)
    ('debug', ['tag=', out(day, 'Tag', datefmt(ISO)), ' ende=', out(day_end, 'Tagesende', datefmt(ISO)),
               ' schlafAb=', out(sleep_start, 'Schlaf ab', datefmt(ISO)), ' schlafBis=', out(sleep_end, 'Schlaf bis', datefmt(ISO)),
               ' schrittSamples=', out(step_count, 'Anzahl Schritt-Samples'),
               ' schlafSamples=', out(sleep_count, 'Anzahl Schlaf-Samples'),]),
]))
content = act('base64encode', CustomOutputName='Inhalt', WFEncodeMode='Encode', WFBase64LineBreakMode='None',
              WFInput=attach(out(data, 'Health-Daten')))

comment('Nach GitHub schreiben (vorhandene Datei desselben Tages wird überschrieben)')
url = ['https://api.github.com/repos/', out(repo, 'Repo'), '/contents/health/', day_str, '.json']
existing = github_request('GET', url, out(token, 'Token'))
sha = act('getvalueforkey', CustomOutputName='SHA', WFGetDictionaryValueType='Value', WFDictionaryKey='sha',
          WFInput=attach(out(existing, 'Inhalte der URL')))
message = ['health: ', day_str]
group = uid()
act('conditional', GroupingIdentifier=group, WFControlFlowMode=0, WFCondition=100,
    WFInput={'Type': 'Variable', 'Variable': attach(out(sha, 'SHA'))})
github_request('PUT', url, out(token, 'Token'), body=[
    ('message', message), ('content', [out(content, 'Inhalt')]), ('sha', [out(sha, 'SHA')])])
act('conditional', GroupingIdentifier=group, WFControlFlowMode=1)
github_request('PUT', url, out(token, 'Token'), body=[
    ('message', message), ('content', [out(content, 'Inhalt')])])
act('conditional', GroupingIdentifier=group, WFControlFlowMode=2)

shortcut = {
    'WFWorkflowActions': actions,
    'WFWorkflowClientVersion': '2700.0.4',
    'WFWorkflowHasOutputFallback': False,
    'WFWorkflowIcon': {'WFWorkflowIconGlyphNumber': 59754, 'WFWorkflowIconStartColor': 431817727},
    'WFWorkflowImportQuestions': [
        {'ActionIndex': 0, 'Category': 'Parameter', 'DefaultValue': '', 'ParameterKey': 'WFTextActionText',
         'Text': 'Füge deinen Fine-grained Token ein (github_pat_…). Er bleibt nur in diesem Kurzbefehl auf deinem iPhone.'},
        {'ActionIndex': 1, 'Category': 'Parameter', 'DefaultValue': 'marcobalzano222-hub/lebensapp-data-satoshi',
         'ParameterKey': 'WFTextActionText',
         'Text': 'Dein Daten-Repo als Benutzername/Repo-Name. Für Satoshi einfach so lassen.'},
    ],
    'WFWorkflowInputContentItemClasses': [],
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowName': 'Lebensapp Health',
    'WFWorkflowOutputContentItemClasses': [],
    'WFWorkflowTypes': [],
}

with open(sys.argv[1] if len(sys.argv) > 1 else 'lebensapp-health.xml', 'wb') as f:
    plistlib.dump(shortcut, f, fmt=plistlib.FMT_XML)
