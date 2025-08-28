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
const tpl = document.getElementById("stripTemplate");

let currentAirport = "";
let includeDep = true;
let includeArr = true;
let includeDelivery = true;
let includeGround = true;
let includeTower = true;
let includeCenter = true;

async function loadAirports() {
  const res = await fetch("/api/airports");
  const airports = await res.json();
  airportInput.innerHTML = `<option value="">— All —</option>` + airports.map(a=>`<option value="${a.icao}">${a.icao}</option>`).join("");
}
loadAirports();

function fmtTime(ts) { return new Date(ts).toUTCString().split(" GMT")[0]; }
function getFilters() {
  currentAirport = (airportInput.value||"").toUpperCase();
  includeDep = chkDep.checked;
  includeArr = chkArr.checked;
  includeDelivery = chkDelivery.checked;
  includeGround = chkGround.checked;
  includeTower = chkTower.checked;
  includeCenter = chkCenter.checked;
}

async function loadStrips() {
  getFilters();
  const qs = new URLSearchParams({airport: currentAirport});
  const res = await fetch(`/api/strips?${qs.toString()}`);
  const data = await res.json();
  renderGrid(data);
}

function renderGrid(list){
  stripGrid.innerHTML="";
  for(const s of list){
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = s.id;

    const type = (s.controllerType||"").toUpperCase();
    if((type==="DELIVERY"&&!includeDelivery)||(type==="GND"&&!includeGround)||(type==="TWR"&&!includeTower)||(type==="CTR"&&!includeCenter)||(type==="ARRIVAL"&&!includeCenter)) continue;

    node.querySelector(".cs").textContent = s.callsign||s.realcallsign||"—";
    node.querySelector(".status").textContent = s.status||"Filed";
    node.querySelector(".ac").textContent = s.aircraft||"—";
    node.querySelector(".rules").textContent = s.flightrules||"—";
    node.querySelector(".dep").textContent = s.departing||"—";
    node.querySelector(".arr").textContent = s.arriving||"—";
    node.querySelector(".fl").textContent = s.flightlevel||"—";
    node.querySelector(".rte").textContent = s.route||"—";
    node.querySelector(".rmk").textContent = s.remarks||"";
    node.querySelector(".spd").textContent = s.scratchpad||"";
    node.querySelector(".roblox").textContent = s.robloxName||"unknown";
    node.querySelector(".time").textContent = fmtTime(s.timestamp);

    const atcEl = node.querySelector(".atc");
    atcEl.textContent = type||"—";
    switch(type){
      case "DELIVERY": atcEl.style.background="#FFD700"; break;
      case "GND": atcEl.style.background="#00BFFF"; break;
      case "TWR": atcEl.style.background="#32CD32"; break;
      case "CTR": atcEl.style.background="#FF69B4"; break;
      case "ARRIVAL": atcEl.style.background="#FFA500"; break;
      default: atcEl.style.background="transparent"; atcEl.style.color="black";
    }

    stripGrid.appendChild(node);
  }
}

btnRefresh.addEventListener("click",loadStrips);
airportInput.addEventListener("change",loadStrips);
chkDep.addEventListener("change",loadStrips);
chkArr.addEventListener("change",loadStrips);
chkDelivery.addEventListener("change",loadStrips);
chkGround.addEventListener("change",loadStrips);
chkTower.addEventListener("change",loadStrips);
chkCenter.addEventListener("change",loadStrips);

// Initial load
loadStrips();
