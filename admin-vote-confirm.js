(() => {
  const button = document.getElementById("toggleVoting");
  const status = document.getElementById("votingStatus");
  if (!button || !status) return;

  let bypassCloseConfirmation = false;

  const modal = document.createElement("div");
  modal.className = "vote-confirm-backdrop";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="vote-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="voteConfirmTitle" aria-describedby="voteConfirmText">
      <div class="vote-confirm-icon"><i data-lucide="triangle-alert"></i></div>
      <h3 id="voteConfirmTitle">Закрыть голосование?</h3>
      <p id="voteConfirmText">После подтверждения участники больше не смогут отправлять новые голоса.</p>
      <div class="vote-confirm-note">
        <i data-lucide="info"></i>
        <span>Все уже собранные результаты сохранятся. При необходимости ты сможешь снова открыть голосование кнопкой «Вернуть голосование».</span>
      </div>
      <div class="vote-confirm-actions">
        <button type="button" class="vote-confirm-cancel">Отмена</button>
        <button type="button" class="vote-confirm-submit">Да, закрыть</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const cancelButton = modal.querySelector(".vote-confirm-cancel");
  const confirmButton = modal.querySelector(".vote-confirm-submit");

  function isVotingOpen() {
    return status.textContent.trim() === "Открыто";
  }

  function syncVotingButton() {
    if (isVotingOpen()) {
      button.classList.remove("reopen-voting");
      if (!button.querySelector("span") || button.querySelector("span").textContent !== "Закрыть голосование") {
        button.innerHTML = '<i data-lucide="lock"></i><span>Закрыть голосование</span>';
      }
    } else if (status.textContent.trim() === "Закрыто") {
      button.classList.remove("danger");
      button.classList.add("reopen-voting");
      button.innerHTML = '<i data-lucide="rotate-ccw"></i><span>Вернуть голосование</span>';
    }
    window.lucide?.createIcons();
  }

  function openModal() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => cancelButton.focus(), 30);
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setTimeout(() => button.focus(), 30);
  }

  button.addEventListener("click", (event) => {
    if (bypassCloseConfirmation) {
      bypassCloseConfirmation = false;
      return;
    }

    if (isVotingOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openModal();
    }
  }, true);

  confirmButton.addEventListener("click", () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Закрываем…";
    bypassCloseConfirmation = true;
    closeModal();
    button.click();
    setTimeout(() => {
      confirmButton.disabled = false;
      confirmButton.textContent = "Да, закрыть";
    }, 700);
  });

  cancelButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
  });

  const observer = new MutationObserver(syncVotingButton);
  observer.observe(status, { childList: true, subtree: true, characterData: true, attributes: true });

  syncVotingButton();
  setTimeout(syncVotingButton, 250);
  window.lucide?.createIcons();
})();
