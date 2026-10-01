export const healthLabels={on_track:'За планом',at_risk:'Є ризик',blocked:'Заблоковано',complete:'Завершено'};
export const projectTypes={campaigns:'Кампанія',roadmap:'90 днів',execution:'План виконання'};
export function currentWeek(now=new Date()){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
export function hillPoint(position){const p=Number(position);if(position==null||!Number.isFinite(p)||p<0||p>100)return null;return {x:40+p*5.2,y:160-120*Math.sin(Math.PI*p/100)};}
export function hillPhase(position){return position==null?'Оцінки немає':position<50?'Шукаємо рішення':position===50?'Шлях зрозумілий':position<100?'Виконуємо':'Роботу виконано';}
export function latestUpdate(record){return (record.weeklyUpdates||[]).at(-1)||null;}
export function projectsFrom(documents){return Object.keys(projectTypes).flatMap(key=>{const d=documents.find(d=>d.key===key);return (Array.isArray(d?.payload)?d.payload:[]).map(record=>({key,revision:d.revision,record}));});}
export function projectSignals(record,tasks,now=new Date()){
 const ids=new Set(record.taskIds||[]),linked=tasks.filter(t=>ids.has(t.id)),update=latestUpdate(record),week=currentWeek(now);
 return {update,missingWeekly:update?.week!==week,completed:linked.filter(t=>t.lane==='done').length,total:ids.size,unavailable:ids.size-linked.length,staleHill:!!record.hill?.at&&(now-new Date(record.hill.at)>7*86400000),health:update?.health||null};
}
