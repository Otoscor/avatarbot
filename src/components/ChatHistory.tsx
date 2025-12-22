"use client";

import { useState, useRef } from "react";
import { useChatStore } from "@/store/useChatStore";
import { ArrowUp, Phone, X } from "lucide-react";
import { useRouter } from "next/navigation";

// 캐릭터 이름 매핑
const CHARACTER_NAMES: { [key: string]: string } = {
  test: "서아",
  jinyoung: "루피",
};

// 시간 포맷 함수
const formatTime = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "오후" : "오전";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${period} ${displayHours}:${displayMinutes}`;
};

export default function ChatHistory() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const {
    messages,
    isLoading,
    selectedCharacter,
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
          character: selectedCharacter,
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
    <div className="flex flex-col h-screen overflow-hidden bg-[#f5f5f5]" style={{ border: "none" }}>
      {/* 헤더 */}
      <div
        className="fixed top-0 left-0 right-0 z-20"
        style={{
          width: "100%",
          paddingTop: "16px",
          paddingBottom: "24px",
          paddingLeft: "20px",
          paddingRight: "20px",
          background: "#FFF",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* 왼쪽: 캐릭터 이름 */}
        <div
          style={{
            color: "#1D1D1D",
            fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
            fontSize: "20px",
            fontWeight: 600,
            lineHeight: "56px", // 버튼 높이와 동일하게 설정하여 수직 중앙 정렬
            letterSpacing: "-0.4px",
          }}
        >
          {CHARACTER_NAMES[selectedCharacter]}
        </div>

        {/* 오른쪽: 닫기 버튼 */}
        <button
          style={{
            display: "flex",
            width: "56px",
            height: "56px",
            padding: "10px",
            justifyContent: "center",
            alignItems: "center",
            gap: "10px",
            borderRadius: "12px",
            background: "#FFF",
            border: "1px solid rgba(238, 238, 238, 1)",
            cursor: "pointer",
          }}
          onClick={() => {
            router.push("/");
          }}
        >
          <X className="w-6 h-6 text-[#1d1d1d]" />
        </button>
      </div>
      
      {/* 채팅 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-5" style={{ paddingTop: "120px", paddingBottom: "180px" }}>
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.5)",
                  fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                  fontSize: "18px",
                  fontWeight: 400,
                }}
              >
                대화를 시작해보세요
              </p>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${
                    message.role === "user" ? "items-end" : "items-start"
                  }`}
                  style={{ gap: "4px" }}
                >
                  {/* 상대방 메시지인 경우 캐릭터 이름 표시 */}
                  {message.role === "assistant" && (
                    <div
                      style={{
                        color: "#666",
                        fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                        fontSize: "14px",
                        fontWeight: 500,
                        marginLeft: "8px",
                        marginBottom: "2px",
                      }}
                    >
                      {CHARACTER_NAMES[selectedCharacter] || "AI"}
                    </div>
                  )}
                  
                  {/* 메시지 버블과 시간을 한 줄로 배치 */}
                  <div
                    className={`flex items-end ${
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                    style={{ gap: "8px" }}
                  >
                    <div
                      style={{
                        maxWidth: "80%",
                        padding: "12px 16px",
                        borderRadius: "16px",
                        background:
                          message.role === "user"
                            ? "rgba(235, 229, 255, 1)"
                            : "#fafafa",
                        color: message.role === "user" ? "rgba(29, 29, 29, 1)" : "#1d1d1d",
                        fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                        fontSize: "18px",
                        fontWeight: 400,
                        lineHeight: "24px",
                        letterSpacing: "-0.3px",
                        wordBreak: "break-word",
                      }}
                    >
                      {message.content}
                    </div>
                    
                    {/* 시간 표시 */}
                    <div
                      style={{
                        color: "#999",
                        fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                        fontSize: "12px",
                        fontWeight: 400,
                        whiteSpace: "nowrap",
                        paddingBottom: "2px",
                      }}
                    >
                      {formatTime(new Date(message.timestamp))}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex flex-col items-start" style={{ gap: "4px" }}>
                  {/* 캐릭터 이름 표시 */}
                  <div
                    style={{
                      color: "#666",
                      fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                      fontSize: "14px",
                      fontWeight: 500,
                      marginLeft: "8px",
                      marginBottom: "2px",
                    }}
                  >
                    {CHARACTER_NAMES[selectedCharacter] || "AI"}
                  </div>
                  
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "12px 16px",
                      borderRadius: "16px",
                      background: "#fafafa",
                      color: "#1d1d1d",
                      fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                      fontSize: "18px",
                      fontWeight: 400,
                      lineHeight: "24px",
                      letterSpacing: "-0.3px",
                    }}
                  >
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>•</span>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 입력창 배경 */}
      <div
        className="fixed bottom-0 left-0 right-0 w-full flex flex-col justify-start items-center px-5 z-10"
        style={{
          paddingTop: "24px",
          paddingBottom: "48px",
          backgroundColor: "rgba(255, 255, 255, 1)",
          borderTop: "1px solid rgba(238, 238, 238, 1)",
        }}
      >
        {/* 입력창 영역 */}
        <div
          className="w-full px-0"
          style={{ marginBottom: "0px" }}
        >
          <div
            className="flex items-center transition-all duration-300 ease-in-out"
            style={{
              padding: "0 10px",
            }}
          >
          {/* 인풋 필드 + 통화/전송 버튼 */}
          <div
            className="flex items-center flex-1 transition-all duration-300 ease-in-out"
            style={{
              height: "56px",
              padding: "8px 4px 8px 12px",
              gap: "16px",
              borderRadius: "16px",
              border: "1.5px solid rgba(245, 245, 245, 1)",
              background: "rgba(250, 250, 250, 1)",
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
              className="flex-1 bg-transparent text-[#1d1d1d] placeholder-[#1d1d1d]/60 resize-none outline-none text-lg leading-relaxed max-h-32 scrollbar-hide"
              rows={1}
              disabled={isLoading}
              style={{
                fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
              }}
            />
            
            {/* 통화 버튼 / 전송 버튼 전환 (인풋 안에) */}
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
              className="flex justify-center items-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                minWidth: isFocused || inputValue.trim() ? "48px" : "auto",
                height: "48px",
                padding: isFocused || inputValue.trim() ? "0 12px" : "0 16px",
                gap: "4px",
                borderRadius: "12px",
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
                      whiteSpace: "nowrap",
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
      </div>
    </div>
  );
}
