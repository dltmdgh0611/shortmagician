import { useState, useEffect, useRef, useCallback } from "react";

interface UseRealisticProgressOptions {
  duration: number; // 목표 소요 시간 (ms)
  onComplete?: () => void;
  autoStart?: boolean;
}

export function useRealisticProgress({
  duration,
  onComplete,
  autoStart = true,
}: UseRealisticProgressOptions) {
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const currentProgressRef = useRef(0);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setProgress(0);
    currentProgressRef.current = 0;
  }, [stop]);

  const start = useCallback(() => {
    if (intervalRef.current) return; // 이미 실행 중

    setIsRunning(true);
    currentProgressRef.current = 0;
    setProgress(0);

    const intervalMs = 80;
    const baseIncrement = 100 / (duration / intervalMs);

    intervalRef.current = window.setInterval(() => {
      // 역동적인 랜덤 속도 변화
      const rand = Math.random();
      let speedFactor: number;

      if (rand < 0.08) {
        // 8% 확률: 완전 멈춤 (처리 중인 느낌)
        speedFactor = 0;
      } else if (rand < 0.18) {
        // 10% 확률: 거의 멈춤
        speedFactor = 0.05 + Math.random() * 0.15;
      } else if (rand < 0.35) {
        // 17% 확률: 느림
        speedFactor = 0.2 + Math.random() * 0.4;
      } else if (rand < 0.75) {
        // 40% 확률: 보통
        speedFactor = 0.6 + Math.random() * 0.8;
      } else if (rand < 0.92) {
        // 17% 확률: 빠름
        speedFactor = 1.4 + Math.random() * 1.0;
      } else {
        // 8% 확률: 매우 빠름 (갑자기 진행)
        speedFactor = 2.5 + Math.random() * 1.5;
      }

      currentProgressRef.current += baseIncrement * speedFactor;

      if (currentProgressRef.current >= 100) {
        currentProgressRef.current = 100;
        setProgress(100);

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsRunning(false);

        if (onComplete) {
          setTimeout(onComplete, 100);
        }
      } else {
        setProgress(currentProgressRef.current);
      }
    }, intervalMs);
  }, [duration, onComplete]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoStart, start]);

  return {
    progress: Math.min(Math.round(progress), 100),
    isRunning,
    isComplete: progress >= 100,
    start,
    stop,
    reset,
  };
}

// 여러 단계를 순차적으로 진행하는 훅
interface Step {
  label: string;
  duration: number;
}

interface UseMultiStepProgressOptions {
  steps: Step[];
  onAllComplete?: () => void;
  autoStart?: boolean;
}

export function useMultiStepProgress({
  steps,
  onAllComplete,
  autoStart = true,
}: UseMultiStepProgressOptions) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const currentProgressRef = useRef(0);
  const isTransitioningRef = useRef(false);

  const isComplete = currentStepIndex >= steps.length;

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCurrentStepIndex(0);
    setStepProgress(0);
    currentProgressRef.current = 0;
    isTransitioningRef.current = false;
    setIsRunning(false);
  }, []);

  const runStep = useCallback((stepIndex: number) => {
    if (stepIndex >= steps.length) {
      setIsRunning(false);
      if (onAllComplete) {
        setTimeout(onAllComplete, 300);
      }
      return;
    }

    const step = steps[stepIndex];
    const intervalMs = 80;
    const baseIncrement = 100 / (step.duration / intervalMs);
    currentProgressRef.current = 0;
    setStepProgress(0);

    intervalRef.current = window.setInterval(() => {
      const rand = Math.random();
      let speedFactor: number;

      if (rand < 0.08) {
        speedFactor = 0;
      } else if (rand < 0.18) {
        speedFactor = 0.05 + Math.random() * 0.15;
      } else if (rand < 0.35) {
        speedFactor = 0.2 + Math.random() * 0.4;
      } else if (rand < 0.75) {
        speedFactor = 0.6 + Math.random() * 0.8;
      } else if (rand < 0.92) {
        speedFactor = 1.4 + Math.random() * 1.0;
      } else {
        speedFactor = 2.5 + Math.random() * 1.5;
      }

      currentProgressRef.current += baseIncrement * speedFactor;

      if (currentProgressRef.current >= 100) {
        currentProgressRef.current = 100;
        setStepProgress(100);

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        isTransitioningRef.current = true;
        setTimeout(() => {
          setStepProgress(0);
          currentProgressRef.current = 0;
          const nextIndex = stepIndex + 1;
          setCurrentStepIndex(nextIndex);
          isTransitioningRef.current = false;

          if (nextIndex < steps.length) {
            runStep(nextIndex);
          } else {
            setIsRunning(false);
            if (onAllComplete) {
              setTimeout(onAllComplete, 300);
            }
          }
        }, 250);
      } else {
        setStepProgress(currentProgressRef.current);
      }
    }, intervalMs);
  }, [steps, onAllComplete]);

  const start = useCallback(() => {
    if (isRunning || isTransitioningRef.current) return;
    setIsRunning(true);
    setCurrentStepIndex(0);
    runStep(0);
  }, [isRunning, runStep]);

  useEffect(() => {
    if (autoStart && !isRunning && currentStepIndex === 0) {
      start();
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoStart]);

  const totalProgress = isComplete 
    ? 100 
    : ((currentStepIndex / steps.length) * 100) + ((stepProgress / 100) * (100 / steps.length));

  return {
    currentStepIndex,
    stepProgress: Math.min(Math.round(stepProgress), 100),
    totalProgress: Math.min(Math.round(totalProgress), 100),
    isRunning,
    isComplete,
    currentStep: steps[currentStepIndex] || null,
    start,
    reset,
  };
}
