# Prompt جاهز لوكيل التطوير

أنت وكيل التطوير المسؤول عن بناء تطبيق **Spark Finance & Studio Manager** كتطبيق سطح مكتب محلي على Windows.

اقرأ أولًا وبالكامل، بهذا الترتيب:

1. `D:\Project\Spark Internal\Spark Finance & Studio Manager — Full Product Requirements Document v1.0.md`
2. `D:\Project\Spark Internal\AGENT_IMPLEMENTATION_PLAN_AR.md`
3. `D:\Project\Template\architecture-os\architecture-os.md`
4. `D:\Project\Template\architecture-os\AGENTS.md`
5. `D:\Project\Template\architecture-os\workflows\new-project.md`

الـPRD هو مصدر الحقيقة الوظيفي. لا تنسخ ATHREDU كمشروع أو كبنية بيانات؛ استخدمه فقط كمرجع انتقائي للمكونات، الـdesign tokens، accessibility، responsive states، وحالات التحميل والخطأ والفراغ.

## المهمة

أنشئ مشروعًا جديدًا داخل:

`D:\Project\Spark Internal\spark-finance-studio-manager`

واعمل وفق المراحل المذكورة في `AGENT_IMPLEMENTATION_PLAN_AR.md`.

## قواعد ملزمة

- استخدم Tauri v2 + React + TypeScript + Tailwind + SQLite.
- التطبيق local-first وoffline-first؛ لا تضف backend أو Supabase أو cloud sync.
- SQLite هي مصدر الحقيقة. لا تستخدم LocalStorage للبيانات المالية.
- خزّن المال كـinteger piasters والساعات كـinteger minutes.
- لا تخلط money balance مع service balance.
- لا تخصم Reel مقابل hour تلقائيًا أو العكس.
- لا hard-coded prices ولا تعديل تاريخي لأسعار أو باقات مباعة.
- استخدم transactions للحجز المكتمل، الإلغاء، التخصيصات، وأي عملية تعدّل أكثر من سجل.
- امنع تداخل حجوزات الاستوديو بشكل blocking.
- Arabic RTL أولًا، مع معالجة صحيحة للمبالغ والأرقام والوقت.
- لا تحذف السجلات المالية؛ استخدم void/inactive/cancelled وسجل Activity Log.
- Google Drive backup اختياري ولا يعطل التشغيل المحلي؛ لا تحفظ OAuth tokens في source أو SQLite.
- لا تقرأ أو تطبع أو تضع أي secrets في الملفات أو المخرجات.

## طريقة العمل

1. ابدأ بـPhase 0 فقط: أنشئ وثائق Architecture OS المحددة في الخطة وسجل assumptions/unknowns/ADRs.
2. لا تبدأ كود المنتج حتى تعرض ملخص القرارات المفتوحة وتطلب موافقة على Phase 0، خصوصًا مالك حساب Google Drive، هل يلزم backup والتطبيق مغلق، وسياسة retention والتشفير.
3. بعد الموافقة، نفذ المراحل بالترتيب. لا تتخط مرحلة بناء بيانات أو منطق لمجرد بناء شاشة جميلة.
4. بعد كل Phase: شغّل الاختبارات والفحص المناسب، ثم اكتب ما تم وما لم يتم والمخاطر المتبقية.
5. لا تنفذ deploy أو تربط Google Drive فعليًا أو تنشئ scheduled task أو تطلب OAuth credentials بدون موافقة منفصلة.

## معايير التسليم

- كل سيناريوهات القبول في الـPRD تعمل.
- backup local وrestore تم اختباره فعليًا.
- Google Drive، عند الموافقة لاحقًا، يرفع archive مكتملًا ومتحققًا منه فقط، ولا يمنع التطبيق عند فشل الإنترنت.
- الواجهة عملية وسريعة بالعربية، وليست إعادة تصميم ATHREDU أو واجهة dashboard عامة مزدحمة.
- شغّل على الأقل lint وtypecheck وbuild والاختبارات المتاحة قبل كل تسليم.

ابدأ الآن بقراءة المصادر وإنشاء وثائق Phase 0 فقط، ثم قدّم ملخصًا موجزًا للقرارات المطلوبة من المالك قبل أي تنفيذ للكود.
