const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Firebase Admin Init
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

// ✅ Send message via webhook
app.post("/send-to-slack", async (req, res) => {
  const slackMessage = req.body;

  if (!SLACK_WEBHOOK) {
    return res.status(500).send({ error: "SLACK_WEBHOOK not configured" });
  }

  try {
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage)
    });

    if (!slackRes.ok) {
      const errorText = await slackRes.text();
      throw new Error(errorText);
    }

    res.status(200).send({ success: true });
  } catch (err) {
    console.error("Slack send error:", err);
    res.status(500).send({ error: err.message });
  }
});

// 📝 /scout command
app.post("/scout", async (req, res) => {
  const text = req.body.text || "";
  const [team, match, autonomous, teleop, endgame, ...noteWords] = text.split(" ");
  const notes = noteWords.join(" ");

  if (!team || !match || !autonomous || !teleop || !endgame) {
    return res.json({ response_type: "ephemeral", text: "Usage: /scout [team] [match] [auto] [teleop] [endgame] [notes]" });
  }

  const entry = { team, match, autonomous, teleop, endgame, notes };

  try {
    await db.collection("scoutingData").doc(`${team}_match${match}`).set(entry);
    res.json({
      response_type: "in_channel",
      text: `✅ Entry saved for Team ${team}, Match ${match}\nAuto: ${autonomous}, Teleop: ${teleop}, Endgame: ${endgame}\nNotes: ${notes || "None"}`
    });
  } catch (err) {
    console.error("Firestore error:", err);
    res.json({ text: "Failed to save entry." });
  }
});

// 🔍 /teaminfo command
app.post("/teaminfo", async (req, res) => {
  const team = (req.body.text || "").trim();

  if (!team) {
    return res.json({ response_type: "ephemeral", text: "Usage: /teaminfo [team]" });
  }

  try {
    const snapshot = await db.collection("scoutingData").where("team", "==", team).get();
    if (snapshot.empty) return res.json({ text: `No data found for Team ${team}` });

    let text = `📊 Scouting for Team ${team}:\n`;
    snapshot.forEach(doc => {
      const e = doc.data();
      text += `• Match ${e.match}: Auto=${e.autonomous}, Teleop=${e.teleop}, Endgame=${e.endgame}, Notes=${e.notes || "None"}\n`;
    });

    res.json({ response_type: "in_channel", text });
  } catch (err) {
    console.error("Error getting team info:", err);
    res.json({ text: "Failed to retrieve data." });
  }
});

// 🧹 /clear command
app.post("/clear", async (req, res) => {
  const [team, match] = (req.body.text || "").trim().split(" ");

  if (!team) {
    return res.json({ response_type: "ephemeral", text: "Usage: /clear [team] [match?]" });
  }

  try {
    const collection = db.collection("scoutingData");

    if (match) {
      await collection.doc(`${team}_match${match}`).delete();
      return res.json({ text: `🗑️ Deleted Team ${team}, Match ${match}` });
    }

    const snapshot = await collection.where("team", "==", team).get();
    if (snapshot.empty) return res.json({ text: `No entries found for Team ${team}` });

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    res.json({ text: `🧹 Cleared all entries for Team ${team}` });
  } catch (err) {
    console.error("Error clearing entries:", err);
    res.json({ text: "Failed to clear data." });
  }
});

// 🧾 /attend [name] [status] [practice?]
app.post("/attend", async (req, res) => {
  const [name, status, practiceRaw] = (req.body.text || "").trim().split(" ");

  if (!name || !status) {
    return res.json({
      response_type: "ephemeral",
      text: "Usage: /attend [name] [status] [optional: practice]\nExample: /attend Kian in 4/15"
    });
  }

  const practice = practiceRaw || new Date().toISOString().split("T")[0];
  const timestamp = new Date().toISOString();
  const entry = { name, status, timestamp };

  try {
    await db.collection("attendance").doc(practice).collection("entries").add(entry);
    res.json({
      response_type: "in_channel",
      text: `📅 *${name}* marked as *${status}* for *${practice}* at \`${new Date().toLocaleTimeString()}\``
    });
  } catch (err) {
    console.error("❌ Error logging attendance:", err);
    res.json({ text: "Failed to log attendance." });
  }
});

// 🔐 OAuth redirect
app.get("/slack/oauth", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");

  try {
    const slackRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        redirect_uri: "https://bot-base-qzvs.onrender.com/slack/oauth"
      })
    });

    const data = await slackRes.json();
    if (!data.ok) throw new Error(data.error);

    console.log("✅ Slack app installed:", data);
    res.send("✅ Slack app installed successfully!");
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth failed");
  }
});

// Root check
app.get("/", (req, res) => {
  res.send("🚀 Slack scouting backend is running.");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});
