import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.CMO_TEST_NODE_MODULES+'/jsdom');
const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://test.invalid'});
Object.assign(globalThis,{document:dom.window.document,window:dom.window,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,FormData:dom.window.FormData,CustomEvent:dom.window.CustomEvent});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
localStorage.setItem('cmo-session',JSON.stringify({access_token:'synthetic-test-token',refresh_token:'synthetic-test-refresh',expires_at:Math.floor(Date.now()/1000)+3600}));
let task={id:'task-fixture',title:'Fixture',description:'QA only',assignee:'CMO',lane:'progress',priority:'Medium',due:'без дедлайну',result:'',version:1,permissions:{work:true,edit:true,comment:true},checklist:[],comments:[],activity:[],attachments:[]};
let failSave=false,calls=[];
globalThis.fetch=async(url,options)=>{
  if(url==='/api/config')return {json:async()=>({url:'https://backend.invalid',key:'synthetic-test-key'})};
  const body=JSON.parse(options.body).body;calls.push(body);
  if(body.op==='result'&&failSave)return {ok:false,json:async()=>({message:'Fixture conflict'})};
  if(body.op==='result'){task.result=body.result.trim();task.version++;}
  if(body.op==='move'){task.lane=body.lane;task.version++;if(body.result)task.result=body.result;}
  return {ok:true,json:async()=>body.op==='list'?{actor:{id:'owner-fixture',name:'CMO',role:'owner'},tasks:[structuredClone(task)],assignees:['CMO'],team:[],preferences:[]}:{id:task.id,version:task.version}};
};
await import('../app.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));await tick();
const $=s=>document.querySelector(s),click=s=>{assert($(s),s);$(s).click();};
const open=()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Задачі');assert(button);button.click();click('[data-task="task-fixture"]');};
const type=text=>{$('#result').value=text;$('#result').dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
const save=()=>$('#result-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
open();type('Draft survives close');click('#close-dialog');open();assert.equal($('#result').value,'Draft survives close');assert.match($('#result-save-state').textContent,/Незбережені/);
save();await tick();await tick();assert.equal(task.result,'Draft survives close');assert.equal(task.lane,'progress');assert.equal($('#result').value,task.result);assert.equal($('#result-save-state').textContent,'Збережено');assert.equal(calls.find(c=>c.op==='result').version,1);
type('Keep this failed edit');failSave=true;save();await tick();assert.equal($('#result').value,'Keep this failed edit');assert.match($('#task-error').textContent,/Fixture conflict/);click('#close-dialog');open();assert.equal($('#result').value,'Keep this failed edit');
failSave=false;save();await tick();await tick();click('[data-move="review"]');await tick();await tick();assert.equal(task.lane,'review');assert.match($('#task-detail').textContent,/Прийняти й завершити/);
click('[data-move="ready"]');await tick();await tick();assert.equal(task.lane,'ready');assert.match($('#task-detail').textContent,/Завершити задачу/);click('[data-move="done"]');await tick();await tick();assert.equal(task.lane,'done');assert(!document.querySelector('[data-move="done"]'));
dom.window.close();console.log('PASS full-app result submission, stable lane, draft reopen, conflict retention and review → ready → done actions');
