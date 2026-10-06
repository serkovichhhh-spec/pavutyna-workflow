import {escapeHtml as h} from './metrics.js';

export function taskActionsMarkup(task, actor) {
  if (task.permissions?.work !== true) return '';
  const owner = actor.role === 'owner';
  const actions = [];
  if (!['progress', 'review', 'ready', 'done'].includes(task.lane)) actions.push(['progress', 'Прийняти в роботу']);
  if (!['review', 'ready', 'done'].includes(task.lane)) actions.push(['review', 'На перевірку'], ['blocked', 'Заблокувати']);
  if (owner) {
    if (['review', 'ready', 'done', 'blocked'].includes(task.lane)) actions.push(['todo', 'Повернути до роботи']);
    if (task.lane === 'review') actions.push(['ready', 'Готово до запуску'], ['done', 'Прийняти й завершити']);
    if (task.lane === 'ready') actions.push(['done', 'Завершити задачу']);
  }
  const help = task.lane === 'ready'
    ? 'Матеріали готові до запуску. Після фактичного запуску керівник завершує задачу.'
    : task.lane === 'review'
      ? 'Керівник перевіряє результат: повертає до роботи, позначає готовність до запуску або приймає й завершує задачу.'
      : 'Збереження тексту не змінює статус задачі. «На перевірку» передає результат керівнику.';
  return `<section class="task-result"><form id="result-form"><label>Результат або причина блокування<textarea id="result" name="result" rows="3" maxlength="10000">${h(task.result || '')}</textarea></label><div class="result-save"><button type="submit" class="primary">Зберегти результат / причину</button><span id="result-save-state" role="status"></span></div></form><p class="task-help">${help}</p><div class="operations">${actions.map(([lane, text]) => `<button data-move="${lane}">${text}</button>`).join('')}</div></section>`;
}

// A gesture starting inside the dialog must not become a backdrop click.
export function mountTaskDialogDismiss(dialog, closeButton) {
  const outside = event => {
    const r = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
  };
  let backdropPointer = null;
  dialog.addEventListener('pointerdown', event => { backdropPointer = outside(event) ? event.pointerId : null; });
  dialog.addEventListener('pointerup', event => {
    if (backdropPointer === event.pointerId && outside(event)) dialog.close();
    backdropPointer = null;
  });
  dialog.addEventListener('pointercancel', () => { backdropPointer = null; });
  closeButton.addEventListener('click', () => dialog.close());
}
