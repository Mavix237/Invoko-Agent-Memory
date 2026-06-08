import * as THREE from "three";
import { getNodeOffset } from "./memory-graph.js";
import { assetUrl } from "./paths.js";

const projectVec = new THREE.Vector3();

const TEXTURE_URLS = [
  assetUrl("ellipses/ellipse-8.png"),
  assetUrl("ellipses/ellipse-9.png"),
  assetUrl("ellipses/ellipse-10.png"),
  assetUrl("ellipses/ellipse-11.png"),
  assetUrl("ellipses/ellipse-12.png"),
];

const SIZE_BY_SCALE = (scale) => `clamp(${36 + scale * 52}px, ${5 + scale * 7}vw, ${64 + scale * 56}px)`;
const ITEM_TEXT_SCREEN_GAP = 24;

export function createMemoryUI(categories, { onItemClick } = {}) {
  const root = document.getElementById("memory-ui");
  if (!root) return null;

  const dotsLayer = root.querySelector(".category-dots");
  const categoryLayer = root.querySelector(".category-labels");
  const itemLayer = root.querySelector(".memory-items");
  if (!dotsLayer || !categoryLayer || !itemLayer) return null;

  const dotEls = categories.map((cat) => {
    const wrap = document.createElement("span");
    wrap.className = "category-dot-wrap";
    wrap.dataset.index = String(cat.index);
    wrap.style.setProperty("--dot-size", SIZE_BY_SCALE(cat.scale));

    const img = document.createElement("img");
    img.className = "category-dot";
    img.src = TEXTURE_URLS[cat.texture % TEXTURE_URLS.length];
    img.alt = "";
    img.draggable = false;

    wrap.appendChild(img);
    dotsLayer.appendChild(wrap);
    return wrap;
  });

  const categoryEls = categories.map((cat) => {
    const el = document.createElement("span");
    el.className = "category-tag";
    el.textContent = cat.label;
    el.dataset.index = String(cat.index);
    categoryLayer.appendChild(el);
    return el;
  });

  const itemEls = [];
  let pinnedEl = null;

  itemLayer.addEventListener("click", (e) => {
    const btn = e.target.closest(".memory-item");
    if (!btn || btn.classList.contains("is-entering")) return;
    const index = Number(btn.dataset.itemIndex);
    const categoryIndex = Number(itemLayer.dataset.categoryIndex);
    const category = categories[categoryIndex];
    const item = category?.items[index];
    if (item) {
      e.stopPropagation();
      onItemClick?.({ item, index, category });
    }
  });

  function unpinSelectedItem() {
    if (!pinnedEl) return;
    pinnedEl.classList.remove("pinned");
    itemLayer.appendChild(pinnedEl);
    pinnedEl = null;
  }

  return {
    dotEls,
    categoryEls,
    itemEls,
    itemLayer,
    buildItems(category) {
      unpinSelectedItem();
      itemLayer.innerHTML = "";
      itemEls.length = 0;
      itemLayer.dataset.categoryIndex = String(category.index);
      category.items.forEach((item, i) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "memory-item";
        el.style.setProperty("--item-i", String(i));
        el.dataset.itemIndex = String(i);
        el.dataset.itemId = item.id;
        el.setAttribute("aria-label", `Open memory: ${item.title}`);

        const marker = document.createElement("img");
        marker.className = "memory-item-marker";
        marker.src = assetUrl("assets/star.png");
        marker.alt = "";
        marker.draggable = false;

        const label = document.createElement("span");
        label.className = "memory-item-text";
        label.textContent = item.title;

        el.append(marker, label);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onItemClick?.({ item, index: i, category });
        });
        itemLayer.appendChild(el);
        itemEls.push({ el, index: i, item });
      });
    },
    clearItems() {
      unpinSelectedItem();
      itemLayer.innerHTML = "";
      itemEls.length = 0;
    },
    pinSelectedItem(index) {
      unpinSelectedItem();
      const entry = itemEls.find((e) => e.index === index);
      if (!entry) return;
      entry.el.classList.add("pinned");
      document.body.appendChild(entry.el);
      pinnedEl = entry.el;
    },
    unpinSelectedItem: unpinSelectedItem,
    setExpandedProgress(t) {
      root.style.setProperty("--expand", String(t));
    },
  };
}

export function projectLabels(
  ui,
  {
    categories,
    camera,
    scene,
    canvas,
    viewMode,
    activeIndex,
    expandT,
    elapsed,
    hoveredIndex,
    activeItemIndex = -1,
    cardOpen = false,
    selfPull = 0,
  }
) {
  const rect = canvas.getBoundingClientRect();
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;

  categories.forEach((cat, i) => {
    const dot = ui.dotEls[i];
    const label = ui.categoryEls[i];
    if (!dot || !label) return;

    projectVec.copy(getNodeOffset(cat.center, elapsed, 0.04));
    projectVec.applyMatrix4(scene.matrixWorld);
    projectVec.project(camera);

    const visible = projectVec.z < 1 && projectVec.z > -1;
    let x = rect.left + (projectVec.x * 0.5 + 0.5) * rect.width;
    let y = rect.top + (-projectVec.y * 0.5 + 0.5) * rect.height;

    if (selfPull > 0 && viewMode === "constellation") {
      const pull = selfPull * 0.08;
      x += (centerX - x) * pull;
      y += (centerY - y) * pull;
    }

    const isHover = hoveredIndex === i && viewMode === "constellation";
    const isActive = viewMode === "topic" && activeIndex === i;
    const isDimmed = viewMode === "topic" && activeIndex >= 0 && !isActive;

    let dotScale = 1;
    let dotOpacity = 1;
    let labelOpacity = 0.85;

    if (selfPull > 0 && viewMode === "constellation") dotScale *= 1 + selfPull * 0.03;
    if (isHover) dotScale = 1.12;
    if (isActive) dotScale = 1.06;
    if (isDimmed) {
      dotScale = 0.55;
      dotOpacity = 0.15;
      labelOpacity = 0.12;
    }

    dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${dotScale})`;
    dot.style.opacity = String(dotOpacity);
    dot.style.display = visible ? "block" : "none";

    label.style.transform = `translate(${x}px, ${y + 8}px) translate(-50%, -50%)`;
    label.style.opacity = String(labelOpacity);
    label.style.display = visible ? "block" : "none";
    label.classList.toggle("active", isActive);
  });

  if (viewMode === "topic" && activeIndex >= 0 && ui.itemEls.length) {
    const cat = categories[activeIndex];
    const topicDrift = 0.035;

    projectVec.copy(getNodeOffset(cat.center, elapsed, 0.05));
    projectVec.applyMatrix4(scene.matrixWorld);
    projectVec.project(camera);
    const catX = rect.left + (projectVec.x * 0.5 + 0.5) * rect.width;
    const catY = rect.top + (-projectVec.y * 0.5 + 0.5) * rect.height;

    ui.itemEls.forEach(({ el, index }) => {
      const pos = cat.itemPositions[index];
      projectVec.copy(getNodeOffset(pos, elapsed, topicDrift));
      projectVec.applyMatrix4(scene.matrixWorld);
      projectVec.project(camera);

      const visible = projectVec.z < 1;
      let x = rect.left + (projectVec.x * 0.5 + 0.5) * rect.width;
      let y = rect.top + (-projectVec.y * 0.5 + 0.5) * rect.height;

      const dx = x - catX;
      const dy = y - catY;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const push = ITEM_TEXT_SCREEN_GAP + Math.min(dist * 0.04, 12);
        x += (dx / dist) * push;
        y += (dy / dist) * push;
      }

      const delay = index * 0.06;
      const itemT = Math.max(0, Math.min(1, (expandT - delay) / 0.55));

      const isSelected = index === activeItemIndex;
      const fadeOthers = cardOpen && activeItemIndex >= 0 && !isSelected;
      el.style.transform = `translate(${x}px, ${y}px) translate(0, -50%) scale(${0.92 + itemT * 0.08})`;
      el.style.opacity = String(
        itemT * (isSelected ? 1 : fadeOthers ? 0.25 : 0.92)
      );
      el.style.display = visible && itemT > 0.02 ? "inline-flex" : "none";
      el.classList.toggle("selected", isSelected);
      el.classList.toggle("is-entering", itemT < 0.2);
      el.classList.toggle("dimmed", fadeOthers);
    });
  }
}
