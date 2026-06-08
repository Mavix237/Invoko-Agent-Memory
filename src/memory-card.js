import { assetUrl } from "./paths.js";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createMemoryCard({ onClose, onConnectionClick } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "memory-card-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const panel = document.createElement("aside");
  panel.className = "memory-card";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "memory-card-title");
  panel.setAttribute("aria-hidden", "true");

  panel.innerHTML = `
    <header class="memory-card-header">
      <div class="memory-card-heading">
        <img class="memory-card-star" src="${assetUrl("assets/star.png")}" alt="" draggable="false" />
        <div>
          <h2 class="memory-card-title" id="memory-card-title"></h2>
          <p class="memory-card-meta"></p>
        </div>
      </div>
      <button type="button" class="memory-card-close" aria-label="Close memory detail">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </header>
    <div class="memory-card-body">
      <section class="memory-card-section">
        <h3 class="memory-card-label">summary</h3>
        <p class="memory-card-summary"></p>
      </section>
      <section class="memory-card-section">
        <h3 class="memory-card-label">conversation</h3>
        <div class="memory-card-conversation"></div>
      </section>
      <section class="memory-card-section">
        <h3 class="memory-card-label">connected memories</h3>
        <ul class="memory-card-connections"></ul>
      </section>
      <footer class="memory-card-footer"></footer>
    </div>
  `;

  document.body.append(backdrop, panel);

  const titleEl = panel.querySelector(".memory-card-title");
  const metaEl = panel.querySelector(".memory-card-meta");
  const summaryEl = panel.querySelector(".memory-card-summary");
  const conversationEl = panel.querySelector(".memory-card-conversation");
  const connectionsEl = panel.querySelector(".memory-card-connections");
  const footerEl = panel.querySelector(".memory-card-footer");
  const closeBtn = panel.querySelector(".memory-card-close");

  let open = false;
  let currentDetail = null;

  function renderConversation(messages) {
    conversationEl.innerHTML = messages
      .map(
        (msg) => `
      <div class="memory-card-msg memory-card-msg--${msg.role}">
        <span class="memory-card-msg-role">${msg.role === "user" ? "you" : "agent"}</span>
        <p>${escapeHtml(msg.text)}</p>
      </div>
    `
      )
      .join("");
  }

  function renderConnections(connections) {
    if (!connections.length) {
      connectionsEl.innerHTML =
        '<li class="memory-card-connection memory-card-connection--empty">no linked memories yet</li>';
      return;
    }

    connectionsEl.innerHTML = connections
      .map(
        (conn) => `
      <li>
        <button
          type="button"
          class="memory-card-connection"
          data-id="${escapeHtml(conn.id)}"
          data-category="${escapeHtml(conn.categoryId)}"
        >
          <span class="memory-card-connection-title">${escapeHtml(conn.title)}</span>
          <span class="memory-card-connection-meta">${escapeHtml(conn.categoryLabel)} · ${escapeHtml(conn.relation)}</span>
        </button>
      </li>
    `
      )
      .join("");

    connectionsEl.querySelectorAll(".memory-card-connection[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        onConnectionClick?.({
          id: btn.dataset.id,
          categoryId: btn.dataset.category,
        });
      });
    });
  }

  function openCard(detail) {
    if (!detail) return;
    currentDetail = detail;
    open = true;

    titleEl.textContent = detail.title;
    metaEl.textContent = `${detail.categoryLabel} · documented ${detail.documentedLabel}`;
    summaryEl.textContent = detail.summary;
    renderConversation(detail.conversation);
    renderConnections(detail.connections);
    footerEl.innerHTML = `
      <span>source: ${escapeHtml(detail.source)}</span>
      <span>last referenced ${escapeHtml(detail.lastReferenced)}</span>
      <span>strength ${detail.strength}%</span>
    `;

    backdrop.setAttribute("aria-hidden", "false");
    panel.setAttribute("aria-hidden", "false");
    backdrop.classList.add("visible");
    panel.classList.add("visible");

    requestAnimationFrame(() => closeBtn.focus());
  }

  function closeCard() {
    if (!open) return;
    open = false;
    currentDetail = null;

    backdrop.classList.remove("visible");
    panel.classList.remove("visible");

    const done = () => {
      backdrop.setAttribute("aria-hidden", "true");
      panel.setAttribute("aria-hidden", "true");
    };

    panel.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 450);
    onClose?.();
  }

  closeBtn.addEventListener("click", closeCard);
  backdrop.addEventListener("click", closeCard);

  return {
    open: openCard,
    close: closeCard,
    isOpen: () => open,
    getCurrent: () => currentDetail,
    destroy() {
      backdrop.remove();
      panel.remove();
    },
  };
}
