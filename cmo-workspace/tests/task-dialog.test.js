import test from 'node:test';
import assert from 'node:assert/strict';
import {taskActionsMarkup, mountTaskDialogDismiss} from '../task-dialog.js';
import {validateFile,taskToolsMarkup} from '../task-tools.js';

test('SVG is selectable and validated as an attachment; HTML and oversized files stay rejected', () => {
  assert.equal(validateFile({name:'LOGO.SVG',size:97,type:''}),'image/svg+xml');
  assert.throws(()=>validateFile({name:'page.html',size:97}));
  assert.throws(()=>validateFile({name:'logo.svg',size:20971521}));
  assert.throws(()=>validateFile({name:'logo.svg',size:0}));
  const markup=taskToolsMarkup({permissions:{work:true}},[],[],{role:'executor'});
  assert.match(markup,/accept="\.svg,/);
});

test('result saving is separate from transitions and escapes user text', () => {
  const markup=taskActionsMarkup({lane:'progress',permissions:{work:true},result:'</textarea><script>oops</script>'},{role:'executor'});
  assert.match(markup,/id="result-form"/);
  assert.match(markup,/Зберегти результат \/ причину/);
  assert.match(markup,/data-move="review"/);
  assert.doesNotMatch(markup,/<script>|data-move="done"|data-move="ready"/);
  assert.equal(taskActionsMarkup({lane:'review',permissions:{work:false}},{role:'executor'}),'');
});

test('owner can finish ready tasks; acceptance is not advertised for unfinished work', () => {
  for(const lane of ['todo','progress','blocked','done']) {
    assert.doesNotMatch(taskActionsMarkup({lane,permissions:{work:true}},{role:'owner'}),/data-move="done"/);
  }
  assert.match(taskActionsMarkup({lane:'ready',permissions:{work:true}},{role:'owner'}),/data-move="done">Завершити задачу/);
  assert.match(taskActionsMarkup({lane:'review',permissions:{work:true}},{role:'owner'}),/Прийняти й завершити/);
});

test('backdrop dismiss ignores interior padding and drag-out; pointer cancellation resets it', () => {
  const dialog=new EventTarget(),button=new EventTarget();let closes=0;
  dialog.close=()=>closes++;dialog.getBoundingClientRect=()=>({left:100,right:500,top:100,bottom:500});
  mountTaskDialogDismiss(dialog,button);
  const point=(type,x,y,id=1)=>dialog.dispatchEvent(Object.assign(new Event(type),{clientX:x,clientY:y,pointerId:id}));
  point('pointerdown',200,200);point('pointerup',20,20);assert.equal(closes,0);
  point('pointerdown',200,200);point('pointerup',200,200);assert.equal(closes,0);
  point('pointerdown',20,20);point('pointerup',20,20);assert.equal(closes,1);
  point('pointerdown',20,20);point('pointercancel',20,20);point('pointerup',20,20);assert.equal(closes,1);
  point('pointerdown',20,20,1);point('pointerup',20,20,2);assert.equal(closes,1);
  button.dispatchEvent(new Event('click'));assert.equal(closes,2);
});
