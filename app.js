// CareBuddy MVP + Playful lightweight animations
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

// Motion gate
function allowMotion(){ return !state.settings.reducedMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

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

// Pet draw (simple) with blink
const cvs = qs('#petCanvas'); const ctx = cvs.getContext('2d');
let blinkTimer = 0, blinkFrame = 0; // 0 open, >0 closing/opening frames
let idleRAF, animT=0;
function drawPet(){
  const { hunger, hygiene, energy, mood } = state.pet;
  ctx.clearRect(0,0,cvs.width,cvs.height);
  // body
  ctx.fillStyle = '#4b6bff'; ctx.beginPath(); ctx.ellipse(110,100,60,45,0,0,Math.PI*2); ctx.fill();
  // face
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(110,90,34,0,Math.PI*2); ctx.fill();
  // eyes (blink)
  const eyeOpen = blinkFrame===0;
  ctx.fillStyle = '#000000'; ctx.lineWidth = 2;
  if (eyeOpen){
    ctx.beginPath(); ctx.arc(95,88,5,0,Math.PI*2); ctx.arc(125,88,5,0,Math.PI*2); ctx.fill();
  }else{
    // draw as small line
    ctx.beginPath(); ctx.moveTo(90,88); ctx.lineTo(100,88); ctx.moveTo(120,88); ctx.lineTo(130,88); ctx.stroke();
  }
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

// Idle loop: bob + blink
function startIdle(){
  const petBox = qs('.pet');
  if (allowMotion()) petBox.classList.add('idle');
  cancelAnimationFrame(idleRAF);
  function frame(){
    animT++;
    // Blink every ~4-7s
    if (++blinkTimer > (240 + Math.random()*120)){
      blinkFrame = 1;
      blinkTimer = 0;
    }
    if (blinkFrame>0){
      blinkFrame++;
      if (blinkFrame>10) blinkFrame=0;
    }
    drawPet();
    idleRAF = requestAnimationFrame(frame);
  }
  idleRAF = requestAnimationFrame(frame);
}
startIdle();

function clamp(v){ return Math.max(0, Math.min(100, v)); }

// Smooth meter animation
function animateValue(el, from, to, dur=280){
  if (!allowMotion()){ el.value = to; return; }
  const start = performance.now();
  function step(now){
    const t = Math.min(1,(now-start)/dur);
    const eased = t<.5 ? 2*t*t : -1+(4-2*t)*t; // easeInOutQuad
    el.value = from + (to-from)*eased;
    if (t<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateStats(delta){
  const newVals = {
    hunger: clamp(state.pet.hunger + (delta.hunger||0)),
    hygiene: clamp(state.pet.hygiene + (delta.hygiene||0)),
    energy: clamp(state.pet.energy + (delta.energy||0)),
    mood: clamp(state.pet.mood + (delta.mood||0)),
  };
  // animate meters
  animateValue(document.querySelector('#hunger'), state.pet.hunger, newVals.hunger);
  animateValue(document.querySelector('#hygiene'), state.pet.hygiene, newVals.hygiene);
  animateValue(document.querySelector('#energy'), state.pet.energy, newVals.energy);
  animateValue(document.querySelector('#mood'), state.pet.mood, newVals.mood);
  // commit
  state.pet = newVals;
  save(); drawPet(); checkBadge?.();
}

function renderMeters(){
  document.querySelector('#hunger').value = state.pet.hunger;
  document.querySelector('#hygiene').value = state.pet.hygiene;
  document.querySelector('#energy').value = state.pet.energy;
  document.querySelector('#mood').value = state.pet.mood;
}
renderMeters();

// Decay over time (every 5 minutes a small drop)
setInterval(()=> updateStats({ hunger:-2, energy:-2, mood:-1 }), 5*60*1000);

// Care button bounce + sparkles
function makeSparkles(parent, count=8){
  if (!allowMotion()) return;
  const rect = parent.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const s = document.createElement('span');
    s.className = 'sparkle fly';
    s.style.left = rect.width/2 + 'px';
    s.style.top = rect.height/2 + 'px';
    const dx = (Math.random()*60 - 30) + 'px';
    const dy = (-20 - Math.random()*40) + 'px';
    s.style.setProperty('--dx', dx);
    s.style.setProperty('--dy', dy);
    s.style.color = i%2? '#8bd3ff' : '#f6f7fb';
    parent.appendChild(s);
    s.addEventListener('animationend', ()=> s.remove());
  }
}
document.querySelectorAll('.care-buttons .big').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const act = btn.dataset.action;
    if (act==='feed')      { updateStats({ hunger:+20, mood:+5 }); speak('Yum! Thank you.'); }
    if (act==='wash')      { updateStats({ hygiene:+25, mood:+3 }); speak('All clean.'); }
    if (act==='play')      { updateStats({ energy:-10, mood:+15, hunger:-5 }); speak('Fun time!'); }
    if (act==='rest')      { updateStats({ energy:+30, mood:+5 }); speak('Resting now.'); }
    if (allowMotion()){ btn.classList.remove('bounce'); void btn.offsetWidth; btn.classList.add('bounce'); makeSparkles(btn, 10); }
  });
});

// Routine
const routineList = document.querySelector('#routineList');
function renderRoutine(){
  routineList.innerHTML = state.routine.map((line,i)=>{
    const [emoji, ...txtParts] = line.split(' ');
    const txt = txtParts.join(' ');
    const done = todayDone().has(i);
    return `<div class="step ${done?'done':''}" data-i="${i}" role="button" tabindex="0" aria-pressed="${done?'true':'false'}">
      <div class="icon">${emoji}</div><div class="label">${txt}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('.step').forEach(el=> el.addEventListener('click', ()=> toggleStep(+el.dataset.i)));
}
function todayKey(){ const d=new Date(); return `cb_steps_${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`; }
function todayDone(){ return new Set(JSON.parse(localStorage.getItem(todayKey())||'[]')); }
function saveToday(set){ localStorage.setItem(todayKey(), JSON.stringify(Array.from(set))); }
function toggleStep(i){
  const s = todayDone();
  const els = document.querySelectorAll('.step');
  const el = els[i];
  if (s.has(i)) s.delete(i); else s.add(i);
  saveToday(s);
  if (el && !el.classList.contains('done') && allowMotion()){ el.classList.add('flash'); el.addEventListener('animationend', ()=> el.classList.remove('flash'), {once:true}); }
  renderRoutine();
  if (s.size === state.routine.length){ state.badges++; save(); renderBadges(); speak('Great job! You finished your steps.'); updateStats({ mood:+10 }); confetti(document.querySelector('#badgeRow')); }
}
renderRoutine();

// Guided routine player
document.querySelector('#startRoutine').addEventListener('click', ()=>{
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

// Rewards + confetti
function renderBadges(){
  const row = document.querySelector('#badgeRow');
  row.innerHTML = '';
  for(let i=0;i<state.badges;i++){
    const b = document.createElement('div'); b.className='badge'; b.textContent = '⭐';
    row.appendChild(b);
  }
}
function confetti(container){
  if (!allowMotion()) return;
  container.classList.add('confetti');
  const rect = container.getBoundingClientRect();
  const centerX = rect.width/2, centerY = 10;
  for(let i=0;i<12;i++){
    const star = document.createElement('span');
    star.className = 'star fly';
    star.style.left = centerX + 'px';
    star.style.top = centerY + 'px';
    star.style.color = ['#8bd3ff','#ffd166','#f6f7fb','#06d6a0'][i%4];
    star.style.setProperty('--dx', (Math.random()*160 - 80) + 'px');
    star.style.setProperty('--dy', (-40 - Math.random()*60) + 'px');
    container.appendChild(star);
    star.addEventListener('animationend', ()=> star.remove());
  }
}
renderBadges();

// Tabs with slide-fade
let currentPanel = 'adl';
document.querySelectorAll('.tab').forEach(t=> t.addEventListener('click', ()=> showPanel(t.dataset.tab, t)));
function showPanel(id, tabBtn){
  if (id===currentPanel) return;
  const oldP = document.querySelector('#'+currentPanel);
  const newP = document.querySelector('#'+id);
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); tabBtn.classList.add('active');
  if (allowMotion()){
    oldP.classList.add('leave');
    oldP.addEventListener('animationend', ()=>{
      oldP.classList.add('hidden'); oldP.classList.remove('leave');
      newP.classList.remove('hidden'); newP.classList.add('enter');
      newP.addEventListener('animationend', ()=> newP.classList.remove('enter'), {once:true});
    }, {once:true});
  }else{
    oldP.classList.add('hidden');
    newP.classList.remove('hidden');
  }
  currentPanel = id;
}

// Settings
function bindToggle(id, key){
  const el = document.querySelector('#'+id); el.checked = state.settings[key];
  el.addEventListener('change', ()=>{ state.settings[key] = el.checked; save(); applyA11y(); });
}
bindToggle('largeText','largeText');
bindToggle('symbolOnly','symbolOnly');
bindToggle('reducedMotion','reducedMotion');
bindToggle('voiceOn','voiceOn');
const pinInput = document.querySelector('#pin'); pinInput.value = state.settings.pin || '';
pinInput.addEventListener('change', ()=>{ state.settings.pin = pinInput.value; save(); });

// Edit routine (with optional PIN)
const routineDialog = document.querySelector('#routineDialog');
document.querySelector('#editRoutine').addEventListener('click', ()=>{
  if (state.settings.pin && prompt('Enter PIN') !== state.settings.pin){ alert('Wrong PIN'); return; }
  document.querySelector('#routineText').value = state.routine.join('\\n');
  routineDialog.showModal();
});
document.querySelector('#saveRoutine').addEventListener('click', ()=>{
  const lines = document.querySelector('#routineText').value.split('\\n').map(s=>s.trim()).filter(Boolean);
  state.routine = lines.length? lines : DEFAULT_ROUTINE;
  save(); renderRoutine();
});

// Persist
function save(){ localStorage.setItem('cb_state', JSON.stringify(state)); }

// Respect reduced motion on load
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){ state.settings.reducedMotion = true; applyA11y(); save(); }