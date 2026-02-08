# Neon Future Theme for Amphi ETL

A professional dark enterprise theme designed for Amphi ETL's JupyterLab interface. Features deep indigo backgrounds, vibrant blue accents, and a clean modern aesthetic inspired by enterprise-grade data platforms.

## Features

### AI Assistant Integration
The Neon Future theme automatically adapts the AI Assistant UI:
- **Floating Button**: Clean design with subtle hover effects
- **Chat Modal**: Dark background with professional styling
- **Messages**: Clear user and assistant message bubbles
- **Input Area**: Themed input fields with blue focus states
- **Animations**: Smooth, subtle transitions

Theme switching is detected in real-time, no refresh needed!

### Color Scheme
- **Base Colors**: Deep indigo tones creating a professional dark foundation
  - Primary background: `#0f1117`
  - Secondary background: `#1a1d29`
  - Elevated surfaces: `#2d3347`
- **Primary Accent**: Vibrant blue (`#3b82f6`) for selections and interactive elements
- **Secondary Accents**:
  - Cyan (`#60a5fa`) - Links and secondary highlights
  - Green (`#10b981`) - Success indicators and save buttons
  - Orange (`#f59e0b`) - Warning states

### Visual Design

#### 1. Clean Enterprise Aesthetic
- Deep indigo/navy backgrounds for reduced eye strain
- High contrast text for readability
- Subtle borders for clear visual hierarchy
- Professional spacing and sizing

#### 2. Subtle Textures
- Minimal noise texture overlay (1.5% opacity)
- Adds depth without distraction
- Implemented via SVG filter data URI

#### 3. Blue Selection States
- Vibrant blue (`#2563eb`) for selected items
- Clear visual feedback for user interactions
- Consistent across sidebar, file browser, and buttons

#### 4. Refined Shadows
- Soft, professional shadows for depth
- Elevated cards and panels
- Subtle hover effects

## Installation

### Prerequisites
- JupyterLab 4.0 or higher
- Amphi ETL environment

### Build Steps

1. Navigate to the theme directory:
```bash
cd amphi-etl/packages/theme-neon-future
```

2. Install dependencies:
```bash
jlpm install
```

3. Build the extension:
```bash
jlpm build
```

4. Install the extension:
```bash
jupyter labextension install .
```

Or for development:
```bash
jupyter labextension develop --overwrite .
```

### Using with Amphi ETL

1. Build and install the theme as described above
2. Launch JupyterLab with Amphi ETL
3. Go to Settings > Theme
4. Select "Neon Future" from the theme dropdown

## Customization

### CSS Variables

The theme exposes many CSS custom properties that can be overridden:

```css
/* Example: Custom accent color */
:root {
  --neon-blue-400: #6366f1;  /* Change to indigo */
}
```

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `--neon-bg-primary` | Deepest background | #0f1117 |
| `--neon-bg-secondary` | Sidebar, panels | #1a1d29 |
| `--neon-bg-tertiary` | Cards, inputs | #252a3c |
| `--neon-blue-400` | Primary accent | #3b82f6 |
| `--neon-blue-500` | Selection state | #2563eb |
| `--neon-text-primary` | Primary text | #ffffff |
| `--neon-text-secondary` | Secondary text | #e2e4ea |

## File Structure

```
theme-neon-future/
├── src/
│   ├── index.ts           # Theme registration and activation
│   └── declarations.d.ts  # Type declarations
├── style/
│   ├── index.css          # Main stylesheet with all UI overrides
│   ├── variables.css      # CSS custom properties
│   └── icons/             # Custom icons (if any)
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

## Browser Compatibility

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

Note: Glass effects use `backdrop-filter` which is supported in modern browsers.

## Performance Considerations

- Minimal noise texture for optimal performance
- CSS animations use `transform` and `opacity` for GPU acceleration
- Clean, efficient CSS without unnecessary complexity

## License

This theme is part of Amphi ETL and follows the same license (Elastic License 2.0).

## Contributing

Contributions are welcome! Please ensure:
- CSS follows the existing variable naming convention
- Changes maintain the professional enterprise aesthetic
- Changes are tested across different screen sizes
- Accessibility considerations for contrast ratios

## Credits

Designed for Amphi ETL - The visual data integration platform.

---

**Enjoy the professional coding experience! 🚀**
