# Google Sheets Sync Roadmap

Поточна версія зберігає задачі в `localStorage` браузера. Наступний етап - спільне сховище в Google Sheets.

## Пропонована структура таблиці

Назва таблиці: `Pavutyna Workflow Tasks`

Аркуші:

- `Tasks`
- `People`
- `Activity`
- `Dashboard`

Колонки `Tasks`:

- `id`
- `title`
- `description`
- `assignee`
- `priority`
- `label`
- `lane`
- `due`
- `checklist_json`
- `created_at`
- `updated_at`
- `source`

## Логіка синхронізації

- Додаток читає задачі з Google Sheets під час відкриття.
- Нові картки записуються в `Tasks`.
- Зміни статусу, відповідального, дедлайну та чеклисту оновлюють відповідний рядок.
- `Activity` зберігає історію змін для майбутньої аналітики.

## Наступний крок

Коли буде готова таблиця, підключити Google Sheets як джерело даних і додати кнопку `Синхронізувати`.
