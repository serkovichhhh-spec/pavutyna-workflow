import {escapeHtml as h} from './metrics.js';

// Наружка: банери (власні розміщення) і білборди (агенція) — один реєстр cmo.ooh_placements.
export const kindLabel={banner:'Банер',billboard:'Білборд',other:'Інше'};
export const statusLabel={planned:'План',ordered:'Замовлено',installed:'Встановлено',active:'Висить',removed:'Знято',cancelled:'Скасовано'};
const live=new Set(['installed','active']);
const fmt=n=>Number(n||0).toLocaleString('uk-UA').replace(/ | /g,' ');
export const dateUa=v=>{if(!v)return '';const [y,m,d]=String(v).slice(0,10).split('-');return d?`${d}.${m}.${y}`:v;};

export function oohSummary(items){
 const by=k=>items.filter(i=>i.kind===k),banners=by('banner'),boards=by('billboard');
 const last=banners.map(b=>b.installed_on).filter(Boolean).sort().at(-1);
 const areas=new Map();for(const b of banners){const a=b.area||'Без району';areas.set(a,(areas.get(a)||0)+1);}
 return {banners:banners.length,bannersLive:banners.filter(b=>live.has(b.status)).length,lastBanner:last||null,
  boards:boards.length,boardsLive:boards.filter(b=>live.has(b.status)).length,boardsOrdered:boards.filter(b=>b.status==='ordered').length,
  boardsBudget:boards.filter(b=>b.status!=='cancelled').reduce((s,b)=>s+Number(b.price||0),0),
  areas:[...areas].sort((a,b)=>b[1]-a[1])};
}

// Web Mercator у пікселях світу для зуму z (тайли 256 px).
export function project(lat,lng,z){const s=256*2**z,r=Math.sin(lat*Math.PI/180);return {x:(lng+180)/360*s,y:(0.5-Math.log((1+r)/(1-r))/(4*Math.PI))*s};}
export function fitZoom(points,w,hgt,pad=40,max=15,min=9){
 for(let z=max;z>min;z--){const p=points.map(q=>project(q.lat,q.lng,z)),xs=p.map(q=>q.x),ys=p.map(q=>q.y);
  if(Math.max(...xs)-Math.min(...xs)<=w-pad*2&&Math.max(...ys)-Math.min(...ys)<=hgt-pad*2)return z;}
 return min;
}

export function mapMarkup(points,w,hgt,z){
 if(!points.length)return '';
 const p=points.map(q=>({...q,...project(q.lat,q.lng,z)})),cx=(Math.min(...p.map(q=>q.x))+Math.max(...p.map(q=>q.x)))/2,cy=(Math.min(...p.map(q=>q.y))+Math.max(...p.map(q=>q.y)))/2;
 const left=cx-w/2,top=cy-hgt/2,n=2**z,tiles=[];
 for(let tx=Math.floor(left/256);tx<=Math.floor((left+w)/256);tx++)for(let ty=Math.floor(top/256);ty<=Math.floor((top+hgt)/256);ty++){
  if(ty<0||ty>=n)continue;const sub='abcd'[(tx+ty)&3];
  tiles.push(`<img alt="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" src="https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${((tx%n)+n)%n}/${ty}.png" style="left:${Math.round(tx*256-left)}px;top:${Math.round(ty*256-top)}px">`);}
 const pins=p.map(q=>`<button type="button" class="ooh-pin ${q.kind}" data-id="${h(q.id)}" style="left:${Math.round(q.x-left)}px;top:${Math.round(q.y-top)}px" title="${h([kindLabel[q.kind],q.area,q.address,dateUa(q.installed_on)].filter(Boolean).join(' · '))}"><span>${h(String(q.n))}</span></button>`).join('');
 return `<div class="ooh-tiles">${tiles.join('')}</div>${pins}<small class="ooh-attr">© OpenStreetMap · © CARTO</small>`;
}

const gmaps=i=>i.lat!=null?`https://www.google.com/maps?q=${i.lat},${i.lng}`:i.address?`https://www.google.com/maps/search/${encodeURIComponent('Київ, '+i.address.replace(/\(.*?\)/g,''))}`:'';

const photosOf=i=>Array.isArray(i.photos)?i.photos:[];
export function photoStrip(i,max=3){
 const ph=photosOf(i);if(!ph.length)return '';
 return `<div class="ooh-photos" data-gallery="${h(i.id)}">${ph.slice(0,max).map((p,k)=>`<button type="button" class="ooh-thumb" data-gallery="${h(i.id)}" data-index="${k}" aria-label="Фото ${k+1}: ${h(p.name||'')}"><img alt="" data-photo="${h(p.path)}"></button>`).join('')}${ph.length>max?`<button type="button" class="ooh-more" data-gallery="${h(i.id)}" data-index="${max}">+${ph.length-max}</button>`:''}</div>`;
}
export const photoPath=(id,name,now=Date.now())=>`${id}/${now}-${String(name||'photo.jpg').normalize('NFKD').replace(/[^\w.-]+/g,'_').slice(-80)}`;

export function rowsMarkup(items,canEdit){
 if(!items.length)return '<p class="empty">Поки порожньо.</p>';
 return `<div class="table-scroll"><table class="ooh-table"><thead><tr><th>№</th><th>Тип</th><th>Де</th><th>Формат</th><th>Дата / період</th><th>Статус</th><th>Хто ставив / агенція</th><th>Ціна</th><th></th></tr></thead><tbody>${items.map(i=>{
  const when=i.period_from||i.period_to?`${dateUa(i.period_from)||'…'} — ${dateUa(i.period_to)||'…'}`:dateUa(i.installed_on);
  const map=gmaps(i);
  return `<tr data-id="${h(i.id)}"><td>${h(String(i.n))}</td><td><span class="ooh-kind ${i.kind}">${h(kindLabel[i.kind]||i.kind)}</span><small>${h(i.code||'')}</small></td>
  <td class="ooh-where"><b>${h(i.area||'—')}</b>${i.address?`<span>${h(i.address)}</span>`:''}${i.note?`<em>${h(i.note)}</em>`:''}${photoStrip(i)}</td>
  <td>${h(i.format||'')}</td><td>${h(when||'—')}</td><td><span class="ooh-status ${h(i.status)}">${h(statusLabel[i.status]||i.status)}</span></td>
  <td>${h(i.contractor||'—')}</td><td>${i.price?fmt(i.price)+' грн':'—'}</td>
  <td><div class="ooh-links">${map?`<a href="${h(map)}" target="_blank" rel="noopener">Карта</a>`:''}${i.link?`<a href="${h(i.link)}" target="_blank" rel="noopener">Площина</a>`:''}${i.photo?`<a href="${h(i.photo)}" target="_blank" rel="noopener">Фото</a>`:''}${canEdit?`<button type="button" data-edit="${h(i.id)}">Змінити</button>`:''}</div></td></tr>`;}).join('')}</tbody></table></div>`;
}

function formMarkup(i={}){
 const v=k=>h(i[k]??''),opt=(map,cur)=>Object.entries(map).map(([k,l])=>`<option value="${k}" ${k===cur?'selected':''}>${l}</option>`).join('');
 return `<form class="ooh-form"><input type="hidden" name="id" value="${v('id')}">
 <div class="form-row"><label>Тип<select name="kind">${opt(kindLabel,i.kind||'billboard')}</select></label><label>Статус<select name="status">${opt(statusLabel,i.status||'planned')}</select></label><label>Код / №<input name="code" value="${v('code')}"></label></div>
 <div class="form-row"><label>Район / СТ / ЖК<input name="area" value="${v('area')}"></label><label>Формат<input name="format" value="${v('format')}" placeholder="6×3 щит"></label></div>
 <label>Адреса<input name="address" value="${v('address')}"></label>
 <div class="form-row"><label>Широта<input name="lat" inputmode="decimal" value="${v('lat')}"></label><label>Довгота<input name="lng" inputmode="decimal" value="${v('lng')}"></label></div>
 <div class="form-row"><label>Встановлено<input type="date" name="installed_on" value="${v('installed_on')}"></label><label>Період з<input type="date" name="period_from" value="${v('period_from')}"></label><label>по<input type="date" name="period_to" value="${v('period_to')}"></label></div>
 <div class="form-row"><label>Ціна, грн<input type="number" min="0" step="1" name="price" value="${v('price')}"></label><label>Хто ставив / агенція<input name="contractor" value="${v('contractor')}"></label></div>
 <div class="form-row"><label>Посилання на площину<input name="link" value="${v('link')}"></label><label>Фотозвіт (посилання)<input name="photo" value="${v('photo')}"></label></div>
 <label>Нотатка<textarea name="note" rows="2">${v('note')}</textarea></label><p class="space-error" role="status"></p><button>Зберегти</button></form>
 ${i.id?`<section class="ooh-photo-edit"><h3>Фотозвіт <small>${photosOf(i).length} фото</small></h3><div class="ooh-photo-grid">${photosOf(i).map(p=>`<figure><img alt="" data-photo="${h(p.path)}"><figcaption>${h(p.name||'')}</figcaption><button type="button" data-photo-remove="${h(p.path)}" aria-label="Прибрати фото">×</button></figure>`).join('')}</div>
 <label class="ooh-photo-add">+ Додати фото<input type="file" class="ooh-photo-input" accept="image/jpeg,image/png,image/webp" multiple hidden></label><p class="ooh-photo-status" role="status"></p></section>`:'<p class="space-source">Фото можна додати після збереження носія.</p>'}`;
}

export function mountOoh(root,{request,notice,storage}){
 let items=[],canEdit=false,filter='all',zoomDelta=0;
 const blobs=new Map();
 async function photoUrl(path){
  if(path.startsWith('/'))return path; // фото, що лежать у самому Workspace (звіти агенції)
  if(blobs.has(path))return blobs.get(path);
  const p=(async()=>{const res=await fetch(`${storage.url}/storage/v1/object/authenticated/cmo-ooh-photos/${path.split('/').map(encodeURIComponent).join('/')}`,{headers:{apikey:storage.key,Authorization:'Bearer '+await storage.token()}});
   if(!res.ok)throw Error('Фото недоступне');return URL.createObjectURL(await res.blob());})();
  blobs.set(path,p);p.catch(()=>blobs.delete(path));return p;
 }
 function hydrate(scope){scope.querySelectorAll('img[data-photo]:not([src])').forEach(img=>{if(!storage)return;photoUrl(img.dataset.photo).then(u=>{img.src=u;}).catch(()=>img.closest('button,figure')?.classList.add('broken'));});}
 async function uploadPhotos(id,files,status){
  let ok=0;const list=[...files];
  for(const f of list){
   if(!/^image\/(jpeg|png|webp)$/.test(f.type)){status.textContent=`${f.name}: лише JPG, PNG або WebP`;continue;}
   status.textContent=`Завантаження ${ok+1} з ${list.length}…`;
   const path=photoPath(id,f.name,Date.now()+ok);
   const res=await fetch(`${storage.url}/storage/v1/object/cmo-ooh-photos/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:storage.key,Authorization:'Bearer '+await storage.token(),'Content-Type':f.type,'x-upsert':'false'},body:f});
   if(!res.ok){const e=await res.json().catch(()=>({}));throw Error(`${f.name}: ${e.message||e.error||'не вдалося завантажити'}`);}
   await request({op:'photo_add',id,path,name:f.name});ok++;
  }
  status.textContent=ok?`Додано фото: ${ok}`:status.textContent;return ok;
 }
 function gallery(id,index=0){
  const it=items.find(i=>i.id===id);if(!it)return;const ph=photosOf(it);if(!ph.length)return;
  let k=Math.min(index,ph.length-1);const dlg=box.querySelector('.ooh-gallery');
  const show=()=>{const p=ph[k];dlg.querySelector('h2').textContent=`${kindLabel[it.kind]} ${it.code||''} · фото ${k+1} з ${ph.length}`;
   dlg.querySelector('.ooh-gallery-body').innerHTML=`<img alt="${h(p.name||'')}" data-photo="${h(p.path)}"><p class="space-source">${h([it.address||it.area,p.name,p.added_at?dateUa(p.added_at):''].filter(Boolean).join(' · '))}</p>`;hydrate(dlg);};
  dlg.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.step){k=(k+Number(b.dataset.step)+ph.length)%ph.length;show();}else if('close' in b.dataset)dlg.close();};
  show();dlg.showModal();
 }
 root.innerHTML='<div class="ooh"><p>Завантаження…</p></div>';
 const box=root.querySelector('.ooh');
 function numbered(){let b=0,o=0;return items.map(i=>({...i,n:i.kind==='billboard'?'Б'+(++o):String(++b)}));}
 function render(){
  const all=numbered(),s=oohSummary(items),shown=all.filter(i=>filter==='all'||i.kind===filter),points=shown.filter(i=>i.lat!=null&&i.lng!=null);
  box.innerHTML=`<div class="stats ooh-stats">
   <div class="stat"><strong>${s.bannersLive}</strong><span>банерів висить${s.banners>s.bannersLive?` із ${s.banners}`:''}${s.lastBanner?` · останній ${dateUa(s.lastBanner)}`:''}</span></div>
   <div class="stat"><strong>${s.boards}</strong><span>білбордів 6×3 · ${s.boardsOrdered} замовлено, ${s.boardsLive} висить</span></div>
   <div class="stat"><strong>${fmt(s.boardsBudget)} грн</strong><span>білборди за підбіркою агенції</span></div>
   <div class="stat"><strong>${s.areas.length}</strong><span>районів з банерами: ${h(s.areas.slice(0,3).map(([a,n])=>`${a} ${n}`).join(', '))}</span></div></div>
  <div class="ooh-toolbar"><div class="ooh-filter" role="group" aria-label="Тип носія">${[['all','Усе'],['banner','Банери'],['billboard','Білборди']].map(([k,l])=>`<button type="button" data-filter="${k}" class="${k===filter?'active':''}" aria-pressed="${k===filter}">${l}</button>`).join('')}</div>${canEdit?'<button type="button" class="primary" data-add>+ Носій</button>':''}</div>
  ${points.length?`<div class="ooh-map-wrap"><div class="ooh-map" aria-label="Карта розміщень"></div><div class="ooh-zoom"><button type="button" data-z="1" aria-label="Наблизити">+</button><button type="button" data-z="-1" aria-label="Віддалити">−</button></div><p class="space-source">${points.length} з ${shown.length} на карті${shown.length>points.length?' — для білбордів координати ще не внесені, відкривай «Карта» в рядку':''}.</p></div>`:''}
  ${rowsMarkup(shown,canEdit)}
  <dialog class="ooh-dialog"><div class="dialog-head"><h2>Носій</h2><button type="button" data-close aria-label="Закрити">×</button></div><div class="ooh-dialog-body"></div></dialog>
  <dialog class="ooh-gallery"><div class="dialog-head"><h2>Фото</h2><button type="button" data-close aria-label="Закрити">×</button></div><div class="ooh-gallery-body"></div><div class="ooh-gallery-nav"><button type="button" data-step="-1">← Попереднє</button><button type="button" data-step="1">Наступне →</button></div></dialog>`;
  drawMap(points);hydrate(box);
 }
 function drawMap(points){
  const map=box.querySelector('.ooh-map');if(!map)return;
  const w=map.clientWidth||900,hgt=map.clientHeight||420,z=Math.min(17,Math.max(8,fitZoom(points,w,hgt)+zoomDelta));
  map.innerHTML=mapMarkup(points,w,hgt,z);
 }
 function edit(id){
  const dlg=box.querySelector('.ooh-dialog'),body=dlg.querySelector('.ooh-dialog-body'),it=items.find(i=>i.id===id)||{kind:filter==='banner'?'banner':'billboard'};
  dlg.querySelector('h2').textContent=id?`${kindLabel[it.kind]} ${it.code||''}`:'Новий носій';body.innerHTML=formMarkup(it);dlg.showModal();
  body.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),err=e.target.querySelector('.space-error'),btn=e.target.querySelector('button');
   for(const k of ['lat','lng'])f[k]=String(f[k]).replace(',','.').trim();
   btn.disabled=true;try{await request({op:'save',item:f});dlg.close();await load();}catch(x){err.textContent=x.message;}finally{btn.disabled=false;}});
  hydrate(body);
  const input=body.querySelector('.ooh-photo-input'),status=body.querySelector('.ooh-photo-status');
  input?.addEventListener('change',async()=>{if(!input.files.length)return;input.disabled=true;
   try{await uploadPhotos(id,input.files,status);await load();reopen(id,status.textContent);}catch(x){await load();reopen(id,x.message);}finally{input.disabled=false;input.value='';}});
  body.querySelectorAll('[data-photo-remove]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;
   try{await request({op:'photo_remove',id,path:b.dataset.photoRemove});await load();reopen(id,'Фото прибрано');}catch(x){status.textContent=x.message;b.disabled=false;}}));
 }
 function reopen(id,msg){edit(id);const st=box.querySelector('.ooh-dialog .ooh-photo-status');if(st&&msg)st.textContent=msg;}
 box.addEventListener('click',e=>{
  const t=e.target.closest('button,tr');if(!t||t.closest('.ooh-dialog-body,.ooh-gallery'))return;
  if(t.dataset.filter){filter=t.dataset.filter;zoomDelta=0;render();}
  else if(t.dataset.z){zoomDelta+=Number(t.dataset.z);const all=numbered().filter(i=>(filter==='all'||i.kind===filter)&&i.lat!=null);drawMap(all);}
  else if(t.dataset.edit)edit(t.dataset.edit);
  else if(t.dataset.gallery)gallery(t.dataset.gallery,Number(t.dataset.index||0));
  else if('add' in t.dataset)edit('');
  else if('close' in t.dataset)t.closest('dialog').close();
  else if(t.classList.contains('ooh-pin')){const row=box.querySelector(`tr[data-id="${CSS.escape(t.dataset.id)}"]`);box.querySelectorAll('tr.hl').forEach(r=>r.classList.remove('hl'));if(row){row.classList.add('hl');row.scrollIntoView({block:'center',behavior:'smooth'});}}
 });
 async function load(){try{const r=await request({op:'list'});items=r.items||[];canEdit=!!r.canEdit;render();}catch(e){box.innerHTML=`<p class="space-error">${h(e.message)}</p>`;notice?.(e.message);}}
 load();
}
