import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  const hours = (parseInt(match[1]) || 0);
  const minutes = (parseInt(match[2]) || 0);
  const seconds = (parseInt(match[3]) || 0);
  return hours * 60 + minutes + seconds / 60;
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let videoId = '';
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtube.com')) {
        videoId = urlObj.searchParams.get('v') || '';
      } else if (urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1);
      }
    } catch (e) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    if (!videoId) {
      return NextResponse.json({ error: 'Could not extract video ID' }, { status: 400 });
    }

    // Attempt to fetch video duration and metadata from YouTube Data API
    let durationMinutes = null;
    let videoTitle = 'Unknown Title';
    let channelName = 'Unknown Channel';

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      try {
        const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${apiKey}`);
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          if (ytData.items && ytData.items.length > 0) {
            const item = ytData.items[0];
            const isoDuration = item.contentDetails.duration;
            durationMinutes = parseISO8601Duration(isoDuration);
            videoTitle = item.snippet.title;
            channelName = item.snippet.channelTitle;
          }
        } else {
          console.warn(`YouTube API error: ${ytRes.status} ${ytRes.statusText}. Falling back to oEmbed.`);
        }
      } catch (ytError) {
        console.warn('Failed to fetch from YouTube API, falling back to oEmbed:', ytError);
      }
    }

    // Fallback to oEmbed for title and channel name if API key is missing or failed
    if (videoTitle === 'Unknown Title') {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          videoTitle = oembedData.title || videoTitle;
          channelName = oembedData.author_name || channelName;
        }
      } catch (oembedError) {
        console.warn('Failed to fetch from oEmbed:', oembedError);
      }
    }

    let transcriptItems;
    let transcriptText = null;
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = transcriptItems.map(item => item.text).join(' ');
    } catch (error: any) {
      console.warn(`Transcript unavailable for video ${videoId}: ${error.message}`);
      // Don't return 400, return 200 with null transcript so frontend can still use metadata
    }

    return NextResponse.json({ transcript: transcriptText, durationMinutes, videoTitle, channelName });
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'An error occurred while fetching the transcript' }, { status: 500 });
  }
}
