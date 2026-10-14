import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const directory = new URL("../public/downloads/", import.meta.url);
await mkdir(directory, { recursive: true });
const file = new URL("radar-validation-runner.cjs", directory);
await build({ entryPoints: [new URL("local-validation.mts", import.meta.url).pathname], outfile: file.pathname,
  bundle: true, platform: "node", target: "node22", format: "cjs", sourcemap: false, minify: false,
  banner: { js: "// Radar Agent owner-run local runner v1. No keys are included. Source: CrisChang/radar-agent, codex/arc-microgrants." } });
const sha = createHash("sha256").update(await readFile(file)).digest("hex");
await writeFile(new URL("radar-validation-runner.sha256", directory), `${sha}  radar-validation-runner.cjs\n`);
console.log(`Built owner-run script SHA-256: ${sha}`);
