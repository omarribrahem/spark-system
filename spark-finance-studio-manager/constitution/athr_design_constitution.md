# 🏛️ ATHR DESIGN CONSTITUTION (Strict Enforcement)

**VERSION:** 5.0 (Mobile Native Standard)
**STATUS:** ACTIVE & MANDATORY

## 1. THE PRIME DIRECTIVES (Non-Negotiable)

1. **DESIGN LOCK:** You are strictly forbidden from inventing new styles, colors, or tokens. Use only what exists in `tailwind.config.ts`.
2. **REUSE FIRST:** Before writing new code, check `src/components/ui`. Never duplicate the logic for Buttons, Inputs, or Avatars.
3. **APPLE PHYSICS:** The UI must feel "physical" and "glassy." Use `backdrop-blur-xl`, `bg-white/60`, and `ease-spring` transitions.
4. **UNIFIED NOTIFICATIONS:** No manual alert boxes. Use only `toast` from `sonner`, which is hard-routed to the **Dynamic Island** in the header.
5. **NO SIDEBARS:** The app is strictly Header-First. No sidebars allowed. Navigation logic: Mobile = Dropdown Menu; Tablet = Icons Only; Laptop = Icons + Text.
6. **OFFLINE FIRST:** The app is a PWA. Features must gracefully degrade offline. Updates are handled via the `UpdateManager` toast.
7. **MOBILE READERS:** Document viewers on mobile must be "Preview + Fullscreen" to prevent scroll-trap. Actions (Download, Save) must be full-width and thumb-friendly.
8. **RESPONSIVE MODALS:** Use `Drawer` (slides up from bottom) on mobile and `Dialog` (centered modal) on desktop. See `ReportDialog.tsx` as the pattern.

---

## 2. COMPONENT STANDARDS

### 👤 THE UNIFIED IDENTITY (`UserAvatar`)

* **The Rule:** Never use raw `<img>` or basic `<Avatar>` tags for user profiles.
* **The Look:** Must include a glass-effect background (`bg-white/50`), a subtle border (`border-white/40`), and automatic initials fallback.
* **Component:** `src/components/ui/user-avatar.tsx`.
* **Usage:**
  ```tsx
  <UserAvatar src={url} name={fullName} size="md" />

```

### 🟢 BUTTONS (`ui/button.tsx`)

* **Shape:** Full capsule (`rounded-full`) by default.
* **Interaction:** Must include `active:scale-95` for a physical click feel.
* **Primary:** Use `bg-button-gradient` with a soft shadow.

### 🃏 CARDS (`ui/card.tsx`)

* **Style:** Super Round (`rounded-[2.5rem]`) with glass borders.
* **Motion:** Always wrap in `<MotionCard>` if in a grid.

### 📋 SELECTS (`ui/select.tsx`)

* **Rule:** NEVER use native `<select>` elements. Always use the styled `Select` component.
* **Glass Effect:** Dropdown content uses `backdrop-blur-xl` with `bg-white/95 dark:bg-slate-900/95`.
* **Corners:** Trigger and content are `rounded-xl`, items are `rounded-lg`.
* **Trigger Height:** Use `h-12` for form consistency.
* **Usage:**
  ```tsx
  <Select value={value} onValueChange={setValue}>
    <SelectTrigger className="h-12 w-full bg-white/60 dark:bg-white/5 rounded-xl">
      <SelectValue placeholder="Select option" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="option1">Option 1</SelectItem>
    </SelectContent>
  </Select>
  ```

### 🔐 AUTH & ONBOARDING

* **Layout:** Must use `AuthLayout` (Split Screen Desktop, Gradient Mobile).
* **Glass Effect:** Forms are wrapped in `bg-white/60 backdrop-blur-xl`.
* **Typography:** Headings use `font-display`, inputs use `text-base` (16px) to prevent iOS zoom.
* **Pattern:** See `Auth.tsx` and `CompleteProfile.tsx` as references.
* **UNIFIED FUNNEL RULE:** Onboarding is a single-path experience. Users must transition from Sign Up to Profile Completion without a page reload or layout shift. The `AuthLayout` is the mandatory container for this entire lifecycle.

### 👤 PROFILE MENU

* **Desktop:** Uses `DropdownMenu` (Glass Card) - triggered by clicking avatar.
* **Mobile:** Uses `Drawer` (Bottom Sheet) - slides up from bottom.
* **Features:** Displays user info (name, email, role), navigation links (Profile, Resources), admin mode switch, and logout.
* **Component:** `src/components/layout/ProfileMenu.tsx`.
* **Usage:** Automatically integrated in `Header.tsx`. The component self-detects viewport size.

### 📢 ERROR HANDLING (`auth-errors.ts`)

* **The Rule:** NEVER display raw error strings from Supabase (e.g., "Invalid login credentials").
* **The Fix:** Always wrap errors in `getAuthErrorMessage(error)` before showing a toast.
* **Tone:** Professional, helpful, and non-blaming (e.g., "Please check your input" instead of "Bad Request").

---

## 3. MOTION PHYSICS (The "Feel")

### 🌊 Page Transitions

* **Rule:** EVERY page component must be wrapped in `<PageMotion>`.

### 🏝️ Dynamic Island Physics

* **Animation:** `animate-island-bounce` (Elastic scaling).
* **Transitions:** `duration-500 ease-spring` (Bouncy, Apple-like).

---

## 4. CODING CHECKLIST (The "Pre-Flight")

**Before outputting ANY code, you must verify:**

1. [ ] **Header Check:** Is the Page Title handled by `DynamicHeader`?
2. [ ] **Mobile Check:** Will this break on iPhone SE? (Use `grid-cols-1 md:grid-cols-3`).
3. [ ] **Empty State:** If data is missing, show a `<Skeleton>` or "No Data" icon.
4. [ ] **Admin Check:** If it's an admin page, did I add the route to `App.tsx` inside `<AdminRoute>`?

---

## 5. MOBILE-FIRST STANDARDS (MANDATORY)

1. **VIEWPORT:** Use `min-h-[100dvh]` (Dynamic Viewport Height) instead of `vh` to handle mobile address bars.
2. **TOUCH TARGETS:** All interactive elements must be large enough for thumbs.
3. **GRIDS:** Always start with `grid-cols-1` (mobile) and scale up (`md:grid-cols-2`, `lg:grid-cols-3`).
4. **SCROLL:** Use `overflow-x-auto` for wide tables or headers to prevent layout breaking.
5. **INPUTS:** Form inputs must resolve to `16px` font size on mobile to prevent iOS auto-zoom.

---

## 6. TYPOGRAPHY STANDARDS

1. **FONT STACK:** Display = `Lexend`, Body = `Noto Sans` (with `Noto Sans Arabic` fallback).
2. **SMOOTHING:** Always use `antialiased` for text.
3. **SCALING:** Use global `.type-` classes or responsive Tailwind (e.g., `text-3xl md:text-5xl`) to ensure headers don't overflow on mobile.

---

## 7. ADMIN RESPONSIVENESS

1. **NAVIGATION:** Admin layout uses `DynamicHeader` with horizontal scrollable nav on mobile. No sidebars or hamburger menus.
2. **DATA VIEWS:** Admin pages must use Card view on mobile/tablet (`lg:hidden`) and Table view on desktop (`hidden lg:table`).
3. **SCROLL PROTECTION:** All wide data tables must be wrapped in `overflow-x-auto` containers with optional `min-w-[600px]` inner container.
4. **STATS GRIDS:** Dashboard stats must use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for proper stacking on all devices.
5. **BREAKPOINT STANDARD:** Use `lg` (1024px) as the Card→Table switch point for Tablet optimization.
6. **TOUCH TARGETS:** Action buttons in tables and cards must use `size="default"` or explicit `h-9`/`h-10` (36-40px) for easy tapping.

---

## 8. MOBILE NATIVE CORE (MANDATORY)

1. **SAFE AREAS:** All fixed headers MUST use `padding-top: env(safe-area-inset-top)` and `h-[calc(4rem+env(safe-area-inset-top))]` to respect the iPhone Notch/Dynamic Island.
2. **NO WHITE SCREENS:** `index.html` must contain a critical CSS Splash Screen to cover the bundle load time.
3. **SKELETON FIRST:** Never show a spinner for full-page loads. Use `<AppSkeleton />` (Shimmer) that mimics the Dashboard layout.
4. **GATEWAY ROUTING:** The root `/` route is a Logic Gateway. It redirects to `/dashboard` or `/auth` immediately. No marketing landing pages.

---

## 9. KEYBOARD HANDLING (MANDATORY)

1. **INTERACTIVE WIDGET:** `index.html` MUST use `interactive-widget=resizes-content` in the viewport meta tag to prevent iOS resize loops.
2. **STABLE HEIGHTS:** `html` and `body` must use `height: 100%` (not `100dvh`) to prevent layout thrashing when the keyboard opens.
3. **GHOST HEADERS:** The `DynamicHeader` must detect input focus and retreat (hide) to allow maximum typing space on mobile.

---

## 10. NOTIFICATION AESTHETICS (MANDATORY)

1.  **GLASS PHYSICS:** The Dynamic Island notification state must use `bg-white/90` (or dark equivalent) with `backdrop-blur-3xl` to blur content behind it. Solid white is forbidden.
2.  **CONTEXTUAL GLOW:** The Island must emit a soft colored shadow bloom matching the state:
    * **Success:** Green Shadow (`shadow-green-500/30`)
    * **Error:** Red Shadow (`shadow-red-500/30`)
    * **Info:** Blue Shadow (`shadow-blue-500/30`)
3.  **ICON BUBBLES:** Notification icons must be wrapped in a soft-colored circle (`bg-current/10`) to distinguish them visually.

---

## 🛠️ CODE STANDARDS & HYGIENE
1.  **Linting:** Always run `npm run lint:fix` before pushing code.
2.  **No Duplicates:** Do not create specialized wrappers (e.g., `SearchInput`) when a base component (e.g., `Input`) can suffice.
3.  **Imports:** Remove unused imports immediately.
4.  **Types:** Avoid `any` types. Define strict interfaces in `src/types/`.


