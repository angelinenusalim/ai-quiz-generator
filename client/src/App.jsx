import ReactMarkdown from "react-markdown";
import { useState } from "react";

export default function App() {
  const [topic, setTopic] = useState("");
  const [quiz, setQuiz] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateQuiz() {
    if (!topic.trim()) return alert("Please enter a topic!");
    setLoading(true);
    setQuiz("");

    try {
      const response = await fetch("http://localhost:3001/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
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

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Cookie, cursive",
        backgroundColor: "#ffe3ea",
        boxSizing: "border-box",
        padding: "20px",
      }}
    >
      <h1
        style={{
          fontFamily: "Poppins",
          fontSize: "3rem",
          marginBottom: "20px",
          color: "#c77690",
        }}
      >
        AI Quiz Generator
      </h1>

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
        }}
      >
        {loading ? "Generating..." : "Generate Quiz"}
      </button>

      {quiz && (
        <div
          style={{
            fontFamily: "Nunito, sans-serif",
            marginTop: 20,
            textAlign: "left",
            background: "white",
            padding: "20px",
            borderRadius: "8px",
            width: "100%",
            maxWidth: "700px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            lineHeight: "1.6",
          }}
        >
          <ReactMarkdown
            components={{
              strong: ({ children }) => (
                <span style={{ fontFamily: "Shadows Into Light, cursive" }}>
                  {children}
                </span>
              ),
            }}
          >
            {quiz}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
