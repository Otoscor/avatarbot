"use client";

import { useEffect } from "react";

export default function FontLoader() {
  useEffect(() => {
    // Pretendard 폰트가 이미 로드되었는지 확인
    const existingLink = document.querySelector(
      'link[href*="pretendard"]'
    );
    
    if (!existingLink) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css";
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  }, []);

  return null;
}

