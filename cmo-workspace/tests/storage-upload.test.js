import test from 'node:test';import assert from 'node:assert/strict';
import {uploadToStorage,tusMetadata,CHUNK} from '../storage-upload.js';
import {validateFile} from '../task-tools.js';
const blob=n=>new Blob([new Uint8Array(n)]);
const res=(status,headers={},body={})=>({ok:status<300,status,headers:new Headers(headers),json:async()=>body});
test('формати: макети, відео, архіви — так; виконувані — ні',()=>{
 assert.equal(validateFile({name:'макет.PSD',size:10}),'image/vnd.adobe.photoshop');
 assert.equal(validateFile({name:'ролик.mov',size:10}),'video/quicktime');
 assert.equal(validateFile({name:'архів.rar',size:10}),'application/vnd.rar');
 assert.equal(validateFile({name:'щось.xyz',size:10,type:''}),'application/octet-stream');
 for(const n of ['setup.exe','run.bat','x.js','page.htm'])assert.throws(()=>validateFile({name:n,size:10}));
 assert.ok(validateFile({name:'big.mp4',size:50*1024*1024}));
});
test('малий файл — один POST',async()=>{const calls=[];await uploadToStorage({url:'https://x.supabase.co',key:'k',token:async()=>'t',bucket:'b',path:'a/ф 1.jpg',file:blob(10),mime:'image/jpeg',fetchImpl:async(u,o)=>{calls.push([u,o.method]);return res(200);}});
 assert.deepEqual(calls,[['https://x.supabase.co/storage/v1/object/b/a/%D1%84%201.jpg','POST']]);});
test('великий файл — TUS шматками по 6 МБ, з відновленням після обриву',async()=>{
 const size=CHUNK*2+5,calls=[];let failOnce=true;
 await uploadToStorage({url:'https://x.supabase.co',key:'k',token:async()=>'t',bucket:'b',path:'a/v.mp4',file:blob(size),mime:'video/mp4',fetchImpl:async(u,o)=>{
  calls.push([o.method,o.headers['Upload-Offset']]);
  if(o.method==='POST'){assert.equal(o.headers['Upload-Length'],String(size));return res(201,{Location:'/storage/v1/upload/resumable/abc'});}
  if(o.method==='PATCH'){assert.equal(u,'https://x.supabase.co/storage/v1/upload/resumable/abc');if(o.headers['Upload-Offset']===String(CHUNK)&&failOnce){failOnce=false;throw Error('net');}return res(204,{'Upload-Offset':String(Number(o.headers['Upload-Offset'])+o.body.size)});}
  if(o.method==='HEAD')return res(200,{'Upload-Offset':String(CHUNK)});}});
 assert.deepEqual(calls.map(c=>c.join(':')),['POST:','PATCH:0',`PATCH:${CHUNK}`,'HEAD:',`PATCH:${CHUNK}`,`PATCH:${CHUNK*2}`]);
});
test('метадані TUS у base64 з кирилицею',()=>{const m=tusMetadata({bucket:'b',path:'п/1',mime:'image/png'});assert.match(m,/^bucketName Yg==,objectName /);});
import {taskToolsMarkup,safeUrl,linkHost} from '../task-tools.js';
test('посилання на Google Drive у файлах задачі',()=>{
 const t={permissions:{work:true},attachments:[{id:'l1',kind:'link',status:'ready',name:'Відео <1>',url:'https://drive.google.com/file/d/abc/view'},{id:'l2',kind:'link',status:'ready',name:'x',url:'javascript:alert(1)'}]};
 const m=taskToolsMarkup(t,[],[],{role:'executor'});
 assert.match(m,/data-tool="link_add"/);assert.match(m,/href="https:\/\/drive\.google\.com\/file\/d\/abc\/view"/);assert(!m.includes('javascript:'));assert(!m.includes('<1>'));assert.match(m,/Google Drive · посилання/);
 assert.equal(safeUrl('ftp://x'),null);assert.equal(linkHost('https://www.dropbox.com/s/1'),'dropbox.com');
});
