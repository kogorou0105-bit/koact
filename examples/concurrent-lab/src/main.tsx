import Koact, {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "@koact/react";
import { createRoot } from "@koact/react-dom";
import { installBenchmarkRunner } from "./benchmark";
import "./styles.css";

type CatalogItem = {
  id: number;
  code: string;
  title: string;
  detail: string;
  searchText: string;
  topic: string;
};

type InputLikeEvent = {
  currentTarget: HTMLInputElement;
};

const TOPICS = [
  "Fiber lanes",
  "Update queues",
  "Host callbacks",
  "Keyed diff",
  "Commit effects",
  "Root priority",
  "Render yield",
  "State rebase",
];

const SIGNALS = [
  "stable",
  "queued",
  "interruptible",
  "observable",
  "replayable",
];

const ITEMS: CatalogItem[] = Array.from({ length: 5000 }, (_, index) => {
  const id = index + 1;
  const topic = TOPICS[index % TOPICS.length];
  const signal = SIGNALS[index % SIGNALS.length];
  const code = String(id).padStart(4, "0");
  const title = `Record ${code} / ${topic}`;
  const detail = `${signal} workload · shard ${(index % 24) + 1}`;

  return {
    id,
    code,
    title,
    detail,
    topic,
    searchText: `${title} ${detail}`.toLowerCase(),
  };
});

const BENCHMARK_MODE = new URLSearchParams(window.location.search).has(
  "benchmark",
);
let updateControlQuery: (value: string) => void = () => {};
let updateCatalogFilter: (value: string) => void = () => {};
let interruptCatalog: () => void = () => {};
let isControlReady = false;
let isCatalogReady = false;

const scheduleFilter = (value: string) => {
  updateControlQuery(value);
  startTransition(() => updateCatalogFilter(value));
};

function ControlDeck() {
  const [query, setQuery] = useState("");
  const burstId = useRef(0);
  const burstTimers = useRef<number[]>([]);

  const cancelBurst = () => {
    burstId.current++;
    burstTimers.current.forEach((timer) => window.clearTimeout(timer));
    burstTimers.current = [];
  };

  useEffect(() => () => cancelBurst(), []);

  const applyFilter = (value: string) => {
    scheduleFilter(value);
  };

  useEffect(() => {
    updateControlQuery = (value) => setQuery(value);
    isControlReady = true;
    return () => {
      isControlReady = false;
      updateControlQuery = () => {};
    };
  }, []);

  const handleInput = (event: InputLikeEvent) => {
    cancelBurst();
    applyFilter(event.currentTarget.value);
  };

  const runBurst = () => {
    cancelBurst();
    const currentBurst = burstId.current;
    ["r", "re", "rec", "reco", "record"].forEach((value, index) => {
      burstTimers.current.push(
        window.setTimeout(() => {
          if (burstId.current === currentBurst) applyFilter(value);
        }, index * 24),
      );
    });
    burstTimers.current.push(
      window.setTimeout(() => {
        if (burstId.current === currentBurst) interruptCatalog();
      }, 36),
    );
  };

  const selectPreset = (value: string) => {
    cancelBurst();
    applyFilter(value);
  };

  return (
    <main className="lab-shell">
      <header className="lab-hero">
        <div className="hero-copy">
          <span className="kicker">Koact runtime experiment 01</span>
          <h1>
            Interrupt the
            <span> long render.</span>
          </h1>
          <p>
            The control deck and catalog use separate roots. Input state stays on
            the Default lane while 5,000 keyed rows filter on the Transition lane.
          </p>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <span>5K</span>
          <small>FIBERS IN MOTION</small>
        </div>
      </header>

      <section className="telemetry" aria-label="Experiment configuration">
        <div>
          <span className="telemetry-light default-light"></span>
          <small>CONTROL ROOT</small>
          <strong>DefaultLane</strong>
        </div>
        <div>
          <span className="telemetry-light transition-light"></span>
          <small>CATALOG ROOT</small>
          <strong>TransitionLane</strong>
        </div>
        <div>
          <span className="telemetry-light neutral-light"></span>
          <small>WORKLOAD</small>
          <strong>5,000 keyed rows</strong>
        </div>
      </section>

      <section className="control-panel">
        <div className="control-heading">
          <div>
            <span className="section-index">01 / INPUT SIGNAL</span>
            <h2>Filter the catalog</h2>
          </div>
          <button className="burst-button" type="button" onClick={runBurst}>
            Run 5-step burst
          </button>
        </div>

        <div className="search-field">
          <label htmlFor="catalog-query">QUERY</label>
          <input
            id="catalog-query"
            value={query}
            onInput={handleInput}
            placeholder="Type record to keep all 5,000 rows active"
            autoComplete="off"
            spellCheck={false}
          />
          <output aria-label="Current query">{query.length ? query : "∅"}</output>
        </div>

        <div className="preset-row">
          <span>Quick signals</span>
          {["record", "fiber", "commit", "yield", ""].map((value) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => selectPreset(value)}
            >
              {value || "all rows"}
            </button>
          ))}
        </div>

        <p className="lab-instruction">
          Open the <strong>K</strong> panel, run the burst, then inspect Yield and
          Abort events. Five Transition filters arrive 24ms apart; a 36ms Default
          ping interrupts the catalog when Transition work is still active.
        </p>
      </section>
    </main>
  );
}

function Catalog() {
  const [filter, setFilter] = useState("");
  const [interruptRevision, setInterruptRevision] = useState(0);

  useEffect(() => {
    updateCatalogFilter = (value) => setFilter(value);
    interruptCatalog = () => setInterruptRevision((revision) => revision + 1);
    isCatalogReady = true;
    return () => {
      isCatalogReady = false;
      updateCatalogFilter = () => {};
      interruptCatalog = () => {};
    };
  }, []);

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleItems = normalizedFilter
    ? ITEMS.filter((item) => item.searchText.includes(normalizedFilter))
    : ITEMS;

  return (
    <section
      className="catalog-section"
      data-interrupt-revision={interruptRevision}
    >
      <header className="catalog-heading">
        <div>
          <span className="section-index">02 / TRANSITION OUTPUT</span>
          <h2>Keyed catalog</h2>
        </div>
        <div className="result-counter" aria-live="polite">
          <strong>{visibleItems.length.toLocaleString()}</strong>
          <span>of 5,000 records</span>
        </div>
      </header>

      <ul
        className="catalog-grid"
        aria-hidden={BENCHMARK_MODE ? true : undefined}
      >
        {visibleItems.map((item) => (
          <li key={item.id} className="catalog-row">
            <span className="record-code">#{item.code}</span>
            <span className="record-copy">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="record-topic">{item.topic}</span>
          </li>
        ))}
      </ul>

      {visibleItems.length === 0 && (
        <div className="empty-catalog">
          <strong>No matching records</strong>
          <span>Clear the query to schedule the full 5,000-row render again.</span>
        </div>
      )}
    </section>
  );
}

const controlsContainer = document.getElementById("controls-root");
const resultsContainer = document.getElementById("results-root");

if (!controlsContainer || !resultsContainer) {
  throw new Error("Concurrent lab containers are missing.");
}

if (BENCHMARK_MODE) {
  installBenchmarkRunner({
    scheduleFilter,
    interruptCatalog: () => interruptCatalog(),
    isReady: () => isControlReady && isCatalogReady,
    listSize: ITEMS.length,
  });
}

createRoot(controlsContainer).render(<ControlDeck />);
createRoot(resultsContainer).render(<Catalog />);
