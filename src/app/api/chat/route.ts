import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const systemMessage = {
      role: "system" as const,
      content:
        '너는 명랑한 3D 가상 아이돌이야. 대답은 한국어로 짧고 귀엽게 해. 응답 형식은 반드시 JSON으로 { "text": "답변내용", "emotion": "happy|sad|angry|neutral|surprised" } 형태로 줘.',
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [systemMessage, ...messages],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    const parsedResponse = JSON.parse(content);
    const text = parsedResponse.text;

    // TTS를 사용하여 음성 생성
    let audioBase64 = "";
    try {
      const ttsResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova", // 한국어에 적합한 목소리
        input: text,
      });

      const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
      audioBase64 = audioBuffer.toString("base64");
    } catch (ttsError) {
      console.error("TTS 생성 오류:", ttsError);
      // TTS 실패해도 텍스트 응답은 반환
    }

    return NextResponse.json({
      ...parsedResponse,
      audio: audioBase64,
    });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return NextResponse.json(
      { error: "Failed to get response from OpenAI" },
      { status: 500 }
    );
  }
}
