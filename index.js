
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ Firebase Admin setup (we will add key next step)
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// test route
app.get("/", (req, res) => {
  res.send("Nexa backend with FCM is running 🚀");
});

// 🔔 SEND NOTIFICATION ROUTE
app.post("/send-notification", async (req, res) => {
  const { token, title, body } = req.body;

  try {
    const message = {
      notification: {
        title,
        body
      },
      token: token
    };

    const response = await admin.messaging().send(message);

    res.json({ success: true, response });

  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running");
});