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
  const [isGLBModel, setIsGLBModel] = useState<boolean>(false); // GLB 모델 여부
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null); // AnimationMixer for GLB
  const glbActionsRef = useRef<Record<string, THREE.AnimationAction>>({}); // GLB 애니메이션 액션들
  const currentGLBActionRef = useRef<THREE.AnimationAction | null>(null); // 현재 재생 중인 GLB 애니메이션
  const currentEmotion = useChatStore((state) => state.currentEmotion);
  const currentAudio = useChatStore((state) => state.currentAudio);
  const setAudioPlaying = useChatStore((state) => state.setAudioPlaying);
  const selectedCharacter = useChatStore((state) => state.selectedCharacter);
  const messages = useChatStore((state) => state.messages);
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

  // 모델 로드 (캐릭터 선택에 따라 VRM 또는 GLB 로드)
  useEffect(() => {
    console.log("=== 모델 로드 시작 ===");

    // 기존 모델 정리
    if (gltf && groupRef.current) {
      groupRef.current.remove(gltf.scene);
      setGltf(null);
      setVrm(null);
      setIsGLBModel(false);
    }

    // 초기화 플래그 리셋
    vrmInitializedRef.current = false;

    // 캐릭터별 파일 경로 및 타입 결정
    const isGLB = selectedCharacter === "jinyoung";
    const modelPath = isGLB ? "/loopy2.glb" : "/avatar.vrm";
    
    console.log("모델 타입:", isGLB ? "GLB" : "VRM");
    console.log("모델 경로:", modelPath);

    // 로더 생성 (GLB는 VRM 플러그인 없이)
    const loader = new GLTFLoader();
    if (!isGLB) {
      loader.register((parser) => new VRMLoaderPlugin(parser));
    }

    // 모델 파일 로드
    loader.load(
      modelPath,
      (loadedGltf) => {
        console.log("모델 로드 성공!", isGLB ? "GLB" : "VRM");
        setGltf(loadedGltf);
        setIsGLBModel(isGLB);
        
        if (isGLB) {
          // GLB 모델인 경우
          console.log("GLB 모델 로드 완료");
          console.log("GLB Scene:", loadedGltf.scene);
          
          // === 애니메이션 확인 및 재생 ===
          console.log("🎬 GLB 애니메이션 확인:");
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          if (loadedGltf.animations && loadedGltf.animations.length > 0) {
            console.log(`✅ 총 ${loadedGltf.animations.length}개의 애니메이션이 GLB에 포함되어 있습니다!`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            loadedGltf.animations.forEach((clip, index) => {
              console.log(`📹 애니메이션 ${index + 1}/${loadedGltf.animations.length}:`);
              console.log(`   이름: ${clip.name}`);
              console.log(`   길이: ${clip.duration.toFixed(2)}초`);
              console.log(`   트랙 수: ${clip.tracks.length}개`);
              console.log(`   ────────────────────────`);
            });
            
            // AnimationMixer 생성 및 애니메이션 설정
            const mixer = new THREE.AnimationMixer(loadedGltf.scene);
            mixerRef.current = mixer;
            
            // 감정별 애니메이션 매핑
            const emotionAnimationMap: Record<string, string> = {
              neutral: "Idle_01.001",
              happy: "smile.001", // smile.001 복원
              sad: "Idle_01.001", // concern.001 일시 중지
              angry: "Idle_01.001", // concern.001 일시 중지
              surprised: "smile.001",
            };
            
            // 모든 애니메이션 액션 생성 및 저장
            const actions: Record<string, THREE.AnimationAction> = {};
            loadedGltf.animations.forEach((clip) => {
              const action = mixer.clipAction(clip);
              action.setLoop(THREE.LoopPingPong, Infinity); // 핑퐁 루핑: 앞으로 → 뒤로 자연스러운 왕복
              action.clampWhenFinished = false;
              action.timeScale = 0.8; // 루피 애니메이션 속도
              actions[clip.name] = action;
              console.log(`📦 애니메이션 준비: ${clip.name} (핑퐁 루핑)`);
            });
            glbActionsRef.current = actions;
            
            // 기본 Idle 애니메이션 재생
            const defaultAnimation = "Idle_01.001";
            if (actions[defaultAnimation]) {
              actions[defaultAnimation].play();
              currentGLBActionRef.current = actions[defaultAnimation];
              console.log(`▶️ 기본 애니메이션 재생: ${defaultAnimation}`);
            }
            
            console.log(`\n💡 감정별 애니메이션 매핑:`);
            Object.entries(emotionAnimationMap).forEach(([emotion, animName]) => {
              console.log(`   ${emotion} → ${animName}`);
            });
          } else {
            console.log("⚠️ 애니메이션이 없습니다");
          }
          
          // GLB의 본 구조 출력
          console.log("🦴 GLB 본(Bone) 구조:");
          loadedGltf.scene.traverse((object) => {
            if (object.type === "Bone" || object.name.includes("Bone") || object.name.includes("bone")) {
              console.log(`  - ${object.name} (type: ${object.type})`);
            }
          });
          
          // GLB의 Mesh와 MorphTargets 출력
          console.log("🎭 GLB Mesh 및 BlendShape:");
          loadedGltf.scene.traverse((object) => {
            if ((object as THREE.Mesh).isMesh) {
              const mesh = object as THREE.Mesh;
              if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
                console.log(`Mesh: ${mesh.name}`);
                console.log("  MorphTargets:", Object.keys(mesh.morphTargetDictionary));
              }
            }
          });

          // GLB 모델 (루피)의 초기 포즈 설정
          console.log("🔧 루피 GLB 모델 초기 포즈 설정 중...");
          
          // === 1단계: 모든 오브젝트 출력 (Bone이 아닌 것도 포함) ===
          console.log("🔍 === GLB 전체 계층 구조 분석 ===");
          
          const armRelatedObjects: any[] = [];
          
          loadedGltf.scene.traverse((object: any) => {
            if (!object.name) return;
            const name = object.name.toLowerCase();
            
            // 팔/어깨 관련된 모든 오브젝트 수집
            if (name.includes("arm") || name.includes("shoulder") || 
                name.includes("hand") || name.includes("wrist") ||
                name.includes("forearm") || name.includes("elbow")) {
              armRelatedObjects.push({
                name: object.name,
                type: object.type,
                parent: object.parent?.name || "root",
                children: object.children.length,
                rotation: {
                  x: object.rotation.x.toFixed(3),
                  y: object.rotation.y.toFixed(3),
                  z: object.rotation.z.toFixed(3)
                }
              });
            }
          });
          
          console.log("\n📋 팔/어깨 관련 오브젝트 전체 목록 (Type 포함):");
          armRelatedObjects.forEach(obj => {
            console.log(`\n이름: ${obj.name}`);
            console.log(`  타입: ${obj.type} ⭐`);
            console.log(`  부모: ${obj.parent}`);
            console.log(`  자식 수: ${obj.children}`);
            console.log(`  회전: x=${obj.rotation.x}, y=${obj.rotation.y}, z=${obj.rotation.z}`);
          });
          
          console.log("\n\n💡 === 중요 정보 ===");
          console.log("위에서 'type: Bone'인 것들이 실제 변형을 담당합니다!");
          console.log("팔을 제어하는 본은 보통 다음 중 하나입니다:");
          console.log("1. shoulderl/shoulderr (어깨)");
          console.log("2. arml/armr 또는 upper_arml/upper_armr (상완)");
          console.log("3. 부모 본의 이름을 확인하여 계층 구조 파악 필요");
          
          // === 2단계: GLB 애니메이션이 있으면 본 조작 안 함 ===
          console.log("\n\n💡 === GLB 모델은 애니메이션을 재생합니다 ===");
          console.log("⚠️ 본을 직접 조작하지 않고 내장 애니메이션을 사용합니다");
          console.log("⚠️ 팔 포즈를 조정하려면 Blender 등에서 애니메이션을 수정해야 합니다");
          
          console.log("\n✅ 루피 GLB 초기 포즈 설정 완료");
          console.log("👆 위 로그를 확인하여 어떤 본이 실제로 팔을 제어하는지 파악해주세요!");
        } else {
          // VRM 모델인 경우
          const vrmData = loadedGltf.userData.vrm as VRM;
          if (vrmData) {
            setVrm(vrmData);

          // ===== 1단계: 디버깅 로그 추가 (필수) =====
          console.log("=== VRM 뼈대 구조 점검 ===");
          if (vrmData.humanoid) {
            // 🔍 모든 humanoid 본 이름 출력
            console.log("🦴 사용 가능한 모든 본(Bone) 목록:");
            const humanoidBones = vrmData.humanoid.humanBones;
            (Object.keys(humanoidBones) as Array<keyof typeof humanoidBones>).forEach((boneName) => {
              const bone = humanoidBones[boneName];
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
        }
        
        vrmInitializedRef.current = true;
      },
      undefined,
      (error) => {
        console.error("❌ 모델 파일 로드 중 오류 발생:", error);
      }
    );

    // Cleanup
    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
    };
  }, [selectedCharacter]);

  // 이전 애니메이션 추적 (중복 방지)
  const lastAnimationRef = useRef<string>("");
  
  // 텍스트 기반 애니메이션 선택 함수 (향상된 버전)
  const selectAnimationFromText = (text: string, emotion: Emotion): string => {
    // 랜덤 선택 헬퍼 함수
    const randomSelect = (animations: string[]): string => {
      return animations[Math.floor(Math.random() * animations.length)];
    };
    
    // 중복 방지 랜덤 선택
    const randomSelectNonRepeat = (animations: string[]): string => {
      // 선택지가 1개뿐이면 그냥 반환
      if (animations.length === 1) return animations[0];
      
      // 이전과 다른 애니메이션 선택
      const filtered = animations.filter(anim => anim !== lastAnimationRef.current);
      if (filtered.length === 0) return randomSelect(animations);
      
      return randomSelect(filtered);
    };
    
    // 텍스트 분석을 위한 키워드 매핑 (여러 애니메이션 후보)
    const textPatterns = [
      // 미소/행복 관련 - 다양한 애니메이션 선택
      { 
        keywords: ['ㅎㅎ', 'ㅋㅋ', '완전', '좋아', '기쁘', '행복', '최고', '굿', '좋네', '멋지', '훌륭'],
        animations: ['smile.001', 'blush.001'], // 웃음 + 수줍음 섞기
        weight: 3
      },
      
      // 강한 긍정 - 놀람과 미소 섞기
      { 
        keywords: ['대박', '신나', '즐거', '완벽', '끝내주', '짱', '와우'],
        animations: ['blush.001', 'smile.001'],
        weight: 3
      },
      
      // 걱정/슬픔 관련
      { 
        keywords: ['걱정', '슬프', '안타까', '힘들', '어려', '불안', '우울', '속상'],
        animations: ['concern.001'],
        weight: 2
      },
      
      // 사과/미안 - 걱정과 기본 섞기
      { 
        keywords: ['미안', '죄송', '아쉽', '양해'],
        animations: ['concern.001', 'Idle_01.001'],
        weight: 2
      },
      
      // 당황/놀람 관련
      { 
        keywords: ['헐', '어머', '와', '우와', '헉', '어', '오', '세상'],
        animations: ['blush.001'],
        weight: 3
      },
      
      // 진지/확신 - 다양한 표현
      { 
        keywords: ['진짜', '정말', '확실', '분명', '당연'],
        animations: ['smile.001', 'Idle_01.001', 'blush.001'],
        weight: 2
      },
      
      // 질문/고민 - 기본 동작들
      { 
        keywords: ['음', '글쎄', '아마', '어쩌면', '혹시'],
        animations: ['Idle_01.001', 'concern.001'],
        weight: 1
      },
      
      // 긍정/동의 응답
      { 
        keywords: ['그러', '그치', '응', '맞아', '네', '알겠'],
        animations: ['Idle_01.001', 'smile.001'],
        weight: 1
      },
    ];
    
    // 매칭된 패턴들과 가중치 수집
    const matchedPatterns: { pattern: typeof textPatterns[0], keyword: string }[] = [];
    
    for (const pattern of textPatterns) {
      const matchedKeyword = pattern.keywords.find(keyword => text.includes(keyword));
      if (matchedKeyword) {
        matchedPatterns.push({ pattern, keyword: matchedKeyword });
      }
    }
    
    // 텍스트 길이에 따른 추가 가중치
    const textLength = text.length;
    let selectedAnimation: string;
    
    if (matchedPatterns.length > 0) {
      // 여러 패턴이 매칭되면 가장 가중치가 높은 것 선택
      const bestPattern = matchedPatterns.reduce((best, current) => 
        current.pattern.weight > best.pattern.weight ? current : best
      );
      
      // 짧은 텍스트면 가벼운 애니메이션 우선
      if (textLength < 10 && bestPattern.pattern.animations.includes('Idle_01.001')) {
        selectedAnimation = Math.random() < 0.7 ? 'Idle_01.001' : randomSelectNonRepeat(bestPattern.pattern.animations);
      } else {
        selectedAnimation = randomSelectNonRepeat(bestPattern.pattern.animations);
      }
      
      console.log(`📝 텍스트 분석: "${bestPattern.keyword}" 감지 (가중치: ${bestPattern.pattern.weight}) → ${selectedAnimation}`);
    } else {
      // 키워드가 없으면 감정 + 랜덤 요소
      const emotionAnimationMap: Record<Emotion, string[]> = {
        neutral: ['Idle_01.001'],
        happy: ['smile.001'], // smile.001 복원
        sad: ['Idle_01.001'], // concern.001 일시 중지
        angry: ['Idle_01.001'], // concern.001 일시 중지
        surprised: ['smile.001'],
      };
      
      const candidates = emotionAnimationMap[emotion];
      selectedAnimation = randomSelectNonRepeat(candidates);
      
      console.log(`🎭 감정 기반: ${emotion} → ${selectedAnimation} (랜덤 선택)`);
    }
    
    // 이전 애니메이션 저장
    lastAnimationRef.current = selectedAnimation;
    
    return selectedAnimation;
  };

  // GLB 애니메이션 전환 (감정 + 텍스트 기반)
  useEffect(() => {
    if (!isGLBModel || !glbActionsRef.current) return;
    
    // 최신 assistant 메시지 가져오기
    const lastAssistantMessage = messages.length > 0 
      ? [...messages].reverse().find(msg => msg.role === "assistant")
      : null;
    
    // 텍스트 기반 애니메이션 선택
    const targetAnimationName = lastAssistantMessage
      ? selectAnimationFromText(lastAssistantMessage.content, currentEmotion)
      : selectAnimationFromText("", currentEmotion);
    
    const targetAction = glbActionsRef.current[targetAnimationName];
    
    if (!targetAction) {
      console.warn(`⚠️ 애니메이션을 찾을 수 없음: ${targetAnimationName}`);
      return;
    }
    
    // 현재 재생 중인 애니메이션과 같으면 전환하지 않음
    if (currentGLBActionRef.current === targetAction) {
      return;
    }
    
    console.log(`🎬 애니메이션 전환: ${targetAnimationName}`);
    
    // 이전 애니메이션에서 새 애니메이션으로 부드럽게 전환
    if (currentGLBActionRef.current) {
      currentGLBActionRef.current.fadeOut(0.5); // 0.5초 페이드아웃
    }
    
    targetAction.reset();
    targetAction.fadeIn(0.5); // 0.5초 페이드인
    targetAction.play();
    
    currentGLBActionRef.current = targetAction;
  }, [currentEmotion, isGLBModel, messages]);

  // GLTF 씬을 그룹에 추가 + Skeleton 시각화
  useEffect(() => {
    if (gltf && gltf.scene && groupRef.current) {
      // 기존 씬 제거
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }

      // VRM 모델의 위치 및 회전 조정 (캐릭터별로 다른 위치 설정)
      let yPosition = -1.2; // 기본값
      let yRotation = 0; // 기본 회전값
      
      if (selectedCharacter === "jinyoung") {
        yPosition = -0.5;
        yRotation = 0; // 정면
      } else if (selectedCharacter === "test") {
        yPosition = -1.2; // 다리만 보여서 아래로 내림
        yRotation = Math.PI; // 180도 회전 (나를 바라보도록)
      }
      
      gltf.scene.position.set(0, yPosition, 0);
      gltf.scene.rotation.y = yRotation;
      gltf.scene.scale.set(1, 1, 1);
      groupRef.current.add(gltf.scene);

      console.log("✅ 모델 씬이 그룹에 추가됨");

      // 🔍 1단계: Skeleton 시각화 및 본 이름 전체 출력
      // SkeletonHelper 제거됨 (이상한 선 제거)
    }
  }, [gltf, selectedCharacter, isGLBModel]);

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
    console.log("=== Avatar: 오디오 재생 시도 ===", {
      hasAudio: !!currentAudio,
      audioLength: currentAudio?.length,
      hasVrm: !!vrm,
      isGLBModel: isGLBModel,
      hasGltf: !!gltf,
      selectedCharacter: selectedCharacter,
    });

    // 오디오가 없으면 재생 불가
    if (!currentAudio) {
      console.log("❌ Avatar: 오디오 데이터가 없어서 재생하지 않음");
      return;
    }

    // VRM 모델도 없고 GLB 모델도 아니면 재생 불가
    if (!vrm && !isGLBModel) {
      console.log("❌ Avatar: 모델이 로드되지 않아서 재생하지 않음 (vrm:", !!vrm, "isGLBModel:", isGLBModel, ")");
      return;
    }

    console.log("✅ Avatar: 오디오 재생 조건 충족! 재생 시작...")

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
    const audio = new Audio();
    audio.preload = "auto"; // 오디오 미리 로드
    audio.crossOrigin = "anonymous"; // CORS 문제 방지
    audio.src = `data:audio/mp3;base64,${currentAudio}`;
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
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    // GainNode 추가 (볼륨 안정화)
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0; // 기본 볼륨

    // 오디오가 충분히 로드될 때까지 대기
    audio.addEventListener("canplaythrough", () => {
      console.log("Avatar: 오디오 버퍼링 완료");
    });

    const source = audioContext.createMediaElementSource(audio);
    sourceRef.current = source;

    // 오디오 라우팅: source -> gainNode -> [analyser 분기] -> destination
    // 메인 오디오는 gainNode를 통해 직접 출력
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // 립싱크용 분석은 별도로 연결 (재생에 영향 없음)
    gainNode.connect(analyser);

    console.log("Avatar: 오디오 재생 시작");
    const playAudio = async () => {
      try {
        // AudioContext 활성화
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume();
        }
        
        // 오디오가 충분히 로드될 때까지 대기
        if (audio.readyState < 3) { // HAVE_FUTURE_DATA
          await new Promise((resolve) => {
            audio.addEventListener("canplay", resolve, { once: true });
          });
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

      // 모든 표정 및 립싱크 BlendShape 즉시 리셋
      if (vrm?.expressionManager) {
        const expressionManager = vrm.expressionManager;
        expressionManager.expressions.forEach((expression) => {
          const nameLower = expression.expressionName.toLowerCase();
          
          // 립싱크 관련 BlendShape 0으로
          if (
            ["aa", "a", "ih", "i", "e", "ou", "u", "o", "ee"].includes(nameLower) ||
            ["vrc.v_aa", "vrc.v_ih", "vrc.v_ou", "vrc.v_ee", "vrc.v_oh"].includes(nameLower) ||
            nameLower.includes("mouth") || 
            nameLower.includes("lip")
          ) {
            expressionManager.setValue(expression.expressionName, 0);
            blendShapeWeightsRef.current[expression.expressionName] = 0;
          }
          
          // 눈 깜빡임 BlendShape 0으로 (눈 뜨기)
          if (
            ["blink", "blinkleft", "blinkright"].includes(nameLower) ||
            nameLower.includes("blink")
          ) {
            expressionManager.setValue(expression.expressionName, 0);
            blendShapeWeightsRef.current[expression.expressionName] = 0;
          }
        });
        
        // 표정을 neutral로 리셋
        expressionManager.setValue("neutral", 1.0);
        blendShapeWeightsRef.current["neutral"] = 1.0;
      }
      
      // 눈 깜빡임 상태 리셋
      isBlinkingRef.current = false;
      blinkWeightRef.current = 0;
      nextBlinkTimeRef.current = Date.now() / 1000 + 3 + Math.random() * 2;

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
      
      // cleanup 시에도 모든 BlendShape 리셋
      if (vrm?.expressionManager) {
        const expressionManager = vrm.expressionManager;
        expressionManager.expressions.forEach((expression) => {
          const nameLower = expression.expressionName.toLowerCase();
          
          // 립싱크 및 눈 깜빡임 리셋
          if (
            ["aa", "a", "ih", "i", "e", "ou", "u", "o", "ee"].includes(nameLower) ||
            ["vrc.v_aa", "vrc.v_ih", "vrc.v_ou", "vrc.v_ee", "vrc.v_oh"].includes(nameLower) ||
            nameLower.includes("mouth") || 
            nameLower.includes("lip") ||
            ["blink", "blinkleft", "blinkright"].includes(nameLower) ||
            nameLower.includes("blink")
          ) {
            expressionManager.setValue(expression.expressionName, 0);
            if (blendShapeWeightsRef.current) {
              blendShapeWeightsRef.current[expression.expressionName] = 0;
            }
          }
        });
        
        // neutral 표정으로
        expressionManager.setValue("neutral", 1.0);
        if (blendShapeWeightsRef.current) {
          blendShapeWeightsRef.current["neutral"] = 1.0;
        }
      }
      
      // 눈 깜빡임 상태 리셋
      isBlinkingRef.current = false;
      blinkWeightRef.current = 0;
    };
  }, [currentAudio, vrm, isGLBModel, gltf, setAudioPlaying]);

  // ===== useFrame: 애니메이션 루프 =====
  useFrame((state, delta) => {
    if (!vrmInitializedRef.current) {
      return;
    }

    const time = state.clock.elapsedTime;
    const lerpSpeed = 3.0;

    // ===== GLB 모델 처리 =====
    if (isGLBModel && gltf) {
      // AnimationMixer 업데이트 (GLB 애니메이션 재생)
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
      
      // GLB 모델의 립싱크 및 추가 애니메이션
      // GLB 모델의 MorphTargets를 사용한 립싱크 구현
      // 루피 GLB 모델에 MorphTargets가 있으면 활용, 없으면 턱 본 사용
      if (gltf) {
        gltf.scene.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
              const volume = volumeRef.current;
              const isAudioActive = audioRef.current && !audioRef.current.paused;
              
              Object.keys(mesh.morphTargetDictionary).forEach((morphName) => {
                const index = mesh.morphTargetDictionary[morphName];
                const nameLower = morphName.toLowerCase();
                
                let targetWeight = 0;
                
                // 오디오 재생 중일 때만 립싱크
                if (isAudioActive && volume > 0.05) {
                  // 입 관련 MorphTargets
                  if (nameLower.includes("mouth") || 
                      nameLower.includes("lip") ||
                      nameLower.includes("aa") ||
                      nameLower.includes("a") ||
                      nameLower.includes("o") ||
                      nameLower.includes("open")) {
                    targetWeight = Math.min(volume * 1.5, 1.0);
                  }
                }
                
                // 부드럽게 전환
                const currentWeight = mesh.morphTargetInfluences[index];
                mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(
                  currentWeight,
                  targetWeight,
                  0.3
                );
              });
            }
          }
        });
      }
      
      // 턱 본을 이용한 립싱크 (MorphTargets가 없는 경우 대체)
      if (gltf && selectedCharacter === "jinyoung") {
        const volume = volumeRef.current;
        const isAudioActive = audioRef.current && !audioRef.current.paused;
        
        gltf.scene.traverse((object: any) => {
          if (!object.name) return;
          const name = object.name.toLowerCase();
          
          // 턱 본 찾기
          if (name.includes("jaw") || 
              name.includes("chin") || 
              name.includes("j_bip_c_jaw") ||
              name === "j_bip_c_head") { // 머리 본도 확인
            
            if (isAudioActive && volume > 0.05) {
              // 오디오 볼륨에 따라 턱을 벌림
              const targetRotation = volume * 0.3; // 최대 0.3 라디안 (약 17도)
              
              if (object.rotation) {
                // 현재 회전값을 부드럽게 타겟으로 이동
                object.rotation.x = THREE.MathUtils.lerp(
                  object.rotation.x,
                  targetRotation,
                  0.3
                );
              }
            } else {
              // 오디오가 없으면 입 다물기
              if (object.rotation) {
                object.rotation.x = THREE.MathUtils.lerp(
                  object.rotation.x,
                  0,
                  0.2
                );
              }
            }
          }
        });
      }
      
      return; // GLB 모델은 여기서 종료 (본 직접 조작 안 함)
    }

    // ===== VRM 모델 처리 =====
    if (!vrm || !vrm.expressionManager) {
      return;
    }

    // 표정(BlendShape) 및 립싱크 로직
    // ===== 오디오 볼륨 계산 및 립싱크 준비 =====
    if (
      analyserRef.current &&
      dataArrayRef.current &&
      audioRef.current &&
      !audioRef.current.paused
    ) {
      // @ts-expect-error - getByteFrequencyData accepts Uint8Array
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      
      // 주파수 대역별로 분석하여 더 정확한 립싱크
      let lowFreqSum = 0;  // 저음역 (0-85Hz) - 모음
      let midFreqSum = 0;  // 중음역 (85-255Hz) - 자음
      let highFreqSum = 0; // 고음역 (255-512Hz) - 치찰음
      
      const lowBound = Math.floor(dataArrayRef.current.length * 0.1);
      const midBound = Math.floor(dataArrayRef.current.length * 0.3);
      
      // 저음역 (모음 소리)
      for (let i = 0; i < lowBound; i++) {
        lowFreqSum += dataArrayRef.current[i];
      }
      
      // 중음역 (일반 발음)
      for (let i = lowBound; i < midBound; i++) {
        midFreqSum += dataArrayRef.current[i];
      }
      
      // 고음역 (치찰음)
      for (let i = midBound; i < dataArrayRef.current.length; i++) {
        highFreqSum += dataArrayRef.current[i];
      }
      
      // 전체 평균 볼륨 (립싱크 강도)
      let totalSum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        totalSum += dataArrayRef.current[i];
      }
      
      // 볼륨을 좀 더 민감하게 반응하도록 조정
      volumeRef.current = Math.min(
        Math.pow(totalSum / dataArrayRef.current.length / 255, 0.7), // 제곱근으로 더 민감하게
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
      const nameLower = name.toLowerCase();
      let targetWeight = name === targetPresetName ? 1.0 : 0.0;

      // ===== 립싱크 (Lip-Sync) - 오디오 재생 중일 때만 작동 =====
      const volume = volumeRef.current;
      const isAudioActive = audioRef.current && !audioRef.current.paused;
      
      // 오디오가 재생 중이고 실제 소리가 있을 때만 립싱크 적용
      if (isAudioActive && volume > 0.05) { // 최소 임계값 0.05
        // 'aa' - 입을 크게 벌림 (모음 a, o)
        if (nameLower === "aa" || nameLower === "a") {
          targetWeight = Math.min(volume * 1.8, 1.0); // 강한 립싱크
        }
        
        // 'ih' - 입을 옆으로 벌림 (모음 i, e)
        else if (nameLower === "ih" || nameLower === "i" || nameLower === "e") {
          targetWeight = Math.min(volume * 1.5, 1.0);
        }
        
        // 'ou' - 입을 둥글게 (모음 u, o)
        else if (nameLower === "ou" || nameLower === "u" || nameLower === "o") {
          targetWeight = Math.min(volume * 1.3, 1.0);
        }
        
        // 'ee' - 이 발음
        else if (nameLower === "ee") {
          targetWeight = Math.min(volume * 1.2, 1.0);
        }
        
        // 일반 입 모양 (기본 립싱크)
        else if (
          nameLower.includes("mouth") || 
          nameLower.includes("lip") ||
          nameLower === "vrc.v_aa" ||
          nameLower === "vrc.v_ih" ||
          nameLower === "vrc.v_ou" ||
          nameLower === "vrc.v_ee" ||
          nameLower === "vrc.v_oh"
        ) {
          targetWeight = Math.min(volume * 1.5, 1.0);
        }
      } else {
        // 오디오가 없거나 재생 중이 아닐 때는 입 관련 BlendShape를 0으로
        if (
          nameLower === "aa" || nameLower === "a" ||
          nameLower === "ih" || nameLower === "i" || nameLower === "e" ||
          nameLower === "ou" || nameLower === "u" || nameLower === "o" ||
          nameLower === "ee" ||
          nameLower.includes("mouth") || 
          nameLower.includes("lip") ||
          nameLower === "vrc.v_aa" ||
          nameLower === "vrc.v_ih" ||
          nameLower === "vrc.v_ou" ||
          nameLower === "vrc.v_ee" ||
          nameLower === "vrc.v_oh"
        ) {
          targetWeight = 0; // 입을 다물음
        }
      }

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
      // 립싱크는 빠르게 반응, 다른 표정은 부드럽게
      const isLipSync = 
        nameLower === "aa" || nameLower === "a" ||
        nameLower === "ih" || nameLower === "i" || nameLower === "e" ||
        nameLower === "ou" || nameLower === "u" || nameLower === "o" ||
        nameLower === "ee" ||
        nameLower.includes("mouth") || 
        nameLower.includes("lip") ||
        nameLower === "vrc.v_aa" ||
        nameLower === "vrc.v_ih" ||
        nameLower === "vrc.v_ou" ||
        nameLower === "vrc.v_ee" ||
        nameLower === "vrc.v_oh";
      
      const blendSpeed = isLipSync ? 15.0 : lerpSpeed; // 립싱크는 5배 빠르게
      
      const newWeight = THREE.MathUtils.lerp(
        currentWeight,
        targetWeight,
        blendSpeed * delta
      );
      blendShapeWeightsRef.current[name] = newWeight;
      vrm.expressionManager?.setValue(name, newWeight);
    });

    // LookAt
    if (vrm.lookAt) {
      targetLookAtRef.current.lerp(mousePositionRef.current, 0.1);
      (vrm.lookAt as any).lookAtTarget = targetLookAtRef.current;
    }

    // VRM 업데이트 (표정, lookAt 등) - 본 조작 전에 실행
    vrm.update(delta);

    // ===== 캐릭터별 본 애니메이션 (VRM update 후에 실행) =====
    if (vrm.scene) {
      if (selectedCharacter === "test") {
        // ===== 테스트 캐릭터 A자 포즈 + 애니메이션 =====
        vrm.scene.traverse((object: any) => {
          if (!object.name) return;

          // === 포즈 설정 ===
          
          // 왼쪽 어깨 - 자연스럽게
          if (object.name === "J_Bip_L_Shoulder") {
            object.rotation.z = 0; // 자연스럽게 (올라가지 않도록)
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 왼팔 A자 포즈 (약 70도 아래로)
          if (object.name === "J_Bip_L_UpperArm") {
            const euler = new THREE.Euler(0, 0, Math.PI * 0.4, "XYZ"); // +72도 (확 내림)
            object.quaternion.setFromEuler(euler);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 왼팔꿈치 펼침
          if (object.name === "J_Bip_L_LowerArm") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 왼손 자연스럽게
          if (object.name === "J_Bip_L_Hand") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른쪽 어깨 - 자연스럽게
          if (object.name === "J_Bip_R_Shoulder") {
            object.rotation.z = 0; // 자연스럽게 (올라가지 않도록)
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른팔 A자 포즈 (약 70도 아래로)
          if (object.name === "J_Bip_R_UpperArm") {
            const euler = new THREE.Euler(0, 0, -Math.PI * 0.4, "XYZ"); // -72도 (확 내림)
            object.quaternion.setFromEuler(euler);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른팔꿈치 펼침
          if (object.name === "J_Bip_R_LowerArm") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른손 자연스럽게
          if (object.name === "J_Bip_R_Hand") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // === 루프 애니메이션 ===
          
          // 1. 둥실거림 제거 (캐릭터 위치 문제 발생)
          // Hips는 캐릭터 전체 위치를 제어하므로 건드리지 않음

          // 2. 호흡 애니메이션 (Spine 스케일)
          if (object.name === "J_Bip_C_Spine") {
            const breathScale = 1.0 + Math.sin(time * 0.8) * 0.008; // 매우 미세한 호흡
            object.scale.set(breathScale, breathScale, breathScale);
          }

          // 3. 가슴 호흡 (Chest)
          if (object.name === "J_Bip_C_Chest") {
            const chestScale = 1.0 + Math.sin(time * 0.8 + 0.3) * 0.01; // 약간 더 큰 호흡
            object.scale.set(chestScale, chestScale, chestScale);
          }

          // 4. 미세한 좌우 흔들림 (UpperChest)
          if (object.name === "J_Bip_C_UpperChest") {
            const swayAngle = Math.sin(time * 0.6) * 0.015; // 매우 미세한 좌우 흔들림
            object.rotation.z = swayAngle;
          }

          // 5. 머리 미세 움직임
          if (object.name === "J_Bip_C_Head") {
            const headSway = Math.sin(time * 0.7 + 0.5) * 0.02; // 미세한 고개 움직임
            object.rotation.x = headSway;
          }
        });
      } else if (selectedCharacter === "jinyoung") {
        // ===== 루피 캐릭터 A자 포즈 + 애니메이션 =====
        vrm.scene.traverse((object: any) => {
          if (!object.name) return;

          // === 포즈 설정 ===
          
          // 왼쪽 어깨 - 자연스럽게
          if (object.name === "J_Bip_L_Shoulder") {
            object.rotation.z = 0;
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 왼팔 A자 포즈 (약 70도 아래로)
          if (object.name === "J_Bip_L_UpperArm") {
            const euler = new THREE.Euler(0, 0, Math.PI * 0.4, "XYZ");
            object.quaternion.setFromEuler(euler);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 왼팔꿈치 펼침
          if (object.name === "J_Bip_L_LowerArm") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 왼손 자연스럽게
          if (object.name === "J_Bip_L_Hand") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른쪽 어깨 - 자연스럽게
          if (object.name === "J_Bip_R_Shoulder") {
            object.rotation.z = 0;
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른팔 A자 포즈 (약 70도 아래로)
          if (object.name === "J_Bip_R_UpperArm") {
            const euler = new THREE.Euler(0, 0, -Math.PI * 0.4, "XYZ");
            object.quaternion.setFromEuler(euler);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른팔꿈치 펼침
          if (object.name === "J_Bip_R_LowerArm") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // 오른손 자연스럽게
          if (object.name === "J_Bip_R_Hand") {
            object.rotation.set(0, 0, 0);
            if (object.parent) object.parent.updateWorldMatrix(true, false);
            object.updateWorldMatrix(true, true);
          }

          // === 루프 애니메이션 ===

          // 호흡 애니메이션 (Spine 스케일)
          if (object.name === "J_Bip_C_Spine") {
            const breathScale = 1.0 + Math.sin(time * 0.8) * 0.008;
            object.scale.set(breathScale, breathScale, breathScale);
          }

          // 가슴 호흡 (Chest)
          if (object.name === "J_Bip_C_Chest") {
            const chestScale = 1.0 + Math.sin(time * 0.8 + 0.3) * 0.01;
            object.scale.set(chestScale, chestScale, chestScale);
          }

          // 미세한 좌우 흔들림 (UpperChest)
          if (object.name === "J_Bip_C_UpperChest") {
            const swayAngle = Math.sin(time * 0.6) * 0.015;
            object.rotation.z = swayAngle;
          }

          // 머리 미세 움직임
          if (object.name === "J_Bip_C_Head") {
            const headSway = Math.sin(time * 0.7 + 0.5) * 0.02;
            object.rotation.x = headSway;
          }
        });
      }
    }
  });

  // 클릭 시 랜덤 애니메이션 재생
  const handleAvatarClick = () => {
    if (selectedCharacter === 'jinyoung' && glbActionsRef.current) {
      console.log("🖱️ 루피 클릭됨!");
      
      // 사용 가능한 모든 애니메이션 목록
      const availableAnimations = Object.keys(glbActionsRef.current);
      console.log("사용 가능한 애니메이션:", availableAnimations);
      
      if (availableAnimations.length > 0) {
        // 랜덤 애니메이션 선택
        const randomIndex = Math.floor(Math.random() * availableAnimations.length);
        const randomAnimation = availableAnimations[randomIndex];
        
        console.log(`🎲 랜덤 애니메이션 선택: ${randomAnimation}`);
        
        // 모든 애니메이션 중지
        Object.values(glbActionsRef.current).forEach((action) => {
          action.fadeOut(0.3);
        });
        
        // 선택된 애니메이션 재생
        const selectedAction = glbActionsRef.current[randomAnimation];
        if (selectedAction) {
          selectedAction.reset();
          selectedAction.fadeIn(0.3);
          selectedAction.play();
          console.log(`✅ ${randomAnimation} 애니메이션 재생!`);
        }
      }
    }
  };

  return (
    <group 
      ref={groupRef} 
      position={[0, 0, 0]}
      onClick={handleAvatarClick}
      onPointerOver={() => document.body.style.cursor = 'pointer'}
      onPointerOut={() => document.body.style.cursor = 'default'}
    >
      {/* VRM 모델이 여기에 추가됩니다 */}
    </group>
  );
}


