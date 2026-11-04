import {escapeHtml as h} from './metrics.js';

const segmentLabel={apartment:'Квартири',private:'Приватний будинок',dorm:'Гуртожиток',nonresidential:'Нежитлове (ймовірно)'};
const fmt=n=>Number(n||0).toLocaleString('uk-UA').replace(/ /g,' ');

export function coverageRowsMarkup(rows,total){
 if(!rows.length)return '<p class="cov-empty">Адресу не знайдено в базі покриття. Якщо клієнт наполягає — передай заявку у ВП на технічну перевірку.</p>';
 const groups=new Map();for(const r of rows){const k=`${r.locality} · ${r.street_type} ${r.street}`;(groups.get(k)||groups.set(k,[]).get(k)).push(r);}
 return `<p class="cov-count">Знайдено ${fmt(total)}${total>rows.length?`, показано ${rows.length} — уточни номер будинку`:''}</p>`+[...groups].map(([street,list])=>`<section class="cov-street"><h3>${h(street)}</h3><div class="cov-houses">${list.map(r=>`<span class="cov-house ${r.status==='pending'?'pending':''} ${r.segment}" title="${h([segmentLabel[r.segment],r.status==='pending'?'на стадії включення':'підключається',...r.flags.filter(f=>!['П/с','НСВ'].includes(f))].join(' · '))}"><b>${r.building==='*'?'усі будинки':h(r.building)}</b><small>${h(techLabel(r.flags))}${r.segment==='dorm'?' · гурт.':''}${r.segment==='nonresidential'?' · нежитл.':''}${r.status==='pending'?' · скоро':''}</small></span>`).join('')}</div></section>`).join('');
}
export function techLabel(flags){const t=[];if(flags.includes('XGS-PON'))t.push('XGS-PON');else if(flags.includes('GPON')||flags.includes('GPON(п)'))t.push('GPON');if(flags.includes('ВП'))t.push('Ethernet');return t.join(' + ')||'—';}

export function coverageStatsMarkup(s){
 const seg=s.segments||{},loc=[...(s.localities||[])].sort((a,b)=>b.n-a.n),max=Math.max(1,...(s.topStreets||[]).map(x=>x.n));
 return `<div class="cov-stats">
 <article class="dash-card"><h2>Покриття</h2><p class="dash-big">${fmt(s.total)} <small>адрес у базі · ${h(s.source||'')}</small></p>
 <dl class="dash-legend"><div><dt>Квартири, підключаємо</dt><dd>${fmt(seg.apartment_active)}</dd></div><div><dt>Приватні будинки, підключаємо</dt><dd>${fmt(seg.private_active)}</dd></div><div><dt>На стадії включення</dt><dd>${fmt((seg.apartment_pending||0)+(seg.private_pending||0))}</dd></div><div><dt>Нежитлові й гуртожитки</dt><dd>${fmt((seg.nonresidential_active||0)+(seg.nonresidential_pending||0)+(seg.dorm_active||0)+(seg.dorm_pending||0))}</dd></div><div><dt>XGS-PON (до 10 Гбіт)</dt><dd>${fmt(s.tech?.xgs)}</dd></div></dl></article>
 <article class="dash-card"><h2>Населені пункти</h2><ul class="cov-loc">${loc.map(l=>`<li><span>${h(l.name)}</span><span>${fmt(l.apartment)} кв. · ${fmt(l.private)} прив.${l.pending?` · ${fmt(l.pending)} скоро`:''}</span></li>`).join('')}</ul></article>
 <article class="dash-card"><h2>Найбільше будинків · Київ</h2><ul class="cov-top">${(s.topStreets||[]).map(t=>`<li><span>${h(t.name)}</span><i style="--w:${Math.round(t.n/max*100)}%"></i><b>${fmt(t.n)}</b></li>`).join('')}</ul></article></div>`;
}

export function mountCoverage(root,{request,actor,notice}){
 let timer,seq=0;
 root.innerHTML=`<div class="cov"><form class="cov-search" role="search"><label>Перевірити адресу<input name="q" autocomplete="off" placeholder="Вулиця і будинок, напр. Заболотного 3" required minlength="3"></label><button>Перевірити</button></form><p class="space-source">Закрита база покриття Павутини. Дані не публікуються — лише для команди.</p><div class="cov-results" aria-live="polite"></div>${actor.role==='owner'?'<div class="cov-owner"><p>Завантаження…</p></div>':''}</div>`;
 const results=root.querySelector('.cov-results'),input=root.querySelector('[name=q]');
 async function run(){const q=input.value.trim();if(q.length<3){results.innerHTML='';return;}const my=++seq;try{const r=await request({op:'search',q});if(my===seq)results.innerHTML=coverageRowsMarkup(r.rows,r.total);}catch(e){if(my===seq)results.innerHTML=`<p class="space-error">${h(e.message)}</p>`;}}
 root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);run();});
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(run,350);});
 if(actor.role==='owner')request({op:'stats'}).then(s=>{const box=root.querySelector('.cov-owner');if(box)box.innerHTML=coverageStatsMarkup(s);}).catch(e=>notice(e.message));
 input.focus();
}
