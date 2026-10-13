import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const quiz = {
  title: 'Operating Systems', subject: 'Computer Science', difficulty: 'intermediate',
  questions: Array.from({ length: 10 }, (_, n) => ({
    id: `q${n + 1}`, question: `How does operating-system concept ${n + 1} work?`, type: 'multiple_choice',
    options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: `${id} choice for question ${n + 1}` })),
    correctAnswer: 'B', explanation: `Explanation for concept ${n + 1}.`, sourceReference: null,
  })),
};
const payload = { quiz, metadata: { sourceMode: 'topic', documents: [], warnings: [] } };
const response = (data = payload, ok = true) => ({ ok, status: ok ? 200 : 422, json: async () => structuredClone(data) });
async function startQuiz(user) {
  await user.type(screen.getByLabelText(/Topic/), 'Operating Systems');
  await user.selectOptions(screen.getByLabelText('Subject'), 'cs');
  await user.selectOptions(screen.getByLabelText('Difficulty'), 'intermediate');
  await user.selectOptions(screen.getByLabelText('Questions'), '10');
  await user.click(screen.getByRole('button', { name: /make my quiz/ }));
  await screen.findByRole('heading', { name: 'Operating Systems' });
}
afterEach(() => vi.unstubAllGlobals());
describe('quiz user flows', () => {
  it('sends separate settings, hides answers until submission, locks answers, retries and resets', async () => {
    const fetch = vi.fn(async () => response()); vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup(); render(<App />); await startQuiz(user);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ topic: 'Operating Systems', subject: 'cs', difficulty: 'intermediate', questionCount: 10 });
    expect(screen.queryByText(/Explanation for concept 1\./)).not.toBeInTheDocument();
    const groups = screen.getAllByRole('group');
    await user.click(within(groups[0]).getAllByRole('radio')[1]);
    await user.click(within(groups[1]).getAllByRole('radio')[0]);
    expect(screen.getByText('2 of 10 answered')).toBeInTheDocument();
    expect(screen.getByText('8 unanswered questions will count as incorrect.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'check my answers' }));
    expect(screen.getByText('You scored 1 out of 10 (10%).')).toBeInTheDocument();
    expect(screen.getByText('Explanation for concept 1.')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').every(r => r.matches(':disabled'))).toBe(true);
    await user.click(screen.getAllByRole('button', { name: 'Try this quiz again' })[0]);
    expect(screen.getByText('0 of 10 answered')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').every(r => !r.checked && !r.matches(':disabled'))).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'back to the study corner' }));
    expect(screen.getByLabelText(/Topic/)).toHaveValue('Operating Systems');
    expect(screen.getByLabelText('Questions')).toHaveValue('10');
  });
  it('scores all correct and regenerates with retained settings', async () => {
    const fetch = vi.fn(async () => response()); vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup(); render(<App />); await startQuiz(user);
    for (const group of screen.getAllByRole('group')) await user.click(within(group).getAllByRole('radio')[1]);
    await user.click(screen.getByRole('button', { name: 'check my answers' }));
    expect(screen.getByText('You scored 10 out of 10 (100%).')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'make a fresh quiz' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText('0 of 10 answered')).toBeInTheDocument();
  });
  it('validates an empty form and allows file-only multipart generation', async () => {
    const grounded = structuredClone(payload); grounded.quiz.subject = 'General Knowledge'; grounded.quiz.difficulty = 'beginner'; grounded.quiz.questions = grounded.quiz.questions.slice(0, 5);
    grounded.metadata = { sourceMode: 'materials', documents: [{ fileName: 'lecture.pptx' }], warnings: [] };
    const fetch = vi.fn(async () => response(grounded)); vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole('button', { name: /make my quiz/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a topic or upload study notes');
    expect(fetch).not.toHaveBeenCalled();
    const file = new File(['lecture contents'], 'lecture.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    await user.upload(screen.getByLabelText('Study materials'), file);
    expect(screen.getByText('lecture.pptx')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /make my quiz/ }));
    await screen.findByRole('heading', { name: 'Operating Systems' });
    const body = fetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('topic')).toBe('');
    expect(body.getAll('files')[0].name).toBe('lecture.pptx');
  });
  it('rejects invalid uploads and supports file removal and clear all', async () => {
    const user = userEvent.setup({ applyAccept: false }); render(<App />);
    await user.upload(screen.getByLabelText('Study materials'), [new File(['bad'], 'virus.exe'), new File(['notes'], 'notes.txt', { type: 'text/plain' }), new File(['more'], 'more.md', { type: 'text/markdown' })]);
    expect(screen.getByRole('alert')).toHaveTextContent('virus.exe was not added');
    await user.click(screen.getByRole('button', { name: 'Remove notes.txt' }));
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'clear my notes' }));
    expect(screen.queryByText('more.md')).not.toBeInTheDocument();
  });
  it('combines a topic and notes without requiring another input', async () => {
    const grounded = structuredClone(payload);
    grounded.metadata = { sourceMode: 'materials', documents: [{ fileName: 'notes.txt' }], warnings: [] };
    const fetch = vi.fn(async () => response(grounded)); vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup(); render(<App />);
    await user.upload(screen.getByLabelText('Study materials'), new File(['Leader election uses a quorum.'], 'notes.txt', { type: 'text/plain' }));
    await startQuiz(user);
    const body = fetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('topic')).toBe('Operating Systems');
    expect(body.get('subject')).toBe('cs');
    expect(body.get('difficulty')).toBe('intermediate');
    expect(body.getAll('files')[0].name).toBe('notes.txt');
  });
  it('shows network errors and recovers by retrying', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup(); render(<App />);
    await user.type(screen.getByLabelText(/Topic/), 'Operating Systems');
    await user.selectOptions(screen.getByLabelText('Subject'), 'cs'); await user.selectOptions(screen.getByLabelText('Difficulty'), 'intermediate'); await user.selectOptions(screen.getByLabelText('Questions'), '10');
    await user.click(screen.getByRole('button', { name: /make my quiz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the quiz server');
    await user.click(screen.getByRole('button', { name: 'let’s try again' }));
    await screen.findByRole('heading', { name: 'Operating Systems' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('does not render an incomplete response as a successful quiz', async () => {
    const invalid = structuredClone(payload); invalid.quiz.questions = [];
    vi.stubGlobal('fetch', vi.fn(async () => response(invalid)));
    const user = userEvent.setup(); render(<App />);
    await user.type(screen.getByLabelText(/Topic/), 'Operating Systems');
    await user.click(screen.getByRole('button', { name: /make my quiz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match the requested settings');
    expect(screen.queryByRole('button', { name: 'check my answers' })).not.toBeInTheDocument();
  });
  it('prevents duplicate generation and ignores a cancelled response', async () => {
    let resolve;
    const fetch = vi.fn(() => new Promise(r => { resolve = r; })); vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup(); render(<App />);
    await user.type(screen.getByLabelText(/Topic/), 'Operating Systems');
    await user.click(screen.getByRole('button', { name: /make my quiz/ }));
    expect(screen.getByRole('button', { name: /Making your quiz/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    resolve(response());
    await waitFor(() => expect(screen.getByRole('button', { name: /make my quiz/ })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'check my answers' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
