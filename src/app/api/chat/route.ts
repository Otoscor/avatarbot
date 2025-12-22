import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import axios from "axios";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { messages, character, greeting } = await request.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }
    
    // 인사말인 경우 GPT 호출 없이 TTS만 생성
    if (greeting) {
      const greetingText = "만나서 반가워요! 오늘의 대화 주제는 뭐에요?";
      const selectedCharacter = character || "jinyoung";
      
      // TTS 생성 부분으로 바로 이동
      const typecastActorMap: { [key: string]: string | undefined } = {
        test: process.env.TYPECAST_ACTOR_ID_SEOA,
        jinyoung: process.env.TYPECAST_ACTOR_ID_LUPY,
      };
      
      const typecastApiKey = process.env.TYPECAST_API_KEY;
      const typecastActorId = typecastActorMap[selectedCharacter];
      const useTypecast = typecastApiKey && typecastActorId;
      
      let audioBase64 = "";
      
      try {
        if (useTypecast) {
          console.log("=== 인사말 Typecast TTS 생성 ===");
          const ttsResponse = await axios.post(
            "https://api.typecast.ai/v1/text-to-speech",
            {
              voice_id: typecastActorId,
              text: greetingText,
              model: "ssfm-v21",
              language: "kor",
              prompt: {
                emotion_preset: "happy",
                emotion_intensity: 0.8,
              },
              output: {
                volume: 100,
                audio_pitch: 1,
                audio_tempo: 1.05,
                audio_format: "mp3",
              },
              seed: 42,
            },
            {
              headers: {
                "X-API-KEY": typecastApiKey,
                "Content-Type": "application/json",
              },
              responseType: "arraybuffer",
              timeout: 30000,
            }
          );
          
          audioBase64 = Buffer.from(ttsResponse.data).toString("base64");
          console.log("✅ 인사말 TTS 생성 성공!");
        }
      } catch (error) {
        console.error("인사말 TTS 생성 실패:", error);
      }
      
      return NextResponse.json({
        text: greetingText,
        emotion: "happy",
        audio: audioBase64,
      });
    }

    // 캐릭터별 시스템 메시지 정의
    const characterPersonas: { [key: string]: string } = {
      test: `너는 '서아'야. 사용자와 어렸을 때부터 함께 자란 소꿉친구이고, 동갑이야.

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
      jinyoung: `너는 '루피'야. 뽀로로와 함께 사는 귀여운 분홍색 비버 친구야!

# 기본 정보
- 뽀로로 애니메이션에 나오는 캐릭터
- 분홍색 비버
- 요리와 베이킹을 정말 좋아함
- 친구들: 뽀로로, 크롱, 에디, 패티, 포비, 통통이, 해리
- 뽀롱뽀롱 마을에서 함께 살고 있어

# 성격
- 사랑스럽고 다정한 성격
- 친구들의 감정을 잘 이해하고 배려하는 따뜻한 마음씨
- 예의 바르고 섬세함
- 친구들에게 맛있는 음식을 만들어주는 것을 좋아함
- 가끔 소심하고 겁이 많아서 위험한 상황에서는 주저함
- 하지만 친구들을 위해서라면 용기를 냄

# 말투 (매우 중요!)
- 부드럽고 상냥한 말투
- 친절하고 배려심 있는 태도
- 말끝을 부드럽게 "~해요", "~이에요", "~네요", "~거예요" 사용
- 감탄사나 애교 섞인 표현 자주 사용: "우와~", "헤헤", "에헤헤", "히히"
- 사랑스럽고 다정한 분위기
- 친구들을 생각하는 따뜻한 말투
- 2-3문장으로 부드럽게 대답
- 절대 반말 금지! 항상 존댓말 사용

# 특기와 관심사
- 요리와 베이킹이 특기 (쿠키, 케이크, 빵 등을 잘 만듦)
- 친구들에게 간식 만들어주는 걸 좋아함
- 깔끔하고 정리정돈을 잘함
- 예쁜 것들을 좋아함

# 대화 방식
- 상대방의 이야기를 잘 들어주고 공감함
- 걱정되면 따뜻하게 위로해줌
- 친구들에게 도움이 되고 싶어함
- 가끔 요리나 음식 이야기를 자연스럽게 함

# 예시
❌ 나쁜 예: "그거 해봤어? 완전 좋던데!"
✅ 좋은 예: "오~ 그거 정말 좋은 생각이에요! 한번 해보시는 건 어때요?"

❌ 나쁜 예: "나도 그렇게 생각해"
✅ 좋은 예: "저도 그렇게 생각해요! 헤헤"

❌ 나쁜 예: "힘들겠다 진짜"
✅ 좋은 예: "앗, 많이 힘드시겠어요... 제가 맛있는 거 만들어드릴까요?"

응답 형식은 반드시 JSON으로 { "text": "답변내용", "emotion": "happy|sad|angry|neutral|surprised" } 형태로 줘.`,
    };

    // 선택된 캐릭터의 페르소나 가져오기 (기본값: test)
    const selectedCharacter = character || "jinyoung";
    const systemContent = characterPersonas[selectedCharacter] || characterPersonas.test;

    const systemMessage = {
      role: "system" as const,
      content: systemContent,
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

    // 캐릭터별 TTS 설정
    const typecastActorMap: { [key: string]: string | undefined } = {
      test: process.env.TYPECAST_ACTOR_ID_SEOA,
      jinyoung: process.env.TYPECAST_ACTOR_ID_LUPY,
    };

    const openaiVoiceMap: { [key: string]: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" } = {
      test: "nova", // 서아: 밝고 명랑한 목소리
      jinyoung: "shimmer", // 루피: 부드럽고 상냥한 목소리
    };
    
    // 감정 매핑 함수 (Typecast용)
    const mapEmotionToTypecast = (emotion: string): string => {
      const emotionMap: { [key: string]: string } = {
        happy: "happy",
        sad: "sad",
        angry: "angry",
        neutral: "normal", // Typecast는 "normal" 사용
        surprised: "happy", // surprised는 happy로 매핑
      };
      return emotionMap[emotion] || "normal";
    };

    // TTS를 사용하여 음성 생성
    let audioBase64 = "";
    const typecastApiKey = process.env.TYPECAST_API_KEY;
    const typecastActorId = typecastActorMap[selectedCharacter];
    const useTypecast = typecastApiKey && typecastActorId;

    try {
      console.log("=== TTS 생성 시작 ===");
      console.log("TTS 엔진:", useTypecast ? "Typecast" : "OpenAI");
      console.log("캐릭터:", selectedCharacter);
      console.log("텍스트:", text);

      if (useTypecast) {
        // Typecast TTS 사용 (공식 API v1)
        console.log("Typecast Voice ID:", typecastActorId);
        console.log("감정:", parsedResponse.emotion);

        const ttsResponse = await axios.post(
          "https://api.typecast.ai/v1/text-to-speech",
          {
            voice_id: typecastActorId,
            text: text,
            model: "ssfm-v21", // 최신 모델
            language: "kor", // 한국어
            prompt: {
              emotion_preset: mapEmotionToTypecast(parsedResponse.emotion),
              emotion_intensity: 0.7,
            },
            output: {
              volume: 100,
              audio_pitch: selectedCharacter === "jinyoung" ? 1 : 0, // 루피는 약간 높게
              audio_tempo: selectedCharacter === "jinyoung" ? 1.05 : 1.0, // 루피는 약간 빠르게
              audio_format: "mp3", // MP3 형식
            },
            seed: 42, // 일관성을 위한 시드값
          },
          {
            headers: {
              "X-API-KEY": typecastApiKey,
              "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
            timeout: 30000, // 30초 타임아웃
          }
        );

        audioBase64 = Buffer.from(ttsResponse.data).toString("base64");
        console.log("✅ Typecast TTS 생성 성공! 오디오 길이:", audioBase64.length);
      } else {
        // OpenAI TTS 사용 (폴백)
        const selectedVoice = openaiVoiceMap[selectedCharacter] || "shimmer";
        console.log("OpenAI Voice:", selectedVoice);

      const ttsResponse = await openai.audio.speech.create({
          model: "tts-1-hd",
        voice: selectedVoice,
        input: text,
          speed: 1.0,
      });

      const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
      audioBase64 = audioBuffer.toString("base64");
        console.log("✅ OpenAI TTS 생성 성공! 오디오 길이:", audioBase64.length);
      }
    } catch (ttsError: any) {
      console.error("❌ TTS 생성 오류:", {
        engine: useTypecast ? "Typecast" : "OpenAI",
        status: ttsError.response?.status,
        message: ttsError.response?.data || ttsError.message,
      });

      // Typecast 실패 시 OpenAI로 폴백
      if (useTypecast) {
        try {
          console.log("⚠️ Typecast 실패, OpenAI TTS로 폴백 시도...");
          const selectedVoice = openaiVoiceMap[selectedCharacter] || "shimmer";

          const ttsResponse = await openai.audio.speech.create({
            model: "tts-1-hd",
            voice: selectedVoice,
            input: text,
            speed: 1.0,
          });

          const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
          audioBase64 = audioBuffer.toString("base64");
          console.log("✅ OpenAI TTS 폴백 성공! 오디오 길이:", audioBase64.length);
        } catch (fallbackError) {
          console.error("❌ OpenAI TTS 폴백도 실패:", fallbackError);
        }
      }
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
