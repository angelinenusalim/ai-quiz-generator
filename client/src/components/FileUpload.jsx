import { useRef, useState } from 'react';
import { FILE_TYPES, LIMITS, extensionOf } from '../../../server/shared/quiz.js';

const formatSize = bytes => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export default function FileUpload({ files, onChange, disabled }) {
  const input = useRef(null);
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  function addFiles(incoming) {
    if (disabled) return;
    const next = [...files];
    const problems = [];
    for (const file of Array.from(incoming)) {
      const allowed = FILE_TYPES[extensionOf(file.name)];
      if (!allowed || (file.type && file.type !== 'application/octet-stream' && !allowed.includes(file.type))) problems.push(`${file.name} was not added: use PPTX, PDF, DOCX, TXT, or MD.`);
      else if (!file.size) problems.push(`${file.name} was not added: this file is empty.`);
      else if (file.size > LIMITS.fileBytes) problems.push(`${file.name} was not added: the limit is 10 MB per file.`);
      else if (file.name.length > 150) problems.push('A file was not added: shorten its name to 150 characters.');
      else if (next.some(f => f.name === file.name)) problems.push(`${file.name} was not added: a file with this name is already selected.`);
      else if (next.length >= LIMITS.files) problems.push(`${file.name} was not added: select at most 5 files.`);
      else if (next.reduce((sum, f) => sum + f.size, file.size) > LIMITS.totalBytes) problems.push(`${file.name} was not added: the total limit is 25 MB.`);
      else next.push(file);
    }
    onChange(next);
    setErrors(problems);
  }
  return (
    <section className="upload-section" aria-labelledby="upload-title">
      <h2 id="upload-title">Upload Your Study Materials <span className="optional">optional</span></h2>
      <p className="helper">Upload your lecture slides, notes, or readings, and let AI turn them into a personalized quiz.</p>
      <div className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
        <span className="upload-icon" aria-hidden="true">↑</span>
        <p>Drop your study files here</p>
        <button type="button" className="secondary" disabled={disabled} onClick={() => input.current.click()}>Browse files</button>
        <input ref={input} className="sr-only" tabIndex={-1} aria-label="Study materials" type="file" multiple accept=".pptx,.pdf,.docx,.txt,.md" disabled={disabled}
          onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
        <p className="helper upload-limits">PPTX, PDF, DOCX, TXT, MD · 5 files max<br />10 MB per file · 25 MB total</p>
      </div>
      <p className="helper privacy-note">Files are processed temporarily. Extracted text is sent to OpenAI to create your quiz. Scanned pages and images need OCR first.</p>
      {!!errors.length && <div className="error compact" role="alert"><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
      {!!files.length && <>
        <div className="file-list-heading"><span>{files.length} {files.length === 1 ? 'file' : 'files'} selected</span><button type="button" className="text-button" disabled={disabled} onClick={() => { onChange([]); setErrors([]); }}>Clear all files</button></div>
        <ul className="file-list">{files.map(file => <li key={file.name}>
          <span className="file-type" aria-hidden="true">{extensionOf(file.name).toUpperCase()}</span>
          <div className="file-info"><strong>{file.name}</strong><span>{formatSize(file.size)}</span></div>
          <button type="button" className="remove-file" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onChange(files.filter(f => f !== file))}>×</button>
        </li>)}</ul>
      </>}
    </section>
  );
}
