# «Мои дела» — памятка для новой сессии (без секретов)

Стиль: по-русски, дружески, кратко. Не показывать код в чат. Спрашивать формат результата, если нужен документ.

## Что это
PWA одним файлом `index.html` + `sw.js`; бэкенд Supabase (ref `rjiuialimbrnbriqafjl`); сайт https://moi-dela.pages.dev (Cloudflare Pages, авто-деплой из `main`). Android-APK (TWA + нативный слой) в `android/`, собирается в GitHub Actions при пуше в `android/**`, релиз `apk-latest`, пакет `com.moidela.app`.

## Правила работы (экономия токенов)
- Править точечно (Edit / python replace), файл целиком не читать и не выводить. Искать через grep, читать куски `sed -n`.
- Скриншоты — только когда визуал под вопросом, маленькие (clip). Остальное проверять по DOM/тексту.
- Перед пушем: `скрипт `tools_chk.py`: вынуть `<script>` блоки из index.html → `node --check`; `node --check sw.js`.
- КАЖДЫЙ деплой: поднять `BUILD` в index.html и `build.txt` (ставить РЕАЛЬНОЕ местное время. В Linux: `TZ=Asia/Novosibirsk date '+%d.%m %H:%M'`. На Windows/Git Bash `TZ=` НЕ работает (молча даёт GMT, на 7 ч раньше) — там: `powershell -c "Get-Date -Format 'dd.MM HH:mm'"`; часовой пояс ПК = Новосибирск) и `CACHE` в sw.js (`moidela-shell-vNN`).
- Тесты UI: Playwright (chromium `/opt/pw-browsers/chromium`), `python3 -m http.server 8773` в репо, `APP_CONFIG.TEST` → `window.__t` (S, ui, PR, render, goView…). Нужно `S.user={..}` и флаги localStorage `mytasks_full`, `mytasks_jx`, `mytasks_jv`.
- Коммиты на `main`, пуш `git push origin HEAD:main`.

## Функции Supabase (папка supabase/functions)
`analyze` (ИИ: markup/categorize/nutrition_report → Gemini бесплатно), `device` (API для Android: link/list/add/done/snooze/tom), `send-reminders`, `track`, прочие. Секреты лежат в Supabase (не в репо). Деплой — АВТОМАТИЧЕСКИЙ: пуш изменений в `supabase/functions/**` запускает GitHub Action `functions.yml` (секрет `SUPABASE_ACCESS_TOKEN`; verify_jwt заданы в `supabase/config.toml`; статус смотреть `gh run list`). Запасной ручной путь — через дашборд: `supabase.com/dashboard/project/rjiuialimbrnbriqafjl/functions/<имя>/code` → заменить код в monaco-редакторе (`window.monaco.editor.getModels()[0].setValue`) → «Deploy updates». Новая функция: `/functions/new`, имя вводить в поле с placeholder «Give your function a name...», отключить «Verify JWT». SQL — `/sql/new`. Миграции `migration_vNN.sql` выполняются вручную (последняя v21). Из облачной песочницы supabase.co недоступен — тестировать fetch'ем из браузерной панели.

## Фичи-флаги на клиенте
localStorage: `mytasks_full` (не lite), `mytasks_jx` (журнал time_log), `mytasks_jv` (оценка 🟢⚪🔴 val), `mytasks_rv` (remind_via: tg/alarm/both).

## Сделано (кратко)
Нативный слой Android (будильники с кнопками, виджеты, плитка, share-форма, синк каждые 5 мин), выбор способа напоминания, журнал (дата сверху, авторазметка: 3 выпадающие темы + 🟢⚪🔴), мобильная шапка списка (название сверху, фильтр/сортировка/группа показывают значения в кнопках), настройки на телефоне списком разделов, пилюли-кнопки на десктопе, потяни-для-обновления, SW с офлайн-страницей.

Файлы и картинки в задачах (любой файл до 20 МБ; список «Файлы» создаётся сам — личная «перекидка» ПК→телефон): на вебе Ctrl+V или перетаскивание (в открытую задачу или в список «Файлы»), картинки с превью и просмотром; на Android «Поделиться» любым файлом или картинкой → форма QuickAddActivity (превью, список, срок) → функция `device?a=up` кладёт файл в бакет `attachments` и дописывает `tasks.files`.

Итоги журнала (неделя/месяц): сводка «одним взглядом» 🟢⚪🔴, глобальные цели (темы журнала + часов/нед), свои выводы и корректировки за период с напоминанием в следующем. Хранится в `user_settings` (ключи `jr:goals`, `jr:rev:<w|m>:<дата>`), миграция не нужна; синхронизация только при NX (таблицы «Питания»).

## Открытые вопросы
- Иногда на телефоне мигает «This site can't be reached» — причина не найдена (см. sw.js, checkBuild без reg.update()). Нужны условия появления.
- Не подтверждено пользователем: виджеты (сборка 7+), поведение на Huawei Watch 4, будильники на Samsung S21 (нужна батарея «Не ограничено»).
- Решено НЕ делать автозахват банковских пушей для «Трат».
