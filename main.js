const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScp5bZudNWad73R9ayLiUPFaOHLKHvn9iFsS8Ui7MbeY9WkUA/formResponse';
const STORAGE_KEY = 'voted_booths';
const REQUIRED_ENTRIES = [
  'entry.283403021', // 味
  'entry.1777377100', // 接客
  'entry.1748112455', // 見た目
  'entry.1302631587', // 量
];

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

let currentBoothId = '';
let boothLocked = false;

document.addEventListener('DOMContentLoaded', () => {
  initializeStarInputs();
  attachEventListeners();
  setupInitialState();
});

function attachEventListeners() {
  gateInput.addEventListener('input', () => {
    gateInput.value = gateInput.value.replace(/[^\d]/g, '').slice(0, 3);
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
      showGateError('屋台番号（3桁の数字）を入力してください。');
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

  if (!allRatingsSelected()) {
    showAlert('全ての評価を選択してください。', 'warning');
    submitButton.disabled = true;
    return;
  }

  const formData = new FormData(form);
  submitButton.disabled = true;
  const previousLabel = submitButton.textContent;
  submitButton.textContent = '送信中...';
  showAlert('');

  fetch(FORM_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: formData,
  }).then(() => {
    persistBoothVote(currentBoothId);
    showThanks();
  }).catch(() => {
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
  showForm();
  updateSubmitState();

  if (fromQuery) {
    changeBoothButton.classList.add('hidden');
  } else {
    changeBoothButton.classList.remove('hidden');
  }

  if (hasAlreadyVoted(boothId)) {
    showAlert('この屋台にはすでに投票済みです。別の屋台を選んでください。', 'warning');
    submitButton.disabled = true;
  } else {
    showAlert('');
  }
}

function showForm() {
  gateSection.classList.add('hidden');
  thanksSection.classList.add('hidden');
  form.classList.remove('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
}

function showGate() {
  gateSection.classList.remove('hidden');
  form.classList.add('hidden');
  thanksSection.classList.add('hidden');
  currentBoothId = '';
  boothLocked = false;
  gateInput.value = '';
}

function showThanks() {
  form.classList.add('hidden');
  thanksSection.classList.remove('hidden');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
}

function resetForm(resetBoothValue) {
  form.reset();
  resetRatingsOnly();
  showAlert('');
  submitButton.textContent = '評価を送信する';
  submitButton.disabled = true;
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
  const complete = allRatingsSelected() && currentBoothId && !hasAlreadyVoted(currentBoothId);
  submitButton.disabled = !complete;
  if (!complete && currentBoothId) {
    const voted = hasAlreadyVoted(currentBoothId);
    if (voted) {
      showAlert('この屋台にはすでに投票済みです。別の屋台を選んでください。', 'warning');
    } else {
      showAlert('');
    }
  } else if (complete) {
    showAlert('');
  }
}

function allRatingsSelected() {
  return REQUIRED_ENTRIES.every((name) => form.querySelector(`input[name="${name}"]:checked`));
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
  const cleaned = (value ?? '').toString().trim();
  const digits = cleaned.replace(/[^\d]/g, '');
  if (!digits) return '';
  const numeric = parseInt(digits, 10);
  if (Number.isNaN(numeric)) return '';
  if (numeric <= 0) return '';
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
