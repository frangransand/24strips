const stripGrid = document.getElementById("stripGrid");
const airportInput = document.getElementById("airport");
const chkDep = document.getElementById("chkDep");
const chkArr = document.getElementById("chkArr");
const chkDelivery = document.getElementById("chkDelivery");
const chkGround = document.getElementById("chkGround");
const chkTower = document.getElementById("chkTower");
const chkCenter = document.getElementById("chkCenter");
const btnRefresh = document.getElementById("btnRefresh");
const btnNew = document.getElementById("btnNew");

const modal = document.getElementById("modal");
const modalForm = document.getElementById("modalForm");
const modalTitle = document.getElementById("modalTitle");
const tpl = document.getElementById("stripTemplate");

let editingId = null;
let currentAirport = "";
let includeDep = true, includeArr = true, includeDelivery = true, includeGround = true, includeTower = true, includeCenter = true;

// Fetch airports for dropdown
async function loadAirports() {
  const res = await fetch("/api/airports");
  const airports = await res.json();
  airportInput.innerHTML = `<option value="">— All —</option>` +
    airports.map(a => `<option value="${a.icao}">${a.icao} – ${a.name}</option>`).join("");
}
loadAirports();

function fmtTime(ts) { return new Date(ts).toUTCString().split(" GMT")[0]; }

function getFilters() {
  currentAirport = (airportInput.value || "").toUpperCase();
  includeDep = chkDep.checked;
  includeArr = chkArr.checked;
  includeDelivery = chkDelivery.checked;
  includeGround = chkGround.checked;
  includeTower = chkTower.checked;
  includeCenter = chkCenter.checked;
}

async function loadStrips() {
  getFilters();
  const qs = new URLSearchParams({ airport: currentAirport });
  const res = await fetch(`/api/strips?${qs.toString()}`);
  const data = await res.json();
  renderGrid(data);
}

function renderGrid(list) {
  stripGrid.innerHTML = "";
  for (const s of list) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = s.id;

    // ATC type filter
    const type = (s.controllerType || "").toUpperCase();
    if (
      (type === "DELIVERY" && !includeDelivery) ||
      (type === "GND" && !includeGround) ||
      (type === "TWR" && !includeTower) ||
      (type === "CTR" && !includeCenter) ||
      (type === "ARRIVAL" && !includeCenter)
    ) continue;

    node.querySelector(".cs").textContent = s.callsign || s.realcallsign || "—";
    node.querySelector(".status").textContent = s.status || "Filed";
    node.querySelector(".ac").textContent = s.aircraft || "—";
    node.querySelector(".rules").textContent = s.flightrules || "—";
    node.querySelector(".dep").textContent = s.departing || "—";
    node.querySelector(".arr").textContent = s.arriving || "—";
    node.querySelector(".fl").textContent = s.flightlevel || "—";
    node.querySelector(".rte").textContent = s.route || "—";
    node.querySelector(".rmk").textContent = s.remarks || "";
    node.querySelector(".spd").textContent = s.scratchpad || "";
    node.querySelector(".roblox").textContent = s.robloxName || "unknown";
    node.querySelector(".time").textContent = fmtTime(s.createdAt) + (s.pinned ? " • 📌" : "");

    // ATC column colors
    const atcEl = node.querySelector(".atc");
    if (type) {
      atcEl.textContent = type;
      switch(type) {
        case "DELIVERY": atcEl.style.background="#FFD700"; break;
        case "GND": atcEl.style.background="#00BFFF"; break;
        case "TWR": atcEl.style.background="#32CD32"; break;
        case "CTR": atcEl.style.background="#FF69B4"; break;
        case "ARRIVAL": atcEl.style.background="#FFA500"; break;
        default: atcEl.style.background="transparent";
      }
    } else { atcEl.textContent="—"; atcEl.style.background="transparent"; }

    // Buttons
    node.querySelector(".del").addEventListener("click",()=>delStrip(s.id));
    node.querySelector(".pin").addEventListener("click",()=>pinStrip(s.id,!s.pinned));
    node.querySelector(".edit").addEventListener("click",()=>openEdit(s));

    stripGrid.appendChild(node);
  }
}

function openNew() { editingId=null; modalTitle.textContent="New Strip"; modalForm.reset(); modal.showModal(); }
function openEdit(s) {
  editingId=s.id; modalTitle.textContent=`Edit ${s.callsign||s.realcallsign}`;
  modalForm.reset();
  for(const [k,v] of Object.entries(s)) {
    const el=modalForm.elements.namedItem(k);
    if(!el) continue;
    if(el.type==="checkbox") el.checked=!!v;
    else el.value=v??"";
  }
  modal.showModal();
}

async function delStrip(id){await fetch(`/api/strips/${encodeURIComponent(id)}`,{method:"DELETE"});}
async function pinStrip(id,pinned){await fetch(`/api/strips/${encodeURIComponent(id)}`,{
  method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pinned})
});}

modalForm.addEventListener("submit",async e=>{
  e.preventDefault();
  const form=new FormData(modalForm);
  const body=Object.fromEntries(form.entries());
  body.pinned=!!form.get("pinned");
  body.flightlevel=body.flightlevel?.trim();
  body.callsign=body.callsign?.toUpperCase();
  body.realcallsign=body.realcallsign?.toUpperCase();
  body.flightrules=body.flightrules?.toUpperCase();
  body.departing=body.departing?.toUpperCase();
  body.arriving=body.arriving?.toUpperCase();
  if(editingId){
    await fetch(`/api/strips/${encodeURIComponent(editingId)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  } else {
    await fetch(`/api/strips`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  }
  modal.close();
});

btnRefresh.addEventListener("click",loadStrips);
btnNew.addEventListener("click",openNew);
airportInput.addEventListener("change",loadStrips);
chkDep.addEventListener("change",loadStrips);
chkArr.addEventListener("change",loadStrips);
chkDelivery.addEventListener("change",loadStrips);
chkGround.addEventListener("change",loadStrips);
chkTower.addEventListener("change",loadStrips);
chkCenter.addEventListener("change",loadStrips);

// SSE live updates
function startSSE(){
  const es=new EventSource("/sse");
  es.addEventListener("hello",()=>{loadStrips();});
  es.addEventListener("upsert",ev=>{const s=JSON.parse(ev.data);loadStrips();});
  es.addEventListener("delete",ev=>{const {id}=JSON.parse(ev.data); const node=stripGrid.querySelector(`[data-id="${CSS.escape(id)}"]`); if(node) node.remove();});
}
startSSE();

// Close modal on outside click
modal.addEventListener("click",e=>{
  const rect=modal.querySelector(".modal").getBoundingClientRect();
  if(!(e.clientX>=rect.left && e.clientX<=rect.right && e.clientY>=rect.top && e.clientY<=rect.bottom)) modal.close();
});

// Initial load
loadStrips();
