import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager } from '@jupyterlab/apputils';

/**
 * Initialization data for the @amphi/theme-neon-future extension.
 * 
 * This theme provides a futuristic dark UI with neon accents featuring:
 * - Black, white, and deep gray base colors
 * - Cyan, purple, orange, and lime neon accent colors
 * - Glass morphism effects with backdrop blur
 * - Noise texture overlays for depth
 * - Geometric background patterns
 * - Neon glow effects on interactive elements
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: '@amphi/theme-neon-future',
  requires: [IThemeManager],
  autoStart: true,
  activate: (app: JupyterFrontEnd, manager: IThemeManager) => {
    console.log('Activating Neon Future theme...');
    
    const style = '@amphi/theme-neon-future/index.css';

    // Register the theme with the theme manager
    manager.register({
      name: 'Neon Future',
      isLight: false,
      load: () => {
        console.log('Loading Neon Future theme...');
        // Add a class to the document body for theme-specific styling
        document.body.classList.add('neon-future-theme');
        document.body.setAttribute('data-jp-theme-name', 'Neon Future');
        
        // Dispatch custom event for theme change notification
        window.dispatchEvent(new CustomEvent('jupyterlab-theme-changed', { 
          detail: { theme: 'neon-future' } 
        }));
        
        // Load the CSS
        return manager.loadCSS(style);
      },
      unload: () => {
        console.log('Unloading Neon Future theme...');
        // Remove the theme class when unloaded
        document.body.classList.remove('neon-future-theme');
        document.body.removeAttribute('data-jp-theme-name');
        
        // Dispatch custom event for theme change notification
        window.dispatchEvent(new CustomEvent('jupyterlab-theme-changed', { 
          detail: { theme: 'light' } 
        }));
        
        return Promise.resolve(undefined);
      }
    });

    console.log('Neon Future theme registered successfully!');
  }
};

export default extension;
