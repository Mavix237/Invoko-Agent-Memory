import * as THREE from "three";

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CATEGORY_COUNT = 5;

export const TAG_POOL = [
  "design update",
  "pitch deck for wednesday",
  "IP design brainstorm",
  "new concept implementation",
  "meeting with jane",
  "new release next week",
  "morning intention",
  "today's focus",
  "present moment",
  "weekly rhythm",
  "childhood room",
  "first love",
  "family ritual",
  "old neighborhood",
  "turning point",
  "who i am",
  "inner voice",
  "core values",
  "self portrait",
  "boundaries",
  "team sync",
  "roadmap review",
  "client feedback",
  "prototype sprint",
  "five year map",
  "skills to learn",
  "creative north star",
  "next chapter",
];

const CATEGORY_DEFS = [
  { id: "now", label: "now", pos: [-3.8, 2.2, 0.4], scale: 0.82, texture: 0 },
  { id: "life", label: "life", pos: [-4.6, 0.2, 0.6], scale: 0.9, texture: 1 },
  { id: "me", label: "me", pos: [0, -2.8, 0.5], scale: 0.98, texture: 2 },
  { id: "work", label: "work", pos: [3.4, 0.5, 0.3], scale: 1.12, texture: 3 },
  { id: "future", label: "future", pos: [4.2, 2.1, 0.2], scale: 0.78, texture: 4 },
];

function layoutItemPositions(center, count, rand) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = -0.55 + t * 1.1 + (rand() - 0.5) * 0.15;
    const radius = 2.4 + (i % 3) * 0.35;
    const ySpread = (i - (count - 1) / 2) * 0.55;
    positions.push(
      new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius * 0.45 + ySpread,
        center.z + 0.15 + (i % 2) * 0.25
      )
    );
  }
  return positions;
}

export function buildCategories() {
  const rand = mulberry32(42);
  const shuffled = [...TAG_POOL].sort(() => rand() - 0.5);
  let tagIdx = 0;

  const categories = CATEGORY_DEFS.map((def, i) => {
    const itemCount = 4 + Math.floor(rand() * 3);
    const items = [];
    for (let k = 0; k < itemCount; k++) {
      items.push(shuffled[tagIdx % shuffled.length]);
      tagIdx += 1;
    }

    const center = new THREE.Vector3(...def.pos);
    const itemPositions = layoutItemPositions(center, items.length, rand);

    return {
      ...def,
      index: i,
      center,
      items,
      itemPositions,
    };
  });

  const relatedByCategory = categories.map((_, i) => {
    const neighbors = [];
    if (i > 0) neighbors.push(i - 1);
    if (i < CATEGORY_COUNT - 1) neighbors.push(i + 1);
    neighbors.push((i + 2) % CATEGORY_COUNT);
    return [...new Set(neighbors)].filter((j) => j !== i);
  });

  return { categories, relatedByCategory };
}
