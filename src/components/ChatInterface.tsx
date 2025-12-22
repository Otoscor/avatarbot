"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/store/useChatStore";
import { ArrowUp, Mic, MicOff, X, Check, LayoutGrid, MessageSquareText } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

// Web Speech API 타입 정의
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart?: () => void;
  onspeechstart?: () => void;
  onspeechend?: () => void;
  onsoundstart?: () => void;
  onsoundend?: () => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

// Window 인터페이스 전역 확장
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// 상태 타입 정의
type ListeningState = "listening" | "speaking" | "processing" | "ai-speaking";

export default function ChatInterface() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // 음소거 상태
  const [isFocused, setIsFocused] = useState(false); // 입력창 포커스 상태
  const [listeningState, setListeningState] =
    useState<ListeningState>("listening");
  const [hasPermissionDenied, setHasPermissionDenied] = useState(false); // 권한 거부 상태
  const [showPermissionToast, setShowPermissionToast] = useState(false); // 권한 토스트 표시 여부
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoRestartRef = useRef<boolean>(false); // 자동 재시작 플래그
  const isAudioPlayingRef = useRef<boolean>(false);
  const isLoadingRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const messageDisplayTimerRef = useRef<NodeJS.Timeout | null>(null); // 답변 표시 타이머
  const [showMessage, setShowMessage] = useState(false); // 답변 표시 여부
  const [interimTranscript, setInterimTranscript] = useState(""); // 중간 결과 (말하는 중 표시용)
  const [currentSpeechText, setCurrentSpeechText] = useState(""); // 현재 수집 중인 전체 음성 텍스트
  const [showAudioPermissionModal, setShowAudioPermissionModal] =
    useState(false); // 오디오 자동 재생 허용 모달
  const [audioContextUnlocked, setAudioContextUnlocked] = useState(false); // 오디오 컨텍스트 활성화 여부
  const [showCharacterModal, setShowCharacterModal] = useState(false); // 캐릭터 선택 모달
  const [showComingSoonToast, setShowComingSoonToast] = useState(false); // 준비 중 토스트
  const permissionDeniedRef = useRef<boolean>(false); // 권한 거부 ref (재시도 방지용)
  const audioContextRef = useRef<AudioContext | null>(null); // 오디오 컨텍스트 ref
  const speechSilenceTimerRef = useRef<NodeJS.Timeout | null>(null); // 음성 침묵 감지 타이머
  const {
    messages,
    isLoading,
    isAudioPlaying,
    selectedCharacter,
    addMessage,
    setLoading,
    setEmotion,
    setAudio,
    setSelectedCharacter,
  } = useChatStore();

  // 현재 표시할 메시지 (가장 최근 assistant 메시지)
  const currentMessage =
    messages.length > 0
      ? messages
          .slice()
          .reverse()
          .find((msg) => msg.role === "assistant")
      : null;

  // handleSend를 useCallback으로 메모이제이션 (먼저 정의)
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    // 침묵 타이머 정리
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const userMessage = inputValue.trim();
    setInputValue("");

    // 사용자 메시지 추가
    addMessage({
      content: userMessage,
      role: "user",
    });

    // 로딩 시작
    setLoading(true);
    setListeningState("processing");

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
      
      console.log("=== ChatInterface: API 응답 받음 ===");
      console.log("응답 텍스트:", data.text);
      console.log("감정:", data.emotion);
      console.log("오디오 있음:", !!data.audio);
      console.log("오디오 길이:", data.audio?.length || 0);

      // 응답의 text를 채팅창에 추가
      addMessage({
        content: data.text || "응답을 받을 수 없었습니다.",
        role: "assistant",
      });

      // 답변 표시 시작 (TTS 재생 중에는 계속 표시)
      setShowMessage(true);

      // 기존 타이머 정리
      if (messageDisplayTimerRef.current) {
        clearTimeout(messageDisplayTimerRef.current);
      }

      // 타이머는 TTS 종료 시 설정 (여기서는 설정하지 않음)

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
        console.log("✅ ChatInterface: 오디오 데이터 저장 중...");
        setAudio(data.audio);
      } else {
        console.log("❌ ChatInterface: 오디오 데이터 없음");
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
  }, [
    inputValue,
    isLoading,
    messages,
    addMessage,
    setLoading,
    setEmotion,
    setAudio,
  ]);

  // 침묵 감지 타이머 초기화 (텍스트 입력용, 음성 인식은 onresult에서 바로 전송)
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    // 텍스트 입력 시에만 침묵 타이머 사용 (음성 인식은 onresult에서 바로 전송)
    silenceTimerRef.current = setTimeout(() => {
      // 1.5초 침묵 후 자동 전송 (텍스트 입력 시에만)
      if (inputValue.trim() && !isLoading && !isAudioPlaying) {
        handleSend();
      }
    }, 1500);
  }, [inputValue, isLoading, isAudioPlaying, handleSend]);

  // 마이크 권한 확인 함수
  const checkMicrophonePermission = useCallback(
    async (forceRequest: boolean = false): Promise<boolean> => {
      // 이미 권한이 거부된 경우 재시도하지 않음 (단, 강제 요청인 경우 제외)
      if (permissionDeniedRef.current && !forceRequest) {
        return false;
      }

      // 강제 요청인 경우 상태 리셋
      if (forceRequest) {
        permissionDeniedRef.current = false;
        setHasPermissionDenied(false);
      }

      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          // 스트림 정리
          stream.getTracks().forEach((track) => track.stop());
          // 권한 허용됨 - 상태 리셋
          permissionDeniedRef.current = false;
          setHasPermissionDenied(false);
          return true;
        }
        // getUserMedia가 없는 경우 (일부 환경) true 반환하여 시도
        return true;
      } catch (error: unknown) {
        const err = error as DOMException;
        // 권한 거부 또는 마이크 없음
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError" ||
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          permissionDeniedRef.current = true;
          setHasPermissionDenied(true);
          console.warn(
            "마이크 권한이 거부되었거나 마이크를 찾을 수 없습니다:",
            err.name
          );
          // 토스트 메시지 표시 (한 번만)
          setShowPermissionToast((prev) => {
            if (!prev) {
              setTimeout(() => setShowPermissionToast(false), 5000);
              return true;
            }
            return prev;
          });
          return false;
        }
        // 다른 에러는 로그만 남기고 시도 허용
        console.warn("마이크 권한 확인 중 오류:", err.name);
        return true;
      }
    },
    []
  );

  // 음성 인식 시작 (useCallback으로 메모이제이션)
  const startRecognition = useCallback(async () => {
    if (!recognitionRef.current) return;
    // 이미 시작된 상태면 중복 호출 방지
    if (isListeningRef.current) return;
    // 음소거 상태면 시작하지 않음
    if (isMuted) return;
    // TTS 재생 중이면 시작하지 않음 (중요!)
    if (isAudioPlayingRef.current) {
      console.log("⏸️ TTS 재생 중이므로 음성 인식 시작 대기");
      return;
    }
    // 권한이 거부된 경우 시작하지 않음
    if (permissionDeniedRef.current) {
      console.warn("마이크 권한이 거부되어 음성 인식을 시작할 수 없습니다.");
      return;
    }

    // 권한 확인
    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) {
      return;
    }

    try {
      console.log("음성 인식 시작 시도...");
      recognitionRef.current.start();
      console.log("음성 인식 시작 성공");
      isListeningRef.current = true;
      setIsListening(true);
      setListeningState("listening");
      autoRestartRef.current = false;
    } catch (error) {
      const err = error as Error;
      console.error("음성 인식 시작 실패:", {
        name: err.name,
        message: err.message,
        error: err,
      });
      // InvalidStateError는 이미 시작된 경우이므로 무시
      if (
        err.name === "InvalidStateError" ||
        err.message?.includes("already started")
      ) {
        console.log("이미 시작된 상태로 간주");
        // 이미 시작된 상태로 간주하고 상태만 업데이트
        isListeningRef.current = true;
        setIsListening(true);
        setListeningState("listening");
        return;
      }
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [isMuted, checkMicrophonePermission]);

  // 음성 인식 중지
  const stopRecognition = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
      isListeningRef.current = false;
      setIsListening(false);
      autoRestartRef.current = false;
    } catch (error) {
      console.error("음성 인식 중지 실패:", error);
      isListeningRef.current = false;
      setIsListening(false);
    }
  };

  // 음성 인식 초기화
  useEffect(() => {
    // 브라우저 호환성 확인
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("이 브라우저는 음성 인식을 지원하지 않습니다.");
      console.warn("사용 가능한 API:", {
        SpeechRecognition: !!window.SpeechRecognition,
        webkitSpeechRecognition: !!(window as any).webkitSpeechRecognition,
        userAgent: navigator.userAgent,
      });
      return;
    }

    // SpeechRecognition 인스턴스 생성
    const recognition = new SpeechRecognition();

    // iOS Safari 호환성: continuous 모드가 제대로 작동하지 않을 수 있음
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    recognition.continuous = true; // 연속 인식
    recognition.interimResults = true; // 중간 결과도 받기
    recognition.lang = "ko-KR"; // 한국어 설정

    console.log("음성 인식 초기화 완료:", {
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
      lang: recognition.lang,
      userAgent: navigator.userAgent,
      isIOS: isIOS,
    });

    // 인식 결과 처리
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      console.log("음성 인식 결과 받음:", {
        resultIndex: event.resultIndex,
        resultsLength: event.results.length,
      });

      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;

        console.log(`결과 ${i}:`, {
          transcript,
          isFinal,
          confidence: result[0].confidence,
        });

        if (isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      // 최종 결과가 있으면 현재 수집 중인 텍스트에 누적
      if (finalTranscript) {
        const finalText = finalTranscript.trim();
        setCurrentSpeechText((prev) => {
          const newText = (prev + " " + finalText).trim();
          console.log("최종 결과 추가, 전체 텍스트:", newText);
          return newText;
        });
        // 중간 결과는 최종 결과에 포함되므로 초기화
        setInterimTranscript("");
        
        // 최종 결과가 나왔으므로 침묵 타이머 시작
        if (speechSilenceTimerRef.current) {
          clearTimeout(speechSilenceTimerRef.current);
        }
        
        // 1.5초 후 자동 전송
        speechSilenceTimerRef.current = setTimeout(() => {
          setCurrentSpeechText((currentText) => {
            const messageText = currentText.trim();

            if (messageText && !isLoadingRef.current) {
              console.log("최종 결과 침묵 감지 - 메시지 전송:", messageText);

              // 상태 초기화
              setCurrentSpeechText("");
              setListeningState("processing");

              // 사용자 메시지 추가
              addMessage({
                role: "user",
                content: messageText,
              });

              // 로딩 시작
              setLoading(true);

              // API 호출
              fetch("/api/chat", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messages: [
                    ...messages.map((msg) => ({
                      role: msg.role,
                      content: msg.content,
                    })),
                    {
                      role: "user" as const,
                      content: messageText,
                    },
                  ],
                  character: selectedCharacter,
                }),
              })
                .then((res) => {
                  if (!res.ok) {
                    throw new Error("API 호출 실패");
                  }
                  return res.json();
                })
                .then((data) => {
                  console.log("API 응답 받음:", data);

                  // 응답의 text를 채팅창에 추가
                  if (data.text) {
                    addMessage({
                      role: "assistant",
                      content: data.text,
                    });

                    // 답변 표시 시작 (TTS 재생 중에는 계속 표시)
                    setShowMessage(true);

                    // 기존 타이머 정리
                    if (messageDisplayTimerRef.current) {
                      clearTimeout(messageDisplayTimerRef.current);
                    }

                    // 타이머는 TTS 종료 시 설정
                  }

                  // emotion 상태 업데이트
                  if (data.emotion) {
                    setEmotion(data.emotion);
                  }

                  // audio 상태 업데이트
                  if (data.audio) {
                    console.log("✅ 오디오 데이터 저장:", data.audio.length, "bytes");
                    setAudio(data.audio);
                  } else {
                    console.log("❌ 오디오 데이터 없음");
                    setAudio(null);
                  }

                  setLoading(false);
                })
                .catch((error) => {
                  console.error("채팅 오류:", error);
                  addMessage({
                    content: "죄송해요, 오류가 발생했어요. 다시 시도해주세요!",
                    role: "assistant",
                  });
                  setLoading(false);
                });
            }

            return ""; // 상태 초기화
          });
        }, 1500); // 1.5초 침묵 감지
      }

      // 중간 결과가 있으면 실시간으로 표시
      if (interimTranscript) {
        console.log("중간 결과 (실시간):", interimTranscript);
        console.log("현재 상태:", {
          interimTranscript,
          currentSpeechText,
          listeningState,
          isListening: isListeningRef.current,
        });
        setInterimTranscript(interimTranscript);
        setListeningState("speaking");

        // 침묵 타이머 리셋 (새로운 음성 입력이 있으므로)
        if (speechSilenceTimerRef.current) {
          clearTimeout(speechSilenceTimerRef.current);
        }

        // 1.5초 동안 새로운 입력이 없으면 전송
        speechSilenceTimerRef.current = setTimeout(() => {
          setCurrentSpeechText((currentText) => {
            const messageText = (currentText + " " + interimTranscript).trim();

            if (messageText && !isLoadingRef.current) {
              console.log("침묵 감지 - 메시지 전송:", messageText);

              // 상태 초기화
              setInterimTranscript("");
              setCurrentSpeechText("");
              setListeningState("processing");

              // 사용자 메시지 추가
              addMessage({
                role: "user",
                content: messageText,
              });

              // 로딩 시작
              setLoading(true);

              // 최신 messages 상태를 가져오기 위해 함수형 업데이트 사용
              fetch("/api/chat", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messages: [
                    ...messages.map((msg) => ({
                      role: msg.role,
                      content: msg.content,
                    })),
                    {
                      role: "user" as const,
                      content: messageText,
                    },
                  ],
                  character: selectedCharacter,
                }),
              })
                .then((res) => {
                  if (!res.ok) {
                    throw new Error("API 호출 실패");
                  }
                  return res.json();
                })
                .then((data) => {
                  console.log("API 응답 받음:", data);

                  // 응답의 text를 채팅창에 추가
                  if (data.text) {
                    addMessage({
                      role: "assistant",
                      content: data.text,
                    });

                    // 답변 표시 시작 (TTS 재생 중에는 계속 표시)
                    setShowMessage(true);

                    // 기존 타이머 정리
                    if (messageDisplayTimerRef.current) {
                      clearTimeout(messageDisplayTimerRef.current);
                    }

                    // 타이머는 TTS 종료 시 설정
                  }

                  // emotion 상태 업데이트
                  if (data.emotion) {
                    setEmotion(data.emotion);
                  }

                  // audio 상태 업데이트
                  if (data.audio) {
                    console.log("✅ 오디오 데이터 저장:", data.audio.length, "bytes");
                    setAudio(data.audio);
                  } else {
                    console.log("❌ 오디오 데이터 없음");
                    setAudio(null);
                  }

                  setLoading(false);
                })
                .catch((error) => {
                  console.error("채팅 오류:", error);
                  addMessage({
                    content: "죄송해요, 오류가 발생했어요. 다시 시도해주세요!",
                    role: "assistant",
                  });
                  setLoading(false);
                });
            }

            return ""; // 상태 초기화
          });
        }, 1500);
      } else if (!interimTranscript && currentSpeechText) {
        // 중간 결과가 없고, 수집된 텍스트가 있으면 침묵 타이머 시작
        if (speechSilenceTimerRef.current) {
          clearTimeout(speechSilenceTimerRef.current);
        }

        speechSilenceTimerRef.current = setTimeout(() => {
          setCurrentSpeechText((currentText) => {
            const messageText = currentText.trim();

            if (messageText && !isLoadingRef.current) {
              console.log(
                "침묵 감지 (최종 결과만) - 메시지 전송:",
                messageText
              );

              // 상태 초기화
              setCurrentSpeechText("");
              setListeningState("processing");

              // 사용자 메시지 추가
              addMessage({
                role: "user",
                content: messageText,
              });

              // 로딩 시작
              setLoading(true);

              // API 호출
              fetch("/api/chat", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messages: [
                    ...messages.map((msg) => ({
                      role: msg.role,
                      content: msg.content,
                    })),
                    {
                      role: "user" as const,
                      content: messageText,
                    },
                  ],
                  character: selectedCharacter,
                }),
              })
                .then((res) => {
                  if (!res.ok) {
                    throw new Error("API 호출 실패");
                  }
                  return res.json();
                })
                .then((data) => {
                  console.log("API 응답 받음:", data);

                  if (data.text) {
                    addMessage({
                      role: "assistant",
                      content: data.text,
                    });

                    // 답변 표시 시작 (TTS 재생 중에는 계속 표시)
                    setShowMessage(true);

                    // 기존 타이머 정리
                    if (messageDisplayTimerRef.current) {
                      clearTimeout(messageDisplayTimerRef.current);
                    }

                    // 타이머는 TTS 종료 시 설정
                  }

                  if (data.emotion) {
                    setEmotion(data.emotion);
                  }

                  if (data.audio) {
                    console.log(
                      "오디오 데이터 설정:",
                      data.audio.length > 0 ? "있음" : "없음"
                    );
                    setAudio(data.audio);
                  } else {
                    console.log("오디오 데이터 없음");
                    setAudio(null);
                  }

                  setLoading(false);
                })
                .catch((error) => {
                  console.error("채팅 오류:", error);
                  addMessage({
                    content: "죄송해요, 오류가 발생했어요. 다시 시도해주세요!",
                    role: "assistant",
                  });
                  setLoading(false);
                });
            }

            return ""; // 상태 초기화
          });
        }, 1500);
      } else if (!interimTranscript && !currentSpeechText) {
        // 아무 결과도 없으면 다시 듣는 중 상태로
        setInterimTranscript("");
        if (isListeningRef.current) {
          setListeningState("listening");
        }
      }
    };

    // 에러 처리
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("음성 인식 오류:", {
        error: event.error,
        message: event.message,
        type: event.error,
      });
      setIsListening(false);
      isListeningRef.current = false;
      autoRestartRef.current = false; // 재시도 방지

      // 특정 에러 타입별 처리
      switch (event.error) {
        case "no-speech":
          // 침묵은 정상이므로 무시
          break;
        case "audio-capture":
        case "not-allowed":
          // 권한 거부 또는 마이크 없음 - 재시도 방지
          permissionDeniedRef.current = true;
          setHasPermissionDenied(true);
          console.warn(
            "마이크 권한이 거부되었거나 마이크를 찾을 수 없습니다. 음성 인식 기능이 비활성화됩니다."
          );
          // 토스트 메시지 표시 (한 번만)
          if (!showPermissionToast) {
            setShowPermissionToast(true);
            setTimeout(() => setShowPermissionToast(false), 5000);
          }
          // 자동 재시작 방지
          autoRestartRef.current = false;
          break;
        case "network":
          console.error("네트워크 오류가 발생했습니다.");
          break;
        case "aborted":
          // 사용자가 중단한 경우
          break;
        default:
          console.error("알 수 없는 음성 인식 오류:", event.error);
          setListeningState("listening");
      }
    };

    // 인식 종료 처리
    recognition.onend = () => {
      console.log("음성 인식 종료됨", {
        autoRestart: autoRestartRef.current,
        isAudioPlaying: isAudioPlayingRef.current,
        isLoading: isLoadingRef.current,
        isMuted: isMuted,
        permissionDenied: permissionDeniedRef.current,
      });

      isListeningRef.current = false;
      setIsListening(false);

      // 권한이 거부된 경우 재시작하지 않음
      if (permissionDeniedRef.current) {
        autoRestartRef.current = false;
        return;
      }

      // 의도적으로 중지한 경우가 아니고, AI가 말하지 않고, 로딩 중이 아니고, 음소거 상태가 아닐 때만 재시작
      if (
        autoRestartRef.current &&
        !isAudioPlayingRef.current &&
        !isLoadingRef.current &&
        recognitionRef.current && // recognition이 여전히 존재하는지 확인
        !isMuted && // 음소거 상태가 아닐 때만
        !permissionDeniedRef.current // 권한이 거부되지 않았을 때만
      ) {
        console.log("음성 인식 자동 재시작 시도...");
        // TTS 완전 종료 후 충분한 지연 (스피커 잔향 방지)
        setTimeout(() => {
          // 재시작 전에 다시 한 번 상태 확인
          if (
            !isAudioPlayingRef.current &&
            !isLoadingRef.current &&
            recognitionRef.current &&
            !isListeningRef.current &&
            !isMuted &&
            !permissionDeniedRef.current
          ) {
            startRecognition();
          }
        }, 800); // 100ms → 800ms로 증가 (TTS 완전 종료 대기)
      } else {
        autoRestartRef.current = false;
      }
    };

    // iOS Safari에서 시작 이벤트 확인
    recognition.onstart = () => {
      console.log("음성 인식 시작됨 (onstart 이벤트)");
    };

    // iOS Safari에서 음성 감지 이벤트 확인
    recognition.onspeechstart = () => {
      console.log("음성 감지 시작됨 (onspeechstart 이벤트)");
      setListeningState("speaking");
    };

    recognition.onspeechend = () => {
      console.log("음성 감지 종료됨 (onspeechend 이벤트)");
    };

    recognition.onsoundstart = () => {
      console.log("소리 감지 시작됨 (onsoundstart 이벤트)");
    };

    recognition.onsoundend = () => {
      console.log("소리 감지 종료됨 (onsoundend 이벤트)");
    };

    recognitionRef.current = recognition;

    // 사용자 상호작용 후 시작 (iOS Safari 호환성)
    // 페이지 로드 시 자동 시작 대신, 사용자가 마이크 버튼을 클릭하거나 페이지와 상호작용한 후 시작
    const handleUserInteraction = async () => {
      // 권한이 거부된 경우 시작하지 않음
      if (permissionDeniedRef.current) {
        return;
      }

      if (!isMuted && !isListeningRef.current) {
        // 약간의 지연 후 시작 (브라우저 정책 준수)
        setTimeout(() => {
          if (!permissionDeniedRef.current) {
            startRecognition();
          }
        }, 300);
      }
      // 이벤트 리스너 제거
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
    };

    // 사용자 상호작용 대기
    document.addEventListener("click", handleUserInteraction, { once: true });
    document.addEventListener("touchstart", handleUserInteraction, {
      once: true,
    });

    // 5초 후에도 상호작용이 없으면 자동 시작 시도
    const autoStartTimer = setTimeout(() => {
      if (
        !isMuted &&
        !isListeningRef.current &&
        !isAudioPlayingRef.current && // TTS 재생 중이 아닐 때만
        recognitionRef.current &&
        !permissionDeniedRef.current
      ) {
        try {
          startRecognition();
        } catch (error) {
          console.warn("자동 시작 실패, 사용자 상호작용 대기 중:", error);
        }
      }
    }, 5000);

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      // 이벤트 리스너 정리
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("touchend", handleUserInteraction);
      clearTimeout(autoStartTimer);
    };
  }, [resetSilenceTimer, startRecognition, isMuted, checkMicrophonePermission]);

  // ref 업데이트 및 TTS 종료 후 음성 인식 재시작 + 자막 숨김
  useEffect(() => {
    const wasPlaying = isAudioPlayingRef.current;
    isAudioPlayingRef.current = isAudioPlaying;

    // TTS 재생이 끝났을 때 (true → false)
    if (wasPlaying && !isAudioPlaying) {
      console.log("🎤 TTS 재생 종료, 음성 인식 재시작 대기...");
      
      // 자막을 2초 후에 숨김 (사용자가 읽을 시간 확보)
      if (messageDisplayTimerRef.current) {
        clearTimeout(messageDisplayTimerRef.current);
      }
      messageDisplayTimerRef.current = setTimeout(() => {
        setShowMessage(false);
      }, 2000);
      
      // 충분한 지연 후 음성 인식 재시작
      setTimeout(() => {
        if (
          !isMuted &&
          !isListeningRef.current &&
          !isLoadingRef.current &&
          recognitionRef.current &&
          !permissionDeniedRef.current
        ) {
          console.log("🎤 음성 인식 재시작");
          startRecognition();
        }
      }, 800); // 스피커 잔향이 완전히 사라질 때까지 대기
    }
  }, [isAudioPlaying, isMuted, startRecognition]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // 오디오 컨텍스트 초기화 및 자동 재생 허용 모달
  useEffect(() => {
    // 로컬 스토리지에서 이전 허용 여부 확인
    const audioPermission = localStorage.getItem("audioAutoplayPermission");

    if (audioPermission === "granted") {
      // 이미 허용된 경우 오디오 컨텍스트 활성화
      unlockAudioContext();
    } else {
      // 처음 접속 시 모달 표시
      const hasSeenModal = sessionStorage.getItem("hasSeenAudioModal");
      if (!hasSeenModal) {
        setShowAudioPermissionModal(true);
        sessionStorage.setItem("hasSeenAudioModal", "true");
      }
    }
  }, []);

  // 오디오 컨텍스트 활성화 함수
  const unlockAudioContext = useCallback(async () => {
    try {
      // AudioContext 생성
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn("AudioContext를 지원하지 않는 브라우저입니다.");
        return;
      }

      const context = new AudioContextClass();
      audioContextRef.current = context;

      // 사용자 상호작용 후 컨텍스트 활성화
      if (context.state === "suspended") {
        await context.resume();
      }

      setAudioContextUnlocked(true);
      console.log("오디오 컨텍스트 활성화 완료");
    } catch (error) {
      console.error("오디오 컨텍스트 활성화 실패:", error);
    }
  }, []);

  // 오디오 자동 재생 허용 처리
  const handleAllowAudioAutoplay = useCallback(async () => {
    await unlockAudioContext();
    localStorage.setItem("audioAutoplayPermission", "granted");
    setShowAudioPermissionModal(false);
  }, [unlockAudioContext]);

  // 오디오 자동 재생 거부 처리
  const handleDenyAudioAutoplay = useCallback(() => {
    localStorage.setItem("audioAutoplayPermission", "denied");
    setShowAudioPermissionModal(false);
  }, []);

  // 초기 인사말 상태 관리
  const [showGreetingButton, setShowGreetingButton] = useState(false);
  const greetingAudioRef = useRef<string | null>(null);

  // 초기 인사말 준비 (음성은 버튼 클릭 시 재생)
  useEffect(() => {
    const hasGreeted = sessionStorage.getItem('hasGreeted');
    
    if (!hasGreeted && selectedCharacter === 'jinyoung') {
      // 세션 중 한 번만 인사 준비
      sessionStorage.setItem('hasGreeted', 'true');
      
      // 약간의 지연 후 인사 준비 (페이지 로드 완료 대기)
      setTimeout(async () => {
        const greetingText = "만나서 반가워요! 오늘의 대화 주제는 뭐에요?";
        
        // TTS 미리 생성 (API 호출)
        try {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: "사용자에게 첫 인사를 합니다.",
                },
                {
                  role: "assistant",
                  content: greetingText,
                },
              ],
              character: "jinyoung",
              greeting: true, // 인사말 플래그
            }),
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // 오디오를 미리 저장 (버튼 클릭 시 재생)
            if (data.audio) {
              greetingAudioRef.current = data.audio;
              console.log("✅ 인사말 TTS 준비 완료");
            }
          }
          
          // 루피의 인사말 메시지 추가
          addMessage({
            role: "assistant",
            content: greetingText,
          });
          
          // 자막 표시
          setShowMessage(true);
          
          // "대화 시작" 버튼 표시
          setShowGreetingButton(true);
        } catch (error) {
          console.error("초기 인사말 TTS 생성 실패:", error);
        }
      }, 1500); // 1.5초 후 인사 준비
    }
  }, [selectedCharacter, addMessage, setEmotion, setAudio]);

  // "대화 시작" 버튼 클릭 핸들러
  const handleStartConversation = () => {
    if (greetingAudioRef.current) {
      // 감정을 happy로 설정 (smile.001 애니메이션)
      setEmotion("happy");
      
      // 오디오 재생 (사용자 인터랙션으로 자동재생 정책 통과)
      setAudio(greetingAudioRef.current);
      
      console.log("✅ 인사말 재생 시작 (사용자 클릭)");
    }
    
    // 버튼 숨기기
    setShowGreetingButton(false);
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (messageDisplayTimerRef.current) {
        clearTimeout(messageDisplayTimerRef.current);
      }
      if (speechSilenceTimerRef.current) {
        clearTimeout(speechSilenceTimerRef.current);
      }
    };
  }, []);

  // AI가 말하는 중이거나 로딩 중일 때 마이크 중지
  useEffect(() => {
    if (isAudioPlaying || isLoading) {
      // AI가 말하는 중 또는 처리 중
      if (isListening) {
        // 이미 듣고 있는 상태면 중지
        stopRecognition();
      }
      setListeningState(isAudioPlaying ? "ai-speaking" : "processing");
    } else {
      // AI 말하기가 끝나면 다시 듣기 시작
      if (!isListening && recognitionRef.current) {
        autoRestartRef.current = true;
        // 약간의 지연 후 시작 (상태 업데이트 후)
        setTimeout(() => {
          if (recognitionRef.current && !isListening) {
            startRecognition();
          }
        }, 100);
      } else if (isListening) {
        setListeningState("listening");
      }
    }
  }, [isAudioPlaying, isLoading, isListening, startRecognition]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !isLoading &&
      !isAudioPlaying
    ) {
      e.preventDefault();
      handleSend();
    }
  };

  // 캐릭터별 배경 그라디언트 설정
  const backgroundGradient = selectedCharacter === "jinyoung"
    ? "linear-gradient(to top, rgba(255, 192, 203, 0.3) 0%, rgba(255, 182, 193, 0.15) 15%, transparent 25%)" // 루피: 밝은 핑크 그라디언트
    : "linear-gradient(to top, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 15%, transparent 20%)"; // 서아: 검은색 딤드
  
  return (
    <>
      {/* 배경 하단 그라디언트 딤드 처리 */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: backgroundGradient,
        }}
      />

      {/* 전체 화면 터치로 대화 시작 (초기 인사말용) */}
      {showGreetingButton && (
        <div
          onClick={handleStartConversation}
          className="fixed inset-0 z-40 bg-black/60 flex flex-col items-center justify-center cursor-pointer"
          style={{
            backdropFilter: "blur(20px)",
            animation: "fadeIn 0.5s ease-in-out",
          }}
        >
          {/* 안내 텍스트 */}
          <div
            className="flex flex-col items-center gap-4"
            style={{
              animation: "pulse 2s ease-in-out infinite",
            }}
          >
            <div
              style={{
                color: "#FFF",
                fontFamily: '"Noto Sans KR", "Pretendard Variable", Pretendard, sans-serif',
                fontSize: "24px",
                fontWeight: 600,
                lineHeight: "32px",
                textAlign: "center",
                textShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                padding: "0 20px",
              }}
            >
              루피가 인사하고 싶어해요! 👋
            </div>
            
            {/* 터치 안내 */}
            <div
              style={{
                color: "rgba(255, 255, 255, 0.9)",
                fontFamily: '"Noto Sans KR", "Pretendard Variable", Pretendard, sans-serif',
                fontSize: "16px",
                fontWeight: 400,
                lineHeight: "24px",
                textAlign: "center",
                textShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
              }}
            >
              화면을 터치하여 시작하세요
            </div>
            
            {/* 터치 아이콘 애니메이션 */}
            <div
              style={{
                marginTop: "16px",
                fontSize: "48px",
                animation: "bounce 1.5s ease-in-out infinite",
              }}
            >
              👆
            </div>
          </div>
        </div>
      )}

      {/* 우상단 캐릭터 선택 버튼 */}
      <div
        className="fixed top-0 right-0 z-20 pointer-events-auto"
        style={{
          marginTop: "16px",
          marginRight: "20px", // px-5와 동일한 여백
          touchAction: 'auto',
        }}
      >
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
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => {
            setShowCharacterModal(true);
          }}
        >
          <LayoutGrid className="w-6 h-6 text-[#1d1d1d]" fill="currentColor" />
        </button>
      </div>

      {/* 캐릭터 선택 모달 */}
      {showCharacterModal && (
        <>
          {/* Dimmed 배경 */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            style={{
              backdropFilter: "blur(4px)",
              touchAction: 'auto',
            }}
            onClick={() => setShowCharacterModal(false)}
          />

          {/* 모달 */}
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ touchAction: 'none' }}
          >
            <div
              className="pointer-events-auto"
              style={{
                width: "80vw",
                height: "80vw",
                maxWidth: "600px",
                maxHeight: "600px",
                borderRadius: "24px",
                border: "1px solid rgba(255, 255, 255, 0.40)",
                background: "#FFF",
                backdropFilter: "blur(10px)",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                touchAction: 'auto',
              }}
            >
              {/* 헤더 */}
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {/* 왼쪽 타이틀 */}
                <h3
                  style={{
                    color: "#1D1D1D",
                    fontFamily:
                      '"Noto Sans KR", "Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "20px",
                    fontStyle: "normal",
                    fontWeight: 500,
                    lineHeight: "24px",
                    letterSpacing: "-0.4px",
                    margin: 0,
                  }}
                >
                  캐릭터 선택창
                </h3>

                {/* 오른쪽 X 버튼 */}
                <button
                  style={{
                    display: "flex",
                    width: "44px",
                    height: "44px",
                    padding: "10px",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "10px",
                    flexShrink: 0,
                    borderRadius: "12px",
                    border: "1px solid #EEE",
                    background: "#FAFAFA",
                    cursor: "pointer",
                  }}
                  onClick={() => setShowCharacterModal(false)}
                >
                  <X size={24} color="#1D1D1D" />
                </button>
              </div>

              {/* 캐릭터 선택 컨테이너 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  flex: 1,
                  width: "100%",
                }}
              >
                {/* 루피 캐릭터 (기본) */}
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setSelectedCharacter("jinyoung");
                    setShowCharacterModal(false);
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      aspectRatio: "1 / 1.23",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "20px",
                      border:
                        selectedCharacter === "jinyoung"
                          ? "2px solid #5A35EC"
                          : "1px solid #EEE",
                      background: "#FAFAFA",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* 선택 체크마크 */}
                    {selectedCharacter === "jinyoung" && (
                      <div
                        style={{
                          position: "absolute",
                          top: "12px",
                          left: "12px",
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          background: "#5A35EC",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: 10,
                        }}
                      >
                        <Check size={24} color="#FFF" />
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      alignSelf: "stretch",
                      color: "#1D1D1D",
                      textAlign: "center",
                      fontFamily:
                        '"Noto Sans KR", "Pretendard Variable", Pretendard, sans-serif',
                      fontSize: "18px",
                      fontStyle: "normal",
                      fontWeight: 500,
                      lineHeight: "24px",
                      letterSpacing: "-0.36px",
                    }}
                  >
                    루피
                  </div>
                </div>

                {/* 서아 캐릭터 */}
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setSelectedCharacter("test");
                    setShowCharacterModal(false);
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      aspectRatio: "1 / 1.23",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "20px",
                      border:
                        selectedCharacter === "test"
                          ? "2px solid #5A35EC"
                          : "1px solid #EEE",
                      background: "#FAFAFA",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* 선택 체크마크 */}
                    {selectedCharacter === "test" && (
                      <div
                        style={{
                          position: "absolute",
                          top: "12px",
                          left: "12px",
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          background: "#5A35EC",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: 10,
                        }}
                      >
                        <Check size={24} color="#FFF" />
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      alignSelf: "stretch",
                      color: "#1D1D1D",
                      textAlign: "center",
                      fontFamily:
                        '"Noto Sans KR", "Pretendard Variable", Pretendard, sans-serif',
                      fontSize: "18px",
                      fontStyle: "normal",
                      fontWeight: 500,
                      lineHeight: "24px",
                      letterSpacing: "-0.36px",
                    }}
                  >
                    서아
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {/* 오디오 자동 재생 허용 모달 */}
      {showAudioPermissionModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{ touchAction: 'auto' }}
        >
          <div
            className="mx-4 max-w-sm rounded-2xl p-6 shadow-xl"
            style={{
              background: "#FFF",
              backdropFilter: "blur(10px)",
            }}
          >
            <h3
              className="mb-4 text-lg font-semibold"
              style={{
                color: "#1d1d1d",
                fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
              }}
            >
              오디오 자동 재생 허용
            </h3>
            <p
              className="mb-6 text-sm leading-relaxed"
              style={{
                color: "#666",
                fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
              }}
            >
              캐릭터의 음성을 자동으로 재생하려면 오디오 자동 재생을
              허용해주세요. 화면을 터치하여 허용해주세요.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDenyAudioAutoplay}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
                style={{
                  background: "#F5F5F5",
                  color: "#666",
                  fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                }}
              >
                나중에
              </button>
              <button
                onClick={handleAllowAudioAutoplay}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-medium text-white transition-colors"
                style={{
                  background:
                    "linear-gradient(180deg, #8569F2 0%, #5A35EC 100%)",
                  fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                }}
              >
                허용
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 권한 거부 토스트 메시지 */}
      {showPermissionToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg"
            style={{
              background: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(10px)",
            }}
          >
            <span
              style={{
                color: "#FFF",
                fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                fontSize: "13px",
                fontWeight: 400,
              }}
            >
              마이크 권한이 필요합니다
            </span>
          </div>
        </div>
      )}
      {/* 준비 중 토스트 메시지 */}
      {showComingSoonToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg"
            style={{
              background: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(10px)",
            }}
          >
            <span
              style={{
                color: "#FFF",
                fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                fontSize: "13px",
                fontWeight: 400,
              }}
            >
              준비 중입니다..
            </span>
          </div>
        </div>
      )}
      {/* 듣는 중 인디케이터 / 답변 표시 */}
      {((listeningState === "listening" && !isMuted) ||
        isLoading ||
        showMessage) && (
        <div 
          className="fixed left-0 right-0 pointer-events-none z-10 flex justify-center px-3 sm:px-4"
          style={{ 
            bottom: 'calc(56px + 48px + 48px)', // 입력창 높이(56px) + 하단 여백(48px) + 간격(48px)
            touchAction: 'none'
          }}
        >
          <div className="w-full pointer-events-none flex justify-center">
            <div
              className="inline-flex flex-col justify-center items-start"
              style={{
                minHeight: "32px",
                padding: "8px 12px",
                gap: "8px",
                borderRadius: "12px",
                background: "rgba(0, 0, 0, 0.20)",
                backdropFilter: "blur(10px)",
              }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="flex space-x-1">
                    <div
                      className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              ) : showMessage &&
                currentMessage &&
                currentMessage.role === "assistant" ? (
                <p
                  className="whitespace-pre-wrap"
                  style={{
                    alignSelf: "stretch",
                    color: "#FFF",
                    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "16px",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "24px",
                    letterSpacing: "-0.32px",
                  }}
                >
                  {currentMessage.content}
                </p>
              ) : (interimTranscript || currentSpeechText) && isListening ? (
                <span
                  style={{
                    color: "#FFF",
                    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "16px",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "24px",
                    letterSpacing: "-0.32px",
                  }}
                >
                  {currentSpeechText && interimTranscript
                    ? `${currentSpeechText} ${interimTranscript}`
                    : interimTranscript || currentSpeechText}
                </span>
              ) : listeningState === "processing" ? (
                <span
                  style={{
                    color: "#FFF",
                    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "16px",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "24px",
                    letterSpacing: "-0.32px",
                  }}
                >
                  전달 중...
                </span>
              ) : listeningState === "listening" && !isMuted ? (
                <span
                  style={{
                    color: "#FFF",
                    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "16px",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "24px",
                    letterSpacing: "-0.32px",
                  }}
                >
                  듣는 중...
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 입력창 영역 */}
        <div
          className="fixed bottom-0 left-0 right-0 w-full pointer-events-auto px-5 z-10"
          style={{ 
            marginBottom: "0px",
            paddingTop: "16px",
            paddingBottom: "48px",
            background: "linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(0, 0, 0, 0.8) 100%)",
            touchAction: 'auto' 
          }}
        >
          <div
            className="flex items-center transition-all duration-300 ease-in-out"
            style={{
              padding: "0 10px",
              gap: inputValue.trim() ? "0px" : "6px",
            }}
          >
            {/* 왼쪽 음소거 버튼 (텍스트 입력 중일 때는 숨김) */}
            <button
              onClick={async () => {
                if (isMuted) {
                  // 음소거 해제
                  setIsMuted(false);
                  autoRestartRef.current = true;

                  // 마이크 권한 확인 (권한이 거부된 경우에도 강제로 다시 요청)
                  const hasPermission = await checkMicrophonePermission(
                    permissionDeniedRef.current
                  );
                  if (!hasPermission) {
                    setIsMuted(true); // 권한이 없으면 음소거 상태 유지
                    return;
                  }

                  // 약간의 지연 후 시작 (TTS 재생 중이 아닐 때만)
                  setTimeout(() => {
                    if (
                      !isLoading &&
                      !isAudioPlaying &&
                      recognitionRef.current &&
                      !isMuted &&
                      !permissionDeniedRef.current
                    ) {
                      startRecognition();
                    }
                  }, 500); // 300ms → 500ms로 증가
                } else {
                  // 음소거 활성화
                  setIsMuted(true);
                  if (isListening) {
                    stopRecognition();
                  }
                  autoRestartRef.current = false;
                }
              }}
              disabled={
                isLoading ||
                isAudioPlaying ||
                permissionDeniedRef.current ||
                hasPermissionDenied
              }
              className="flex flex-col justify-center items-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                width: inputValue.trim() ? "0px" : "52px",
                height: "52px",
                marginRight: inputValue.trim() ? "0px" : "6px",
                opacity: inputValue.trim() ? 0 : 1,
                borderRadius: "16px",
                border: "1.5px solid #D3D3D3",
                background: hasPermissionDenied
                  ? "#9CA3AF"
                  : isMuted
                  ? "#FF4F4F"
                  : "#FFF",
                backdropFilter: "blur(10px)",
              }}
              title={
                hasPermissionDenied
                  ? "마이크 권한이 필요합니다"
                  : isMuted
                  ? "음소거 해제"
                  : "음소거"
              }
            >
              {isMuted ? (
                <MicOff className="w-5 h-5 text-white" fill="currentColor" />
              ) : (
                <Mic className="w-5 h-5 text-[#1d1d1d]" />
              )}
            </button>

            {/* 인풋 필드 + 대화/전송 버튼 */}
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
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => {
                  // Input 포커스 시 음성 인식 중지
                  if (isListening) {
                    stopRecognition();
                    autoRestartRef.current = false;
                  }
                  setIsFocused(true);
                }}
                onBlur={() => {
                  setIsFocused(false);
                }}
                placeholder="무엇이든지 물어보세요."
                className="flex-1 bg-transparent text-[#1d1d1d] placeholder-[#1d1d1d]/60 resize-none outline-none text-lg leading-relaxed max-h-32 scrollbar-hide"
                rows={1}
                disabled={isLoading || isAudioPlaying}
                style={{
                  fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                }}
              />
              
              {/* 대화 버튼 / 전송 버튼 전환 (인풋 안에) */}
              <button
                onClick={() => {
                  if (isFocused || inputValue.trim()) {
                    // 포커스 중이거나 텍스트가 있으면 전송
                    handleSend();
                  } else {
                    // 그 외에는 채팅 화면으로 이동
                    router.push("/chat");
                  }
                }}
                disabled={isLoading || isAudioPlaying || (isFocused && !inputValue.trim())}
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
                title={isFocused || inputValue.trim() ? "전송" : "대화"}
              >
                {isFocused || inputValue.trim() ? (
                  <ArrowUp className="w-6 h-6 text-white" />
                ) : (
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="w-5 h-5 text-white" />
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
                      대화
                    </span>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
    </>
  );
}
