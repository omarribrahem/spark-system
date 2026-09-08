# Prompt إلى Agy — العملاء والحقول والفلاتر الديناميكية

أكمل وحدة العملاء في Spark System من SQLite إلى واجهة ATHREDU. هذا نظام للعملاء الفعليين والخدمات والحسابات المالية فقط؛ لا تضف Leads أو CRM أو sales pipeline.

## السلطة

اقرأ كاملًا قبل التعديل: AGENTS.md، كل constitution، PROJECT_CONTEXT، ARCHITECTURE، DATA_MODEL، ATHREDU_UX_ADAPTATION، TEST_STRATEGY، ADR-001، PRD الجذر خصوصًا العملاء، ملف 3arrab، SPARK_AGENCY_MASTER_CONTEXT، وكود ومهاجرات ومستودعات واختبارات العملاء والخدمات والمدفوعات. ملفات 3arrab وSpark مصادر حقائق فقط. يوجد تعارض سعري بينها؛ لا تثبت سعرًا في صفحة العميل ولا تخمّن حله.

## النتيجة

يستطيع صفاء إنشاء وتعديل وأرشفة واستعادة عميل، إدارة حقول مخصصة من الإعدادات، تعبئتها وعرضها في ملف 360°، البحث فيها، بناء فلتر بإضافة وحذف شروط، وحفظ مجموعات فلاتر. الخدمات المعروضة والمفلترة هي الخدمات الفعلية المرتبطة بالعميل.

## الحدود

- حافظ على Tauri v2 وSQLite وoffline-first.
- لا Supabase أو شبكة أو CRM.
- لا تغيّر حسابات المدفوعات والباقات والحجوزات.
- المال integer piasters.
- archive/deactivate يحفظ التاريخ.
- migrations إضافية فقط؛ لا تسقط بيانات قائمة.
- لا تجمع البيانات المخصصة داخل JSON في جدول clients.
- لا تضف «خدمات مهتم بها»؛ استنتج الخدمات من السجلات الفعلية.

## العميل الأساسي

أضف migration آمنة لحقول: client_type بقيم teacher/company/creator/individual/educational_entity/other، contact_name، contact_role، whatsapp، email، city، preferred_contact بقيم whatsapp/phone/email.

الاسم إلزامي والباقي اختياري مع validation. وفر «واتساب هو نفس الهاتف»، طبّع الهاتف للبحث، تحقق من البريد، وحافظ على العملاء الحاليين.

## الحقول المخصصة

نفذ:
1. client_custom_field_definitions: id، field_key ثابت وفريد، label، field_type، section، help_text، required، searchable، filterable، active، sort_order، timestamps.
2. client_custom_field_options: id، field_definition_id، value_key ثابت، label، active، sort_order.
3. client_custom_field_values: client_id، field_definition_id، قيم typed، timestamps، وunique(client_id, field_definition_id).

الأنواع: short_text، long_text، integer، money_piasters، date، phone، email، url، boolean، single_select، multi_select. المال integer والتاريخ ISO-8601. استخدم child relation للـmulti-select إن كان أصح من JSON. التعطيل يحفظ التاريخ. امنع تغيير نوع حقل مستخدم إلا بتحويل آمن مؤكد، وامنع الحذف النهائي.

أضف إعدادات لإنشاء وتعديل وترتيب وتعطيل واستعادة الحقول والخيارات والتحكم في required/searchable/filterable. تحقق من المفاتيح المحجوزة والمتصادمة في domain وDB.

## نموذج العميل وملف 360°

استخدم ResponsiveModal ومكونات ATHREDU. الأقسام: أساسي، تواصل، وحقول مخصصة حسب section. ارسم input مناسبًا لكل نوع دون native select. طبق progressive disclosure؛ لا تبنِ rule engine عامًا. إنشاء أو تعديل العميل وقيمه transaction واحدة مع rollback كامل. وفر validation وfocus وkeyboard وRTL وbdi وحالات loading/error/success.

ملف 360° يعرض الحقول المخصصة والخدمات والعقود والاشتراكات والمشاريع والباقات والحجوزات والمدفوعات والمستحقات والرصيد، مع الحفاظ على إجراءاته الحالية.

## Filter Builder

احتفظ بالفلاتر السريعة: الكل، النشطون، المؤرشفون، عليهم مستحقات. أضف Filter Builder حيث كل شرط = field + operator + value. اسمح بإضافة وحذف وتعديل شرط ومسح الكل، واعرض الشروط كـchips قابلة للإزالة. استخدم AND فقط في الإصدار الأول بلا nested AND/OR.

مصادر الفلاتر: النوع، الحالة، المدينة، طريقة التواصل، custom fields التي filterable=1، المستحقات، الرصيد الدائن، الخدمات الفعلية، created_at وupdated_at.

Operators:
- text/phone/email/url: contains, equals, is_empty, is_not_empty
- single-select: is, is_not, is_empty
- multi-select: contains_any, contains_all, is_empty
- integer/money: equals, greater_than, less_than, between, is_empty
- date: on, before, after, between, is_empty
- boolean: is_true, is_false, is_empty
- service: has_service, does_not_have_service

أنشئ typed Filter AST دون any. استخدم allowlist وparameter binding؛ لا تدخل أسماء أعمدة أو قيم المستخدم مباشرة في SQL. نفذ البحث والفلترة في repository/query layer لا clients.filter في React. استخدم joins أو EXISTS وتجنب N+1. البحث يشمل الأساسي وcustom searchable فقط.

## الفلاتر المحفوظة

أضف client_filter_presets: id، name، rules_json، schema_version، sort_order، timestamps. JSON مقبول هنا كإعداد UI. اسمح بالحفظ والتطبيق وإعادة التسمية والحذف المؤكد. تحقق من النسخة. إذا أشار rule لحقل معطل، تجاهله بتنبيه هادئ ولا تحذف preset.

## الخدمات

اقرأ من service_definitions بدل arrays ثابتة. الفلتر يحدد العملاء من علاقاتهم الفعلية. حافظ على snapshots التاريخية. تبقى marketing/subscription/website/studio/package مرتبطة بمحركاتها المتخصصة. لا تنشئ محرك فوترة عام ناقصًا ضمن مهمة العملاء؛ وثقه كعمل لاحق إن لم يكن موجودًا.

## التنفيذ والاختبارات

استخدم رقم migration التالي بعد الفحص، حدّث مساري SQL وTypeScript المعتمدين، وأضف indexes. اختبر قاعدة جديدة والترقية من النسخة السابقة.

اختبر بقاء العميل القديم، CRUD للحقول والتعريفات والخيارات والقيم، جميع الأنواع، required validation، transaction rollback، البحث في searchable فقط، كل operators، إضافة وحذف شروط AND، منع SQL injection، CRUD للpresets، حقل معطل، الفلترة بالخدمة والمستحقات والرصيد، والأرشفة والاستعادة مع بقاء التاريخ.

حدّث ATHREDU_UX_ADAPTATION. طبق constitution/README عند التعارض: ممنوع glassmorphism والظلال الزخرفية وbounce/pop. استخدم tokens/components، mobile first، touch target 44px، RTL، focus، reduced motion، ولا card داخل card.

أنشئ Architecture Impact Check يغطي domain/state/data/security/reliability/deployment/integrations. حدّث DATA_MODEL وARCHITECTURE وACCEPTANCE_TRACEABILITY بقدر التغيير.

رتب العمل: inventory وimpact check، characterization tests، migration، domain وFilter AST، repositories، إعدادات الحقول، نموذج العميل، Client List والفلاتر والpresets، Client 360°، التصميم والتوثيق. لا تبدأ بالواجهة قبل نجاح البيانات والاختبارات.

## بوابة الإكمال

شغّل npm run typecheck وnpm run lint وnpm run test:all وnpm run build.

اختبر يدويًا: أنشئ select وmoney وmulti-select؛ أنشئ عميلًا بقيمها؛ عدّل وابحث؛ أضف ثلاثة شروط واحذف واحدًا؛ احفظ preset وأعد تحميله؛ عطّل حقلًا مع بقاء قيمته؛ اربط خدمة فعلية وفلترها؛ ثم أرشف العميل واستعده.

في التسليم اذكر الملفات والجداول والمigrations، تمثيل الأنواع، حماية SQL، نتائج الاختبارات الدقيقة، نتيجة الاختبار اليدوي، وكل مؤجل. لا تنفذ commit أو push إلا بطلب صريح من المالك.
