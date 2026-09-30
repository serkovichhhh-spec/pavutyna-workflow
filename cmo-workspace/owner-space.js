import {escapeHtml as h} from './metrics.js';
const sections={campaigns:'Кампанії',content:'Контент',decisions:'Рішення',reports:'Звіти',legacy_tasks:'Старі задачі'};
const labels={name:'Назва',title:'Назва',stage:'Етап',progress:'Прогрес, %',budget:'Бюджет',owner:'Відповідальний',due:'Дедлайн',tone:'Позначка',day:'День',status:'Статус',channel:'Канал',pillar:'Напрям',format:'Формат',objective:'Мета',hook:'Початок / хук',cta:'Заклик до дії',gates:'Готовність',brief:'Бриф',copy:'Текст',visual:'Візуал',approval:'Погодження',tracking:'Відстеження',context:'Контекст',requester:'Ініціатор',priority:'Пріоритет',impact:'Вплив',risk:'Ризик',recommendation:'Рекомендація',outcome:'Результат',related:'Пов’язане',month:'Місяць',spend:'Витрати',impressions:'Покази',clicks:'Кліки',users:'Користувачі',sessions:'Сесії',coverage:'Покриття',leads:'Ліди',validLeads:'Валідні ліди',connections:'Підключення',revenue:'Дохід',source:'Джерело',note:'Примітка',done:'Завершено'};
const defaults={campaigns:{name:'',stage:'План',progress:0,budget:'',owner:'',due:'',tone:''},content:{title:'',day:1,status:'План',owner:'',channel:'',pillar:'',format:'',objective:'',hook:'',cta:'',due:'',gates:{brief:false,copy:false,visual:false,approval:false,tracking:false}},decisions:{title:'',context:'',owner:'',status:'Потребує рішення',requester:'',due:'',priority:'Medium',impact:'',risk:'',recommendation:'',outcome:'',related:''},reports:{month:'',status:'Чернетка',spend:0,impressions:0,clicks:0,users:0,sessions:0,coverage:0,leads:0,validLeads:0,connections:0,revenue:0,source:'',note:''}};
export function applyEdits(original,entries){
 const record=structuredClone(original);
 for(const {key,value,type} of entries){
  if(key==='id')continue;
  if(type==='number'){if(value.trim()===''||!Number.isFinite(Number(value)))throw Error('Заповни числові поля');record[key]=Number(value);}
  else if(type==='boolean')record[key]=value===true;
  else if(type==='object')record[key]=JSON.parse(value);
  else record[key]=value;
 }
 return record;
}
export function mountOwnerSpace({request,notice}){
 const root=document.querySelector('#owner-space'),nav=document.querySelector('#owner-nav');
 let actor,key,documents=[],fetching=false;
 nav.innerHTML='<small>ПРОСТІР КЕРІВНИКА</small>'+Object.entries(sections).map(([k,label])=>`<button data-space="${k}">${label}</button>`).join('');
 const dialog=document.createElement('dialog');dialog.innerHTML='<div class="dialog-head"><h2 id="space-editor-title"></h2><button type="button" data-close aria-label="Закрити">×</button></div><form id="space-editor"></form><p id="space-editor-error" role="status"></p>';document.body.append(dialog);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 function doc(){return documents.find(d=>d.key===key);}
 function render(){
  const d=doc(),rows=d?.payload||[];
  if(!Array.isArray(rows))throw Error('Непідтримуваний формат розділу');
  root.innerHTML=`<div class="space-toolbar"><p>${rows.length} записів · версія ${d?.revision||0}</p><button data-refresh>Оновити розділ</button><button data-export>Завантажити копію</button>${defaults[key]?'<button class="primary" data-add>+ Додати</button>':''}</div><p class="space-source">${d?.source==='cmo-space-v29'?'Початкові дані перенесено з CMO Space.':''} ${key==='reports'?'Збережено вихідні статуси та примітки; неповні дані потребують перевірки.':''}${key==='legacy_tasks'?'Це старі записи для звірки. Вони не додані до командного задачника.':''}</p><div class="space-grid">${rows.map((r,i)=>`<article class="space-card"><h2>${h(r.name||r.title||r.month||'Запис')}</h2><div class="metadata">${[r.owner,r.stage||r.status,r.due].filter(Boolean).map(v=>`<span>${h(v)}</span>`).join('')}</div>${Object.entries(r).filter(([k,v])=>!['id','name','title','month','owner','stage','status','due','tone'].includes(k)&&typeof v!=='object'&&v!=='').map(([k,v])=>`<div class="space-value"><span>${h(labels[k]||k)}</span><p>${h(typeof v==='boolean'?(v?'Так':'Ні'):v)}</p></div>`).join('')}<button data-edit="${i}">Відкрити / редагувати</button></article>`).join('')||'<p>Записів немає</p>'}</div>`;
 }
 async function refresh(){if(fetching)return;fetching=true;try{const r=await request({op:'list'});documents=r.documents;render();notice();}catch(e){notice(e.message);root.innerHTML='<p>Не вдалося отримати дані.</p><button data-refresh>Спробувати ще раз</button>';}finally{fetching=false;}}
 function edit(index){
  const d=doc(),original=index===null?{id:crypto.randomUUID(),...structuredClone(defaults[key])}:d.payload[index];
  const revision=d?.revision||0,payload=structuredClone(d?.payload||[]),editKey=key;
  const form=dialog.querySelector('form'),error=dialog.querySelector('#space-editor-error');error.textContent='';
  dialog.querySelector('h2').textContent=index===null?'Новий запис':'Редагування запису';
  form.innerHTML=Object.entries(original).filter(([k])=>k!=='id').map(([k,v])=>{
   const type=typeof v==='object'?'object':typeof v;
   if(type==='boolean')return `<label class="check"><input name="${h(k)}" data-type="boolean" type="checkbox" ${v?'checked':''}>${h(labels[k]||k)}</label>`;
   if(type==='number')return `<label>${h(labels[k]||k)}<input name="${h(k)}" data-type="number" type="number" step="any" value="${h(v)}" required></label>`;
   return `<label>${h(labels[k]||k)}<textarea name="${h(k)}" data-type="${type}" rows="${type==='object'?5:2}">${h(type==='object'?JSON.stringify(v,null,2):v)}</textarea></label>`;
  }).join('')+'<button>Зберегти</button>';
  form.onsubmit=async e=>{
   e.preventDefault();const button=form.querySelector('button');button.disabled=true;error.textContent='';
   try{const edited=applyEdits(original,[...form.querySelectorAll('[data-type]')].map(el=>({key:el.name,type:el.dataset.type,value:el.type==='checkbox'?el.checked:el.value})));
    if(!(edited.title||edited.name||edited.month)?.trim())throw Error('Заповни назву або місяць');
    if(index===null)payload.push(edited);else payload[index]=edited;
    await request({op:'save',key:editKey,revision,payload});dialog.close();await refresh();notice('Збережено');
   }catch(e){error.textContent=e.message+' Введені зміни залишилися у формі.';}finally{button.disabled=false;}
  };
  dialog.showModal();
 }
 nav.addEventListener('click',e=>{const b=e.target.closest('[data-space]');if(!b||actor?.role!=='owner')return;key=b.dataset.space;document.querySelector('#workspace').hidden=true;document.querySelector('#new-task').hidden=true;root.hidden=false;document.querySelector('#heading').textContent=sections[key];document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));refresh();});
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-refresh'))refresh();if(b.hasAttribute('data-edit'))edit(Number(b.dataset.edit));if(b.hasAttribute('data-add'))edit(null);if(b.hasAttribute('data-export')){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),documents},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pavutyna-cmo-space-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
 return {setActor(a){actor=a;nav.hidden=a?.role!=='owner';},hide(){root.hidden=true;}};
}
