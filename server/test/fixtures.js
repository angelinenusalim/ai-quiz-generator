import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { SUBJECTS } from '../shared/quiz.js';

export const studyText = `Distributed systems use replication to improve availability when nodes fail.
A leader coordinates updates so replicas agree on the order of operations.
Leader election selects a new coordinator after a failure.
Heartbeats allow nodes to detect that a leader may be unavailable.
A timeout is a suspicion of failure, not proof that a node has crashed.
A quorum requires votes from a majority, preventing two disjoint majorities.
Terms distinguish elections and let replicas reject stale leaders.
Retries can cause duplicate requests when a reply is lost.
Idempotent operations produce the same result when repeated.
Request identifiers let a server recognize duplicate work.
Consensus lets participants agree on one value despite some failures.
A network partition prevents groups of nodes from communicating.
Logs record operations so replicas can replay them in order.
Checkpoints reduce recovery work by saving application state.
Consistency concerns which values reads are allowed to observe.
Latency measures how long a request takes to complete.
Throughput measures the number of requests completed per second.
Load balancing spreads requests across multiple servers.
Caching reduces repeated work but requires a strategy for stale data.
Fault tolerance keeps a service useful when components fail.`;
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const slide = text => `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${text.split('\n').map(p => `<a:p><a:r><a:t>${escape(p)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

export async function pptx({ empty = false } = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>');
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="r2"/><p:sldId id="257" r:id="r1"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>');
  zip.file('ppt/slides/slide2.xml', slide(empty ? '' : studyText));
  zip.file('ppt/slides/slide1.xml', slide(empty ? '' : 'Leader election requires a quorum before a new leader can commit updates.'));
  if (!empty) {
    zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships><Relationship Id="notes1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>');
    zip.file('ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker reminder: a lost heartbeat can also mean a slow network.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>');
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
export async function pdf({ empty = false } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage();
  if (!empty) {
    first.drawText(studyText, { x: 30, y: 780, font, size: 10, lineHeight: 24 });
    doc.addPage().drawText('Page two: leader election uses terms to reject stale leaders.', { x: 30, y: 750, font, size: 10 });
  }
  return Buffer.from(await doc.save());
}
export async function longPdf({ pages = 180 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index++) {
    const band = Math.min(2, Math.floor(index * 3 / pages));
    const concept = [
      'Replication improves availability by keeping copies of data on multiple nodes.',
      'A quorum requires a majority of votes, preventing disjoint groups from electing conflicting leaders.',
      'Idempotency prevents duplicate work by recognising repeated request identifiers.',
    ][band];
    doc.addPage().drawText(`Lecture page ${index + 1}\n${concept.match(/.{1,70}(?:\s|$)/g).join('\n')}\n\n${studyText.split('\n').slice(band * 7, band === 2 ? 20 : (band + 1) * 7).join('\n')}\n\n${studyText.split('\n').slice(band * 7, band === 2 ? 20 : (band + 1) * 7).join('\n')}\n\n${index === pages - 1 ? 'Final concept: checkpoints save state to reduce recovery work.' : 'Compare the concepts and consider how nodes recover after failure.'}`, { x: 30, y: 780, font, size: 9, lineHeight: 22 });
  }
  return Buffer.from(await doc.save());
}
export async function docx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>First paragraph</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table cell about replication</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>${escape(studyText)}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
export function quizFixture(settings, documents = []) {
  return {
    title: settings.topic || 'Distributed Systems', subject: SUBJECTS[settings.subject], difficulty: settings.difficulty,
    questions: Array.from({ length: settings.questionCount }, (_, index) => {
      const document = documents.length ? documents[index % documents.length] : null;
      const section = document?.sections[index % document.sections.length];
      const options = ['A', 'B', 'C', 'D'].map((id, n) => ({ id, text: `Answer choice ${n + 1} for concept ${index + 1}` }));
      return {
        id: `q${index + 1}`, question: `How does concept ${index + 1} apply to ${settings.topic || 'distributed systems'}?`, type: 'multiple_choice', options,
        correctAnswer: options[index % 4].id, explanation: `Concept ${index + 1} supports reliable distributed operations.`,
        sourceReference: document ? { sectionId: section.sectionId, fileName: document.fileName, sourceType: section.sourceType, sourceNumber: section.sourceNumber, sourceQuote: section.text.slice(0, 70) } : null,
      };
    }),
  };
}
export function completedResponse(quiz) { return { status: 'completed', output: [], output_text: JSON.stringify({ status: 'ready', reason: null, quiz: { ...quiz, questions: quiz.questions.map(q => ({ ...q, sourceReference: null })) } }) }; }
export function mockClient(handler) { return { responses: { create: handler } }; }
