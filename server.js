const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
const INTENTS_PATH = path.join(__dirname, "./intents.json");

function loadIntents() {
  return JSON.parse(fs.readFileSync(INTENTS_PATH, "utf8"));
}

const userMemory = {};

function getBotResponse(message, userId = "default") {
  const data = loadIntents();
  const lowerMsg = message.toLowerCase().trim();

  if (!userMemory[userId]) userMemory[userId] = [];
  userMemory[userId].push({ role: "user", message: lowerMsg, time: Date.now() });
  if (userMemory[userId].length > 10) userMemory[userId].shift();

  for (let intent of data.intents) {
    for (let pattern of intent.patterns) {
      if (lowerMsg.includes(pattern.toLowerCase())) {
        const responses = intent.responses;
        const reply = responses[Math.floor(Math.random() * responses.length)];
        userMemory[userId].push({ role: "bot", message: reply, time: Date.now() });
        return { reply, tag: intent.tag, matched: true };
      }
    }
  }

  return { reply: "I don't understand that yet. Train me! 💙", tag: null, matched: false };
}

// Chat
app.post("/chat", (req, res) => {
  const { message, userId } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });
  res.json(getBotResponse(message, userId || "default"));
});

// Train
app.post("/train", (req, res) => {
  const { tag, pattern, response } = req.body;
  if (!tag || !pattern || !response)
    return res.status(400).json({ error: "tag, pattern, and response are all required" });

  const data = loadIntents();
  let intent = data.intents.find(i => i.tag === tag.toLowerCase().trim());

  if (!intent) {
    data.intents.push({ tag: tag.toLowerCase().trim(), patterns: [pattern.toLowerCase().trim()], responses: [response.trim()] });
  } else {
    if (!intent.patterns.includes(pattern.toLowerCase().trim())) intent.patterns.push(pattern.toLowerCase().trim());
    if (!intent.responses.includes(response.trim())) intent.responses.push(response.trim());
  }

  fs.writeFileSync(INTENTS_PATH, JSON.stringify(data, null, 2));
  res.json({ message: "Bot trained successfully!" });
});

// View all intents
app.get("/intents", (req, res) => res.json(loadIntents().intents));

// Delete an intent
app.delete("/intents/:tag", (req, res) => {
  const data = loadIntents();
  const before = data.intents.length;
  data.intents = data.intents.filter(i => i.tag !== req.params.tag);
  if (data.intents.length === before) return res.status(404).json({ error: "Not found" });
  fs.writeFileSync(INTENTS_PATH, JSON.stringify(data, null, 2));
  res.json({ message: `Deleted '${req.params.tag}'` });
});

// Conversation history
app.get("/history/:userId", (req, res) => res.json(userMemory[req.params.userId] || []));

app.listen(PORT, () => console.log(`Bot running on http://localhost:${PORT}`));