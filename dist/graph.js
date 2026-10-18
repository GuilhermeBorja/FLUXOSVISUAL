const FluxosGraph = (() => {
  const colors = {
    red: { fill: "#ffeded", stroke: "#cf4047" },
    green: { fill: "#e4f6eb", stroke: "#26905a" },
    blue: { fill: "#e8f1ff", stroke: "#3879ca" },
    yellow: { fill: "#fff5d8", stroke: "#c69b2d" },
    gray: { fill: "#f0f1f3", stroke: "#939aa5" },
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
        if (index) rowY += rowHeight + 180;
        columnX = 0;
        rowHeight = 0;
      }
      const size = Math.max(450, Math.ceil(Math.sqrt(group.nodes.length)) * 210);
      group.center = { x: columnX + size / 2, y: rowY + size / 2 };
      columnX += size + 150;
      rowHeight = Math.max(rowHeight, size);
      group.nodes.forEach((node, nodeIndex) => {
        const angle = nodeIndex * Math.PI * 2 / Math.max(group.nodes.length, 1) - Math.PI / 2;
        const radius = node.isRoot ? 0 : 130 + group.nodes.length * 11;
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
          .distance((link) => link.relation.relationType === "contains" ? 235 : 205)
          .strength((link) => link.source.groupId !== link.target.groupId ? 0.005 : link.relation.relationType === "contains" ? 0.13 : 0.35))
        .force("charge", d3.forceManyBody().strength(-470))
        .force("collision", d3.forceCollide().radius(112).iterations(3))
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
      bottom: Math.max(...nodes.map((node) => node.y)) + 145,
    };
  }

  function wrapLabel(title, limit = 19) {
    const words = title.split(/\s+/);
    const lines = [""];
    for (const word of words) {
      const last = lines.length - 1;
      if (lines[last] && (lines[last] + " " + word).length > limit) lines.push(word);
      else lines[last] += (lines[last] ? " " : "") + word;
    }
    if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(" ").slice(0, limit - 3) + "...");
    return lines.map((line) => line.length > limit ? line.slice(0, limit - 3) + "..." : line);
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
          <marker id="graph-arrow" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,-4L9,0L0,4" fill="#a0a7b1"/></marker>
          <marker id="graph-arrow-red" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,-4L9,0L0,4" fill="#cf4047"/></marker>
        </defs>
        <g class="graph-scene">
          <g class="graph-groups">${model.groups.map((group) => `<g data-group="${esc(group.id)}"><rect rx="8"/><text class="group-label">${esc(group.name)}</text><text class="group-count">${group.nodes.length} itens</text></g>`).join("")}</g>
          <g class="graph-edges">${model.links.map((link) => `<g data-edge="${esc(link.relation.id)}" class="graph-edge ${link.relation.relationType === "contains" ? "hierarchy" : ""} ${link.relation.relationType === "blocks" ? "blocking" : ""}" role="button" tabindex="0" aria-label="${esc(link.source.item.title)} ${esc(options.labels.relation(link.relation.relationType))} ${esc(link.target.item.title)}"><title>${esc(options.labels.relation(link.relation.relationType))}${link.relation.lagDays ? ` · defasagem ${link.relation.lagDays}d` : ""}</title><path class="edge-hit"/><path class="edge-path" marker-end="url(#${link.relation.relationType === "blocks" ? "graph-arrow-red" : "graph-arrow"})"/><text class="edge-label" text-anchor="middle">${esc(link.relation.relationType === "contains" ? "contém" : link.relation.relationType === "blocks" ? "bloqueia" : link.relation.relationType === "approves" ? "aprova" : link.relation.relationType === "relates_to" ? "conecta" : link.relation.relationType)}${link.relation.lagDays ? ` ${link.relation.lagDays > 0 ? "+" : ""}${link.relation.lagDays}d` : ""}</text></g>`).join("")}</g>
          <g class="graph-nodes">${model.nodes.map((node) => {
            const color = colors[options.labels.signal(node.item)] || colors.gray;
            const typeColor = options.labels.typeColor ? options.labels.typeColor(node.item) : color.stroke;
            const lines = wrapLabel(node.item.title);
            const number = node.isRoot ? options.labels.type(node.item).slice(0, 1) : String(model.groups.find((group) => group.id === node.groupId).nodes.filter((candidate) => !candidate.isRoot).indexOf(node) + 1).padStart(2, "0");
            return `<g class="graph-node ${node.isRoot ? "root-node" : ""}" data-node="${esc(node.id)}" role="button" tabindex="0" aria-label="${esc(node.item.title)}, ${esc(options.labels.owner(node.item.ownerId))}, ${esc(options.labels.status(node.item))}, ${esc(options.labels.duration(node.item))}">
              <title>${esc(node.item.title)}\n${esc(options.labels.owner(node.item.ownerId))}\n${esc(options.labels.status(node.item))}\nTempo total: ${esc(options.labels.duration(node.item))}\nDuração prevista: ${esc(options.labels.planned(node.item))}\nProgresso: ${esc(options.labels.progress(node.item))}%\nTérmino esperado: ${esc(options.labels.expected(node.item))}\nDesvio: ${esc(options.labels.deviation(node.item))}\nBloqueios: ${esc(options.labels.blockers(node.item))}\nDependências: ${esc(options.labels.dependencies(node.item))}</title>
              <circle class="node-selection" r="${node.radius + 6}"/>
              <circle class="node-circle" r="${node.radius}" fill="${color.fill}" stroke="${esc(typeColor)}"/>
              <text class="node-number" text-anchor="middle" y="5" fill="${esc(typeColor)}">${esc(number)}</text>
              <text class="node-title" text-anchor="middle">${lines.map((line, index) => `<tspan x="0" y="${node.radius + 23 + index * 19}">${esc(line)}</tspan>`).join("")}</text>
              <text class="node-owner" text-anchor="middle" y="${node.radius + 64}">${esc(options.labels.owner(node.item.ownerId).slice(0, 27))}</text>
              <text class="node-duration" text-anchor="middle" y="${node.radius + 84}">Total ${esc(options.labels.duration(node.item))}</text>
              <text class="node-status" text-anchor="middle" y="${node.radius + 103}" fill="${color.stroke}">${esc(options.labels.status(node.item))}</text>
            </g>`;
          }).join("")}</g>
        </g>
      </svg>`;
    const svg = container.querySelector("svg");
    const scene = svg.querySelector(".graph-scene");
    const nodeElements = new Map([...svg.querySelectorAll("[data-node]")].map((element) => [element.dataset.node, element]));
    const edgeElements = new Map([...svg.querySelectorAll("[data-edge]")].map((element) => [element.dataset.edge, element]));
    const groupElements = new Map([...svg.querySelectorAll("[data-group]")].map((element) => [element.dataset.group, element]));
    let transform = { x: 0, y: 0, scale: 1 };
    let gesture = null;
    const pointers = new Map();
    let selectedId = options.selectedId;
    let propagationTimers = [];

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

    function propagate(id) {
      propagationTimers.forEach(clearTimeout);
      propagationTimers = [];
      nodeElements.forEach((element) => element.classList.remove("propagation-active","propagation-current","propagation-stop"));
      edgeElements.forEach((element) => element.classList.remove("propagation-active"));
      if (!model.nodeById.has(id)) return false;
      const path = [];
      const visited = new Set();
      let cursor = id;
      const flowTypes = new Set(["contains","TI","II","TT","IF","blocks","approves"]);
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const item = model.nodeById.get(cursor)?.item;
        const entry = {nodeId:cursor};
        path.push(entry);
        if (item?.status === "blocked") break;
        const next = model.links.find((link) => link.source.id === cursor && flowTypes.has(link.relation.relationType) && !visited.has(link.target.id));
        if (!next) break;
        entry.edgeId = next.relation.id;
        cursor = next.target.id;
      }
      path.forEach((entry,index) => {
        propagationTimers.push(setTimeout(() => {
          nodeElements.forEach((element) => element.classList.remove("propagation-current"));
          nodeElements.get(entry.nodeId)?.classList.add("propagation-active","propagation-current");
          if (entry.edgeId) edgeElements.get(entry.edgeId)?.classList.add("propagation-active");
          if (model.nodeById.get(entry.nodeId)?.item.status === "blocked") nodeElements.get(entry.nodeId)?.classList.add("propagation-stop");
        },index * 430));
      });
      propagationTimers.push(setTimeout(() => {
        nodeElements.forEach((element) => element.classList.remove("propagation-active","propagation-current","propagation-stop"));
        edgeElements.forEach((element) => element.classList.remove("propagation-active"));
        propagationTimers = [];
      },path.length * 430 + 1800));
      return true;
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
      if (event.button !== 0) return;
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
      if (target) {
        const id = target.dataset.node;
        const componentId = model.connected.get(id);
        const nodes = model.nodes.filter((node) => model.connected.get(node.id) === componentId);
        gesture = { kind: "nodes", id, start: point, nodes: nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })), moved: false };
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
      } else {
        const dx = point.x - gesture.start.x;
        const dy = point.y - gesture.start.y;
        if (Math.hypot(dx, dy) > 4) gesture.moved = true;
        if (gesture.kind === "nodes" || gesture.kind === "group") {
          for (const origin of gesture.nodes) {
            const node = model.nodeById.get(origin.id);
            node.x = origin.x + dx / transform.scale;
            node.y = origin.y + dy / transform.scale;
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
      if (completed?.kind === "nodes" || completed?.kind === "group") {
        if (completed.moved) savePositions();
        else if (!cancelled && completed.kind === "nodes") { select(completed.id); options.onSelect(completed.id); }
      } else if (completed?.kind === "pan" && !completed.moved && !cancelled) {
        if (completed.edgeId) {
          const link = model.links.find((candidate) => candidate.relation.id === completed.edgeId);
          options.onRelation(link.relation);
        } else select("");
      }
    }
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
        else if (edge) options.onRelation(model.links.find((link) => link.relation.id === edge.dataset.edge).relation);
      } else if (nodeElement && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const node = model.nodeById.get(nodeElement.dataset.node);
        node.x += event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0;
        node.y += event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0;
        draw();
        savePositions();
      }
    });
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    if (options.initialTransform) { transform = { ...options.initialTransform }; draw(); }
    else fit(true);
    select(selectedId);
    return { fit, zoom, select, selectMany, propagate, destroy: () => { propagationTimers.forEach(clearTimeout); observer.disconnect(); }, model, getTransform: () => ({ ...transform }) };
  }

  return { layout, mount, connectedGroups, projectRoot };
})();
