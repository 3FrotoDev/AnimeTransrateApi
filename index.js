const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const translateHandler = require("./api/translate");
const serveHandler = require("./api/serve");
const downloadHandler = require("./api/download");
const anilistToHiAnimeHandler = require("./api/anilist-to-hianimez");

const app = express();

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again later."
});

const allowedOrigins = [
  "https://api-nuvexanime.vercel.app",
  "https://nuvexanime.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001"
];

app.use(limiter);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-api-key"]
}));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ 
    ok: true, 
    routes: [
      "/api/translate",
      "/api/serve",
      "/api/download",
      "/api/anilist-to-hianimez"
    ] 
  });
});

app.use("/api/translate", translateHandler);
app.use("/api/serve", serveHandler);
app.use("/api/download", downloadHandler);
app.use("/api/anilist-to-hianimez", anilistToHiAnimeHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));


