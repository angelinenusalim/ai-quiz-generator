import yauzl from 'yauzl';
import path from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { LIMITS, extensionOf } from '../shared/quiz.js';
import { AppError } from '../errors.js';

const orderedParser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, parseTagValue: false, processEntities: true });
const plainParser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
const list = value => value ? (Array.isArray(value) ? value : [value]) : [];

function parseXml(text, ordered = false) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML entities are not supported.');
  if (XMLValidator.validate(text) !== true) throw new Error('Invalid XML.');
  return (ordered ? orderedParser : plainParser).parse(text);
}

// Stream XML entries only. Bound both declared and actual decompressed sizes;
// never inflate media, write paths to disk, or follow external relationships.
function readOfficeZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = new Map();
      const names = new Set();
      let count = 0;
      let declaredBytes = 0;
      let actualBytes = 0;
      let settled = false;
      const fail = err => { if (!settled) { settled = true; zip.close(); reject(err); } };
      zip.on('error', fail);
      zip.on('end', () => { if (!settled) { settled = true; resolve(entries); } });
      zip.on('entry', entry => {
        declaredBytes += entry.uncompressedSize;
        if (++count > 2000 || declaredBytes > 40 * 1024 * 1024 || entry.generalPurposeBitFlag & 1 || names.has(entry.fileName)) {
          return fail(new AppError(422, 'DOCUMENT_LIMIT', 'The document archive is encrypted, duplicated, or exceeds the 40 MB expanded/2,000 entry limit.'));
        }
        names.add(entry.fileName);
        if (!/\.(xml|rels)$/.test(entry.fileName)) return zip.readEntry();
        if (entry.uncompressedSize > 5 * 1024 * 1024) return fail(new AppError(422, 'DOCUMENT_LIMIT', 'A document XML part exceeds 5 MB. Split this material into smaller files.'));
        zip.openReadStream(entry, (err, stream) => {
          if (err) return fail(err);
          const chunks = [];
          let bytes = 0;
          stream.on('data', chunk => {
            bytes += chunk.length;
            actualBytes += chunk.length;
            if (bytes > 5 * 1024 * 1024 || actualBytes > 40 * 1024 * 1024) {
              stream.destroy();
              fail(new AppError(422, 'DOCUMENT_LIMIT', 'Expanded document content exceeds the supported limit.'));
            } else chunks.push(chunk);
          });
          stream.on('error', fail);
          stream.on('end', () => {
            if (settled) return;
            try {
              entries.set(entry.fileName, new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
              zip.readEntry();
            } catch (error) { fail(error); }
          });
        });
      });
      zip.readEntry();
    });
  });
}

function elements(nodes, tag) {
  const found = [];
  for (const node of list(nodes)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === tag) found.push(node);
      else if (Array.isArray(value)) found.push(...elements(value, tag));
    }
  }
  return found;
}

function inlineText(nodes, textTag) {
  let text = '';
  for (const node of list(nodes)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === textTag) text += list(value).map(n => n['#text'] || '').join('');
      else if (key === 'a:br' || key === 'w:br') text += '\n';
      else if (key === 'w:tab') text += '\t';
      else if (Array.isArray(value)) {
        // Only visible text, not XML attributes, drawing metadata, or field instructions.
        if (!['w:instrText', 'w:del', 'w:delText'].includes(key)) text += inlineText(value, textTag);
      }
    }
  }
  return text;
}

function paragraphs(nodes, paragraphTag, textTag) {
  return elements(nodes, paragraphTag).map(node => inlineText(node[paragraphTag], textTag).trim()).filter(Boolean);
}
function relationshipTarget(base, rel) {
  if (!rel || rel['@_TargetMode'] === 'External') throw new Error('Missing internal document relationship.');
  const target = rel['@_Target'];
  if (typeof target !== 'string' || target.includes('\\') || target.includes(':')) throw new Error('Invalid document relationship.');
  const resolved = path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(base), target));
  if (resolved.startsWith('../')) throw new Error('Invalid document path.');
  return resolved;
}
function getXml(entries, name, ordered = false) {
  if (!entries.has(name)) throw new Error('Missing document content.');
  return parseXml(entries.get(name), ordered);
}
function relationships(entries, name) {
  if (!entries.has(name)) return [];
  return list(getXml(entries, name).Relationships?.Relationship);
}

async function powerpoint(buffer) {
  const entries = await readOfficeZip(buffer);
  const contentTypes = getXml(entries, '[Content_Types].xml');
  if (!list(contentTypes.Types?.Override).some(t => t['@_ContentType'] === 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml')) throw new Error('Not a PPTX presentation.');
  const presentation = getXml(entries, 'ppt/presentation.xml');
  const ids = list(presentation['p:presentation']?.['p:sldIdLst']?.['p:sldId']);
  if (ids.length > 200) throw new AppError(422, 'DOCUMENT_LIMIT', 'Use presentations with at most 200 slides.');
  const rels = relationships(entries, 'ppt/_rels/presentation.xml.rels');
  const sections = [];
  const warnings = [];
  for (const [index, id] of ids.entries()) {
    const rel = rels.find(r => r['@_Id'] === id['@_r:id'] && r['@_Type']?.endsWith('/slide'));
    const name = relationshipTarget('ppt/presentation.xml', rel);
    let text = paragraphs(getXml(entries, name, true), 'a:p', 'a:t').join('\n');
    const relPath = path.posix.join(path.posix.dirname(name), '_rels', `${path.posix.basename(name)}.rels`);
    const notesRel = relationships(entries, relPath).find(r => r['@_Type']?.endsWith('/notesSlide'));
    if (notesRel && notesRel['@_TargetMode'] !== 'External') {
      const notes = getXml(entries, relationshipTarget(name, notesRel), true);
      const noteText = elements(notes, 'p:sp').filter(shape => {
        const type = elements(shape['p:sp'], 'p:ph')[0]?.[':@']?.['@_type'];
        return !['sldNum', 'hdr', 'ftr', 'dt'].includes(type);
      }).flatMap(shape => paragraphs(shape['p:sp'], 'a:p', 'a:t')).join('\n');
      if (noteText) text += `\nSpeaker notes:\n${noteText}`;
    }
    if (text.trim()) sections.push({ sourceType: 'slide', sourceNumber: index + 1, text: text.trim() });
    else warnings.push(`Slide ${index + 1} has no extractable text; images are not read.`);
  }
  return { sections, warnings };
}

async function word(buffer) {
  const entries = await readOfficeZip(buffer);
  const contentTypes = getXml(entries, '[Content_Types].xml');
  if (!list(contentTypes.Types?.Override).some(t => t['@_ContentType'] === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) throw new Error('Not a DOCX document.');
  const parts = paragraphs(getXml(entries, 'word/document.xml', true), 'w:p', 'w:t');
  // Paragraph traversal includes table cells at their position in the document.
  return { sections: textSections(parts.join('\n\n')), warnings: [] };
}

function textSections(text) {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const chunks = [];
  let current = '';
  for (const block of blocks) {
    if (current && current.length + block.length > 2500) { chunks.push(current.trim()); current = ''; }
    if (block.length > 4000) {
      if (current) { chunks.push(current.trim()); current = ''; }
      // Preserve all text even for very long paragraphs, with identifiable sections.
      for (let i = 0; i < block.length; i += 2500) chunks.push(block.slice(i, i + 2500));
    } else current += (current ? '\n\n' : '') + block;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(s => s.trim()).map((text, index) => ({ sourceType: 'section', sourceNumber: index + 1, text }));
}

async function pdf(buffer) {
  if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Not a PDF document.');
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false });
  try {
    const info = await parser.getInfo();
    if (info.total > 150) throw new AppError(422, 'DOCUMENT_LIMIT', 'Use PDFs with at most 150 pages.');
    const result = await parser.getText();
    const sections = [];
    const warnings = [];
    for (const page of result.pages) {
      if (page.text.trim()) sections.push({ sourceType: 'page', sourceNumber: page.num, text: page.text.trim() });
      else warnings.push(`Page ${page.num} has no extractable text; scanned images are not read.`);
    }
    return { sections, warnings };
  } finally { await parser.destroy(); }
}

export async function parseDocument(buffer, fileName) {
  if (!buffer.length) throw new AppError(422, 'EMPTY_DOCUMENT', 'This file is empty.');
  const extension = extensionOf(fileName);
  let result;
  if (extension === 'pptx') result = await powerpoint(buffer);
  else if (extension === 'pdf') result = await pdf(buffer);
  else if (extension === 'docx') result = await word(buffer);
  else if (extension === 'txt' || extension === 'md') {
    let encoding = 'utf-8';
    if (buffer[0] === 255 && buffer[1] === 254) encoding = 'utf-16le';
    if (buffer[0] === 254 && buffer[1] === 255) encoding = 'utf-16be';
    const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new Error('Not readable text.');
    result = { sections: textSections(text), warnings: [] };
  } else throw new AppError(415, 'UNSUPPORTED_FILE', 'Unsupported document type.');
  const characterCount = result.sections.reduce((sum, s) => sum + s.text.length, 0);
  if (!characterCount) throw new AppError(422, 'EMPTY_DOCUMENT', 'No readable text was found. Use a text-based file; scanned pages and slide images need OCR before uploading.');
  if (characterCount > LIMITS.textCharacters || result.sections.length > LIMITS.sections) throw new AppError(422, 'DOCUMENT_LIMIT', 'The material exceeds 80,000 extracted characters or 1,000 sections. Split it into smaller study sets; nothing has been truncated.');
  return { fileName, ...result, characterCount };
}
