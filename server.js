import express from "express";
import cors from "cors";
import WebSocket from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));

// Store ALL flights
let flightPlans = [];

// Only keep last 20 minutes
const CUTOFF = 20 * 60 * 1000;

// --- Fetch initial snapshot of flights ---
async function fetchInitialFlights() {
  try {
    console.log("📡 Fetching initial flight plans...");
    const res = await fetch("https://24data.ptfs.app/api/v1/flight-plans");
    const data = await res.json();

    if (Array.isArray(data)) {
      flightPlans = data.map(fp => ({
        ...fp,
        timestamp: Date.now()
      }));
      console.log(`✅ Loaded ${flightPlans.length} initial flight plans`);
    } else {
      console.warn("⚠️ Unexpected snapshot response:", data);
    }
  } catch (err) {
    console.error("❌ Error fetching initial flights:", err);
  }
}

// --- Connect to WebSocket for live updates ---
function connectWS() {
  const ws = new WebSocket("wss://24data.ptfs.app/wss", {
    headers: { Origin: "" }
  });

  ws.on("open", () => {
    console.log("🔌 Connected to 24data WebSocket");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.t === "FLIGHT_PLAN" || data.t === "EVENT_FLIGHT_PLAN") {
        const fp = {
          ...data.d,
          timestamp: Date.now()
        };

        // Push new record (keep history, not replace)
        flightPlans.push(fp);

        // Remove stale flights older than cutoff
        const cutoff = Date.now() - CUTOFF;
        flightPlans = flightPlans.filter(fp => fp.timestamp >= cutoff);

        console.log(`✈️ Flight plan received: ${fp.callsign || fp.id}`);
      }
    } catch (e) {
      console.error("❌ Error parsing WS message:", e);
    }
  });

  ws.on("close", () => {
    console.log("⚠️ WebSocket closed, reconnecting in 5s...");
    setTimeout(connectWS, 5000);
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err.message);
  });
}

// --- API endpoint for frontend ---
app.get("/flightplans", (req, res) => {
  const airport = req.query.airport?.toUpperCase();
  const cutoff = Date.now() - CUTOFF;

  let results = flightPlans.filter(fp => fp.timestamp >= cutoff);

  if (airport) {
    results = results.filter(fp =>
      fp.departure?.icao === airport || fp.arrival?.icao === airport
    );
  }

  res.json(results);
});

// --- Start server ---
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await fetchInitialFlights();
  connectWS();
});
