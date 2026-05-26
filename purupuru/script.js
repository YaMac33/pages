const GAS_URL = "https://script.google.com/macros/s/AKfycbxWwMt6cXdXu1KG3NFmzT10n9FX8VNI6dpmFS_WtDayCjG1eJe7Q1g1sXRg9AM7UsWs/exec";
const MASTER_DATA_URL = "./data/masters.json";

let MENU_ITEMS = [];

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
const menuAggregateBody = document.getElementById("menuAggregateBody");
const departmentAggregateBody = document.getElementById("departmentAggregateBody");
const currentOrdersBody = document.getElementById("currentOrdersBody");
const floatingTotalQuantityText = document.getElementById("floatingTotalQuantityText");
const floatingGrandTotalText = document.getElementById("floatingGrandTotalText");
const floatingSelectedText = document.getElementById("floatingSelectedText");
const floatingConfirmButton = document.getElementById("floatingConfirmButton");

let pendingData = null;
let isSending = false;
let currentOrders = [];
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
  return MENU_ITEMS.find((item) => item.menuName === menuName);
}

function findMenuOption(menuName, sizeName) {
  const menuItem = findMenuItem(menuName);
  if (!menuItem) {
    return null;
  }

  return menuItem.options.find((option) => option.size === sizeName) || null;
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
  return menuItem.options.map((option) => ({
    size: option.size,
    sizeLabel: option.size,
    price: option.price,
    sort: option.sort
  }));
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
  const unitPrice = toNumber(row.price ?? row.unitPrice, 0);
  const quantity = toNumber(row.quantity, 0);
  const subtotal = toNumber(row.subtotal, unitPrice * quantity);

  return {
    timestamp: String(row.timestamp || "").trim(),
    department: String(row.department || "").trim() || "未設定",
    menu: String(row.menuName || row.menu || "").trim() || "未設定",
    size: String(row.size || "").trim(),
    unitPrice,
    quantity,
    subtotal
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

function aggregateMenuOrders(orders) {
  const map = new Map();

  orders.forEach((order) => {
    const key = order.menu + "\u0000" + order.size;
    const current = map.get(key) || {
      menu: order.menu,
      size: order.size,
      quantity: 0,
      amount: 0
    };

    current.quantity += toNumber(order.quantity, 0);
    current.amount += toNumber(order.subtotal, 0);
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => {
    const menuCompare = a.menu.localeCompare(b.menu, "ja");
    return menuCompare !== 0 ? menuCompare : a.size.localeCompare(b.size, "ja");
  });
}

function aggregateDepartmentOrders(orders) {
  const map = new Map();

  orders.forEach((order) => {
    const key = order.department + "\u0000" + order.menu + "\u0000" + order.size;
    const current = map.get(key) || {
      department: order.department,
      menu: order.menu,
      size: order.size,
      quantity: 0,
      amount: 0
    };

    current.quantity += toNumber(order.quantity, 0);
    current.amount += toNumber(order.subtotal, 0);
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => {
    const departmentCompare = a.department.localeCompare(b.department, "ja");
    if (departmentCompare !== 0) return departmentCompare;

    const menuCompare = a.menu.localeCompare(b.menu, "ja");
    return menuCompare !== 0 ? menuCompare : a.size.localeCompare(b.size, "ja");
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
    const response = await fetch(buildUrl(GAS_URL, { action: "orders" }), {
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

    currentOrders = orders
      .map(normalizePublishedOrder)
      .filter((order) => Number.isFinite(order.quantity) && order.quantity > 0);
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

function showMenuLoading() {
  menuRows.replaceChildren();

  const loading = document.createElement("p");
  loading.className = "detail-empty";
  loading.textContent = "メニュー情報を読み込み中です。";
  menuRows.appendChild(loading);
}

function buildUrl(url, params) {
  const builtUrl = new URL(url, window.location.href);

  Object.entries(params).forEach(([key, value]) => {
    builtUrl.searchParams.set(key, value);
  });

  return builtUrl.toString();
}

function getLocalMasterDataUrls() {
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

function assertApiPayload(payload) {
  if (payload && payload.ok === false) {
    const apiError = new Error(payload.message || "メニュー情報の取得に失敗しました。");
    apiError.stopFallback = true;
    throw apiError;
  }

  return payload;
}

function normalizeMenuOption(row) {
  if (Array.isArray(row)) {
    return {
      size: String(row[0] || "").trim(),
      price: toNumber(row[1], 0),
      sort: toNumber(row[2], 0)
    };
  }

  return {
    size: String(row.size || row.sizeName || row["盛り方"] || "").trim(),
    price: toNumber(row.price ?? row["単価"], 0),
    sort: toNumber(row.sort ?? row.order ?? row["並び順"], 0)
  };
}

function normalizeMenuGroup(row) {
  if (Array.isArray(row)) {
    return {
      menuName: String(row[0] || "").trim(),
      groupSort: toNumber(row[1], 0),
      options: []
    };
  }

  const menuName = String(row.menuName || row.name || row.menu || row["メニュー"] || "").trim();
  const options = Array.isArray(row.options)
    ? row.options
      .map(normalizeMenuOption)
      .filter((option) => option.size && Number.isFinite(option.price))
      .sort((a, b) => a.sort - b.sort)
    : [];

  return {
    menuName,
    name: menuName,
    groupSort: toNumber(row.groupSort ?? row.groupSortOrder ?? row["グループ並び順"], 0),
    options
  };
}

async function fetchMasterDataPayload() {
  let lastError = null;

  try {
    return await fetchGasMenuPayload();
  } catch (error) {
    if (error.stopFallback) {
      throw error;
    }

    lastError = error;
    console.error("GASからのメニュー情報取得に失敗しました:", error);
  }

  for (const url of getLocalMasterDataUrls()) {
    try {
      return await fetchJsonPayload(url);
    } catch (error) {
      if (error.stopFallback) {
        throw error;
      }

      lastError = error;
      console.error("メニュー情報の取得に失敗しました:", url, error);
    }
  }

  throw lastError || new Error("メニュー情報を取得できませんでした。");
}

async function fetchGasMenuPayload() {
  const url = buildUrl(GAS_URL, { action: "menus" });

  try {
    return await fetchJsonPayload(url);
  } catch (error) {
    if (error.stopFallback) {
      throw error;
    }

    console.error("GASメニューのfetch取得に失敗しました。JSONPで再試行します:", error);
    return fetchJsonpPayload(url);
  }
}

async function fetchJsonPayload(url) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(url + " HTTP status: " + response.status);
  }

  return assertApiPayload(await response.json());
}

function fetchJsonpPayload(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "__purupuruMenus_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("GASメニュー情報の取得がタイムアウトしました。"));
    }, 10000);

    window[callbackName] = (payload) => {
      try {
        cleanup();
        resolve(assertApiPayload(payload));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("GASメニュー情報のJSONP取得に失敗しました。"));
    };

    script.src = buildUrl(url, { callback: callbackName });
    document.head.appendChild(script);
  });
}

async function loadMasterData() {
  try {
    const payload = await fetchMasterDataPayload();
    const root = payload.data || payload;
    const menuSource = root.menus;

    if (!Array.isArray(menuSource)) {
      throw new Error("menus が配列ではありません。");
    }

    const menus = menuSource
      .map(normalizeMenuGroup)
      .filter((item) => item.menuName && item.options.length > 0)
      .sort((a, b) => a.groupSort - b.groupSort);

    MENU_ITEMS = menus;
  } catch (error) {
    const fileMessage = window.location.protocol === "file:"
      ? " HTMLを直接開いている場合は、GitHub Pagesまたはローカルサーバー経由で開いてください。"
      : "";

    MENU_ITEMS = [];
    setStatus("メニュー情報を取得できませんでした：" + (error.message || "原因不明のエラーです。") + fileMessage, "error");
    console.error(error);
  }
}

function formatPriceRange(menuItem) {
  const prices = menuItem.options
    .map((option) => option.price)
    .filter((price) => Number.isFinite(price));

  if (prices.length === 0) {
    return "価格未設定";
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return min === max ? formatYen(min) : formatYen(min) + "〜" + formatYen(max);
}

function buildMenuRows() {
  menuRows.replaceChildren();

  if (MENU_ITEMS.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = "表示できるメニューがありません。";
    menuRows.appendChild(empty);
    return;
  }

  MENU_ITEMS.forEach((item, menuIndex) => {
    const isExpanded = expandedMenus.has(item.menuName);
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
    name.textContent = item.menuName;

    const price = document.createElement("p");
    price.className = "menu-price";
    price.textContent = "価格帯：" + formatPriceRange(item);

    const selectedSummary = document.createElement("p");
    selectedSummary.className = "menu-selected-summary";
    selectedSummary.dataset.menuName = item.menuName;

    info.append(name, price, selectedSummary);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "button button-secondary menu-toggle-button";
    toggleButton.dataset.menuName = item.menuName;
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
        variantNote.textContent = "単価：" + formatYen(option.price);

        variantInfo.append(variantName, variantNote);

        const amount = document.createElement("p");
        amount.id = "amount-" + menuIndex + "-" + sizeIndex;
        amount.className = "row-amount";
        amount.textContent = "小計：0円";

        const control = document.createElement("div");
        control.className = "quantity-control";

        const inputId = "quantity-" + menuIndex + "-" + sizeIndex;

        const sizeLabel = option.sizeLabel;

        const minusButton = document.createElement("button");
        minusButton.type = "button";
        minusButton.className = "quantity-button";
        minusButton.textContent = "-";
        minusButton.setAttribute("aria-label", item.menuName + " " + sizeLabel + "を1個減らす");
        minusButton.dataset.action = "decrease";
        minusButton.dataset.target = inputId;
        minusButton.dataset.menuName = item.menuName;
        minusButton.dataset.size = option.size;

        const input = document.createElement("input");
        input.type = "number";
        input.id = inputId;
        input.className = "quantity-input";
        input.min = "0";
        input.step = "1";
        input.value = getQuantityValue(item.menuName, option.size);
        input.inputMode = "numeric";
        input.dataset.menuName = item.menuName;
        input.dataset.size = option.size;
        input.dataset.amountTarget = amount.id;
        input.setAttribute("aria-label", item.menuName + " " + sizeLabel + "の数量");

        const plusButton = document.createElement("button");
        plusButton.type = "button";
        plusButton.className = "quantity-button";
        plusButton.textContent = "+";
        plusButton.setAttribute("aria-label", item.menuName + " " + sizeLabel + "を1個増やす");
        plusButton.dataset.action = "increase";
        plusButton.dataset.target = inputId;
        plusButton.dataset.menuName = item.menuName;
        plusButton.dataset.size = option.size;

        control.append(minusButton, input, plusButton);
        variantRow.append(variantInfo, amount, control);
        variantList.appendChild(variantRow);
      });
    }

    row.append(header, variantList);
    menuRows.appendChild(row);
  });

  updateMenuCardSummaries();
}

function getQuantityInputs() {
  return Array.from(menuRows.querySelectorAll(".quantity-input"));
}

function getAllOrderEntries() {
  return MENU_ITEMS.flatMap((menuItem) => {
    return getMenuVariants(menuItem).map((variant) => {
      const value = getQuantityValue(menuItem.menuName, variant.size);
      const quantity = Number(value);
      const pricing = getPricing(menuItem.menuName, variant.size, quantity);

      return {
        menuName: menuItem.menuName,
        menu: menuItem.menuName,
        size: variant.size,
        value,
        quantity,
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
    return item.menuName === menuItem.menuName && Number.isFinite(item.quantity) && Number.isInteger(item.quantity) && item.quantity > 0;
  });
}

function hasSelectedQuantity(menuItem) {
  return getMenuSelectedEntries(menuItem).length > 0;
}

function renderMenuSummary(menuItem) {
  const selectedEntries = getMenuSelectedEntries(menuItem);

  if (selectedEntries.length === 0) {
    return "";
  }

  const summaryText = selectedEntries.map((item) => {
    return item.size + " " + item.quantity + "個";
  }).join("、");
  const subtotal = selectedEntries.reduce((sum, item) => sum + item.subtotal, 0);

  return "選択中：" + summaryText + " / 小計" + formatYen(subtotal);
}

function updateMenuCardSummaries() {
  MENU_ITEMS.forEach((menuItem) => {
    const summary = Array.from(menuRows.querySelectorAll(".menu-selected-summary"))
      .find((element) => element.dataset.menuName === menuItem.menuName);
    const toggleButton = Array.from(menuRows.querySelectorAll(".menu-toggle-button"))
      .find((element) => element.dataset.menuName === menuItem.menuName);
    const text = renderMenuSummary(menuItem);
    const expanded = expandedMenus.has(menuItem.menuName);

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

function getPricing(menuName, sizeName, quantity) {
  const option = findMenuOption(menuName, sizeName);
  if (!option) {
    return {
      price: 0,
      unitPrice: 0,
      subtotal: 0,
      sizeLabel: sizeName || ""
    };
  }

  const unitPrice = option.price;
  const safeQuantity = Number.isFinite(quantity) && Number.isInteger(quantity) && quantity > 0 ? quantity : 0;

  return {
    price: unitPrice,
    unitPrice,
    subtotal: unitPrice * safeQuantity,
    sizeLabel: option.size
  };
}

function getSelectedItems() {
  return getQuantityEntries()
    .filter((item) => Number.isFinite(item.quantity) && Number.isInteger(item.quantity) && item.quantity > 0)
    .map((item) => ({
      menuName: item.menuName,
      menu: item.menuName,
      size: item.size,
      price: item.price,
      unitPrice: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal
    }));
}

function getSelectedDisplayItems() {
  return getSelectedItems();
}

function calculateTotalQuantity(items) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function calculateGrandTotal(items) {
  return items.reduce((sum, item) => sum + toNumber(item.subtotal, 0), 0);
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
    const menuName = item.menuName || item.menu;
    const price = toNumber(item.price ?? item.unitPrice, 0);
    const subtotal = toNumber(item.subtotal, price * toNumber(item.quantity, 0));

    const listItem = document.createElement("li");
    listItem.className = "detail-item";

    const itemName = document.createElement("span");
    itemName.className = "detail-item-name";
    itemName.textContent = menuName + (item.size ? "（" + item.size + "）" : "");

    const itemMeta = document.createElement("span");
    itemMeta.className = "detail-item-meta";
    itemMeta.textContent = formatYen(price) + " × " + item.quantity + "個 = " + formatYen(subtotal);

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
    const amount = document.getElementById(input.dataset.amountTarget);

    if (!amount) {
      return;
    }

    amount.textContent = "単価：" + formatYen(pricing.price) + " / 小計：" + formatYen(pricing.subtotal);
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
    expandedMenus.add(invalidQuantity.menuName);
    buildMenuRows();

    const input = getQuantityInputs().find((quantityInput) => {
      return quantityInput.dataset.menuName === invalidQuantity.menuName && (quantityInput.dataset.size || "") === invalidQuantity.size;
    });

    if (input) {
      input.focus({ preventScroll: true });
    }
  } else {
    const firstQuantityInput = getQuantityInputs()[0];
    if (firstQuantityInput) {
      firstQuantityInput.focus({ preventScroll: true });
    } else if (MENU_ITEMS[0]) {
      expandedMenus.add(MENU_ITEMS[0].menuName);
      buildMenuRows();
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
    const label = item.menuName + "（" + item.size + "）";

    if (!item.value) {
      errors.push(label + "の数量を数値で入力してください。");
      hasQuantityError = true;
    } else if (!Number.isFinite(item.quantity)) {
      errors.push(label + "の数量を数値で入力してください。");
      hasQuantityError = true;
    } else if (item.quantity < 0) {
      errors.push(label + "の数量は0以上で入力してください。");
      hasQuantityError = true;
    } else if (!Number.isInteger(item.quantity)) {
      errors.push(label + "の数量は整数で入力してください。");
      hasQuantityError = true;
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
  showConfirmButton.disabled = sending || MENU_ITEMS.length === 0;
  sendButton.disabled = sending;
  editButton.disabled = sending;
  floatingConfirmButton.disabled = sending || MENU_ITEMS.length === 0;
  updateQuantityButtonStates();
  updateMenuCardSummaries();
}

function resetFormState() {
  form.reset();
  clearQuantities();
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

function toggleMenu(menuName) {
  withScrollPreserved(() => {
    if (expandedMenus.has(menuName)) {
      expandedMenus.delete(menuName);
    } else {
      expandedMenus.clear();
      expandedMenus.add(menuName);
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
  floatingConfirmButton.disabled = true;
  setOrderStatusExpanded(false);
  showMenuLoading();
  const ordersPromise = loadCurrentOrders();
  await loadMasterData();
  buildMenuRows();
  updateSummary();
  showConfirmButton.disabled = MENU_ITEMS.length === 0;
  floatingConfirmButton.disabled = MENU_ITEMS.length === 0;
  await ordersPromise;
}

initialize();
