const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const translateHandler = require("./api/translate");
const serveHandler = require("./api/serve");
const downloadHandler = require("./api/download");
const anilistToHiAnimeHandler = require("./api/anilist-to-hianimez");
const subdlHandler = require("./api/subdl");
const externalHandler = require("./api/external")
const extractorHandler = require("./api/extractor")
const anime3rbHandler = require("./api/anime3rb")
const driveHandler = require("./api/drive")
const megaHandler = require("./api/mega")
const witAnimeHandler = require("./api/witanime")
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

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ 
    ok: true, 
    routes: [
      "/api/translate",
      "/api/serve",
      "/api/download",
      "/api/anilist-to-hianimez",
      "/api/subdl",
      "/api/external",
      "/api/anime3rb",
      "/api/extractor"
    ] 
  });
});

const puppeteer = require("puppeteer");

// async function test() {
//   const browser = await puppeteer.launch({ headless: false });
//   const page = await browser.newPage();
//   await page.goto("https://anime3rb.com/search?q=a", { waitUntil: "networkidle2" });
//   const videoLinks = await page.evaluate(() => {
//     return Array.from(document.querySelectorAll("video source")).map(v => v.src);
//   });
//   console.log(videoLinks);
//   await browser.close();  
// }

// test();

app.use("/api/translate", translateHandler);
app.use("/api/serve", serveHandler);
app.use("/api/download", downloadHandler);
app.use("/api/anilist-to-hianimez", anilistToHiAnimeHandler);
app.use("/api/subdl", subdlHandler);
app.use("/api/external", externalHandler)
app.use("/api/extractor", extractorHandler)
app.use("/api/anime3rb", anime3rbHandler)
app.use("/api/drive", driveHandler)
app.use("/api/mega", megaHandler)
app.use("/api/witanime", witAnimeHandler)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));


