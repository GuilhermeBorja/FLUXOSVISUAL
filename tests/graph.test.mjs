import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../dist/graph.js",import.meta.url),"utf8");
function graphContext() {
  const chain = () => ({stop(){return this;},force(){return this;},tick(){return this;},id(){return this;},distance(){return this;},strength(){return this;},radius(){return this;},iterations(){return this;}});
  const sandbox = vm.createContext({FluxosVendor:{forceSimulation:chain,forceLink:chain,forceManyBody:chain,forceCollide:chain,forceX:chain,forceY:chain}});
  vm.runInContext(source,sandbox);
  return (script) => vm.runInContext(script,sandbox);
}

test("agrupamento analítico mantém todas as empresas distintas",() => {
  const run = graphContext();
  run('items=[{id:"a",title:"Projeto A",type:"project",organizationId:"org_a",parentId:""},{id:"b",title:"Projeto B",type:"project",organizationId:"org_b",parentId:""}];labels={project:(item)=>item,owner:(id)=>id,organization:(id)=>id};model=FluxosGraph.layout(items,[],"organization",{},labels);');
  assert.equal(run("model.groups.length"),2);
  assert.equal(run('model.groups.map((group)=>group.id).sort().join(",")'),"org_a,org_b");
});

test("conexões formam componentes que podem ser arrastados juntos",() => {
  const run = graphContext();
  run('items=[{id:"a"},{id:"b"},{id:"c"}];relations=[{sourceId:"a",targetId:"b"},{sourceId:"c",targetId:"b"}];groups=FluxosGraph.connectedGroups(items,relations);');
  assert.equal(run('groups.get("a")===groups.get("b") && groups.get("b")===groups.get("c")'),true);
});
