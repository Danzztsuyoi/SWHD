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
    }
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

    const stats = fs.statSync(input)
    const sizeMB = stats.size / (1024 * 1024)

    let options = []

    // 🔥 AUTO MODE
    if (sizeMB <= 20) {
      console.log("MODE: SMALL (HD MAX)")
      options = [
        "-vf scale=-2:1080",
        "-crf 22",
        "-maxrate 3M",
        "-bufsize 6M",
        "-preset medium",
        "-movflags +faststart",
        "-pix_fmt yuv420p"
      ]
    } else if (sizeMB <= 30) {
      console.log("MODE: MEDIUM (BALANCE)")
      options = [
        "-vf scale=-2:720",
        "-crf 22",
        "-preset veryfast",
        "-movflags +faststart",
        "-pix_fmt yuv420p"
      ]
    } else {
      console.log("MODE: LARGE (SAFE)")
      options = [
        "-vf scale=-2:720",
        "-crf 23",
        "-preset ultrafast",
        "-movflags +faststart",
        "-pix_fmt yuv420p",
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
      message: "gagal compress / video terlalu berat"
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
  res.send("API READY 🔥")
})

// ================= START =================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
