import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    gemini: process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || 'not found',
    youtube: process.env.YOUTUBE_API_KEY || 'not found',
    openrouter: process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || 'not found'
  });
}
