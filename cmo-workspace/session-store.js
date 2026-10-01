// Store only the Supabase token pair; never a password or workspace data.
export const sessionKey='cmo-session';
export function createSessionStore({persistent,temporary,refresh,now=()=>Date.now(),lock=fn=>fn(),onEnd=()=>{}}){
 let pending;
 function readFrom(storage){
  try{const s=JSON.parse(storage.getItem(sessionKey)||'null');
   if(!s)return null;
   if(typeof s.access_token!=='string'||!s.access_token||typeof s.refresh_token!=='string'||!s.refresh_token)return null;
   return {...s,expires_at:Number.isFinite(Number(s.expires_at))?Number(s.expires_at):0};
  }catch{return null;}
 }
 function read(){return readFrom(temporary)||readFrom(persistent);}
 function clear(){persistent.removeItem(sessionKey);temporary.removeItem(sessionKey);onEnd();}
 function save(s,remember=!!readFrom(persistent)){
  if(!s){clear();return;}
  if(!s.access_token||!s.refresh_token)throw Error('Не вдалося зберегти сесію входу');
  const value=JSON.stringify({access_token:s.access_token,refresh_token:s.refresh_token,
   expires_at:Number(s.expires_at)||Math.floor(now()/1000)+(Number(s.expires_in)||3600)});
  const target=remember?persistent:temporary,other=remember?temporary:persistent;
  try{target.setItem(sessionKey,value);other.removeItem(sessionKey);}
  catch{throw Error('Браузер не дозволяє зберегти вхід. Дозволь зберігання даних для цього сайту.');}
 }
 function ended(){return Error('Сесія завершилась. Увійди знову.');}
 async function renew(){
  const s=read();if(!s)throw ended();
  if(s.expires_at*1000>now()+60000)return s.access_token;
  const remember=!!readFrom(persistent);
  let next;
  try{next=await refresh(s.refresh_token);}
  catch(e){if([400,401,403].includes(e.status)&&read()?.refresh_token===s.refresh_token)clear();throw e;}
  // A sign-out or another sign-in during this request must not resurrect the old session.
  if(read()?.refresh_token!==s.refresh_token)throw ended();
  save(next,remember);return next.access_token;
 }
 async function token(){
  if(!pending)pending=Promise.resolve().then(()=>lock(renew)).finally(()=>{pending=null;});
  return pending;
 }
 return {read,save,clear,token};
}
