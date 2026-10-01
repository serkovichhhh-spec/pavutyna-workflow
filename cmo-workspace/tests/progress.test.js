import test from 'node:test';
import assert from 'node:assert/strict';
import {currentWeek,hillPoint,hillPhase,projectSignals,projectsFrom} from '../progress-model.js';
import {progressMarkup} from '../project-progress.js';
test('Hill geometry and stages are independent from task completion',()=>{
 assert.deepEqual(hillPoint(50),{x:300,y:40});assert.equal(hillPoint(null),null);assert.equal(hillPoint(101),null);assert.equal(hillPhase(null),'Оцінки немає');
 const s=projectSignals({taskIds:['a','missing']},[{id:'a',lane:'done'}]);assert.equal(s.completed,1);assert.equal(s.unavailable,1);assert.equal(s.health,null);assert.equal(s.missingWeekly,true);
});
test('weekly boundary follows Kyiv Monday rather than UTC Sunday',()=>{
 assert.equal(currentWeek(new Date('2026-10-04T20:59:00Z')),'2026-09-28');assert.equal(currentWeek(new Date('2026-10-04T21:01:00Z')),'2026-10-05');
 const r={weeklyUpdates:[{week:'2026-09-28',health:'on_track'}]};assert.equal(projectSignals(r,[],new Date('2026-10-05T10:00:00Z')).missingWeekly,true);
});
test('project records retain source identity and safely render historical text',()=>{
 const docs=[{key:'campaigns',revision:3,payload:[{id:'a',name:'<script>evil</script>',hill:{position:25,note:'<img src=x>',at:'2026-09-01T00:00:00Z'},taskIds:[]}]}];
 assert.equal(projectsFrom(docs)[0].key,'campaigns');const html=progressMarkup(docs,[],{now:new Date('2026-10-01T12:00:00Z')});assert(!html.includes('<script>evil'));assert(html.includes('&lt;script&gt;'));assert(html.includes('понад 7 днів'));assert(html.includes('data-id="a"'));
});
