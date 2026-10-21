const FluxosGraph = (() => {
  const colors = {
    red: { fill: "#ffe7e9", stroke: "#b42332" },
    green: { fill: "#cce8d5", stroke: "#115e38" },
    blue: { fill: "#d8f0df", stroke: "#238254" },
    yellow: { fill: "#fff0b8", stroke: "#9f6a00" },
    gray: { fill: "#ebeff2", stroke: "#596872" },
  };

  function projectRoot(item, byId) {
    const seen = new Set();
    let cursor = item;
    while (cursor.parentId && byId.has(cursor.parentId) && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = byId.get(cursor.parentId);
    }
    return cursor;
  }

  function connectedGroups(items, relations) {
    const adjacency = new Map(items.map((item) => [item.id, []]));
    for (const relation of relations) {
      adjacency.get(relation.sourceId)?.push(relation.targetId);
      adjacency.get(relation.targetId)?.push(relation.sourceId);
    }
    const component = new Map();
    for (const item of items) {
      if (component.has(item.id)) continue;
      const queue = [item.id];
      component.set(item.id, item.id);
      for (let index = 0; index < queue.length; index += 1) {
        for (const neighbor of adjacency.get(queue[index]) || []) {
          if (component.has(neighbor)) continue;
          component.set(neighbor, item.id);
          queue.push(neighbor);
        }
      }
    }
    return component;
  }

  function layout(items, relations, grouping, saved, labels) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const connected = connectedGroups(items, relations);
    const groups = new Map();
    const nodes = items.map((item) => {
      const root = labels.project ? labels.project(item) : projectRoot(item, byId);
      const groupId = grouping === "owner" ? item.ownerId || "unassigned"
        : grouping === "organization" ? item.organizationId || "org_unassigned"
        : grouping === "connections" ? connected.get(item.id) : root.id;
      if (!groups.has(groupId)) {
        const name = grouping === "owner" ? labels.owner(item.ownerId)
          : grouping === "organization" ? (item.organizationId ? labels.organization(item.organizationId) : "Sem empresa")
          : grouping === "connections" ? projectRoot(byId.get(groupId), byId).title : root.title;
        groups.set(groupId, { id: groupId, name, nodes: [] });
      }
      const node = { id: item.id, item, groupId, isRoot: !byId.has(item.parentId), radius: byId.has(item.parentId) ? 32 : 40 };
      groups.get(groupId).nodes.push(node);
      return node;
    });
    let rowY = 0;
    let rowHeight = 0;
    let columnX = 0;
    [...groups.values()].forEach((group, index) => {
      if (index % 2 === 0) {
        if (index) rowY += rowHeight + 220;
        columnX = 0;
        rowHeight = 0;
      }
      const size = Math.max(510, Math.ceil(Math.sqrt(group.nodes.length)) * 290);
      group.center = { x: columnX + size / 2, y: rowY + size / 2 };
      columnX += size + 190;
      rowHeight = Math.max(rowHeight, size);
      group.nodes.forEach((node, nodeIndex) => {
        const angle = nodeIndex * Math.PI * 2 / Math.max(group.nodes.length, 1) - Math.PI / 2;
        const radius = node.isRoot ? 0 : 165 + Math.min(group.nodes.length * 15, 185);
        node.x = group.center.x + Math.cos(angle) * radius;
        node.y = group.center.y + Math.sin(angle) * radius;
        const stored = saved?.[node.id];
        if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
          node.x = node.fx = stored.x;
          node.y = node.fy = stored.y;
        }
      });
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const links = relations.filter((relation) => nodeById.has(relation.sourceId) && nodeById.has(relation.targetId))
      .map((relation) => ({ source: relation.sourceId, target: relation.targetId, relation }));
    if (nodes.length) {
      const d3 = FluxosVendor;
      // Simulate once: a stable workspace preserves the user's manual arrangement.
      const simulation = d3.forceSimulation(nodes).stop()
        .force("link", d3.forceLink(links).id((node) => node.id)
           .distance((link) => link.relation.relationType === "contains" ? 275 : 250)
          .strength((link) => link.source.groupId !== link.target.groupId ? 0.005 : link.relation.relationType === "contains" ? 0.13 : 0.35))
         .force("charge", d3.forceManyBody().strength(-720))
         .force("collision", d3.forceCollide().radius(145).iterations(4))
        .force("x", d3.forceX((node) => groups.get(node.groupId).center.x).strength(0.07))
        .force("y", d3.forceY((node) => groups.get(node.groupId).center.y).strength(0.07));
      simulation.tick(220);
    }
    return { nodes, links, groups: [...groups.values()], nodeById, connected };
  }

  function bounds(nodes) {
    return {
      x: Math.min(...nodes.map((node) => node.x)) - 108,
      y: Math.min(...nodes.map((node) => node.y)) - 86,
      right: Math.max(...nodes.map((node) => node.x)) + 108,
      bottom: Math.max(...nodes.map((node) => node.y)) + 207,
    };
  }

  function wrapLabel(title,limit=24){
    const words=String(title||"").trim().split(/\s+/),lines=[""];
    for(const word of words){
      const last=lines.length-1;
      if(lines[last]&&(lines[last]+" "+word).length>limit)lines.push(word);
      else lines[last]+=(lines[last]?" ":"")+word;
    }
    // Nomes completos sempre acessiveis no title/aria-label. Ate 4 linhas no grafo.
    if(lines.length>4)lines.splice(3,lines.length-3,lines.slice(3).join(" ").slice(0,limit-1)+"…");
    return lines.map(line=>line.length>limit?line.slice(0,limit-1)+"…":line);
  }

  function mount(container, options) {
    const model = layout(options.items, options.relations, options.grouping, options.savedPositions, options.labels);
    const esc = options.escape;
    const edgeLanes = new Map();
    model.links.forEach((link) => {
      const key = [link.source.id, link.target.id].sort().join(":");
      const same = model.links.filter((candidate) => [candidate.source.id, candidate.target.id].sort().join(":") === key);
      edgeLanes.set(link.relation.id, same.indexOf(link) - (same.length - 1) / 2);
    });
    container.innerHTML = `
      <svg class="graph-svg" role="group" aria-label="Grafo de processos e suas relações">
        <defs>
          <marker id="graph-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,1 L10,5 L0,9 Z" fill="#286d73"/></marker>
          <marker id="graph-arrow-reverse" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,-4L9,0L0,4" fill="#168b82"/></marker>
          <marker id="graph-arrow-red" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,-4L9,0L0,4" fill="#cf4047"/></marker>
        </defs>
        <g class="graph-scene">
          <g class="graph-groups">${model.groups.map((group) => `<g data-group="${esc(group.id)}"><rect rx="8"/><text class="group-label">${esc(group.name)}</text><text class="group-count">${group.nodes.length} itens</text></g>`).join("")}</g>
          <g class="graph-edges">${model.links.map((link) => `<g data-edge="${esc(link.relation.id)}" class="graph-edge ${link.relation.relationType === "contains" ? "hierarchy" : ""} ${link.relation.relationType === "blocks" ? "blocking" : ""}" role="button" tabindex="0" aria-label="${esc(link.source.item.title)} ${esc(options.labels.relation(link.relation.relationType))} ${esc(link.target.item.title)}"><title>${esc(options.labels.relation(link.relation.relationType))}${link.relation.lagDays ? ` · defasagem ${link.relation.lagDays}d` : ""}</title><path class="edge-hit"/><path class="edge-path" ${link.relation.relationType==="contains"?"":'marker-end="url(#graph-arrow)"'}/><text class="edge-label" text-anchor="middle">${esc(link.relation.relationType === "contains" ? "contém" : link.relation.relationType === "blocks" ? "bloqueia" : link.relation.relationType === "approves" ? "aprova" : link.relation.relationType === "relates_to" ? "conecta" : link.relation.relationType)}${link.relation.lagDays ? ` ${link.relation.lagDays > 0 ? "+" : ""}${link.relation.lagDays}d` : ""}</text></g>`).join("")}</g>
          <path class="prd4-link-preview" visibility="hidden" />
          <g class="graph-nodes">${model.nodes.map((node) => {
            const color = colors[options.labels.signal(node.item)] || colors.gray;
            const typeColor = options.labels.typeColor ? options.labels.typeColor(node.item) : color.stroke;
            const statusColor = options.labels.statusColor ? options.labels.statusColor(node.item) : color.stroke;
            const lines = wrapLabel(node.item.title);
            const number = node.isRoot ? options.labels.type(node.item).slice(0, 1) : String(model.groups.find((group) => group.id === node.groupId).nodes.filter((candidate) => !candidate.isRoot).indexOf(node) + 1).padStart(2, "0");
            return `<g class="graph-node ${node.isRoot ? "root-node" : ""}" data-node="${esc(node.id)}" role="button" tabindex="0" aria-label="${esc(node.item.title)}, ${esc(options.labels.owner(node.item.ownerId))}, ${esc(options.labels.status(node.item))}, ${esc(options.labels.duration(node.item))}">
              <title>${esc(node.item.title)}\n${esc(options.labels.owner(node.item.ownerId))}\n${esc(options.labels.status(node.item))}\nTempo total: ${esc(options.labels.duration(node.item))}\nTempo com responsável atual: ${esc(options.labels.ownerTimer ? options.labels.ownerTimer(node.item) : options.labels.duration(node.item))}\nDuração prevista: ${esc(options.labels.planned(node.item))}\nProgresso: ${esc(options.labels.progress(node.item))}%\nTérmino esperado: ${esc(options.labels.expected(node.item))}\nDesvio: ${esc(options.labels.deviation(node.item))}\nBloqueios: ${esc(options.labels.blockers(node.item))}\nDependências: ${esc(options.labels.dependencies(node.item))}</title>
              <circle class="node-selection" r="${node.radius + 6}"/>
              <circle class="node-circle" r="${node.radius}" fill="${color.fill}" stroke="${esc(statusColor)}"/>
              <text class="node-number" text-anchor="middle" y="5" fill="${esc(typeColor)}">${esc(number)}</text>
              <text class="node-title" text-anchor="middle" xml:space="preserve">${lines.map((line, index) => `<tspan x="0" y="${node.radius + 23 + index * 19}">${esc(line)}</tspan>`).join("")}</text>
              <text class="node-owner" text-anchor="middle" y="${node.radius + 107}">${esc(options.labels.owner(node.item.ownerId).slice(0, 27))}</text>
              <text class="node-status" text-anchor="middle" y="${node.radius + 131}" fill="${esc(statusColor)}">${esc(options.labels.status(node.item))}</text>
              <text class="node-due" text-anchor="middle" y="${node.radius + 148}">Prazo: ${esc(options.labels.idealEnd ? options.labels.idealEnd(node.item) : "—")}</text>
              ${options.labels.hasChildren?.(node.item)?`<g class="graph-collapse-toggle" data-graph-expand="${esc(node.id)}" role="button" tabindex="0" aria-label="${options.labels.isCollapsed?.(node.item)?"Expandir":"Recolher"} subitens de ${esc(node.item.title)}" title="${options.labels.isCollapsed?.(node.item)?"Expandir":"Recolher"} níveis deste item">
                <rect x="${node.radius + 3}" y="-36" width="23" height="23" rx="6"/>
                <text x="${node.radius+14.5}" y="-20" text-anchor="middle">${options.labels.isCollapsed?.(node.item)?"+":"−"}</text>
              </g>`:""}
              ${options.labels.hasChildren?.(node.item)?"":`<circle class="graph-connector" cx="${node.radius + 13}" cy="0" r="11" aria-label="Arraste para conectar" />`}
            </g>`;
          }).join("")}</g>
        </g>
      </svg>`;
    const svg = container.querySelector("svg");
    const scene = svg.querySelector(".graph-scene");
    const connectionPreview = svg.querySelector(".prd4-link-preview");
    const nodeElements = new Map([...svg.querySelectorAll("[data-node]")].map((element) => [element.dataset.node, element]));
    const edgeElements = new Map([...svg.querySelectorAll("[data-edge]")].map((element) => [element.dataset.edge, element]));
    const groupElements = new Map([...svg.querySelectorAll("[data-group]")].map((element) => [element.dataset.group, element]));
    let transform = { x: 0, y: 0, scale: 1 };
    let gesture = null;
    const pointers = new Map();
    let selectedId = options.selectedId;
    let propagationTimers = [];
    let selectedRelationId = "";
    let animationState = null;

    function draw() {
      scene.setAttribute("transform", `translate(${transform.x},${transform.y}) scale(${transform.scale})`);
      nodeElements.forEach((element, id) => {
        const node = model.nodeById.get(id);
        element.setAttribute("transform", `translate(${node.x},${node.y})`);
        element.dataset.x = node.x;
        element.dataset.y = node.y;
      });
      for (const link of model.links) {
        const { source, target } = link;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const bend = (edgeLanes.get(link.relation.id) || 0) * 42;
        const cx = (source.x + target.x) / 2 - dy / distance * bend;
        const cy = (source.y + target.y) / 2 + dx / distance * bend;
        const fromAngle = Math.atan2(cy - source.y, cx - source.x);
        const toAngle = Math.atan2(target.y - cy, target.x - cx);
        const startX = source.x + Math.cos(fromAngle) * (source.radius + 3);
        const startY = source.y + Math.sin(fromAngle) * (source.radius + 3);
        const endX = target.x - Math.cos(toAngle) * (target.radius + 6);
        const endY = target.y - Math.sin(toAngle) * (target.radius + 6);
        const path = `M${startX},${startY} Q${cx},${cy} ${endX},${endY}`;
        const element = edgeElements.get(link.relation.id);
        element.querySelectorAll("path").forEach((child) => child.setAttribute("d", path));
        const label = element.querySelector("text");
        label.setAttribute("x", (startX + 2 * cx + endX) / 4);
        label.setAttribute("y", (startY + 2 * cy + endY) / 4 - 9);
      }
      for (const group of model.groups) {
        const box = bounds(group.nodes);
        const element = groupElements.get(group.id);
        const rect = element.querySelector("rect");
        Object.entries({ x: box.x, y: box.y, width: box.right - box.x, height: box.bottom - box.y }).forEach(([key, value]) => rect.setAttribute(key, value));
        const label = element.querySelector(".group-label");
        label.setAttribute("x", box.x + 18);
        label.setAttribute("y", box.y + 25);
        const count = element.querySelector(".group-count");
        count.setAttribute("x", box.right - 18);
        count.setAttribute("y", box.y + 25);
      }
      if (options.onZoom) options.onZoom(Math.round(transform.scale * 100));
    }

    function select(id) {
      selectedId = id;
      selectMany(id ? [id] : []);
    }

    function selectMany(ids) {
      const selected = new Set(ids.filter((id) => model.nodeById.has(id)));
      const related = new Set(selected);
      model.links.forEach((link) => {
        if (selected.has(link.source.id)) related.add(link.target.id);
        if (selected.has(link.target.id)) related.add(link.source.id);
      });
      nodeElements.forEach((element, nodeId) => {
        element.classList.toggle("selected", selected.has(nodeId));
        element.classList.toggle("dimmed", selected.size > 0 && !related.has(nodeId));
      });
      edgeElements.forEach((element, edgeId) => {
        const link = model.links.find((candidate) => candidate.relation.id === edgeId);
        element.classList.toggle("dimmed", selected.size > 0 && !selected.has(link.source.id) && !selected.has(link.target.id));
      });
    }

    function clearAnimation() {
      propagationTimers.forEach(clearTimeout);
      propagationTimers=[];
      nodeElements.forEach(el=>el.classList.remove("propagation-active","propagation-current","propagation-stop"));
      edgeElements.forEach(el=>el.classList.remove("propagation-active","propagation-reverse"));
      svg.querySelectorAll(".prd4-traversal-label").forEach(el=>el.remove());
    }

    function hasFlowBlocker(id) {
      const item=model.nodeById.get(id)?.item;
      return item?.status==="blocked" || Boolean(item?.inheritedBlockedFrom?.length);
    }

    function animationPath(rootId,layoutMode) {
      const items=options.items,byId=new Map(items.map(item=>[item.id,item]));
      const orderIndex=new Map(items.map((item,index)=>[item.id,index]));
      const children=new Map();
      for(const item of items){
        if(item.parentId && byId.has(item.parentId)){
          if(!children.has(item.parentId))children.set(item.parentId,[]);
          children.get(item.parentId).push(item);
        }
      }
      const visual=(a,b)=>Number(a.sortOrder??0)-Number(b.sortOrder??0)||orderIndex.get(a.id)-orderIndex.get(b.id);
      const preliminary=[],visited=new Set();
      function traverse(id) {
        if(visited.has(id))return;
        visited.add(id);preliminary.push(id);
        for(const child of [...(children.get(id)||[])].sort(visual))traverse(child.id);
      }
      traverse(rootId);
      const active=new Set(preliminary);
      const dependencies=model.links.filter(link=>(link.relation.relationType==="TI" || link.relation.relationType==="contains")
        && active.has(link.source.id) && active.has(link.target.id));
      const outgoing=new Map(preliminary.map(id=>[id,[]]));
      const indegree=new Map(preliminary.map(id=>[id,0]));
      const levels=new Map(preliminary.map(id=>[id,0]));
      for(const link of dependencies){
        outgoing.get(link.source.id).push(link.target.id);
        indegree.set(link.target.id,indegree.get(link.target.id)+1);
      }
      const remaining=new Set(preliminary),sorted=[],preferred=[];
      while(remaining.size){
        let next=preferred.find(id=>remaining.has(id)&&indegree.get(id)===0)
          ||preliminary.find(id=>remaining.has(id)&&indegree.get(id)===0);
        if(!next)next=preliminary.find(id=>remaining.has(id)); // invalid legacy graph; never loop infinitely
        sorted.push(next);remaining.delete(next);
        const pending=preferred.indexOf(next);
        if(pending>=0)preferred.splice(pending,1);
        const childPriority=dependencies.filter(link=>link.source.id===next && link.relation.relationType==="contains").map(link=>link.target.id);
        const temporalPriority=dependencies.filter(link=>link.source.id===next && link.relation.relationType==="TI").map(link=>link.target.id);
        preferred.unshift(...[...childPriority,...temporalPriority].filter(id=>remaining.has(id)&&!preferred.includes(id)));
        for(const to of outgoing.get(next)){
          indegree.set(to,indegree.get(to)-1);
          levels.set(to,Math.max(levels.get(to),levels.get(next)+1));
        }
      }
      // Edges are the only allowed visual routes. Containment is traversable
      // in both directions; temporal links only in their forward direction.
      const adjacent=new Map(preliminary.map(id=>[id,[]]));
      for(const link of model.links){
        if(!active.has(link.source.id)||!active.has(link.target.id))continue;
        if(link.relation.relationType==="contains"){
          adjacent.get(link.source.id).push({id:link.target.id,edgeId:link.relation.id});
          adjacent.get(link.target.id).push({id:link.source.id,edgeId:link.relation.id});
        } else if(link.relation.relationType==="TI"){
          adjacent.get(link.source.id).push({id:link.target.id,edgeId:link.relation.id});
        }
      }
      function route(from,to){
        if(from===to)return [];
        const current=byId.get(from),target=byId.get(to);
        // The sibling temporal link is preferred over an unnecessary return.
        const direct=adjacent.get(from)?.find(edge=>edge.id===to
          && model.links.some(link=>link.relation.id===edge.edgeId && link.relation.relationType==="TI"));
        if(direct && current?.parentId===target?.parentId)return [{nodeId:to,edgeId:direct.edgeId}];
        // On a branch transition first return to the immediate parent. A
        // downward containment move is not a branch transition.
        let origin=from,prefix=[];
        if(current?.parentId && current.parentId!==target?.parentId && target?.parentId!==from){
          const back=adjacent.get(from)?.find(edge=>edge.id===current.parentId);
          if(back){prefix=[{nodeId:current.parentId,edgeId:back.edgeId}];origin=current.parentId;}
        }
        if(origin===to)return prefix;
        const queue=[{id:origin,path:prefix}],seen=new Set([origin]);
        while(queue.length){
          const entry=queue.shift();
          const edges=[...(adjacent.get(entry.id)||[])].sort((x,y)=>{
            const px=byId.get(entry.id)?.parentId;
            return Number(y.id===px)-Number(x.id===px);
          });
          for(const edge of edges){
            if(seen.has(edge.id))continue;
            const path=[...entry.path,{nodeId:edge.id,edgeId:edge.edgeId}];
            if(edge.id===to)return path;
            seen.add(edge.id);queue.push({id:edge.id,path});
          }
        }
        // Separate disconnected projects cannot be linked by invented edges.
        return [{nodeId:to,edgeId:""}];
      }
      const steps=[];
      if(layoutMode==="parallel"){
        const waves=new Map();
        for(const id of sorted){
          const level=levels.get(id);
          if(!waves.has(level))waves.set(level,[]);
          waves.get(level).push(id);
        }
        for(const [,ids] of [...waves].sort((a,b)=>a[0]-b[0])){
          const edges=model.links.filter(link=>ids.includes(link.target.id)
            && active.has(link.source.id)
            && ["TI","contains"].includes(link.relation.relationType)).map(link=>link.relation.id);
          steps.push({nodeIds:ids,edgeIds:edges});
        }
      } else {
        let previous="";
        for(const id of sorted){
          const nextSteps=previous ? route(previous,id) : [{nodeId:id,edgeId:""}];
          for(const entry of nextSteps){
            if(entry.nodeId===previous)continue;
            const link=entry.edgeId ? model.links.find(link=>link.relation.id===entry.edgeId) : null;
            const reverse=link && link.target.id===previous && link.source.id===entry.nodeId;
            steps.push({nodeIds:[entry.nodeId],edgeIds:entry.edgeId?[entry.edgeId]:[],
              reverseEdgeIds:reverse?[entry.edgeId]:[]});
            previous=entry.nodeId;
          }
        }
      }
      return steps;
    }

    function highlightTraversalPath(edgeIds) {
      const active = new Set(edgeIds || []);
      edgeElements.forEach((el,id) => el.classList.toggle("propagation-path", active.has(id)));
    }

    function animateNext() {
      if(!animationState || animationState.paused)return;
      if(animationState.index>=animationState.steps.length){
        animationState.paused=true;
        return;
      }
      const step=animationState.steps[animationState.index++];
      nodeElements.forEach(el=>el.classList.remove("propagation-current"));
      for(const id of step.nodeIds){
        const el=nodeElements.get(id);
        el?.classList.add("propagation-active","propagation-current");
        if(hasFlowBlocker(id))el?.classList.add("propagation-stop");
        if(el){
          let label=el.querySelector(".prd4-traversal-label");
          if(!label){
            label=document.createElementNS("http://www.w3.org/2000/svg","text");
            label.setAttribute("class","prd4-traversal-label");
            label.setAttribute("x",String(model.nodeById.get(id).radius+19));
            label.setAttribute("y","-14");
            el.appendChild(label);
          }
          label.textContent=String(animationState.index);
        }
      }
      highlightTraversalPath(step.edgeIds);
      for(const id of step.edgeIds){
        const el=edgeElements.get(id);el?.classList.add("propagation-active");
        el?.classList.toggle("propagation-reverse",Boolean(step.reverseEdgeIds?.includes(id)));
      }
      if(animationState.stopAtBlocked && step.nodeIds.some(hasFlowBlocker)){
        animationState.paused=true;
        options.onStopAtBlocker?.(step.nodeIds.filter(hasFlowBlocker));
        return;
      }
      propagationTimers.push(setTimeout(animateNext,550));
    }

    function propagate(id,mode="sequential",stopAtBlocked=false) {
      if(!model.nodeById.has(id))return false;
      if(animationState?.paused && animationState.root===id
         && animationState.mode===mode && animationState.stopAtBlocked===stopAtBlocked
         && animationState.index<animationState.steps.length){
        animationState.paused=false;animateNext();return true;
      }
      clearAnimation();
      const byId=new Map(options.items.map(item=>[item.id,item]));
      let root=byId.get(id),seen=new Set();
      while(root?.parentId && byId.has(root.parentId)&&!seen.has(root.id)){
        seen.add(root.id);root=byId.get(root.parentId);
      }
      if(!root)return false;
      animationState={root:id,mode,stopAtBlocked,paused:false,index:0,
        steps:animationPath(root.id,mode)};
      animateNext();
      return true;
    }

    function pause() {
      if(!animationState)return;
      animationState.paused=true;
      propagationTimers.forEach(clearTimeout);propagationTimers=[];
    }
    function restart() {
      if(!animationState)return;
      const {root,mode,stopAtBlocked}=animationState;
      animationState=null;
      return propagate(root,mode,stopAtBlocked);
    }

    function fit(initial = false) {
      if (!model.nodes.length) return;
      const viewport = container.getBoundingClientRect();
      const box = bounds(model.nodes);
      const scale = Math.min(1.15, (viewport.width - 40) / (box.right - box.x), (viewport.height - 72) / (box.bottom - box.y));
      if (initial && viewport.width < 640) {
        const root = model.nodes.find((node) => node.isRoot) || model.nodes[0];
        transform = { scale: 0.8, x: viewport.width / 2 - root.x * 0.8, y: viewport.height * 0.37 - root.y * 0.8 };
      } else {
        transform = { scale: Math.max(0.12, scale), x: viewport.width / 2 - (box.x + box.right) / 2 * scale, y: (viewport.height - 36) / 2 - (box.y + box.bottom) / 2 * scale };
      }
      draw();
    }

    function zoom(factor, point) {
      const viewport = container.getBoundingClientRect();
      const anchor = point || { x: viewport.width / 2, y: viewport.height / 2 };
      const newScale = Math.max(0.12, Math.min(2.5, transform.scale * factor));
      const ratio = newScale / transform.scale;
      transform.x = anchor.x - (anchor.x - transform.x) * ratio;
      transform.y = anchor.y - (anchor.y - transform.y) * ratio;
      transform.scale = newScale;
      draw();
    }

    function localPoint(event) {
      const viewport = container.getBoundingClientRect();
      return { x: event.clientX - viewport.left, y: event.clientY - viewport.top };
    }

    function savePositions() {
      options.onPositions(Object.fromEntries(model.nodes.map((node) => [node.id, { x: node.x, y: node.y }])));
    }

    svg.addEventListener("pointerdown", (event) => {
      if(event.button!==0)return;
      const expand=event.target.closest("[data-graph-expand]");
      if(expand){event.preventDefault();event.stopPropagation();options.onToggleCollapse?.(expand.dataset.graphExpand);return;}
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      svg.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gesture = { kind: "pinch", distance: Math.hypot(b.x - a.x, b.y - a.y), transform: { ...transform }, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        return;
      }
      const target = event.target.closest("[data-node]");
      const edge = event.target.closest("[data-edge]");
      const group = !target && event.target.closest("[data-group]");
      if (target?.querySelector && event.target.closest(".graph-connector")) {
        gesture={kind:"link",id:target.dataset.node,start:point,moved:false};
        connectionPreview.setAttribute("visibility","visible");
      } else if (target) {
        const id = target.dataset.node;
        // Controlled PRD3 magnetism attempt: the selected node follows the pointer;
        // linked nodes respond proportionally by graph distance without force re-simulation.
        const distanceById = new Map([[id, 0]]);
        const queue = [id];
        while (queue.length) {
          const currentId = queue.shift();
          for (const link of model.links) {
            const neighborId = link.source.id === currentId ? link.target.id
              : link.target.id === currentId ? link.source.id : "";
            if (neighborId && !distanceById.has(neighborId)) {
              distanceById.set(neighborId, distanceById.get(currentId) + 1);
              queue.push(neighborId);
            }
          }
        }
        gesture = {
          kind: "nodes", id, start: point,
          nodes: [...distanceById].map(([nodeId, distance]) => {
            const node = model.nodeById.get(nodeId);
            return { id: nodeId, x: node.x, y: node.y, influence: distance === 0 ? 1 : Math.max(0.08, Math.pow(0.32, distance)) };
          }),
          moved: false,
        };
      } else if (group) {
        const groupNodes = model.groups.find((entry) => entry.id === group.dataset.group)?.nodes || [];
        gesture = { kind: "group", id: group.dataset.group, start: point, nodes: groupNodes.map((node) => ({ id: node.id, x: node.x, y: node.y })), moved: false };
      } else gesture = { kind: "pan", start: point, origin: { ...transform }, moved: false, edgeId: edge?.dataset.edge };
      svg.classList.add("dragging");
    });
    svg.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      if (gesture.kind === "pinch") {
        const [a, b] = [...pointers.values()];
        if (!b) return;
        const newScale = Math.max(0.12, Math.min(2.5, gesture.transform.scale * Math.hypot(b.x - a.x, b.y - a.y) / Math.max(gesture.distance, 1)));
        const ratio = newScale / gesture.transform.scale;
        transform = { scale: newScale, x: (a.x + b.x) / 2 - (gesture.center.x - gesture.transform.x) * ratio, y: (a.y + b.y) / 2 - (gesture.center.y - gesture.transform.y) * ratio };
      } else if(gesture.kind==="link") {
        const source=model.nodeById.get(gesture.id);
        const x=(point.x-transform.x)/transform.scale,y=(point.y-transform.y)/transform.scale;
        connectionPreview.setAttribute("d",`M${source.x+source.radius+13},${source.y} L${x},${y}`);
        if(Math.hypot(point.x-gesture.start.x,point.y-gesture.start.y)>4)gesture.moved=true;
      } else {
        const dx = point.x - gesture.start.x;
        const dy = point.y - gesture.start.y;
        if (Math.hypot(dx, dy) > 4) gesture.moved = true;
        if (gesture.kind === "nodes" || gesture.kind === "group") {
          for (const origin of gesture.nodes) {
            const node = model.nodeById.get(origin.id);
            const influence = gesture.kind === "nodes" ? origin.influence ?? 1 : 1;
            node.x = origin.x + dx / transform.scale * influence;
            node.y = origin.y + dy / transform.scale * influence;
          }
        } else {
          transform.x = gesture.origin.x + dx;
          transform.y = gesture.origin.y + dy;
        }
      }
      draw();
    });
    function finish(event, cancelled = false) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      const completed = gesture;
      gesture = null;
      svg.classList.remove("dragging");
      if(completed?.kind==="link") {
        connectionPreview.setAttribute("visibility","hidden");
        if(!cancelled){
          const point=localPoint(event), x=(point.x-transform.x)/transform.scale,y=(point.y-transform.y)/transform.scale;
          const destination=[...model.nodeById.values()].find(node=>node.id!==completed.id && Math.hypot(node.x-x,node.y-y)<=node.radius+15);
          if(destination) options.onCreateRelation?.(completed.id,destination.id);
        }
      } else if (completed?.kind === "nodes" || completed?.kind === "group") {
        if (completed.moved) savePositions();
        else if (!cancelled && completed.kind === "nodes") { select(completed.id); options.onSelect(completed.id); }
      } else if (completed?.kind === "pan" && !completed.moved && !cancelled) {
        if (completed.edgeId) {
          const link = model.links.find((candidate) => candidate.relation.id === completed.edgeId);
          selectedRelationId=link.relation.id;
          edgeElements.forEach((element,id)=>element.classList.toggle("prd4-edge-selected",id===selectedRelationId));
          options.onRelation(link.relation);
        } else select("");
      }
    }
    svg.addEventListener("keydown",event=>{
      const toggle=event.target.closest("[data-graph-expand]");
      if(toggle && (event.key==="Enter"||event.key===" ")){
        event.preventDefault();options.onToggleCollapse?.(toggle.dataset.graphExpand);
      }
    });
    svg.addEventListener("pointerup", (event) => finish(event));
    svg.addEventListener("pointercancel", (event) => finish(event, true));
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoom(Math.exp(-event.deltaY * 0.0015), localPoint(event));
    }, { passive: false });
    svg.addEventListener("keydown", (event) => {
      const nodeElement = event.target.closest("[data-node]");
      const edge = event.target.closest("[data-edge]");
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (nodeElement) { select(nodeElement.dataset.node); options.onSelect(nodeElement.dataset.node); }
        else if (edge) {selectedRelationId=edge.dataset.edge;edgeElements.forEach((element,id)=>element.classList.toggle("prd4-edge-selected",id===selectedRelationId));options.onRelation(model.links.find((link) => link.relation.id === edge.dataset.edge).relation);}
      } else if (nodeElement && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const node = model.nodeById.get(nodeElement.dataset.node);
        node.x += event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0;
        node.y += event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0;
        draw();
        savePositions();
      }
    });
    const onDeleteKey=(event)=>{
      if(!["Delete","Backspace"].includes(event.key)||!selectedRelationId)return;
      const focused=document.activeElement;
      if(focused?.matches?.("input,textarea,select,[contenteditable=true]"))return;
      const rel=model.links.find(link=>link.relation.id===selectedRelationId)?.relation;
      if(rel?.relationType==="TI"){
        event.preventDefault();options.onDeleteRelation?.(selectedRelationId);
        selectedRelationId="";
      }
    };
    document.addEventListener("keydown",onDeleteKey);
    let lastViewportSize={w:Math.round(container.getBoundingClientRect().width),h:Math.round(container.getBoundingClientRect().height)};
    const observer = new ResizeObserver(() => {
      const bounds=container.getBoundingClientRect(),w=Math.round(bounds.width),h=Math.round(bounds.height);
      const resized=Math.abs(w-lastViewportSize.w)>8||Math.abs(h-lastViewportSize.h)>8;
      lastViewportSize={w,h};
      if(resized && model.nodes.length && !animationState)fit();
      else draw();
    });
    observer.observe(container);
    if (options.initialTransform) { transform = { ...options.initialTransform }; draw(); }
    else fit(true);
    select(selectedId);
    return { fit, zoom, select, selectMany, propagate, pause, restart, destroy: () => { propagationTimers.forEach(clearTimeout); document.removeEventListener("keydown",onDeleteKey); observer.disconnect(); }, model, getTransform: () => ({ ...transform }) };
  }

  return { layout, mount, connectedGroups, projectRoot };
})();
