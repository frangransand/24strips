import express from "express";
import cors from "cors";
import compression from "compression";
import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

// ── Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── App
const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;

// ── In-memory store
const STRIP_LIFETIME_MS = 20 * 60 * 1000; // 20 minutes
const strips = new Map(); // id -> strip
const sseClients = new Set(); // {id, res}

// Utility
const now = () => Date.now();

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of sseClients) {
    try { c.res.write(data); } catch { /* ignore */ }
  }
}

function upsertStrip(strip) {
  strips.set(strip.id, strip);
  broadcast("upsert", strip);
}

function deleteStrip(id) {
  const existed = strips.delete(id);
  if (existed) broadcast("delete", { id });
}

// Cleanup: auto-expire imported (non-pinned) strips
setInterval(() => {
  const cutoff = now() - STRIP_LIFETIME_MS;
  for (const [id, s] of strips) {
    const imported = s.source === "import";
    const expired = s.createdAt < cutoff;
    if (imported && expired && !s.pinned) {
      strips.delete(id);
      broadcast("delete", { id });
    }
  }
}, 30 * 1000);

// ── 24data WebSocket
let ws;
let wsConnected = false;
let reconnectTimer = null;

function connectWS() {
  if (wsConnected) return;
  const url = "wss://24data.ptfs.app/wss";

  // IMPORTANT: do NOT set Origin header
  ws = new WebSocket(url, { headers: {} });

  ws.on("open", () => {
    wsConnected = true;
    console.log("[24data] WebSocket connected");
  });

  ws.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      const { t, d } = msg;
      if (t === "FLIGHT_PLAN" || t === "EVENT_FLIGHT_PLAN") {
        // Normalize to strip shape
        const id = `import-${d.callsign}-${now()}`;
        const strip = {
          id,
          source: "import",
          eventSource: t === "EVENT_FLIGHT_PLAN" ? "event" : "main",
          createdAt: now(),
          updatedAt: now(),
          pinned: false,

          // Core fields
          callsign: d.callsign || d.realcallsign || "",
          realcallsign: d.realcallsign || "",
          robloxName: d.robloxName || "",
          aircraft: d.aircraft || "",
          flightrules: d.flightrules || "",
          departing: d.departing || "",
          arriving: d.arriving || "",
          route: d.route || "",
          flightlevel: d.flightlevel || "",

          // Tower workflow fields (editable)
          remarks: "",
          status: "Filed", // Filed, Cleared, Push, Taxi, LineUp, Airborne, HandedOff, Cancelled
          scratchpad: ""
        };

        upsertStrip(strip);
      }
    } catch (e) {
      console.error("[24data] parse error:", e);
    }
  });

  ws.on("close", () => {
    wsConnected = false;
    console.log("[24data] WebSocket closed; retrying in 3s");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWS, 3000);
  });

  ws.on("error", (err) => {
    wsConnected = false;
    console.error("[24data] WebSocket error:", err.message);
    try { ws.close(); } catch {}
  });
}
connectWS();

// ── API
// SSE stream for live updates
app.get("/sse", (req, res) => {
  // Same-origin clients only (served by us), so CORS is fine
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.flushHeaders();
  const client = { id: randomUUID(), res };
  sseClients.add(client);

  // Initial heartbeat + connected flag
  res.write(`event: hello\ndata: ${JSON.stringify({ connected: true })}\n\n`);

  req.on("close", () => {
    sseClients.delete(client);
  });
});

// List current strips (filtered)
app.get("/api/strips", (req, res) => {
  const airport = (req.query.airport || "").toUpperCase().trim();
  const includeArrivals = req.query.includeArrivals !== "false";
  const includeDepartures = req.query.includeDepartures !== "false";

  const cutoff = now() - STRIP_LIFETIME_MS;
  const out = [];
  for (const s of strips.values()) {
    // Keep manual or pinned regardless of age
    const keepByAge = s.source !== "import" || s.pinned || s.createdAt >= cutoff;

    const matchesAirport =
      !airport ||
      (includeDepartures && s.departing.toUpperCase() === airport) ||
      (includeArrivals && s.arriving.toUpperCase() === airport);

    if (keepByAge && matchesAirport) out.push(s);
  }

  // Sort: pinned first, then newest
  out.sort((a, b) =>
    (b.pinned - a.pinned) || (b.createdAt - a.createdAt)
  );

  res.json(out);
});

// Create manual strip
app.post("/api/strips", (req, res) => {
  const b = req.body || {};
  const id = `manual-${randomUUID()}`;
  const strip = {
    id,
    source: "manual",
    eventSource: null,
    createdAt: now(),
    updatedAt: now(),
    pinned: !!b.pinned,

    callsign: (b.callsign || "").toUpperCase(),
    realcallsign: (b.realcallsign || "").toUpperCase(),
    robloxName: b.robloxName || "",
    aircraft: b.aircraft || "",
    flightrules: (b.flightrules || "").toUpperCase(),
    departing: (b.departing || "").toUpperCase(),
    arriving: (b.arriving || "").toUpperCase(),
    route: b.route || "",
    flightlevel: (b.flightlevel || "").toString(),

    remarks: b.remarks || "",
    status: b.status || "Filed",
    scratchpad: b.scratchpad || ""
  };

  upsertStrip(strip);
  res.status(201).json(strip);
});

// Edit strip
app.put("/api/strips/:id", (req, res) => {
  const id = req.params.id;
  const s = strips.get(id);
  if (!s) return res.status(404).json({ error: "not found" });

  const b = req.body || {};
  const editable = [
    "callsign","realcallsign","robloxName","aircraft","flightrules",
    "departing","arriving","route","flightlevel",
    "remarks","status","scratchpad","pinned"
  ];
  for (const k of editable) {
    if (k in b) s[k] = k === "pinned" ? !!b[k] : b[k];
  }
  s.updatedAt = now();
  upsertStrip(s);
  res.json(s);
});

// Delete strip
app.delete("/api/strips/:id", (req, res) => {
  const id = req.params.id;
  if (!strips.has(id)) return res.status(404).json({ error: "not found" });
  deleteStrip(id);
  res.json({ ok: true });
});

// Health
app.get("/healthz", (req, res) => res.json({ ok: true, wsConnected }));

// Catch-all to SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
