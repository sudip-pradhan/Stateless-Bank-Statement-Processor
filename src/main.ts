import type { ClassifiedTransaction } from './classification/types';
import { downloadWorkbookBuffer } from './export/xlsx';
import type { WorkerRequest, WorkerResponse } from './worker/pipeline.worker';
import './style.css';

const SOFT_SIZE_WARNING_BYTES = 35 * 1024 * 1024; // mid-point of the 30-50MB soft-warning range

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <h1>Bank Statement Processor</h1>
    <p class="subtitle">Everything runs locally in your browser — no files ever leave this page.</p>

    <div id="dropzone" class="dropzone" tabindex="0" role="button" aria-label="Choose or drop PDF statements">
      <p>Drag &amp; drop PDF statements here, or click to browse.</p>
      <p class="dropzone-hint">You can select multiple files at once.</p>
      <input id="file-input" class="visually-hidden" type="file" accept="application/pdf" multiple />
    </div>

    <div id="warnings" class="banner-stack" aria-live="polite"></div>

    <div id="progress-section" class="progress-section" hidden>
      <div class="progress-track">
        <div id="progress-fill" class="progress-fill"></div>
      </div>
      <p id="progress-label" class="progress-label" aria-live="polite"></p>
    </div>

    <div id="errors" class="banner-stack" aria-live="polite"></div>

    <div id="summary" class="summary" hidden></div>

    <button id="export-button" disabled>Export to Excel</button>
  </main>
`;

const dropzone = document.querySelector<HTMLDivElement>('#dropzone')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const warningsEl = document.querySelector<HTMLDivElement>('#warnings')!;
const errorsEl = document.querySelector<HTMLDivElement>('#errors')!;
const progressSection = document.querySelector<HTMLDivElement>('#progress-section')!;
const progressFill = document.querySelector<HTMLDivElement>('#progress-fill')!;
const progressLabel = document.querySelector<HTMLParagraphElement>('#progress-label')!;
const summaryEl = document.querySelector<HTMLDivElement>('#summary')!;
const exportButton = document.querySelector<HTMLButtonElement>('#export-button')!;

let worker: Worker | null = null;
let latestTransactions: ClassifiedTransaction[] = [];
let latestWorkbookBuffer: ArrayBuffer | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker/pipeline.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => handleWorkerMessage(event.data);
    worker.onerror = (event) => {
      showError(`Processing failed unexpectedly: ${event.message || 'unknown worker error'}.`);
      resetProgress();
    };
  }
  return worker;
}

function clearChildren(el: HTMLElement): void {
  el.replaceChildren();
}

function banner(kind: 'warning' | 'error', text: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = `banner banner-${kind}`;
  div.textContent = text;
  return div;
}

function showWarning(text: string): void {
  warningsEl.appendChild(banner('warning', text));
}

function showError(text: string): void {
  errorsEl.appendChild(banner('error', text));
}

function resetUiForNewRun(): void {
  clearChildren(warningsEl);
  clearChildren(errorsEl);
  summaryEl.hidden = true;
  clearChildren(summaryEl);
  exportButton.disabled = true;
  latestTransactions = [];
  latestWorkbookBuffer = null;
}

function resetProgress(): void {
  progressSection.hidden = true;
  progressFill.style.width = '0%';
}

function setProgress(fraction: number, label: string): void {
  progressSection.hidden = false;
  progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  progressLabel.textContent = label;
}

function phaseLabel(response: Extract<WorkerResponse, { type: 'progress' }>): string {
  const { phase, fileIndex, fileCount, fileName } = response;
  if (phase === 'parsing') {
    return `Parsing file ${Math.min(fileIndex + 1, fileCount)} of ${fileCount}${fileName ? `: ${fileName}` : ''}...`;
  }
  if (phase === 'classifying') return 'Classifying transactions...';
  return 'Building Excel export...';
}

function phaseFraction(response: Extract<WorkerResponse, { type: 'progress' }>): number {
  const { phase, fileIndex, fileCount } = response;
  const parsingSpan = 0.7;
  if (phase === 'parsing') {
    return fileCount === 0 ? 0 : (fileIndex / fileCount) * parsingSpan;
  }
  if (phase === 'classifying') return parsingSpan + 0.15;
  return parsingSpan + 0.3;
}

function handleWorkerMessage(response: WorkerResponse): void {
  switch (response.type) {
    case 'progress':
      setProgress(phaseFraction(response), phaseLabel(response));
      break;
    case 'file-error':
      showError(response.message);
      break;
    case 'fatal-error':
      showError(`Processing failed: ${response.message}`);
      resetProgress();
      break;
    case 'done':
      resetProgress();
      latestTransactions = response.transactions;
      latestWorkbookBuffer = response.workbook;
      renderSummary(response.processedFileCount, response.totalFileCount);
      break;
  }
}

function renderSummary(processedFileCount: number, totalFileCount: number): void {
  summaryEl.hidden = false;
  clearChildren(summaryEl);

  if (latestTransactions.length === 0) {
    summaryEl.appendChild(
      banner(
        'error',
        processedFileCount === 0
          ? 'No files could be parsed — see the errors above.'
          : 'The PDF text was readable, but no transaction table could be found. The statement layout may not be supported yet.',
      ),
    );
    exportButton.disabled = true;
    return;
  }

  const p = document.createElement('p');
  p.textContent = `Found ${latestTransactions.length} transaction${latestTransactions.length === 1 ? '' : 's'} across ${processedFileCount} of ${totalFileCount} file${totalFileCount === 1 ? '' : 's'}.`;
  summaryEl.appendChild(p);
  exportButton.disabled = false;
}

async function processFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

  resetUiForNewRun();

  if (files.length === 0) {
    showError('No PDF files were selected. Please choose one or more PDF bank statements.');
    return;
  }

  const oversized = files.filter((f) => f.size > SOFT_SIZE_WARNING_BYTES);
  if (oversized.length > 0) {
    showWarning(
      `${oversized.length === 1 ? 'This file is' : 'These files are'} quite large (${oversized
        .map((f) => f.name)
        .join(', ')}) and may take longer to process. Processing runs in the background, so the page will stay responsive.`,
    );
  }

  setProgress(0, `Starting ${files.length} file${files.length === 1 ? '' : 's'}...`);

  const payload: WorkerRequest = {
    type: 'process',
    files: await Promise.all(
      files.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() })),
    ),
  };

  getWorker().postMessage(
    payload,
    payload.files.map((f) => f.buffer),
  );
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('dropzone-active');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dropzone-active');
});
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('dropzone-active');
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) void processFiles(files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) void processFiles(fileInput.files);
  fileInput.value = '';
});

exportButton.addEventListener('click', () => {
  if (!latestWorkbookBuffer || latestTransactions.length === 0) return;
  downloadWorkbookBuffer(latestWorkbookBuffer, 'statement.xlsx');
});
