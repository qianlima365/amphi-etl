import { useState, useEffect } from 'react';

/**
 * Hook to detect current JupyterLab theme
 * Returns 'neon-future' if the neon theme is active, otherwise 'light'
 */
export function useTheme(): { theme: string; isNeonTheme: boolean } {
  const [theme, setTheme] = useState<string>(() => getCurrentTheme());

  useEffect(() => {
    // Observe body class changes for theme switching
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setTheme(getCurrentTheme());
        }
      });
    });

    observer.observe(document.body, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });

    // Listen for custom theme change events
    const handleThemeChange = () => {
      setTheme(getCurrentTheme());
    };

    window.addEventListener('jupyterlab-theme-changed', handleThemeChange as EventListener);
    
    // Also check periodically for theme changes (fallback)
    const interval = setInterval(() => {
      const currentTheme = getCurrentTheme();
      if (currentTheme !== theme) {
        setTheme(currentTheme);
      }
    }, 1000);

    return () => {
      observer.disconnect();
      window.removeEventListener('jupyterlab-theme-changed', handleThemeChange as EventListener);
      clearInterval(interval);
    };
  }, [theme]);

  return { 
    theme, 
    isNeonTheme: theme === 'neon-future' 
  };
}

/**
 * Get current theme name from document
 */
function getCurrentTheme(): string {
  // Check for neon future theme class (added by theme)
  if (document.body.classList.contains('neon-future-theme')) {
    return 'neon-future';
  }
  
  // Check data attribute that might be set by JupyterLab
  const dataTheme = document.body.getAttribute('data-jp-theme-name');
  if (dataTheme?.toLowerCase().includes('neon')) {
    return 'neon-future';
  }
  
  // Check computed background color as fallback
  const bg = getComputedStyle(document.body).backgroundColor;
  const rgb = parseRgb(bg);
  if (rgb && (rgb.r < 100 && rgb.g < 100 && rgb.b < 100)) {
    // Dark background detected - could be neon theme
    // Check for specific neon theme indicators in CSS variables
    const testEl = document.createElement('div');
    testEl.style.cssText = 'position:absolute;visibility:hidden;';
    document.body.appendChild(testEl);
    const neonCyan = getComputedStyle(testEl).getPropertyValue('--neon-cyan-400');
    document.body.removeChild(testEl);
    
    if (neonCyan && neonCyan.trim() !== '') {
      return 'neon-future';
    }
  }
  
  return 'light';
}

/**
 * Parse RGB color string
 */
function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10)
    };
  }
  return null;
}

/**
 * Get theme-aware styles for common elements
 */
export function getThemeStyles(isNeonTheme: boolean) {
  return {
    // Modal
    modal: {
      content: {
        background: isNeonTheme 
          ? 'var(--neon-bg-secondary, #1a1d29)' 
          : 'var(--jp-layout-color0, #fff)',
        backdropFilter: 'none',
        border: isNeonTheme 
          ? '1px solid var(--neon-bg-elevated, #2d3347)' 
          : '1px solid var(--jp-border-color2, #e8e8e8)',
      },
      header: {
        background: isNeonTheme 
          ? 'var(--neon-bg-secondary, #1a1d29)' 
          : 'transparent',
        borderBottom: isNeonTheme 
          ? '1px solid var(--neon-bg-elevated, #2d3347)' 
          : '1px solid var(--jp-border-color2, #e8e8e8)',
      },
      title: {
        color: isNeonTheme 
          ? 'var(--neon-text-primary, #fff)' 
          : 'var(--jp-ui-font-color0, #333)',
        textShadow: 'none',
      }
    },
    
    // Messages
    userMessage: {
      background: isNeonTheme 
        ? 'var(--neon-blue-500, #2563eb)' 
        : '#1890ff',
      color: '#fff',
      boxShadow: isNeonTheme 
        ? '0 2px 8px rgba(37, 99, 235, 0.3)' 
        : 'none',
    },
    
    assistantMessage: {
      background: isNeonTheme 
        ? 'var(--neon-bg-tertiary, #252a3c)' 
        : 'var(--jp-layout-color1, #fff)',
      border: isNeonTheme 
        ? '1px solid var(--neon-bg-elevated, #2d3347)' 
        : '1px solid var(--jp-border-color2, #e8e8e8)',
      color: isNeonTheme 
        ? 'var(--neon-text-secondary, #e2e4ea)' 
        : 'var(--jp-ui-font-color0, #333)',
    },
    
    // Input
    input: {
      background: isNeonTheme 
        ? 'var(--neon-bg-tertiary, #252a3c)' 
        : 'var(--jp-layout-color1, #fff)',
      borderColor: isNeonTheme 
        ? 'var(--neon-bg-elevated, #2d3347)' 
        : 'var(--jp-border-color2, #e8e8e8)',
      color: isNeonTheme 
        ? 'var(--neon-text-primary, #fff)' 
        : 'var(--jp-ui-font-color0, #333)',
    },
    
    // Button
    primaryButton: {
      background: isNeonTheme 
        ? 'var(--neon-blue-500, #2563eb)' 
        : 'var(--amphi-interactive-01, #1890ff)',
      border: 'none',
      boxShadow: isNeonTheme 
        ? '0 2px 8px rgba(37, 99, 235, 0.3)' 
        : 'none',
    },
    
    // Layout
    layout: {
      background: isNeonTheme 
        ? 'var(--neon-bg-primary, #0f1117)' 
        : 'var(--jp-layout-color0, #fff)',
    },
    
    sider: {
      background: isNeonTheme 
        ? 'var(--neon-bg-secondary, #1a1d29)' 
        : 'var(--jp-layout-color0, #fff)',
    }
  };
}

export default useTheme;
