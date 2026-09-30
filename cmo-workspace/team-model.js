import {taskMetrics} from './metrics.js';
export const roleLabels={owner:'Керівник',intake:'Створення задач',executor:'Виконавець'};
export const roleAccess={owner:'Усі задачі, приймання результатів і керівницькі розділи',intake:'Створення задач; перегляд своїх і створених задач; робота з призначеними задачами',executor:'Перегляд і виконання призначених задач; результат приймає керівник'};
export function teamWorkload(members,tasks,today){
 const active=members.filter(m=>m.active),names=new Set(active.map(m=>m.name));
 const unmatched=[...new Set(tasks.map(t=>t.assignee).filter(n=>n&&!names.has(n)))].map(name=>({name,role:null,active:false}));
 return [...active,...unmatched].map(member=>{
  const assigned=tasks.filter(t=>t.assignee===member.name),metrics=taskMetrics(assigned,today);
  return {...member,...metrics,total:assigned.length,done:assigned.filter(t=>t.lane==='done').length,tasks:assigned.filter(t=>t.lane!=='done').slice().sort((a,b)=>{
   const rank={blocked:0,review:1,progress:2,todo:3,ready:4,backlog:5},priority={High:0,Medium:1,Low:2};
   return (rank[a.lane]??6)-(rank[b.lane]??6)||(priority[a.priority]??3)-(priority[b.priority]??3)||String(a.due).localeCompare(String(b.due));
  })};
 });
}
