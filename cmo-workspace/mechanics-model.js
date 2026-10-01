const completed=new Set(['Готово','Завершено','Done','done','Вирішено','Закрито']);
export const isComplete=r=>completed.has(r?.status)||r?.lane==='done';
export function dependencyState(record,items,tasks=[]){
 const map=new Map([...items,...tasks].map(r=>[r.id,r]));
 const ids=record.dependencies||[];
 const visit=(id,path)=>{if(path.includes(id))return true;const r=map.get(id);return (r?.dependencies||[]).some(d=>visit(d,[...path,id]));};
 const cycle=visit(record.id,[]);
 const waiting=ids.filter(id=>!isComplete(map.get(id))).map(id=>({id,title:map.get(id)?.title||id,missing:!map.has(id)}));
 return {cycle,waiting,blocked:cycle||waiting.length>0||record.status==='Заблоковано',ready:!cycle&&!waiting.length};
}
export function validateDependencies(items,tasks=[]){
 for(const r of items)if(dependencyState(r,items,tasks).cycle)throw Error('Залежності утворюють цикл: '+(r.title||r.id));
}
export const gateNames={tracking:'Відстеження',landing:'Посадкова сторінка',coverage:'Покриття',creative:'Креатив',utm:'UTM / джерело',sales:'Готовність продажів',baseline:'Базові показники'};
export function launchReadiness(r,tasks=[],plans=[]){
 const required=r.requiredGates??Object.keys(gateNames);
 const missing=required.filter(k=>r.gates?.[k]!==true);
 const unavailable=(r.taskIds||[]).filter(id=>!tasks.some(t=>t.id===id));
 const pending=(r.taskIds||[]).filter(id=>!isComplete(tasks.find(t=>t.id===id)));
 const pendingPlans=(r.planIds||[]).filter(id=>!isComplete(plans.find(p=>p.id===id)));
 const metadata=['owner','objective','offer','channels'].filter(k=>!String(r[k]??'').trim());
 return {missing,pending,pendingPlans,unavailable,metadata,ready:r.approval==='Погоджено'&&!missing.length&&!pending.length&&!metadata.length&&!pendingPlans.length&&required.length>0};
}
export function iceScore(r){const values=['impact','confidence','ease'].map(k=>r[k]);return values.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=10)?Math.round(values.reduce((a,b)=>a*b,1)*10)/10:null;}
export function rankExperiments(rows){return rows.slice().sort((a,b)=>(iceScore(b)??-1)-(iceScore(a)??-1)||String(a.id).localeCompare(String(b.id)));}
export function deadlineQueue(tasks,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv'}).format(new Date())){
 const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
 const end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+2);const soon=end.toISOString().slice(0,10);
 const active=tasks.filter(t=>!isComplete(t));
 return {overdue:active.filter(t=>date(t.due)&&t.due<today),today:active.filter(t=>t.due===today),soon:active.filter(t=>date(t.due)&&t.due>today&&t.due<=soon),undated:active.filter(t=>!date(t.due)),review:active.filter(t=>t.lane==='review'),blocked:active.filter(t=>t.lane==='blocked')};
}
export function moveCard(board,id,x,y){if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Некоректна позиція');return {...board,cards:board.cards.map(c=>c.id===id?{...c,x:Math.max(0,Math.min(4000,Math.round(x))),y:Math.max(0,Math.min(4000,Math.round(y)))}:c)};}
