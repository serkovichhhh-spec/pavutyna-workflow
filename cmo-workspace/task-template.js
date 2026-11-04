// Шаблон нової задачі: «Навіщо» і «Готово, коли…» → опис і чеклист.
export function createPayload(form){
 const why=String(form.why||'').trim(),details=String(form.description||'').trim();
 const checklist=String(form.done||'').split('\n').map(s=>s.replace(/^[-–•*\d.)\s]+/,'').trim()).filter(Boolean);
 if(checklist.length>30)throw Error('Критеріїв готовності — до 30 рядків');
 const description=[why&&'Навіщо: '+why,checklist.length&&'Готово, коли:\n'+checklist.map(c=>'— '+c).join('\n'),details].filter(Boolean).join('\n\n');
 return {op:'create',title:String(form.title||'').trim(),description,label:form.label||'Operations',assignee:form.assignee||'',priority:form.priority||'Medium',due:form.due||'',checklist};
}
// Чи можна взяти матеріал «Контенту» в роботу: немає відкритої пов’язаної задачі.
export function contentOpenTask(item,tasks){
 const ids=new Set(item?.taskIds||[]);
 return tasks.find(t=>ids.has(t.id)&&t.lane!=='done')||null;
}
