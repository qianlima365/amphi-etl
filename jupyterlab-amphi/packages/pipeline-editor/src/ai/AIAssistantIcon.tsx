import React, { useEffect, useRef, useState } from 'react';
import { Tooltip, Badge, Spin } from 'antd';
import { createRoot } from 'react-dom/client';
import AIChatModal from './AIChatModal';

const FloatingButton: React.FC<{
  onClick: () => void;
  loading: boolean;
  unread: number;
}> = ({ onClick, loading, unread }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: window.innerWidth - 80, y: window.innerHeight - 120 });
  const [dragging, setDragging] = useState(false);
  const offset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);
  const onMouseDown = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  };
  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(pos.x, window.innerWidth - 64)),
        top: Math.max(8, Math.min(pos.y, window.innerHeight - 64)),
        width: 48,
        height: 48,
        borderRadius: 24,
        background: 'var(--jp-layout-color2)',
        boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 10000
      }}
    >
      {loading ? <Spin size="small" /> : <span style={{ fontSize: 16 }}>🤖</span>}
      {unread > 0 && (
        <Badge
          count={unread}
          style={{ position: 'absolute', right: -4, top: -6 }}
        />
      )}
    </div>
  );
};

const AIAssistantIcon: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  return (
    <>
      <Tooltip title="AI助手" placement="left">
        <FloatingButton onClick={() => setOpen(true)} loading={loading} unread={unread} />
      </Tooltip>
      {open && <AIChatModal onClose={() => setOpen(false)} setUnread={setUnread} setLoading={setLoading} />}
    </>
  );
};

export function mountAIAssistant() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<AIAssistantIcon />);
}

export default AIAssistantIcon;
