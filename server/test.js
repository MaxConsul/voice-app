const playdl = require('play-dl');

playdl.search('lofi beats', { limit: 1 }).then(async r => {
  console.log('Found:', r[0].title);
  const info = await playdl.video_info(r[0].url);
  const formats = info.format;
  console.log('Total formats:', formats.length);
  formats.forEach((f, i) => {
    if (f.mimeType && f.mimeType.includes('audio')) {
      console.log(`Format ${i}: ${f.mimeType} | url: ${!!f.url} | quality: ${f.audioQuality}`);
    }
  });
}).catch(e => console.error('FAILED:', e.message));