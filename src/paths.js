const base = import.meta.env.BASE_URL;

export function assetUrl(path) {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${normalized}`;
}
