/**
 * Pet Watch host bridge and dashboard.
 *
 * Sits between the device and the browser:
 *
 *   device /events (SSE) ──► parsers ──► InteractionDetector + VisitDetector
 *                                            │               │
 *                                     counts + JSONL   visit log
 *                                            └──────┬────────┘
 *                                        :8788  —  / (dashboard UI)
 *                                                /api/status   (poll JSON)
 *                                                /api/events   (SSE to browser)
 *                                                /api/threshold (POST)
 *                                                /api/interactions.csv
 *
 * Everything here is transport wiring; the classification logic lives in
 * detector.ts / interactions.ts and is tested independently of HTTP.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { VisitDetector } from "./detector.ts";
import { InteractionDetector } from "./interactions.ts";
import type { Interaction } from "./interactions.ts";
import type { Sample, Visit } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export type ServerOptions = {
  /** Where the device's ESPHome web server lives. */
  deviceUrl?: string;
  /** Port for the dashboard. */
  port?: number;
  /** Append-only JSONL file for interaction counts; null disables persistence. */
  dataFile?: string | null;
  /** Interaction zone entry distance, mm (default 100, mounted geometry). */
  interactionMm?: number;
  /** Sustained-engagement duration gate, ms (default 3_000 = the 3 s rule). */
  minDurationMs?: number;
  /** Touches closer together than this merge into one episode, ms. */
  mergeGapMs?: number;
};

const OPTIONS_DEFAULTS = {
  deviceUrl: "http://172.20.0.183",
  port: 8788,
  dataFile: join(HERE, "..", "data", "interactions.jsonl"),
  // Mounted geometry (bench default was 60): the sensor's real mount reads
  // noses at ~100 mm, so the interaction zone starts there. The exit bar is
  // derived (133 mm) and hysteresis still has its gap.
  interactionMm: 100,
  minDurationMs: 3_000,
  mergeGapMs: 3_000,
};

/** Exit bar derived from the entry distance — hysteresis needs a gap. */
function exitMmFor(interactionMm: number): number {
  return interactionMm + Math.max(20, Math.round(interactionMm / 3));
}

// ---------------------------------------------------------------------------
// Device SSE parsing
// ---------------------------------------------------------------------------

/** One `event: state` frame from the device. */
export type DeviceState = {
  /** e.g. "sensor/Pet Watch distance" */
  id: string;
  /** Human-readable state, e.g. "92 mm". */
  state: string;
  /** Numeric value when parseable, else NaN. */
  value: number;
};

/** Parse one `event: state` SSE data payload. Returns null for junk frames. */
export function parseDeviceState(data: string): DeviceState | null {
  let obj: unknown;
  try {
    obj = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.id !== "string" || typeof rec.state !== "string") return null;
  const n = Number.parseFloat(rec.state);
  return { id: rec.id, state: rec.state, value: Number.isFinite(n) ? n : Number.NaN };
}

/**
 * Parse the ultrasonic log line ESPHome emits per reading:
 * `[D][ultrasonic.sensor:087]: 'Pet Watch distance' - Got distance: 0.092 m`
 * The state events round to whole millimetres; this is where sub-mm precision
 * actually comes from.
 */
export function parseDistanceLogLine(line: string): { mm: number } | null {
  const m = /Got distance: ([0-9.]+) m/.exec(line);
  if (m === null || m[1] === undefined) return null;
  const meters = Number.parseFloat(m[1]);
  return Number.isFinite(meters) ? { mm: meters * 1000 } : null;
}

/**
 * Incrementally decode an SSE body, calling onEvent per frame.
 * Handles lines straddling chunk boundaries and never throws on junk.
 */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (eventName: string, data: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buf = "";
  let eventName = "";
  let data = "";

  const handleLine = (rawLine: string): void => {
    if (rawLine === "") {
      if (data !== "") onEvent(eventName || "message", data);
      eventName = "";
      data = "";
      return;
    }
    if (rawLine.startsWith(":")) return; // keepalive comment
    if (rawLine.startsWith("event:")) eventName = rawLine.slice(6).trim();
    else if (rawLine.startsWith("data:")) {
      const d = rawLine.slice(5).trimStart();
      data = data === "" ? d : `${data}\n${d}`;
    }
  };

  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  buf += decoder.decode();
  if (buf !== "") handleLine(buf);
  if (data !== "") onEvent(eventName || "message", data);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type StoredInteraction = {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly minMm: number;
  readonly sampleCount: number;
  readonly recordedAt: number;
};

/** Append-only JSONL, one interaction per line. */
export class InteractionStore {
  readonly #path: string | null;
  #total = 0;

  constructor(path: string | null) {
    this.#path = path;
    if (path !== null) mkdirSync(dirname(path), { recursive: true });
  }

  record(interaction: Interaction): void {
    this.#total++;
    if (this.#path === null) return;
    const row: StoredInteraction = { ...interaction, recordedAt: Date.now() };
    try {
      appendFileSync(this.#path, `${JSON.stringify(row)}\n`);
    } catch {
      // Persistence must never take down the live feed.
    }
  }

  count(): number {
    return this.#total;
  }
}

/** Mutable state shared between the device feed and the browser endpoints. */
export type LiveState = {
  deviceConnected: boolean;
  lastSample: Sample | null;
  interactionActive: boolean;
  visitActive: boolean;
  totalInteractions: number;
  totalVisits: number;
  baselineMm: number;
  /** Live interaction rule, editable from the dashboard. */
  config: { interactionMm: number; exitMm: number; minDurationMs: number; mergeGapMs: number };
  events: { at: number; kind: string; detail: string }[];
};

/** Local midnight, for the today-count columns. */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function startServer(options: ServerOptions = {}): {
  close(): void;
  getPort(): number;
  state: LiveState;
  interactions: StoredInteraction[];
  visits: Visit[];
  feedSample(mm: number, t: number): void;
} {
  const o = { ...OPTIONS_DEFAULTS, ...options } as typeof OPTIONS_DEFAULTS;

  // Current interaction rule. Mutable at runtime via POST /api/config; the
  // detector is swapped wholesale when the rule changes. Only episode state
  // is dropped on a swap — the count survives.
  let interactionMm = o.interactionMm;
  let minDurationMs = o.minDurationMs;
  let mergeGapMs = o.mergeGapMs;

  const state: LiveState = {
    deviceConnected: false,
    lastSample: null,
    interactionActive: false,
    visitActive: false,
    totalInteractions: 0,
    totalVisits: 0,
    baselineMm: Number.NaN,
    config: { interactionMm, exitMm: exitMmFor(interactionMm), minDurationMs, mergeGapMs },
    events: [],
  };

  const visitDetector = new VisitDetector();
  // exitMm must always be derived alongside interactionMm: the detector
  // validates exit > entry, and the stock 80 mm exit default would collide
  // with any entry at or above it.
  let interactionDetector = new InteractionDetector({
    interactionMm,
    exitMm: exitMmFor(interactionMm),
    minDurationMs,
    mergeGapMs,
  });
  const store = new InteractionStore(o.dataFile);
  const interactions: StoredInteraction[] = [];
  const visits: Visit[] = [];
  const clients = new Set<ServerResponse>();
  let stopDevice = false;
  let deviceAbort: AbortController | null = null;
  let lastLogFeedAt = 0;

  function note(kind: string, detail: string): void {
    state.events.push({ at: Date.now(), kind, detail });
    if (state.events.length > 200) state.events.shift();
  }

  function broadcast(kind: string, data: unknown): void {
    const frame = `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
        clients.delete(res);
      }
    }
  }

  function recordInteraction(interaction: Interaction): void {
    const stored: StoredInteraction = { ...interaction, recordedAt: Date.now() };
    interactions.push(stored);
    if (interactions.length > 5_000) interactions.shift();
    state.totalInteractions++;
    store.record(interaction);
    note(
      "interaction",
      `object interaction #${state.totalInteractions} — closest ${Math.round(interaction.minMm)} mm, ${(interaction.durationMs / 1000).toFixed(1)} s`,
    );
    broadcast("interaction", stored);
  }

  /** Feed one device reading through both detectors. */
  function feedSample(mm: number, t: number): void {
    const sample: Sample = { t, mm };
    state.lastSample = sample;

    // Interaction side: absolute proximity. Needs no seeding, counts immediately.
    const wasActive = interactionDetector.active;
    const interaction = interactionDetector.push(sample);
    state.interactionActive = interactionDetector.active;
    if (interaction !== null) recordInteraction(interaction);
    else if (!wasActive && interactionDetector.active) {
      note("interaction-start", "nose in the interaction zone");
    }

    // Visit side: baseline-relative occupancy with seeding and hysteresis.
    // VisitDetector exposes no `active` getter, so the "visit open" light is
    // derived the same way the detector itself decides presence: the latest
    // reading is still past the hysteresis exit bar (0.6 × entry threshold).
    const visit = visitDetector.push(sample);
    const enterDelta = visitDetector.enterDeltaMm;
    state.visitActive =
      Number.isFinite(enterDelta) &&
      Number.isFinite(mm) &&
      visitDetector.baselineMm - mm >= enterDelta * 0.6;
    if (visit !== null) {
      state.totalVisits++;
      visits.push(visit);
      if (visits.length > 1_000) visits.shift();
      note(
        "visit",
        `visit — ${(visit.durationMs / 1000).toFixed(1)} s, closest ${Math.round(visit.minMm)} mm`,
      );
      broadcast("visit", visit);
    }

    state.baselineMm = visitDetector.baselineMm;
    broadcast("sample", {
      t,
      mm,
      interaction: interactionDetector.active,
      baselineMm: Number.isFinite(state.baselineMm) ? state.baselineMm : null,
    });
  }

  async function connectDevice(): Promise<void> {
    while (!stopDevice) {
      try {
        deviceAbort = new AbortController();
        const res = await fetch(`${o.deviceUrl}/events`, {
          signal: deviceAbort.signal,
          headers: { accept: "text/event-stream" },
        });
        if (!res.ok || res.body === null) {
          throw new Error(`device /events returned HTTP ${res.status}`);
        }
        state.deviceConnected = true;
        note("device", `connected to ${o.deviceUrl}`);
        broadcast("device", { connected: true });

        await readSse(res.body, (eventName, data) => {
          if (eventName === "log") {
            const parsed = parseDistanceLogLine(data);
            if (parsed !== null) {
              lastLogFeedAt = Date.now();
              feedSample(parsed.mm, Date.now());
            }
            return;
          }
          if (eventName === "state") {
            // The distance state event rounds to whole mm. Prefer the log
            // line's precision; fall back to this only when log lines have
            // gone quiet (e.g. log level raised on the device).
            const s = parseDeviceState(data);
            if (
              s !== null &&
              s.id === "sensor/Pet Watch distance" &&
              Number.isFinite(s.value) &&
              Date.now() - lastLogFeedAt > 1_000
            ) {
              feedSample(s.value, Date.now());
            }
          }
        });
      } catch (err) {
        if (stopDevice) break;
        note("device", `connection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      state.deviceConnected = false;
      broadcast("device", { connected: false });
      if (!stopDevice) {
        note("device", "reconnecting in 3 s");
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
  }

  // ------------------------------------------------------------------ HTTP

  function statusJson(): Record<string, unknown> {
    const dayStart = startOfToday();
    const last = interactions[interactions.length - 1];
    return {
      ...state,
      interactionsToday: interactions.filter((i) => i.startedAt >= dayStart).length,
      visitsToday: visits.filter((v) => v.startedAt >= dayStart).length,
      lastInteractionAt: last !== undefined ? last.recordedAt : null,
      events: state.events.slice(-20).reverse(),
      recentInteractions: interactions.slice(-20).reverse(),
      deviceUrl: o.deviceUrl,
    };
  }

  function readPostBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (c: Buffer) => {
        body += c.toString("utf8");
        if (body.length > 10_000) reject(new Error("body too large"));
      });
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  const httpServer = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      try {
        if (url.pathname === "/" || url.pathname === "/index.html") {
          const html = readFileSync(join(HERE, "dashboard.html"), "utf8");
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }

        if (url.pathname === "/api/status") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(statusJson()));
          return;
        }

        if (url.pathname === "/api/events") {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          res.write(`retry: 3000\n\n`);
          res.write(`event: hello\ndata: ${JSON.stringify(statusJson())}\n\n`);
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
        }

        // Runtime rule change: distance gate and/or duration gate. Omitted
        // keys keep their current setting. Exit bar is derived so hysteresis
        // always has a gap.
        if (url.pathname === "/api/config" && req.method === "POST") {
          const body = await readPostBody(req);
          const parsed: unknown = JSON.parse(body);
          const req_ =
            typeof parsed === "object" && parsed !== null
              ? (parsed as Record<string, unknown>)
              : {};

          let newMm = interactionMm;
          let newMs = minDurationMs;
          let newGap = mergeGapMs;

          if (req_.interactionMm !== undefined) {
            const v = req_.interactionMm;
            if (typeof v !== "number" || !Number.isFinite(v) || v < 20 || v > 300) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "interactionMm must be 20–300" }));
              return;
            }
            newMm = v;
          }
          if (req_.minDurationMs !== undefined) {
            const v = req_.minDurationMs;
            if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 60_000) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "minDurationMs must be 0–60000" }));
              return;
            }
            newMs = v;
          }
          if (req_.mergeGapMs !== undefined) {
            const v = req_.mergeGapMs;
            if (typeof v !== "number" || !Number.isFinite(v) || v < 500 || v > 30_000) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "mergeGapMs must be 500–30000" }));
              return;
            }
            newGap = v;
          }

          // Count any episode the old rule left open, then swap detectors.
          // Only episode state is dropped; the count survives.
          const open = interactionDetector.flush();
          if (open !== null) recordInteraction(open);

          interactionMm = newMm;
          minDurationMs = newMs;
          mergeGapMs = newGap;
          interactionDetector = new InteractionDetector({
            interactionMm,
            exitMm: exitMmFor(interactionMm),
            minDurationMs,
            mergeGapMs,
          });
          state.config = {
            interactionMm,
            exitMm: exitMmFor(interactionMm),
            minDurationMs,
            mergeGapMs,
          };

          note(
            "config",
            `rule set to within ${interactionMm} mm for ${(minDurationMs / 1000).toFixed(1)} s (merge ${(mergeGapMs / 1000).toFixed(1)} s)`,
          );
          broadcast("config", state.config);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, config: state.config }));
          return;
        }

        // Zero the counters and on-screen history. The JSONL file is append-
        // only evidence and is deliberately left alone.
        if (url.pathname === "/api/reset" && req.method === "POST") {
          interactions.length = 0;
          visits.length = 0;
          state.totalInteractions = 0;
          state.totalVisits = 0;
          note("reset", "counters reset (persisted data untouched)");
          broadcast("reset", { ok: true });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (url.pathname === "/api/interactions.csv") {
          const rows = ["startedAt,endedAt,durationMs,minMm,sampleCount,recordedAt"];
          for (const i of interactions) {
            rows.push(
              `${i.startedAt},${i.endedAt},${i.durationMs},${i.minMm},${i.sampleCount},${i.recordedAt}`,
            );
          }
          res.writeHead(200, { "content-type": "text/csv" });
          res.end(`${rows.join("\n")}\n`);
          return;
        }

        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
      } catch (err) {
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    })();
  });

  const pinger = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clients.delete(res);
      }
    }
  }, 15_000);

  httpServer.listen(o.port);

  void connectDevice();

  return {
    getPort(): number {
      const addr = httpServer.address();
      return typeof addr === "object" && addr !== null ? addr.port : o.port;
    },
    close(): void {
      stopDevice = true;
      deviceAbort?.abort();
      clearInterval(pinger);
      httpServer.close();
      httpServer.closeAllConnections();
    },
    state,
    interactions,
    visits,
    feedSample,
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const opts: ServerOptions = {};
  if (process.env.PET_WATCH_DEVICE !== undefined) opts.deviceUrl = process.env.PET_WATCH_DEVICE;
  opts.port = Number(process.env.PORT ?? OPTIONS_DEFAULTS.port);
  if (process.env.PET_WATCH_INTERACTION_MM !== undefined) {
    opts.interactionMm = Number(process.env.PET_WATCH_INTERACTION_MM);
  }
  if (process.env.PET_WATCH_MIN_S !== undefined) {
    opts.minDurationMs = Number(process.env.PET_WATCH_MIN_S) * 1000;
  }

  const server = startServer(opts);
  console.log(`Pet Watch dashboard   http://localhost:${server.getPort()}`);

  // Open the dashboard in the default browser (macOS). Suppress with
  // PET_WATCH_NO_OPEN=1 — useful when restarting the server repeatedly.
  if (process.platform === "darwin" && process.env.PET_WATCH_NO_OPEN === undefined) {
    const { exec } = await import("node:child_process");
    exec(`open http://localhost:${server.getPort()}`);
  }
  console.log(`device feed           ${process.env.PET_WATCH_DEVICE ?? OPTIONS_DEFAULTS.deviceUrl}`);
  console.log(
    `interaction rule      within ${server.state.config.interactionMm} mm for ${(server.state.config.minDurationMs / 1000).toFixed(1)} s`,
  );
  console.log(`interaction counts    ${String(OPTIONS_DEFAULTS.dataFile)}`);
  console.log(`Ctrl-C to stop`);
}
