(() => {
  const button = document.getElementById("copyTop10");
  const topResults = document.getElementById("topResults");
  if (!button || !topResults) return;

  let resetTimer = null;
  let secondTimer = null;

  function buildSimpleTop10() {
    const names = [...topResults.querySelectorAll(".result-name > span")]
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .slice(0, 10);

    return names.map((name, index) => `${index + 1}. ${name}`).join("\n");
  }

  function legacyCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:1px;left:1px;width:2px;height:2px;padding:0;border:0;opacity:.01;font-size:16px;z-index:2147483647";
    document.body.appendChild(area);
    try {
      area.focus();
      area.select();
      area.setSelectionRange(0, area.value.length);
      const copied = document.execCommand("copy");
      area.remove();
      return Boolean(copied);
    } catch (error) {
      area.remove();
      return false;
    }
  }

  function resetButton() {
    clearTimeout(resetTimer);
    clearInterval(secondTimer);
    button.disabled = false;
    button.classList.remove("copied");
    button.innerHTML = '<i data-lucide="copy"></i><span>Скопировать ТОП-10</span>';
    window.lucide?.createIcons();
  }

  function showSuccess() {
    clearTimeout(resetTimer);
    clearInterval(secondTimer);
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
    secondTimer = setInterval(() => {
      seconds -= 1;
      const label = button.querySelector(".copy-seconds");
      if (label && seconds > 0) label.textContent = String(seconds);
    }, 1000);

    resetTimer = setTimeout(resetButton, 3000);
  }

  function manualCopy(text) {
    window.prompt("Скопируй список:", text);
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const message = buildSimpleTop10();
    if (!message) return;

    if (legacyCopy(message)) {
      showSuccess();
      return;
    }

    if (navigator.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(message)
        .then(showSuccess)
        .catch(() => manualCopy(message));
      return;
    }

    manualCopy(message);
  }, true);
})();
