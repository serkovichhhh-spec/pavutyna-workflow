export function taskMetrics(tasks,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv'}).format(new Date())) {
 const active=tasks.filter(t=>t.lane!=='done');
 return {open:active.length,review:active.filter(t=>t.lane==='review').length,blocked:active.filter(t=>t.lane==='blocked').length,overdue:active.filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.due)&&t.due<today).length};
}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
