const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json());

// ============================================
// FIREBASE ADMIN
// ============================================

const serviceAccount = require("./serviceAccountKey.json");
console.log("🔥 SERVICE ACCOUNT DEBUG START");

console.log("PROJECT ID:", serviceAccount.project_id);
console.log("CLIENT EMAIL:", serviceAccount.client_email);

console.log("PRIVATE KEY START:");
console.log(serviceAccount.private_key?.slice(0, 80));


console.log("🔥 Firebase Admin Initialized");

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
console.log("❌ No token supplied");

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
console.log("🚀 Server running on port ${PORT}");
});