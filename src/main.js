import { parseTimingText } from './parser.js';

const imageInput = document.querySelector('#imageInput');
const captureButton = document.querySelector('#captureButton');
const preview = document.querySelector('#preview');
const placeholder = document.querySelector('#placeholder');
const status = document.querySelector('#status');
const ocrText = document.querySelector('#ocrText');
const roundValue = document.querySelector('#roundValue');
const groupValue = document.querySelector('#groupValue');
const timesBody = document.querySelector('#timesBody');
const jsonOutput = document.querySelector('#jsonOutput');

const OCR_HINTS = {
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:;.,\'"′″ ',
  tessedit_pageseg_mode: '6',
  preserve_interword_spaces: '1',
};
const MAX_OCR_WIDTH = 1200;

const setStatus = (message, state = '') => {
  status.textContent = message;
  status.className = `status ${state}`.trim();
};

const renderParsedData = () => {
  const parsed = parseTimingText(ocrText.value);
  roundValue.textContent = parsed.round ?? '—';
  groupValue.textContent = parsed.group ?? '—';
  timesBody.innerHTML = '';

  if (parsed.times.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="2">No times detected</td>';
    timesBody.append(row);
  } else {
    for (const time of parsed.times) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${time.position.toString().padStart(2, '0')}</td><td>${time.formatted}</td>`;
      timesBody.append(row);
    }
  }

  jsonOutput.textContent = JSON.stringify(parsed, null, 2);
};

const loadImage = (file) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to load the selected image.'));
  image.src = URL.createObjectURL(file);
});

const preprocessForOcr = async (file) => {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_OCR_WIDTH / image.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    const highContrast = gray > 145 ? 255 : 0;
    pixels[index] = highContrast;
    pixels[index + 1] = highContrast;
    pixels[index + 2] = highContrast;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

const runOcr = async (file) => {
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  placeholder.classList.add('hidden');
  setStatus('Preparing image and running OCR locally in your browser…', 'reading');

  try {
    const preparedImage = await preprocessForOcr(file);
    const result = await Tesseract.recognize(preparedImage, 'eng', {
      ...OCR_HINTS,
      logger: ({ status: label, progress }) => {
        if (label) setStatus(`${label} ${Math.round((progress ?? 0) * 100)}%`, 'reading');
      },
    });
    ocrText.value = result.data.text;
    renderParsedData();
    setStatus('OCR complete. Review and correct the extracted text if needed.', 'complete');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Unable to read the image.', 'error');
  }
};

captureButton.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
  const file = imageInput.files?.[0];
  if (file) runOcr(file);
});
ocrText.addEventListener('input', renderParsedData);
renderParsedData();
