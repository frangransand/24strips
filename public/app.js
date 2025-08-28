const stripGrid = document.getElementById("stripGrid");
const airportInput = document.getElementById("airport");
const chkDep = document.getElementById("chkDep");
const chkArr = document.getElementById("chkArr");
const btnRefresh = document.getElementById("btnRefresh");
const btnNew = document.getElementById("btnNew");

const modal = document.getElementById("modal");
const modalForm = document.getElementById("modalForm");
const modalTitle = document.getElementById("modalTitle");
const modalSubmit = document.getElementById("modalSubmit");
const tpl = document.getElementById("stripTemplate");

let editingId = null;
let currentAirport = "";
let includeDep = true;
let includeArr = true;

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toUTCString().split(" GMT")[0];
}

function getFilters() {
  currentAirport = (airportInput.value || "").trim().toUpperCase();
  includeDep = !!chkDep.checked;
  includeArr = !!chkArr.checked;
}

async function loadStrips() {
  getFilters();
  const qs = new URLSearchParams({
    airport: currentAirport,
    includeDepartures: includeDep,
    includeArrivals: includeArr
  });
  const res = await fetch(`/api/strips?${qs.toString()}`);
  const data = await res.json();
  renderGrid(data);
}

function renderGrid(list) {
  stripGrid.innerHTML = "";
  for (const s of list) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = s.id;

    node.querySelector(".cs").textContent = s.callsign || s.realcallsign || "—";
    const statusEl = node.querySelector(".status");
    statusEl.textContent = s.status || "Filed";
    statusEl.dataset.s = s.status || "Filed";

    node.querySelector(".ac").textContent = s.aircraft || "—";
    node.querySelector(".rules").textContent = s.fligthrules || s.flightrules || "—";
    node.querySelector(".dep").textContent = s.departing || "—";
    node.querySelector(".arr").textContent = s.arriving || "—";
    node.querySelector(".fl").textContent = s.flightlevel || "—";
    node.querySelector(".rte").textContent = s.route || "—";
    node.querySelector(".rmk").textContent = s.remarks || "";
    node.querySelector(".spd").textContent = s.scratchpad || "";
    node.querySelector(".roblox").textContent = s.robloxName || "unknown";
    node.querySelector(".time").textContent = fmtTime(s.createdAt) + (s.pinned ? " • 📌" : "");

    // Buttons
    node.querySelector(".del").addEventListener("click", () => delStrip(s.id));
    node.querySelector(".pin").addEventListener("click", () => pinStrip(s.id, !s.pinned));
    node.querySelector(".edit").addEventListener("click", () => openEdit(s));

    stripGrid.appendChild(node);
  }
}

function openNew() {
  editingId = null;
  modalTitle.textContent = "New Strip";
  modalForm.reset();
  modal.showModal();
}

function openEdit(s) {
  editingId = s.id;
  modalTitle.textContent = `Edit ${s.callsign || s.realcallsign}`;
  modalForm.reset();
  for (const [k, v] of Object.entries(s)) {
    const el = modalForm.elements.namedItem(k);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v ?? "";
  }
  modal.showModal();
}

async function delStrip(id) {
  await fetch(`/api/strips/${encodeURIComponent(id)}`, { method: "DELETE" });
  // The SSE "delete" will remove from UI as well
}

async function pinStrip(id, pinned) {
  await fetch(`/api/strips/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned })
  });
}

modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(modalForm);
  const body = Object.fromEntries(form.entries());
  // normalize
  body.pinned = !!form.get("pinned");
  body.flightlevel = body.flightlevel?.trim();
  body.callsign = body.callsign?.toUpperCase();
  body.realcallsign = body.realcallsign?.toUpperCase();
  body.flightrules = body.flightrules?.toUpperCase();
  body.departing = body.departing?.toUpperCase();
  body.arriving = body.arriving?.toUpperCase();

  if (editingId) {
    await fetch(`/api/strips/${encodeURIComponent(editingId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } else {
    await fetch(`/api/strips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  modal.close();
});

btnRefresh.addEventListener("click", loadStrips);
btnNew.addEventListener("click", openNew);
airportInput.addEventListener("change", loadStrips);
chkDep.addEventListener("change", loadStrips);
chkArr.addEventListener("change", loadStrips);

// SSE live updates
function startSSE() {
  const es = new EventSource("/sse");
  es.addEventListener("hello", () => {
    // After connected, load current
    loadStrips();
  });
  es.addEventListener("upsert", (ev) => {
    const s = JSON.parse(ev.data);
    // If it matches current filter, optimistic refresh
    const a = (currentAirport || "").toUpperCase();
    const matches =
      !a ||
      (chkDep.checked && s.departing?.toUpperCase() === a) ||
      (chkArr.checked && s.arriving?.toUpperCase() === a);
    if (matches) loadStrips();
  });
  es.addEventListener("delete", (ev) => {
    const { id } = JSON.parse(ev.data);
    const node = stripGrid.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (node) node.remove();
  });
}
startSSE();

// Initial populate
loadStrips();

// Close modal on Cancel
modal.addEventListener("click", (e) => {
  const rect = modal.querySelector(".modal").getBoundingClientRect();
  const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                 e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (!inside) modal.close();
});
