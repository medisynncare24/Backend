import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import cors from "cors";
import nodemailer from "nodemailer";
import Bytez from "bytez.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();
import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import User from "./models/User.js";
import UserData from "./models/UserData.js";

const app = express();
const api = express.Router();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => {
  res.send("✅ Backend working fine");
});

console.log("🔥🔥🔥 SERVER.JS LOADED 🔥🔥🔥");

// ======================= STATIC UPLOADS FOLDER =======================
app.use("/uploads", express.static("uploads"));

// ======================= MULTER: FILE STORAGE =======================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename
  },
});
const upload = multer({ storage });

// ======================= MongoDB =======================
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err));

// ======================= Nodemailer =======================
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
});

// ======================= Bytez (AI) =======================
const sdk = new Bytez(process.env.BYTEZ_API_KEY);

const deepseekModel = sdk.model("deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B");
const whisperModel = sdk.model("openai/whisper-large-v3");

// =================================================================
// LOGIN
// =================================================================
api.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(401).json({ message: "Invalid password" });

    res.status(200).json({
      message: "Login successful",
      user: { id: user._id, full_name: user.full_name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

// =================================================================
// SIGNUP
// =================================================================
api.post("/signup", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const cleanEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ full_name, email: cleanEmail, password: hashed });

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Registration failed" });
  }
});

// =================================================================
// SEND OTP
// =================================================================
api.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    user.reset_otp = otp;
    user.otp_expiry = expiry;
    await user.save();

    const htmlTemplate = `
  <div style="background:#f4f4f7; padding:0 0 0 0; font-family:Arial, sans-serif;">
<table align="center" width="100%" cellpadding="0" cellspacing="0"
  style="
    max-width:520px;
    background:#ffffff;
    border:1px solid #e8e8e8;
    box-shadow:0 4px 14px rgba(0,0,0,0.08);
    overflow:hidden;
  ">
      <tr>
  <td style="
  padding:30px 25px;
  text-align:center;
  border-radius:14px;
">
          <div style="font-size:40px; margin-bottom:10px;">🔐</div>
          <h1 style="margin:5px 0 10px; font-size:26px; color:#2563eb; line-height:1.3; font-weight:700;">
            Medisynn<br/>Security Verification
          </h1>
          <p style="font-size:15px; color:#555; margin:0 0 20px; line-height:1.6;">
          The password reset request was made for your Medisynn account. Use the code below to continue.
          </p>
          <div style="
            background:#2563eb;
            color:white;
            font-size:34px;
            font-weight:bold;
            padding:18px 0;
            border-radius:12px;
            width:82%;
            margin: 0 auto 22px auto;
            letter-spacing:6px;
          ">
            ${otp}
          </div>
          <p style="font-size:14px; color:#666; margin-top:14px; line-height:1.7;">
            <span style="color:#d9534f; font-weight:bold;">
              ⚠️ Do NOT share this OTP with anyone.
            </span>
            Medisynn will never ask for your verification code.
          </p>
          <hr style="border:none; border-top:1px solid #ddd; margin:28px 0;" />
          <p style="font-size:12px; color:#999; margin:0;">
            © ${new Date().getFullYear()} Medisynn • All Rights Reserved
          </p>
        </td>
      </tr>
    </table>
  </div>
`;

    await transporter.sendMail({
      from: "Medisynn <medisynn.care24@gmail.com>",
      to: cleanEmail,
      subject: "Your OTP Code – Medisynn Verification",
      html: htmlTemplate,
    });

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("❌ SEND-OTP ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

// =================================================================
// VERIFY OTP
// =================================================================
api.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.reset_otp || otp !== user.reset_otp)
      return res.status(401).json({ message: "Invalid OTP" });

    if (new Date() > user.otp_expiry)
      return res.status(400).json({ message: "OTP expired" });

    user.reset_otp = null;
    user.otp_expiry = null;
    await user.save();

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

// =================================================================
// RESET PASSWORD
// =================================================================
api.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const hash = await bcrypt.hash(newPassword, 10);

    const result = await User.updateOne({ email: cleanEmail }, { password: hash });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

// =================================================================
// AI CHAT (unchanged — Gemini, no DB involved)
// =================================================================
app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(429).json({ error: data.error?.message });
    }

    res.json({
      text: data.candidates[0].content.parts[0].text,
    });
  } catch (err) {
    res.status(500).json({ error: "Gemini failed" });
  }
});

// =================================================================
// PROFILE FETCH
// =================================================================
api.post("/profile", async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail }).select(
      "full_name email profile_image"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const img = user.profile_image
      ? `http://localhost:5000/uploads/${user.profile_image}`
      : null;

    res.json({ full_name: user.full_name, email: user.email, profile_image: img });
  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

// =================================================================
// UPLOAD PROFILE IMAGE (FormData)
// =================================================================
api.post("/upload-profile-image", upload.single("image"), async (req, res) => {
  try {
    const { email } = req.body;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const filename = req.file.filename;
    const cleanEmail = email.toLowerCase().trim();

    const result = await User.updateOne(
      { email: cleanEmail },
      { profile_image: filename }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "User not found" });

    res.json({ filename });
  } catch (err) {
    res.status(500).json({ message: "DB update failed" });
  }
});

// =================================================================
// PROFILE UPDATE (JSON ONLY, NO MULTER)
// =================================================================
api.post("/update-profile", async (req, res) => {
  try {
    const { email, full_name, password, profile_image } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const finalImg =
      profile_image === null || profile_image === "null" || profile_image === ""
        ? null
        : profile_image;

    const update = { full_name, profile_image: finalImg };

    if (password && password.trim() !== "") {
      update.password = await bcrypt.hash(password, 10);
    }

    const result = await User.updateOne({ email: cleanEmail }, update);
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "User not found" });

    res.json({ message: "Profile updated" });
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

// =================================================================
// DELETE PROFILE IMAGE
// =================================================================
api.post("/delete-profile-image", async (req, res) => {
  try {
    const { email, filename } = req.body;
    if (!email || !filename)
      return res.status(400).json({ message: "Email & filename required" });

    const cleanEmail = email.toLowerCase().trim();
    const filePath = path.join(process.cwd(), "uploads", filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const result = await User.updateOne(
      { email: cleanEmail },
      { profile_image: null }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "User not found" });

    res.json({ message: "Profile image deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

// =================================================================
// DASHBOARD GET
// =================================================================
api.get("/dashboard/:email", async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();

    let data = await UserData.findOne({ email });

    if (!data) {
      data = await UserData.create({ email });
    }

    res.json({
      email: data.email,
      heartRateHistory: data.heartRateHistory,
      stepsHistory: data.stepsHistory,
      bpHistory: data.bpHistory,
      healthHistory: data.healthHistory,
      wellnessTips: data.wellnessTips,
      reminders: data.reminders,
    });
  } catch (err) {
    res.status(500).json({ message: "DB error" });
  }
});

// =================================================================
// DASHBOARD SAVE
// =================================================================
api.put("/dashboard/:email", async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();

    const payload = {
      heartRateHistory: req.body.heartRateHistory || [],
      stepsHistory: req.body.stepsHistory || [],
      bpHistory: req.body.bpHistory || [],
      healthHistory: req.body.healthHistory || [],
      wellnessTips: req.body.wellnessTips || [],
      reminders: req.body.reminders || [],
    };

    console.log("🔍 Saving dashboard for:", email);
    console.log("📦 Payload:", payload);

    await UserData.updateOne(
      { email },
      { $set: payload },
      { upsert: true }
    );

    console.log(`✅ Dashboard updated for user: ${email}`);
    res.json({ message: "Dashboard saved" });
  } catch (err) {
    res.status(500).json({ message: "Save failed" });
  }
});

// =================================================================
// START SERVER
// =================================================================
app.use("/api", api);
app.listen(5000, () =>
  console.log("🚀 Server running on http://localhost:5000")
);