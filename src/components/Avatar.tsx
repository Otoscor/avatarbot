"use client";
// Avatar component with VRM model support

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
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nextBlinkTimeRef = useRef<number>(0);
  const blinkStartTimeRef = useRef<number>(0);
  const isBlinkingRef = useRef<boolean>(false);
  const blinkWeightRef = useRef<number>(0);

  // 포즈 및 애니메이션 관련 refs
  const poseInitializedRef = useRef<boolean>(false);
  const animationTimeRef = useRef<number>(0);

  const { camera, gl } = useThree();

  // A-pose 설정 함수 (T-pose에서 A-pose로 변경)
  const setAPose = (vrm: VRM) => {
    if (!vrm.humanoid) return;

    try {
      // 왼쪽 어깨 - z축 회전으로 팔을 아래로 내림 (부호 반대)
      const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
      if (leftUpperArm) {
        leftUpperArm.rotation.x = 0;
        leftUpperArm.rotation.y = 0;
        leftUpperArm.rotation.z = 1.2; // z축 회전 1.2 (부호 반대)
        leftUpperArm.quaternion.setFromEuler(leftUpperArm.rotation);
        console.log("왼쪽 어깨 A-pose 설정됨", leftUpperArm.rotation);
      }

      // 오른쪽 어깨 - z축 회전으로 팔을 아래로 내림 (부호 반대)
      const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
      if (rightUpperArm) {
        rightUpperArm.rotation.x = 0;
        rightUpperArm.rotation.y = 0;
        rightUpperArm.rotation.z = -1.2; // z축 회전 -1.2 (부호 반대)
        rightUpperArm.quaternion.setFromEuler(rightUpperArm.rotation);
        console.log("오른쪽 어깨 A-pose 설정됨", rightUpperArm.rotation);
      }

      // 왼쪽 팔꿈치 - z축 회전 초기화
      const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
      if (leftLowerArm) {
        leftLowerArm.rotation.x = 0;
        leftLowerArm.rotation.y = 0;
        leftLowerArm.rotation.z = 0.0; // z축 회전 0.0
        leftLowerArm.quaternion.setFromEuler(leftLowerArm.rotation);
        console.log("왼쪽 팔꿈치 초기화됨", leftLowerArm.rotation);
      }

      // 오른쪽 팔꿈치 - z축 회전 초기화
      const rightLowerArm = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
      if (rightLowerArm) {
        rightLowerArm.rotation.x = 0;
        rightLowerArm.rotation.y = 0;
        rightLowerArm.rotation.z = 0.0; // z축 회전 0.0
        rightLowerArm.quaternion.setFromEuler(rightLowerArm.rotation);
        console.log("오른쪽 팔꿈치 초기화됨", rightLowerArm.rotation);
      }

      console.log("A-pose 설정 완료");
    } catch (error) {
      console.warn("A-pose 설정 중 오류:", error);
    }
  };

  useEffect(() => {
    // VRMLoaderPlugin을 등록한 로더 생성
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    // VRM 파일 로드
    loader.load(
      "/avatar.vrm",
      (loadedGltf) => {
        setGltf(loadedGltf);
        const vrmData = loadedGltf.userData.vrm as VRM;
        if (vrmData) {
          setVrm(vrmData);
          // 초기 BlendShape 가중치 설정
          const initialWeights: Record<string, number> = {};
          if (vrmData.expressionManager) {
            vrmData.expressionManager.expressions.forEach((expression) => {
              initialWeights[expression.expressionName] = 0;
            });
            // 사용 가능한 BlendShape 이름 로그 출력 (디버깅용)
            console.log(
              "사용 가능한 BlendShape:",
              vrmData.expressionManager.expressions.map((e) => e.expressionName)
            );
          }
          blendShapeWeightsRef.current = initialWeights;

          // lookAt 기능 확인
          if (vrmData.lookAt) {
            console.log("lookAt 기능 사용 가능");
          } else {
            console.warn("lookAt 기능을 사용할 수 없습니다");
          }
        }
      },
      undefined,
      (error) => {
        console.error("VRM 파일 로드 중 오류 발생:", error);
      }
    );
  }, []);

  useEffect(() => {
    if (gltf && gltf.scene && groupRef.current) {
      // 기존 자식 제거
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }

      // VRM 모델의 위치 및 회전 조정 (이미지 참조 기준)
      gltf.scene.position.set(0, -1.2, 0); // 하단 중앙에 배치
      gltf.scene.rotation.y = Math.PI; // z축 기준 180도 회전 (y축 회전으로 앞면이 보이도록)
      // 캐릭터 크기 조정 (전신이 잘 보이도록)
      gltf.scene.scale.set(1, 1, 1);
      groupRef.current.add(gltf.scene);
    }
  }, [gltf]);

  // VRM 모델이 로드된 직후 A-pose 설정
  useEffect(() => {
    if (vrm && vrm.humanoid) {
      // 모델이 완전히 로드된 후 포즈 설정
      setAPose(vrm);
      poseInitializedRef.current = true;
    }
  }, [vrm]);

  // emotion이 변경될 때 타겟 emotion 업데이트
  useEffect(() => {
    targetEmotionRef.current = currentEmotion;
  }, [currentEmotion]);

  // 마우스/터치 위치 추적
  useEffect(() => {
    const updateLookAtTarget = (clientX: number, clientY: number) => {
      // 마우스/터치 위치를 정규화된 좌표로 변환 (-1 ~ 1)
      const x = (clientX / window.innerWidth) * 2 - 1;
      const y = -(clientY / window.innerHeight) * 2 + 1;

      // 3D 공간의 위치로 변환 (카메라 앞쪽)
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      // 카메라 앞 적절한 거리의 위치 계산
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
        const touch = event.touches[0];
        updateLookAtTarget(touch.clientX, touch.clientY);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [camera]);

  // 자동 눈 깜빡임 초기화 및 BlendShape 확인
  useEffect(() => {
    if (!vrm || !vrm.expressionManager) return;

    // 사용 가능한 모든 BlendShape 이름 확인
    const allExpressionNames = vrm.expressionManager.expressions.map(
      (e) => e.expressionName
    );
    console.log("사용 가능한 모든 BlendShape:", allExpressionNames);

    // blink 관련 BlendShape 찾기
    const blinkExpressions = allExpressionNames.filter((name) =>
      name.toLowerCase().includes("blink")
    );
    console.log("Blink 관련 BlendShape:", blinkExpressions);

    // 첫 깜빡임 시간 설정 (3~5초 후, 초 단위)
    // useFrame의 clock.elapsedTime을 사용하므로 초 단위로 설정
    nextBlinkTimeRef.current = 3 + Math.random() * 2; // 3~5초

    return () => {
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
      }
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

    // AudioContext 생성 (이미 활성화된 컨텍스트가 있으면 재사용)
    let audioContext: AudioContext;
    
    // ChatInterface에서 활성화한 컨텍스트가 있는지 확인
    // 없으면 새로 생성
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // 컨텍스트가 suspended 상태면 활성화 시도
      if (audioContext.state === "suspended") {
        audioContext.resume().catch((error) => {
          console.warn("Avatar: AudioContext 활성화 실패:", error);
        });
      }
    } else {
      audioContext = audioContextRef.current;
    }

    // AnalyserNode 생성
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    // MediaElementSource 생성 및 연결
    const source = audioContext.createMediaElementSource(audio);
    sourceRef.current = source;
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    // 데이터 배열 생성
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;

    // 오디오 재생 (사용자 상호작용 후에만 가능)
    console.log("Avatar: 오디오 재생 시작");

    // 사용자 상호작용 확인을 위한 함수
    const playAudio = async () => {
      try {
        await audio.play();
        console.log("Avatar: 오디오 재생 성공");
        setAudioPlaying(true);
      } catch (error: any) {
        console.error("Avatar: 오디오 재생 오류:", error);

        // NotAllowedError인 경우 사용자 상호작용 대기
        if (
          error.name === "NotAllowedError" ||
          error.name === "NotSupportedError"
        ) {
          console.log("Avatar: 사용자 상호작용 필요, 재시도 대기 중...");

          // 사용자 상호작용 이벤트 리스너 추가
          const handleUserInteraction = async () => {
            try {
              await audio.play();
              console.log("Avatar: 사용자 상호작용 후 오디오 재생 성공");
              setAudioPlaying(true);
            } catch (retryError) {
              console.error("Avatar: 재시도 실패:", retryError);
              setAudioPlaying(false);
            }

            // 이벤트 리스너 제거
            document.removeEventListener("click", handleUserInteraction);
            document.removeEventListener("touchstart", handleUserInteraction);
          };

          // 클릭 또는 터치 이벤트 대기
          document.addEventListener("click", handleUserInteraction, {
            once: true,
          });
          document.addEventListener("touchstart", handleUserInteraction, {
            once: true,
          });

          // 5초 후에도 상호작용이 없으면 포기
          setTimeout(() => {
            document.removeEventListener("click", handleUserInteraction);
            document.removeEventListener("touchstart", handleUserInteraction);
            console.warn("Avatar: 사용자 상호작용 시간 초과, 오디오 재생 포기");
            setAudioPlaying(false);
          }, 5000);
        } else {
          setAudioPlaying(false);
        }
      }
    };

    // 즉시 재생 시도
    playAudio();

    // 오디오 종료 시 정리
    audio.onended = () => {
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
      // 컴포넌트 언마운트 시 정리
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, [currentAudio, vrm]);

  // BlendShape 애니메이션 처리, 립싱크, 시선 추적, 포즈 애니메이션
  useFrame((state, delta) => {
    if (!vrm || !vrm.expressionManager) return;

    const targetEmotion = targetEmotionRef.current;
    const lerpSpeed = 3.0; // 전환 속도 조절
    animationTimeRef.current += delta;

    // VRM 업데이트
    vrm.update(delta);

    // A-pose 강제 적용 (매 프레임마다 실행하여 리셋 방지)
    if (vrm.humanoid) {
      try {
        const time = state.clock.elapsedTime;

        // 숨쉬기 모션 (Idle Breathing)
        const breathingAmount = Math.sin(time * 1.5) * 0.02; // 느린 호흡 (1.5Hz)

        // 상체 미세 회전 (숨쉬기)
        const chest =
          vrm.humanoid.getNormalizedBoneNode("chest") ||
          vrm.humanoid.getNormalizedBoneNode("upperChest");
        if (chest) {
          chest.rotation.x = breathingAmount * 0.5; // 앞뒤로 미세하게 회전
          chest.quaternion.setFromEuler(chest.rotation);
        }

        // 왼쪽 어깨 - z축 회전으로 팔을 아래로 내림 + 숨쉬기 모션
        const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        if (leftArm) {
          const baseRotation = 1.2;
          const breathingSway = Math.sin(time * 1.5) * 0.05; // 숨쉬기로 팔이 살짝 벌어짐
          leftArm.rotation.z = baseRotation + breathingSway;
          leftArm.quaternion.setFromEuler(leftArm.rotation);
        }

        // 오른쪽 어깨 - z축 회전으로 팔을 아래로 내림 + 숨쉬기 모션
        const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        if (rightArm) {
          const baseRotation = -1.2;
          const breathingSway = Math.sin(time * 1.5 + Math.PI) * 0.05; // 반대 위상
          rightArm.rotation.z = baseRotation + breathingSway;
          rightArm.quaternion.setFromEuler(rightArm.rotation);
        }

        // 왼쪽 팔꿈치 초기화
        const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
        if (leftLowerArm) {
          leftLowerArm.rotation.z = 0.0;
          leftLowerArm.quaternion.setFromEuler(leftLowerArm.rotation);
        }

        // 오른쪽 팔꿈치 초기화
        const rightLowerArm =
          vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
        if (rightLowerArm) {
          rightLowerArm.rotation.z = 0.0;
          rightLowerArm.quaternion.setFromEuler(rightLowerArm.rotation);
        }
      } catch (error) {
        console.warn("A-pose 강제 적용 중 오류:", error);
      }
    }

    // 시선 추적 (lookAt)
    if (vrm.lookAt) {
      // 타겟 위치를 부드럽게 업데이트
      targetLookAtRef.current.lerp(mousePositionRef.current, 5.0 * delta);

      // VRM lookAt 적용 - lookAtTarget 속성 직접 설정
      try {
        const lookAt = vrm.lookAt as any;
        // VRM 3.x 버전에서는 lookAtTarget 속성에 Vector3를 직접 할당
        if (lookAt.lookAtTarget) {
          lookAt.lookAtTarget.copy(targetLookAtRef.current);
        } else if (lookAt.target) {
          // target 속성이 있는 경우
          lookAt.target = targetLookAtRef.current;
        }

        // lookAt 업데이트 (필요한 경우)
        if (typeof lookAt.update === "function") {
          lookAt.update(delta);
        }
      } catch (error) {
        console.warn("lookAt 적용 중 오류:", error);
      }

      // 각도 제한 적용 (최대 30도 = 약 0.5 라디안)
      try {
        const lookAt = vrm.lookAt as any;
        if (lookAt.rangeOfMovementRestriction) {
          const restriction = lookAt.rangeOfMovementRestriction;
          if (restriction.yaw !== undefined) {
            restriction.yaw = 0.5; // ±30도 (약 0.5 라디안)
          }
          if (restriction.pitch !== undefined) {
            restriction.pitch = 0.5; // ±30도 (약 0.5 라디안)
          }
        }
      } catch (error) {
        // 에러 무시
      }
    }

    // 오디오 볼륨 측정 (립싱크용)
    if (
      analyserRef.current &&
      dataArrayRef.current &&
      audioRef.current &&
      !audioRef.current.paused
    ) {
      // @ts-expect-error - getByteFrequencyData accepts Uint8Array but TypeScript is strict about ArrayBuffer types
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);

      // 평균 볼륨 계산
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i];
      }
      const averageVolume = sum / dataArrayRef.current.length;
      // 볼륨을 0-1 범위로 정규화 (0-255 -> 0-1)
      volumeRef.current = Math.min(averageVolume / 255, 1.0);
    } else {
      // 오디오가 재생되지 않으면 볼륨을 0으로
      volumeRef.current = 0;
    }

    // 모든 표현식의 가중치를 0으로 초기화
    const allExpressions = vrm.expressionManager.expressions;
    const targetWeights: Record<string, number> = {};

    // 타겟 emotion에 해당하는 preset 찾기 (실제 BlendShape 이름과 매칭)
    let targetPresetName: string | null = null;
    const emotionMap: Record<string, string> = {
      happy: "happy",
      sad: "sad",
      angry: "angry",
      surprised: "Surprised", // 실제 이름은 "Surprised" (대문자 시작)
      neutral: "neutral",
    };

    targetPresetName = emotionMap[targetEmotion] || "neutral";

    // 모든 표현식의 타겟 가중치 설정
    allExpressions.forEach((expression) => {
      const expressionName = expression.expressionName;
      if (expressionName === targetPresetName) {
        targetWeights[expressionName] = 1.0;
      } else {
        targetWeights[expressionName] = 0.0;
      }
    });

    // 현재 가중치를 타겟 가중치로 부드럽게 전환
    allExpressions.forEach((expression) => {
      const expressionName = expression.expressionName;
      const currentWeight = blendShapeWeightsRef.current[expressionName] || 0;
      let targetWeight = targetWeights[expressionName] || 0;

      // 'aa' (입 벌리기) BlendShape에 볼륨 적용
      if (expressionName.toLowerCase() === "aa") {
        // 오디오 볼륨에 비례하여 입 벌리기 가중치 조절
        targetWeight = volumeRef.current * 0.8; // 최대 0.8까지
      }

      // 자동 눈 깜빡임 처리 - 정확한 BlendShape 이름 매칭
      const expressionNameLower = expressionName.toLowerCase();
      const isBlinkExpression =
        expressionName === "blink" ||
        expressionName === "blinkLeft" ||
        expressionName === "blinkRight" ||
        expressionNameLower === "blink" ||
        expressionNameLower === "blinkleft" ||
        expressionNameLower === "blinkright";

      if (isBlinkExpression) {
        // 깜빡임 타이밍 체크 (state.clock.elapsedTime 사용, 초 단위)
        const currentTime = state.clock.elapsedTime;

        if (!isBlinkingRef.current && currentTime >= nextBlinkTimeRef.current) {
          // 깜빡임 시작
          isBlinkingRef.current = true;
          blinkStartTimeRef.current = currentTime;
        }

        if (isBlinkingRef.current) {
          const elapsed = currentTime - blinkStartTimeRef.current;
          const blinkDuration = 0.15; // 0.15초 동안 깜빡임

          if (elapsed < blinkDuration / 2) {
            // 눈 감기 (0 -> 1)
            blinkWeightRef.current = THREE.MathUtils.lerp(
              0,
              1.0,
              elapsed / (blinkDuration / 2)
            );
          } else if (elapsed < blinkDuration) {
            // 눈 뜨기 (1 -> 0)
            blinkWeightRef.current = THREE.MathUtils.lerp(
              1.0,
              0,
              (elapsed - blinkDuration / 2) / (blinkDuration / 2)
            );
          } else {
            // 깜빡임 완료
            isBlinkingRef.current = false;
            blinkWeightRef.current = 0.0;
            // 다음 깜빡임 시간 설정 (3~5초 후)
            nextBlinkTimeRef.current = currentTime + 3 + Math.random() * 2;
          }
        } else {
          // 깜빡임 없을 때는 0 유지
          blinkWeightRef.current = 0.0;
        }

        targetWeight = blinkWeightRef.current;
      }

      const newWeight = THREE.MathUtils.lerp(
        currentWeight,
        targetWeight,
        lerpSpeed * delta
      );
      blendShapeWeightsRef.current[expressionName] = newWeight;
      // expressionManager의 setValue 메서드 사용
      if (vrm.expressionManager) {
        vrm.expressionManager.setValue(expressionName, newWeight);
      }
    });
  });

  if (!gltf) {
    return null;
  }

  return <group ref={groupRef} />;
}
