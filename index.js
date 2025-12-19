console.log("DEPLOY CHECK — INDEX.JS UPDATED");

const express = require("express");
const cors = require("cors");
const { connect } = require("mongoose");
const upload = require("express-fileupload");
require("dotenv").config();

const router = require("./routes/router"); // ✅ MUST match router.js exactly
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

/* -------------------- BODY PARSERS -------------------- */
app.use(express.json({ extended: true }));
app.use(express.urlencoded({ extended: true }));

/* -------------------- CORS CONFIG -------------------- */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
  : ["http://localhost:3000"];

app.use(
  cors({
    credentials: true,
    origin: function (origin, callback) {
      // Allow requests with no origin (Postman, curl, mobile apps)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

/* -------------------- FILE UPLOAD -------------------- */
app.use(upload());

/* -------------------- ROUTES -------------------- */
app.use("/api", router); // ✅ FIXED (was Routes before)

/* -------------------- ERROR HANDLERS -------------------- */
app.use(notFound);
app.use(errorHandler);

/* -------------------- DATABASE + SERVER -------------------- */
const PORT = process.env.PORT || 5000;

console.log("Attempting to connect to MongoDB server...");

connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });
