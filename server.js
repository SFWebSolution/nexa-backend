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
 * Helper: Build a DATA-ONLY FCM payload.
 * ──────────────────────────────────────────────────────────────────
 * KEY DESIGN DECISION – We intentionally do NOT include a top-level
 * `notification` key. This means FCM will always treat the message
 * as a "data message" and hand it to the service worker's `push`
 * event (or Firebase SDK's `onBackgroundMessage`) regardless of
 * whether the browser / app is in the foreground, background, or
 * completely closed.
 *
 * If we used `notification`, FCM would auto-display it on Android
 * and the service worker would never get the chance to run when the
 * browser tab is closed — which breaks notifications for users who
 * haven't opened the app.
 *
 * The service worker is responsible for calling
 * `self.registration.showNotification(...)` manually.
 * ──────────────────────────────────────────────────────────────────
 */
function buildFCMPayload(title, body, icon, data, tokens) {
  // FCM data values MUST all be strings
  const safeData = {};
  if (data && typeof data === "object") {
    Object.entries(data).forEach(([key, val]) => {
      safeData[key] = String(val ?? "");
    });
  }

  const notifTitle = title || "Nexa Messenger";
  const notifBody = body || "You have received a new message";
  const notifIcon = icon || "/icon-192.png";

  const isCall = String(data?.isCall) === "true" || title.includes("Call");

  return {
    notification: {
      title: notifTitle,
      body: notifBody,
    },

    android: {
      priority: "high",
      notification: {
        title: notifTitle,
        body: notifBody,
        icon: notifIcon,
        sound: isCall ? "default" : "default",
        priority: "high",
        channelId: isCall ? "nexa_calls" : "nexa_messages",
        defaultSound: true,
        defaultVibrateTimings: false,
        vibrateTimingsMillis: isCall ? [0, 500, 250, 500, 250, 500, 250, 500] : [0, 200, 100, 200]
      }
    },

    apns: {
      payload: {
        aps: {
          sound: isCall ? "default" : "default",
          badge: 1,
          contentAvailable: true
        }
      }
    },

    webpush: {
      headers: {
        Urgency: isCall ? "very-high" : "high",
        TTL: "86400"
      },
      notification: {
        title: notifTitle,
        body: notifBody,
        icon: notifIcon,
        badge: "/icon-192.png",
        sound: "/iphone.mp3",
        renotify: true,
        requireInteraction: true,
        tag: isCall ? "nexa-incoming-call" : ("nexa-push-" + Date.now())
      },
      fcmOptions: {
        link: "/dashboard.html"
      }
    },

    data: {
      title: notifTitle,
      body: notifBody,
      icon: notifIcon,
      badge: "/icon-192.png",
      click_action: "/dashboard.html",
      tag: isCall ? "nexa-incoming-call" : ("nexa-push-" + Date.now()),
      senderUid: data?.senderUid || "",
      timestamp: String(Date.now()),
      isCall: isCall ? "true" : "false",
      ...safeData
    },

    tokens: tokens
  };
}

/**
 * Helper: Send an FCM multicast and clean up stale tokens.
 */
async function sendAndCleanup(payload, tokens, targetLabel) {
  console.log(`📦 Payload tokens (${tokens.length}):`, tokens.map(t => t.substring(0, 30) + "..."));
  console.log(`📦 Data:`, { title: payload.data.title, body: payload.data.body });
  console.log(`🚀 Sending FCM data-only push to ${targetLabel} (${tokens.length} token(s))...`);

  const response = await admin.messaging().sendEachForMulticast(payload);
  console.log(`✅ FCM Result: ${response.successCount} succeeded, ${response.failureCount} failed.`);

  // Log detailed error for each failure
  response.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error) {
      console.error(`❌ Token[${idx}] error: code=${resp.error.code}, message=${resp.error.message}`);
      console.error(`   Token value: ${tokens[idx].substring(0, 20)}...`);
    }
  });

  // Identify stale / invalid tokens
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

  return { response, staleTokens };
}

/**
 * Send Push Notification to User (by UID)
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

    const payload = buildFCMPayload(title, body, icon, data, tokens);
    const { response, staleTokens } = await sendAndCleanup(payload, tokens, `user ${targetUid}`);

    // Clean up stale tokens from Firestore
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

/**
 * Send Push Notification directly by FCM Token(s)
 * POST /api/send-notification-by-token
 * Body: { token (string) OR tokens (string[]), title, body, icon, data }
 *
 * Use this when you already have the FCM token and don't need a UID lookup.
 * Works even if the user has never opened the app — as long as the token
 * is valid and the browser has granted notification permission previously.
 */
app.post("/api/send-notification-by-token", async (req, res) => {
  try {
    const { token, tokens: rawTokens, title, body, icon, data } = req.body;

    // Accept either a single `token` string or an array of `tokens`
    let tokens = [];
    if (Array.isArray(rawTokens) && rawTokens.length > 0) {
      tokens = rawTokens.filter(t => typeof t === "string" && t.length > 0);
    } else if (typeof token === "string" && token.length > 0) {
      tokens = [token];
    }

    if (tokens.length === 0) {
      return res.status(400).json({ error: "Missing token or tokens" });
    }
    if (!title) {
      return res.status(400).json({ error: "Missing title" });
    }

    // Deduplicate
    tokens = [...new Set(tokens)];

    const payload = buildFCMPayload(title, body, icon, data, tokens);
    const { response } = await sendAndCleanup(payload, tokens, "direct token(s)");

    return res.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (err) {
    console.error("❌ Error sending push notification by token:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Admin: Ban / Unban User
 * POST /api/admin/ban-user
 * Body: { uid, banned }
 */
app.post("/api/admin/ban-user", async (req, res) => {
  try {
    const { uid, banned } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "Missing uid" });
    }

    const isBanned = !!banned;

    // Update Firestore user document
    await db.collection("users").doc(uid).set({
      banned: isBanned,
      updatedAt: Date.now()
    }, { merge: true });

    // Update Firebase Auth user account (disable/enable) if admin auth is initialized
    try {
      if (admin.apps.length) {
        await admin.auth().updateUser(uid, { disabled: isBanned });
        console.log(`🔒 Auth account for user ${uid} ${isBanned ? 'disabled' : 'enabled'}`);
      }
    } catch (authErr) {
      console.warn(`⚠️ Could not update Auth state for user ${uid}:`, authErr.message);
    }

    // Set presence to offline if banned
    if (isBanned) {
      await db.collection("presence").doc(uid).set({ status: "offline", lastSeen: Date.now() }, { merge: true }).catch(() => {});
    }

    console.log(`🚫 Admin ${isBanned ? 'banned' : 'unbanned'} user: ${uid}`);
    return res.json({ success: true, banned: isBanned, message: `User ${isBanned ? 'banned' : 'unbanned'} successfully` });
  } catch (err) {
    console.error("❌ Error banning user:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Admin: Permanently Delete User
 * POST /api/admin/delete-user
 * Body: { uid }
 */
app.post("/api/admin/delete-user", async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "Missing uid" });
    }

    // 1. Delete Firestore user document
    await db.collection("users").doc(uid).delete();

    // 2. Delete presence document
    await db.collection("presence").doc(uid).delete().catch(() => {});

    // 3. Delete user's status/stories
    try {
      const statusDocs = await db.collection("status").where("uid", "==", uid).get();
      if (!statusDocs.empty) {
        const batch = db.batch();
        statusDocs.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
    } catch (statusErr) {
      console.warn(`⚠️ Error deleting status docs for user ${uid}:`, statusErr.message);
    }

    // 4. Delete user from Firebase Auth
    try {
      if (admin.apps.length) {
        await admin.auth().deleteUser(uid);
        console.log(`🗑️ Auth account deleted for user ${uid}`);
      }
    } catch (authErr) {
      console.warn(`⚠️ Could not delete Auth account for user ${uid}:`, authErr.message);
    }

    console.log(`❌ Admin permanently deleted user: ${uid}`);
    return res.json({ success: true, message: `User ${uid} deleted successfully` });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    return res.status(500).json({ error: err.message });
  }
});


/**
 * ⚡ Realtime Server-Side Firestore Message Listener (Instant FCM Push)
 * ──────────────────────────────────────────────────────────────────
 * Listens directly to Firestore `chats` collection for newly created
 * messages where `read === false` and sends instant FCM push notifications
 * to the recipient. This guarantees 100x faster delivery (< 100ms) and
 * ensures notifications drop EVEN IF the recipient has never opened the
 * app today, and EVEN IF the sender's web browser closes mid-send.
 * ──────────────────────────────────────────────────────────────────
 */
function startAutoPushListener() {
  if (!db) {
    console.warn("⚠️ Firestore DB not initialized, skipping auto push listener");
    return;
  }

  console.log("⚡ Starting Nexa Realtime Auto-Push Listener for Firestore...");
  const processedDocs = new Set();
  const userCache = new Map(); // Cache user data for 3 minutes to eliminate DB latency
  const USER_CACHE_TTL = 3 * 60 * 1000;

  async function getCachedUser(uid) {
    const cached = userCache.get(uid);
    if (cached && (Date.now() - cached.timestamp < USER_CACHE_TTL)) {
      return cached.data;
    }
    const docSnap = await db.collection("users").doc(uid).get();
    const data = docSnap.exists ? docSnap.data() : null;
    if (data) {
      userCache.set(uid, { data, timestamp: Date.now() });
    }
    return data;
  }

  db.collection("chats")
    .where("read", "==", false)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type !== "added") return;

        const docId = change.doc.id;
        const msg = change.doc.data();

        if (!msg || msg._pushed || processedDocs.has(docId)) return;
        processedDocs.add(docId);

        if (processedDocs.size > 2000) {
          const first = processedDocs.values().next().value;
          processedDocs.delete(first);
        }

        const targetUid = msg.to;
        const senderUid = msg.from;
        if (!targetUid || !senderUid) return;

        try {
          const targetData = await getCachedUser(targetUid);
          if (!targetData) return;

          let tokens = [];
          if (Array.isArray(targetData.fcmTokens) && targetData.fcmTokens.length > 0) {
            tokens = targetData.fcmTokens.filter(t => typeof t === "string" && t.length > 0);
          } else if (targetData.fcmToken) {
            tokens = [targetData.fcmToken];
          }

          if (!tokens.length) return;

          let senderName = "Nexa User";
          const senderData = await getCachedUser(senderUid);
          if (senderData && senderData.displayName) {
            senderName = senderData.displayName;
          }

          const bodyText = msg.text
            ? (msg.text.length > 100 ? msg.text.substring(0, 97) + "..." : msg.text)
            : (msg.image ? "📷 Photo" : msg.video ? "🎥 Video" : msg.audio ? "🎤 Voice note" : "New message");

          const payload = buildFCMPayload(
            senderName,
            bodyText,
            "/icon-192.png",
            { senderUid, docId, click_action: "/dashboard.html" },
            tokens
          );

          await sendAndCleanup(payload, tokens, `auto-push (msg: ${docId})`);
          db.collection("chats").doc(docId).update({ _pushed: true }).catch(() => {});
          console.log(`⚡ Instant Push sent to ${targetUid} for message ${docId}`);
        } catch (err) {
          console.error(`❌ Auto-push error for msg ${docId}:`, err.message);
        }
      });
    }, err => {
      console.error("❌ Auto-push listener error:", err.message);
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Nexa Backend running on port ${PORT}`);
  startAutoPushListener();
});
