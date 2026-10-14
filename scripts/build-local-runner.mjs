import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const directory = new URL("../public/downloads/", import.meta.url);
await mkdir(directory, { recursive: true });
const file = new URL("radar-validation-runner.cjs", directory);
await build({ entryPoints: [new URL("local-validation.mts", import.meta.url).pathname], outfile: file.pathname,
  bundle: true, platform: "node", target: "node22", format: "cjs", sourcemap: false, minify: false,
  banner: { js: "// Radar Agent owner-run local runner 2026-10-14-proxy-v2. No keys are included. Source: CrisChang/radar-agent, codex/arc-microgrants." } });
const sha = createHash("sha256").update(await readFile(file)).digest("hex");
await writeFile(new URL("radar-validation-runner.sha256", directory), `${sha}  radar-validation-runner.cjs\n`);
await writeFile(new URL("radar-validation-runner-v2.cjs", directory), await readFile(file));
await writeFile(new URL("radar-validation-runner-v2.sha256", directory), `${sha}  radar-validation-runner-v2.cjs\n`);
console.log(`Built owner-run script SHA-256: ${sha}`);
