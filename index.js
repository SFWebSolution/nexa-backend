const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================================
// RESEND CONFIG
// =======================================

// Resend client initialization
const resend = new Resend(process.env.RESEND_API_KEY || "re_dummykey");

// =======================================
// MIDDLEWARE
// =======================================

app.use(cors());
app.use(express.json());

// =======================================
// HOME
// =======================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "✅ Nexa Backend Online",
        service: "Resend Email Notification Service"
    });
});

// =======================================
// HEALTH
// =======================================

app.get("/health", (req, res) => {
    res.json({
        success: true,
        time: new Date().toISOString()
    });
});

// =======================================
// SEND EMAIL
// =======================================

app.post("/send-email", async (req, res) => {
    const { email, emails, sender, type, details, link } = req.body;

    const recipientList = emails && Array.isArray(emails) 
        ? emails 
        : (email ? [email] : []);

    if (recipientList.length === 0) {
        return res.status(400).json({
            success: false,
            error: "Recipient email(s) are required."
        });
    }

    const appLink = link || "https://nexa-qydr.onrender.com/";
    const senderName = sender || "Someone";
    let subject = "You've received a new notification on Nexa";
    let bodyTitle = "Nexa Messenger";
    let bodyText = "You have a new update waiting for you on Nexa.";

    if (type === "message") {
        subject = `New message from ${senderName} on Nexa`;
        bodyTitle = "New Message Received";
        bodyText = `<b>${senderName}</b> sent you a message: <br><i style="color: #a8b5cc;">"${details || 'Sent a media file'}"</i>`;
    } else if (type === "story") {
        subject = `New story posted by ${senderName} on Nexa`;
        bodyTitle = "New Story Shared";
        bodyText = `<b>${senderName}</b> just posted a new story on Nexa! Check it out before it expires.`;
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    background-color: #080c14;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    color: #e5e9f0;
                }
                .container {
                    width: 100%;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 40px 20px;
                    box-sizing: border-box;
                }
                .card {
                    background: #0d1219;
                    border: 1px solid rgba(79, 143, 255, 0.2);
                    border-radius: 16px;
                    padding: 32px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                }
                .logo {
                    font-size: 28px;
                    font-weight: 800;
                    color: #00f0ff;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    margin-bottom: 24px;
                    text-shadow: 0 0 10px rgba(0, 240, 255, 0.4);
                }
                .title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #ffffff;
                    margin-bottom: 16px;
                }
                .text {
                    font-size: 15px;
                    color: #a8b5cc;
                    line-height: 1.6;
                    margin-bottom: 30px;
                }
                .btn {
                    display: inline-block;
                    background: linear-gradient(135deg, #00f0ff, #0099ff);
                    color: #080c14 !important;
                    text-decoration: none;
                    padding: 14px 30px;
                    border-radius: 12px;
                    font-weight: 700;
                    font-size: 15px;
                    box-shadow: 0 4px 15px rgba(0, 240, 255, 0.3);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .footer {
                    margin-top: 32px;
                    font-size: 12px;
                    color: #6b7a95;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="logo">NEXA</div>
                    <div class="title">${bodyTitle}</div>
                    <div class="text">${bodyText}</div>
                    <a href="${appLink}" class="btn">Open Nexa</a>
                    <div class="footer">
                        This is an automated notification from Nexa Messenger.<br>
                        © 2026 Nexa. All rights reserved.
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        // Send email in loop to protect recipient privacy (so they don't see each other's addresses)
        const emailPromises = recipientList.map(async (recipient) => {
            return resend.emails.send({
                from: "Nexa <onboarding@resend.dev>",
                to: recipient,
                subject: subject,
                html: htmlContent
            });
        });

        const responses = await Promise.all(emailPromises);
        console.log(`✅ Email sent to ${recipientList.length} user(s).`);

        res.json({
            success: true,
            recipientsSent: recipientList.length,
            responses
        });

    } catch (err) {
        console.error("❌ Email sending failed:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// =======================================
// START SERVER
// =======================================

app.listen(PORT, () => {
    console.log("================================");
    console.log("🚀 Nexa Messenger Backend Started");
    console.log("================================");
    console.log("Port:", PORT);
    console.log("Email Service: Resend");
    console.log("================================");
});