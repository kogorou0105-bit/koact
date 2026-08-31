(() => {
  const MAX_EVENTS = 100;
  const MAX_GRAPH_NODES = 250;
  const MAX_GRAPH_SNAPSHOTS = 20;

  const eventDescriptors = {
    "update-scheduled": { code: "S", label: "Scheduled" },
    "render-start": { code: "R", label: "Render started" },
    "render-yield": { code: "Y", label: "Yielded" },
    "render-abort": { code: "A", label: "Aborted" },
    commit: { code: "C", label: "Committed" },
  };

  const laneDescriptors = {
    0: { label: "No lane", color: "#94a3b8" },
    1: { label: "Sync", color: "#f43f5e" },
    2: { label: "Default", color: "#0ea5e9" },
    4: { label: "Transition", color: "#8b5cf6" },
  };

  const state = {
    events: [],
    nextEventId: 1,
    selectedEventId: null,
    graphDefinition: null,
    graphEntry: null,
    graphRenderToken: 0,
    graphSnapshotTimer: null,
    pendingGraphEntry: null,
    mermaid: null,
    mermaidInitialized: false,
    mermaidPromise: null,
    timelineRenderScheduled: false,
    scale: 1,
    translateX: 0,
    translateY: 0,
    isGraphDragging: false,
    lastGraphX: 0,
    lastGraphY: 0,
    isPanelDragging: false,
    panelOffsetX: 0,
    panelOffsetY: 0,
  };

  const floatingButton = document.createElement("button");
  floatingButton.id = "koact-devtools-button";
  floatingButton.type = "button";
  floatingButton.setAttribute("aria-label", "Open Koact DevTools");
  floatingButton.innerHTML = '<span aria-hidden="true">K</span><i></i>';

  const panel = document.createElement("section");
  panel.id = "koact-devtools-panel";
  panel.setAttribute("aria-label", "Koact DevTools");
  panel.innerHTML = `
    <header id="koact-devtools-header">
      <div class="koact-brand">
        <span class="koact-brand-mark">K</span>
        <span class="koact-brand-copy">
          <strong>Koact Scheduler</strong>
          <small id="koact-live-status">Waiting for updates</small>
        </span>
      </div>
      <div class="koact-header-actions">
        <button id="koact-clear-events" type="button">Clear</button>
        <button id="koact-reset-view" type="button">Fit</button>
        <button id="koact-close-panel" type="button" aria-label="Close Koact DevTools">&times;</button>
      </div>
    </header>
    <div class="koact-workspace">
      <aside class="koact-timeline-pane">
        <div class="koact-pane-heading">
          <span>Event stream</span>
          <output id="koact-event-count">0</output>
        </div>
        <ol id="koact-event-list" aria-label="Scheduler events"></ol>
        <div id="koact-event-empty" class="koact-empty-state">
          <strong>No scheduler events yet</strong>
          <span>Interact with the application to capture work.</span>
        </div>
      </aside>
      <main class="koact-graph-pane">
        <div class="koact-graph-heading">
          <div>
            <span class="koact-eyebrow">Committed tree</span>
            <strong id="koact-graph-title">No commit captured</strong>
          </div>
          <div class="koact-lane-legend" aria-label="Lane colors">
            <span style="--lane-color: #f43f5e">Sync</span>
            <span style="--lane-color: #0ea5e9">Default</span>
            <span style="--lane-color: #8b5cf6">Transition</span>
          </div>
        </div>
        <div id="koact-graph-viewport">
          <div id="koact-graph-empty" class="koact-empty-state">
            <strong>Tree snapshot unavailable</strong>
            <span>The latest committed Fiber tree will appear here.</span>
          </div>
          <div id="koact-graph-canvas"></div>
          <output id="koact-zoom-level">100%</output>
        </div>
      </main>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #koact-devtools-button {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 9998;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 15px;
      background: #111827;
      color: #f8fafc;
      box-shadow: 0 15px 35px rgba(15, 23, 42, 0.3);
      cursor: pointer;
      font: 800 20px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }

    #koact-devtools-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.4);
    }

    #koact-devtools-button i {
      position: absolute;
      right: 7px;
      top: 7px;
      width: 7px;
      height: 7px;
      border: 2px solid #111827;
      border-radius: 999px;
      background: #22c55e;
    }

    #koact-devtools-panel {
      position: fixed;
      right: 22px;
      bottom: 82px;
      z-index: 9999;
      display: none;
      width: min(940px, calc(100vw - 44px));
      height: min(620px, calc(100vh - 112px));
      min-width: 520px;
      min-height: 360px;
      overflow: hidden;
      border: 1px solid #263248;
      border-radius: 16px;
      background: #f8fafc;
      box-shadow: 0 28px 70px rgba(15, 23, 42, 0.32);
      color: #172033;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #koact-devtools-panel * {
      box-sizing: border-box;
    }

    #koact-devtools-header {
      height: 62px;
      padding: 0 14px 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: #111827;
      color: #f8fafc;
      cursor: move;
      user-select: none;
    }

    .koact-brand,
    .koact-brand-copy,
    .koact-header-actions,
    .koact-pane-heading,
    .koact-graph-heading,
    .koact-event-topline,
    .koact-event-metadata,
    .koact-lane-legend {
      display: flex;
      align-items: center;
    }

    .koact-brand {
      min-width: 0;
      gap: 10px;
    }

    .koact-brand-mark {
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      border: 1px solid #475569;
      border-radius: 10px;
      background: #1e293b;
      color: #c4b5fd;
      font: 800 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .koact-brand-copy {
      min-width: 0;
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }

    .koact-brand-copy strong {
      font-size: 14px;
      letter-spacing: 0.01em;
    }

    .koact-brand-copy small {
      max-width: 330px;
      overflow: hidden;
      color: #94a3b8;
      font: 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .koact-header-actions {
      gap: 7px;
    }

    .koact-header-actions button {
      height: 30px;
      padding: 0 10px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #1e293b;
      color: #cbd5e1;
      cursor: pointer;
      font: 600 11px/1 ui-sans-serif, sans-serif;
    }

    .koact-header-actions button:hover {
      border-color: #64748b;
      color: #fff;
    }

    #koact-close-panel {
      width: 30px;
      padding: 0;
      font-size: 20px;
      font-weight: 400;
    }

    .koact-workspace {
      display: grid;
      grid-template-columns: 310px minmax(0, 1fr);
      height: calc(100% - 62px);
    }

    .koact-timeline-pane {
      position: relative;
      min-width: 0;
      overflow: hidden;
      border-right: 1px solid #dbe3ee;
      background: #f1f5f9;
    }

    .koact-pane-heading {
      height: 46px;
      padding: 0 14px;
      justify-content: space-between;
      border-bottom: 1px solid #dbe3ee;
      color: #475569;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    #koact-event-count {
      min-width: 25px;
      padding: 3px 7px;
      border-radius: 999px;
      background: #dbe3ee;
      color: #334155;
      font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-align: center;
    }

    #koact-event-list {
      height: calc(100% - 46px);
      margin: 0;
      padding: 10px;
      overflow: auto;
      list-style: none;
      scrollbar-color: #cbd5e1 transparent;
      scrollbar-width: thin;
    }

    .koact-event-item {
      margin: 0 0 7px;
    }

    .koact-event-card {
      position: relative;
      width: 100%;
      padding: 10px 10px 10px 38px;
      overflow: hidden;
      border: 1px solid #dbe3ee;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.86);
      color: #172033;
      cursor: pointer;
      text-align: left;
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }

    .koact-event-card:hover {
      border-color: #a5b4fc;
      background: #fff;
      transform: translateX(2px);
    }

    .koact-event-card[aria-current="true"] {
      border-color: var(--lane-color);
      background: #fff;
      box-shadow: inset 3px 0 0 var(--lane-color);
    }

    .koact-event-code {
      position: absolute;
      left: 10px;
      top: 10px;
      display: grid;
      width: 20px;
      height: 20px;
      place-items: center;
      border-radius: 6px;
      background: var(--lane-color);
      color: #fff;
      font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .koact-event-topline {
      justify-content: space-between;
      gap: 8px;
    }

    .koact-event-topline strong {
      font-size: 12px;
      font-weight: 750;
    }

    .koact-event-time {
      flex: none;
      color: #94a3b8;
      font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .koact-event-metadata {
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 7px;
    }

    .koact-event-metadata span {
      padding: 3px 5px;
      border-radius: 5px;
      background: #eef2f7;
      color: #526078;
      font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .koact-event-note {
      display: block;
      margin-top: 7px;
      color: #64748b;
      font-size: 10px;
      line-height: 1.35;
    }

    .koact-graph-pane {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: 62px minmax(0, 1fr);
      background: #fff;
    }

    .koact-graph-heading {
      min-width: 0;
      padding: 0 16px;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid #e2e8f0;
    }

    .koact-graph-heading > div:first-child {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 4px;
    }

    .koact-eyebrow {
      color: #94a3b8;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    #koact-graph-title {
      overflow: hidden;
      color: #263248;
      font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .koact-lane-legend {
      flex: none;
      gap: 10px;
      color: #64748b;
      font-size: 9px;
      font-weight: 650;
    }

    .koact-lane-legend span::before {
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-right: 4px;
      border-radius: 999px;
      background: var(--lane-color);
      content: "";
    }

    #koact-graph-viewport {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background-color: #f8fafc;
      background-image: radial-gradient(#cbd5e1 0.75px, transparent 0.75px);
      background-size: 16px 16px;
      cursor: grab;
    }

    #koact-graph-viewport:active {
      cursor: grabbing;
    }

    #koact-graph-canvas {
      width: 100%;
      height: 100%;
      transform-origin: center;
    }

    #koact-graph-canvas svg {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none !important;
    }

    #koact-zoom-level {
      position: absolute;
      right: 12px;
      bottom: 12px;
      padding: 5px 7px;
      border: 1px solid #dbe3ee;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.9);
      color: #64748b;
      font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      pointer-events: none;
    }

    .koact-empty-state {
      position: absolute;
      inset: 0;
      display: flex;
      padding: 24px;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 6px;
      color: #64748b;
      text-align: center;
      pointer-events: none;
    }

    .koact-empty-state strong {
      color: #475569;
      font-size: 12px;
    }

    .koact-empty-state span {
      max-width: 230px;
      font-size: 10px;
      line-height: 1.5;
    }

    #koact-event-empty {
      top: 46px;
    }

    @media (max-width: 720px) {
      #koact-devtools-panel {
        left: 12px;
        right: 12px;
        bottom: 76px;
        width: auto;
        height: min(680px, calc(100vh - 96px));
        min-width: 0;
        min-height: 420px;
      }

      .koact-workspace {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(180px, 42%) minmax(0, 1fr);
      }

      .koact-timeline-pane {
        border-right: 0;
        border-bottom: 1px solid #dbe3ee;
      }

      .koact-lane-legend {
        display: none;
      }

      .koact-brand-copy small {
        max-width: 150px;
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(floatingButton);
  document.body.appendChild(panel);

  const header = panel.querySelector("#koact-devtools-header");
  const closeButton = panel.querySelector("#koact-close-panel");
  const clearButton = panel.querySelector("#koact-clear-events");
  const resetButton = panel.querySelector("#koact-reset-view");
  const liveStatus = panel.querySelector("#koact-live-status");
  const eventCount = panel.querySelector("#koact-event-count");
  const eventList = panel.querySelector("#koact-event-list");
  const eventEmpty = panel.querySelector("#koact-event-empty");
  const graphTitle = panel.querySelector("#koact-graph-title");
  const graphViewport = panel.querySelector("#koact-graph-viewport");
  const graphCanvas = panel.querySelector("#koact-graph-canvas");
  const graphEmpty = panel.querySelector("#koact-graph-empty");
  const zoomLevel = panel.querySelector("#koact-zoom-level");

  const getLaneDescriptor = (lane) =>
    laneDescriptors[lane] || {
      label: `Lane ${lane}`,
      color: "#64748b",
    };

  const formatDuration = (duration) => {
    if (!Number.isFinite(duration)) return null;
    if (duration < 1) return `${duration.toFixed(2)}ms`;
    if (duration < 100) return `${duration.toFixed(1)}ms`;
    return `${Math.round(duration)}ms`;
  };

  const escapeMermaidLabel = (label) =>
    String(label)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\n", " ");

  const getFiberName = (fiber) => {
    if (typeof fiber.type === "function") {
      return fiber.type.displayName || fiber.type.name || "Anonymous";
    }
    if (
      fiber.type?.$$typeof === Symbol.for("koact.memo") &&
      typeof fiber.type.type === "function"
    ) {
      const component = fiber.type.type;
      return (
        fiber.type.displayName ||
        `Memo(${component.displayName || component.name || "Anonymous"})`
      );
    }
    if (typeof fiber.type === "string") return fiber.type;
    return "Fragment";
  };

  const createGraphDefinition = (root) => {
    if (!root?.child) return 'graph TD\n  empty["Empty root"]\n';

    let graphDefinition = "graph TD\n";
    let nodeId = 0;
    let wasTruncated = false;

    const appendTruncation = (parentId) => {
      if (wasTruncated) return;
      wasTruncated = true;
      graphDefinition += '  truncated["More nodes omitted"]\n';
      graphDefinition += `  ${parentId} --> truncated\n`;
    };

    const traverse = (fiber) => {
      if (!fiber || nodeId >= MAX_GRAPH_NODES) return null;

      const currentId = `node${nodeId++}`;
      const label = escapeMermaidLabel(getFiberName(fiber));
      graphDefinition += `  ${currentId}["${label}"]\n`;

      let child = fiber.child;
      while (child) {
        if (nodeId >= MAX_GRAPH_NODES) {
          appendTruncation(currentId);
          break;
        }
        const childId = traverse(child);
        if (childId) graphDefinition += `  ${currentId} --> ${childId}\n`;
        child = child.sibling;
      }

      return currentId;
    };

    traverse(root.child);
    return graphDefinition;
  };

  const createTimelineEntry = (event) => ({
    id: state.nextEventId++,
    type: event.type,
    rootId: Number.isFinite(event.rootId) ? event.rootId : 0,
    lane: Number.isFinite(event.lane) ? event.lane : 0,
    timestamp: Number.isFinite(event.timestamp)
      ? event.timestamp
      : performance.now(),
    elapsedTime: Number.isFinite(event.elapsedTime)
      ? event.elapsedTime
      : null,
    processedFibers: Number.isFinite(event.processedFibers)
      ? event.processedFibers
      : null,
    deletedFibers: Array.isArray(event.deletions)
      ? event.deletions.length
      : null,
    nextLane: Number.isFinite(event.nextLane) ? event.nextLane : null,
    reason: typeof event.reason === "string" ? event.reason : null,
    graphDefinition: null,
    fiberRoot: event.type === "commit" ? event.root : null,
  });

  const getEventNote = (entry) => {
    if (entry.type !== "render-abort") return null;
    if (entry.reason === "higher-priority-update") {
      return `Interrupted for ${getLaneDescriptor(entry.nextLane).label} work.`;
    }
    if (entry.reason === "same-priority-update") {
      return `Restarted for new ${getLaneDescriptor(entry.nextLane).label} work.`;
    }
    if (entry.reason === "error") return "Render stopped after an error.";
    return entry.reason ? `Render stopped: ${entry.reason}.` : null;
  };

  const renderTimeline = () => {
    const wasPinnedToBottom =
      eventList.scrollHeight - eventList.scrollTop - eventList.clientHeight < 24;
    const firstTimestamp = state.events[0]?.timestamp ?? 0;
    const fragment = document.createDocumentFragment();

    for (const entry of state.events) {
      const descriptor = eventDescriptors[entry.type];
      const lane = getLaneDescriptor(entry.lane);
      const item = document.createElement("li");
      const card = document.createElement("button");
      const relativeTime = Math.max(0, entry.timestamp - firstTimestamp);
      const metadata = [`root ${entry.rootId}`, lane.label];

      if (entry.processedFibers !== null) {
        metadata.push(`${entry.processedFibers} fibers`);
      }
      if (entry.elapsedTime !== null) {
        metadata.push(formatDuration(entry.elapsedTime));
      }
      if (entry.deletedFibers) metadata.push(`${entry.deletedFibers} deleted`);

      item.className = "koact-event-item";
      card.type = "button";
      card.className = "koact-event-card";
      card.style.setProperty("--lane-color", lane.color);
      card.setAttribute(
        "aria-current",
        String(entry.id === state.selectedEventId),
      );

      const code = document.createElement("span");
      code.className = "koact-event-code";
      code.textContent = descriptor.code;

      const topline = document.createElement("span");
      topline.className = "koact-event-topline";

      const label = document.createElement("strong");
      label.textContent = descriptor.label;

      const time = document.createElement("span");
      time.className = "koact-event-time";
      time.textContent = `+${formatDuration(relativeTime)}`;

      const metadataRow = document.createElement("span");
      metadataRow.className = "koact-event-metadata";
      for (const value of metadata) {
        const tag = document.createElement("span");
        tag.textContent = value;
        metadataRow.appendChild(tag);
      }

      topline.append(label, time);
      card.append(code, topline, metadataRow);

      const note = getEventNote(entry);
      if (note) {
        const noteElement = document.createElement("span");
        noteElement.className = "koact-event-note";
        noteElement.textContent = note;
        card.appendChild(noteElement);
      }

      card.addEventListener("click", () => {
        state.selectedEventId = entry.id;
        if (entry.fiberRoot) materializeGraphSnapshot(entry);
        if (entry.graphDefinition) {
          state.graphDefinition = entry.graphDefinition;
          state.graphEntry = entry;
          void renderGraph();
        }
        renderTimeline();
      });

      item.appendChild(card);
      fragment.appendChild(item);
    }

    eventList.replaceChildren(fragment);
    eventCount.textContent = String(state.events.length);
    eventEmpty.style.display = state.events.length ? "none" : "flex";

    const latestEntry = state.events.at(-1);
    liveStatus.textContent = latestEntry
      ? `${eventDescriptors[latestEntry.type].label} / root ${latestEntry.rootId} / ${getLaneDescriptor(latestEntry.lane).label}`
      : "Waiting for updates";

    if (wasPinnedToBottom) eventList.scrollTop = eventList.scrollHeight;
  };

  const scheduleTimelineRender = () => {
    if (panel.style.display !== "block" || state.timelineRenderScheduled) return;

    state.timelineRenderScheduled = true;
    queueMicrotask(() => {
      state.timelineRenderScheduled = false;
      if (panel.style.display === "block") renderTimeline();
    });
  };

  const applyGraphTransform = () => {
    const graphGroup = graphCanvas.querySelector("svg > g");
    if (graphGroup) {
      graphGroup.setAttribute(
        "transform",
        `translate(${state.translateX}, ${state.translateY}) scale(${state.scale})`,
      );
    }
    zoomLevel.textContent = `${Math.round(state.scale * 100)}%`;
  };

  const resetGraphView = () => {
    state.scale = 1;
    state.translateX = 0;
    state.translateY = 0;
    applyGraphTransform();
  };

  const updateGraphHeading = () => {
    if (!state.graphEntry) {
      graphTitle.textContent = "No commit captured";
      return;
    }

    const lane = getLaneDescriptor(state.graphEntry.lane);
    const duration = formatDuration(state.graphEntry.elapsedTime);
    graphTitle.textContent = [
      `root ${state.graphEntry.rootId}`,
      lane.label,
      duration,
      `${state.graphEntry.processedFibers ?? 0} fibers`,
    ]
      .filter(Boolean)
      .join(" / ");
  };

  const renderGraph = async () => {
    updateGraphHeading();
    if (!state.graphDefinition || !state.mermaid) return;

    const renderToken = ++state.graphRenderToken;

    try {
      const { svg } = await state.mermaid.render(
        `koact-fiber-graph-${renderToken}`,
        state.graphDefinition,
      );
      if (renderToken !== state.graphRenderToken) return;

      graphCanvas.innerHTML = svg;
      const svgElement = graphCanvas.querySelector("svg");
      if (svgElement) {
        svgElement.removeAttribute("height");
        svgElement.removeAttribute("width");
        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
      graphEmpty.style.display = "none";
      resetGraphView();
    } catch (error) {
      if (renderToken !== state.graphRenderToken) return;
      console.error("Failed to render Koact Fiber tree", error);
      graphCanvas.replaceChildren();
      graphEmpty.style.display = "flex";
      graphEmpty.querySelector("strong").textContent = "Tree render failed";
    }
  };

  const materializeGraphSnapshot = (entry) => {
    if (!entry?.fiberRoot) return;

    const fiberRoot = entry.fiberRoot;
    entry.fiberRoot = null;
    entry.graphDefinition = createGraphDefinition(fiberRoot);

    const snapshots = state.events.filter(
      (timelineEntry) => timelineEntry.graphDefinition,
    );
    for (
      let index = 0;
      index < snapshots.length - MAX_GRAPH_SNAPSHOTS;
      index++
    ) {
      snapshots[index].graphDefinition = null;
    }

    state.graphDefinition = entry.graphDefinition;
    state.graphEntry = entry;
  };

  const scheduleGraphSnapshot = (entry) => {
    state.pendingGraphEntry = entry;
    if (state.graphSnapshotTimer !== null) return;

    state.graphSnapshotTimer = setTimeout(() => {
      state.graphSnapshotTimer = null;
      const pendingEntry = state.pendingGraphEntry;
      state.pendingGraphEntry = null;

      if (
        panel.style.display !== "block" ||
        !pendingEntry ||
        pendingEntry !== state.graphEntry
      ) {
        return;
      }

      try {
        materializeGraphSnapshot(pendingEntry);
        void renderGraph();
      } catch (error) {
        console.error("Failed to capture Koact Fiber tree", error);
      }
    }, 0);
  };

  const initializeMermaid = () => {
    if (state.mermaidInitialized || !state.mermaid) return;

    state.mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "strict",
      fontFamily: "ui-sans-serif, sans-serif",
      themeVariables: {
        primaryColor: "#ede9fe",
        primaryTextColor: "#312e81",
        primaryBorderColor: "#8b5cf6",
        lineColor: "#94a3b8",
        secondaryColor: "#e0f2fe",
        tertiaryColor: "#f8fafc",
      },
      flowchart: {
        curve: "basis",
        nodeSpacing: 34,
        rankSpacing: 52,
      },
    });
    state.mermaidInitialized = true;
  };

  const loadMermaid = () => {
    if (state.mermaid) {
      initializeMermaid();
      return Promise.resolve();
    }
    if (state.mermaidPromise) return state.mermaidPromise;

    state.mermaidPromise = new Promise((resolve, reject) => {
      const previousMermaid = window.mermaid;
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js";
      script.onload = () => {
        const loadedMermaid = window.mermaid;
        if (previousMermaid) window.mermaid = previousMermaid;
        if (!loadedMermaid) {
          state.mermaidPromise = null;
          reject(new Error("Mermaid did not expose its browser API"));
          return;
        }
        state.mermaid = loadedMermaid;
        initializeMermaid();
        resolve();
      };
      script.onerror = () => {
        state.mermaidPromise = null;
        reject(new Error("Failed to load Mermaid"));
      };
      document.head.appendChild(script);
    });

    return state.mermaidPromise;
  };

  const recordEvent = (event) => {
    if (!event || !eventDescriptors[event.type]) return;

    const entry = createTimelineEntry(event);
    state.events.push(entry);
    if (state.events.length > MAX_EVENTS) state.events.shift();
    state.selectedEventId = entry.id;

    if (entry.fiberRoot) {
      if (state.graphEntry?.fiberRoot) state.graphEntry.fiberRoot = null;
      state.graphEntry = entry;
      if (panel.style.display === "block") scheduleGraphSnapshot(entry);
    }

    scheduleTimelineRender();
  };

  floatingButton.addEventListener("click", async () => {
    panel.style.display = "block";
    floatingButton.style.display = "none";
    renderTimeline();

    try {
      materializeGraphSnapshot(state.graphEntry);
      updateGraphHeading();
      if (state.graphDefinition && !state.mermaid) {
        graphEmpty.querySelector("strong").textContent = "Loading tree renderer";
      }
      await loadMermaid();
      await renderGraph();
    } catch (error) {
      console.error("Failed to initialize Koact DevTools", error);
      graphEmpty.style.display = "flex";
      graphEmpty.querySelector("strong").textContent = "Graph library unavailable";
    }
  });

  closeButton.addEventListener("click", () => {
    panel.style.display = "none";
    floatingButton.style.display = "block";
  });

  clearButton.addEventListener("click", () => {
    state.events = [];
    state.selectedEventId = null;
    state.graphDefinition = null;
    state.graphEntry = null;
    state.pendingGraphEntry = null;
    if (state.graphSnapshotTimer !== null) {
      clearTimeout(state.graphSnapshotTimer);
      state.graphSnapshotTimer = null;
    }
    state.graphRenderToken++;
    graphCanvas.replaceChildren();
    graphEmpty.style.display = "flex";
    graphEmpty.querySelector("strong").textContent = "Tree snapshot unavailable";
    updateGraphHeading();
    resetGraphView();
    renderTimeline();
  });

  resetButton.addEventListener("click", resetGraphView);

  header.addEventListener("mousedown", (event) => {
    if (window.innerWidth <= 720 || event.target.closest("button")) return;

    const rect = panel.getBoundingClientRect();
    state.isPanelDragging = true;
    state.panelOffsetX = event.clientX - rect.left;
    state.panelOffsetY = event.clientY - rect.top;
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });

  graphViewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      state.scale = Math.max(0.35, Math.min(3, state.scale * delta));
      applyGraphTransform();
    },
    { passive: false },
  );

  graphViewport.addEventListener("mousedown", (event) => {
    if (!graphCanvas.querySelector("svg")) return;
    state.isGraphDragging = true;
    state.lastGraphX = event.clientX;
    state.lastGraphY = event.clientY;
  });

  document.addEventListener("mousemove", (event) => {
    if (state.isPanelDragging) {
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      const left = Math.max(
        0,
        Math.min(maxLeft, event.clientX - state.panelOffsetX),
      );
      const top = Math.max(
        0,
        Math.min(maxTop, event.clientY - state.panelOffsetY),
      );
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }

    if (state.isGraphDragging) {
      state.translateX += (event.clientX - state.lastGraphX) / state.scale;
      state.translateY += (event.clientY - state.lastGraphY) / state.scale;
      state.lastGraphX = event.clientX;
      state.lastGraphY = event.clientY;
      applyGraphTransform();
    }
  });

  document.addEventListener("mouseup", () => {
    state.isPanelDragging = false;
    state.isGraphDragging = false;
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth <= 720) {
      panel.style.removeProperty("left");
      panel.style.removeProperty("top");
      panel.style.removeProperty("right");
      panel.style.removeProperty("bottom");
      return;
    }

    if (!panel.style.left) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
    panel.style.top = `${Math.max(0, Math.min(rect.top, window.innerHeight - rect.height))}px`;
  });

  const previousDevToolsHook = window.__KOACT_DEVTOOLS_HOOK__;
  window.__KOACT_DEVTOOLS_HOOK__ = {
    emit(type, data) {
      try {
        recordEvent({ ...data, type });
      } catch (error) {
        console.error("Koact DevTools failed to record an event", error);
      }
      if (previousDevToolsHook?.emit) {
        try {
          previousDevToolsHook.emit(type, data);
        } catch (error) {
          console.error("Previous Koact DevTools hook failed", error);
        }
      }
    },
  };

  renderTimeline();
})();
