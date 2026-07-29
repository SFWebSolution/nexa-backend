require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    let credential;

    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      console.log("🔒 Initializing Firebase Admin via Environment Variables...");
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      });
    } else {
      console.log("📄 Initializing Firebase Admin via Service Account JSON file...");
      const serviceAccount = require("../mel-odix-firebase-adminsdk-fbsvc-73016779c2.json");
      credential = admin.credential.cert(serviceAccount);
    }

    admin.initializeApp({ credential });
    console.log("✅ Firebase Admin initialized successfully");
  } catch (err) {
    console.error("❌ Failed to initialize Firebase Admin:", err.message);
  }
}

const db = admin.firestore();

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "online", app: "Nexa Backend with FCM Push Notifications" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", firebase: admin.apps.length > 0 });
});

/**
 * Save / Update FCM Token for a User
 * POST /api/save-token
 * Body: { uid, token }
 */
app.post("/api/save-token", async (req, res) => {
  try {
    const { uid, token } = req.body;
    if (!uid || !token) {
      return res.status(400).json({ error: "Missing uid or token" });
    }

    const userRef = db.collection("users").doc(uid);
    await userRef.set(
      {
        fcmToken: token,
        fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
        lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    console.log(`📲 FCM Token saved for user: ${uid}`);
    return res.json({ success: true, message: "Token saved successfully" });
  } catch (err) {
    console.error("Error saving FCM token:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Remove FCM Token for a User (Logout / Revoke)
 * POST /api/delete-token
 * Body: { uid, token }
 */
app.post("/api/delete-token", async (req, res) => {
  try {
    const { uid, token } = req.body;
    if (!uid || !token) {
      return res.status(400).json({ error: "Missing uid or token" });
    }

    const userRef = db.collection("users").doc(uid);
    await userRef.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(token)
    });

    console.log(`🗑️ FCM Token deleted for user: ${uid}`);
    return res.json({ success: true, message: "Token deleted successfully" });
  } catch (err) {
    console.error("Error deleting FCM token:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Send Push Notification to User
 * POST /api/send-notification
 * Body: { targetUid, title, body, icon, data }
 */
app.post("/api/send-notification", async (req, res) => {
  try {
    const { targetUid, title, body, icon, data } = req.body;
    if (!targetUid || !title) {
      return res.status(400).json({ error: "Missing targetUid or title" });
    }

    const userDoc = await db.collection("users").doc(targetUid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    let tokens = [];

    if (Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
      tokens = userData.fcmTokens.filter(t => typeof t === "string" && t.length > 0);
    } else if (userData.fcmToken) {
      tokens = [userData.fcmToken];
    }

    if (tokens.length === 0) {
      console.log(`⚠️ No FCM tokens found for target user ${targetUid}`);
      return res.json({ success: false, message: "No FCM tokens registered for user" });
    }

    // Deduplicate tokens
    tokens = [...new Set(tokens)];

    // FCM data values MUST all be strings
    const safeData = {};
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, val]) => {
        safeData[key] = String(val ?? '');
      });
    }

    const payload = {
      notification: {
        title: title,
        body: body || ""
      },
      webpush: {
        notification: {
          icon: icon || "/icon-192.png",
          badge: "/icon-192.png",
          click_action: "/dashboard.html"
        }
      },
      data: {
        click_action: "/dashboard.html",
        title: title,
        body: body || "",
        senderUid: data?.senderUid || "",
        ...safeData
      },
      tokens: tokens
    };

    console.log(`📦 Payload tokens (${tokens.length}):`, tokens.map(t => t.substring(0, 30) + '...'));
    console.log(`📦 Notification:`, payload.notification);

    console.log(`🚀 Sending FCM notification to user ${targetUid} (${tokens.length} token(s))...`);

    const response = await admin.messaging().sendEachForMulticast(payload);
    console.log(`✅ FCM Result: ${response.successCount} succeeded, ${response.failureCount} failed.`);

    // Log detailed error for each failure
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        console.error(`❌ Token[${idx}] error: code=${resp.error.code}, message=${resp.error.message}`);
        console.error(`   Token value: ${tokens[idx].substring(0, 20)}...`);
      }
    });

    // Clean up stale or invalid tokens
    const staleTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          staleTokens.push(tokens[idx]);
        }
      }
    });

    if (staleTokens.length > 0) {
      console.log(`🧹 Removing ${staleTokens.length} invalid/stale token(s) for user ${targetUid}`);
      await db.collection("users").doc(targetUid).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens)
      });
    }

    return res.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (err) {
    console.error("❌ Error sending push notification:", err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Nexa Backend running on port ${PORT}`);
});
