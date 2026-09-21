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
  let latestAnalytics = {};
  let currentParticipants = 0;
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
      const [
        { data: summary, error: summaryError },
        { data: results, error: resultsError },
        { data: analytics, error: analyticsError }
      ] = await Promise.all([
        db.rpc("admin_summary", { p_password: adminPassword }),
        db.rpc("admin_results", { p_password: adminPassword }),
        db.rpc("admin_analytics", { p_password: adminPassword })
      ]);

      if (summaryError) throw summaryError;
      if (resultsError) throw resultsError;
      if (analyticsError) throw analyticsError;

      const stats = summary || {};
      latestResults = Array.isArray(results) ? results : [];
      latestAnalytics = analytics || {};
      currentParticipants = Number(stats.participants || 0);
      votingOpen = stats.is_open !== false;

      $("participantsMetric").textContent = currentParticipants;
      $("selectionsMetric").textContent = Number(stats.total_selections || 0);
      $("averageMetric").textContent = Number(stats.average_selections || 0).toFixed(1).replace(".0", "");
      $("positionsMetric").textContent = latestResults.length;

      updateStatus();
      renderResults(latestResults);
      renderActivity(latestAnalytics);
      renderCategories(latestResults);
      renderBoundary(latestResults);
      renderLowResults(latestResults);
      renderInsights(stats, latestAnalytics, latestResults);

      $("updatedAt").textContent = `Обновлено ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
      window.lucide?.createIcons();
    } catch (error) {
      console.error(error);
      if (/ADMIN_ONLY|INVALID_PASSWORD/i.test(error?.message || "")) {
        adminPassword = "";
        sessionStorage.removeItem("menu_admin_password");
        showLogin();
        showToast("Нужно войти снова", "error");
      } else {
        showToast("Не удалось обновить аналитику", "error");
      }
    }
  }

  function updateStatus() {
    const status = $("votingStatus");
    const button = $("toggleVoting");
    status.textContent = votingOpen ? "Открыто" : "Закрыто";
    status.classList.toggle("open", votingOpen);
    button.classList.toggle("danger", votingOpen);
    button.classList.toggle("reopen-voting", !votingOpen);
    button.innerHTML = votingOpen
      ? '<i data-lucide="lock"></i><span>Закрыть голосование</span>'
      : '<i data-lucide="rotate-ccw"></i><span>Вернуть голосование</span>';
    window.lucide?.createIcons();
  }

  function sortedResults(rows) {
    return [...rows].sort((a, b) => Number(b.votes) - Number(a.votes) || String(a.snack_name).localeCompare(String(b.snack_name), "ru"));
  }

  function supportPercent(votes, participants = currentParticipants) {
    if (!participants) return 0;
    return Math.round((Number(votes || 0) / participants) * 100);
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
      const width = Math.max(votes ? 3 : 0, Math.round((votes / maxVotes) * 100));
      const support = supportPercent(votes);
      return `
        <div class="result-row">
          <span class="result-rank">${rank}</span>
          <div class="result-main">
            <div class="result-name">
              <span>${escapeHtml(row.snack_name)}</span>
              <small>${support}% участников</small>
            </div>
            <div class="result-bar"><span style="width:${width}%"></span></div>
          </div>
          <div class="result-score"><strong>${votes}</strong><small>${formatVotes(votes)}</small></div>
        </div>`;
    }).join("");
  }

  function renderActivity(analytics) {
    const min = Number(analytics.min_selections || 0);
    const max = Number(analytics.max_selections || 0);
    const median = Number(analytics.median_selections || 0);
    const full = Number(analytics.full_ten_count || 0);
    const below = Number(analytics.below_ten_count || 0);
    const distribution = analytics.selection_distribution || {};

    $("minSelections").textContent = currentParticipants ? min : "—";
    $("medianSelections").textContent = currentParticipants ? formatNumber(median) : "—";
    $("maxSelections").textContent = currentParticipants ? max : "—";
    $("fullTenCount").textContent = full;
    $("belowTenCount").textContent = below;

    const maxCount = Math.max(1, ...Array.from({ length: 10 }, (_, i) => Number(distribution[String(i + 1)] || 0)));
    const rows = Array.from({ length: 10 }, (_, i) => i + 1).map((count) => {
      const people = Number(distribution[String(count)] || 0);
      const width = Math.round((people / maxCount) * 100);
      return `
        <div class="distribution-row ${people ? "has-data" : ""}">
          <span>${count}/10</span>
          <div class="distribution-bar"><span style="width:${width}%"></span></div>
          <strong>${people}</strong>
        </div>`;
    }).join("");

    const lastVote = analytics.latest_vote_at
      ? `<div class="analytics-footnote"><i data-lucide="clock-3"></i><span>Последний голос: ${formatDateTime(analytics.latest_vote_at)}</span></div>`
      : "";

    $("selectionDistribution").innerHTML = rows + lastVote;
  }

  function categoryFor(name) {
    const n = String(name).toLowerCase();
    if (n.includes("бутерброд")) return "Бутерброды";
    if (n.includes("тарталет") || n.includes("жульен")) return "Тарталетки";
    if (n.includes("рулетик")) return "Рулетики";
    if (n.includes("ассорти") || n.includes("тарелка")) return "Ассорти и тарелки";
    if (n.includes("канапе")) return "Канапе";
    return "Горячие и порционные";
  }

  function renderCategories(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const category = categoryFor(row.snack_name);
      const item = map.get(category) || { name: category, votes: 0, items: 0 };
      item.votes += Number(row.votes || 0);
      item.items += 1;
      map.set(category, item);
    });

    const categories = [...map.values()].map((item) => ({
      ...item,
      support: currentParticipants && item.items
        ? Math.round((item.votes / (currentParticipants * item.items)) * 100)
        : 0
    })).sort((a, b) => b.support - a.support || b.votes - a.votes);

    const maxSupport = Math.max(1, ...categories.map((item) => item.support));
    $("categoryResults").innerHTML = categories.map((item, index) => `
      <div class="category-row">
        <div class="category-topline">
          <div><span class="category-rank">${index + 1}</span><strong>${escapeHtml(item.name)}</strong></div>
          <span>${item.support}%</span>
        </div>
        <div class="category-bar"><span style="width:${Math.round(item.support / maxSupport * 100)}%"></span></div>
        <small>${item.votes} ${formatVotes(item.votes)} · ${item.items} ${formatPositions(item.items)}</small>
      </div>`).join("");
  }

  function renderBoundary(rows) {
    const sorted = sortedResults(rows);
    if (sorted.length < 11) {
      $("boundarySummary").textContent = "Для анализа границы нужно минимум 11 вариантов.";
      $("boundaryResults").innerHTML = "";
      return;
    }

    const tenth = sorted[9];
    const eleventh = sorted[10];
    const cutoff = Number(tenth.votes || 0);
    const next = Number(eleventh.votes || 0);
    const gap = cutoff - next;

    $("boundarySummary").textContent = gap === 0
      ? `На границе ничья: 10-е и 11-е места сейчас имеют по ${cutoff} ${formatVotes(cutoff)}.`
      : `Чтобы догнать текущее 10-е место, ближайшей позиции ${gap === 1 ? "не хватает 1 голоса" : `не хватает ${gap} ${formatVotes(gap)}`}.`;

    const inside = sorted.slice(7, 10).map((row, idx) => ({ ...row, place: idx + 8, side: "inside" }));
    const outside = sorted.slice(10, 13).map((row, idx) => ({ ...row, place: idx + 11, side: "outside" }));

    $("boundaryResults").innerHTML = [
      '<div class="boundary-label in">Сейчас входят</div>',
      ...inside.map(boundaryRow),
      '<div class="boundary-divider"><span>граница ТОП-10</span></div>',
      '<div class="boundary-label out">Следом</div>',
      ...outside.map(boundaryRow)
    ].join("");
  }

  function boundaryRow(row) {
    const votes = Number(row.votes || 0);
    return `
      <div class="boundary-row ${row.side}">
        <span class="boundary-place">${row.place}</span>
        <div><strong>${escapeHtml(row.snack_name)}</strong><small>${supportPercent(votes)}% участников</small></div>
        <b>${votes}</b>
      </div>`;
  }

  function renderLowResults(rows) {
    const low = [...rows]
      .sort((a, b) => Number(a.votes) - Number(b.votes) || String(a.snack_name).localeCompare(String(b.snack_name), "ru"))
      .slice(0, 5);

    $("lowResults").innerHTML = low.map((row) => {
      const votes = Number(row.votes || 0);
      return `
        <div class="low-row">
          <div><strong>${escapeHtml(row.snack_name)}</strong><small>${supportPercent(votes)}% участников</small></div>
          <span class="low-score ${votes === 0 ? "zero" : ""}">${votes} ${formatVotes(votes)}</span>
        </div>`;
    }).join("");
  }

  function renderInsights(stats, analytics, rows) {
    if (!currentParticipants) {
      $("insightText").innerHTML = '<p>Пока нет голосов. Как только появится первый участник, здесь автоматически появятся выводы по результатам.</p>';
      return;
    }

    const sorted = sortedResults(rows);
    const leader = sorted[0];
    const fullTen = Number(analytics.full_ten_count || 0);
    const fullShare = Math.round((fullTen / currentParticipants) * 100);
    const average = Number(stats.average_selections || 0).toFixed(1).replace(".0", "");
    const leaderVotes = Number(leader?.votes || 0);
    const tenth = sorted[9];
    const eleventh = sorted[10];
    const gap = tenth && eleventh ? Number(tenth.votes || 0) - Number(eleventh.votes || 0) : 0;

    const activityText = fullShare >= 70
      ? `${fullTen} из ${currentParticipants} участников выбрали все 10 возможных позиций.`
      : `В среднем участник выбирает ${average} из 10 возможных позиций.`;

    const leaderText = leaderVotes > 0
      ? `Сейчас лидирует «${escapeHtml(leader.snack_name)}»: ${leaderVotes} ${formatVotes(leaderVotes)}, это ${supportPercent(leaderVotes)}% участников.`
      : "Явного лидера пока нет.";

    const boundaryText = tenth && eleventh
      ? gap === 0
        ? "На границе ТОП-10 сейчас ничья — следующие голоса могут заметно поменять состав десятки."
        : `Между 10-м и 11-м местом разница ${gap} ${formatVotes(gap)}.`
      : "";

    $("insightText").innerHTML = `
      <p><strong>${currentParticipants}</strong> ${formatPeople(currentParticipants)} уже проголосовали. ${activityText}</p>
      <p>${leaderText}</p>
      ${boundaryText ? `<p>${boundaryText}</p>` : ""}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'\"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[char]));
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".0", "");
  }

  function formatVotes(count) {
    const n = Math.abs(Number(count)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return "голосов";
    if (n1 > 1 && n1 < 5) return "голоса";
    if (n1 === 1) return "голос";
    return "голосов";
  }

  function formatPeople(count) {
    const n = Math.abs(Number(count)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return "человек";
    if (n1 === 1) return "человек";
    return "человек";
  }

  function formatPositions(count) {
    const n = Math.abs(Number(count)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return "позиций";
    if (n1 === 1) return "позиция";
    if (n1 > 1 && n1 < 5) return "позиции";
    return "позиций";
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function buildTop10Message() {
    const top = sortedResults(latestResults).slice(0, 10);
    if (!top.length || !currentParticipants) return "";
    const lines = top.map((row, index) => {
      const votes = Number(row.votes || 0);
      return `${index + 1}. ${row.snack_name} — ${votes} ${formatVotes(votes)} (${supportPercent(votes)}%)`;
    });
    return [
      "🏆 ТОП-10 закусок на наш корпоратив",
      `Проголосовало: ${currentParticipants} человек`,
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
    area.style.cssText = "position:fixed;top:1px;left:1px;width:2px;height:2px;padding:0;border:0;outline:0;font-size:16px;opacity:.01;z-index:2147483647";
    document.body.appendChild(area);
    try {
      area.focus(); area.select(); area.setSelectionRange(0, area.value.length);
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
        <svg viewBox="0 0 28 28"><circle class="copy-timer-track" cx="14" cy="14" r="11"></circle><circle class="copy-timer-progress" cx="14" cy="14" r="11"></circle></svg>
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
    area.style.cssText = "position:fixed;inset:16px;z-index:2147483647;width:calc(100% - 32px);height:45vh;padding:18px;border:2px solid #20b15a;border-radius:18px;background:#fff;color:#17150f;font:600 16px/1.5 Manrope,system-ui,sans-serif;box-shadow:0 24px 80px rgba(0,0,0,.28)";
    document.body.appendChild(area);
    area.focus(); area.select(); area.setSelectionRange(0, area.value.length);
    showToast("Текст выделен — нажми «Копировать» в меню iPhone", "error");
    setTimeout(() => area.addEventListener("blur", () => area.remove(), { once: true }), 400);
  }

  function copyTop10() {
    const message = buildTop10Message();
    if (!message) {
      showToast("Пока нет результатов для копирования", "error");
      return;
    }
    if (legacyCopy(message)) { showCopySuccess(); return; }
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(message).then(showCopySuccess).catch(() => openManualCopy(message));
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
      showToast(votingOpen ? "Голосование снова открыто" : "Голосование закрыто");
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
      showToast(error?.message === "BACKEND_NOT_CONFIGURED" ? "База ещё не подключена" : "Неверный пароль", "error");
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
    if (!db || !adminPassword) { showLogin(); return; }
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
