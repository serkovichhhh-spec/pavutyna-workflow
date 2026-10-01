import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationGroups,tabsFor,groupFor} from '../navigation.js';
import {modules} from '../space-model.js';
test('every existing module has exactly one accessible owner destination',()=>{
 const keys=navigationGroups.flatMap(g=>tabsFor(g,'owner').map(([k])=>k));
 assert.equal(keys.length,new Set(keys).size);
 for(const key of Object.keys(modules))assert.equal(keys.filter(k=>k===key).length,1,key);
 assert.equal(navigationGroups.filter(g=>g.id!=='cabinet').length,6);
 for(const key of keys)assert(groupFor(key));
});
test('executor and intake navigation excludes private owner tools',()=>{
 for(const role of ['executor','intake']){
  const keys=navigationGroups.flatMap(g=>tabsFor(g,role).map(([k])=>k));
  assert.deepEqual(keys,['inbox','control','mine','board','visual','profile']);
  assert.equal(groupFor('control').id,'dashboard');
 }
});
