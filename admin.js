(() => {
  const config = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const login = $("adminLogin");
  const dashboard = $("adminDashboard");
  const form = $("loginForm");
  const passwordInput = $("adminPassword");
  const loginButton = $("loginButton");
  const toast = $("toast");

  const hasBackend = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase);
  const db = hasBackend ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  let adminPassword = sessionStorage.getItem("menu_admin_password") || "";
  let votingOpen = true;
  let refreshTimer = null;
  let latestResults = [];
  let copyResetTimer = null;
  let copySecondTimer = null;

  function showToast(message, type = "") {
    toast.textContent = message;
    toast.className = `toast show ${type}`.trim();
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.className = "toast"; }, 2600);
  }

  function showDashboard() {
    login.classList.add("hidden");
    dashboard.classList.remove("hidden");
    window.lucide?.createIcons();
    loadData();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(loadData, 15000);
  }

  function showLogin() {
    dashboard.classList.add("hidden");
    login.classList.remove("hidden");
    clearInterval(refreshTimer);
    window.lucide?.createIcons();
  }

  async function validatePassword(password) {
    if (!db) throw new Error("BACKEND_NOT_CONFIGURED");
    const { data, error } = await db.rpc("admin_login", { p_password: password });
    if (error) throw error;
    if (!data) throw new Error("INVALID_PASSWORD");
    return true;
  }

  async function loadData() {
    if (!db || !adminPassword) return;
    try {
      const [{ data: summary, error: summaryError }, { data: results, error: resultsError }] = await Promise.all([
        db.rpc("admin_summary", { p_password: adminPassword }),
        db.rpc("admin_results", { p_password: adminPassword })
      ]);
      if (summaryError) throw summaryError;
      if (resultsError) throw resultsError;

      const stats = summary || {};
      latestResults = Array.isArray(results) ? results : [];
      votingOpen = stats.is_open !== false;
      $("participantsMetric").textContent = stats.participants ?? 0;
      $("selectionsMetric").textContent = stats.total_selections ?? 0;
      $("averageMetric").textContent = Number(stats.average_selections ?? 0).toFixed(1).replace(".0", "");
      $("positionsMetric").textContent = latestResults.length;
      updateStatus();
      renderResults(latestResults);
      $("updatedAt").textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      console.error(error);
      if (/ADMIN_ONLY|INVALID_PASSWORD/i.test(error?.message || "")) {
        adminPassword = "";
        sessionStorage.removeItem("menu_admin_password");
        showLogin();
        showToast("Нужно войти снова", "error");
      } else {
        showToast("Не удалось обновить результаты", "error");
      }
    }
  }

  function updateStatus() {
    const status = $("votingStatus");
    const button = $("toggleVoting");
    status.textContent = votingOpen ? "Открыто" : "Закрыто";
    status.classList.toggle("open", votingOpen);
    button.classList.toggle("danger", votingOpen);
    button.innerHTML = votingOpen
      ? '<i data-lucide="lock"></i><span>Закрыть голосование</span>'
      : '<i data-lucide="lock-open"></i><span>Открыть голосование</span>';
    window.lucide?.createIcons();
  }

  function sortedResults(rows) {
    return [...rows].sort((a, b) => Number(b.votes) - Number(a.votes) || String(a.snack_name).localeCompare(String(b.snack_name), "ru"));
  }

  function renderResults(rows) {
    const sorted = sortedResults(rows);
    const maxVotes = Math.max(1, ...sorted.map((row) => Number(row.votes || 0)));
    $("topResults").innerHTML = buildList(sorted.slice(0, 10), maxVotes, true);
    $("allResults").innerHTML = buildList(sorted, maxVotes, false);
  }

  function buildList(rows, maxVotes, medals) {
    if (!rows.length) return '<div class="admin-empty">Пока никто не проголосовал</div>';
    return rows.map((row, index) => {
      const rank = medals && index < 3 ? ["🥇", "🥈", "🥉"][index] : String(index + 1).padStart(2, "0");
      const votes = Number(row.votes || 0);
      const width = Math.max(3, Math.round((votes / maxVotes) * 100));
      return `
        <div class="result-row">
          <span class="result-rank">${rank}</span>
          <div class="result-main">
            <div class="result-name"><span>${escapeHtml(row.snack_name)}</span></div>
            <div class="result-bar"><span style="width:${width}%"></span></div>
          </div>
          <strong class="result-votes">${votes}</strong>
        </div>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'\"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[char]));
  }

  function formatVotes(count) {
    const n = Math.abs(Number(count)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return "голосов";
    if (n1 > 1 && n1 < 5) return "голоса";
    if (n1 === 1) return "голос";
    return "голосов";
  }

  function buildTop10Message() {
    const top = sortedResults(latestResults).slice(0, 10);
    if (!top.length) return "";

    const lines = top.map((row, index) => {
      const votes = Number(row.votes || 0);
      return `${index + 1}. ${row.snack_name} — ${votes} ${formatVotes(votes)}`;
    });

    return [
      "🏆 ТОП-10 закусок на наш корпоратив",
      "",
      ...lines,
      "",
      "Спасибо всем, кто проголосовал! 🥂"
    ].join("\n");
  }

  function legacyCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.cssText = [
      "position:fixed",
      "top:1px",
      "left:1px",
      "width:2px",
      "height:2px",
      "padding:0",
      "border:0",
      "outline:0",
      "font-size:16px",
      "opacity:.01",
      "z-index:2147483647"
    ].join(";");
    document.body.appendChild(area);

    try {
      area.focus();
      area.select();
      area.setSelectionRange(0, area.value.length);
      const copied = document.execCommand("copy");
      area.remove();
      return Boolean(copied);
    } catch (error) {
      console.warn("Legacy copy failed", error);
      area.remove();
      return false;
    }
  }

  function resetCopyButton() {
    const button = $("copyTop10");
    if (!button) return;
    clearTimeout(copyResetTimer);
    clearInterval(copySecondTimer);
    button.disabled = false;
    button.classList.remove("copied");
    button.innerHTML = '<i data-lucide="copy"></i><span>Скопировать ТОП-10</span>';
    window.lucide?.createIcons();
  }

  function showCopySuccess() {
    const button = $("copyTop10");
    if (!button) return;

    clearTimeout(copyResetTimer);
    clearInterval(copySecondTimer);
    button.disabled = true;
    button.classList.add("copied");
    button.innerHTML = `
      <span class="copy-check" aria-hidden="true">✓</span>
      <span>Скопировано</span>
      <span class="copy-timer" aria-hidden="true">
        <svg viewBox="0 0 28 28">
          <circle class="copy-timer-track" cx="14" cy="14" r="11"></circle>
          <circle class="copy-timer-progress" cx="14" cy="14" r="11"></circle>
        </svg>
        <span class="copy-seconds">3</span>
      </span>`;

    let seconds = 3;
    copySecondTimer = setInterval(() => {
      seconds -= 1;
      const label = button.querySelector(".copy-seconds");
      if (label && seconds > 0) label.textContent = String(seconds);
    }, 1000);

    copyResetTimer = setTimeout(resetCopyButton, 3000);
  }

  function openManualCopy(message) {
    const area = document.createElement("textarea");
    area.value = message;
    area.readOnly = true;
    area.style.cssText = [
      "position:fixed",
      "inset:16px",
      "z-index:2147483647",
      "width:calc(100% - 32px)",
      "height:45vh",
      "padding:18px",
      "border:2px solid #20b15a",
      "border-radius:18px",
      "background:#fff",
      "color:#17150f",
      "font:600 16px/1.5 Manrope,system-ui,sans-serif",
      "box-shadow:0 24px 80px rgba(0,0,0,.28)"
    ].join(";");
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    showToast("Не удалось скопировать автоматически — текст выделен. Нажми «Копировать» в меню iPhone.", "error");
    setTimeout(() => {
      const remove = () => area.remove();
      area.addEventListener("blur", remove, { once: true });
    }, 400);
  }

  function copyTop10() {
    const message = buildTop10Message();
    if (!message) {
      showToast("Пока нет результатов для копирования", "error");
      return;
    }

    // iPhone/Safari чаще всего разрешает execCommand только пока мы всё ещё
    // находимся непосредственно внутри клика пользователя. Поэтому пробуем его первым.
    if (legacyCopy(message)) {
      showCopySuccess();
      return;
    }

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(message)
        .then(() => showCopySuccess())
        .catch((error) => {
          console.warn("Clipboard API failed", error);
          openManualCopy(message);
        });
      return;
    }

    openManualCopy(message);
  }

  async function toggleVoting() {
    if (!db || !adminPassword) return;
    const button = $("toggleVoting");
    button.disabled = true;
    try {
      const nextState = !votingOpen;
      const { error } = await db.rpc("set_voting_state", { p_password: adminPassword, p_is_open: nextState });
      if (error) throw error;
      votingOpen = nextState;
      updateStatus();
      showToast(votingOpen ? "Голосование открыто" : "Голосование закрыто");
      await loadData();
    } catch (error) {
      console.error(error);
      showToast("Не удалось изменить статус", "error");
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.querySelector("span").textContent = "Проверяем…";
    try {
      const password = passwordInput.value;
      await validatePassword(password);
      adminPassword = password;
      sessionStorage.setItem("menu_admin_password", password);
      passwordInput.value = "";
      showDashboard();
    } catch (error) {
      console.error(error);
      const message = error?.message === "BACKEND_NOT_CONFIGURED"
        ? "База ещё не подключена"
        : "Неверный пароль";
      showToast(message, "error");
    } finally {
      loginButton.disabled = false;
      loginButton.querySelector("span").textContent = "Войти";
    }
  });

  $("logoutButton").addEventListener("click", () => {
    adminPassword = "";
    sessionStorage.removeItem("menu_admin_password");
    showLogin();
  });
  $("refreshResults").addEventListener("click", loadData);
  $("toggleVoting").addEventListener("click", toggleVoting);
  $("copyTop10").addEventListener("click", copyTop10);

  async function init() {
    window.lucide?.createIcons();
    if (!db || !adminPassword) {
      showLogin();
      return;
    }
    try {
      await validatePassword(adminPassword);
      showDashboard();
    } catch {
      adminPassword = "";
      sessionStorage.removeItem("menu_admin_password");
      showLogin();
    }
  }

  init();
})();
