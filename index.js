const express = require("express")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const path = require("path")
const { execSync } = require("child_process")

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

async function processVideo(url, res) {
  const input = path.join(__dirname, "input.mp4")
  const output = path.join(__dirname, "output.mp4")

  try {
    console.log("=== START ===")
    console.log("URL:", url)

    if (!url || !url.startsWith("http")) {
      throw new Error("URL tidak valid")
    }

    if (fs.existsSync(input)) fs.unlinkSync(input)
    if (fs.existsSync(output)) fs.unlinkSync(output)

    try {
      execSync("ffmpeg -version")
      console.log("FFMPEG OK")
    } catch {
      throw new Error("ffmpeg belum terinstall")
    }

    console.log("Downloading...")

    const response = await axios({
      url,
      method: "GET",
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://catbox.moe/"
      },
      timeout: 120000
    })

    fs.writeFileSync(input, response.data)

    if (!fs.existsSync(input) || fs.statSync(input).size < 10000) {
      throw new Error("Download gagal / file corrupt")
    }

    console.log("Download selesai")

    await new Promise(r => setTimeout(r, 1000))

    console.log("Compressing...")

    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .videoCodec("libx264")
        .outputOptions([
          "-vf scale=720:1280:force_original_aspect_ratio=decrease",
  "-c:v libx264",
  "-preset veryfast",
  "-crf 20",
  "-pix_fmt yuv420p",
  "-profile:v high",
  "-level 4.1",
  "-movflags +faststart",
  "-c:a aac",
  "-b:a 128k",
  "-threads 1"
        ])
        .on("start", cmd => console.log("FF CMD:", cmd))
        .on("stderr", line => console.log("FF LOG:", line))
        .on("end", resolve)
        .on("error", err => {
          console.log("FF ERROR:", err)
          reject(err)
        })
        .save(output)
    })

    if (!fs.existsSync(output)) {
      throw new Error("Output tidak dibuat")
    }

    console.log("Compress selesai")

    res.download(output, "compressed.mp4", () => {
      console.log("Selesai kirim")

      if (fs.existsSync(input)) fs.unlinkSync(input)
      if (fs.existsSync(output)) fs.unlinkSync(output)
    })

  } catch (err) {
    console.log("ERROR:", err)

    if (fs.existsSync(input)) fs.unlinkSync(input)
    if (fs.existsSync(output)) fs.unlinkSync(output)

    res.status(500).json({
      status: "error",
      message: err.message
    })
  }
}

app.get("/compress", async (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).json({ error: "url required" })
  processVideo(url, res)
})

app.post("/compress-link", async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: "url required" })
  processVideo(url, res)
})

app.get("/", (req, res) => {
  res.send("API READY 🚀")
})

app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
