import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseInWorker, processDocuments } from '../documents/index.js';
import { parseDocument } from '../documents/parser.js';
import { pptx, pdf, docx, studyText } from './fixtures.js';

test('PPTX extracts presentation order, slide numbers, and speaker notes', async () => {
  const document = await parseDocument(await pptx(), 'lecture.pptx');
  assert.equal(document.sections.length, 2);
  assert.equal(document.sections[0].sourceNumber, 1);
  assert.match(document.sections[0].text, /replication/);
  assert.match(document.sections[0].text, /Speaker notes:/);
  assert.match(document.sections[1].text, /quorum/);
});
test('PDF extracts actual text in page order with page numbers', async () => {
  const document = await parseInWorker({ buffer: await pdf(), originalname: 'notes.pdf' });
  assert.equal(document.sections.length, 2);
  assert.equal(document.sections[1].sourceNumber, 2);
  assert.match(document.sections[0].text, /Distributed systems/);
  assert.match(document.sections[1].text, /Page two/);
});
test('DOCX preserves paragraphs and table content in reading order', async () => {
  const document = await parseDocument(await docx(), 'notes.docx');
  const text = document.sections.map(s => s.text).join('\n');
  assert.ok(text.indexOf('First paragraph') < text.indexOf('Table cell'));
  assert.ok(text.indexOf('Table cell') < text.indexOf('Distributed systems'));
});
test('text and Markdown preserve headings, UTF-8, UTF-16, and all chunks', async () => {
  for (const name of ['notes.txt', 'notes.md']) {
    const document = await parseDocument(Buffer.from('# Study notes\n\n你好\n\n' + studyText), name);
    assert.match(document.sections[0].text, /# Study notes/);
    assert.match(document.sections[0].text, /你好/);
  }
  const unicode = await parseDocument(Buffer.concat([Buffer.from([255, 254]), Buffer.from(studyText, 'utf16le')]), 'utf16.txt');
  assert.match(unicode.sections[0].text, /replication/);
  const long = await parseDocument(Buffer.from('a'.repeat(10_001)), 'long.txt');
  assert.equal(long.sections.reduce((sum, s) => sum + s.text.length, 0), 10_001);
});
test('empty, image-only, corrupted, mislabeled, binary and invalid UTF-8 documents fail', async () => {
  for (const [buffer, name] of [[Buffer.alloc(0), 'empty.txt'], [Buffer.from('  \n'), 'blank.md'], [await pptx({ empty: true }), 'blank.pptx'], [await pdf({ empty: true }), 'scan.pdf'], [Buffer.from('broken'), 'bad.pdf'], [Buffer.from('broken'), 'bad.pptx'], [await docx(), 'fake.pptx'], [Buffer.from([0, 1, 2]), 'binary.txt'], [Buffer.from([255, 255]), 'bad.txt']]) {
    await assert.rejects(parseInWorker({ buffer, originalname: name }), e => e.status === 422 && !e.message.includes('at parse'));
  }
});
test('XML entity declarations and malformed archives are rejected', async () => {
  const zip = await JSZip.loadAsync(await pptx());
  zip.file('ppt/presentation.xml', '<!DOCTYPE foo [<!ENTITY attack SYSTEM "file:///etc/passwd">]><foo>&attack;</foo>');
  await assert.rejects(parseInWorker({ buffer: await zip.generateAsync({ type: 'nodebuffer' }), originalname: 'attack.pptx' }));
});
test('large extracted text is rejected explicitly rather than truncated', async () => {
  await assert.rejects(parseInWorker({ buffer: Buffer.from('x'.repeat(1_000_001)), originalname: 'large.txt' }), e => e.message.includes('nothing has been truncated'));
});
test('combined extracted text limits are enforced even when individual files fit', async () => {
  const files = Array.from({ length: 3 }, (_, n) => ({ buffer: Buffer.from('a'.repeat(700_000)), originalname: `${n}.txt` }));
  await assert.rejects(processDocuments(files), e => e.code === 'MATERIAL_LIMIT');
  assert.ok(files.every(file => !file.buffer));
});
test('Office decompression and XML-part limits stop oversized archives', async () => {
  const xml = await JSZip.loadAsync(await pptx());
  xml.file('ppt/slides/slide2.xml', '<p>' + 'x'.repeat(5 * 1024 * 1024) + '</p>');
  await assert.rejects(parseInWorker({ buffer: await xml.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), originalname: 'large.pptx' }), e => e.code === 'DOCUMENT_LIMIT');
  const archive = await JSZip.loadAsync(await pptx());
  archive.file('ppt/media/expanded.bin', Buffer.alloc(41 * 1024 * 1024));
  await assert.rejects(parseInWorker({ buffer: await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), originalname: 'expanded.pptx' }), e => e.code === 'DOCUMENT_LIMIT');
});
test('worker timeout terminates processing', async () => {
  await assert.rejects(parseInWorker({ buffer: await pptx(), originalname: 'lecture.pptx' }, { timeoutMs: 1 }), e => e.code === 'DOCUMENT_TIMEOUT');
});
test('multiple documents receive unique source IDs and release upload buffers', async () => {
  const files = [{ buffer: await pptx(), originalname: 'lecture.pptx' }, { buffer: await pdf(), originalname: 'notes.pdf' }];
  const docs = await processDocuments(files);
  assert.equal(docs.length, 2);
  assert.equal(new Set(docs.flatMap(d => d.sections.map(s => s.sectionId))).size, 4);
  assert.ok(files.every(f => f.buffer === undefined));
});
test('one failed file rejects the batch, reports successful files, and frees buffers', async () => {
  const files = [{ buffer: Buffer.from(studyText), originalname: 'notes.txt' }, { buffer: Buffer.from('broken'), originalname: 'bad.pptx' }];
  await assert.rejects(processDocuments(files), e => e.code === 'DOCUMENT_PROCESSING_FAILED' && e.details.failedFiles[0].fileName === 'bad.pptx' && e.details.processedFiles[0] === 'notes.txt');
  assert.ok(files.every(f => f.buffer === undefined));
});
