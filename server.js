const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
const INTENTS_PATH = path.join(__dirname, "./intents.json");

// ─── Utility ───────────────────────────────────────────────────────────────

function loadIntents() {
  return JSON.parse(fs.readFileSync(INTENTS_PATH, "utf8"));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 1. Fuzzy / String Similarity Matching ─────────────────────────────────
// Dice coefficient (no npm needed — works great for Hinglish too)
function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const firstBigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.slice(i, i + 2);
    firstBigrams.set(bigram, (firstBigrams.get(bigram) || 0) + 1);
  }

  let intersectionSize = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.slice(i, i + 2);
    const count = firstBigrams.get(bigram) || 0;
    if (count > 0) {
      firstBigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2.0 * intersectionSize) / (a.length + b.length - 2);
}

function findBestIntent(message, intents) {
  let bestIntent = null;
  let highestScore = 0;

  for (const intent of intents) {
    if (!intent.patterns.length) continue;

    for (const pattern of intent.patterns) {
      const p = pattern.toLowerCase();
      const m = message.toLowerCase();

      // Exact match
      if (m === p) return { intent, score: 999 };

      // Substring match
      if (m.includes(p)) {
        const score = p.split(" ").length * 10;
        if (score > highestScore) { highestScore = score; bestIntent = intent; }
        continue;
      }

      // Fuzzy similarity
      const sim = diceSimilarity(m, p);
      if (sim > highestScore) { highestScore = sim; bestIntent = intent; }

      // Word overlap (for Hinglish multi-word)
      const pWords = p.split(" ");
      const mWords = m.split(" ");
      const overlap = pWords.filter(w => mWords.includes(w) && w.length > 2).length;
      const overlapScore = (overlap / Math.max(pWords.length, 1)) * 0.8;
      if (overlapScore > highestScore) { highestScore = overlapScore; bestIntent = intent; }
    }
  }

  // Accept if score is good enough
  if (highestScore > 0.38) return { intent: bestIntent, score: highestScore };
  return null;
}

// ─── 2. Emotion Detection ──────────────────────────────────────────────────

function detectEmotion(msg) {
  const sadWords   = ["sad", "dukhi", "bura", "rona", "ro raha", "akela", "alone", "hurt", "dard", "toot", "broken", "depressed", "pareshan"];
  const happyWords = ["happy", "khush", "maza", "maja", "excited", "bahut accha", "great", "wonderful", "amazing", "yay", "🎉", "😊", "❤️"];
  const angryWords = ["angry", "gussa", "ghussa", "frustrated", "irritated", "bakwaas", "chup", "shut up", "hate", "naraaz"];
  const anxiousWords = ["nervous", "scared", "darr", "tension", "anxious", "worried", "chinta", "stress", "mushkil"];

  if (sadWords.some(w => msg.includes(w)))    return "sad";
  if (happyWords.some(w => msg.includes(w)))  return "happy";
  if (angryWords.some(w => msg.includes(w)))  return "angry";
  if (anxiousWords.some(w => msg.includes(w))) return "anxious";
  return "neutral";
}

const emotionReplies = {
  sad: [
    "Yaar... lagta hai kuch bhaari chal raha hai. Bata, main hoon na 💙",
    "Arey, aise mat feel kar akko. Bol kya hua? 🤍",
    "Dil thoda heavy lag raha hai tera. Share kar, halka hoga 💙"
  ],
  angry: [
    "Oof, gussa aa raha hai? Kya hua bata — I'm listening 👂",
    "Theek hai yaar, breathe le pehle. Phir bol kya matter hai 🌿",
    "Samajh raha hoon tujhe. Kya hua exactly?"
  ],
  happy: [
    "Arre wah! Yeh toh acchi baat hai 🎉 Kya hua acha?",
    "Khushi feel ho rahi hai padhke 😊 Bata aur!",
    "Yeh energy chahiye! Kya chal raha hai? 🌟"
  ],
  anxious: [
    "Tension mat le yaar, sab theek hoga. Bol kya chal raha hai 🌿",
    "Itna stress mat le. Step by step baat karte hain 💙",
    "Main hoon na. Bata kya ho raha hai 🤍"
  ]
};

// ─── 3. Humanize — Fillers & Variation ────────────────────────────────────

const fillers = ["hmm...", "acha,", "waise,", "dekho,", "actually,", "suno,", "yaar,"];
const affirmations = [" 💙", " 🤍", " 🌿", " 😊", ""];

function humanize(text) {
  let result = text;

  // Randomly prepend a filler (40% chance)
  if (Math.random() < 0.4) {
    result = fillers[Math.floor(Math.random() * fillers.length)] + " " + result;
  }

  // Randomly append a warm emoji (50% chance, only if no emoji already)
  if (Math.random() < 0.5 && !/[\u{1F300}-\u{1FFFF}]/u.test(result)) {
    result += affirmations[Math.floor(Math.random() * affirmations.length)];
  }

  return result;
}

// ─── 4. Small Talk ─────────────────────────────────────────────────────────

const smallTalk = [
  "Waise aaj ka din kaisa tha?",
  "Kya chal raha hai aajkal?",
  "Free ho ya busy ho?",
  "Kuch naya suna?",
  "Kal kya kiya?",
  "Aaj ka mood kaisa hai?"
];

// ─── 5. Sentence Templates ────────────────────────────────────────────────

const templates = [
  (msg) => `Sach me? ${msg}`,
  (msg) => `Acha... ${msg}`,
  (msg) => `Samajh raha hoon. ${msg}`,
  (msg) => msg,
  (msg) => msg,
  (msg) => msg  // weight towards no template
];

function applyTemplate(msg) {
  const t = templates[Math.floor(Math.random() * templates.length)];
  return t(msg);
}

// ─── Memory ────────────────────────────────────────────────────────────────

const userMemory   = {};
const topicMemory  = {};

const contextResponses = {
  sunn:        ["Haan? Aage bol 👀", "Sun raha hoon, continue kar 💙"],
  kya_hua:     ["Aur bata, kya hua? 🤍", "Phir? Kya hua aage? 💙"],
  dil_ki_baat: ["Bol yaar, aage bata ❤️", "Sab sun raha hoon 🌿"],
  mood_sad:    ["Theek hai yaar, bata aur 💙", "Main hoon na, bol 🤍"],
  breakup:     ["Aur bata yaar... kya hua uske baad? 🤍", "Toh phir? 💙"],
};

// ─── Core Response Builder ─────────────────────────────────────────────────

function getBotResponse(message, userId = "default") {
  const data     = loadIntents();
  const lowerMsg = message.toLowerCase().trim();

  // Init memory
  if (!userMemory[userId])  userMemory[userId]  = [];
  if (!topicMemory[userId]) topicMemory[userId] = null;

  userMemory[userId].push({ role: "user", message: lowerMsg, time: Date.now() });
  if (userMemory[userId].length > 10) userMemory[userId].shift();

  // ── Emotion check first ──────────────────────────────────────────────────
  const emotion = detectEmotion(lowerMsg);
  if (emotion !== "neutral" && Math.random() < 0.55) {
    const arr   = emotionReplies[emotion];
    const reply = arr[Math.floor(Math.random() * arr.length)];
    userMemory[userId].push({ role: "bot", message: reply, tag: `emotion_${emotion}`, time: Date.now() });
    return { reply, tag: `emotion_${emotion}`, matched: true, emotion };
  }

  // ── Intent matching ──────────────────────────────────────────────────────
  const result = findBestIntent(lowerMsg, data.intents);

  if (!result) {
    // Topic memory fallback
    const lastTopic = topicMemory[userId];
    if (lastTopic && contextResponses[lastTopic]) {
      const arr   = contextResponses[lastTopic];
      const reply = arr[Math.floor(Math.random() * arr.length)];
      userMemory[userId].push({ role: "bot", message: reply, tag: lastTopic, time: Date.now() });
      return { reply, tag: lastTopic, matched: false, emotion };
    }

    const fallbacks = ["Hmm, aur bata? 👀", "Haan? Continue kar 💙", "Samjha nahi, thoda aur bol 🤍"];
    const reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    userMemory[userId].push({ role: "bot", message: reply, tag: null, time: Date.now() });
    return { reply, tag: null, matched: false, emotion };
  }

  const { intent } = result;
  topicMemory[userId] = intent.tag;

  // Pick random response, then humanize + template it
  const base  = intent.responses[Math.floor(Math.random() * intent.responses.length)];
  let   reply = applyTemplate(humanize(base));

  // 15% chance to append small talk
  if (Math.random() < 0.15) {
    reply += " " + smallTalk[Math.floor(Math.random() * smallTalk.length)];
  }

  userMemory[userId].push({ role: "bot", message: reply, tag: intent.tag, time: Date.now() });
  return { reply, tag: intent.tag, matched: true, emotion };
}

// ─── Routes ───────────────────────────────────────────────────────────────

// Chat (with realistic typing delay)
app.post("/chat", async (req, res) => {
  const { message, userId } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  // 600ms–1800ms natural typing delay
  await delay(600 + Math.random() * 1200);

  res.json(getBotResponse(message, userId || "default"));
});

// Train
app.post("/train", (req, res) => {
  const { tag, pattern, response } = req.body;
  if (!tag || !pattern || !response)
    return res.status(400).json({ error: "tag, pattern, and response are all required" });

  const data   = loadIntents();
  let   intent = data.intents.find(i => i.tag === tag.toLowerCase().trim());

  if (!intent) {
    data.intents.push({
      tag: tag.toLowerCase().trim(),
      patterns:  [pattern.toLowerCase().trim()],
      responses: [response.trim()]
    });
  } else {
    if (!intent.patterns.includes(pattern.toLowerCase().trim()))
      intent.patterns.push(pattern.toLowerCase().trim());
    if (!intent.responses.includes(response.trim()))
      intent.responses.push(response.trim());
  }

  fs.writeFileSync(INTENTS_PATH, JSON.stringify(data, null, 2));
  res.json({ message: "Bot trained successfully!" });
});

// View all intents
app.get("/intents", (req, res) => res.json(loadIntents().intents));

// Delete an intent
app.delete("/intents/:tag", (req, res) => {
  const data   = loadIntents();
  const before = data.intents.length;
  data.intents = data.intents.filter(i => i.tag !== req.params.tag);
  if (data.intents.length === before)
    return res.status(404).json({ error: "Not found" });
  fs.writeFileSync(INTENTS_PATH, JSON.stringify(data, null, 2));
  res.json({ message: `Deleted '${req.params.tag}'` });
});

// Conversation history
app.get("/history/:userId", (req, res) =>
  res.json(userMemory[req.params.userId] || [])
);

// Active topic memory (debug)
app.get("/topic/:userId", (req, res) =>
  res.json({ topic: topicMemory[req.params.userId] || null })
);

app.listen(PORT, () => console.log(`🤖 Bot running on http://localhost:${PORT}`));