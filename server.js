import express from "express";
import cors from "cors";
import WebSocket from "ws";
import fetch from "node-fetch"; // make sure to install node-fetch: npm install node-fetch

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));

// --- Flight plan cache ---
let flightPlans = [];
const CUTOFF = 20 * 60 * 1000; // 20 minutes

// --- Airport cache ---
let airports = [];

// --- Fetch airports from 24data API ---
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

// --- WebSocket connection to 24data ---
function connectWS() {
  const ws = new WebSocket("wss://24data.ptfs.app/wss", {
    headers: { Origin: "" } // browsers set Origin; server should not
  });

  ws.on("open", () => console.log("🔌 Connected to 24data WebSocket"));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      // Only store flight plans
      if (data.t === "FLIGHT_PLAN" || data.t === "EVENT_FLIGHT_PLAN") {
        const fp = { ...data.d, timestamp: Date.now() };
        flightPlans.push(fp);

        // Keep only last 20 minutes
        const cutoff = Date.now() - CUTOFF;
        flightPlans = flightPlans.filter(fp => fp.timestamp >= cutoff);
      }
    } catch (err) {
      console.error("❌ WS parse error:", err);
    }
  });

  ws.on("close", () => {
    console.log("⚠️ WebSocket closed, reconnecting in 5s...");
    setTimeout(connectWS, 5000);
  });

  ws.on("error", (err) => console.error("❌ WebSocket error:", err.message));
}

// --- API endpoint: get airports ---
app.get("/airports", (req, res) => {
  res.json(airports);
});

// --- API endpoint: get flight plans ---
app.get("/flightplans", (req, res) => {
  const airport = req.query.airport?.toUpperCase();
  const now = Date.now();

  // Only include flight plans within last 20 minutes
  let results = flightPlans.filter(fp => fp.timestamp >= now - CUTOFF);

  if (airport) {
    results = results.filter(fp =>
      fp.departing?.toUpperCase() === airport || fp.arriving?.toUpperCase() === airport
    );
  }

  res.json(results);
});

// --- Start server ---
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await fetchAirports();
  connectWS();
});
