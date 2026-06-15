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

const runOcr = async (file) => {
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  placeholder.classList.add('hidden');
  setStatus('Running OCR locally in your browser…', 'reading');

  try {
    const result = await Tesseract.recognize(file, 'eng', {
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
