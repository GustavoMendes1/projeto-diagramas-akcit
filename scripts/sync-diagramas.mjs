#!/usr/bin/env node
// Reinjeta o conteúdo de docs/diagramas/*.mmd nos blocos do README.md.
// Cada bloco é delimitado por:
//   <!-- diagrama:NOME:inicio -->  ...  <!-- diagrama:NOME:fim -->
// onde NOME é o nome do arquivo .mmd sem extensão.
//
// Uso:
//   node scripts/sync-diagramas.mjs          # atualiza o README
//   node scripts/sync-diagramas.mjs --check  # falha se estiver dessincronizado

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastaDiagramas = join(raiz, "docs", "diagramas");
const caminhoReadme = join(raiz, "README.md");
const modoCheck = process.argv.includes("--check");

const original = readFileSync(caminhoReadme, "utf8");
let readme = original;
const erros = [];

const arquivos = readdirSync(pastaDiagramas)
  .filter((f) => f.endsWith(".mmd"))
  .sort();

for (const arquivo of arquivos) {
  const nome = basename(arquivo, ".mmd");
  const fonte = readFileSync(join(pastaDiagramas, arquivo), "utf8").trimEnd();
  const inicio = `<!-- diagrama:${nome}:inicio -->`;
  const fim = `<!-- diagrama:${nome}:fim -->`;
  const i = readme.indexOf(inicio);
  const f = readme.indexOf(fim);

  if (i === -1 || f === -1 || f < i) {
    erros.push(`Marcadores ausentes ou invertidos no README para "${nome}".`);
    continue;
  }

  const bloco = `${inicio}\n\`\`\`mermaid\n${fonte}\n\`\`\`\n${fim}`;
  readme = readme.slice(0, i) + bloco + readme.slice(f + fim.length);
}

if (erros.length > 0) {
  for (const e of erros) console.error(`ERRO: ${e}`);
  process.exit(1);
}

if (modoCheck) {
  if (readme !== original) {
    console.error("README dessincronizado dos arquivos .mmd. Rode: node scripts/sync-diagramas.mjs");
    process.exit(1);
  }
  console.log(`OK: ${arquivos.length} diagramas em sincronia com o README.`);
  process.exit(0);
}

writeFileSync(caminhoReadme, readme);
console.log(`README atualizado com ${arquivos.length} diagramas.`);
