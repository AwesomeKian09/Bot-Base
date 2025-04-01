const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK; // Use environment variable
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Enable urlencoded parser for Slack slash commands
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

// Normal Slack relay endpoint
app.post("/send-to-slack", async (req, res) => {
  const slackMessage = req.body;
  console.log("📥 Incoming request body:", slackMessage);

  if (!SLACK_WEBHOOK) {
    console.error("❌ SLACK_WEBHOOK not defined in environment");
    return res.status(500).send({ error: "Missing Slack webhook URL" });
  }

  try {
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage)
    });

    console.log("📤 Slack status:", slackRes.status);

    if (!slackRes.ok) {
      const errorText = await slackRes.text();
      console.error("❌ Slack responded with error:", errorText);
      throw new Error("Slack webhook rejected the message");
    }

    res.status(200).send({ success: true, message: "Posted to Slack" });

  } catch (err) {
    console.error("❌ Error sending to Slack:", err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// Slash command: /scout 1234 5 Scored 8 Climbed solid run
app.post("/scout", async (req, res) => {
  const text = req.body.text || "";
  console.log("⚡ Slash command received:", text);

  const [team, match, autonomous, teleop, endgame, ...noteWords] = text.split(" ");
  const notes = noteWords.join(" ");

  if (!team || !match || !autonomous || !teleop || !endgame) {
    return res.json({ response_type: "ephemeral", text: "🚫 Format: /scout [team] [match] [auto] [teleop] [endgame] [notes]" });
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
    console.error("❌ Error saving from /scout command:", err);
    res.json({ response_type: "ephemeral", text: "❌ Failed to save entry." });
  }
});

app.get("/", (req, res) => {
  res.send("Slack relay is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Server running on port", process.env.PORT || 3000);
});

app.post("/send-to-slack", async (req, res) => {
  const slackMessage = req.body;

  try {
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage)
    });

    if (!slackRes.ok) {
      throw new Error("Slack webhook failed");
    }

    res.status(200).send({ success: true, message: "Posted to Slack" });
  } catch (error) {
    console.error("Slack error:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Slack relay is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Server running");
});
