const ytdlp = require('yt-dlp-exec');
const yts = require('yt-search');

async function test() {
  const results = await yts('lofi beats');
  const video = results.videos[0];
  console.log('Found:', video.title);

  const info = await ytdlp(video.url, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificate: true,
    cookies: 'C:\\Users\\Administrator\\voice-app\\server\\cookies.txt',
  });

  const audioFormat = info.formats
    .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none') && f.url)
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  if (audioFormat) {
    console.log('✅ Best audio:', audioFormat.format_id, audioFormat.ext, audioFormat.abr);
    console.log('Duration:', info.duration, 'seconds');
    console.log('URL preview:', audioFormat.url.substring(0, 100));
  } else {
    console.log('❌ No audio format with URL');
  }
}

test().catch(e => console.error('FAILED:', e.message));