const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Setup Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // needed for Slack slash commands

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Slack Webhook
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

// 🔁 POST /send-to-slack
app.post("/send-to-slack", async (req, res) => {
  const slackMessage = req.body;
  console.log("📥 Incoming request body:", slackMessage);

  if (!SLACK_WEBHOOK) {
    console.error("❌ SLACK_WEBHOOK not defined");
    return res.status(500).send({ error: "Slack webhook not configured" });
  }

  try {
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage)
    });

    if (!slackRes.ok) {
      const errorText = await slackRes.text();
      console.error("❌ Slack response error:", errorText);
      throw new Error("Slack webhook failed");
    }

    console.log("📤 Message sent to Slack");
    res.status(200).send({ success: true, message: "Posted to Slack" });
  } catch (err) {
    console.error("❌ Error sending to Slack:", err);
    res.status(500).send({ error: err.message });
  }
});

// 🔁 POST /scout (Slash Command Handler)
app.post("/scout", async (req, res) => {
  const text = req.body.text || "";
  console.log("⚡ Slash command text:", text);

  const [team, match, autonomous, teleop, endgame, ...noteWords] = text.split(" ");
  const notes = noteWords.join(" ");

  if (!team || !match || !autonomous || !teleop || !endgame) {
    return res.json({
      response_type: "ephemeral",
      text: "❌ Usage: /scout [team] [match] [auto] [teleop] [endgame] [notes]"
    });
  }

  const entry = {
    team,
    match,
    autonomous,
    teleop,
    endgame,
    notes
  };

  try {
    await db.collection("scoutingData").doc(`${team}_match${match}`).set(entry);

    res.json({
      response_type: "in_channel",
      text: `✅ Entry logged for Team ${team}, Match ${match}\n*Auto:* ${autonomous}, *Teleop:* ${teleop}, *Endgame:* ${endgame}\n*Notes:* ${notes || "None"}`
    });
  } catch (err) {
    console.error("❌ Firestore error:", err);
    res.json({
      response_type: "ephemeral",
      text: "❌ Failed to save entry to Firestore."
    });
  }
});

// Root check
app.get("/", (req, res) => {
  res.send("🚀 Slack relay server is running!");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});
