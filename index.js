process.env.TZ = "UTC";
console.log("Server time:", new Date().toISOString());

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json());

// ============================================
// FIREBASE SERVICE ACCOUNT
// ============================================

const serviceAccount = require("./serviceAccountKey.json");

// 🔥 FIX: IMPORTANT FOR RENDER / PRODUCTION
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

console.log("🔥 SERVICE ACCOUNT DEBUG START");
console.log("PROJECT ID:", serviceAccount.project_id);
console.log("CLIENT EMAIL:", serviceAccount.client_email);
console.log("PRIVATE KEY START:", serviceAccount.private_key.slice(0, 50));

// ============================================
// FIREBASE ADMIN INIT (IMPORTANT FIX)
// ============================================

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key
  })
});

console.log("🔥 Firebase Admin Initialized");

// ============================================
// TEST ROUTE
// ============================================

app.get("/", (req, res) => {
  res.send("Nexa backend with FCM is running 🚀");
});

// ============================================
// SEND NOTIFICATION ROUTE
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
    console.log("🚀 Sending notification to Firebase...");

    const message = {
      notification: {
        title: title || "New Message",
        body: body || "You have a new notification"
      },
      token
    };

    const response = await admin.messaging().send(message);

    console.log("✅ Firebase Success");
    console.log("📨 Message ID:", response);

    return res.json({
      success: true,
      response
    });

  } catch (error) {
    console.error("❌ Firebase Error:", error);

    return res.status(500).json({
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