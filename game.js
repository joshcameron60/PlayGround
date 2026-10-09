import * as THREE from 'three';

/* ============================================================
   RICK AND MORTY: CITADEL ARENA — Quake-3-style arena FPS
   Single-file game logic. All art procedural, no external assets.
   ============================================================ */
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>a+Math.random()*(b-a);
const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.Fog(0x05060f, 55, 160);

const camera = new THREE.PerspectiveCamera(90, innerWidth/innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0x9dffc8, 0x2a2a44, 1.25));
scene.add(new THREE.AmbientLight(0x4a5a54, 0.85));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
sun.position.set(30, 50, 18);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x6affaa, 0.5);
fill.position.set(-35, 25, -25);
scene.add(fill);
const greenGlow = new THREE.PointLight(0x39ff6a, 80, 70); greenGlow.position.set(0,10,0); scene.add(greenGlow);
const portalLightA = new THREE.PointLight(0x39ff6a, 40, 25); scene.add(portalLightA);
const portalLightB = new THREE.PointLight(0x39ff6a, 40, 25); scene.add(portalLightB);

/* ---------------- Cartoon toolkit (cel shading + ink + comic words) ---------------- */
const toonGrad=(()=>{ const d=new Uint8Array([110,110,110,255, 170,170,170,255, 225,225,225,255, 255,255,255,255]);
  const t=new THREE.DataTexture(d,4,1);
  t.needsUpdate=true; t.minFilter=t.magFilter=THREE.NearestFilter; return t; })();
function toon(color,emiss=0x000000,ei=0){
  return new THREE.MeshToonMaterial({ color, gradientMap:toonGrad, emissive:emiss, emissiveIntensity:ei });
}
const inkMat=new THREE.MeshBasicMaterial({ color:0x0b0b14, side:THREE.BackSide });
function addInk(mesh,s=1.09){ // chunky inverted-hull outline, follows the mesh
  if(!mesh||!mesh.isMesh) return;
  const o=new THREE.Mesh(mesh.geometry, inkMat); o.scale.setScalar(s); mesh.add(o);
}
const edgeMat=new THREE.LineBasicMaterial({ color:0x0b0b14 });
function inkEdges(mesh){ // crisp ink edges for chunky world boxes
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat));
}
// floating comic-book words: POW! ZAP! OOF!
const words=[];
function spawnWord(pos,text,color='#ffffff'){
  if(words.length>14){ const old=words.shift(); scene.remove(old.s); }
  const t=canvasTex(256,128,(g,w,h)=>{ g.clearRect(0,0,w,h);
    g.font='900 54px "Comic Sans MS","Chalkboard SE","Segoe UI",cursive'; g.textAlign='center';
    g.lineWidth=12; g.strokeStyle='#0b0b14'; g.lineJoin='round'; g.strokeText(text,w/2,78);
    g.fillStyle=color; g.fillText(text,w/2,78); });
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));
  s.scale.set(0.5,0.25,1);
  s.position.copy(pos).add(V3(rand(-.6,.6),rand(0.2,1),rand(-.6,.6)));
  scene.add(s); words.push({s,age:0,life:1.6});
}
// puffy cartoon clouds drifting over the Citadel
const clouds=[];
{
  const cm=toon(0xffffff);
  for(let i=0;i<7;i++){
    const g=new THREE.Group(), n=3+(Math.random()*2|0);
    for(let j=0;j<n;j++){
      const b=new THREE.Mesh(new THREE.SphereGeometry(rand(1.6,3.2),10,8),cm);
      b.position.set(j*rand(1.6,2.6)-n,rand(-.5,.5),rand(-1,1)); b.scale.y=0.65; g.add(b);
    }
    g.position.set(rand(-70,70),rand(22,42),rand(-95,-55));
    g.userData.v=rand(0.3,1.0); scene.add(g); clouds.push(g);
  }
}

/* ---------------- Audio (all synthesized) ---------------- */
let AC=null, muted=false;
function ac(){ if(!AC){ AC = new (window.AudioContext||window.webkitAudioContext)(); } if(AC.state==='suspended')AC.resume(); return AC; }
function tone(f0,f1,dur,type='sine',vol=0.2,delay=0){
  if(muted) return; try{
    const c=ac(), t=c.currentTime+delay;
    const o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t+dur+0.02);
  }catch(e){}
}
function noiseBurst(dur=0.3,vol=0.3,fc=800,delay=0){
  if(muted) return; try{
    const c=ac(), t=c.currentTime+delay;
    const len=Math.floor(c.sampleRate*dur), buf=c.createBuffer(1,len,c.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    const s=c.createBufferSource(); s.buffer=buf;
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=fc;
    const g=c.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  }catch(e){}
}
const SFX = {
  rail(){ tone(1400,180,0.14,'sawtooth',0.16); noiseBurst(0.08,0.1,4000); },
  goo(){ tone(220,70,0.28,'square',0.2); },
  gaunt(){ tone(90,1400,0.12,'sawtooth',0.18); noiseBurst(0.1,0.15,5000); },
  hit(){ tone(1250,1250,0.06,'square',0.12); },
  hurt(){ tone(220,90,0.25,'sawtooth',0.25); },
  pickup(){ tone(520,520,0.08,'sine',0.2); tone(780,780,0.1,'sine',0.2,0.08); },
  mega(){ tone(300,900,0.4,'sine',0.25); tone(600,1200,0.4,'triangle',0.15,0.1); },
  teleport(){ tone(200,1600,0.45,'sine',0.22); tone(1600,200,0.45,'triangle',0.1,0.05); },
  pad(){ tone(150,900,0.35,'square',0.14); },
  boom(){ noiseBurst(0.55,0.4,500); tone(120,35,0.5,'sine',0.35); },
  whomp(){ tone(170,50,0.32,'square',0.28); noiseBurst(0.22,0.3,900); },
  death(){ tone(400,60,0.5,'sawtooth',0.22); },
  respawn(){ tone(300,700,0.2,'triangle',0.18); },
  jump(){ tone(280,420,0.09,'sine',0.07); },
  win(){ [523,659,784,1046].forEach((f,i)=>tone(f,f,0.25,'square',0.16,i*0.16)); },
};

/* ---------------- Canvas texture helpers ---------------- */
function canvasTex(w,h,draw){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const floorTex = canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#2b3550'; g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(57,255,106,0.85)'; g.lineWidth=6; g.strokeRect(4,4,w-8,h-8);
  g.strokeStyle='rgba(57,255,106,0.18)'; g.lineWidth=1;
  for(let i=32;i<w;i+=32){ g.beginPath();g.moveTo(i,0);g.lineTo(i,h);g.stroke(); g.beginPath();g.moveTo(0,i);g.lineTo(w,i);g.stroke(); }
  g.fillStyle='rgba(57,255,106,0.25)'; g.font='bold 22px monospace'; g.fillText('C-137',90,140);
});
floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping; floorTex.repeat.set(14,14);
function posterTex(lines,bg,fg){
  return canvasTex(256,384,(g,w,h)=>{
    g.fillStyle=bg; g.fillRect(0,0,w,h);
    g.strokeStyle=fg; g.lineWidth=10; g.strokeRect(8,8,w-16,h-16);
    g.fillStyle=fg; g.textAlign='center';
    lines.forEach((ln,i)=>{ g.font=(i===0?'900 44px':'700 26px')+' sans-serif'; g.fillText(ln,w/2,110+i*52); });
    g.font='16px monospace'; g.fillText('★ CITADEL ★',w/2,h-40);
  });
}

/* ---------------- Arena construction ---------------- */
const colliders=[]; // {min:Vector3,max:Vector3}
function addCollider(cx,cy,cz,sx,sy,sz){
  colliders.push({ min:V3(cx-sx/2,cy-sy/2,cz-sz/2), max:V3(cx+sx/2,cy+sy/2,cz+sz/2) });
}
function addBoxMesh(w,h,d,color,x,y,z,opts={}){
  const m=new THREE.Mesh(
    new THREE.BoxGeometry(w,h,d),
    toon(color, opts.emiss??0x000000, opts.ei??1)
  );
  m.position.set(x,y,z); inkEdges(m); scene.add(m); return m;
}

// Floor
{
  const f=new THREE.Mesh(new THREE.BoxGeometry(72,1,72),
    new THREE.MeshStandardMaterial({ map:floorTex, roughness:.6, metalness:.35 }));
  f.position.y=-0.5; scene.add(f); addCollider(0,-0.5,0,72,1,72);
}
// Outer energy walls (visible + solid)
const wallMat=new THREE.MeshBasicMaterial({ color:0x39ff6a, transparent:true, opacity:0.13 });
[[0,3,-36,72,6,0.6],[0,3,36,72,6,0.6],[-36,3,0,0.6,6,72],[36,3,0,0.6,6,72]].forEach(([x,y,z,w,h,d])=>{
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat); m.position.set(x,y,z); scene.add(m);
  addCollider(x,y,z,Math.max(w,1),h,Math.max(d,1));
});
// Center platform + pillars + ramps
addBoxMesh(14,1,14,0x1a2230,0,1.5,0,{metal:.5}); addCollider(0,1.5,0,14,1,14);
[[-5.5,-5.5],[5.5,-5.5],[-5.5,5.5],[5.5,5.5]].forEach(([x,z])=>{
  addBoxMesh(1.8,6,1.8,0x223044,x,4.5,z,{metal:.6, emiss:0x39ff6a, ei:.15}); addCollider(x,4.5,z,1.8,6,1.8);
});
addBoxMesh(14,0.5,14,0x39ff6a,0,2.15,0,{emiss:0x39ff6a,ei:.35}); // glowing trim (no collide change)
// Ramps (visual slanted + stepped colliders)
function ramp(x,z,rotY){
  const g=new THREE.Group();
  for(let i=0;i<4;i++){
    const s=3.2-i*0.7, y=0.2+i*0.45;
    const b=new THREE.Mesh(new THREE.BoxGeometry(4,0.5,1.4), toon(0x3a5a7a));
    const lx = x + Math.cos(rotY)*(7.6+i*1.25), lz = z + Math.sin(rotY)*(7.6+i*1.25);
    b.position.set(lx,y,lz); b.rotation.y=-rotY; inkEdges(b); scene.add(b); addCollider(lx,y,lz,4,0.5,1.4);
  }
  return g;
}
ramp(0,0,Math.PI); ramp(0,0,0); ramp(0,0,Math.PI/2); ramp(0,0,-Math.PI/2);
// Towers
function tower(x,z){
  addBoxMesh(6,8,6,0x1c2636,x,4,z,{metal:.5}); addCollider(x,4,z,6,8,6);
  addBoxMesh(7,0.6,7,0x39ff6a,x,8.2,z,{emiss:0x39ff6a,ei:.5});
  addBoxMesh(4,1.2,4,0x141c28,x,9,z,{}); addCollider(x,9,z,4,1.2,4);
}
tower(-22,-12); tower(22,12); tower(-22,12); tower(22,-12);
// Bridges
addBoxMesh(20,0.6,3,0x232f42,0,6,-14,{metal:.5}); addCollider(0,6,-14,20,0.6,3);
addBoxMesh(20,0.6,3,0x232f42,0,6,14,{metal:.5}); addCollider(0,6,14,20,0.6,3);
[[-9,6,-14],[9,6,-14],[-9,6,14],[9,6,14]].forEach(([x,y,z])=>{ addBoxMesh(0.6,6,0.6,0x39ff6a,x,y-3,z,{emiss:0x39ff6a,ei:.4}); });
// Crates
const crateSpots=[[-11,1,4],[11,1,-4],[-8,1,-11],[8,1,11],[0,1,-22],[0,1,22],[-26,1,8],[26,1,-8]];
crateSpots.forEach(([x,y,z],i)=>{
  const s=i%3===0?2:1.4;
  addBoxMesh(s,s,s,i%2?0x3a2b1a:0x2b3a2b,x,y+s/2-0.4,z,{rough:.9}); addCollider(x,y+s/2-0.4,z,s,s,s);
});
// Posters on pillars / walls
const posters=[
  posterTex(['WUBBA','LUBBA','ARENA'],'#07130c','#39ff6a'),
  posterTex(['MEGA','HEALTH','+100'],'#160a12','#ff4da6'),
  posterTex(['PORTAL','GUN','SKILL'],'#0a1220','#4dffdb'),
  posterTex(['PLUMB-X','5000','FLAWLESS'],'#141007','#ffc247'),
];
[[-35.6,3,-12,Math.PI/2],[-35.6,3,12,Math.PI/2],[35.6,3,-12,-Math.PI/2],[35.6,3,12,-Math.PI/2]].forEach(([x,y,z,ry],i)=>{
  const p=new THREE.Mesh(new THREE.PlaneGeometry(5,7.5), new THREE.MeshBasicMaterial({map:posters[i%4]}));
  p.position.set(x,y,z); p.rotation.y=ry; scene.add(p);
});
// Sky: stars + giant portal + citadel ring
{
  const n=900, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ const r=rand(150,300), th=rand(0,Math.PI*2), ph=rand(-0.2,1.2);
    pos[i*3]=r*Math.cos(th)*Math.cos(ph); pos[i*3+1]=r*Math.sin(ph)+10; pos[i*3+2]=r*Math.sin(th)*Math.cos(ph); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xbfd9ff,size:1.4,sizeAttenuation:false})));
  const ring=new THREE.Mesh(new THREE.TorusGeometry(46,1.6,10,64), new THREE.MeshBasicMaterial({color:0x39ff6a,transparent:true,opacity:.5}));
  ring.position.set(0,52,-120); scene.add(ring);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(20,48), new THREE.MeshBasicMaterial({color:0x0aff66,transparent:true,opacity:.16}));
  disc.position.set(0,52,-120); scene.add(disc);
  const ring2=new THREE.Mesh(new THREE.TorusGeometry(70,3,8,48), new THREE.MeshBasicMaterial({color:0x4dffdb,transparent:true,opacity:.22}));
  ring2.position.set(0,40,-140); ring2.rotation.x=0.4; scene.add(ring2);
}
// Floating citadel chunks
for(let i=0;i<10;i++){
  const m=addBoxMesh(rand(2,6),rand(1,3),rand(2,6),0x1a2434,rand(-60,60),rand(14,40),rand(-70,-40),{metal:.4});
  m.userData.spin=rand(-0.2,0.2);
}

/* ---------------- Jump pads & portals ---------------- */
const pads=[ {p:V3(-14,0.3,-14)},{p:V3(14,0.3,14)},{p:V3(-14,0.3,14)},{p:V3(14,0.3,-14)},{p:V3(0,0.3,-26)},{p:V3(0,0.3,26)} ];
pads.forEach(({p})=>{
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.8,0.35,20),
    toon(0x0b2b16,0x39ff6a,.9));
  base.position.copy(p); addInk(base,1.06); scene.add(base);
  const glow=new THREE.PointLight(0x39ff6a,12,10); glow.position.set(p.x,p.y+1.5,p.z); scene.add(glow);
});
function makePortal(pos){
  const grp=new THREE.Group(); grp.position.copy(pos);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.7,0.28,12,40),
    new THREE.MeshStandardMaterial({color:0x0a3018,emissive:0x39ff6a,emissiveIntensity:1.6,roughness:.3}));
  grp.add(ring);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(1.5,40),
    new THREE.MeshBasicMaterial({color:0x39ff6a,transparent:true,opacity:.55,side:THREE.DoubleSide}));
  disc.rotation.y=Math.PI/2; grp.add(disc); grp.userData.disc=disc;
  scene.add(grp); return grp;
}
const portalA=makePortal(V3(-25,2.2,0)), portalB=makePortal(V3(25,2.2,0));
portalA.rotation.y=Math.PI/2; portalB.rotation.y=-Math.PI/2;
portalLightA.position.set(-25,3,0); portalLightB.position.set(25,3,0);

/* ---------------- Pickups ---------------- */
const pickupDefs=[
  {type:'health', color:0xff5d7a, geo:'octa', respawn:12, spots:[[-11,1,4],[11,1,-4],[-8,1,-11],[8,1,11],[0,1,-22],[0,1,22]]},
  {type:'armor', color:0x4dffdb, geo:'box', respawn:15, spots:[[-5,3,0],[5,3,0],[0,7,0]]},
  {type:'mega', color:0xff4da6, geo:'icosa', respawn:35, spots:[[0,3.1,0]]},
  {type:'cells', color:0xc6ff4d, geo:'tetra', respawn:10, spots:[[-14,1,-14],[14,1,14],[-14,1,14],[14,1,-14],[-26,1,8],[26,1,-8]]},
];
const pickups=[];
function geoFor(g){
  if(g==='octa') return new THREE.OctahedronGeometry(0.55);
  if(g==='icosa') return new THREE.IcosahedronGeometry(0.65);
  if(g==='tetra') return new THREE.TetrahedronGeometry(0.6);
  return new THREE.BoxGeometry(0.7,0.7,0.7);
}
pickupDefs.forEach(def=>{
  def.spots.forEach(([x,y,z])=>{
    const m=new THREE.Mesh(geoFor(def.geo), toon(def.color,def.color,.55));
    m.position.set(x,y,z); addInk(m,1.18);
    scene.add(m);
    const l=new THREE.PointLight(def.color,8,9); l.position.copy(m.position); scene.add(l);
    pickups.push({type:def.type, mesh:m, light:l, baseY:m.position.y, alive:true, timer:0, respawn:def.respawn, phase:rand(0,6)});
  });
});

/* ---------------- Particles / tracers / projectiles ---------------- */
const particles=[];
const pGeo=new THREE.OctahedronGeometry(0.16); // cartoon sparkle shards
function burst(pos,color,n=14,speed=7,life=0.7,up=3){
  for(let i=0;i<n;i++){
    if(particles.length>320){ const old=particles.shift(); scene.remove(old.m); }
    const m=new THREE.Mesh(pGeo,new THREE.MeshBasicMaterial({color}));
    m.position.copy(pos);
    const v=V3(rand(-speed,speed),rand(0,up+speed*0.4),rand(-speed,speed));
    particles.push({m,v,life:rand(life*0.5,life),age:0}); scene.add(m);
  }
}
const tracers=[];
function tracer(a,b,color=0x39ff6a){
  const g=new THREE.BufferGeometry().setFromPoints([a,b]);
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:1}));
  scene.add(l); tracers.push({l,age:0});
}
const projectiles=[];
const gooGeo=new THREE.SphereGeometry(0.32,12,10);
function fireGoo(origin,dir,owner){
  const m=new THREE.Mesh(gooGeo,new THREE.MeshStandardMaterial({color:0x9dff00,emissive:0x9dff00,emissiveIntensity:1.2}));
  m.position.copy(origin); scene.add(m);
  const l=new THREE.PointLight(0x9dff00,10,10); l.position.copy(origin); scene.add(l);
  projectiles.push({m,light:l,v:dir.clone().multiplyScalar(30).add(V3(0,2.5,0)),owner,life:4,bounces:0});
  SFX.goo();
}
function explodeGoo(p){
  burst(p.m.position,0x9dff00,26,9,0.7,5); burst(p.m.position,0xffffff,10,5,0.4,4);
  SFX.boom(); shake(0.35);
  spawnWord(p.m.position,'SPLAT!','#c6ff4d');
  // splash
  const victims=[...bots.map(b=>({k:'bot',o:b,pos:b.pos,alive:!b.dead})),{k:'you',o:null,pos:player.pos,alive:!player.dead}];
  victims.forEach(({k,o,pos})=>{
    const d=pos.clone().add(V3(0,1,0)).distanceTo(p.m.position);
    if(d<4.5){
      const dmg=Math.round(60*(1-d/5.5));
      if(k==='bot'){ if(p.owner==='you') damageBot(o,dmg,'you',p.m.position); else if(p.owner!==o) damageBot(o,Math.round(dmg*0.6),p.owner,p.m.position); }
      else { if(p.owner==='you') damagePlayer(Math.round(dmg*0.5),'you'); else damagePlayer(Math.round(dmg*0.7),p.owner); }
    }
  });
  scene.remove(p.m); scene.remove(p.light);
}

/* ---------------- Ray vs world ---------------- */
function rayWallT(o,d,maxDist=100){
  let best=maxDist;
  for(const c of colliders){
    let tmin=0,tmax=best,ok=true;
    for(const ax of ['x','y','z']){
      const inv=1/(d[ax]||1e-9);
      let t0=(c.min[ax]-o[ax])*inv, t1=(c.max[ax]-o[ax])*inv;
      if(inv<0)[t0,t1]=[t1,t0];
      tmin=Math.max(tmin,t0); tmax=Math.min(tmax,t1);
      if(tmax<tmin){ok=false;break;}
    }
    if(ok&&tmin>0.001) best=Math.min(best,tmin);
  }
  return best;
}
function losClear(a,b){
  const d=b.clone().sub(a), dist=d.length(); if(dist<0.001)return true; d.normalize();
  return rayWallT(a,d,dist-0.2)>=dist-0.25;
}

/* ---------------- Collision move ---------------- */
function aabbOverlap(px,py,pz,r,h){
  const out=[];
  for(const c of colliders){
    if(px+r>c.min.x&&px-r<c.max.x&&py+h>c.min.y&&py<c.max.y&&pz+r>c.min.z&&pz-r<c.max.z) out.push(c);
  }
  return out;
}
function moveBody(pos,vel,dt,r,h){
  // X
  pos.x+=vel.x*dt;
  for(const c of aabbOverlap(pos.x,pos.y,pos.z,r,h)){
    if(vel.x>0) pos.x=c.min.x-r-0.001; else if(vel.x<0) pos.x=c.max.x+r+0.001;
    vel.x=0;
  }
  // Z
  pos.z+=vel.z*dt;
  for(const c of aabbOverlap(pos.x,pos.y,pos.z,r,h)){
    if(vel.z>0) pos.z=c.min.z-r-0.001; else if(vel.z<0) pos.z=c.max.z+r+0.001;
    vel.z=0;
  }
  // Y
  pos.y+=vel.y*dt;
  let grounded=false;
  for(const c of aabbOverlap(pos.x,pos.y,pos.z,r,h)){
    if(vel.y<=0 && pos.y>=c.max.y-0.6){ pos.y=c.max.y+0.001; vel.y=0; grounded=true; }
    else if(vel.y>0){ pos.y=c.min.y-h-0.001; vel.y=0; }
    else { // side overlap pushed up
      pos.y=c.max.y+0.001; vel.y=0; grounded=true;
    }
  }
  if(pos.y<0.02&&vel.y<=0){pos.y=0;vel.y=0;grounded=true;}
  return grounded;
}

/* ---------------- Viewmodel gun ---------------- */
const vm=new THREE.Group(); camera.add(vm); scene.add(camera);
vm.position.set(0.34,-0.32,-0.62);
function buildViewmodel(kind){
  while(vm.children.length) vm.remove(vm.children[0]);
  const dark=toon(0x2c3a4e);
  const glowC = kind===0?0xffc247:kind===1?0x39ff6a:0xc6ff4d;
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.15,0.5),dark); addInk(body,1.06); vm.add(body);
  const strip=new THREE.Mesh(new THREE.BoxGeometry(0.125,0.03,0.34),new THREE.MeshStandardMaterial({color:0x0c1410,emissive:glowC,emissiveIntensity:1.1}));
  strip.position.set(0,0.02,-0.05); vm.add(strip);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.055,kind===0?0.16:0.34,10),
    new THREE.MeshStandardMaterial({color:0x0c1410,emissive:glowC,emissiveIntensity:1.4}));
  barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.03,-0.36); vm.add(barrel);
  if(kind===0){ const t=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.06,0.08),new THREE.MeshStandardMaterial({color:0x39414f,emissive:0xffc247,emissiveIntensity:1})); t.position.set(0,-0.02,-0.2); vm.add(t); }
  if(kind===2){ const tank=new THREE.Mesh(new THREE.SphereGeometry(0.11,10,8),new THREE.MeshStandardMaterial({color:0x223311,emissive:0xc6ff4d,emissiveIntensity:1.2})); tank.position.set(0,-0.14,-0.1); vm.add(tank); }
  const sight=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.05,0.03),new THREE.MeshBasicMaterial({color:glowC})); sight.position.set(0,0.14,-0.25); vm.add(sight);
}
buildViewmodel(1);
const muzzle=new THREE.PointLight(0x39ff6a,0,9); muzzle.position.set(0.42,-0.3,-1.4); camera.add(muzzle);

/* ---------------- Player ---------------- */
const spawns=[V3(-28,0.1,-28),V3(28,0.1,28),V3(-28,0.1,28),V3(28,0.1,-28),V3(0,0.1,-30),V3(0,0.1,30),V3(-30,0.1,0),V3(30,0.1,0)];
const player={
  pos:V3(0,0.1,-30), vel:V3(), yaw:0, pitch:0,
  hp:100, armor:0, cells:25, weapon:1, dead:false, respawnT:0,
  onGround:true, lastDmg:-9, overchargeT:0, fireCd:0, tpCd:0, padCd:0,
  frags:0, deaths:0, name:'YOU (Morty C-137)',
};
let shakeAmt=0; function shake(a){ shakeAmt=Math.min(0.6,shakeAmt+a); }
const keys={};
addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(e.code==='Tab'){ e.preventDefault(); $('scoreboard').classList.add('on'); }
  if(e.code==='KeyM'){ muted=!muted; toast(muted?'🔇 muted':'🔊 sound on'); }
  if(e.code==='KeyP'){ if(playing){ document.exitPointerLock?.(); } }
  if(['Digit1','Digit2','Digit3'].includes(e.code)){
    const w=+e.code.slice(-1)-1; if(w!==player.weapon){ player.weapon=w; buildViewmodel(w); SFX.hit(); updateWeaponBar(); }
  }
});
addEventListener('keyup',e=>{ keys[e.code]=false; if(e.code==='Tab') $('scoreboard').classList.remove('on'); });
let sens=1;
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==canvas||!playing||player.dead) return;
  player.yaw-=e.movementX*0.0022*sens; player.pitch-=e.movementY*0.0022*sens;
  player.pitch=clamp(player.pitch,-1.45,1.45);
});
document.addEventListener('mousedown',e=>{
  if(!playing||document.pointerLockElement!==canvas) return;
  if(e.button===0) firing=true; if(e.button===2) tryMelee();
});
document.addEventListener('mouseup',e=>{ if(e.button===0) firing=false; });
document.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('wheel',e=>{
  if(!playing) return;
  player.weapon=(player.weapon+(e.deltaY>0?1:2))%3; buildViewmodel(player.weapon); updateWeaponBar();
},{passive:true});
let firing=false;

/* ---------------- Bots ---------------- */
/* Procedural bark: gnarled vertical streaks, cracks, knots — no external images */
const barkTex = canvasTex(128,256,(g,w,h)=>{
  g.fillStyle='#7a5636'; g.fillRect(0,0,w,h);
  for(let i=0;i<46;i++){ // long vertical ridges
    const x=rand(0,w), wd=rand(2,7), dark=Math.random()<0.6;
    g.fillStyle=dark?`rgba(46,28,14,${rand(0.25,0.55)})`:`rgba(190,150,105,${rand(0.2,0.45)})`;
    g.beginPath(); g.moveTo(x,0);
    for(let y=0;y<=h;y+=16) g.lineTo(x+Math.sin(y*0.05+i)*4+rand(-2,2),y);
    g.lineTo(x+wd,h); g.lineTo(x+wd,0); g.closePath(); g.fill();
  }
  for(let i=0;i<900;i++){ // speckle grain
    g.fillStyle=Math.random()<0.5?`rgba(30,18,8,${rand(0.1,0.35)})`:`rgba(215,180,130,${rand(0.1,0.3)})`;
    g.fillRect(rand(0,w),rand(0,h),rand(1,2.4),rand(1,3));
  }
  for(let i=0;i<4;i++){ // knots
    const x=rand(10,w-10), y=rand(10,h-10);
    for(let r=9;r>0;r--){ g.fillStyle=r%2?`rgba(40,22,10,${0.15+0.05*r})`:`rgba(150,110,70,${0.2})`;
      g.beginPath(); g.ellipse(x,y,r*1.4,r,0.3,0,7); g.fill(); }
  }
  for(let i=0;i<7;i++){ // mossy patches
    g.fillStyle=`rgba(80,140,60,${rand(0.12,0.28)})`;
    g.beginPath(); g.ellipse(rand(0,w),rand(0,h),rand(4,12),rand(3,8),rand(0,3),0,7); g.fill();
  }
});
barkTex.wrapS=barkTex.wrapT=THREE.RepeatWrapping;
function toonTex(color,map,emiss=0x000000,ei=0){
  return new THREE.MeshToonMaterial({ color, map, gradientMap:toonGrad, emissive:emiss, emissiveIntensity:ei });
}
/* Killer-tree roster: Whomping Willows (HP) meets Old Man Willow (LOTR) — fan parody */
const BOT_SKINS=[
  {name:'Whomping Willow', bark:0x9a7350, leaf:0x3fa34d, leaf2:0x2b7a38, eye:0xffd23f, vines:true, color:0x39ff6a},
  {name:'Old Man Willow', bark:0x8a5f3d, leaf:0x4d8a3c, leaf2:0x35662c, eye:0xff6a3c, vines:true, big:true, color:0xff9d2e},
  {name:'Fangorn Bouncer', bark:0xa08050, leaf:0x57b34a, leaf2:0x3a7d33, eye:0xfff2a8, vines:false, color:0xc6ff4d},
  {name:'Birnam Wood', bark:0x7c5a40, leaf:0x6aa83c, leaf2:0x49752b, eye:0x9dff6a, vines:false, color:0x9dff6a},
  {name:'Knotty Pine', bark:0x8f6a45, leaf:0x2f7a4d, leaf2:0x1f5233, eye:0xffc247, vines:false, color:0xffc247},
  {name:'The Larch', bark:0x95704a, leaf:0xd97b2e, leaf2:0xa34d1c, eye:0xff4da6, vines:false, color:0xff4da6},
  {name:'Splinter', bark:0x6e4e30, leaf:0x3fa34d, leaf2:0x2b7a38, eye:0xff5d5d, vines:true, color:0xff5d5d},
  {name:'Sappy Haddock', bark:0xa37c4e, leaf:0x7ac74f, leaf2:0x4d8a3c, eye:0x4dffdb, vines:false, color:0x4dffdb},
];
function nameSprite(text,color){
  const t=canvasTex(256,64,(g,w,h)=>{ g.clearRect(0,0,w,h);
    g.font='bold 30px sans-serif'; g.textAlign='center';
    g.lineWidth=6; g.strokeStyle='rgba(0,0,0,0.85)'; g.strokeText(text,w/2,42);
    g.fillStyle=color; g.fillText(text,w/2,42); });
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));
  s.scale.set(2.2,0.55,1); return s;
}
function gnarl(geo,amt){ // gnarled trunk: jitter side vertices
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
    const y=p.getY(i);
    if(Math.abs(y)<geo.parameters.height/2-0.01){
      p.setX(i,p.getX(i)+rand(-amt,amt)); p.setZ(i,p.getZ(i)+rand(-amt,amt));
    }
  }
  geo.computeVertexNormals(); return geo;
}
function buildGladiator(skin){
  const g=new THREE.Group();
  const big=skin.big?1.22:1;
  const barkM=toonTex(skin.bark,barkTex);
  const leafM=toon(skin.leaf), leafM2=toon(skin.leaf2);
  // gnarled trunk
  const trunkG=gnarl(new THREE.CylinderGeometry(0.42*big,0.66*big,1.8*big,8,3),0.07*big);
  const trunk=new THREE.Mesh(trunkG,barkM); trunk.position.y=1.15*big; g.add(trunk); addInk(trunk,1.07);
  // grasping roots
  for(let i=0;i<4;i++){
    const r=new THREE.Mesh(new THREE.BoxGeometry(0.3*big,0.28*big,0.9*big),barkM);
    const a=i*Math.PI/2+0.4;
    r.position.set(Math.cos(a)*0.62*big,0.16*big,Math.sin(a)*0.62*big);
    r.rotation.y=-a; r.rotation.z=0.12; g.add(r); addInk(r,1.1);
  }
  // angry glowing eyes + snarling mouth carved in the bark (front is -z)
  const eyeM=new THREE.MeshBasicMaterial({color:skin.eye});
  [-0.2,0.2].forEach(x=>{
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.11*big,10,8),eyeM);
    eye.position.set(x*big,1.62*big,-0.5*big); eye.scale.z=0.5; g.add(eye);
    const brow=new THREE.Mesh(new THREE.BoxGeometry(0.26*big,0.07*big,0.06*big),barkM);
    brow.position.set(x*big,1.78*big,-0.52*big); brow.rotation.z=x>0?0.45:-0.45; g.add(brow);
  });
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.34*big,0.1*big,0.06*big),
    new THREE.MeshBasicMaterial({color:0x0b0b14}));
  mouth.position.set(0,1.28*big,-0.55*big); mouth.rotation.z=0.06; g.add(mouth);
  // branch arms on shoulder pivots (they WHOMP)
  function branchArm(side){
    const piv=new THREE.Group(); piv.position.set(0.55*big*side,1.7*big,0);
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.11*big,0.17*big,1.4*big,7),barkM);
    arm.position.y=0.6*big; arm.rotation.z=side*-0.9; arm.position.x=side*0.45*big;
    piv.add(arm); addInk(arm,1.1);
    const tuft=new THREE.Mesh(new THREE.IcosahedronGeometry(0.42*big,0),leafM2);
    tuft.position.set(side*1.05*big,1.05*big,0); piv.add(tuft); addInk(tuft,1.12);
    // twig fingers
    for(let i=0;i<3;i++){
      const tw=new THREE.Mesh(new THREE.CylinderGeometry(0.035*big,0.05*big,0.5*big,5),barkM);
      tw.position.set(side*(1.15+i*0.12)*big,(1.25+i*0.1)*big,rand(-0.15,0.15));
      tw.rotation.z=side*-(0.6+i*0.35); piv.add(tw);
    }
    piv.rotation.x=-0.25; g.add(piv); return piv;
  }
  const armL=branchArm(-1), armR=branchArm(1);
  // leafy crown + leader shoot
  const crown=new THREE.Group(); crown.position.y=2.1*big; g.add(crown);
  const leader=new THREE.Mesh(new THREE.CylinderGeometry(0.09*big,0.14*big,0.9*big,6),barkM);
  leader.position.y=0.4*big; leader.rotation.z=0.15; crown.add(leader);
  const blobs=[[0,0.9,0,0.95],[0.7,0.6,0.2,0.7],[-0.7,0.65,-0.15,0.75],[0.15,0.55,0.65,0.6],[-0.2,0.6,-0.65,0.62],[0,1.35,-0.1,0.6]];
  blobs.forEach(([x,y,z,s],i)=>{
    const b=new THREE.Mesh(new THREE.IcosahedronGeometry(s*big,0),i%2?leafM:leafM2);
    b.position.set(x*big,y*big,z*big); b.rotation.set(rand(0,3),rand(0,3),0);
    crown.add(b); addInk(b,1.1);
  });
  // hanging willow vines
  if(skin.vines){
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      const v=new THREE.Mesh(new THREE.CylinderGeometry(0.03*big,0.02*big,rand(0.9,1.4)*big,5),leafM2);
      v.position.set(Math.cos(a)*0.85*big,0.15*big,Math.sin(a)*0.85*big);
      crown.add(v);
    }
  }
  const tag=nameSprite(skin.name,'#'+new THREE.Color(skin.color).getHexString()); tag.position.y=3.6*big; g.add(tag);
  g.userData={armL,armR,crown,trunk};
  return g;
}
let bots=[];
function spawnBot(b){
  // pick spawn far from player
  const cands=[...spawns].sort(()=>Math.random()-0.5);
  let best=cands[0],bd=-1;
  cands.forEach(s=>{ const d=s.distanceTo(player.pos); const e=Math.min(...bots.filter(o=>o!==b&&!o.dead).map(o=>o.pos.distanceTo(s)).concat([99])); const score=Math.min(d,e); if(score>bd){bd=score;best=s;} });
  b.pos.copy(best).add(V3(rand(-1,1),0.2,rand(-1,1))); b.vel.set(0,0,0);
  b.hp=100; b.dead=false; b.respawnT=0; b.yaw=rand(0,6.28);
  b.mesh.scale.set(0.01,0.01,0.01); b.mesh.rotation.x=0; b.mesh.rotation.z=0; b.grow=0;
  burst(b.pos.clone().add(V3(0,1,0)),0x39ff6a,16,5,0.5,4);
}
function makeBots(n){
  bots.forEach(b=>scene.remove(b.mesh)); bots=[];
  for(let i=0;i<n;i++){
    const skin=BOT_SKINS[i%BOT_SKINS.length];
    const mesh=buildGladiator(skin); scene.add(mesh);
    const b={ name:skin.name, skin, mesh, pos:V3(), vel:V3(), yaw:0, hp:100, dead:false, respawnT:0,
      frags:0, deaths:0, think:rand(0,0.5), wp:V3(rand(-20,20),0,rand(-20,20)), strafe:Math.random()<0.5?1:-1,
      fireCd:rand(0.5,1.5), strafeT:rand(1,3), stuckT:0, lastPos:V3(), tpCd:0, walkPh:rand(0,6), ping:rand(12,68)|0,
      meleeCd:0, swing:0, grow:1 };
    spawnBot(b); bots.push(b);
  }
}
function botEye(b){ return b.pos.clone().add(V3(0,1.65,0)); }
function playerEye(){ return player.pos.clone().add(V3(0,1.6,0)); }

/* ---------------- Combat ---------------- */
const feedEl=$('feed');
function feed(html){
  const d=document.createElement('div'); d.className='feeditem'; d.innerHTML=html;
  feedEl.prepend(d); while(feedEl.children.length>5) feedEl.lastChild.remove();
  setTimeout(()=>d.remove(),4500);
}
function hitmark(){ const h=$('hitmarker'); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); }
function toast(msg,ms=2200){ const t=$('toast'); t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>t.style.display='none',ms); }
function centerMsg(html,ms=1800){ const m=$('msg'); m.innerHTML=html; clearTimeout(m._h); if(ms) m._h=setTimeout(()=>{m.innerHTML='';},ms); }
function damageBot(b,dmg,attacker,fromPos){
  if(b.dead||!playing||matchOver) return;
  b.hp-=dmg;
  if(attacker==='you'){ hitmark(); SFX.hit(); }
  if(dmg>=30) spawnWord(botEye(b),"POW!","#ffe066");
  burst(botEye(b),0xffe066,5,4,0.35,2);
  if(b.hp<=0){
    b.dead=true; b.deaths++; b.respawnT=2.2; b.hp=0;
    burst(botEye(b),0xff4da6,30,8,0.8,5); burst(b.pos.clone().add(V3(0,1,0)),b.skin.color,20,6,0.7,4);
    SFX.death();
    // TIMBER! — the killer tree keels over, shedding leaves
    b.mesh.rotation.x=-Math.PI/2*0.94; b.mesh.rotation.z=rand(-0.2,0.2);
    b.mesh.scale.set(1,1,1); b.mesh.position.y=0.6;
    spawnWord(botEye(b),"TIMBER!",'#ffb347');
    burst(botEye(b),0x4da63c,26,7,0.8,4); burst(b.pos.clone().add(V3(0,0.5,0)),0x8a5a33,14,5,0.6,3);
    if(attacker==='you'){ player.frags++; feed(`<b>YOU</b> ⚛ fragged <i>${b.name}</i>`); centerMsg(`<h2>FRAGGED ${b.name.toUpperCase()}</h2><p>+1 · ${player.frags} frags · wubba lubba!</p>`); checkWin('you'); }
    else if(typeof attacker==='object'&&attacker!==b){ attacker.frags++; feed(`<b>${attacker.name}</b> fragged <i>${b.name}</i>`); if(attacker.frags>=fragLimit) endMatch(attacker.name); }
    else { feed(`<i>${b.name}</i> goo'd themselves`); }
    updateHUD();
  } else {
    // aggro: chase attacker
    if(attacker==='you'){ b.wp.copy(player.pos); }
    else if(attacker&&attacker.pos){ b.wp.copy(attacker.pos); }
  }
}
function damagePlayer(dmg,attacker){
  if(player.dead||!playing||matchOver||godMode) return;
  const absorbed=Math.min(player.armor,Math.round(dmg*0.5));
  player.armor-=absorbed; player.hp-=(dmg-absorbed);
  SFX.hurt(); shake(0.25);
  $('vignette').style.opacity=0.9; setTimeout(()=>$('vignette').style.opacity=0,180);
  const fwd=new THREE.Vector3(); camera.getWorldDirection(fwd);
  burst(playerEye().addScaledVector(fwd,1.4),0xff5d5d,6,4,0.35,1.5);
  spawnWord(playerEye().addScaledVector(fwd,1.6),'OOF!','#ff6a6a');
  if(player.hp<=0){
    player.hp=0; player.dead=true; player.deaths++; player.respawnT=2.5; firing=false;
    SFX.death();
    const an = attacker==='you'?'your own goo':(attacker&&attacker.name?attacker.name:'the Citadel');
    if(typeof attacker==='object'&&attacker&&attacker.frags!==undefined){ attacker.frags++; attacker.deaths-=0; feed(`<b>${attacker.name}</b> ⚛ fragged <i>YOU</i>`); if(attacker.frags>=fragLimit) endMatch(attacker.name); }
    else feed(`<i>${an}</i> fragged <b>YOU</b>`);
    centerMsg(`<h2>YOU GOT SCHWIFTY'D</h2><p>by ${an} · respawning…</p>`);
    updateHUD();
  }
  updateHUD();
}
function tryMelee(){
  if(player.fireCd>0||player.dead) return; player.fireCd=0.45;
  SFX.gaunt();
  const o=playerEye(), d=new THREE.Vector3(); camera.getWorldDirection(d);
  const wallT=rayWallT(o,d,3.2);
  let best=null,bd=3.2;
  bots.forEach(b=>{ if(b.dead)return; const c=botEye(b); const rel=c.clone().sub(o); const t=rel.dot(d); if(t<0||t>bd)return;
    const perp=rel.clone().addScaledVector(d,-t).length(); if(perp<1.0){best=b;bd=t;} });
  burst(o.clone().addScaledVector(d,1.2),0xffc247,10,5,0.3,2);
  tracer(o.clone().addScaledVector(d,0.5),o.clone().addScaledVector(d,2.6),0xffc247);
  if(best&&bd<=wallT) damageBot(best,45,'you',player.pos);
  vmKick(0.12);
}
let vmKickAmt=0; function vmKick(a){ vmKickAmt=Math.min(0.25,vmKickAmt+a); }
function playerShoot(){
  if(player.fireCd>0||player.dead) return;
  const o=playerEye(), d=new THREE.Vector3(); camera.getWorldDirection(d);
  if(player.weapon===0){ tryMelee(); return; }
  if(player.weapon===1){
    player.fireCd=0.22; SFX.rail();
    const wallT=rayWallT(o,d,120);
    let best=null,bd=wallT;
    bots.forEach(b=>{ if(b.dead)return; const c=botEye(b); const rel=c.clone().sub(o); const t=rel.dot(d); if(t<0.3||t>bd)return;
      const perp=rel.clone().addScaledVector(d,-t).length(); if(perp<0.95){best=b;bd=t;} });
    const end=o.clone().addScaledVector(d,bd);
    tracer(o.clone().addScaledVector(d,0.8),end,0x39ff6a);
    burst(end,0x39ff6a,8,4,0.35,2);
    muzzle.color.setHex(0x39ff6a); muzzle.intensity=26; setTimeout(()=>muzzle.intensity=0,60);
    if(best) damageBot(best,18,'you',player.pos);
    vmKick(0.07); shake(0.06);
  } else {
    if(player.cells<=0){ SFX.hit(); toast('🔋 No goo cells! Grab green tetras'); player.weapon=1; buildViewmodel(1); updateWeaponBar(); return; }
    player.cells--; player.fireCd=0.75;
    fireGoo(o.clone().addScaledVector(d,0.8).add(V3(0,-0.1,0)),d,'you');
    muzzle.color.setHex(0xc6ff4d); muzzle.intensity=30; setTimeout(()=>muzzle.intensity=0,80);
    vmKick(0.16); shake(0.12);
    updateHUD();
  }
}
function botShoot(b,targetPos,isPlayer=false,targetBot=null){
  const o=botEye(b);
  const err=1.1 - Math.min(0.7, b.frags*0.05); // better bots aim better... slightly
  const aim=targetPos.clone().add(V3(rand(-err,err),rand(-err*0.6,err*0.6),rand(-err,err)));
  const d=aim.clone().sub(o).normalize();
  if(Math.random()<0.55){
    // rail shot
    const wallT=rayWallT(o,d,80);
    const dist=o.distanceTo(targetPos);
    tracer(o, o.clone().addScaledVector(d,Math.min(wallT,dist+2)),0xff6a6a);
    burst(targetPos,0xff6a6a,4,3,0.25,1);
    if(dist<wallT && dist<45 && Math.random()<0.5){
      if(isPlayer){ if(!player.dead) damagePlayer(rand(8,16)|0,b); }
      else if(targetBot&&!targetBot.dead) damageBot(targetBot,rand(8,16)|0,b,b.pos);
    }
    tone(900,200,0.1,'sawtooth',0.06);
  } else {
    fireGoo(o,d,b);
  }
}
function whompBot(b,target,isPlayer,targetBot,td){ // branch slam: the Willow's signature move
  if(td>4.2) return;
  b.meleeCd=1.35; b.swing=1; b.fireCd=Math.max(b.fireCd,0.5);
  SFX.whomp(); shake(0.12);
  burst(target,0x8a5a33,12,6,0.5,4); burst(target,0x4da63c,8,5,0.4,3);
  spawnWord(target.clone().add(V3(0,0.6,0)),Math.random()<0.5?'WHOMP!':'THWACK!','#ffb347');
  const dir=target.clone().sub(botEye(b)); dir.y=0;
  if(dir.lengthSq()<0.001) dir.set(0,0,1); dir.normalize();
  if(isPlayer){
    if(!player.dead){ damagePlayer(rand(16,26)|0,b);
      player.vel.x+=dir.x*11; player.vel.z+=dir.z*11; player.vel.y=Math.max(player.vel.y,5.5); }
  } else if(targetBot&&!targetBot.dead){
    damageBot(targetBot,rand(18,30)|0,b,b.pos);
    targetBot.vel.x+=dir.x*9; targetBot.vel.z+=dir.z*9; targetBot.vel.y=Math.max(targetBot.vel.y,5);
  }
}

/* ---------------- HUD / menus ---------------- */
function updateHUD(){
  document.querySelector('#health .num').textContent=Math.max(0,Math.ceil(player.hp));
  document.querySelector('#armor .num').textContent=Math.max(0,Math.ceil(player.armor));
  const an=$('ammoName'), am=document.querySelector('#ammo .num');
  if(player.weapon===0){ an.textContent='GAUNTLET'; am.textContent='—'; }
  if(player.weapon===1){ an.textContent='PORTAL GUN'; am.textContent='∞'; }
  if(player.weapon===2){ an.textContent='GOO CELLS'; am.textContent=player.cells; }
  $('myFrags').textContent=player.frags;
  const top=Math.max(player.frags,...bots.map(b=>b.frags));
  $('topFrags').textContent=top;
  $('lowhp').style.opacity=player.hp<35&&!player.dead?0.85:0;
}
function updateWeaponBar(){ ['w1','w2','w3'].forEach((id,i)=>$(id).classList.toggle('active',player.weapon===i)); }
function renderScores(){
  const rows=[{name:player.name,frags:player.frags,deaths:player.deaths,ping:8,you:true},
    ...bots.map(b=>({name:b.name,frags:b.frags,deaths:b.deaths,ping:b.ping}))].sort((a,b)=>b.frags-a.frags);
  $('scoreRows').innerHTML=rows.map((r,i)=>`<tr style="${r.you?'color:var(--portal);font-weight:800':''}"><td>${i+1}</td><td>${r.you?'▶ ':''}${r.name}</td><td>${r.frags}</td><td>${r.deaths}</td><td>${r.ping}</td></tr>`).join('');
}
setInterval(()=>{ if(playing) renderScores(); },500);

/* ---------------- Match state ---------------- */
let playing=false, matchOver=false, matchT=600, fragLimit=20, godMode=false;
function startMatch(){
  ac();
  const n=+$('botCount').value||5; fragLimit=+$('fragLimit').value||20; sens=+$('sens').value||1;
  makeBots(n);
  player.frags=0; player.deaths=0; player.hp=100; player.armor=0; player.cells=25; player.weapon=1;
  player.dead=false; matchOver=false; matchT=600; firing=false;
  buildViewmodel(1); updateWeaponBar();
  player.pos.copy(spawns[0]); player.vel.set(0,0,0);
  player.yaw=Math.atan2(player.pos.x,player.pos.z); player.pitch=0;
  feedEl.innerHTML='';
  $('menu').classList.add('hidden'); $('hud').classList.add('on'); $('pause').classList.remove('on');
  playing=true;
  canvas.requestPointerLock?.();
  centerMsg(`<h2>WUBBA LUBBA!</h2><p>First to ${fragLimit} frags · 10:00 on the clock</p>`);
  setTimeout(()=>SFX.respawn(),200);
  toast(`🌀 ${n} gladiators entered the Citadel`);
  updateHUD();
}
function endMatch(winner){
  if(matchOver) return; matchOver=true; SFX.win();
  const youWin = winner==='you'||winner==='YOU (Morty C-137)';
  centerMsg(`<h2>${youWin?'👑 YOU RULE THE CITADEL!':'☠️ '+String(winner).toUpperCase()+' WINS'}</h2><p>${player.frags} frags · click to keep playing / menu in 6s</p>`,6000);
  feed(`<b>${winner}</b> wins the match!`);
  setTimeout(()=>{ if(playing){ document.exitPointerLock?.(); $('menu').classList.remove('hidden'); $('playBtn').innerHTML='↻ &nbsp;REMATCH IN THE CITADEL'; playing=false; $('hud').classList.remove('on'); } },6000);
}
function checkWin(who){ if(player.frags>=fragLimit) endMatch('YOU (Morty C-137)'); }
$('playBtn').addEventListener('click',startMatch);
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===canvas;
  if(!playing) return;
  if(!locked && !matchOver && !player.dead){ $('pause').classList.add('on'); }
  else $('pause').classList.remove('on');
});
$('pause').addEventListener('click',()=>canvas.requestPointerLock?.());
canvas.addEventListener('click',()=>{
  if(playing&&document.pointerLockElement!==canvas) canvas.requestPointerLock?.();
});
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

/* ---------------- Touch (light fallback) ---------------- */
const touch={mx:0,mz:0,look:false,lx:0,ly:0};
if('ontouchstart' in window){
  $('hint').textContent='Left drag = move · Right drag = look · Tap = shoot';
  let mid=null;
  canvas.addEventListener('touchstart',e=>{
    if(!playing){ return; }
    for(const t of e.changedTouches){
      if(t.clientX<innerWidth/2&&mid===null) mid={id:t.identifier,x:t.clientX,y:t.clientY};
      else { touch.look=true; touch.lx=t.clientX; touch.ly=t.clientY; touch.id=t.identifier; }
    }
  },{passive:true});
  canvas.addEventListener('touchmove',e=>{
    for(const t of e.changedTouches){
      if(mid&&t.identifier===mid.id){ touch.mx=clamp((t.clientX-mid.x)/60,-1,1); touch.mz=clamp((t.clientY-mid.y)/60,-1,1); }
      if(touch.look&&t.identifier===touch.id){ player.yaw-=(t.clientX-touch.lx)*0.005; player.pitch=clamp(player.pitch-(t.clientY-touch.ly)*0.005,-1.45,1.45); touch.lx=t.clientX; touch.ly=t.clientY; }
    }
  },{passive:true});
  canvas.addEventListener('touchend',e=>{
    for(const t of e.changedTouches){ if(mid&&t.identifier===mid.id){mid=null;touch.mx=0;touch.mz=0;} if(t.identifier===touch.id) touch.look=false; }
    if(e.changedTouches.length===1&&playing&&!player.dead) playerShoot();
  },{passive:true});
}

/* ---------------- Per-frame update ---------------- */
const clock=new THREE.Clock();
let orbitA=0;
function respawnPlayer(){
  const cands=[...spawns].sort(()=>Math.random()-0.5);
  let best=cands[0],bd=-1;
  cands.forEach(s=>{ const e=Math.min(...bots.filter(b=>!b.dead).map(b=>b.pos.distanceTo(s)).concat([99])); if(e>bd){bd=e;best=s;} });
  player.pos.copy(best); player.vel.set(0,0,0); player.hp=100; player.armor=Math.max(0,player.armor); player.cells=Math.max(player.cells,10);
  player.yaw=Math.atan2(player.pos.x,player.pos.z); player.pitch=0;
  player.dead=false; SFX.respawn(); burst(playerEye(),0x39ff6a,18,5,0.5,4); updateHUD();
}
function updatePlayer(dt){
  if(player.dead){ player.respawnT-=dt; if(player.respawnT<=0) respawnPlayer(); return; }
  // overcharge decay
  if(player.hp>100){ player.overchargeT+=dt; if(player.overchargeT>4){ player.hp=Math.max(100,player.hp-dt*4); } } else player.overchargeT=0;
  const speed=9.2;
  const f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+(-touch.mz);
  const s=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+(touch.mx);
  const sin=Math.sin(player.yaw),cos=Math.cos(player.yaw);
  let wx=(-sin*f+cos*s), wz=(-cos*f-sin*s);
  const wl=Math.hypot(wx,wz)||1; if(wl>1){wx/=wl;wz/=wl;}
  // Quake-ish: snappy ground accel, air control
  const accel=player.onGround?60:14;
  player.vel.x+=(wx*speed-player.vel.x)*Math.min(1,(player.onGround?12:1.6)*dt);
  player.vel.z+=(wz*speed-player.vel.z)*Math.min(1,(player.onGround?12:1.6)*dt);
  void accel;
  player.vel.y-=26*dt;
  if((keys.Space)&&player.onGround){ player.vel.y=9.2; player.onGround=false; SFX.jump(); burst(player.pos.clone().add(V3(0,0.1,0)),0x4dffdb,6,3,0.3,2); }
  const wasAir=!player.onGround, fallV=player.vel.y;
  player.onGround=moveBody(player.pos,player.vel,dt,0.42,1.8);
  if(wasAir&&player.onGround&&fallV<-13){ vmKick(0.15); shake(0.1); spawnWord(player.pos.clone().add(V3(0,0.6,0)),'THUMP!','#ffffff'); }
  // pads
  player.padCd-=dt; player.tpCd-=dt; player.fireCd-=dt;
  if(player.padCd<=0) for(const pd of pads){
    const dx=player.pos.x-pd.p.x,dz=player.pos.z-pd.p.z;
    if(dx*dx+dz*dz<3.2&&Math.abs(player.pos.y-pd.p.y)<2.2){
      player.vel.y=15; player.padCd=0.5; SFX.pad(); shake(0.15); burst(pd.p.clone().add(V3(0,1,0)),0x39ff6a,18,6,0.6,6);
      spawnWord(pd.p.clone().add(V3(0,2,0)),'WEEE!','#4dffdb');
      // launch toward map center slightly
      const toC=V3(-pd.p.x,0,-pd.p.z).normalize();
      player.vel.x+=toC.x*7; player.vel.z+=toC.z*7;
      centerMsg(`<p style="font-size:18px">🟢 JUMP-PAD! WEEE!</p>`,700);
    }
  }
  // portals
  if(player.tpCd<=0){
    if(player.pos.distanceTo(portalA.position)<2.4){ player.pos.copy(portalB.position).add(V3(0,0.3,1.5)); player.tpCd=1.2; SFX.teleport(); burst(playerEye(),0x39ff6a,24,7,0.6,4); }
    else if(player.pos.distanceTo(portalB.position)<2.4){ player.pos.copy(portalA.position).add(V3(0,0.3,-1.5)); player.tpCd=1.2; SFX.teleport(); burst(playerEye(),0x39ff6a,24,7,0.6,4); }
  }
  // void safety
  if(player.pos.y<-12){ damagePlayer(999,'the void'); player.pos.set(0,4,0); player.vel.set(0,0,0); player.dead=false; player.hp=100; }
  // pickups
  for(const p of pickups){
    if(!p.alive) continue;
    const d2=p.mesh.position.distanceToSquared(playerEye());
    if(d2<2.6){
      let took=false;
      if(p.type==='health'&&player.hp<100){ player.hp=Math.min(100,player.hp+25); took=true; }
      if(p.type==='mega'){ player.hp=Math.min(200,player.hp+100); player.overchargeT=0; took=true; SFX.mega(); spawnWord(playerEye(),'MEGA!','#ff4da6'); centerMsg(`<h2>☢️ MEGA HEALTH</h2><p>200 HP · go frag, Morty!</p>`); }
      else if(p.type==='armor'&&player.armor<100){ player.armor=Math.min(100,player.armor+25); took=true; }
      else if(p.type==='cells'){ player.cells=Math.min(60,player.cells+12); took=true; }
      if(took||p.type==='mega'){ p.alive=false; p.timer=p.respawn; p.mesh.visible=false; p.light.intensity=0; SFX.pickup(); burst(p.mesh.position,0xffffff,10,4,0.4,3); updateHUD(); }
    }
  }
  if(firing) playerShoot();
  // camera
  const bob=Math.sin(performance.now()*0.011)*Math.min(1,Math.hypot(player.vel.x,player.vel.z)/9)*0.05;
  vmKickAmt=Math.max(0,vmKickAmt-dt*0.8);
  camera.position.set(player.pos.x,player.pos.y+1.6+bob+shakeAmt*rand(-0.15,0.15),player.pos.z);
  camera.rotation.set(player.pitch,player.yaw,Math.sin(performance.now()*0.004)*0.003+shakeAmt*rand(-0.02,0.02));
  const targetFov=90+Math.min(12,Math.hypot(player.vel.x,player.vel.z)*0.7)+(player.vel.y>11?8:0);
  camera.fov+=(targetFov-camera.fov)*Math.min(1,8*dt); camera.updateProjectionMatrix();
  vm.position.z=-0.62+vmKickAmt; vm.position.y=-0.32+Math.sin(performance.now()*0.013)*0.008;
  vm.rotation.x=vmKickAmt*1.4;
  shakeAmt=Math.max(0,shakeAmt-dt*1.8);
}
function updateBots(dt){
  for(const b of bots){
    if(b.dead){ b.respawnT-=dt;
      if(b.respawnT<=0){ spawnBot(b); } continue; }
    b.think-=dt; b.fireCd-=dt; b.strafeT-=dt; b.tpCd-=dt;
    b.meleeCd-=dt; b.swing=Math.max(0,(b.swing||0)-dt*2.2);
    b.lastPos=b.lastPos||b.pos.clone();
    // pick living target: player or nearest bot
    let target=null,td=1e9,isPlayer=false,targetBot=null;
    if(!player.dead&&!matchOver){ const d=b.pos.distanceTo(player.pos); if(d<td){td=d;target=playerEye();isPlayer=true;} }
    for(const o of bots){ if(o===b||o.dead) continue; const d=b.pos.distanceTo(o.pos); if(d<td){td=d;target=botEye(o);isPlayer=false;targetBot=o;} }
    if(b.strafeT<=0){ b.strafe*=-1; b.strafeT=rand(0.8,2.4); }
    let mx=0,mz=0;
    if(b.think<=0){
      b.think=rand(0.3,0.7);
      if(target&&td<38&&losClear(botEye(b),target)){
        // combat: strafe around target
        const ang=Math.atan2(target.x-b.pos.x,target.z-b.pos.z);
        const strafeA=ang+Math.PI/2*b.strafe;
        const fwA=Math.random()<0.7?ang+Math.PI:ang; // keep distance
        mx=Math.sin(strafeA)*0.9+Math.sin(fwA)*0.5; mz=Math.cos(strafeA)*0.9+Math.cos(fwA)*0.5;
        b.yaw=Math.atan2(target.x-b.pos.x,target.z-b.pos.z)+Math.PI;
        if(td<3.8&&b.meleeCd<=0){ whompBot(b,target,isPlayer,targetBot,td); }
        else if(b.fireCd<=0&&td<42){ botShoot(b,target,isPlayer,targetBot); b.fireCd=td<12?rand(0.5,0.9):rand(0.9,1.8); }
      } else {
        // roam to pickups / pads / center
        if(Math.random()<0.3||b.pos.distanceTo(b.wp)<3){
          const opts=[V3(0,0,0),V3(rand(-24,24),0,rand(-24,24)),...pads.map(p=>p.p),...pickups.filter(p=>p.alive).map(p=>p.mesh.position)];
          b.wp=opts[(Math.random()*opts.length)|0].clone();
        }
        const ang=Math.atan2(b.wp.x-b.pos.x,b.wp.z-b.pos.z);
        mx=Math.sin(ang); mz=Math.cos(ang); b.yaw=ang+Math.PI;
      }
      // stuck check
      if(b.pos.distanceToSquared(b.lastPos)<0.04&&b.think!==undefined){ b.stuckT+=0.4; } else b.stuckT=0;
      b.lastPos.copy(b.pos);
      if(b.stuckT>1){ b.vel.y=9; b.stuckT=0; b.wp=V3(rand(-24,24),0,rand(-24,24)); b.strafe*=-1; }
    } else {
      // continuous steer toward wp/target
      const dest=(target&&td<38)?target:b.wp;
      const ang=Math.atan2(dest.x-b.pos.x,dest.z-b.pos.z);
      const cur=Math.atan2(mx,mz);
      void cur;
      // recompute movement cheaply toward dest with strafe
      if(target&&td<38&&losClear(botEye(b),target)){
        const strafeA=ang+Math.PI/2*b.strafe;
        mx=Math.sin(strafeA); mz=Math.cos(strafeA);
        b.yaw+=(Math.atan2(dest.x-b.pos.x,dest.z-b.pos.z)+Math.PI-b.yaw)*0.2;
        if(td<3.8&&b.meleeCd<=0){ whompBot(b,target,isPlayer,targetBot,td); }
        else if(b.fireCd<=0){ botShoot(b,target,isPlayer,targetBot); b.fireCd=rand(0.8,1.8); }
      } else { mx=Math.sin(ang); mz=Math.cos(ang); b.yaw=ang+Math.PI; }
    }
    const sp=7.6;
    b.vel.x+=(mx*sp-b.vel.x)*Math.min(1,6*dt);
    b.vel.z+=(mz*sp-b.vel.z)*Math.min(1,6*dt);
    b.vel.y-=26*dt;
    const wasFalling=b.vel.y;
    const grounded=moveBody(b.pos,b.vel,dt,0.42,1.8);
    if(!grounded&&Math.abs(b.vel.x)+Math.abs(b.vel.z)<0.5&&Math.random()<0.02) b.vel.y=8.5;
    // pads
    for(const pd of pads){ const dx=b.pos.x-pd.p.x,dz=b.pos.z-pd.p.z;
      if(dx*dx+dz*dz<3.2&&Math.abs(b.pos.y-pd.p.y)<2.2){ b.vel.y=15; burst(pd.p.clone().add(V3(0,1,0)),0x39ff6a,8,4,0.4,4); } }
    // portals
    if(b.tpCd<=0){
      if(b.pos.distanceTo(portalA.position)<2.4){ b.pos.copy(portalB.position).add(V3(0,0.3,0)); b.tpCd=1.5; burst(botEye(b),0x39ff6a,14,5,0.5,3); }
      else if(b.pos.distanceTo(portalB.position)<2.4){ b.pos.copy(portalA.position).add(V3(0,0.3,0)); b.tpCd=1.5; burst(botEye(b),0x39ff6a,14,5,0.5,3); }
    }
    // bot pickups
    for(const p of pickups){ if(!p.alive) continue;
      if(p.mesh.position.distanceToSquared(botEye(b))<2.6){
        if((p.type==='health'&&b.hp<80)||(p.type==='mega')||(p.type==='cells'&&Math.random()<0.5)){
          if(p.type==='health') b.hp=Math.min(100,b.hp+25);
          if(p.type==='mega') b.hp=Math.min(150,b.hp+100);
          p.alive=false; p.timer=p.respawn; p.mesh.visible=false; p.light.intensity=0;
        }
      }
    }
    void wasFalling;
    // mesh sync + walk anim
    b.walkPh+=dt*(3+Math.hypot(b.vel.x,b.vel.z));
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.y=b.yaw;
    const u=b.mesh.userData;
    const stomp=Math.abs(Math.sin(b.walkPh*3));
    const chop=b.swing>0?Math.sin(Math.min(1,b.swing)*Math.PI):0;
    if(u.armL){ u.armL.rotation.x=-0.25+Math.sin(b.walkPh*3)*0.18-chop*1.5; u.armR.rotation.x=-0.25-Math.sin(b.walkPh*3)*0.18-chop*1.5; }
    if(u.crown){ u.crown.rotation.z=Math.sin(b.walkPh*1.5)*0.07; u.crown.rotation.x=Math.sin(b.walkPh*2.1)*0.04-chop*0.25; }
    // sprout from a sapling on respawn, then stomp with squash & stretch
    b.grow=Math.min(1,(b.grow??1)+dt*1.1);
    const gk=b.grow-1, gs=1+2.7*gk*gk*gk+1.7*gk*gk;
    b.mesh.scale.set(gs*(1+stomp*0.04),gs*(1-stomp*0.05),gs*(1+stomp*0.04));
  }
}
function updateWorld(dt,t){
  // pickups bob + respawn
  for(const p of pickups){
    if(!p.alive){ p.timer-=dt; if(p.timer<=0){p.alive=true;p.mesh.visible=true;p.light.intensity=8;} continue; }
    p.mesh.rotation.y+=dt*3.2; p.mesh.position.y=p.baseY+Math.sin(t*3+p.phase)*0.28;
    p.light.position.copy(p.mesh.position);
  }
  // portals spin
  portalA.userData.disc.material.opacity=0.45+Math.sin(t*5)*0.15;
  portalB.userData.disc.material.opacity=0.45+Math.cos(t*5)*0.15;
  portalA.rotation.z+=dt*0.8; portalB.rotation.z-=dt*0.8;
  // particles
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.age+=dt;
    if(p.age>p.life){ scene.remove(p.m); particles.splice(i,1); continue; }
    p.v.y-=12*dt; p.m.position.addScaledVector(p.v,dt);
    p.m.material.transparent=true; p.m.material.opacity=1-p.age/p.life;
    if(p.m.position.y<0.05){p.m.position.y=0.05;p.v.y*=-0.4;}
  }
  // tracers fade
  for(let i=tracers.length-1;i>=0;i--){ const tr=tracers[i]; tr.age+=dt;
    tr.l.material.opacity=1-tr.age*6; if(tr.age>0.18){ scene.remove(tr.l); tr.l.geometry.dispose(); tracers.splice(i,1);} }
  // comic words: pop in, float up, fade out
  for(let i=words.length-1;i>=0;i--){ const w=words[i]; w.age+=dt;
    if(w.age>w.life){ scene.remove(w.s); words.splice(i,1); continue; }
    const k=w.age/w.life;
    w.s.position.y+=dt*2.2;
    const pop=k<0.25?0.5+k*2.6:1.15-k*0.15;
    w.s.scale.set(2.4*pop,1.2*pop,1);
    w.s.material.opacity=1-k*k;
  }
  // cartoon clouds drift by
  for(const c of clouds){ c.position.x+=c.userData.v*dt; if(c.position.x>90) c.position.x=-90; }
  // projectiles
  for(let i=projectiles.length-1;i>=0;i--){ const pr=projectiles[i]; pr.life-=dt; pr.v.y-=8*dt;
    const step=pr.v.clone().multiplyScalar(dt);
    const wallT=rayWallT(pr.m.position,pr.v.clone().normalize(),step.length()+0.3);
    pr.m.position.add(step); pr.light.position.copy(pr.m.position);
    burst(pr.m.position,0x9dff00,1,0.5,0.25,0.5);
    let hit=false;
    if(wallT<step.length()+0.25){ hit=true; }
    if(!pr.owner||pr.owner==='you'||true){
      // vs bots
      for(const b of bots){ if(b.dead) continue; if(pr.owner===b) continue;
        if(pr.m.position.distanceToSquared(botEye(b))<2.2){ explodeGoo(pr); projectiles.splice(i,1); hit=true; break; } }
      if(hit&&projectiles.includes(pr)){ /* already exploded */ }
      else if(!player.dead&&pr.owner!=='you'&&pr.m.position.distanceToSquared(playerEye())<2.0){ explodeGoo(pr); projectiles.splice(i,1); hit=true; }
      else if(!player.dead&&pr.owner==='you'&&pr.m.position.distanceToSquared(playerEye())<1.2&&pr.life<3.6){ explodeGoo(pr); projectiles.splice(i,1); hit=true; }
    }
    if(!hit&&(pr.life<=0||pr.m.position.y<0.1||Math.abs(pr.m.position.x)>36||Math.abs(pr.m.position.z)>36)){
      if(projectiles.includes(pr)){ explodeGoo(pr); projectiles.splice(i,1); }
    } else if(hit&&projectiles.includes(pr)){ explodeGoo(pr); projectiles.splice(i,1); }
  }
  // match timer
  if(playing&&!matchOver){
    matchT-=dt;
    const mm=String(Math.max(0,Math.floor(matchT/60))).padStart(1,'0'), ss=String(Math.max(0,Math.floor(matchT%60))).padStart(2,'0');
    $('timer').textContent=`${mm}:${ss}`;
    if(matchT<=0){
      const all=[{name:'YOU (Morty C-137)',frags:player.frags},...bots.map(b=>({name:b.name,frags:b.frags}))].sort((a,b)=>b.frags-a.frags);
      endMatch(all[0].name);
    }
  }
}
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(0.033,clock.getDelta()), t=clock.elapsedTime;
  if(playing){ updatePlayer(dt); updateBots(dt); }
  else {
    // attract orbit behind menu so screenshots look alive
    orbitA+=dt*0.15;
    camera.position.set(Math.sin(orbitA)*24,11+Math.sin(t*0.3)*1.5,Math.cos(orbitA)*24);
    camera.lookAt(0,2.5,0); camera.fov+=(70-camera.fov)*dt; camera.updateProjectionMatrix();
    if(bots.length===0) makeBots(5);
    // idle bots wander for menu backdrop
    updateBots(dt*0.5);
  }
  updateWorld(dt,t);
  // floating chunks
  scene.children.forEach(o=>{ if(o.userData&&o.userData.spin) o.rotation.y+=o.userData.spin*dt; });
  renderer.render(scene,camera);
}

/* ---------------- Boot ---------------- */
makeBots(5);
updateHUD(); updateWeaponBar();
$('loading').style.display='none';
animate();
// expose for debugging / tests
window.__arena={player,words,spawnWord,startMatch,get playing(){return playing},get bots(){return bots;}};
