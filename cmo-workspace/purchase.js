import {escapeHtml as h} from './metrics.js';
export const purchaseChannels=['Чати ЖК','Google Ads','Meta Ads','Зовнішня реклама','Поліграфія','Пабліки / блогери','Промо / BTL','Інше'];
export const purchaseStatus={requested:'Чекає погодження',approved:'Погоджено — оплатити',rejected:'Відхилено',paid:'Оплачено'};
export const money=v=>Number.isFinite(Number(v))&&v!==null&&v!==''?Math.round(Number(v)).toLocaleString('uk-UA').replace(/ /g,' ')+' грн':'—';
export function currentMonth(d=new Date()){return d.toISOString().slice(0,7);}

export function purchaseMarkup(t,actor){
 const p=t.purchase;if(!p)return '';
 const owner=actor?.role==='owner',canWork=t.permissions?.work===true||owner;
 const step=s=>({requested:1,approved:2,rejected:2,paid:3}[s]||1);
 const steps=['Запит','Погодження','Оплата','Приймання'].map((label,i)=>`<li class="${i<step(p.status)||(t.lane==='done'&&i===3)?'done':''} ${i===step(p.status)&&t.lane!=='done'?'now':''}">${h(label)}</li>`).join('');
 const facts=[['Канал',p.channel],['Де',p.placement],['Місяць',p.month],['Запит',money(p.amount)],p.approvedAmount!=null&&['Погоджено',money(p.approvedAmount)],p.actual!=null&&['Факт',money(p.actual)],p.goal&&['Навіщо',p.goal],p.link&&['Рахунок / посилання',p.link],p.decisionNote&&['Коментар керівника',p.decisionNote],p.proof&&['Доказ розміщення',p.proof]].filter(Boolean);
 let actions='';
 if(owner&&['requested','rejected','approved'].includes(p.status))actions+=`<form class="purchase-form" data-purchase="decide"><label>Погоджена сума, грн<input name="amount" type="number" min="1" step="1" value="${h(p.approvedAmount??p.amount)}" required></label><label>Коментар<input name="note" maxlength="1000" placeholder="Обов’язково, якщо відхиляєш"></label><div class="purchase-buttons"><button class="primary" value="approve">Погодити бюджет</button><button value="reject">Відхилити</button></div></form>`;
 if(canWork&&['approved','paid'].includes(p.status)&&t.lane!=='done')actions+=`<form class="purchase-form" data-purchase="fact"><label>Фактично оплачено, грн<input name="actual" type="number" min="0" step="1" value="${h(p.actual??p.approvedAmount??'')}" required></label><label>Посилання на пост / скрін / номер рахунку<input name="proof" maxlength="2000" value="${h(p.proof||'')}" required></label><button class="primary">${p.status==='paid'?'Оновити факт':'Оплачено — передати на приймання'}</button></form>`;
 return `<section class="purchase-panel status-${h(p.status)}"><div class="purchase-head"><h3>Закупівля</h3><span class="purchase-badge">${h(purchaseStatus[p.status]||p.status)}</span></div><ol class="purchase-steps">${steps}</ol><dl>${facts.map(([k,v])=>`<dt>${h(k)}</dt><dd>${h(v)}</dd>`).join('')}</dl>${actions}<p class="purchase-error space-error" role="status"></p></section>`;
}

export function mountPurchase(root,{act}){
 root.addEventListener('submit',async e=>{const form=e.target.closest('[data-purchase]');if(!form)return;e.preventDefault();
  const decision=e.submitter?.value,f=Object.fromEntries(new FormData(form)),err=form.closest('.purchase-panel')?.querySelector('.purchase-error');
  if(form.dataset.purchase==='decide'&&decision==='reject'&&!String(f.note||'').trim()){if(err)err.textContent='Напиши причину відмови';return;}
  form.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await act(form.dataset.purchase==='decide'?{op:'decide',decision,...f}:{op:'fact',...f});}catch(x){if(err)err.textContent=x.message;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
}

// Зведення закупівель за місяць: запитано / погоджено / оплачено, по каналах.
export function purchaseSummary(tasks,month){
 const rows=tasks.filter(t=>t.purchase&&(!month||t.purchase.month===month));
 const sum=(list,f)=>list.reduce((s,t)=>s+(Number(f(t.purchase))||0),0);
 const live=rows.filter(t=>t.purchase.status!=='rejected');
 const byChannel=purchaseChannels.map(channel=>{const c=live.filter(t=>t.purchase.channel===channel);return {channel,committed:sum(c,p=>p.actual??p.approvedAmount??0),paid:sum(c.filter(t=>t.purchase.status==='paid'),p=>p.actual),count:c.length};}).filter(c=>c.count);
 return {rows,pending:rows.filter(t=>t.purchase.status==='requested'),toPay:rows.filter(t=>t.purchase.status==='approved'),
  requested:sum(rows.filter(t=>t.purchase.status==='requested'),p=>p.amount),approved:sum(live.filter(t=>t.purchase.status!=='requested'),p=>p.approvedAmount??p.amount),paid:sum(live.filter(t=>t.purchase.status==='paid'),p=>p.actual),byChannel};
}
