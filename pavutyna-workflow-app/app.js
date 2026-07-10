const STORAGE_KEY = "pavutyna-workflow-state-v1";

const lanes = [
  { id: "backlog", title: "Backlog", hint: "Ідеї та запити" },
  { id: "todo", title: "To Do", hint: "Готово до старту" },
  { id: "progress", title: "In Progress", hint: "У роботі" },
  { id: "review", title: "Review", hint: "На перевірці" },
  { id: "ready", title: "Ready", hint: "Готово до запуску" },
  { id: "done", title: "Done", hint: "Закрито" }
];

const team = [
  { name: "Дмитро", role: "CMO / власник системи" },
  { name: "Діана", role: "SMM / контент / маркетинг" },
  { name: "Наталі", role: "SMM і контент" },
  { name: "Олексій", role: "Digital / performance" },
  { name: "Надія", role: "BTL / ЖК" },
  { name: "Борис", role: "Аналітика / CRM" },
  { name: "Кол-центр", role: "Ліди і скрипти" },
  { name: "Техвідділ", role: "Підключення і SLA" }
];

const seedTasks = [
  {
    id: "task-1001",
    title: "Підготувати SMM-пакет для GPON у ЖК Варшавський",
    description: "Сформувати 3 пости, 5 сторіз і короткий офер для мешканців ЖК. Узгодити з digital перед запуском.",
    assignee: "Наталі",
    priority: "High",
    label: "SMM",
    lane: "progress",
    due: "до п'ятниці",
    checklist: [
      { text: "Зібрати офер і ключові болі мешканців", done: true },
      { text: "Підготувати тексти і візуальні референси", done: false },
      { text: "Передати дизайн на адаптацію", done: false },
      { text: "Запланувати публікації і UTM", done: false }
    ],
    createdAt: "2026-07-10T08:00:00.000Z"
  },
  {
    id: "task-1002",
    title: "Оновити макет флаєра для підключень у новобудовах",
    description: "Зробити версію з чітким CTA, QR-кодом і місцем для локального оферу конкретного ЖК.",
    assignee: "Діана",
    priority: "Medium",
    label: "Design",
    lane: "review",
    due: "понеділок",
    checklist: [
      { text: "Перевірити актуальний тарифний офер", done: true },
      { text: "Зібрати QR і контактні дані", done: true },
      { text: "Підготувати print і digital версії", done: false },
      { text: "Отримати фінальне погодження", done: false }
    ],
    createdAt: "2026-07-10T08:10:00.000Z"
  },
  {
    id: "task-1003",
    title: "Запустити тестову digital-кампанію на райони з низькою пенетрацією",
    description: "Порівняти 2 аудиторії, 2 офери і 2 креативи. Ціль: дешевший якісний лід без просідання конверсії.",
    assignee: "Олексій",
    priority: "High",
    label: "Digital",
    lane: "todo",
    due: "до 15 липня",
    checklist: [
      { text: "Підготувати структуру тесту", done: false },
      { text: "Зібрати аудиторії і виключення", done: false },
      { text: "Підключити UTM і події", done: false },
      { text: "Сформувати звіт після 72 годин", done: false }
    ],
    createdAt: "2026-07-10T08:20:00.000Z"
  },
  {
    id: "task-1004",
    title: "Зібрати фото-звіт по BTL-точках у ЖК",
    description: "Перевірити наявність матеріалів, якість розміщення і точки контакту з мешканцями.",
    assignee: "Надія",
    priority: "Medium",
    label: "BTL",
    lane: "backlog",
    due: "цього тижня",
    checklist: [
      { text: "Оновити список адрес", done: false },
      { text: "Отримати фото з кожної точки", done: false },
      { text: "Позначити проблемні локації", done: false },
      { text: "Передати висновки в задачник", done: false }
    ],
    createdAt: "2026-07-10T08:30:00.000Z"
  },
  {
    id: "task-1005",
    title: "Побудувати щотижневий зріз по лідах і конверсіях",
    description: "Вивести ліди, CPL, конверсію в заявку, конверсію в підключення і вузькі місця по каналах.",
    assignee: "Борис",
    priority: "Low",
    label: "Analytics",
    lane: "ready",
    due: "щоп'ятниці",
    checklist: [
      { text: "Зібрати дані з CRM", done: true },
      { text: "Розбити по каналах і ЖК", done: true },
      { text: "Позначити 3 рішення на наступний тиждень", done: false }
    ],
    createdAt: "2026-07-10T08:40:00.000Z"
  },
  {
    id: "task-1006",
    title: "Розігнати у соцмережах функцію на сайті \"Написати директору\"",
    description: "Підготувати SMM-комунікацію про функцію \"Написати директору\": пояснити користь для клієнтів, показати простий шлях звернення і підсилити довіру до бренду через відкритий контакт з керівництвом.",
    assignee: "Діана",
    priority: "Medium",
    label: "SMM",
    lane: "todo",
    due: "без дедлайну",
    checklist: [
      { text: "Сформулювати головний меседж: навіщо клієнту писати директору", done: false },
      { text: "Підготувати 2-3 формати для соцмереж: пост, сторіз, короткий банер", done: false },
      { text: "Додати зрозумілий CTA із посиланням або шляхом до функції на сайті", done: false },
      { text: "Узгодити тональність: відкритість, довіра, швидке реагування", done: false },
      { text: "Після публікації зібрати реакції, питання і звернення", done: false }
    ],
    createdAt: "2026-07-10T09:00:00.000Z"
  }
];

const boardFrames = [
  {
    title: "1. Стратегія",
    x: 70,
    y: 70,
    w: 420,
    h: 270,
    color: "var(--brand)",
    items: [
      ["Цілі", "ліди, підключення, ARPU, проникнення по ЖК"],
      ["ICP", "мешканці ЖК, ОСББ, локальні бізнеси"],
      ["Офер", "інтернет, GPON, пакети, сервісна перевага"],
      ["Рішення", "щотижневі пріоритети і trade-off"]
    ]
  },
  {
    title: "2. Попит і канали",
    x: 580,
    y: 70,
    w: 470,
    h: 270,
    color: "var(--blue)",
    items: [
      ["Digital", "кампанії, аудиторії, UTM, CPL"],
      ["SMM", "контент, сторіз, ком'юніті, репутація"],
      ["BTL", "флаєри, точки контакту, промоутери"],
      ["Партнери", "ОСББ, забудовники, локальні лідери"]
    ]
  },
  {
    title: "3. Операційний потік",
    x: 1140,
    y: 70,
    w: 390,
    h: 270,
    color: "var(--teal)",
    items: [
      ["Inbox", "усі задачі входять одним списком"],
      ["Kanban", "статус, власник, дедлайн, чеклист"],
      ["Review", "контроль якості перед запуском"],
      ["Done", "закриття з висновком"]
    ]
  },
  {
    title: "4. Контент-фабрика",
    x: 70,
    y: 430,
    w: 480,
    h: 300,
    color: "var(--violet)",
    items: [
      ["Brief", "запит, аудиторія, канал, CTA"],
      ["Copy", "тексти, офери, аргументи"],
      ["Design", "макети, адаптації, print/digital"],
      ["Publish", "план, UTM, контроль виходу"]
    ]
  },
  {
    title: "5. Sales handoff",
    x: 650,
    y: 430,
    w: 420,
    h: 300,
    color: "var(--amber)",
    items: [
      ["Lead", "джерело, район, ЖК, інтерес"],
      ["Кол-центр", "скрипт, кваліфікація, запис"],
      ["Техвідділ", "доступність, дата, SLA"],
      ["CRM", "статуси і причини втрат"]
    ]
  },
  {
    title: "6. Аналітика",
    x: 1170,
    y: 430,
    w: 360,
    h: 300,
    color: "var(--green)",
    items: [
      ["Weekly pulse", "план / факт / ризики"],
      ["Channel ROI", "витрати, CPL, якість лідів"],
      ["Geo map", "пріоритети по ЖК і районах"],
      ["Learning log", "що спрацювало і що ні"]
    ]
  }
];

let state = loadState();
let statusTimer;

function loadState() {
  const fallback = {
    tasks: seedTasks,
    selectedTaskId: null,
    view: "board",
    zoom: 1,
    filters: { query: "", assignee: "all", priority: "all" }
  };

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.tasks)) return fallback;
    return {
      ...fallback,
      ...stored,
      tasks: mergeSeedTasks(stored.tasks),
      filters: { ...fallback.filters, ...(stored.filters || {}) }
    };
  } catch {
    return fallback;
  }
}

function mergeSeedTasks(tasks) {
  const existingIds = new Set(tasks.map((task) => task.id));
  const missingSeedTasks = seedTasks.filter((task) => !existingIds.has(task.id));
  return [...missingSeedTasks, ...tasks];
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showStatus(message = "Збережено локально") {
  const indicator = document.getElementById("saveIndicator");
  if (!indicator) return;
  indicator.textContent = message;
  indicator.classList.add("is-visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => indicator.classList.remove("is-visible"), 1700);
}

function uid() {
  return `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortText(value = "", max = 118) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function init() {
  bindEvents();
  populateSelectors();
  renderAll();
}

function bindEvents() {
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.getElementById("addSmartTask").addEventListener("click", addSmartTask);
  document.getElementById("addBlankTask").addEventListener("click", addBlankTask);
  document.getElementById("zoomIn").addEventListener("click", () => changeZoom(0.1));
  document.getElementById("zoomOut").addEventListener("click", () => changeZoom(-0.1));
  document.getElementById("resetBoard").addEventListener("click", resetBoard);
  document.getElementById("exportState").addEventListener("click", exportState);
  document.getElementById("importState").addEventListener("change", importState);
  document.getElementById("resetDemo").addEventListener("click", resetDemoData);

  document.getElementById("searchTasks").addEventListener("input", (event) => {
    state.filters.query = event.target.value;
    saveState();
    renderAll();
  });

  document.getElementById("filterAssignee").addEventListener("change", (event) => {
    state.filters.assignee = event.target.value;
    saveState();
    renderAll();
  });

  document.getElementById("filterPriority").addEventListener("change", (event) => {
    state.filters.priority = event.target.value;
    saveState();
    renderAll();
  });
}

function populateSelectors() {
  const filterAssignee = document.getElementById("filterAssignee");
  const assigneeOverride = document.getElementById("assigneeOverride");
  const inspectorOptions = team.map((person) => `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`).join("");

  filterAssignee.insertAdjacentHTML("beforeend", inspectorOptions);
  assigneeOverride.insertAdjacentHTML("beforeend", inspectorOptions);
}

function renderAll() {
  renderView();
  renderTeam();
  renderMiniStats();
  renderBoard();
  renderKanban();
  renderInspector();
  renderAnalytics();
  syncFilters();
}

function renderView() {
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${state.view}View`);
  });
}

function switchView(view) {
  state.view = view;
  saveState();
  renderAll();
}

function syncFilters() {
  document.getElementById("searchTasks").value = state.filters.query || "";
  document.getElementById("filterAssignee").value = state.filters.assignee || "all";
  document.getElementById("filterPriority").value = state.filters.priority || "all";
}

function renderTeam() {
  const counts = countBy(state.tasks, "assignee");
  document.getElementById("teamList").innerHTML = team
    .map((person) => `
      <div class="team-pill">
        <div>
          <strong>${escapeHtml(person.name)}</strong>
          <span>${escapeHtml(person.role)}</span>
        </div>
        <strong>${counts[person.name] || 0}</strong>
      </div>
    `)
    .join("");
}

function renderMiniStats() {
  const openTasks = state.tasks.filter((task) => task.lane !== "done").length;
  const highTasks = state.tasks.filter((task) => task.priority === "High" && task.lane !== "done").length;
  const reviewTasks = state.tasks.filter((task) => task.lane === "review").length;
  document.getElementById("miniStats").innerHTML = `
    <div class="mini-stat"><strong>${openTasks}</strong><span>відкритих задач</span></div>
    <div class="mini-stat"><strong>${highTasks}</strong><span>high priority</span></div>
    <div class="mini-stat"><strong>${reviewTasks}</strong><span>на перевірці</span></div>
  `;
}

function renderBoard() {
  const canvas = document.getElementById("workflowCanvas");
  canvas.style.transform = `scale(${state.zoom})`;
  document.getElementById("zoomValue").textContent = `${Math.round(state.zoom * 100)}%`;

  const lines = [
    line(490, 205, 90, 0),
    line(1050, 205, 90, 0),
    line(310, 340, 90, 90),
    line(810, 340, 90, 90),
    line(1255, 340, 90, 90)
  ].join("");

  canvas.innerHTML = `
    ${lines}
    ${boardFrames.map(renderFrame).join("")}
  `;
}

function renderFrame(frame) {
  const cards = frame.items
    .map(([title, text]) => `
      <div class="frame-card" style="border-top: 4px solid ${frame.color}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </div>
    `)
    .join("");

  return `
    <section class="frame" style="left:${frame.x}px; top:${frame.y}px; width:${frame.w}px; height:${frame.h}px;">
      <h3>${escapeHtml(frame.title)}</h3>
      <div class="frame-grid">${cards}</div>
    </section>
  `;
}

function line(x, y, width, angle) {
  return `<div class="connector-line" style="left:${x}px; top:${y}px; width:${width}px; transform: rotate(${angle}deg);"></div>`;
}

function changeZoom(delta) {
  state.zoom = Math.min(1.35, Math.max(0.65, Number((state.zoom + delta).toFixed(2))));
  saveState();
  renderBoard();
}

function resetBoard() {
  state.zoom = 1;
  saveState();
  renderBoard();
  document.querySelector(".canvas-shell").scrollTo({ left: 0, top: 0, behavior: "smooth" });
}

function getFilteredTasks() {
  const query = (state.filters.query || "").trim().toLowerCase();
  return state.tasks.filter((task) => {
    const matchesQuery = !query || [task.title, task.description, task.assignee, task.label, task.due]
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesAssignee = state.filters.assignee === "all" || task.assignee === state.filters.assignee;
    const matchesPriority = state.filters.priority === "all" || task.priority === state.filters.priority;
    return matchesQuery && matchesAssignee && matchesPriority;
  });
}

function renderKanban() {
  const filtered = getFilteredTasks();
  const kanban = document.getElementById("kanbanBoard");
  kanban.innerHTML = lanes
    .map((lane) => {
      const laneTasks = filtered.filter((task) => task.lane === lane.id);
      return `
        <section class="kanban-column" data-lane="${lane.id}">
          <div class="column-header">
            <div>
              <h3>${escapeHtml(lane.title)}</h3>
              <span class="tag">${escapeHtml(lane.hint)}</span>
            </div>
            <span class="column-count">${laneTasks.length}</span>
          </div>
          <div class="task-list">
            ${laneTasks.length ? laneTasks.map(renderTaskCard).join("") : `<div class="empty-column">Поки порожньо</div>`}
          </div>
        </section>
      `;
    })
    .join("");

  kanban.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      state.selectedTaskId = card.dataset.taskId;
      saveState();
      renderAll();
    });
  });

  kanban.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => moveTask(button.dataset.taskId, Number(button.dataset.move)));
  });

  kanban.querySelectorAll("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", () => duplicateTask(button.dataset.duplicate));
  });
}

function renderTaskCard(task) {
  const checklistDone = task.checklist.filter((item) => item.done).length;
  return `
    <article class="task-card priority-${task.priority.toLowerCase()} ${state.selectedTaskId === task.id ? "selected" : ""}" data-task-id="${task.id}">
      <div class="task-meta">
        <span class="tag ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>
        <span class="tag">${escapeHtml(task.assignee)}</span>
        <span class="tag">${escapeHtml(task.label)}</span>
      </div>
      <h3 class="task-title">${escapeHtml(task.title)}</h3>
      <p class="task-desc">${escapeHtml(shortText(task.description, 126))}</p>
      <div class="card-actions">
        <span class="tag">${escapeHtml(task.due || "без дедлайну")}</span>
        <span>
          <button class="tiny-button" type="button" data-move="-1" data-task-id="${task.id}" title="Назад">←</button>
          <button class="tiny-button" type="button" data-move="1" data-task-id="${task.id}" title="Далі">→</button>
          <button class="tiny-button" type="button" data-duplicate="${task.id}" title="Дублювати">Копія</button>
        </span>
      </div>
      <div class="task-meta" style="margin-top:8px; margin-bottom:0;">
        <span class="tag">${checklistDone}/${task.checklist.length} чеклист</span>
      </div>
    </article>
  `;
}

function moveTask(taskId, direction) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const currentIndex = lanes.findIndex((lane) => lane.id === task.lane);
  const nextIndex = Math.min(lanes.length - 1, Math.max(0, currentIndex + direction));
  task.lane = lanes[nextIndex].id;
  state.selectedTaskId = task.id;
  saveState();
  showStatus("Статус оновлено");
  renderAll();
}

function duplicateTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const copy = {
    ...task,
    id: uid(),
    title: `${task.title} — копія`,
    lane: "backlog",
    createdAt: new Date().toISOString(),
    checklist: task.checklist.map((item) => ({ ...item, done: false }))
  };
  state.tasks.unshift(copy);
  state.selectedTaskId = copy.id;
  saveState();
  showStatus("Картку скопійовано");
  renderAll();
}

function addBlankTask() {
  const task = {
    id: uid(),
    title: "Нова задача",
    description: "Опиши очікуваний результат, контекст і критерій готовності.",
    assignee: "Дмитро",
    priority: "Medium",
    label: "Operations",
    lane: "backlog",
    due: "без дедлайну",
    checklist: defaultChecklist("operations"),
    createdAt: new Date().toISOString()
  };
  state.tasks.unshift(task);
  state.selectedTaskId = task.id;
  state.view = "tasks";
  saveState();
  showStatus("Картку створено");
  renderAll();
}

function addSmartTask() {
  const input = document.getElementById("taskInput");
  const raw = input.value.trim();
  if (!raw) {
    input.focus();
    return;
  }

  const task = parseTask(raw);
  const assigneeOverride = document.getElementById("assigneeOverride").value;
  const priorityOverride = document.getElementById("priorityOverride").value;
  const laneOverride = document.getElementById("laneOverride").value;

  if (assigneeOverride) task.assignee = assigneeOverride;
  if (priorityOverride) task.priority = priorityOverride;
  task.lane = laneOverride || "todo";

  state.tasks.unshift(task);
  state.selectedTaskId = task.id;
  state.view = "tasks";
  input.value = "";
  saveState();
  showStatus("Задачу додано");
  renderAll();
}

function parseTask(raw) {
  const lower = raw.toLowerCase();
  const assignee = inferAssignee(raw);
  const priority = inferPriority(lower);
  const label = inferLabel(lower);
  const due = inferDue(raw);
  const title = buildTitle(raw, assignee);

  return {
    id: uid(),
    title,
    description: buildDescription(raw, label),
    assignee,
    priority,
    label,
    lane: "todo",
    due,
    checklist: defaultChecklist(label),
    createdAt: new Date().toISOString()
  };
}

function inferAssignee(raw) {
  const lower = raw.toLowerCase();
  const byKnownName = team.find((person) => lower.includes(person.name.toLowerCase()));
  if (byKnownName) return byKnownName.name;

  const prefix = raw.match(/^([А-ЯІЇЄҐA-Z][А-Яа-яІіЇїЄєҐґA-Za-z' -]{2,24})\s*[:,\-]/);
  if (prefix) return prefix[1].trim();

  if (lower.includes("дизайн") || lower.includes("макет")) return "Діана";
  if (lower.includes("smm") || lower.includes("пост") || lower.includes("сторіз")) return "Наталі";
  if (lower.includes("реклама") || lower.includes("digital") || lower.includes("utm")) return "Олексій";
  if (lower.includes("btl") || lower.includes("жк") || lower.includes("флаєр")) return "Надія";
  if (lower.includes("звіт") || lower.includes("аналіт")) return "Борис";
  return "Дмитро";
}

function inferPriority(lower) {
  if (/high|терміново|asap|сьогодні|критично|важливо/.test(lower)) return "High";
  if (/low|низьк|коли буде час|не терміново/.test(lower)) return "Low";
  return "Medium";
}

function inferLabel(lower) {
  if (/smm|контент|пост|сторіз|instagram|facebook|соц/.test(lower)) return "SMM";
  if (/digital|реклама|performance|utm|лід|cpl|кампан/.test(lower)) return "Digital";
  if (/дизайн|макет|банер|креатив|флаєр|листів/.test(lower)) return "Design";
  if (/btl|жк|осбб|промо|точк|під'їзд|підїзд/.test(lower)) return "BTL";
  if (/crm|звіт|аналіт|дашборд|конверс/.test(lower)) return "Analytics";
  if (/скрипт|кол-центр|продаж|дзвін/.test(lower)) return "Sales";
  return "Operations";
}

function inferDue(raw) {
  const text = raw.trim();
  const patterns = [
    /дедлайн\s*(?:до|:|-)?\s*([^,.;]+)/i,
    /до\s+([^,.;]+)/i,
    /на\s+(понеділок|вівторок|середу|четвер|п'ятницю|пятницю|суботу|неділю)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  if (/сьогодні/i.test(text)) return "сьогодні";
  if (/завтра/i.test(text)) return "завтра";
  if (/цього тижня/i.test(text)) return "цього тижня";
  return "без дедлайну";
}

function buildTitle(raw, assignee) {
  let title = raw
    .replace(new RegExp(`^${assignee}\\s*[:,\\-]?\\s*`, "i"), "")
    .replace(/дедлайн\s*(?:до|:|-)?\s*[^,.;]+/i, "")
    .replace(/пріоритет\s*(?:high|medium|low|високий|середній|низький)/i, "")
    .replace(/(?:high|medium|low|терміново|asap|критично|важливо)/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, "");

  if (!title) title = raw;
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return shortText(title, 82);
}

function buildDescription(raw, label) {
  const resultByLabel = {
    SMM: "готовий контент-пакет із текстами, візуальними вимогами і планом публікації.",
    Digital: "структура запуску з аудиторіями, UTM, бюджетом і критерієм оцінки.",
    Design: "макет, який можна погодити, адаптувати і віддати у друк або digital.",
    BTL: "польова задача з адресами, матеріалами, відповідальними і фото-підтвердженням.",
    Analytics: "зріз даних із висновками і рішеннями на наступний цикл.",
    Sales: "узгоджений скрипт або процес передачі ліда в продажі.",
    Operations: "закритий операційний результат із власником і критерієм готовності."
  };

  return `Вхідний запит: ${raw}\nОчікуваний результат: ${resultByLabel[label] || resultByLabel.Operations}`;
}

function defaultChecklist(label) {
  const sets = {
    SMM: ["Уточнити офер і аудиторію", "Написати тексти", "Підготувати візуальні вимоги", "Запланувати вихід", "Перевірити результат"],
    Digital: ["Сформувати гіпотезу", "Підготувати аудиторії", "Підключити UTM", "Запустити тест", "Зняти перший зріз"],
    Design: ["Зібрати бриф", "Підготувати чорновий макет", "Перевірити CTA і контакти", "Адаптувати формати", "Передати на погодження"],
    BTL: ["Підтвердити адреси", "Підготувати матеріали", "Поставити відповідальних", "Отримати фото-звіт", "Занести висновки"],
    Analytics: ["Зібрати дані", "Очистити розрізи", "Побудувати висновки", "Позначити ризики", "Запропонувати рішення"],
    Sales: ["Уточнити сценарій", "Оновити скрипт", "Погодити з командою", "Передати в роботу", "Зібрати фідбек"],
    Operations: ["Уточнити результат", "Визначити власника", "Зробити першу версію", "Погодити", "Закрити з висновком"]
  };

  return (sets[label] || sets.Operations).map((text) => ({ text, done: false }));
}

function renderInspector() {
  const inspector = document.getElementById("taskInspector");
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);

  if (!task) {
    inspector.innerHTML = `
      <div class="empty-inspector">
        <p class="panel-title">Інспектор</p>
        <p>Обери картку в задачнику, щоб редагувати опис, дедлайн, чеклист і відповідального.</p>
      </div>
    `;
    return;
  }

  inspector.innerHTML = `
    <form class="inspector-editor" id="inspectorForm">
      <p class="panel-title">Картка задачі</p>
      <label>Назва
        <textarea name="title" rows="2">${escapeHtml(task.title)}</textarea>
      </label>
      <label>Опис
        <textarea name="description" rows="5">${escapeHtml(task.description)}</textarea>
      </label>
      <label>Відповідальний
        <select name="assignee">${team.map((person) => `<option value="${escapeHtml(person.name)}" ${person.name === task.assignee ? "selected" : ""}>${escapeHtml(person.name)}</option>`).join("")}</select>
      </label>
      <label>Статус
        <select name="lane">${lanes.map((lane) => `<option value="${lane.id}" ${lane.id === task.lane ? "selected" : ""}>${escapeHtml(lane.title)}</option>`).join("")}</select>
      </label>
      <label>Пріоритет
        <select name="priority">
          ${["High", "Medium", "Low"].map((priority) => `<option value="${priority}" ${priority === task.priority ? "selected" : ""}>${priority}</option>`).join("")}
        </select>
      </label>
      <label>Мітка
        <input name="label" value="${escapeHtml(task.label)}" />
      </label>
      <label>Дедлайн
        <input name="due" value="${escapeHtml(task.due)}" />
      </label>
      <div>
        <p class="panel-title">Чеклист</p>
        <div class="checklist">
          ${task.checklist.map((item, index) => `
            <label class="check-item">
              <input type="checkbox" data-check-index="${index}" ${item.done ? "checked" : ""} />
              <span>${escapeHtml(item.text)}</span>
            </label>
          `).join("")}
        </div>
      </div>
      <div class="inspector-actions">
        <button class="ghost-button" type="button" id="saveInspector">Зберегти</button>
        <button class="danger-button" type="button" id="deleteTask">Видалити</button>
      </div>
    </form>
  `;

  document.getElementById("saveInspector").addEventListener("click", () => saveInspector(task.id));
  document.getElementById("deleteTask").addEventListener("click", () => deleteTask(task.id));
  inspector.querySelectorAll("[data-check-index]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const current = state.tasks.find((item) => item.id === task.id);
      current.checklist[Number(checkbox.dataset.checkIndex)].done = checkbox.checked;
      saveState();
      renderAll();
    });
  });
}

function saveInspector(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const form = document.getElementById("inspectorForm");
  if (!task || !form) return;

  const data = new FormData(form);
  task.title = String(data.get("title") || "").trim() || "Без назви";
  task.description = String(data.get("description") || "").trim();
  task.assignee = String(data.get("assignee") || task.assignee);
  task.lane = String(data.get("lane") || task.lane);
  task.priority = String(data.get("priority") || task.priority);
  task.label = String(data.get("label") || "Operations").trim();
  task.due = String(data.get("due") || "без дедлайну").trim();
  saveState();
  showStatus("Зміни збережено");
  renderAll();
}

function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const ok = confirm(`Видалити задачу "${task.title}"?`);
  if (!ok) return;
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  state.selectedTaskId = null;
  saveState();
  showStatus("Задачу видалено");
  renderAll();
}

function renderAnalytics() {
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => task.lane === "done").length;
  const highOpen = state.tasks.filter((task) => task.priority === "High" && task.lane !== "done").length;
  const byLane = countBy(state.tasks, "lane");
  const byAssignee = countBy(state.tasks.filter((task) => task.lane !== "done"), "assignee");

  document.getElementById("analyticsGrid").innerHTML = `
    <section class="analytics-card">
      <p class="panel-title">Усього задач</p>
      <p class="metric-number">${total}</p>
      <p class="metric-caption">${done} закрито, ${total - done} у роботі або очікуванні.</p>
    </section>
    <section class="analytics-card">
      <p class="panel-title">Ризик-фокус</p>
      <p class="metric-number">${highOpen}</p>
      <p class="metric-caption">High priority задач, які ще не закриті.</p>
    </section>
    <section class="analytics-card">
      <p class="panel-title">Швидкість потоку</p>
      <p class="metric-number">${Math.round((done / Math.max(total, 1)) * 100)}%</p>
      <p class="metric-caption">Частка задач у Done від поточного пулу.</p>
    </section>
    <section class="analytics-card">
      <p class="panel-title">Статуси</p>
      ${renderBars(lanes.map((lane) => ({ label: lane.title, value: byLane[lane.id] || 0 })))}
    </section>
    <section class="analytics-card">
      <p class="panel-title">Навантаження</p>
      ${renderBars(Object.entries(byAssignee).map(([label, value]) => ({ label, value })))}
    </section>
    <section class="analytics-card">
      <p class="panel-title">Наступне рішення</p>
      <p class="metric-caption">Щотижня переглядай Backlog, High priority і Review. Все, що без власника або дедлайну, має піти в уточнення до старту роботи.</p>
    </section>
  `;
}

function renderBars(items) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return `
    <div class="bar-list">
      ${items.map((item) => `
        <div class="bar-row">
          <span>${escapeHtml(shortText(item.label, 12))}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(item.value / max) * 100}%"></span></span>
          <strong>${item.value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Без значення";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pavutyna-workflow-state.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importState(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (!Array.isArray(imported.tasks)) throw new Error("No tasks");
      state = {
        ...state,
        ...imported,
        filters: { query: "", assignee: "all", priority: "all" }
      };
      saveState();
      showStatus("Імпортовано");
      renderAll();
    } catch {
      alert("Не вдалося імпортувати файл. Потрібен JSON, експортований з цього додатку.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function resetDemoData() {
  const ok = confirm("Повернути демо-дані і очистити локальні зміни?");
  if (!ok) return;
  state = {
    tasks: structuredClone(seedTasks),
    selectedTaskId: null,
    view: "tasks",
    zoom: 1,
    filters: { query: "", assignee: "all", priority: "all" }
  };
  saveState();
  showStatus("Демо-дані оновлено");
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
