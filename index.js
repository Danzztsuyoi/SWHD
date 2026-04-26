const express = require("express")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const path = require("path")

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

// ================= DOWNLOAD =================
async function downloadFile(url, filePath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://catbox.moe/"
    },
    timeout: 120000
  })

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath)
    response.data.pipe(stream)
    stream.on("finish", resolve)
    stream.on("error", reject)
  })
}

// ================= COMPRESS =================
function compressVideo(input, output, options) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(options)
      .on("start", cmd => console.log("FF:", cmd))
      .on("end", resolve)
      .on("error", reject)
      .save(output)
  })
}

// ================= PROCESS =================
async function processVideo(url, res) {
  const input = path.join(__dirname, `input_${Date.now()}.mp4`)
  const output = path.join(__dirname, `output_${Date.now()}.mp4`)

  try {
    console.log("START:", url)

    await downloadFile(url, input)

    const sizeMB = fs.statSync(input).size / (1024 * 1024)
    console.log("SIZE:", sizeMB.toFixed(2), "MB")

    let options = []

    // ================= AUTO MODE =================

    if (sizeMB <= 20) {
      // 🔥 HD MODE (kualitas tinggi)
      console.log("MODE: HD")
      options = [
        "-vf scale=720:1280:force_original_aspect_ratio=decrease",
        "-c:v libx264",
        "-crf 20",
        "-b:v 1500k",
        "-preset veryfast", // diganti dari medium biar aman
        "-pix_fmt yuv420p",
        "-profile:v high",
        "-level 4.1",
        "-movflags +faststart",
        "-c:a aac",
        "-b:a 128k",
        "-threads 1"
      ]

    } else if (sizeMB <= 30) {
      // ⚖️ BALANCE MODE
      console.log("MODE: BALANCE")
      options = [
        "-vf scale=720:1280:force_original_aspect_ratio=decrease",
        "-c:v libx264",
        "-crf 21",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-profile:v high",
        "-level 4.1",
        "-movflags +faststart",
        "-c:a aac",
        "-b:a 96k",
        "-threads 1"
      ]

    } else {
      // 💀 SAFE MODE (anti SIGKILL)
      console.log("MODE: SAFE")
      options = [
        "-vf scale=720:-2",
        "-c:v libx264",
        "-crf 23",
        "-preset ultrafast",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-c:a aac",
        "-b:a 96k",
        "-threads 1"
      ]
    }

    await compressVideo(input, output, options)

    res.download(output, "HD.mp4", () => {
      if (fs.existsSync(input)) fs.unlinkSync(input)
      if (fs.existsSync(output)) fs.unlinkSync(output)
    })

  } catch (err) {
    console.log("ERROR:", err.message)

    if (fs.existsSync(input)) fs.unlinkSync(input)
    if (fs.existsSync(output)) fs.unlinkSync(output)

    res.status(200).json({
      status: "fail",
      message: "gagal compress / server tidak kuat"
    })
  }
}

// ================= ROUTES =================
app.get("/compress", async (req, res) => {
  const url = req.query.url
  if (!url) return res.json({ error: "url required" })
  processVideo(url, res)
})

app.get("/", (req, res) => {
  res.send("API READY 🚀")
})

// ================= START =================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
