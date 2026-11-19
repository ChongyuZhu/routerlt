// RouteRLT project page interactive scripts: Results tabs, BibTeX copy, and Cartoon Explainer.

(() => {
  // 1. Accessible Results Tabs
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab) {
    tabs.forEach(item => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        selectTab(tabs[next]);
        tabs[next].focus();
      }
    });
  });

  // 2. BibTeX Copy
  const copyButton = document.getElementById('copy-citation');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      const code = document.getElementById('bibtex');
      const status = document.getElementById('copy-status');
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        copyButton.textContent = 'Copied!';
        status.textContent = 'Citation copied to clipboard.';
        setTimeout(() => { copyButton.textContent = 'Copy citation'; }, 2200);
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
        copyButton.textContent = 'Text selected';
        status.textContent = 'Use your browser Copy command to copy the selected citation.';
      }
    });
  }

  // 3. Interactive Cartoon Animation (Generalist VLA vs. RL Specialists)
  const svg = document.getElementById('routerlt-cartoon');
  if (!svg) return;

  const $ = id => document.getElementById(id);
  const el = {
    link1: $('arm-link-1'), link1In: $('arm-link-1-inner'),
    link2: $('arm-link-2'), link2In: $('arm-link-2-inner'),
    elbow: $('joint-elbow'), elbowDot: $('joint-elbow-dot'), aura: $('arm-aura'),
    gripper: $('gripper-group'), fLeft: $('finger-left'), fRight: $('finger-right'), wristLed: $('wrist-led'),
    connector: $('connector'), cable: $('cable-tail'),
    wireVla: $('wire-vla'), wirePickup: $('wire-pickup'), wireInsert: $('wire-insert'),
    nodeVla: $('node-vla'), nodePickup: $('node-pickup'), nodeInsert: $('node-insert'),
    badgeVla: $('badge-vla-active'), badgeVlaText: $('badge-vla-text'),
    gruPulse: $('gru-pulse'), gruBar: $('gru-bar'), gruSub: $('gru-subtext'),
    queueStatus: $('queue-status'), queueSub: $('queue-sub'),
    qSlots: [0, 1, 2, 3].map(i => $('q-slot-' + i)),
    qTexts: [0, 1, 2, 3].map(i => $('q-text-' + i)),
    zonePickup: $('zone-pickup'), zoneInsert: $('zone-insert'),
    portSuccess: $('port-success-ring'), portFail: $('port-fail-spark'),
    callout: $('callout-group'), calloutBg: $('callout-bg'),
    calloutTag: $('callout-tag'), calloutMsg: $('callout-msg'),
    progressFill: $('anim-progress-fill'),
    playBtn: $('anim-play-btn'), replayBtn: $('anim-replay-btn'),
  };

  const modeBtns = [...document.querySelectorAll('.mode-btn')];
  const stagePills = [...document.querySelectorAll('.stage-pill')];

  const COLORS = {
    vla: '#475569',
    vlaLight: '#cbd5e1',
    pickup: '#2b7a52',
    insert: '#7a5386',
    amber: '#d98218',
    fail: '#dc2626',
  };

  // Total loop duration in seconds
  const DURATION = 13.0;
  // Stage boundaries [start, end] in seconds
  const STAGE_STARTS = [0.0, 2.4, 5.1, 7.6, 10.6];

  const BASE_X = 230;
  const BASE_Y = 346;
  const L1 = 242;
  const L2 = 236;

  let mode = 'routerlt'; // 'routerlt' | 'base'
  let elapsed = 0;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastTs = null;

  if (!playing && el.playBtn) el.playBtn.textContent = 'Play';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // Analytical 2-link IK with elbow-up solution
  function solveIK(tx, ty) {
    let dx = tx - BASE_X;
    let dy = ty - BASE_Y;
    let dist = Math.hypot(dx, dy);
    const maxR = L1 + L2 - 6;
    const minR = Math.abs(L1 - L2) + 10;
    if (dist > maxR) { dx *= maxR / dist; dy *= maxR / dist; dist = maxR; }
    if (dist < minR) { dx *= minR / dist; dy *= minR / dist; dist = minR; }
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const baseAngle = Math.atan2(dy, dx);
    const a = Math.acos(cosA);
    // Choose elbow-up (smaller y)
    const e1x = BASE_X + L1 * Math.cos(baseAngle - a);
    const e1y = BASE_Y + L1 * Math.sin(baseAngle - a);
    const e2x = BASE_X + L1 * Math.cos(baseAngle + a);
    const e2y = BASE_Y + L1 * Math.sin(baseAngle + a);
    const ex = e1y < e2y ? e1x : e2x;
    const ey = e1y < e2y ? e1y : e2y;
    return { ex, ey, wx: BASE_X + dx, wy: BASE_Y + dy };
  }

  function setNodeHighlight(active) {
    const setRect = (group, color, width, bg) => {
      const rect = group.querySelector('rect');
      rect.setAttribute('stroke', color);
      rect.setAttribute('stroke-width', width);
      rect.setAttribute('fill', bg);
    };
    setRect(el.nodeVla, active === 'vla' ? COLORS.vla : '#cbd5e1', active === 'vla' ? '2.8' : '1.8', active === 'vla' ? '#f8fafc' : '#ffffff');
    setRect(el.nodePickup, active === 'pickup' ? COLORS.pickup : '#cbd5e1', active === 'pickup' ? '2.8' : '1.8', active === 'pickup' ? '#effaf3' : '#ffffff');
    setRect(el.nodeInsert, active === 'insert' ? COLORS.insert : '#cbd5e1', active === 'insert' ? '2.8' : '1.8', active === 'insert' ? '#f7f0fa' : '#ffffff');

    el.badgeVla.setAttribute('fill', active === 'vla' ? COLORS.vla : '#cbd5e1');
    el.badgeVlaText.textContent = active === 'vla' ? 'ACTIVE' : 'STANDBY';
    el.badgeVlaText.setAttribute('fill', active === 'vla' ? '#ffffff' : '#64748b');

    el.wireVla.setAttribute('stroke', active === 'vla' ? COLORS.vla : '#d1d5db');
    el.wirePickup.setAttribute('stroke', active === 'pickup' ? COLORS.pickup : '#d1d5db');
    el.wireInsert.setAttribute('stroke', active === 'insert' ? COLORS.insert : '#d1d5db');

    el.wireVla.setAttribute('stroke-width', active === 'vla' ? '3.5' : '2');
    el.wirePickup.setAttribute('stroke-width', active === 'pickup' ? '3.5' : '2');
    el.wireInsert.setAttribute('stroke-width', active === 'insert' ? '3.5' : '2');

    // Dim specialist nodes in Base VLA Alone mode
    const specOpacity = mode === 'base' ? '0.35' : '1';
    el.nodePickup.setAttribute('opacity', specOpacity);
    el.nodeInsert.setAttribute('opacity', specOpacity);
    el.wirePickup.setAttribute('opacity', specOpacity);
    el.wireInsert.setAttribute('opacity', specOpacity);
  }

  function updateQueue(owner, flushing, stepIdx) {
    const color = flushing ? COLORS.amber
      : owner === 'pickup' ? COLORS.pickup
      : owner === 'insert' ? COLORS.insert
      : owner === 'fail' ? COLORS.fail
      : COLORS.vla;

    for (let i = 0; i < 4; i++) {
      if (flushing) {
        el.qSlots[i].setAttribute('fill', i === 0 ? COLORS.amber : '#fef3e2');
        el.qTexts[i].textContent = i === 0 ? 'a₁' : '×';
        el.qTexts[i].setAttribute('fill', i === 0 ? '#ffffff' : '#b45309');
      } else {
        const isCurrent = i === (stepIdx % 4);
        const isPast = i < (stepIdx % 4);
        el.qSlots[i].setAttribute('fill', isCurrent ? color : isPast ? '#eef0eb' : '#dfe3dc');
        el.qTexts[i].textContent = 'a' + ['₁', '₂', '₃', '₄'][i];
        el.qTexts[i].setAttribute('fill', isCurrent ? '#ffffff' : isPast ? '#94a3b8' : '#475569');
      }
    }

    if (flushing) {
      el.queueStatus.textContent = 'Flushed stale chunk!';
      el.queueStatus.setAttribute('fill', '#b45309');
      el.queueSub.textContent = 'Immediate handoff';
    } else if (owner === 'pickup') {
      el.queueStatus.textContent = 'Pickup RL chunk (C=10)';
      el.queueStatus.setAttribute('fill', COLORS.pickup);
      el.queueSub.textContent = 'Reference-anchored';
    } else if (owner === 'insert') {
      el.queueStatus.textContent = 'Insert RL chunk (C=10)';
      el.queueStatus.setAttribute('fill', COLORS.insert);
      el.queueSub.textContent = 'Contact-rich control';
    } else if (owner === 'fail') {
      el.queueStatus.textContent = 'Stale VLA chunk (C=35)';
      el.queueStatus.setAttribute('fill', COLORS.fail);
      el.queueSub.textContent = 'No specialist handoff';
    } else {
      el.queueStatus.textContent = 'VLA chunk (C=35)';
      el.queueStatus.setAttribute('fill', COLORS.vla);
      el.queueSub.textContent = mode === 'base' ? 'Fixed open-loop chunk' : 'Clear on switch';
    }
  }

  function renderFrame(t) {
    // Determine stage index 0..4
    let stage = 0;
    for (let i = STAGE_STARTS.length - 1; i >= 0; i--) {
      if (t >= STAGE_STARTS[i]) { stage = i; break; }
    }
    stagePills.forEach((btn, idx) => btn.classList.toggle('is-current', idx === stage));
    el.progressFill.setAttribute('width', String((t / DURATION) * 912));

    // Default scene variables (Left: Robot Base x=200 | Center: Connector Init x=460 | Right: Female Port x=716)
    let wx = 400, wy = 248; // wrist target
    let jawOpen = 11; // 11 = open, 4.5 = closed
    let holding = false;
    let cx = 460, cy = 376, cRot = 0; // connector pose
    let owner = 'vla';
    let flushing = false;
    let gruLevel = 0.22; // 0..1 confidence bar
    let gruText = 'Monitoring state z_t';
    let calloutTag = 'PHASE 01 · GENERALIST VLA';
    let calloutMsg = 'Approaching connector smoothly...';
    let calloutColor = COLORS.vla;
    let calloutX = 514;
    let successOpacity = 0;
    let failOpacity = 0;

    if (mode === 'routerlt') {
      if (t < 2.4) {
        const p = easeInOut(t / 2.4);
        wx = lerp(390, 456, p);
        wy = lerp(246, 314, p);
        jawOpen = 12;
        owner = 'vla';
        gruLevel = lerp(0.16, 0.72, p);
        gruText = p > 0.7 ? 'Approaching grasp phase...' : 'Monitoring state z_t';
        calloutTag = 'PHASE 01 · GENERALIST VLA (π_VLA)';
        calloutMsg = 'Frozen VLA drives coarse approach to connector.';
        calloutColor = COLORS.vla;
      } else if (t < 5.1) {
        const u = (t - 2.4) / 2.7;
        owner = 'pickup';
        flushing = u < 0.22;
        gruLevel = 0.94;
        gruText = flushing ? 'Switch! Flushing VLA queue' : 'Pickup specialist active (π₁)';
        if (u < 0.45) {
          const p = easeInOut(u / 0.45);
          wx = lerp(456, 456, p) + Math.sin(u * 26) * 2.5 * (1 - p);
          wy = lerp(314, 352, p);
          jawOpen = 11;
        } else if (u < 0.72) {
          const p = easeInOut((u - 0.45) / 0.27);
          wx = 456;
          wy = 352;
          jawOpen = lerp(11, 4.5, p);
        } else {
          const p = easeInOut((u - 0.72) / 0.28);
          wx = 456;
          wy = lerp(352, 320, p);
          jawOpen = 4.5;
          holding = true;
        }
        calloutTag = flushing ? 'HANDOFF · ACTION-BOUNDARY FLUSH' : 'PHASE 02 · PICKUP SPECIALIST (π₁)';
        calloutMsg = flushing
          ? 'GRU triggers Pickup RL & clears stale VLA actions!'
          : 'RL specialist refines grasp on the small housing.';
        calloutColor = flushing ? COLORS.amber : COLORS.pickup;
      } else if (t < 7.6) {
        const u = (t - 5.1) / 2.5;
        owner = 'vla';
        flushing = u < 0.16;
        holding = true;
        jawOpen = 4.5;
        const p = easeInOut(u);
        wx = lerp(456, 636, p);
        wy = 320 - Math.sin(p * Math.PI) * 28 + p * (-3);
        gruLevel = u > 0.75 ? lerp(0.3, 0.82, (u - 0.75) / 0.25) : 0.28;
        gruText = flushing ? 'Exit confirmed → Generalist' : 'Transit · monitoring z_t';
        calloutTag = flushing ? 'HANDOFF · RE-ENTRANT STABILIZER' : 'PHASE 03 · GENERALIST VLA RESUMES';
        calloutMsg = flushing
          ? 'Grasp secured! Control returns cleanly to frozen VLA.'
          : 'Generalist transports connector across the table.';
        calloutColor = flushing ? COLORS.amber : COLORS.vla;
      } else if (t < 10.6) {
        const u = (t - 7.6) / 3.0;
        owner = 'insert';
        flushing = u < 0.18;
        holding = true;
        jawOpen = 4.5;
        gruLevel = 0.96;
        gruText = flushing ? 'Switch! Flushing VLA queue' : 'Insertion specialist active (π₂)';
        if (u < 0.55) {
          const p = easeInOut(u / 0.55);
          const microY = Math.sin(u * 30) * 4.5 * (1 - p);
          wx = lerp(636, 670, p);
          wy = lerp(317, 315, p) + microY;
        } else {
          const p = easeInOut((u - 0.55) / 0.45);
          wx = lerp(670, 696, p);
          wy = 315;
        }
        calloutTag = flushing ? 'HANDOFF · ACTION-BOUNDARY FLUSH' : 'PHASE 04 · INSERTION SPECIALIST (π₂)';
        calloutMsg = flushing
          ? 'GRU triggers Insertion RL right at the 1 mm port!'
          : 'Contact-rich micro-alignment seats the connector.';
        calloutColor = flushing ? COLORS.amber : COLORS.insert;
      } else {
        const u = (t - 10.6) / (DURATION - 10.6);
        owner = 'insert';
        holding = false;
        cx = 700; cy = 339; cRot = 0;
        const p = easeInOut(Math.min(u * 1.6, 1));
        wx = lerp(696, 650, p);
        wy = lerp(315, 275, p);
        jawOpen = lerp(4.5, 11.5, p);
        gruLevel = 0.18;
        gruText = 'Complete! (65.7% real robot)';
        successOpacity = 0.85 + 0.15 * Math.sin(u * 10);
        calloutTag = 'PHASE 05 · FULL-TASK SUCCESS ✓';
        calloutMsg = 'Seated cleanly! 65.7% real-robot success (23/35).';
        calloutColor = COLORS.pickup;
      }
    } else {
      owner = 'vla';
      gruLevel = 0.08;
      gruText = 'Disabled in Base VLA mode';
      if (t < 2.4) {
        const p = easeInOut(t / 2.4);
        wx = lerp(390, 456, p);
        wy = lerp(246, 314, p);
        jawOpen = 12;
        calloutTag = 'BASE VLA ONLY · APPROACH';
        calloutMsg = 'Frozen generalist approaches connector.';
        calloutColor = COLORS.vla;
      } else if (t < 5.1) {
        const u = (t - 2.4) / 2.7;
        if (u < 0.5) {
          const p = easeInOut(u / 0.5);
          wx = lerp(456, 459, p);
          wy = lerp(314, 352, p);
          jawOpen = 11;
        } else if (u < 0.75) {
          const p = easeInOut((u - 0.5) / 0.25);
          wx = 459; wy = 352;
          jawOpen = lerp(11, 5, p);
        } else {
          const p = easeInOut((u - 0.75) / 0.25);
          wx = 459; wy = lerp(352, 320, p);
          jawOpen = 5; holding = true; cRot = -6;
        }
        calloutTag = 'BASE VLA ONLY · COARSE GRASP';
        calloutMsg = 'No Pickup RL — connector grasped with slight tilt.';
        calloutColor = COLORS.vla;
      } else if (t < 7.6) {
        const u = (t - 5.1) / 2.5;
        const p = easeInOut(u);
        holding = true; jawOpen = 5; cRot = -6;
        wx = lerp(459, 642, p);
        wy = 320 - Math.sin(p * Math.PI) * 26 - p * 12;
        calloutTag = 'BASE VLA ONLY · TRANSIT';
        calloutMsg = 'Long open-loop chunk carries connector toward port.';
        calloutColor = COLORS.vla;
      } else {
        const u = (t - 7.6) / (DURATION - 7.6);
        holding = true; jawOpen = 5; cRot = -7;
        owner = 'fail';
        const bump = Math.sin(u * 18) * 5;
        wx = 670 + Math.max(0, bump);
        wy = 304 + Math.cos(u * 14) * 2.5;
        failOpacity = 0.65 + 0.35 * Math.abs(Math.sin(u * 12));
        calloutTag = 'BASE VLA ONLY · PRECISION FAILURE ✕';
        calloutMsg = 'Misses 1 mm clearance & stalls — only 8.6% (3/35).';
        calloutColor = COLORS.fail;
      }
    }

    if (holding) {
      cx = wx + 4;
      cy = wy + 24;
    }

    // Solve 2-link IK & update arm SVG
    const ik = solveIK(wx, wy);
    el.link1.setAttribute('x2', ik.ex.toFixed(1));
    el.link1.setAttribute('y2', ik.ey.toFixed(1));
    el.link1In.setAttribute('x2', ik.ex.toFixed(1));
    el.link1In.setAttribute('y2', ik.ey.toFixed(1));

    el.link2.setAttribute('x1', ik.ex.toFixed(1));
    el.link2.setAttribute('y1', ik.ey.toFixed(1));
    el.link2.setAttribute('x2', ik.wx.toFixed(1));
    el.link2.setAttribute('y2', ik.wy.toFixed(1));
    el.link2In.setAttribute('x1', ik.ex.toFixed(1));
    el.link2In.setAttribute('y1', ik.ey.toFixed(1));
    el.link2In.setAttribute('x2', ik.wx.toFixed(1));
    el.link2In.setAttribute('y2', ik.wy.toFixed(1));

    el.elbow.setAttribute('cx', ik.ex.toFixed(1));
    el.elbow.setAttribute('cy', ik.ey.toFixed(1));
    el.elbowDot.setAttribute('cx', ik.ex.toFixed(1));
    el.elbowDot.setAttribute('cy', ik.ey.toFixed(1));
    el.aura.setAttribute('cx', ik.ex.toFixed(1));
    el.aura.setAttribute('cy', ik.ey.toFixed(1));

    const auraColor = owner === 'pickup' ? COLORS.pickup
      : owner === 'insert' ? COLORS.insert
      : owner === 'fail' ? COLORS.fail
      : COLORS.vla;
    el.aura.setAttribute('stroke', auraColor);
    el.wristLed.setAttribute('fill', auraColor);

    el.gripper.setAttribute('transform', `translate(${ik.wx.toFixed(1)}, ${ik.wy.toFixed(1)})`);
    el.fLeft.setAttribute('x', (-jawOpen - 3).toFixed(1));
    el.fRight.setAttribute('x', (jawOpen - 2).toFixed(1));

    // Update connector & flexible cable tail
    el.connector.setAttribute('transform', `translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${cRot})`);
    const tailEndX = cx - 18;
    const tailEndY = cy + 2;
    const midX = (320 + tailEndX) * 0.5;
    const midY = Math.min(386, Math.max(tailEndY + 26, 362));
    el.cable.setAttribute('d', `M 320 386 Q ${midX.toFixed(1)} ${midY.toFixed(1)}, ${tailEndX.toFixed(1)} ${tailEndY.toFixed(1)}`);

    // Highlight zones
    el.zonePickup.setAttribute('opacity', owner === 'pickup' ? '0.95' : '0.32');
    el.zoneInsert.setAttribute('opacity', (owner === 'insert' || owner === 'fail') ? '0.95' : '0.32');

    // Update HUD nodes, GRU meter, Action Queue, Callout
    setNodeHighlight(owner === 'fail' ? 'vla' : owner);
    el.gruBar.setAttribute('width', String(Math.round(gruLevel * 164)));
    el.gruBar.setAttribute('fill', mode === 'base' ? '#cbd5e1' : (flushing ? COLORS.amber : auraColor));
    el.gruSub.textContent = gruText;
    const pulseR = flushing ? 19 + Math.sin(t * 28) * 4 : 15 + Math.sin(t * 5) * 1.5;
    el.gruPulse.setAttribute('r', pulseR.toFixed(1));
    el.gruPulse.setAttribute('opacity', mode === 'base' ? '0.06' : (flushing ? '0.52' : '0.22'));

    updateQueue(owner, flushing, Math.floor(t * 3.2));

    el.portSuccess.setAttribute('opacity', successOpacity.toFixed(2));
    el.portFail.setAttribute('opacity', failOpacity.toFixed(2));

    el.callout.setAttribute('transform', `translate(${calloutX}, 132)`);
    el.calloutBg.setAttribute('stroke', calloutColor);
    el.calloutTag.textContent = calloutTag;
    el.calloutTag.setAttribute('fill', calloutColor);
    el.calloutMsg.textContent = calloutMsg;
  }

  function tick(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.1);
    lastTs = ts;
    if (playing) {
      elapsed = (elapsed + dt) % DURATION;
    }
    renderFrame(elapsed);
    requestAnimationFrame(tick);
  }

  // Controls
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      modeBtns.forEach(b => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      elapsed = 0;
      renderFrame(elapsed);
    });
  });

  stagePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const idx = Number(pill.dataset.stage);
      elapsed = STAGE_STARTS[idx] + 0.05;
      renderFrame(elapsed);
    });
  });

  if (el.playBtn) {
    el.playBtn.addEventListener('click', () => {
      playing = !playing;
      el.playBtn.textContent = playing ? 'Pause' : 'Play';
      el.playBtn.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
    });
  }
  if (el.replayBtn) {
    el.replayBtn.addEventListener('click', () => {
      elapsed = 0;
      playing = true;
      if (el.playBtn) el.playBtn.textContent = 'Pause';
      renderFrame(elapsed);
    });
  }

  renderFrame(0);
  requestAnimationFrame(tick);

  // Set default 2x playback rate on multi-view real-robot retry clips
  document.querySelectorAll('video[data-rate]').forEach(vid => {
    const rate = parseFloat(vid.dataset.rate);
    if (!isNaN(rate)) {
      vid.defaultPlaybackRate = rate;
      vid.playbackRate = rate;
    }
  });
})();
