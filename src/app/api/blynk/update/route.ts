import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = process.env.BLYNK_TOKEN;

  if (!token) {
    return NextResponse.json({ error: 'Blynk Token not configured on server' }, { status: 500 });
  }

  // Forward all query parameters to Blynk, but use our secure server-side token
  const blynkParams = new URLSearchParams(searchParams);
  blynkParams.set('token', token);

  const blynkUrl = `https://blynk.cloud/external/api/update?${blynkParams.toString()}`;

  try {
    const res = await fetch(blynkUrl);
    const data = await res.text();
    
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
