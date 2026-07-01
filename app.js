import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

let currentUser = null;
let cloudReady = false;
let applyingCloud = false;
let unsubscribeCloud = null;

function hasValidFirebaseConfig(){
  return firebaseConfig &&
    firebaseConfig.apiKey &&
    !String(firebaseConfig.apiKey).includes("PASTE_") &&
    firebaseConfig.projectId &&
    !String(firebaseConfig.projectId).includes("PASTE_");
}

function cloudDocRef(){
  if(!currentUser) return null;
  return doc(db, "users", currentUser.uid, "shiftData", "main");
}

function collectLocalData(){
  const days = {};
  Object.keys(localStorage).forEach(keyName => {
    if(keyName.startsWith("shift:20")){
      days[keyName] = JSON.parse(localStorage.getItem(keyName));
    }
  });
  return {
    places: JSON.parse(localStorage.getItem("shift:places") || "null"),
    presets: JSON.parse(localStorage.getItem("shift:presets") || "null"),
    wages: JSON.parse(localStorage.getItem("shift:wages") || "null"),
    accordion: JSON.parse(localStorage.getItem("shift:accordion") || "null"),
    days
  };
}

function applyCloudData(data){
  if(!data) return;
  applyingCloud = true;

  if(data.places) localStorage.setItem("shift:places", JSON.stringify(data.places));
  if(data.presets) localStorage.setItem("shift:presets", JSON.stringify(data.presets));
  if(data.wages) localStorage.setItem("shift:wages", JSON.stringify(data.wages));
  if(data.accordion) localStorage.setItem("shift:accordion", JSON.stringify(data.accordion));

  Object.keys(localStorage).forEach(keyName => {
    if(keyName.startsWith("shift:20")) localStorage.removeItem(keyName);
  });
  if(data.days){
    Object.entries(data.days).forEach(([keyName, value]) => {
      localStorage.setItem(keyName, JSON.stringify(value));
    });
  }

  applyingCloud = false;
}

async function syncCloud(){
  if(!currentUser || !cloudReady || applyingCloud) return;
  const ref = cloudDocRef();
  if(!ref) return;
  await setDoc(ref, {
    ...collectLocalData(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function setupCloudForUser(user){
  currentUser = user;
  cloudReady = false;

  if(unsubscribeCloud){
    unsubscribeCloud();
    unsubscribeCloud = null;
  }

  const ref = cloudDocRef();
  const snap = await getDoc(ref);

  if(snap.exists()){
    applyCloudData(snap.data());
  }else{
    await setDoc(ref, {
      ...collectLocalData(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  cloudReady = true;
  renderAll();

  unsubscribeCloud = onSnapshot(ref, docSnap => {
    if(!docSnap.exists() || applyingCloud) return;
    applyCloudData(docSnap.data());
    renderAll();
  });
}

function setupAuth(){
  const status = document.getElementById("authStatus");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if(!hasValidFirebaseConfig()){
    status.textContent = "Firebase未設定";
    loginBtn.disabled = true;
    return;
  }

  loginBtn.onclick = () => signInWithPopup(auth, provider);
  logoutBtn.onclick = () => signOut(auth);

  onAuthStateChanged(auth, user => {
    if(user){
      status.textContent = user.email || "ログイン中";
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
      setupCloudForUser(user);
    }else{
      currentUser = null;
      cloudReady = false;
      if(unsubscribeCloud){
        unsubscribeCloud();
        unsubscribeCloud = null;
      }
      status.textContent = "未ログイン";
      loginBtn.hidden = false;
      logoutBtn.hidden = true;
    }
  });
}


const $ = id => document.getElementById(id);

const PLACE_KEY = "shift:places";
const PRESET_KEY = "shift:presets";
const WAGE_KEY = "shift:wages";
const ACCORDION_KEY = "shift:accordion";
const DAY_PREFIX = "shift:";

const defaults = [
  { name:"いきいき", color:"#2f9e44" },
  { name:"ユニクロ", color:"#e03131" },
  { name:"居酒屋", color:"#f08c00" },
  { name:"その他", color:"#7048e8" }
];

let current = startOfDay(new Date());
let selected = startOfDay(new Date());

function startOfDay(date){ const d = new Date(date); d.setHours(0,0,0,0); return d; }
function key(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function monthFileKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`; }
function dateText(date){ return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`; }
function md(date){ return `${date.getMonth()+1}/${date.getDate()}`; }

function places(){ return JSON.parse(localStorage.getItem(PLACE_KEY) || "null") || defaults; }
function savePlaces(list){ localStorage.setItem(PLACE_KEY, JSON.stringify(list)); syncCloud(); }
function placeByName(name){ return places().find(p => p.name === name) || places()[0] || defaults[0]; }

function wages(){
  const saved = JSON.parse(localStorage.getItem(WAGE_KEY) || "null") || {};
  places().forEach(p => { if(saved[p.name] === undefined) saved[p.name] = 0; });
  return saved;
}
function saveWages(data){ localStorage.setItem(WAGE_KEY, JSON.stringify(data)); syncCloud(); }
function yen(value){ return "¥" + Math.round(value || 0).toLocaleString("ja-JP"); }

function presets(){
  return JSON.parse(localStorage.getItem(PRESET_KEY) || "null") || [
    { place:"いきいき", start:"14:00", end:"17:00", breakMinutes:0, memo:"" },
    { place:"ユニクロ", start:"09:00", end:"14:00", breakMinutes:0, memo:"" },
    { place:"居酒屋", start:"18:00", end:"23:00", breakMinutes:0, memo:"" }
  ];
}
function savePresets(list){ localStorage.setItem(PRESET_KEY, JSON.stringify(list)); syncCloud(); }

function nthMonday(year, monthIndex, nth){
  const d = new Date(year, monthIndex, 1);
  return new Date(year, monthIndex, 1 + ((8 - d.getDay()) % 7) + (nth - 1) * 7);
}
function equinoxDay(year, type){
  if(type === "spring") return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function japaneseHolidayMap(year){
  const map = new Map();
  const add = (date, name) => map.set(key(date), name);
  add(new Date(year,0,1), "元日");
  add(nthMonday(year,0,2), "成人の日");
  add(new Date(year,1,11), "建国記念の日");
  add(new Date(year,1,23), "天皇誕生日");
  add(new Date(year,2,equinoxDay(year,"spring")), "春分の日");
  add(new Date(year,3,29), "昭和の日");
  add(new Date(year,4,3), "憲法記念日");
  add(new Date(year,4,4), "みどりの日");
  add(new Date(year,4,5), "こどもの日");
  add(nthMonday(year,6,3), "海の日");
  add(new Date(year,7,11), "山の日");
  add(nthMonday(year,8,3), "敬老の日");
  add(new Date(year,8,equinoxDay(year,"autumn")), "秋分の日");
  add(nthMonday(year,9,2), "スポーツの日");
  add(new Date(year,10,3), "文化の日");
  add(new Date(year,10,23), "勤労感謝の日");
  [...map.keys()].sort().forEach(dateKey => {
    const d = new Date(dateKey);
    if(d.getDay() !== 0) return;
    const sub = new Date(d);
    do { sub.setDate(sub.getDate() + 1); } while(map.has(key(sub)));
    map.set(key(sub), "振替休日");
  });
  for(let m=0; m<12; m++){
    const last = new Date(year, m+1, 0).getDate();
    for(let day=2; day<last; day++){
      const d = new Date(year,m,day);
      if(d.getDay() === 0 || d.getDay() === 6 || map.has(key(d))) continue;
      const prev = new Date(d); prev.setDate(d.getDate()-1);
      const next = new Date(d); next.setDate(d.getDate()+1);
      if(map.has(key(prev)) && map.has(key(next))) map.set(key(d), "国民の休日");
    }
  }
  return map;
}
function holidayName(date){ return japaneseHolidayMap(date.getFullYear()).get(key(date)) || ""; }

function timeToMinutes(time){
  if(!time) return null;
  const [h,m] = time.split(":").map(Number);
  return h * 60 + m;
}
function breakMinutes(shift){
  if(shift.breakMinutes !== undefined) return Number(shift.breakMinutes || 0);
  return Number(shift.breakH || 0) * 60 + Number(shift.breakM || 0);
}
function workMinutes(shift){
  const start = timeToMinutes(shift.start);
  let end = timeToMinutes(shift.end);
  if(start === null || end === null) return 0;
  if(end < start) end += 1440;
  return Math.max(0, end - start - breakMinutes(shift));
}
function minuteText(minutes){
  minutes = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
function shiftSortValue(shift){
  const value = timeToMinutes(shift.start);
  return value === null ? 99999 : value;
}
function sortShifts(list){ return [...(list || [])].sort((a,b) => shiftSortValue(a) - shiftSortValue(b)); }

function loadDay(date){
  const data = JSON.parse(localStorage.getItem(DAY_PREFIX + key(date)) || '{"version":2,"shifts":[]}');
  data.shifts = sortShifts(data.shifts || []);
  return data;
}
function saveDay(date, data){
  localStorage.setItem(DAY_PREFIX + key(date), JSON.stringify({ version:2, shifts:sortShifts(data.shifts || []) }));
  syncCloud();
}
function getShifts(date){ return loadDay(date).shifts; }
function dayWork(date){ return getShifts(date).reduce((sum,s) => sum + workMinutes(s), 0); }
function dayBreak(date){ return getShifts(date).reduce((sum,s) => sum + breakMinutes(s), 0); }

function eachDate(start, end, callback){
  const d = new Date(start);
  while(d <= end){
    callback(new Date(d));
    d.setDate(d.getDate() + 1);
  }
}
function monthRange(){
  const y = current.getFullYear();
  const m = current.getMonth();
  return { start:new Date(y,m,1), end:new Date(y,m+1,0) };
}
function weekRange(date, mode){
  const d = startOfDay(date);
  const day = d.getDay();
  const offset = mode === "mon" ? (day === 0 ? 6 : day - 1) : day;
  const start = new Date(d);
  start.setDate(d.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}
function rangeTotal(start, end, type){
  let total = 0;
  eachDate(start, end, date => {
    total += type === "break" ? dayBreak(date) : dayWork(date);
  });
  return total;
}
function weekRows(mode){
  const mr = monthRange();
  const first = weekRange(mr.start, mode).start;
  const rows = [];
  let start = new Date(first);
  let idx = 1;
  while(start <= mr.end){
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const clipStart = start < mr.start ? mr.start : start;
    const clipEnd = end > mr.end ? mr.end : end;
    rows.push({
      idx,
      start:new Date(clipStart),
      end:new Date(clipEnd),
      work:rangeTotal(clipStart, clipEnd, "work"),
      break:rangeTotal(clipStart, clipEnd, "break")
    });
    start.setDate(start.getDate() + 7);
    idx++;
  }
  return rows;
}
function selectedWeekIndex(mode){
  const selectedKey = key(selected);
  const found = weekRows(mode).find(row => key(row.start) <= selectedKey && selectedKey <= key(row.end));
  return found ? found.idx : "";
}
function softColor(hex){
  hex = hex.replace("#","");
  const r = parseInt(hex.slice(0,2),16);
  const g = parseInt(hex.slice(2,4),16);
  const b = parseInt(hex.slice(4,6),16);
  const a = .84;
  return `rgb(${Math.round(r+(255-r)*a)},${Math.round(g+(255-g)*a)},${Math.round(b+(255-b)*a)})`;
}

function fillTimeOptions(){
  const list = $("timeOptions");
  if(list.options.length) return;
  for(let h=0; h<24; h++){
    for(let m=0; m<60; m+=5){
      const option = document.createElement("option");
      option.value = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      list.appendChild(option);
    }
  }
}
function normalizeTime(value){
  const raw = String(value || "").trim();
  if(/^\\d{1,2}:\\d{2}$/.test(raw)){
    let [h,m] = raw.split(":").map(Number);
    if(h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  if(/^\\d{3,4}$/.test(raw)){
    const padded = raw.padStart(4,"0");
    const h = Number(padded.slice(0,2));
    const m = Number(padded.slice(2,4));
    if(h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  return "";
}
function setTime(prefix,time){
  $(`${prefix}Time`).value = time || (prefix === "start" ? "09:00" : "18:00");
}
function getTime(prefix){ return normalizeTime($(`${prefix}Time`).value); }
function formatTimeInput(input){
  const normalized = normalizeTime(input.value);
  if(normalized) input.value = normalized;
}

function renderAll(){
  renderCalendar();
  renderSide();
  renderPlaceSettings();
  fillPlaceSelect();
}
function renderCalendar(){
  const y = current.getFullYear();
  const m = current.getMonth();
  $("monthTitle").textContent = `${y}年${m+1}月`;
  const grid = $("calendarGrid");
  grid.innerHTML = "";
  const first = new Date(y,m,1);
  const start = new Date(y,m,1-first.getDay());
  const today = startOfDay(new Date());

  for(let i=0; i<42; i++){
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const cell = document.createElement("div");
    cell.className = "day";
    if(date.getMonth() !== m) cell.classList.add("other");
    if(date.getDay() === 0) cell.classList.add("sunday");
    if(date.getDay() === 6) cell.classList.add("saturday");
    const hName = holidayName(date);
    if(hName) cell.classList.add("holiday");
    if(key(date) === key(today)) cell.classList.add("today");
    if(key(date) === key(selected)) cell.classList.add("selected");

    const total = dayWork(date);
    cell.innerHTML = `
      <div class="dayNum">
        <span class="dateBlock">
          <span class="dateNumber">${date.getDate()}</span>
          ${hName ? `<span class="holidayText">${hName}</span>` : ""}
        </span>
        ${total ? `<span class="dayTotal">${minuteText(total)}</span>` : ""}
      </div>
    `;

    getShifts(date).forEach((shift,index) => {
      const p = placeByName(shift.place || "その他");
      const btn = document.createElement("button");
      btn.className = "shiftChip";
      btn.style.borderLeftColor = p.color;
      btn.style.background = softColor(p.color);
      btn.innerHTML = `<strong>${shift.start || "--:--"}-${shift.end || "--:--"}</strong>`;
      btn.onclick = e => {
        e.stopPropagation();
        selected = startOfDay(date);
        openShift(index);
        renderAll();
      };
      cell.appendChild(btn);
    });

    cell.onclick = () => {
      selected = startOfDay(date);
      renderAll();
    };
    grid.appendChild(cell);
  }
}
function renderSide(){
  $("selectedDate").textContent = dateText(selected);
  $("dayWork").textContent = minuteText(dayWork(selected));
  $("dayBreak").textContent = minuteText(dayBreak(selected));

  const list = $("selectedShiftList");
  list.innerHTML = "";
  getShifts(selected).forEach((shift,index) => {
    const p = placeByName(shift.place || "その他");
    const item = document.createElement("div");
    item.className = "shiftItem";
    item.innerHTML = `
      <span class="dot" style="background:${p.color}"></span>
      <span>
        <strong>${p.name}</strong>
        <small>${shift.start || "--:--"}-${shift.end || "--:--"}・休憩${breakMinutes(shift)}分${shift.memo ? "・" + shift.memo : ""}</small>
      </span>
      <span><b>${minuteText(workMinutes(shift))}</b><br><button type="button" class="copyBtn">コピー</button></span>
    `;
    item.onclick = () => openShift(index);
    item.querySelector(".copyBtn").onclick = e => {
      e.stopPropagation();
      duplicateShift(index);
    };
    list.appendChild(item);
  });

  const mode = $("weekMode").value;
  const wr = weekRange(selected, mode);
  $("weekRangeLabel").textContent = `${selectedWeekIndex(mode)}週目・${md(wr.start)} 〜 ${md(wr.end)}`;
  $("weekWork").textContent = minuteText(rangeTotal(wr.start, wr.end, "work"));
  $("weekBreak").textContent = minuteText(rangeTotal(wr.start, wr.end, "break"));

  const weekList = $("weekList");
  weekList.innerHTML = "";
  weekRows(mode).forEach(row => {
    const item = document.createElement("div");
    item.className = "weekItem";
    item.innerHTML = `<span class="dot" style="background:#8e7df2"></span><span>${row.idx}週目<small>${md(row.start)}〜${md(row.end)}・休憩${minuteText(row.break)}</small></span><b>${minuteText(row.work)}</b>`;
    weekList.appendChild(item);
  });

  const mr = monthRange();
  let totalWork = 0;
  let totalBreak = 0;
  const wageData = wages();
  const byPlace = {};
  places().forEach(p => byPlace[p.name] = { work:0, break:0, color:p.color, wage:Number(wageData[p.name] || 0) });
  eachDate(mr.start, mr.end, date => {
    getShifts(date).forEach(shift => {
      const name = shift.place || "その他";
      const p = placeByName(name);
      if(!byPlace[name]) byPlace[name] = { work:0, break:0, color:p.color, wage:Number(wageData[name] || 0) };
      const w = workMinutes(shift);
      const b = breakMinutes(shift);
      byPlace[name].work += w;
      byPlace[name].break += b;
      totalWork += w;
      totalBreak += b;
    });
  });

  $("monthWork").textContent = minuteText(totalWork);
  $("monthBreak").textContent = minuteText(totalBreak);
  const salaryTotal = Object.values(byPlace).reduce((sum,total) => sum + (total.work / 60) * Number(total.wage || 0), 0);
  $("monthSalary").textContent = yen(salaryTotal);
  renderWageSettings();

  const placeBox = $("monthByPlace");
  placeBox.innerHTML = "";
  Object.entries(byPlace).forEach(([name,total]) => {
    const row = document.createElement("div");
    row.className = "placeTotal";
    const placeSalary = (total.work / 60) * Number(total.wage || 0);
    row.innerHTML = `<span class="dot" style="background:${total.color}"></span><span>${name}<small>${minuteText(total.work)}・休憩${minuteText(total.break)}・時給${yen(total.wage || 0)}</small></span><b>${yen(placeSalary)}</b>`;
    placeBox.appendChild(row);
  });
}
function fillPlaceSelect(value){
  const select = $("placeSelect");
  const old = value || select.value;
  select.innerHTML = "";
  places().forEach(p => {
    const o = document.createElement("option");
    o.value = p.name;
    o.textContent = p.name;
    select.appendChild(o);
  });
  if([...select.options].some(o => o.value === old)) select.value = old;
}
function readForm(){
  return {
    place:$("placeSelect").value,
    start:getTime("start"),
    end:getTime("end"),
    breakMinutes:Number($("breakMinutes").value || 0),
    memo:$("memo").value.trim()
  };
}
function updateCalc(){ $("calcWork").textContent = minuteText(workMinutes(readForm())); }
function applyShiftToForm(shift){
  if(!shift) return;
  fillPlaceSelect(shift.place);
  setTime("start", shift.start || "09:00");
  setTime("end", shift.end || "18:00");
  $("breakMinutes").value = breakMinutes(shift);
  $("memo").value = shift.memo || "";
  updateCalc();
}
function recentShiftRecords(limit=40){
  const records = [];
  const base = new Date(selected);
  for(let i=0; i<=370 && records.length<limit; i++){
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    (loadDay(d).shifts || []).forEach((shift,index) => records.push({ date:new Date(d), index, shift }));
  }
  return records.sort((a,b) => b.date - a.date).slice(0,limit);
}
function duplicateShift(index){
  const shift = loadDay(selected).shifts[index];
  if(!shift) return;
  openShift(null);
  applyShiftToForm({ ...shift, memo:shift.memo || "" });
}
function renderHistoryPicker(){
  const box = $("historyList");
  box.innerHTML = "";
  const records = recentShiftRecords(40);
  if(!records.length){
    box.innerHTML = `<div class="emptyText">コピーできる履歴がありません。</div>`;
    return;
  }
  records.forEach(record => {
    const shift = record.shift;
    const p = placeByName(shift.place || "その他");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pickerItem";
    btn.innerHTML = `<span class="dot" style="background:${p.color}"></span><span><strong>${md(record.date)} ${p.name}</strong><small>${shift.start || "--:--"}-${shift.end || "--:--"}・休憩${breakMinutes(shift)}分${shift.memo ? "・" + shift.memo : ""}</small></span><b>${minuteText(workMinutes(shift))}</b>`;
    btn.onclick = () => {
      applyShiftToForm({ ...shift, memo:shift.memo || "" });
      $("historyDialog").close();
    };
    box.appendChild(btn);
  });
}
function renderPresetPicker(){
  const box = $("presetList");
  box.innerHTML = "";
  const list = presets();
  if(!list.length){
    box.innerHTML = `<div class="emptyText">保存されたよく使う時間がありません。</div>`;
    return;
  }
  list.forEach((shift,index) => {
    const p = placeByName(shift.place || "その他");
    const row = document.createElement("div");
    row.className = "pickerItem";
    row.innerHTML = `<span class="dot" style="background:${p.color}"></span><span><strong>${p.name}</strong><small>${shift.start || "--:--"}-${shift.end || "--:--"}・休憩${breakMinutes(shift)}分</small></span><button type="button" class="deleteMini">削除</button>`;
    row.onclick = () => {
      applyShiftToForm({ ...shift, memo:shift.memo || "" });
      $("presetDialog").close();
    };
    row.querySelector(".deleteMini").onclick = e => {
      e.stopPropagation();
      const next = presets();
      next.splice(index,1);
      savePresets(next);
      renderPresetPicker();
    };
    box.appendChild(row);
  });
}
function saveCurrentAsPreset(){
  const shift = readForm();
  if(!shift.start || !shift.end){
    alert("先に時刻を24時間制で入力してください。例：09:00 または 0900");
    return;
  }
  const list = presets();
  const exists = list.some(item => item.place === shift.place && item.start === shift.start && item.end === shift.end && Number(item.breakMinutes || 0) === Number(shift.breakMinutes || 0));
  if(exists){
    alert("すでに保存されている時間です。");
    return;
  }
  list.push({ place:shift.place, start:shift.start, end:shift.end, breakMinutes:shift.breakMinutes, memo:"" });
  savePresets(list);
  alert("よく使う時間に保存しました。");
}
function openShift(index=null){
  const data = loadDay(selected);
  const shift = index === null ? {} : data.shifts[index];
  $("modalTitle").textContent = index === null ? "シフト追加" : "シフト編集";
  $("editIndex").value = index === null ? "" : String(index);
  fillPlaceSelect(shift.place);
  setTime("start", shift.start);
  setTime("end", shift.end);
  $("breakMinutes").value = breakMinutes(shift);
  $("memo").value = shift.memo || "";
  $("deleteShift").style.display = index === null ? "none" : "block";
  updateCalc();
  $("shiftDialog").showModal();
}
function saveShift(){
  const shift = readForm();
  if(!shift.start || !shift.end){
    alert("時刻は24時間制で入力してください。例：09:00 または 0900");
    return;
  }
  $("startTime").value = shift.start;
  $("endTime").value = shift.end;
  const data = loadDay(selected);
  const index = $("editIndex").value;
  if(index === "") data.shifts.push(shift);
  else data.shifts[Number(index)] = shift;
  saveDay(selected, data);
  $("shiftDialog").close();
  renderAll();
}
function deleteShift(){
  const index = $("editIndex").value;
  if(index === "") return;
  const data = loadDay(selected);
  data.shifts.splice(Number(index),1);
  saveDay(selected, data);
  $("shiftDialog").close();
  renderAll();
}
function renamePlace(oldName,newName){
  if(!newName || oldName === newName) return;
  const wageData = wages();
  if(wageData[oldName] !== undefined){
    wageData[newName] = wageData[oldName];
    delete wageData[oldName];
    saveWages(wageData);
  }
  Object.keys(localStorage).forEach(storageKey => {
    if(!storageKey.startsWith(DAY_PREFIX+"20")) return;
    const data = JSON.parse(localStorage.getItem(storageKey));
    let changed = false;
    (data.shifts || []).forEach(shift => {
      if(shift.place === oldName){
        shift.place = newName;
        changed = true;
      }
    });
    if(changed) localStorage.setItem(storageKey, JSON.stringify(data));
  });
}
function renderWageSettings(){
  const box = $("wageSettings");
  if(!box) return;
  const wageData = wages();
  box.innerHTML = "";
  places().forEach(place => {
    const row = document.createElement("div");
    row.className = "wageRow";
    row.innerHTML = `<span class="dot" style="background:${place.color}"></span><label>${place.name}</label><input type="number" min="0" step="10" value="${Number(wageData[place.name] || 0)}" aria-label="${place.name} 時給">`;
    row.querySelector("input").onchange = e => {
      const next = wages();
      next[place.name] = Number(e.target.value || 0);
      saveWages(next);
      renderSide();
    };
    box.appendChild(row);
  });
}
function renderPlaceSettings(){
  const box = $("placeSettings");
  box.innerHTML = "";
  places().forEach((place,index) => {
    const row = document.createElement("div");
    row.className = "settingRow";
    const name = document.createElement("input");
    name.type = "text";
    name.value = place.name;
    const color = document.createElement("input");
    color.type = "color";
    color.value = place.color;
    const save = document.createElement("button");
    save.textContent = "保存";
    const del = document.createElement("button");
    del.textContent = "削除";
    del.className = "danger";

    save.onclick = () => {
      const list = places();
      const oldName = list[index].name;
      const newName = name.value.trim() || oldName;
      renamePlace(oldName,newName);
      list[index].name = newName;
      list[index].color = color.value;
      savePlaces(list);
      renderAll();
    };

    del.onclick = () => {
      const list = places();
      if(list.length <= 1){
        alert("勤務先は1つ以上必要です。");
        return;
      }
      if(!confirm(`${list[index].name}を削除しますか？この勤務先のシフトも削除されます。`)) return;
      const deletedName = list[index].name;
      list.splice(index,1);
      savePlaces(list);
      const wageData = wages();
      delete wageData[deletedName];
      saveWages(wageData);

      Object.keys(localStorage).forEach(storageKey => {
        if(!storageKey.startsWith(DAY_PREFIX+"20")) return;
        const data = JSON.parse(localStorage.getItem(storageKey));
        data.shifts = (data.shifts || []).filter(shift => (shift.place || "その他") !== deletedName);
        localStorage.setItem(storageKey, JSON.stringify(data));
      });
      renderAll();
    };

    row.append(name,color,save,del);
    box.appendChild(row);
  });
}
function backup(){
  const output = { places:places(), wages:wages(), presets:presets(), days:{} };
  Object.keys(localStorage).forEach(storageKey => {
    if(storageKey.startsWith(DAY_PREFIX+"20")) output.days[storageKey] = JSON.parse(localStorage.getItem(storageKey));
  });
  const blob = new Blob([JSON.stringify(output,null,2)], { type:"application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `shift-backup-${monthFileKey(new Date())}.json`;
  link.click();
}
function initAccordions(){
  const saved = JSON.parse(localStorage.getItem(ACCORDION_KEY) || "null") || {};
  document.querySelectorAll(".accordion").forEach(section => {
    const keyName = section.dataset.section;
    if(saved[keyName] === false) section.classList.remove("open");
    section.querySelector(".accordionHead").onclick = () => {
      section.classList.toggle("open");
      const state = {};
      document.querySelectorAll(".accordion").forEach(s => {
        state[s.dataset.section] = s.classList.contains("open");
      });
      localStorage.setItem(ACCORDION_KEY, JSON.stringify(state));
      syncCloud();
    };
  });
}

fillTimeOptions();
initAccordions();

$("prevMonth").onclick = () => { current = new Date(current.getFullYear(),current.getMonth()-1,1); renderAll(); };
$("nextMonth").onclick = () => { current = new Date(current.getFullYear(),current.getMonth()+1,1); renderAll(); };
$("todayBtn").onclick = () => { current = startOfDay(new Date()); selected = startOfDay(new Date()); renderAll(); };
$("openAddShift").onclick = () => openShift(null);
$("closeDialog").onclick = () => $("shiftDialog").close();
$("saveShift").onclick = saveShift;
$("deleteShift").onclick = deleteShift;
$("weekMode").onchange = renderSide;
$("openHistoryPicker").onclick = () => { renderHistoryPicker(); $("historyDialog").showModal(); };
$("openPresetPicker").onclick = () => { renderPresetPicker(); $("presetDialog").showModal(); };
$("saveAsPreset").onclick = saveCurrentAsPreset;
$("closeHistory").onclick = () => $("historyDialog").close();
$("closePreset").onclick = () => $("presetDialog").close();

["placeSelect","startTime","endTime","breakMinutes","memo"].forEach(id => $(id).addEventListener("input",updateCalc));
["startTime","endTime"].forEach(id => {
  $(id).addEventListener("blur", e => {
    formatTimeInput(e.target);
    updateCalc();
  });
});
$("addPlace").onclick = () => {
  const list = places();
  list.push({ name:`勤務先${list.length+1}`, color:"#339af0" });
  savePlaces(list);
  renderAll();
};
$("backupBtn").onclick = backup;
$("resetBtn").onclick = () => {
  if(!confirm("保存されたシフトデータをすべて削除しますか？")) return;
  Object.keys(localStorage).forEach(storageKey => {
    if(storageKey.startsWith(DAY_PREFIX)) localStorage.removeItem(storageKey);
  });
  savePlaces(defaults);
  renderAll();
};

setupAuth();
renderAll();
