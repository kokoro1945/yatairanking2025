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

const form = document.getElementById('rating-form');
const formBoothInput = document.getElementById('form-booth');
const boothDisplay = document.getElementById('booth-display');
const changeBoothButton = document.getElementById('change-booth');
const alertBox = document.getElementById('form-alert');
const submitButton = document.getElementById('submit-button');
const thanksSection = document.getElementById('thanks');
const evaluateAnotherButton = document.getElementById('evaluate-another');
const alreadyVotedSection = document.getElementById('already-voted');
const alreadyVotedNumber = document.getElementById('already-voted-number');
const alreadyChangeBoothButton = document.getElementById('already-change-booth');

let currentBoothId = '';
let boothLocked = false;

document.addEventListener('DOMContentLoaded', () => {
  initializeStarInputs();
  attachEventListeners();
  setupInitialState();
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
    resetForm(true);
    showGate();
    updateQueryParam(null);
    gateInput.focus();
  });

  form.addEventListener('change', () => {
    updateSubmitState();
  });

  form.addEventListener('submit', handleFormSubmit);
  evaluateAnotherButton.addEventListener('click', handleEvaluateAnother);
  alreadyChangeBoothButton.addEventListener('click', handleEvaluateAnother);
}

function setupInitialState() {
  resetForm(true);
  const boothFromQuery = getBoothFromQuery();
  if (boothFromQuery) {
    setBooth(boothFromQuery, { fromQuery: true });
  } else {
    showGate();
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
  showGate();
  updateQueryParam(null);
  thanksSection.classList.add('hidden');
  hideAlreadyVotedView(true);
  gateInput.focus();
}

function setBooth(boothId, { fromQuery }) {
  currentBoothId = boothId;
  boothLocked = Boolean(fromQuery);
  formBoothInput.value = boothId;
  boothDisplay.textContent = boothId;
  gateInput.value = boothId;

  updateQueryParam(boothId);

  resetRatingsOnly();
  changeBoothButton.classList.toggle('hidden', fromQuery);

  if (hasAlreadyVoted(boothId)) {
    showAlreadyVotedView();
    return;
  }

  hideAlreadyVotedView();
  showForm();
  updateSubmitState();
}

function showForm() {
  gateSection.classList.add('hidden');
  thanksSection.classList.add('hidden');
  alreadyVotedSection.classList.add('hidden');
  form.classList.remove('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
}

function showGate() {
  gateSection.classList.remove('hidden');
  form.classList.add('hidden');
  thanksSection.classList.add('hidden');
  hideAlreadyVotedView(true);
  currentBoothId = '';
  boothLocked = false;
  gateInput.value = '';
}

function showThanks() {
  form.classList.add('hidden');
  thanksSection.classList.remove('hidden');
  alreadyVotedSection.classList.add('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
}

function showAlreadyVotedView() {
  gateSection.classList.add('hidden');
  form.classList.add('hidden');
  thanksSection.classList.add('hidden');
  alreadyVotedSection.classList.remove('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
  showAlert('');
  if (alreadyVotedNumber) {
    alreadyVotedNumber.textContent = currentBoothId || '---';
  }
}

function hideAlreadyVotedView(resetDisplayedNumber = false) {
  alreadyVotedSection.classList.add('hidden');
  if (resetDisplayedNumber && alreadyVotedNumber) {
    alreadyVotedNumber.textContent = '---';
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
    formBoothInput.value = '';
    boothDisplay.textContent = '---';
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

function updateQueryParam(boothId) {
  const url = new URL(window.location.href);
  if (boothId) {
    url.searchParams.set('booth', boothId);
  } else {
    url.searchParams.delete('booth');
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
