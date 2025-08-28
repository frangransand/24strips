import express from "express";
import cors from "cors";
import WebSocket from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));

// Flight plan cache
let flightPlans = [];
const CUTOFF = 20 * 60 * 1000; // 20 minutes

// Airports cache
let airports = [];

// Fetch initial flight plans
async function fetchInitialFlights() {
  try {
    console.log("📡 Fetching initial flight plans...");
    const res = await fetch("https://24data.ptfs.app/api/v1/flight-plans");
    const data = await res.json();

    if (Array.isArray(data)) {
      flightPlans = data.map(fp => ({ ...fp, timestamp: Date.now() }));
      console.log(`✅ Loaded ${flightPlans.length} initial flight plans`);
    }
  } catch (err) {
    console.error("❌ Error fetching flight plans:", err);
  }
}

// Fetch airports from 24data
async function fetchAirports() {
  try {
    console.log("📡 Fetching airport list...");
    const res = await fetch("https://24data.ptfs.app/atis");
    const data = await res.json();
    airports = data.map(a => a.airport);
    console.log(`✅ Loaded ${airports.length} airports`);
  } catch (err) {
    console.error("❌ Error fetching airports:", err);
  }
}

// WebSocket connection for live updates
function connectWS() {
  const ws = new WebSocket("wss://24data.ptfs.app/wss", { headers: { Origin: "" } });

  ws.on("open", () => console.log("🔌 Connected to 24data WebSocket"));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.t === "FLIGHT_PLAN" || data.t === "EVENT_FLIGHT_PLAN") {
        const fp = { ...data.d, timestamp: Date.now() };
        flightPlans.push(fp);

        // Remove old flight plans
        const cutoff = Date.now() - CUTOFF;
        flightPlans = flightPlans.filter(fp => fp.timestamp >= cutoff);
      }
    } catch (e) {
      console.error("❌ WS parse error:", e);
    }
  });

  ws.on("close", () => {
    console.log("⚠️ WebSocket closed, reconnecting in 5s...");
    setTimeout(connectWS, 5000);
  });

  ws.on("error", (err) => console.error("❌ WebSocket error:", err.message));
}

// API: Get airports
app.get("/airports", (req, res) => res.json(airports));

// API: Get flight plans
app.get("/flightplans", (req, res) => {
  const airport = req.query.airport?.toUpperCase();
  let results = flightPlans.filter(fp => fp.timestamp >= Date.now() - CUTOFF);

  if (airport) {
    results = results.filter(fp =>
      fp.departing?.toUpperCase() === airport || fp.arriving?.toUpperCase() === airport
    );
  }

  res.json(results);
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await fetchAirports();
  await fetchInitialFlights();
  connectWS();
});
