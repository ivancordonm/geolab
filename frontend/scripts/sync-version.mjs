#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootVersionPath = resolve(scriptDir, "../../VERSION");
const localVersionPath = resolve(scriptDir, "../VERSION");

const version = readFileSync(rootVersionPath, "utf-8").trim();
writeFileSync(localVersionPath, `${version}\n`);

console.log(`Synced frontend/VERSION -> ${version}`);
