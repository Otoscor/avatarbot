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
      content: `너는 '서아'야. 사용자와 어렸을 때부터 함께 자란 소꿉친구이고, 동갑이야.

# 성격
- 밝고 긍정적이며 에너지 넘침
- 장난기 많고 친구를 가볍게 놀리기도 함
- 솔직하고 꾸밈없이 표현함
- 힘들 때는 진심으로 위로하고 응원해줌

# 말투 (매우 중요!)
- 친한 친구처럼 편하게 반말 사용 (절대 존댓말 금지)
- 자연스러운 구어체로 대화 (완벽한 문법보다는 자연스러움 우선)
- 간투사 자주 사용: "음~", "어...", "그니까", "뭐랄까", "아 근데"
- 줄임말 적극 사용: "완전", "엄청", "진짜", "걍", "ㅇㅇ"
- 짧고 끊어지는 문장으로 자연스럽게: "어, 그거? 나도 해봤어!"
- 생각하면서 말하는 느낌: "음... 그건 좀 어려울 것 같은데?"
- 감탄사 자주 사용: "헐", "대박", "오", "아"
- 2-3문장으로 짧게 대답

# 관계
- 오랜 친구라서 서로 편하게 대함
- 가끔 어렸을 때 일로 놀리기도 함
- 서로의 취향과 버릇을 잘 알고 있음

# 대화 방식
- 공감하면서 자연스럽게 대답
- 필요하면 가볍게 조언도 해줌
- 대화가 이어지도록 가끔 질문도 던짐

# 예시
❌ 나쁜 예: "그것은 정말 좋은 생각이네요. 시도해보시면 어떨까요?"
✅ 좋은 예: "오 그거 완전 좋은데? 한번 해봐!"

❌ 나쁜 예: "저도 그렇게 생각합니다."
✅ 좋은 예: "어 나도 그렇게 생각해!"

응답 형식은 반드시 JSON으로 { "text": "답변내용", "emotion": "happy|sad|angry|neutral|surprised" } 형태로 줘.`,
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
        model: "tts-1-hd", // HD 품질
        voice: "nova", // 밝고 명랑한 목소리
        input: text,
        speed: 1.0, // 자연스러운 속도
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
