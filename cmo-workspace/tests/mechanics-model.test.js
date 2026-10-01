import test from 'node:test';
import assert from 'node:assert/strict';
import {dependencyState,validateDependencies,launchReadiness,iceScore,rankExperiments,deadlineQueue,moveCard} from '../mechanics-model.js';
test('dependencies resolve tasks, unknown prerequisites and transitive cycles',()=>{
 const rows=[{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}];assert.throws(()=>validateDependencies(rows));
 assert.equal(dependencyState({id:'p',dependencies:['t']},[],[{id:'t',lane:'done'}]).ready,true);
 assert.equal(dependencyState({id:'p',dependencies:['missing']},[]).waiting[0].missing,true);
 assert.equal(dependencyState({id:'p',dependencies:['t']},[],[{id:'t',lane:'review'}]).ready,false);
});
test('launch cannot be ready on approval alone or with unavailable linked task',()=>{
 const r={owner:'O',objective:'Goal',offer:'Offer',channels:'Search',approval:'Погоджено',requiredGates:['creative'],gates:{creative:true}};
 assert.equal(launchReadiness(r).ready,true);assert.equal(launchReadiness({...r,taskIds:['lost']}).ready,false);
 assert.equal(launchReadiness({...r,gates:{creative:false}}).ready,false);
 assert.equal(launchReadiness({...r,requiredGates:[]}).ready,false);
});
test('ICE excludes unscored records and deadline control keeps ambiguous dates separate',()=>{
 assert.equal(iceScore({impact:10,confidence:5,ease:2}),100);assert.equal(iceScore({impact:null,confidence:5,ease:2}),null);
 assert.equal(rankExperiments([{id:'a'},{id:'b',impact:10,confidence:5,ease:2}])[0].id,'b');
 const q=deadlineQueue([{id:'1',due:'2026-10-01',lane:'todo'},{id:'2',due:'2026-09-30',lane:'done'},{id:'3',due:'до п’ятниці',lane:'todo'}],'2026-10-01');
 assert.equal(q.today.length,1);assert.equal(q.overdue.length,0);assert.equal(q.undated.length,1);
});
test('card movement preserves other content and bounds',()=>{
 const b={id:'b',cards:[{id:'c',title:'Keep',x:0,y:0}]};const next=moveCard(b,'c',-5,99.8);
 assert.deepEqual(next.cards[0],{id:'c',title:'Keep',x:0,y:100});assert.equal(b.cards[0].y,0);
});
