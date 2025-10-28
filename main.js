const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScp5bZudNWad73R9ayLiUPFaOHLKHvn9iFsS8Ui7MbeY9WkUA/formResponse';
const STORAGE_KEY = 'voted_booths';
const REQUIRED_ENTRIES = [
  'entry.283403021', // 味
  'entry.1777377100', // 接客
  'entry.1748112455', // 見た目
  'entry.1302631587', // 量
];
const ENTRY_LABELS = {
  'entry.283403021': '味',
  'entry.1777377100': '接客',
  'entry.1748112455': '見た目',
  'entry.1302631587': '量',
};
// Supabase REST API 接続設定（フロントエンドで利用する anon キー）
const SUPABASE_URL = 'https://afdfgsyjzlbehojbquyf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmZGZnc3lqemxiZWhvamJxdXlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY4NjU1MCwiZXhwIjoyMDc2MjYyNTUwfQ.eKOY-8z3-JJJi_4nvEdtX4Nq62CglVIwGb37p30Q2vU';
const SUPABASE_TABLE = 'yatai_votes';
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);

const gateSection = document.getElementById('booth-gate');
const gateInput = document.getElementById('gate-booth');
const gateButton = document.getElementById('gate-submit');
const gateError = document.getElementById('gate-error');
const gateBoothName = document.getElementById('gate-booth-name');

const form = document.getElementById('rating-form');
const formBoothInput = document.getElementById('form-booth');
const boothDisplay = document.getElementById('booth-display');
const boothNameDisplay = document.getElementById('booth-name-display');
const changeBoothButton = document.getElementById('change-booth');
const alertBox = document.getElementById('form-alert');
const submitButton = document.getElementById('submit-button');
const thanksSection = document.getElementById('thanks');
const evaluateAnotherButton = document.getElementById('evaluate-another');
const alreadyVotedSection = document.getElementById('already-voted');
const alreadyVotedNumber = document.getElementById('already-voted-number');
const alreadyChangeBoothButton = document.getElementById('already-change-booth');
const qrNotice = document.getElementById('qr-notice');
const openGateButton = document.getElementById('open-gate');
const launchQrScannerButton = document.getElementById('launch-qr-scanner');
const qrScannerPanel = document.getElementById('qr-scanner');
const qrVideoElement = document.getElementById('qr-video');
const qrStatusMessage = document.getElementById('qr-status');
const qrCloseButton = document.getElementById('qr-close');

let currentBoothId = '';
let boothLocked = false;
let currentBoothName = '';
const BOOTHS_CSV_URL = './booths.csv';
let boothCatalog = null;
let boothCatalogPromise = null;
let gateBoothNameRequestId = 0;
let qrReader = null;
let qrControls = null;
let qrScannerActive = false;
const defaultQrLaunchLabel = launchQrScannerButton ? launchQrScannerButton.textContent.trim() : '';

document.addEventListener('DOMContentLoaded', () => {
  initializeStarInputs();
  attachEventListeners();
  renderGateBoothNameDefault();
  renderBoothBannerName('');
  loadBoothCatalog().catch((error) => {
    console.error('[booth] failed to preload catalogue', error);
  });
  setupInitialState();
  initializeQrScanner();
});

function attachEventListeners() {
  gateInput.addEventListener('input', () => {
    let value = gateInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length && /^[A-Z]/.test(value[0])) {
      const letter = value[0];
      const digits = value.slice(1).replace(/\D/g, '').slice(0, 2);
      value = letter + digits;
    } else {
      value = value.replace(/\D/g, '').slice(0, 3);
    }
    gateInput.value = value;
    const boothId = sanitizeBooth(value);
    if (boothId) {
      requestGateBoothNameLookup(boothId);
    } else {
      renderGateBoothNameDefault();
    }
  });

  gateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      gateButton.click();
    }
  });

  gateButton.addEventListener('click', (event) => {
    event.preventDefault();
    const boothCandidate = sanitizeBooth(gateInput.value);
    if (!boothCandidate) {
      showGateError('屋台番号（例：001 または A01）を入力してください。');
      return;
    }
    hideGateError();
    setBooth(boothCandidate, { fromQuery: false });
  });

  changeBoothButton.addEventListener('click', () => {
    if (boothLocked) return;
    stopQrScanner({ hidePanel: true, restoreButton: true });
    resetForm(true);
    showGate({ focusInput: true, scrollIntoView: true });
    updateQueryParam(null, null);
  });

  form.addEventListener('change', () => {
    updateSubmitState();
  });

  form.addEventListener('submit', handleFormSubmit);
  evaluateAnotherButton.addEventListener('click', handleEvaluateAnother);
  alreadyChangeBoothButton.addEventListener('click', handleEvaluateAnother);

  if (openGateButton) {
    openGateButton.addEventListener('click', () => {
      stopQrScanner({ hidePanel: true, restoreButton: true });
      showGate({ focusInput: true, scrollIntoView: true });
    });
  }
}

function initializeQrScanner() {
  // QRカメラ導線が存在しない（デスクトップレイアウトなど）場合は何もしない。
  if (!launchQrScannerButton || !qrScannerPanel || !qrVideoElement || !qrStatusMessage) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    launchQrScannerButton.disabled = true;
    launchQrScannerButton.setAttribute('aria-disabled', 'true');
    launchQrScannerButton.textContent = 'ブラウザがカメラに対応していません';
    qrScannerPanel.classList.add('hidden');
    qrScannerPanel.setAttribute('aria-hidden', 'true');
    showQrStatus('お使いのブラウザではカメラを利用できません。端末標準のカメラアプリをご利用ください。', 'warning');
    return;
  }

  launchQrScannerButton.addEventListener('click', () => {
    startQrScanner().catch((error) => {
      console.error('[qr] failed to start scanner', error);
      showQrStatus('カメラを起動できませんでした。端末の設定を確認し、再度お試しください。', 'error');
      stopQrScanner({ hidePanel: true, restoreButton: true });
    });
  });

  if (qrCloseButton) {
    qrCloseButton.addEventListener('click', () => {
      stopQrScanner({ hidePanel: true, restoreButton: true });
      showQrStatus('カメラを停止しました。再度利用する場合は「カメラで読み取る」を押してください。', 'info');
    });
  }
}

// ZXing のリーダーを起動し、読み取りコールバックをセットする。
async function startQrScanner() {
  if (qrScannerActive) {
    showQrStatus('読み取りを再開しています。QRコードを枠内に収めてください。', 'info');
    return;
  }

  if (!launchQrScannerButton || !qrScannerPanel || !qrVideoElement) {
    return;
  }

  const zxing = window.ZXingBrowser;
  if (!zxing || !zxing.BrowserQRCodeReader) {
    showQrStatus('読み取り用ライブラリを読み込めませんでした。通信環境を確認してから再度お試しください。', 'error');
    return;
  }

  qrScannerActive = true;
  launchQrScannerButton.disabled = true;
  launchQrScannerButton.setAttribute('aria-expanded', 'true');
  launchQrScannerButton.textContent = '読み取り準備中...';
  qrScannerPanel.classList.remove('hidden');
  qrScannerPanel.removeAttribute('aria-hidden');
  showQrStatus('カメラの使用を許可するとスキャンが始まります。', 'info');

  if (!qrReader) {
    // 1度生成したリーダーを再利用してカメラ起動時間を短縮する。
    qrReader = new zxing.BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
  }

  try {
    qrControls = await qrReader.decodeFromVideoDevice(
      undefined,
      qrVideoElement,
      (result, error) => {
        if (result) {
          handleQrScanResult(result);
          return;
        }
        if (error && !(zxing.NotFoundException && error instanceof zxing.NotFoundException)) {
          console.warn('[qr] non-fatal decode error', error);
          showQrStatus('読み取れませんでした。QRコードをもう一度枠内に合わせてください。', 'warning');
        }
      }
    );
    launchQrScannerButton.textContent = '読み取り中...';
    showQrStatus('QRコードを枠内に収めてください。読み取ると自動でページを移動します。', 'info');
  } catch (error) {
    qrScannerActive = false;
    throw error;
  }
}

// ZXing で確保したカメラストリームとUI状態を安全に解放する。
function stopQrScanner(options = {}) {
  const { hidePanel = false, restoreButton = false } = options;

  if (qrControls && typeof qrControls.stop === 'function') {
    try {
      qrControls.stop();
    } catch (error) {
      console.warn('[qr] failed to stop controls', error);
    }
  }
  qrControls = null;

  if (qrReader) {
    try {
      qrReader.reset();
    } catch (error) {
      console.warn('[qr] failed to reset reader', error);
    }
  }

  if (qrVideoElement) {
    const stream = qrVideoElement.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (error) {
          console.warn('[qr] failed to stop track', error);
        }
      });
    }
    qrVideoElement.srcObject = null;
  }

  qrScannerActive = false;

  if (hidePanel && qrScannerPanel) {
    qrScannerPanel.classList.add('hidden');
    qrScannerPanel.setAttribute('aria-hidden', 'true');
  }

  if (restoreButton && launchQrScannerButton) {
    launchQrScannerButton.disabled = false;
    launchQrScannerButton.setAttribute('aria-expanded', 'false');
    launchQrScannerButton.textContent = defaultQrLaunchLabel || 'カメラで読み取る';
  }
}

// 読み取ったQRコードの内容を扱い、URLか屋台番号に応じて誘導する。
function handleQrScanResult(result) {
  const text = typeof result.getText === 'function' ? result.getText() : result.text;
  const content = (text || '').trim();

  if (!content) {
    showQrStatus('QRコードを読み取りましたが内容を解釈できませんでした。', 'warning');
    return;
  }

  showQrStatus('QRコードを読み取りました。移動しています...', 'success');
  stopQrScanner({ hidePanel: true, restoreButton: true });

  if (/^https?:\/\//i.test(content)) {
    // QRコードがURLを返す場合は遷移させ、フォーム以外の導線にも対応する。
    window.location.href = content;
    return;
  }

  const boothCandidate = sanitizeBooth(content);
  if (boothCandidate) {
    // 屋台番号のみが埋め込まれていた場合はそのままフォーム選択に利用する。
    setBooth(boothCandidate, { fromQuery: false });
    return;
  }

  showQrStatus('QRコードから取得した内容を処理できませんでした。端末のカメラアプリで再度お試しください。', 'warning');
}

function showQrStatus(message, tone = 'info') {
  if (!qrStatusMessage) return;
  if (message) {
    qrStatusMessage.textContent = message;
  }
  if (tone) {
    qrStatusMessage.dataset.tone = tone;
  } else {
    delete qrStatusMessage.dataset.tone;
  }
}

function setupInitialState() {
  resetForm(true);
  collapseGate();
  const boothFromQuery = getBoothFromQuery();
  const boothNameFromQuery = getBoothNameFromQuery();
  if (boothFromQuery) {
    setBooth(boothFromQuery, { fromQuery: true, boothName: boothNameFromQuery });
  } else {
    showLanding();
  }
}

function initializeStarInputs() {
  document.querySelectorAll('.stars').forEach((group) => {
    const labels = Array.from(group.querySelectorAll('label'));
    const inputs = Array.from(group.querySelectorAll('input[type="radio"]'));

    const applyVisualState = (value) => {
      labels.forEach((label) => {
        const labelValue = Number(label.dataset.value);
        label.classList.toggle('is-active', labelValue <= value && value > 0);
      });
    };

    inputs.forEach((input) => {
      input.addEventListener('change', () => {
        applyVisualState(Number(input.value));
        updateSubmitState();
      });
    });

    labels.forEach((label) => {
      label.addEventListener('mouseenter', () => {
        applyVisualState(Number(label.dataset.value));
      });
    });

    group.addEventListener('mouseleave', () => {
      const checked = group.querySelector('input:checked');
      applyVisualState(checked ? Number(checked.value) : 0);
    });

    applyVisualState(0);
  });
}

function handleFormSubmit(event) {
  event.preventDefault();

  if (!currentBoothId) {
    showAlert('屋台番号が選択されていません。', 'warning');
    return;
  }

  if (hasAlreadyVoted(currentBoothId)) {
    showAlert('この屋台にはすでに投票済みです。', 'warning');
    submitButton.disabled = true;
    return;
  }

  const missingRatings = getMissingRatings();
  if (missingRatings.length) {
    showAlert(`未入力：${missingRatings.join('・')}。星をタップして評価してください。`, 'warning');
    submitButton.disabled = true;
    return;
  }

  const formData = new FormData(form);
  submitButton.disabled = true;
  const previousLabel = submitButton.textContent;
  submitButton.textContent = '送信中...';
  showAlert('');

  // Supabase への送信が有効な場合のみ payload を構築
  const supabasePayload = SUPABASE_ENABLED ? buildSupabasePayload(formData) : null;
  console.debug('[submit] booth', currentBoothId, 'payload', supabasePayload);

  const requests = [
    fetch(FORM_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: formData,
    }),
  ];

  if (supabasePayload) {
    // Google フォーム送信と並列で Supabase への登録を実行
    requests.push(sendToSupabase(supabasePayload));
  }

  Promise.allSettled(requests).then((results) => {
    console.debug('[submit] request results', results);
    const [googleResult, supabaseResult] = results;

    if (googleResult.status === 'rejected') {
      console.error('[submit] Google Form submission failed', googleResult.reason);
      showAlert('通信に失敗しました。再試行してください。', 'error');
      submitButton.disabled = false;
      submitButton.textContent = previousLabel;
      return;
    }

    // Supabase 送信の成否を判定し、後続処理（ローカルストレージやUI）を制御
    let supabaseSucceeded = true;
    if (supabasePayload) {
      if (!supabaseResult || supabaseResult.status === 'rejected') {
        supabaseSucceeded = false;
        console.error('[submit] Supabase sync failed:', supabaseResult ? supabaseResult.reason : 'unknown');
        window.alert('ランキング集計への登録に失敗しました。通信環境を確認してからもう一度お試しください。');
      } else {
        window.alert('ランキング集計への登録が完了しました。ご協力ありがとうございます！');
      }
    }

    if (!supabaseSucceeded) {
      showAlert('ランキング集計への登録に失敗しました。通信環境を確認して再送信してください。', 'error');
      submitButton.disabled = false;
      submitButton.textContent = previousLabel;
      return;
    }

    persistBoothVote(currentBoothId);
    showThanks();
  }).catch((error) => {
    console.error('[submit] Unexpected error during submission', error);
    showAlert('通信に失敗しました。再試行してください。', 'error');
    submitButton.disabled = false;
    submitButton.textContent = previousLabel;
  });
}

function handleEvaluateAnother() {
  resetForm(true);
  updateQueryParam(null, null);
  showLanding();
}

function setBooth(boothId, { fromQuery, boothName }) {
  currentBoothId = boothId;
  currentBoothName = (boothName || '').toString().trim();
  boothLocked = Boolean(fromQuery);
  formBoothInput.value = boothId;
  boothDisplay.textContent = boothId;
  gateInput.value = boothId;

  collapseGate();
  hideQrNotice();

  if (currentBoothName) {
    renderGateBoothNameResult(currentBoothName);
    renderBoothBannerName(currentBoothName);
  } else {
    renderBoothBannerName('');
    requestGateBoothNameLookup(boothId);
  }

  updateQueryParam(boothId, currentBoothName || null);

  resetRatingsOnly();
  changeBoothButton.classList.toggle('hidden', fromQuery);

  if (hasAlreadyVoted(boothId)) {
    showAlreadyVotedView();
    return;
  }

  hideAlreadyVotedView();
  showForm();
  updateSubmitState();

  if (!currentBoothName) {
    resolveBoothName(boothId)
      .then((name) => {
        if (!name || currentBoothId !== boothId) return;
        currentBoothName = name;
        renderGateBoothNameResult(name);
        renderBoothBannerName(name);
        updateQueryParam(currentBoothId, currentBoothName);
      })
      .catch((error) => {
        console.error('[booth] failed to resolve booth name', error);
      });
  }
}

function showForm() {
  stopQrScanner({ hidePanel: true, restoreButton: true });
  collapseGate();
  hideQrNotice();
  thanksSection.classList.add('hidden');
  alreadyVotedSection.classList.add('hidden');
  form.classList.remove('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
}

function showGate(options = {}) {
  stopQrScanner({ hidePanel: true, restoreButton: true });
  const { focusInput = false, scrollIntoView = false } = options;
  showQrNotice();
  setGateVisibility(true);
  form.classList.add('hidden');
  thanksSection.classList.add('hidden');
  hideAlreadyVotedView(true);
  currentBoothId = '';
  boothLocked = false;
  gateInput.value = '';
  currentBoothName = '';
  renderGateBoothNameDefault();
  renderBoothBannerName('');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
  showAlert('');
  if (scrollIntoView && gateSection) {
    gateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (focusInput && gateInput) {
    gateInput.focus({ preventScroll: true });
  }
}

function showThanks() {
  stopQrScanner({ hidePanel: true, restoreButton: true });
  collapseGate();
  hideQrNotice();
  form.classList.add('hidden');
  thanksSection.classList.remove('hidden');
  alreadyVotedSection.classList.add('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
}

function showAlreadyVotedView() {
  stopQrScanner({ hidePanel: true, restoreButton: true });
  collapseGate();
  hideQrNotice();
  form.classList.add('hidden');
  thanksSection.classList.add('hidden');
  alreadyVotedSection.classList.remove('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
  showAlert('');
  if (alreadyVotedNumber) {
    if (currentBoothId) {
      alreadyVotedNumber.textContent = currentBoothName ? `${currentBoothId}（${currentBoothName}）` : currentBoothId;
    } else {
      alreadyVotedNumber.textContent = '---';
    }
  }
}

function hideAlreadyVotedView(resetDisplayedNumber = false) {
  alreadyVotedSection.classList.add('hidden');
  if (resetDisplayedNumber && alreadyVotedNumber) {
    alreadyVotedNumber.textContent = '---';
  }
}

function showLanding() {
  stopQrScanner({ hidePanel: true, restoreButton: true });
  showQrNotice();
  collapseGate();
  form.classList.add('hidden');
  thanksSection.classList.add('hidden');
  hideAlreadyVotedView(true);
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
  showAlert('');
}

function setGateVisibility(isVisible) {
  if (!gateSection) return;
  gateSection.classList.toggle('hidden', !isVisible);
  if (isVisible) {
    gateSection.removeAttribute('aria-hidden');
  } else {
    gateSection.setAttribute('aria-hidden', 'true');
  }
  if (openGateButton) {
    openGateButton.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
  }
}

function collapseGate() {
  setGateVisibility(false);
}

function showQrNotice() {
  if (qrNotice) {
    qrNotice.classList.remove('hidden');
  }
}

function hideQrNotice() {
  if (qrNotice) {
    qrNotice.classList.add('hidden');
  }
}

function resetForm(resetBoothValue) {
  form.reset();
  resetRatingsOnly();
  showAlert('');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
  hideAlreadyVotedView();
  if (resetBoothValue) {
    currentBoothId = '';
    currentBoothName = '';
    formBoothInput.value = '';
    boothDisplay.textContent = '---';
    renderBoothBannerName('');
    renderGateBoothNameDefault();
  }
}

function resetRatingsOnly() {
  document.querySelectorAll('.stars').forEach((group) => {
    const labels = group.querySelectorAll('label');
    labels.forEach((label) => label.classList.remove('is-active'));
  });
  REQUIRED_ENTRIES.forEach((name) => {
    const checked = form.querySelector(`input[name="${name}"]:checked`);
    if (checked) checked.checked = false;
  });
}

function updateSubmitState() {
  if (form.classList.contains('hidden')) {
    submitButton.disabled = true;
    return;
  }

  if (!currentBoothId) {
    submitButton.disabled = true;
    showAlert('');
    return;
  }

  if (hasAlreadyVoted(currentBoothId)) {
    submitButton.disabled = true;
    showAlert('この屋台にはすでに投票済みです。別の屋台を選んでください。', 'warning');
    return;
  }

  const missingRatings = getMissingRatings();
  if (missingRatings.length) {
    submitButton.disabled = true;
    showAlert(`未入力：${missingRatings.join('・')}。星をタップして評価してください。`, 'info');
    return;
  }

  submitButton.disabled = false;
  showAlert('');
}

function getMissingRatings() {
  return REQUIRED_ENTRIES
    .filter((name) => !form.querySelector(`input[name="${name}"]:checked`))
    .map((name) => ENTRY_LABELS[name] || name);
}

function buildSupabasePayload(formData) {
  const toNumber = (entry) => {
    const value = formData.get(entry);
    return value ? Number(value) : null;
  };
  return {
    booth_id: currentBoothId || (formData.get('entry.375954542') || '').toString().trim(),
    taste: toNumber('entry.283403021'),
    service: toNumber('entry.1777377100'),
    visual: toNumber('entry.1748112455'),
    amount: toNumber('entry.1302631587'),
    comment: (formData.get('entry.1107530138') || '').toString().trim(),
    timestamp: new Date().toISOString(),
  };
}

function sendToSupabase(payload) {
  if (!SUPABASE_ENABLED) return Promise.resolve();

  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}`;

  console.debug('[supabase] POST', endpoint, payload.booth_id);

  // RLS で anon ロールの insert を許可した状態で匿名キーを利用して登録
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  }).then((response) => {
    if (!response.ok) {
      return response.text().then((text) => {
        throw new Error(text || `Supabase responded with status ${response.status}`);
      });
    }
  });
}

function showAlert(message, tone = 'error') {
  if (!message) {
    alertBox.textContent = '';
    alertBox.removeAttribute('data-tone');
    return;
  }
  alertBox.textContent = message;
  alertBox.dataset.tone = tone;
}

function showGateError(message) {
  gateError.textContent = message;
}

function hideGateError() {
  gateError.textContent = '';
}

function sanitizeBooth(value) {
  const raw = (value ?? '').toString().trim().toUpperCase();
  if (!raw) return '';

  const cleaned = raw.replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';

  if (/^[A-Z]/.test(cleaned[0])) {
    const letter = cleaned[0];
    const digits = cleaned.slice(1).replace(/\D/g, '');
    if (!digits) return '';
    const normalized = digits.padStart(2, '0').slice(-2);
    const numeric = parseInt(normalized, 10);
    if (Number.isNaN(numeric) || numeric <= 0) return '';
    return `${letter}${normalized}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = parseInt(digits, 10);
  if (Number.isNaN(numeric) || numeric <= 0) return '';
  return digits.padStart(3, '0').slice(-3);
}

function getBoothFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const booth = params.get('booth');
  const sanitized = sanitizeBooth(booth);
  return sanitized;
}

function updateQueryParam(boothId, boothName) {
  const url = new URL(window.location.href);
  if (boothId) {
    url.searchParams.set('booth', boothId);
    if (boothName) {
      url.searchParams.set('name', boothName);
    } else {
      url.searchParams.delete('name');
    }
  } else {
    url.searchParams.delete('booth');
    url.searchParams.delete('name');
  }
  history.replaceState({}, '', url);
}

function hasAlreadyVoted(boothId) {
  const list = getStoredBooths();
  return list.includes(boothId);
}

function persistBoothVote(boothId) {
  if (!boothId) return;
  const list = new Set(getStoredBooths());
  list.add(boothId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(list)));
}

function getStoredBooths() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

function getBoothNameFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('name');
  if (!name) return '';
  return name.toString().trim();
}

function renderBoothBannerName(name) {
  if (!boothNameDisplay) return;
  if (name) {
    boothNameDisplay.textContent = name;
  } else {
    boothNameDisplay.textContent = '屋台名がここに表示されます';
  }
}

function renderGateBoothNameDefault() {
  if (!gateBoothName) return;
  gateBoothName.textContent = '屋台名：入力すると自動表示されます';
}

function renderGateBoothNameSearching() {
  if (!gateBoothName) return;
  gateBoothName.textContent = '屋台名：検索中...';
}

function renderGateBoothNameResult(name) {
  if (!gateBoothName) return;
  if (name) {
    gateBoothName.textContent = `屋台名：${name}`;
  } else {
    gateBoothName.textContent = '屋台名：該当が見つかりません';
  }
}

function renderGateBoothNameError() {
  if (!gateBoothName) return;
  gateBoothName.textContent = '屋台名：一覧の取得に失敗しました';
}

function requestGateBoothNameLookup(boothId) {
  if (!boothId) {
    renderGateBoothNameDefault();
    return;
  }
  renderGateBoothNameSearching();
  const requestId = ++gateBoothNameRequestId;
  resolveBoothName(boothId)
    .then((name) => {
      if (requestId !== gateBoothNameRequestId) return;
      renderGateBoothNameResult(name);
      if (name && currentBoothId === boothId) {
        currentBoothName = name;
        renderBoothBannerName(name);
        updateQueryParam(currentBoothId, currentBoothName);
      }
    })
    .catch((error) => {
      if (requestId !== gateBoothNameRequestId) return;
      console.error('[booth] gate lookup failed', error);
      renderGateBoothNameError();
    });
}

async function resolveBoothName(boothId, preferredName = '') {
  if (preferredName) return preferredName;
  if (!boothId) return '';
  try {
    const catalogue = await loadBoothCatalog();
    return catalogue.get(boothId) || '';
  } catch (error) {
    console.error('[booth] resolve error', error);
    throw error;
  }
}

async function loadBoothCatalog() {
  if (boothCatalog) return boothCatalog;
  if (boothCatalogPromise) {
    await boothCatalogPromise;
    return boothCatalog || new Map();
  }
  boothCatalogPromise = (async () => {
    const map = new Map();
    try {
      const response = await fetch(BOOTHS_CSV_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load booths.csv (status ${response.status})`);
      }
      const text = await response.text();
      const rows = text.trim().split(/\r?\n/).slice(1);
      rows.forEach((row) => {
        if (!row) return;
        const parts = row.split(',');
        if (parts.length < 3) return;
        const boothIdRaw = parts[1].trim();
        const boothName = parts[2].trim();
        if (!boothIdRaw || !boothName) return;
        const normalized = sanitizeBooth(boothIdRaw);
        if (normalized) {
          map.set(normalized, boothName);
        }
      });
    } catch (error) {
      console.error('[booth] failed to load catalogue', error);
    }
    boothCatalog = map;
  })();
  await boothCatalogPromise;
  return boothCatalog || new Map();
}
