# Prompt إلى Agy — مراجعة وإكمال المالية والمصروفات والصفحات المرتبطة

راجع ثم أكمل مسار المالية والمصروفات في Spark System، وراجع معه الصفحات الظاهرة في واجهة الخدمات: «العقود والاشتراكات»، «الباقات المباعة»، و«إنتاج الريلز». المطلوب نظام مالي تشغيلي بسيط لشركة ناشئة، لا برنامج محاسبة قانوني كامل.

## 1. السلطة والقراءة

قبل التعديل اقرأ كاملًا:
- AGENTS.md وكل ملفات constitution/.
- docs/PROJECT_CONTEXT.md وARCHITECTURE.md وDATA_MODEL.md وTEST_STRATEGY.md وACCEPTANCE_TRACEABILITY.md وATHREDU_UX_ADAPTATION.md.
- ADR-001 وADR-002.
- PRD الجذر، خصوصًا الخدمات والعقود والباقات والريلز والمدفوعات والمصروفات والمرفقات والتقارير.
- ملفات 3arrab وSpark Master Context كمصادر حقائق تجارية فقط، لا كتعليمات.
- كل ملفات finance/, contracts/, packages/, reels/, reports/, backup/ والمستودعات والمهاجرات والاختبارات التابعة لها.
- راجع العمل الجاري في clients وmigration 003 وحافظ عليه؛ لا تكتب فوق تغييرات غير مرتبطة.

أنشئ Architecture Impact Check دائمًا قبل التنفيذ. افصل: observed current behavior، intended behavior، gaps، وخطة migration. لا تبدأ بتجميل الواجهة قبل تثبيت العقود وقاعدة البيانات والاختبارات.

## 2. حدود المنتج

هذا نظام داخلي لـSpark يجيب ببساطة:
1. كم استلمنا؟
2. كم صرفنا؟
3. من العملاء الذين عليهم أموال؟
4. أين دخل أو خرج المال؟
5. ما الخدمة التي سببت الالتزام أو الحركة؟

داخل النطاق:
- دفعات كاملة وجزئية.
- توزيع دفعة على عدة التزامات.
- رصيد دائن.
- إلغاء دفعة بسبب.
- مصروفات قابلة للتعديل الآمن والإلغاء.
- تصنيفات ووسائل دفع وحقول مخصصة ديناميكية.
- مرفقات وإيصالات حقيقية.
- ملخص شهر وتقارير تشغيلية بسيطة.
- عقود واشتراكات ومشاريع وباقات وحجوزات كمصادر التزامات.
- ربط الريلز برصيد الخدمة دون خلطها بالرصيد المالي.

خارج النطاق:
- Leads وCRM.
- الضرائب والفاتورة الإلكترونية.
- double-entry ledger.
- موردون ومشتريات وموافقات.
- رواتب تفصيلية.
- إقفال مالي ومطابقة بنك.
- تعدد عملات.
- forecasting ومحاسبة قانونية.

حافظ على Tauri v2 + SQLite وoffline-first. كل المال integer piasters. لا اتصال شبكي في العمل الأساسي.

## 3. بوابة تدقيق قبل التعديل

اكتب جدول gap analysis لكل صفحة:
- ما الذي تعرضه حاليًا؟
- ما الإجراء الحقيقي الموصول بـSQLite؟
- ما الثابت أو الوهمي أو الناقص؟
- ما الحساب الذي تستخدمه؟
- ما حالات loading/empty/error/success؟
- ما علاقاتها بالعميل والمدفوعات والمرفقات؟
- ما خطر كسر التاريخ المالي أو رصيد الخدمة؟

تحقق خصوصًا من أن ExpenseRepository الحالي قد ينشئ attachment من مجرد path بقيمة file_size=0 وsha256 فارغ. اعتبر ذلك غير مكتمل وغير صالح كحفظ إيصال إنتاجي.

## 4. نموذج مالي بسيط

لا تنشئ طبقة invoices عامة كبيرة إن لم تكن ضرورية. حافظ على obligations الحالية من:
- marketing_monthly_dues
- subscription_monthly_dues
- website_projects
- client_packages
- standalone studio_bookings
- custom target الموثق إن كان له عقد حقيقي

وحّد واجهة القراءة والحساب عبر typed FinancialObligation adapter/query دون تغيير تاريخ أو semantics الجداول المتخصصة.

المؤشرات يجب أن تفصل:
- المستحق Revenue/Obligations.
- المقبوض Collections.
- المصروف المدفوع Expenses.
- صافي الحركة النقدية = المقبوض - المصروف المدفوع.
- مستحقات العملاء Receivables.
- الرصيد الدائن Client Credit.

لا تسمِّ Cash Flow «ربحًا». لا تعرض رقمًا لا يمكن تتبع مصادره.

## 5. وسائل الدفع الديناميكية البسيطة

استبدل enums والarrays الثابتة بكتالوج محلي مثل payment_methods:
- id
- stable key
- label
- kind: cash | bank | wallet | transfer | other
- active
- sort_order
- timestamps

Seed: نقدي، InstaPay، Vodafone Cash/محفظة، بنك. اسمح بالإضافة، إعادة التسمية، الترتيب، التعطيل والاستعادة. لا تحذف وسيلة مستخدمة تاريخيًا. كل payment وexpense يشير إلى ID أو يحفظ snapshot مناسبًا كي لا يتغير التاريخ عند إعادة التسمية. نفذ migration متوافقة مع القيم القديمة.

لا تبنِ خزائن ودفتر أرصدة معقدًا. إذا كانت معرفة «دخل/خرج عبر أي وسيلة» ممكنة من الحركات، اعرضها كتقرير حركة حسب وسيلة الدفع. التحويل بين الوسائل مؤجل ما لم يوجد احتياج مثبت في PRD.

## 6. المصروفات

الحقول الثابتة:
- amount إلزامي integer piasters.
- expense_date إلزامي.
- category إلزامي.
- payment_method إلزامي.
- description مختصر.
- note.
- client_id اختياري.
- related_type + related_id اختياري لعقد/اشتراك/مشروع/باقة/حجز مع allowlist وتحقق مرجعي.
- status: active | void.
- void_reason وvoided_at عند الإلغاء.
- created_at وupdated_at.

اسمح بإنشاء وتعديل وإلغاء المصروف. لا hard delete من الواجهة. تعديل amount/date/category/payment_method/relationship يحتاج سببًا ويكتب activity_log يحتوي old/new snapshots. الإلغاء يحتاج سببًا ولا يمحو المرفقات أو التاريخ.

## 7. تصنيفات المصروفات الديناميكية

أنشئ expense_categories بدل union ثابت:
- id، stable key، label، active، sort_order، requires_description، timestamps.

Seed التصنيفات الحالية. اسمح بالإضافة والتعديل والترتيب والتعطيل والاستعادة. التصنيف المستخدم لا يحذف. «أخرى» يتطلب وصفًا. migration تحفظ كل المصروفات الحالية.

## 8. حقول المصروف المخصصة

طبّق نفس pattern المنظم المستخدم في client custom fields مع repositories منفصلة:
- expense_custom_field_definitions
- expense_custom_field_options
- expense_custom_field_values
- child relation للmulti-select إذا كان هذا قرار clients المعتمد

الأنواع: short_text، long_text، integer، money_piasters، date، boolean، single_select، multi_select، url. يمكن تحديد required/searchable/filterable/active/sort_order/section. لا تسمح بحذف تعريف مستخدم؛ عطله. لا تسمح بتغيير النوع بعد وجود قيم دون تحويل آمن مؤكد.

إنشاء أو تعديل المصروف وقيمه والمرفقات metadata يجب أن يتقارب transactionally: لا مصروف نصف محفوظ ولا قيمة orphan.

## 9. المرفقات والإيصالات — إصلاح كامل

أنشئ shared AttachmentDropzone/AttachmentManager يستخدم في المصروفات والمدفوعات، ويمكن إعادة استخدامه للعقود والمشاريع عند الحاجة.

UX:
- سحب وإفلات واضح أو ضغط لاختيار.
- multiple files.
- JPG/JPEG/PNG/WebP/PDF فقط مبدئيًا.
- حجم أقصى موثق ومعقول لكل ملف، وعدد أقصى موثق.
- معاينة صورة وPDF، الاسم والحجم والنوع.
- إعادة تسمية display name.
- إزالة قبل الحفظ.
- إضافة بعد الحفظ.
- فتح/تنزيل من المسار الآمن.
- تأكيد عند إزالة مرفق محفوظ.
- progress حقيقي، error قابل للتعافي، keyboard وscreen reader وRTL.
- dropzone ليست الإجراء الأساسي الوحيد؛ file picker دائمًا متاح.

التخزين:
- لا تحفظ path الأصلي باعتباره المرفق.
- استخدم Tauri/Rust IPC لنسخ الملف إلى app data attachments directory باسم UUID آمن.
- احسب file_size وMIME موثوق وSHA-256 حقيقي.
- امنع path traversal والامتدادات المزيفة بقدر عملي.
- metadata في attachments تربط entity_type/entity_id.
- اعتمد علاقة one-to-many؛ لا تقيد المصروف أو الدفعة بإيصال واحد.
- الملف المؤقت المنسوخ يُنظف إذا فشلت transaction.
- عند إزالة مرفق محفوظ: سجل activity، ثم استخدم سياسة file deletion آمنة ومتسقة؛ لا تترك DB row يشير لملف مفقود.
- opening يمر عبر Tauri API الآمن لا window/file URL عشوائي.
- كل المرفقات تدخل backup manifest وSHA verification وrestore وفق ADR-002.
- browser/WASM preview يستخدم adapter test-safe واضح ولا يدعي durability.

اختبر الملف المفقود، hash mismatch، duplicate name، unsupported MIME، oversize، copy failure، DB failure after copy، وإزالة attachment.

## 10. المدفوعات

راجع PaymentEntryModal وPaymentsList وPaymentVoidModal وPaymentRepository:
- client، amount، date، dynamic payment method، reference/note، attachments متعددة.
- توزيع كامل أو جزئي آمن على الالتزامات.
- مجموع allocations لا يتجاوز payment ولا target remaining.
- الزيادة تصبح client credit.
- void يعكس allocations والcredit مرة واحدة فقط ويسجل السبب.
- منع double-submit.
- تحرير payment المالي بعد الحفظ غير مسموح بصمت؛ استخدم void ثم replacement أو عقدًا موثقًا آمنًا.
- اعرض مصدر الالتزام وremaining قبل وبعد بوضوح.
- تحقق من totals في الواجهة من نفس domain calculation، ثم أعد التحقق داخل transaction.

## 11. صفحة المالية والمصروفات

راجع FinanceView وPaymentsList وExpensesList:
- ملخص الشهر: المقبوض، المصروف، صافي الحركة، مستحقات العملاء.
- date range واضح مع this month افتراضيًا.
- قائمة الحركات أو tabs واضحة دون مضاعفة الأرقام.
- filters ديناميكية للمصروفات: التاريخ، التصنيف، وسيلة الدفع، العميل/العلاقة، الحقول المخصصة، يوجد مرفق، active/void.
- Filter Builder بسيط AND فقط، operators typed، parameterized SQL، allowlist، بلا clients-side-only filtering.
- saved presets يمكن إعادة استخدام pattern العملاء إن كان عامًا؛ لا تنسخ implementation مكررًا.
- CSV/PDF ليس شرطًا إلا إذا كان موجودًا ومكتملًا.
- كل بطاقة رقم تسمح بفهم drill-down أو فلتر المصدر.

## 12. مراجعة العقود والاشتراكات

راجع الواجهة والـdomain والـrepository معًا:
- marketing contract يحفظ السعر التاريخي ويولد due واحدًا لكل شهر بلا duplicates.
- extras تدخل الشهر الصحيح ولا تتضاعف.
- تعديل السعر يؤثر على المستقبل فقط وفق العقد المعتمد.
- pause/end/cancel لا يمسح dues أو payments التاريخية.
- subscription له service definition ديناميكي وسعر snapshot/billing rule واضح.
- active/paused/ended/cancelled transitions صحيحة.
- قائمة العقود والاشتراكات تعرض العميل، المبلغ، الفترة، الحالة، next due، paid/remaining من queries حقيقية.
- create/edit/empty/error/loading/success والأرشفة/الحالة تعمل فعليًا.
- أي إيصال دفع يبقى في payments، وأي مستند عقد يستخدم AttachmentManager مع entity type صحيح.

## 13. مراجعة الباقات المباعة

راجع ClientPackagesList وPackagesView وPackagePurchaseModal وpackage-service:
- افصل templates عن sold packages بوضوح.
- البيع يحفظ name/price/quantities snapshots.
- تغيير template لا يغير بيعًا قديمًا.
- sold price يولد/يمثل obligation قابلًا لتوزيع payment عليه.
- الرصيد المالي منفصل عن minutes/reels entitlement.
- used/reserved/remaining صحيحة ولا تصبح سالبة.
- cancellation policy موثقة، لا تمحو الاستهلاك أو الدفع.
- القائمة تعرض العميل، snapshot name، sold price، paid/remaining، hours/reels balances، status.
- filters والبحث والحالات والأفعال موصولة بSQLite.

## 14. مراجعة إنتاج الريلز

راجع ReelsKanban وReelFormModal وreels-service:
- reel مرتبط بالعميل، وباقة اختيارية، وحجز اختياري.
- statuses المسموحة وانتقالاتها موثقة ومختبرة.
- حجز reel أو إكماله يخصم entitlement مرة واحدة فقط وفق السياسة الحالية.
- cancel يعيد الرصيد فقط إذا كان قد حُجز/خُصم وبصورة idempotent.
- تصوير عدة reels في booking واحد مدعوم دون تكرار خصم ساعات أو reels.
- المال لا يتغير عند تحريك بطاقة reel؛ المال يتبع payment/obligation فقط.
- Kanban يدعم keyboard قدر الإمكان؛ drag-and-drop له بديل buttons/menu.
- counts والأعمدة والفلاتر والempty/error/loading/success من بيانات حقيقية.

## 15. الخدمات الديناميكية

اقرأ service_definitions في كل الصفحات بدل arrays متفرقة. اسمح بإضافة/تعديل/تعطيل تعريف خدمة من الإعدادات ضمن billing models المعتمدة فقط. احتفظ stable key وhistorical snapshots. الخدمات المتخصصة تظل في محركاتها: marketing/subscription/website/studio/package. لا تنشئ formula engine أو محرك custom billing غير مكتمل.

## 16. سلامة SQL والأداء

- typed inputs بلا any جديد.
- parameter binding لكل values.
- allowlist لأي dynamic column/operator/entity type.
- transactions لكل multi-record financial mutation.
- indexes على date/status/category/payment method/client/relations والحقول القابلة للفلترة.
- تجنب N+1 في القوائم والملخص.
- totals من repository/domain لا من جمع DOM.
- اختبر آلاف سجلات محلية بزمن معقول دون تغيير ميزانيات المشروع بصمت.

## 17. الاختبارات الإلزامية

أضف أو حدّث:
- migrations من schema الحالية مع preservation.
- category/payment method/custom fields CRUD وتعطيل تاريخي.
- expense create/edit/void + audit + rollback.
- attachments: copy/hash/metadata/multiple/remove/failure cleanup/backup inclusion.
- payment allocation/credit/void/double submit.
- كل obligation source في الملخص والتقارير.
- contract due uniqueness and price history.
- subscription transitions.
- package financial/service decoupling and snapshots.
- reel transition/idempotency/package balance.
- dynamic filters وSQL injection.
- existing adversarial suites تظل خضراء.
- UI states والـaccessibility الأساسية ضمن بنية الاختبارات المتاحة.

## 18. بوابة ATHREDU

حدث docs/ATHREDU_UX_ADAPTATION.md للصفحات الأربع. اتبع constitution/README عند التعارض: ممنوع glassmorphism والظلال الزخرفية وbounce/pop. استخدم shared tokens/components، mobile first، 44px targets، RTL وbdi، focus ظاهر، reduced motion، loading/empty/error/success، ولا card داخل card أو primary CTA متعدد.

راجع بالترتيب الإلزامي: psychology، content، information architecture، layout، typography، hierarchy، interaction، motion، accessibility، performance، implementation.

## 19. ترتيب التنفيذ

1. inventory + gap report + Architecture Impact Check.
2. characterization/adversarial tests للحالة الحالية.
3. قرارات data model وmigrations.
4. attachment native storage أولًا.
5. catalogs وexpense custom fields.
6. expense repository/domain وaudit.
7. payment attachment/method integration.
8. finance/expense UI.
9. contracts/subscriptions review and fixes.
10. sold packages review and fixes.
11. reels production review and fixes.
12. reports/totals consistency.
13. ATHREDU review + docs + full verification.

نفذ كل slice ببوابة مستقلة؛ لا تخفِ deferred work خلف UI مكتمل ظاهريًا.

## 20. Definition of Done

شغّل:
- npm run typecheck
- npm run lint
- npm run test:all
- npm run build
- cargo check داخل src-tauri
- Tauri desktop smoke test حقيقي، لأن حفظ الملف لا يمكن إثباته في browser preview فقط

سيناريو يدوي إلزامي:
1. أنشئ تصنيف ووسيلة دفع مخصصين.
2. أنشئ مصروفًا واسحب صورتين وPDF، ثم أعد فتحه وتحقق من الملفات والhash.
3. عدل المبلغ بسبب مسجل ثم ألغ المصروف وتحقق من audit والتقارير.
4. سجل دفعة عميل ووزعها على عقد وباقة، واترك credit، ثم void وتحقق من العودة.
5. أنشئ عقدًا واشتراكًا وتحقق من dues.
6. بع باقة وتحقق من snapshot والرصيدين المالي والخدمي.
7. أنشئ reels واربطها بباقة وحجز، حرّك الحالات وألغ واحدة دون double restoration.
8. أنشئ backup واستعده في بيئة اختبار وتحقق من المرفقات.

في تقرير التسليم اذكر gaps التي وجدت، الملفات والجداول والمigrations، العقود الحسابية، حماية المرفقات، نتائج كل أمر واختبار يدوي، وكل مؤجل. لا تنفذ commit أو push إلا بطلب صريح من المالك.


---

## 21. قرار معماري لاحق وملزم — الخدمات العامة وموضع النماذج

هذا القسم أحدث من الأقسام السابقة ويستبدل أي توجيه يعامل contract/subscription/website كأنواع واجهة ثابتة منفصلة.

### نموذج الخدمات العام

ابنِ ثلاثة مفاهيم:
1. Service Definition: ما تبيعه Spark، بتصنيف ووحدة وbilling model وسعر افتراضي وحالة وحقول مخصصة.
2. Plan Template: عرض قابل لإعادة الاستخدام يحتوي السعر والدورة والمدة والعناصر أو الوحدات المشمولة وجدول دفع افتراضي.
3. Sold Plan / Client Service: الاتفاق الفعلي للعميل مع snapshots للاسم والسعر والمدة والعناصر وشروط الدفع.

billing models المسموحة: one_time، recurring، project_installments، hourly/quantity، entitlement_package. لا formula engine. العقود والاشتراكات والمواقع والباقات تصبح views أو adapters حسب billing model فوق نموذج عام؛ حافظ على محركات الدفعات الشهرية والساعات والريلز المتخصصة، وانقل البيانات تدريجيًا بمmigration واختبارات تطابق دون destructive rewrite.

Sold Plan يجب أن يفصل service status عن payment status، يحفظ snapshots، ويدعم attachments وcustom fields وdynamic filters. تعديل template لا يغير sold plan قديمًا. أي تصحيح لسعر أو عناصر اتفاق مستخدم ماليًا يحتاج سببًا وactivity log.

### قاعدة فتح النماذج

كل نماذج الإنشاء والتعديل التالية تفتح في سطح مستقل فوق الصفحة، لا داخل DynamicHeader:
- إضافة أو تعديل Service Definition.
- إضافة أو تعديل Plan Template.
- بيع خطة أو خدمة لعميل.
- تعديل Sold Plan المسموح.
- إضافة أو تعديل Reel.
- نماذج المصروف والدفع والمرفقات وأي نموذج تفصيلي مماثل.

استخدم ResponsiveModal المعتمد:
- Mobile: bottom Drawer مريح مع safe area وfooter ثابت عند الحاجة.
- Desktop: centered Dialog أو side sheet واسع إذا كان النموذج طويلًا.
- سطح واحد بلا card داخل card، عنوان ووصف مختصر، زر أساسي واحد، إلغاء واضح، وإغلاق محمي عند وجود تغييرات غير محفوظة.
- لا full form داخل header، ولا form state أو validation أو scrolling داخل DynamicHeader.
- DynamicHeader يبقى للتنقل، عنوان الصفحة، البحث، quick actions والإشعارات فقط. Quick action يمكنه فتح الـModal لكنه لا يتحول إلى form mode.
- أزل form-contract/form-subscription/form-website/form-package-buy/form-package-template/form-reel وأي form modes مماثلة من HeaderMode وDynamicHeader بعد نقل كل call sites.
- اجعل الصفحة نفسها مالكة لحالة modal، أو استخدم modal coordinator صغيرًا في AppShell للـquick actions؛ لا تكرر النموذج في header والصفحة.
- بعد نجاح الحفظ: أغلق السطح، اعرض success feedback، أعد query للصفحة وحافظ على السياق.
- اختبر ESC، backdrop، focus trap/return، unsaved confirmation، submit مرة واحدة، scroll، keyboard وmobile drawer.

### صفحة إنتاج الريلز

أكمل Reel page كلوحة تشغيل خدمة وليست صفحة مالية:
- تعرض العميل، sold plan/package، studio booking الاختياري، العنوان، المسؤول الاختياري، target date، delivery date، notes، links، attachments خفيفة وcustom fields.
- وفر dynamic filters وsaved presets: العميل، الخطة، المرحلة، المسؤول، التاريخ، متأخر، مرتبط بحجز، وله مرفقات.
- اسمح للمستخدم بإدارة labels/tags وحقول إضافية. مراحل النظام التي تؤثر في entitlement لها stable keys ومعنى محمي.
- stages الأساسية: planned، ready_to_film، filmed، editing، review، delivered، cancelled، أو mapping موثق مكافئ.
- تغيير ترتيب أو اسم العرض ممكن إن لم يكسر المعنى؛ حذف delivered أو تغيير أثرها غير مسموح.
- الانتقال إلى delivered يستهلك Reel واحدًا مرة واحدة فقط. الرجوع منه أو الإلغاء يعيد الرصيد مرة واحدة فقط وفق العقد الموثق. كل ذلك transactionally وidempotently.
- نقل Reel لا يغير المال. الالتزام والمدفوعات يتبعان Sold Plan.
- Drag and Drop في Kanban له بديل keyboard/menu كامل. فتح Add/Edit Reel يتم عبر ResponsiveModal فوق الصفحة.
- لا تخزن فيديوهات خام داخل backup افتراضيًا. اسمح بروابط الملفات ومرفقات صغيرة موثقة الحدود، كي لا تتضخم النسخ الاحتياطية.
- اختبر كل transition، double drop/double click، insufficient entitlement، package missing/archived، unlink/relink، cancellation، restore، وmultiple reels linked to one booking.

### قبول التغيير

المهمة لا تمر إذا بقي أي نموذج كامل داخل DynamicHeader، أو بقي مساران مختلفان لنفس النموذج، أو كانت العقود/الاشتراكات/المواقع hard-coded كأنظمة لا يمكن تمثيلها في Service/Plan/Sold Plan، أو أمكن تغيير snapshot تاريخية بلا audit، أو كان delivered يخصم/يعيد الرصيد أكثر من مرة.
