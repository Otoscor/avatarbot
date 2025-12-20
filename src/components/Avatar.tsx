"use client";
// Avatar component with VRM model support - REFACTORED

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM } from "@pixiv/three-vrm";
import { useEffect, useState, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useChatStore, type Emotion } from "@/store/useChatStore";

export default function Avatar() {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const currentEmotion = useChatStore((state) => state.currentEmotion);
  const currentAudio = useChatStore((state) => state.currentAudio);
  const setAudioPlaying = useChatStore((state) => state.setAudioPlaying);
  const selectedCharacter = useChatStore((state) => state.selectedCharacter);
  const targetEmotionRef = useRef<Emotion>("neutral");
  const blendShapeWeightsRef = useRef<Record<string, number>>({});

  // 오디오 관련 refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const volumeRef = useRef<number>(0);

  // 마우스 위치 및 시선 관련 refs
  const mousePositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 5));
  const targetLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 5));

  // 눈 깜빡임 관련 refs
  const nextBlinkTimeRef = useRef<number>(0);
  const blinkStartTimeRef = useRef<number>(0);
  const isBlinkingRef = useRef<boolean>(false);
  const blinkWeightRef = useRef<number>(0);

  // 애니메이션 관련 refs
  const vrmInitializedRef = useRef<boolean>(false);

  const { camera } = useThree();

  // VRM 모델 로드 (캐릭터 선택에 따라 다른 파일 로드)
  useEffect(() => {
    console.log("=== VRM 모델 로드 시작 ===");

    // 기존 모델 정리
    if (gltf && groupRef.current) {
      groupRef.current.remove(gltf.scene);
      setGltf(null);
      setVrm(null);
    }

    // 초기화 플래그 리셋
    vrmInitializedRef.current = false;

    // VRMLoaderPlugin을 등록한 로더 생성
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    // 선택된 캐릭터에 따라 다른 VRM 파일 로드
    const vrmPath =
      selectedCharacter === "jinyoung" ? "/zanmangloopy.vrm" : "/test.vrm";

    console.log("VRM 경로:", vrmPath);

    // VRM 파일 로드
    loader.load(
      vrmPath,
      (loadedGltf) => {
        console.log("VRM 로드 성공!");
        setGltf(loadedGltf);
        const vrmData = loadedGltf.userData.vrm as VRM;

        if (vrmData) {
          setVrm(vrmData);

          // ===== 1단계: 디버깅 로그 추가 (필수) =====
          console.log("=== VRM 뼈대 구조 점검 ===");
          if (vrmData.humanoid) {
            const hips = vrmData.humanoid.getNormalizedBoneNode("hips");
            const spine = vrmData.humanoid.getNormalizedBoneNode("spine");
            const head = vrmData.humanoid.getNormalizedBoneNode("head");
            const leftUpperArm =
              vrmData.humanoid.getNormalizedBoneNode("leftUpperArm");
            const rightUpperArm =
              vrmData.humanoid.getNormalizedBoneNode("rightUpperArm");
            const chest = vrmData.humanoid.getNormalizedBoneNode("chest");
            const upperChest =
              vrmData.humanoid.getNormalizedBoneNode("upperChest");

            console.log("Hips 존재:", !!hips, hips);
            console.log("Spine 존재:", !!spine, spine);
            console.log("Chest 존재:", !!chest, chest);
            console.log("UpperChest 존재:", !!upperChest, upperChest);
            console.log("Head 존재:", !!head, head);
            console.log("LeftUpperArm 존재:", !!leftUpperArm, leftUpperArm);
            console.log("RightUpperArm 존재:", !!rightUpperArm, rightUpperArm);

            if (!hips) console.warn("⚠️ Hips 뼈를 찾을 수 없습니다!");
            if (!spine) console.warn("⚠️ Spine 뼈를 찾을 수 없습니다!");
            if (!head) console.warn("⚠️ Head 뼈를 찾을 수 없습니다!");
            if (!leftUpperArm)
              console.warn("⚠️ LeftUpperArm 뼈를 찾을 수 없습니다!");
            if (!rightUpperArm)
              console.warn("⚠️ RightUpperArm 뼈를 찾을 수 없습니다!");
          } else {
            console.error("❌ VRM Humanoid가 없습니다!");
          }

          // 초기 BlendShape 가중치 설정
          const initialWeights: Record<string, number> = {};
          if (vrmData.expressionManager) {
            vrmData.expressionManager.expressions.forEach((expression) => {
              initialWeights[expression.expressionName] = 0;

              // 눈 관련 BlendShape는 초기값을 명시적으로 0으로 설정 (눈 뜨기)
              const expNameLower = expression.expressionName.toLowerCase();
              if (expNameLower.includes("blink")) {
                initialWeights[expression.expressionName] = 0;
                vrmData.expressionManager?.setValue(
                  expression.expressionName,
                  0
                );
              }
            });

            console.log(
              "사용 가능한 BlendShape:",
              vrmData.expressionManager.expressions.map((e) => e.expressionName)
            );
          }
          blendShapeWeightsRef.current = initialWeights;

          // 명시적으로 update 호출하여 초기 상태 반영
          if (vrmData.expressionManager) {
            vrmData.expressionManager.update();
          }

          // lookAt 기능 확인
          if (vrmData.lookAt) {
            console.log("✅ lookAt 기능 사용 가능");
          } else {
            console.warn("⚠️ lookAt 기능을 사용할 수 없습니다");
          }

          vrmInitializedRef.current = true;
          console.log("=== VRM 초기화 완료 ===");
        }
      },
      undefined,
      (error) => {
        console.error("❌ VRM 파일 로드 중 오류 발생:", error);
      }
    );
  }, [selectedCharacter]);

  // GLTF 씬을 그룹에 추가
  useEffect(() => {
    if (gltf && gltf.scene && groupRef.current) {
      // 기존 씬 제거
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }

      // VRM 모델의 위치 및 회전 조정 (캐릭터별로 다른 위치 설정)
      const yPosition = selectedCharacter === "jinyoung" ? -0.5 : -1.2;
      gltf.scene.position.set(0, yPosition, 0);
      gltf.scene.rotation.y = 0; // 정면을 향하도록
      gltf.scene.scale.set(1, 1, 1);
      groupRef.current.add(gltf.scene);

      console.log("✅ VRM 씬이 그룹에 추가됨");
    }
  }, [gltf, selectedCharacter]);

  // emotion이 변경될 때 타겟 emotion 업데이트
  useEffect(() => {
    targetEmotionRef.current = currentEmotion;
  }, [currentEmotion]);

  // 마우스/터치 위치 추적
  useEffect(() => {
    const updateLookAtTarget = (clientX: number, clientY: number) => {
      const x = (clientX / window.innerWidth) * 2 - 1;
      const y = -(clientY / window.innerHeight) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const distance = 2;
      const worldPosition = new THREE.Vector3();
      raycaster.ray.at(distance, worldPosition);

      mousePositionRef.current.copy(worldPosition);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updateLookAtTarget(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        updateLookAtTarget(event.touches[0].clientX, event.touches[0].clientY);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [camera]);

  // 눈 깜빡임 타이머 설정
  useEffect(() => {
    if (!vrm) return;

    nextBlinkTimeRef.current = 3 + Math.random() * 2; // 3~5초 후 첫 깜빡임

    return () => {
      // cleanup
    };
  }, [vrm]);

  // 오디오 재생 및 립싱크 설정
  useEffect(() => {
    console.log("Avatar: 오디오 재생 시도", {
      hasAudio: !!currentAudio,
      audioLength: currentAudio?.length,
      hasVrm: !!vrm,
    });

    if (!currentAudio || !vrm) {
      console.log("Avatar: 오디오 또는 VRM이 없어서 재생하지 않음");
      return;
    }

    // 기존 오디오 정리
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setAudioPlaying(false);
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // 새 오디오 생성 및 재생
    const audio = new Audio(`data:audio/mp3;base64,${currentAudio}`);
    audioRef.current = audio;

    let audioContext: AudioContext;

    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
    } else {
      audioContext = audioContextRef.current;
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    const source = audioContext.createMediaElementSource(audio);
    sourceRef.current = source;

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    console.log("Avatar: 오디오 재생 시작");
    const playAudio = async () => {
      try {
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume();
        }
        await audio.play();
        console.log("Avatar: 오디오 재생 성공");
        setAudioPlaying(true);
      } catch (error: any) {
        console.error("Avatar: 오디오 재생 오류:", error);

        if (
          error.name === "NotAllowedError" ||
          error.name === "NotSupportedError"
        ) {
          console.log("Avatar: 사용자 상호작용 필요, 재시도 대기 중...");

          const handleUserInteraction = async () => {
            if (audioRef.current && audioRef.current.paused) {
              try {
                if (audioContextRef.current?.state === "suspended") {
                  await audioContextRef.current.resume();
                }
                await audioRef.current.play();
                console.log("Avatar: 사용자 상호작용 후 오디오 재생 성공");
                setAudioPlaying(true);
              } catch (retryError) {
                console.error(
                  "Avatar: 사용자 상호작용 후 오디오 재생 재시도 실패:",
                  retryError
                );
                setAudioPlaying(false);
              }
            }

            document.removeEventListener("click", handleUserInteraction);
            document.removeEventListener("touchstart", handleUserInteraction);
          };

          document.addEventListener("click", handleUserInteraction, {
            once: true,
          });
          document.addEventListener("touchstart", handleUserInteraction, {
            once: true,
          });

          setTimeout(() => {
            if (audioRef.current && audioRef.current.paused) {
              console.warn(
                "Avatar: 5초 내 사용자 상호작용 없음, 오디오 재생 포기."
              );
              setAudioPlaying(false);
            }
          }, 5000);
        }
      }
    };

    playAudio();

    audio.onended = () => {
      console.log("Avatar: 오디오 재생 종료");
      volumeRef.current = 0;
      setAudioPlaying(false);

      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      volumeRef.current = 0;
      setAudioPlaying(false);
    };
  }, [currentAudio, vrm, setAudioPlaying]);

  // ===== useFrame 전체 교체 =====
  useFrame((state, delta) => {
    // 1. 필수 객체 체크
    if (!vrm || !vrm.expressionManager || !vrmInitializedRef.current) {
      return;
    }

    const time = state.clock.elapsedTime;
    const lerpSpeed = 3.0; // 표정 변화 속도

    // 2. 뼈 움직임 로직 (물리 업데이트보다 먼저 실행되어야 함)
    if (vrm.humanoid) {
      try {
        // [몸통] 둥실둥실 (위아래 움직임)
        const hips = vrm.humanoid.getNormalizedBoneNode("hips");
        if (hips) {
          // 루피는 키가 작으므로 이동 범위를 0.05로 작게 설정
          hips.position.y = Math.sin(time * 1.5) * 0.05; 
        }

        // [상체] 숨쉬기 (스케일 조절)
        let chest =
          vrm.humanoid.getNormalizedBoneNode("chest") ||
          vrm.humanoid.getNormalizedBoneNode("upperChest") ||
          vrm.humanoid.getNormalizedBoneNode("spine");

        if (chest) {
          const s = 1.0 + Math.sin(time * 2.0) * 0.05; // 호흡을 약간 빠르게
          chest.scale.set(s, s, s);
        }

        // [팔] 차렷 자세 강제 적용 (가장 중요!)
        const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        if (leftUpperArm) {
            // Z축: 팔을 아래로 내림 (-1.2 라디안 = 약 70도)
            // Y축: 팔이 뒤로 돌아가지 않게 0으로 고정
            leftUpperArm.rotation.z = THREE.MathUtils.lerp(leftUpperArm.rotation.z, -1.2, 0.1);
            leftUpperArm.rotation.y = THREE.MathUtils.lerp(leftUpperArm.rotation.y, 0, 0.1);
            leftUpperArm.rotation.x = 0;
        }

        const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        if (rightUpperArm) {
            // Z축: 팔을 아래로 내림 (+1.2 라디안)
            rightUpperArm.rotation.z = THREE.MathUtils.lerp(rightUpperArm.rotation.z, 1.2, 0.1);
            rightUpperArm.rotation.y = THREE.MathUtils.lerp(rightUpperArm.rotation.y, 0, 0.1);
            rightUpperArm.rotation.x = 0;
        }

      } catch (error) {
        console.warn("Animation Error:", error);
      }
    }

    // 3. 표정(BlendShape) 및 립싱크 로직
    // 오디오 볼륨 계산
    if (analyserRef.current && dataArrayRef.current && audioRef.current && !audioRef.current.paused) {
        // @ts-expect-error - getByteFrequencyData accepts Uint8Array
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) sum += dataArrayRef.current[i];
        volumeRef.current = Math.min((sum / dataArrayRef.current.length) / 255, 1.0);
    } else {
        volumeRef.current = 0;
    }

    const allExpressions = vrm.expressionManager.expressions;
    const targetEmotion = targetEmotionRef.current;
    
    // Emotion 매핑 및 가중치 계산
    const emotionMap: Record<string, string> = {
      happy: "happy", sad: "sad", angry: "angry", surprised: "Surprised", neutral: "neutral",
    };
    const targetPresetName = emotionMap[targetEmotion] || "neutral";

    allExpressions.forEach((expression) => {
        const name = expression.expressionName;
        let targetWeight = (name === targetPresetName) ? 1.0 : 0.0;
        
        // 립싱크 (aa)
        if (name.toLowerCase() === 'aa') targetWeight = volumeRef.current * 1.5; // 입을 좀 더 크게 벌리게 1.5배

        // 눈 깜빡임
        if (['blink', 'blinkleft', 'blinkright'].includes(name.toLowerCase())) {
             const currentTime = state.clock.elapsedTime;
             if (!isBlinkingRef.current && currentTime >= nextBlinkTimeRef.current) {
                 isBlinkingRef.current = true;
                 blinkStartTimeRef.current = currentTime;
             }
             if (isBlinkingRef.current) {
                 const elapsed = currentTime - blinkStartTimeRef.current;
                 const duration = 0.15;
                 if (elapsed < duration) {
                     blinkWeightRef.current = elapsed < duration/2 
                        ? THREE.MathUtils.lerp(0, 1, elapsed/(duration/2)) 
                        : THREE.MathUtils.lerp(1, 0, (elapsed-duration/2)/(duration/2));
                 } else {
                     isBlinkingRef.current = false;
                     blinkWeightRef.current = 0;
                     nextBlinkTimeRef.current = currentTime + 3 + Math.random()*2;
                 }
                 targetWeight = blinkWeightRef.current;
             }
        }

        const currentWeight = blendShapeWeightsRef.current[name] || 0;
        const newWeight = THREE.MathUtils.lerp(currentWeight, targetWeight, lerpSpeed * delta);
        blendShapeWeightsRef.current[name] = newWeight;
        vrm.expressionManager?.setValue(name, newWeight);
    });

    // LookAt
    if (vrm.lookAt) {
        targetLookAtRef.current.lerp(mousePositionRef.current, 0.1);
        (vrm.lookAt as any).lookAtTarget = targetLookAtRef.current;
    }

    // 4. VRM 필수 업데이트 (★★★★★ 여기가 가장 중요합니다!)
    // 이 줄이 있어야 위에서 계산한 뼈와 표정 변화가 화면에 그려집니다.
    vrm.update(delta);
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* VRM 모델이 여기에 추가됩니다 */}
    </group>
  );
}
