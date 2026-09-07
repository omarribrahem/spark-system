# DESIGN_TOKENS.md

Version: 1.0
Status: Source of Truth

---

# Philosophy

Design Tokens are the atomic language of ATHR.
Every visual decision must originate from these tokens.
Never hardcode values.
Never invent new values.
Reuse before creating.
Consistency creates trust.

*   **Intent**: Lock the design system values in code to prevent styling drift.
*   **Implementation**: Define and centralize variables in a shared configuration (like Tailwind configuration or CSS variables in `index.css`).
*   **Anti-patterns**: Using hardcoded HEX, RGB, or custom pixel measurements directly within component style classes.
*   **Acceptance Criteria**: Running a search for arbitrary HEX colors (`#`) or pixel spacings (`px`) outside of the token config file returns zero results in component files.

---

# Token Hierarchy

Primitive Tokens
↓
Semantic Tokens
↓
Component Tokens
↓
Page Layout

Never skip layers.

*   **Intent**: Ensure design updates can be applied globally at different layers of abstraction.
*   **Implementation**: Map primitive colors to semantic names (e.g., `gray-100` to `--color-bg-primary`), then map semantic names to component-specific tokens (e.g., `--color-bg-primary` to `--button-bg-secondary`).
*   **Anti-patterns**: Directly assigning primitive tokens (like `gray-100`) to components or layouts.
*   **Acceptance Criteria**: Changing the primitive value propagates correctly through the semantic and component layers to modify the visual presentation.

---

# Primitive Tokens

Primitive tokens represent raw values. They never describe meaning.
Examples:
- Gray 50, Gray 100, Gray 200...
- Primary 500, Primary 600
- Radius XL
- Space 8
- Duration Fast
These values should never be used directly inside components.

---

# Semantic Tokens

Semantic tokens describe purpose.
Examples: Background, Surface, Text Primary, Text Secondary, Border, Success, Warning, Danger, Info, AI, Interactive, Disabled.
Semantic tokens are always preferred over primitive tokens.

---

# Component Tokens

Components never reference primitive values.
Buttons use: Button Background, Button Radius, Button Padding, Button Transition.
Inputs use: Input Border, Input Radius, Input Focus.
Cards use: Surface, Surface Radius, Surface Shadow.
This allows global evolution without breaking components.

---

# COLOR TOKENS

## Philosophy
Color communicates purpose and interactive highlights. Primary actions and important indicators leverage brand colors or gradients.

---

### Primary
Represents ATHR brand accents. Used for primary CTAs, button backgrounds, interactive highlights, and categories to guide focus.

### Neutral
The foundation. Backgrounds, Typography, Surfaces, Layouts, Cards, Dividers, Whitespace.
Most of the interface uses neutral colors.

### Semantic Colors
Success, Warning, Danger, Info, AI.
Every semantic color has one purpose. Never mix meanings.

### Disabled
Never low contrast. Reduce emphasis. Not readability.

### Interactive
Hover, Pressed, Selected, Focused.
Each state owns its own semantic token.

---

# SPACING TOKENS

Base Unit: 4px

Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 128
Never invent spacing. Use the closest existing token.

---

# TYPOGRAPHY TOKENS

Display, Hero, Heading, Subheading, Body, Caption, Overline, Code, Numbers.
Each category defines: Font, Weight, Line Height, Letter Spacing, Responsive Scaling.
Never create ad-hoc typography.

---

# FONT RULES

English Display: Outfit
English Body: Plus Jakarta Sans
Arabic: Editorial Arabic Family (Noto Sans Arabic)
Never mix multiple UI fonts. One pair for display and body.

---

# RADIUS TOKENS

Small, Medium, Large, XL, Full.
All interactive elements (buttons, inputs, status pills) use Full (pill) rounding. Static surfaces and cards use XL or Large.

---

# SHADOW TOKENS

Shadow exists only for elevation.
Levels: 0, 1, 2, 3, 4.
No dramatic shadows. No decorative shadows.

---

# ELEVATION TOKENS

Surface, Floating, Overlay, Dialog, Navigation, Tooltip.
Every layer has one elevation token.

---

# MOTION TOKENS

Fast, Normal, Slow, Micro, Component, Page, Large.
Each defines: Duration, Spring, Easing.
Never hardcode animation durations.

---

# SPRING TOKENS

Soft, Default, Responsive, Heavy.
Choose springs based on interaction. Never invent random stiffness values.

---

# OPACITY TOKENS

Disabled, Hover, Overlay, Backdrop.
Glass is prohibited. Opacity exists only for layering.

---

# BLUR TOKENS

Used only for: Background overlays, Focus layers, Modal backdrop.
Never decorative.

---

# BORDER TOKENS

Border Width: Hairline, Thin, Medium.
Only one border color. Borders are the exception. Not the default.

---

# ICON TOKENS

Sizes: 16, 20, 24, 28, 32, 40, 48.
Stroke Width: Consistent across the system. Outline only.

---

# CONTAINER TOKENS

XS, SM, MD, LG, XL, 2XL.
Reading Width, Content Width, Dashboard Width.
Never stretch text across the screen.

---

# GRID TOKENS

Columns, Gutters, Margins, Breakpoints.
Always consistent.

---

# BREAKPOINT TOKENS

Mobile, Tablet, Laptop, Desktop, Large Desktop.
Behavior changes. Design language never changes.

---

# Z-INDEX TOKENS

Background, Content, Floating, Navigation, Overlay, Dialog, Toast, Tooltip.
Never use arbitrary z-index values.

---

# SAFE AREA TOKENS

Top, Bottom, Left, Right.
Used on mobile only. Always respected.

---

# TOUCH TOKENS

Minimum Target: 44px
Preferred: 48px
Comfort beats density.

---

# LOADING TOKENS

Skeleton Radius, Skeleton Speed, Progress Speed, Loading Delay, Spinner Size.
Skeleton is preferred. Spinner is secondary.

---

# AI TOKENS

AI Accent, AI Background, AI Border, AI Message Radius, AI Suggestion Surface.
Reserved exclusively for AI.

---

# ACCESSIBILITY TOKENS

Minimum Contrast, Focus Ring, Reduced Motion, Readable Line Length, Touch Size.
Accessibility is tokenized. Not optional.

---

# IMPLEMENTATION RULES

Components use Semantic Tokens only.
Pages use Components only.
Pages never reference tokens directly.

---

# TOKEN EVOLUTION

Never remove a token. Deprecate. Replace. Migrate. Then remove.

---

# Non-Negotiable Rules

• Never hardcode colors.
• Never hardcode spacing.
• Never hardcode radius.
• Never hardcode timing.
• Never hardcode shadows.
• Never invent tokens.
• Components consume semantic tokens.
• Pages consume components.
• Tokens are the single source of truth.
• Consistency always wins.

