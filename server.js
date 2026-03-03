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

  // Get last bot intent for context
  const lastBotMsg = [...userMemory[userId]]
    .reverse()
    .find(m => m.role === "bot" && m.tag);
  const lastTag = lastBotMsg?.tag || null;

  let bestMatch = null;
  let bestScore = 0;

  for (let intent of data.intents) {
    if (!intent.patterns.length) continue;

    for (let pattern of intent.patterns) {
      const patternWords = pattern.toLowerCase().split(" ");
      const msgWords = lowerMsg.split(" ");

      // Exact match - highest priority
      if (lowerMsg === pattern.toLowerCase()) {
        bestMatch = intent;
        bestScore = 999;
        break;
      }

      // Substring match
      if (lowerMsg.includes(pattern.toLowerCase())) {
        const score = pattern.split(" ").length * 10;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = intent;
        }
      }

      // Partial word overlap scoring
      const overlap = patternWords.filter(w => msgWords.includes(w) && w.length > 2).length;
      const score = overlap * 5;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = intent;
      }
    }
    if (bestScore === 999) break;
  }

  // Context-aware fallback — continue last topic
  if (!bestMatch || bestScore < 3) {
    const contextResponses = {
      "sunn": ["Haan? Aage bol 👀", "Sun raha hoon, continue kar 💙"],
      "kya_hua": ["Aur bata, kya hua? 🤍", "Phir? Kya hua aage? 💙"],
      "dil_ki_baat": ["Bol yaar, aage bata ❤️", "Sab sun raha hoon 🌿"],
      "mood_sad": ["Theek hai yaar, bata aur 💙", "Main hoon na, bol 🤍"],
    };

    if (lastTag && contextResponses[lastTag]) {
      const arr = contextResponses[lastTag];
      const reply = arr[Math.floor(Math.random() * arr.length)];
      userMemory[userId].push({ role: "bot", message: reply, tag: lastTag, time: Date.now() });
      return { reply, tag: lastTag, matched: true };
    }

    return {
      reply: ["Hmm, aur bata? 👀", "Haan? Continue kar 💙", "Samjha nahi, thoda aur bol 🤍"][Math.floor(Math.random() * 3)],
      tag: null,
      matched: false
    };
  }

  const responses = bestMatch.responses;
  const reply = responses[Math.floor(Math.random() * responses.length)];
  userMemory[userId].push({ role: "bot", message: reply, tag: bestMatch.tag, time: Date.now() });
  return { reply, tag: bestMatch.tag, matched: true };
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