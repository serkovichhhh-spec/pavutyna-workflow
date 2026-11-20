// Завантаження у Supabase Storage. Малі файли — одним запитом, великі (> 6 МБ) — resumable (TUS) шматками по 6 МБ,
// щоб відео й архіви не обривалися на повільному інтернеті.
export const CHUNK=6*1024*1024;
export const MAX_FILE=50*1024*1024; // ліміт безкоштовного плану Supabase на один файл
const b64=s=>btoa(unescape(encodeURIComponent(s)));
const enc=p=>p.split('/').map(encodeURIComponent).join('/');

export function tusMetadata({bucket,path,mime}){
 return [['bucketName',bucket],['objectName',path],['contentType',mime],['cacheControl','3600']].map(([k,v])=>`${k} ${b64(v)}`).join(',');
}

async function fail(res,fallback){let e={};try{e=await res.json();}catch{}const m=e.message||e.error||fallback;
 if(res.status===413||/maximum allowed size|too large/i.test(m))return Error('Файл завеликий: максимум 50 МБ. Більші файли додай посиланням (Google Drive).');
 return Error(m);}

export async function uploadToStorage({url,key,token,bucket,path,file,mime,onProgress=()=>{},fetchImpl=fetch}){
 const auth=async()=>({apikey:key,Authorization:'Bearer '+await token()});
 if(file.size>MAX_FILE)throw Error('Файл завеликий: максимум 50 МБ. Більші файли додай посиланням (Google Drive).');
 if(file.size<=CHUNK){
  const res=await fetchImpl(`${url}/storage/v1/object/${bucket}/${enc(path)}`,{method:'POST',headers:{...await auth(),'Content-Type':mime||'application/octet-stream','x-upsert':'false'},body:file});
  if(!res.ok)throw await fail(res,'Не вдалося завантажити файл');onProgress(1);return;
 }
 const create=await fetchImpl(`${url}/storage/v1/upload/resumable`,{method:'POST',headers:{...await auth(),'Tus-Resumable':'1.0.0','Upload-Length':String(file.size),'Upload-Metadata':tusMetadata({bucket,path,mime:mime||'application/octet-stream'}),'x-upsert':'false'}});
 if(!create.ok)throw await fail(create,'Не вдалося почати завантаження');
 let loc=create.headers.get('Location');if(!loc)throw Error('Сервер не повернув адресу завантаження');
 if(loc.startsWith('/'))loc=new URL(loc,url).href;
 let offset=0;
 outer: while(offset<file.size){
  const part=file.slice(offset,offset+CHUNK);let res,tries=0;
  for(;;){
   try{res=await fetchImpl(loc,{method:'PATCH',headers:{...await auth(),'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:part});}
   catch(e){res=null;}
   if(res&&res.ok)break;
   if(++tries>=3)throw res?await fail(res,'Завантаження обірвалося'):Error('Завантаження обірвалося. Перевір інтернет і спробуй ще раз.');
   // з'ясувати, скільки сервер уже прийняв
   const head=await fetchImpl(loc,{method:'HEAD',headers:{...await auth(),'Tus-Resumable':'1.0.0'}}).catch(()=>null);
   const got=Number(head?.headers.get('Upload-Offset'));if(Number.isFinite(got)&&got>offset){offset=got;onProgress(offset/file.size);continue outer;}
   await new Promise(r=>setTimeout(r,1000*tries));
  }
  const next=Number(res?.headers.get('Upload-Offset'));offset=Number.isFinite(next)&&next>offset?next:Math.min(file.size,offset+part.size);
  onProgress(offset/file.size);
 }
}
