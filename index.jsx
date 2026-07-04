import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Send, KeyRound, Loader2, Bot, Zap, ChevronRight } from 'lucide-react';

const API_URL = 'https://api.aitklabs.in/v1/chat/completions';
const MODEL_ID = 'anthropic/claude-haiku-4-5';
const TRACE_NODES = ['Gateway', 'Auth · Keys', 'Routing Engine', 'Anthropic'];
const VALID_ACTIONS = ['WALK_FORWARD', 'TURN_LEFT', 'TURN_RIGHT', 'WAVE', 'JUMP', 'LOOK_AROUND', 'IDLE'];

const COLOR = {
  bg: '#03050d', bg2: '#060a14', bg3: '#0a1020',
  card: '#0d1528', card2: '#111d35',
  border: 'rgba(56,139,253,0.15)', border2: 'rgba(56,139,253,0.30)',
  cyan: '#00d4ff', green: '#00ff88', purple: '#9d4edd', amber: '#ffbe0b', red: '#ff5470',
  text: '#e2eaff', text2: '#8899bb', text3: '#4a5a7a',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(' ');
  let line = '', yy = y, lines = 0;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line, x, yy);
      line = words[n] + ' '; yy += lineHeight; lines++;
      if (lines >= maxLines) { ctx.fillText(line.trim() + '…', x, yy); return; }
    } else line = test;
  }
  ctx.fillText(line, x, yy);
}

export default function AgentSandbox() {
  const mountRef = useRef(null);
  const worldRef = useRef(null);
  const jumpingRef = useRef(false);

  const [apiKey, setApiKey] = useState('');
  const [goal, setGoal] = useState('Explore the yard and greet whatever you find.');
  const [feed, setFeed] = useState([]);
  const [busy, setBusy] = useState(false);
  const [robotAction, setRobotAction] = useState('IDLE');
  const [traceStep, setTraceStep] = useState(-1);
  const [statusMsg, setStatusMsg] = useState('Paste a yk_live_… key to wake the robot.');

  const pushFeed = useCallback((entry) => {
    setFeed((f) => [...f.slice(-24), { id: Date.now() + Math.random(), ...entry }]);
  }, []);

  // ── Three.js scene: init once ──────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth, height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x03050d, 9, 22);
    scene.background = new THREE.Color(0x03050d);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    const camState = { theta: Math.PI / 3.2, phi: 1.05, radius: 11 };
    function updateCamera() {
      camera.position.x = camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta);
      camera.position.z = camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta);
      camera.position.y = camState.radius * Math.cos(camState.phi);
      camera.lookAt(0, 1.1, 0);
    }
    updateCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x335577, 0x03050d, 0.65));
    const key1 = new THREE.PointLight(0x00d4ff, 1.3, 22); key1.position.set(3, 6, 3); scene.add(key1);
    const rim = new THREE.PointLight(0x9d4edd, 0.7, 22); rim.position.set(-4, 3, -3); scene.add(rim);

    scene.add(new THREE.GridHelper(20, 20, 0x1c2742, 0x0d1528));
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(10, 48),
      new THREE.MeshStandardMaterial({ color: 0x060a14, roughness: 0.9, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    // Landmarks the robot can "see" and be told about
    const LANDMARKS = [
      { name: 'beacon', angle: 45, dist: 4 },
      { name: 'crate', angle: -100, dist: 3.5 },
      { name: 'pillar', angle: 170, dist: 4.5 },
    ];
    LANDMARKS.forEach((lm) => {
      const rad = THREE.MathUtils.degToRad(lm.angle);
      const x = Math.sin(rad) * lm.dist, z = Math.cos(rad) * lm.dist;
      let mesh;
      if (lm.name === 'beacon') {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 2, 12),
          new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.9 })
        );
        mesh.position.set(x, 1, z);
        const glow = new THREE.PointLight(0x00d4ff, 1, 5); glow.position.set(x, 1.6, z); scene.add(glow);
      } else if (lm.name === 'crate') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a2f3f, roughness: 0.85 }));
        mesh.position.set(x, 0.5, z);
      } else {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.32, 2.6, 8),
          new THREE.MeshStandardMaterial({ color: 0x9d4edd, emissive: 0x9d4edd, emissiveIntensity: 0.45 })
        );
        mesh.position.set(x, 1.3, z);
      }
      scene.add(mesh);
    });

    // ── Humanoid robot, built from primitives (r128-safe) ──
    const robot = new THREE.Group();
    const chassis = new THREE.MeshStandardMaterial({ color: 0x111d35, roughness: 0.5, metalness: 0.45 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 1 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.35), chassis);
    torso.position.y = 1.1; robot.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), chassis);
    head.position.y = 1.75; robot.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.05), glow);
    visor.position.set(0, 1.77, 0.26); robot.add(visor);

    function makeLimb(isArm) {
      const group = new THREE.Group();
      const upperLen = isArm ? 0.4 : 0.45, lowerLen = isArm ? 0.38 : 0.45;
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, upperLen, 8), chassis);
      upper.position.y = -upperLen / 2; group.add(upper);
      const lowerGroup = new THREE.Group(); lowerGroup.position.y = -upperLen;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, lowerLen, 8), chassis);
      lower.position.y = -lowerLen / 2; lowerGroup.add(lower);
      group.add(lowerGroup);
      return { group };
    }
    const leftArm = makeLimb(true); leftArm.group.position.set(-0.4, 1.45, 0);
    const rightArm = makeLimb(true); rightArm.group.position.set(0.4, 1.45, 0);
    const leftLeg = makeLimb(false); leftLeg.group.position.set(-0.16, 0.7, 0);
    const rightLeg = makeLimb(false); rightLeg.group.position.set(0.16, 0.7, 0);
    robot.add(leftArm.group, rightArm.group, leftLeg.group, rightLeg.group);
    scene.add(robot);

    // Speech bubble via canvas sprite
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 128;
    const bctx = bc.getContext('2d');
    const bubbleTex = new THREE.CanvasTexture(bc);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthTest: false }));
    bubble.scale.set(2.6, 0.65, 1);
    bubble.position.set(0, 2.65, 0);
    bubble.visible = false;
    robot.add(bubble);
    function drawBubble(text) {
      bctx.clearRect(0, 0, 512, 128);
      bctx.fillStyle = 'rgba(13,21,40,0.94)'; roundRect(bctx, 4, 4, 504, 120, 16); bctx.fill();
      bctx.strokeStyle = 'rgba(0,212,255,0.55)'; bctx.lineWidth = 2; roundRect(bctx, 4, 4, 504, 120, 16); bctx.stroke();
      bctx.fillStyle = '#e2eaff'; bctx.font = '22px sans-serif';
      wrapText(bctx, text, 22, 42, 468, 28, 3);
      bubbleTex.needsUpdate = true;
    }

    // Manual orbit (drag) — OrbitControls unavailable in this three.js build
    let dragging = false, lastX = 0, lastY = 0;
    const onDown = (e) => { dragging = true; const t = e.touches ? e.touches[0] : e; lastX = t.clientX; lastY = t.clientY; };
    const onMove = (e) => {
      if (!dragging) return;
      const t = e.touches ? e.touches[0] : e;
      camState.theta -= (t.clientX - lastX) * 0.008;
      camState.phi = Math.min(1.5, Math.max(0.5, camState.phi - (t.clientY - lastY) * 0.006));
      lastX = t.clientX; lastY = t.clientY; updateCamera();
    };
    const onUp = () => { dragging = false; };
    renderer.domElement.addEventListener('mousedown', onDown);
    renderer.domElement.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    renderer.domElement.addEventListener('touchstart', onDown, { passive: true });
    renderer.domElement.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);

    const state = { action: 'IDLE', t: 0 };
    worldRef.current = { robot, bubble, drawBubble, state };

    let raf;
    const clock = new THREE.Clock();
    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      state.t += dt;
      const bob = Math.sin(state.t * 2) * 0.02;
      torso.position.y = 1.1 + bob;
      head.position.y = 1.75 + bob;

      if (state.action === 'WALK_FORWARD') {
        robot.position.x += Math.sin(robot.rotation.y) * 1.4 * dt;
        robot.position.z += Math.cos(robot.rotation.y) * 1.4 * dt;
        const swing = Math.sin(state.t * 8) * 0.5;
        leftLeg.group.rotation.x = swing; rightLeg.group.rotation.x = -swing;
        leftArm.group.rotation.x = -swing * 0.6; rightArm.group.rotation.x = swing * 0.6;
      } else if (state.action === 'TURN_LEFT') {
        robot.rotation.y += dt * 2;
      } else if (state.action === 'TURN_RIGHT') {
        robot.rotation.y -= dt * 2;
      } else if (state.action === 'WAVE') {
        rightArm.group.rotation.z = -2.2;
        rightArm.group.rotation.x = Math.sin(state.t * 10) * 0.4 - 0.3;
        leftLeg.group.rotation.x *= 0.9; rightLeg.group.rotation.x *= 0.9; leftArm.group.rotation.x *= 0.9;
      } else if (state.action === 'LOOK_AROUND') {
        head.rotation.y = Math.sin(state.t * 1.5) * 0.6;
      } else {
        leftLeg.group.rotation.x *= 0.9; rightLeg.group.rotation.x *= 0.9;
        leftArm.group.rotation.x *= 0.9; rightArm.group.rotation.x *= 0.9;
        rightArm.group.rotation.z *= 0.9; head.rotation.y *= 0.95;
      }
      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
      renderer.domElement.removeEventListener('mousedown', onDown);
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // Push action into the live scene + handle one-shot jump tween
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    w.state.action = robotAction;
    if (robotAction === 'JUMP' && !jumpingRef.current) {
      jumpingRef.current = true;
      const start = performance.now();
      const tick = (now) => {
        const t = (now - start) / 500;
        if (t >= 1) { w.robot.position.y = 0; jumpingRef.current = false; return; }
        w.robot.position.y = Math.sin(Math.PI * t) * 0.8;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, [robotAction]);

  async function sendToRobot() {
    const key = apiKey.trim();
    if (!key) { setStatusMsg('Paste your yk_live_… key first.'); return; }
    if (busy) return;
    setBusy(true); setTraceStep(0);
    setStatusMsg('Talking to the gateway…');

    const sceneDesc = 'You are standing in a small test yard. Around you: a glowing cyan beacon, a wooden supply crate, and a tall purple data pillar, arranged roughly in a triangle.';
    const sys = `You are the onboard mind of a small test robot in Yantra AI's agent sandbox. Reply in 1-2 short, curious sentences as the robot's inner voice — then on its own final line write exactly one of:\nACTION: WALK_FORWARD\nACTION: TURN_LEFT\nACTION: TURN_RIGHT\nACTION: WAVE\nACTION: JUMP\nACTION: LOOK_AROUND\nACTION: IDLE`;
    const userMsg = `${sceneDesc}\n\nInstruction from your operator: ${goal}`;

    pushFeed({ role: 'request', text: goal });

    try {
      setTraceStep(1);
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL_ID, max_tokens: 150, temperature: 0.9,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
        }),
      });
      setTraceStep(2);
      const data = await res.json();

      if (!res.ok) {
        pushFeed({ role: 'error', text: data?.error?.message || `Request failed (${res.status})` });
        setStatusMsg('Something went wrong — see the feed.');
        setBusy(false); setTimeout(() => setTraceStep(-1), 500);
        return;
      }
      setTraceStep(3);
      const content = data?.choices?.[0]?.message?.content || '';
      const m = content.match(/ACTION:\s*([A-Z_]+)/i);
      const action = m && VALID_ACTIONS.includes(m[1].toUpperCase()) ? m[1].toUpperCase() : 'IDLE';
      const speech = content.replace(/ACTION:\s*[A-Z_]+/i, '').trim() || '(the robot stays quiet)';

      pushFeed({
        role: 'response', text: speech,
        meta: {
          provider: res.headers.get('x-yantra-provider'),
          costPaise: res.headers.get('x-yantra-cost-paise'),
          balancePaise: res.headers.get('x-yantra-balance-paise'),
          action,
        },
      });

      worldRef.current?.drawBubble(speech.slice(0, 160));
      if (worldRef.current) worldRef.current.bubble.visible = true;
      setRobotAction(action);
      setStatusMsg('Live — robot responded.');
      setTimeout(() => { setRobotAction('IDLE'); if (worldRef.current) worldRef.current.bubble.visible = false; }, 3400);
    } catch (e) {
      pushFeed({ role: 'error', text: 'Network error — check the key, or the artifact sandbox may be blocking the request.' });
      setStatusMsg('Network error.');
    } finally {
      setBusy(false);
      setTimeout(() => setTraceStep(-1), 500);
    }
  }

  return (
    <div className="w-full h-screen flex flex-col" style={{ background: COLOR.bg, color: COLOR.text, fontFamily: "'Inter','Instrument Sans',system-ui,sans-serif" }}>
      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:.4} 50%{opacity:1} }
        .ys-scroll::-webkit-scrollbar{width:6px}
        .ys-scroll::-webkit-scrollbar-thumb{background:${COLOR.border2};border-radius:6px}
        .ys-input:focus{outline:none;border-color:${COLOR.cyan}!important;box-shadow:0 0 0 3px rgba(0,212,255,.15)}
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${COLOR.border}` }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg"
            style={{ background: `linear-gradient(135deg, ${COLOR.cyan}, ${COLOR.purple})`, color: '#02121b', fontFamily: 'Georgia, serif' }}>य</div>
          <div>
            <div className="font-bold text-sm leading-tight">Yantra AI — Agent Sandbox</div>
            <div className="text-xs" style={{ color: COLOR.text3 }}>Claude Haiku 4.5 · live via your Yantra gateway</div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: COLOR.text2 }}>
          <span className="w-2 h-2 rounded-full" style={{ background: busy ? COLOR.amber : COLOR.green, animation: busy ? 'pulseDot 0.8s infinite' : 'none' }} />
          {busy ? 'Requesting…' : 'Ready'}
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* Viewport */}
        <div className="flex-1 relative rounded-2xl overflow-hidden min-h-[320px]" style={{ background: COLOR.bg3, border: `1px solid ${COLOR.border}` }}>
          <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2"
            style={{ background: 'rgba(13,21,40,0.85)', border: `1px solid ${COLOR.border2}`, color: COLOR.cyan }}>
            <Bot size={13} /> {robotAction.replace('_', ' ')}
          </div>
          <div className="absolute bottom-3 right-3 text-xs" style={{ color: COLOR.text3 }}>drag to orbit</div>
        </div>

        {/* Control panel */}
        <div className="w-full lg:w-[380px] flex flex-col gap-3 overflow-y-auto ys-scroll flex-shrink-0">
          {/* API key */}
          <div className="rounded-xl p-3.5" style={{ background: COLOR.card, border: `1px solid ${COLOR.border}` }}>
            <label className="text-xs font-medium flex items-center gap-1.5 mb-2" style={{ color: COLOR.text2 }}>
              <KeyRound size={13} /> Your Yantra API key
            </label>
            <input
              type="password"
              className="ys-input w-full rounded-lg px-3 py-2 text-sm font-mono"
              style={{ background: COLOR.bg2, border: `1px solid ${COLOR.border2}`, color: COLOR.text }}
              placeholder="yk_live_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="text-xs mt-1.5" style={{ color: COLOR.text3 }}>
              Stays in this browser tab — sent straight to api.aitklabs.in, never anywhere else.
            </div>
          </div>

          {/* Trace diagram */}
          <div className="rounded-xl p-3.5" style={{ background: COLOR.card, border: `1px solid ${COLOR.border}` }}>
            <div className="text-xs font-medium mb-3" style={{ color: COLOR.text2 }}>Request trace</div>
            <div className="flex items-center justify-between">
              {TRACE_NODES.map((node, i) => (
                <React.Fragment key={node}>
                  <div className="flex flex-col items-center gap-1" style={{ flex: '0 0 auto' }}>
                    <div className="w-2.5 h-2.5 rounded-full transition-colors" style={{ background: traceStep >= i ? COLOR.cyan : COLOR.border2, boxShadow: traceStep >= i ? `0 0 8px ${COLOR.cyan}` : 'none' }} />
                    <div className="text-[10px] text-center leading-tight" style={{ color: traceStep >= i ? COLOR.cyan : COLOR.text3, maxWidth: 56 }}>{node}</div>
                  </div>
                  {i < TRACE_NODES.length - 1 && (
                    <div className="flex-1 h-px mx-1" style={{ background: traceStep > i ? COLOR.cyan : COLOR.border2, marginBottom: 14 }} />
                  )}
                </React.Fragment>
              ))}
            </div>
            {feed.length > 0 && feed[feed.length - 1].meta && (
              <div className="mt-3 pt-3 flex justify-between text-xs font-mono" style={{ borderTop: `1px solid ${COLOR.border}`, color: COLOR.text2 }}>
                <span>{feed[feed.length - 1].meta.provider}</span>
                <span style={{ color: COLOR.amber }}>₹{((feed[feed.length - 1].meta.costPaise || 0) / 100).toFixed(3)}</span>
                <span style={{ color: COLOR.green }}>₹{((feed[feed.length - 1].meta.balancePaise || 0) / 100).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Goal input */}
          <div className="rounded-xl p-3.5" style={{ background: COLOR.card, border: `1px solid ${COLOR.border}` }}>
            <label className="text-xs font-medium mb-2 block" style={{ color: COLOR.text2 }}>Give the robot a goal</label>
            <textarea
              className="ys-input w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: COLOR.bg2, border: `1px solid ${COLOR.border2}`, color: COLOR.text, minHeight: 60 }}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <button
              onClick={sendToRobot}
              disabled={busy}
              className="w-full mt-2 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
              style={{ background: `linear-gradient(135deg, ${COLOR.cyan}, #3b9dff)`, color: '#02121b', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {busy ? 'Thinking…' : 'Send to robot'}
            </button>
            <div className="text-xs mt-1.5" style={{ color: COLOR.text3 }}>{statusMsg}</div>
          </div>

          {/* Feed */}
          <div className="rounded-xl p-3.5 flex-1 flex flex-col min-h-[160px]" style={{ background: COLOR.card, border: `1px solid ${COLOR.border}` }}>
            <div className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: COLOR.text2 }}>
              <Zap size={13} /> Neural feed
            </div>
            <div className="flex-1 overflow-y-auto ys-scroll space-y-2 pr-1">
              {feed.length === 0 && <div className="text-xs" style={{ color: COLOR.text3 }}>Send a goal to see the real request/response cycle here.</div>}
              {feed.map((f) => (
                <div key={f.id} className="text-xs rounded-lg p-2 font-mono leading-relaxed"
                  style={{
                    background: COLOR.bg2,
                    borderLeft: `2px solid ${f.role === 'error' ? COLOR.red : f.role === 'request' ? COLOR.purple : COLOR.green}`,
                  }}>
                  <div className="flex items-center gap-1 mb-1" style={{ color: f.role === 'error' ? COLOR.red : f.role === 'request' ? COLOR.purple : COLOR.green }}>
                    <ChevronRight size={11} /> {f.role === 'request' ? 'you → robot' : f.role === 'error' ? 'error' : 'robot'}
                  </div>
                  <div style={{ color: COLOR.text }}>{f.text}</div>
                  {f.meta && <div className="mt-1" style={{ color: COLOR.text3 }}>action: {f.meta.action}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
