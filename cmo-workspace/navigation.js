import {escapeHtml as h} from './metrics.js';
export const navigationGroups=[
 {id:'dashboard',label:'Дашборд',tabs:[['overview','Огляд'],['review','Погодження'],['deadlines','Дедлайни'],['decisions','Рішення']]},
 {id:'tasks',label:'Задачі',tabs:[['board','Командні'],['mine','Мої'],['legacy_tasks','Архів Workflow']]},
 {id:'plans',label:'Плани й кампанії',tabs:[['strategy','Стратегія'],['roadmap','90 днів'],['campaigns','Кампанії'],['launches','Запуски'],['content','Контент'],['execution','Виконання'],['promos','Акції'],['experiments','Експерименти'],['insights','Інсайти']]},
 {id:'analytics',label:'Аналітика',tabs:[['analytics','Показники'],['funnel','Воронка'],['budget','Бюджет'],['monthly','Завантаження даних'],['attribution','Канали'],['reports','Звіти'],['report_requests','Запити звітів']]},
 {id:'boards',label:'Дошки',tabs:[['visual','Візуальні дошки']]},
 {id:'team',label:'Команда',tabs:[['team','Учасники'],['team_ops','Навантаження'],['rhythm','Ритм команди']]},
 {id:'cabinet',label:'Кабінет',tabs:[['profile','Мій профіль'],['access','Ролі та доступи'],['sources','Джерела даних'],['transfer','Резервні копії'],['automations','Автоматизації']]}
];
export function tabsFor(group,role){
 if(role==='owner')return group.tabs;
 if(group.id==='dashboard')return [['control','Мій контроль']];
 if(group.id==='tasks')return [['mine','Мої'],['board','Доступні']];
 if(group.id==='cabinet')return [['profile','Мій профіль']];
 return [];
}
export function groupFor(key){return navigationGroups.find(g=>g.tabs.some(([k])=>k===key))||(key==='control'?navigationGroups[0]:null);}
export function mountNavigation({showTasks,showOwner,showCabinet}){
 const nav=document.querySelector('aside nav'),tabs=document.querySelector('#section-tabs'),cabinet=document.querySelector('#cabinet-button');
 let actor,key='board';const remembered=new Map();
 function select(next){key=next;const group=groupFor(key);if(!group)return;remembered.set(group.id,key);
  nav.querySelectorAll('[data-section]').forEach(b=>{const active=b.dataset.section===group.id;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  cabinet.classList.toggle('active',group.id==='cabinet');cabinet.setAttribute('aria-pressed',String(group.id==='cabinet'));
  tabs.hidden=!actor;tabs.innerHTML=tabsFor(group,actor?.role).map(([k,label])=>`<button type="button" data-page="${k}" ${['board','mine','control'].includes(k)?`data-view="${k}"`:''} aria-current="${k===key?'page':'false'}" class="${k===key?'active':''}">${h(label)}</button>`).join('');
 }
 function go(next){const group=groupFor(next);if(!actor||!group||!tabsFor(group,actor.role).some(([k])=>k===next))return;select(next);
  if(['board','mine','control'].includes(next))showTasks(next);else if(['profile','access'].includes(next))showCabinet(next);else showOwner(next);
 }
 function openGroup(id){const group=navigationGroups.find(g=>g.id===id),available=group&&tabsFor(group,actor?.role);if(!available?.length)return;go(available.some(([k])=>k===remembered.get(id))?remembered.get(id):available[0][0]);}
 nav.addEventListener('click',e=>{const b=e.target.closest('[data-section]');if(b)openGroup(b.dataset.section);});
 tabs.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)go(b.dataset.page);});
 cabinet.addEventListener('click',()=>openGroup('cabinet'));
 return {select,go,current:()=>key,setActor(a){if(actor?.id!==a?.id||actor?.role!==a?.role)remembered.clear();actor=a;
  nav.innerHTML=navigationGroups.filter(g=>g.id!=='cabinet'&&tabsFor(g,a?.role).length).map(g=>`<button type="button" data-section="${g.id}" ${a?'':'disabled'}>${h(g.label)}</button>`).join('')+'<div id="owner-nav" hidden></div>';
  cabinet.hidden=!a;if(!a){tabs.hidden=true;tabs.replaceChildren();cabinet.classList.remove('active');}else select(key);
 }};
}
