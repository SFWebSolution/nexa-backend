process.env.TZ = "UTC";
console.log("Server time:", new Date().toISOString());

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// FIREBASE ADMIN SETUP (CRITICAL FIX)
// ============================================

const serviceAccount = require("./serviceAccountKey.json");

console.log("🔥 SERVICE ACCOUNT DEBUG START");
console.log("PROJECT ID:", serviceAccount.project_id);
console.log("CLIENT EMAIL:", serviceAccount.client_email);
console.log("PRIVATE KEY START:");
console.log(serviceAccount.private_key?.slice(0, 80));

// 🔥 FIX 1: Replace \n issue in private key (VERY IMPORTANT)
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
}

// 🔥 FIX 2: Initialize Firebase Admin PROPERLY
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log("🔥 Firebase Admin Initialized SUCCESS");
} catch (err) {
  console.error("❌ Firebase Init Error:", err.message);
}

// ============================================
// TEST ROUTE
// ============================================

app.get("/", (req, res) => {
  res.send("Nexa backend with FCM is running 🚀");
});

// ============================================
// SEND PUSH NOTIFICATION
// ============================================

app.post("/send-notification", async (req, res) => {
  console.log("\n==============================");
  console.log("📩 Notification Request Received");
  console.log("==============================");

  const { token, title, body } = req.body;

  console.log("📌 Title:", title);
  console.log("📌 Body:", body);
  console.log("📌 Token:", token ? token.substring(0, 40) + "..." : "NO TOKEN");

  if (!token) {
    return res.status(400).json({
      success: false,
      error: "No token provided"
    });
  }

  try {
    const message = {
      notification: {
        title: title || "New Message",
        body: body || "You have a new notification"
      },
      token
    };

    console.log("🚀 Sending notification to Firebase...");

    // 🔥 FIX 3: Ensure admin.app() exists before messaging
    const response = await admin.messaging().send(message);

    console.log("✅ Firebase Success");
    console.log("📨 Message ID:", response);

    res.json({
      success: true,
      response
    });

  } catch (error) {
    console.error("❌ Firebase Error:");
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});