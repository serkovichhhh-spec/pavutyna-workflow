import {escapeHtml as h} from './metrics.js';
import {purchaseSummary,money} from './purchase.js';

const UA_MONTHS=['січ','лют','бер','кві','тра','чер','лип','сер','вер','жов','лис','гру'];
const FULL_MONTHS=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const OPEN_DECISION=['Потребує рішення','Потрібне рішення','На погодженні'];
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const fmt=v=>v==null?'—':Math.round(v).toLocaleString('uk-UA').replace(/ /g,' ');
export const monthLabel=(m,full)=>{const [y,mm]=m.split('-').map(Number);return (full?FULL_MONTHS:UA_MONTHS)[mm-1]+(full?' '+y:'');};
function shiftMonth(m,d){const [y,mm]=m.split('-').map(Number),t=new Date(Date.UTC(y,mm-1+d,1));return t.toISOString().slice(0,7);}
const kyivToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());

// Канали атрибуції: платна реклама (Google/Meta) і чати ЖК (Links).
export function channelOf(r){const s=`${r.source||''} ${r.group||''}`.toLowerCase();if(s.includes('google'))return 'google';if(s.includes('meta')||s.includes('facebook'))return 'meta';if(s.includes('links')||s.includes('чат')||s.includes('referral'))return 'chats';return 'other';}
export const channelNames={google:'Google Ads',meta:'Meta Ads',chats:'Чати ЖК',other:'Інше'};

export function monthlySeries(attribution,today=kyivToday(),count=6){
 const now=today.slice(0,7),months=Array.from({length:count},(_,i)=>shiftMonth(now,i-count+1));
 return months.map(month=>{const rows=attribution.filter(r=>r.month===month),by={};
  for(const r of rows){const c=channelOf(r),b=by[c]||(by[c]={spend:null,visits:null,leads:null,rows:0});b.rows++;for(const k of ['spend','visits','leads']){const v=num(r[k]);if(v!=null)b[k]=(b[k]||0)+v;}}
  const total=k=>Object.values(by).reduce((s,b)=>b[k]==null?s:(s??0)+b[k],null);
  return {month,by,spend:total('spend'),leads:total('leads'),visits:total('visits'),partial:month===now};});
}

export function dashboardModel({documents=[],tasks=[],month,today=kyivToday()}){
 const rows=k=>{const p=documents.find(d=>d.key===k)?.payload;return Array.isArray(p)?p:[];};
 const attribution=rows('attribution'),series=monthlySeries(attribution,today,12),recent=series.slice(-6);
 const withData=series.filter(s=>s.spend!=null||s.leads!=null);
 const selected=month&&series.some(s=>s.month===month)?month:(series.at(-1).spend!=null&&Number(today.slice(8,10))>10?series.at(-1).month:(withData.filter(s=>!s.partial).at(-1)||series.at(-1)).month);
 const cur=series.find(s=>s.month===selected);
 const threads=['google','meta','chats','other'].map(c=>({channel:c,...(cur.by[c]||{})})).filter(t=>t.rows).map(t=>({...t,cpl:t.spend!=null&&t.leads?t.spend/t.leads:null,cpv:t.spend!=null&&t.visits?t.spend/t.visits:null}));
 const budget=documents.find(d=>d.key==='budget')?.payload||{},envelope=num(budget.envelope);
 const purchases=purchaseSummary(tasks,selected);
 const open=tasks.filter(t=>!['done','backlog'].includes(t.lane));
 const isoDue=t=>/^\d{4}-\d{2}-\d{2}$/.test(t.due||'')?t.due:null;
 const weekAhead=new Date(Date.parse(today)+7*864e5).toISOString().slice(0,10);
 const overdue=open.filter(t=>isoDue(t)&&isoDue(t)<today).sort((a,b)=>a.due.localeCompare(b.due));
 const soon=open.filter(t=>isoDue(t)&&isoDue(t)>=today&&isoDue(t)<=weekAhead).sort((a,b)=>a.due.localeCompare(b.due));
 const people=[...new Set(open.map(t=>t.assignee))].filter(Boolean).map(name=>{const mine=open.filter(t=>t.assignee===name);return {name,todo:mine.filter(t=>t.lane==='todo').length,progress:mine.filter(t=>['progress','ready'].includes(t.lane)).length,review:mine.filter(t=>t.lane==='review').length,blocked:mine.filter(t=>t.lane==='blocked').length,overdue:mine.filter(t=>overdue.includes(t)).length,total:mine.length};}).sort((a,b)=>b.total-a.total);
 const decisions=rows('decisions').filter(r=>OPEN_DECISION.includes(r.status));
 const drafts=rows('content').filter(r=>r.agent&&!(r.taskIds||[]).length&&['Ідея','План'].includes(r.status));
 const review=tasks.filter(t=>t.lane==='review');
 const insights=rows('insights').filter(r=>r.agentUpdatedAt&&r.status==='Новий').sort((a,b)=>String(b.agentUpdatedAt).localeCompare(String(a.agentUpdatedAt))).slice(0,6);
 return {budget,tasks,series,recent,selected,cur,threads,envelope,purchases,overdue,soon,people,decisions,drafts,review,insights,today};
}

function threadMarkup(t){
 const nodes=[[fmt(t.spend)+' грн','витрати'],[fmt(t.visits),t.channel==='google'?'кліки':'переходи'],[t.leads==null?'—':fmt(t.leads),'заявки'],t.cpl!=null?[fmt(t.cpl)+' грн','за заявку']:(t.spend&&t.leads===0?['—','жодної заявки']:['—','за заявку'])];
 const warn=t.spend>0&&!t.leads;
 return `<div class="thread ${warn?'thread-warn':''}"><div class="thread-name">${h(channelNames[t.channel])}</div><ol class="thread-line">${nodes.map(([v,l])=>`<li><strong>${h(v)}</strong><span>${h(l)}</span></li>`).join('')}</ol></div>`;
}

function spendChart(series){
 const W=640,H=210,P={l:44,r:40,t:16,b:30},cw=(W-P.l-P.r)/series.length,maxS=Math.max(1,...series.map(s=>s.spend||0)),maxL=Math.max(1,...series.map(s=>s.leads||0));
 const step=Math.pow(10,Math.floor(Math.log10(maxS)));const top=Math.ceil(maxS/step)*step,y=v=>P.t+(H-P.t-P.b)*(1-v/top),yl=v=>P.t+(H-P.t-P.b)*(1-v/(maxL*1.15));
 const colors={google:'var(--c-google)',meta:'var(--c-meta)',chats:'var(--c-chats)',other:'var(--c-other)'};
 const grid=[0,.5,1].map(f=>`<line x1="${P.l}" x2="${W-P.r}" y1="${y(top*f)}" y2="${y(top*f)}" class="grid"/><text x="${P.l-6}" y="${y(top*f)+4}" text-anchor="end" class="axis">${fmt(top*f/1000)}к</text>`).join('');
 const bars=series.map((s,i)=>{let acc=0;const x=P.l+i*cw+cw*.22,w=cw*.56;return ['google','meta','chats','other'].map(c=>{const v=s.by[c]?.spend;if(!v)return '';const y0=y(acc),y1=y(acc+v);acc+=v;return `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0,y0-y1)}" fill="${colors[c]}" rx="2"><title>${h(monthLabel(s.month,true))} · ${h(channelNames[c])}: ${fmt(v)} грн</title></rect>`;}).join('')+`<text x="${x+w/2}" y="${H-10}" text-anchor="middle" class="axis${s.partial?' partial':''}">${h(monthLabel(s.month))}${s.partial?'*':''}</text>`;}).join('');
 const pts=series.map((s,i)=>s.leads==null?null:[P.l+i*cw+cw/2,yl(s.leads),s]).filter(Boolean);
 const segs=[];let curSeg=[];series.forEach((s,i)=>{if(s.leads==null){if(curSeg.length)segs.push(curSeg);curSeg=[];}else curSeg.push([P.l+i*cw+cw/2,yl(s.leads)]);});if(curSeg.length)segs.push(curSeg);
 const line=segs.filter(g=>g.length>1).map(g=>`<polyline points="${g.map(p=>p[0]+','+p[1]).join(' ')}" class="leads-line"/>`).join('')+series.map((s,i)=>s.leads==null&&s.spend!=null?`<text x="${P.l+i*cw+cw/2}" y="${y(s.spend)-8}" text-anchor="middle" class="no-leads">?</text>`:'').join('');
 const dots=pts.map(([x,yy,s])=>`<circle cx="${x}" cy="${yy}" r="4.5" class="leads-dot"><title>${h(monthLabel(s.month,true))}: ${fmt(s.leads)} заявок</title></circle><text x="${x}" y="${yy-9}" text-anchor="middle" class="leads-label">${fmt(s.leads)}</text>`).join('');
 return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Витрати по каналах і заявки за 12 місяців">${grid}${bars}${line}${dots}</svg>`;
}

const lineChannel={'Google Ads':'google','Meta Ads':'meta','Чати ЖК':'chats'};
function budgetMarkup(m){
 const b=m.budget,month=b.month||m.selected,ser=m.series.find(s=>s.month===month),purch=purchaseSummary(m.tasks,month);
 const lines=(b.lines||[]).map(l=>{const c=lineChannel[l.channel],agent=c?ser?.by[c]?.spend:null,bought=purch.byChannel.find(x=>x.channel===l.channel)?.paid||0,fact=num(l.actual)??Math.max(agent||0,bought);return {...l,fact,planned:num(l.planned)};});
 const planned=num(b.envelope)??lines.reduce((s,l)=>s+(l.planned||0),0),fact=lines.reduce((s,l)=>s+(l.fact||0),0)+purch.byChannel.filter(c=>!lines.some(l=>l.channel===c.channel)).reduce((s,c)=>s+c.paid,0);
 const pct=(v,base)=>base?Math.min(100,Math.round((v||0)/base*100)):0;
 return `<article class="dash-card dash-budget"><h2>Бюджет · ${h(monthLabel(month,true))}</h2>
 ${planned?`<p class="dash-big">${fmt(fact)} <small>грн витрачено з ${fmt(planned)}</small></p><div class="meter" aria-hidden="true"><span class="meter-paid" style="width:${pct(fact,planned)}%"></span></div>`:`<p class="dash-note">Ліміт місяця не задано. <button data-record-module="budget">Задати ліміт</button></p>`}
 ${lines.length?`<ul class="budget-lines">${lines.map(l=>`<li class="${l.planned===0?'paused':''}"><div><strong>${h(l.channel||l.name)}</strong><span>${h(l.status||'')}</span></div><div class="budget-nums">${l.planned===0?'пауза':`${fmt(l.fact)} / ${fmt(l.planned)}`}</div>${l.planned?`<i class="budget-bar"><b style="width:${pct(l.fact,l.planned)}%"></b></i>`:''}</li>`).join('')}</ul>`:''}
 <dl class="dash-legend budget-purchases"><div><dt><i class="sw sw-request"></i>Закупівлі чекають погодження</dt><dd>${money(purch.requested)}</dd></div><div><dt><i class="sw sw-approved"></i>Погоджено, не оплачено</dt><dd>${money(purch.approved-purch.paid)}</dd></div></dl>
 <p class="dash-note">Факт Google і Meta — з кабінетів (агент «Аналітик»), решта — з оплачених закупівель.</p></article>`;
}

function needsMarkup(m){
 const groups=[
  ['Закупівлі на погодження',m.purchases.pending,t=>`<button data-open-task="${h(t.id)}"><strong>${h(t.purchase.placement)}</strong><span>${money(t.purchase.amount)} · ${h(t.assignee)}</span></button>`],
  ['Результати на приймання',m.review,t=>`<button data-open-task="${h(t.id)}"><strong>${h(t.title)}</strong><span>${h(t.assignee)}</span></button>`],
  ['Рішення',m.decisions,r=>`<button data-record-module="decisions" data-record-id="${h(r.id)}"><strong>${h(r.title)}</strong><span>${h(r.agent?'від агента':r.owner||'')}</span></button>`],
  ['Пости від агента — взяти в роботу',m.drafts,r=>`<button data-record-module="content" data-record-id="${h(r.id)}"><strong>${h(r.title)}</strong><span>${h(r.channel||r.format||'')}</span></button>`]];
 const total=groups.reduce((s,g)=>s+g[1].length,0);
 return `<article class="dash-card dash-needs"><h2>Чекає на тебе <span class="count">${total}</span></h2>${total?groups.filter(g=>g[1].length).map(([label,items,row])=>`<section><h3>${h(label)} · ${items.length}</h3><div class="dash-list">${items.slice(0,3).map(row).join('')}${items.length>3?`<p class="dash-note">і ще ${items.length-3}</p>`:''}</div></section>`).join(''):'<p class="dash-empty">Черга порожня. Усі рішення ухвалені, результати прийняті.</p>'}</article>`;
}

function teamMarkup(m){
 const max=Math.max(1,...m.people.map(p=>p.total));
 return `<article class="dash-card"><h2>Команда зараз</h2><ul class="team-bars">${m.people.map(p=>`<li><button data-assignee="${h(p.name)}" class="team-row"><span class="team-name">${h(p.name)}</span><span class="bar" style="--w:${Math.round(p.total/max*100)}%">${['progress','review','blocked','todo'].map(k=>p[k]?`<i class="seg seg-${k}" style="flex:${p[k]}" title="${h({progress:'в роботі',review:'на прийманні',blocked:'заблоковано',todo:'до роботи'}[k])}: ${p[k]}"></i>`:'').join('')}</span><span class="team-count">${p.total}${p.overdue?` <em>${p.overdue} простроч.</em>`:''}</span></button></li>`).join('')}</ul><p class="dash-legend-inline"><i class="sw seg-progress"></i>в роботі <i class="sw seg-review"></i>на прийманні <i class="sw seg-blocked"></i>заблоковано <i class="sw seg-todo"></i>до роботи</p></article>`;
}

function deadlinesMarkup(m){
 const row=t=>`<button data-open-task="${h(t.id)}"><time>${h(t.due.slice(8,10)+'.'+t.due.slice(5,7))}</time><strong>${h(t.title)}</strong><span>${h(t.assignee)}</span></button>`;
 return `<article class="dash-card"><h2>Дедлайни</h2>${m.overdue.length?`<h3 class="late">Прострочено · ${m.overdue.length}</h3><div class="dash-list dated late-list">${m.overdue.slice(0,6).map(row).join('')}</div>`:''}<h3>Найближчі 7 днів · ${m.soon.length}</h3>${m.soon.length?`<div class="dash-list dated">${m.soon.map(row).join('')}</div>`:'<p class="dash-note">На тиждень дедлайнів немає.</p>'}</article>`;
}

function insightsMarkup(m){
 return `<article class="dash-card dash-insights"><h2>Що помітили агенти</h2>${m.insights.length?m.insights.map(r=>`<button data-record-module="insights" data-record-id="${h(r.id)}"><time>${h(new Date(r.agentUpdatedAt).toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'}))}</time><strong>${h(r.title)}</strong></button>`).join(''):'<p class="dash-note">Нових спостережень немає.</p>'}</article>`;
}

export function dashboardMarkup(m){
 const months=m.recent.map(s=>`<button data-dash-month="${h(s.month)}" aria-pressed="${s.month===m.selected}" class="chip">${h(monthLabel(s.month))}${s.partial?'*':''}</button>`).join('');
 return `<div class="dash">
 <div class="dash-months" role="group" aria-label="Місяць">${months}<span class="dash-note">* поточний місяць, дані неповні</span></div>
 <section class="dash-hero"><div class="dash-hero-head"><h2>${h(monthLabel(m.selected,true))}: гроші → заявки</h2><p>${m.cur.spend==null?'За цей місяць агенти ще не внесли витрат.':`Разом ${fmt(m.cur.spend)} грн${m.cur.leads?` · ${fmt(m.cur.leads)} заявок`:''}. Заявки — за даними кабінетів, без звірки з ВП.`}</p></div>${m.threads.length?m.threads.map(threadMarkup).join(''):'<p class="dash-empty">Немає даних каналів за цей місяць.</p>'}</section>
 <div class="dash-grid two-one"><article class="dash-card"><h2>Витрати й заявки за рік</h2>${spendChart(m.series)}<p class="dash-legend-inline"><i class="sw" style="background:var(--c-google)"></i>Google Ads <i class="sw" style="background:var(--c-chats)"></i>Чати ЖК <i class="sw" style="background:var(--c-meta)"></i>Meta Ads <i class="dot"></i>заявки <span class="no-leads">?</span> заявки не відстежувались</p></article>${budgetMarkup(m)}</div>
 <div class="dash-grid two-one">${needsMarkup(m)}${insightsMarkup(m)}</div>
 <div class="dash-grid halves">${teamMarkup(m)}${deadlinesMarkup(m)}</div>
 </div>`;
}
