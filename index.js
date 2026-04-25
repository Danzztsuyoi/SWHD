const express = require("express")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const path = require("path")

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

async function downloadFile(url, filePath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream"
  })

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath)
    response.data.pipe(stream)
    stream.on("finish", resolve)
    stream.on("error", reject)
  })
}

function compressVideo(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        "-vf scale=-2:1080",
        "-crf 23",
        "-maxrate 2.5M",
        "-bufsize 5M",
        "-preset medium",
        "-movflags +faststart"
      ])
      .on("end", resolve)
      .on("error", reject)
      .save(output)
  })
}

async function processVideo(url, res) {
  try {
    const input = path.join(__dirname, "input.mp4")
    const output = path.join(__dirname, "output.mp4")

    await downloadFile(url, input)
    await compressVideo(input, output)

    res.download(output, "compressed.mp4", () => {
      if (fs.existsSync(input)) fs.unlinkSync(input)
      if (fs.existsSync(output)) fs.unlinkSync(output)
    })

  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message
    })
  }
}

app.post("/compress-link", async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: "url required" })
  processVideo(url, res)
})

app.get("/compress", async (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).json({ error: "url required" })
  processVideo(url, res)
})

app.get("/", (req, res) => {
  res.send("API READY")
})

app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
