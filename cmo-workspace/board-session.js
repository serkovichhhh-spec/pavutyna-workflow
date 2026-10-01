import {escapeHtml as h} from './metrics.js';
export const taskStages={backlog:'Черга',todo:'До виконання',progress:'У роботі',blocked:'Заблоковано',review:'На перевірці',ready:'Готово до запуску',done:'Завершено'};
export function sessionRemaining(session,now=Date.now()){return Math.max(0,Math.ceil((Date.parse(session?.endsAt)-now)/1000)||0);}
export function portalAt(root,event){return [...root.querySelectorAll('[data-portal]')].find(el=>{const r=el.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;})?.dataset.portal;}
export function mountBoardSession(root,{board,tasks,actor,team=[],action,refresh,openTask}){
 if(!action)return;
 if(board.session?.ballots){const ballots=board.session.ballots;board={...board,session:{...board.session,myVotes:ballots[actor?.id]||{},totals:Object.values(ballots).reduce((all,votes)=>{for(const [id,n]of Object.entries(votes))all[id]=(all[id]||0)+n;return all;},{})}};}
 const owner=actor?.role==='owner',canCreate=['owner','intake'].includes(actor?.role);
 const shell=root.querySelector('.wb-shell'),bar=document.createElement('section');bar.className='wb-session';
 bar.innerHTML=`<div class="wb-session-actions"><strong>Креатив → виконання</strong><button data-session-refresh>Оновити задачі й голоси</button>${owner?'<button data-session-share>Доступ команди</button><button data-session-start>Креативна сесія</button>':''}<span data-session-clock role="status"></span></div><div class="wb-portals" aria-label="Зони передачі задач">${[['handoff','Передати колезі','Виконавець + наступний крок'],['review','На погодження CMO','Результат для перевірки'],['ready','До запуску','Лише після погодження керівника']].map(([id,title,sub])=>`<button data-portal="${id}"><strong>${title}</strong><small>${sub}</small></button>`).join('')}</div><p class="wb-hint">Перетягни живу картку в зону або обери «Передати» на ній. Статуси змінюються через чинні правила задачника.</p><div class="wb-session-dialog"></div>`;
 shell.prepend(bar);
 function dialog(title,content){const host=bar.querySelector('.wb-session-dialog');host.innerHTML=`<dialog class="wb-editor"><div class="dialog-head"><h2>${h(title)}</h2><button data-close aria-label="Закрити">×</button></div>${content}<p class="space-error" role="alert"></p></dialog>`;const d=host.querySelector('dialog');d.showModal();d.querySelector('[data-close]').onclick=()=>d.close();return d;}
 async function run(op,values={},d){const button=d?.querySelector('button[type=submit]');if(button)button.disabled=true;try{await action({op,...values});}catch(e){if(d?.isConnected){d.querySelector('.space-error').textContent=e.message;if(button)button.disabled=false;}}}
 function taskForm(card,task,destination){
  if(!task&&!canCreate)return;
  const members=team.filter(m=>m.active!==false).map(m=>m.name);
  if(!members.length&&actor?.name)members.push(actor.name);
  const d=dialog(task?'Передати задачу':'Ідея → задача',`<p>${h(task?.title||card.title)}</p><form>${task?`<label>Дія<select name="destination">${[['handoff','Передати колезі'],['review','На погодження CMO'],...(owner?[['ready','Готово до запуску']]:[])].map(([v,t])=>`<option value="${v}" ${v===destination?'selected':''}>${t}</option>`).join('')}</select></label>`:''}<label>Виконавець<select name="assignee">${members.map(n=>`<option ${n===(task?.assignee||actor?.name)?'selected':''}>${h(n)}</option>`).join('')}</select></label>${task?'<label>Результат / що потрібно зробити далі<textarea name="text" rows="4" required maxlength="10000"></textarea></label>':'<label>Дедлайн<input name="due" type="date"></label><label>Пріоритет<select name="priority"><option>Medium</option><option>High</option><option>Low</option></select></label>'}<button type="submit">${task?'Підтвердити передачу':'Створити й пов’язати'}</button></form>`);
  d.querySelector('form').onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));run(task?'portal':'convert',task?{...v,id:task.id,version:task.version,result:v.text}:{...v,cardId:card.id},d);};
 }
 for(const card of board.cards){const el=[...root.querySelectorAll('[data-note]')].find(n=>n.dataset.note===card.id);if(!el)continue;
  if(card.kind==='task'){
   const task=tasks.find(t=>t.id===card.taskId);el.classList.add('wb-live-task');
   el.querySelector('h3').textContent=task?.title||'Задача недоступна';el.querySelector('p').textContent='';
   const meta=document.createElement('div');meta.className='wb-live-meta';meta.innerHTML=task?`<span class="wb-stage stage-${h(task.lane)}">${h(taskStages[task.lane]||task.lane)}</span><p>${h(task.assignee)} · ${h(task.due||'без дедлайну')}</p><small>${h(task.priority)} · ${h(task.id)}</small>`:'<small>Доступ до дошки не відкриває доступ до чужої задачі.</small>';el.querySelector('.wb-card-head').after(meta);
   if(task?.permissions?.work&&task.lane!=='done'){const btn=document.createElement('button');btn.textContent='Передати';btn.onclick=e=>{e.stopPropagation();taskForm(card,task,'handoff');};el.append(btn);}
  }else if(['note','shape','text'].includes(card.kind)){
   if(canCreate){const btn=document.createElement('button');btn.textContent='Ідея → задача';btn.onclick=e=>{e.stopPropagation();taskForm(card);};el.append(btn);}
   if(board.session?.phase==='voting'||board.session?.phase==='finished'){
    const btn=document.createElement('button');btn.className='wb-vote';btn.dataset.voteCard=card.id;btn.setAttribute('aria-pressed',String(!!board.session.myVotes?.[card.id]));btn.textContent=`● ${board.session.totals?.[card.id]||0} · ${board.session.myVotes?.[card.id]?'Забрати голос':'Голос'}`;btn.disabled=board.session.phase!=='voting'||!sessionRemaining(board.session);btn.onclick=e=>{e.stopPropagation();run('vote',{cardId:card.id,sessionId:board.session.id});};el.append(btn);
   }
  }
 }
 if(root.portalHandler)root.removeEventListener('wb-portal',root.portalHandler);
 root.portalHandler=e=>{const task=tasks.find(t=>t.id===e.detail.taskId);if(!task?.permissions?.work)return;taskForm(null,task,e.detail.destination);};
 root.addEventListener('wb-portal',root.portalHandler);
 const clock=bar.querySelector('[data-session-clock]');
 function tick(){const s=board.session,remaining=sessionRemaining(s);clock.textContent=s?.id?`${s.phase==='ideas'?'Збір ідей':s.phase==='voting'?'Голосування':'Підсумки'} · ${s.phase==='finished'?'завершено':remaining?`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'час вичерпано'}${s.phase==='voting'?` · твої голоси: ${Object.keys(s.myVotes||{}).length}/${s.limit}`:''}`:'Сесію ще не розпочато';if(!remaining)root.querySelectorAll('[data-vote-card]').forEach(b=>b.disabled=true);}
 tick();const interval=setInterval(()=>{if(!root.isConnected||!bar.isConnected){clearInterval(interval);return;}tick();},1000);interval.unref?.();
 bar.querySelector('[data-session-refresh]').onclick=()=>refresh();
 bar.querySelectorAll('[data-portal]').forEach(b=>b.onclick=()=>{const available=tasks.filter(t=>t.permissions?.work&&t.lane!=='done'&&board.cards.some(c=>c.taskId===t.id));const d=dialog('Обери задачу на цій дошці',`<div>${available.map(t=>`<button data-select-task="${h(t.id)}">${h(t.title)}</button>`).join('')||'<p>Немає доступних задач для передачі.</p>'}</div>`);d.querySelectorAll('[data-select-task]').forEach(btn=>btn.onclick=()=>taskForm(null,tasks.find(t=>t.id===btn.dataset.selectTask),b.dataset.portal));});
 if(owner){
  bar.querySelector('[data-session-share]').onclick=()=>{const d=dialog('Доступ до цієї дошки',`<p>Учасники бачать усе полотно. Доступ до самих задач залишається окремим. Перед відкриттям перевір нотатки на конфіденційні дані.</p><form>${team.filter(t=>t.active!==false&&t.name!==actor.name).map(t=>`<label class="check"><input type="checkbox" name="members" value="${h(t.name)}" ${(board.members||[]).includes(t.name)?'checked':''}>${h(t.name)}</label>`).join('')}<button type="submit">Зберегти доступ</button></form>`);d.querySelector('form').onsubmit=e=>{e.preventDefault();run('share',{members:new FormData(e.target).getAll('members')},d);};};
  bar.querySelector('[data-session-start]').onclick=()=>{const d=dialog('Креативна сесія',`<p>Таймер зберігається на сервері. Нове голосування починається з нуля.</p><form><label>Режим<select name="phase"><option value="ideas">Збір ідей</option><option value="voting">Голосування</option></select></label><label>Тривалість, хв<input name="minutes" type="number" min="1" max="60" value="5" required></label><label>Голосів на учасника<input name="votes" type="number" min="1" max="10" value="3" required></label><button type="submit">Почати нову сесію</button></form>${board.session?.id?'<button data-finish>Завершити поточну сесію</button>':''}`);d.querySelector('form').onsubmit=e=>{e.preventDefault();run('start',Object.fromEntries(new FormData(e.target)),d);};d.querySelector('[data-finish]')?.addEventListener('click',()=>run('finish',{},d));};
 }
}
