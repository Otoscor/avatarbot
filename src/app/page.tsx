import AvatarCanvas from '@/components/AvatarCanvas';
import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  return (
    <div 
      data-page="home"
      style={{ 
        position: 'fixed', 
        inset: 0, 
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        touchAction: 'none', // 터치 스크롤 방지
      }}
    >
      <AvatarCanvas />
      <ChatInterface />
    </div>
  );
}
