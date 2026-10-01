export const reviewLabels={pending:'Очікує погодження',approved:'Погоджено',changes:'Потрібні правки'};
export function creativeGroups(task){const groups=new Map();for(const f of task.attachments||[]){if(!f.creative||f.status==='removed')continue;const key=f.assetId||f.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}return [...groups].map(([id,versions])=>{versions.sort((a,b)=>(a.assetVersion||1)-(b.assetVersion||1));return {id,versions,latest:versions.at(-1)};});}
export function creativeReady(task){return creativeGroups(task).every(g=>g.latest.status==='ready'&&g.latest.review?.status==='approved');}
export function previewKind(mime){return mime?.startsWith('image/')?'image':mime==='video/mp4'?'video':mime==='application/pdf'?'pdf':null;}
