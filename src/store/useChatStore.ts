import { create } from "zustand";

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

export type Emotion = "happy" | "sad" | "angry" | "neutral" | "surprised";
export type CharacterType = "test" | "jinyoung";

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  currentEmotion: Emotion;
  currentAudio: string | null; // base64 인코딩된 오디오 데이터
  isAudioPlaying: boolean; // 오디오 재생 중 여부
  selectedCharacter: CharacterType; // 선택된 캐릭터
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void;
  setLoading: (loading: boolean) => void;
  setEmotion: (emotion: Emotion) => void;
  setAudio: (audio: string | null) => void;
  setAudioPlaying: (playing: boolean) => void;
  setSelectedCharacter: (character: CharacterType) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  currentEmotion: "neutral",
  currentAudio: null,
  isAudioPlaying: false,
  selectedCharacter: "test", // 기본값: 테스트 캐릭터
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ],
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  setEmotion: (emotion) => set({ currentEmotion: emotion }),
  setAudio: (audio) => set({ currentAudio: audio }),
  setAudioPlaying: (playing) => set({ isAudioPlaying: playing }),
  setSelectedCharacter: (character) => set({ selectedCharacter: character }),
  clearMessages: () => set({ messages: [] }),
}));
