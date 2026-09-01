import * as pdfjsLib from 'pdfjs-dist';
// Bundled locally by Vite (?url gives a fingerprinted asset URL) so no CDN fetch is needed at runtime.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PositionedText } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Extracts positioned text items for every page of a PDF file. */
export async function extractPdfPages(data: ArrayBuffer): Promise<PositionedText[][]> {
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: PositionedText[][] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const items: PositionedText[] = [];
    for (const raw of content.items) {
      if (!('str' in raw)) continue; // skip TextMarkedContent entries
      const transform = raw.transform as number[];
      items.push({
        str: raw.str,
        x: transform[4],
        y: transform[5],
        width: raw.width,
        height: raw.height,
      });
    }
    pages.push(items);
  }

  return pages;
}
