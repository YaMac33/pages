const cases = Array.isArray(window.CASE_HISTORY_DATA) ? window.CASE_HISTORY_DATA : [];

const state = {
  visibleDate: new Date(2026, 3, 1),
  selectedCaseId: cases[0]?.id || null,
  keyword: "",
  owner: "all",
  status: "all"
};

const $ = (id) => document.getElementById(id);

const statusLabels = {
  open: "対応中",
  waiting: "先方待ち",
  done: "完了"
};

const chipColors = {
  open: ["#0017c1", "#e8f1fe"],
  waiting: ["#806300", "#fbf5e0"],
  done: ["#197a4b", "#e6f5ec"]
};

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFilteredCases() {
  const keyword = state.keyword.trim().toLowerCase();

  return cases.filter((item) => {
    if (state.owner !== "all" && item.owner !== state.owner) return false;
    if (state.status !== "all" && item.status !== state.status) return false;
    if (!keyword) return true;

    const searchText = [
      item.name,
      item.customer,
      item.owner,
      statusLabels[item.status],
      ...item.histories.flatMap((history) => [history.type, history.text, history.owner])
    ].join(" ").toLowerCase();

    return searchText.includes(keyword);
  });
}

function getEventsByDate(filteredCases) {
  const map = new Map();
  for (const item of filteredCases) {
    for (const history of item.histories) {
      const event = { ...history, case: item };
      if (!map.has(history.date)) map.set(history.date, []);
      map.get(history.date).push(event);
    }
  }

  for (const events of map.values()) {
    events.sort((a, b) => a.case.name.localeCompare(b.case.name, "ja"));
  }

  return map;
}

function renderOwnerOptions() {
  const owners = [...new Set(cases.map((item) => item.owner))].sort((a, b) => a.localeCompare(b, "ja"));
  $("ownerFilter").innerHTML = [
    '<option value="all">すべて</option>',
    ...owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`)
  ].join("");
}

function renderCalendar() {
  const filteredCases = getFilteredCases();
  const eventsByDate = getEventsByDate(filteredCases);
  const year = state.visibleDate.getFullYear();
  const month = state.visibleDate.getMonth();
  const firstDate = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDate.getDay());
  const todayKey = toDateKey(new Date());

  $("currentMonthLabel").textContent = `${year}年${month + 1}月`;

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const dateKey = toDateKey(cellDate);
    const events = eventsByDate.get(dateKey) || [];
    const isMuted = cellDate.getMonth() !== month;
    const isToday = dateKey === todayKey;

    cells.push(`
      <div class="day-cell${isMuted ? " is-muted" : ""}${isToday ? " is-today" : ""}">
        <span class="day-number">${cellDate.getDate()}</span>
        <div class="event-list">
          ${events.map((event) => `
            <button class="event-button" type="button" data-case-id="${escapeHtml(event.case.id)}" data-color="${escapeHtml(event.case.color)}">
              <span class="event-title">${escapeHtml(event.case.name)}</span>
              <span class="event-meta">${escapeHtml(event.type)}・${escapeHtml(event.case.customer)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `);
  }

  $("calendarGrid").innerHTML = cells.join("");
  $("calendarGrid").querySelectorAll(".event-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCaseId = button.dataset.caseId;
      renderDetail();
    });
  });

  renderSummary(filteredCases);
}

function renderSummary(filteredCases) {
  const year = state.visibleDate.getFullYear();
  const month = state.visibleDate.getMonth();
  const monthEvents = filteredCases.flatMap((item) => item.histories)
    .filter((history) => {
      const date = new Date(`${history.date}T00:00:00`);
      return date.getFullYear() === year && date.getMonth() === month;
    });

  $("monthCount").textContent = monthEvents.length;
  $("caseCount").textContent = filteredCases.length;
  $("openCount").textContent = filteredCases.filter((item) => item.status !== "done").length;
}

function renderDetail() {
  const filteredCases = getFilteredCases();
  let selected = filteredCases.find((item) => item.id === state.selectedCaseId);
  if (!selected) {
    selected = filteredCases[0] || null;
    state.selectedCaseId = selected?.id || null;
  }

  if (!selected) {
    $("detailSubTitle").textContent = "条件に一致する案件がありません";
    $("selectedCase").innerHTML = '<p class="empty-message">検索条件を変更してください。</p>';
    $("historyBody").innerHTML = '<tr><td colspan="4" class="empty-message">表示できる対応履歴がありません。</td></tr>';
    return;
  }

  const [chipColor, chipBg] = chipColors[selected.status] || chipColors.open;
  $("detailSubTitle").textContent = "案件で抽出し、日付昇順で表示中";
  $("selectedCase").innerHTML = `
    <div class="case-name">${escapeHtml(selected.name)}</div>
    <div class="case-meta">
      <span class="chip" style="--chip-color: ${chipColor}; --chip-bg: ${chipBg};">${escapeHtml(statusLabels[selected.status])}</span>
      <span class="chip" style="--chip-color: #333333; --chip-bg: #ffffff;">${escapeHtml(selected.customer)}</span>
      <span class="chip" style="--chip-color: #333333; --chip-bg: #ffffff;">担当 ${escapeHtml(selected.owner)}</span>
    </div>
  `;

  const rows = [...selected.histories]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((history) => `
      <tr>
        <td>${escapeHtml(formatDate(history.date))}</td>
        <td>${escapeHtml(history.type)}</td>
        <td>${escapeHtml(history.text)}</td>
        <td>${escapeHtml(history.owner)}</td>
      </tr>
    `);

  $("historyBody").innerHTML = rows.join("");
}

function renderAll() {
  renderCalendar();
  renderDetail();
}

function changeMonth(amount) {
  state.visibleDate = new Date(state.visibleDate.getFullYear(), state.visibleDate.getMonth() + amount, 1);
  renderAll();
}

function bindEvents() {
  $("prevMonthBtn").addEventListener("click", () => changeMonth(-1));
  $("nextMonthBtn").addEventListener("click", () => changeMonth(1));
  $("todayBtn").addEventListener("click", () => {
    const now = new Date();
    state.visibleDate = new Date(now.getFullYear(), now.getMonth(), 1);
    renderAll();
  });
  $("keywordInput").addEventListener("input", (event) => {
    state.keyword = event.target.value;
    renderAll();
  });
  $("ownerFilter").addEventListener("change", (event) => {
    state.owner = event.target.value;
    renderAll();
  });
  $("statusFilter").addEventListener("change", (event) => {
    state.status = event.target.value;
    renderAll();
  });
}

renderOwnerOptions();
bindEvents();
renderAll();
