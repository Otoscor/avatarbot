"use client";

import { useState, useRef } from "react";
import { useChatStore } from "@/store/useChatStore";
import { ArrowUp, Phone } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ChatHistory() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const {
    messages,
    isLoading,
    addMessage,
    setLoading,
    setEmotion,
    setAudio,
  } = useChatStore();

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");

    // 사용자 메시지 추가
    addMessage({
      content: userMessage,
      role: "user",
    });

    // 로딩 시작
    setLoading(true);

    try {
      // API 호출을 위한 메시지 형식 변환
      const apiMessages = [
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: "user" as const,
          content: userMessage,
        },
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        throw new Error("API 호출 실패");
      }

      const data = await response.json();

      // 응답의 text를 채팅창에 추가
      addMessage({
        content: data.text || "응답을 받을 수 없었습니다.",
        role: "assistant",
      });

      // emotion 상태 업데이트
      if (
        data.emotion &&
        ["happy", "sad", "angry", "neutral", "surprised"].includes(data.emotion)
      ) {
        setEmotion(
          data.emotion as "happy" | "sad" | "angry" | "neutral" | "surprised"
        );
      }

      // audio 데이터 저장
      if (data.audio) {
        setAudio(data.audio);
      } else {
        setAudio(null);
      }
    } catch (error) {
      console.error("채팅 API 오류:", error);
      addMessage({
        content: "죄송해요, 오류가 발생했어요. 다시 시도해주세요!",
        role: "assistant",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#1d1d1d]">
      {/* 채팅 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                  fontSize: "16px",
                  fontWeight: 400,
                }}
              >
                대화를 시작해보세요
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "12px 16px",
                    borderRadius: "16px",
                    background:
                      message.role === "user"
                        ? "linear-gradient(180deg, #8569F2 0%, #5A35EC 100%)"
                        : "rgba(255, 255, 255, 0.1)",
                    color: "#FFF",
                    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "15px",
                    fontWeight: 400,
                    lineHeight: "22px",
                    letterSpacing: "-0.3px",
                    wordBreak: "break-word",
                  }}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 입력창 영역 */}
      <div
        className="w-full px-5"
        style={{
          paddingBottom: "16px",
          background:
            "linear-gradient(to top, rgba(29, 29, 29, 1) 0%, rgba(29, 29, 29, 0.9) 50%, transparent 100%)",
        }}
      >
        <div
          className="flex items-center transition-all duration-300 ease-in-out"
          style={{
            padding: "0 10px",
            gap: "6px",
          }}
        >
          {/* 인풋 필드 */}
          <div
            className="flex items-center flex-1 transition-all duration-300 ease-in-out"
            style={{
              height: "56px",
              padding: "8px 4px 8px 12px",
              gap: "16px",
              borderRadius: "16px",
              border: "1.5px solid #D3D3D3",
              background: "#FFF",
              backdropFilter: "blur(10px)",
            }}
          >
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="무엇이든지 물어보세요."
              className="flex-1 bg-transparent text-[#1d1d1d] placeholder-[#1d1d1d]/60 resize-none outline-none text-sm leading-relaxed max-h-32 scrollbar-hide"
              rows={1}
              disabled={isLoading}
              style={{
                fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
              }}
            />
          </div>

          {/* 통화 버튼 / 전송 버튼 전환 */}
          <button
            onClick={() => {
              if (isFocused || inputValue.trim()) {
                // 포커스 중이거나 텍스트가 있으면 전송
                handleSend();
              } else {
                // 그 외에는 통화 화면으로 이동
                router.push("/");
              }
            }}
            disabled={isLoading || (isFocused && !inputValue.trim())}
            className="flex justify-center items-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            style={{
              minWidth: "56px",
              height: "56px",
              padding: isFocused || inputValue.trim() ? "0 12px" : "0 16px",
              gap: "4px",
              borderRadius: "16px",
              background:
                "linear-gradient(180deg, #8569F2 0%, #5A35EC 100%)",
              boxShadow: "0 2px 4px 0 rgba(255, 255, 255, 0.25) inset",
              fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
            }}
            title={isFocused || inputValue.trim() ? "전송" : "통화"}
          >
            {isFocused || inputValue.trim() ? (
              <ArrowUp className="w-6 h-6 text-white" />
            ) : (
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-white" />
                <span
                  style={{
                    color: "#FFF",
                    fontSize: "16px",
                    fontWeight: 600,
                    lineHeight: "24px",
                    letterSpacing: "-0.32px",
                  }}
                >
                  통화
                </span>
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
