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
const roundGroupCrop = document.querySelector('#roundGroupCrop');
const timesCrop = document.querySelector('#timesCrop');

const COMMON_OCR_HINTS = {
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:;.,\'"′″ ',
  preserve_interword_spaces: '1',
};
const ROUND_GROUP_OCR_HINTS = {
  ...COMMON_OCR_HINTS,
  tessedit_pageseg_mode: '7',
};
const TIMES_OCR_HINTS = {
  ...COMMON_OCR_HINTS,
  tessedit_pageseg_mode: '6',
};
const MAX_OCR_WIDTH = 1200;
const BLACK_PIXEL_THRESHOLD = 70;
const MIN_BLACK_LINE_RATIO = 0.08;
const OCR_UPSCALE = 3;
const CONTRAST_FACTOR = 2.2;
const MIN_BINARIZE_THRESHOLD = 65;
const MAX_BINARIZE_THRESHOLD = 170;
const ADAPTIVE_THRESHOLD_FACTOR = 0.82;
const SEGMENTS = {
  roundGroup: { x: 0.44, y: 0.08, width: 0.52, height: 0.24, padding: 0.08 },
  times: { x: 0.16, y: 0.34, width: 0.80, height: 0.42, padding: 0.06 },
};

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

const drawScaledImage = (image) => {
  const scale = Math.min(1, MAX_OCR_WIDTH / image.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
};

const findBlackRegion = (context, width, height) => {
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const columns = new Array(width).fill(0);
  const rows = new Array(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const isBlack = pixels[index] < BLACK_PIXEL_THRESHOLD
        && pixels[index + 1] < BLACK_PIXEL_THRESHOLD
        && pixels[index + 2] < BLACK_PIXEL_THRESHOLD;

      if (isBlack) {
        columns[x] += 1;
        rows[y] += 1;
      }
    }
  }

  const minColumnPixels = height * MIN_BLACK_LINE_RATIO;
  const minRowPixels = width * MIN_BLACK_LINE_RATIO;
  const minX = columns.findIndex((count) => count > minColumnPixels);
  const maxX = columns.findLastIndex((count) => count > minColumnPixels);
  const minY = rows.findIndex((count) => count > minRowPixels);
  const maxY = rows.findLastIndex((count) => count > minRowPixels);

  if (minX < 0 || maxX <= minX || minY < 0 || maxY <= minY) {
    return { x: 0, y: 0, width, height };
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const cropSegment = (source, blackRegion, segment) => {
  const paddingX = blackRegion.width * (segment.padding ?? 0);
  const paddingY = blackRegion.height * (segment.padding ?? 0);
  const left = blackRegion.x + blackRegion.width * segment.x - paddingX;
  const top = blackRegion.y + blackRegion.height * segment.y - paddingY;
  const right = blackRegion.x + blackRegion.width * (segment.x + segment.width) + paddingX;
  const bottom = blackRegion.y + blackRegion.height * (segment.y + segment.height) + paddingY;
  const crop = {
    x: Math.round(clamp(left, 0, source.width - 1)),
    y: Math.round(clamp(top, 0, source.height - 1)),
    width: Math.round(clamp(right, 1, source.width) - clamp(left, 0, source.width - 1)),
    height: Math.round(clamp(bottom, 1, source.height) - clamp(top, 0, source.height - 1)),
  };
  const canvas = document.createElement('canvas');
  canvas.width = crop.width * OCR_UPSCALE;
  canvas.height = crop.height * OCR_UPSCALE;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const enhanceCanvasForOcr = (canvas) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const grays = [];
  let grayTotal = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    grays.push(gray);
    grayTotal += gray;
  }

  const averageGray = grayTotal / grays.length;
  const threshold = clamp(
    averageGray * ADAPTIVE_THRESHOLD_FACTOR,
    MIN_BINARIZE_THRESHOLD,
    MAX_BINARIZE_THRESHOLD,
  );

  for (let index = 0, grayIndex = 0; index < pixels.length; index += 4, grayIndex += 1) {
    const contrasted = clamp((grays[grayIndex] - averageGray) * CONTRAST_FACTOR + 128, 0, 255);
    const highContrast = grays[grayIndex] > threshold || contrasted > 145 ? 255 : 0;
    pixels[index] = highContrast;
    pixels[index + 1] = highContrast;
    pixels[index + 2] = highContrast;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

const preprocessForOcr = async (file) => {
  const image = await loadImage(file);
  const { canvas, context } = drawScaledImage(image);
  const blackRegion = findBlackRegion(context, canvas.width, canvas.height);

  return {
    roundGroup: enhanceCanvasForOcr(cropSegment(canvas, blackRegion, SEGMENTS.roundGroup)),
    times: enhanceCanvasForOcr(cropSegment(canvas, blackRegion, SEGMENTS.times)),
  };
};

const runOcr = async (file) => {
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  placeholder.classList.add('hidden');
  setStatus('Preparing image and running OCR locally in your browser…', 'reading');

  try {
    const preparedImages = await preprocessForOcr(file);
    roundGroupCrop.src = preparedImages.roundGroup;
    timesCrop.src = preparedImages.times;
    const roundGroupResult = await Tesseract.recognize(preparedImages.roundGroup, 'eng', {
      ...ROUND_GROUP_OCR_HINTS,
      logger: ({ status: label, progress }) => {
        if (label) setStatus(`Reading round/group: ${label} ${Math.round((progress ?? 0) * 100)}%`, 'reading');
      },
    });
    const timesResult = await Tesseract.recognize(preparedImages.times, 'eng', {
      ...TIMES_OCR_HINTS,
      logger: ({ status: label, progress }) => {
        if (label) setStatus(`Reading time list: ${label} ${Math.round((progress ?? 0) * 100)}%`, 'reading');
      },
    });
    ocrText.value = `${roundGroupResult.data.text}\n${timesResult.data.text}`;
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
