import test from 'node:test';import assert from 'node:assert/strict';import {purchaseMarkup} from '../purchase.js';
const t=(status,extra={})=>({id:'p',lane:'todo',permissions:{work:true},purchase:{channel:'Чати ЖК',placement:'Чат <b>',amount:1500,month:'2026-11',status,...extra}});
test('керівник бачить погодження, виконавець — ні',()=>{assert(purchaseMarkup(t('requested'),{role:'owner'}).includes('data-purchase="decide"'));const e=purchaseMarkup(t('requested'),{role:'executor'});assert(!e.includes('data-purchase'));assert(!e.includes('<b>'));});
test('після погодження виконавець вносить факт',()=>{const m=purchaseMarkup(t('approved',{approvedAmount:1200}),{role:'executor'});assert(m.includes('data-purchase="fact"'));assert(m.includes('value="1200"'));});
test('оплачене прийняте — без форм',()=>{assert(!purchaseMarkup({...t('paid',{actual:1200}),lane:'done'},{role:'owner'}).includes('data-purchase="fact"'));});
test('без закупівлі — порожньо',()=>assert.equal(purchaseMarkup({id:'x'},{role:'owner'}),''));
