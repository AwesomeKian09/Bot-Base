const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Setup Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
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

// 🔍 /teaminfo [team]
app.post("/teaminfo", async (req, res) => {
  const team = (req.body.text || "").trim();

  if (!team) {
    return res.json({ response_type: "ephemeral", text: "Usage: /teaminfo [team]" });
  }

  try {
    const snapshot = await db.collection("scoutingData")
      .where("team", "==", team)
      .get();

    if (snapshot.empty) {
      return res.json({ text: `No data found for Team ${team}` });
    }

    let message = `📊 Scouting for Team ${team}:\n`;

    snapshot.forEach(doc => {
      const e = doc.data();
      message += `• Match ${e.match}: Auto=${e.autonomous}, Teleop=${e.teleop}, Endgame=${e.endgame}, Notes: ${e.notes || "None"}\n`;
    });

    res.json({ response_type: "in_channel", text: message });

  } catch (err) {
    console.error("❌ Error in /teaminfo:", err);
    res.json({ text: "Error retrieving data." });
  }
});

// 🧹 /clear [team] or /clear [team] [match]
app.post("/clear", async (req, res) => {
  const [team, match] = (req.body.text || "").trim().split(" ");

  if (!team) {
    return res.json({ response_type: "ephemeral", text: "Usage: /clear [team] [match?]" });
  }

  try {
    const collection = db.collection("scoutingData");

    if (match) {
      const docId = `${team}_match${match}`;
      await collection.doc(docId).delete();
      return res.json({ text: `🗑️ Deleted Team ${team}, Match ${match}` });
    }

    const snapshot = await collection.where("team", "==", team).get();

    if (snapshot.empty) {
      return res.json({ text: `No entries found for Team ${team}` });
    }

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    res.json({ text: `🧹 Cleared all entries for Team ${team}` });

  } catch (err) {
    console.error("❌ Error in /clear:", err);
    res.json({ text: "Error clearing data." });
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
