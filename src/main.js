import "./styles.css";
import * as THREE from "three";
import { assetUrl } from "./paths.js";
import {
  CATEGORY_COUNT,
  buildMemoryGraph,
  getNodeOffset,
  updateHubLines,
  updateBeamLines,
  updateItemLines,
} from "./memory-graph.js";
import { createMemoryUI, projectLabels } from "./memory-labels.js";
import { createMemoryCard } from "./memory-card.js";
import { createMemorySearch } from "./memory-search.js";

// ─── Scroll-scrubbed video ───────────────────────────────────────────
const video = document.getElementById("tunnel-video");
const scrollBar = document.getElementById("scroll-bar");
const heroAnchor = document.getElementById("hero-anchor");
const selfHub = document.getElementById("self-hub");
const topicBackBtn = document.getElementById("topic-back");

if (video && !video.getAttribute("src")) {
  video.src = assetUrl("assets/tunnel-bg.mp4");
}

let videoReady = false;
let scrollProgress = 0;
let targetProgress = 0;
let lastScrollTime = performance.now();
let lastFrameTime = performance.now();
let isVideoSeeking = false;
let pendingVideoTime = null;

const SCROLL_IDLE_MS = 280;
const SMOOTH_RATE = 9;
const SEEK_MIN_DELTA = 0.04;
const tunnelPin = document.getElementById("tunnel-pin");

if (video) {
  video.loop = true;
  video.preload = "auto";
  video.pause();
}

function clampProgress(p) {
  return Math.max(0, Math.min(p, 0.999));
}

function getTunnelPinProgress() {
  if (!tunnelPin) return getPageScrollProgress();
  const pinHeight = tunnelPin.offsetHeight - window.innerHeight;
  if (pinHeight <= 0) return 0;
  const scrolled = -tunnelPin.getBoundingClientRect().top;
  return clampProgress(scrolled / pinHeight);
}

function getPageScrollProgress() {
  const maxScroll =
    document.documentElement.scrollHeight - window.innerHeight;
  return maxScroll > 0 ? clampProgress(window.scrollY / maxScroll) : 0;
}

function getScrollProgress() {
  return getTunnelPinProgress();
}

function resetVideoPosition() {
  scrollProgress = 0;
  targetProgress = 0;
  pendingVideoTime = 0;
  if (!video || !video.duration) return;
  video.pause();
  video.currentTime = 0;
}

function syncVideoToProgress(progress, force = false) {
  if (!videoReady || !video.duration || isVideoSeeking) return;

  const t = clampProgress(progress) * video.duration;
  pendingVideoTime = t;

  if (!force && Math.abs(video.currentTime - t) < SEEK_MIN_DELTA) return;

  video.pause();
  video.currentTime = t;
}

function readyVideo() {
  videoReady = true;
  resetVideoPosition();
  targetProgress = getScrollProgress();
  scrollProgress = targetProgress;
  syncVideoToProgress(scrollProgress, true);
}

if (video) {
  video.addEventListener("seeking", () => {
    isVideoSeeking = true;
  });

  video.addEventListener("seeked", () => {
    isVideoSeeking = false;
  });

  video.addEventListener("loadeddata", readyVideo);
  if (video.readyState >= 2) readyVideo();
}

window.addEventListener(
  "scroll",
  () => {
    lastScrollTime = performance.now();
    targetProgress = getScrollProgress();
    if (scrollBar) scrollBar.style.height = `${targetProgress * 100}%`;
  },
  { passive: true }
);

window.addEventListener(
  "wheel",
  () => {
    lastScrollTime = performance.now();
  },
  { passive: true }
);

function updateVideo(time) {
  if (!videoReady || !video.duration) return;

  const dt = Math.min((time - lastFrameTime) / 1000, 0.05);
  lastFrameTime = time;

  targetProgress = getScrollProgress();
  const sinceScroll = time - lastScrollTime;
  const isIdle = sinceScroll > SCROLL_IDLE_MS;

  if (isIdle) {
    scrollProgress = targetProgress;
  } else {
    const follow = 1 - Math.exp(-SMOOTH_RATE * dt);
    scrollProgress += (targetProgress - scrollProgress) * follow;
    scrollProgress = clampProgress(scrollProgress);
  }

  if (!video.paused) video.pause();
  syncVideoToProgress(scrollProgress);
}

// ─── Three.js memory constellation ───────────────────────────────────
const canvas = document.getElementById("memory-canvas");
let renderer = null;

if (canvas) {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  } catch (err) {
    console.error("WebGL unavailable:", err);
    canvas.remove();
  }
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 14;

let graph;
let categories;
let nodePositions;
let topics;
let relatedByNode;
let hubLines;
let hubLineMat;
let itemLines;
let itemLineMat;
let hoverLines;
let hoverLineGeo;
let hoverLineMat;
let hoverLinePositions;
let memoryUI;
let memoryCard;
let memorySearch;
let activeItemIndex = -1;

let selfHovered = false;
let targetSelfPull = 0;
let selfPull = 0;
const hubLineBaseColor = new THREE.Color(0xd8dae8);
const hubLineHoverColor = new THREE.Color(0xf8f9fc);

let viewMode = "constellation";
let activeTopicIndex = -1;
let hoveredIndex = -1;
let hoverLineOpacity = 0;
let targetHoverLineOpacity = 0;
let expandT = 0;
let targetExpandT = 0;

let topicZoom = 0;
let targetTopicZoom = 0;

const cameraHome = new THREE.Vector3(0, 0, 14);
const cameraTarget = new THREE.Vector3(0, 0, 14);
const lookHome = new THREE.Vector3(0, 0, 0);
const lookTarget = new THREE.Vector3(0, 0, 0);
const lookCurrent = new THREE.Vector3(0, 0, 0);
const baseCameraZ = 14;
const topicCameraZ = 10.5;
const topicPan = { x: 0, y: 0 };
const topicPanTarget = { x: 0, y: 0 };
const topicFocusVec = new THREE.Vector3();
const topicRotEuler = new THREE.Euler();
const LINE_ENDPOINT_GAP = 0.58;
const lineDir = new THREE.Vector3();

function getLineEndpoints(fromPos, toPos, time) {
  const from = getNodeOffset(fromPos, time);
  const to = getNodeOffset(toPos, time);
  lineDir.subVectors(to, from);
  const dist = lineDir.length();
  if (dist <= LINE_ENDPOINT_GAP * 2) {
    return { start: from, end: to };
  }
  lineDir.normalize();
  return {
    start: from.clone().addScaledVector(lineDir, LINE_ENDPOINT_GAP),
    end: to.clone().addScaledVector(lineDir, -LINE_ENDPOINT_GAP),
  };
}

const worldPos = new THREE.Vector3();

function getTopicFocusCenter(category) {
  const focus = category.center.clone();
  if (!category.itemPositions.length) return focus;

  category.itemPositions.forEach((pos) => focus.add(pos));
  focus.divideScalar(category.itemPositions.length + 1);
  return focus;
}

function updateTopicPanTarget() {
  if (activeTopicIndex < 0 || !categories) return;

  const focus = getTopicFocusCenter(categories[activeTopicIndex]);
  topicFocusVec.copy(focus);
  topicRotEuler.set(scene.rotation.x, scene.rotation.y, 0);
  topicFocusVec.applyEuler(topicRotEuler);
  topicPanTarget.x = -topicFocusVec.x;
  topicPanTarget.y = -topicFocusVec.y;
}

function updateHoverLines(origin, relatedPositions) {
  if (!relatedPositions?.length) {
    hoverLines.visible = false;
    return;
  }

  relatedPositions.forEach((target, i) => {
    const { start, end } = getLineEndpoints(origin, target, elapsed);
    hoverLinePositions[i * 6] = start.x;
    hoverLinePositions[i * 6 + 1] = start.y;
    hoverLinePositions[i * 6 + 2] = start.z;
    hoverLinePositions[i * 6 + 3] = end.x;
    hoverLinePositions[i * 6 + 4] = end.y;
    hoverLinePositions[i * 6 + 5] = end.z;
  });

  hoverLineGeo.setDrawRange(0, relatedPositions.length * 2);
  hoverLineGeo.attributes.position.needsUpdate = true;
  hoverLines.visible = true;
  targetHoverLineOpacity = 1;
}

function pickNode(clientX, clientY) {
  if (!canvas || !categories || viewMode === "topic") return -1;

  const rect = canvas.getBoundingClientRect();
  let closest = -1;
  let closestDist = Infinity;

  for (let i = 0; i < CATEGORY_COUNT; i++) {
    worldPos.copy(getNodeOffset(categories[i].center, elapsed, 0.04));
    worldPos.applyMatrix4(scene.matrixWorld);
    worldPos.project(camera);
    const sx = (worldPos.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-worldPos.y * 0.5 + 0.5) * rect.height + rect.top;
    const dist = Math.hypot(clientX - sx, clientY - sy);
    const hitRadius = 36 + categories[i].scale * 40;
    if (dist < hitRadius && dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }

  return closest;
}

function setHovered(index) {
  if (viewMode === "topic") return;
  if (hoveredIndex === index) return;
  hoveredIndex = index;

  if (index < 0) {
    targetHoverLineOpacity = 0;
    if (canvas) canvas.style.cursor = "default";
    return;
  }

  if (canvas) canvas.style.cursor = "pointer";
  const related = relatedByNode[index].map((i) => nodePositions[i]);
  updateHoverLines(nodePositions[index], related);
}

function closeMemoryCard() {
  if (memoryCard?.isOpen()) memoryCard.close();
  else clearCardSelection();
}

function clearCardSelection() {
  memoryUI?.unpinSelectedItem();
  document.getElementById("memory-ui")?.classList.remove("card-open");
  activeItemIndex = -1;
}

function openMemoryDetail(detail) {
  if (!detail) return;

  const catIdx = categories.findIndex((c) => c.id === detail.categoryId);
  const itemIdx =
    catIdx >= 0 ? categories[catIdx].items.findIndex((i) => i.id === detail.id) : -1;

  if (catIdx >= 0 && catIdx !== activeTopicIndex) {
    enterTopic(catIdx, { preserveCard: true });
  }

  activeItemIndex = itemIdx;
  document.getElementById("memory-ui")?.classList.add("card-open");
  if (itemIdx >= 0) memoryUI?.pinSelectedItem(itemIdx);
  memoryCard?.open(detail);
}

function setSelfHover(active) {
  selfHovered = active;
  targetSelfPull = active && viewMode === "constellation" ? 1 : 0;
  heroAnchor?.classList.toggle("self-active", active && viewMode === "constellation");
  memorySearch?.setVisible(active && viewMode === "constellation");
  if (active && viewMode === "constellation") setHovered(-1);
}

function enterTopic(index, { preserveCard = false } = {}) {
  if (!preserveCard) closeMemoryCard();
  setSelfHover(false);

  viewMode = "topic";
  activeTopicIndex = index;
  targetTopicZoom = 1;
  targetExpandT = 1;

  updateTopicPanTarget();

  syncCameraHomeFromScroll();
  cameraTarget.copy(cameraHome);
  lookTarget.copy(lookHome);

  memoryUI?.buildItems(categories[index]);
  document.getElementById("memory-ui")?.classList.add("topic-active");
  updateItemLines(graph, index, elapsed);
  hubLineMat.opacity = 0.08;

  topicBackBtn?.classList.add("visible");
  topicBackBtn.hidden = false;
  setHovered(-1);
  hoverLines.visible = false;
  if (heroAnchor) {
    heroAnchor.style.opacity = "0.08";
    heroAnchor.style.pointerEvents = "none";
  }
}

function exitTopic() {
  closeMemoryCard();
  viewMode = "constellation";
  activeTopicIndex = -1;
  targetTopicZoom = 0;
  targetExpandT = 0;
  topicPanTarget.x = 0;
  topicPanTarget.y = 0;

  syncCameraHomeFromScroll();
  cameraTarget.copy(cameraHome);
  lookTarget.copy(lookHome);

  memoryUI?.clearItems();
  document.getElementById("memory-ui")?.classList.remove("topic-active");
  if (itemLines) itemLines.visible = false;
  hubLineMat.opacity = 0.5;
  hubLineMat.color.copy(hubLineBaseColor);

  topicBackBtn?.classList.remove("visible");
  topicBackBtn.hidden = true;
  setHovered(-1);
  if (heroAnchor) {
    heroAnchor.style.opacity = "";
    heroAnchor.style.pointerEvents = "";
  }
}

let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;


let globalScroll = 0;

function syncCameraHomeFromScroll() {
  if (viewMode === "topic") {
    cameraHome.set(0, 0, topicCameraZ);
    return;
  }
  cameraHome.set(0, globalScroll * 1.5, baseCameraZ - globalScroll * 6);
}

function updateSceneFromScroll() {
  globalScroll = getPageScrollProgress();
  syncCameraHomeFromScroll();

  cameraTarget.copy(cameraHome);
  lookTarget.copy(lookHome);

  if (viewMode !== "topic" && heroAnchor) {
    const ipScale = 1 - globalScroll * 0.35;
    const ipY = globalScroll * -80;
    heroAnchor.style.transform = `translate(-50%, calc(-50% + ${ipY}px)) scale(${Math.max(0.4, ipScale)})`;
    heroAnchor.style.opacity = String(1 - globalScroll * 0.6);
  }
}

let elapsed = 0;

function animate(time) {
  elapsed = time * 0.001;
  updateVideo(time);
  updateSceneFromScroll();

  mouseX += (targetMouseX - mouseX) * 0.04;
  mouseY += (targetMouseY - mouseY) * 0.04;

  topicZoom += (targetTopicZoom - topicZoom) * 0.08;
  expandT += (targetExpandT - expandT) * 0.07;
  memoryUI?.setExpandedProgress(expandT);

  selfPull += (targetSelfPull - selfPull) * 0.055;

  if (graph) {
    updateHubLines(graph, elapsed, 0.42, selfPull);
    updateBeamLines(graph, elapsed, selfPull);
    if (viewMode === "constellation") {
      hubLineMat.opacity = 0.5 + selfPull * 0.22;
      hubLineMat.color.copy(hubLineBaseColor).lerp(hubLineHoverColor, selfPull * 0.55);
    }
  }

  if (viewMode === "topic" && activeTopicIndex >= 0) {
    updateItemLines(graph, activeTopicIndex, elapsed);
    itemLineMat.opacity = 0.2 + expandT * 0.25;
  }

  const camLerp = 0.05 + topicZoom * 0.04;
  camera.position.lerp(cameraTarget, camLerp);
  lookCurrent.lerp(lookTarget, 0.1);
  camera.lookAt(lookCurrent);

  if (hoveredIndex >= 0 && viewMode === "constellation") {
    const related = relatedByNode[hoveredIndex].map((i) => nodePositions[i]);
    updateHoverLines(nodePositions[hoveredIndex], related);
  }

  hoverLineOpacity += (targetHoverLineOpacity - hoverLineOpacity) * 0.14;
  hoverLineMat.opacity = hoverLineOpacity * 0.75;
  if (hoverLineOpacity < 0.02 && hoveredIndex < 0) {
    hoverLines.visible = false;
  }

  const panLerp = viewMode === "topic" ? 0.09 : 0.07;
  topicPan.x += (topicPanTarget.x - topicPan.x) * panLerp;
  topicPan.y += (topicPanTarget.y - topicPan.y) * panLerp;

  const tunnelPush =
    viewMode === "topic" ? globalScroll * 0.6 : globalScroll * 4;
  scene.position.set(topicPan.x, topicPan.y, tunnelPush);

  if (viewMode === "topic") {
    const topicRotY = elapsed * 0.04 + mouseX * 0.1 + globalScroll * 0.12;
    const topicRotX = mouseY * 0.06 + Math.sin(elapsed * 0.35) * 0.025;
    scene.rotation.x += (topicRotX - scene.rotation.x) * 0.06;
    scene.rotation.y += (topicRotY - scene.rotation.y) * 0.06;
    updateTopicPanTarget();
  } else {
    scene.rotation.y = elapsed * 0.04 + globalScroll * 0.8 + mouseX * 0.15;
    scene.rotation.x = mouseY * 0.08 + globalScroll * 0.2;
  }

  if (memoryUI && categories) {
    projectLabels(memoryUI, {
      categories,
      camera,
      scene,
      canvas,
      viewMode,
      activeIndex: activeTopicIndex,
      expandT,
      elapsed,
      hoveredIndex,
      activeItemIndex,
      cardOpen: memoryCard?.isOpen() ?? false,
      selfPull: viewMode === "constellation" ? selfPull : 0,
    });
  }

  if (renderer) renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer?.setSize(window.innerWidth, window.innerHeight);
});

async function init() {
  graph = await buildMemoryGraph(scene);
  ({
    categories,
    nodePositions,
    topics,
    relatedByNode,
    hubLines,
    hubLineMat,
    itemLines,
    itemLineMat,
    hoverLines,
    hoverLineGeo,
    hoverLineMat,
    hoverLinePositions,
  } = graph);

  memoryCard = createMemoryCard({
    onClose: clearCardSelection,
    onConnectionClick: ({ id, categoryId }) => {
      const catIdx = categories.findIndex((c) => c.id === categoryId);
      const item = categories[catIdx]?.items.find((i) => i.id === id);
      if (item) openMemoryDetail(item);
    },
  });

  memoryUI = createMemoryUI(categories, {
    onItemClick: ({ item }) => openMemoryDetail(item),
  });

  const searchMount = document.getElementById("memory-search-mount");
  if (searchMount) {
    memorySearch = createMemorySearch(categories, {
      onSelect: ({ item, category }) => {
        const catIdx = categories.findIndex((c) => c.id === category.id);
        if (catIdx >= 0) {
          enterTopic(catIdx);
          openMemoryDetail(item);
        }
      },
    });
    searchMount.appendChild(memorySearch.el);
  }

  const selfPresence = document.getElementById("self-presence");

  selfHub?.addEventListener("mouseenter", () => setSelfHover(true));
  selfHub?.addEventListener("mouseleave", () => setSelfHover(false));

  selfPresence?.addEventListener("click", (e) => {
    if (viewMode !== "constellation") return;
    e.stopPropagation();
    setSelfHover(true);
    requestAnimationFrame(() => memorySearch?.focus());
  });

  document.getElementById("memory-ui")?.removeAttribute("aria-hidden");

  canvas?.addEventListener("mousemove", (e) => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    if (viewMode === "constellation") {
      setHovered(pickNode(e.clientX, e.clientY));
    }
  });

  canvas?.addEventListener("mouseleave", () => setHovered(-1));

  canvas?.addEventListener("click", (e) => {
    const idx = pickNode(e.clientX, e.clientY);
    if (viewMode === "constellation") {
      if (idx >= 0) enterTopic(idx);
      return;
    }
    if (idx < 0) exitTopic();
  });

  topicBackBtn?.addEventListener("click", () => {
    if (memoryCard?.isOpen()) closeMemoryCard();
    else exitTopic();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (memoryCard?.isOpen()) closeMemoryCard();
    else if (viewMode === "topic") exitTopic();
  });

}

init().catch((err) => console.error("Memory graph init failed:", err));
requestAnimationFrame(animate);
