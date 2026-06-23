process.env.TZ = "UTC";
console.log("Server time:", new Date().toISOString());

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// =====================================================
// TEST ROUTE
// =====================================================
app.get("/", (req, res) => {
  res.send("🚀 Nexa backend with OneSignal is running");
});

// =====================================================
// SEND NOTIFICATION (ONESIGNAL)
// =====================================================
app.post("/send-onesignal", async (req, res) => {
  console.log("\n==============================");
  console.log("📩 OneSignal Request Received");
  console.log("==============================");

  const { playerId, title, body } = req.body;

  console.log("📌 Title:", title);
  console.log("📌 Body:", body);
  console.log("📌 Player ID:", playerId ? playerId.substring(0, 30) + "..." : "NO ID");

  if (!playerId) {
    console.log("❌ Missing Player ID");

    return res.status(400).json({
      success: false,
      error: "No playerId provided"
    });
  }

  try {
    console.log("🚀 Sending notification via OneSignal...");

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic YOUR_ONESIGNAL_REST_API_KEY"
      },
      body: JSON.stringify({
        app_id: "YOUR_ONESIGNAL_APP_ID",
        include_player_ids: [playerId],
        headings: {
          en: title || "Nexa"
        },
        contents: {
          en: body || "You have a new message"
        }
      })
    });

    const data = await response.json();

    console.log("✅ OneSignal Response:");
    console.log(data);

    return res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error("❌ OneSignal Error:");
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});