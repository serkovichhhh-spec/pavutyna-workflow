import test from 'node:test';import assert from 'node:assert/strict';
import {checkCode,suggestCode,siteState,siteLine,salesText,rowsMarkup,siteBlock,normalizeCode} from '../promo.js';
test('перевірка коду',()=>{
 assert.equal(normalizeCode(' faina '),'FAINA');
 assert.equal(checkCode('faina').ok,true);assert(!checkCode('faina').warn);
 assert.equal(checkCode('7777').warn,true);assert.equal(checkCode('1a2b3').warn,true);
 assert.equal(checkCode('ж-к').ok,false);assert.equal(checkCode('FAINA',['FAINA']).ok,false);
 assert.equal(checkCode('VERYLONGCODE12').warn,true);
});
test('пропозиція коду: латиниця, не hex, не зайнятий',()=>{
 assert.equal(suggestCode('faina-town'),'FAINA');
 assert.equal(suggestCode('ЖК Файна таун'),'FAINA');
 assert.equal(suggestCode('faina-town',['FAINA']),'FAINA2');
 assert.equal(suggestCode('K218b',[],'B'),'BK218B');
 assert(!/^[0-9A-F]{4,5}$/.test(suggestCode('abc')));
 assert.equal(suggestCode('ЖК Відрадний'),'VIDRADNY');
});
const live7777={code:'7777',status:'live',channel:'campaign',campaign:'Секретний Гігабіт',offer:'Секретний <b>Гігабіт',target_url:'https://pavutyna.ua/ua/sg.html',site_target:'https://pavutyna.ua/ua/sg.html',trackUrl:'https://l.pavutyna.com/s/promo-7777',tracking:{kind:'none'}};
const fresh={code:'FAINA',status:'new',channel:'zhk_chat',zhkName:'ЖК Файна таун',target_url:'https://pavutyna.ua/ua/Taryfy-dlia-domu.html',trackUrl:'https://l.pavutyna.com/s/promo-faina',created_by:'Надія',stats:{d7:1,d30:2,total:3},tracking:{kind:'source'}};
test('що робити на сайті',()=>{
 assert.equal(siteState(fresh).todo,'add');assert.equal(siteState(live7777).todo,'update');
 assert.equal(siteState({...live7777,site_target:live7777.trackUrl}).todo,null);
 assert.equal(siteLine(fresh),'FAINA  https://l.pavutyna.com/s/promo-faina  "Чат ЖК · ЖК Файна таун"');
 const b=siteBlock([fresh,live7777]);assert(b.includes('Нові коди · 1'));assert(b.includes('Замінити адресу · 1'));
 assert.equal(siteBlock([{...live7777,site_target:live7777.trackUrl}]),'');
});
test('таблиця: права й екранування',()=>{
 const owner=rowsMarkup([fresh,live7777],{isOwner:true,actor:{name:'Дмитро'}});
 assert(owner.includes('data-edit="7777"'));assert(owner.includes('data-status="paused"'));assert(!owner.includes('<b>Гігабіт'));assert(owner.includes('не рахується'));
 const nadia=rowsMarkup([fresh,live7777],{isOwner:false,actor:{name:'Надія'}});
 assert(nadia.includes('data-edit="FAINA"'));assert(!nadia.includes('data-edit="7777"'));assert(!nadia.includes('data-status'));
});
test('шпаргалка ВП лише з активними кодами',()=>{
 const t=salesText([fresh,live7777],{sales_note:'Запиши код у заявку',referral_bonus:'+400'});
 assert(t.includes('7777 — Секретний <b>Гігабіт (акція: Секретний Гігабіт)'));assert(!t.includes('FAINA'));assert(t.includes('+400'));
});
