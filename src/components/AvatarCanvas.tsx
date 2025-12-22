"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Environment, ContactShadows } from "@react-three/drei";
import Avatar from "./Avatar";
import { useChatStore } from "@/store/useChatStore";

export default function AvatarCanvas() {
  const selectedCharacter = useChatStore((state) => state.selectedCharacter);
  
  // 캐릭터별 환경 설정
  const environmentPreset = "apartment"; // 모든 캐릭터: 실내 배경
  const ambientIntensity = selectedCharacter === "jinyoung" ? 0.8 : 0.4; // 루피: 밝은 반사광
  const directionalIntensity = selectedCharacter === "jinyoung" ? 1.2 : 0.8; // 루피: 강한 햇빛
  
  return (
    <div 
      className="h-screen w-full" 
      style={{ 
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      <Canvas
        camera={{ position: [0, 0.2, 0.8], fov: 55 }}
        gl={{ antialias: true }}
      >
        {/* 환경 설정 - 캐릭터별 배경 */}
        <Suspense fallback={null}>
          <Environment 
            preset={environmentPreset} 
            background 
          />
        </Suspense>

        {/* 조명 설정 - 캐릭터별 조명 */}
        <ambientLight intensity={ambientIntensity} />
        <directionalLight position={[5, 5, 5]} intensity={directionalIntensity} castShadow />
        <directionalLight position={[-5, 3, -5]} intensity={0.3} />

        {/* 아바타 모델 */}
        <Suspense fallback={null}>
          <Avatar />
        </Suspense>

        {/* 그림자 효과 - 캐릭터 발 밑 */}
        <ContactShadows
          position={[0, -1.2, 0]}
          opacity={0.4}
          scale={2}
          blur={2}
          far={1}
          resolution={256}
        />
      </Canvas>
    </div>
  );
}
