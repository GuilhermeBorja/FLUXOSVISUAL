import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checklist = readFileSync(new URL("../docs/PRD3-P0-REGRESSION-CHECKLIST.md", import.meta.url), "utf8");
const requirementRows = checklist.split("\n").filter((line) => /^\| (R2-\d+|M-\d+) \|/.test(line));
const rows = requirementRows.map((line) => {
  const columns = line.split("|").map((value) => value.trim());
  const id = columns[1];
  const hasPriorityColumn = ["P0", "P1", "P2"].includes(columns[2]);
  return {
    id,
    status: columns[hasPriorityColumn ? 4 : 3],
    evidence: columns[hasPriorityColumn ? 5 : 4],
  };
});

test("P0 M-13: matriz de regressão tem 44 requisitos parciais rastreáveis e IDs únicos", () => {
  assert.equal(rows.length, 45, "a checklist deve incluir os 44 parciais e R2-22, já conforme");
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "não pode haver IDs duplicados");
  const partial = rows.filter((row) => row.id !== "R2-22");
  assert.equal(partial.length, 44);
  const allowed = new Set(["preservado", "corrigido", "regressão encontrada", "não verificado"]);
  assert.ok(partial.every((row) => allowed.has(row.status)), "cada requisito parcial deve ter um dos quatro estados permitidos");
  assert.ok(partial.every((row) => row.evidence && row.evidence.trim().length > 0), "cada requisito parcial deve registrar evidência ou pendência");
  const counts = partial.reduce((result, row) => {
    result[row.status] = (result[row.status] || 0) + 1;
    return result;
  }, {});
  for (const status of allowed) {
    const summaryRow = checklist.split("\n").find((line) => line.startsWith(`| ${status} |`));
    assert.ok(summaryRow, `falta a linha de resumo para estado: ${status}`);
    assert.equal(Number(summaryRow.split("|")[2].trim()), counts[status] || 0, `resumo incorreto para estado: ${status}`);
  }
});
