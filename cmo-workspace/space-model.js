export const modules={campaigns:'Кампанії',content:'Контент',decisions:'Рішення',reports:'Звіти',legacy_tasks:'Старі задачі',insights:'Інсайти',roadmap:'План на 90 днів',budget:'Бюджет і ресурси',promos:'Акції',rhythm:'Ритм команди',experiments:'Експерименти',attribution:'Атрибуція',visual:'Візуальні дошки',launches:'Контроль запусків',team_ops:'Завантаження команди',report_requests:'Запити звітів',execution:'План виконання',automations:'Реєстр автоматизацій'};
export const templates={
 insights:{title:'',type:'Гіпотеза',evidence:'',action:'',owner:'',priority:'medium',status:'Новий'},
 roadmap:{title:'',horizon:'0–30',owner:'',status:'Заплановано',progress:0,priority:'medium',dependencies:[],doneWhen:'',impact:'',blocker:'',linked:''},
 budget:{name:'',channel:'',owner:'',planned:null,actual:null,targetLeads:null,actualLeads:null,targetConnections:null,actualConnections:null,status:'Чернетка',decision:''},
 resources:{role:'',owner:'',capacity:null,allocated:null,focus:''},
 promos:{name:'',url:'',expiry:'',audience:'',strategicRole:'',owner:'',leads:null,validLeads:null,connections:null,promoCost:null,revenue:null,margin:null,retention:null,status:'Потрібні дані',recommendation:'Пауза',rationale:'',dataRequest:''},
 rhythm:{title:'',cadence:'Щотижня',day:'',time:'',owner:'',participants:'',output:'',status:'Заплановано',done:false,critical:false},
 experiments:{name:'',hypothesis:'',audience:'',channel:'',owner:'',status:'Backlog',impact:5,confidence:5,ease:5,budget:null,metric:'',target:null,actual:null,start:'',end:'',decision:'Очікує',learning:'',successRule:''},
 attribution:{month:'',source:'',group:'Other',spend:null,visits:null,leads:null,validLeads:null,connections:null,revenue:null,owner:'',quality:'Немає даних',note:''},
 visual:{name:'',template:'Вільна дошка',zoom:100,cards:[],updated:''},
 cards:{title:'',body:'',tag:'',color:'blue',kind:'note',x:0,y:0},
 launches:{name:'',objective:'',audience:'',offer:'',owner:'',budget:'',channels:'',approval:'Очікує',note:'',gates:{tracking:false,landing:false,coverage:false,creative:false,utm:false,sales:false,baseline:false}},
 team_ops:{name:'',role:'',aliases:[],capacity:null,focus:'',blocker:'',note:''},
 report_requests:{pack:'',owner:'',deadline:'',format:'',fields:'',status:'Очікуємо'},
 execution:{title:'',priority:'P1',stream:'',owner:'',deadline:'',dependency:'',acceptance:'',status:'До роботи'},
 automations:{name:'',trigger:'',output:'',owner:'',status:'Очікує налаштування',system:'',lastRun:'',requirement:'',nextAction:''}
};
export const choices={horizon:['0–30','31–60','61–90'],type:['Факт','Інсайт','Гіпотеза','Ризик'],cadence:['Щотижня','Щомісяця','Щокварталу'],group:['Organic','Paid','Referral','Offline','Direct','Other'],quality:['Немає даних','Частково','Перевірено'],approval:['Очікує','Погоджено','На доопрацювання'],kind:['note','image','frame'],recommendation:['Продовжити','Перепакувати','Пауза','Закрити']};
export const extraLabels={type:'Тип',evidence:'Доказ / джерело',action:'Наступна дія',horizon:'Горизонт, днів',dependencies:'Залежності',doneWhen:'Критерій готовності',blocker:'Блокування',linked:'Пов’язане',planned:'План, грн',actual:'Факт',targetLeads:'План лідів',actualLeads:'Факт лідів',targetConnections:'План підключень',actualConnections:'Факт підключень',role:'Роль',capacity:'Доступно, год/тиждень',allocated:'Зайнято, год/тиждень',focus:'Фокус',envelope:'Ліміт бюджету, грн',url:'Посилання',expiry:'Завершення акції',audience:'Аудиторія',strategicRole:'Роль акції',promoCost:'Вартість акції, грн',margin:'Маржа, грн',retention:'Утримання, %',rationale:'Обґрунтування',dataRequest:'Які дані потрібні',cadence:'Періодичність',time:'Час',participants:'Учасники',output:'Результат',critical:'Критично',hypothesis:'Гіпотеза',confidence:'Впевненість, 1–10',ease:'Простота, 1–10',metric:'Метрика',target:'Ціль',start:'Початок',end:'Завершення',learning:'Висновок',successRule:'Умова успіху',group:'Група каналу',visits:'Візити',quality:'Якість даних',template:'Шаблон',zoom:'Масштаб, %',cards:'Нотатки',body:'Текст',tag:'Тег',color:'Колір',kind:'Тип нотатки',src:'Посилання на зображення',x:'Позиція X',y:'Позиція Y',updated:'Оновлено',offer:'Пропозиція',channels:'Канали',landing:'Посадкова сторінка',creative:'Креатив',utm:'UTM',sales:'Продажі',baseline:'Базові показники',aliases:'Інші імена',pack:'Назва звіту',deadline:'Дедлайн',fields:'Потрібні показники',stream:'Напрям',dependency:'Залежність',acceptance:'Критерій приймання',trigger:'Умова запуску',system:'Система',lastRun:'Останній підтверджений запуск',requirement:'Потрібний доступ',nextAction:'Наступний крок',lines:'Статті бюджету',resources:'Ресурси'};
export function emptyPayload(key){return key==='budget'?{lines:[],resources:[],envelope:null}:key==='visual'?{boards:[],active:null}:[];}
export function rowsFor(key,payload,part){if(key==='budget')return payload?.[part||'lines']||[];if(key==='visual')return Array.isArray(payload)?payload:payload?.boards||[];return payload||[];}
export function replaceRows(key,payload,rows,part){if(key==='budget')return {...payload,[part||'lines']:rows};if(key==='visual'&&!Array.isArray(payload))return {...payload,boards:rows};return rows;}
export function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function recordTitle(r){return r.name||r.title||r.month||r.source||r.pack||r.role||'Запис';}
export function reportMetrics(report){
 if(report?.status!=='Перевірено')return null;
 const ratio=(a,b,m=1)=>typeof a==='number'&&typeof b==='number'&&a>=0&&b>0?a/b*m:null;
 return {cpl:ratio(report.spend,report.leads),cpql:ratio(report.spend,report.validLeads),cac:ratio(report.spend,report.connections),ctr:ratio(report.clicks,report.impressions,100),leadToConnection:ratio(report.connections,report.leads,100)};
}
export function validatePayload(key,payload){
 if(!Object.hasOwn(modules,key))throw Error('Невідомий розділ');
 const rows=rowsFor(key,payload);if(!Array.isArray(rows)||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!r.id))throw Error('Записи мають містити власний ідентифікатор');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Повторюються ідентифікатори записів');
 if(key==='budget'&&(!payload||Array.isArray(payload)||!Array.isArray(payload.resources)))throw Error('Перевір формат бюджету');
 if(key==='budget'){const resources=payload.resources;if(resources.some(r=>!r||typeof r.id!=='string')||new Set(resources.map(r=>r.id)).size!==resources.length)throw Error('Перевір записи ресурсів');}
 if(key==='visual'&&rows.some(r=>!Array.isArray(r.cards)||r.cards.some(c=>!c||typeof c.id!=='string')))throw Error('Перевір формат нотаток дошки');
 if(JSON.stringify(payload).length>1400000)throw Error('Розділ завеликий для імпорту');return payload;
}
const localKeys={'pavutyna-insights-v1':'insights','pavutyna-roadmap-v1':'roadmap','pavutyna-promos-v1':'promos','pavutyna-rhythm-v1':'rhythm','pavutyna-experiments-v1':'experiments','pavutyna-attribution-v1':'attribution','pavutyna-budget-v1':'budget','pavutyna-automations-v1':'automations','pavutyna-visual-boards-v2':'visual','pavutyna-campaign-launch-v1':'launches','pavutyna-team-ops-v1':'team_ops','pavutyna-report-requests-v1':'report_requests','pavutyna-execution-v1':'execution'};
export function parseImport(packet){
 const found=new Map();const add=(key,payload)=>{if(payload!==null&&payload!==undefined){validatePayload(key,payload);found.set(key,payload);}};
 if(Array.isArray(packet.documents))for(const d of packet.documents)add(d.key,d.payload);
 const data=packet.appData||packet.data;
 if(data)for(const k of ['campaigns','content','decisions','reports','tasks'])if(data[k])add(k==='tasks'?'legacy_tasks':k,data[k]);
 if(packet.visualBoards)add('visual',packet.visualBoards);if(packet.execution)add('execution',packet.execution);
 for(const [local,key] of Object.entries(localKeys))if(packet.localModules?.[local]){const raw=packet.localModules[local];add(key,typeof raw==='string'?JSON.parse(raw):raw);}
 if(!found.size)throw Error('Цей файл не містить розділів CMO');return [...found].map(([key,payload])=>({key,payload}));
}
export function mergeById(current,incoming){
 const rows=structuredClone(current),ids=new Map(rows.map((r,i)=>[r.id,i]));let added=0,identical=0,conflicts=0;
 for(const record of incoming){if(!ids.has(record.id)){ids.set(record.id,rows.length);rows.push(structuredClone(record));added++;}else if(JSON.stringify(rows[ids.get(record.id)])===JSON.stringify(record))identical++;else conflicts++;}
 return {rows,added,identical,conflicts};
}
export function mergeDocument(key,current,incoming){
 const base=current??emptyPayload(key),m=mergeById(rowsFor(key,base),rowsFor(key,incoming));let payload=replaceRows(key,base,m.rows),conflicts=m.conflicts,added=m.added;
 if(key==='budget'){const resources=mergeById(base.resources||[],incoming.resources||[]);payload.resources=resources.rows;added+=resources.added;conflicts+=resources.conflicts;if(base.envelope===null||base.envelope===undefined)payload.envelope=incoming.envelope??null;else if(incoming.envelope!=null&&base.envelope!==incoming.envelope)conflicts++;}
 return {payload,added,identical:m.identical,conflicts};
}
