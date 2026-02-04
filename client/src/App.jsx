import ReactMarkdown from "react-markdown";
import { useState } from "react";
import "./App.css";


export default function App() {
  const [topic, setTopic] = useState("");
  const [quiz, setQuiz] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("general");
  const [selectedLevel, setSelectedLevel] = useState("beginner");
  const [userAnswers, setUserAnswers] = useState({});
  const [showAnswers, setShowAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [showScore, setShowScore] = useState(false);

  const subjects = {
    general: { name: "General Knowledge" },
    math: { name: "Mathematics" },
    cs: { name: "Computer Science" },
    physics: { name: "Physics" },
    biology: { name: "Biology" },
    chemistry: { name: "Chemistry" },
    english: { name: "English" },
    mandarin: { name: "Mandarin" },
    geography: { name: "Geography" },
    psychology: { name: "Psychology" },
    history: { name: "History" }
  };

  const levels = {
    beginner: "Beginner",
    intermediate: "Intermediate", 
    advanced: "Advanced"
  };

  async function generateQuiz() {
    if (!topic.trim()) return alert("Please enter a topic!");
    setLoading(true);
    setQuiz("");
    setUserAnswers({});
    setShowAnswers({});
    setScore(null);
    setShowScore(false);

    try {
      const subjectContext = selectedSubject !== "general" ? 
        `in the subject of ${subjects[selectedSubject].name} ` : "";
      const levelContext = `at ${levels[selectedLevel]} level `;
      
      const prompt = `Generate 5 multiple-choice questions about ${topic} ${subjectContext}${levelContext}. 
      Format each question as:
      **Question X: [Question text]**
      A) [Option A]
      B) [Option B] 
      C) [Option C]
      D) [Option D]
      
      After all questions, provide the answers in this format:
      **Answers:**
      1. [Correct answer letter]
      2. [Correct answer letter]
      3. [Correct answer letter]
      4. [Correct answer letter]
      5. [Correct answer letter]
      
      Then provide explanations in this format:
      **Explanations:**
      1. [Detailed explanation for question 1]
      2. [Detailed explanation for question 2]
      3. [Detailed explanation for question 3]
      4. [Detailed explanation for question 4]
      5. [Detailed explanation for question 5]`;

      const response = await fetch("https://divine-achievement-production-5191.up.railway.app/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: prompt }),
      });
      const data = await response.json();
      setQuiz(data.quiz);
    } catch (err) {
      console.error(err);
      alert("Something went wrong!");
    } finally {
      setLoading(false);
    }
  }

  function handleAnswerSelect(questionIndex, selectedOption) {
    setUserAnswers(prev => ({
      ...prev,
      [questionIndex]: selectedOption
    }));
  }

  function toggleShowAnswer(questionIndex) {
    setShowAnswers(prev => ({
      ...prev,
      [questionIndex]: !prev[questionIndex]
    }));
  }

  function calculateScore() {
    if (!quiz) return;
    
    // Extract correct answers from the quiz text
    const answersMatch = quiz.match(/\*\*Answers:\*\*\s*([\s\S]*?)(?=\*\*Explanations:\*\*|$)/);
    if (!answersMatch) return;
    
    const answersText = answersMatch[1];
    const correctAnswers = answersText.match(/\d+\.\s*([ABCD])/g)?.map(match => 
      match.match(/([ABCD])/)[1]
    ) || [];
    
    let correct = 0;
    correctAnswers.forEach((answer, index) => {
      if (userAnswers[index] === answer) {
        correct++;
      }
    });
    
    setScore({ correct, total: correctAnswers.length });
    setShowScore(true);
  }

  function resetQuiz() {
    setQuiz("");
    setUserAnswers({});
    setShowAnswers({});
    setScore(null);
    setShowScore(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "Cookie, cursive",
        backgroundColor: "#ffe3ea",
        boxSizing: "border-box",
        padding: "20px",
        overflowX: "hidden",
        backgroundImage: `linear-gradient(rgba(255, 227, 234, 0.6), rgba(255, 227, 234, 0.6)), url('/ai_quiz_background.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <h1
        style={{
          fontFamily: "Poppins",
          fontSize: "3rem",
          marginBottom: "10px",
          color: "#c77690",
          textAlign: "center",
        }}
      >
        AI Quiz Generator
      </h1>

      <p style={{
        fontFamily: "Nunito, sans-serif",
        color: "#997d84",
        marginBottom: "30px",
        textAlign: "center",
        fontSize: "1.1rem",
      }}>
        Choose your subject and level, then enter a topic!
      </p>

      {/* Subject and Level Selection */}
      <div style={{
        display: "flex",
        gap: "20px",
        marginBottom: "20px",
        flexWrap: "wrap",
        justifyContent: "center",
      }}>
        <div>
          <label style={{
            fontFamily: "Poppins, sans-serif",
            color: "#c77690",
            display: "block",
            marginBottom: "5px",
            fontWeight: "500",
          }}>
            Subject:
          </label>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            style={{
              fontFamily: "Nunito, sans-serif",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #997d84",
              backgroundColor: "white",
              color: "#997d84",
            }}
          >
            {Object.entries(subjects).map(([key, subject]) => (
              <option key={key} value={key}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{
            fontFamily: "Poppins, sans-serif",
            color: "#c77690",
            display: "block",
            marginBottom: "5px",
            fontWeight: "500",
          }}>
            Level:
          </label>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            style={{
              fontFamily: "Nunito, sans-serif",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #997d84",
              backgroundColor: "white",
              color: "#997d84",
            }}
          >
            {Object.entries(levels).map(([key, level]) => (
              <option key={key} value={key}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </div>

      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Enter a topic..."
        style={{
          fontFamily: "Nunito, sans-serif",
          width: "100%",
          maxWidth: "400px",
          padding: "10px",
          fontSize: "16px",
          marginBottom: "15px",
          borderRadius: "8px",
          border: "1px solid #997d84",
          textAlign: "center",
        }}
        onKeyPress={(e) => e.key === 'Enter' && generateQuiz()}
      />

      <button
        onClick={generateQuiz}
        disabled={loading}
        style={{
          fontFamily: "Poppins, sans-serif",
          padding: "10px 15px",
          fontSize: "16px",
          cursor: "pointer",
          background: loading ? "#ffb6c1" : "#fb74ab",
          color: "white",
          border: "none",
          borderRadius: 8,
          transition: "background 0.3s",
          marginBottom: "20px",
        }}
      >
        {loading ? "Generating..." : "Generate Quiz"}
      </button>

      {quiz && (
        <div style={{ width: "100%", maxWidth: "700px" }}>
          {/* Quiz Header */}
          <div style={{
            background: "white",
            padding: "20px",
            borderRadius: "8px",
            marginBottom: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}>
            <h2 style={{
              fontFamily: "Poppins, sans-serif",
              color: "#c77690",
              marginBottom: "10px",
            }}>
              {subjects[selectedSubject].name} - {levels[selectedLevel]} Level
            </h2>
            <h3 style={{
              fontFamily: "Nunito, sans-serif",
              color: "#997d84",
              fontWeight: "400",
            }}>
              Topic: {topic}
            </h3>
          </div>

          {/* Interactive Quiz */}
          <div style={{
            fontFamily: "Nunito, sans-serif",
            background: "white",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            lineHeight: "1.6",
            maxHeight: "70vh",
            overflowY: "auto",
          }}>
            {parseQuiz(quiz, userAnswers, showAnswers, handleAnswerSelect, toggleShowAnswer)}
          </div>

          {/* Score Section */}
          <div style={{
            background: "white",
            padding: "20px",
            borderRadius: "8px",
            marginTop: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}>
            <button
              onClick={calculateScore}
              style={{
                fontFamily: "Poppins, sans-serif",
                padding: "10px 20px",
                fontSize: "16px",
                cursor: "pointer",
                background: "#fb74ab",
                color: "white",
                border: "none",
                borderRadius: 8,
                marginRight: "10px",
                marginBottom: "10px",
              }}
            >
              Calculate Score
            </button>
            
            <button
              onClick={resetQuiz}
              style={{
                fontFamily: "Poppins, sans-serif",
                padding: "10px 20px",
                fontSize: "16px",
                cursor: "pointer",
                background: "#c77690",
                color: "white",
                border: "none",
                borderRadius: 8,
                marginBottom: "10px",
              }}
            >
              New Quiz
            </button>

            {showScore && score && (
              <div style={{
                marginTop: "20px",
                padding: "15px",
                background: score.correct === score.total ? "#d4edda" : "#fff3cd",
                borderRadius: "8px",
                border: `1px solid ${score.correct === score.total ? "#c3e6cb" : "#ffeaa7"}`,
              }}>
                <h3 style={{
                  fontFamily: "Poppins, sans-serif",
                  color: score.correct === score.total ? "#155724" : "#856404",
                  marginBottom: "10px",
                }}>
                  {score.correct === score.total ? "Perfect Score!" : `Your Score: ${score.correct}/${score.total}`}
                </h3>
                <p style={{
                  fontFamily: "Nunito, sans-serif",
                  color: score.correct === score.total ? "#155724" : "#856404",
                  fontSize: "14px",
                }}>
                  {score.correct === score.total 
                    ? "Congratulations! You got all questions correct!" 
                    : `You answered ${score.correct} out of ${score.total} questions correctly.`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function parseQuiz(quizText, userAnswers, showAnswers, handleAnswerSelect, toggleShowAnswer) {
  const questions = [];
  const answers = [];
  const explanations = [];
  
  // Parse questions - improved regex to handle various formats
  const questionMatches = quizText.match(/\*\*Question \d+: (.*?)\*\*\s*([\s\S]*?)(?=\*\*Question \d+:|$)/g);
  
  if (!questionMatches) {
    // Try alternative format without ** markers
    const altMatches = quizText.match(/Question \d+: (.*?)\n([\s\S]*?)(?=Question \d+:|$)/g);
    if (altMatches) {
      altMatches.forEach((match) => {
        const questionText = match.match(/Question \d+: (.*?)\n/)[1];
        const optionsText = match.replace(/Question \d+: .*?\n/, '').trim();
        
        const options = [];
        ['A', 'B', 'C', 'D'].forEach(letter => {
          const optionMatch = optionsText.match(new RegExp(`${letter}\\)\\s*([^\\n]+)`));
          if (optionMatch) {
            options.push(optionMatch[1].trim());
          }
        });
        
        if (options.length > 0) {
          questions.push({ text: questionText, options });
        }
      });
    }
  } else {
    questionMatches.forEach((match) => {
      const questionText = match.match(/\*\*Question \d+: (.*?)\*\*/)[1];
      const optionsText = match.replace(/\*\*Question \d+: .*?\*\*/, '').trim();
      
      const options = [];
      ['A', 'B', 'C', 'D'].forEach(letter => {
        const optionMatch = optionsText.match(new RegExp(`${letter}\\)\\s*([^\\n]+)`));
        if (optionMatch) {
          options.push(optionMatch[1].trim());
        }
      });
      
      if (options.length > 0) {
        questions.push({ text: questionText, options });
      }
    });
  }
  
  // Parse answers
  const answersMatch = quizText.match(/\*\*Answers:\*\*\s*([\s\S]*?)(?=\*\*Explanations:\*\*|$)/);
  if (answersMatch) {
    const answersText = answersMatch[1];
    const answerMatches = answersText.match(/\d+\.\s*([ABCD])/g);
    if (answerMatches) {
      answerMatches.forEach(match => {
        answers.push(match.match(/([ABCD])/)[1]);
      });
    }
  }
  
  // Parse explanations
  const explanationsMatch = quizText.match(/\*\*Explanations:\*\*\s*([\s\S]*?)$/);
  if (explanationsMatch) {
    const explanationsText = explanationsMatch[1];
    const explanationMatches = explanationsText.match(/\d+\.\s*([^\n]+(?:\n(?!\d+\.)[^\n]*)*)/g);
    if (explanationMatches) {
      explanationMatches.forEach(match => {
        explanations.push(match.replace(/^\d+\.\s*/, '').trim());
      });
    }
  }
  
  if (questions.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "#c77690" }}>
        <h3>No questions found in the quiz data.</h3>
        <p>Please try generating a new quiz.</p>
      </div>
    );
  }
  
  return questions.map((question, index) => {
    const userAnswer = userAnswers[index];
    const correctAnswer = answers[index];
    const showAnswer = showAnswers[index];
    
    return (
      <div key={index} style={{ marginBottom: "30px", padding: "15px", border: "1px solid #f0f0f0", borderRadius: "8px" }}>
        <h4 style={{
          fontFamily: "Poppins, sans-serif",
          color: "#c77690",
          marginBottom: "15px",
          fontSize: "1.1rem",
        }}>
          Question {index + 1}: {question.text}
        </h4>
        
        {question.options.map((option, optionIndex) => {
          const optionLetter = ['A', 'B', 'C', 'D'][optionIndex];
          const isSelected = userAnswer === optionLetter;
          
          return (
            <div 
              key={optionIndex} 
              style={{
                marginBottom: "10px",
                padding: "10px",
                borderRadius: "5px",
                cursor: "pointer",
                backgroundColor: isSelected ? "#ffe3ea" : "white",
                border: isSelected ? "2px solid #fb74ab" : "1px solid #e0e0e0",
                transition: "all 0.2s",
              }}
            >
              <label style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                fontFamily: "Nunito, sans-serif",
                color: "#997d84",
              }}>
                <input
                  type="radio"
                  name={`question-${index}`}
                  value={optionLetter}
                  checked={isSelected}
                  onChange={() => handleAnswerSelect(index, optionLetter)}
                  style={{ marginRight: "10px" }}
                />
                <span style={{
                  fontWeight: "500",
                  color: isSelected ? "#c77690" : "#997d84",
                }}>
                  {optionLetter}) {option}
                </span>
                {showAnswer && optionLetter === correctAnswer && (
                  <span style={{
                    marginLeft: "10px",
                    color: "#28a745",
                    fontWeight: "bold",
                  }}>
                    ✓ Correct
                  </span>
                )}
                {showAnswer && isSelected && optionLetter !== correctAnswer && (
                  <span style={{
                    marginLeft: "10px",
                    color: "#dc3545",
                    fontWeight: "bold",
                  }}>
                    ✗ Wrong
                  </span>
                )}
              </label>
            </div>
          );
        })}
        
        <button
          onClick={() => toggleShowAnswer(index)}
          style={{
            fontFamily: "Poppins, sans-serif",
            padding: "8px 15px",
            fontSize: "14px",
            cursor: "pointer",
            background: showAnswers[index] ? "#c77690" : "#fb74ab",
            color: "white",
            border: "none",
            borderRadius: "5px",
            marginTop: "10px",
          }}
        >
          {showAnswers[index] ? "Hide Answer" : "Show Answer"}
        </button>
        
        {showAnswer && explanations[index] && (
          <div style={{
            marginTop: "15px",
            padding: "15px",
            background: "#f8f9fa",
            borderRadius: "5px",
            borderLeft: "4px solid #fb74ab",
          }}>
            <h5 style={{
              fontFamily: "Poppins, sans-serif",
              color: "#c77690",
              marginBottom: "10px",
              fontSize: "1rem",
            }}>
              Explanation:
            </h5>
            <p style={{
              fontFamily: "Nunito, sans-serif",
              color: "#997d84",
              fontSize: "14px",
              lineHeight: "1.5",
            }}>
              {explanations[index]}
            </p>
          </div>
        )}
      </div>
    );
  });
}