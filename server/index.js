import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();
console.log("API key loaded:", process.env.OPENAI_API_KEY ? "Yes" : "No");

const app = express();

app.use(
  cors({
    origin: true, // allows any origin that matches dynamically
    methods: ["GET", "POST"],
    credentials: true,
  })
);


app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Server is running and ready!");
});

app.post("/api/generate", async (req, res) => {
  console.log("Received request:", req.body);
  try {
    const topic = req.body.topic || "General knowledge";
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful quiz generator." },
        { role: "user", content: `Generate 5 multiple-choice questions about ${topic}.` },
      ],
    });

    res.json({ quiz: response.choices[0].message.content });
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
