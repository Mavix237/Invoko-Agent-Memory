import * as THREE from "three";
import { buildCategories, CATEGORY_COUNT } from "./categories.js";
import { enrichCategoryItems } from "./memory-details.js";

export { CATEGORY_COUNT };

export const MAX_RELATED = 4;
const BEAMS_PER_LINE = 2;
const HUB = new THREE.Vector3(0, 0, -0.2);

export function getNodeOffset(pos, time, drift = 0.06) {
  const p = pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z);
  return new THREE.Vector3(
    p.x + Math.sin(time * 0.35 + p.z) * drift,
    p.y + Math.cos(time * 0.28 + p.x) * drift,
    p.z
  );
}

export async function buildMemoryGraph(scene) {
  const { categories: rawCategories, relatedByCategory } = buildCategories();
  const categories = enrichCategoryItems(rawCategories);

  const nodePositions = categories.map((c) => c.center.clone());
  const topics = categories;

  const hubLinePositions = new Float32Array(CATEGORY_COUNT * 6);
  const hubLineGeo = new THREE.BufferGeometry();
  hubLineGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(hubLinePositions, 3)
  );
  const hubLineMat = new THREE.LineBasicMaterial({
    color: 0xd8dae8,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
  });
  const hubLines = new THREE.LineSegments(hubLineGeo, hubLineMat);
  hubLines.frustumCulled = false;
  hubLines.renderOrder = 5;
  scene.add(hubLines);

  const hoverLinePositions = new Float32Array(MAX_RELATED * 6);
  const hoverLineGeo = new THREE.BufferGeometry();
  hoverLineGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(hoverLinePositions, 3)
  );
  const hoverLineMat = new THREE.LineBasicMaterial({
    color: 0xe5e4ff,
    transparent: true,
    opacity: 0.75,
    depthTest: false,
    depthWrite: false,
  });
  const hoverLines = new THREE.LineSegments(hoverLineGeo, hoverLineMat);
  hoverLines.visible = false;
  hoverLines.frustumCulled = false;
  hoverLines.renderOrder = 20;
  scene.add(hoverLines);

  const itemLinePositions = new Float32Array(32 * 6);
  const itemLineGeo = new THREE.BufferGeometry();
  itemLineGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(itemLinePositions, 3)
  );
  const itemLineMat = new THREE.LineBasicMaterial({
    color: 0xd8dae8,
    transparent: true,
    opacity: 0.35,
    depthTest: false,
    depthWrite: false,
  });
  const itemLines = new THREE.LineSegments(itemLineGeo, itemLineMat);
  itemLines.visible = false;
  itemLines.frustumCulled = false;
  itemLines.renderOrder = 15;
  scene.add(itemLines);

  const beamCount = CATEGORY_COUNT * BEAMS_PER_LINE;
  const beamLinePositions = new Float32Array(beamCount * 6);
  const beamLineGeo = new THREE.BufferGeometry();
  beamLineGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(beamLinePositions, 3)
  );
  const beamLineMat = new THREE.LineBasicMaterial({
    color: 0xf6f7fb,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const beamLines = new THREE.LineSegments(beamLineGeo, beamLineMat);
  beamLines.visible = false;
  beamLines.frustumCulled = false;
  beamLines.renderOrder = 25;
  scene.add(beamLines);

  const beamDir = new THREE.Vector3();
  const beamTip = new THREE.Vector3();
  const beamTail = new THREE.Vector3();
  const beamLineStart = new THREE.Vector3();
  const beamLineEnd = new THREE.Vector3();

  return {
    categories,
    nodePositions,
    topics,
    relatedByNode: relatedByCategory,
    hubLines,
    hubLineGeo,
    hubLinePositions,
    hubLineMat,
    hoverLines,
    hoverLineGeo,
    hoverLineMat,
    hoverLinePositions,
    itemLines,
    itemLineGeo,
    itemLineMat,
    itemLinePositions,
    beamLines,
    beamLineGeo,
    beamLineMat,
    beamLinePositions,
    beamDir,
    beamTip,
    beamTail,
    beamLineStart,
    beamLineEnd,
    HUB,
  };
}

export function updateHubLines(graph, time, gap = 0.42, pull = 0) {
  const { hubLinePositions, hubLineGeo, categories, HUB } = graph;
  const hub = getNodeOffset(HUB, time, 0.02);

  categories.forEach((cat, i) => {
    const target = getNodeOffset(cat.center, time, 0.04);
    if (pull > 0) target.lerp(hub, pull * 0.1);
    const dir = new THREE.Vector3().subVectors(target, hub);
    const len = dir.length();
    if (len <= gap * 2) return;
    dir.normalize();
    const start = hub.clone().addScaledVector(dir, gap * 0.35);
    const end = target.clone().addScaledVector(dir, -gap);

    hubLinePositions[i * 6] = start.x;
    hubLinePositions[i * 6 + 1] = start.y;
    hubLinePositions[i * 6 + 2] = start.z;
    hubLinePositions[i * 6 + 3] = end.x;
    hubLinePositions[i * 6 + 4] = end.y;
    hubLinePositions[i * 6 + 5] = end.z;
  });

  hubLineGeo.attributes.position.needsUpdate = true;
}

export function updateBeamLines(graph, time, pull = 0, gap = 0.42) {
  const {
    beamLinePositions,
    beamLineGeo,
    beamLines,
    beamLineMat,
    beamDir,
    beamTip,
    beamTail,
    beamLineStart,
    beamLineEnd,
    categories,
    HUB,
  } = graph;

  if (pull < 0.02) {
    beamLines.visible = false;
    beamLineMat.opacity = 0;
    return;
  }

  const hub = getNodeOffset(HUB, time, 0.02);
  const breathe = 0.5 + Math.sin(time * 0.55) * 0.12;
  let segmentCount = 0;

  categories.forEach((cat, i) => {
    const target = getNodeOffset(cat.center, time, 0.04);
    if (pull > 0) target.lerp(hub, pull * 0.1);

    beamDir.subVectors(target, hub);
    const len = beamDir.length();
    if (len <= gap * 2) return;
    beamDir.normalize();

    beamLineStart.copy(hub).addScaledVector(beamDir, gap * 0.35);
    beamLineEnd.copy(target).addScaledVector(beamDir, -gap);

    for (let b = 0; b < BEAMS_PER_LINE; b++) {
      const wave = time * 0.28 + i * 0.95 + b * 1.35;
      const along = 0.42 + Math.sin(wave) * 0.28;
      const beamLen = 0.14 + pull * 0.06;

      beamTip.copy(beamLineEnd).lerp(beamLineStart, along);
      beamTail.copy(beamTip).addScaledVector(beamDir, beamLen);

      const idx = (i * BEAMS_PER_LINE + b) * 6;
      beamLinePositions[idx] = beamTail.x;
      beamLinePositions[idx + 1] = beamTail.y;
      beamLinePositions[idx + 2] = beamTail.z;
      beamLinePositions[idx + 3] = beamTip.x;
      beamLinePositions[idx + 4] = beamTip.y;
      beamLinePositions[idx + 5] = beamTip.z;
      segmentCount += 1;
    }
  });

  beamLineGeo.setDrawRange(0, segmentCount * 2);
  beamLineGeo.attributes.position.needsUpdate = true;
  beamLines.visible = segmentCount > 0;
  beamLineMat.opacity = (0.06 + pull * 0.14) * breathe;
}

export function updateItemLines(
  graph,
  categoryIndex,
  time,
  { originGap = 0.42, textGap = 0.58, drift = 0.035 } = {}
) {
  const { itemLinePositions, itemLineGeo, itemLines, categories } = graph;
  const cat = categories[categoryIndex];
  const origin = getNodeOffset(cat.center, time, 0.05);
  const count = cat.itemPositions.length;

  for (let i = 0; i < count; i++) {
    const target = getNodeOffset(cat.itemPositions[i], time, drift);
    const dir = new THREE.Vector3().subVectors(target, origin);
    const len = dir.length();
    if (len <= (originGap + textGap)) continue;
    dir.normalize();
    const start = origin.clone().addScaledVector(dir, originGap);
    const end = target.clone().addScaledVector(dir, -textGap);

    itemLinePositions[i * 6] = start.x;
    itemLinePositions[i * 6 + 1] = start.y;
    itemLinePositions[i * 6 + 2] = start.z;
    itemLinePositions[i * 6 + 3] = end.x;
    itemLinePositions[i * 6 + 4] = end.y;
    itemLinePositions[i * 6 + 5] = end.z;
  }

  itemLineGeo.setDrawRange(0, count * 2);
  itemLineGeo.attributes.position.needsUpdate = true;
  itemLines.visible = true;
}
