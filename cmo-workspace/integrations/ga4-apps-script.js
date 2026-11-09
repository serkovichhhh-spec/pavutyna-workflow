/**
 * Pavutyna · CMO Space ⇐ GA4 (замість Supermetrics)
 * Ресурс 348106289 «[GA4] 04.01.23 ALL» (pavutyna.ua).
 * Налаштування: Services (+) → «Google Analytics Data API» → Add; потім запустити setup() один раз.
 * Далі sync() сам працює двічі на добу (06:20 і 13:20 за Києвом): останні 10 днів, перший раз — бекфіл з BACKFILL_FROM.
 */
var CONFIG = {
  URL: 'https://gdicqiefyajzrzmhuhgi.supabase.co/functions/v1/mkt-ingest',
  KEY: '__GA4_KEY__',
  PROPERTY: '348106289',
  BACKFILL_FROM: '2025-01-01',
  RECENT_DAYS: 10,
  // події, які зберігаємо з розбивкою за каналами (заявки, ліди, кліки по контактах)
  EVENT_REGEX: '^(Order_.*|generate_lead|Send_Form|form_submit|.*[Cc]lick.*|.*[Pp]hone.*|.*[Cc]all.*|purchase|sign_up)$'
};

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  [6, 13].forEach(function (h) {
    ScriptApp.newTrigger('sync').timeBased().everyDays(1).atHour(h).nearMinute(20).inTimezone('Europe/Kiev').create();
  });
  sync();
}

function sync() {
  try {
    var today = Utilities.formatDate(new Date(), 'Europe/Kiev', 'yyyy-MM-dd');
    var state = call_({ action: 'state', source: 'ga4' });
    if (!state.min_date || state.min_date > CONFIG.BACKFILL_FROM) {
      var end = state.min_date ? addDays_(state.min_date, -1) : addDays_(today, -1), cur = CONFIG.BACKFILL_FROM;
      while (cur <= end) {
        var me = lastDayOfMonth_(cur); if (me > end) me = end;
        pushWindow_(cur, me, 'backfill');
        cur = addDays_(me, 1);
      }
    }
    pushWindow_(addDays_(today, -CONFIG.RECENT_DAYS), today, 'full');
  } catch (e) {
    try { call_({ action: 'error', source: 'ga4', error: String(e) }); } catch (ignore) {}
    throw e;
  }
}

function pushWindow_(from, to, kind) {
  var traffic = report_({
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }, { name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'engagedSessions' }]
  }).map(function (r) {
    return { date: d_(r[0]), channel_group: r[1], source_medium: r[2], sessions: +r[3], total_users: +r[4], new_users: +r[5], engaged_sessions: +r[6] };
  });
  var events = report_({
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'date' }, { name: 'eventName' }, { name: 'sessionDefaultChannelGroup' }, { name: 'sessionSourceMedium' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'FULL_REGEXP', value: CONFIG.EVENT_REGEX } } }
  }).map(function (r) {
    return { date: d_(r[0]), event_name: r[1], channel_group: r[2], source_medium: r[3], event_count: +r[4] };
  });
  call_({ action: 'ingest', payload: { source: 'ga4', kind: kind, property_id: CONFIG.PROPERTY,
    window: { from: from, to: to }, traffic: traffic, events: events } });
  Logger.log(kind + ' ' + from + '…' + to + ': сесій-рядків ' + traffic.length + ', подій-рядків ' + events.length);
}

function report_(req) {
  var out = [], offset = 0, limit = 50000;
  do {
    req.limit = limit; req.offset = offset;
    var res = AnalyticsData.Properties.runReport(req, 'properties/' + CONFIG.PROPERTY);
    (res.rows || []).forEach(function (row) {
      out.push(row.dimensionValues.map(function (v) { return v.value; })
        .concat(row.metricValues.map(function (v) { return v.value; })));
    });
    offset += limit;
  } while (res.rowCount && offset < res.rowCount);
  return out;
}

function call_(body) {
  var resp = UrlFetchApp.fetch(CONFIG.URL, {
    method: 'post', contentType: 'application/json', headers: { 'x-mkt-key': CONFIG.KEY },
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('CMO Space ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
  return JSON.parse(resp.getContentText());
}

function d_(s) { return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
function addDays_(d, n) { var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function lastDayOfMonth_(d) { var t = new Date(d + 'T12:00:00Z'); t.setUTCMonth(t.getUTCMonth() + 1, 0); return t.toISOString().slice(0, 10); }
