const express = require("express")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const path = require("path")
const { execSync } = require("child_process")

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

// ================= DOWNLOAD =================
async function downloadFile(url, pathFile) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://catbox.moe/",
      "Accept": "*/*"
    },
    timeout: 120000
  })

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(pathFile)
    response.data.pipe(writer)

    writer.on("finish", resolve)
    writer.on("error", reject)
  })
}

// ================= COMPRESS =================
function compressVideo(input, output, scale, crf, preset, bitrate) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        `-vf ${scale}`,
        "-c:v libx264",
        `-preset ${preset}`,
        `-crf ${crf}`,
        bitrate ? `-b:v ${bitrate}` : "",
        "-pix_fmt yuv420p",
        "-profile:v high",
        "-level 4.1",
        "-movflags +faststart",
        "-c:a aac",
        "-b:a 128k",
        "-threads 1"
      ].filter(Boolean))
      .on("end", resolve)
      .on("error", reject)
      .save(output)
  })
}

// ================= PROCESS =================
async function processVideo(url, res) {
  const input = path.join(__dirname, "input.mp4")
  const output = path.join(__dirname, "output.mp4")

  try {
    execSync("ffmpeg -version")

    await downloadFile(url, input)

    const stats = fs.statSync(input)
    const sizeMB = stats.size / (1024 * 1024)

    let scale, crf, preset, bitrate

    // ================= AUTO MODE =================
    if (sizeMB < 10) {
      // 🔥 kecil → HD maksimal
      scale = "scale=1080:1920:force_original_aspect_ratio=decrease"
      crf = 20
      preset = "veryfast"
      bitrate = "2000k"
    } else if (sizeMB < 25) {
      // ⚖️ medium → balance
      scale = "scale=720:1280:force_original_aspect_ratio=decrease"
      crf = 22
      preset = "veryfast"
      bitrate = "1500k"
    } else {
      // 🛡️ besar → anti crash
      scale = "scale=720:1280:force_original_aspect_ratio=decrease"
      crf = 24
      preset = "ultrafast"
      bitrate = "1200k"
    }

    await compressVideo(input, output, scale, crf, preset, bitrate)

    res.download(output, "compressed.mp4", () => {
      if (fs.existsSync(input)) fs.unlinkSync(input)
      if (fs.existsSync(output)) fs.unlinkSync(output)
    })

  } catch (err) {
    console.log("ERROR:", err.message)

    res.status(200).json({
      status: "fail",
      message: "video terlalu berat / gagal compress"
    })

    if (fs.existsSync(input)) fs.unlinkSync(input)
    if (fs.existsSync(output)) fs.unlinkSync(output)
  }
}

// ================= ROUTES =================
app.get("/compress", async (req, res) => {
  const url = req.query.url
  if (!url) return res.json({ error: "url required" })
  processVideo(url, res)
})

app.get("/", (req, res) => {
  res.send("API READY")
})

// ================= START =================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
