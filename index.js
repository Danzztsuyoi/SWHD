const express = require("express")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const FormData = require("form-data")

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

async function downloadFile(url, path) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream"
  })
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(path)
    response.data.pipe(stream)
    stream.on("finish", resolve)
    stream.on("error", reject)
  })
}

function compressVideo(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        "-vf scale=-2:720",
        "-crf 28",
        "-maxrate 1M",
        "-bufsize 2M"
      ])
      .on("end", resolve)
      .on("error", reject)
      .save(output)
  })
}

async function uploadToCatbox(filePath) {
  const form = new FormData()
  form.append("reqtype", "fileupload")
  form.append("fileToUpload", fs.createReadStream(filePath))

  const res = await axios.post("https://catbox.moe/user/api.php", form, {
    headers: {
      ...form.getHeaders(),
      "User-Agent": "Mozilla/5.0"
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  })

  return res.data
}

async function processVideo(url, res) {
  try {
    const input = "input.mp4"
    const output = "output.mp4"

    await downloadFile(url, input)
    await compressVideo(input, output)
    const uploaded = await uploadToCatbox(output)

    fs.unlinkSync(input)
    fs.unlinkSync(output)

    res.json({
      status: "success",
      result: uploaded
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
