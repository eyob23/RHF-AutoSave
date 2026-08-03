import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const base = process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/`
    : "/";

  return {
    base,
    plugins: [react()],
    build: {
      outDir: "demo-dist",
    },
    server: {
      port: 4173,
    },
  };
});