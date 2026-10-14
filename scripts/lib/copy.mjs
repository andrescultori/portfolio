import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

export function resetDist(distDir) {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
}

export function copySiteFiles(rootDir, distDir, includeList) {
  for (const name of includeList) {
    const src = path.join(rootDir, name);
    if (!existsSync(src)) continue;
    const dest = path.join(distDir, name);
    cpSync(src, dest, { recursive: true });
  }
}
