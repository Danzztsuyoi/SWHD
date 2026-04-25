const express = require('express')
const axios = require('axios')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')

const app = express()
app.use(express.json())

app.post('/compress-link', async (req, res) => {
  try {
    const url = req.body.url

    if (!url) return res.status(400).send('No URL')

    const input = `input_${Date.now()}.mp4`
    const output = `output_${Date.now()}.mp4`

    const response = await axios.get(url, { responseType: 'stream' })
    const writer = fs.createWriteStream(input)

    response.data.pipe(writer)

    writer.on('finish', () => {
      ffmpeg(input)
        .videoCodec('libx264')
        .outputOptions([
          '-preset veryfast',
          '-crf 28',
          '-maxrate 1M',
          '-bufsize 2M'
        ])
        .size('?x720')
        .save(output)
        .on('end', () => {
          res.json({
            url: `${process.env.RAILWAY_STATIC_URL || ''}/${output}`
          })

          fs.unlinkSync(input)
        })
        .on('error', (err) => {
          console.log(err)
          res.status(500).send('ffmpeg error')
        })
    })

  } catch (e) {
    console.log(e)
    res.status(500).send('error')
  }
})

app.use(express.static('./'))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('Web jalan di port ' + PORT))