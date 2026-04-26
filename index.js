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
  console.log("Download URL:", url)

  if (!url.includes("http")) {
    throw new Error("URL tidak valid")
  }

  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
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
    const writer = fs.createWriteStream(pathFile)

    response.data.pipe(writer)

    writer.on("finish", () => {
      console.log("Download selesai")
      resolve()
    })

    writer.on("error", (err) => {
      console.log("Download error:", err)
      reject(err)
    })
  })
}

// ================= COMPRESS =================
function compressVideo(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
         "-vf scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2",
  "-crf 21",
  "-maxrate 3M",
  "-bufsize 6M",
  "-preset medium",
  "-movflags +faststart"
      ])
      .on("start", (cmd) => {
        console.log("FFMPEG CMD:", cmd)
      })
      .on("end", () => {
        console.log("Compress selesai")
        resolve()
      })
      .on("error", (err) => {
        console.log("FFMPEG ERROR:", err)
        reject(err)
      })
      .save(output)
  })
}

// ================= PROCESS =================
async function processVideo(url, res) {
  try {
    console.log("=== START PROCESS ===")
    console.log("URL:", url)

    const input = path.join(__dirname, "input.mp4")
    const output = path.join(__dirname, "output.mp4")

    // cek ffmpeg
    try {
      execSync("ffmpeg -version")
      console.log("FFMPEG TERDETEKSI ✅")
    } catch {
      console.log("FFMPEG TIDAK ADA ❌")
      throw new Error("ffmpeg belum terinstall di server")
    }

    console.log("Mulai download...")
    await downloadFile(url, input)

    if (!fs.existsSync(input)) {
      throw new Error("file input tidak ada")
    }

    // delay biar aman
    await new Promise(r => setTimeout(r, 1000))

    console.log("Mulai compress...")
    await compressVideo(input, output)

    if (!fs.existsSync(output)) {
      throw new Error("file output tidak ada")
    }

    console.log("Kirim ke user...")
    res.download(output, "compressed.mp4", () => {
      console.log("Selesai kirim")

      if (fs.existsSync(input)) fs.unlinkSync(input)
      if (fs.existsSync(output)) fs.unlinkSync(output)
    })

  } catch (err) {
    console.log("ERROR BESAR:", err)

    res.status(500).json({
      status: "error",
      message: err.message
    })
  }
}

// ================= ROUTES =================
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

// ================= START =================
app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})
