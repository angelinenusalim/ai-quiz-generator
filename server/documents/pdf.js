import { LIMITS } from '../shared/quiz.js';
import { AppError } from '../errors.js';

function pageRanges(numbers) {
  const ranges = [];
  for (let index = 0; index < numbers.length; index++) {
    const start = numbers[index];
    let end = start;
    while (numbers[index + 1] === end + 1) end = numbers[++index];
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return ranges.length <= 20 ? `${numbers.length === 1 ? 'page' : 'pages'} ${ranges.join(', ')}` : `${numbers.length} pages throughout the document`;
}

// This accepts a parser for focused tests; production uses PDFParse's public API.
export async function extractPdfPages(parser, { characterLimit = LIMITS.documentTextCharacters, sectionLimit = LIMITS.sections } = {}) {
  const started = performance.now();
  const info = await parser.getInfo({ parsePageInfo: false });
  const sections = [];
  const unreadable = [];
  let characters = 0;
  let batches = 0;
  let peakHeapBytes = process.memoryUsage().heapUsed;
  for (let first = 1; first <= info.total; first += LIMITS.pdfBatchPages) {
    const last = Math.min(info.total, first + LIMITS.pdfBatchPages - 1);
    // A fresh result holds at most ten pages. PDFParse releases each page's resources.
    const result = await parser.getText({ first, last, pageJoiner: '' });
    batches++;
    for (const page of result.pages) {
      const text = page.text.trim();
      if (!text) { unreadable.push(page.num); continue; }
      characters += text.length;
      if (characters > characterLimit) throw new AppError(422, 'DOCUMENT_TEXT_LIMIT', `This PDF has more than ${characterLimit.toLocaleString('en-US')} readable characters, which exceeds the extraction memory budget. Split it into chapters and upload one study set at a time.`);
      if (sections.length >= sectionLimit) throw new AppError(422, 'DOCUMENT_SECTION_LIMIT', `This PDF has more than ${sectionLimit.toLocaleString('en-US')} text sections to track. Please split it into smaller files.`);
      sections.push({ sourceType: 'page', sourceNumber: page.num, text });
    }
    peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
  }
  return {
    sections,
    warnings: unreadable.length ? [`No readable text was found on ${pageRanges(unreadable)}. These may be blank or scanned pages; use OCR first if you want their content included.`] : [],
    pageCount: info.total,
    processing: { batchCount: batches, durationMs: Math.round(performance.now() - started), peakHeapBytes },
  };
}
