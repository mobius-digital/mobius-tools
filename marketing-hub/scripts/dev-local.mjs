/**
 * `next dev` with the build folder outside OneDrive.
 *
 * This repo lives in a OneDrive folder, and OneDrive locks files inside
 * .next while the dev server is writing them (EBUSY, random 500s). The fix is
 * a junction from .next to a folder under %LOCALAPPDATA%, but then the
 * compiled chunks live outside the project and Node cannot find
 * node_modules from their real path. NODE_PATH puts it back on the search
 * list. Local development only; the production build is untouched.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, lstatSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dotNext = path.join(root, ".next");
const target = path.join(process.env.LOCALAPPDATA ?? root, "Temp", "lineup-next");

if (process.platform === "win32") {
  const isJunction = existsSync(dotNext) && lstatSync(dotNext).isSymbolicLink();
  if (!isJunction) {
    if (existsSync(dotNext)) rmSync(dotNext, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    execSync(`cmd /c mklink /J "${dotNext}" "${target}"`, { stdio: "ignore" });
  }
}

const env = {
  ...process.env,
  NODE_PATH: [path.join(root, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
};

const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
