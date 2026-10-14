import { constants } from "node:fs";
import { mkdir, lstat, open, rename } from "node:fs/promises";
export async function privateDirectory(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error("账单目录必须是本机专用的 0700 目录，不能是符号链接。");
}
export async function readPrivateJson<T>(path: string): Promise<T | null> {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) || stat.size > 16_777_216) throw new Error("本机记录权限或大小不符。");
    return JSON.parse(await file.readFile("utf8")) as T;
  } finally { await file.close(); }
}
export async function writePrivateJson(path: string, data: unknown) {
  const file = await open(`${path}.pending`, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
  await rename(`${path}.pending`, path);
  const { dirname } = await import("node:path"), directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
