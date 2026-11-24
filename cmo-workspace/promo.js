import {escapeHtml as h} from './metrics.js';

// Промокоди: реєстр кодів для блоку «Маєте промокод?» на pavutyna.ua і посилань pavutyna.ua/КОД.
// Кожен код у Workspace отримує трекінгове посилання l.pavutyna.com/s/promo-<код>, яке керівник вносить в адмінку сайту.
export const channelLabel={zhk_chat:'Чат ЖК',ooh:'Наружка',flyer:'Флаєри / поліграфія',social:'Соцмережі',partner:'Партнер',sales:'ВП / бот',campaign:'Акція',other:'Інше'};
export const statusLabel={new:'Чекає внесення на сайт',live:'Працює',paused:'На паузі',ended:'Завершено'};
export const targets=[
 ['https://pavutyna.ua/ua/Taryfy-dlia-domu.html','Тарифи для квартири'],
 ['https://pavutyna.ua/ua/Taryfy-dlia-pryvatnoho-budynku.html','Тарифи для приватного будинку'],
 ['https://pavutyna.ua/ua/sg.html','Секретний Гігабіт (секретна сторінка)'],
 ['https://pavutyna.ua/','Головна'],
 ['https://t.me/pautina_ua_bot','Telegram-бот']
];
const HEX=/^[0-9A-F]{4,5}$/;
export const normalizeCode=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'');
export function checkCode(code,taken=[]){
 const c=normalizeCode(code);
 if(!c)return {ok:false,msg:''};
 if(!/^[A-Z0-9-]{2,24}$/.test(c))return {ok:false,msg:'Лише латиниця, цифри й дефіс, 2–24 символи'};
 if(taken.includes(c))return {ok:false,msg:`Код ${c} уже є в реєстрі`};
 if(HEX.test(c))return {ok:true,warn:true,msg:'Схоже на реферальний код «Приведи друга» (4–5 символів 0–9, A–F). Працюватиме, але краще слово з іншими літерами: G–Z.'};
 if(c.length>10)return {ok:true,warn:true,msg:'Довгий код важко ввести з білборда чи з телефона. Краще до 8 символів.'};
 return {ok:true,msg:`Працюватиме і в полі на головній, і як pavutyna.ua/${c}`};
}
// Пропозиція коду з назви/коду джерела: «faina-town» → FAINA, «K218b» → BK218B. Не hex-подібний і не зайнятий.
export function suggestCode(seed,taken=[],prefix=''){
 const map={а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia'};
 const lat=String(seed||'').toLowerCase().replace(/^жк\s+/,'').split('').map(ch=>map[ch]??ch).join('');
 const words=lat.split(/[^a-z0-9]+/).filter(Boolean);
 let base=(prefix+(words[0]||'promo')).toUpperCase().slice(0,8);
 if(words[0]&&words[0].length<4&&words[1])base=(prefix+words[0]+words[1]).toUpperCase().slice(0,8);
 if(HEX.test(base))base=('P'+base).slice(0,8);
 let c=base,n=2;while(taken.includes(c))c=base.slice(0,7)+n++;
 return c;
}
const short=u=>String(u||'').replace(/^https:\/\//,'').replace(/\/$/,'');
export const siteLine=i=>`${i.code}  ${i.trackUrl||i.target_url}  "${[channelLabel[i.channel],i.zhkName||oohName(i.ooh),i.campaign].filter(Boolean).join(' · ')}"`;
export const oohName=o=>o?[o.kind==='billboard'?'Білборд':'Банер',o.code,o.area||o.address].filter(Boolean).join(' '):'';
// Що робити керівнику з кодом на сайті.
export function siteState(i){
 if(i.status==='new')return {todo:'add',line:siteLine(i)};
 if(i.status==='live'&&i.trackUrl&&i.site_target&&short(i.site_target)!==short(i.trackUrl))return {todo:'update',line:siteLine(i)};
 return {todo:null};
}
export function salesText(items,settings={}){
 const live=items.filter(i=>i.status==='live');
 return ['ПРОМОКОДИ PAVUTYNA — шпаргалка для ВП і бота',settings.sales_note||'','',
  ...live.map(i=>`${i.code} — ${i.offer||'без опису'}${i.campaign?` (акція: ${i.campaign})`:''}${i.period_to?`, до ${dateUa(i.period_to)}`:''}`),'',
  'Реферальні коди «Приведи друга»: '+(settings.referral_bonus||''),settings.referral_rule||''].filter((l,k,a)=>l!==''||a[k-1]!=='').join('\n').trim();
}
export const dateUa=v=>{if(!v)return '';const [y,m,d]=String(v).slice(0,10).split('-');return d?`${d}.${m}.${y}`:v;};
const hits=i=>i.tracking?.kind==='none'?'<span class="promo-muted" title="Код веде на сайт напряму — переходи не рахуються">не рахується</span>':`<b>${i.stats?.d7??0}</b> / ${i.stats?.d30??0} / ${i.stats?.total??0}`;

export function rowsMarkup(items,{isOwner,actor}={}){
 if(!items.length)return '<p class="empty">Кодів ще немає.</p>';
 return `<div class="table-scroll"><table class="promo-table"><thead><tr><th>Код</th><th>Де використовується</th><th>Що отримує людина</th><th>Статус</th><th title="Переходи: 7 днів / 30 днів / всього">Переходи 7/30/всього</th><th></th></tr></thead><tbody>${items.map(i=>{
  const where=[channelLabel[i.channel]||i.channel,i.zhkName,oohName(i.ooh),i.campaign].filter(Boolean),mine=i.created_by===actor?.name&&i.status==='new';
  return `<tr data-code="${h(i.code)}"><td><strong class="promo-code">${h(i.code)}</strong><small>pavutyna.ua/${h(i.code)}</small></td>
  <td>${h(where.join(' · '))}${i.owner?`<small>відп.: ${h(i.owner)}</small>`:''}</td>
  <td class="promo-offer">${h(i.offer||'—')}${i.period_from||i.period_to?`<small>${h(dateUa(i.period_from)||'…')} — ${h(dateUa(i.period_to)||'…')}</small>`:''}${i.note?`<em>${h(i.note)}</em>`:''}</td>
  <td><span class="promo-status ${h(i.status)}">${h(statusLabel[i.status]||i.status)}</span></td><td>${hits(i)}</td>
  <td><div class="ooh-links"><button type="button" data-copy="pavutyna.ua/${h(i.code)}">Копіювати</button>${isOwner||mine?`<button type="button" data-edit="${h(i.code)}">Змінити</button>`:''}${isOwner&&i.status==='live'?`<button type="button" data-status="paused" data-code="${h(i.code)}">Пауза</button>`:''}${isOwner&&i.status==='paused'?`<button type="button" data-status="live" data-code="${h(i.code)}">Увімкнути</button>`:''}${isOwner&&['live','paused'].includes(i.status)?`<button type="button" data-status="ended" data-code="${h(i.code)}">Завершити</button>`:''}</div></td></tr>`;}).join('')}</tbody></table></div>`;
}

export function siteBlock(items){
 const todo=items.map(i=>({i,s:siteState(i)})).filter(x=>x.s.todo);
 if(!todo.length)return '';
 const add=todo.filter(x=>x.s.todo==='add'),upd=todo.filter(x=>x.s.todo==='update');
 return `<article class="space-card promo-site"><h2>Внести в адмінку сайту</h2><p class="space-source">pavutyna.ua → адмінка → Налаштування → <b>Редиректи</b>. Встав рядки в кінець списку й збережи, потім натисни «Внесено». Адреса веде через l.pavutyna.com — так рахуються переходи.</p>
 ${add.length?`<h3>Нові коди · ${add.length}</h3><textarea readonly rows="${Math.min(8,add.length+1)}" class="promo-lines">${h(add.map(x=>x.s.line).join('\n'))}</textarea><div class="ooh-links"><button type="button" data-copy-lines="add">Копіювати рядки</button><button type="button" class="primary" data-mark-live="${h(add.map(x=>x.i.code).join(','))}">Внесено на сайт</button></div>`:''}
 ${upd.length?`<h3>Замінити адресу · ${upd.length}</h3><p class="space-source">Ці коди вже працюють, але ведуть на сайт напряму, без лічильника. Заміни в адмінці їхні рядки на ці:</p><textarea readonly rows="${Math.min(6,upd.length+1)}" class="promo-lines">${h(upd.map(x=>x.s.line).join('\n'))}</textarea><div class="ooh-links"><button type="button" data-copy-lines="update">Копіювати рядки</button><button type="button" class="primary" data-mark-live="${h(upd.map(x=>x.i.code).join(','))}">Замінив на сайті</button></div>`:''}</article>`;
}

function formMarkup(i,data,preset={}){
 const v=k=>h((i[k]??preset[k])??''),cur=i.code?i:{...preset},sel=(k,opts)=>opts.map(([val,l])=>`<option value="${h(val)}" ${String(cur[k]??'')===val?'selected':''}>${h(l)}</option>`).join('');
 const tgt=cur.target_url||targets[0][0],known=targets.some(([u])=>u===tgt);
 return `<form class="promo-form"><input type="hidden" name="original" value="${h(i.code||'')}">
 <div class="form-row"><label>Код<input name="code" value="${v('code')}" ${i.code?'readonly':''} autocomplete="off" maxlength="24" required placeholder="FAINA"><small class="promo-check"></small></label>
 <label>Канал<select name="channel">${sel('channel',Object.entries(channelLabel))}</select></label></div>
 <label class="promo-zhk">Чат ЖК<select name="zhk_source"><option value="">—</option>${sel('zhk_source',data.zhk.map(z=>[z.code,z.name]))}</select></label>
 <label class="promo-ooh">Носій наружки<select name="ooh_id"><option value="">—</option>${sel('ooh_id',data.ooh.map(o=>[o.id,oohName(o)+(o.address&&o.area?` · ${o.address}`:'')]))}</select></label>
 <label>Куди веде<select name="target_pick">${targets.map(([u,l])=>`<option value="${h(u)}" ${u===tgt?'selected':''}>${h(l)}</option>`).join('')}<option value="" ${known?'':'selected'}>Інша сторінка…</option></select></label>
 <label class="promo-custom" ${known?'hidden':''}>Адреса сторінки<input name="target_url" value="${h(tgt)}" placeholder="https://pavutyna.ua/ua/…"></label>
 <label>Що отримує людина (для ВП і бота)<input name="offer" value="${v('offer')}" maxlength="300" placeholder="Тарифи для квартири, підключення 1 грн"></label>
 <div class="form-row"><label>Акція / кампанія<input name="campaign" value="${v('campaign')}" maxlength="120"></label><label>Відповідальний<select name="owner">${sel('owner',data.team.map(n=>[n,n]))}</select></label></div>
 <div class="form-row"><label>Діє з<input type="date" name="period_from" value="${v('period_from')}"></label><label>по<input type="date" name="period_to" value="${v('period_to')}"></label></div>
 <label>Нотатка<textarea name="note" rows="2" maxlength="1000">${v('note')}</textarea></label>
 <p class="space-error" role="status"></p><div class="ooh-links"><button>Зберегти</button>${i.code&&i.status==='new'?'<button type="button" data-delete>Видалити</button>':''}</div></form>`;
}

export function mountPromo(root,{request,notice,tab='promo_codes'}){
 let data={items:[],zhk:[],ooh:[],team:[],settings:{},isOwner:false,actor:null};
 root.innerHTML='<div class="promo"><p>Завантаження…</p></div>';
 const box=root.querySelector('.promo');
 const taken=()=>data.items.map(i=>i.code);
 const copy=async t=>{try{await navigator.clipboard.writeText(t);notice?.('Скопійовано');}catch{notice?.('Не вдалося скопіювати — виділи текст вручну');}};
 function stats(){
  const live=data.items.filter(i=>i.status==='live'),waiting=data.items.filter(i=>siteState(i).todo).length,d30=data.items.reduce((s,i)=>s+(i.stats?.d30||0),0);
  return `<div class="stats"><div class="stat"><strong>${live.length}</strong><span>кодів працює</span></div><div class="stat"><strong>${waiting}</strong><span>чекають дії на сайті</span></div><div class="stat"><strong>${d30}</strong><span>переходів за 30 днів</span></div><div class="stat"><strong>${data.items.filter(i=>i.channel==='zhk_chat').length} / ${data.items.filter(i=>i.channel==='ooh').length}</strong><span>кодів у чатах ЖК / на наружці</span></div></div>`;
 }
 const how=`<details class="promo-how"><summary>Як це працює</summary><ol><li>Створюєш код тут: який, де використовується, куди веде, що отримує людина.</li><li>Дмитро вносить його в адмінку сайту (Налаштування → Редиректи) — до того код на сайті не працює.</li><li>Людина вводить код у полі «Маєте промокод?» на головній або відкриває pavutyna.ua/КОД — потрапляє на потрібну сторінку, а тут +1 перехід.</li><li>Реферальні коди «Приведи друга» сюди не додаємо — сайт розпізнає їх сам.</li></ol></details>`;
 function viewCodes(){
  return `${stats()}${data.isOwner?siteBlock(data.items):''}<div class="ooh-toolbar"><p class="space-source">Код працює в полі «Маєте промокод?» на головній і як посилання pavutyna.ua/КОД.</p><button type="button" class="primary" data-add>+ Новий код</button></div>${how}${rowsMarkup(data.items,data)}`;
 }
 function viewZhk(){
  const by=new Map(data.items.filter(i=>i.zhk_source).map(i=>[i.zhk_source,i]));
  return `<p class="space-source">Окремий код на кожен чат ЖК — тоді видно, з якого чату прийшли люди. У пост пиши: «Промокод <b>КОД</b> на pavutyna.ua» або посилання pavutyna.ua/КОД — воно працює і в картинці, де посилання не клікається.</p>${how}
  <div class="table-scroll"><table class="promo-table"><thead><tr><th>Чат</th><th>Оплата</th><th>Код</th><th>Переходи 7/30/всього</th><th>Текст для поста</th></tr></thead><tbody>${data.zhk.map(z=>{const i=by.get(z.code);
   return `<tr><td><strong>${h(z.name)}</strong><small>${h(z.code)}</small></td><td>${Number(z.cost)>0?h(String(z.cost))+' грн':'—'}</td><td>${i?`<strong class="promo-code">${h(i.code)}</strong><span class="promo-status ${h(i.status)}">${h(statusLabel[i.status])}</span>`:'—'}</td><td>${i?hits(i):''}</td>
   <td>${i?`<button type="button" data-copy="Промокод ${h(i.code)} — введи на pavutyna.ua або відкрий pavutyna.ua/${h(i.code)}">Копіювати</button>`:`<button type="button" data-add data-channel="zhk_chat" data-zhk="${h(z.code)}" data-seed="${h(z.name)}">Створити код</button>`}</td></tr>`;}).join('')}</tbody></table></div>`;
 }
 function viewOoh(){
  const by=new Map(data.items.filter(i=>i.ooh_id).map(i=>[i.ooh_id,i]));
  return `<p class="space-source">Код на білборді чи банері — єдиний спосіб порахувати, скільки людей прийшло саме з цієї точки. Пиши великими літерами: «pavutyna.ua/КОД». Для флаєрів і BTL-акцій без конкретної точки створюй код каналом «Флаєри / поліграфія».</p>${how}
  <div class="ooh-toolbar"><span></span><button type="button" data-add data-channel="flyer">+ Код для флаєрів / BTL</button></div>
  <div class="table-scroll"><table class="promo-table"><thead><tr><th>Носій</th><th>Де</th><th>Код</th><th>Переходи 7/30/всього</th><th></th></tr></thead><tbody>${data.ooh.map(o=>{const i=by.get(o.id);
   return `<tr><td><strong>${h(o.kind==='billboard'?'Білборд':o.kind==='banner'?'Банер':'Інше')} ${h(o.code||'')}</strong></td><td>${h(o.area||'')}<small>${h(o.address||'')}</small></td><td>${i?`<strong class="promo-code">${h(i.code)}</strong><span class="promo-status ${h(i.status)}">${h(statusLabel[i.status])}</span>`:'—'}</td><td>${i?hits(i):''}</td>
   <td>${i?`<button type="button" data-copy="pavutyna.ua/${h(i.code)}">Копіювати</button>`:`<button type="button" data-add data-channel="ooh" data-ooh="${h(o.id)}" data-seed="${h(o.code||o.area||'ooh')}" data-prefix="${o.kind==='billboard'?'B':'X'}">Створити код</button>`}</td></tr>`;}).join('')}
  ${data.items.filter(i=>i.channel==='flyer').map(i=>`<tr><td><strong>Флаєри / BTL</strong></td><td>${h(i.campaign||'')}</td><td><strong class="promo-code">${h(i.code)}</strong><span class="promo-status ${h(i.status)}">${h(statusLabel[i.status])}</span></td><td>${hits(i)}</td><td><button type="button" data-copy="pavutyna.ua/${h(i.code)}">Копіювати</button></td></tr>`).join('')}</tbody></table></div>`;
 }
 function viewSales(){
  const s=data.settings,live=data.items.filter(i=>i.status==='live'),ed=k=>data.isOwner?`<button type="button" data-setting="${k}">Змінити</button>`:'';
  return `<div class="space-grid"><article class="space-card"><h2>Якщо абонент назвав код</h2><p>${h(s.sales_note||'')}</p>${ed('sales_note')}</article>
  <article class="space-card"><h2>Реферальні коди «Приведи друга»</h2><p><b>${h(s.referral_bonus||'')}</b></p>${ed('referral_bonus')}<p class="space-source">${h(s.referral_rule||'')}</p>${ed('referral_rule')}</article></div>
  <div class="ooh-toolbar"><p class="space-source">Ці коди зараз працюють на сайті. Надішли текст Михайлу (ВП) і завантаж у бота — щоразу, коли список змінюється.</p><button type="button" class="primary" data-copy-sales>Копіювати шпаргалку</button></div>
  <div class="table-scroll"><table class="promo-table"><thead><tr><th>Код</th><th>Що оформити</th><th>Акція</th><th>Діє</th></tr></thead><tbody>${live.map(i=>`<tr><td><strong class="promo-code">${h(i.code)}</strong></td><td class="promo-offer">${h(i.offer||'—')}</td><td>${h(i.campaign||'')}</td><td>${h(i.period_to?'до '+dateUa(i.period_to):'без терміну')}</td></tr>`).join('')||'<tr><td colspan="4">Немає активних кодів</td></tr>'}</tbody></table></div>`;
 }
 function render(){
  box.innerHTML=({promo_zhk:viewZhk,promo_ooh:viewOoh,promo_sales:viewSales}[tab]||viewCodes)()+`<dialog class="promo-dialog"><div class="dialog-head"><h2>Код</h2><button type="button" data-close aria-label="Закрити">×</button></div><div class="promo-dialog-body"></div></dialog>`;
 }
 function edit(code,preset={}){
  const dlg=box.querySelector('.promo-dialog'),body=dlg.querySelector('.promo-dialog-body'),it=data.items.find(i=>i.code===code)||{};
  if(!code){preset={owner:data.actor?.name,...preset};if(preset.seed)preset.code=suggestCode(preset.seed,taken(),preset.prefix||'');}
  dlg.querySelector('h2').textContent=code?`Код ${code}`:'Новий промокод';body.innerHTML=formMarkup(it,data,preset);dlg.showModal();
  const f=body.querySelector('form'),check=f.querySelector('.promo-check'),sync=()=>{
   const ch=f.elements.channel.value;f.querySelector('.promo-zhk').hidden=ch!=='zhk_chat';f.querySelector('.promo-ooh').hidden=ch!=='ooh';
   if(!code){const r=checkCode(f.elements.code.value,taken());check.textContent=r.msg;check.className='promo-check'+(r.ok?(r.warn?' warn':' ok'):' bad');}
  };
  f.elements.target_pick.addEventListener('change',()=>{const custom=f.elements.target_pick.value==='';f.querySelector('.promo-custom').hidden=!custom;if(!custom)f.elements.target_url.value=f.elements.target_pick.value;else f.elements.target_url.focus();});
  f.addEventListener('input',sync);sync();
  f.querySelector('[data-delete]')?.addEventListener('click',async()=>{try{await request({op:'delete',code});dlg.close();await load();notice?.(`Код ${code} видалено`);}catch(x){f.querySelector('.space-error').textContent=x.message;}});
  f.addEventListener('submit',async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f)),err=f.querySelector('.space-error'),btn=f.querySelector('button:not([type])');
   if(!code){const r=checkCode(v.code,taken());if(!r.ok){err.textContent=r.msg||'Вкажи код';return;}}
   if(v.channel!=='zhk_chat')v.zhk_source='';if(v.channel!=='ooh')v.ooh_id='';
   btn.disabled=true;try{await request({op:'save',item:v});dlg.close();await load();notice?.(code?'Збережено':`Код ${normalizeCode(v.code)} створено. ${data.isOwner?'Внеси його в адмінку сайту — блок угорі.':'Дмитро внесе його на сайт; до того код не працює.'}`);}catch(x){err.textContent=x.message;}finally{btn.disabled=false;}});
 }
 box.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.closest('.promo-dialog-body'))return;
  if('close' in b.dataset)return b.closest('dialog').close();
  if(b.dataset.copy)return copy(b.dataset.copy);
  if(b.dataset.copyLines){const which=b.dataset.copyLines;return copy(data.items.filter(i=>siteState(i).todo===which).map(siteLine).join('\n'));}
  if('copySales' in b.dataset)return copy(salesText(data.items,data.settings));
  if('add' in b.dataset)return edit('',{channel:b.dataset.channel,zhk_source:b.dataset.zhk,ooh_id:b.dataset.ooh,seed:b.dataset.seed,prefix:b.dataset.prefix});
  if(b.dataset.edit)return edit(b.dataset.edit);
  try{b.disabled=true;
   if(b.dataset.markLive){for(const code of b.dataset.markLive.split(',')){const i=data.items.find(x=>x.code===code);await request({op:'status',code,status:'live',site_target:i?.trackUrl||i?.site_target||''});}notice?.('Готово: коди працюють на сайті');await load();}
   else if(b.dataset.status){const st=b.dataset.status;if(st==='ended'&&!confirmEnd(b.dataset.code))return;await request({op:'status',code:b.dataset.code,status:st});await load();if(st!=='live')notice?.(`Не забудь прибрати рядок ${b.dataset.code} з адмінки сайту, інакше код і далі працюватиме.`);}
   else if(b.dataset.setting){const k=b.dataset.setting,val=window.prompt('Новий текст',data.settings[k]||'');if(val!==null){await request({op:'setting',key:k,value:val});await load();}}
  }catch(x){notice?.(x.message);}finally{b.disabled=false;}
 });
 const confirmEnd=code=>window.confirm(`Завершити код ${code}? Він залишиться в історії з переходами.`);
 async function load(){try{data=await request({op:'list'});render();}catch(e){box.innerHTML=`<p class="space-error">${h(e.message)}</p>`;notice?.(e.message);}}
 load();
}
