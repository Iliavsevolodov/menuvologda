(() => {
  const config = window.APP_CONFIG || {};
  const snacks = Array.isArray(window.SNACKS) ? window.SNACKS : [];
  const MAX = Number(config.MAX_SELECTIONS || 10);
  const EVENT_DATE = new Date(config.EVENT_DATE || "2026-10-10T17:00:00+03:00");
  const selected = new Set();

  const $ = (id) => document.getElementById(id);
  const quizView = $("quizView");
  const finalView = $("finalView");
  const closedView = $("closedView");
  const errorView = $("errorView");
  const grid = $("snacksGrid");
  const count = $("selectedCount");
  const progress = $("miniProgress");
  const submitButton = $("submitVote");
  const toast = $("toast");

  const hasBackend = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase);
  const db = hasBackend ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;

  function setCookie(name, value, days = 365) {
    const date = new Date();
    date.setTime(date.getTime() + days * 86400000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${date.toUTCString()};path=/;SameSite=Lax`;
  }

  function getCookie(name) {
    const prefix = `${name}=`;
    return document.cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith(prefix))?.slice(prefix.length) || "";
  }

  function getDeviceId() {
    let id = decodeURIComponent(getCookie("menu_device") || "");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setCookie("menu_device", id);
    }
    return id;
  }

  function isLocallyVoted() {
    return getCookie("menu_voted") === "1" || localStorage.getItem("menu_voted") === "1";
  }

  function markVoted(selection) {
    setCookie("menu_voted", "1");
    localStorage.setItem("menu_voted", "1");
    localStorage.setItem("menu_selection", JSON.stringify(selection));
  }

  function savedSelection() {
    try { return JSON.parse(localStorage.getItem("menu_selection") || "[]"); }
    catch { return []; }
  }

  function showToast(message, type = "") {
    toast.textContent = message;
    toast.className = `toast show ${type}`.trim();
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.className = "toast"; }, 2400);
  }

  function showOnly(view) {
    [quizView, finalView, closedView, errorView].forEach((el) => el.classList.toggle("hidden", el !== view));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderSnacks() {
    grid.innerHTML = snacks.map((name, index) => `
      <button class="snack-card" type="button" data-index="${index}" aria-pressed="false" style="animation-delay:${Math.min(index * 24, 420)}ms">
        <span class="snack-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="snack-name">${escapeHtml(name)}</span>
        <span class="checkmark"><i data-lucide="check"></i></span>
      </button>
    `).join("");

    grid.addEventListener("click", (event) => {
      const card = event.target.closest(".snack-card");
      if (!card) return;
      toggleSelection(Number(card.dataset.index), card);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  }

  function toggleSelection(index, card) {
    if (selected.has(index)) {
      selected.delete(index);
      card.classList.remove("selected");
      card.setAttribute("aria-pressed", "false");
    } else {
      if (selected.size >= MAX) {
        showToast(`Максимум — ${MAX} закусок. Сними один выбор, чтобы заменить.`, "error");
        card.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 220 });
        return;
      }
      selected.add(index);
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
      navigator.vibrate?.(8);
    }
    updateCounter();
  }

  function updateCounter() {
    count.textContent = selected.size;
    progress.style.width = `${(selected.size / MAX) * 100}%`;
    submitButton.disabled = selected.size === 0;
  }

  function selectedNames() {
    return [...selected].sort((a, b) => a - b).map((index) => snacks[index]).filter(Boolean);
  }

  async function submitVote() {
    if (!db || !selected.size || selected.size > MAX) return;
    const choices = selectedNames();
    submitButton.disabled = true;
    submitButton.querySelector("span").textContent = "Отправляем…";

    try {
      const { error } = await db.rpc("submit_vote", {
        p_device_id: getDeviceId(),
        p_selections: choices
      });
      if (error) {
        const message = `${error.message || ""} ${error.details || ""}`;
        if (message.includes("ALREADY_VOTED") || message.includes("duplicate")) {
          markVoted(choices);
          showFinal(choices);
          return;
        }
        if (message.includes("VOTING_CLOSED")) {
          showOnly(closedView);
          return;
        }
        throw error;
      }

      markVoted(choices);
      showFinal(choices);
    } catch (error) {
      console.error(error);
      showToast("Не удалось отправить голос. Попробуй ещё раз.", "error");
      submitButton.disabled = false;
      submitButton.querySelector("span").textContent = "Проголосовать";
    }
  }

  function showFinal(choices = []) {
    showOnly(finalView);
    const container = $("finalSelections");
    if (choices.length) {
      container.innerHTML = choices.map((name) => `<span>${escapeHtml(name)}</span>`).join("");
      container.closest(".final-section").classList.remove("hidden");
    } else {
      container.closest(".final-section").classList.add("hidden");
    }
    startCountdown();
    requestAnimationFrame(() => launchConfetti());
    window.lucide?.createIcons();
  }

  function launchConfetti() {
    if (!window.confetti || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const end = Date.now() + 1500;
    const colors = ["#ffd21c", "#ffbd00", "#ffffff", "#17150f"];
    (function frame() {
      window.confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: .66 }, colors });
      window.confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: .66 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  function startCountdown() {
    clearInterval(startCountdown.timer);
    const render = () => {
      const diff = Math.max(0, EVENT_DATE.getTime() - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      $("days").textContent = String(d).padStart(2, "0");
      $("hours").textContent = String(h).padStart(2, "0");
      $("minutes").textContent = String(m).padStart(2, "0");
      $("seconds").textContent = String(s).padStart(2, "0");
    };
    render();
    startCountdown.timer = setInterval(render, 1000);
  }

  async function getPublicState() {
    const { data, error } = await db.rpc("public_status");
    if (error) throw error;
    return data || { is_open: true };
  }

  async function remotelyVoted() {
    const { data, error } = await db.rpc("has_voted", { p_device_id: getDeviceId() });
    if (error) return false;
    return Boolean(data);
  }

  async function init() {
    renderSnacks();
    updateCounter();
    window.lucide?.createIcons();

    if (!db) {
      $("errorText").textContent = "Голосование ещё настраивается. Загляни сюда чуть позже.";
      showOnly(errorView);
      return;
    }

    if (isLocallyVoted()) {
      showFinal(savedSelection());
      return;
    }

    try {
      if (await remotelyVoted()) {
        markVoted([]);
        showFinal([]);
        return;
      }
      const state = await getPublicState();
      if (state?.is_open === false) showOnly(closedView);
      else showOnly(quizView);
    } catch (error) {
      console.error(error);
      $("errorText").textContent = "Сервис голосования временно недоступен. Обнови страницу через минуту.";
      showOnly(errorView);
    }
  }

  submitButton.addEventListener("click", submitVote);
  init();
})();
