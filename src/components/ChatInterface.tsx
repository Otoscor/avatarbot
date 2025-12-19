"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/store/useChatStore";
import { ArrowUp, Mic, MicOff } from "lucide-react";

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
  const [inputValue, setInputValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // 음소거 상태
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
  const permissionDeniedRef = useRef<boolean>(false); // 권한 거부 ref (재시도 방지용)
  const {
    messages,
    isLoading,
    isAudioPlaying,
    addMessage,
    setLoading,
    setEmotion,
    setAudio,
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

      // 답변 표시 시작
      setShowMessage(true);

      // 기존 타이머 정리
      if (messageDisplayTimerRef.current) {
        clearTimeout(messageDisplayTimerRef.current);
      }

      // 5초 후 답변 숨기기
      messageDisplayTimerRef.current = setTimeout(() => {
        setShowMessage(false);
      }, 5000);

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

      // 최종 결과가 있으면 바로 전송 (입력창에 표시하지 않음)
      if (finalTranscript) {
        const messageText = finalTranscript.trim();
        console.log("최종 결과 - 바로 전송:", messageText);
        
        // 중간 결과 초기화
        setInterimTranscript("");

        if (messageText && !isLoading) {
          // 사용자 메시지 추가
          addMessage({
            role: "user",
            content: messageText,
          });

          // 로딩 시작
          setLoading(true);
          setListeningState("processing");

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

                // 답변 표시 시작
                setShowMessage(true);

                // 기존 타이머 정리
                if (messageDisplayTimerRef.current) {
                  clearTimeout(messageDisplayTimerRef.current);
                }

                // 5초 후 답변 숨김
                messageDisplayTimerRef.current = setTimeout(() => {
                  setShowMessage(false);
                }, 5000);
              }

              // emotion 상태 업데이트
              if (data.emotion) {
                setEmotion(data.emotion);
              }

              // audio 상태 업데이트
              if (data.audio) {
                setAudio(data.audio);
              }

              setLoading(false);
            })
            .catch((error) => {
              console.error("채팅 오류:", error);
              setLoading(false);
            });
        }
      }

      // 중간 결과가 있으면 "말하는 중" 상태로 변경 및 자막에 표시
      if (interimTranscript && !finalTranscript) {
        console.log("중간 결과:", interimTranscript);
        setInterimTranscript(interimTranscript);
        setListeningState("speaking");
      } else if (!interimTranscript && !finalTranscript) {
        // 중간 결과가 없으면 초기화
        setInterimTranscript("");
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
        // 약간의 지연 후 재시작 (브라우저 정책 준수)
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
        }, 100);
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

  // ref 업데이트
  useEffect(() => {
    isAudioPlayingRef.current = isAudioPlaying;
  }, [isAudioPlaying]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (messageDisplayTimerRef.current) {
        clearTimeout(messageDisplayTimerRef.current);
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
      !isListening &&
      !isLoading &&
      !isAudioPlaying
    ) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* 배경 하단 그라디언트 딤드 처리 */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 15%, transparent 20%)",
        }}
      />
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
      <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-end items-center pb-4 px-3 sm:pb-8 sm:px-4">
        {/* 듣는 중 인디케이터 / 답변 표시 */}
        {((listeningState === "listening" && !isMuted) ||
          isLoading ||
          showMessage) && (
          <div className="w-full mb-2 pointer-events-none flex justify-center">
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
                    fontSize: "13px",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "20px",
                    letterSpacing: "-0.26px",
                  }}
                >
                  {currentMessage.content}
                </p>
              ) : listeningState === "speaking" && interimTranscript ? (
                <span
                  style={{
                    color: "#FFF",
                    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "13px",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "20px",
                    letterSpacing: "-0.26px",
                  }}
                >
                  {interimTranscript}
                </span>
              ) : listeningState === "listening" && !isMuted ? (
                <span
                  style={{
                    color: "#FFF",
                    fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
                    fontSize: "13px",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "20px",
                    letterSpacing: "-0.26px",
                  }}
                >
                  듣는 중...
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* 입력창 영역 */}
        <div
          className="w-full pointer-events-auto px-5"
          style={{ marginBottom: "16px" }}
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

                  // 약간의 지연 후 시작
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
                  }, 300);
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
                width: inputValue.trim() ? "0px" : "44px",
                height: "44px",
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
                <MicOff className="w-5 h-5 text-white" />
              ) : (
                <Mic className="w-5 h-5 text-[#1d1d1d]" />
              )}
            </button>

            {/* 인풋 필드 (Submit 버튼 포함) */}
            <div
              className="flex items-center flex-1 transition-all duration-300 ease-in-out"
              style={{
                height: "48px",
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
                placeholder="무엇이든 물어보세요"
                className="flex-1 bg-transparent text-[#1d1d1d] placeholder-[#1d1d1d]/60 resize-none outline-none text-sm leading-relaxed max-h-32 scrollbar-hide"
                rows={1}
                disabled={isLoading || isAudioPlaying}
              />
              {/* Submit 버튼 (인풋 안에) */}
              <button
                onClick={handleSend}
                disabled={
                  !inputValue.trim() ||
                  isLoading ||
                  isListening ||
                  isAudioPlaying
                }
                className="flex justify-center items-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                style={{
                  width: "40px",
                  height: "40px",
                  padding: "0 12px",
                  gap: "4px",
                  borderRadius: "12px",
                  background:
                    "linear-gradient(180deg, #8569F2 0%, #5A35EC 100%)",
                  boxShadow: "0 2px 4px 0 rgba(255, 255, 255, 0.25) inset",
                }}
                title="전송"
              >
                <ArrowUp className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
