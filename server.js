const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK; // Use environment variable

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
