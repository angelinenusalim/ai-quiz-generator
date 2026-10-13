export default function QuizQuestion({ question, number, answer, submitted, onSelect }) {
  const source = question.sourceReference;
  const status = !answer ? 'Unanswered' : answer === question.correctAnswer ? 'Correct' : 'Incorrect';
  return <fieldset className="question-card" disabled={submitted}>
    <legend><span className="eyebrow">Question {number}</span><span className="question-text">{question.question}</span></legend>
    {source && <p className="source">Source: {source.fileName}, {source.sourceType} {source.sourceNumber}</p>}
    <div className="options">{question.options.map(option => {
      const selected = answer === option.id;
      const correct = submitted && question.correctAnswer === option.id;
      const incorrect = submitted && selected && !correct;
      return <label key={option.id} className={`option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''}`}>
        <input type="radio" name={`answer-${question.id}`} value={option.id} checked={selected} onChange={() => onSelect(question.id, option.id)} />
        <span className="option-letter">{option.id}</span><span className="option-text">{option.text}</span>
        {correct && <span className="answer-label">Correct answer</span>}
        {incorrect && <span className="answer-label">Your answer</span>}
      </label>;
    })}</div>
    {submitted && <div className="explanation"><strong>{status}{!answer ? ', counts as incorrect' : ''}</strong><p>{question.explanation}</p>
      {source && <blockquote>“{source.sourceQuote}”</blockquote>}
    </div>}
  </fieldset>;
}
