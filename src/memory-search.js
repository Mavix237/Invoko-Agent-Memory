function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flattenMemories(categories) {
  const list = [];
  categories.forEach((cat, categoryIndex) => {
    cat.items.forEach((item, itemIndex) => {
      list.push({ item, categoryIndex, itemIndex, category: cat });
    });
  });
  return list;
}

function parseTimeQuery(q) {
  const lower = q.toLowerCase();
  const now = new Date();

  if (/today|just now/.test(lower)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (/yesterday/.test(lower)) {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (/this week|last 7|past week/.test(lower)) {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start, end: now };
  }
  if (/this month|last 30|past month/.test(lower)) {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end: now };
  }

  const monthMatch = lower.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/
  );
  if (monthMatch) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const key = monthMatch[1].slice(0, 3);
    const month = months[key];
    if (month !== undefined) {
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
  }

  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }

  return null;
}

function matchesTimeRange(item, range) {
  if (!range || !item.documentedAt) return true;
  const d = new Date(item.documentedAt);
  return d >= range.start && d <= range.end;
}

function scoreItem(item, category, tokens, timeRange) {
  if (timeRange && !matchesTimeRange(item, timeRange)) return 0;

  let score = 0;
  const hay = [
    item.title,
    item.summary,
    item.source,
    item.documentedLabel,
    item.documentedRelative,
    category.label,
    ...(item.tags || []),
    ...(item.conversation || []).map((m) => m.text),
  ]
    .join(" ")
    .toLowerCase();

  tokens.forEach((tok) => {
    if (tok.length < 2) return;
    if (item.title.toLowerCase().includes(tok)) score += 6;
    else if (hay.includes(tok)) score += 2;
  });

  if (timeRange && score === 0 && tokens.length === 0) score = 1;
  return score;
}

export function searchMemories(categories, query, activeFilter = null) {
  const q = query.trim().toLowerCase();
  const timeRange = parseTimeQuery(q);
  const tokens = q.split(/\s+/).filter(Boolean);
  const all = flattenMemories(categories);

  if (!q && !activeFilter) return [];

  return all
    .map((entry) => {
      let score = 0;

      if (activeFilter === "recent") {
        const d = new Date(entry.item.documentedAt);
        const days = (Date.now() - d) / 86400000;
        if (days <= 14) score += 3;
        else return { ...entry, score: 0 };
      } else if (activeFilter && entry.category.id !== activeFilter) {
        return { ...entry, score: 0 };
      }

      score += scoreItem(entry.item, entry.category, tokens, timeRange);
      return { ...entry, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function createMemorySearch(categories, { onSelect } = {}) {
  const root = document.createElement("div");
  root.className = "memory-search";
  root.innerHTML = `
    <div class="memory-search-inner">
      <div class="memory-search-anchor">
        <label class="memory-search-field">
          <svg class="memory-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="search"
            class="memory-search-input"
            placeholder="keyword, time, topic…"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <div class="memory-search-filters" role="group" aria-label="Search filters">
          <button type="button" class="memory-search-chip" data-filter="recent">recent</button>
          <button type="button" class="memory-search-chip" data-filter="now">now</button>
          <button type="button" class="memory-search-chip" data-filter="work">work</button>
          <button type="button" class="memory-search-chip" data-filter="life">life</button>
        </div>
      </div>
      <div class="memory-search-results-panel">
        <ul class="memory-search-results" role="listbox"></ul>
      </div>
    </div>
  `;

  const input = root.querySelector(".memory-search-input");
  const resultsPanel = root.querySelector(".memory-search-results-panel");
  const resultsEl = root.querySelector(".memory-search-results");
  const chips = root.querySelectorAll(".memory-search-chip");
  let activeFilter = null;
  let visible = false;
  let swapTimer = null;

  const RESULTS_MAX_H = 220;
  const SWAP_MS = 140;

  function measureResultsHeight() {
    return Math.min(resultsEl.scrollHeight, RESULTS_MAX_H);
  }

  function setPanelHeight(px) {
    resultsPanel.style.maxHeight = `${px}px`;
  }

  function buildResultMarkup(hits) {
    if (!hits.length) {
      return `<li class="memory-search-empty">no memories found</li>`;
    }

    return hits
      .map(
        ({ item, category }) => `
      <li>
        <button
          type="button"
          class="memory-search-result"
          data-id="${item.id}"
          data-category="${category.id}"
        >
          <span class="memory-search-result-title">${escapeHtml(item.title)}</span>
          <span class="memory-search-result-meta">${escapeHtml(category.label)} · ${escapeHtml(item.documentedLabel)}</span>
        </button>
      </li>
    `
      )
      .join("");
  }

  function bindResultClicks() {
    resultsEl.querySelectorAll(".memory-search-result").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cat = categories.find((c) => c.id === btn.dataset.category);
        const item = cat?.items.find((i) => i.id === btn.dataset.id);
        if (item && cat) onSelect?.({ item, category: cat });
      });
    });
  }

  function finishResultsUpdate(hits) {
    resultsEl.innerHTML = buildResultMarkup(hits);
    bindResultClicks();
    resultsEl.classList.add("has-results");
    resultsPanel.classList.add("open");

    requestAnimationFrame(() => {
      setPanelHeight(measureResultsHeight());
      requestAnimationFrame(() => {
        resultsEl.classList.remove("is-swapping");
      });
    });
  }

  function closeResultsPanel() {
    resultsEl.classList.add("is-swapping");
    resultsPanel.classList.remove("open");
    setPanelHeight(0);

    window.setTimeout(() => {
      resultsEl.innerHTML = "";
      resultsEl.classList.remove("has-results", "is-swapping");
    }, SWAP_MS + 280);
  }

  function renderResults() {
    const hasQuery = Boolean(input.value.trim() || activeFilter);

    if (!hasQuery) {
      if (swapTimer) window.clearTimeout(swapTimer);
      closeResultsPanel();
      return;
    }

    const hits = searchMemories(categories, input.value, activeFilter);
    resultsEl.classList.add("is-swapping");

    if (swapTimer) window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => {
      finishResultsUpdate(hits);
      swapTimer = null;
    }, SWAP_MS);
  }

  input.addEventListener("input", renderResults);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      activeFilter = null;
      chips.forEach((c) => c.classList.remove("active"));
      renderResults();
      input.blur();
    }
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      const f = chip.dataset.filter;
      if (activeFilter === f) {
        activeFilter = null;
        chip.classList.remove("active");
      } else {
        activeFilter = f;
        chips.forEach((c) => c.classList.toggle("active", c.dataset.filter === f));
      }
      renderResults();
      input.focus();
    });
  });

  return {
    el: root,
    setVisible(show) {
      visible = show;
      root.classList.toggle("visible", show);
      if (!show) {
        input.value = "";
        activeFilter = null;
        chips.forEach((c) => c.classList.remove("active"));
        if (swapTimer) window.clearTimeout(swapTimer);
        resultsPanel.classList.remove("open");
        setPanelHeight(0);
        resultsEl.innerHTML = "";
        resultsEl.classList.remove("has-results", "is-swapping");
      }
    },
    isVisible: () => visible,
    focus() {
      root.classList.add("visible");
      visible = true;
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    },
  };
}
