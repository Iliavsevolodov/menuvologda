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
  let votingOpen = true;
  let refreshTimer = null;

  function showToast(message, type = "") {
    toast.textContent = message;
    toast.className = `toast show ${type}`.trim();
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.className = "toast"; }, 2400);
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

  async function signIn(password) {
    if (!db) throw new Error("BACKEND_NOT_CONFIGURED");
    const { error } = await db.auth.signInWithPassword({
      email: config.ADMIN_EMAIL,
      password
    });
    if (error) throw error;
  }

  async function loadData() {
    if (!db) return;
    try {
      const [{ data: summary, error: summaryError }, { data: results, error: resultsError }] = await Promise.all([
        db.rpc("admin_summary"),
        db.rpc("admin_results")
      ]);
      if (summaryError) throw summaryError;
      if (resultsError) throw resultsError;

      const stats = summary || {};
      votingOpen = stats.is_open !== false;
      $("participantsMetric").textContent = stats.participants ?? 0;
      $("selectionsMetric").textContent = stats.total_selections ?? 0;
      $("averageMetric").textContent = Number(stats.average_selections ?? 0).toFixed(1).replace(".0", "");
      $("positionsMetric").textContent = (results || []).length;
      updateStatus();
      renderResults(results || []);
      $("updatedAt").textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      console.error(error);
      if (/JWT|session|Unauthorized|ADMIN_ONLY/i.test(error?.message || "")) {
        await db.auth.signOut();
        showLogin();
        showToast("Сессия завершена. Войди снова.", "error");
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

  function renderResults(rows) {
    const sorted = [...rows].sort((a, b) => Number(b.votes) - Number(a.votes) || String(a.snack_name).localeCompare(String(b.snack_name), "ru"));
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
    return String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  }

  async function toggleVoting() {
    if (!db) return;
    const button = $("toggleVoting");
    button.disabled = true;
    try {
      const nextState = !votingOpen;
      const { error } = await db.rpc("set_voting_state", { p_is_open: nextState });
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
      await signIn(passwordInput.value);
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

  $("logoutButton").addEventListener("click", async () => {
    await db?.auth.signOut();
    showLogin();
  });
  $("refreshResults").addEventListener("click", loadData);
  $("toggleVoting").addEventListener("click", toggleVoting);

  async function init() {
    window.lucide?.createIcons();
    if (!db) {
      showLogin();
      return;
    }
    const { data } = await db.auth.getSession();
    if (data?.session) showDashboard();
    else showLogin();
  }

  init();
})();
