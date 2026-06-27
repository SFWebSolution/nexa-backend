require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =====================================================
// CONSTANTS
// =====================================================
const ONESIGNAL_APP_ID = 'a0974c00-b4f3-4b48-a6e4-2aa784ce0532';
const ONESIGNAL_API_KEY = 'os_v2_app_ucluyafu6nfurjxefktyjtqfglwh7ao4ty3u2vfvyoz6mk2wy6ikbhw34m247k2yc2q43u3lqziq2rb6zwc5hqrvzr7j6vd3ff3gn5y';

// =====================================================
// ROUTES
// =====================================================
app.get('/', (req, res) => {
  res.json({ status: '✅ Nexa Backend Online', onesignal: 'Ready' });
});

// =====================================================
// SEND NOTIFICATION VIA ONESIGNAL
// =====================================================
app.post('/send-onesignal', async (req, res) => {
  const { playerId, title, body } = req.body;

  if (!playerId) {
    return res.status(400).json({
      success: false,
      error: 'playerId is required',
    });
  }

  if (!title || !body) {
    return res.status(400).json({
      success: false,
      error: 'title and body are required',
    });
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(ONESIGNAL_API_KEY).toString('base64')}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [playerId],
        headings: { en: title },
        contents: { en: body },
        data: { timestamp: Date.now() },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ OneSignal Error:', data);
      return res.status(response.status).json({
        success: false,
        error: data.errors ? data.errors[0] : 'OneSignal API error',
      });
    }

    console.log('✅ Notification sent to', playerId.substring(0, 20) + '...');
    return res.json({ success: true, notificationId: data.id });
  } catch (error) {
    console.error('❌ Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// HEALTH CHECK
// =====================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Nexa Server running on port ${PORT}`);
  console.log(`📍 OneSignal App ID: ${ONESIGNAL_APP_ID}`);
});