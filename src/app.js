
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const complaintRoutes = require("./routes/complaints.routes");
const { testConnection } = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const {
  authenticateToken,
} = require("./middleware/auth");

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Campus Maintenance API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);


app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const { pool } = require("./config/db");

    const [users] = await pool.execute(
      "SELECT id, name, email, role FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!users.length) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    return res.json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    console.error("Get current user error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve user information.",
    });
  }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  if (!process.env.JWT_SECRET ||
      process.env.JWT_SECRET === "replace_with_a_long_random_secret") {
    throw new Error("Set a unique JWT_SECRET in .env before starting.");
  }

  await testConnection();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Startup failed:", error.message);
  process.exit(1);
});
