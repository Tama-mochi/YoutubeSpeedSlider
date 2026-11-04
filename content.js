(() => {
  'use strict';

  if (window.__youtubeSpeedSliderActive) return;
  window.__youtubeSpeedSliderActive = true;

  const UI_ID = 'custom-speed-slider-container';
  const STRUCTURE = '#movie_player, video, .ytp-chrome-controls';
  const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', 'PageUp', 'PageDown']);
  let player = null;
  let video = null;
  let controls = null;
  let ui = null;
  let uiEvents = null;
  let videoEvents = null;
  let pageEvents = null;
  let refreshFrame = null;
  let inputFrame = null;
  let pendingSpeed = null;
  let pointerId = null;
  let keyboardActive = false;
  let dirty = false;
  let speed = 1;
  let speedRevision = 0;
  let storageStarted = false;
  let storageReady = false;
  let persistedSpeed = null;
  let saveRequested = false;
  let saving = false;
  let running = false;
  let topologyAnchor = null;
  let restorePending = false;
  let observedStructure = [];
  let observedDiscovery = null;

  function validSpeed(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0.1 && value <= 5;
  }

  function supportedPage() {
    return location.pathname === '/watch' || /^\/(live|embed)\/[^/]+/.test(location.pathname);
  }

  function interacting() {
    return pointerId !== null || keyboardActive || pendingSpeed !== null;
  }

  // Identical values do not cause DOM mutations.
  function updateUI(value) {
    if (!ui) return;
    const text = `${value.toFixed(2)}x`;
    if (Number(ui.slider.value) !== value) ui.slider.value = String(value);
    if (ui.label.textContent !== text) ui.label.textContent = text;
    const percent = `${((value - 0.1) / 4.9) * 100}%`;
    if (ui.slider.style.getPropertyValue('--value-percent') !== percent) {
      ui.slider.style.setProperty('--value-percent', percent);
    }
    if (ui.slider.getAttribute('aria-valuetext') !== text) {
      ui.slider.setAttribute('aria-valuetext', text);
    }
  }

  function applySpeed() {
    if (!running || !supportedPage() || !ui?.container.isConnected || !video?.isConnected) return;
    if (video.playbackRate !== speed) video.playbackRate = speed;
  }

  // Serialize writes so an older request cannot overwrite a newer committed value.
  function saveSpeed() {
    if (!storageReady || !saveRequested || saving) return;
    if (persistedSpeed === speed) {
      saveRequested = false;
      return;
    }
    const value = speed;
    saveRequested = false;
    saving = true;
    chrome.storage.local.set({ youtubeSpeed: value }, () => {
      const error = chrome.runtime.lastError;
      saving = false;
      if (!error) persistedSpeed = value;
      if (saveRequested) saveSpeed();
    });
  }

  function loadSpeed() {
    if (storageStarted) return;
    storageStarted = true;
    const revision = speedRevision;
    chrome.storage.local.get(['youtubeSpeed'], (result) => {
      const error = chrome.runtime.lastError;
      storageReady = true;
      persistedSpeed = !error && validSpeed(result?.youtubeSpeed) ? result.youtubeSpeed : null;
      // Input/ratechange since the request always wins over the stored value.
      if (revision === speedRevision) speed = persistedSpeed ?? 1;
      restorePending = interacting();
      if (running && supportedPage() && !interacting()) {
        applySpeed();
        updateUI(speed);
      }
      saveSpeed();
    });
  }

  function cancelInput() {
    if (inputFrame !== null) cancelAnimationFrame(inputFrame);
    inputFrame = null;
  }

  function flushInput() {
    cancelInput();
    if (pendingSpeed === null) return;
    speed = pendingSpeed;
    pendingSpeed = null;
    applySpeed();
    updateUI(speed);
  }

  function finishInteraction() {
    flushInput();
    pointerId = null;
    keyboardActive = false;
    if (restorePending) {
      restorePending = false;
      applySpeed();
    }
    if (dirty) {
      dirty = false;
      applySpeed();
      saveRequested = true;
      saveSpeed();
    } else if (storageReady) {
      onRateChange();
    }
    updateUI(speed);
  }

  function onInput() {
    const value = Number(ui.slider.value);
    if (!validSpeed(value)) return;
    pendingSpeed = value;
    speedRevision += 1;
    dirty = true;
    if (inputFrame === null) inputFrame = requestAnimationFrame(flushInput);
  }

  function resetSpeed() {
    cancelInput();
    pendingSpeed = 1;
    speedRevision += 1;
    dirty = true;
    finishInteraction();
  }

  function onRateChange() {
    if (!ui || !video || video.readyState === 0 || interacting() || !validSpeed(video.playbackRate)) return;
    const value = video.playbackRate;
    if (value !== speed) {
      speed = value;
      speedRevision += 1;
      saveRequested = true;
      saveSpeed();
    }
    updateUI(value);
  }

  function onLoadedMetadata() {
    if (!storageReady || interacting()) return;
    applySpeed();
    updateUI(speed);
  }

  function bindVideo(next) {
    if (video === next) return false;
    videoEvents?.abort();
    videoEvents = null;
    video = next;
    if (video) {
      videoEvents = new AbortController();
      const options = { signal: videoEvents.signal };
      video.addEventListener('loadedmetadata', onLoadedMetadata, options);
      video.addEventListener('ratechange', onRateChange, options);
    }
    return true;
  }

  function removeUI() {
    if (!ui) return;
    finishInteraction();
    uiEvents.abort();
    uiEvents = null;
    ui.container.remove();
    ui = null;
  }

  function createUI() {
    const container = document.createElement('div');
    container.id = UI_ID;
    const slider = document.createElement('input');
    slider.id = 'custom-speed-slider';
    slider.type = 'range';
    slider.min = '0.1';
    slider.max = '5.0';
    slider.step = '0.05';
    slider.setAttribute('aria-label', 'Playback speed');
    const label = document.createElement('span');
    label.id = 'custom-speed-label';
    container.append(slider, label);
    ui = { container, slider, label };
    uiEvents = new AbortController();
    const options = { signal: uiEvents.signal };
    slider.addEventListener('pointerdown', (event) => {
      if (event.isPrimary && event.button === 0) pointerId = event.pointerId;
    }, options);
    slider.addEventListener('input', onInput, options);
    slider.addEventListener('change', () => {
      flushInput();
      if (pointerId === null && !keyboardActive) finishInteraction();
    }, options);
    slider.addEventListener('keydown', (event) => {
      if (!RANGE_KEYS.has(event.key)) return;
      keyboardActive = true;
      event.stopPropagation();
    }, options);
    slider.addEventListener('keyup', (event) => {
      if (!RANGE_KEYS.has(event.key)) return;
      event.stopPropagation();
      if (pointerId === null) finishInteraction();
      else keyboardActive = false;
    }, options);
    slider.addEventListener('blur', finishInteraction, options);
    slider.addEventListener('lostpointercapture', finishInteraction, options);
    const endPointer = (event) => {
      if (event.pointerId === pointerId) finishInteraction();
    };
    window.addEventListener('pointerup', endPointer, { ...options, capture: true });
    window.addEventListener('pointercancel', endPointer, { ...options, capture: true });
    window.addEventListener('blur', finishInteraction, options);
    slider.addEventListener('dblclick', resetSpeed, options);
    label.addEventListener('dblclick', resetSpeed, options);
    updateUI(speed);
    controls.insertBefore(container, controls.querySelector('.ytp-right-controls'));
  }

  function owns(node) {
    return node.nodeType === Node.ELEMENT_NODE &&
      (node.id === UI_ID || node.closest(`#${UI_ID}`));
  }

  function containsStructure(node) {
    return node.nodeType === Node.ELEMENT_NODE && !owns(node) &&
      (node.matches(STRUCTURE) || node.querySelector(STRUCTURE));
  }

  function onPlayerMutation(records) {
    for (const record of records) {
      if (owns(record.target)) {
        if (record.target === ui?.container && [...record.removedNodes].some((node) =>
          node === ui.slider || node === ui.label)) scheduleRefresh();
        continue;
      }
      // Search changed subtrees only; labels, menus, subtitles and progress are ignored.
      if ([...record.removedNodes].some((node) => node === ui?.container) ||
        [...record.addedNodes, ...record.removedNodes].some(containsStructure)) {
        scheduleRefresh();
        return;
      }
    }
  }

  const playerObserver = new MutationObserver(onPlayerMutation);
  const topologyObserver = new MutationObserver((records) => {
    if (!topologyAnchor?.isConnected || records.some((record) =>
      [...record.addedNodes, ...record.removedNodes].some((node) =>
        containsStructure(node) || (node.nodeType === Node.ELEMENT_NODE &&
          node.matches('ytd-app, ytd-page-manager, ytd-watch-flexy, ytd-watch-grid'))))) {
      scheduleRefresh();
    }
  });

  function observePlayer() {
    const targets = new Set();
    if (player) targets.add(player);
    for (const anchor of [video, controls, ui?.container]) {
      for (let node = anchor?.parentElement; node && player?.contains(node); node = node.parentElement) {
        targets.add(node);
      }
    }
    if (ui) targets.add(ui.container);
    const next = [...targets];
    const discovery = !video || !controls;
    if (discovery === observedDiscovery && next.length === observedStructure.length &&
      next.every((node, index) => node === observedStructure[index])) return;
    playerObserver.disconnect();
    observedStructure = next;
    observedDiscovery = discovery;
    if (!player) return;
    if (discovery) {
      // Only discovery needs descendants; normal playback watches direct child lists.
      playerObserver.observe(player, { childList: true, subtree: true });
    } else {
      for (const node of targets) playerObserver.observe(node, { childList: true });
    }
  }

  function observeTopology(anchor) {
    topologyObserver.disconnect();
    topologyAnchor = anchor;
    // Direct children of the ancestor chain detect replacement and fullscreen moves.
    for (let node = anchor?.parentElement; node; node = node.parentElement) {
      topologyObserver.observe(node, { childList: true });
    }
    if (!player && anchor) {
      topologyObserver.observe(anchor, { childList: true, subtree: true });
    }
  }

  function scheduleRefresh() {
    if (running && refreshFrame === null) {
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = null;
        refreshPlayer();
      });
    }
  }

  function refreshPlayer() {
    if (!supportedPage()) {
      detachPlayer();
      return;
    }
    loadSpeed();
    const nextPlayer = document.getElementById('movie_player');
    const nextControls = nextPlayer?.querySelector('.ytp-chrome-controls') ?? null;
    const nextVideo = nextPlayer?.querySelector('video') ?? null;
    const changedPlayer = player !== nextPlayer;
    const needsUI = nextControls && nextVideo &&
      (!ui || controls !== nextControls || ui.container.parentElement !== nextControls ||
        !ui.container.contains(ui.slider) || !ui.container.contains(ui.label));

    // Flush against the old video before changing references.
    if (changedPlayer || video !== nextVideo || controls !== nextControls || needsUI) finishInteraction();
    if (changedPlayer) {
      playerObserver.disconnect();
      observedStructure = [];
      observedDiscovery = null;
    }
    if (!nextControls || !nextVideo || needsUI) removeUI();
    player = nextPlayer;
    controls = nextControls;
    const changedVideo = bindVideo(nextVideo);
    if (needsUI) createUI();
    observePlayer();

    const anchor = player || document.querySelector('ytd-watch-flexy, ytd-watch-grid, ytd-page-manager, ytd-app') || document.body;
    if (anchor === document.body) {
      topologyObserver.disconnect();
      topologyAnchor = anchor;
      // Bootstrap direct children only until YouTube's application shell appears.
      topologyObserver.observe(document.body, { childList: true });
    } else {
      observeTopology(anchor);
    }
    if ((changedVideo || needsUI) && storageReady && !interacting()) {
      applySpeed();
      updateUI(speed);
    }
  }

  function detachPlayer() {
    playerObserver.disconnect();
    observedStructure = [];
    observedDiscovery = null;
    topologyObserver.disconnect();
    topologyAnchor = null;
    removeUI();
    bindVideo(null);
    player = null;
    controls = null;
  }

  function onMediaDiscovered(event) {
    if (supportedPage() && event.target.matches?.('#movie_player video') && event.target !== video) scheduleRefresh();
  }

  function start() {
    if (running) return;
    running = true;
    pageEvents = new AbortController();
    const options = { signal: pageEvents.signal };
    document.addEventListener('yt-navigate-finish', scheduleRefresh, options);
    document.addEventListener('yt-player-updated', scheduleRefresh, options);
    document.addEventListener('fullscreenchange', scheduleRefresh, options);
    document.addEventListener('loadedmetadata', onMediaDiscovered, { ...options, capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) finishInteraction();
    }, options);
    refreshPlayer();
  }

  function stop() {
    running = false;
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
    refreshFrame = null;
    detachPlayer();
    cancelInput();
    pageEvents?.abort();
    pageEvents = null;
  }

  // BFCache restores reuse the loaded value and rebuild active bindings.
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  start();
})();
