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
            // 🔍 모든 humanoid 본 이름 출력
            console.log("🦴 사용 가능한 모든 본(Bone) 목록:");
            const humanoidBones = vrmData.humanoid.humanBones;
            Object.keys(humanoidBones).forEach((boneName) => {
              const bone = humanoidBones[boneName as any];
              if (bone && bone.node) {
                console.log(`  - ${boneName}: ${bone.node.name}`);
              }
            });

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

            // 🔍 본의 초기 rotation 값 출력 (명확하게)
            if (leftUpperArm) {
              console.log("📍 LeftUpperArm 초기 rotation:");
              console.log(
                `   X: ${leftUpperArm.rotation.x.toFixed(4)} (${(
                  (leftUpperArm.rotation.x * 180) /
                  Math.PI
                ).toFixed(1)}°)`
              );
              console.log(
                `   Y: ${leftUpperArm.rotation.y.toFixed(4)} (${(
                  (leftUpperArm.rotation.y * 180) /
                  Math.PI
                ).toFixed(1)}°)`
              );
              console.log(
                `   Z: ${leftUpperArm.rotation.z.toFixed(4)} (${(
                  (leftUpperArm.rotation.z * 180) /
                  Math.PI
                ).toFixed(1)}°)`
              );
            }
            if (rightUpperArm) {
              console.log("📍 RightUpperArm 초기 rotation:");
              console.log(
                `   X: ${rightUpperArm.rotation.x.toFixed(4)} (${(
                  (rightUpperArm.rotation.x * 180) /
                  Math.PI
                ).toFixed(1)}°)`
              );
              console.log(
                `   Y: ${rightUpperArm.rotation.y.toFixed(4)} (${(
                  (rightUpperArm.rotation.y * 180) /
                  Math.PI
                ).toFixed(1)}°)`
              );
              console.log(
                `   Z: ${rightUpperArm.rotation.z.toFixed(4)} (${(
                  (rightUpperArm.rotation.z * 180) /
                  Math.PI
                ).toFixed(1)}°)`
              );
            }
            if (hips) {
              console.log("📍 Hips 초기 position:");
              console.log(`   X: ${hips.position.x.toFixed(4)}`);
              console.log(`   Y: ${hips.position.y.toFixed(4)}`);
              console.log(`   Z: ${hips.position.z.toFixed(4)}`);
            }
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

  // GLTF 씬을 그룹에 추가 + Skeleton 시각화
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

      // 🔍 1단계: Skeleton 시각화 및 본 이름 전체 출력
      console.log("=== 🦴 SKELETON 진단 시작 ===");
      
      // 모든 Object3D 순회하면서 본 찾기
      const bones: any[] = [];
      gltf.scene.traverse((object: any) => {
        if (object.isBone || object.type === "Bone") {
          bones.push(object);
          console.log(`🦴 본 발견: ${object.name} (type: ${object.type})`);
        }
      });

      console.log(`✅ 총 ${bones.length}개의 본 발견`);

      // SkeletonHelper 추가 (뼈대를 눈으로 확인)
      if (bones.length > 0) {
        const skeletonHelper = new THREE.SkeletonHelper(gltf.scene);
        skeletonHelper.visible = true;
        groupRef.current.add(skeletonHelper);
        console.log("✅ SkeletonHelper 추가됨 (뼈대가 빨간 선으로 보일 겁니다)");
      } else {
        console.warn("⚠️ 본이 하나도 없습니다!");
      }

      console.log("=== 🦴 SKELETON 진단 완료 ===");
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

  // ===== useFrame: 애니메이션 루프 =====
  useFrame((state, delta) => {
    if (!vrm || !vrm.expressionManager || !vrmInitializedRef.current) {
      return;
    }

    const time = state.clock.elapsedTime;
    const lerpSpeed = 3.0;

    // 1. VRM 업데이트 (필수!)
    vrm.update(delta);

    // 2. 뼈 애니메이션: vrm.scene 직접 순회 (강화된 디버깅)
    let leftArmFound = false;
    let rightArmFound = false;
    let hipsFound = false;
    let spineFound = false;

    if (vrm.scene) {
      vrm.scene.traverse((object: any) => {
        if (!object.name) return;

        // 왼팔 내리기 (A-pose)
        if (object.name.toLowerCase().includes("leftupperarm") || 
            object.name.toLowerCase().includes("left_upperarm") ||
            object.name === "leftUpperArm") {
          leftArmFound = true;
          const beforeZ = object.rotation.z;
          object.rotation.x = 0.5;
          object.rotation.y = 0.2;
          object.rotation.z = -0.3;
          
          // 2초마다 로그
          if (Math.floor(time) % 2 === 0 && time - Math.floor(time) < delta) {
            console.log(`🔧 LEFT ARM: ${object.name} | Z: ${beforeZ.toFixed(3)} → ${object.rotation.z.toFixed(3)}`);
          }
        }

        // 오른팔 내리기 (A-pose)
        if (object.name.toLowerCase().includes("rightupperarm") || 
            object.name.toLowerCase().includes("right_upperarm") ||
            object.name === "rightUpperArm") {
          rightArmFound = true;
          const beforeZ = object.rotation.z;
          object.rotation.x = 0.5;
          object.rotation.y = -0.2;
          object.rotation.z = 0.3;
          
          if (Math.floor(time) % 2 === 0 && time - Math.floor(time) < delta) {
            console.log(`🔧 RIGHT ARM: ${object.name} | Z: ${beforeZ.toFixed(3)} → ${object.rotation.z.toFixed(3)}`);
          }
        }

        // 몸통 둥실거림
        if (object.name.toLowerCase().includes("hips") || object.name === "hips") {
          hipsFound = true;
          object.position.y = Math.sin(time * 1.2) * 0.03;
        }

        // 숨쉬기
        if (object.name.toLowerCase().includes("spine") || object.name === "spine") {
          spineFound = true;
          const s = 1.0 + Math.sin(time * 1.5) * 0.02;
          object.scale.set(s, s, s);
        }
      });

      // 본을 못 찾았으면 경고
      if (Math.floor(time) % 3 === 0 && time - Math.floor(time) < delta) {
        if (!leftArmFound) console.warn("⚠️ leftUpperArm 본을 찾을 수 없습니다!");
        if (!rightArmFound) console.warn("⚠️ rightUpperArm 본을 찾을 수 없습니다!");
        if (!hipsFound) console.warn("⚠️ hips 본을 찾을 수 없습니다!");
        if (!spineFound) console.warn("⚠️ spine 본을 찾을 수 없습니다!");
      }
    }

    // 3. 표정(BlendShape) 및 립싱크 로직
    // 오디오 볼륨 계산
    if (
      analyserRef.current &&
      dataArrayRef.current &&
      audioRef.current &&
      !audioRef.current.paused
    ) {
      // @ts-expect-error - getByteFrequencyData accepts Uint8Array
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++)
        sum += dataArrayRef.current[i];
      volumeRef.current = Math.min(
        sum / dataArrayRef.current.length / 255,
        1.0
      );
    } else {
      volumeRef.current = 0;
    }

    const allExpressions = vrm.expressionManager.expressions;
    const targetEmotion = targetEmotionRef.current;

    // Emotion 매핑 및 가중치 계산
    const emotionMap: Record<string, string> = {
      happy: "happy",
      sad: "sad",
      angry: "angry",
      surprised: "Surprised",
      neutral: "neutral",
    };
    const targetPresetName = emotionMap[targetEmotion] || "neutral";

    allExpressions.forEach((expression) => {
      const name = expression.expressionName;
      let targetWeight = name === targetPresetName ? 1.0 : 0.0;

      // 립싱크 (aa)
      if (name.toLowerCase() === "aa") targetWeight = volumeRef.current * 1.5; // 입을 좀 더 크게 벌리게 1.5배

      // 눈 깜빡임
      if (["blink", "blinkleft", "blinkright"].includes(name.toLowerCase())) {
        const currentTime = state.clock.elapsedTime;
        if (!isBlinkingRef.current && currentTime >= nextBlinkTimeRef.current) {
          isBlinkingRef.current = true;
          blinkStartTimeRef.current = currentTime;
        }
        if (isBlinkingRef.current) {
          const elapsed = currentTime - blinkStartTimeRef.current;
          const duration = 0.15;
          if (elapsed < duration) {
            blinkWeightRef.current =
              elapsed < duration / 2
                ? THREE.MathUtils.lerp(0, 1, elapsed / (duration / 2))
                : THREE.MathUtils.lerp(
                    1,
                    0,
                    (elapsed - duration / 2) / (duration / 2)
                  );
          } else {
            isBlinkingRef.current = false;
            blinkWeightRef.current = 0;
            nextBlinkTimeRef.current = currentTime + 3 + Math.random() * 2;
          }
          targetWeight = blinkWeightRef.current;
        }
      }

      const currentWeight = blendShapeWeightsRef.current[name] || 0;
      const newWeight = THREE.MathUtils.lerp(
        currentWeight,
        targetWeight,
        lerpSpeed * delta
      );
      blendShapeWeightsRef.current[name] = newWeight;
      vrm.expressionManager?.setValue(name, newWeight);
    });

    // LookAt
    if (vrm.lookAt) {
      targetLookAtRef.current.lerp(mousePositionRef.current, 0.1);
      (vrm.lookAt as any).lookAtTarget = targetLookAtRef.current;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* VRM 모델이 여기에 추가됩니다 */}
    </group>
  );
}
