import React, { useEffect, useRef, useState } from 'react';
import { Tooltip, Badge, Spin } from 'antd';
import { createRoot } from 'react-dom/client';
import AIChatModal from './AIChatModal';

/**
 * Get current theme name from document body class or JupyterLab settings
 */
const getCurrentTheme = (): string => {
  // Check for neon future theme class
  if (document.body.classList.contains('neon-future-theme')) {
    return 'neon-future';
  }
  // Check for light theme indicators
  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg.includes('255') || bg.includes('fff')) {
    return 'light';
  }
  return 'light'; // Default
};

const FloatingButton: React.FC<{
  onClick: () => void;
  loading: boolean;
  unread: number;
}> = ({ onClick, loading, unread }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: window.innerWidth - 80, y: window.innerHeight - 120 });
  const [dragging, setDragging] = useState(false);
  const [theme, setTheme] = useState<string>(getCurrentTheme());
  const offset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setTheme(getCurrentTheme());
        }
      });
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Also listen for JupyterLab theme changes via data attributes
    const handleThemeChange = () => {
      setTheme(getCurrentTheme());
    };

    window.addEventListener('jupyterlab-theme-changed', handleThemeChange as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener('jupyterlab-theme-changed', handleThemeChange as EventListener);
    };
  }, []);

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

  const isNeonTheme = theme === 'neon-future';

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className="ai-assistant-floating-btn"
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(pos.x, window.innerWidth - 64)),
        top: Math.max(8, Math.min(pos.y, window.innerHeight - 64)),
        width: 48,
        height: 48,
        borderRadius: 24,
        background: isNeonTheme 
          ? 'linear-gradient(135deg, rgba(63, 140, 255, 0.18) 0%, rgba(74, 144, 226, 0.12) 100%)'
          : 'var(--jp-layout-color2)',
        border: isNeonTheme
          ? '1px solid var(--neon-cyan-400, #3f8cff)'
          : '1px solid var(--jp-border-color1, #e0e0e0)',
        boxShadow: isNeonTheme
          ? '0 2px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
          : '0 6px 16px rgba(0,0,0,0.15)',
        backdropFilter: isNeonTheme ? 'blur(10px)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 10000,
        transition: 'all 0.3s ease'
      }}
    >
      {loading ? (
        <Spin size="small" style={{ color: isNeonTheme ? 'var(--neon-cyan-400)' : 'inherit' }} />
      ) : (
        <span style={{ 
          fontSize: 20,
          filter: 'none'
        }}>
          🤖
        </span>
      )}
      {unread > 0 && (
        <Badge
          count={unread}
          style={{ 
            position: 'absolute', 
            right: -4, 
            top: -6,
            background: isNeonTheme 
              ? 'linear-gradient(135deg, #ff6b35 0%, #ff00ff 100%)'
              : '#ff4d4f',
            boxShadow: isNeonTheme ? '0 0 10px rgba(255, 107, 53, 0.5)' : 'none'
          }}
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

export function mountAIAssistant(): HTMLElement | null {
  // Check if already mounted
  let el = document.getElementById('ai-assistant-container');
  if (el) {
    return el;
  }
  
  el = document.createElement('div');
  el.id = 'ai-assistant-container';
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<AIAssistantIcon />);
  return el;
}

export default AIAssistantIcon;
