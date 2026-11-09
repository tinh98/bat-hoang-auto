(() => {
  const TAG = '[BatHoangAuto]';
  const LOG = (...args) => console.log(TAG, ...args);
  const WARN = (...args) => console.warn(TAG, ...args);

  if (window.__baHoangAuto) {
    LOG('Script đã được nạp trước đó. Gõ auto(), autoCauCa(), autoLinhDien() hoặc autoBoss() để chạy.');
    if (typeof window.showAuto === 'function') window.showAuto();
    return;
  }
  if (window.__diTichAuto) {
    try {
      if (window.__diTichAuto.stop) window.__diTichAuto.stop('nâng cấp giao diện');
    } catch (_) {}
    const oldPanel = document.getElementById('di-tich-auto-panel');
    if (oldPanel) oldPanel.remove();
  }

  const AUTH_KEY = 'bat-hoang-auth';
  const DIRECTIONS = [
    { key: 'trai', label: 'Trái', re: /^(?:←|⇦|◀)\s*Trái$/i },
    { key: 'thang', label: 'Thẳng', re: /^(?:↑|⇧|▲)\s*Thẳng$/i },
    { key: 'phai', label: 'Phải', re: /^(?:→|⇨|▶)\s*Phải$/i },
  ];
  const DIR_KEYS = DIRECTIONS.map((item) => item.key);

  const state = {
    key: 'diTich',
    running: false,
    loopId: 0,
    mode: 'auto',
    delay: 150,
    domDelay: 700,
    maxRuns: Infinity,
    runs: 0,
    actions: 0,
    lastDir: null,
    status: null,
    token: null,
    busyUntil: 0,
    lastStatusAt: 0,
  };

  const fish = {
    key: 'fish',
    running: false,
    loopId: 0,
    delay: 350,
    buyQty: 5,
    buys: 0,
    fishes: 0,
    luot: null,
    moi: null,
    caThan: null,
  };

  const farm = {
    key: 'farm',
    running: false,
    loopId: 0,
    delay: 450,
    checkInterval: 30000,
    seedItemId: null,
    harvested: 0,
    watered: 0,
    planted: 0,
  };

  const boss = {
    key: 'boss',
    running: false,
    loopId: 0,
    delay: 600,
    attacks: 0,
  };

  const features = {
    diTich: { label: 'Di Tích', icon: '⚔️', state },
    fish: { label: 'Câu Cá', icon: '🎣', state: fish },
    farm: { label: 'Linh Điền', icon: '🌾', state: farm },
    boss: { label: 'Boss Thế Giới', icon: '👹', state: boss },
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const runningOf = (fs, id) => fs.running && fs.loopId === id;
  const isRunning = (id) => runningOf(state, id);
  const num = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const numField = (value, fallback) => {
    const parsed = num(value);
    return parsed === null ? fallback : parsed;
  };
  const firstNum = (...values) => {
    for (const value of values) {
      const parsed = num(value);
      if (parsed !== null) return parsed;
    }
    return null;
  };
  const labelOf = (key) => {
    const found = DIRECTIONS.find((item) => item.key === key);
    return found ? found.label : key;
  };

  const norm = (value) =>
    String(value || '')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };

  const root = () => document.querySelector('main') || document.body;
  const buttons = () => Array.from(root().querySelectorAll('button')).filter(visible);
  const buttonText = (button) => norm(button.innerText || button.textContent);
  const findButton = (re, extra) =>
    buttons().find((button) => !button.disabled && re.test(buttonText(button)) && (!extra || extra(button)));
  const pageText = () => norm(root().innerText || root().textContent || '');

  const ui = { panel: null };
  const toneColors = {
    info: '#9ca3af',
    running: '#93c5fd',
    ok: '#4ade80',
    warn: '#fbbf24',
    error: '#f87171',
    wait: '#a78bfa',
  };

  const setFeatureStatus = (key, message, tone) => {
    if (!ui.panel) return;
    const line = ui.panel.querySelector('[data-status="' + key + '"]');
    if (!line) return;
    line.textContent = message || '';
    line.style.color = toneColors[tone] || toneColors.info;
  };

  const setFeatureButton = (key, running) => {
    if (!ui.panel) return;
    const button = ui.panel.querySelector('[data-run="' + key + '"]');
    if (!button) return;
    button.textContent = running ? 'Dừng' : 'Chạy';
    button.style.background = running ? '#dc2626' : '#16a34a';
  };

  const updateOverlay = (message, tone) => setFeatureStatus('diTich', message, tone);

  const featureRow = (key) => {
    const item = features[key];
    return (
      '<div style="margin-top:6px;padding:8px;border:1px solid #1f2937;border-radius:10px;background:#0b1220">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<span style="font-weight:700;color:#f3f4f6">' +
      item.icon +
      ' ' +
      item.label +
      '</span>' +
      '<button data-run="' +
      key +
      '" style="padding:4px 10px;border:0;border-radius:7px;background:#16a34a;color:#fff;cursor:pointer;font-weight:700">Chạy</button>' +
      '</div>' +
      '<div data-status="' +
      key +
      '" style="margin-top:3px;min-height:16px;font-size:11px;color:#9ca3af">Sẵn sàng</div>' +
      '</div>'
    );
  };

  const ensureOverlay = () => {
    if (ui.panel && ui.panel.isConnected) {
      ui.panel.style.display = 'block';
      return;
    }
    const panel = document.createElement('div');
    panel.id = 'ba-hoang-auto-panel';
    panel.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:14px',
      'z-index:2147483647',
      'width:330px',
      'max-height:calc(100vh - 28px)',
      'overflow:auto',
      'padding:10px 12px',
      'border:1px solid #374151',
      'border-radius:12px',
      'background:#111827',
      'color:#e5e7eb',
      'box-shadow:0 8px 28px rgba(0,0,0,.45)',
      'font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif',
    ].join(';');
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;justify-content:space-between">' +
      '<div style="font-weight:800;font-size:13px;letter-spacing:.02em">⚡ Auto Bát Hoang</div>' +
      '<div style="display:flex;gap:6px">' +
      '<button data-stop-all style="padding:4px 8px;border:0;border-radius:7px;background:#7f1d1d;color:#fecaca;cursor:pointer;font-weight:700">Dừng tất cả</button>' +
      '<button data-hide style="padding:4px 8px;border:0;border-radius:7px;background:#374151;color:#e5e7eb;cursor:pointer">Ẩn</button>' +
      '</div>' +
      '</div>' +
      featureRow('diTich') +
      featureRow('fish') +
      featureRow('farm') +
      featureRow('boss') +
      '<button data-start-all style="width:100%;margin-top:8px;padding:7px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;font-weight:700">Chạy tất cả</button>' +
      '<div style="margin-top:8px;font-size:10px;color:#6b7280;line-height:1.5">auto() · autoCauCa() · autoLinhDien() · autoBoss() · showAuto()</div>';
    panel.querySelector('[data-stop-all]').addEventListener('click', () => stopAll('Người dùng bấm Dừng tất cả'));
    panel.querySelector('[data-start-all]').addEventListener('click', () => startAll());
    panel.querySelector('[data-hide]').addEventListener('click', () => {
      panel.style.display = 'none';
    });
    panel.querySelectorAll('[data-run]').forEach((button) => {
      button.addEventListener('click', () => toggleFeature(button.getAttribute('data-run')));
    });
    document.body.appendChild(panel);
    ui.panel = panel;
  };

  const showPanel = () => {
    ensureOverlay();
    if (ui.panel) ui.panel.style.display = 'block';
  };

  const readToken = () => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const stored = JSON.parse(raw);
      return (
        (stored && stored.state && stored.state.accessToken) ||
        (stored && stored.access_token) ||
        (stored && stored.accessToken) ||
        null
      );
    } catch (_) {
      return null;
    }
  };

  let refreshPromise = null;
  const refreshToken = async () => {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const response = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!response.ok) return null;
        const data = await response.json();
        const token = (data && (data.access_token || data.accessToken)) || null;
        if (token) state.token = token;
        return token;
      } catch (_) {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  };

  class ApiError extends Error {
    constructor(status, message, data) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  }

  const apiRequest = async (path, options = {}) => {
    const opts = { ...options };
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers || {}),
    };
    let token = state.token || readToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    let response = await fetch(path, {
      ...opts,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 401) {
      await response.text().catch(() => '');
      const fresh = await refreshToken();
      if (!fresh) throw new ApiError(401, 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.');
      token = fresh;
      headers.Authorization = 'Bearer ' + fresh;
      response = await fetch(path, {
        ...opts,
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = null;
      }
    }
    if (!response.ok) {
      const detail = data && (data.detail ?? data.message ?? data.msg);
      let message;
      if (typeof detail === 'string') message = detail;
      else if (detail && typeof detail === 'object') message = detail.message || detail.msg || JSON.stringify(detail);
      else message = response.statusText || 'HTTP ' + response.status;
      throw new ApiError(response.status, message, data);
    }
    return data;
  };

  const apiGet = (path) => apiRequest(path, { method: 'GET' });
  const apiPost = (path, body) =>
    apiRequest(path, body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) });

  const waitRunning = async (fs, id, ms, label) => {
    const end = Date.now() + Math.max(0, ms);
    let last = -1;
    while (runningOf(fs, id) && Date.now() < end) {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (label && left !== last) {
        setFeatureStatus(fs.key, label + (left > 0 ? ' · ' + left + 's' : ''), 'wait');
        last = left;
      }
      await sleep(Math.min(1000, Math.max(100, end - Date.now())));
    }
  };

  const handleLoopError = (fs, id, error, failures) => {
    if (error && error.status === 401) {
      stopFeature(fs.key, 'phiên đăng nhập hết hạn');
      return true;
    }
    const message = (error && error.message) || 'lỗi không xác định';
    if (error && error.status >= 400 && error.status < 500 && error.status !== 429) {
      stopFeature(fs.key, 'lỗi: ' + message);
      return true;
    }
    if (failures > 5) {
      stopFeature(fs.key, 'lỗi API: ' + message);
      return true;
    }
    return false;
  };

  const noResourceReason = (status) => {
    if (!status || typeof status !== 'object') return null;
    const charges = num(status.di_tich_charges);
    const stamina = num(status.the_luc ?? status.the_luc_remaining ?? status.stamina);
    if (charges !== null) {
      return charges <= 0 ? 'hết lượt Di Tích' : null;
    }
    if (stamina !== null && stamina <= 0) return 'hết thể lực';
    return null;
  };

  const hasSession = (status) => {
    if (!status) return false;
    if (typeof status.has_session === 'boolean') return status.has_session;
    if (status.session_mode === 'di_tich') return true;
    return status.mode === 'session';
  };

  const decideFromStatus = (status) => {
    if (!status) return 'status';
    if (hasSession(status)) {
      if (status.session_mode && status.session_mode !== 'di_tich') return 'stop-other';
      if (status.di_tich_current_combat) return 'fight';
      if (status.di_tich_can_choose) return 'choose';
      return 'wait';
    }
    const charges = num(status.di_tich_charges);
    if (charges !== null && charges <= 0) return 'stop-no-charges';
    if (status.session_mode && status.session_mode !== 'di_tich') return 'stop-other';
    return 'start';
  };

  const isDone = (response) => {
    if (!response || typeof response !== 'object') return null;
    if (typeof response.done === 'boolean') return response.done;
    if (typeof response.finished === 'boolean') return response.finished;
    return null;
  };

  const hasCombat = (response) => {
    if (!response || typeof response !== 'object') return false;
    if (response.combat_revealed) return true;
    if (response.kind === 'combat_revealed') return true;
    if (response.kind && /combat/i.test(String(response.kind))) return true;
    if (response.combat && typeof response.combat === 'object') return true;
    if (response.di_tich_current_combat) return true;
    if (response.current_combat) return true;
    if (response.last_choice && (response.last_choice.kind === 'combat_revealed' || response.last_choice.combat)) return true;
    return false;
  };

  const pickDirection = (previous) => {
    const filtered = DIR_KEYS.filter((key) => key !== previous);
    const pool = filtered.length ? filtered : DIR_KEYS;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const pickDomDirection = () => {
    let choices = [];
    for (const button of buttons()) {
      if (button.disabled) continue;
      const text = buttonText(button);
      const direction = DIRECTIONS.find((item) => item.re.test(text));
      if (direction) choices.push({ button, direction });
    }
    if (!choices.length) return null;
    if (state.lastDir) {
      const filtered = choices.filter((item) => item.direction.key !== state.lastDir);
      if (filtered.length) choices = filtered;
    }
    return choices[Math.floor(Math.random() * choices.length)];
  };

  const describeStatus = (status) => {
    if (!status || typeof status !== 'object') return 'Đang chạy...';
    const parts = [];
    const charges = num(status.di_tich_charges);
    const maxCharges = num(status.di_tich_max_charges);
    if (charges !== null) parts.push('Lượt ' + charges + (maxCharges !== null ? '/' + maxCharges : ''));
    const stage = num(status.di_tich_stage);
    const room = num(status.di_tich_room_no);
    if (stage !== null && room !== null) parts.push('GĐ ' + stage + ' P' + room);
    if (state.actions) parts.push(state.actions + ' req');
    return parts.join(' · ') || 'Đang chạy...';
  };

  const actionLabel = (action) => {
    if (action === 'start') return 'vào';
    if (action === 'choose') return 'chọn hướng';
    if (action === 'fight') return 'chiến đấu';
    return 'đồng bộ';
  };

  let statusFailures = 0;

  const apiLoop = async (id) => {
    let status = null;
    let localCharges = null;
    let runs = 0;
    let next = 'status';
    let actionFailures = 0;
    let waitTries = 0;
    statusFailures = 0;

    while (isRunning(id)) {
      try {
        if (next === 'status') {
          let response;
          try {
            response = await apiGet('/combat/status');
          } catch (error) {
            if (error && error.status === 401) {
              stopDiTich('phiên đăng nhập hết hạn');
              return;
            }
            statusFailures += 1;
            WARN('Không đọc được status:', error && error.message);
            if (statusFailures >= 3) {
              if (state.mode === 'auto') {
                updateOverlay('API lỗi, chuyển sang bấm nút...');
                LOG('Chuyển sang DOM mode.');
                await domLoop(id);
                return;
              }
              stopDiTich('không đọc được /combat/status: ' + (error && error.message));
              return;
            }
            updateOverlay('Không đọc được trạng thái, thử lại...');
            await sleep(Math.min(2000, 400 * statusFailures));
            continue;
          }
          status = response && typeof response === 'object' ? response : null;
          if (!status) {
            statusFailures += 1;
            if (statusFailures >= 3) {
              if (state.mode === 'auto') {
                updateOverlay('API lỗi, chuyển sang bấm nút...');
                LOG('Chuyển sang DOM mode.');
                await domLoop(id);
                return;
              }
              stopDiTich('status rỗng hoặc không hợp lệ');
              return;
            }
            updateOverlay('Trạng thái rỗng, thử lại...');
            await sleep(500);
            continue;
          }
          statusFailures = 0;
          state.status = status;
          localCharges = numField(status && status.di_tich_charges, localCharges);
          if (!hasSession(status)) {
            const reason = noResourceReason(status);
            if (reason) {
              stopDiTich(reason);
              return;
            }
          }
          const decision = decideFromStatus(status);
          if (decision === 'stop-other') {
            stopDiTich('đang ở chế độ khác, không phải Di Tích');
            return;
          }
          if (decision === 'stop-no-charges') {
            stopDiTich('hết lượt Di Tích');
            return;
          }
          if (decision === 'wait') {
            waitTries += 1;
            if (waitTries > 8) {
              stopDiTich('trạng thái Di Tích không xác định');
              return;
            }
            updateOverlay('Chờ trạng thái...');
            await sleep(500);
            continue;
          }
          waitTries = 0;
          next = decision;
          updateOverlay(describeStatus(status) + ' · ' + actionLabel(next));
          await sleep(state.delay);
          continue;
        }

        if (next === 'start') {
          if (localCharges !== null && localCharges <= 0) {
            stopDiTich('hết lượt Di Tích');
            return;
          }
          if (state.maxRuns !== Infinity && runs >= state.maxRuns) {
            stopDiTich('đã đủ số lượt chạy');
            return;
          }
          const response = await apiPost('/combat/start', { mode: 'di_tich' });
          runs += 1;
          state.runs = runs;
          state.lastDir = null;
          localCharges = numField(
            response && response.di_tich_charges,
            localCharges === null ? null : localCharges - 1,
          );
          updateOverlay('Bắt đầu lượt ' + runs + '...');
          next = 'status';
          actionFailures = 0;
          await sleep(state.delay);
          continue;
        }

        if (next === 'choose') {
          const direction = pickDirection(state.lastDir);
          state.lastDir = direction;
          const response = await apiPost('/combat/di-tich/choose', { direction });
          state.actions += 1;
          localCharges = numField(response && response.di_tich_charges, localCharges);
          const done = isDone(response);
          if (done === true) {
            if (localCharges === null) {
              updateOverlay('Đồng bộ lượt...');
              next = 'status';
            } else if (localCharges <= 0) {
              stopDiTich('hết lượt Di Tích');
              return;
            } else if (state.maxRuns !== Infinity && runs >= state.maxRuns) {
              stopDiTich('đã đủ số lượt chạy');
              return;
            } else {
              updateOverlay('Hết lượt ' + runs + ' · chuẩn bị lượt tiếp...');
              next = 'start';
            }
          } else if (done === null) {
            updateOverlay('Đồng bộ trạng thái...');
            next = 'status';
          } else if (hasCombat(response)) {
            updateOverlay('Gặp quái · chiến đấu...');
            next = 'fight';
          } else {
            updateOverlay('Đi ' + labelOf(direction) + ' · ' + describeStatus(status));
            next = 'choose';
          }
          actionFailures = 0;
          await sleep(state.delay);
          continue;
        }

        if (next === 'fight') {
          const response = await apiPost('/combat/fight');
          state.actions += 1;
          localCharges = numField(response && response.di_tich_charges, localCharges);
          const done = isDone(response);
          if (done === true) {
            if (localCharges === null) {
              updateOverlay('Đồng bộ lượt...');
              next = 'status';
            } else if (localCharges <= 0) {
              stopDiTich('hết lượt Di Tích');
              return;
            } else if (state.maxRuns !== Infinity && runs >= state.maxRuns) {
              stopDiTich('đã đủ số lượt chạy');
              return;
            } else {
              updateOverlay('Thắng trận · chuẩn bị lượt tiếp...');
              next = 'start';
            }
          } else if (done === null) {
            updateOverlay('Đồng bộ trạng thái...');
            next = 'status';
          } else {
            updateOverlay('Thắng · đi tiếp...');
            next = 'choose';
          }
          actionFailures = 0;
          await sleep(state.delay);
          continue;
        }

        next = 'status';
      } catch (error) {
        if (error && error.status === 401) {
          stopDiTich('phiên đăng nhập hết hạn');
          return;
        }
        actionFailures += 1;
        const statusCode = error && error.status;
        WARN('Lỗi action:', statusCode || '', error && error.message);
        if (actionFailures > 6) {
          stopDiTich('lỗi API' + (statusCode ? ' ' + statusCode : '') + ': ' + (error && error.message));
          return;
        }
        if (statusCode === 429 || statusCode >= 500 || !statusCode) {
          const wait = Math.min(3000, 500 * actionFailures);
          updateOverlay('Lỗi, thử lại sau ' + wait + 'ms...');
          next = 'status';
          await sleep(wait);
        } else {
          updateOverlay('Lỗi: ' + (error && error.message) + ' · đồng bộ...');
          next = 'status';
          await sleep(300);
        }
      }
    }
  };

  const clickButton = (button, label) => {
    if (!visible(button) || button.disabled) return false;
    state.busyUntil = Date.now() + 1000;
    try {
      button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    } catch (_) {}
    try {
      button.click();
    } catch (_) {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
    LOG('Bấm:', label);
    updateOverlay('Đã bấm: ' + label);
    return true;
  };

  const getStatus = async (force) => {
    const now = Date.now();
    if (!force && now - state.lastStatusAt < 2000) return state.status;
    state.lastStatusAt = now;
    try {
      const data = await apiGet('/combat/status');
      if (data && typeof data === 'object') state.status = data;
    } catch (_) {}
    return state.status;
  };

  const domStep = async () => {
    if (!state.running) return;
    if (Date.now() < state.busyUntil) return;
    try {
      const fight = findButton(/(?:^|\s)CHIẾN ĐẤU(?:\s|$)/, (button) => !/ĐANG CHIẾN/.test(buttonText(button)));
      if (fight) {
        clickButton(fight, 'CHIẾN ĐẤU');
        return;
      }

      const nextRun = findButton(/CHIẾN TIẾP/);
      if (nextRun) {
        const status = await getStatus(true);
        const reason = noResourceReason(status);
        if (reason) {
          stopDiTich(reason);
          return;
        }
        state.lastDir = null;
        clickButton(nextRun, 'CHIẾN TIẾP');
        return;
      }

      const direction = pickDomDirection();
      if (direction) {
        state.lastDir = direction.direction.key;
        clickButton(direction.button, 'Đi ' + direction.direction.label);
        return;
      }

      const entry = findButton(/Tiến Vào Di Tích/i);
      if (entry) {
        const status = await getStatus(true);
        const reason = noResourceReason(status);
        if (reason) {
          stopDiTich(reason);
          return;
        }
        state.lastDir = null;
        clickButton(entry, 'Tiến Vào Di Tích');
        return;
      }

      const back = findButton(/TRỞ LẠI BÍ CẢNH/i);
      if (back) {
        clickButton(back, 'TRỞ LẠI BÍ CẢNH');
        return;
      }

      const text = pageText();
      if (/Đang hồi lượt/i.test(text) && !/Tiến Vào Di Tích/i.test(text)) {
        stopDiTich('Đang hồi lượt, không còn lượt để vào Di Tích');
        return;
      }
      if (
        /Lịch Luyện Hoàn Thành|Lịch Luyện Thất Bại/i.test(text) &&
        /Kết Thúc/i.test(text) &&
        !/CHIẾN TIẾP/i.test(text)
      ) {
        stopDiTich('Đã kết thúc lịch luyện');
      }
    } catch (error) {
      WARN('Lỗi vòng lặp DOM:', error);
    }
  };

  const domLoop = async (id) => {
    updateOverlay('Chạy DOM · ' + state.domDelay + 'ms/ lượt...');
    while (isRunning(id)) {
      await domStep();
      if (!isRunning(id)) return;
      await sleep(state.domDelay);
    }
  };

  const fishLoop = async (id) => {
    const fs = fish;
    let failures = 0;
    let luot = null;
    let moi = null;
    let caThan = null;
    while (runningOf(fs, id)) {
      try {
        if (luot === null || moi === null) {
          const status = await apiGet('/cau-ca/status');
          if (!status || typeof status !== 'object') throw new Error('status câu cá rỗng');
          luot = firstNum(status.luot, status.luot_con_lai, status.turns, status.turns_left);
          moi = firstNum(status.moi, status.moi_cau, status.bait);
          caThan = firstNum(status.ca_than, caThan, 0);
          const cap = firstNum(status.luot_cap, status.turns_max);
          if (luot === null || moi === null) throw new Error('không đọc được lượt/mồi');
          fs.luot = luot;
          fs.moi = moi;
          fs.caThan = caThan;
          setFeatureStatus(
            'fish',
            'Lượt ' + luot + (cap !== null ? '/' + cap : '') + ' · Mồi ' + moi + ' · Cá Thần ' + caThan,
            'info',
          );
        }
        if (luot <= 0) {
          stopFeature('fish', 'hết lượt câu');
          return;
        }
        if (moi <= 0) {
          setFeatureStatus('fish', 'Đang mua mồi...', 'running');
          const bought = await apiPost('/cau-ca/mua-moi', { so_luong: fs.buyQty });
          fs.buys += 1;
          moi = numField(bought && firstNum(bought.moi_con_lai, bought.moi), moi + fs.buyQty);
          fs.moi = moi;
          setFeatureStatus('fish', 'Đã mua mồi · còn ' + moi, 'ok');
          failures = 0;
          await sleep(fs.delay);
          continue;
        }
        setFeatureStatus('fish', 'Đang câu... · Lượt ' + luot + ' · Mồi ' + moi, 'running');
        const caught = await apiPost('/cau-ca/cau');
        fs.fishes += 1;
        luot = numField(caught && firstNum(caught.luot_con_lai, caught.luot), Math.max(0, luot - 1));
        moi = numField(caught && firstNum(caught.moi_con_lai, caught.moi), Math.max(0, moi - 1));
        caThan = numField(caught && firstNum(caught.ca_than, caught.ca_than_con_lai), caThan);
        fs.luot = luot;
        fs.moi = moi;
        fs.caThan = caThan;
        const result =
          !caught || caught.tier === 'trang'
            ? 'Không câu được gì'
            : caught.ten
              ? 'Câu được ' + caught.ten
              : 'Đã câu';
        setFeatureStatus('fish', result + ' · Lượt ' + luot + ' · Mồi ' + moi, 'ok');
        failures = 0;
        if (luot <= 0) {
          stopFeature('fish', 'hết lượt câu');
          return;
        }
        await sleep(fs.delay);
      } catch (error) {
        failures += 1;
        if (handleLoopError(fs, id, error, failures)) return;
        setFeatureStatus('fish', 'Lỗi: ' + (error && error.message) + ' · thử lại...', 'error');
        await waitRunning(fs, id, Math.min(5000, 800 * failures), 'Thử lại sau');
        luot = null;
        moi = null;
      }
    }
  };

  const farmLoop = async (id) => {
    const fs = farm;
    let failures = 0;
    while (runningOf(fs, id)) {
      try {
        const status = await apiGet('/linh-dien');
        if (!status || typeof status !== 'object') throw new Error('status Linh Điền rỗng');
        const plots = Array.isArray(status.plots) ? status.plots : [];
        const unlocked = plots.filter((plot) => plot && !plot.locked);
        if (!unlocked.length) {
          stopFeature('farm', 'chưa có ô đất nào được mở');
          return;
        }
        const empty = unlocked.filter((plot) => !plot.seed_item_id);
        const ripe = unlocked.filter((plot) => plot.seed_item_id && plot.is_ripe);
        const needWater = unlocked.filter((plot) => plot.seed_item_id && plot.can_water);
        const growing = unlocked.filter((plot) => plot.seed_item_id && !plot.is_ripe);
        const seeds = (Array.isArray(status.seed_inventory) ? status.seed_inventory : []).filter(
          (seed) => numField(seed.qty, 0) > 0,
        );
        const totalSeeds = seeds.reduce((sum, seed) => sum + numField(seed.qty, 0), 0);
        let selectedSeed = null;
        if (fs.seedItemId !== null && fs.seedItemId !== undefined) {
          selectedSeed = seeds.find((seed) => String(seed.item_id) === String(fs.seedItemId)) || null;
        }
        if (!selectedSeed) {
          selectedSeed = seeds.slice().sort((a, b) => numField(b.qty, 0) - numField(a.qty, 0))[0] || null;
        }
        const slots = numField(status.slots_unlocked, unlocked.length);
        setFeatureStatus(
          'farm',
          'Ô ' + slots + '/' + plots.length + ' · Chín ' + ripe.length + ' · Tưới ' + needWater.length + ' · Trống ' + empty.length + ' · Hạt ' + totalSeeds,
          'info',
        );
        if (ripe.length) {
          setFeatureStatus('farm', 'Đang thu hoạch ' + ripe.length + ' cây...', 'running');
          await apiPost('/linh-dien/thu-hoach-tat-ca');
          fs.harvested += ripe.length;
          failures = 0;
          await sleep(fs.delay);
          continue;
        }
        if (needWater.length) {
          setFeatureStatus('farm', 'Đang tưới ' + needWater.length + ' cây...', 'running');
          await apiPost('/linh-dien/tuoi');
          fs.watered += needWater.length;
          failures = 0;
          await sleep(fs.delay);
          continue;
        }
        if (empty.length && selectedSeed) {
          setFeatureStatus('farm', 'Đang trồng ' + empty.length + ' ô...', 'running');
          await apiPost('/linh-dien/trong-tat-ca', { seed_item_id: selectedSeed.item_id });
          fs.planted += empty.length;
          failures = 0;
          await sleep(fs.delay);
          continue;
        }
        if (!empty.length && growing.length) {
          const readyTimes = growing
            .map((plot) => num(plot.ready_at))
            .filter((value) => value !== null)
            .sort((a, b) => a - b);
          let waitMs = fs.checkInterval;
          if (readyTimes.length) {
            waitMs = Math.min(waitMs, Math.max(1000, readyTimes[0] * 1000 - Date.now()));
          }
          setFeatureStatus('farm', 'Chờ ' + growing.length + ' cây chín...', 'wait');
          await waitRunning(fs, id, Math.max(1000, waitMs), 'Chờ cây chín');
          continue;
        }
        if (empty.length && !selectedSeed) {
          if (!growing.length) {
            stopFeature('farm', 'hết hạt giống');
            return;
          }
          setFeatureStatus('farm', 'Hết hạt giống · chờ cây hiện tại chín...', 'warn');
          await waitRunning(fs, id, fs.checkInterval, 'Hết hạt giống · chờ');
          continue;
        }
        setFeatureStatus('farm', 'Không có việc cần làm · chờ kiểm tra...', 'warn');
        await waitRunning(fs, id, fs.checkInterval, 'Chờ kiểm tra');
      } catch (error) {
        failures += 1;
        if (handleLoopError(fs, id, error, failures)) return;
        setFeatureStatus('farm', 'Lỗi: ' + (error && error.message) + ' · thử lại...', 'error');
        await waitRunning(fs, id, Math.min(5000, 800 * failures), 'Thử lại sau');
      }
    }
  };

  const bossLoop = async (id) => {
    const fs = boss;
    let failures = 0;
    while (runningOf(fs, id)) {
      try {
        const status = await apiGet('/world-boss/status');
        const bossStatus = status && status.status;
        if (bossStatus !== 'active') {
          stopFeature('boss', bossStatus === 'dead' ? 'Boss đã bị hạ' : 'Boss không hoạt động');
          return;
        }
        const mine = await apiGet('/world-boss/my-status');
        const used = numField(mine && mine.attempts_used, 0);
        const max = numField(mine && mine.attempts_max, 10);
        const cooldown = numField(mine && mine.cooldown_remaining, 0);
        const hpPct = num(status.hp_pct);
        const hpText = hpPct === null ? '?' : hpPct + '%';
        const statusText =
          'HP ' + hpText + ' · Lượt ' + used + '/' + max + (cooldown > 0 ? ' · Hồi ' + Math.ceil(cooldown) + 's' : '');
        setFeatureStatus('boss', statusText, 'info');
        if (used >= max) {
          stopFeature('boss', 'hết lượt khiêu chiến');
          return;
        }
        if (cooldown > 0) {
          await waitRunning(fs, id, Math.ceil(cooldown * 1000), 'Chờ hồi chiêu');
          continue;
        }
        setFeatureStatus('boss', 'Đang khiêu chiến...', 'running');
        const result = await apiPost('/world-boss/attack');
        fs.attacks += 1;
        failures = 0;
        if (result && result.notice) {
          const notice = String(result.notice);
          if (/hết|lượt|hồi|chờ|cooldown|chưa/i.test(notice)) {
            setFeatureStatus('boss', notice, 'warn');
            await sleep(fs.delay);
            continue;
          }
          stopFeature('boss', notice);
          return;
        }
        const afterUsed = numField(result && result.attempts_used, used + 1);
        const afterMax = numField(result && result.attempts_max, max);
        const damage = num(result && result.damage);
        const resultText = result && result.killed
          ? 'Boss bị hạ'
          : 'Sát thương ' + (damage === null ? '?' : damage.toLocaleString());
        setFeatureStatus('boss', resultText + ' · Lượt ' + afterUsed + '/' + afterMax, result && result.killed ? 'ok' : 'running');
        if (result && result.killed) {
          stopFeature('boss', 'Boss đã bị tiêu diệt');
          return;
        }
        await sleep(fs.delay);
      } catch (error) {
        failures += 1;
        if (handleLoopError(fs, id, error, failures)) return;
        setFeatureStatus('boss', 'Lỗi: ' + (error && error.message) + ' · thử lại...', 'error');
        await waitRunning(fs, id, Math.min(5000, 800 * failures), 'Thử lại sau');
      }
    }
  };

  const launch = (fs, loop, message, options) => {
    if (fs.running) {
      LOG(features[fs.key].label + ' đang chạy. Bấm Dừng hoặc gõ stopAll() để dừng.');
      showPanel();
      return;
    }
    fs.running = true;
    fs.loopId += 1;
    if (options && options.delay !== undefined) fs.delay = Math.max(0, Math.min(5000, Number(options.delay) || 0));
    if (fs.key === 'fish' && options && options.buyQty !== undefined) {
      fs.buyQty = Math.max(1, Math.min(100, Math.floor(Number(options.buyQty) || 5)));
    }
    if (fs.key === 'farm') {
      if (options && options.checkInterval !== undefined) {
        fs.checkInterval = Math.max(1000, Math.min(600000, Number(options.checkInterval) || 30000));
      }
      if (options && options.seedItemId !== undefined) fs.seedItemId = options.seedItemId;
    }
    const id = fs.loopId;
    ensureOverlay();
    setFeatureButton(fs.key, true);
    setFeatureStatus(fs.key, message, 'running');
    LOG('Bắt đầu ' + features[fs.key].label + '. Gõ stopAll() để dừng.');
    loop(id).catch((error) => {
      WARN('Lỗi loop ' + features[fs.key].label + ':', error);
      if (runningOf(fs, id)) stopFeature(fs.key, 'lỗi: ' + (error && error.message));
    });
  };

  function startAuto(opts) {
    if (state.running) {
      LOG('Di Tích đang chạy rồi. Gõ stopDiTich() hoặc stopAll() để dừng.');
      showPanel();
      return;
    }
    let delay = state.delay;
    let mode = state.mode;
    let maxRuns = state.maxRuns;
    if (typeof opts === 'number') {
      delay = opts;
    } else if (opts && typeof opts === 'object') {
      if (opts.delay !== undefined) delay = opts.delay;
      if (opts.mode !== undefined) mode = opts.mode;
      if (opts.maxRuns !== undefined) maxRuns = opts.maxRuns;
    }
    state.delay = Math.max(0, Math.min(5000, Number(delay) || 0));
    state.mode = mode === 'dom' ? 'dom' : mode === 'api' ? 'api' : 'auto';
    state.maxRuns =
      maxRuns !== undefined && Number.isFinite(Number(maxRuns)) && Number(maxRuns) > 0
        ? Math.floor(Number(maxRuns))
        : Infinity;
    state.running = true;
    state.loopId += 1;
    state.runs = 0;
    state.actions = 0;
    state.lastDir = null;
    state.status = null;
    state.lastStatusAt = 0;
    state.busyUntil = 0;
    state.token = readToken();
    const id = state.loopId;
    ensureOverlay();
    setFeatureButton('diTich', true);
    updateOverlay((state.mode === 'dom' ? 'Chạy DOM' : 'Chạy API') + ' · ' + state.delay + 'ms', 'running');
    LOG('Bắt đầu Di Tích. mode=' + state.mode + ', delay=' + state.delay + 'ms. Gõ stopAll() để dừng.');
    const loop = state.mode === 'dom' ? domLoop : apiLoop;
    loop(id).catch((error) => {
      WARN('Lỗi loop:', error);
      if (isRunning(id)) stopDiTich('lỗi: ' + (error && error.message));
    });
  }

  function startCauCa(opts) {
    if (fish.running) {
      showPanel();
      return;
    }
    const options = typeof opts === 'number' ? { delay: opts } : opts && typeof opts === 'object' ? opts : {};
    launch(fish, fishLoop, 'Đang kiểm tra lượt và mồi...', options);
  }

  function startLinhDien(opts) {
    if (farm.running) {
      showPanel();
      return;
    }
    const options = typeof opts === 'number' ? { delay: opts } : opts && typeof opts === 'object' ? opts : {};
    launch(farm, farmLoop, 'Đang kiểm tra Linh Điền...', options);
  }

  function startBoss(opts) {
    if (boss.running) {
      showPanel();
      return;
    }
    const options = typeof opts === 'number' ? { delay: opts } : opts && typeof opts === 'object' ? opts : {};
    launch(boss, bossLoop, 'Đang kiểm tra Boss Thế Giới...', options);
  }

  function startAll() {
    startAuto();
    startCauCa();
    startLinhDien();
    startBoss();
  }

  function stopFeature(key, reason) {
    const item = features[key];
    if (!item) return;
    const fs = item.state;
    const wasRunning = fs.running;
    fs.running = false;
    fs.loopId += 1;
    if (reason) LOG(item.label + ' dừng:', reason);
    setFeatureButton(key, false);
    if (wasRunning || reason) {
      setFeatureStatus(key, 'Đã dừng: ' + (reason || 'theo yêu cầu'), reason ? 'warn' : 'info');
    }
  }

  function stopDiTich(reason) {
    stopFeature('diTich', reason);
  }

  function stopAll(reason) {
    Object.keys(features).forEach((key) => stopFeature(key, undefined));
    if (reason) {
      LOG('Dừng tất cả:', reason);
      Object.keys(features).forEach((key) => {
        if (features[key].state) setFeatureStatus(key, 'Đã dừng: ' + reason, 'warn');
      });
    }
  }

  function toggleFeature(key) {
    const item = features[key];
    if (!item) return;
    if (item.state.running) {
      stopFeature(key, 'Người dùng bấm Dừng');
      return;
    }
    if (key === 'diTich') startAuto();
    else if (key === 'fish') startCauCa();
    else if (key === 'farm') startLinhDien();
    else if (key === 'boss') startBoss();
  }

  window.auto = startAuto;
  window.autoDiTich = startAuto;
  window.autoCauCa = startCauCa;
  window.autoFish = startCauCa;
  window.autoLinhDien = startLinhDien;
  window.autoFarm = startLinhDien;
  window.autoBoss = startBoss;
  window.autoBossTheGioi = startBoss;
  window.autoWorldBoss = startBoss;
  window.autoAll = startAll;
  window.stopAuto = stopAll;
  window.stopAll = stopAll;
  window.stopDiTich = stopDiTich;
  window.showAuto = showPanel;
  window.__diTichAuto = {
    start: startAuto,
    stop: stopDiTich,
    api: apiRequest,
    get config() {
      return {
        running: state.running,
        mode: state.mode,
        delay: state.delay,
        maxRuns: state.maxRuns,
        runs: state.runs,
        actions: state.actions,
        lastDir: state.lastDir,
      };
    },
  };
  window.__baHoangAuto = {
    start: startAuto,
    startCauCa,
    startLinhDien,
    startBoss,
    startAll,
    stop: stopAll,
    stopFeature,
    api: apiRequest,
    show: showPanel,
    get config() {
      return {
        diTich: { running: state.running, delay: state.delay, runs: state.runs, actions: state.actions },
        fish: { running: fish.running, delay: fish.delay, buys: fish.buys, fishes: fish.fishes, luot: fish.luot, moi: fish.moi },
        farm: { running: farm.running, delay: farm.delay, harvested: farm.harvested, watered: farm.watered, planted: farm.planted },
        boss: { running: boss.running, delay: boss.delay, attacks: boss.attacks },
      };
    },
  };

  ensureOverlay();
  LOG('Đã nạp. auto() Di Tích · autoCauCa() Câu Cá · autoLinhDien() Linh Điền · autoBoss() Boss Thế Giới · stopAll() dừng tất cả.');
})();
