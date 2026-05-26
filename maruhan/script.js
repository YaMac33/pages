const GAS_URL = "https://script.google.com/macros/s/AKfycbz7VZHMxSyB-3Pjg876Yli-ht3KJzYxi0Jmu7bD3PWtT1FZHgWKHOlANLVvU4TsF8bx/exec";
const MASTER_DATA_URL = "./data/masters.json";

const DEFAULT_MENU_ITEMS = [
  { category: "お弁当", name: "カルビ弁当", basePrice: 990, sizeEnabled: true, visible: true, order: 101 },
  { category: "お弁当", name: "焼肉弁当（カルビと玉ネギ）", basePrice: 990, sizeEnabled: true, visible: true, order: 102 },
  { category: "まんぷく弁当", name: "まんぷく（カルビ）弁当", basePrice: 1300, sizeEnabled: false, visible: true, order: 201 },
  { category: "丼ぶり", name: "カルビ丼", basePrice: 950, sizeEnabled: false, visible: true, order: 302 },
  { category: "おかず", name: "カルビ焼", basePrice: 800, sizeEnabled: false, visible: true, order: 602 }
];

const DEFAULT_SIZE_OPTIONS = [
  { name: "普通", adjustment: 0, visible: true, order: 1 },
  { name: "ライス大盛り", adjustment: 150, visible: true, order: 2 },
  { name: "肉だけ大盛り", adjustment: 300, visible: true, order: 3 },
  { name: "ダブル大盛り(肉大盛り+ライス大盛り)", adjustment: 400, visible: true, order: 4 }
];

let MENU_ITEMS = DEFAULT_MENU_ITEMS.map((item) => ({ ...item }));
let SIZE_OPTIONS = DEFAULT_SIZE_OPTIONS.map((item) => ({ ...item }));

const form = document.getElementById("orderForm");
const menuRows = document.getElementById("menuRows");
const selectedMenuCountText = document.getElementById("selectedMenuCountText");
const totalQuantityText = document.getElementById("totalQuantityText");
const grandTotalText = document.getElementById("grandTotalText");
const selectedItemsList = document.getElementById("selectedItemsList");
const errorBox = document.getElementById("errorBox");
const statusMessage = document.getElementById("statusMessage");
const confirmationPanel = document.getElementById("confirmationPanel");
const showConfirmButton = document.getElementById("showConfirmButton");
const sendButton = document.getElementById("sendButton");
const editButton = document.getElementById("editButton");
const toggleOrderStatusButton = document.getElementById("toggleOrderStatusButton");
const orderStatusContent = document.getElementById("orderStatusContent");
const refreshOrdersButton = document.getElementById("refreshOrdersButton");
const departmentFilter = document.getElementById("departmentFilter");
const menuFilter = document.getElementById("menuFilter");
const ordersStatusMessage = document.getElementById("ordersStatusMessage");
const ordersUpdatedAt = document.getElementById("ordersUpdatedAt");
const currentOrderQuantityText = document.getElementById("currentOrderQuantityText");
const currentOrderAmountText = document.getElementById("currentOrderAmountText");
const currentOrderLineCountText = document.getElementById("currentOrderLineCountText");
const ordersEmptyMessage = document.getElementById("ordersEmptyMessage");
const currentOrdersBody = document.getElementById("currentOrdersBody");
const floatingTotalQuantityText = document.getElementById("floatingTotalQuantityText");
const floatingGrandTotalText = document.getElementById("floatingGrandTotalText");
const floatingSelectedText = document.getElementById("floatingSelectedText");
const floatingConfirmButton = document.getElementById("floatingConfirmButton");

let pendingData = null;
let isSending = false;
let currentOrders = [];
const expandedCategories = new Set();
const expandedMenus = new Set();
const quantities = {};

function withScrollPreserved(callback) {
  const x = window.scrollX;
  const y = window.scrollY;
  callback();
  window.requestAnimationFrame(() => window.scrollTo(x, y));
}

function formatYen(amount) {
  return new Intl.NumberFormat("ja-JP").format(amount) + "円";
}

function findMenuItem(menuName) {
  return MENU_ITEMS.find((item) => item.name === menuName);
}

function findSizeOption(sizeName) {
  return SIZE_OPTIONS.find((option) => option.name === sizeName);
}

function getItemKey(menuName, sizeName) {
  return menuName + "__" + (sizeName || "");
}

function getQuantityValue(menuName, sizeName) {
  const key = getItemKey(menuName, sizeName);
  return Object.prototype.hasOwnProperty.call(quantities, key) ? quantities[key] : "0";
}

function getQuantity(menuName, sizeName) {
  const quantity = Number(getQuantityValue(menuName, sizeName));
  return Number.isFinite(quantity) && Number.isInteger(quantity) && quantity >= 0 ? quantity : 0;
}

function setQuantityValue(menuName, sizeName, value) {
  quantities[getItemKey(menuName, sizeName)] = String(value);
}

function setQuantity(menuName, sizeName, quantity) {
  setQuantityValue(menuName, sizeName, Math.max(0, quantity));
}

function clearQuantities() {
  Object.keys(quantities).forEach((key) => {
    delete quantities[key];
  });
}

function getMenuVariants(menuItem) {
  if (menuItem.sizeEnabled) {
    return SIZE_OPTIONS.map((option) => ({
      size: option.name,
      sizeLabel: option.name,
      adjustment: option.adjustment
    }));
  }

  return [
    {
      size: "",
      sizeLabel: "サイズ対象外",
      adjustment: 0
    }
  ];
}

function toBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (value === true || value === false) {
    return value;
  }

  const text = String(value).trim().toUpperCase();
  return text === "TRUE" || text === "1" || text === "YES" || text === "有効" || text === "表示";
}

function toNumber(value, defaultValue) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function formatQuantity(quantity) {
  return new Intl.NumberFormat("ja-JP").format(toNumber(quantity, 0)) + "個";
}

function setOrdersStatus(message, type) {
  ordersStatusMessage.textContent = message;
  ordersStatusMessage.className = "message message-" + type;
  ordersStatusMessage.hidden = false;
}

function setOrderStatusExpanded(expanded) {
  orderStatusContent.hidden = !expanded;
  toggleOrderStatusButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggleOrderStatusButton.textContent = expanded ? "注文状況を閉じる" : "注文状況を表示";
}

function normalizePublishedOrder(row) {
  const unitPrice = toNumber(row.unitPrice, 0);
  const quantity = toNumber(row.quantity, 0);

  return {
    timestamp: String(row.timestamp || "").trim(),
    department: String(row.department || "").trim() || "未設定",
    menu: String(row.menu || "").trim() || "未設定",
    size: String(row.size || "").trim(),
    basePrice: toNumber(row.basePrice, 0),
    sizeAdjustment: toNumber(row.sizeAdjustment, 0),
    unitPrice,
    quantity,
    subtotal: unitPrice * quantity
  };
}

function updateDepartmentFilterOptions() {
  const previousValue = departmentFilter.value || "all";
  const departments = Array.from(new Set(currentOrders.map((order) => order.department)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ja"));

  departmentFilter.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "すべて";
  departmentFilter.appendChild(allOption);

  departments.forEach((department) => {
    const option = document.createElement("option");
    option.value = department;
    option.textContent = department;
    departmentFilter.appendChild(option);
  });

  departmentFilter.value = departments.includes(previousValue) ? previousValue : "all";
}

function updateMenuFilterOptions() {
  const previousValue = menuFilter.value || "all";
  const menus = Array.from(new Set(currentOrders.map((order) => order.menu)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ja"));

  menuFilter.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "すべて";
  menuFilter.appendChild(allOption);

  menus.forEach((menu) => {
    const option = document.createElement("option");
    option.value = menu;
    option.textContent = menu;
    menuFilter.appendChild(option);
  });

  menuFilter.value = menus.includes(previousValue) ? previousValue : "all";
}

function getFilteredCurrentOrders() {
  const selectedDepartment = departmentFilter.value || "all";
  const selectedMenu = menuFilter.value || "all";

  return currentOrders.filter((order) => {
    const matchesDepartment = selectedDepartment === "all" || order.department === selectedDepartment;
    const matchesMenu = selectedMenu === "all" || order.menu === selectedMenu;
    return matchesDepartment && matchesMenu;
  });
}

function calculatePublishedOrderTotals(orders) {
  return orders.reduce((totals, order) => {
    totals.quantity += toNumber(order.quantity, 0);
    totals.amount += toNumber(order.subtotal, 0);
    return totals;
  }, {
    quantity: 0,
    amount: 0,
    lines: orders.length
  });
}

function createTableCell(text, isNumber) {
  const cell = document.createElement("td");
  cell.textContent = text;

  if (isNumber) {
    cell.className = "number-cell";
  }

  return cell;
}

function renderTableRows(tbody, rows, getCells) {
  tbody.replaceChildren();

  rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    getCells(row).forEach((cell) => {
      tableRow.appendChild(createTableCell(cell.text, cell.isNumber));
    });
    tbody.appendChild(tableRow);
  });
}

function getSizeDisplay(size) {
  return size || "なし";
}

function renderCurrentOrders() {
  const filteredOrders = getFilteredCurrentOrders();
  const totals = calculatePublishedOrderTotals(filteredOrders);
  currentOrderQuantityText.textContent = formatQuantity(totals.quantity);
  currentOrderAmountText.textContent = formatYen(totals.amount);
  currentOrderLineCountText.textContent = totals.lines + "行";
  ordersEmptyMessage.hidden = filteredOrders.length > 0;

  renderTableRows(currentOrdersBody, filteredOrders, (row) => [
    { text: row.timestamp },
    { text: row.department },
    { text: row.menu },
    { text: getSizeDisplay(row.size) },
    { text: formatYen(row.unitPrice), isNumber: true },
    { text: formatQuantity(row.quantity), isNumber: true },
    { text: formatYen(row.subtotal), isNumber: true }
  ]);
}

async function loadCurrentOrders() {
  setOrdersStatus("注文状況を読み込み中です。", "info");
  refreshOrdersButton.disabled = true;

  try {
    const response = await fetch(GAS_URL, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("HTTP status: " + response.status);
    }

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.message || "GAS側で注文状況の取得に失敗しました。");
    }

    const data = result.data || {};
    const orders = Array.isArray(data.orders) ? data.orders : [];

    currentOrders = orders.map(normalizePublishedOrder);
    updateDepartmentFilterOptions();
    updateMenuFilterOptions();
    renderCurrentOrders();
    ordersUpdatedAt.textContent = data.updatedAt ? "更新日時：" + data.updatedAt : "";
    setOrdersStatus("注文状況を更新しました。", "success");
  } catch (error) {
    currentOrders = [];
    updateDepartmentFilterOptions();
    updateMenuFilterOptions();
    renderCurrentOrders();
    ordersUpdatedAt.textContent = "";

    const errorMessage = error && error.message
      ? "注文状況を取得できませんでした：" + error.message
      : "注文状況を取得できませんでした。時間をおいて再度お試しください。";

    setOrdersStatus(errorMessage, "error");
    console.error(error);
  } finally {
    refreshOrdersButton.disabled = false;
  }
}

function normalizeMenuItem(row) {
  if (Array.isArray(row)) {
    return {
      category: String(row[0] || "").trim() || "その他",
      name: String(row[1] || "").trim(),
      basePrice: toNumber(row[2], 0),
      sizeEnabled: toBoolean(row[3], false),
      visible: toBoolean(row[4], false),
      order: toNumber(row[5], 0)
    };
  }

  return {
    category: String(row.category || row["分類"] || "").trim() || "その他",
    name: String(row.name || row.menu || row["メニュー"] || "").trim(),
    basePrice: toNumber(row.basePrice ?? row["基本単価"], 0),
    sizeEnabled: toBoolean(row.sizeEnabled ?? row["サイズ変更対象"], false),
    visible: toBoolean(row.visible ?? row["表示"], true),
    order: toNumber(row.order ?? row["並び順"], 0)
  };
}

function normalizeSizeOption(row) {
  if (Array.isArray(row)) {
    return {
      name: String(row[0] || "").trim(),
      adjustment: toNumber(row[1], 0),
      visible: toBoolean(row[2], false),
      order: toNumber(row[3], 0)
    };
  }

  return {
    name: String(row.name || row.size || row["サイズ"] || "").trim(),
    adjustment: toNumber(row.adjustment ?? row["加算額"], 0),
    visible: toBoolean(row.visible ?? row["表示"], true),
    order: toNumber(row.order ?? row["並び順"], 0)
  };
}

function showMenuLoading() {
  menuRows.replaceChildren();

  const loading = document.createElement("p");
  loading.className = "detail-empty";
  loading.textContent = "メニュー情報を読み込み中です。";
  menuRows.appendChild(loading);
}

function getMasterDataUrls() {
  const urls = [MASTER_DATA_URL];
  const path = window.location.pathname;

  if (path.endsWith("/index.html")) {
    urls.push(path.replace(/index\.html$/, "data/masters.json"));
  } else if (!path.endsWith("/") && !path.split("/").pop().includes(".")) {
    urls.push(path + "/data/masters.json");
  }

  urls.push("data/masters.json");

  return Array.from(new Set(urls));
}

async function fetchMasterDataPayload() {
  let lastError = null;

  for (const url of getMasterDataUrls()) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(url + " HTTP status: " + response.status);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      console.error("masters.json の取得に失敗しました:", url, error);
    }
  }

  throw lastError || new Error("masters.json を取得できませんでした。");
}

async function loadMasterData() {
  try {
    const payload = await fetchMasterDataPayload();
    const root = payload.data || payload;
    const menuSource = root.menus || root.menuItems || [];
    const sizeSource = root.sizeOptions || root.sizes || [];

    if (!Array.isArray(menuSource)) {
      throw new Error("masters.json の menus が配列ではありません。");
    }

    if (!Array.isArray(sizeSource)) {
      throw new Error("masters.json の sizeOptions が配列ではありません。");
    }

    const menus = menuSource
      .map(normalizeMenuItem)
      .filter((item) => item.name && item.visible)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        category: item.category,
        name: item.name,
        basePrice: item.basePrice,
        sizeEnabled: item.sizeEnabled,
        order: item.order
      }));

    const sizeOptions = sizeSource
      .map(normalizeSizeOption)
      .filter((item) => item.name && item.visible)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        name: item.name,
        adjustment: item.adjustment,
        order: item.order
      }));

    if (menus.length === 0) {
      throw new Error("表示できるメニューがありません。");
    }

    MENU_ITEMS = menus;

    if (sizeOptions.length > 0) {
      SIZE_OPTIONS = sizeOptions;
    }
  } catch (error) {
    const fileMessage = window.location.protocol === "file:"
      ? " HTMLを直接開いている場合は、GitHub Pagesまたはローカルサーバー経由で開いてください。"
      : "";

    setStatus("メニュー情報を取得できなかったため、初期メニューを表示しています。" + fileMessage, "info");
    console.error(error);
  }
}

function groupMenuItemsByCategory() {
  const map = new Map();

  MENU_ITEMS.forEach((item) => {
    const category = item.category || "その他";

    if (!map.has(category)) {
      map.set(category, {
        name: category,
        order: item.order,
        items: []
      });
    }

    const group = map.get(category);
    group.items.push(item);
    group.order = Math.min(group.order, item.order);
  });

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      items: group.items.slice().sort((a, b) => a.order - b.order)
    }))
    .sort((a, b) => a.order - b.order);
}

function buildMenuRows() {
  menuRows.replaceChildren();

  const categoryGroups = groupMenuItemsByCategory();

  categoryGroups.forEach((categoryGroup, categoryIndex) => {
    const isCategoryExpanded = expandedCategories.has(categoryGroup.name);

    const categoryCard = document.createElement("section");
    categoryCard.className = "category-card";
    if (isCategoryExpanded) {
      categoryCard.classList.add("is-expanded");
    }

    const categoryHeader = document.createElement("div");
    categoryHeader.className = "category-header";

    const categoryInfo = document.createElement("div");

    const categoryTitle = document.createElement("h2");
    categoryTitle.className = "category-title";
    categoryTitle.textContent = categoryGroup.name;

    const categoryMeta = document.createElement("p");
    categoryMeta.className = "category-meta";
    categoryMeta.textContent = categoryGroup.items.length + "種類";

    const categorySummary = document.createElement("p");
    categorySummary.className = "category-selected-summary";
    categorySummary.dataset.categoryName = categoryGroup.name;

    categoryInfo.append(categoryTitle, categoryMeta, categorySummary);

    const categoryButton = document.createElement("button");
    categoryButton.type = "button";
    categoryButton.className = "button button-secondary category-toggle-button";
    categoryButton.dataset.categoryName = categoryGroup.name;
    categoryButton.disabled = isSending;
    categoryButton.textContent = isCategoryExpanded ? "閉じる" : hasSelectedQuantityInCategory(categoryGroup.name) ? "開く" : "選択する";

    categoryHeader.append(categoryInfo, categoryButton);
    categoryCard.appendChild(categoryHeader);

    if (isCategoryExpanded) {
      const menuGrid = document.createElement("div");
      menuGrid.className = "category-menu-grid";

      categoryGroup.items.forEach((item, menuIndex) => {
        const isExpanded = expandedMenus.has(item.name);
        const row = document.createElement("div");
        row.className = "menu-row";
        if (isExpanded) {
          row.classList.add("is-expanded");
        }

        const header = document.createElement("div");
        header.className = "menu-card-header";

        const info = document.createElement("div");

        const name = document.createElement("p");
        name.className = "menu-name";
        name.textContent = item.name;

        const price = document.createElement("p");
        price.className = "menu-price";
        price.textContent = "参考基本単価：" + formatYen(item.basePrice);

        const selectedSummary = document.createElement("p");
        selectedSummary.className = "menu-selected-summary";
        selectedSummary.dataset.menuName = item.name;

        info.append(name, price, selectedSummary);

        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "button button-secondary menu-toggle-button";
        toggleButton.dataset.menuName = item.name;
        toggleButton.disabled = isSending;
        toggleButton.textContent = isExpanded ? "閉じる" : hasSelectedQuantity(item) ? "開く" : "選択する";

        header.append(info, toggleButton);

        const variantList = document.createElement("div");
        variantList.className = "size-variant-list";

        if (isExpanded) {
          const variants = getMenuVariants(item);

          variants.forEach((option, sizeIndex) => {
            const variantRow = document.createElement("div");
            variantRow.className = "size-variant-row";

            const variantInfo = document.createElement("div");

            const variantName = document.createElement("p");
            variantName.className = "size-variant-name";
            variantName.textContent = option.sizeLabel;

            const variantNote = document.createElement("p");
            variantNote.className = "size-variant-note";
            variantNote.textContent = item.sizeEnabled ? "サイズ加算：" + getAdjustmentText(option.adjustment) : "サイズ：対象外";

            variantInfo.append(variantName, variantNote);

            const amount = document.createElement("p");
            amount.id = "amount-" + categoryIndex + "-" + menuIndex + "-" + sizeIndex;
            amount.className = "row-amount";
            amount.textContent = "参考単価：" + formatYen(item.basePrice + option.adjustment) + " / 小計：0円";

            const control = document.createElement("div");
            control.className = "quantity-control";

            const inputId = "quantity-" + categoryIndex + "-" + menuIndex + "-" + sizeIndex;
            const sizeLabel = option.sizeLabel;

            const minusButton = document.createElement("button");
            minusButton.type = "button";
            minusButton.className = "quantity-button";
            minusButton.textContent = "-";
            minusButton.setAttribute("aria-label", item.name + " " + sizeLabel + "を1個減らす");
            minusButton.dataset.action = "decrease";
            minusButton.dataset.target = inputId;
            minusButton.dataset.menuName = item.name;
            minusButton.dataset.size = option.size;

            const input = document.createElement("input");
            input.type = "number";
            input.id = inputId;
            input.className = "quantity-input";
            input.min = "0";
            input.step = "1";
            input.value = getQuantityValue(item.name, option.size);
            input.inputMode = "numeric";
            input.dataset.menuName = item.name;
            input.dataset.size = option.size;
            input.dataset.sizeEnabled = item.sizeEnabled ? "true" : "false";
            input.dataset.amountTarget = amount.id;
            input.setAttribute("aria-label", item.name + " " + sizeLabel + "の数量");

            const plusButton = document.createElement("button");
            plusButton.type = "button";
            plusButton.className = "quantity-button";
            plusButton.textContent = "+";
            plusButton.setAttribute("aria-label", item.name + " " + sizeLabel + "を1個増やす");
            plusButton.dataset.action = "increase";
            plusButton.dataset.target = inputId;
            plusButton.dataset.menuName = item.name;
            plusButton.dataset.size = option.size;

            control.append(minusButton, input, plusButton);
            variantRow.append(variantInfo, amount, control);
            variantList.appendChild(variantRow);
          });
        }

        row.append(header, variantList);
        menuGrid.appendChild(row);
      });

      categoryCard.appendChild(menuGrid);
    }

    menuRows.appendChild(categoryCard);
  });

  updateCategoryCardSummaries();
  updateMenuCardSummaries();
}

function getQuantityInputs() {
  return Array.from(menuRows.querySelectorAll(".quantity-input"));
}

function getAllOrderEntries() {
  return MENU_ITEMS.flatMap((menuItem) => {
    return getMenuVariants(menuItem).map((variant) => {
      const value = getQuantityValue(menuItem.name, variant.size);
      const quantity = Number(value);
      const pricing = getPricing(menuItem.name, variant.size, quantity);

      return {
        category: menuItem.category || "その他",
        menu: menuItem.name,
        size: menuItem.sizeEnabled ? variant.size : "",
        value,
        quantity,
        sizeEnabled: menuItem.sizeEnabled,
        ...pricing
      };
    });
  });
}

function getQuantityEntries() {
  return getAllOrderEntries();
}

function getMenuSelectedEntries(menuItem) {
  return getAllOrderEntries().filter((item) => {
    return item.menu === menuItem.name && Number.isFinite(item.quantity) && Number.isInteger(item.quantity) && item.quantity > 0;
  });
}

function getCategorySelectedEntries(categoryName) {
  return getAllOrderEntries().filter((item) => {
    return item.category === categoryName && Number.isFinite(item.quantity) && Number.isInteger(item.quantity) && item.quantity > 0;
  });
}

function hasSelectedQuantity(menuItem) {
  return getMenuSelectedEntries(menuItem).length > 0;
}

function hasSelectedQuantityInCategory(categoryName) {
  return getCategorySelectedEntries(categoryName).length > 0;
}

function renderMenuSummary(menuItem) {
  const selectedEntries = getMenuSelectedEntries(menuItem);

  if (selectedEntries.length === 0) {
    return "";
  }

  const summaryText = selectedEntries.map((item) => {
    const sizeText = item.sizeEnabled ? item.size : "";
    return sizeText ? sizeText + " " + item.quantity + "個" : item.quantity + "個";
  }).join("、");
  const subtotal = selectedEntries.reduce((sum, item) => sum + item.subtotal, 0);

  return "選択中：" + summaryText + " / 小計" + formatYen(subtotal);
}

function renderCategorySummary(categoryName) {
  const selectedEntries = getCategorySelectedEntries(categoryName);

  if (selectedEntries.length === 0) {
    return "";
  }

  const totalQuantity = selectedEntries.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = selectedEntries.reduce((sum, item) => sum + item.subtotal, 0);
  const menuCount = new Set(selectedEntries.map((item) => item.menu)).size;

  return "選択中：" + menuCount + "種類 / " + totalQuantity + "個 / 小計" + formatYen(subtotal);
}

function updateCategoryCardSummaries() {
  groupMenuItemsByCategory().forEach((categoryGroup) => {
    const summary = Array.from(menuRows.querySelectorAll(".category-selected-summary"))
      .find((element) => element.dataset.categoryName === categoryGroup.name);
    const toggleButton = Array.from(menuRows.querySelectorAll(".category-toggle-button"))
      .find((element) => element.dataset.categoryName === categoryGroup.name);
    const text = renderCategorySummary(categoryGroup.name);
    const expanded = expandedCategories.has(categoryGroup.name);

    if (summary) {
      summary.textContent = text;
      summary.hidden = !text;
    }

    if (toggleButton) {
      toggleButton.textContent = expanded ? "閉じる" : text ? "開く" : "選択する";
      toggleButton.disabled = isSending;
    }
  });
}

function updateMenuCardSummaries() {
  MENU_ITEMS.forEach((menuItem) => {
    const summary = Array.from(menuRows.querySelectorAll(".menu-selected-summary"))
      .find((element) => element.dataset.menuName === menuItem.name);
    const toggleButton = Array.from(menuRows.querySelectorAll(".menu-toggle-button"))
      .find((element) => element.dataset.menuName === menuItem.name);
    const text = renderMenuSummary(menuItem);
    const expanded = expandedMenus.has(menuItem.name);

    if (summary) {
      summary.textContent = text;
      summary.hidden = !text;
    }

    if (toggleButton) {
      toggleButton.textContent = expanded ? "閉じる" : text ? "開く" : "選択する";
      toggleButton.disabled = isSending;
    }
  });
}

function getAdjustmentText(adjustment) {
  if (adjustment > 0) {
    return "+" + formatYen(adjustment);
  }

  return formatYen(adjustment);
}

function getPricing(menuName, sizeName, quantity) {
  const menuItem = findMenuItem(menuName);
  if (!menuItem) {
    return {
      basePrice: 0,
      adjustment: 0,
      unitPrice: 0,
      subtotal: 0,
      sizeLabel: "サイズ対象外"
    };
  }

  const sizeOption = menuItem.sizeEnabled ? findSizeOption(sizeName) : null;
  const adjustment = menuItem.sizeEnabled && sizeOption ? sizeOption.adjustment : 0;
  const unitPrice = menuItem.basePrice + adjustment;
  const safeQuantity = Number.isFinite(quantity) && Number.isInteger(quantity) && quantity > 0 ? quantity : 0;

  return {
    basePrice: menuItem.basePrice,
    adjustment,
    unitPrice,
    subtotal: unitPrice * safeQuantity,
    sizeLabel: menuItem.sizeEnabled ? sizeName : "サイズ対象外"
  };
}

function getSelectedItems() {
  return getQuantityEntries()
    .filter((item) => Number.isFinite(item.quantity) && Number.isInteger(item.quantity) && item.quantity > 0)
    .map((item) => ({
      menu: item.menu,
      size: item.sizeEnabled ? item.size : "",
      quantity: item.quantity
    }));
}

function getSelectedDisplayItems() {
  return getSelectedItems().map((item) => {
    const pricing = getPricing(item.menu, item.size, item.quantity);
    return {
      ...item,
      ...pricing
    };
  });
}

function calculateTotalQuantity(items) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function calculateGrandTotal(items) {
  return items.reduce((sum, item) => {
    const pricing = getPricing(item.menu, item.size, item.quantity);
    return sum + pricing.subtotal;
  }, 0);
}

function renderItemList(container, items, emptyText) {
  container.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "detail-list";

  items.forEach((item) => {
    const pricing = getPricing(item.menu, item.size, item.quantity);

    const listItem = document.createElement("li");
    listItem.className = "detail-item";

    const itemName = document.createElement("span");
    itemName.className = "detail-item-name";
    itemName.textContent = item.menu + " / " + pricing.sizeLabel;

    const itemMeta = document.createElement("span");
    itemMeta.className = "detail-item-meta";
    itemMeta.textContent = item.quantity + "個 / 参考単価" + formatYen(pricing.unitPrice) + " / 小計" + formatYen(pricing.subtotal);

    listItem.append(itemName, itemMeta);
    list.appendChild(listItem);
  });

  container.appendChild(list);
}

function updateRowAmounts() {
  getQuantityInputs().forEach((input) => {
    const menuName = input.dataset.menuName;
    const size = input.dataset.size || "";
    const quantity = Number(getQuantityValue(menuName, size));
    const pricing = getPricing(menuName, size, quantity);
    const menuItem = findMenuItem(menuName);
    const amount = document.getElementById(input.dataset.amountTarget);

    if (!amount) {
      return;
    }

    const sizeText = menuItem && menuItem.sizeEnabled ? " / サイズ加算：" + getAdjustmentText(pricing.adjustment) : " / サイズ対象外";
    amount.textContent = "参考単価：" + formatYen(pricing.unitPrice) + sizeText + " / 小計：" + formatYen(pricing.subtotal);
  });
}

function updateQuantityButtonStates() {
  getQuantityInputs().forEach((input) => {
    const quantity = Number(input.value);
    const minusButton = menuRows.querySelector('[data-action="decrease"][data-target="' + input.id + '"]');
    const plusButton = menuRows.querySelector('[data-action="increase"][data-target="' + input.id + '"]');

    if (minusButton) {
      minusButton.disabled = isSending || !Number.isFinite(quantity) || quantity <= 0;
    }

    if (plusButton) {
      plusButton.disabled = isSending;
    }
  });
}

function updateSummary() {
  const items = getSelectedItems();
  const displayItems = getSelectedDisplayItems();
  const totalQuantity = calculateTotalQuantity(items);
  const grandTotal = calculateGrandTotal(items);

  selectedMenuCountText.textContent = items.length + "種類";
  totalQuantityText.textContent = totalQuantity + "個";
  grandTotalText.textContent = formatYen(grandTotal);
  floatingTotalQuantityText.textContent = totalQuantity + "個";
  floatingGrandTotalText.textContent = formatYen(grandTotal);
  floatingSelectedText.textContent = displayItems.length > 0
    ? displayItems.map((item) => item.menu + (item.size ? "（" + item.size + "）" : "") + " " + item.quantity + "個").join("、")
    : "まだメニューが選択されていません。";
  renderItemList(selectedItemsList, displayItems, "まだメニューが選択されていません。");
  updateRowAmounts();
  updateQuantityButtonStates();
  updateCategoryCardSummaries();
  updateMenuCardSummaries();
}

function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = "message message-" + type;
  statusMessage.hidden = false;
}

function clearStatus() {
  statusMessage.textContent = "";
  statusMessage.hidden = true;
}

function clearErrors() {
  errorBox.replaceChildren();
  errorBox.hidden = true;
}

function showErrors(errors) {
  errorBox.replaceChildren();

  const title = document.createElement("p");
  title.textContent = "入力内容を確認してください。";
  errorBox.appendChild(title);

  const list = document.createElement("ul");
  errors.forEach((error) => {
    const item = document.createElement("li");
    item.textContent = error;
    list.appendChild(item);
  });
  errorBox.appendChild(list);
  errorBox.hidden = false;
}

function expandMenuForInput(menuName) {
  const menuItem = findMenuItem(menuName);
  if (menuItem && menuItem.category) {
    expandedCategories.add(menuItem.category);
  }

  expandedMenus.add(menuName);
}

function focusFirstInvalidField() {
  const department = form.elements["department"];
  const name = form.elements["name"];
  const invalidQuantity = getQuantityEntries().find((item) => {
    if (!item.value) {
      return true;
    }

    return !Number.isFinite(item.quantity) || item.quantity < 0 || !Number.isInteger(item.quantity);
  });

  if (!department.value.trim()) {
    department.focus({ preventScroll: true });
  } else if (!name.value.trim()) {
    name.focus({ preventScroll: true });
  } else if (invalidQuantity) {
    expandMenuForInput(invalidQuantity.menu);
    buildMenuRows();
    updateSummary();

    const input = getQuantityInputs().find((quantityInput) => {
      return quantityInput.dataset.menuName === invalidQuantity.menu && (quantityInput.dataset.size || "") === invalidQuantity.size;
    });

    if (input) {
      input.focus({ preventScroll: true });
    }
  } else {
    const firstMenu = MENU_ITEMS[0];

    if (firstMenu) {
      expandMenuForInput(firstMenu.name);
      buildMenuRows();
      updateSummary();

      const input = getQuantityInputs()[0];
      if (input) {
        input.focus({ preventScroll: true });
      }
    }
  }
}

function validateForm() {
  const department = form.elements["department"].value.trim();
  const name = form.elements["name"].value.trim();
  const contact = form.elements["contact"].value.trim();
  const note = form.elements["note"].value.trim();
  const quantityEntries = getQuantityEntries();
  const items = getSelectedItems();
  const errors = [];
  let hasQuantityError = false;

  if (!department) {
    errors.push("部署を入力してください。");
  }

  if (!name) {
    errors.push("名前を入力してください。");
  }

  quantityEntries.forEach((item) => {
    if (!item.value) {
      errors.push(item.menu + "の数量を数値で入力してください。");
      hasQuantityError = true;
    } else if (!Number.isFinite(item.quantity)) {
      errors.push(item.menu + "の数量を数値で入力してください。");
      hasQuantityError = true;
    } else if (item.quantity < 0) {
      errors.push(item.menu + "の数量は0以上で入力してください。");
      hasQuantityError = true;
    } else if (!Number.isInteger(item.quantity)) {
      errors.push(item.menu + "の数量は整数で入力してください。");
      hasQuantityError = true;
    }

    if (item.sizeEnabled && !item.size) {
      errors.push(item.menu + "のサイズを選択してください。");
    }
  });

  if (!hasQuantityError && items.length === 0) {
    errors.push("1つ以上のメニューで数量を1以上にしてください。");
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: {
      department,
      name,
      contact,
      note,
      items
    }
  };
}

function setConfirmationText(id, value, fallback) {
  document.getElementById(id).textContent = value || fallback;
}

function renderConfirmation(data) {
  const totalQuantity = calculateTotalQuantity(data.items);
  const grandTotal = calculateGrandTotal(data.items);

  setConfirmationText("confirmDepartment", data.department, "未入力");
  setConfirmationText("confirmName", data.name, "未入力");
  setConfirmationText("confirmContact", data.contact, "なし");
  setConfirmationText("confirmNote", data.note, "なし");
  renderItemList(document.getElementById("confirmItems"), data.items, "注文明細がありません。");
  setConfirmationText("confirmTotalQuantity", totalQuantity + "個", "0個");
  setConfirmationText("confirmGrandTotal", formatYen(grandTotal), "0円");
}

function showConfirmation(data) {
  pendingData = data;
  renderConfirmation(data);
  confirmationPanel.hidden = false;
  setStatus("内容を確認してください。", "info");
  confirmationPanel.focus({ preventScroll: true });
  confirmationPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeConfirmation() {
  pendingData = null;
  confirmationPanel.hidden = true;
}

function setSending(sending) {
  isSending = sending;
  showConfirmButton.disabled = sending;
  sendButton.disabled = sending;
  editButton.disabled = sending;
  floatingConfirmButton.disabled = sending;
  updateQuantityButtonStates();
  updateCategoryCardSummaries();
  updateMenuCardSummaries();
}

function resetFormState() {
  form.reset();
  clearQuantities();
  expandedCategories.clear();
  expandedMenus.clear();
  buildMenuRows();
  closeConfirmation();
  updateSummary();
  clearErrors();
}

function closeConfirmationAfterEdit() {
  if (!confirmationPanel.hidden) {
    closeConfirmation();
    clearStatus();
  }
}

function changeQuantity(input, amount) {
  const menuName = input.dataset.menuName;
  const size = input.dataset.size || "";
  const current = Number(getQuantityValue(menuName, size));
  const safeCurrent = Number.isFinite(current) && Number.isInteger(current) && current >= 0 ? current : 0;
  const nextValue = Math.max(0, safeCurrent + amount);

  setQuantity(menuName, size, nextValue);
  input.value = getQuantityValue(menuName, size);
  updateSummary();
  closeConfirmationAfterEdit();
}

function toggleCategory(categoryName) {
  withScrollPreserved(() => {
    if (expandedCategories.has(categoryName)) {
      expandedCategories.delete(categoryName);
    } else {
      expandedCategories.add(categoryName);
    }

    buildMenuRows();
    updateSummary();
  });
}

function toggleMenu(menuName) {
  withScrollPreserved(() => {
    if (expandedMenus.has(menuName)) {
      expandedMenus.delete(menuName);
    } else {
      expandedMenus.add(menuName);

      const menuItem = findMenuItem(menuName);
      if (menuItem && menuItem.category) {
        expandedCategories.add(menuItem.category);
      }
    }

    buildMenuRows();
    updateSummary();
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();
  clearStatus();

  const result = validateForm();

  if (!result.isValid) {
    closeConfirmation();
    showErrors(result.errors);
    focusFirstInvalidField();
    return;
  }

  showConfirmation(result.data);
});

menuRows.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const categoryButton = event.target.closest(".category-toggle-button");
  if (categoryButton) {
    toggleCategory(categoryButton.dataset.categoryName);
    return;
  }

  const toggleButton = event.target.closest(".menu-toggle-button");
  if (toggleButton) {
    toggleMenu(toggleButton.dataset.menuName);
    return;
  }

  const button = event.target.closest(".quantity-button");
  if (!button) {
    return;
  }

  const input = document.getElementById(button.dataset.target);
  if (!input) {
    return;
  }

  const amount = button.dataset.action === "increase" ? 1 : -1;
  changeQuantity(input, amount);
});

menuRows.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.classList.contains("quantity-input")) {
    return;
  }

  setQuantityValue(event.target.dataset.menuName, event.target.dataset.size || "", event.target.value);
  updateSummary();
});

menuRows.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.classList.contains("quantity-input")) {
    return;
  }

  setQuantityValue(event.target.dataset.menuName, event.target.dataset.size || "", event.target.value);
  updateSummary();
});

form.addEventListener("input", closeConfirmationAfterEdit);
form.addEventListener("change", closeConfirmationAfterEdit);

editButton.addEventListener("click", () => {
  closeConfirmation();
  clearStatus();
  showConfirmButton.focus();
});

toggleOrderStatusButton.addEventListener("click", () => {
  setOrderStatusExpanded(orderStatusContent.hidden);
});

refreshOrdersButton.addEventListener("click", () => {
  loadCurrentOrders();
});

departmentFilter.addEventListener("change", () => {
  renderCurrentOrders();
});

menuFilter.addEventListener("change", () => {
  renderCurrentOrders();
});

floatingConfirmButton.addEventListener("click", () => {
  showConfirmButton.click();
});

sendButton.addEventListener("click", async () => {
  if (!pendingData) {
    return;
  }

  const data = pendingData;

  setSending(true);
  clearErrors();
  setStatus("送信中です...", "info");

  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error("HTTP status: " + response.status);
    }

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.message || "GAS側で処理に失敗しました。");
    }

    resetFormState();
    setStatus("送信しました", "success");
    await loadCurrentOrders();
  } catch (error) {
    const errorMessage = error && error.message
      ? "送信に失敗しました：" + error.message
      : "送信に失敗しました。時間をおいて再度お試しください。";

    setStatus(errorMessage, "error");
    console.error(error);
  } finally {
    setSending(false);
  }
});

async function initialize() {
  showConfirmButton.disabled = true;
  setOrderStatusExpanded(false);
  showMenuLoading();

  const ordersPromise = loadCurrentOrders();

  await loadMasterData();
  buildMenuRows();
  updateSummary();

  showConfirmButton.disabled = false;

  await ordersPromise;
}

initialize();
