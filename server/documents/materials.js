import { LIMITS } from '../shared/quiz.js';

const stopwords = new Set('the and for with that this from are was were have has into can may will their they which each when then than also about your you not but its our using used use these those'.split(' '));
const terms = text => (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(t => !stopwords.has(t));
const encodedLength = value => JSON.stringify(value).length;

// Extractive selection only: no generated summaries, extra API calls, or changed quotes.
// Every section is examined, including those outside the final model context.
export function selectMaterials(documents, topic = '', budget = LIMITS.contextCharacters) {
  if (!documents.length) return [];
  // Keep all text in small files while making every citable passage short enough
  // to attach verbatim. Fragment IDs retain the original page/slide/section number.
  documents = documents.map(d => ({ ...d, originalSectionCount: d.sections.length, sections: d.sections.flatMap(section => {
    if (section.text.length <= 1500) return [section];
    const passages = [];
    for (let start = 0; start < section.text.length; start += 1500) {
      passages.push({ ...section, sectionId: `${section.sectionId}p${passages.length + 1}`, text: section.text.slice(start, start + 1500) });
    }
    return passages;
  }) }));
  const allowance = Math.floor((budget - 2) / documents.length) - 1;
  return documents.map(document => {
    const full = { fileName: document.fileName, sections: document.sections };
    if (encodedLength(full) <= allowance) return { ...document, selection: { applied: false, selectedSections: document.sections.length, chunkCount: 1 } };
    const frequencies = new Map();
    for (const section of document.sections) {
      for (const term of new Set(terms(section.text))) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    }
    const topicTerms = new Set(terms(topic));
    const chunks = [];
    let chunk = [], chunkChars = 0;
    for (const [index, section] of document.sections.entries()) {
      // Score exact passages, favouring definitions, explanatory text, and topic terms.
      let best;
      for (let start = 0; start < section.text.length; start += 1400) {
        const text = section.text.slice(start, start + 1500);
        const unique = new Set(terms(text));
        const relevance = [...unique].filter(t => topicTerms.has(t)).length;
        const information = [...unique].reduce((sum, t) => sum + Math.log(1 + document.sections.length / (frequencies.get(t) || 1)), 0);
        const score = relevance * 1000 + information + (/\b(?:means|defined|because|requires|therefore|prevents|example|compared|unlike)\b/i.test(text) ? 20 : 0);
        const candidate = { ...section, text, coverageBand: ['beginning', 'middle', 'end'][Math.min(2, Math.floor(index * 3 / document.sections.length))], index, score };
        if (!best || score > best.score) best = candidate;
      }
      if (best) chunk.push(best);
      chunkChars += section.text.length;
      if (chunk.length >= 10 || chunkChars >= 12_000) { chunks.push(chunk); chunk = []; chunkChars = 0; }
    }
    if (chunk.length) chunks.push(chunk);
    const candidates = chunks.flat();
    const chosen = new Map();
    const publicSection = candidate => { const section = { ...candidate }; delete section.index; delete section.score; return section; };
    let size = encodedLength({ fileName: document.fileName, sections: [] });
    function add(candidate) {
      if (!candidate || chosen.has(candidate.sectionId)) return;
      const section = publicSection(candidate);
      const cost = encodedLength(section) + 1;
      if (size + cost <= allowance) { chosen.set(candidate.sectionId, section); size += cost; }
    }
    const ranked = list => [...list].sort((a, b) => b.score - a.score || a.index - b.index);
    // Anchors and bands preserve coverage even when the document is mostly repetitive.
    add(candidates[0]); add(candidates.at(-1));
    for (const band of ['beginning', 'middle', 'end']) add(ranked(candidates.filter(c => c.coverageBand === band))[0]);
    const slots = Math.max(1, Math.floor((allowance - size) / 1800));
    if (topicTerms.size) for (const candidate of ranked(candidates).slice(0, Math.ceil(slots / 2))) add(candidate);
    // Stratified chunk sampling reaches the entire document instead of taking its prefix.
    for (let i = 0; i < slots; i++) {
      const n = slots === 1 ? Math.floor(chunks.length / 2) : Math.round(i * (chunks.length - 1) / (slots - 1));
      add(ranked(chunks[n])[0]);
    }
    for (const candidate of ranked(candidates)) add(candidate);
    const sections = [...chosen.values()].sort((a, b) => a.sourceNumber - b.sourceNumber);
    return { ...document, sections, selection: { applied: true, selectedSections: sections.length, chunkCount: chunks.length } };
  });
}

export function planQuestions(settings, documents) {
  if (!documents.length) return [];
  const plans = [];
  const used = new Set();
  const focus = new Set(terms(settings.topic));
  const choose = sections => {
    let readable = sections.filter(s => s.text.trim().length >= 15);
    const relevance = s => [...new Set(terms(s.text))].filter(t => focus.has(t)).length;
    if (focus.size && readable.some(s => relevance(s) > 0)) readable = readable.filter(s => relevance(s) > 0);
    return readable.sort((a, b) => {
      return Number(used.has(a.sectionId)) - Number(used.has(b.sectionId)) || relevance(b) - relevance(a) || b.text.length - a.text.length;
    })[0];
  };
  const add = (document, sections = document.sections) => {
    const section = choose(sections);
    if (!section || plans.length >= settings.questionCount) return;
    used.add(section.sectionId);
    plans.push({ id: `q${plans.length + 1}`, fileName: document.fileName, sectionId: section.sectionId });
  };
  if (!settings.topic) {
    for (const [index, document] of documents.entries()) {
      const band = ['beginning', 'middle', 'end'][index % 3];
      add(document, document.selection.applied ? document.sections.filter(s => s.coverageBand === band) : document.sections);
    }
    if (settings.questionCount >= documents.length * 3) {
      for (const document of documents.filter(d => d.selection.applied)) {
        const represented = new Set(plans.filter(p => p.fileName === document.fileName).map(p => document.sections.find(s => s.sectionId === p.sectionId).coverageBand));
        for (const band of ['beginning', 'middle', 'end']) if (!represented.has(band)) add(document, document.sections.filter(s => s.coverageBand === band));
      }
    }
    // When there are too few questions for three per file, cover the study set
    // across all three bands as far as the requested count permits.
    const represented = new Set(plans.map(p => documents.find(d => d.fileName === p.fileName).sections.find(s => s.sectionId === p.sectionId).coverageBand));
    for (const band of ['beginning', 'middle', 'end']) {
      const document = documents.find(d => d.selection.applied && d.sections.some(s => s.coverageBand === band));
      if (document && !represented.has(band)) add(document, document.sections.filter(s => s.coverageBand === band));
    }
  }
  while (plans.length < settings.questionCount) {
    const before = plans.length;
    if (settings.topic) {
      const all = documents.flatMap(d => d.sections.map(s => ({ ...s, fileName: d.fileName })));
      const section = choose(all);
      if (section) add(documents.find(d => d.fileName === section.fileName), [section]);
    } else add(documents[plans.length % documents.length]);
    if (plans.length === before) break;
  }
  return plans;
}
