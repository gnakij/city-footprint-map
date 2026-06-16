---
name: Luminous High-Energy System
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#424656'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#727687'
  outline-variant: '#c2c6d8'
  surface-tint: '#0054d6'
  primary: '#0050cb'
  on-primary: '#ffffff'
  primary-container: '#0066ff'
  on-primary-container: '#f8f7ff'
  inverse-primary: '#b3c5ff'
  secondary: '#a33800'
  on-secondary: '#ffffff'
  secondary-container: '#cd4800'
  on-secondary-container: '#fffbff'
  tertiary: '#b30044'
  on-tertiary: '#ffffff'
  tertiary-container: '#db1d59'
  on-tertiary-container: '#fff5f5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#001849'
  on-primary-fixed-variant: '#003fa4'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb59a'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#802a00'
  tertiary-fixed: '#ffd9dd'
  tertiary-fixed-dim: '#ffb2bc'
  on-tertiary-fixed: '#400013'
  on-tertiary-fixed-variant: '#910035'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 64px
  section-gap: 80px
---

## Brand & Style

The design system is built on a high-energy, modern, and airy aesthetic that prioritizes visual vibrance and clarity. It targets a dynamic audience that values speed and optimism. The style is a hybrid of **Modern Minimalism** and **Glassmorphism**, utilizing expansive whitespace and crisp backgrounds to let luminous, saturated accents take center stage.

The emotional response should be one of "digital freshness"—feeling light, responsive, and forward-looking. Interactive elements use high-contrast color shifts and subtle translucent overlays to maintain a sense of depth without feeling heavy or corporate.

## Colors

The palette is divided into two distinct functional modes that drive the UI's energy:

- **Stay Duration Mode (Primary):** Utilizes a luminous Electric Blue (#0066FF). This should be paired with ultra-clean white backgrounds and very subtle blue-tinted shadows to maintain a "cool" and airy feel.
- **Last Departure Mode:** Shifts to a vibrant Sun-Kissed Orange (#FF5C00) and Coral (#FF3D71). This mode should feel warm and urgent, using light peach-tinted surfaces to differentiate from the primary mode.

Backgrounds must remain "Crisp White" (#FFFFFF) to maximize contrast. Avoid muddy greys; use high-chroma neutrals (Slate) for text to ensure readability against the bright accents.

## Typography

This design system leverages **Inter** exclusively to maintain a systematic, technical precision. To achieve the "high-energy" look, we employ **Extra Bold (800)** and **Bold (700)** weights for headings to create a strong visual "pop" against the vibrant color palette.

Tighten letter-spacing on larger headlines to create a more impactful, editorial feel. Body text remains clean and open with generous line-heights to support the airy layout. Use the `label-bold` style for high-energy metadata and small buttons to ensure they don't get lost in the whitespace.

## Layout & Spacing

The layout philosophy is **Expansive and Fluid**. We use an 8px base grid but prioritize large internal paddings to create the "airy" feel.

- **Desktop:** A 12-column grid with wide 64px outer margins. Content should feel centered and "floating" within the viewport.
- **Mobile:** A 4-column grid with 20px margins.
- **Rhythm:** Use large vertical gaps (`section-gap`) between major content blocks to prevent visual clutter and allow the bright colors to breathe.

## Elevation & Depth

Depth is achieved through **Luminous Layers** rather than heavy shadows.

1.  **Level 0 (Base):** Pure White (#FFFFFF).
2.  **Level 1 (Cards):** Very subtle, high-diffusion shadows (Blur: 30px, Opacity: 4%) with a hint of the primary color in the shadow tint.
3.  **Level 2 (Modals/Popovers):** Soft backdrop blurs (20px) to create a "glass" effect, allowing the background colors to bleed through slightly.

Avoid solid borders where possible; use tonal changes in background color (e.g., a very light blue surface) to define container boundaries.

## Shapes

The design system uses a **Rounded** shape language to feel approachable and friendly.

- **Buttons & Inputs:** 0.5rem (8px) corner radius.
- **Cards & Large Containers:** 1rem (16px) corner radius.
- **Feature Modules:** 1.5rem (24px) for prominent "hero" cards to emphasize the modern, soft aesthetic.

Interactive elements should maintain these radii consistently to reinforce the cohesive, polished feel of the system.

## Components

- **Buttons:** Primary buttons use a solid, vibrant fill (Electric Blue or Sunny Orange) with white text in `label-bold`. Use a "glow" hover state where the button shadow increases in intensity and color saturation.
- **Chips:** Highly saturated backgrounds at 10-15% opacity with high-contrast text. For "Last Departure" mode, use Coral backgrounds with Orange text.
- **Input Fields:** Use a subtle "Glass" border—1px solid at 10% opacity of the neutral color. Upon focus, the border should animate to a 2px thickness in the primary mode color.
- **Cards:** Cards should have no visible border; instead, use the Level 1 Elevation (soft shadow) and generous internal padding (min 32px) to frame content.
- **Lists:** Clean, borderless list items separated by whitespace or a very faint 0.5px hair-line divider.
- **Progress Indicators:** Use thick, 8px bars with rounded caps and high-energy gradients (e.g., Light Blue to Electric Blue).
