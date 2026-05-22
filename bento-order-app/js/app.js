(function () {
  "use strict";

  const { state } = window.BentoState;
  const { formatYen } = window.BentoFormatters;

  const hashToTab = {
    "#order": "order",
    "#change": "change",
    "#orders": "orders",
    "#summary": "summary"
  };

  function getFormState(formName) {
    return formName === "order" ? state.currentOrder : state.currentChange;
  }

  function normalizeQuantity(value) {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0) return 0;
    return Math.floor(quantity);
  }

  function focusModal() {
    window.requestAnimationFrame(() => {
      const modal = document.querySelector(".modal");
      if (modal) modal.focus();
    });
  }

  function scrollToMessages() {
    window.requestAnimationFrame(() => {
      const target =
        document.getElementById("error-region").firstElementChild ||
        document.getElementById("message-region").firstElementChild;
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function refreshDynamicTotals(formName) {
    const formState = getFormState(formName);
    const items = window.BentoState.buildItemsFromQuantities(formState.quantities);
    const totals = window.BentoState.calculateTotals(items);

    state.menus.forEach((menu) => {
      const quantity = Number(formState.quantities[menu.id]) || 0;
      const subtotalElement = document.getElementById(`${formName}-subtotal-${menu.id}`);
      if (subtotalElement) {
        subtotalElement.textContent = formatYen(menu.price * quantity);
      }
    });

    const quantityElement = document.getElementById(`${formName}-total-quantity`);
    const amountElement = document.getElementById(`${formName}-total-amount`);

    if (quantityElement) quantityElement.textContent = String(totals.totalQuantity);
    if (amountElement) amountElement.textContent = formatYen(totals.totalAmount);
  }

  function setQuantity(formName, menuId, quantity) {
    const formState = getFormState(formName);
    const nextQuantity = normalizeQuantity(quantity);
    formState.quantities[menuId] = nextQuantity;

    const actionName = formName === "order" ? "order-quantity" : "change-quantity";
    const input = document.querySelector(
      `input[data-action="${actionName}"][data-menu-id="${menuId}"]`
    );
    if (input && document.activeElement !== input) {
      input.value = String(nextQuantity);
    }

    refreshDynamicTotals(formName);
  }

  function updateFormField(element) {
    const formName = element.dataset.form;
    const field = element.dataset.field;
    if (!formName || !field) return;
    if (element.type === "radio" && !element.checked) return;

    const formState = getFormState(formName);
    formState[field] = element.value;

    if (field === "department" || field === "actionType") {
      window.BentoRender.renderApp();
    }
  }

  function openOrderConfirm() {
    window.BentoState.clearMessages();
    const draft = window.BentoState.getOrderDraft();
    const errors = window.BentoValidators.validateOrderForm(state.currentOrder, draft);

    if (errors.length) {
      state.errors = errors;
      window.BentoRender.renderApp();
      scrollToMessages();
      return;
    }

    state.modal = {
      isOpen: true,
      mode: "order",
      title: "注文内容の確認",
      payload: draft
    };
    window.BentoRender.renderApp();
    focusModal();
  }

  function openChangeConfirm() {
    window.BentoState.clearMessages();
    const isCancel = state.currentChange.actionType === "cancel";
    const draft = isCancel
      ? window.BentoState.getCancelDraft()
      : window.BentoState.getChangeDraft();
    const errors = window.BentoValidators.validateChangeCancelForm(
      state.currentChange,
      draft
    );

    if (errors.length) {
      state.errors = errors;
      window.BentoRender.renderApp();
      scrollToMessages();
      return;
    }

    state.modal = {
      isOpen: true,
      mode: isCancel ? "cancel" : "change",
      title: isCancel ? "キャンセル内容の確認" : "変更内容の確認",
      payload: draft
    };
    window.BentoRender.renderApp();
    focusModal();
  }

  function closeModal() {
    state.modal = {
      isOpen: false,
      mode: "",
      title: "",
      payload: null
    };
    window.BentoRender.renderApp();
  }

  async function refreshData() {
    state.orders = await window.BentoApi.fetchOrders();
    state.summaries = await window.BentoApi.fetchSummaries();
  }

  async function submitModalPayload() {
    const { mode, payload } = state.modal;
    if (!mode || !payload) return;

    const submitButton = document.querySelector('[data-action="confirm-submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "送信中...";
    }

    try {
      let result;
      if (mode === "order") {
        result = await window.BentoApi.submitOrder(payload);
        window.BentoState.resetOrderForm();
        window.BentoState.setMessage(
          "success",
          `注文を受け付けました。注文ID：${result.orderIds.join("、")} / 合計 ${formatYen(result.totalAmount)}`
        );
      } else if (mode === "change") {
        result = await window.BentoApi.submitChange(payload);
        window.BentoState.resetChangeForm();
        window.BentoState.setMessage(
          "success",
          `変更を受け付けました。新しい注文ID：${result.orderIds.join("、")} / 合計 ${formatYen(result.totalAmount)}`
        );
      } else if (mode === "cancel") {
        result = await window.BentoApi.submitCancel(payload);
        window.BentoState.resetChangeForm();
        window.BentoState.setMessage(
          "success",
          `キャンセルを受け付けました。対象注文ID：${result.canceledOrderId}`
        );
      }

      state.modal = { isOpen: false, mode: "", title: "", payload: null };
      state.errors = [];
      await refreshData();
      window.BentoRender.renderApp();
      scrollToMessages();
    } catch (error) {
      const message = error && error.message ? String(error.message) : "Unknown API error.";
      state.errors = [`API error: ${message}`];
      state.message = null;
      state.modal = { isOpen: false, mode: "", title: "", payload: null };
      window.BentoRender.renderApp();
      scrollToMessages();
      console.error(error);
    }
  }

  function switchTab(tabId) {
    if (!["order", "change", "orders", "summary"].includes(tabId)) return;
    state.currentTab = tabId;
    state.errors = [];
    window.BentoRender.renderApp();
  }

  function handleTabClick(event, element) {
    event.preventDefault();
    const tabId = element.dataset.tab;
    const targetHash = Object.keys(hashToTab).find((hash) => hashToTab[hash] === tabId);

    if (window.location.hash === targetHash) {
      switchTab(tabId);
    } else {
      window.location.hash = targetHash;
    }
  }

  function handleQuantityClick(element) {
    const isOrder = element.dataset.action === "order-step";
    const formName = isOrder ? "order" : "change";
    const menuId = element.dataset.menuId;
    const delta = Number(element.dataset.delta) || 0;
    const formState = getFormState(formName);
    const current = Number(formState.quantities[menuId]) || 0;
    setQuantity(formName, menuId, current + delta);
  }

  function handleQuantityInput(element) {
    const isOrder = element.dataset.action === "order-quantity";
    const formName = isOrder ? "order" : "change";
    const menuId = element.dataset.menuId;
    const formState = getFormState(formName);
    const quantity = normalizeQuantity(element.value);
    formState.quantities[menuId] = quantity;
    if (element.value !== "" && String(quantity) !== element.value) {
      element.value = String(quantity);
    }
    refreshDynamicTotals(formName);
  }

  function handleQuantityBlur(element) {
    if (!["order-quantity", "change-quantity"].includes(element.dataset.action)) return;
    element.value = String(normalizeQuantity(element.value));
  }

  function handleFilterChange(element) {
    const field = element.dataset.filter;
    if (!field) return;

    const activeId = element.id;
    const value = element.value;
    state.orderFilters[field] = value;
    window.BentoRender.renderOrdersTable();

    window.requestAnimationFrame(() => {
      const restored = document.getElementById(activeId);
      if (!restored) return;
      restored.focus();
      if (restored.type === "search") {
        restored.setSelectionRange(value.length, value.length);
      }
    });
  }

  function handleClick(event) {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      handleTabClick(event, tab);
      return;
    }

    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    if (
      action === "close-modal" &&
      actionElement.classList.contains("modal-backdrop") &&
      event.target !== actionElement
    ) {
      return;
    }

    if (action === "order-step" || action === "change-step") {
      handleQuantityClick(actionElement);
    } else if (action === "order-confirm") {
      openOrderConfirm();
    } else if (action === "change-confirm") {
      openChangeConfirm();
    } else if (action === "close-modal") {
      closeModal();
    } else if (action === "confirm-submit") {
      submitModalPayload();
    }
  }

  function handleInput(event) {
    const element = event.target;

    if (element.dataset.action === "order-quantity" || element.dataset.action === "change-quantity") {
      handleQuantityInput(element);
      return;
    }

    if (element.dataset.filter === "keyword") {
      handleFilterChange(element);
      return;
    }

    if (element.dataset.form && element.dataset.field) {
      updateFormField(element);
    }
  }

  function handleChange(event) {
    const element = event.target;

    if (element.dataset.filter) {
      handleFilterChange(element);
      return;
    }

    if (element.dataset.form && element.dataset.field) {
      updateFormField(element);
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && state.modal.isOpen) {
      closeModal();
    }
  }

  function handleHashChange() {
    switchTab(hashToTab[window.location.hash] || "order");
  }

  async function init() {
    state.currentTab = hashToTab[window.location.hash] || "order";
    window.BentoRender.renderApp();

    try {
      const initialData = await window.BentoApi.fetchInitialData();
      state.orders = initialData.orders;
      state.summaries = initialData.summaries;
      state.menus = initialData.menus;
      state.deliveryDates = initialData.deliveryDates;
      state.departments = initialData.departments;
      window.BentoRender.renderApp();
    } catch (error) {
      const message = error && error.message ? String(error.message) : "Unknown API error.";
      state.errors = [`API error: ${message}`];
      window.BentoRender.renderApp();
      console.error(error);
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("blur", (event) => handleQuantityBlur(event.target), true);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("hashchange", handleHashChange);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
