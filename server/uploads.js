import multer from 'multer';
import { FILE_TYPES, LIMITS, extensionOf } from './shared/quiz.js';
import { AppError } from './errors.js';

export function safeFileName(name) {
  // Browsers submit UTF-8 names in multipart headers; Multer decodes them as latin1.
  const decoded = /[^\x00-\x7F]/.test(name) && !/[\u0100-\uFFFF]/.test(name) ? Buffer.from(name, 'latin1').toString('utf8') : name;
  const result = decoded.split(/[\\/]/).pop().replace(/[\x00-\x1F\x7F]/g, '').normalize('NFC');
  if (!result || result.length > 150 || result.includes('\uFFFD')) throw new AppError(400, 'INVALID_FILENAME', 'Use a file name shorter than 150 characters.');
  return result;
}

const storage = {
  _handleFile(req, file, callback) {
    const chunks = [];
    let size = 0;
    let finished = false;
    const done = (error, result) => { if (!finished) { finished = true; callback(error, result); } };
    file.stream.on('data', chunk => {
      size += chunk.length;
      req.uploadBytes = (req.uploadBytes || 0) + chunk.length;
      if (req.uploadBytes > LIMITS.totalBytes) {
        chunks.length = 0;
        done(new AppError(413, 'UPLOAD_TOO_LARGE', 'Upload at most 25 MB in total.'));
      } else if (!finished) chunks.push(chunk);
    });
    file.stream.on('error', error => { chunks.length = 0; done(error); });
    file.stream.on('end', () => done(null, { buffer: Buffer.concat(chunks), size }));
  },
  _removeFile(req, file, callback) { delete file.buffer; callback(null); },
};
export const upload = multer({
  storage,
  limits: { fileSize: LIMITS.fileBytes, files: LIMITS.files, fields: 4, fieldSize: 1024, parts: 9 },
  fileFilter(req, file, callback) {
    try {
      file.originalname = safeFileName(file.originalname);
      const allowed = FILE_TYPES[extensionOf(file.originalname)];
      if (!allowed || (!allowed.includes(file.mimetype) && file.mimetype !== 'application/octet-stream')) {
        throw new AppError(415, 'UNSUPPORTED_FILE', `${file.originalname}: use PPTX, PDF, DOCX, TXT, or Markdown files with a matching file type.`);
      }
      callback(null, true);
    } catch (error) { callback(error); }
  },
}).array('files', LIMITS.files);
