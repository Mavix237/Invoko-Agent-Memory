import { defineConfig } from "vite";

// GitHub Pages project site: https://<user>.github.io/<repo>/
const repoBase = "/Invoko-Agent-Memory/";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? repoBase : "./",
});
