import { useEffect, useRef, useState } from 'react';
import { SUBJECTS, DIFFICULTIES, QUESTION_COUNTS, LIMITS, scoreQuiz } from '../../server/shared/quiz.js';
import { requestQuiz } from './services/api.js';
import FileUpload from './components/FileUpload.jsx';
import QuizQuestion from './components/QuizQuestion.jsx';
import QuizResults from './components/QuizResults.jsx';
import './App.css';

export default function App() {
  const [settings, setSettings] = useState({ topic: '', subject: 'general', difficulty: 'beginner', questionCount: 5 });
  const [files, setFiles] = useState([]);
  const [result, setResult] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState(null);
  const activeRequest = useRef(null);
  const quizHeading = useRef(null);
  const generatorHeading = useRef(null);
  const resultsHeading = useRef(null);
  const quiz = result?.quiz;
  const answered = quiz?.questions.filter(q => answers[q.id]).length || 0;
  const score = submitted && quiz ? scoreQuiz(quiz, answers) : null;

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => { if (quiz) quizHeading.current?.focus(); }, [quiz]);
  useEffect(() => { if (submitted) resultsHeading.current?.focus(); }, [submitted]);
  function change(key, value) { setSettings(prev => ({ ...prev, [key]: value })); }
  async function generate(event) {
    event?.preventDefault();
    if (activeRequest.current) return;
    setError(null);
    if (!settings.topic.trim() && !files.length) {
      setError({ message: 'Add a topic or upload study notes to make your quiz.' });
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    try {
      const data = await requestQuiz({ ...settings, topic: settings.topic.trim() }, files, { signal: controller.signal, onStage: setStage });
      if (controller.signal.aborted) return;
      setResult(data);
      setAnswers({});
      setSubmitted(false);
      setStage('Your quiz is ready.');
    } catch (cause) {
      if (!controller.signal.aborted) setError({ message: cause.message, details: cause.details });
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }
  function cancel() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoading(false);
    setStage('Quiz cancelled. Your topic and notes are still here.');
  }
  function retrySame() {
    setAnswers({});
    setSubmitted(false);
    quizHeading.current?.focus();
  }
  function returnToGenerator() {
    setResult(null);
    setAnswers({});
    setSubmitted(false);
    setError(null);
    setStage('');
    generatorHeading.current?.focus();
  }

  return <main className="app-shell">
    <header className="page-header"><div className="brand-art"><img className="brand-bunny" src="/decor/bunny-sitting.png" alt="" aria-hidden="true" width="510" height="640" /><img className="brand-label" src="/decor/quiz-label.png" alt="AI Quiz Generator" width="640" height="228" /></div><span className="brand-note">come on in</span><h1>your little study corner</h1><p>Bring a topic or your notes, and we’ll put a quiz together.</p></header>
    {!quiz && <div className="generator-wrap"><img className="corner-bunny" src="/decor/bunny-resting.png" alt="" aria-hidden="true" width="640" height="599" /><img className="corner-cherries" src="/decor/bow-cherries.png" alt="" aria-hidden="true" width="583" height="640" /><section className="panel generator" aria-labelledby="generator-title">
      <div className="section-heading"><span className="eyebrow">your study session<img className="heading-bow" src="/decor/pink-bow.png" alt="" aria-hidden="true" width="640" height="618" /></span><h2 id="generator-title" ref={generatorHeading} tabIndex={-1}>What are we studying today?</h2><p className="helper">Choose a subject and difficulty, then add a topic or your study notes.</p></div>
      <form onSubmit={generate}>
        <fieldset disabled={loading} className="settings-fieldset"><legend className="sr-only">Quiz settings</legend>
          <div className="settings-grid">
            <div><label htmlFor="subject">Subject</label><select id="subject" value={settings.subject} onChange={e => change('subject', e.target.value)}>{Object.entries(SUBJECTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
            <div><label htmlFor="difficulty">Difficulty</label><select id="difficulty" value={settings.difficulty} onChange={e => change('difficulty', e.target.value)}>{Object.entries(DIFFICULTIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
            <div><label htmlFor="count">Questions</label><select id="count" value={settings.questionCount} onChange={e => change('questionCount', Number(e.target.value))}>{QUESTION_COUNTS.map(count => <option key={count} value={count}>{count} questions</option>)}</select></div>
          </div>
          <label htmlFor="topic">Topic <span className="optional">optional with notes</span></label>
          <input id="topic" value={settings.topic} onChange={e => change('topic', e.target.value)} maxLength={LIMITS.topicCharacters} placeholder="e.g. Operating Systems or Leader Election" aria-describedby="topic-help" />
          <p id="topic-help" className="helper">A topic works on its own. Add notes if you’d like us to follow them.</p>
          <FileUpload files={files} onChange={setFiles} disabled={loading} />
        </fieldset>
        <button className="generate-button" type="submit" disabled={loading}>{loading ? 'Making your quiz...' : 'make my quiz'}</button>
      </form>
    </section></div>}
    {loading && <div className="panel loading-panel" role="status" aria-live="polite" aria-busy="true"><span className="spinner" aria-hidden="true" /><p>{stage}</p><p className="helper">Longer documents may take a couple of minutes.</p><button className="text-button" onClick={cancel}>Cancel</button></div>}
    {!loading && stage && <p className="sr-only" role="status">{stage}</p>}
    {error && <div className="error" role="alert"><strong>Let’s check that</strong><p>{error.message}</p>
      {Array.isArray(error.details?.failedFiles) && <ul>{error.details.failedFiles.map((file, index) => <li key={index}><strong>{file.fileName}:</strong> {file.message}</li>)}</ul>}
      {Array.isArray(error.details?.processedFiles) && !!error.details.processedFiles.length && <p>Files we could read: {error.details.processedFiles.join(', ')}. These will be included when you try again.</p>}
      <div className="actions"><button className="secondary" disabled={loading} onClick={generate}>let’s try again</button>{quiz && <button className="text-button" onClick={returnToGenerator}>edit my topic & notes</button>}</div>
    </div>}
    {quiz && !loading && <div className="quiz-session">
      <section className="panel quiz-heading"><img className="quiz-bunny" src="/decor/bunny-sitting.png" alt="" aria-hidden="true" width="510" height="640" /><span className="eyebrow">{quiz.subject} · {DIFFICULTIES[quiz.difficulty]}</span><h2 ref={quizHeading} tabIndex={-1}>{quiz.title}</h2>
        <p>{quiz.questions.length} questions{result.metadata.sourceMode === 'materials' ? ` · Based on ${result.metadata.documents.length} study ${result.metadata.documents.length === 1 ? 'file' : 'files'}` : ' · Topic practice'}</p>
        <label htmlFor="quiz-progress">{answered} of {quiz.questions.length} answered</label><progress id="quiz-progress" value={answered} max={quiz.questions.length} />
        {!!result.metadata.warnings.length && <details className="source-notice"><summary>Study material notes ({result.metadata.warnings.length})</summary><ul>{result.metadata.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      </section>
      {score && <div ref={resultsHeading} tabIndex={-1}><QuizResults score={score} onRetry={retrySame} onGenerate={generate} onReturn={returnToGenerator} /></div>}
      <form onSubmit={event => { event.preventDefault(); setSubmitted(true); }}>
        {quiz.questions.map((q, index) => <QuizQuestion key={q.id} question={q} number={index + 1} answer={answers[q.id]} submitted={submitted} onSelect={(id, answer) => { if (!submitted) setAnswers(prev => ({ ...prev, [id]: answer })); }} />)}
        {!submitted && <section className="panel submit-panel"><p>{answered < quiz.questions.length ? `${quiz.questions.length - answered} unanswered ${quiz.questions.length - answered === 1 ? 'question' : 'questions'} will count as incorrect.` : 'You’ve answered every question. Ready to check them?'}</p><div className="actions"><button type="submit">check my answers</button><button className="text-button" type="button" onClick={returnToGenerator}>back to the study corner</button></div></section>}
      </form>
      {submitted && <div className="actions bottom-actions"><button className="secondary" onClick={retrySame}>Try this quiz again</button><button className="text-button" onClick={returnToGenerator}>back to the study corner</button></div>}
    </div>}
    <footer><img src="/decor/ribbon-books.png" alt="" aria-hidden="true" width="640" height="583" /><p>See you at the next study session.</p></footer>
  </main>;
}
