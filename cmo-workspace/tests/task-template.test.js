import test from 'node:test';
import assert from 'node:assert/strict';
import {createPayload,contentOpenTask} from '../task-template.js';
test('шаблон: критерії готовності стають чеклистом і описом',()=>{
 const p=createPayload({title:' Банер ',why:'Більше заявок',done:'- Макети у задачі\n\n2) Ціни звірені\n',description:'https://x',label:'Design',assignee:'Наталі',priority:'High',due:'2026-11-10'});
 assert.equal(p.title,'Банер');assert.deepEqual(p.checklist,['Макети у задачі','Ціни звірені']);
 assert.equal(p.description,'Навіщо: Більше заявок\n\nГотово, коли:\n— Макети у задачі\n— Ціни звірені\n\nhttps://x');
 assert.equal(p.label,'Design');assert.equal(p.op,'create');
});
test('шаблон: порожні поля не додають шуму',()=>{const p=createPayload({title:'X'});assert.equal(p.description,'');assert.deepEqual(p.checklist,[]);assert.equal(p.label,'Operations');});
test('шаблон: понад 30 критеріїв — помилка',()=>{assert.throws(()=>createPayload({title:'X',done:Array.from({length:31},(_,i)=>'п'+i).join('\n')}));});
test('контент: відкрита задача блокує повторне створення',()=>{
 const tasks=[{id:'a',lane:'done'},{id:'b',lane:'progress',assignee:'Надія'}];
 assert.equal(contentOpenTask({taskIds:['a']},tasks),null);
 assert.equal(contentOpenTask({taskIds:['a','b']},tasks).id,'b');
 assert.equal(contentOpenTask({},tasks),null);
});
