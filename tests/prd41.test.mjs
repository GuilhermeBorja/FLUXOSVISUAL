import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../dist/workspace.js",import.meta.url),"utf8");
const styles=readFileSync(new URL("../dist/styles.css",import.meta.url),"utf8");

test("PRD4.1 renderiza tres perspectivas juntas sem tabs",()=>{
  assert.match(source,/function renderPrd41Workspace\(items\)/);
  assert.match(source,/pane\("table","Sintética"/);
  assert.match(source,/pane\("graph","Analítica"/);
  assert.match(source,/pane\("gantt","Gantt"/);
  assert.match(source,/\$\{renderPrd41Workspace\(items\)\}/);
  assert.doesNotMatch(source,/<div class="mode-tabs" role="tablist" aria-label="Visualização"/);
});
test("PRD4.1 mantem as ferramentas PRD4 sem duplicar cadastro rapido",()=>{
  for(const required of ["renderTable(items)","renderGraph(items)","renderGantt(items)","graphInstance?.pause()","graphInstance?.restart()","createRelation(sourceId,targetId,\"TI\")"]){
    assert.ok(source.includes(required),required);
  }
  assert.ok(!source.includes('return `\x24{renderPrd4QuickCreate()}<div class="graph-layout">'));
  assert.ok(!source.includes('return `\x24{renderPrd4QuickCreate()}<div class="table-card">'));
  assert.match(source,/if \(items.length\) mountGraph\(items\)/);
});
test("PRD4.1 paineis podem redimensionar por pointer e teclado, preferencias locais",()=>{
  for(const required of ["prd41BindSplitters","prd41UpdateWidths","setPointerCapture","pointermove","pointerup","pointercancel","ArrowLeft","ArrowRight","prd41SavePaneWidths","localStorage.setItem","is-focused","data-pane-focus"]){
    assert.ok(source.includes(required),required);
  }
  assert.match(styles,/grid-template-columns:minmax\(0,var\(--pane-table/);
  assert.match(styles,/\.prd41-workspace\.is-focused/);
});
test("PRD4.2 selecao sincronizada e apenas um controle de subitens",()=>{
  assert.match(source,/document\.querySelectorAll\("\[data-gantt-row\]"\)/);
  assert.match(source,/id="showSubitems"/);
  assert.doesNotMatch(source,/id="showSubitemsGantt"/);
  assert.match(styles,/\.gantt-row\.selected/);
});
