const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Parser } = require("json2csv");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

app.post("/send-to-slack", async (req, res) => {
  const slackMessage = req.body;
  // 🔁 /scout command
app.post("/scout", async (req, res) => {
  const text = req.body.text || "";
  const [team, match, autonomous, teleop, endgame, ...noteWords] = text.split(" ");
  const notes = noteWords.join(" ");

  if (!team || !match || !autonomous || !teleop || !endgame) {
    return res.json({
      response_type: "ephemeral",
      text: "Usage: /scout [team] [match] [auto] [teleop] [endgame] [notes]"
    });
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
    return res.json({
      response_type: "ephemeral",
      text: "Usage: /teaminfo [team]"
    });
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

  if (!SLACK_WEBHOOK) return res.status(500).send({ error: "SLACK_WEBHOOK not configured" });

  try {
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage)
    });
    if (!slackRes.ok) throw new Error(await slackRes.text());
    res.status(200).send({ success: true });
  } catch (err) {
    console.error("Slack send error:", err);
    res.status(500).send({ error: err.message });
  }
});

app.post("/attend", async (req, res) => {
  const [name, status, practiceRaw] = (req.body.text || "").trim().split(" ");
  if (!name || !status) {
    return res.json({
      response_type: "ephemeral",
      text: "Usage: /attend [name] [status] [optional: practice]\nExample: /attend Kian in 4/15"
    });
  }
  const practice = (practiceRaw || new Date().toISOString().split("T")[0]).replace(/[\\/#. ]+/g, "-");
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

app.post("/attendance-summary", async (req, res) => {
  try {
    const attendanceCollection = await db.collection("attendance").listDocuments();
    const hoursPerPerson = {};

    for (const practiceDoc of attendanceCollection) {
      const entriesSnap = await db.collection("attendance").doc(practiceDoc.id).collection("entries").orderBy("timestamp").get();
      const sessions = {};

      entriesSnap.forEach(doc => {
        const { name, status, timestamp } = doc.data();
        if (!name || !status || !timestamp) return;

        const time = new Date(timestamp).getTime();
        const key = `${practiceDoc.id}_${name}`;

        if (!sessions[key]) sessions[key] = { in: null, out: null };
        if (status.toLowerCase() === "in") sessions[key].in = time;
        else if (status.toLowerCase() === "out") sessions[key].out = time;
      });

      for (const [key, { in: start, out: end }] of Object.entries(sessions)) {
        if (start && end && end > start) {
          const name = key.split("_")[1];
          const durationHrs = (end - start) / (1000 * 60 * 60);
          hoursPerPerson[name] = (hoursPerPerson[name] || 0) + durationHrs;
        }
      }
    }

    const data = Object.entries(hoursPerPerson).map(([name, hours]) => ({
      name,
      hours: hours.toFixed(2)
    }));

    if (data.length === 0) return res.json({ text: "No data to export." });

    const fields = ["name", "hours"];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.json({
      response_type: "in_channel",
      text: `📄 *Attendance Hours (CSV):*\n\
\
\
${csv}\n\
\
\
`
    });
  } catch (err) {
    console.error("❌ Error exporting summary:", err);
    res.json({ text: "Failed to export attendance summary." });
  }
});

app.post("/download-hours", async (req, res) => {
  const downloadLink = "https://bot-base-qzvs.onrender.com/download-hours";
  res.json({
    response_type: "in_channel",
    text: `📥 *Click below to download the full attendance spreadsheet:*\n${downloadLink}`
  });
});

app.get("/download-hours", async (req, res) => {
  try {
    const attendanceCollection = await db.collection("attendance").listDocuments();
    const hoursPerPerson = {};

    for (const practiceDoc of attendanceCollection) {
      const entriesSnap = await db.collection("attendance").doc(practiceDoc.id).collection("entries").orderBy("timestamp").get();
      const sessions = {};

      entriesSnap.forEach(doc => {
        const { name, status, timestamp } = doc.data();
        if (!name || !status || !timestamp) return;

        const time = new Date(timestamp).getTime();
        const key = `${practiceDoc.id}_${name}`;
        if (!sessions[key]) sessions[key] = { in: null, out: null };

        if (status.toLowerCase() === "in") sessions[key].in = time;
        else if (status.toLowerCase() === "out") sessions[key].out = time;
      });

      for (const [key, { in: start, out: end }] of Object.entries(sessions)) {
        if (start && end && end > start) {
          const name = key.split("_")[1];
          const durationHrs = (end - start) / (1000 * 60 * 60);
          hoursPerPerson[name] = (hoursPerPerson[name] || 0) + durationHrs;
        }
      }
    }

    const rows = Object.entries(hoursPerPerson).map(([name, hours]) => ({
      Name: name,
      "Total Hours": hours.toFixed(2)
    }));

    const fields = ["Name", "Total Hours"];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    const filePath = path.join(__dirname, "attendance_export.csv");
    fs.writeFileSync(filePath, csv);

    res.download(filePath, "attendance_summary.csv", err => {
      if (err) {
        console.error("❌ Download error:", err);
        res.status(500).send("Failed to generate file.");
      } else {
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.error("❌ Error creating downloadable spreadsheet:", err);
    res.status(500).send("Failed to generate spreadsheet.");
  }
});

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

app.get("/", (req, res) => {
  res.send("🚀 Slack scouting backend is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});
