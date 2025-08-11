// CareBuddy MVP
const DEFAULT_ROUTINE = [
  "🛏️ Make bed",
  "🪥 Brush teeth",
  "🧴 Wash face",
  "💊 Take meds",
  "🥣 Eat breakfast",
  "🧥 Get dressed",
  "🕒 Check plan"
];

const qs = s=>document.querySelector(s);
const qsa = s=>Array.from(document.querySelectorAll(s));

// State
const state = JSON.parse(localStorage.getItem('cb_state')||'{}');
state.pet = state.pet || { hunger: 70, hygiene: 70, energy: 70, mood: 70 };
state.badges = state.badges || 0;
state.routine = state.routine || DEFAULT_ROUTINE;
state.settings = state.settings || { largeText:false, symbolOnly:false, reducedMotion:false, voiceOn:false, pin:"" };
save();

// PWA install
let deferredPrompt;
const installBtn = qs('#installBtn');
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; installBtn.hidden = false; });
installBtn.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.hidden=true; });

// Service worker
if ('serviceWorker' in navigator) { window.addEventListener('load', ()=> navigator.serviceWorker.register('service-worker.js')); }

// Accessibility toggles
const root = document.documentElement;
const applyA11y = ()=>{
  document.body.classList.toggle('large-text', state.settings.largeText);
  document.body.classList.toggle('symbol-only', state.settings.symbolOnly);
  if (state.settings.reducedMotion) root.style.setProperty('scroll-behavior','auto');
  else root.style.removeProperty('scroll-behavior');
};
applyA11y();

// Voice helper
function speak(txt){
  if(!state.settings.voiceOn) return;
  const u = new SpeechSynthesisUtterance(txt);
  u.rate = 0.95; u.pitch = 1; u.lang = 'en-GB';
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// Pet draw (simple)
const cvs = qs('#petCanvas'); const ctx = cvs.getContext('2d');
function drawPet(){
  const { hunger, hygiene, energy, mood } = state.pet;
  ctx.clearRect(0,0,cvs.width,cvs.height);
  // body
  ctx.fillStyle = '#4b6bff'; ctx.beginPath(); ctx.ellipse(110,100,60,45,0,0,Math.PI*2); ctx.fill();
  // face
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(110,90,34,0,Math.PI*2); ctx.fill();
  // eyes
  ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(95,88,5,0,Math.PI*2); ctx.arc(125,88,5,0,Math.PI*2); ctx.fill();
  // mouth mood
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath();
  const m = (mood-50)/50; // -1..+1
  ctx.arc(110,100,12,Math.PI*(1.1 - 0.3*m),Math.PI*(1.9 + 0.3*m)); ctx.stroke();
  // stats hint bars
  const bars = [hunger,hygiene,energy,mood];
  bars.forEach((v,i)=>{
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(20+i*50,140,40,8);
    ctx.fillStyle = '#8bd3ff'; ctx.fillRect(20+i*50,140,40*(v/100),8);
  });
}
drawPet();

function clamp(v){ return Math.max(0, Math.min(100, v)); }
function updateStats(delta){
  state.pet.hunger = clamp(state.pet.hunger + (delta.hunger||0));
  state.pet.hygiene = clamp(state.pet.hygiene + (delta.hygiene||0));
  state.pet.energy = clamp(state.pet.energy + (delta.energy||0));
  state.pet.mood = clamp(state.pet.mood + (delta.mood||0));
  save(); drawPet(); renderMeters(); checkBadge();
}

function renderMeters(){
  qs('#hunger').value = state.pet.hunger;
  qs('#hygiene').value = state.pet.hygiene;
  qs('#energy').value = state.pet.energy;
  qs('#mood').value = state.pet.mood;
}
renderMeters();

// Decay over time (every 5 minutes a small drop)
setInterval(()=> updateStats({ hunger:-2, energy:-2, mood:-1 }), 5*60*1000);

// Care buttons
qsa('.care-buttons .big').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const act = btn.dataset.action;
    if (act==='feed')      { updateStats({ hunger:+20, mood:+5 }); speak('Yum! Thank you.'); }
    if (act==='wash')      { updateStats({ hygiene:+25, mood:+3 }); speak('All clean.'); }
    if (act==='play')      { updateStats({ energy:-10, mood:+15, hunger:-5 }); speak('Fun time!'); }
    if (act==='rest')      { updateStats({ energy:+30, mood:+5 }); speak('Resting now.'); }
    btn.classList.add('animate'); setTimeout(()=>btn.classList.remove('animate'), 300);
  });
});

// Routine
const routineList = qs('#routineList');
function renderRoutine(){
  routineList.innerHTML = state.routine.map((line,i)=>{
    const [emoji, ...txtParts] = line.split(' ');
    const txt = txtParts.join(' ');
    const done = todayDone().has(i);
    return `<div class="step ${done?'done':''}" data-i="${i}" role="button" tabindex="0" aria-pressed="${done?'true':'false'}">
      <div class="icon">${emoji}</div><div class="label">${txt}</div>
    </div>`;
  }).join('');
  qsa('.step').forEach(el=> el.addEventListener('click', ()=> toggleStep(+el.dataset.i)));
}
function todayKey(){ const d=new Date(); return `cb_steps_${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`; }
function todayDone(){ return new Set(JSON.parse(localStorage.getItem(todayKey())||'[]')); }
function saveToday(set){ localStorage.setItem(todayKey(), JSON.stringify(Array.from(set))); }
function toggleStep(i){
  const s = todayDone();
  if (s.has(i)) s.delete(i); else s.add(i);
  saveToday(s);
  renderRoutine();
  // Reward on complete
  if (s.size === state.routine.length){ state.badges++; save(); renderBadges(); speak('Great job! You finished your steps.'); updateStats({ mood:+10 }); }
}
renderRoutine();

// Guided routine player
qs('#startRoutine').addEventListener('click', ()=>{
  const steps = state.routine;
  let i = 0;
  function next(){
    if (i>=steps.length){ speak('All done.'); return; }
    const line = steps[i++];
    const [emoji, ...txtParts] = line.split(' ');
    const txt = txtParts.join(' ');
    speak(`${txt}`);
    alert(`${emoji} ${txt}`);
    next();
  }
  next();
});

// Rewards
function renderBadges(){
  const row = qs('#badgeRow');
  row.innerHTML = '';
  for(let i=0;i<state.badges;i++){
    const b = document.createElement('div'); b.className='badge'; b.textContent = '⭐';
    row.appendChild(b);
  }
}
renderBadges();

// Tabs
qsa('.tab').forEach(t=> t.addEventListener('click', ()=>{
  qsa('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  qsa('.panel').forEach(p=>p.classList.add('hidden'));
  qs('#'+t.dataset.tab).classList.remove('hidden');
}));

// Settings
function bindToggle(id, key){
  const el = qs('#'+id); el.checked = state.settings[key];
  el.addEventListener('change', ()=>{ state.settings[key] = el.checked; save(); applyA11y(); });
}
bindToggle('largeText','largeText');
bindToggle('symbolOnly','symbolOnly');
bindToggle('reducedMotion','reducedMotion');
bindToggle('voiceOn','voiceOn');
const pinInput = qs('#pin'); pinInput.value = state.settings.pin || '';
pinInput.addEventListener('change', ()=>{ state.settings.pin = pinInput.value; save(); });

// Edit routine (with optional PIN)
const routineDialog = qs('#routineDialog');
qs('#editRoutine').addEventListener('click', ()=>{
  if (state.settings.pin && prompt('Enter PIN') !== state.settings.pin){ alert('Wrong PIN'); return; }
  qs('#routineText').value = state.routine.join('\n');
  routineDialog.showModal();
});
qs('#saveRoutine').addEventListener('click', ()=>{
  const lines = qs('#routineText').value.split('\n').map(s=>s.trim()).filter(Boolean);
  state.routine = lines.length? lines : DEFAULT_ROUTINE;
  save(); renderRoutine();
});

// Persist
function save(){ localStorage.setItem('cb_state', JSON.stringify(state)); }

// Reduce motion respect
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){ state.settings.reducedMotion = true; applyA11y(); save(); }
