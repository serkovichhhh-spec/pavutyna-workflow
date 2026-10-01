import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionStore,sessionKey} from '../session-store.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const pair={access_token:'test-access',refresh_token:'test-refresh',expires_at:1000};
function setup(extra={}){const persistent=storage(),temporary=storage();const opts={persistent,temporary,now:()=>100000,refresh:async()=>pair,...extra};return {...opts,store:createSessionStore(opts)};}
test('remembered session survives a fresh tab; unchecked login stays in its tab',()=>{
 const c=setup();c.store.save({...pair,password:'must-not-save'},true);
 assert(!c.persistent.getItem(sessionKey).includes('must-not-save'));
 assert.equal(createSessionStore({...c,temporary:storage()}).read().access_token,pair.access_token);
 c.store.save(pair,false);assert.equal(c.persistent.getItem(sessionKey),null);
 assert.equal(createSessionStore({...c,temporary:storage()}).read(),null);
 assert.equal(c.store.read().access_token,pair.access_token);
});
test('legacy tab sessions are read; corrupt or incomplete data do not grant a session',()=>{
 const c=setup();c.temporary.setItem(sessionKey,JSON.stringify(pair));assert(c.store.read());
 c.temporary.setItem(sessionKey,'broken');assert.equal(c.store.read(),null);
 c.persistent.setItem(sessionKey,JSON.stringify({access_token:'incomplete'}));assert.equal(c.store.read(),null);
});
test('concurrent callers refresh once and persist the rotated pair',async()=>{
 let calls=0;const c=setup({refresh:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {...pair,access_token:'rotated',refresh_token:'new'};}});
 c.store.save({...pair,expires_at:99},true);
 assert.deepEqual(await Promise.all([c.store.token(),c.store.token(),c.store.token()]),['rotated','rotated','rotated']);
 assert.equal(calls,1);assert.equal(c.store.read().refresh_token,'new');
});
test('network failures retain session; revoked refresh ends it',async()=>{
 let revoked=false,ended=0;const c=setup({refresh:async()=>{throw Object.assign(Error('offline'),{status:revoked?401:503});},onEnd:()=>ended++});
 c.store.save({...pair,expires_at:99},true);await assert.rejects(c.store.token());assert(c.store.read());
 revoked=true;await assert.rejects(c.store.token());assert.equal(c.store.read(),null);assert.equal(ended,1);
});
test('logout during refresh cannot restore the old session',async()=>{
 let finish;const c=setup({refresh:()=>new Promise(r=>{finish=r;})});c.store.save({...pair,expires_at:99},true);
 const pending=c.store.token();await new Promise(r=>setTimeout(r,0));c.store.clear();finish(pair);
 await assert.rejects(pending);assert.equal(c.store.read(),null);
});
test('a live token avoids refresh and a different-tab rotation is read before refresh',async()=>{
 let calls=0;const c=setup({refresh:async()=>{calls++;return pair;}});c.store.save(pair,true);
 assert.equal(await c.store.token(),pair.access_token);assert.equal(calls,0);
 c.persistent.setItem(sessionKey,JSON.stringify({...pair,access_token:'other-tab'}));assert.equal(await c.store.token(),'other-tab');
});
