import * as XLSX from 'xlsx';
import { parseStatementPdfDetailed } from '../parser';
import { classifyTransactions } from '../classification/classify';
import { buildWorkbook } from '../export/xlsx';
import type { ClassifiedTransaction } from '../classification/types';

export interface WorkerFileInput {
  name: string;
  buffer: ArrayBuffer;
}

export interface WorkerRequest {
  type: 'process';
  files: WorkerFileInput[];
}

export type PipelinePhase = 'parsing' | 'classifying' | 'exporting';
export type FileErrorCode = 'no-text-layer' | 'parse-failed';

export type WorkerResponse =
  | { type: 'progress'; phase: PipelinePhase; fileName?: string; fileIndex: number; fileCount: number }
  | { type: 'file-error'; fileName: string; code: FileErrorCode; message: string }
  | {
      type: 'done';
      transactions: ClassifiedTransaction[];
      workbook: ArrayBuffer;
      processedFileCount: number;
      totalFileCount: number;
    }
  | { type: 'fatal-error'; message: string };

// Narrow, module-local redeclaration of the worker global scope: this file is
// compiled alongside DOM-lib code (single project tsconfig), so we avoid
// pulling in the full WebWorker lib (which conflicts with DOM's `self` type)
// and instead only assert the shape we actually use.
declare const self: {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type !== 'process') return;

  const { files } = message;

  try {
    const allTransactions = [];
    let processedFileCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      post({ type: 'progress', phase: 'parsing', fileName: file.name, fileIndex: i, fileCount: files.length });

      try {
        const { transactions, diagnostics } = await parseStatementPdfDetailed(file.buffer);
        if (!diagnostics.hasTextLayer) {
          post({
            type: 'file-error',
            fileName: file.name,
            code: 'no-text-layer',
            message: `"${file.name}" has no selectable text layer (it looks like a scanned image). Text-based PDFs are required.`,
          });
          continue;
        }
        allTransactions.push(...transactions);
        processedFileCount++;
      } catch (err) {
        post({
          type: 'file-error',
          fileName: file.name,
          code: 'parse-failed',
          message: err instanceof Error ? err.message : `Failed to parse "${file.name}".`,
        });
      }
    }

    post({ type: 'progress', phase: 'classifying', fileIndex: files.length, fileCount: files.length });
    const classified = classifyTransactions(allTransactions);

    post({ type: 'progress', phase: 'exporting', fileIndex: files.length, fileCount: files.length });
    const workbook = buildWorkbook(classified);
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

    post(
      {
        type: 'done',
        transactions: classified,
        workbook: buffer,
        processedFileCount,
        totalFileCount: files.length,
      },
      [buffer],
    );
  } catch (err) {
    post({
      type: 'fatal-error',
      message: err instanceof Error ? err.message : 'Unexpected error while processing files.',
    });
  }
};
