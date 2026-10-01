import {creativeGroups} from './creative-model.js';
export function inboxItems(tasks,actor,preferences=[],now=Date.now()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 return tasks.flatMap(task=>{const reasons=[],pref=preferences.find(p=>p.taskId===task.id)||{},owner=actor.role==='owner';
  if(owner&&task.lane==='review')reasons.push('Погодження результату');
  if(owner&&task.lane==='blocked')reasons.push('Команді потрібна допомога');
  const changes=creativeGroups(task).filter(g=>g.latest.review?.status==='changes');
  if(task.assignee===actor.name&&changes.length)reasons.push('Правки до креативу');
  if(task.assignee===actor.name&&['todo','progress','blocked'].includes(task.lane))reasons.push('Моя активна задача');
  if(task.lane!=='done'&&/^\d{4}-\d{2}-\d{2}$/.test(task.due)&&task.due<today&&(owner||task.assignee===actor.name))reasons.push('Дедлайн минув');
  const last=task.activity?.at(-1);if(last?.actor&&last.actor!==actor.name)reasons.push(last.action||'Оновлення задачі');
  if((task.comments||[]).some(c=>c.author!==actor.name&&c.text?.includes('@'+actor.name)))reasons.push('Тебе згадали в коментарі');
  if(!reasons.length)return [];
  return [{task,reasons,read:pref.readVersion===task.version,snoozed:pref.snoozeVersion===task.version&&Date.parse(pref.snoozeUntil)>now,urgent:reasons.some(r=>['Погодження результату','Команді потрібна допомога','Правки до креативу','Дедлайн минув'].includes(r)),pref}];
 }).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||Number(a.read)-Number(b.read)||Date.parse(b.task.updatedAt||0)-Date.parse(a.task.updatedAt||0));
}
