const ytdlp = require('yt-dlp-exec');
const yts = require('yt-search');

async function testPlay() {
  try {
    console.log('Searching...');
    const results = await yts('lofi beats');
    const video = results.videos[0];
    console.log('Found:', video.title, video.url);

    console.log('Getting audio...');
    const info = await ytdlp(video.url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
    });

    console.log('Duration:', info.duration);

    const audioFormat = info.formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none' && f.url)
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

    if (audioFormat) {
      console.log('✅ Audio found:', audioFormat.ext, audioFormat.abr);
      console.log('URL:', audioFormat.url.substring(0, 100));
    } else {
      console.log('❌ No audio format');
    }
  } catch (e) {
    console.error('❌ Full error:', e.message);
    console.error('Stack:', e.stack);
  }
}

testPlay();