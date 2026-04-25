const express = require("express")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const FormData = require("form-data")
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
        "-vf scale=-2:720",
        "-crf 28",
        "-maxrate 1M",
        "-bufsize 2M",
        "-preset veryfast"
      ])
      .on("end", resolve)
      .on("error", reject)
      .save(output)
  })
}

async function uploadToFileIO(filePath) {
  const form = new FormData()
  form.append("file", fs.createReadStream(filePath))

  const res = await axios.post("https://file.io", form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  })

  if (!res.data.success) {
    throw new Error("Upload gagal")
  }

  return res.data.link
}

async function processVideo(url, res) {
  try {
    const input = path.join(__dirname, "input.mp4")
    const output = path.join(__dirname, "output.mp4")

    await downloadFile(url, input)
    await compressVideo(input, output)
    const uploaded = await uploadToFileIO(output)

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
