/**
 * Pavutyna · CMO Space ⇄ Google Ads (замість Supermetrics)
 * Кабінет: 6825129974 «ТОВ ПАВУТИНА. НЕТ». Розклад скрипта: щогодини.
 *
 * Що робить кожен запуск:
 *  1) знімок кампаній (статуси, бюджети, стратегії, tCPA, гео, розширення URL, цілі конверсій) → CMO Space;
 *  2) статистика по кампаніях за останні 3 дні; раз на добу — за 35 днів + пошукові запити за 14 днів + конверсії;
 *     перший запуск — бекфіл з BACKFILL_FROM помісячно;
 *  3) виконує схвалені команди з черги mkt.ads_commands (бюджет, пауза, tCPA, гео, URL, мінус-слова, цілі конверсій)
 *     і повертає «було → стало». У режимі «Попередній перегляд» команди не чіпає.
 */
var CONFIG = {
  URL: 'https://gdicqiefyajzrzmhuhgi.supabase.co/functions/v1/mkt-ingest',
  KEY: '__GADS_KEY__',
  BACKFILL_FROM: '2025-01-01',
  FULL_DAYS: 35,
  SEARCH_TERM_DAYS: 14
};

function main() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var errors = [];
  var step = function (name, fn) {
    try { fn(); } catch (e) { errors.push(name + ': ' + e); Logger.log('ПОМИЛКА ' + name + ': ' + e); }
  };

  var state = call_({ action: 'state', source: 'gads' });
  Logger.log('Стан: ' + JSON.stringify(state));

  step('кампанії', function () { pushCampaigns_(); });

  if (!AdsApp.getExecutionInfo().isPreview()) step('команди', function () { runCommands_(); });

  step('статистика', function () {
    var lastFull = state.last_full_sync ? String(state.last_full_sync).slice(0, 10) : null;
    if (!state.min_date || state.min_date > CONFIG.BACKFILL_FROM) {
      backfill_(CONFIG.BACKFILL_FROM, addDays_(today, -1), state.min_date);
    }
    if (lastFull !== today) {
      pushDaily_(addDays_(today, -CONFIG.FULL_DAYS), addDays_(today, -1), 'full');
      pushSearchTerms_(addDays_(today, -CONFIG.SEARCH_TERM_DAYS), addDays_(today, -1));
      pushConversions_();
    }
    pushDaily_(addDays_(today, -2), today, 'recent');
  });

  if (errors.length) {
    call_({ action: 'error', source: 'gads', error: errors.join(' | ') });
    throw new Error(errors.join(' | '));
  }
}

// ───────── дані ─────────
function pushDaily_(from, to, kind) {
  var rows = [];
  var it = AdsApp.search(
    'SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, metrics.cost_micros, ' +
    'metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.all_conversions ' +
    "FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'");
  while (it.hasNext()) {
    var r = it.next();
    rows.push({
      date: r.segments.date, campaign_id: r.campaign.id, campaign_name: r.campaign.name,
      channel_type: r.campaign.advertisingChannelType, cost: micros_(r.metrics.costMicros),
      impressions: num_(r.metrics.impressions), clicks: num_(r.metrics.clicks), conversions: num_(r.metrics.conversions),
      conversions_value: num_(r.metrics.conversionsValue), all_conversions: num_(r.metrics.allConversions)
    });
  }
  ingest_({ source: 'gads', kind: kind, window: { from: from, to: to }, campaign_daily: rows });
  Logger.log('Статистика ' + from + '…' + to + ': ' + rows.length + ' рядків');
}

function backfill_(from, to, existingMin) {
  var end = existingMin ? addDays_(existingMin, -1) : to;
  var cur = from;
  while (cur <= end) {
    var monthEnd = lastDayOfMonth_(cur);
    if (monthEnd > end) monthEnd = end;
    pushDaily_(cur, monthEnd, 'backfill');
    cur = addDays_(monthEnd, 1);
  }
}

function pushSearchTerms_(from, to) {
  var rows = [];
  var it = AdsApp.search(
    'SELECT segments.date, campaign.id, ad_group.id, search_term_view.search_term, search_term_view.status, ' +
    'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM search_term_view ' +
    "WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.impressions > 0");
  while (it.hasNext()) {
    var r = it.next();
    rows.push({
      date: r.segments.date, campaign_id: r.campaign.id, ad_group_id: r.adGroup.id,
      search_term: r.searchTermView.searchTerm, status: r.searchTermView.status,
      cost: micros_(r.metrics.costMicros), impressions: num_(r.metrics.impressions),
      clicks: num_(r.metrics.clicks), conversions: num_(r.metrics.conversions)
    });
  }
  ingest_({ source: 'gads', kind: 'search_terms', window: { from: from, to: to }, search_terms: rows });
}

function pushConversions_() {
  var actions = [], goals = [];
  var it = AdsApp.search(
    'SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.type, ' +
    'conversion_action.status, conversion_action.origin, conversion_action.primary_for_goal, ' +
    "conversion_action.include_in_conversions_metric FROM conversion_action WHERE conversion_action.status != 'REMOVED'");
  while (it.hasNext()) {
    var a = it.next().conversionAction;
    actions.push({ id: a.id, name: a.name, category: a.category, type: a.type, status: a.status, origin: a.origin,
      primary_for_goal: !!a.primaryForGoal, include_in_conversions: !!a.includeInConversionsMetric });
  }
  var g = AdsApp.search(
    'SELECT campaign.id, campaign_conversion_goal.category, campaign_conversion_goal.origin, campaign_conversion_goal.biddable ' +
    "FROM campaign_conversion_goal WHERE campaign.status != 'REMOVED'");
  while (g.hasNext()) {
    var r = g.next();
    goals.push({ campaign_id: r.campaign.id, category: r.campaignConversionGoal.category,
      origin: r.campaignConversionGoal.origin, biddable: !!r.campaignConversionGoal.biddable });
  }
  ingest_({ source: 'gads', kind: 'conversions', conversion_actions: actions, campaign_goals: goals });
}

function readCampaigns_(where) {
  var base = 'SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, ' +
    'campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.target_cpa.target_cpa_micros, ' +
    'campaign.maximize_conversions.target_cpa_micros, campaign.target_roas.target_roas, ' +
    'campaign.maximize_conversion_value.target_roas, campaign_budget.id, campaign_budget.amount_micros, ' +
    'campaign_budget.explicitly_shared, campaign.geo_target_type_setting.positive_geo_target_type';
  var q = base + ', campaign.url_expansion_opt_out FROM campaign WHERE ' + where;
  var it;
  try { it = AdsApp.search(q); it.hasNext(); } catch (e) { it = AdsApp.search(base + ' FROM campaign WHERE ' + where); }
  var out = [];
  while (it.hasNext()) {
    var r = it.next(), c = r.campaign, b = r.campaignBudget || {};
    var tcpa = (c.targetCpa && c.targetCpa.targetCpaMicros) || (c.maximizeConversions && c.maximizeConversions.targetCpaMicros);
    var troas = (c.targetRoas && c.targetRoas.targetRoas) || (c.maximizeConversionValue && c.maximizeConversionValue.targetRoas);
    out.push({
      campaign_id: c.id, name: c.name, status: c.status, primary_status: c.primaryStatus,
      primary_status_reasons: c.primaryStatusReasons || [], channel_type: c.advertisingChannelType,
      bidding_strategy_type: c.biddingStrategyType, target_cpa: tcpa ? micros_(tcpa) : null,
      target_roas: troas ? num_(troas) : null, budget_id: b.id || null,
      budget_amount: b.amountMicros ? micros_(b.amountMicros) : null, budget_shared: !!b.explicitlyShared,
      geo_target_type: c.geoTargetTypeSetting ? c.geoTargetTypeSetting.positiveGeoTargetType : null,
      url_expansion_opt_out: c.urlExpansionOptOut === undefined ? null : !!c.urlExpansionOptOut
    });
  }
  return out;
}

function pushCampaigns_() {
  var list = readCampaigns_("campaign.status != 'REMOVED'");
  ingest_({ source: 'gads', kind: 'campaigns', campaigns: list });
  Logger.log('Кампаній: ' + list.length);
}

// ───────── команди ─────────
function runCommands_() {
  var cmds = call_({ action: 'pull' });
  if (!cmds || !cmds.length) return;
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  var results = [];
  cmds.forEach(function (cmd) {
    var res = { id: cmd.id, status: 'failed', before: null, after: null, error: null };
    try {
      var where = 'campaign.id = ' + cmd.campaign_id;
      if (cmd.campaign_id) res.before = snapshot_(where, cmd.campaign_id);
      var ops = buildOps_(cmd, cid, res.before && res.before.campaign);
      var errs = [];
      ops.forEach(function (op) {
        var m = AdsApp.mutate(op);
        if (!m.isSuccessful()) errs.push(m.getErrorMessages().join('; '));
      });
      if (cmd.campaign_id) res.after = snapshot_(where, cmd.campaign_id);
      if (errs.length) res.error = errs.join(' | '); else res.status = 'done';
    } catch (e) { res.error = String(e); }
    Logger.log('Команда ' + cmd.id + ' ' + cmd.op + ' «' + cmd.campaign_name + '»: ' + res.status + (res.error ? ' — ' + res.error : ''));
    results.push(res);
  });
  call_({ action: 'report', results: results });
  pushCampaigns_();
}

function snapshot_(where, campaignId) {
  var c = readCampaigns_(where)[0] || null, goals = [];
  var g = AdsApp.search('SELECT campaign_conversion_goal.category, campaign_conversion_goal.origin, campaign_conversion_goal.biddable ' +
    'FROM campaign_conversion_goal WHERE campaign.id = ' + campaignId);
  while (g.hasNext()) { var x = g.next().campaignConversionGoal; if (x.biddable) goals.push(x.category + '/' + x.origin); }
  return { campaign: c, biddable_goals: goals };
}

function buildOps_(cmd, cid, c) {
  var p = cmd.params || {}, campRn = 'customers/' + cid + '/campaigns/' + cmd.campaign_id;
  switch (cmd.op) {
    case 'campaign_budget':
      if (!c || !c.budget_id) throw new Error('Не знайдено бюджет кампанії');
      return [{ campaignBudgetOperation: { update: { resourceName: 'customers/' + cid + '/campaignBudgets/' + c.budget_id,
        amountMicros: String(Math.round(Number(p.daily) * 1e6)) }, updateMask: 'amount_micros' } }];
    case 'campaign_status':
      return [{ campaignOperation: { update: { resourceName: campRn, status: String(p.status).toUpperCase() }, updateMask: 'status' } }];
    case 'target_cpa': {
      var m = String(Math.round(Number(p.uah) * 1e6));
      if (c.bidding_strategy_type === 'TARGET_CPA')
        return [{ campaignOperation: { update: { resourceName: campRn, targetCpa: { targetCpaMicros: m } }, updateMask: 'target_cpa.target_cpa_micros' } }];
      if (c.bidding_strategy_type === 'MAXIMIZE_CONVERSIONS')
        return [{ campaignOperation: { update: { resourceName: campRn, maximizeConversions: { targetCpaMicros: m } }, updateMask: 'maximize_conversions.target_cpa_micros' } }];
      throw new Error('Стратегія ' + c.bidding_strategy_type + ' не підтримує tCPA');
    }
    case 'geo_target_type':
      return [{ campaignOperation: { update: { resourceName: campRn, geoTargetTypeSetting: { positiveGeoTargetType: p.positive } },
        updateMask: 'geo_target_type_setting.positive_geo_target_type' } }];
    case 'url_expansion':
      return [{ campaignOperation: { update: { resourceName: campRn, urlExpansionOptOut: !!p.opt_out }, updateMask: 'url_expansion_opt_out' } }];
    case 'negative_keywords':
      return p.keywords.map(function (k) {
        return { campaignCriterionOperation: { create: { campaign: campRn, negative: true,
          keyword: { text: String(k), matchType: p.match || 'PHRASE' } } } };
      });
    case 'conversion_goals':
      return p.goals.map(function (g) {
        return { campaignConversionGoalOperation: { update: {
          resourceName: 'customers/' + cid + '/campaignConversionGoals/' + cmd.campaign_id + '~' + g.category + '~' + g.origin,
          biddable: !!g.biddable }, updateMask: 'biddable' } };
      });
    case 'raw_mutate':
      return p.operations;
  }
  throw new Error('Невідома операція ' + cmd.op);
}

// ───────── транспорт ─────────
function ingest_(payload) { return call_({ action: 'ingest', payload: payload }); }

function call_(body) {
  var resp = UrlFetchApp.fetch(CONFIG.URL, {
    method: 'post', contentType: 'application/json', headers: { 'x-mkt-key': CONFIG.KEY },
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  var code = resp.getResponseCode(), text = resp.getContentText();
  if (code !== 200) throw new Error('CMO Space ' + code + ': ' + text.slice(0, 300));
  return JSON.parse(text);
}

function micros_(v) { return Math.round(Number(v || 0) / 1e4) / 100; }
function num_(v) { return v === undefined || v === null ? 0 : Number(v); }
function addDays_(d, n) { var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function lastDayOfMonth_(d) { var t = new Date(d + 'T12:00:00Z'); t.setUTCMonth(t.getUTCMonth() + 1, 0); return t.toISOString().slice(0, 10); }
