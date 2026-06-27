require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =====================================================
// ONESIGNAL CONFIG
// =====================================================

const ONESIGNAL_APP_ID =
  "a0974c00-b4f3-4b48-a6e4-2aa784ce0532";

const ONESIGNAL_API_KEY =
  "os_v2_app_ucluyafu6nfurjxefktyjtqfgkiiujn2atce5vvofi6jlznrfviqmaxfh6x5neyz7xwqlvlqvn3glmj24vurxwjg75jfrmx3jqcajri";

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    status: "✅ Nexa Backend Online",
    service: "OneSignal"
  });
});

// =====================================================
// HEALTH
// =====================================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString()
  });
});

// =====================================================
// SEND PUSH NOTIFICATION
// =====================================================

app.post("/send-onesignal", async (req, res) => {

  const { playerId, title, body } = req.body;

  console.log("\n==============================");
  console.log("📩 Notification Request");
  console.log("==============================");
  console.log("Player ID:", playerId);
  console.log("Title:", title);
  console.log("Body:", body);

  if (!playerId) {
    return res.status(400).json({
      success: false,
      error: "playerId is required"
    });
  }

  try {

    const response = await fetch(
      "https://api.onesignal.com/notifications",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Key ${ONESIGNAL_API_KEY}`
        },
        body: JSON.stringify({

          app_id: ONESIGNAL_APP_ID,

          include_subscription_ids: [
            playerId
          ],

          headings: {
            en: title || "Nexa"
          },

          contents: {
            en: body || "You have a new message"
          },

          data: {
            click_action: "chat",
            timestamp: Date.now()
          }

        })
      }
    );

    const data = await response.json();

    if (!response.ok) {

      console.error("❌ OneSignal Error");
      console.error(data);

      return res.status(response.status).json({
        success: false,
        error: data
      });

    }

    console.log("✅ Notification Sent");
    console.log("Notification ID:", data.id);

    res.json({
      success: true,
      notificationId: data.id
    });

  } catch (err) {

    console.error("❌ Server Error");
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {

  console.log("================================");
  console.log("🚀 Nexa Backend Running");
  console.log("================================");
  console.log("Port:", PORT);
  console.log("App ID:", ONESIGNAL_APP_ID);
  console.log("================================");

});