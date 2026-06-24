(() => {
  "use strict";

  const STORAGE_KEY = "windowDutyApp3CwState";
  const STAFF_TYPES = {
    cw: "CW",
    nonCw: "CW以外"
  };
  const SLOT_DEFINITIONS = [
    { id: "cw-morning", label: "CW 午前", staffType: "cw" },
    { id: "cw-noon", label: "CW 昼", staffType: "cw" },
    { id: "cw-afternoon", label: "CW 午後", staffType: "cw" },
    { id: "non-cw-morning", label: "CW以外 午前", staffType: "nonCw" },
    { id: "non-cw-noon-1", label: "CW以外 昼1", staffType: "nonCw" },
    { id: "non-cw-noon-2", label: "CW以外 昼2", staffType: "nonCw" },
    { id: "non-cw-afternoon", label: "CW以外 午後", staffType: "nonCw" }
  ];
  const SLOTS = SLOT_DEFINITIONS.map((slot) => slot.id);
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const MAX_ATTEMPTS = 1000;
  const MONDAY = 1;
  const FRIDAY = 5;

  const elements = {};
  const swapSelection = [];

  const state = {
    staff: [],
    vacations: [],
    holidays: [],
    monthlyRules: [],
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    schedule: []
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    loadState();
    bindEvents();
    syncInputs();
    renderAll();
  }

  function bindElements() {
    elements.yearInput = document.getElementById("yearInput");
    elements.monthSelect = document.getElementById("monthSelect");
    elements.generateBtn = document.getElementById("generateBtn");
    elements.regenerateBtn = document.getElementById("regenerateBtn");
    elements.csvBtn = document.getElementById("csvBtn");
    elements.messageArea = document.getElementById("messageArea");
    elements.scheduleTableBody = document.getElementById("scheduleTableBody");
    elements.scheduleLabel = document.getElementById("scheduleLabel");
    elements.swapFirstLabel = document.getElementById("swapFirstLabel");
    elements.swapSecondLabel = document.getElementById("swapSecondLabel");
    elements.swapCellsBtn = document.getElementById("swapCellsBtn");
    elements.clearSwapSelectionBtn = document.getElementById("clearSwapSelectionBtn");
    elements.cellEditStaffSelect = document.getElementById("cellEditStaffSelect");
    elements.replaceCellStaffBtn = document.getElementById("replaceCellStaffBtn");

    elements.ruleMonthLabel = document.getElementById("ruleMonthLabel");
    elements.ruleStaffSelect = document.getElementById("ruleStaffSelect");
    elements.ruleAdjustmentSelect = document.getElementById("ruleAdjustmentSelect");
    elements.ruleNoteInput = document.getElementById("ruleNoteInput");
    elements.addRuleBtn = document.getElementById("addRuleBtn");
    elements.monthlyRuleTableBody = document.getElementById("monthlyRuleTableBody");

    elements.vacationStaffSelect = document.getElementById("vacationStaffSelect");
    elements.vacationDateInput = document.getElementById("vacationDateInput");
    elements.addVacationBtn = document.getElementById("addVacationBtn");
    elements.vacationTableBody = document.getElementById("vacationTableBody");

    elements.holidayDateInput = document.getElementById("holidayDateInput");
    elements.holidayNameInput = document.getElementById("holidayNameInput");
    elements.addHolidayBtn = document.getElementById("addHolidayBtn");
    elements.holidayTableBody = document.getElementById("holidayTableBody");

    elements.staffNameInput = document.getElementById("staffNameInput");
    elements.staffTypeSelect = document.getElementById("staffTypeSelect");
    elements.addStaffBtn = document.getElementById("addStaffBtn");
    elements.sampleBtn = document.getElementById("sampleBtn");
    elements.staffTableBody = document.getElementById("staffTableBody");
    elements.staffCount = document.getElementById("staffCount");
    elements.balanceTableBody = document.getElementById("balanceTableBody");
  }

  function bindEvents() {
    elements.yearInput.addEventListener("change", () => {
      if (handleMonthChange()) renderAll();
    });
    elements.monthSelect.addEventListener("change", () => {
      if (handleMonthChange()) renderAll();
    });
    elements.generateBtn.addEventListener("click", handleGenerate);
    elements.regenerateBtn.addEventListener("click", handleGenerate);
    elements.csvBtn.addEventListener("click", exportCsv);
    elements.scheduleTableBody.addEventListener("click", handleScheduleCellClick);
    elements.swapCellsBtn.addEventListener("click", swapSelectedCells);
    elements.clearSwapSelectionBtn.addEventListener("click", clearSwapSelection);
    elements.replaceCellStaffBtn.addEventListener("click", replaceSelectedCellStaff);
    elements.addRuleBtn.addEventListener("click", addMonthlyRule);
    elements.addVacationBtn.addEventListener("click", addVacation);
    elements.addHolidayBtn.addEventListener("click", addHoliday);
    elements.addStaffBtn.addEventListener("click", addStaff);
    elements.sampleBtn.addEventListener("click", loadSampleStaff);
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw);
      state.staff = Array.isArray(saved.staff) ? saved.staff : [];
      state.vacations = Array.isArray(saved.vacations) ? saved.vacations : [];
      state.holidays = Array.isArray(saved.holidays) ? saved.holidays : [];
      state.monthlyRules = Array.isArray(saved.monthlyRules) ? saved.monthlyRules : [];
      state.selectedYear = Number(saved.selectedYear) || state.selectedYear;
      state.selectedMonth = Number(saved.selectedMonth) || state.selectedMonth;
      state.schedule = Array.isArray(saved.schedule) && isScheduleCompatible(saved.schedule) ? saved.schedule : [];
    } catch {
      showMessage("保存データを読み込めませんでした。新しい状態で開始します。", "error");
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function syncInputs() {
    elements.yearInput.value = state.selectedYear;
    elements.monthSelect.value = String(state.selectedMonth);
    setDefaultDates();
  }

  function setDefaultDates() {
    const date = formatDate(state.selectedYear, state.selectedMonth, 1);
    elements.vacationDateInput.value = date;
    elements.holidayDateInput.value = date;
  }

  function renderAll() {
    renderStaff();
    renderStaffSelects();
    renderVacations();
    renderHolidays();
    renderMonthlyRules();
    renderSchedule();
    renderSwapSelection();
    renderBalance();
  }

  function handleMonthChange() {
    const year = Number(elements.yearInput.value);
    const month = Number(elements.monthSelect.value);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      showMessage("年は2000年から2100年の範囲で入力してください。", "error");
      syncInputs();
      return false;
    }

    const changed = state.selectedYear !== year || state.selectedMonth !== month;
    state.selectedYear = year;
    state.selectedMonth = month;
    if (changed) state.schedule = [];
    setDefaultDates();
    saveState();
    return true;
  }

  function addStaff() {
    const name = elements.staffNameInput.value.trim();
    const type = elements.staffTypeSelect.value;

    if (!name) {
      showMessage("職員の氏名を入力してください。", "error");
      return;
    }

    state.staff.push({
      staff_id: createId("staff"),
      name,
      type,
      active: true
    });
    state.schedule = [];
    elements.staffNameInput.value = "";

    saveState();
    renderAll();
    showMessage("職員を追加しました。当番表は必要に応じて再作成してください。", "success");
  }

  function loadSampleStaff() {
    const cwStaff = Array.from({ length: 11 }, (_, index) => ({
      staff_id: `cw-${index + 1}`,
      name: `CW${index + 1}`,
      type: "cw",
      active: true
    }));

    const nonCwStaff = Array.from({ length: 12 }, (_, index) => ({
      staff_id: `non-cw-${index + 1}`,
      name: `CW以外${index + 1}`,
      type: "nonCw",
      active: true
    }));

    state.staff = [...cwStaff, ...nonCwStaff];
    state.vacations = state.vacations.filter((vacation) => findStaffInList(state.staff, vacation.staff_id));
    state.monthlyRules = state.monthlyRules.filter((rule) => findStaffInList(state.staff, rule.staff_id));
    state.schedule = [];

    saveState();
    renderAll();
    showMessage("サンプル職員23人を読み込みました。氏名は職員一覧から変更できます。", "success");
  }

  function renderStaff() {
    elements.staffCount.textContent = `${state.staff.length}人`;

    if (state.staff.length === 0) {
      elements.staffTableBody.innerHTML = `<tr><td colspan="5" class="empty-cell">職員データがありません。</td></tr>`;
      return;
    }

    elements.staffTableBody.innerHTML = "";
    state.staff.forEach((staff) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(staff.staff_id)}</td>
        <td><input class="inline-input" type="text" value="${escapeHtml(staff.name)}" aria-label="氏名"></td>
        <td>
          <select class="inline-select" aria-label="区分">
            <option value="cw" ${staff.type === "cw" ? "selected" : ""}>CW</option>
            <option value="nonCw" ${staff.type === "nonCw" ? "selected" : ""}>CW以外</option>
          </select>
        </td>
        <td>
          <label class="switch-label">
            <input type="checkbox" ${staff.active ? "checked" : ""}>
            <span>${staff.active ? "ON" : "OFF"}</span>
          </label>
        </td>
        <td><button type="button" class="danger">削除</button></td>
      `;

      const nameInput = row.querySelector(".inline-input");
      const typeSelect = row.querySelector(".inline-select");
      const activeInput = row.querySelector(".switch-label input");
      const deleteButton = row.querySelector(".danger");

      nameInput.addEventListener("change", () => {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.value = staff.name;
          showMessage("氏名は空にできません。", "error");
          return;
        }
        staff.name = name;
        clearScheduleAfterConditionChange("職員名を更新しました。");
      });

      typeSelect.addEventListener("change", () => {
        staff.type = typeSelect.value;
        clearScheduleAfterConditionChange("職員区分を更新しました。");
      });

      activeInput.addEventListener("change", () => {
        staff.active = activeInput.checked;
        clearScheduleAfterConditionChange("active設定を更新しました。");
      });

      deleteButton.addEventListener("click", () => {
        state.staff = state.staff.filter((item) => item.staff_id !== staff.staff_id);
        state.vacations = state.vacations.filter((item) => item.staff_id !== staff.staff_id);
        state.monthlyRules = state.monthlyRules.filter((item) => item.staff_id !== staff.staff_id);
        state.schedule = [];
        saveState();
        renderAll();
        showMessage("職員を削除しました。", "info");
      });

      elements.staffTableBody.appendChild(row);
    });
  }

  function clearScheduleAfterConditionChange(message) {
    state.schedule = [];
    saveState();
    renderAll();
    showMessage(`${message} 当番表は必要に応じて再作成してください。`, "info");
  }

  function renderStaffSelects() {
    renderStaffSelect(elements.vacationStaffSelect, "職員データがありません");
    renderStaffSelect(elements.ruleStaffSelect, "職員データがありません");
    renderStaffSelect(elements.cellEditStaffSelect, "職員データがありません", { activeOnly: true });
  }

  function renderStaffSelect(select, emptyText, options = {}) {
    const current = select.value;
    select.innerHTML = "";
    const staffList = options.activeOnly ? getActiveStaff() : state.staff;

    if (staffList.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = emptyText;
      select.appendChild(option);
      return;
    }

    staffList.forEach((staff) => {
      const option = document.createElement("option");
      option.value = staff.staff_id;
      option.textContent = `${staff.name}（${typeLabel(staff.type)}）`;
      select.appendChild(option);
    });

    if (staffList.some((staff) => staff.staff_id === current)) {
      select.value = current;
    }
  }

  function handleScheduleCellClick(event) {
    const button = event.target.closest(".schedule-cell-button");
    if (!button) return;

    const date = button.dataset.date;
    const slot = button.dataset.slot;
    const staffId = button.dataset.staffId;
    const key = cellKey(date, slot);
    const existingIndex = swapSelection.findIndex((cell) => cell.key === key);

    if (existingIndex >= 0) {
      swapSelection.splice(existingIndex, 1);
    } else {
      if (swapSelection.length >= 2) swapSelection.shift();
      swapSelection.push({ key, date, slot, staffId });
    }

    renderSchedule();
    renderSwapSelection();
  }

  function swapSelectedCells() {
    if (state.schedule.length === 0) {
      showMessage("入れ替えできる当番表がありません。先に自動作成してください。", "error");
      return;
    }

    if (swapSelection.length !== 2) {
      showMessage("当番表内の名前を2つ選択してください。", "error");
      return;
    }

    const [first, second] = swapSelection;
    if (first.key === second.key) {
      showMessage("別々の枠を選択してください。", "error");
      return;
    }

    if (getCellStaffId(state.schedule, first) === getCellStaffId(state.schedule, second)) {
      showMessage("同じ職員同士のため、入れ替えは不要です。", "error");
      return;
    }

    const swappedSchedule = swapTwoCells(state.schedule, first, second);

    const validation = validateSchedule(swappedSchedule);
    if (!validation.valid) {
      showMessage(`入れ替えできません。${validation.message}`, "error");
      return;
    }

    state.schedule = swappedSchedule;
    const firstLabel = formatCellLabel(first);
    const secondLabel = formatCellLabel(second);
    swapSelection.length = 0;
    saveState();
    renderSchedule();
    renderSwapSelection();
    renderBalance();
    showMessage(`${firstLabel} と ${secondLabel} を入れ替えました。`, "success");
  }

  function replaceSelectedCellStaff() {
    if (state.schedule.length === 0) {
      showMessage("書き換えできる当番表がありません。先に自動作成してください。", "error");
      return;
    }

    if (swapSelection.length === 0) {
      showMessage("書き換える当番表内の名前を1つ選択してください。", "error");
      return;
    }

    const targetCell = swapSelection[0];
    const newStaffId = elements.cellEditStaffSelect.value;
    const newStaff = findStaff(newStaffId);

    if (!newStaff || !newStaff.active) {
      showMessage("変更先の職員を選択してください。", "error");
      return;
    }

    const currentStaffId = getCellStaffId(state.schedule, targetCell);
    if (currentStaffId === newStaffId) {
      showMessage("現在と同じ職員が選択されています。", "error");
      return;
    }

    const replacedSchedule = replaceCellStaff(state.schedule, targetCell, newStaffId);
    const validation = validateSchedule(replacedSchedule);
    if (!validation.valid) {
      showMessage(`書き換えできません。${validation.message}`, "error");
      return;
    }

    const oldLabel = formatCellLabel({ ...targetCell, staffId: currentStaffId });
    state.schedule = replacedSchedule;
    swapSelection.length = 0;
    saveState();
    renderSchedule();
    renderSwapSelection();
    renderBalance();
    showMessage(`${oldLabel} を ${newStaff.name}さんに書き換えました。`, "success");
  }

  function replaceCellStaff(schedule, cell, newStaffId) {
    return schedule.map((day) => {
      if (day.date !== cell.date) return day;
      return {
        ...day,
        assignments: {
          ...day.assignments,
          [cell.slot]: newStaffId
        }
      };
    });
  }

  function swapTwoCells(schedule, first, second) {
    const firstStaffId = getCellStaffId(schedule, first);
    const secondStaffId = getCellStaffId(schedule, second);

    return schedule.map((day) => {
      const assignments = { ...day.assignments };
      if (day.date === first.date) assignments[first.slot] = secondStaffId;
      if (day.date === second.date) assignments[second.slot] = firstStaffId;
      return { ...day, assignments };
    });
  }

  function getCellStaffId(schedule, cell) {
    const day = schedule.find((item) => item.date === cell.date);
    return day ? day.assignments[cell.slot] : "";
  }

  function clearSwapSelection() {
    swapSelection.length = 0;
    renderSchedule();
    renderSwapSelection();
  }

  function renderSwapSelection() {
    elements.swapFirstLabel.textContent = swapSelection[0] ? formatCellLabel(swapSelection[0]) : "未選択";
    elements.swapSecondLabel.textContent = swapSelection[1] ? formatCellLabel(swapSelection[1]) : "未選択";
    if (swapSelection[0] && findStaff(swapSelection[0].staffId)) {
      elements.cellEditStaffSelect.value = swapSelection[0].staffId;
    }
  }

  function formatCellLabel(cell) {
    return `${cell.date} ${slotLabel(cell.slot)} ${staffName(cell.staffId)}`;
  }

  function cellKey(date, slot) {
    return `${date}-${slot}`;
  }

  function validateSchedule(schedule) {
    const weekdaySlotHistory = new Map();
    let previousDay = null;

    for (const day of schedule) {
      const assignedToday = new Set();

      for (const slot of SLOTS) {
        const staffId = day.assignments[slot];
        const staff = findStaff(staffId);

        if (!staff || !staff.active) {
          return {
            valid: false,
            message: `${day.date} ${slotLabel(slot)}枠の職員がactiveではありません。`
          };
        }

        if (isOnVacation(staffId, day.date)) {
          return {
            valid: false,
            message: `${day.date}は${staff.name}さんの休暇日です。`
          };
        }

        if (!isStaffEligibleForSlot(staff, slot)) {
          return {
            valid: false,
            message: `${day.date} ${slotLabel(slot)}枠には${slotTypeLabel(slot)}の職員を割り当ててください。`
          };
        }

        if (assignedToday.has(staffId)) {
          return {
            valid: false,
            message: `${day.date}に${staff.name}さんが複数枠へ入っています。`
          };
        }
        assignedToday.add(staffId);

        if (previousDay && previousDay.assignments[slot] === staffId) {
          return {
            valid: false,
            message: `${staff.name}さんが${slotLabel(slot)}枠で連続しています。`
          };
        }

        const historyKey = `${day.weekdayIndex}-${slot}`;
        const used = weekdaySlotHistory.get(historyKey) || new Set();
        if (used.has(staffId)) {
          return {
            valid: false,
            message: `${staff.name}さんが同じ曜日・同じ${slotLabel(slot)}枠に複数回入っています。`
          };
        }

        if (!weekdaySlotHistory.has(historyKey)) {
          weekdaySlotHistory.set(historyKey, new Set());
        }
        weekdaySlotHistory.get(historyKey).add(staffId);
      }

      previousDay = day;
    }

    return { valid: true, message: "" };
  }

  function addMonthlyRule() {
    const staffId = elements.ruleStaffSelect.value;
    const adjustment = Number(elements.ruleAdjustmentSelect.value);
    const note = elements.ruleNoteInput.value.trim();

    if (!findStaff(staffId)) {
      showMessage("月別ルールの対象職員を選択してください。", "error");
      return;
    }

    const yearMonth = currentYearMonth();
    const existing = state.monthlyRules.find((rule) =>
      rule.yearMonth === yearMonth &&
      rule.staff_id === staffId &&
      rule.kind === "targetAdjustment"
    );

    if (existing) {
      existing.adjustment = adjustment;
      existing.note = note;
    } else {
      state.monthlyRules.push({
        rule_id: createId("rule"),
        kind: "targetAdjustment",
        yearMonth,
        staff_id: staffId,
        adjustment,
        note
      });
    }

    state.schedule = [];
    elements.ruleNoteInput.value = "";
    saveState();
    renderMonthlyRules();
    renderBalance();
    renderSchedule();
    showMessage("月別ルールを保存しました。当番表は必要に応じて再作成してください。", "success");
  }

  function renderMonthlyRules() {
    const yearMonth = currentYearMonth();
    elements.ruleMonthLabel.textContent = yearMonth;
    const rules = getMonthlyRules(yearMonth);

    if (rules.length === 0) {
      elements.monthlyRuleTableBody.innerHTML = `<tr><td colspan="5" class="empty-cell">この月の追加ルールはありません。</td></tr>`;
      return;
    }

    elements.monthlyRuleTableBody.innerHTML = "";
    rules.forEach((rule) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(rule.yearMonth)}</td>
        <td>${escapeHtml(staffName(rule.staff_id))}</td>
        <td>${rule.adjustment > 0 ? "+" : ""}${escapeHtml(rule.adjustment)}回</td>
        <td>${escapeHtml(rule.note || "")}</td>
        <td><button type="button" class="danger">削除</button></td>
      `;

      row.querySelector("button").addEventListener("click", () => {
        state.monthlyRules = state.monthlyRules.filter((item) => item.rule_id !== rule.rule_id);
        state.schedule = [];
        saveState();
        renderMonthlyRules();
        renderBalance();
        renderSchedule();
        showMessage("月別ルールを削除しました。当番表は必要に応じて再作成してください。", "info");
      });

      elements.monthlyRuleTableBody.appendChild(row);
    });
  }

  function addVacation() {
    const staffId = elements.vacationStaffSelect.value;
    const date = elements.vacationDateInput.value;

    if (!staffId || !date) {
      showMessage("対象者と休暇日を選択してください。", "error");
      return;
    }

    if (!findStaff(staffId)) {
      showMessage("休暇を登録する職員が見つかりません。", "error");
      return;
    }

    const duplicated = state.vacations.some((vacation) =>
      vacation.staff_id === staffId && vacation.date === date
    );
    if (duplicated) {
      showMessage("同じ職員・同じ日付の休暇はすでに登録されています。", "error");
      return;
    }

    state.vacations.push({
      vacation_id: createId("vacation"),
      staff_id: staffId,
      date
    });
    state.schedule = [];

    saveState();
    renderVacations();
    renderSchedule();
    showMessage("休暇を追加しました。当番表は必要に応じて再作成してください。", "success");
  }

  function renderVacations() {
    if (state.vacations.length === 0) {
      elements.vacationTableBody.innerHTML = `<tr><td colspan="3" class="empty-cell">登録済み休暇はありません。</td></tr>`;
      return;
    }

    const sortedVacations = [...state.vacations].sort((a, b) => a.date.localeCompare(b.date));
    elements.vacationTableBody.innerHTML = "";

    sortedVacations.forEach((vacation) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(staffName(vacation.staff_id) || "不明な職員")}</td>
        <td>${escapeHtml(vacation.date)}</td>
        <td><button type="button" class="danger">削除</button></td>
      `;

      row.querySelector("button").addEventListener("click", () => {
        state.vacations = state.vacations.filter((item) => item.vacation_id !== vacation.vacation_id);
        state.schedule = [];
        saveState();
        renderVacations();
        renderSchedule();
        showMessage("休暇を削除しました。当番表は必要に応じて再作成してください。", "info");
      });

      elements.vacationTableBody.appendChild(row);
    });
  }

  function addHoliday() {
    const date = elements.holidayDateInput.value;
    const name = elements.holidayNameInput.value.trim() || "祝日";

    if (!date) {
      showMessage("祝日の日付を選択してください。", "error");
      return;
    }

    const duplicated = state.holidays.some((holiday) => holiday.date === date);
    if (duplicated) {
      showMessage("同じ日付の祝日はすでに登録されています。", "error");
      return;
    }

    state.holidays.push({
      holiday_id: createId("holiday"),
      date,
      name
    });
    state.schedule = [];
    elements.holidayNameInput.value = "";

    saveState();
    renderHolidays();
    renderSchedule();
    showMessage("祝日を追加しました。当番表は必要に応じて再作成してください。", "success");
  }

  function renderHolidays() {
    if (state.holidays.length === 0) {
      elements.holidayTableBody.innerHTML = `<tr><td colspan="3" class="empty-cell">登録済み祝日はありません。</td></tr>`;
      return;
    }

    const sortedHolidays = [...state.holidays].sort((a, b) => a.date.localeCompare(b.date));
    elements.holidayTableBody.innerHTML = "";

    sortedHolidays.forEach((holiday) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(holiday.date)}</td>
        <td>${escapeHtml(holiday.name)}</td>
        <td><button type="button" class="danger">削除</button></td>
      `;

      row.querySelector("button").addEventListener("click", () => {
        state.holidays = state.holidays.filter((item) => item.holiday_id !== holiday.holiday_id);
        state.schedule = [];
        saveState();
        renderHolidays();
        renderSchedule();
        showMessage("祝日を削除しました。当番表は必要に応じて再作成してください。", "info");
      });

      elements.holidayTableBody.appendChild(row);
    });
  }

  function handleGenerate() {
    if (!handleMonthChange()) return;

    const activeStaff = getActiveStaff();
    const cwCount = countActiveStaffByType("cw");
    const otherCount = countActiveStaffByType("nonCw");
    if (cwCount < 3 || otherCount < 4) {
      showMessage("activeな職員はCWが3人以上、CW以外が4人以上必要です。", "error");
      return;
    }

    const dutyDates = getDutyDates(state.selectedYear, state.selectedMonth);
    if (dutyDates.length === 0) {
      state.schedule = [];
      saveState();
      renderSchedule();
      renderBalance();
      showMessage("対象月に割当対象日がありません。土日と祝日設定を確認してください。", "error");
      return;
    }

    const result = generateSchedule(dutyDates, activeStaff);
    if (!result) {
      state.schedule = [];
      saveState();
      renderSchedule();
      renderBalance();
      showMessage("条件が厳しすぎるため、当番表を作成できませんでした。休暇日、祝日、対象職員、月別ルールを見直してください。", "error");
      return;
    }

    state.schedule = result.schedule;
    swapSelection.length = 0;
    saveState();
    renderSchedule();
    renderBalance();

    const messageType = result.hasMondayFridayPairWarning ? "warning" : "success";
    const suffix = result.hasMondayFridayPairWarning
      ? " 月曜・金曜の偏りを完全には避けられない職員があります。"
      : "";
    showMessage(`${state.selectedYear}年${state.selectedMonth}月の当番表を作成しました。${suffix}`, messageType);
  }

  function generateSchedule(dates, activeStaff) {
    let bestResult = null;
    let bestScore = Infinity;
    const target = createTargetProfile(dates, activeStaff);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const context = createAssignmentContext(activeStaff);
      const schedule = [];
      let failed = false;

      for (const dateInfo of dates) {
        const assignments = {};
        const assignedToday = new Set();

        for (const slot of SLOTS) {
          const baseCandidates = getCandidates({
            activeStaff,
            dateInfo,
            slot,
            schedule,
            assignedToday,
            context
          });
          const candidates = preferAvoidingMondayFridayPair(baseCandidates, dateInfo, context);

          if (candidates.length === 0) {
            failed = true;
            break;
          }

          const selected = pickBestCandidate(candidates, {
            dateInfo,
            slot,
            context,
            target
          });

          assignments[slot] = selected.staff_id;
          assignedToday.add(selected.staff_id);
          recordAssignment(context, selected.staff_id, slot, dateInfo);
        }

        if (failed) break;

        schedule.push({
          date: dateInfo.date,
          weekday: dateInfo.weekday,
          weekdayIndex: dateInfo.weekdayIndex,
          assignments
        });
      }

      if (!failed && schedule.length === dates.length) {
        const score = evaluateSchedule(context, target);
        if (score < bestScore) {
          bestScore = score;
          bestResult = {
            schedule,
            hasMondayFridayPairWarning: hasMondayFridayPairWarning(context)
          };
        }
        if (score === 0) break;
      }
    }

    return bestResult;
  }

  function createAssignmentContext(activeStaff) {
    return {
      counts: new Map(activeStaff.map((staff) => [staff.staff_id, 0])),
      slotCounts: new Map(activeStaff.map((staff) => [staff.staff_id, createSlotCount()])),
      weekdaySlotHistory: new Map(),
      assignmentHistory: new Map(activeStaff.map((staff) => [staff.staff_id, []]))
    };
  }

  function createTargetProfile(dates, activeStaff) {
    const staffCountsByType = countStaffByType(activeStaff);
    const slotTargets = new Map();
    SLOT_DEFINITIONS.forEach((slot) => {
      slotTargets.set(slot.id, dates.length / (staffCountsByType.get(slot.staffType) || 1));
    });

    const adjustments = getTargetAdjustments();
    const totalTargets = new Map();

    activeStaff.forEach((staff) => {
      const eligibleSlotCount = SLOT_DEFINITIONS.filter((slot) => slot.staffType === staff.type).length;
      const sameTypeStaffCount = staffCountsByType.get(staff.type) || 1;
      const baseTotal = (dates.length * eligibleSlotCount) / sameTypeStaffCount;
      totalTargets.set(staff.staff_id, Math.max(0, baseTotal + (adjustments.get(staff.staff_id) || 0)));
    });

    return {
      slotTargets,
      totalTargets,
      adjustments
    };
  }

  function getCandidates(ruleArgs) {
    const rules = getAssignmentRules();
    return ruleArgs.activeStaff.filter((staff) =>
      rules.every((rule) => !rule({ ...ruleArgs, staff }))
    );
  }

  function getAssignmentRules() {
    return [
      ({ staff }) => !staff.active,
      ({ staff, slot }) => !isStaffEligibleForSlot(staff, slot),
      ({ staff, dateInfo }) => isOnVacation(staff.staff_id, dateInfo.date),
      ({ staff, assignedToday }) => assignedToday.has(staff.staff_id),
      ({ staff, slot, schedule }) => {
        const previousDutyDay = schedule[schedule.length - 1];
        return previousDutyDay ? previousDutyDay.assignments[slot] === staff.staff_id : false;
      },
      ({ staff, dateInfo, slot, context }) => {
        const usedInSameWeekdaySlot = getWeekdaySlotHistory(context, dateInfo, slot);
        return usedInSameWeekdaySlot.has(staff.staff_id);
      }
    ];
  }

  function preferAvoidingMondayFridayPair(candidates, dateInfo, context) {
    const safer = candidates.filter((staff) => !wouldMakeFirstTwoDutiesOnlyMondayFriday(staff.staff_id, dateInfo, context));
    return safer.length > 0 ? safer : candidates;
  }

  function wouldMakeFirstTwoDutiesOnlyMondayFriday(staffId, dateInfo, context) {
    const history = context.assignmentHistory.get(staffId) || [];
    if (history.length !== 1) return false;
    return isMondayOrFriday(history[0].weekdayIndex) && isMondayOrFriday(dateInfo.weekdayIndex);
  }

  function pickBestCandidate(candidates, args) {
    let bestScore = Infinity;
    let best = [];

    candidates.forEach((staff) => {
      const score = scoreCandidate(staff, args);
      if (score < bestScore) {
        bestScore = score;
        best = [staff];
      } else if (score === bestScore) {
        best.push(staff);
      }
    });

    return best[Math.floor(Math.random() * best.length)];
  }

  function scoreCandidate(staff, { dateInfo, slot, context, target }) {
    const total = context.counts.get(staff.staff_id) || 0;
    const slotCount = context.slotCounts.get(staff.staff_id)[slot] || 0;
    const targetTotal = target.totalTargets.get(staff.staff_id) || 0;
    const slotTarget = target.slotTargets.get(slot) || 0;
    const projectedTotal = total + 1;
    const projectedSlot = slotCount + 1;

    const totalNeed = targetTotal - total;
    const slotNeed = slotTarget - slotCount;
    const totalPriority = -totalNeed * 30;
    const slotPriority = -slotNeed * 20;
    const totalDistanceAfterAssign = Math.abs(projectedTotal - targetTotal) * 4;
    const slotDistanceAfterAssign = Math.abs(projectedSlot - slotTarget) * 8;
    const slotOverage = Math.max(0, projectedSlot - Math.ceil(slotTarget)) * 35;
    const totalOverage = Math.max(0, projectedTotal - Math.ceil(targetTotal)) * 15;
    const mondayFridayPenalty = isMondayOrFriday(dateInfo.weekdayIndex)
      ? countMondayFridayAssignments(staff.staff_id, context) * 18
      : 0;

    return totalPriority +
      slotPriority +
      totalDistanceAfterAssign +
      slotDistanceAfterAssign +
      slotOverage +
      totalOverage +
      mondayFridayPenalty +
      Math.random();
  }

  function recordAssignment(context, staffId, slot, dateInfo) {
    context.counts.set(staffId, (context.counts.get(staffId) || 0) + 1);
    context.slotCounts.get(staffId)[slot] += 1;
    context.assignmentHistory.get(staffId).push({
      date: dateInfo.date,
      weekdayIndex: dateInfo.weekdayIndex,
      slot
    });
    addWeekdaySlotHistory(context, dateInfo, slot, staffId);
  }

  function evaluateSchedule(context, target) {
    let score = 0;

    context.counts.forEach((count, staffId) => {
      const targetTotal = target.totalTargets.get(staffId) || 0;
      score += Math.abs(count - targetTotal) * 10;
      if (hasFirstTwoDutiesOnlyMondayFriday(staffId, context)) score += 100;

      const slotCounts = context.slotCounts.get(staffId);
      SLOTS.forEach((slot) => {
        const staff = findStaff(staffId);
        if (!staff || !isStaffEligibleForSlot(staff, slot)) return;
        score += Math.abs(slotCounts[slot] - (target.slotTargets.get(slot) || 0)) * 8;
      });
    });

    return Math.round(score * 100) / 100;
  }

  function hasMondayFridayPairWarning(context) {
    return [...context.assignmentHistory.keys()].some((staffId) =>
      hasFirstTwoDutiesOnlyMondayFriday(staffId, context)
    );
  }

  function hasFirstTwoDutiesOnlyMondayFriday(staffId, context) {
    const history = context.assignmentHistory.get(staffId) || [];
    return history.length >= 2 &&
      isMondayOrFriday(history[0].weekdayIndex) &&
      isMondayOrFriday(history[1].weekdayIndex);
  }

  function countMondayFridayAssignments(staffId, context) {
    return (context.assignmentHistory.get(staffId) || [])
      .filter((item) => isMondayOrFriday(item.weekdayIndex)).length;
  }

  function getWeekdaySlotHistory(context, dateInfo, slot) {
    const historyKey = `${dateInfo.weekdayIndex}-${slot}`;
    return context.weekdaySlotHistory.get(historyKey) || new Set();
  }

  function addWeekdaySlotHistory(context, dateInfo, slot, staffId) {
    const historyKey = `${dateInfo.weekdayIndex}-${slot}`;
    if (!context.weekdaySlotHistory.has(historyKey)) {
      context.weekdaySlotHistory.set(historyKey, new Set());
    }
    context.weekdaySlotHistory.get(historyKey).add(staffId);
  }

  function createSlotCount() {
    return SLOTS.reduce((counts, slot) => {
      counts[slot] = 0;
      return counts;
    }, {});
  }

  function renderSchedule() {
    if (state.schedule.length === 0) {
      elements.scheduleLabel.textContent = "未作成";
      elements.scheduleTableBody.innerHTML = `<tr><td colspan="${SLOTS.length + 2}" class="empty-cell">対象月を選択して当番表を作成してください。</td></tr>`;
      swapSelection.length = 0;
      renderSwapSelection();
      return;
    }

    elements.scheduleLabel.textContent = `${state.selectedYear}年${state.selectedMonth}月`;
    elements.scheduleTableBody.innerHTML = "";

    state.schedule.forEach((day) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(day.date)}</td>
        <td>${escapeHtml(day.weekday)}</td>
        ${SLOTS.map((slot) => renderScheduleCell(day, slot)).join("")}
      `;
      elements.scheduleTableBody.appendChild(row);
    });
    renderSwapSelection();
  }

  function renderScheduleCell(day, slot) {
    const staffId = day.assignments[slot];
    const selectedClass = isCellSelected(day.date, slot) ? " selected" : "";
    const label = `${day.date} ${slotLabel(slot)} ${staffName(staffId)}`;
    return `
      <td>
        <button
          type="button"
          class="schedule-cell-button${selectedClass}"
          data-date="${escapeHtml(day.date)}"
          data-slot="${escapeHtml(slot)}"
          data-staff-id="${escapeHtml(staffId)}"
          aria-label="${escapeHtml(label)}"
        >${escapeHtml(staffName(staffId))}</button>
      </td>
    `;
  }

  function isCellSelected(date, slot) {
    const key = cellKey(date, slot);
    return swapSelection.some((cell) => cell.key === key);
  }

  function renderBalance() {
    if (state.schedule.length === 0) {
      elements.balanceTableBody.innerHTML = `<tr><td colspan="${SLOTS.length + 4}" class="empty-cell">当番表を作成すると表示されます。</td></tr>`;
      return;
    }

    const stats = createScheduleStats();
    const adjustments = getTargetAdjustments();
    elements.balanceTableBody.innerHTML = "";

    getActiveStaff().forEach((staff) => {
      const item = stats.get(staff.staff_id) || createEmptyStats();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(staff.name)}</td>
        <td>${item.total}</td>
        ${SLOTS.map((slot) => `<td class="${balanceCellClass(staff, slot, item.slots[slot])}">${item.slots[slot]}</td>`).join("")}
        <td>${item.mondayFriday}</td>
        <td>${formatSigned(adjustments.get(staff.staff_id) || 0)}</td>
      `;
      elements.balanceTableBody.appendChild(row);
    });
  }

  function balanceCellClass(staff, slot, count) {
    if (!isStaffEligibleForSlot(staff, slot)) return "balance-good";
    const slotTypeCount = countActiveStaffByType(slotStaffType(slot));
    const target = slotTypeCount > 0 ? state.schedule.length / slotTypeCount : 0;
    return count <= Math.ceil(target) ? "balance-good" : "balance-warn";
  }

  function createScheduleStats() {
    const stats = new Map(state.staff.map((staff) => [staff.staff_id, createEmptyStats()]));

    state.schedule.forEach((day) => {
      SLOTS.forEach((slot) => {
        const staffId = day.assignments[slot];
        if (!stats.has(staffId)) stats.set(staffId, createEmptyStats());
        const item = stats.get(staffId);
        item.total += 1;
        item.slots[slot] += 1;
        if (isMondayOrFriday(day.weekdayIndex)) item.mondayFriday += 1;
      });
    });

    return stats;
  }

  function getAssignedStaffIds() {
    const staffIds = new Set();
    state.schedule.forEach((day) => {
      SLOTS.forEach((slot) => {
        if (day.assignments[slot]) staffIds.add(day.assignments[slot]);
      });
    });
    return [...staffIds].sort((a, b) => staffName(a).localeCompare(staffName(b), "ja"));
  }

  function createEmptyStats() {
    return {
      total: 0,
      slots: createSlotCount(),
      mondayFriday: 0
    };
  }

  function exportCsv() {
    if (state.schedule.length === 0) {
      showMessage("CSV出力する当番表がありません。", "error");
      return;
    }

    const rows = [["date", "weekday", ...SLOT_DEFINITIONS.map((slot) => slot.label)]];
    state.schedule.forEach((day) => {
      rows.push([
        day.date,
        day.weekday,
        ...SLOTS.map((slot) => staffName(day.assignments[slot]))
      ]);
    });

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `window-duty-${state.selectedYear}-${String(state.selectedMonth).padStart(2, "0")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage("CSVを出力しました。", "success");
  }

  function getDutyDates(year, month) {
    return getMonthDates(year, month).filter((dateInfo) =>
      dateInfo.weekdayIndex !== 0 &&
      dateInfo.weekdayIndex !== 6 &&
      !isHoliday(dateInfo.date)
    );
  }

  function getMonthDates(year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    return Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1;
      const dateObject = new Date(year, month - 1, day);
      const weekdayIndex = dateObject.getDay();
      return {
        date: formatDate(year, month, day),
        weekday: WEEKDAYS[weekdayIndex],
        weekdayIndex
      };
    });
  }

  function getActiveStaff() {
    return state.staff.filter((staff) => staff.active);
  }

  function countActiveStaffByType(type) {
    return getActiveStaff().filter((staff) => staff.type === type).length;
  }

  function countStaffByType(staffList) {
    return staffList.reduce((counts, staff) => {
      counts.set(staff.type, (counts.get(staff.type) || 0) + 1);
      return counts;
    }, new Map());
  }

  function getMonthlyRules(yearMonth) {
    return state.monthlyRules.filter((rule) => rule.yearMonth === yearMonth);
  }

  function getTargetAdjustments() {
    const adjustments = new Map();
    getMonthlyRules(currentYearMonth()).forEach((rule) => {
      if (rule.kind !== "targetAdjustment") return;
      adjustments.set(rule.staff_id, (adjustments.get(rule.staff_id) || 0) + Number(rule.adjustment || 0));
    });
    return adjustments;
  }

  function currentYearMonth() {
    return `${state.selectedYear}-${String(state.selectedMonth).padStart(2, "0")}`;
  }

  function formatDate(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function findStaff(staffId) {
    return state.staff.find((staff) => staff.staff_id === staffId);
  }

  function findStaffInList(list, staffId) {
    return list.some((staff) => staff.staff_id === staffId);
  }

  function staffName(staffId) {
    const staff = findStaff(staffId);
    return staff ? staff.name : "";
  }

  function typeLabel(type) {
    return STAFF_TYPES[type] || type;
  }

  function slotLabel(slotId) {
    const slot = SLOT_DEFINITIONS.find((item) => item.id === slotId);
    return slot ? slot.label : slotId;
  }

  function slotTypeLabel(slotId) {
    const slot = SLOT_DEFINITIONS.find((item) => item.id === slotId);
    return slot ? typeLabel(slot.staffType) : "";
  }

  function slotStaffType(slotId) {
    const slot = SLOT_DEFINITIONS.find((item) => item.id === slotId);
    return slot ? slot.staffType : "";
  }

  function isStaffEligibleForSlot(staff, slotId) {
    return Boolean(staff && staff.type === slotStaffType(slotId));
  }

  function isScheduleCompatible(schedule) {
    return schedule.every((day) =>
      day &&
      day.assignments &&
      SLOTS.every((slot) => typeof day.assignments[slot] === "string")
    );
  }

  function isOnVacation(staffId, date) {
    return state.vacations.some((vacation) =>
      vacation.staff_id === staffId && vacation.date === date
    );
  }

  function isHoliday(date) {
    return state.holidays.some((holiday) => holiday.date === date);
  }

  function isMondayOrFriday(weekdayIndex) {
    return weekdayIndex === MONDAY || weekdayIndex === FRIDAY;
  }

  function formatSigned(value) {
    return value > 0 ? `+${value}` : String(value);
  }

  function showMessage(text, type = "info") {
    elements.messageArea.innerHTML = "";
    if (!text) return;

    const message = document.createElement("div");
    message.className = `message ${type}`;
    message.textContent = text;
    elements.messageArea.appendChild(message);
  }

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeCsv(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }
})();
