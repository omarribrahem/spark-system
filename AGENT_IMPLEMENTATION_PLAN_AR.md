# خطة تنفيذ وكيل التطوير — Spark Finance & Studio Manager

## 1. سلطة المتطلبات والنطاق

### المصادر بالترتيب

1. التعليمات الجديدة الصريحة من مالك المشروع.
2. `Spark Finance & Studio Manager — Full Product Requirements Document v1.0.md` — المصدر الوظيفي الأساسي.
3. وثائق Architecture OS في `D:\Project\Template\architecture-os`.
4. ATHREDU هو مرجع UI/UX ومكوّنات فقط، وليس مرجعًا للبيانات أو البنية أو منطق الأعمال.

### المنتج

تطبيق سطح مكتب محلي لإدارة عملاء Spark، خدماتها، حجوزات الاستوديو، الباقات، المدفوعات، المصروفات، والتنبيهات والتقارير التشغيلية. المستخدم الأساسي هو صفاء. اللغة عربية RTL أولًا، والعملة EGP.

### حدود MVP

- تطبيق محلي single-device وoffline-first.
- لا خادم Backend، ولا Supabase، ولا LocalStorage كمصدر مالي للبيانات.
- لا نظام محاسبة مزدوج أو ضرائب أو payroll أو CRM أو بوابة دفع.
- Google Drive هو نسخة احتياطية خارجية اختيارية، وليس cloud sync أو مصدر الحقيقة.

## 2. قرارات معمارية معتمدة للتنفيذ

| الموضوع | القرار |
| --- | --- |
| Runtime | Tauri v2 على Windows |
| UI | React + TypeScript + Vite + Tailwind |
| قاعدة البيانات | SQLite محلية مع migrations وforeign keys مفعّلة |
| البيانات المالية | integer piasters فقط |
| الساعات | integer minutes فقط |
| الملفات | application data directory فقط؛ المرفقات تُنسخ إليه |
| الحالة | SQLite هي المصدر الدائم؛ UI query/cache فقط |
| العمليات المركبة | SQLite transaction واحدة مع rollback |
| التصميم | Arabic RTL، خلفية دافئة، نص داكن، Spark orange، لا ازدحام بصري |

## 3. قواعد أعمال غير قابلة للتفاوض

1. الرصيد المالي ليس رصيد الخدمة.
2. Reel لا يخصم ساعة تلقائيًا، والساعة لا تخصم Reel تلقائيًا.
3. لا أسعار hard-coded، ولا تعديل للأسعار التاريخية أو snapshots للباقات المباعة.
4. يمكن لدفعة واحدة أن تُوزع على عدة التزامات، ولا يجوز أن تتجاوز التخصيصات قيمة الدفعة.
5. المبلغ غير المخصص يصبح Client Credit.
6. مدة الحجز الفعلية هي التي تستهلك ساعات الباقة، والحجوزات المستقبلية تحجز Planned Minutes مؤقتًا.
7. إلغاء الحجز يحرر الساعات المحجوزة ولا يضيع رصيد الباقة.
8. الحجز المتداخل ممنوع افتراضيًا.
9. تأخر Marketing لا يوقف العقد تلقائيًا.
10. لا حذف مالي دائم؛ استخدم void / inactive / cancelled وسجل Activity Log.

## 4. الهيكل المقترح

```text
spark-finance-studio-manager/
  src/
    app/                 # bootstrap, router, providers, shell
    features/            # feature slices
      clients/
      payments/
      expenses/
      marketing/
      subscriptions/
      websites/
      packages/
      studio/
      reels/
      dashboard/
      reports/
      settings/
      backup/
    domain/              # pure types, calculations, validators
    components/          # shared UI, layout, tables, forms
    lib/
    hooks/
  src-tauri/
    src/                 # commands, repositories, filesystem, backup
    migrations/
```

لا تنقل مجلدات ATHREDU أو Supabase أو auth أو PWA أو صفحات الطلاب. انقل فقط الأفكار والمكوّنات المتوافقة بعد تكييفها.

## 5. نظام التصميم

### ما يُعاد استخدامه من ATHREDU

- Token-first styling ومكونات موحدة قابلة لإعادة الاستخدام.
- Button، Input، Select، Dialog، Drawer، Table، Badge، Skeleton، Empty state، Error state.
- Lucide فقط للأيقونات.
- keyboard/focus/accessibility وحالات التحميل والنجاح والخطأ.
- mobile-first وتفاعلات انتقال قصيرة تحافظ على السياق.

### ما لا يُنقل

- Supabase وPWA والتسجيل والحسابات الطلابية.
- تصميم glass-heavy أو Dynamic Island أو ألوان ATHREDU الزرقاء.
- منع الـsidebar؛ Spark يحتاج Sidebar على desktop حسب الـPRD.

### قواعد Spark UX

- `dir="rtl"` على التطبيق؛ الأرقام والمبالغ والأوقات تُعرض بعزل اتجاه مناسب.
- Desktop: sidebar + top bar يحوي البحث والتاريخ وQuick Add.
- Mobile/small window: navigation drawer، مع touch targets لا تقل عن 44px.
- صفحة واحدة لها هدف واحد؛ لا cards داخل cards بلا سبب.
- status لا يعتمد على اللون وحده؛ يحتوي label/icon واضحين.
- forms تدعم save/cancel/validation ولا تُمسح عند فشل التحقق.

## 6. خارطة التنفيذ

### Phase 0 — وثائق وقرارات قبل الكود

أنشئ داخل المشروع وثائق Architecture OS التالية:

- `docs/PROJECT_CONTEXT.md`: facts / assumptions / unknowns.
- `docs/ARCHITECTURE.md`: الحدود، الطبقات، تدفق البيانات، وسبب عدم وجود backend.
- `docs/DATA_MODEL.md`: الجداول والعلاقات والقيود والفهارس.
- `docs/DESIGN_SYSTEM.md`: tokens، RTL، responsive، states، accessibility، motion.
- `docs/adr/ADR-001-local-tauri-sqlite.md`.
- `docs/adr/ADR-002-backup-and-google-drive.md`.
- `docs/TEST_STRATEGY.md` و`docs/ACCEPTANCE_TRACEABILITY.md`.

**بوابة التوقف:** لا تبدأ phase 1 قبل أن تكون هذه الملفات موجودة وأن تُعرض القرارات المفتوحة للمالك، خصوصًا حساب Google Drive وسياسة retention.

### Phase 1 — Foundation

- أنشئ Tauri + React + TypeScript + Tailwind.
- أضف App shell، routing، RTL، theme tokens، layout، sidebar، top bar، Quick Add.
- أضف migrations bootstrap وقاعدة SQLite وطبقة typed commands بين React وRust.
- أنشئ application data folder وlogs وError Boundary.
- أضف إعداد اختبار unit للـdomain layer.

**قبول:** التطبيق يبدأ محليًا، ينشئ DB ويطبق migrations بأمان، والواجهة RTL سليمة.

### Phase 2 — Domain وDatabase

أنشئ migrations والجداول التالية:

- clients، service_definitions.
- marketing_contracts، marketing_monthly_dues، marketing_extras.
- subscriptions، subscription_monthly_dues، website_projects.
- package_templates، package_template_items، client_packages، client_package_items.
- studio_bookings، recurring_booking_rules، reel_items.
- payments، payment_allocations، expenses، attachments، activity_log، app_settings.

أنشئ pure calculations واختبرها: money balance، credit، package hours/reels/reservations، due statuses، overlap detection.

**قبول:** money بالـpiasters وtime بالدقائق؛ foreign keys وtransactions تعمل؛ لا يوجد حساب مالي منسوخ في JSX.

### Phase 3 — Clients

- قائمة، بحث، filters، create/edit، profile موحد.
- profile يعرض الخدمات، الالتزامات، الباقات، الحجوزات القادمة، history وquick actions.

**قبول:** عميل واحد يملك خدمات وباقات متعددة دون خلط أرصدتها.

### Phase 4 — Payments, Expenses, Attachments

- دفعات Cash وVodafone Cash.
- تخصيص دفعة واحدة لأكثر من target مع منع over-allocation.
- Client Credit غير المخصص.
- copy receipt إلى data directory مع path نسبي وحجم محدود.
- void payment بسبب إلزامي وسجل نشاط.
- expenses والتصنيفات والتحقق من Other.

**قبول:** سيناريو 10,000 موزع على ثلاثة التزامات يمر بدقة؛ الملفات لا تعتمد على Downloads الأصلية.

### Phase 5 — Marketing, Subscriptions, Websites

- Marketing contract وmonthly dues وextras.
- Subscription بنفس منطق monthly dues.
- Website project وnext payment المرن.
- إعادة حساب paid/remaining/status من payment allocations.

**قبول:** overdue لا يوقف Marketing؛ الأسعار القديمة لا تتغير عند تغيير السعر المستقبلي.

### Phase 6 — Packages وReels

- templates وبنود hours/reels.
- snapshot عند بيع باقة للعميل.
- عدة باقات نشطة لنفس العميل.
- Reel items وحالتها وربطها الاختياري بحجز.

**قبول:** Package C (10h + 3 reels) يبقى صحيحًا ماليًا وخدميًا بعد استهلاك 4.5h وReel واحد.

### Phase 7 — Studio

- Calendar day/week/month؛ week افتراضي.
- single وrecurring bookings مع preview للتعارضات.
- planned vs actual duration.
- reserve/release/consume داخل transaction.
- blocking overlap detection.
- cancellation، no-show، extra usage resolution، reel linking.

**قبول:** حالات recurring، double booking، extend، cancel، multiple packages تمر وفق اختبارات الـPRD.

### Phase 8 — Dashboard, Reports, Search

- Dashboard تشغيلي: حجوزات اليوم، due، overdue، timeline، needs attention، month snapshot، package warnings، القادم.
- تقارير monthly summary، income by service based on allocations، outstanding، package balances، studio usage، client statement.
- global search وانتقال مباشر للسجل.

**قبول:** صفاء ترى حالة اليوم والمستحقات والحجوزات في ثوانٍ.

### Phase 9 — Backup, Restore, Google Drive

#### Local backup

- Backup Now.
- consistent SQLite snapshot ثم archive يضم DB وattachments وsettings.
- manifest version + SHA-256 checksum.
- atomic write ثم verification.
- daily backup on app open إذا لا توجد نسخة لليوم، retention آخر 30 نسخة.
- Restore ينشئ backup مسبقًا، يتحقق من الأرشيف، ثم يستبدل بأمان ويعيد تحميل التطبيق.

#### Google Drive mirror

- إعداد opt-in في Settings: Connect/Disconnect/status/last upload.
- OAuth Desktop flow محدود الصلاحية لمجلد النسخ.
- ارفع فقط archive محليًا مكتملًا ومتحققًا منه.
- failures لا توقف CRUD؛ تُسجل وتُعاد المحاولة لاحقًا.
- token في مخزن نظام Windows الآمن، لا في SQLite أو source.
- إذا كان المطلوب يوميًا حتى والتطبيق مغلق: helper صغير + Windows Task Scheduler قابل للتعطيل.

**قبول:** restore كامل يعمل محليًا؛ انقطاع الشبكة لا يؤثر على التطبيق؛ upload الناجح يمكن التحقق منه بالـchecksum.

### Phase 10 — Hardening وRelease

- destructive confirmations.
- Activity log.
- empty/error/loading states كاملة.
- unit/integration/acceptance tests.
- اختبار RTL، keyboard، scale، backup/restore، installer على Windows نظيف.
- `npm run lint`، `npx tsc --noEmit`، `npm run build`، واختبارات Rust/SQLite المناسبة.

## 7. مصفوفة الاختبارات الإلزامية

- Package C: 10 ساعات + 3 Reels، مع 4.5 ساعة وReel مستخدم.
- Recurring Saturdays وتعارض تاريخ واحد على الأقل.
- Extended session مع actual أكبر من planned.
- Cancelled package booking يعيد reservation.
- Marketing partial ثم overdue مع استمرار العقد.
- Split payment على ثلاثة targets.
- Overpayment يتحول إلى Client Credit.
- Double booking يمنع الحفظ.
- Backup ثم restore يعيد DB والمرفقات والإعدادات.
- فشل Google Drive لا يمنع إنشاء backup محلي أو أي عملية عمل.

## 8. مخاطر وقرارات تحتاج المالك

| الموضوع | القرار المطلوب |
| --- | --- |
| Google Drive owner | الأفضل Google Workspace خاص بـSpark، لا حساب فردي |
| Scheduler | هل النسخ مطلوب عندما التطبيق مغلق؟ إذا نعم، نفعّل Windows Task Scheduler |
| Encryption | يوصى بتشفير archive قبل الرفع إن كانت النسخ قد تضم إيصالات حساسة |
| Restore policy | restore محلي فقط في MVP؛ لا restore تلقائي من Drive |
| Backup retention | 30 نسخة محلية حسب PRD؛ cloud retention يحتاج رقمًا صريحًا، المقترح 90 يومًا |

## 9. Definition of Done

لا يُعلن MVP مكتملًا إلا إذا تمكنت صفاء من إدارة عملائها، خدماتها، مدفوعاتها، باقاتها، حجوزات الاستوديو، ومصروفاتها دون Spreadsheet خارجي، مع نجاح كل سيناريوهات القبول والـbackup/restore.
