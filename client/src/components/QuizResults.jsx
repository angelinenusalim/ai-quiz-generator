export default function QuizResults({ score, onRetry, onGenerate, onReturn }) {
  return <section className="panel results" aria-labelledby="results-title" role="status">
    <span className="eyebrow">Your study session</span>
    <h2 id="results-title">You scored {score.correct}/{score.total} — {score.percentage}%!</h2>
    <p>{score.correct === score.total ? 'Beautiful work! You got every question right.' : 'Every question is a chance to learn. Review the explanations and give it another try.'}</p>
    <div className="score-grid"><div><strong>{score.correct}</strong><span>Correct</span></div><div><strong>{score.incorrect}</strong><span>Incorrect</span></div><div><strong>{score.unanswered}</strong><span>Unanswered</span></div></div>
    <p className="helper">Unanswered questions count as incorrect in your score.</p>
    <div className="actions"><button onClick={onRetry}>Retry same quiz</button><button className="secondary" onClick={onGenerate}>Generate new quiz</button><button className="text-button" onClick={onReturn}>Return to generator</button></div>
  </section>;
}
