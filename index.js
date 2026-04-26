const express = require("express")
const axios = require("axios")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const path = require("path")
const { execSync } = require("child_process")

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

async function downloadFile(url, filePath) {
  console.log("Download URL:", url)

  if (!url.includes("http")) {
    throw new Error("URL tidak valid")
  }

  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://catbox.moe/",
      "Accept": "*/*"
    },
    maxRedirects: 10,
    timeout: 120000,
    validateStatus: () => true
  })

  if (response.status !== 200) {
    throw new Error("Download gagal status: " + response.status)
  }

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath)
    response.data.pipe(writer)

    writer.on("finish", resolve)
    writer.on("error", reject)
  })
}

async function processVideo(url, res) {
  const input = path.join(__dirname, "input.mp4")
  const output = path.join(__dirname, "output.mp4")

  try {
    console.log("START:", url)

    // hapus file lama
    if (fs.existsSync(input)) fs.unlinkSync(input)
    if (fs.existsSync(output)) fs.unlinkSync(output)

    // ================= DOWNLOAD =================
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
      throw new Error("File download gagal / corrupt")
    }

    console.log("Download OK")

    // ================= DELAY PENTING =================
    await new Promise(r => setTimeout(r, 1000))

    // ================= COMPRESS =================
    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .videoCodec("libx264")
        .outputOptions([
          "-vf scale='if(gt(iw,ih),-2,1080)':'if(gt(iw,ih),1080,-2)'",
          "-crf 20",
          "-preset fast",
          "-pix_fmt yuv420p",
          "-profile:v high",
          "-level 4.1",
          "-movflags +faststart"
        ])
        .on("start", cmd => console.log("FF:", cmd))
        .on("stderr", line => console.log("FFLOG:", line)) // 🔥 penting
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

    console.log("Compress OK")

    // ================= KIRIM =================
    res.download(output, "compressed.mp4", () => {
      if (fs.existsSync(input)) fs.unlinkSync(input)
      if (fs.existsSync(output)) fs.unlinkSync(output)
    })

  } catch (err) {
    console.log("ERROR FIX:", err)

    if (fs.existsSync(input)) fs.unlinkSync(input)
    if (fs.existsSync(output)) fs.unlinkSync(output)

    res.status(500).json({
      status: "error",
      message: err.message
    })
  }
}

async function processVideo(url, res) {
  try {
    console.log("=== START PROCESS ===")

    const input = path.join(__dirname, `input_${Date.now()}.mp4`)
    const output = path.join(__dirname, `output_${Date.now()}.mp4`)

    try {
      execSync("ffmpeg -version")
      console.log("FFMPEG TERDETEKSI ✅")
    } catch {
      throw new Error("ffmpeg belum terinstall")
    }

    console.log("Download...")
    await downloadFile(url, input)

    if (!fs.existsSync(input)) {
      throw new Error("file input tidak ada")
    }

    console.log("Compress...")
    await compressVideo(input, output)

    if (!fs.existsSync(output)) {
      throw new Error("file output tidak ada")
    }

    console.log("Kirim file...")
    res.download(output, "HD.mp4", () => {
      if (fs.existsSync(input)) fs.unlinkSync(input)
      if (fs.existsSync(output)) fs.unlinkSync(output)
    })

  } catch (err) {
    console.log("ERROR:", err.message)

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
  res.send("API READY")
})

app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
