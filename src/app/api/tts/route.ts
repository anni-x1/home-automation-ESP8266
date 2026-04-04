import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, lang } = await req.json();
    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    }

    // Google AI Gemini 2.0/2.5 Flash TTS Endpoint (v1beta)
    // Using gemini-1.5-flash if 2.5-flash-preview-tts is not available yet in all regions
    // though the search said gemini-2.5-flash-preview-tts is the specific model.
    const modelId = "gemini-2.5-flash-preview-tts"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    // Map language to a natural voice
    // Prebuilt voices: "Kore", "Aoife", "Tansy", "Orla", "Puck", "Fenris", "Rhea"
    // We'll use Aoife (Irish accent, very clear) or Rhea (Warm, natural)
    const voiceName = lang === "gu" ? "Rhea" : lang === "hi" ? "Rhea" : "Aoife";

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `[natural, warm, helpful] ${text}` }]
        }],
        generationConfig: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: voiceName
              }
            }
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return NextResponse.json({ error: data.error?.message || "Gemini API Error" }, { status: response.status });
    }

    // Extract base64 audio data from the response candidates
    const audioData = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

    if (!audioData) {
      return NextResponse.json({ error: "No audio data returned" }, { status: 500 });
    }

    // Return the audio as a binary stream
    const buffer = Buffer.from(audioData, "base64");
    
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600"
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
