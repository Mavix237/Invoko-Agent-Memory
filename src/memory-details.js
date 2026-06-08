function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SOURCES = [
  "evening chat",
  "morning check-in",
  "voice note",
  "quick capture",
  "weekly review",
  "spontaneous reflection",
];

const CONVERSATION_OPENERS = {
  user: [
    "I keep coming back to this — can you help me think it through?",
    "Something happened today that connects to this.",
    "I want to make sure we don't lose this thread.",
    "Can we unpack this a bit more?",
    "This came up again and I think it matters.",
  ],
  agent: [
    "I'm listening — what feels most alive about this right now?",
    "Let's trace where this started and what it's pointing toward.",
    "I notice this ties into a few other threads you've mentioned.",
    "That sounds meaningful. What would you want future-you to remember?",
    "I'll hold this carefully. What's the core of it for you?",
  ],
};

const CONVERSATION_FOLLOWUPS = {
  user: [
    "Yeah, it's less about the task and more about the intention behind it.",
    "I think the connection is that it shapes how I show up elsewhere.",
    "What I don't want is for this to stay vague — it needs a shape.",
    "It surprised me how emotional this one felt.",
    "Maybe the real memory here is the decision, not the event.",
  ],
  agent: [
    "I've captured that distinction — it reads as a through-line, not a one-off.",
    "I'll link this to the nearby memories so the pattern stays visible.",
    "Documented with context so you can return to the feeling, not just the fact.",
    "This sits at the intersection of a few themes — I've noted those links below.",
    "Marked as active — it may resurface when related topics come up.",
  ],
};

const SUMMARY_TEMPLATES = [
  "A memory anchored around {title}, captured after a conversation about intent, timing, and what should carry forward.",
  "This entry documents {title} — not just the event, but the framing you and the agent shaped together.",
  "Recorded during a reflective exchange: {title} emerged as something worth preserving with surrounding context.",
  "{title} — held here with notes on how it connects to your broader map and when it was last revisited.",
];

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(daysAgo) {
  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  if (daysAgo < 30) return `${Math.floor(daysAgo / 7)} weeks ago`;
  return `${Math.floor(daysAgo / 30)} months ago`;
}

function buildConversation(title, rand) {
  const userOpen =
    CONVERSATION_OPENERS.user[Math.floor(rand() * CONVERSATION_OPENERS.user.length)];
  const agentOpen =
    CONVERSATION_OPENERS.agent[Math.floor(rand() * CONVERSATION_OPENERS.agent.length)];
  const userFollow =
    CONVERSATION_FOLLOWUPS.user[Math.floor(rand() * CONVERSATION_FOLLOWUPS.user.length)];
  const agentFollow =
    CONVERSATION_FOLLOWUPS.agent[Math.floor(rand() * CONVERSATION_FOLLOWUPS.agent.length)];

  return [
    { role: "user", text: `${userOpen} (${title})` },
    { role: "agent", text: agentOpen },
    { role: "user", text: userFollow },
    { role: "agent", text: agentFollow },
  ];
}

function createMemoryDetail(category, title, itemIndex, categories, rand) {
  const id = `${category.id}-${itemIndex}`;
  const daysAgo = Math.floor(rand() * 88) + 1;
  const documentedAt = new Date();
  documentedAt.setDate(documentedAt.getDate() - daysAgo);
  documentedAt.setHours(9 + Math.floor(rand() * 10), Math.floor(rand() * 60));

  const lastRefDays = Math.floor(rand() * Math.min(daysAgo, 14));
  const summaryTpl =
    SUMMARY_TEMPLATES[Math.floor(rand() * SUMMARY_TEMPLATES.length)];

  return {
    id,
    title,
    categoryId: category.id,
    categoryLabel: category.label,
    documentedAt: documentedAt.toISOString(),
    documentedLabel: formatDate(documentedAt),
    documentedRelative: formatRelative(daysAgo),
    source: SOURCES[Math.floor(rand() * SOURCES.length)],
    lastReferenced: formatRelative(lastRefDays),
    summary: summaryTpl.replace("{title}", title),
    conversation: buildConversation(title, rand),
    connections: [],
    tags: [category.label, title.split(" ").slice(0, 2).join(" ")].filter(Boolean),
    strength: Math.round(55 + rand() * 40),
  };
}

function pickConnections(item, category, categories) {
  const connections = [];
  const siblings = category.items.filter((s) => s.id !== item.id);

  siblings.slice(0, 2).forEach((sib) => {
    connections.push({
      type: "sibling",
      id: sib.id,
      title: sib.title,
      categoryLabel: category.label,
      categoryId: category.id,
      relation: "same topic cluster",
    });
  });

  const otherCats = categories.filter((c) => c.id !== category.id);
  const shuffled = [...otherCats].sort(
    (a, b) => hashStr(item.id + a.id) % 3 - hashStr(item.id + b.id) % 3
  );

  for (const cat of shuffled) {
    if (connections.length >= 4) break;
    const match = cat.items.find(
      (other) =>
        !connections.some((c) => c.id === other.id) &&
        (hashStr(item.title + other.title) % 3 === 0 ||
          item.title.split(" ").some((w) => other.title.includes(w)))
    );
    if (match) {
      connections.push({
        type: "cross",
        id: match.id,
        title: match.title,
        categoryLabel: cat.label,
        categoryId: cat.id,
        relation: "shared theme",
      });
    }
  }

  if (connections.length < 3) {
    for (const cat of otherCats) {
      if (connections.length >= 4) break;
      const other = cat.items[hashStr(item.id + cat.id) % cat.items.length];
      if (!connections.some((c) => c.id === other.id)) {
        connections.push({
          type: "cross",
          id: other.id,
          title: other.title,
          categoryLabel: cat.label,
          categoryId: cat.id,
          relation: "memory graph link",
        });
      }
    }
  }

  return connections.slice(0, 4);
}

export function enrichCategoryItems(categories) {
  const rand = mulberry32(77);

  categories.forEach((category) => {
    const titles = category.items;
    category.items = titles.map((title, i) =>
      createMemoryDetail(category, title, i, categories, rand)
    );
  });

  categories.forEach((category) => {
    category.items.forEach((item) => {
      item.connections = pickConnections(item, category, categories);
    });
  });

  return categories;
}

export function findMemoryDetail(categories, categoryIndex, itemIndex) {
  const cat = categories[categoryIndex];
  if (!cat) return null;
  return cat.items[itemIndex] ?? null;
}
