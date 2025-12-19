const https = require("https")

function extractFileId(megaUrl) {
  // https://mega.nz/file/FILEID#KEY

  const match = megaUrl.match(/\/file\/([^#]+)/);
  if (!match) return null;
  return match[1];
}

function megaApiRequest(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: "g.api.mega.co.nz",
        path: "/cs",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).end("Method not allowed");
    }

    let { url } = req.query;
    if (!url) return res.status(400).end("Missing Mega URL");

    if (url.includes("/embed/")) {
      url = url.replace("/embed/", "/file/");
    }

    const fileId = extractFileId(url);
    if (!fileId) {
      return res.status(400).end("Invalid Mega URL");
    }

    // Mega API request
    const response = await megaApiRequest([
      {
        a: "g",
        g: 1,
        p: fileId,
      },
    ]);

    const fileInfo = response[0];

    if (!fileInfo || !fileInfo.g) {
      return res.status(500).end("Failed to get Mega direct link");
    }

    // 🔥 REDIRECT TO MEGA CDN

    console.log(fileInfo)
    res.writeHead(302, {
      Location: fileInfo.g,
    });
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).end("Internal Server Error");
  }
}
