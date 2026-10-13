export default function QuizResults({ score, onRetry, onGenerate, onReturn }) {
  const message = score.correct === score.total
    ? "Every answer correct. Nicely done."
    : score.percentage >= 70
      ? 'Nicely done. The explanations can help with the ones you missed.'
      : 'Take a look at the explanations before trying again. You can work through them at your own pace.';
  return <section className="panel results" aria-labelledby="results-title" role="status">
    <img className="results-bunny" src="/decor/bunny-resting.png" alt="" aria-hidden="true" width="640" height="599" />
    <span className="eyebrow">your study session</span>
    <h2 id="results-title">Here’s how you did</h2>
    <p className="score-summary">You scored {score.correct} out of {score.total} ({score.percentage}%).</p>
    <p>{message}</p>
    <div className="score-grid"><div><strong>{score.correct}</strong><span>Correct</span></div><div><strong>{score.incorrect}</strong><span>Incorrect</span></div><div><strong>{score.unanswered}</strong><span>Unanswered</span></div></div>
    <p className="helper">Unanswered questions count as incorrect in your score.</p>
    <div className="actions"><button onClick={onRetry}>Try this quiz again</button><button className="secondary" onClick={onGenerate}>make a fresh quiz</button><button className="text-button" onClick={onReturn}>back to the study corner</button></div>
  </section>;
}
