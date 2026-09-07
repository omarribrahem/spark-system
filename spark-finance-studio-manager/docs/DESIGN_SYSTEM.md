# Design System: Spark Finance & Studio Manager

```yaml
artifact_type: project-specific-design-system
status: approved
profile: tactile-material
as_of: 2026-09-06
```

---

## 1. Product Context & Aesthetic Direction

### 1.1 Philosophy & Persona
**Spark Finance & Studio Manager** is an operational cockpit designed for **Safaa**. It is not a generic marketing SaaS or a social feed; it is an ergonomic, high-density desktop management instrument.
- **Tone**: Focused, crisp, trustworthy, and tactile.
- **Anti-Slop Directives**:
  - No decorative gradients, blurry glassmorphism (frosted glass), or floating pastel bubbles.
  - No oversized hero banners taking up operational screen real estate.
  - No vague placeholder messages; every empty state must provide an immediate primary action button.
  - High data density with comfortable spacing, clear borders, and high-contrast typography.

### 1.2 Layout Mandate: Arabic-First Right-to-Left (RTL)
The application is built natively in Arabic (`dir="rtl"`). The primary sidebar navigation resides on the **right**, content flows from right to left, and reading order prioritizes Arabic phrasing:
- Numbers, currencies, and dates must be strictly protected against bidirectional character scrambling.

---

## 2. Token Architecture

### 2.1 Color Palette

#### Primary Brand: Spark Orange
The primary color represents energy, creativity, and the Spark brand identity:
```css
--color-spark-50:  #fff7ed;
--color-spark-100: #ffedd5;
--color-spark-200: #fed7aa;
--color-spark-300: #fdba74;
--color-spark-400: #fb923c;
--color-spark-500: #f97316; /* Primary Brand Accent */
--color-spark-600: #ea580c; /* Hover & Active Focus */
--color-spark-700: #c2410c;
--color-spark-800: #9a3412;
--color-spark-900: #7c2d12;
--color-spark-950: #431407;
```

#### Neutrals & Surfaces (Tactile Warm Light Theme)
High-contrast readable surfaces designed for long operational shifts under office lighting:
```css
--color-surface-canvas:  #f8fafc; /* Window canvas background */
--color-surface-card:    #ffffff; /* Elevated card surface */
--color-surface-sidebar: #0f172a; /* Right navigation sidebar (slate-900) */
--color-surface-muted:   #f1f5f9; /* Table headers & alternate rows */
--color-border-subtle:   #e2e8f0; /* Default card & input borders */
--color-border-strong:   #cbd5e1; /* Dividers & active table borders */

--color-text-primary:    #0f172a; /* 900 slate: high contrast copy */
--color-text-secondary:  #475569; /* 600 slate: labels and subheaders */
--color-text-muted:      #94a3b8; /* 400 slate: placeholders & timestamps */
```

#### Semantic Status Tokens
Used consistently across dues, bookings, and package balances:
- **Success (Paid / Completed)**: `#10b981` (Emerald-500), Background: `#ecfdf5` (Emerald-50)
- **Warning (Partial / Pending / Low Balance <= 2h)**: `#f59e0b` (Amber-500), Background: `#fffbeb` (Amber-50)
- **Danger / Overdue (Overdue / Cancelled / Void)**: `#ef4444` (Red-500), Background: `#fef2f2` (Red-50)
- **Info (Active / In Progress)**: `#0284c7` (Sky-600), Background: `#f0f9ff` (Sky-50)

---

## 3. Typography: Cairo Arabic Font

The typography utilizes **Cairo** (Google Fonts / bundled local WOFF2), engineered specifically for modern Arabic software interfaces with high vertical legibility and clean geometric numerals.

```css
font-family: 'Cairo', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

### 3.1 Type Scale & Hierarchy

| Role | Tailwind Class | Font Size | Line Height | Weight | Usage |
|------|----------------|:---------:|:-----------:|:------:|-------|
| **Display Heading** | `text-2xl font-bold` | 24px | 32px | 700 | Main screen titles (لوحة التحكم، سجل العملاء) |
| **Section Title** | `text-xl font-semibold` | 20px | 28px | 600 | Card titles, modal headers |
| **Card Header** | `text-lg font-semibold` | 18px | 26px | 600 | Subsections, table grouping titles |
| **Body (Default)** | `text-base font-normal` | 16px | 24px | 400 | Form inputs, table body cells, descriptions |
| **Secondary / Labels**| `text-sm font-medium` | 14px | 20px | 500 | Field labels, table column headers, helper text |
| **Caption / Badges** | `text-xs font-semibold`| 12px | 16px | 600 | Status badges, timestamps, metadata |

---

## 4. Bidirectional Text Isolation (BDI)

In Arabic RTL interfaces, mixed text containing English strings, Latin numbers, phone numbers, or currencies will flip or scramble unexpectedly if not explicitly isolated.

### 4.1 Implementation Standards
1. **Currency Strings**: Always wrap numbers and currency codes:
   ```html
   <span class="currency-cell font-semibold">
     <bdi>1,500</bdi> <span class="text-xs text-slate-500">ج.م</span>
   </span>
   ```
2. **Phone Numbers**: Always specify Latin direction:
   ```html
   <bdi dir="ltr" class="font-mono text-sm">+20 10 1234 5678</bdi>
   ```
3. **Time Ranges**: Ensure proper left-to-right interval rendering:
   ```html
   <bdi dir="ltr" class="font-medium">04:00 PM → 06:30 PM</bdi>
   ```
4. **CSS Helper Rule**:
   ```css
   .isolate-bidi {
     unicode-bidi: isolate;
     display: inline-block;
   }
   ```

---

## 5. Spacing, Layout & Density

- **Base Unit**: 4px / 8px grid scale.
- **Touch & Click Targets**: Minimum interactive target size is $44 \times 44\text{ px}$ to ensure error-free clicking on touchscreens or high-DPI displays.
- **Persistent Right Sidebar**: Width `260px` on desktop, containing Spark logo, 8 core navigation items with badges, and collapsed toggle.
- **Persistent Top Bar**: Height `64px`, featuring global search trigger (`Ctrl+K`), live Egyptian date/time, and high-visibility `+ إضافة سريع` (Quick Add) dropdown.
- **Modal Dialogs**: Centered backdrop overlay (`bg-slate-900/40 backdrop-blur-xs`), fixed widths:
  - Small (Confirmations / Voids): `max-w-md` (448px)
  - Medium (Single Booking / Payment Entry): `max-w-xl` (576px)
  - Large (Multi-Target Split / Client Profile): `max-w-4xl` (896px)

---

## 6. The 4 Mandatory Component States

Every data-driven screen, widget, and table must provide explicit, graceful implementations for all four states:

```
┌─────────────────────────────────────────────────────────────┐
│                    MANDATORY STATE MATRIX                   │
├───────────────┬─────────────────────────────────────────────┤
│ 1. Loading    │ Animated spinner or linear progress bar     │
│ 2. Skeleton   │ Gray pulsing placeholders matching UI layout│
│ 3. Empty      │ Friendly Arabic message + Primary CTA Button│
│ 4. Error      │ Arabic error summary + Retry button         │
└───────────────┴─────────────────────────────────────────────┘
```

### 6.1 Loading State
- Used during async mutations or brief background fetches.
- Uses subtle circular spinner with Spark Orange border: `border-t-spark-500 animate-spin`.

### 6.2 Skeleton State
- Structured placeholder matching the exact shape, columns, and rows of the expected content.
- Pulsing neutral animation: `bg-slate-200 animate-pulse rounded-md`.
- No abrupt layout shift (Zero Cumulative Layout Shift / CLS) when data arrives.

### 6.3 Empty State
When a query returns zero records, the screen must explain what is missing and provide an immediate primary action:
- **No Clients**:
  - Heading: `"لا يوجد عملاء مسجلين حالياً"`
  - Description: `"ابدأ بتسجيل أول عميل لإضافة عقود التسويق وباقات الاستوديو."`
  - Action CTA: `[ + إضافة أول عميل ]`
- **No Studio Bookings Today**:
  - Heading: `"مفيش حجوزات استوديو اليوم"`
  - Description: `"الاستوديو متاح بالكامل طوال اليوم."`
  - Action CTA: `[ + حجز جلسة استوديو ]`
- **No Overdue Dues**:
  - Heading: `"رائع! لا توجد مستحقات متأخرة"`
  - Description: `"جميع التزامات العملاء مسددة في مواعيدها."`

### 6.4 Actionable Error State
Raw database exceptions or technical Rust panics must **never** leak into user view:
- User-friendly Arabic heading: `"حصلت مشكلة أثناء تحميل البيانات"`
- Human explanation: `"تعذر قراءة السجلات من قاعدة البيانات المحلية. يرجى إعادة المحاولة."`
- Action CTA: `[ إعادة المحاولة (Retry) ]`
- Technical stack traces are silently logged to `%APPDATA%/SparkManager/logs/`.

---

## 7. Core Component Specifications

### 7.1 Buttons
- **Primary**: Solid Spark Orange (`bg-spark-500 hover:bg-spark-600 text-white font-semibold rounded-lg px-4 py-2 shadow-xs transition-all`).
- **Secondary**: Clean slate outline (`bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium rounded-lg px-4 py-2`).
- **Destructive**: Soft red (`bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold rounded-lg px-4 py-2`).
- **Ghost**: (`hover:bg-slate-100 text-slate-600 rounded-lg p-2`).

### 7.2 Input Fields & Form Controls
- Clean border (`border-slate-300 focus:border-spark-500 focus:ring-2 focus:ring-spark-100 rounded-lg px-3 py-2 text-base text-slate-900 bg-white`).
- Embedded leading/trailing icons and currency suffix labels (`ج.م`).
- Mandatory validation states with clear red helper text underneath.

### 7.3 Badges (Status Pills)
- Rounded-full capsules (`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`).
- Examples:
  - `مدفوع`: `bg-emerald-100 text-emerald-800`
  - `متأخر`: `bg-red-100 text-red-800`
  - `متبقي ساعتان`: `bg-amber-100 text-amber-800`
  - `نشط`: `bg-blue-100 text-blue-800`

### 7.4 Toast System
- Non-blocking alerts appearing at the top-left (RTL convention) for 4 seconds before auto-dismissing:
  - **Success**: Green checkmark icon + `"تم حفظ الدفعة بنجاح"`
  - **Error**: Red alert icon + `"يوجد تعارض في موعد الحجز"`
  - **Info**: Blue info icon + `"تم إنشاء النسخة الاحتياطية اليومية"`

---

## 8. Motion & Micro-Interactions

Adhering to high-craft design engineering principles:
- **Physics**: Natural spring physics for modal popups and dropdowns (`transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1)`).
- **Subtlety**: Zero gratuitous bouncy loops; motion strictly communicates state changes (drawer opening, modal entry, toast appearance).
- **Reduced Motion**: Respects Windows OS setting `prefers-reduced-motion: reduce` by instantly rendering states without transitions.
