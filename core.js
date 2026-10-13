/**
 * تطبيق الأمن الحيوي - كايرو ثري إيه
 * الجزء الأساسي: محرك قواعد العزل + كل العمليات.
 * لا يعتمد على خدمات جوجل، فيعمل كما هو على الخادم (Apps Script) وداخل التطبيق نفسه عند انقطاع الإنترنت.
 */

var BIO = {
  REPORT_TYPES: ['اشتباه مرض أو نفوق مفاجئ', 'دخول بالقوة أو بدون تصريح', 'عطل في التطهير أو نقص مطهر', 'أخرى'],
  R_NEW: 'جديد', R_READ: 'فتحه المدير', R_WORK: 'جارٍ التعامل', R_DONE: 'مغلق',
  IN: 'دخول', OUT: 'خروج', EXT: 'زيارة خارجية',
  ALLOW: 'مسموح', DENY: 'مرفوض', PENDING: 'بانتظار الموافقة', OVERRIDE: 'مسموح استثنائياً', CANCELLED: 'أُلغي الدخول',
  REJECTED: 'مرفوض نهائياً', APPROVED: 'تمت الموافقة',
  ST_ACTIVE: 'نشط', ST_ALERT: 'إنذار', ST_CLOSED: 'مغلق',
  YES: 'نعم', NO: 'لا',
  ROLE_GUARD: 'أمن بوابة', ROLE_MANAGER: 'مدير', ROLE_SECTOR: 'مدير قطاع', ROLE_SITE: 'مدير موقع', ROLE_VIEWER: 'متابعة فقط',
  OFFLINE_FLAG: 'مخالفة سُجّلت دون اتصال',
  HOUR: 3600000,
  MS_OK: 'مسجلة في الموعد', MS_LATE: 'متأخرة: تحتاج استثناء', MS_EXC: 'معتمدة استثنائياً', MS_REJ: 'مرفوضة', MS_DONE: 'تمت الزيارة',
  MISSION_KINDS: ['مأمورية عمل', 'زيارة', 'صيانة', 'توريد', 'زيارة جهة رسمية', 'تدريب'],
  VISITOR_KINDS: ['زائر', 'مورد']
};

/* ============================ الأدوار والصلاحيات ============================ */
var BIO_PERMS = [
  { k: 'decide', label: 'الموافقة على طلبات الدخول الاستثنائي', short: 'قرار الاستثناء' },
  { k: 'reports', label: 'استلام البلاغات العاجلة ومحادثة البوابات', short: 'البلاغات والرسائل' },
  { k: 'notices', label: 'إصدار القرارات والتعليمات للبوابات', short: 'إصدار القرارات' },
  { k: 'sites', label: 'رفع الإنذار أو إغلاق موقع', short: 'إنذار وإغلاق المواقع' },
  { k: 'data', label: 'إضافة وتعديل الأفراد والمركبات والكروت', short: 'الأفراد والكروت' },
  { k: 'analytics', label: 'الخريطة الحية وتتبع العدوى والتخطيط والتحليل', short: 'التحليل والتتبع' },
  { k: 'admin', label: 'المستخدمون والمواقع وقواعد العزل والإعدادات', short: 'إدارة النظام' }
];
var BIO_ROLES = [
  { k: 'مدير', label: 'مدير الأمن الحيوي', desc: 'كل الصلاحيات على كل القطاعات', scope: 'none', perms: ['decide', 'reports', 'notices', 'sites', 'data', 'analytics', 'admin'] },
  { k: 'مدير قطاع', label: 'مدير قطاع', desc: 'يدير قطاعاً كاملاً: طلباته وبلاغاته وبواباته', scope: 'sector', perms: ['decide', 'reports', 'notices', 'sites', 'data', 'analytics'] },
  { k: 'مدير موقع', label: 'مدير موقع', desc: 'مدير مزرعة أو معمل: تصله طلبات وبلاغات موقعه فقط', scope: 'site', perms: ['decide', 'reports'] },
  { k: 'أمن بوابة', label: 'أمن بوابة', desc: 'يسجل الدخول والخروج على بوابة واحدة', scope: 'gate', perms: [] },
  { k: 'متابعة فقط', label: 'متابعة فقط', desc: 'الإدارة العليا أو الطبيب البيطري: يرى ولا يعدّل', scope: 'optional', perms: ['analytics'] }
];
function BIO_role(k) { k = String(k || '').trim(); for (var i = 0; i < BIO_ROLES.length; i++) if (BIO_ROLES[i].k === k) return BIO_ROLES[i]; return null; }
/** الصلاحيات الفعلية للمستخدم: المكتوبة في عمود الصلاحيات، وإن كان فارغاً فصلاحيات دوره */
function BIO_userPerms(u) {
  var r = BIO_role(u.role);
  if (!r || r.k === BIO.ROLE_GUARD) return [];
  if (r.k === BIO.ROLE_MANAGER) return r.perms.slice();
  var own = BIO_list(u.perms).map(function (p) { for (var i = 0; i < BIO_PERMS.length; i++) if (BIO_PERMS[i].k === p || BIO_PERMS[i].short === p) return BIO_PERMS[i].k; return ''; }).filter(Boolean);
  return own.length ? own : r.perms.slice();
}

var TABLES = {
  sites: { sheet: 'المواقع', key: 'id', cols: { id: 'كود الموقع', name: 'اسم الموقع', sector: 'القطاع', level: 'المستوى', type: 'النوع', status: 'الحالة', external: 'خارج الشركة', lat: 'خط العرض', lng: 'خط الطول', geo: 'دقة الإحداثيات' } },
  checkpoints: { sheet: 'مناطق التطهير', key: 'id', cols: { id: 'كود المنطقة', name: 'اسم المنطقة', sector: 'القطاع', serves: 'المواقع التي تخدمها' } },
  rules: { sheet: 'قواعد العزل', key: 'id', cols: { id: 'كود القاعدة', from: 'من مستوى', to: 'إلى مستوى', hours: 'ساعات العزل', note: 'المرجع / ملاحظات' } },
  items: { sheet: 'الأفراد والمركبات', key: 'id', cols: { id: 'الكود', name: 'الاسم', kind: 'النوع', dept: 'الإدارة / الجهة', phone: 'الهاتف', active: 'نشط', card: 'إصدار الكارت', watch: 'مراقبة مشددة', company: 'كود الشركة', plate: 'رقم اللوحة', added: 'تاريخ الإضافة' } },
  users: { sheet: 'المستخدمون', key: 'id', cols: { id: 'كود المستخدم', pin: 'الرقم السري', name: 'الاسم', role: 'الصلاحية', gate: 'البوابة (كود منطقة تطهير أو موقع)', phone: 'الهاتف', scope: 'نطاق الإدارة (قطاعات أو مواقع)', perms: 'صلاحيات مخصصة', active: 'نشط' } },
  moves: { sheet: 'سجل الحركة', key: 'id', cols: { id: 'رقم الحركة', time: 'الوقت', itemId: 'الكود', itemName: 'الاسم', siteId: 'كود الموقع', siteName: 'الموقع', dir: 'الاتجاه', decision: 'القرار', reason: 'السبب', checks: 'إجراءات الأمن الحيوي', user: 'المسجِّل', checkpoint: 'نقطة التسجيل', offline: 'دون اتصال', flag: 'تنبيه', via: 'طريقة التعرف', updatedAt: 'آخر تحديث' } },
  approvals: { sheet: 'طلبات الاستثناء', key: 'id', cols: { id: 'رقم الطلب', time: 'وقت الطلب', moveId: 'رقم الحركة', itemId: 'الكود', itemName: 'الاسم', siteId: 'كود الموقع', siteName: 'الموقع', reason: 'سبب الرفض', note: 'ملاحظة الأمن', requestedBy: 'مقدم الطلب', requestedById: 'كود مقدم الطلب', status: 'الحالة', decidedBy: 'صاحب القرار', decidedAt: 'وقت القرار', updatedAt: 'آخر تحديث' } },
  notices: { sheet: 'القرارات والتعليمات', key: 'id', cols: { id: 'رقم القرار', time: 'الوقت', from: 'من', target: 'موجه إلى', level: 'الأهمية', title: 'العنوان', body: 'النص' } },
  acks: { sheet: 'الاطلاع على القرارات', key: 'id', cols: { id: 'الرقم', noticeId: 'رقم القرار', userId: 'كود المستخدم', userName: 'الاسم', time: 'وقت الاطلاع' } },
  devices: { sheet: 'أجهزة الإشعارات', key: 'token', cols: { token: 'رمز الجهاز', userId: 'كود المستخدم', userName: 'الاسم', role: 'الصلاحية', gate: 'البوابة', updated: 'آخر تحديث' } },
  contacts: { sheet: 'أرقام واتساب', key: 'id', cols: { id: 'الكود', name: 'الاسم', phone: 'رقم واتساب (دولي)', apikey: 'مفتاح CallMeBot', email: 'البريد الإلكتروني', alerts: 'التنبيهات', active: 'مفعل' } },
  reports: { sheet: 'البلاغات العاجلة', key: 'id', cols: { id: 'رقم البلاغ', time: 'الوقت', type: 'نوع البلاغ', siteId: 'كود الموقع', siteName: 'الموقع', gate: 'منطقة التطهير', fromId: 'كود المرسل', fromName: 'المرسل', note: 'التفاصيل', photo: 'الصورة', status: 'الحالة', readAt: 'وقت فتح المدير', ackAt: 'وقت الاستجابة', ackBy: 'استجاب', action: 'الإجراءات المتخذة', escLevel: 'مستوى التصعيد', escAt: 'وقت التصعيد', closedAt: 'وقت الإغلاق', updatedAt: 'آخر تحديث' } },
  messages: { sheet: 'الرسائل', key: 'id', cols: { id: 'رقم الرسالة', time: 'الوقت', gate: 'كود البوابة', gateName: 'البوابة', fromId: 'كود المرسل', fromName: 'المرسل', fromMgr: 'من المدير', text: 'الرسالة', readAt: 'وقت القراءة' } },
  cardlog: { sheet: 'سجل الكروت', key: 'id', cols: { id: 'الرقم', time: 'الوقت', itemId: 'الكود', itemName: 'الاسم', action: 'الإجراء', card: 'إصدار الكارت', by: 'بواسطة', note: 'ملاحظات' } },
  missions: { sheet: 'المأموريات والزيارات', key: 'id', cols: { id: 'رقم المأمورية', time: 'وقت التسجيل', kind: 'النوع', visitor: 'اسم الزائر / المأمور', itemId: 'الكود', company: 'الجهة', phone: 'الهاتف', siteId: 'كود الموقع', siteName: 'الموقع', visitAt: 'موعد الزيارة', endAt: 'نهاية الزيارة', purpose: 'الغرض', lastContact: 'آخر مخالطة دواجن', lastContactAt: 'تاريخ آخر مخالطة', vehicle: 'المركبة', requestedBy: 'مقدم الطلب', requestedById: 'كود مقدم الطلب', email: 'إيميل مقدم الطلب', leadHours: 'ساعات قبل الموعد', late: 'متأخرة', status: 'الحالة', decidedBy: 'القرار بواسطة', decidedAt: 'وقت القرار', note: 'ملاحظة القرار', arrivedAt: 'وقت الوصول' } },
  companies: { sheet: 'شركات النقل والمقاولون', key: 'id', cols: { id: 'كود الشركة', name: 'اسم الشركة', type: 'النشاط', contact: 'المسؤول', phone: 'الهاتف', email: 'البريد الإلكتروني', status: 'الحالة', reason: 'سبب الإيقاف', note: 'ملاحظات' } },
  disposal: { sheet: 'سجل النافق والسبلة', key: 'id', cols: { id: 'الرقم', time: 'الوقت', siteId: 'كود الموقع', siteName: 'الموقع', kind: 'النوع', count: 'العدد', weight: 'الوزن (كجم)', method: 'وسيلة التخلص', vehicleId: 'كود المركبة', vehicleName: 'المركبة', driverId: 'كود السائق', by: 'سجّله', note: 'ملاحظات' } },
  inspections: { sheet: 'زيارات التدقيق', key: 'id', cols: { id: 'رقم الزيارة', time: 'الوقت', siteId: 'كود الموقع', siteName: 'الموقع', auditor: 'المدقق', score: 'الدرجة', nc: 'عدد الملاحظات', answers: 'الإجابات', note: 'ملاحظات' } },
  actions: { sheet: 'الإجراءات التصحيحية', key: 'id', cols: { id: 'رقم الإجراء', time: 'الوقت', auditId: 'رقم زيارة التدقيق', siteId: 'كود الموقع', siteName: 'الموقع', finding: 'الملاحظة', action: 'الإجراء المطلوب', owner: 'المسؤول', due: 'الموعد', status: 'الحالة', closedAt: 'وقت الإغلاق', closeNote: 'ما تم', remindedAt: 'آخر تذكير' } },
  training: { sheet: 'سجل التدريب', key: 'id', cols: { id: 'الرقم', time: 'الوقت', itemId: 'الكود', itemName: 'الاسم', module: 'البرنامج', score: 'الدرجة', passed: 'اجتاز', via: 'الطريقة', cert: 'رقم الشهادة' } },
  changes: { sheet: 'سجل التعديلات', key: 'id', cols: { id: 'الرقم', time: 'الوقت', userId: 'كود المستخدم', userName: 'المستخدم', table: 'الجدول', key: 'السجل', action: 'العملية', before: 'قبل', after: 'بعد' } },
  birdobs: { sheet: 'مشاهدات الطيور', key: 'id', cols: { id: 'الرقم', time: 'الوقت', lat: 'خط العرض', lng: 'خط الطول', siteId: 'أقرب موقع', species: 'النوع', count: 'العدد', source: 'المصدر', note: 'ملاحظات', by: 'سجّلها' } },
  birdalerts: { sheet: 'تنبيهات الطيور المهاجرة', key: 'id', cols: { id: 'الرقم', time: 'الوقت', siteId: 'كود الموقع', siteName: 'الموقع', score: 'درجة الخطر', level: 'المستوى', note: 'التفاصيل' } },
  settings: { sheet: 'الإعدادات', key: 'key', cols: { key: 'الإعداد', value: 'القيمة', note: 'شرح' } }
};

// تعريف شاشات إدخال البيانات في التطبيق
var ADMIN = {
  items: { title: 'الأفراد والمركبات والمعدات', fields: [
    { k: 'id', req: 1, upper: 1, hint: 'كود فريد يطبع على الكارت. مثال: E120 أو V015' }, { k: 'name', req: 1 },
    { k: 'kind', type: 'select', opts: ['موظف', 'سائق', 'عامل', 'زائر', 'مورد', 'مركبة', 'معدة'] }, { k: 'dept' }, { k: 'phone' },
    { k: 'company', hint: 'كود شركة النقل أو المقاول (اختياري). مثال: CO01' }, { k: 'plate', hint: 'للمركبات: رقم اللوحة كما هو مكتوب، مثل «ن ق ص 1234»' },
    { k: 'active', type: 'yesno', def: 'نعم' }] },
  sites: { title: 'المواقع', fields: [
    { k: 'id', req: 1, upper: 1 }, { k: 'name', req: 1 }, { k: 'sector', req: 1 },
    { k: 'level', type: 'select', opts: ['1', '2', '3', '4'], req: 1, hint: '1 جدود/أمهات (أعلى حماية) · 2 تفريخ · 3 تسمين · 4 علف ومجازر وخارجي' },
    { k: 'type' }, { k: 'status', type: 'select', opts: ['نشط', 'إنذار', 'مغلق'], def: 'نشط' }, { k: 'external', type: 'yesno', def: 'لا' },
    { k: 'lat', type: 'number', hint: 'من خرائط جوجل: اضغط مطولاً على الموقع وانسخ الرقم الأول. مثال: 29.9051' }, { k: 'lng', type: 'number', hint: 'الرقم الثاني. مثال: 30.8012' }] },
  checkpoints: { title: 'مناطق التطهير (البوابات)', fields: [
    { k: 'id', req: 1, upper: 1 }, { k: 'name', req: 1 }, { k: 'sector', req: 1 }, { k: 'serves', type: 'sites', req: 1 }] },
  rules: { title: 'قواعد العزل', fields: [
    { k: 'from', type: 'select', opts: ['1', '2', '3', '4'], req: 1 }, { k: 'to', type: 'select', opts: ['1', '2', '3', '4'], req: 1 },
    { k: 'hours', type: 'number', req: 1 }, { k: 'note' }] },
  users: { title: 'المستخدمون', fields: [
    { k: 'id', req: 1, upper: 1 }, { k: 'name', req: 1 }, { k: 'pin', req: 1, hint: '4 أرقام أو أكثر، لا يتكرر' },
    { k: 'role', type: 'select', opts: ['أمن بوابة', 'مفتش أمن حيوي', 'مدير موقع', 'مدير قطاع', 'متابعة فقط', 'مدير'], req: 1 }, { k: 'gate', type: 'gate' }, { k: 'phone' }, { k: 'scope' }, { k: 'perms' }, { k: 'active', type: 'yesno', def: 'نعم' }] },
  contacts: { title: 'جهات التنبيه (واتساب وإيميل)', fields: [
    { k: 'id', req: 1, upper: 1 }, { k: 'name', req: 1 }, { k: 'phone', hint: 'واتساب بالصيغة الدولية مثل 201001234567 (اختياري إذا أُدخل إيميل)' },
    { k: 'apikey', hint: 'يصل لصاحب الرقم من CallMeBot عند التفعيل' },
    { k: 'email', hint: 'تصله نفس التنبيهات على الإيميل مجاناً' },
    { k: 'alerts', type: 'select', opts: ['كل التنبيهات', 'الرفض وطلبات الاستثناء', 'البلاغات العاجلة والرسائل', 'القرارات والتعليمات فقط', 'تصعيد مستوى 1 (نائب المدير)', 'تصعيد مستوى 2 (مدير القطاع)'], def: 'كل التنبيهات', hint: 'أرقام التصعيد تصلها البلاغات العاجلة فقط إذا لم يفتحها المدير في الوقت المحدد' },
    { k: 'active', type: 'yesno', def: 'نعم' }] },
  companies: { title: 'شركات النقل والمقاولون', fields: [
    { k: 'id', req: 1, upper: 1, hint: 'كود قصير مثل CO01' }, { k: 'name', req: 1 },
    { k: 'type', type: 'select', opts: ['نقل علف', 'نقل كتاكيت', 'نقل بيض', 'نقل سبلة ونافق', 'صيانة', 'توريد', 'أخرى'], def: 'أخرى' },
    { k: 'contact' }, { k: 'phone' }, { k: 'email' }, { k: 'status', type: 'select', opts: ['نشط', 'موقوف'], def: 'نشط' }, { k: 'note' }] },
  settings: { title: 'الإعدادات', noAdd: 1, fields: [{ k: 'key', ro: 1 }, { k: 'value' }, { k: 'note', ro: 1 }] }
};

/* ============================ البيانات الأولية ============================ */

// موظفون حقيقيون أرسلتهم الإدارة للتجربة (الكود الوظيفي | الاسم)
var BIO_EMPLOYEES = '102818|عمر فتحي عبدالحليم;102772|جمال فتحي حسين;100147|أ/ محمد عبده سيد;100781|محمود شعبان محمد;102716|هشام محمود خليفه;104094|عبدلله محمود كامل;102326|احمد بهاء رشدي;104069|عمار كامل توفيق;102331|مختار رفعت مختار;104065|مصطفى فتحى حسنى;102319|هيثم خلف احمد;104659|احمد محمد احمد;102912|محمد ممدوح صلاح;103186|عوض عبدالطيف عوض;104778|عمر هاشم فهمى;100264|علاء صابر بدوي;100703|كارم محمود فارس;102096|اسلام صدقي حسين;100598|خلف ثابت خلف;102833|محمد جمال محمد;101121|احمد صلاح الدين شكرى;102072|محمود محمد ربيع;104059|محمد احمد مصطفي;103801|وليد سيد ايوب;104524|عماد عبدالحليم عبدالظاهر;104176|م/عبدالعظيم على زيادة;102648|فارس احمد عبدالغفار;103459|رضا عبدالعزيز سعد;100914|احمد بركات عبدالعظيم;102425|عصمت حمدي احمد;102337|صلاح ايهاب صلاح;100505|محمد فتحي فاروق;102462|هيثم اشرف حافظ;101650|عبدالعظيم عمر عبدالعظيم;102327|عادل علي عاشور;102999|اسماعيل محمد اسماعيل;104225|محمد ابوالفتوح ابراهيم;104029|محمد احمد عبدالغني;100546|محمد ابراهيم احمد;103861|محمد ثروت هديه;103710|مصطفي عبدالكريم محمد;103514|شريف عبدالرازق عبدالمنعم;103187|هيثم ثابت شلقامي;104480|عبدالرحمن احمد مرسي';


/** هل يصل هذا التنبيه لهذا المستخدم؟ حسب دوره وصلاحياته ونطاق إدارته (للإشعارات الفورية) */
function BIO_userWants(u, evt, sites, checkpoints) {
  if (!u) return false;
  if (u.active != null && String(u.active).trim() === BIO.NO) return false;
  var r = BIO_role(u.role);
  if (!r || r.k === BIO.ROLE_GUARD) return false;
  var perms = BIO_userPerms(u), need = { request: 'decide', report: 'reports', escalation: 'reports', message: 'reports' }[evt.kind] || (evt.kind === 'vreport' ? evt.perm || 'vr_view' : '');
  if (r.reportsOnly && evt.kind !== 'vreport') return false;
  if (need && perms.indexOf(need) < 0) return false;
  if (r.k === BIO.ROLE_VIEWER && ['deny', 'card', 'watch'].indexOf(evt.kind) >= 0) return false;
  var raw = BIO_list(u.scope);
  if (r.k === BIO.ROLE_MANAGER || !raw.length) return true;
  var site = evt.siteId ? sites[BIO_norm(evt.siteId)] : null;
  var inS = function (s) { return !!s && raw.some(function (x) { return BIO_norm(x) === s.id || String(x).trim() === s.sector; }); };
  if (site) return inS(site);
  if (evt.gate) {
    var cp = checkpoints.filter(function (c) { return BIO_norm(c.id) === BIO_norm(evt.gate); })[0];
    if (cp) return raw.some(function (x) { return String(x).trim() === cp.sector; }) || BIO_list(cp.serves).some(function (id) { return inS(sites[BIO_norm(id)]); });
  }
  return evt.kind !== 'request';
}

function BIO_seed(now) {
  var H = BIO.HOUR, A = BIO.ST_ACTIVE, N = BIO.NO;
  var stations = ['5', '10', '4', '3', '8', '12', '13', '17', '20', '21'];
  var wf = stations.map(function (s) { return 'W-F' + (s.length < 2 ? '0' + s : s); });
  var sites = [{ id: 'W-BRD', name: 'أمهات الواحات (تربية وإنتاج)', sector: 'الواحات', level: 1, type: 'أمهات', status: A, external: N }];
  stations.forEach(function (s, i) { sites.push({ id: wf[i], name: 'تسمين الواحات - محطة ' + s, sector: 'الواحات', level: 3, type: 'تسمين (ترتيب التسكين ' + (i + 1) + ')', status: A, external: N }); });
  sites.push(
    { id: 'W-HAT', name: 'معمل تفريخ الواحات', sector: 'الواحات', level: 2, type: 'مفرخ', status: A, external: N },
    { id: 'W-FEED', name: 'مصنع علف الواحات', sector: 'الواحات', level: 4, type: 'علف', status: A, external: N },
    { id: 'R-BRD', name: 'أمهات ريجوا (تربية وإنتاج)', sector: 'ريجوا', level: 1, type: 'أمهات', status: A, external: N },
    { id: 'R-FAT', name: 'تسمين ريجوا (المحطات لاحقاً)', sector: 'ريجوا', level: 3, type: 'تسمين', status: A, external: N },
    { id: 'R-HAT', name: 'معمل تفريخ ريجوا', sector: 'ريجوا', level: 2, type: 'مفرخ', status: A, external: N },
    { id: 'X01', name: 'سوق / مزرعة دواجن خارجية', sector: 'خارج الشركة', level: 4, type: 'خارجي', status: A, external: BIO.YES },
    { id: 'X02', name: 'مجزر خارجي', sector: 'خارج الشركة', level: 4, type: 'خارجي', status: A, external: BIO.YES }
  );
  var src = 'سياسة الشركة (مبدئي، يُعتمد من الإدارة)';
  function M(n, h, it, nm, si, sn, d, cp) {
    return { id: 'M-SEED-' + n, time: now - h * H, itemId: it, itemName: nm, siteId: si, siteName: sn, dir: d, decision: BIO.ALLOW, reason: d === BIO.EXT ? 'إقرار عند الخروج' : '', checks: d === BIO.IN ? 'استحمام كامل، تغيير الملابس والحذاء' : '', user: 'بيانات تجريبية', checkpoint: cp || '', offline: '', flag: '', updatedAt: now - h * H };
  }
  var E1 = 'م. مهندس تسمين (مثال)', E2 = 'م. مهندس أمهات (مثال)', V1 = 'سيارة نقل علف 1234 (مثال)', D1 = 'سائق نقل علف (مثال)', E3 = 'د. طبيب بيطري (مثال)', E4 = 'مندوب مشتريات (مثال)', E5 = 'عامل تسمين (مثال)', Q1 = 'ماكينة تحصين متنقلة (مثال)', G1 = 'زائر - مورد (مثال)';
  return BIO_seedV5({
    sites: sites,
    checkpoints: [
      { id: 'W-CP1', name: 'منطقة التطهير المركزية - الواحات', sector: 'الواحات', serves: ['W-BRD'].concat(wf, ['W-HAT', 'W-FEED']).join(',') },
      { id: 'W-CP2', name: 'منطقة تطهير التسمين كلين - الواحات', sector: 'الواحات', serves: wf.join(',') },
      { id: 'W-CP3', name: 'منطقة تطهير المبيع - الواحات', sector: 'الواحات', serves: wf.join(',') },
      { id: 'R-CP1', name: 'منطقة التطهير المركزية - ريجوا', sector: 'ريجوا', serves: 'R-BRD,R-FAT,R-HAT' },
      { id: 'R-CP2', name: 'منطقة تطهير التسمين كلين - ريجوا', sector: 'ريجوا', serves: 'R-FAT' },
      { id: 'R-CP3', name: 'منطقة تطهير المبيع - ريجوا', sector: 'ريجوا', serves: 'R-FAT' }
    ],
    rules: [
      { id: 'R1-1', from: 1, to: 1, hours: 24, note: src + ' · بين موقعي أمهات مختلفين' },
      { id: 'R2-1', from: 2, to: 1, hours: 48, note: src },
      { id: 'R2-2', from: 2, to: 2, hours: 24, note: src },
      { id: 'R3-1', from: 3, to: 1, hours: 72, note: src + ' · من التسمين إلى الأمهات' },
      { id: 'R3-2', from: 3, to: 2, hours: 48, note: src },
      { id: 'R3-3', from: 3, to: 3, hours: 24, note: src + ' · بين محطات التسمين' },
      { id: 'R4-1', from: 4, to: 1, hours: 72, note: src + ' · من العلف والمجازر والخارج' },
      { id: 'R4-2', from: 4, to: 2, hours: 72, note: src },
      { id: 'R4-3', from: 4, to: 3, hours: 48, note: src }
    ],
    items: [
      { id: 'E001', name: E1, kind: 'موظف', dept: 'الإنتاج', phone: '', active: BIO.YES },
      { id: 'E002', name: E2, kind: 'موظف', dept: 'الإنتاج', phone: '', active: BIO.YES },
      { id: 'E003', name: E3, kind: 'موظف', dept: 'الطب البيطري', phone: '', active: BIO.YES },
      { id: 'E004', name: E4, kind: 'موظف', dept: 'المشتريات', phone: '', active: BIO.YES, card: 2 },
      { id: 'E005', name: E5, kind: 'عامل', dept: 'تسمين الواحات', phone: '', active: BIO.YES },
      { id: 'D001', name: D1, kind: 'سائق', dept: 'النقل', phone: '', active: BIO.YES },
      { id: 'V001', name: V1, kind: 'مركبة', dept: 'النقل', phone: '', active: BIO.YES },
      { id: 'Q001', name: Q1, kind: 'معدة', dept: 'الطب البيطري', phone: '', active: BIO.YES },
      { id: 'G001', name: G1, kind: 'زائر', dept: 'جهة خارجية', phone: '', active: BIO.YES },
      { id: 'G002', name: 'مندوب شركة أدوية بيطرية (مثال)', kind: 'مورد', dept: 'شركة أدوية', phone: '', active: BIO.YES }
    ].concat(BIO_EMPLOYEES.split(';').map(function (r) { var x = r.split('|'); return { id: x[0], name: x[1], kind: 'موظف', dept: '', phone: '', active: BIO.YES }; })),
    users: [
      { id: 'U01', pin: '1111', name: 'أمن التطهير المركزي - الواحات', role: BIO.ROLE_GUARD, gate: 'W-CP1', phone: '' },
      { id: 'U02', pin: '2222', name: 'أمن تطهير التسمين كلين - الواحات', role: BIO.ROLE_GUARD, gate: 'W-CP2', phone: '' },
      { id: 'U03', pin: '3333', name: 'أمن التطهير المركزي - ريجوا', role: BIO.ROLE_GUARD, gate: 'R-CP1', phone: '' },
      { id: 'U09', pin: '9999', name: 'مدير الأمن الحيوي', role: BIO.ROLE_MANAGER, gate: '', phone: '' },
      { id: 'U04', pin: '1212', name: 'فرد أمن الوردية الليلية (مثال)', role: BIO.ROLE_GUARD, gate: 'W-CP1', phone: '' },
      { id: 'U10', pin: '4444', name: 'مدير قطاع الواحات (مثال)', role: BIO.ROLE_SECTOR, gate: '', scope: 'الواحات', phone: '' },
      { id: 'U11', pin: '5555', name: 'مدير محطتي 5 و10 (مثال)', role: BIO.ROLE_SITE, gate: '', scope: 'W-F05,W-F10', phone: '' },
      { id: 'U12', pin: '6666', name: 'الإدارة العليا (مثال)', role: BIO.ROLE_VIEWER, gate: '', phone: '' }
    ],
    contacts: [
      { id: 'C01', name: 'مدير الأمن الحيوي (مثال)', phone: '', apikey: '', alerts: 'كل التنبيهات', active: BIO.NO }
    ],
    cardlog: [
      { id: 'K-SEED-1', time: now - 26 * H, itemId: 'E004', itemName: E4, action: 'فقد: إلغاء الكارت القديم وإصدار بديل', card: 2, by: 'مدير الأمن الحيوي', note: 'أبلغ عن فقد الكارت في الطريق' }
    ],
    notices: [
      { id: 'N-SEED-1', time: now - 2 * H, from: 'مدير الأمن الحيوي', target: 'ALL', level: 'عادي', title: 'بدء التشغيل التجريبي', body: 'يُسجَّل كل دخول وخروج بمسح الكارت. لا تُفتح البوابة إلا بعد ظهور الشاشة الخضراء واستكمال إجراءات الاستحمام والتطهير.' }
    ],
    acks: [],
    devices: [],
    reports: [
      { id: 'B-SEED-1', time: now - 26 * H, type: 'عطل في التطهير أو نقص مطهر', siteId: 'W-F10', siteName: 'تسمين الواحات - محطة 10', gate: 'منطقة التطهير المركزية - الواحات', fromId: 'U01', fromName: 'أمن التطهير المركزي - الواحات', note: 'نقص المطهر في حوض تطهير الإطارات (مثال)', photo: '', status: 'مغلق', readAt: now - 26 * H + 2 * 6e4, ackAt: now - 26 * H + 4 * 6e4, ackBy: 'مدير الأمن الحيوي', action: 'تم الاستلام: توريد مطهر بديل خلال ساعة', escLevel: 0, escAt: '', closedAt: now - 25 * H, updatedAt: now - 25 * H },
      { id: 'B-SEED-2', time: now - 50 * H, type: 'دخول بالقوة أو بدون تصريح', siteId: 'R-BRD', siteName: 'أمهات ريجوا (تربية وإنتاج)', gate: 'منطقة التطهير المركزية - ريجوا', fromId: 'U03', fromName: 'أمن التطهير المركزي - ريجوا', note: 'سائق مورد حاول الدخول دون استحمام (مثال)', photo: '', status: 'مغلق', readAt: now - 50 * H + 7 * 6e4, ackAt: now - 50 * H + 9 * 6e4, ackBy: 'مدير الأمن الحيوي', action: 'تم الاستلام: منع الدخول وإبلاغ المورد', escLevel: 1, escAt: now - 50 * H + 5 * 6e4, closedAt: now - 49 * H, updatedAt: now - 49 * H }
    ],
    messages: [
      { id: 'G-SEED-1', time: now - 3 * H, gate: 'W-CP1', gateName: 'منطقة التطهير المركزية - الواحات', fromId: 'U01', fromName: 'أمن التطهير المركزي - الواحات', fromMgr: N, text: 'سيارة العلف وصلت البوابة وجاري تطهيرها (مثال)', readAt: now - 3 * H + 6e4 },
      { id: 'G-SEED-2', time: now - 3 * H + 2 * 6e4, gate: 'W-CP1', gateName: 'منطقة التطهير المركزية - الواحات', fromId: 'U09', fromName: 'مدير الأمن الحيوي', fromMgr: BIO.YES, text: 'تمام، تأكد من رش الشاسيه والإطارات قبل الدخول (مثال)', readAt: now - 3 * H + 3 * 6e4 }
    ],
    approvals: [],
    missions: (function () {
      var day0 = now - ((now + 3 * H) % (24 * H)), D = 24 * H;
      return [
        { id: 'MS-1001', time: now - 2 * D, kind: 'زيارة', visitor: G1, itemId: 'G001', company: 'جهة خارجية', phone: '', siteId: 'W-FEED', siteName: 'مصنع علف الواحات', visitAt: day0 + 6 * H, endAt: day0 + 20 * H, purpose: 'مراجعة جودة الخامات وزيارة خط الإنتاج', lastContact: 'لا توجد', lastContactAt: '', vehicle: '', requestedBy: 'مدير قطاع الواحات', requestedById: 'U03', email: '', leadHours: 34, late: BIO.NO, status: BIO.MS_OK, decidedBy: '', decidedAt: '', note: '', arrivedAt: '' },
        { id: 'MS-1002', time: now - 3 * H, kind: 'توريد', visitor: 'مندوب شركة أدوية بيطرية (مثال)', itemId: 'G002', company: 'شركة أدوية', phone: '', siteId: 'W-HAT', siteName: 'معمل تفريخ الواحات', visitAt: day0 + D + 10 * H, endAt: day0 + D + 13 * H, purpose: 'توريد لقاحات وتسليمها لمخزن المعمل', lastContact: 'مزرعة عملاء', lastContactAt: now - 30 * H, vehicle: 'ربع نقل مبرد', requestedBy: 'مدير الأمن الحيوي', requestedById: 'U01', email: '', leadHours: 18, late: BIO.YES, status: BIO.MS_LATE, decidedBy: '', decidedAt: '', note: '', arrivedAt: '' },
        { id: 'MS-1003', time: now - 5 * H, kind: 'صيانة', visitor: G1, itemId: 'G001', company: 'شركة المعدات', phone: '', siteId: 'W-F10', siteName: 'تسمين الواحات - محطة 10', visitAt: day0 + 3 * D + 9 * H, endAt: day0 + 3 * D + 15 * H, purpose: 'صيانة خطوط المعالف قبل التسكين', lastContact: '', lastContactAt: '', vehicle: '', requestedBy: 'مدير موقع', requestedById: 'U05', email: '', leadHours: 76, late: BIO.NO, status: BIO.MS_OK, decidedBy: '', decidedAt: '', note: '', arrivedAt: '' }
      ];
    })(),
    settings: [
      { key: 'COMPANY', value: 'كايرو ثري إيه', note: 'اسم الشركة في التطبيق' },
      { key: 'APP_URL', value: '', note: 'رابط التطبيق بعد نشره (يظهر في رسائل واتساب)' },
      { key: 'MANAGER_PHONE', value: '', note: 'هاتف مدير الأمن الحيوي للاتصال عند انقطاع الإنترنت' },
      { key: 'MANAGER_EMAIL', value: '', note: 'إيميل مدير الأمن الحيوي (يظهر زر «إيميل للمدير» في البوابات)' },
      { key: 'ALERT_HOURS', value: 120, note: 'ساعات العزل الدنيا بعد زيارة موقع في حالة إنذار (اشتباه مرضي)' },
      { key: 'LOOKBACK_HOURS', value: 240, note: 'أقصى فترة يرجع لها النظام في سجل الحركة' },
      { key: 'DOWNTIME_DAYS', value: 10, note: 'فترة الراحة بعد التنظيف والتطهير قبل التسكين (هابرد: 10 أيام على الأقل)' },
      { key: 'CHECKS_PERSON', value: 'استحمام كامل,تغيير الملابس والحذاء بملابس الموقع,تطهير اليدين', note: 'إجراءات دخول الأفراد (هابرد: استحمام وتغيير ملابس لكل من يدخل)، مفصولة بفاصلة' },
      { key: 'CHECKS_VEHICLE', value: 'غسيل وتطهير السيارة بالكامل,تطهير الإطارات والشاسيه,تطهير كابينة السائق', note: 'إجراءات دخول المركبات (هابرد: غسيل وتطهير المركبات بالرش)' },
      { key: 'SHOWER_MIN', value: 8, note: 'أقل مدة للاستحمام وتغيير الملابس بالدقائق قبل تأكيد دخول الأفراد (مؤقت البوابة). 0 لإيقاف المؤقت' },
      { key: 'MISSION_LEAD_HOURS', value: 24, note: 'أقل مدة بالساعات لتسجيل المأمورية أو الزيارة قبل موعدها. الأقل منها تُعلَّم متأخرة وتحتاج استثناء المدير' },
      { key: 'VISITOR_NEEDS_MISSION', value: BIO.YES, note: 'نعم: البوابة لا تُدخل الزوار والموردين إلا بمأمورية مسجلة لنفس الموقع ونفس اليوم' },
      { key: 'VEH_CERT_HOURS', value: 6, note: 'مدة صلاحية شهادة تطهير المركبة بالساعات' },
      { key: 'CHECKS_EQUIPMENT', value: 'تنظيف المعدة من المخلفات,تطهير المعدة بالرش أو التبخير', note: 'إجراءات دخول المعدات' },
      { key: 'ESCALATE_MINUTES', value: 5, note: 'إذا لم يفتح المدير البلاغ العاجل خلال هذه الدقائق يُصعَّد لأرقام التصعيد (مستوى 1 ثم مستوى 2)' },
      { key: 'WHATSAPP_ENABLED', value: BIO.NO, note: 'نعم لتفعيل تنبيهات واتساب عبر CallMeBot' },
      { key: 'EMAIL_ENABLED', value: BIO.YES, note: 'نعم لإرسال التنبيهات على الإيميل من حساب جوجل نفسه (مجاناً: 100 رسالة يومياً، 1500 لحساب الشركة)' }
    ],
    moves: [
      M(1, 20, 'E001', E1, 'R-FAT', 'تسمين ريجوا (المحطات لاحقاً)', BIO.IN), M(2, 18, 'E001', E1, 'R-FAT', 'تسمين ريجوا (المحطات لاحقاً)', BIO.OUT),
      M(3, 80, 'E002', E2, 'R-BRD', 'أمهات ريجوا (تربية وإنتاج)', BIO.IN), M(4, 76, 'E002', E2, 'R-BRD', 'أمهات ريجوا (تربية وإنتاج)', BIO.OUT),
      M(5, 30, 'V001', V1, 'W-FEED', 'مصنع علف الواحات', BIO.IN), M(6, 29, 'V001', V1, 'W-FEED', 'مصنع علف الواحات', BIO.OUT),
      M(7, 30, 'D001', D1, 'W-FEED', 'مصنع علف الواحات', BIO.IN), M(8, 29, 'D001', D1, 'W-FEED', 'مصنع علف الواحات', BIO.OUT),
      M(9, 3, 'E003', E3, 'W-BRD', 'أمهات الواحات (تربية وإنتاج)', BIO.IN),
      M(10, 26, 'E004', E4, 'X01', 'سوق / مزرعة دواجن خارجية', BIO.EXT),
      M(11, 10, 'E004', E4, 'W-FEED', 'مصنع علف الواحات', BIO.IN), M(12, 8, 'E004', E4, 'W-FEED', 'مصنع علف الواحات', BIO.OUT),
      M(13, 12, 'E005', E5, 'W-F05', 'تسمين الواحات - محطة 5', BIO.IN), M(14, 10, 'E005', E5, 'W-F05', 'تسمين الواحات - محطة 5', BIO.OUT),
      M(15, 100, 'Q001', Q1, 'W-F05', 'تسمين الواحات - محطة 5', BIO.IN), M(16, 98, 'Q001', Q1, 'W-F05', 'تسمين الواحات - محطة 5', BIO.OUT),
      M(17, 74, 'Q001', Q1, 'W-F10', 'تسمين الواحات - محطة 10', BIO.IN), M(18, 72, 'Q001', Q1, 'W-F10', 'تسمين الواحات - محطة 10', BIO.OUT),
      M(19, 50, 'Q001', Q1, 'W-F04', 'تسمين الواحات - محطة 4', BIO.IN), M(20, 49, 'Q001', Q1, 'W-F04', 'تسمين الواحات - محطة 4', BIO.OUT),
      M(21, 140, 'G001', G1, 'W-F05', 'تسمين الواحات - محطة 5', BIO.IN), M(22, 139, 'G001', G1, 'W-F05', 'تسمين الواحات - محطة 5', BIO.OUT),
      M(23, 110, 'G001', G1, 'W-HAT', 'معمل تفريخ الواحات', BIO.IN), M(24, 108, 'G001', G1, 'W-HAT', 'معمل تفريخ الواحات', BIO.OUT),
      M(25, 60, 'D001', D1, 'W-F05', 'تسمين الواحات - محطة 5', BIO.IN), M(26, 59, 'D001', D1, 'W-F05', 'تسمين الواحات - محطة 5', BIO.OUT)
    ].concat(BIO_seedHistory(now, { V1: V1, D1: D1, E3: E3, Q1: Q1, E5: E5, G1: G1 }), BIO_seedDaily(now, sites))
  }, now);
}

/** بيانات الإصدار 5 التجريبية: إحداثيات تقريبية (تُستبدل من شاشة رادار الطيور)، شركات النقل، النافق، التدقيق، التدريب، مشاهدات الطيور */
function BIO_seedV5(s, now) {
  var H = BIO.HOUR, D = 24 * H, day0 = now - ((now + 3 * H) % D), Y = BIO.YES, N = BIO.NO;
  var geo = { 'W-BRD': [29.905, 30.80], 'W-HAT': [29.93, 30.86], 'W-FEED': [29.95, 30.9], 'W-F05': [29.89, 30.74], 'W-F10': [29.875, 30.715], 'W-F04': [29.86, 30.69], 'W-F03': [29.845, 30.665], 'W-F08': [29.83, 30.64], 'W-F12': [29.885, 30.66], 'W-F13': [29.87, 30.635], 'W-F17': [29.855, 30.61], 'W-F20': [29.84, 30.585], 'W-F21': [29.825, 30.56], 'R-BRD': [30.42, 30.48], 'R-FAT': [30.38, 30.4], 'R-HAT': [30.45, 30.55], 'X01': [30.0, 31.2], 'X02': [30.07, 31.0] };
  s.sites.forEach(function (x) { var g = geo[x.id]; if (g) { x.lat = g[0]; x.lng = g[1]; x.geo = 'تقريبية'; } });
  s.companies = [
    { id: 'CO01', name: 'شركة النقل السريع للأعلاف (مثال)', type: 'نقل علف', contact: 'أ. سامح', phone: '', email: '', status: 'نشط', reason: '', note: '' },
    { id: 'CO02', name: 'الدلتا لنقل الكتاكيت (مثال)', type: 'نقل كتاكيت', contact: 'أ. حسن', phone: '', email: '', status: 'نشط', reason: '', note: '' },
    { id: 'CO03', name: 'مقاول السبلة والنافق (مثال)', type: 'نقل سبلة ونافق', contact: 'أ. رمضان', phone: '', email: '', status: 'نشط', reason: '', note: 'مرخص للتخلص الآمن' },
    { id: 'CO04', name: 'شركة صيانة المعدات (مثال)', type: 'صيانة', contact: 'م. وائل', phone: '', email: '', status: 'موقوف', reason: 'دخول فني بدون استحمام مرتين خلال أسبوع', note: '' },
    { id: 'CO05', name: 'شركة أدوية بيطرية (مثال)', type: 'توريد', contact: 'د. منى', phone: '', email: '', status: 'نشط', reason: '', note: '' }
  ];
  var comp = { V001: ['CO01', 'ن ق ص 1234'], D001: ['CO01'], G002: ['CO05'] };
  s.items.forEach(function (i) { var c = comp[i.id]; if (c) { i.company = c[0]; if (c[1]) i.plate = c[1]; } });
  s.items.push(
    { id: 'V002', name: 'سيارة نقل سبلة (مثال)', kind: 'مركبة', dept: 'النقل', phone: '', active: Y, company: 'CO03', plate: 'س ب ل 5821' },
    { id: 'D002', name: 'سائق سيارة السبلة (مثال)', kind: 'سائق', dept: 'النقل', phone: '', active: Y, company: 'CO03' },
    { id: 'V003', name: 'سيارة كتاكيت مكيفة (مثال)', kind: 'مركبة', dept: 'النقل', phone: '', active: Y, company: 'CO02', plate: 'د ل ت 4470' },
    { id: 'V004', name: 'سيارة فنيي الصيانة (مثال)', kind: 'مركبة', dept: 'جهة خارجية', phone: '', active: Y, company: 'CO04', plate: 'ص ي ن 9070' },
    { id: 'E006', name: 'عامل جديد اجتاز التأهيل (مثال)', kind: 'عامل', dept: 'تسمين الواحات', phone: '01055555555', active: Y, added: now - 3 * D },
    { id: 'E007', name: 'عامل جديد لم يتدرب بعد (مثال)', kind: 'عامل', dept: 'تسمين الواحات', phone: '01098765432', active: Y, added: now - D }
  );
  var nm = {}; s.sites.forEach(function (x) { nm[x.id] = x.name; });
  var k = 0;
  function mv(it, name, site, h, dir, extra) { s.moves.push(Object.assign({ id: 'V5-SEED-' + (++k), time: now - h * H, itemId: it, itemName: name, siteId: site, siteName: nm[site], dir: dir, decision: BIO.ALLOW, reason: '', checks: dir === BIO.IN ? 'غسيل وتطهير السيارة بالكامل، تطهير الإطارات والشاسيه، تطهير كابينة السائق' : '', user: 'أمن التطهير المركزي - الواحات', checkpoint: 'منطقة التطهير المركزية - الواحات', offline: '', flag: '', via: 'مسح الكارت', updatedAt: now - h * H }, extra || {})); }
  [[300, 'W-F05'], [250, 'W-F10'], [200, 'W-F04'], [150, 'W-F03'], [96, 'W-F12']].forEach(function (x, i) { mv('V003', 'سيارة كتاكيت مكيفة (مثال)', x[1], x[0], BIO.IN); mv('V003', 'سيارة كتاكيت مكيفة (مثال)', x[1], x[0] - 1, BIO.OUT); });
  [[320, 'W-F21'], [270, 'W-F20'], [220, 'W-F17'], [120, 'W-F13']].forEach(function (x, i) { mv('V002', 'سيارة نقل سبلة (مثال)', x[1], x[0], BIO.IN, i === 1 ? { flag: 'دخل قبل اكتمال فترة العزل (مثال)' } : {}); mv('V002', 'سيارة نقل سبلة (مثال)', x[1], x[0] - 1, BIO.OUT); });
  mv('V004', 'سيارة فنيي الصيانة (مثال)', 'W-HAT', 180, BIO.IN, { decision: BIO.DENY, reason: 'لم تكتمل فترة العزل', checks: '' });
  mv('V004', 'سيارة فنيي الصيانة (مثال)', 'W-HAT', 160, BIO.IN, { decision: BIO.OVERRIDE, reason: 'دخول استثنائي بموافقة المدير', flag: 'فني دخل بدون استحمام (مثال)' });
  mv('V004', 'سيارة فنيي الصيانة (مثال)', 'W-HAT', 158, BIO.OUT);
  // النافق اليومي لآخر 14 يوماً، ومحطة 10 بها نفوق مرتفع اليوم
  s.disposal = [];
  var base = { 'W-F05': 14, 'W-F10': 12, 'W-F04': 9, 'W-F21': 11, 'W-BRD': 4, 'R-FAT': 10 }, n = 0;
  Object.keys(base).forEach(function (site) {
    for (var d = 13; d >= 0; d--) {
      var t = day0 - d * D + 8 * H; if (t > now) t = now - 30 * 6e4;
      var c = Math.max(1, Math.round(base[site] * (0.7 + ((d * 7 + site.length * 3) % 7) / 10)));
      if (site === 'W-F10' && d === 0) c = 64;
      s.disposal.push({ id: 'DP-SEED-' + (++n), time: t, siteId: site, siteName: nm[site], kind: 'نافق', count: c, weight: Math.round(c * 1.6), method: site === 'W-BRD' ? 'محرقة الموقع' : 'حفرة تحلل مغلقة', vehicleId: '', vehicleName: '', driverId: '', by: 'مشرف الموقع', note: '' });
    }
  });
  s.disposal.push({ id: 'DP-SEED-L1', time: now - 3 * H, siteId: 'W-F05', siteName: nm['W-F05'], kind: 'سبلة', count: 0, weight: 6200, method: 'سيارة سبلة خارجية مرخصة', vehicleId: 'V002', vehicleName: 'سيارة نقل سبلة (مثال)', driverId: 'D002', by: 'مشرف محطة 5', note: 'تنظيف بعد البيع' });
  s.disposal.push({ id: 'DP-SEED-L2', time: now - 4 * D, siteId: 'W-F21', siteName: nm['W-F21'], kind: 'سبلة', count: 0, weight: 5400, method: 'سيارة سبلة خارجية مرخصة', vehicleId: 'V002', vehicleName: 'سيارة نقل سبلة (مثال)', driverId: 'D002', by: 'مشرف محطة 21', note: '' });
  // التدقيق الداخلي والإجراءات التصحيحية
  function ans(no) { var a = {}; BIO_CHECKLIST.forEach(function (sec) { sec.items.forEach(function (it) { a[it.k] = { v: no.indexOf(it.k) >= 0 ? 'n' : 'y' }; }); }); return JSON.stringify(a); }
  s.inspections = [
    { id: 'AU-SEED-1', time: now - 35 * D, siteId: 'W-BRD', siteName: nm['W-BRD'], auditor: 'مدير الأمن الحيوي', score: 94, nc: 1, answers: ans(['R1']), note: '' },
    { id: 'AU-SEED-2', time: now - 20 * D, siteId: 'W-HAT', siteName: nm['W-HAT'], auditor: 'مدير الأمن الحيوي', score: 100, nc: 0, answers: ans([]), note: 'التزام ممتاز' },
    { id: 'AU-SEED-3', time: now - 10 * D, siteId: 'W-F05', siteName: nm['W-F05'], auditor: 'مدير قطاع الواحات', score: 81, nc: 3, answers: ans(['V1', 'R2', 'H1']), note: '' },
    { id: 'AU-SEED-4', time: now - 6 * D, siteId: 'R-BRD', siteName: nm['R-BRD'], auditor: 'مدير الأمن الحيوي', score: 88, nc: 2, answers: ans(['S3', 'H3']), note: '' }
  ];
  function A(id, au, site, f, a, owner, dueD, status, closedD, note) { return { id: id, time: now - 10 * D, auditId: au, siteId: site, siteName: nm[site], finding: f, action: a, owner: owner, due: now + dueD * D, status: status, closedAt: closedD == null ? '' : now - closedD * D, closeNote: note || '', remindedAt: '' }; }
  s.actions = [
    A('AU-SEED-1-1', 'AU-SEED-1', 'W-BRD', 'القوارض والطيور البرية: محطات الطعوم مرقمة وتُفحص أسبوعياً بسجل', 'ترقيم المحطات وجدول فحص أسبوعي موثق', 'مشرف أمهات الواحات', -28, 'مغلق', 29, 'تم ترقيم 46 محطة وبدء السجل الأسبوعي'),
    A('AU-SEED-3-1', 'AU-SEED-3', 'W-F05', 'تطهير المركبات والمعدات: حوض تطهير الإطارات ممتلئ بتركيز مطهر صحيح ومتجدد', 'تجديد المحلول وتسجيل التركيز ووقت التغيير يومياً', 'مشرف محطة 5', -3, 'مغلق', 4, 'تجديد يومي 7 صباحاً وتسجيله'),
    A('AU-SEED-3-2', 'AU-SEED-3', 'W-F05', 'القوارض والطيور البرية: شبك الشبابيك والفتحات سليم يمنع دخول الطيور البرية', 'إصلاح الشبك وإغلاق الفتحات فوراً', 'مشرف محطة 5', -3, 'جارٍ التنفيذ'),
    A('AU-SEED-3-3', 'AU-SEED-3', 'W-F05', 'العنابر والمياه والنافق: حوض تطهير الأقدام عند باب كل عنبر بمحلول متجدد', 'تجديد المحلول مرتين يومياً على الأقل', 'مشرف محطة 5', 0.6, 'مفتوح'),
    A('AU-SEED-4-1', 'AU-SEED-4', 'R-BRD', 'الاستحمام وتغيير الملابس: ملابس وأحذية الموقع متوفرة بكل المقاسات ومغسولة', 'زيادة مخزون الملابس وجدول غسيل يومي', 'مدير أمهات ريجوا', 1, 'مفتوح'),
    A('AU-SEED-4-2', 'AU-SEED-4', 'R-BRD', 'العنابر والمياه والنافق: مياه الشرب معالجة بالكلور ويُقاس الكلور الحر دورياً', 'ضبط جرعة الكلور وقياس يومي عند نهاية الخط', 'مدير أمهات ريجوا', 4, 'مفتوح')
  ];
  // سجل التدريب: أغلب الموظفين اجتازوا التأهيل، والعامل الجديد E006 اجتازه أمس
  s.training = []; var tn = 0;
  s.items.filter(function (i) { return ['موظف', 'عامل', 'سائق'].indexOf(i.kind) >= 0 && i.id !== 'E007'; }).forEach(function (i, idx) {
    if (idx % 5 === 3) return;
    var t = i.id === 'E006' ? now - 1 * D - 3 * H : now - (20 + idx * 3) * D, sc = 80 + (idx * 7) % 21;
    s.training.push({ id: 'TR-SEED-' + (++tn), time: t, itemId: i.id, itemName: i.name, module: 'IND', score: sc, passed: Y, via: i.id === 'E006' ? 'اختبار ذاتي من الموبايل' : 'تدريب حضوري (بيانات تجريبية)', cert: 'BA-IND-' + BIO_hash(i.id + 'IND').slice(0, 6).toUpperCase() });
    if (idx % 4 === 0) s.training.push({ id: 'TR-SEED-' + (++tn), time: now - (5 + idx) * D, itemId: i.id, itemName: i.name, module: 'REF', score: 100, passed: Y, via: 'اختبار ذاتي من الموبايل', cert: 'BA-REF-' + BIO_hash(i.id + 'REF').slice(0, 6).toUpperCase() });
  });
  s.training.push({ id: 'TR-SEED-F', time: now - 2 * D, itemId: 'E006', itemName: 'عامل جديد اجتاز التأهيل (مثال)', module: 'IND', score: 50, passed: N, via: 'اختبار ذاتي من الموبايل', cert: '' });
  // مشاهدات الطيور
  s.birdobs = [
    { id: 'BO-SEED-1', time: now - 1.5 * H, lat: 29.872, lng: 30.705, siteId: 'W-F10', species: 'بط بري (خضاري وشرشير)', count: 150, source: 'مشاهدة ميدانية', note: 'سرب حط على أرض مكشوفة شمال المحطة', by: 'أمن تطهير التسمين كلين - الواحات' },
    { id: 'BO-SEED-2', time: now - 26 * H, lat: 30.43, lng: 30.47, siteId: 'R-BRD', species: 'بلشون أبيض (أبو قردان)', count: 25, source: 'مشاهدة ميدانية', note: 'حول خزان المياه', by: 'أمن التطهير المركزي - ريجوا' },
    { id: 'BO-SEED-3', time: now - 2 * D, lat: 29.48, lng: 30.65, siteId: 'W-F21', species: 'Northern Shoveler (Spatula clypeata)', count: 320, source: 'eBird', note: 'بحيرة قارون', by: 'eBird' }
  ];
  s.birdalerts = [{ id: 'BA-SEED-1', time: now - 20 * H, siteId: 'W-F10', siteName: nm['W-F10'], score: 63, level: 'متوسط', note: 'مصدر متوقع: ممر الواحات والصحراء الغربية على بعد 22 كم · الرياح من شمال غرب 30 كم/س' }];
  s.changes = [
    { id: 'L-SEED-1', time: now - 6 * H, userId: 'U09', userName: 'مدير الأمن الحيوي', table: 'شركات النقل والمقاولون', key: 'CO04', action: 'إيقاف شركة', before: '{"status":"نشط"}', after: '{"status":"موقوف","reason":"دخول فني بدون استحمام مرتين خلال أسبوع"}' },
    { id: 'L-SEED-2', time: now - 30 * H, userId: 'U09', userName: 'مدير الأمن الحيوي', table: 'الأفراد والمركبات والمعدات', key: 'E007', action: 'إضافة', before: '', after: '{"id":"E007","name":"عامل جديد لم يتدرب بعد (مثال)","kind":"عامل"}' },
    { id: 'L-SEED-3', time: now - 50 * H, userId: 'U10', userName: 'مدير قطاع الواحات (مثال)', table: 'قواعد العزل', key: 'R3-3', action: 'تعديل', before: '{"hours":12}', after: '{"hours":24}' }
  ];
  s.settings.push(
    { key: 'BACKUP_KEEP', value: 30, note: 'عدد النسخ الاحتياطية اليومية المحفوظة في Google Drive (الأقدم يُحذف تلقائياً)' },
    { key: 'PURCHASING_EMAIL', value: '', note: 'إيميل إدارة المشتريات لاستلام التقييم الشهري لشركات النقل والمقاولين (أول كل شهر)' },
    { key: 'LITTER_BLOCK_HOURS', value: 24, note: 'ساعات منع سيارة السبلة أو النافق وسائقها من دخول أي منطقة نظيفة بعد آخر حمولة' },
    { key: 'AUDIT_EVERY_DAYS', value: 30, note: 'تكرار زيارة التدقيق الداخلي لكل موقع بالأيام' },
    { key: 'CAPA_DAYS', value: 7, note: 'المهلة الافتراضية لتنفيذ الإجراء التصحيحي بالأيام (تذكير قبلها بيوم وتصعيد عند التأخير)' },
    { key: 'ACADEMY_REQUIRED', value: Y, note: 'نعم: الموظف الجديد لا يدخل أي موقع قبل اجتياز التأهيل الإلزامي (لا يؤثر على الموظفين المسجلين قبل التفعيل)' },
    { key: 'ACADEMY_PASS', value: 80, note: 'درجة النجاح في اختبارات الأكاديمية (%)' },
    { key: 'ACADEMY_VIDEO_URL', value: '', note: 'رابط فيديو التأهيل (يوتيوب أو Drive) يظهر قبل الاختبار، اختياري' },
    { key: 'BIRD_ALERT_LEVEL', value: 60, note: 'درجة خطر الطيور المهاجرة (من 100) التي يُرسل عندها تنبيه للمديرين' },
    { key: 'BIRD_RADIUS_KM', value: 50, note: 'نصف قطر احتساب مشاهدات الطيور حول كل موقع بالكيلومتر' },
    { key: 'EBIRD_KEY', value: '', note: 'اختياري ومجاني: مفتاح eBird لجلب مشاهدات الطيور الحقيقية حول المواقع (ebird.org/api/keygen)' },
    { key: 'TV_SECONDS', value: 12, note: 'مدة عرض كل لوحة في شاشة غرفة العمليات بالثواني' }
  );
  // حساب «مفتش أمن حيوي» تجريبي: يدخل على التقارير فقط
  s.users.push({ id: 'U13', pin: '7777', name: 'معاون الأمن الحيوي (مثال)', role: 'مفتش أمن حيوي', gate: '', scope: 'الواحات', phone: '' });
  s.settings.push({ key: 'REPORTS_URL', value: BIO_REPORTS_URL, note: 'رابط تطبيق تقارير الزيارات (Apps Script) الذي يفتح داخل المنصة بنفس الدخول' });
  return s;
}

/** سجل حركة تجريبي لآخر 14 يوماً (أقدم من 100 ساعة) يوضح شبكة المخالطة وملف التدقيق في نسخة العرض */
function BIO_seedHistory(now, N) {
  var H = BIO.HOUR, out = [], k = 0;
  var names = { 'W-FEED': 'مصنع علف الواحات', 'W-F05': 'تسمين الواحات - محطة 5', 'W-F10': 'تسمين الواحات - محطة 10', 'W-F04': 'تسمين الواحات - محطة 4', 'W-F03': 'تسمين الواحات - محطة 3', 'W-F12': 'تسمين الواحات - محطة 12', 'W-F21': 'تسمين الواحات - محطة 21', 'W-HAT': 'معمل تفريخ الواحات', 'W-BRD': 'أمهات الواحات (تربية وإنتاج)', 'R-FAT': 'تسمين ريجوا (المحطات لاحقاً)', 'R-BRD': 'أمهات ريجوا (تربية وإنتاج)', 'R-HAT': 'معمل تفريخ ريجوا' };
  var cps = { W: 'منطقة التطهير المركزية - الواحات', R: 'منطقة التطهير المركزية - ريجوا' };
  function visit(id, name, site, hAgo, stay, checks) {
    var cp = cps[site.charAt(0)], base = { itemId: id, itemName: name, siteId: site, siteName: names[site], decision: BIO.ALLOW, reason: '', user: cp.replace('منطقة التطهير المركزية', 'أمن التطهير المركزي'), checkpoint: cp, offline: '', flag: '', via: 'مسح الكارت' };
    out.push(Object.assign({ id: 'H-SEED-' + (++k), time: now - hAgo * H, dir: BIO.IN, checks: checks || 'استحمام كامل، تغيير الملابس والحذاء بملابس الموقع، تطهير اليدين', updatedAt: now - hAgo * H }, base));
    out.push(Object.assign({ id: 'H-SEED-' + (++k), time: now - (hAgo - stay) * H, dir: BIO.OUT, checks: '', updatedAt: now - (hAgo - stay) * H }, base));
  }
  var vc = 'غسيل وتطهير السيارة بالكامل، تطهير الإطارات والشاسيه، تطهير كابينة السائق';
  // سيارة العلف وسائقها: تنقل بين المصنع ومحطات التسمين في القطاعين، ومرة صعوداً لمعمل التفريخ بعد 6 ساعات فقط
  [['W-FEED', 330], ['W-F05', 326], ['W-F10', 302], ['R-FAT', 278], ['W-FEED', 250], ['W-F21', 236], ['W-HAT', 228], ['W-F12', 200], ['R-FAT', 176], ['W-F03', 150], ['W-FEED', 128]].forEach(function (x) {
    visit('V001', N.V1, x[0], x[1], 1, vc); visit('D001', N.D1, x[0], x[1], 1);
  });
  // الطبيب البيطري: يربط القطاعين والمستويات كلها
  [['R-FAT', 320], ['R-BRD', 240], ['R-HAT', 212], ['W-F12', 190], ['W-HAT', 160], ['W-BRD', 110]].forEach(function (x) { visit('E003', N.E3, x[0], x[1], 3); });
  // ماكينة التحصين المتنقلة: بين محطات القطاعين
  [['R-FAT', 300], ['W-F21', 268], ['W-F03', 236], ['W-F12', 204]].forEach(function (x) { visit('Q001', N.Q1, x[0], x[1], 2, 'تنظيف المعدة من المخلفات، تطهير المعدة بالرش أو التبخير'); });
  // عامل تسمين ثابت في محطته: ليس ناقلاً
  [300, 276, 252, 228, 204, 180, 156, 132].forEach(function (h) { visit('E005', N.E5, 'W-F05', h, 8); });
  return out;
}


/** حركة يومية روتينية لآخر 7 أيام (عمال كل موقع في موقعهم) لتظهر الاتجاهات ومؤشرات الخطر في نسخة العرض */
function BIO_seedDaily(now, sites) {
  var H = BIO.HOUR, D = 24 * H, out = [], k = 0, emp = BIO_EMPLOYEES.split(';').map(function (r) { return r.split('|'); });
  var home = sites.filter(function (s) { return s.external !== BIO.YES; });
  var cpOf = function (s) { return s.sector === 'ريجوا' ? 'منطقة التطهير المركزية - ريجوا' : /محطة/.test(s.name) ? 'منطقة تطهير التسمين كلين - الواحات' : 'منطقة التطهير المركزية - الواحات'; };
  var day0 = now - ((now + 3 * H) % D); // منتصف ليل اليوم بتوقيت القاهرة
  var pc = 'استحمام كامل، تغيير الملابس والحذاء بملابس الموقع، تطهير اليدين';
  function mv(t, e, s, dir, extra) {
    if (t >= now) return;
    out.push(Object.assign({ id: 'D-SEED-' + (++k), time: t, itemId: e[0], itemName: e[1], siteId: s.id, siteName: s.name, dir: dir, decision: BIO.ALLOW, reason: '', checks: dir === BIO.IN ? pc : '', user: cpOf(s).replace('منطقة', 'أمن'), checkpoint: cpOf(s), offline: '', flag: '', via: 'مسح الكارت', updatedAt: t }, extra || {}));
  }
  // آخر 14 يوماً · محاولات مرفوضة يومياً (الأقدم أكثر): تُظهر تحسن الالتزام عن الأسبوع السابق
  var denials = [1, 2, 2, 3, 4, 4, 5, 5, 6, 4, 6, 5, 5, 6], hot = ['W-BRD', 'W-F05', 'W-HAT', 'W-F05', 'R-BRD', 'W-BRD', 'W-F10'];
  for (var d = 13; d >= 0; d--) {
    var base = day0 - d * D;
    emp.forEach(function (e, i) {
      var s = home[i % home.length], tin = base + (6.5 + (i % 5) * 0.25) * H, tout = base + (15 + (i % 4) * 0.5) * H;
      if (d === 0 && i % 3 === 0) return; // إجازات اليوم
      var extra = null;
      if (d === 3 && i === 7) extra = { via: 'إدخال يدوي · الكارت تالف ولا يُقرأ' };
      if (d === 1 && (i === 12 || i === 25)) extra = { via: 'إدخال يدوي · نسي الكارت' };
      if ((d === 10 && i === 15) || (d === 8 && (i === 20 || i === 30)) || (d === 12 && i === 3)) extra = { via: 'إدخال يدوي · نسي الكارت' };
      if ((d === 5 && i === 4) || (d === 9 && i === 18) || (d === 11 && i === 27)) extra = { offline: BIO.YES, flag: 'مخالفة دون اتصال: دخل قبل انتهاء العزل' };
      mv(tin, e, s, BIO.IN, extra); mv(tout, e, s, BIO.OUT);
    });
    for (var j = 0; j < denials[d]; j++) {
      var e = emp[(d * 7 + j * 5) % emp.length], s = home.filter(function (x) { return x.id === hot[(d + j) % hot.length]; })[0];
      mv(base + (8 + j * 1.7) * H, e, s, BIO.IN, { decision: BIO.DENY, reason: 'لم تنتهِ فترة العزل المطلوبة بعد زيارة موقع أقل أماناً', checks: '' });
    }
  }
  // دخول استثنائي بموافقة المدير (منذ 5 و6 أيام)
  [[6, 2, 'W-HAT'], [5, 9, 'W-BRD'], [9, 3, 'W-F05'], [11, 6, 'W-BRD'], [12, 8, 'W-HAT'], [13, 11, 'R-BRD']].forEach(function (x) { var e = emp[x[1]], s = home.filter(function (y) { return y.id === x[2]; })[0]; mv(day0 - x[0] * D + 11 * H, e, s, BIO.IN, { decision: BIO.OVERRIDE, reason: 'زيارة طارئة | تمت الموافقة بواسطة مدير الأمن الحيوي' }); mv(day0 - x[0] * D + 13 * H, e, s, BIO.OUT); });
  return out;
}

/* ============================ محرك قواعد العزل ============================ */

/** وقت القاهرة مقروء في رسائل الإيميل والإشعارات: الأحد 2026/10/05 · 09:30 */
function BIO_fmtTime(t) {
  var d = new Date(BIO_ms(t) + 3 * BIO.HOUR), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][d.getUTCDay()] + ' ' + d.getUTCFullYear() + '/' + p(d.getUTCMonth() + 1) + '/' + p(d.getUTCDate()) + ' · ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}
function BIO_norm(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function BIO_ms(v) { return v instanceof Date ? v.getTime() : (typeof v === 'number' ? v : (v ? new Date(v).getTime() : 0)); }
/** كود الكارت: الإصدار الأول يطبع الكود فقط (E001) والإصدارات التالية تضيف رقم الإصدار (E001.2) فيُرفض الكارت القديم المفقود */
function BIO_cardCode(id, ver) { ver = Number(ver) || 1; return BIO_norm(id) + (ver > 1 ? '.' + ver : ''); }
function BIO_parseCard(code) { var c = BIO_norm(code), m = c.match(/^(.+)\.(\d{1,3})$/); return m ? { id: m[1], ver: Number(m[2]) } : { id: c, ver: 1 }; }
function BIO_isYes(v) { var s = String(v).trim(); return s === BIO.YES || s.toLowerCase() === 'true' || s === '1'; }
function BIO_counted(m) { return m.decision === BIO.ALLOW || m.decision === BIO.OVERRIDE; }
function BIO_list(v) { return String(v == null ? '' : v).split(/[,،\n]+/).map(function (s) { return s.trim(); }).filter(String); }
function BIO_hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

function BIO_requiredHours(rules, fromLevel, toLevel) {
  for (var i = 0; i < rules.length; i++) {
    if (Number(rules[i].from) === Number(fromLevel) && Number(rules[i].to) === Number(toLevel)) return Number(rules[i].hours) || 0;
  }
  return 0;
}

/**
 * يحول حركات عنصر واحد (مرتبة زمنياً) إلى نقاط تماس: آخر وقت كان فيه العنصر داخل كل موقع.
 * - دخول بدون خروج مسجل ثم دخول موقع آخر: التماس مستمر حتى الدخول التالي (أسوأ احتمال).
 * - الزيارة الخارجية: التماس مستمر حتى أول دخول لموقع من مواقع الشركة بعدها.
 */
function BIO_contacts(moves, now) {
  var contacts = [], open = {}, ext = [];
  moves.forEach(function (m) {
    if (!BIO_counted(m)) return;
    var t = BIO_ms(m.time);
    if (m.dir === BIO.IN) {
      ext.forEach(function (x) { contacts.push({ siteId: x, time: t, ext: true }); });
      ext = [];
      Object.keys(open).forEach(function (s) { if (s !== m.siteId) { contacts.push({ siteId: s, time: t, missingExit: true }); delete open[s]; } });
      open[m.siteId] = t;
    } else if (m.dir === BIO.OUT) {
      delete open[m.siteId];
      contacts.push({ siteId: m.siteId, time: t });
    } else if (m.dir === BIO.EXT) {
      ext.push(m.siteId);
    }
  });
  Object.keys(open).forEach(function (s) { contacts.push({ siteId: s, time: now, missingExit: true, stillInside: true }); });
  ext.forEach(function (x) { contacts.push({ siteId: x, time: now, ext: true, stillOutside: true }); });
  return contacts;
}

function BIO_evaluate(ctx) {
  var now = ctx.now, target = ctx.target, settings = ctx.settings;
  var lookback = (Number(settings.LOOKBACK_HOURS) || 240) * BIO.HOUR;
  var alertHours = Number(settings.ALERT_HOURS) || 0;
  var bySite = {}, warnings = [];
  BIO_contacts(ctx.itemMoves, now).forEach(function (c) {
    var src = ctx.sitesById[c.siteId];
    if (!src) return;
    if (c.siteId === target.id) {
      if (c.stillInside) warnings.push('مسجل دخوله بالفعل لهذا الموقع ولم يُسجَّل خروجه');
      return;
    }
    if (now - c.time > lookback) return;
    if (c.stillInside) warnings.push('مسجل داخل «' + src.name + '» ولم يُسجَّل خروجه منه');
    else if (c.missingExit) warnings.push('لم يُسجَّل خروجه من «' + src.name + '»');
    var req = BIO_requiredHours(ctx.rules, src.level, target.level);
    var alert = src.status === BIO.ST_ALERT;
    if (alert) req = Math.max(req, alertHours);
    if (!req) return;
    var until = c.time + req * BIO.HOUR;
    if (until <= now) return;
    if (!bySite[c.siteId] || bySite[c.siteId].until < until) {
      bySite[c.siteId] = {
        siteId: c.siteId, siteName: src.name, level: Number(src.level), alert: alert,
        hoursSince: Math.max(0, Math.floor((now - c.time) / BIO.HOUR)), required: req,
        remaining: Math.ceil((until - now) / BIO.HOUR), until: until, stillInside: !!c.stillInside
      };
    }
  });
  var violations = Object.keys(bySite).map(function (k) { return bySite[k]; }).sort(function (a, b) { return b.until - a.until; });
  var reasons = violations.map(function (v) {
    var where = v.stillInside ? 'مسجل حالياً داخل «' + v.siteName + '»' : 'كان في «' + v.siteName + '» منذ ' + v.hoursSince + ' ساعة';
    return where + '، والمطلوب ' + v.required + ' ساعة عزل' + (v.alert ? ' (الموقع في حالة إنذار)' : '') + '، متبقي ' + v.remaining + ' ساعة';
  });
  return { decision: violations.length ? BIO.DENY : BIO.ALLOW, violations: violations, warnings: warnings, reasons: reasons, allowedAt: violations.length ? violations[0].until : null };
}

/* ============================ العمليات ============================ */

/**
 * store: { all(t), find(t, key), append(t, obj), update(t, key, patch), remove(t, key) }
 * deps:  { now(), id(prefix), notify(evt), lock(fn) }
 * evt:   { kind: 'deny'|'request'|'decision'|'notice'|'violation'|'site', title, body, approvalId?, toUserId?, target? }
 */
function BIO_api(store, deps) {
  function settings() {
    var s = {};
    store.all('settings').forEach(function (r) { s[String(r.key).trim()] = r.value; });
    return s;
  }
  function sitesById() {
    var m = {};
    store.all('sites').forEach(function (s) {
      m[BIO_norm(s.id)] = { id: BIO_norm(s.id), name: s.name, sector: s.sector || '', level: Number(s.level), type: s.type, status: String(s.status || '').trim() || BIO.ST_ACTIVE, external: BIO_isYes(s.external), lat: s.lat === '' || s.lat == null ? null : Number(s.lat), lng: s.lng === '' || s.lng == null ? null : Number(s.lng), geo: String(s.geo || '') };
    });
    // v13: وجهات الخروج الخطرة تُعامل كمواقع خارجية (مستوى 4) حتى لو لم تُضف في شيت المواقع
    BIO_EXT_DEST.forEach(function (d) { if (d.risk && !m[d.id]) m[d.id] = { id: d.id, name: d.name, sector: 'خارج الشركة', level: 4, type: 'وجهة خارجية', status: BIO.ST_ACTIVE, external: true, lat: null, lng: null, geo: '', virtual: true }; });
    return m;
  }
  function sitesList(sites) { return Object.keys(sites).map(function (k) { return sites[k]; }); }
  function userByPin(pin) {
    var p = String(pin == null ? '' : pin).trim();
    if (!p) return null;
    var list = store.all('users');
    for (var i = 0; i < list.length; i++) if (String(list[i].pin).trim() === p) return list[i];
    return null;
  }
  /** نطاق المستخدم: كل الشركة، أو قطاعات، أو مواقع بعينها */
  function scopeOf(u, sites) {
    var role = BIO_role(u.role), raw = BIO_list(u.scope);
    if (!role || role.scope === 'none' || role.scope === 'gate' || !raw.length) {
      if (role && role.scope === 'site' && !raw.length && u.gate && sites[BIO_norm(u.gate)]) raw = [u.gate];
      else return { all: true, sectors: [], sites: [], label: 'كل القطاعات' };
    }
    var sec = [], st = [], names = [];
    raw.forEach(function (x) {
      var id = BIO_norm(x);
      if (sites[id]) { st.push(id); names.push(sites[id].name); }
      else { sec.push(String(x).trim()); names.push('قطاع ' + String(x).trim()); }
    });
    return { all: false, sectors: sec, sites: st, label: names.join('، ') };
  }
  function inScope(u, siteId, sites) {
    if (!u.scope || u.scope.all) return true;
    var id = BIO_norm(siteId), s = (sites || sitesById())[id];
    return u.scope.sites.indexOf(id) >= 0 || !!(s && u.scope.sectors.indexOf(s.sector) >= 0);
  }
  function gateInScope(u, gateId, sites) {
    if (!u.scope || u.scope.all) return true;
    sites = sites || sitesById();
    var cp = store.find('checkpoints', gateId);
    if (cp) return u.scope.sectors.indexOf(cp.sector) >= 0 || BIO_list(cp.serves).some(function (x) { return u.scope.sites.indexOf(BIO_norm(x)) >= 0; });
    return inScope(u, gateId, sites);
  }
  /** need: true = أي حساب إداري، أو اسم صلاحية مثل 'decide' */
  function auth(pin, need) {
    var u = userByPin(pin);
    if (!u) throw new Error('الرقم السري غير صحيح');
    if (u.active != null && String(u.active).trim() === BIO.NO) throw new Error('هذا الحساب موقوف. راجع مدير الأمن الحيوي');
    var role = String(u.role).trim(), r = BIO_role(role) || BIO_role(BIO.ROLE_GUARD);
    var isMgr = r.k !== BIO.ROLE_GUARD, perms = BIO_userPerms({ role: r.k, perms: u.perms });
    // حساب التقارير فقط (المفتش / المعاون): لا يصل لعمليات نظام البوابات
    if (r.reportsOnly && need !== 'login' && need !== 'vr') throw new Error('حسابك مخصص لتقارير الزيارات فقط');
    if (need === 'login') need = null;
    else if (need === 'vr') need = true;
    if (need && !isMgr) throw new Error('هذه العملية للمديرين فقط');
    if (typeof need === 'string' && perms.indexOf(need) < 0) {
      var pd = BIO_PERMS.filter(function (x) { return x.k === need; })[0];
      throw new Error('ليست لديك صلاحية: ' + (pd ? pd.label : need) + '. اطلبها من مدير الأمن الحيوي');
    }
    var out = { id: BIO_norm(u.id), name: u.name, role: r.k, roleLabel: r.label, gateId: BIO_norm(u.gate), phone: u.phone, isManager: isMgr, isAdmin: r.k === BIO.ROLE_MANAGER, reportsOnly: !!r.reportsOnly, perms: perms };
    out.scope = isMgr ? scopeOf(u, sitesById()) : null;
    return out;
  }
  /** المواقع التي يسجل لها المستخدم وقطاعه */
  function gateFor(u, sites) {
    var company = sitesList(sites).filter(function (s) { return !s.external; });
    var cp = u.gateId ? store.find('checkpoints', u.gateId) : null;
    if (cp) {
      return { id: BIO_norm(cp.id), name: cp.name, sector: cp.sector, sites: BIO_list(cp.serves).map(BIO_norm).map(function (i) { return sites[i]; }).filter(Boolean) };
    }
    if (u.gateId && sites[u.gateId]) return { id: u.gateId, name: sites[u.gateId].name, sector: sites[u.gateId].sector, sites: [sites[u.gateId]] };
    if (u.isManager) return { id: '', name: 'كل المواقع', sector: '', sites: company };
    return { id: '', name: '', sector: '', sites: [] };
  }
  function noticeFor(n, u, gate) {
    var t = String(n.target || 'ALL');
    if (u.isManager || t === 'ALL') return true;
    if (t === 'SECTOR:' + gate.sector) return true;
    if (t === 'GATE:' + gate.id) return true;
    return false;
  }
  function targetName(t) {
    t = String(t || 'ALL');
    if (t === 'ALL') return 'كل البوابات';
    if (t === 'MANAGERS') return 'المديرين';
    if (t.indexOf('SECTOR:') === 0) return 'قطاع ' + t.slice(7);
    if (t.indexOf('GATE:') === 0) { var c = store.find('checkpoints', t.slice(5)); return c ? c.name : t.slice(5); }
    return t;
  }
  function normMove(m) {
    return { id: m.id, time: BIO_ms(m.time), itemId: BIO_norm(m.itemId), itemName: m.itemName, siteId: BIO_norm(m.siteId), siteName: m.siteName, dir: m.dir, decision: m.decision, reason: m.reason || '', checks: m.checks || '', user: m.user, checkpoint: m.checkpoint || '', offline: m.offline || '', flag: m.flag || '', via: m.via || '', updatedAt: BIO_ms(m.updatedAt) || BIO_ms(m.time) };
  }
  function allMoves() { return store.all('moves').map(normMove).sort(function (a, b) { return a.time - b.time; }); }
  function movesOf(itemId, before) {
    return allMoves().filter(function (m) { return m.itemId === itemId && (before == null || m.time < before); });
  }
  function itemInfo(it) { return it ? { id: BIO_norm(it.id), name: it.name, kind: it.kind || '', dept: it.dept || '', phone: it.phone ? String(it.phone) : '', active: it.active === true || BIO_isYes(it.active), card: Number(it.card) || 1, watch: it.watch ? String(it.watch) : '', company: it.company ? BIO_norm(it.company) : '', plate: it.plate ? String(it.plate) : '', vtype: it.vtype ? String(it.vtype) : '', track: BIO_isYes(it.track), added: it.added ? BIO_ms(it.added) : 0 } : null; }
  function checksFor(item, st) {
    if (!item) return [];
    var k = String(item.kind);
    return BIO_list(k === 'مركبة' ? st.CHECKS_VEHICLE : k === 'معدة' ? st.CHECKS_EQUIPMENT : st.CHECKS_PERSON);
  }
  function companyLevels(sites) {
    var lv = {}, guarded = {};
    store.all('rules').forEach(function (r) { if (Number(r.hours) > 0) guarded[Number(r.to)] = true; });
    sitesList(sites).forEach(function (s) { if (!s.external && s.level && guarded[s.level]) lv[s.level] = true; });
    return Object.keys(lv).map(Number).sort();
  }
  function record(m) { m.updatedAt = deps.now(); deps.lock(function () { store.append('moves', m); }); return m; }
  function patchMove(id, patch) { patch.updatedAt = deps.now(); store.update('moves', id, patch); }
  /** تسجيل مأمورية: من حساب (مدير أو بوابة) أو من نموذج الموظف الذاتي (u.self) */
  function addMission(u, m) {
    m = m || {};
    if (m.id && store.find('missions', m.id)) return { id: m.id, duplicate: true };
    var sites = sitesById(), st = settings(), now = deps.now(), site = sites[BIO_norm(m.siteId)];
    if (!site || site.external) throw new Error('اختر الموقع المطلوب زيارته');
    if (u.isManager && !inScope(u, site.id, sites)) throw new Error('هذا الموقع خارج نطاق إدارتك');
    var visitor = String(m.visitor || '').trim(), kind = BIO.MISSION_KINDS.indexOf(m.kind) >= 0 ? m.kind : BIO.MISSION_KINDS[0];
    if (!visitor) throw new Error('اكتب اسم الزائر أو المأمور');
    var visitAt = BIO_ms(m.visitAt);
    if (!visitAt || visitAt < now - 5 * 60000) throw new Error('موعد الزيارة يجب أن يكون في المستقبل');
    var endAt = BIO_ms(m.endAt) || visitAt + 8 * BIO.HOUR;
    if (endAt <= visitAt) throw new Error('نهاية الزيارة يجب أن تكون بعد بدايتها');
    if (!String(m.purpose || '').trim()) throw new Error('اكتب الغرض من المأمورية');
    var lead = Number(st.MISSION_LEAD_HOURS) || 24, hrs = Math.round((visitAt - now) / BIO.HOUR * 10) / 10, late = hrs < lead;
    // الكود: من الأفراد المسجلين، أو يُسجَّل الزائر تلقائياً بكود جديد ليُطبع له كارت أو يُرسل له
    var itemId = BIO_norm(m.itemId), item = itemId ? itemInfo(store.find('items', itemId)) : null;
    if (itemId && !item) throw new Error('الكود ' + itemId + ' غير مسجل. اتركه فارغاً لتسجيل زائر جديد');
    if (!item) {
      var n = store.all('items').filter(function (x) { return /^VS\d+$/.test(BIO_norm(x.id)); }).length + 1;
      do { itemId = 'VS' + ('00' + n).slice(-3); n++; } while (store.find('items', itemId));
      store.append('items', { id: itemId, name: visitor, kind: kind === 'توريد' ? 'مورد' : 'زائر', dept: m.company || 'جهة خارجية', phone: m.phone || '', active: BIO.YES });
      item = itemInfo(store.find('items', itemId));
    }
    var row = { id: m.id || deps.id('MS'), time: now, kind: kind, visitor: item.name, itemId: itemId, company: m.company || item.dept || '', phone: m.phone || item.phone || '', siteId: site.id, siteName: site.name, visitAt: visitAt, endAt: endAt,
      purpose: String(m.purpose).trim(), lastContact: m.lastContact || '', lastContactAt: BIO_ms(m.lastContactAt) || '', vehicle: m.vehicle || '', requestedBy: u.name, requestedById: u.id, email: String(m.email || '').trim(),
      leadHours: hrs, late: late ? BIO.YES : BIO.NO, status: late ? BIO.MS_LATE : BIO.MS_OK, decidedBy: '', decidedAt: '', note: '', arrivedAt: '' };
    deps.lock(function () { store.append('missions', row); });
    var when = BIO_fmtTime;
    deps.notify({ kind: 'mission', siteId: site.id, emailTo: [row.email], title: (late ? '⚠️ مأمورية متأخرة تحتاج استثناء: ' : '📋 مأمورية مسجلة: ') + row.visitor + ' ← ' + site.name,
      body: 'النوع: ' + kind + '\nالزائر: ' + row.visitor + ' (' + itemId + ')' + (row.company ? ' · ' + row.company : '') + '\nالموقع: ' + site.name + '\nالموعد: ' + when(visitAt) + ' حتى ' + when(endAt) + '\nالغرض: ' + row.purpose +
        (row.lastContact ? '\nآخر مخالطة دواجن: ' + row.lastContact + (row.lastContactAt ? ' · ' + when(row.lastContactAt) : '') : '') + (row.vehicle ? '\nالمركبة: ' + row.vehicle : '') +
        '\nمقدم الطلب: ' + u.name + (u.self ? ' (الموظف نفسه من نموذج الطلب الذاتي، تم التحقق بالكود ورقم الهاتف' + (u.bound ? '، ورُبط هذا الرقم بكوده لأول مرة' : '') + ')' : '') + '\nسُجلت قبل الموعد بـ ' + hrs + ' ساعة' + (late ? ' (أقل من ' + lead + ' ساعة المطلوبة: لن تُدخلها البوابة إلا باستثناء المدير)' : ' · ستظهر للبوابة تلقائياً يوم الزيارة') });
    return { mission: missionOut(row), late: late, lead: lead };
  }
  var STAFF_KINDS = ['موظف', 'عامل', 'سائق'];
  function phoneKey(v) { var d = String(v || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; }
  /** يتحقق من الموظف بكوده ورقم هاتفه. لو لا يوجد رقم مسجل له يُربط الرقم بأول طلب ويُبلَّغ المدير */
  function selfStaff(code, phone, bind) {
    var id = BIO_norm(BIO_parseCard(code).id), it = itemInfo(store.find('items', id)), pk = phoneKey(phone);
    if (!id || !it || STAFF_KINDS.indexOf(it.kind) < 0) throw new Error('كود الموظف غير صحيح. الكود مكتوب على كارت الأمن الحيوي الخاص بك');
    if (!it.active) throw new Error('هذا الكود موقوف. تواصل مع الأمن الحيوي');
    if (!pk) throw new Error('اكتب رقم هاتفك المحمول كاملاً');
    var have = phoneKey(it.phone);
    if (have && have !== pk) throw new Error('رقم الهاتف لا يطابق الرقم المسجل لهذا الكود');
    if (!have && bind) { store.update('items', id, { phone: String(phone).replace(/[^\d+]/g, '') }); it.bound = true; }
    return it;
  }
  function missionOut(m) {
    return { id: m.id, time: BIO_ms(m.time), kind: m.kind, visitor: m.visitor, itemId: BIO_norm(m.itemId), company: m.company || '', phone: String(m.phone || ''), siteId: BIO_norm(m.siteId), siteName: m.siteName, visitAt: BIO_ms(m.visitAt), endAt: BIO_ms(m.endAt) || (BIO_ms(m.visitAt) + 10 * BIO.HOUR), purpose: m.purpose || '', lastContact: m.lastContact || '', lastContactAt: BIO_ms(m.lastContactAt) || null, vehicle: m.vehicle || '', requestedBy: m.requestedBy || '', requestedById: BIO_norm(m.requestedById), email: m.email || '', leadHours: Number(m.leadHours) || 0, late: BIO_isYes(m.late), status: String(m.status || ''), decidedBy: m.decidedBy || '', decidedAt: BIO_ms(m.decidedAt) || null, note: m.note || '', arrivedAt: BIO_ms(m.arrivedAt) || null, decl: m.decl ? String(m.decl) : '', declRisk: m.declRisk || '', declFlag: m.declFlag || '' };
  }
  function missionValid(m) { return m.status === BIO.MS_OK || m.status === BIO.MS_EXC || m.status === BIO.MS_DONE; }
  /** مأمورية صالحة لهذا الشخص على هذا الموقع الآن (من ساعتين قبل الموعد حتى نهاية الزيارة) */
  function missionFor(itemId, siteId, t) {
    var hit = null;
    store.all('missions').forEach(function (r) {
      var m = missionOut(r);
      if (m.itemId === itemId && m.siteId === siteId && missionValid(m) && t >= m.visitAt - 2 * BIO.HOUR && t <= m.endAt && (!hit || m.visitAt < hit.visitAt)) hit = m;
    });
    return hit;
  }
  function refData() {
    var sites = sitesList(sitesById());
    var data = {
      sites: sites,
      checkpoints: store.all('checkpoints').map(function (c) { return { id: BIO_norm(c.id), name: c.name, sector: c.sector, serves: BIO_list(c.serves).map(BIO_norm) }; }),
      rules: store.all('rules').map(function (r) { return { id: r.id, from: Number(r.from), to: Number(r.to), hours: Number(r.hours) || 0, note: r.note || '' }; }),
      items: store.all('items').map(itemInfo).filter(function (i) { return i && i.id; }),
      settings: (function () { var s = settings(); var o = {}; ['COMPANY', 'APP_URL', 'MANAGER_PHONE', 'MANAGER_EMAIL', 'ALERT_HOURS', 'LOOKBACK_HOURS', 'DOWNTIME_DAYS', 'CHECKS_PERSON', 'CHECKS_VEHICLE', 'CHECKS_EQUIPMENT', 'SHOWER_MIN', 'VEH_CERT_HOURS', 'MISSION_LEAD_HOURS', 'VISITOR_NEEDS_MISSION', 'ACADEMY_REQUIRED', 'LITTER_BLOCK_HOURS', 'TV_SECONDS', 'BIRD_ALERT_LEVEL'].forEach(function (k) { o[k] = s[k]; }); return o; })(),
      companies: store.all('companies').map(function (c) { return { id: BIO_norm(c.id), name: c.name, type: c.type || '', status: String(c.status || 'نشط').trim(), reason: c.reason || '' }; }),
      missions: store.all('missions').map(missionOut).filter(function (m) { return missionValid(m) && m.visitAt > deps.now() - 2 * 24 * BIO.HOUR && m.visitAt < deps.now() + 3 * 24 * BIO.HOUR; }).map(function (m) { return { id: m.id, kind: m.kind, visitor: m.visitor, itemId: m.itemId, company: m.company, siteId: m.siteId, siteName: m.siteName, visitAt: m.visitAt, endAt: m.endAt, purpose: m.purpose, status: m.status, requestedBy: m.requestedBy, arrivedAt: m.arrivedAt, declRisk: m.declRisk, declFlag: m.declFlag }; })
    };
    data.version = BIO_hash(JSON.stringify(data));
    return data;
  }
  function session(u) {
    var sites = sitesById(), gate = gateFor(u, sites), st = settings();
    return {
      user: { id: u.id, name: u.name, role: u.role, roleLabel: u.roleLabel, isManager: u.isManager, isAdmin: !!u.isAdmin, reportsOnly: !!u.reportsOnly, perms: u.perms || [], scope: u.scope ? { all: u.scope.all, sectors: u.scope.sectors, sites: u.scope.sites, label: u.scope.label } : null },
      gate: { id: gate.id, name: gate.name, sector: gate.sector, siteIds: gate.sites.map(function (s) { return s.id; }) },
      company: st.COMPANY || '', managerPhone: st.MANAGER_PHONE || '', managerEmail: st.MANAGER_EMAIL || ''
    };
  }
  function myNotices(u) {
    var gate = gateFor(u, sitesById());
    var acked = {};
    store.all('acks').forEach(function (a) { if (BIO_norm(a.userId) === u.id) acked[a.noticeId] = true; });
    var counts = {};
    if (u.isManager) store.all('acks').forEach(function (a) { counts[a.noticeId] = (counts[a.noticeId] || 0) + 1; });
    return store.all('notices').filter(function (n) { return noticeFor(n, u, gate); })
      .map(function (n) { return { id: n.id, time: BIO_ms(n.time), from: n.from, target: n.target, targetName: targetName(n.target), level: n.level, title: n.title, body: n.body, acked: !!acked[n.id], ackCount: counts[n.id] || 0 }; })
      .sort(function (a, b) { return b.time - a.time; }).slice(0, 50);
  }
  function approvalOut(a) {
    return { id: a.id, time: BIO_ms(a.time), moveId: a.moveId, itemId: a.itemId, itemName: a.itemName, siteId: a.siteId, siteName: a.siteName, reason: a.reason, note: a.note, requestedBy: a.requestedBy, requestedById: a.requestedById, status: a.status, decidedBy: a.decidedBy, decidedAt: a.decidedAt ? BIO_ms(a.decidedAt) : null, updatedAt: BIO_ms(a.updatedAt) || BIO_ms(a.time) };
  }
  /* ---------- البلاغات العاجلة والرسائل ---------- */
  function reportOut(r, full) {
    var o = { id: r.id, time: BIO_ms(r.time), type: r.type, siteId: BIO_norm(r.siteId), siteName: r.siteName, gate: r.gate, fromId: BIO_norm(r.fromId), fromName: r.fromName, note: r.note || '', status: r.status, readAt: BIO_ms(r.readAt), ackAt: BIO_ms(r.ackAt), ackBy: r.ackBy || '', action: r.action || '', escLevel: Number(r.escLevel) || 0, escAt: BIO_ms(r.escAt), closedAt: BIO_ms(r.closedAt), updatedAt: BIO_ms(r.updatedAt), hasPhoto: !!r.photo, hasVoice: !!r.voice };
    if (full) { o.photo = r.photo || ''; o.voice = r.voice || ''; }
    return o;
  }
  function allReports() { return store.all('reports').map(function (r) { return reportOut(r); }).sort(function (a, b) { return b.time - a.time; }); }
  function gateKey(u) { return u.isManager ? '' : BIO_norm(u.gateId); }
  function msgOut(m) { return { id: m.id, time: BIO_ms(m.time), gate: BIO_norm(m.gate), gateName: m.gateName, fromId: BIO_norm(m.fromId), fromName: m.fromName, fromMgr: BIO_isYes(m.fromMgr), text: m.text, readAt: BIO_ms(m.readAt), voice: m.voice || '' }; }
  function allMessages() { return store.all('messages').map(msgOut).sort(function (a, b) { return a.time - b.time; }); }
  function commsSummary(u) {
    var msgs = allMessages(), g = gateKey(u);
    if (u.isManager) {
      var rs = allReports(), sites = sitesById();
      if (u.scope && !u.scope.all) {
        rs = rs.filter(function (r) { return !r.siteId || inScope(u, r.siteId, sites); });
        msgs = msgs.filter(function (m) { return gateInScope(u, m.gate, sites); });
      }
      if (u.perms && u.perms.indexOf('reports') < 0) { msgs = []; rs = []; }
      return { unread: msgs.filter(function (m) { return !m.fromMgr && !m.readAt; }).length, open: rs.filter(function (r) { return r.status !== BIO.R_DONE; }).length, unseen: rs.filter(function (r) { return !r.readAt; }).length };
    }
    return {
      unread: msgs.filter(function (m) { return m.gate === g && m.fromMgr && !m.readAt; }).length,
      reports: allReports().filter(function (r) { return r.fromId === u.id || (r.gate && r.gate === gateFor(u, sitesById()).name); }).slice(0, 8)
    };
  }
  function reportStats(now) {
    var rs = allReports(), since = now - 30 * 24 * BIO.HOUR, acked = rs.filter(function (r) { return r.ackAt && r.time >= since; });
    var avg = acked.length ? acked.reduce(function (a, r) { return a + (r.ackAt - r.time); }, 0) / acked.length / 6e4 : null;
    return { open: rs.filter(function (r) { return r.status !== BIO.R_DONE; }), total30: rs.filter(function (r) { return r.time >= since; }).length, avgMin: avg == null ? null : Math.round(avg * 10) / 10, escalated30: rs.filter(function (r) { return r.time >= since && r.escLevel > 0; }).length };
  }
  function appUrl(hash) { var u = settings().APP_URL; return u ? '\n' + u + (hash || '') : ''; }

  function adminPerm(table) { return table === 'items' ? 'data' : 'admin'; }
  function userOut(x, sites) {
    var r = BIO_role(x.role) || BIO_role(BIO.ROLE_GUARD), g = r.k === BIO.ROLE_GUARD ? gateFor({ gateId: BIO_norm(x.gate), isManager: false }, sites) : null;
    var sc = r.k === BIO.ROLE_GUARD ? null : scopeOf(x, sites), own = BIO_list(x.perms);
    return { id: BIO_norm(x.id), name: x.name, role: r.k, roleLabel: r.label, gate: BIO_norm(x.gate), gateName: g ? g.name || '' : '', sector: g ? g.sector || '' : '',
      scope: BIO_list(x.scope).map(String), scopeLabel: sc ? sc.label : '', perms: BIO_userPerms({ role: r.k, perms: x.perms }), custom: r.k !== BIO.ROLE_MANAGER && r.k !== BIO.ROLE_GUARD && own.length > 0,
      phone: x.phone ? String(x.phone) : '', active: !(x.active != null && String(x.active).trim() === BIO.NO), demoPin: ['1111', '2222', '3333', '9999'].indexOf(String(x.pin).trim()) >= 0 };
  }

  /* ---------- نموذج الخطر والالتزام (مركز القيادة) ---------- */
  var RISK_BANDS = [[75, 'حرج', 'crit'], [50, 'مرتفع', 'high'], [25, 'متوسط', 'mid'], [0, 'منخفض', 'low']];
  function riskBand(v) { for (var i = 0; i < RISK_BANDS.length; i++) if (v >= RISK_BANDS[i][0]) return { label: RISK_BANDS[i][1], k: RISK_BANDS[i][2] }; }
  /** يحسب مؤشر الخطر اليومي (0-100) لكل موقع، ومؤشر الالتزام اليومي لآخر 7 أيام، وحالة الجاهزية */
  function riskModel(u, now, sites, allM, openReports) {
    var D = 24 * BIO.HOUR, wk = now - 7 * D, sc = function (id) { return inScope(u, id, sites); };
    var items = {}; store.all('items').forEach(function (i) { items[BIO_norm(i.id)] = itemInfo(i); });
    var bySite = {}, byItem = {};
    allM.forEach(function (m) { (byItem[m.itemId] = byItem[m.itemId] || []).push(m); });
    sitesList(sites).filter(function (s) { return !s.external && sc(s.id); }).forEach(function (s) {
      bySite[s.id] = { id: s.id, name: s.name, sector: s.sector, level: s.level, status: s.status, f: { status: 0, reports: 0, denied: 0, overrides: 0, flags: 0, manual: 0, watch: 0, ext: 0, up: 0 } };
    });
    var cnt = {};
    function bump(id, k) { (cnt[id] = cnt[id] || {})[k] = (cnt[id][k] || 0) + 1; }
    allM.forEach(function (m) {
      if (m.time < wk || !bySite[m.siteId] || m.dir !== BIO.IN) return;
      if (m.decision === BIO.DENY || m.decision === BIO.PENDING) bump(m.siteId, 'denied');
      if (m.decision === BIO.OVERRIDE) bump(m.siteId, 'overrides');
      if (m.flag) bump(m.siteId, 'flags');
      if (/يدوي/.test(m.via)) bump(m.siteId, 'manual');
      if (!BIO_counted(m)) return;
      var it = items[m.itemId]; if (it && it.watch) bump(m.siteId, 'watch');
      // تعرّض: زيارة خارجية خلال 7 أيام قبل الدخول، أو صعود من مستوى أقل أماناً خلال 72 ساعة
      var prev = (byItem[m.itemId] || []).filter(function (x) { return x.time < m.time && x.time >= m.time - 7 * D && BIO_counted(x) && x.siteId !== m.siteId; });
      if (prev.some(function (x) { return x.dir === BIO.EXT || (sites[x.siteId] && sites[x.siteId].external); })) bump(m.siteId, 'ext');
      else if (prev.some(function (x) { var s = sites[x.siteId]; return s && x.time >= m.time - 72 * BIO.HOUR && Number(s.level) > Number(bySite[m.siteId].level); })) bump(m.siteId, 'up');
    });
    (openReports || []).forEach(function (r) { if (r.siteId && bySite[BIO_norm(r.siteId)]) bump(BIO_norm(r.siteId), 'reports'); });
    var W = { reports: [25, 40, 'بلاغ عاجل مفتوح'], denied: [6, 24, 'محاولة دخول مرفوضة'], overrides: [5, 15, 'دخول استثنائي'], flags: [10, 20, 'مخالفة مسجلة دون اتصال'], manual: [3, 9, 'دخول يدوي بدون كارت'], watch: [8, 16, 'دخول شخص تحت المراقبة المشددة'], ext: [6, 18, 'دخول بعد زيارة جهة خارجية'], up: [4, 12, 'دخول من مستوى أقل أماناً خلال 72 ساعة'] };
    var mult = { 1: 1.25, 2: 1.15, 3: 1, 4: 0.9 };
    var risk = Object.keys(bySite).map(function (id) {
      var s = bySite[id], c = cnt[id] || {}, factors = [], sum = 0;
      if (s.status === BIO.ST_CLOSED) { sum += 50; factors.push({ label: 'الموقع مغلق', n: 1, pts: 50 }); }
      else if (s.status === BIO.ST_ALERT) { sum += 30; factors.push({ label: 'الموقع في حالة إنذار', n: 1, pts: 30 }); }
      Object.keys(W).forEach(function (k) { if (!c[k]) return; var pts = Math.min(W[k][1], c[k] * W[k][0]); sum += pts; factors.push({ label: W[k][2], n: c[k], pts: pts }); });
      var score = Math.min(100, Math.round(sum * (mult[Number(s.level)] || 1)));
      factors.sort(function (a, b) { return b.pts - a.pts; });
      var b = riskBand(score);
      return { id: s.id, name: s.name, sector: s.sector, level: s.level, status: s.status, score: score, band: b.label, bk: b.k, factors: factors, mult: mult[Number(s.level)] || 1 };
    }).sort(function (a, b) { return b.score - a.score; });
    // سلاسل يومية لآخر 7 أيام (اليوم آخر عنصر)
    var days = [];
    for (var d = 6; d >= 0; d--) days.push({ start: now - (d + 1) * D, allowed: 0, denied: 0, overrides: 0, flags: 0, attempts: 0, clean: 0, reports: 0, sectors: {} });
    allM.forEach(function (m) {
      if (m.time < now - 7 * D || m.dir !== BIO.IN || !bySite[m.siteId]) return;
      var x = days[Math.min(6, Math.floor((m.time - (now - 7 * D)) / D))], sec = bySite[m.siteId].sector;
      var ss = x.sectors[sec] = x.sectors[sec] || { attempts: 0, clean: 0 };
      x.attempts++; ss.attempts++;
      if (m.decision === BIO.ALLOW && !m.flag) { x.clean++; ss.clean++; }
      if (m.decision === BIO.ALLOW) x.allowed++;
      else if (m.decision === BIO.OVERRIDE) x.overrides++;
      else if (m.decision === BIO.DENY || m.decision === BIO.PENDING) x.denied++;
      if (m.flag) x.flags++;
    });
    allReports().forEach(function (r) { if (r.time >= now - 7 * D && (!r.siteId || bySite[BIO_norm(r.siteId)])) days[Math.min(6, Math.floor((r.time - (now - 7 * D)) / D))].reports++; });
    var pct = function (c, a) { return a ? Math.round(c / a * 1000) / 10 : null; };
    days.forEach(function (x) { x.compliance = pct(x.clean, x.attempts); Object.keys(x.sectors).forEach(function (k) { x.sectors[k].compliance = pct(x.sectors[k].clean, x.sectors[k].attempts); }); });
    var tot = days.reduce(function (a, x) { a.c += x.clean; a.a += x.attempts; return a; }, { c: 0, a: 0 });
    var compliance = pct(tot.c, tot.a);
    var sectorNames = {}; risk.forEach(function (r) { sectorNames[r.sector] = 1; });
    var bySector = Object.keys(sectorNames).map(function (k) {
      var t = days.reduce(function (a, x) { var s = x.sectors[k]; if (s) { a.c += s.clean; a.a += s.attempts; } return a; }, { c: 0, a: 0 });
      var rs = risk.filter(function (r) { return r.sector === k; });
      return { name: k, compliance: pct(t.c, t.a), attempts: t.a, series: days.map(function (x) { return x.sectors[k] ? x.sectors[k].compliance : null; }), maxRisk: rs.length ? rs[0].score : 0, avgRisk: rs.length ? Math.round(rs.reduce(function (a, r) { return a + r.score; }, 0) / rs.length) : 0, closed: rs.filter(function (r) { return r.status === BIO.ST_CLOSED; }).length, alert: rs.filter(function (r) { return r.status === BIO.ST_ALERT; }).length, sites: rs.length };
    });
    var avgRisk = risk.length ? risk.reduce(function (a, r) { return a + r.score; }, 0) / risk.length : 0;
    var posture = Math.round(0.6 * (compliance == null ? 100 : compliance) + 0.4 * (100 - avgRisk));
    var top = risk.length ? risk[0].score : 0, unread = (openReports || []).some(function (r) { return !r.readAt; });
    var readiness = risk.some(function (r) { return r.status === BIO.ST_CLOSED; }) || (unread && top >= 50) ? { k: 'red', label: 'طوارئ', note: 'موقع مغلق أو بلاغ حرج لم يُفتح' }
      : risk.some(function (r) { return r.status === BIO.ST_ALERT; }) || top >= 75 ? { k: 'orange', label: 'تأهب', note: 'موقع في إنذار أو خطر حرج' }
      : top >= 50 || (openReports || []).length ? { k: 'amber', label: 'يقظة', note: 'مؤشرات خطر مرتفعة تحتاج متابعة' }
      : { k: 'green', label: 'طبيعي', note: 'لا توجد مؤشرات خطر مرتفعة' };
    return { risk: risk, days: days, compliance: compliance, bySector: bySector, posture: posture, avgRisk: Math.round(avgRisk), readiness: readiness };
  }

  var api = {
    login: function (pin) { return session(auth(pin, 'login')); },

    /* ---------- المستخدمون والصلاحيات ---------- */
    usersList: function (pin) {
      var me = auth(pin, 'admin'), sites = sitesById();
      return { me: me.id, roles: BIO_ROLES, perms: BIO_PERMS, users: store.all('users').filter(function (x) { return x.id !== '' && x.id != null; }).map(function (x) { return userOut(x, sites); }) };
    },
    /** إضافة أو تعديل مستخدم. الرقم السري يُولَّد تلقائياً للمستخدم الجديد أو عند طلب رقم جديد */
    userSave: function (pin, row, originalKey) {
      var me = auth(pin, 'admin'), sites = sitesById();
      row = row || {};
      var id = BIO_norm(row.id || originalKey), name = String(row.name || '').trim(), role = BIO_role(row.role);
      if (!id) throw new Error('اكتب كود المستخدم (مثل الكود الوظيفي)');
      if (!name) throw new Error('اكتب الاسم');
      if (!role) throw new Error('اختر الدور');
      var existing = originalKey ? store.find('users', originalKey) : null;
      if (!existing && store.find('users', id)) throw new Error('الكود «' + id + '» موجود بالفعل');
      if (existing && BIO_norm(originalKey) !== id && store.find('users', id)) throw new Error('الكود «' + id + '» موجود بالفعل');
      if (existing && BIO_norm(existing.id) === me.id && role.k !== BIO.ROLE_MANAGER) throw new Error('لا يمكنك سحب صلاحية مدير الأمن الحيوي من حسابك');
      var gate = BIO_norm(row.gate || ''), scope = (row.scope || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
      if (role.scope === 'gate') {
        if (!gate) throw new Error('اختر البوابة التي يعمل عليها');
        if (!store.find('checkpoints', gate) && !sites[gate]) throw new Error('البوابة غير موجودة');
        scope = [];
      } else gate = '';
      if (role.scope === 'sector' && !scope.length) throw new Error('اختر القطاع أو القطاعات التي يديرها');
      if (role.scope === 'site' && !scope.length) throw new Error('اختر الموقع أو المواقع التي يديرها');
      if (role.scope === 'none') scope = [];
      var perms = role.k === BIO.ROLE_MANAGER || role.k === BIO.ROLE_GUARD ? [] : (row.perms || []).filter(function (p) { return BIO_PERMS.some(function (x) { return x.k === p; }); });
      if (role.k !== BIO.ROLE_MANAGER && perms.indexOf('admin') >= 0) perms = perms.filter(function (p) { return p !== 'admin'; });
      var same = perms.length === role.perms.length && perms.every(function (p) { return role.perms.indexOf(p) >= 0; });
      var newPin = '';
      if (!existing || row.newPin) { do { newPin = String(100000 + Math.floor(Math.random() * 900000)); } while (userByPin(newPin)); }
      var obj = { id: id, name: name, role: role.k, gate: gate, phone: String(row.phone || '').replace(/[^\d+]/g, ''), scope: scope.join(','), perms: same ? '' : perms.join(','), active: row.active === false ? BIO.NO : BIO.YES };
      if (newPin) obj.pin = newPin;
      deps.lock(function () {
        if (existing) store.update('users', originalKey, obj); else store.append('users', obj);
        store.append('cardlog', { id: deps.id('K'), time: deps.now(), itemId: id, itemName: name, action: existing ? (newPin ? 'تعديل مستخدم ورقم سري جديد' : 'تعديل مستخدم') + ': ' + role.label : 'مستخدم جديد: ' + role.label, card: '', by: me.name, note: obj.scope || gate });
      });
      return { ok: true, key: id, pin: newPin, user: userOut(store.find('users', id), sites), appUrl: settings().APP_URL || '' };
    },

    /** المزامنة: ينفذ العمليات المسجلة دون اتصال ثم يرجع كل ما تغيّر */
    sync: function (pin, p) {
      var u = auth(pin);
      p = p || {};
      var results = (p.ops || []).map(function (op) {
        try {
          var a = op.args || [];
          if (['scan', 'confirmEntry', 'cancelEntry', 'requestOverride', 'ackNotice', 'report', 'sendMessage'].indexOf(op.fn) < 0) throw new Error('عملية غير مسموحة');
          return { opId: op.opId, ok: true, data: api[op.fn].apply(null, [pin].concat(a)) };
        } catch (e) { return { opId: op.opId, ok: false, error: String(e && e.message || e) }; }
      });
      api.checkEscalations();
      var since = Number(p.since) || 0, now = deps.now(), st = settings();
      var lookFrom = now - (Number(st.LOOKBACK_HOURS) || 240) * BIO.HOUR - 48 * BIO.HOUR;
      var ref = refData();
      var moves = allMoves().filter(function (m) { return since ? m.updatedAt > since - 2000 : m.time >= lookFrom; });
      var approvals = store.all('approvals').map(approvalOut).filter(function (a) { return u.isManager ? (inScope(u, a.siteId) && (a.status === BIO.PENDING || a.updatedAt > since - 2000)) : a.requestedById === u.id && a.updatedAt > since - 2000; });
      return {
        serverTime: now, session: session(u), results: results,
        ref: p.refVersion === ref.version ? null : ref, refVersion: ref.version,
        moves: moves.map(function (m) { return { id: m.id, time: m.time, itemId: m.itemId, itemName: m.itemName, siteId: m.siteId, siteName: m.siteName, dir: m.dir, decision: m.decision, checkpoint: m.checkpoint, user: m.user, flag: m.flag, offline: m.offline, updatedAt: m.updatedAt }; }),
        approvals: approvals,
        pendingCount: store.all('approvals').filter(function (a) { return a.status === BIO.PENDING; }).length,
        notices: myNotices(u),
        comms: commsSummary(u)
      };
    },

    /** مسح كود على البوابة: p = { id?, time?, offline?, itemId, dir: 'IN'|'OUT', siteId, extSiteId } */
    scan: function (pin, p) {
      var u = auth(pin), now = deps.now(), sites = sitesById(), st = settings();
      if (p.id) { var dup = store.find('moves', p.id); if (dup) return { duplicate: true, moveId: dup.id, decision: dup.decision }; }
      var t = now;
      if (p.offline && p.time && p.time <= now + 5 * 60000 && p.time >= now - 7 * 24 * BIO.HOUR) t = Number(p.time);
      var gate = gateFor(u, sites);
      var site = gate.sites.filter(function (s) { return s.id === BIO_norm(p.siteId); })[0] || (gate.sites.length === 1 ? gate.sites[0] : null);
      if (!site) throw new Error(!gate.sites.length ? 'لم يتم ربط هذا المستخدم ببوابة' : p.siteId ? 'هذا الموقع لا يتبع «' + gate.name + '»' : 'اختر الموقع');
      // الكود الممسوح قد يحمل رقم إصدار الكارت (E001.2)؛ الإدخال اليدوي يحمل الكود فقط مع سبب وتحقق من الهوية
      var card = BIO_parseCard(p.itemId), itemId = card.id;
      if (!itemId) throw new Error('أدخل الكود');
      var item = itemInfo(store.find('items', itemId));
      var manual = p.manual ? String(p.manual).trim() : '';
      var revoked = !!(item && !manual && card.ver < item.card);
      var base = { id: p.id || deps.id('M'), time: t, itemId: itemId, itemName: item ? item.name : 'غير مسجل', siteId: site.id, siteName: site.name, user: u.name, checkpoint: gate.name, offline: p.offline ? BIO.YES : '', flag: '', checks: '', via: manual ? 'إدخال يدوي: ' + manual + (p.idChecked ? ' · تم التحقق من البطاقة الشخصية' : '') : p.plate ? 'قراءة لوحة المركبة بالكاميرا: ' + String(p.plate).slice(0, 30) : 'مسح الكارت' };
      if (manual && /مفقود/.test(manual) && item && !p.offline) {
        deps.notify({ kind: 'card', siteId: site ? site.id : '', title: '🪪 كارت مفقود: ' + item.name, body: item.name + ' (' + itemId + ')\nأبلغ أمن «' + gate.name + '» أن كارته مفقود، ودخل بالتحقق اليدوي من الهوية.\nأوقف الكارت المفقود واصدر بديلاً من شاشة كروت QR.' + appUrl('#cards') });
      }

      if (p.dir === 'OUT') {
        var dest = BIO_destOf(p, sites, site);
        record(Object.assign({}, base, { dir: BIO.OUT, decision: BIO.ALLOW, reason: dest.label ? 'الوجهة المُقرّة: ' + dest.label : '' }));
        var ext = dest.ext;
        if (ext) record(Object.assign({}, base, { id: base.id + '-X', time: t + 1, siteId: ext.id, siteName: ext.name, dir: BIO.EXT, decision: BIO.ALLOW, reason: 'إقرار عند الخروج من ' + site.name + (dest.note ? ': ' + dest.note : '') }));
        return { dir: 'OUT', decision: BIO.ALLOW, item: item, itemId: itemId, site: site, ext: ext, dest: dest.label, moveId: base.id, reasons: item ? [] : ['الكود غير مسجل في النظام'], warnings: [], checks: [] };
      }

      var res;
      if (!item) res = { decision: BIO.DENY, reasons: ['الكود غير مسجل في النظام'], violations: [], warnings: [], allowedAt: null };
      else if (revoked) res = { decision: BIO.DENY, revoked: true, reasons: ['كارت ملغى: أُبلغ عن فقده وصدر بديل (الإصدار الحالي ' + item.card + '). تحقق من هوية حامله واحتجز الكارت'], violations: [], warnings: [], allowedAt: null };
      else if (!item.active) res = { decision: BIO.DENY, reasons: ['الكود موقوف'], violations: [], warnings: [], allowedAt: null };
      else if (site.status === BIO.ST_CLOSED) res = { decision: BIO.DENY, reasons: ['الموقع مغلق حالياً بقرار الأمن الحيوي'], violations: [], warnings: [], allowedAt: null };
      else res = BIO_evaluate({ itemMoves: movesOf(itemId, t), target: site, sitesById: sites, rules: store.all('rules'), settings: st, now: t });
      var mission = null;
      if (item && item.active && !revoked && BIO.VISITOR_KINDS.indexOf(item.kind) >= 0 && BIO_isYes(st.VISITOR_NEEDS_MISSION == null || st.VISITOR_NEEDS_MISSION === '' ? BIO.YES : st.VISITOR_NEEDS_MISSION)) {
        mission = missionFor(itemId, site.id, t);
        if (!mission) { res.decision = BIO.DENY; res.reasons.unshift('لا توجد مأمورية أو زيارة مسجلة ومعتمدة لهذا الشخص على «' + site.name + '» اليوم (التسجيل قبل الموعد بـ ' + (Number(st.MISSION_LEAD_HOURS) || 24) + ' ساعة على الأقل)'); }
        else if (res.decision === BIO.ALLOW) res.warnings.unshift('مأمورية ' + mission.id + ' · ' + mission.kind + ': ' + mission.purpose + (mission.status === BIO.MS_EXC ? ' (معتمدة استثنائياً)' : ''));
      }
      if (item && item.active && !revoked && api._gateChecks) api._gateChecks(item, site, t, st, res);
      if (site.status === BIO.ST_ALERT && res.decision === BIO.ALLOW) res.warnings.push('الموقع في حالة إنذار: طبّق إجراءات مشددة');
      // كشف التلاعب: نفس الكارت في قطاعين مختلفين خلال وقت لا يكفي للانتقال
      var tamper = '';
      if (item && !p.offline) {
        var prev = movesOf(itemId).filter(function (x) { return x.dir === BIO.IN && BIO_counted(x) && t - BIO_ms(x.time) < 30 * 60000 && t >= BIO_ms(x.time); }).pop();
        var ps = prev && sites[BIO_norm(prev.siteId)];
        if (ps && ps.sector !== site.sector) tamper = 'اشتباه كارت مكرر أو مشترك: نفس الكود سُجّل دخوله في «' + prev.siteName + '» منذ ' + Math.max(1, Math.round((t - BIO_ms(prev.time)) / 60000)) + ' دقيقة';
        if (manual) {
          var day0 = t - ((t + 3 * BIO.HOUR) % (24 * BIO.HOUR)), nManual = store.all('moves').filter(function (x) { return x.checkpoint === gate.name && /يدوي/.test(x.via || '') && BIO_ms(x.time) >= day0; }).length + 1;
          if (nManual === 5 || nManual === 10) deps.notify({ kind: 'tamper', siteId: site.id, title: '🕵️ إدخال يدوي متكرر في «' + gate.name + '»', body: nManual + ' دخول يدوي بدون مسح الكارت اليوم في هذه البوابة. راجع الكاميرات وتأكد من سلامة أجهزة المسح وأن الكروت لا يتم تجاوزها.' });
        }
        if (tamper) { res.warnings.unshift(tamper + '. تحقق من الهوية بالبطاقة الشخصية'); }
      }
      if (item && item.watch) {
        res.warnings.unshift('تحت المراقبة المشددة (ناقل بين مواقع كثيرة): طبّق كل إجراءات التطهير بدقة وسجّلها' + (item.watch !== BIO.YES ? ' · ' + item.watch : ''));
        if (!p.offline) deps.notify({ kind: 'watch', siteId: site.id, title: '👁 حركة ناقل تحت المراقبة: ' + item.name, body: item.name + ' (' + itemId + ')\nعند بوابة «' + gate.name + '» إلى «' + site.name + '»\nالقرار: ' + res.decision + appUrl('#network') });
      }

      var move = Object.assign({}, base, { dir: BIO.IN, decision: res.decision, reason: res.reasons.join(' | ') });
      // ما قررته البوابة دون اتصال هو ما حدث فعلاً، والخادم يراجعه ببيانات كل البوابات
      if (p.offline && p.offlineDecision) move.decision = p.offlineDecision;
      if (p.offline && p.offlineDecision === BIO.ALLOW && res.decision === BIO.DENY) {
        move.flag = BIO.OFFLINE_FLAG;
        deps.notify({ kind: 'violation', siteId: site.id, title: '⚠️ دخول دون اتصال مخالف لقواعد العزل', body: base.itemName + ' (' + itemId + ')\nدخل «' + site.name + '» أثناء انقطاع الإنترنت\n' + res.reasons.join('\n') + '\nالبوابة: ' + gate.name + appUrl('#dash') });
      }
      if (tamper && !move.flag) {
        move.flag = 'اشتباه تلاعب: كارت مكرر أو مشترك';
        deps.notify({ kind: 'tamper', siteId: site.id, title: '🕵️ اشتباه تلاعب: ' + base.itemName, body: tamper + '\nالآن عند «' + gate.name + '» إلى «' + site.name + '»\nتحقق من هوية حامل الكارت.' });
      }
      if (revoked) {
        move.flag = 'محاولة دخول بكارت ملغى';
        deps.notify({ kind: 'violation', siteId: site.id, title: '⚠️ محاولة دخول بكارت مفقود ملغى', body: item.name + ' (' + itemId + ')\nكارت الإصدار ' + card.ver + ' استُخدم على «' + site.name + '» بعد إلغائه\nالبوابة: ' + gate.name + ' · ' + u.name + appUrl('#dash') });
      }
      record(move);
      if (mission && BIO_counted(move) && !mission.arrivedAt) store.update('missions', mission.id, { arrivedAt: t, status: BIO.MS_DONE });
      if (move.decision === BIO.DENY && !revoked) {
        deps.notify({ kind: 'deny', siteId: site.id, title: '⛔ رفض دخول: ' + base.itemName, body: base.itemName + ' (' + itemId + ')\nالموقع: ' + site.name + '\nالسبب: ' + res.reasons.join('\n') + '\nالبوابة: ' + gate.name + ' · ' + u.name });
      }
      var cert = null;
      if (item && item.kind === 'مركبة') {
        var ch = (Number(st.VEH_CERT_HOURS) || 6) * BIO.HOUR;
        store.all('moves').forEach(function (x) { if (BIO_norm(x.itemId) === itemId && x.id !== move.id && x.dir === BIO.IN && BIO_counted(x) && x.checks && BIO_ms(x.time) > now - ch && (!cert || BIO_ms(x.time) > cert.at)) cert = { id: 'C-' + String(x.id).replace(/^M/, ''), at: BIO_ms(x.time), until: BIO_ms(x.time) + ch, siteName: x.siteName, checkpoint: x.checkpoint }; });
      }
      return Object.assign({ dir: 'IN', item: item, itemId: itemId, site: site, moveId: move.id, checks: move.decision === BIO.ALLOW ? checksFor(item, st) : [], flag: move.flag, cert: cert, mission: mission }, res, { decision: move.decision });
    },

    confirmEntry: function (pin, moveId, checks, showerMin) {
      auth(pin);
      var m = store.find('moves', moveId);
      if (!m) throw new Error('الحركة غير موجودة');
      var st = settings(), item = itemInfo(store.find('items', BIO_norm(m.itemId))), now = deps.now(), list = (checks || []).slice();
      var minShower = Number(st.SHOWER_MIN == null || st.SHOWER_MIN === '' ? 8 : st.SHOWER_MIN) || 0;
      if (showerMin != null && minShower && (now - BIO_ms(m.time)) < minShower * 6e4 * 0.5) throw new Error('لم تكتمل مدة الاستحمام وتغيير الملابس (' + minShower + ' دقائق) بعد');
      if (showerMin != null) list.push('مدة الاستحمام ' + Math.round(showerMin) + ' دقيقة');
      patchMove(m.id, { checks: list.join('، ') });
      if (item && item.kind === 'مركبة') {
        var h = Number(st.VEH_CERT_HOURS) || 6;
        return { ok: true, cert: { id: 'C-' + String(m.id).replace(/^M/, ''), itemId: m.itemId, itemName: m.itemName, siteName: m.siteName, checkpoint: m.checkpoint, by: m.user, at: now, until: now + h * BIO.HOUR, checks: checks || [] } };
      }
      return { ok: true };
    },

    cancelEntry: function (pin, moveId, why) {
      auth(pin);
      var m = store.find('moves', moveId);
      if (!m) throw new Error('الحركة غير موجودة');
      patchMove(m.id, { decision: BIO.CANCELLED, reason: [m.reason, why || 'لم يستكمل إجراءات الأمن الحيوي'].filter(String).join(' | ') });
      return { ok: true };
    },

    requestOverride: function (pin, moveId, note, reqId) {
      var u = auth(pin);
      if (reqId && store.find('approvals', reqId)) return { requestId: reqId, duplicate: true };
      var m = store.find('moves', moveId);
      if (!m) throw new Error('الحركة غير موجودة');
      if (m.decision !== BIO.DENY) throw new Error('لا يمكن طلب استثناء لهذه الحركة');
      var now = deps.now();
      var a = { id: reqId || deps.id('R'), time: now, moveId: m.id, itemId: m.itemId, itemName: m.itemName, siteId: m.siteId, siteName: m.siteName, reason: m.reason, note: note || '', requestedBy: u.name, requestedById: u.id, status: BIO.PENDING, decidedBy: '', decidedAt: '', updatedAt: now };
      deps.lock(function () { store.append('approvals', a); patchMove(m.id, { decision: BIO.PENDING }); });
      deps.notify({ kind: 'request', approvalId: a.id, siteId: BIO_norm(a.siteId), title: '🟡 طلب دخول استثنائي: ' + a.itemName, body: a.itemName + ' (' + a.itemId + ')\nالموقع: ' + a.siteName + '\nسبب الرفض: ' + a.reason + (a.note ? '\nملاحظة الأمن: ' + a.note : '') + '\nمقدم الطلب: ' + u.name + appUrl('#requests') });
      return { requestId: a.id };
    },

    approvalStatus: function (pin, requestId) {
      auth(pin);
      var a = store.find('approvals', requestId);
      if (!a) throw new Error('الطلب غير موجود');
      return { status: a.status, decidedBy: a.decidedBy };
    },

    listApprovals: function (pin) {
      var u = auth(pin, true), sites = sitesById();
      var all = store.all('approvals').filter(function (a) { return inScope(u, a.siteId, sites); }).map(approvalOut).sort(function (a, b) { return b.time - a.time; });
      return { pending: all.filter(function (a) { return a.status === BIO.PENDING; }), done: all.filter(function (a) { return a.status !== BIO.PENDING; }).slice(0, 30) };
    },

    decide: function (pin, requestId, approve) {
      var u = auth(pin, 'decide'), a = store.find('approvals', requestId);
      if (a && !inScope(u, a.siteId)) throw new Error('هذا الطلب خارج نطاق إدارتك');
      return api._decide(u.name, requestId, approve);
    },

    _decide: function (who, requestId, approve) {
      var a = store.find('approvals', requestId);
      if (!a) throw new Error('الطلب غير موجود');
      if (a.status !== BIO.PENDING) return { status: a.status, decidedBy: a.decidedBy, already: true };
      var status = approve ? BIO.APPROVED : BIO.REJECTED, now = deps.now();
      deps.lock(function () {
        store.update('approvals', a.id, { status: status, decidedBy: who, decidedAt: now, updatedAt: now });
        patchMove(a.moveId, { decision: approve ? BIO.OVERRIDE : BIO.DENY, reason: a.reason + ' | ' + status + ' بواسطة ' + who });
      });
      deps.notify({ kind: 'decision', toUserId: BIO_norm(a.requestedById), title: (approve ? '✅ موافقة على دخول ' : '❌ رفض نهائي لدخول ') + a.itemName, body: a.itemName + ' ← ' + a.siteName + '\nالقرار بواسطة: ' + who });
      return { status: status, decidedBy: who };
    },

    sendNotice: function (pin, n) {
      var u = auth(pin, 'notices');
      if (!n || !String(n.title || '').trim()) throw new Error('اكتب عنوان القرار');
      if (u.scope && !u.scope.all) {
        var t = String(n.target || 'ALL'), ok = t.indexOf('SECTOR:') === 0 ? u.scope.sectors.indexOf(t.slice(7)) >= 0 : t.indexOf('GATE:') === 0 ? gateInScope(u, t.slice(5)) : false;
        if (!ok) throw new Error('يمكنك إصدار القرارات لبوابات نطاقك فقط');
      }
      var row = { id: deps.id('N'), time: deps.now(), from: u.name, target: n.target || 'ALL', level: n.level === 'عاجل' ? 'عاجل' : 'عادي', title: String(n.title).trim(), body: String(n.body || '').trim() };
      deps.lock(function () { store.append('notices', row); });
      deps.notify({ kind: 'notice', target: row.target, title: (row.level === 'عاجل' ? '🔴 قرار عاجل: ' : '📣 ') + row.title, body: row.body + '\n— ' + u.name + ' · إلى: ' + targetName(row.target) });
      return { id: row.id };
    },

    ackNotice: function (pin, noticeId) {
      var u = auth(pin);
      var exists = store.all('acks').some(function (a) { return a.noticeId === noticeId && BIO_norm(a.userId) === u.id; });
      if (!exists) deps.lock(function () { store.append('acks', { id: deps.id('A'), noticeId: noticeId, userId: u.id, userName: u.name, time: deps.now() }); });
      return { ok: true };
    },

    noticeAcks: function (pin, noticeId) {
      auth(pin, true);
      return store.all('acks').filter(function (a) { return a.noticeId === noticeId; }).map(function (a) { return { userName: a.userName, time: BIO_ms(a.time) }; });
    },

    setSiteStatus: function (pin, siteId, status, note) {
      var u = auth(pin, 'sites');
      if ([BIO.ST_ACTIVE, BIO.ST_ALERT, BIO.ST_CLOSED].indexOf(status) < 0) throw new Error('حالة غير معروفة');
      var s = store.find('sites', siteId);
      if (!s) throw new Error('الموقع غير موجود');
      if (!inScope(u, s.id)) throw new Error('هذا الموقع خارج نطاق إدارتك');
      store.update('sites', s.id, { status: status });
      var msg = status === BIO.ST_CLOSED ? 'إغلاق الموقع ومنع الدخول إليه نهائياً حتى إشعار آخر.' : status === BIO.ST_ALERT ? 'رفع حالة الإنذار: كل من زار الموقع يخضع لعزل لا يقل عن ' + (settings().ALERT_HOURS || 0) + ' ساعة قبل دخول أي موقع آخر.' : 'عودة الموقع للعمل الطبيعي.';
      api.sendNotice(pin, { target: 'SECTOR:' + s.sector, level: status === BIO.ST_ACTIVE ? 'عادي' : 'عاجل', title: s.name + ': ' + status, body: msg + (note ? '\n' + note : '') });
      return { ok: true };
    },

    recordExternal: function (pin, p) {
      var u = auth(pin, 'data'), sites = sitesById();
      var ext = sites[BIO_norm(p.extSiteId)];
      if (!ext) throw new Error('اختر الوجهة');
      var itemId = BIO_norm(p.itemId), item = itemInfo(store.find('items', itemId));
      if (!item) throw new Error('الكود غير مسجل');
      var t = p.time ? BIO_ms(p.time) : deps.now();
      if (!t || isNaN(t)) throw new Error('الوقت غير صحيح');
      record({ id: deps.id('M'), time: t, itemId: itemId, itemName: item.name, siteId: ext.id, siteName: ext.name, dir: BIO.EXT, decision: BIO.ALLOW, reason: p.note || 'تسجيل يدوي من المدير', checks: '', user: u.name, checkpoint: '', offline: '', flag: '' });
      return { ok: true };
    },

    history: function (pin, itemId) {
      auth(pin, true);
      var id = BIO_norm(itemId), item = itemInfo(store.find('items', id));
      if (!item) throw new Error('الكود غير مسجل');
      var now = deps.now(), sites = sitesById(), st = settings(), mv = movesOf(id);
      var restrictions = companyLevels(sites).map(function (lv) {
        var r = BIO_evaluate({ itemMoves: mv, target: { id: '__L' + lv, level: lv }, sitesById: sites, rules: store.all('rules'), settings: st, now: now });
        return { level: lv, allowedAt: r.allowedAt, reasons: r.reasons };
      });
      return { item: item, moves: mv.slice().reverse().slice(0, 150), restrictions: restrictions };
    },

    /** بلاغ عاجل من البوابة: يصل للمدير فوراً (إشعار + واتساب) ويُصعَّد إن لم يُفتح */
    report: function (pin, r) {
      var u = auth(pin); r = r || {};
      if (r.id && store.find('reports', r.id)) return { id: r.id, duplicate: true };
      var sites = sitesById(), site = sites[BIO_norm(r.siteId)] || null, gate = gateFor(u, sites), now = deps.now();
      var id = r.id || deps.id('B'), type = BIO.REPORT_TYPES.indexOf(r.type) >= 0 ? r.type : 'أخرى';
      var photo = '';
      if (r.photo && /^data:image\//.test(r.photo)) photo = deps.savePhoto ? deps.savePhoto(r.photo, 'بلاغ ' + id) : r.photo;
      var t = r.time ? Math.min(BIO_ms(r.time), now) : now;
      var row = { id: id, time: t, type: type, siteId: site ? site.id : '', siteName: site ? site.name : '', gate: u.isManager ? '' : (gate.name || ''), fromId: u.id, fromName: u.name, note: String(r.note || '').slice(0, 1000), photo: photo, status: BIO.R_NEW, readAt: '', ackAt: '', ackBy: '', action: '', escLevel: 0, escAt: '', closedAt: '', updatedAt: now };
      deps.lock(function () { store.append('reports', row); });
      deps.notify({ kind: 'report', reportId: id, siteId: site ? site.id : '', title: '🚨 بلاغ عاجل: ' + type, body: (site ? 'الموقع: ' + site.name + '\n' : '') + 'من: ' + u.name + (row.note ? '\n' + row.note : '') + (photo ? '\nمرفق صورة' : '') + appUrl('#comms') });
      return { id: id, status: row.status };
    },
    reports: function (pin) {
      var u = auth(pin);
      api.checkEscalations();
      if (!u.isManager) return { reports: commsSummary(u).reports };
      var now = deps.now(), sites = sitesById();
      return { reports: allReports().filter(function (r) { return (r.status !== BIO.R_DONE || r.time > now - 7 * 24 * BIO.HOUR) && (!r.siteId || inScope(u, r.siteId, sites)); }).slice(0, 60), stats: reportStats(now) };
    },
    /** المدير يفتح البلاغ: يتوقف التصعيد ويرى فرد الأمن أن بلاغه قُرئ */
    reportOpen: function (pin, id) {
      var u = auth(pin, 'reports'), r = store.find('reports', id);
      if (!r) throw new Error('البلاغ غير موجود');
      if (r.siteId && !inScope(u, r.siteId)) throw new Error('هذا البلاغ خارج نطاق إدارتك');
      if (!r.readAt) {
        var now = deps.now();
        store.update('reports', id, { readAt: now, status: r.status === BIO.R_NEW ? BIO.R_READ : r.status, updatedAt: now });
        deps.notify({ kind: 'report-update', toUserId: BIO_norm(r.fromId), title: '👁 المدير فتح بلاغك', body: r.type + (r.siteName ? ' · ' + r.siteName : '') });
      }
      return reportOut(store.find('reports', id), true);
    },
    /** إجراء على البلاغ: استلام، أو رفع إنذار/إغلاق الموقع، أو إنهاء البلاغ */
    reportAct: function (pin, id, act, note) {
      var u = auth(pin, 'reports'), r = store.find('reports', id);
      if (!r) throw new Error('البلاغ غير موجود');
      if (r.siteId && !inScope(u, r.siteId)) throw new Error('هذا البلاغ خارج نطاق إدارتك');
      var acts = { 'استلام': 'تم الاستلام', 'إنذار': 'رفع إنذار على الموقع', 'إغلاق': 'إغلاق الموقع', 'إنهاء': 'إنهاء البلاغ' };
      if (!acts[act]) throw new Error('إجراء غير معروف');
      if ((act === 'إنذار' || act === 'إغلاق') && !r.siteId) throw new Error('البلاغ غير مرتبط بموقع');
      var now = deps.now();
      if (act === 'إنذار' || act === 'إغلاق') api.setSiteStatus(pin, r.siteId, act === 'إنذار' ? BIO.ST_ALERT : BIO.ST_CLOSED, 'بناءً على بلاغ عاجل: ' + r.type + (note ? ' · ' + note : ''));
      var line = acts[act] + (note ? ': ' + note : '') + ' (' + u.name + ')';
      var patch = { action: (r.action ? r.action + '\n' : '') + line, updatedAt: now, status: act === 'إنهاء' ? BIO.R_DONE : BIO.R_WORK };
      if (!r.readAt) patch.readAt = now;
      if (!r.ackAt) { patch.ackAt = now; patch.ackBy = u.name; }
      if (act === 'إنهاء') patch.closedAt = now;
      store.update('reports', id, patch);
      deps.notify({ kind: 'report-update', toUserId: BIO_norm(r.fromId), title: (act === 'إنهاء' ? '✅ ' : '🟢 ') + 'رد المدير على بلاغك: ' + acts[act], body: r.type + (r.siteName ? ' · ' + r.siteName : '') + (note ? '\n' + note : '') });
      return reportOut(store.find('reports', id), true);
    },
    /** تصعيد البلاغات التي لم يفتحها المدير: مستوى 1 ثم مستوى 2 */
    checkEscalations: function () {
      var now = deps.now(), mins = Number(settings().ESCALATE_MINUTES) || 5, out = 0;
      store.all('reports').forEach(function (r) {
        var lvl = Number(r.escLevel) || 0;
        if (r.readAt || r.status === BIO.R_DONE || lvl >= 2) return;
        var from = lvl ? BIO_ms(r.escAt) : BIO_ms(r.time);
        if (now - from < mins * 6e4) return;
        lvl++;
        store.update('reports', r.id, { escLevel: lvl, escAt: now, updatedAt: now });
        deps.notify({ kind: 'escalation', level: lvl, reportId: r.id, siteId: BIO_norm(r.siteId), title: '⏫ تصعيد مستوى ' + lvl + ': بلاغ عاجل بدون رد', body: r.type + (r.siteName ? '\nالموقع: ' + r.siteName : '') + '\nمن: ' + r.fromName + '\nلم يُفتح منذ ' + Math.round((now - BIO_ms(r.time)) / 6e4) + ' دقيقة' + appUrl('#comms') });
        deps.notify({ kind: 'report-update', toUserId: BIO_norm(r.fromId), title: '⏫ تم تصعيد بلاغك (مستوى ' + lvl + ')', body: r.type });
        out++;
      });
      return out;
    },
    /** رسالة بين البوابة والمدير */
    sendMessage: function (pin, m) {
      var u = auth(pin); m = m || {};
      if (m.id && store.find('messages', m.id)) return { id: m.id, duplicate: true };
      var text = String(m.text || '').trim().slice(0, 1000);
      if (!text) throw new Error('اكتب الرسالة');
      var gk = u.isManager ? BIO_norm(m.gate) : gateKey(u), cp = store.find('checkpoints', gk);
      if (!cp) throw new Error(u.isManager ? 'اختر البوابة' : 'حسابك غير مربوط بمنطقة تطهير');
      if (u.isManager && (u.perms.indexOf('reports') < 0 || !gateInScope(u, cp.id))) throw new Error('ليست لديك صلاحية مراسلة هذه البوابة');
      var now = deps.now(), row = { id: m.id || deps.id('G'), time: m.time ? Math.min(BIO_ms(m.time), now) : now, gate: BIO_norm(cp.id), gateName: cp.name, fromId: u.id, fromName: u.name, fromMgr: u.isManager ? BIO.YES : BIO.NO, text: text, readAt: '' };
      deps.lock(function () { store.append('messages', row); });
      deps.notify(u.isManager ? { kind: 'message', toGate: row.gate, title: '💬 رسالة من ' + u.name, body: text } : { kind: 'message', gate: row.gate, title: '💬 ' + cp.name, body: u.name + ': ' + text + appUrl('#comms/' + row.gate) });
      return { id: row.id };
    },
    /** محادثة بوابة: تُعلَّم رسائل الطرف الآخر كمقروءة */
    chat: function (pin, gate) {
      var u = auth(pin), gk = u.isManager ? BIO_norm(gate) : gateKey(u), cp = store.find('checkpoints', gk);
      if (!cp) throw new Error('البوابة غير موجودة');
      var now = deps.now();
      store.all('messages').forEach(function (m) { if (BIO_norm(m.gate) === BIO_norm(cp.id) && !m.readAt && BIO_isYes(m.fromMgr) !== u.isManager) store.update('messages', m.id, { readAt: now }); });
      return { gate: { id: BIO_norm(cp.id), name: cp.name, sector: cp.sector }, messages: allMessages().filter(function (m) { return m.gate === BIO_norm(cp.id); }).slice(-150), managerPhone: settings().MANAGER_PHONE || '', managerEmail: settings().MANAGER_EMAIL || '' };
    },
    /** المدير: قائمة المحادثات لكل البوابات */
    threads: function (pin) {
      var u = auth(pin, 'reports');
      var msgs = allMessages();
      return store.all('checkpoints').filter(function (c) { return gateInScope(u, c.id); }).map(function (c) {
        var id = BIO_norm(c.id), mine = msgs.filter(function (m) { return m.gate === id; }), last = mine[mine.length - 1];
        var phones = store.all('users').filter(function (x) { return BIO_norm(x.gate) === id && x.phone; }).map(function (x) { return String(x.phone); });
        return { id: id, name: c.name, sector: c.sector, last: last || null, unread: mine.filter(function (m) { return !m.fromMgr && !m.readAt; }).length, phone: phones[0] || '' };
      }).sort(function (a, b) { return (b.unread - a.unread) || ((b.last ? b.last.time : 0) - (a.last ? a.last.time : 0)); });
    },

    /** تتبع العدوى: كل من دخل الموقع خلال المدة، وأين ذهب بعد أول تلامس، والمواقع المعرضة ثانوياً */
    trace: function (pin, siteId, days) {
      auth(pin, 'analytics');
      var sites = sitesById(), site = sites[BIO_norm(siteId)];
      if (!site) throw new Error('الموقع غير موجود');
      var now = deps.now(), d = Math.max(1, Math.min(60, Number(days) || 14)), since = now - d * 24 * BIO.HOUR;
      var all = allMoves(), win = all.filter(function (m) { return m.time >= since && BIO_counted(m) && m.dir !== BIO.OUT; });
      var byItem = {}, secondary = {};
      win.forEach(function (m) {
        if (m.siteId !== site.id) return;
        var e = byItem[m.itemId] || (byItem[m.itemId] = { itemId: m.itemId, name: m.itemName, visits: 0, firstAt: m.time, lastAt: m.time });
        e.visits++; e.firstAt = Math.min(e.firstAt, m.time); e.lastAt = Math.max(e.lastAt, m.time);
      });
      var exposed = Object.keys(byItem).map(function (id) {
        var e = byItem[id], it = itemInfo(store.find('items', id));
        e.kind = it ? it.kind : ''; e.dept = it ? it.dept : '';
        e.onward = win.filter(function (m) { return m.itemId === id && m.siteId !== site.id && m.time > e.firstAt; }).map(function (m) {
          var s = sites[m.siteId] || {};
          var x = secondary[m.siteId] || (secondary[m.siteId] = { siteId: m.siteId, name: m.siteName, sector: s.sector || '', level: s.level || '', status: s.status || '', names: [], firstAt: m.time });
          if (x.names.indexOf(e.name) < 0) x.names.push(e.name);
          x.firstAt = Math.min(x.firstAt, m.time);
          return { siteId: m.siteId, siteName: m.siteName, time: m.time, dir: m.dir };
        });
        var mine = all.filter(function (m) { return m.itemId === id && BIO_counted(m); }), last = mine[mine.length - 1];
        e.insideAt = last && last.dir === BIO.IN ? last.siteName : '';
        return e;
      }).sort(function (a, b) { return b.onward.length - a.onward.length || b.lastAt - a.lastAt; });
      var sec = Object.keys(secondary).map(function (k) { var x = secondary[k]; x.count = x.names.length; return x; })
        .sort(function (a, b) { return a.firstAt - b.firstAt; });
      return { site: { id: site.id, name: site.name, sector: site.sector, level: site.level, status: site.status }, days: d, since: since, now: now, exposed: exposed, secondary: sec };
    },

    dashboard: function (pin) {
      var u = auth(pin, true);
      var now = deps.now(), sites = sitesById(), st = settings(), rules = store.all('rules');
      var sc = function (id) { return inScope(u, id, sites); };
      var levels = companyLevels(sites), allM = allMoves(), moves = u.scope.all ? allM : allM.filter(function (m) { return sc(m.siteId); });
      var since = now - 24 * BIO.HOUR, byItem = {};
      var stats = { allowed: 0, denied: 0, overrides: 0, pending: 0, exits: 0, offline: 0, violations: 0 };
      allM.forEach(function (m) { (byItem[m.itemId] = byItem[m.itemId] || []).push(m); });
      moves.forEach(function (m) {
        if (m.time < since) return;
        if (m.offline) stats.offline++;
        if (m.flag) stats.violations++;
        if (m.dir === BIO.OUT) stats.exits++;
        if (m.dir !== BIO.IN) return;
        if (m.decision === BIO.ALLOW) stats.allowed++;
        else if (m.decision === BIO.OVERRIDE) stats.overrides++;
        else if (m.decision === BIO.DENY || m.decision === BIO.PENDING) stats.denied++;
      });
      var approvals = store.all('approvals').map(approvalOut);
      var pending = approvals.filter(function (a) { return a.status === BIO.PENDING && sc(a.siteId); }).sort(function (a, b) { return b.time - a.time; });
      stats.pending = pending.length;
      var items = {};
      store.all('items').forEach(function (i) { items[BIO_norm(i.id)] = itemInfo(i); });
      var onSite = [], isolation = [], lookback = (Number(st.LOOKBACK_HOURS) || 240) * BIO.HOUR;
      Object.keys(byItem).forEach(function (id) {
        var list = byItem[id], last = null;
        list.forEach(function (m) { if (BIO_counted(m) && m.dir !== BIO.EXT) last = m; });
        var info = items[id] || { id: id, name: list[list.length - 1].itemName, kind: '' };
        if (last && last.dir === BIO.IN && sc(last.siteId)) onSite.push({ item: info, siteName: last.siteName, siteId: last.siteId, since: last.time });
        if (now - list[list.length - 1].time > lookback) return;
        var until = {}, any = false, lastSite = null;
        levels.forEach(function (lv) {
          var r = BIO_evaluate({ itemMoves: list, target: { id: '__L' + lv, level: lv }, sitesById: sites, rules: rules, settings: st, now: now });
          until[lv] = r.allowedAt;
          if (r.allowedAt) { any = true; if (!lastSite) lastSite = r.violations[0].siteName; }
        });
        if (any) isolation.push({ item: info, until: until, lastSite: lastSite });
      });
      onSite.sort(function (a, b) { return b.since - a.since; });
      isolation.sort(function (a, b) { return (b.until[levels[0]] || 0) - (a.until[levels[0]] || 0); });

      var alerts = [];
      moves.forEach(function (m) {
        if (m.time < since) return;
        if (m.flag) alerts.push({ time: m.time, level: 'bad', title: m.flag, body: m.itemName + ' ← ' + m.siteName + ' · ' + m.checkpoint });
        else if (m.dir === BIO.IN && m.decision === BIO.DENY) alerts.push({ time: m.time, level: 'bad', title: 'رفض دخول', body: m.itemName + ' ← ' + m.siteName + (m.reason ? ' · ' + m.reason.split(' | ')[0] : '') });
        else if (m.decision === BIO.OVERRIDE) alerts.push({ time: m.time, level: 'warn', title: 'دخول استثنائي', body: m.itemName + ' ← ' + m.siteName });
      });
      api.checkEscalations();
      var rstats = reportStats(now);
      rstats.open.filter(function (r) { return !r.siteId || sc(r.siteId); }).forEach(function (r) { alerts.push({ time: r.time, level: 'bad', title: '🚨 بلاغ عاجل' + (r.readAt ? '' : ' لم يُفتح') + (r.escLevel ? ' · تصعيد ' + r.escLevel : ''), body: r.type + (r.siteName ? ' · ' + r.siteName : '') + ' · ' + r.fromName, route: 'comms' }); });
      sitesList(sites).forEach(function (s) { if (!s.external && sc(s.id) && s.status !== BIO.ST_ACTIVE) alerts.push({ time: now, level: 'bad', title: 'موقع في حالة ' + s.status, body: s.name }); });
      alerts.sort(function (a, b) { return b.time - a.time; });

      var sectors = {};
      sitesList(sites).filter(function (s) { return !s.external && sc(s.id); }).forEach(function (s) {
        (sectors[s.sector] = sectors[s.sector] || []).push(Object.assign({}, s, { inside: onSite.filter(function (o) { return o.siteId === s.id; }).length }));
      });
      // نشاط آخر 24 ساعة بالساعة: دخول مسموح (شامل الاستثنائي) ومرفوض
      var hourly = [];
      for (var h = 23; h >= 0; h--) hourly.push({ start: now - (h + 1) * BIO.HOUR, allowed: 0, denied: 0 });
      moves.forEach(function (m) {
        if (m.time < since || m.dir !== BIO.IN) return;
        var b = hourly[Math.min(23, Math.floor((m.time - since) / BIO.HOUR))];
        if (m.decision === BIO.ALLOW || m.decision === BIO.OVERRIDE) b.allowed++;
        else if (m.decision === BIO.DENY || m.decision === BIO.PENDING) b.denied++;
      });
      var rev = moves.slice().reverse(), model = riskModel(u, now, sites, allM, rstats.open);
      return {
        now: now, scope: u.scope.label, missions: (function () { var ms = store.all('missions').map(missionOut).filter(function (m) { return sc(m.siteId); }), d0 = now - ((now + 3 * BIO.HOUR) % (24 * BIO.HOUR)); return { late: ms.filter(function (m) { return m.status === BIO.MS_LATE && m.endAt > now; }).length, today: ms.filter(function (m) { return missionValid(m) && m.visitAt >= d0 && m.visitAt < d0 + 24 * BIO.HOUR; }).length }; })(), model: model, canLock: !!(u.perms && u.perms.indexOf('sites') >= 0), hourly: hourly, levels: levels, stats: stats, reports: rstats, unreadMsgs: commsSummary(u).unread, onSite: onSite, isolation: isolation, pending: pending, alerts: alerts.slice(0, 30),
        sectors: Object.keys(sectors).map(function (k) { return { name: k, sites: sectors[k] }; }),
        recent: rev.slice(0, 40),
        extra: api._dashExtra ? api._dashExtra(u, now) : null
      };
    },


    /* ---------- مركز القيادة: الإغلاق الطارئ ---------- */
    /** يغلق كل مواقع القطاع (أو يعيدها للعمل) ويرسل قراراً عاجلاً لكل بواباته */
    /* ---------- المأموريات والزيارات: تسجيل مسبق قبل الموعد بـ 24 ساعة ---------- */
    createMission: function (pin, m) { return addMission(auth(pin), m); },

    /* ---------- طلب المأمورية الذاتي: أي موظف بكوده ورقم هاتفه بدون حساب ---------- */
    selfMissionInfo: function (code, phone) {
      var it = selfStaff(code, phone, false), now = deps.now(), sites = sitesById();
      var mine = store.all('missions').map(missionOut).filter(function (m) { return (m.requestedById === it.id || m.itemId === it.id) && m.endAt > now - 7 * 24 * BIO.HOUR; })
        .sort(function (a, b) { return b.visitAt - a.visitAt; }).slice(0, 8);
      return { now: now, lead: Number(settings().MISSION_LEAD_HOURS) || 24, kinds: BIO.MISSION_KINDS.filter(function (k) { return k !== 'زيارة جهة رسمية'; }), me: { id: it.id, name: it.name, kind: it.kind, dept: it.dept },
        sites: sitesList(sites).filter(function (x) { return !x.external; }).map(function (x) { return { id: x.id, name: x.name, sector: x.sector }; }), missions: mine };
    },
    selfMission: function (code, phone, m) {
      var it = selfStaff(code, phone, true), now = deps.now(); m = m || {};
      if (m.id && store.find('missions', m.id)) return { id: m.id, duplicate: true };
      var today = store.all('missions').filter(function (x) { return BIO_norm(x.requestedById) === it.id && BIO_ms(x.time) > now - 24 * BIO.HOUR; }).length;
      if (today >= 5) throw new Error('وصلت للحد الأقصى: 5 طلبات خلال 24 ساعة. تواصل مع مدير الأمن الحيوي');
      var r = addMission({ id: it.id, name: it.name, self: true, bound: !!it.bound }, { id: m.id, kind: m.kind, siteId: m.siteId, visitor: it.name, itemId: it.id, company: it.dept || m.company || '', phone: phone, visitAt: m.visitAt, endAt: m.endAt,
        purpose: m.purpose, lastContact: m.lastContact, lastContactAt: m.lastContactAt, vehicle: m.vehicle, email: m.email });
      r.bound = it.bound || false;
      return r;
    },

    missions: function (pin) {
      var u = auth(pin), sites = sitesById(), gate = gateFor(u, sites), now = deps.now();
      var gs = gate.sites.map(function (x) { return x.id; });
      var list = store.all('missions').map(missionOut).filter(function (m) {
        if (u.isManager) return inScope(u, m.siteId, sites) || m.requestedById === u.id;
        return m.requestedById === u.id || gs.indexOf(m.siteId) >= 0 && m.endAt > now - 24 * BIO.HOUR;
      }).sort(function (a, b) { return a.visitAt - b.visitAt; });
      return { now: now, lead: Number(settings().MISSION_LEAD_HOURS) || 24, canDecide: u.perms ? u.perms.indexOf('decide') >= 0 : false, isManager: u.isManager, kinds: BIO.MISSION_KINDS,
        sites: sitesList(sites).filter(function (x) { return !x.external && (!u.isManager || inScope(u, x.id, sites)); }).map(function (x) { return { id: x.id, name: x.name, sector: x.sector }; }), missions: list };
    },
    decideMission: function (pin, id, ok, note) {
      var u = auth(pin, 'decide'), r = store.find('missions', id);
      if (!r) throw new Error('المأمورية غير موجودة');
      var m = missionOut(r);
      if (!inScope(u, m.siteId)) throw new Error('هذا الموقع خارج نطاق إدارتك');
      if (m.status === BIO.MS_DONE) throw new Error('تمت الزيارة بالفعل');
      var status = ok ? BIO.MS_EXC : BIO.MS_REJ;
      store.update('missions', id, { status: status, decidedBy: u.name, decidedAt: deps.now(), note: note || '' });
      deps.notify({ kind: 'mission-decision', toUserId: m.requestedById, emailTo: [m.email], siteId: m.siteId, title: (ok ? '✅ اعتُمدت المأمورية استثنائياً: ' : '⛔ رُفضت المأمورية: ') + m.visitor,
        body: m.kind + ' · ' + m.siteName + '\nالقرار: ' + status + ' بواسطة ' + u.name + (note ? '\nملاحظة: ' + note : '') });
      return { ok: true, status: status };
    },

    /* ---------- جواز الأمن الحيوي لكل فرد ---------- */
    passport: function (pin, itemId) {
      var u = auth(pin), id = BIO_norm(BIO_parseCard(itemId).id), item = itemInfo(store.find('items', id));
      if (!item) throw new Error('الكود غير مسجل');
      var now = deps.now(), sites = sitesById(), st = settings(), mv = movesOf(id), rules = store.all('rules');
      var levels = companyLevels(sites), lvName = { 1: 'الجدود والأمهات', 2: 'معامل التفريخ', 3: 'التسمين', 4: 'العلف والخدمات' };
      var access = levels.map(function (lv) { var r = BIO_evaluate({ itemMoves: mv, target: { id: '__L' + lv, level: lv }, sitesById: sites, rules: rules, settings: st, now: now }); return { level: lv, name: lvName[lv] || ('المستوى ' + lv), allowedAt: r.allowedAt, reason: r.reasons[0] || '' }; });
      var d30 = now - 30 * 24 * BIO.HOUR, recent = mv.filter(function (m) { return BIO_ms(m.time) >= d30; });
      var ins = recent.filter(function (m) { return m.dir === BIO.IN; }), ok = ins.filter(function (m) { return m.decision === BIO.ALLOW; }).length;
      var denied = ins.filter(function (m) { return m.decision === BIO.DENY || m.decision === BIO.REJECTED; }).length, over = ins.filter(function (m) { return m.decision === BIO.OVERRIDE; }).length, flags = recent.filter(function (m) { return m.flag; }).length;
      var manual = recent.filter(function (m) { return /يدوي/.test(m.via || ''); }).length, showers = recent.filter(function (m) { return /مدة الاستحمام/.test(m.checks || ''); }).length;
      var score = Math.max(0, Math.min(100, 100 - denied * 8 - over * 5 - flags * 15 - manual * 3));
      var grade = score >= 90 ? { k: 'a', label: 'ممتاز' } : score >= 75 ? { k: 'b', label: 'جيد' } : score >= 60 ? { k: 'c', label: 'يحتاج متابعة' } : { k: 'd', label: 'ضعيف' };
      var stamps = mv.slice().reverse().filter(function (m) { return m.dir !== BIO.OUT; }).slice(0, 12).map(function (m) { var s = sites[BIO_norm(m.siteId)]; return { time: BIO_ms(m.time), site: m.siteName, level: s ? s.level : null, ext: m.dir === BIO.EXT, decision: m.decision, flag: m.flag || '' }; });
      var last = null; mv.forEach(function (m) { if (BIO_counted(m) && m.dir !== BIO.EXT) last = m; });
      var missions = store.all('missions').map(missionOut).filter(function (m) { return m.itemId === id && m.visitAt > now - 24 * BIO.HOUR; }).slice(0, 3);
      return { now: now, item: item, access: access, inside: last && last.dir === BIO.IN ? { site: last.siteName, since: BIO_ms(last.time) } : null, stats: { entries: ins.length, ok: ok, denied: denied, overrides: over, flags: flags, manual: manual, showers: showers }, score: score, grade: grade, stamps: stamps, missions: missions, by: u.name, training: api._trainingOf ? api._trainingOf(id) : [] };
    },

    lockdown: function (pin, sector, on, note) {
      var u = auth(pin, 'sites'), sites = sitesById();
      var list = sitesList(sites).filter(function (s) { return !s.external && s.sector === sector; });
      if (!list.length) throw new Error('القطاع غير موجود');
      if (list.some(function (s) { return !inScope(u, s.id, sites); })) throw new Error('هذا القطاع خارج نطاق إدارتك');
      var to = on ? BIO.ST_CLOSED : BIO.ST_ACTIVE;
      deps.lock(function () { list.forEach(function (s) { store.update('sites', s.id, { status: to }); }); });
      var row = { id: deps.id('N'), time: deps.now(), from: u.name, target: 'SECTOR:' + sector, level: on ? 'عاجل' : 'عادي',
        title: on ? '⛔ إغلاق طارئ لقطاع ' + sector : 'رفع الإغلاق الطارئ عن قطاع ' + sector,
        body: (on ? 'إغلاق كل مواقع القطاع (' + list.length + ' موقع) ومنع أي دخول حتى إشعار آخر. يبقى من بالداخل في مكانه ويُسجَّل خروجه فقط.' : 'عودة كل مواقع القطاع للعمل الطبيعي مع تطبيق قواعد العزل المعتادة.') + (note ? '\n' + note : '') };
      deps.lock(function () { store.append('notices', row); });
      deps.notify({ kind: 'notice', target: row.target, title: (on ? '🔴 ' : '📣 ') + row.title, body: row.body + '\n— ' + u.name });
      return { ok: true, sites: list.length, status: to };
    },

    /* ---------- مركز القيادة: محاكاة التفشي ---------- */
    /** ماذا لو ظهرت إصابة في موقع اليوم؟ ثلاث دوائر: من زار الموقع، المواقع التي ذهبوا إليها، ومن دخل تلك المواقع بعدهم */
    simulate: function (pin, siteId, days) {
      var u = auth(pin, 'analytics'), t = api.trace(pin, siteId, days || 14), sites = sitesById(), st = settings(), rules = store.all('rules'), now = deps.now();
      var all = allMoves(), items = {}; store.all('items').forEach(function (i) { items[BIO_norm(i.id)] = itemInfo(i); });
      var ring1 = {}; t.exposed.forEach(function (e) { ring1[e.itemId] = 1; });
      var ring3 = {};
      t.secondary.forEach(function (x) {
        all.forEach(function (m) {
          if (m.siteId !== x.siteId || m.time < x.firstAt || !BIO_counted(m) || m.dir !== BIO.IN || ring1[m.itemId]) return;
          var e = ring3[m.itemId] || (ring3[m.itemId] = { itemId: m.itemId, name: m.itemName, kind: (items[m.itemId] || {}).kind || '', sites: [], firstAt: m.time });
          if (e.sites.indexOf(m.siteName) < 0) e.sites.push(m.siteName);
        });
      });
      var alertH = Number(st.ALERT_HOURS) || 0, src = sites[BIO_norm(siteId)];
      var levels = companyLevels(sites), maxRule = levels.reduce(function (a, lv) { return Math.max(a, BIO_requiredHours(rules, src.level, lv)); }, 0);
      var isoH = Math.max(alertH, maxRule);
      var inside = [], onsite = {};
      all.forEach(function (m) { if (BIO_counted(m) && m.dir !== BIO.EXT) onsite[m.itemId] = m; });
      var hit = {}; hit[src.id] = 1; t.secondary.forEach(function (x) { hit[x.siteId] = 1; });
      Object.keys(onsite).forEach(function (id) { var m = onsite[id]; if (m.dir === BIO.IN && hit[m.siteId]) inside.push({ itemId: id, name: m.itemName, siteName: m.siteName }); });
      var companySites = sitesList(sites).filter(function (s) { return !s.external; }).length;
      var sectorsHit = {}; sectorsHit[src.sector] = 1; t.secondary.forEach(function (x) { if (x.sector) sectorsHit[x.sector] = 1; });
      var people = t.exposed.length + Object.keys(ring3).length;
      var severity = Math.min(100, Math.round((t.secondary.length / Math.max(1, companySites - 1)) * 60 + Math.min(40, people * 3)));
      var plan = [
        { k: 'close', text: 'إغلاق ' + src.name + ' فوراً ومنع أي دخول', who: 'مدير القطاع' },
        t.secondary.length ? { k: 'alert', text: 'رفع حالة الإنذار في ' + t.secondary.length + ' من المواقع التي زارها المخالطون بعده', who: 'مدير الأمن الحيوي' } : null,
        t.exposed.length ? { k: 'isolate', text: 'عزل ' + t.exposed.length + ' من الأفراد والمركبات الذين زاروا الموقع لمدة ' + isoH + ' ساعة على الأقل', who: 'البوابات (تلقائياً)' } : null,
        Object.keys(ring3).length ? { k: 'watch', text: 'متابعة ' + Object.keys(ring3).length + ' من الدائرة الثالثة وفحص أعراض القطعان في مواقعهم', who: 'الطبيب البيطري' } : null,
        { k: 'sample', text: 'سحب عينات من ' + src.name + ' وإرسالها للمعمل خلال 24 ساعة', who: 'الطبيب البيطري' },
        { k: 'notify', text: 'إبلاغ الإدارة العليا وكل بوابات ' + Object.keys(sectorsHit).map(function (x) { return 'قطاع ' + x; }).join(' و'), who: 'مدير الأمن الحيوي' }
      ].filter(Boolean);
      return { site: t.site, days: t.days, since: t.since, now: now, ring1: t.exposed, ring2: t.secondary, ring3: Object.keys(ring3).map(function (k) { return ring3[k]; }).sort(function (a, b) { return a.firstAt - b.firstAt; }),
        inside: inside, isoHours: isoH, severity: severity, band: riskBand(severity), sectors: Object.keys(sectorsHit), companySites: companySites, plan: plan, canAct: !!(u.perms && u.perms.indexOf('sites') >= 0) };
    },
    /** تنفيذ خطة الاحتواء: إغلاق المصدر ورفع الإنذار في المواقع المعرضة */
    containPlan: function (pin, siteId, alertIds, note) {
      var u = auth(pin, 'sites'), sites = sitesById(), src = sites[BIO_norm(siteId)];
      if (!src) throw new Error('الموقع غير موجود');
      var ids = (alertIds || []).map(BIO_norm).filter(function (x) { return sites[x] && !sites[x].external && x !== src.id; });
      [src.id].concat(ids).forEach(function (x) { if (!inScope(u, x, sites)) throw new Error('بعض المواقع خارج نطاق إدارتك'); });
      deps.lock(function () { store.update('sites', src.id, { status: BIO.ST_CLOSED }); ids.forEach(function (x) { if (sites[x].status !== BIO.ST_CLOSED) store.update('sites', x, { status: BIO.ST_ALERT }); }); });
      var secs = {}; secs[src.sector] = 1; ids.forEach(function (x) { secs[sites[x].sector] = 1; });
      Object.keys(secs).forEach(function (sec) {
        var mine = ids.filter(function (x) { return sites[x].sector === sec; }).map(function (x) { return sites[x].name; });
        var row = { id: deps.id('N'), time: deps.now(), from: u.name, target: 'SECTOR:' + sec, level: 'عاجل', title: '🚨 خطة احتواء: اشتباه في ' + src.name,
          body: (src.sector === sec ? 'إغلاق ' + src.name + ' ومنع الدخول نهائياً.\n' : '') + (mine.length ? 'رفع الإنذار في: ' + mine.join('، ') + '.\n' : '') + 'كل من زار هذه المواقع يخضع لعزل مشدد، والبوابات تطبقه تلقائياً.' + (note ? '\n' + note : '') };
        deps.lock(function () { store.append('notices', row); });
        deps.notify({ kind: 'notice', target: row.target, title: '🔴 ' + row.title, body: row.body + '\n— ' + u.name });
      });
      return { ok: true, closed: 1, alerted: ids.length };
    },

    /* ---------- مركز القيادة: التقرير التنفيذي ---------- */
    execReport: function (pin, days) {
      var u = auth(pin, true), now = deps.now(), sites = sitesById(), D = 24 * BIO.HOUR, n = Math.max(1, Math.min(31, Number(days) || 7));
      var allM = allMoves(), sc = function (id) { return inScope(u, id, sites) && sites[id] && !sites[id].external; };
      function period(a, b) {
        var r = { attempts: 0, allowed: 0, denied: 0, overrides: 0, flags: 0, manual: 0, ext: 0, people: {}, reports: 0, escalated: 0, ackMs: [], deniedBy: {} };
        allM.forEach(function (m) {
          if (m.time < a || m.time >= b) return;
          if (m.dir === BIO.EXT) { r.ext++; return; }
          if (m.dir !== BIO.IN || !sc(m.siteId)) return;
          r.attempts++; r.people[m.itemId] = 1;
          if (m.decision === BIO.ALLOW) r.allowed++; else if (m.decision === BIO.OVERRIDE) r.overrides++; else { r.denied++; var d = r.deniedBy[m.itemId] = r.deniedBy[m.itemId] || { id: m.itemId, name: m.itemName, n: 0 }; d.n++; }
          if (m.flag) r.flags++;
          if (/يدوي/.test(m.via)) r.manual++;
        });
        allReports().forEach(function (x) { if (x.time >= a && x.time < b && (!x.siteId || sc(BIO_norm(x.siteId)))) { r.reports++; if (x.escLevel) r.escalated++; if (x.ackAt) r.ackMs.push(x.ackAt - x.time); } });
        r.compliance = r.attempts ? Math.round((r.allowed - r.flags) / r.attempts * 1000) / 10 : null;
        r.avgAck = r.ackMs.length ? Math.round(r.ackMs.reduce(function (s, x) { return s + x; }, 0) / r.ackMs.length / 6e3) / 10 : null;
        r.people = Object.keys(r.people).length;
        r.repeat = Object.keys(r.deniedBy).map(function (k) { return r.deniedBy[k]; }).filter(function (x) { return x.n >= 2; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 5);
        delete r.ackMs; delete r.deniedBy; return r;
      }
      var cur = period(now - n * D, now + 1), prev = period(now - 2 * n * D, now - n * D);
      var model = riskModel(u, now, sites, allM, reportStats(now).open);
      var notices = store.all('notices').filter(function (x) { return BIO_ms(x.time) >= now - n * D; }).length;
      var recs = [];
      var hi = model.risk.filter(function (r) { return r.score >= 50; });
      if (hi.length) recs.push('مراجعة ميدانية عاجلة لـ ' + hi.slice(0, 3).map(function (r) { return r.name; }).join('، ') + ' (مؤشر خطر ' + hi[0].score + ')');
      if (cur.repeat.length) recs.push('جلسة توعية أو إجراء إداري لمن تكرر رفض دخولهم: ' + cur.repeat.map(function (x) { return x.name + ' (' + x.n + ')'; }).join('، '));
      if (cur.manual >= 3) recs.push('إصدار كروت بديلة: ' + cur.manual + ' دخول يدوي بدون كارت خلال الفترة');
      if (cur.overrides >= 2) recs.push('مراجعة أسباب ' + cur.overrides + ' دخول استثنائي، وتحديث القواعد إن تكررت الحالة');
      if (cur.avgAck != null && cur.avgAck > 10) recs.push('تحسين زمن الاستجابة للبلاغات العاجلة (المتوسط ' + cur.avgAck + ' دقيقة)');
      if (cur.ext) recs.push('متابعة ' + cur.ext + ' زيارة خارجية مسجلة والتأكد من تطبيق فترات العزل بعدها');
      if (!recs.length) recs.push('الوضع مستقر: الاستمرار في تطبيق الإجراءات الحالية والتدقيق الدوري');
      return { now: now, days: n, from: now - n * D, scope: u.scope.label, by: u.name, cur: cur, prev: prev, posture: model.posture, compliance: model.compliance, readiness: model.readiness,
        bySector: model.bySector, topRisk: model.risk.slice(0, 5), statuses: model.risk.filter(function (r) { return r.status !== BIO.ST_ACTIVE; }).map(function (r) { return { name: r.name, status: r.status }; }), notices: notices, recs: recs, daily: model.days.map(function (x) { return { start: x.start, compliance: x.compliance, attempts: x.attempts, denied: x.denied }; }) };
    },

    /* ---------- مخطط الزيارات الذكي ---------- */
    /**
     * p = { itemId?, siteIds:[], start (ms), dayStart, dayEnd (ساعات محلية), visitHours, travelHours, tz (دقائق فرق التوقيت عن UTC) }
     * يرتب الزيارات ويحدد مواعيدها بحيث لا يُرفض أي دخول، اعتماداً على سجل الشخص الحقيقي وقواعد العزل
     */
    planVisits: function (pin, p) {
      auth(pin, 'analytics');
      var sites = sitesById(), st = settings(), rules = store.all('rules'), now = deps.now();
      var id = p.itemId ? BIO_norm(p.itemId) : '', item = id ? itemInfo(store.find('items', id)) : null;
      if (id && !item) throw new Error('الكود غير مسجل');
      var ids = (p.siteIds || []).map(BIO_norm).filter(function (x, i, a) { return sites[x] && a.indexOf(x) === i; });
      if (!ids.length) throw new Error('اختر موقعاً واحداً على الأقل');
      var dS = Number(p.dayStart != null ? p.dayStart : 7), dE = Number(p.dayEnd != null ? p.dayEnd : 17), dur = Number(p.visitHours) || 2, trav = Number(p.travelHours != null ? p.travelHours : 1);
      if (dE - dS < dur) throw new Error('ساعات العمل أقصر من مدة الزيارة');
      var tz = Number(p.tz || 0) * 60000, start = Math.max(now, Number(p.start) || now);
      var closed = ids.filter(function (x) { return sites[x].status === BIO.ST_CLOSED; });
      ids = ids.filter(function (x) { return closed.indexOf(x) < 0; });
      var hist = id ? movesOf(id) : [];
      function dayOf(t) { return Math.floor((t + tz) / (24 * BIO.HOUR)); }
      function at(day, h) { return day * 24 * BIO.HOUR - tz + h * BIO.HOUR; }
      function fit(t) { // أقرب وقت داخل ساعات العمل يتسع لزيارة كاملة
        var d = dayOf(t), h = (t + tz) / BIO.HOUR - d * 24;
        if (h < dS) return at(d, dS);
        if (h + dur > dE) return at(d + 1, dS);
        return t;
      }
      function earliest(moves, s, t) {
        var wait = null;
        for (var guard = 0; guard < 60; guard++) {
          t = fit(t);
          var r = BIO_evaluate({ itemMoves: moves, target: s, sitesById: sites, rules: rules, settings: st, now: t });
          if (r.decision === BIO.ALLOW) return { t: t, wait: wait };
          if (!wait) wait = { siteName: r.violations[0].siteName, hours: r.violations[0].required };
          t = Math.max(t + 60000, r.allowedAt + 60000);
        }
        return { t: t, wait: wait };
      }
      // تنفيذ ترتيب معين: كل زيارة في أقرب وقت مسموح داخل ساعات العمل
      function run(order) {
        var moves = hist.slice(), t = start, steps = [];
        order.forEach(function (sid) {
          var s = sites[sid], e = earliest(moves, s, t);
          steps.push({ siteId: s.id, siteName: s.name, sector: s.sector, level: s.level, alert: s.status === BIO.ST_ALERT, start: e.t, end: e.t + dur * BIO.HOUR, day: dayOf(e.t) - dayOf(start) + 1, waitedFor: e.wait });
          moves.push({ itemId: id, siteId: s.id, dir: BIO.IN, decision: BIO.ALLOW, time: e.t });
          moves.push({ itemId: id, siteId: s.id, dir: BIO.OUT, decision: BIO.ALLOW, time: e.t + dur * BIO.HOUR });
          t = e.t + (dur + trav) * BIO.HOUR;
        });
        return steps;
      }
      var endOf = function (steps) { return steps.length ? steps[steps.length - 1].end : start; };
      // أفضل ترتيب: بحث شامل مع تقليم حتى 7 مواقع، وما زاد يُرتب من الأعلى حماية للأقل مع مقارنة بالترتيب الجشع
      var best = null;
      function consider(order) { var st_ = run(order); if (!best || endOf(st_) < endOf(best)) best = st_; }
      var byLevel = ids.slice().sort(function (x, y) { return sites[x].level - sites[y].level || String(sites[x].sector).localeCompare(String(sites[y].sector)); });
      consider(byLevel); consider(ids);
      if (ids.length <= 7) {
        (function dfs(order, moves, t, left) {
          if (!left.length) { var st_ = run(order); if (endOf(st_) < endOf(best)) best = st_; return; }
          left.forEach(function (sid) {
            var e = earliest(moves, sites[sid], t), fin = e.t + dur * BIO.HOUR;
            if (fin >= endOf(best)) return;
            dfs(order.concat([sid]), moves.concat([{ itemId: id, siteId: sid, dir: BIO.IN, decision: BIO.ALLOW, time: e.t }, { itemId: id, siteId: sid, dir: BIO.OUT, decision: BIO.ALLOW, time: fin }]), fin + trav * BIO.HOUR, left.filter(function (x) { return x !== sid; }));
          });
        })([], hist.slice(), start, ids);
      }
      var plan = best, naive = run(ids);
      var days = function (st_) { return st_.length ? st_[st_.length - 1].day : 0; };
      var blocked = id ? companyLevels(sites).map(function (lv) { var r = BIO_evaluate({ itemMoves: hist, target: { id: '__L' + lv, level: lv }, sitesById: sites, rules: rules, settings: st, now: start }); return r.allowedAt ? { level: lv, until: r.allowedAt, why: r.reasons[0] } : null; }).filter(Boolean) : [];
      return { item: item, start: start, plan: plan, days: days(plan), naiveDays: days(naive), naiveEnd: naive.length ? naive[naive.length - 1].end : null, end: plan.length ? plan[plan.length - 1].end : null, closed: closed.map(function (x) { return sites[x].name; }), blockedNow: blocked, settings: { dayStart: dS, dayEnd: dE, visitHours: dur, travelHours: trav } };
    },

    /* ---------- تحليل شبكة المخالطة ---------- */
    /** من نقل الحركة بين المواقع خلال آخر days يوماً؟ الأشخاص والمركبات التي تربط مواقع وقطاعات كثيرة = «جسور» محتملة لنقل العدوى */
    network: function (pin, days) {
      auth(pin, 'analytics');
      days = Math.min(60, Math.max(3, Number(days) || 14));
      var now = deps.now(), since = now - days * 24 * BIO.HOUR, sites = sitesById();
      var items = {}; store.all('items').forEach(function (i) { items[BIO_norm(i.id)] = itemInfo(i); });
      var byItem = {};
      allMoves().forEach(function (m) {
        if (m.time < since || !BIO_counted(m) || (m.dir !== BIO.IN && m.dir !== BIO.EXT) || !sites[m.siteId]) return;
        (byItem[m.itemId] = byItem[m.itemId] || []).push(m);
      });
      var edges = {}, carriers = [], siteStat = {};
      Object.keys(byItem).forEach(function (iid) {
        var list = byItem[iid], seen = {}, sectors = {}, up = 0, fast = 0, hops = 0, path = [];
        list.forEach(function (m, i) {
          var s = sites[m.siteId];
          seen[s.id] = 1; if (s.sector && !s.external) sectors[s.sector] = 1;
          (siteStat[s.id] = siteStat[s.id] || { visits: 0, carriers: {} }).visits++;
          siteStat[s.id].carriers[iid] = 1;
          if (!path.length || path[path.length - 1].siteId !== s.id) path.push({ siteId: s.id, time: m.time });
          var prev = i ? sites[list[i - 1].siteId] : null;
          if (!prev || prev.id === s.id) return;
          hops++;
          var isUp = (s.level || 9) < (prev.level || 9), gap = (m.time - list[i - 1].time) / BIO.HOUR;
          if (isUp) { up++; if (gap < 72) fast++; }
          var k = prev.id + '>' + s.id, e = edges[k] = edges[k] || { from: prev.id, to: s.id, count: 0, carriers: {}, up: isUp, minGap: 1e9 };
          e.count++; e.carriers[iid] = 1; e.minGap = Math.min(e.minGap, Math.round(gap));
        });
        var nS = Object.keys(seen).length, nSec = Object.keys(sectors).length;
        var score = nS + 3 * Math.max(0, nSec - 1) + 2 * up + 3 * fast + Math.floor(hops / 2);
        var info = items[iid] || { id: iid, name: list[list.length - 1].itemName, kind: '' };
        carriers.push({ id: iid, name: info.name, kind: info.kind, dept: info.dept || '', watch: info.watch || '', sites: nS, sectors: nSec, hops: hops, up: up, fast: fast, score: score, bridge: nS >= 3 || nSec >= 2, path: path.slice(-14), last: list[list.length - 1].time });
      });
      carriers.sort(function (a, b) { return b.score - a.score || b.sites - a.sites; });
      var bridges = carriers.filter(function (c) { return c.bridge; });
      var siteList = Object.keys(sites).map(function (k) { var s = sites[k], ss = siteStat[k]; return { id: s.id, name: s.name, sector: s.sector, level: s.level, external: s.external, status: s.status, visits: ss ? ss.visits : 0, carriers: ss ? Object.keys(ss.carriers).length : 0, inbound: 0, outbound: 0 }; });
      var sm = {}; siteList.forEach(function (s) { sm[s.id] = s; });
      var edgeList = Object.keys(edges).map(function (k) { var e = edges[k]; sm[e.from].outbound += e.count; sm[e.to].inbound += e.count; return { from: e.from, to: e.to, count: e.count, up: e.up, minGap: e.minGap, carriers: Object.keys(e.carriers) }; }).sort(function (a, b) { return b.count - a.count; });
      var share = carriers.length ? Math.round(100 * bridges.reduce(function (a, c) { return a + c.hops; }, 0) / Math.max(1, carriers.reduce(function (a, c) { return a + c.hops; }, 0))) : 0;
      return { days: days, since: since, now: now, carriers: carriers, bridges: bridges.length, edges: edgeList, sites: siteList.filter(function (s) { return s.visits || !s.external; }), upMoves: edgeList.filter(function (e) { return e.up; }).reduce(function (a, e) { return a + e.count; }, 0), crossSector: carriers.filter(function (c) { return c.sectors >= 2; }).length, bridgeShare: share };
    },
    /** وضع ناقل تحت المراقبة المشددة أو رفعها: البوابة تنبه الأمن ويصل إشعار للمدير مع كل حركة له */
    setWatch: function (pin, itemId, on, note) {
      var u = auth(pin, 'data'), id = BIO_norm(itemId), it = store.find('items', id);
      if (!it) throw new Error('الكود غير مسجل');
      var v = on ? (String(note || '').trim() || BIO.YES) : '';
      deps.lock(function () {
        store.update('items', id, { watch: v });
        store.append('cardlog', { id: deps.id('K'), time: deps.now(), itemId: id, itemName: it.name, action: on ? 'وضع تحت المراقبة المشددة' : 'رفع المراقبة المشددة', card: '', by: u.name, note: note || '' });
      });
      return itemInfo(store.find('items', id));
    },

    /* ---------- ملف اعتماد المنشأة المعزولة (Compartmentalisation) ---------- */
    /** تقرير تدقيق للفترة يجمع عناصر الاعتماد وفق المنظمة العالمية لصحة الحيوان (WOAH Terrestrial Code، الفصلان 4.4 و4.5) */
    audit: function (pin, days) {
      var me = auth(pin, 'analytics');
      days = Math.min(365, Math.max(7, Number(days) || 30));
      var now = deps.now(), since = now - days * 24 * BIO.HOUR, sites = sitesById(), st = settings(), rules = store.all('rules');
      var all = allMoves(), mv = all.filter(function (m) { return m.time >= since; });
      var company = sitesList(sites).filter(function (s) { return !s.external; });
      var cps = store.all('checkpoints').map(function (c) { return { id: BIO_norm(c.id), name: c.name, sector: c.sector, serves: BIO_list(c.serves).map(BIO_norm) }; });
      var served = {}; cps.forEach(function (c) { c.serves.forEach(function (x) { served[x] = 1; }); });
      var levels = companyLevels(sites), sectors = {};
      company.forEach(function (s) { (sectors[s.sector] = sectors[s.sector] || []).push({ id: s.id, name: s.name, level: s.level, status: s.status, served: !!served[s.id] }); });
      var ins = mv.filter(function (m) { return m.dir === BIO.IN; });
      var allowed = ins.filter(function (m) { return BIO_counted(m); });
      var withChecks = allowed.filter(function (m) { return String(m.checks || '').trim(); });
      var exited = allowed.filter(function (m) { return all.some(function (o) { return o.itemId === m.itemId && o.siteId === m.siteId && o.dir === BIO.OUT && o.time >= m.time; }); });
      var openNow = allowed.length - exited.length;
      var denied = ins.filter(function (m) { return m.decision === BIO.DENY; });
      var overrides = ins.filter(function (m) { return m.decision === BIO.OVERRIDE; });
      var offline = mv.filter(function (m) { return m.offline; }), offFlag = mv.filter(function (m) { return m.flag === BIO.OFFLINE_FLAG; });
      var manual = mv.filter(function (m) { return /يدوي/.test(m.via || ''); }), revoked = mv.filter(function (m) { return /كارت ملغى/.test(m.flag || ''); });
      var ext = mv.filter(function (m) { return m.dir === BIO.EXT; });
      var appr = store.all('approvals').map(approvalOut).filter(function (a) { return a.time >= since; });
      var decided = appr.filter(function (a) { return a.decidedBy; });
      var reps = allReports().filter(function (r) { return r.time >= since; });
      var escMin = Number(st.ESCALATE_MINUTES) || 5;
      var fastAck = reps.filter(function (r) { return r.ackAt && (r.ackAt - r.time) <= escMin * 60000; });
      var closedWithAction = reps.filter(function (r) { return r.status === BIO.R_DONE && r.action; });
      var ackTimes = reps.filter(function (r) { return r.ackAt; }).map(function (r) { return (r.ackAt - r.time) / 6e4; }).sort(function (a, b) { return a - b; });
      var log = store.all('cardlog').filter(function (r) { return BIO_ms(r.time) >= since; });
      var users = store.all('users'), demoPins = users.filter(function (x) { return ['1111', '2222', '3333', '9999'].indexOf(String(x.pin).trim()) >= 0; }).length;
      var items = store.all('items').map(itemInfo), active = items.filter(function (i) { return i.active; });
      var pairsNeeded = [], missing = [];
      [1, 2, 3, 4].forEach(function (f) { levels.forEach(function (t) { if (f > t || (f === t && f <= 3)) { pairsNeeded.push([f, t]); if (!BIO_requiredHours(rules, f, t)) missing.push(f + '←' + t); } }); });
      var checksOk = ['CHECKS_PERSON', 'CHECKS_VEHICLE', 'CHECKS_EQUIPMENT'].filter(function (k) { return String(st[k] || '').trim(); }).length;
      var pct = function (a, b) { return b ? Math.round(100 * a / b) : 100; };
      var sitesOk = company.filter(function (s) { return s.level && s.sector && served[s.id]; }).length;
      var el = [
        { key: 'def', title: 'تعريف المنشأة المعزولة وحدودها', ref: 'WOAH 4.4.3 و4.5', score: pct(sitesOk, company.length), detail: company.length + ' موقعاً في ' + Object.keys(sectors).length + ' قطاع، ' + sitesOk + ' منها محددة المستوى ومغطاة بمنطقة تطهير. ' + cps.length + ' مناطق تطهير تتحكم في الدخول.', gaps: company.filter(function (s) { return !served[s.id]; }).map(function (s) { return 'الموقع «' + s.name + '» غير مربوط بمنطقة تطهير'; }) },
        { key: 'plan', title: 'خطة الأمن الحيوي الموثقة', ref: 'WOAH 4.5.3', score: Math.round((pct(pairsNeeded.length - missing.length, pairsNeeded.length) + pct(checksOk, 3)) / 2), detail: rules.length + ' قاعدة عزل بين المستويات، وقوائم إجراءات إلزامية للأفراد والمركبات والمعدات وفق دليل هابرد، وفترة راحة ' + (st.DOWNTIME_DAYS || 10) + ' أيام.', gaps: missing.map(function (x) { return 'لا توجد قاعدة عزل للانتقال من مستوى ' + x; }).concat(checksOk < 3 ? ['قائمة إجراءات دخول ناقصة في الإعدادات'] : []) },
        { key: 'trace', title: 'التتبع وسجلات الحركة', ref: 'WOAH 4.5.4 · 4.3', score: Math.round((pct(withChecks.length, allowed.length) + pct(exited.length, allowed.length)) / 2), detail: ins.length + ' محاولة دخول مسجلة، ' + pct(withChecks.length, allowed.length) + '% منها بإجراءات تطهير مؤكدة، و' + pct(exited.length, allowed.length) + '% لها خروج مسجل. ' + ext.length + ' إقرار بزيارة خارجية.', gaps: (allowed.length - withChecks.length ? [(allowed.length - withChecks.length) + ' دخول مسموح دون تأكيد إجراءات التطهير'] : []).concat(openNow > 0 ? [openNow + ' دخول دون خروج مسجل حتى الآن'] : []) },
        { key: 'ctrl', title: 'التحكم في الدخول وفصل المستويات', ref: 'WOAH 4.5.3', score: Math.max(0, 100 - (demoPins ? 30 : 0) - Math.min(40, offFlag.length * 10)), detail: denied.length + ' دخول مرفوض آلياً لمخالفة العزل، و' + revoked.length + ' محاولة بكارت ملغى رُفضت. ' + active.length + ' كارت نشط، و' + log.filter(function (r) { return /فقد/.test(r.action); }).length + ' كارت مفقود أُلغي وصدر بديله.', gaps: (demoPins ? [demoPins + ' مستخدم ما زال برقم سري تجريبي'] : []).concat(offFlag.length ? [offFlag.length + ' دخول مخالف سُجّل أثناء انقطاع الإنترنت'] : []) },
        { key: 'resp', title: 'الإبلاغ والاستجابة للطوارئ', ref: 'WOAH 4.5.6', score: reps.length ? pct(fastAck.length, reps.length) : 100, detail: reps.length + ' بلاغ عاجل، ' + fastAck.length + ' منها استُجيب له خلال ' + escMin + ' دقائق' + (ackTimes.length ? '، ووسيط زمن الاستجابة ' + Math.round(ackTimes[Math.floor(ackTimes.length / 2)] * 10) / 10 + ' دقيقة' : '') + '. ' + reps.filter(function (r) { return r.escLevel > 0; }).length + ' بلاغ احتاج تصعيداً.', gaps: reps.filter(function (r) { return !r.ackAt || (r.ackAt - r.time) > escMin * 60000; }).map(function (r) { return r.ackAt ? 'بلاغ «' + r.type + '» استُجيب له بعد ' + Math.round((r.ackAt - r.time) / 6e4) + ' دقيقة (أكثر من حد التصعيد ' + escMin + ' دقائق)' : 'بلاغ «' + r.type + '» بلا استجابة'; }) },
        { key: 'corr', title: 'الإجراءات التصحيحية والاستثناءات', ref: 'WOAH 4.5.5', score: Math.round((pct(decided.length, appr.length) + pct(closedWithAction.length, reps.filter(function (r) { return r.status === BIO.R_DONE; }).length)) / 2), detail: appr.length + ' طلب استثناء، ' + decided.length + ' منها بقرار موثق باسم صاحبه. ' + overrides.length + ' دخول استثنائي معتمد. ' + manual.length + ' دخول يدوي بتحقق من الهوية.', gaps: appr.filter(function (a) { return !a.decidedBy; }).map(function (a) { return 'طلب استثناء لـ«' + a.itemName + '» بلا قرار'; }) }
      ];
      el.forEach(function (e) { e.status = e.score >= 90 ? 'مطابق' : e.score >= 70 ? 'مطابق مع ملاحظات' : 'يحتاج إجراء'; });
      var overall = Math.round(el.reduce(function (a, e) { return a + e.score; }, 0) / el.length);
      var nc = [];
      mv.forEach(function (m) {
        if (m.flag) nc.push({ time: m.time, type: m.flag, text: m.itemName + ' ← ' + m.siteName, by: m.checkpoint });
        else if (m.decision === BIO.OVERRIDE) nc.push({ time: m.time, type: 'دخول استثنائي معتمد', text: m.itemName + ' ← ' + m.siteName, by: m.checkpoint });
      });
      reps.forEach(function (r) { nc.push({ time: r.time, type: 'بلاغ: ' + r.type, text: (r.siteName || '') + (r.action ? ' · ' + r.action : ''), by: r.ackBy || r.fromName }); });
      nc.sort(function (a, b) { return b.time - a.time; });
      return {
        company: st.COMPANY || '', by: me.name, now: now, since: since, days: days, overall: overall, elements: el,
        sectors: Object.keys(sectors).map(function (k) { return { name: k, sites: sectors[k].sort(function (a, b) { return a.level - b.level; }) }; }),
        checkpoints: cps.map(function (c) { return { name: c.name, sector: c.sector, serves: c.serves.length }; }),
        rules: rules.map(function (r) { return { from: Number(r.from), to: Number(r.to), hours: Number(r.hours), note: r.note || '' }; }).sort(function (a, b) { return a.to - b.to || a.from - b.from; }),
        checks: { person: BIO_list(st.CHECKS_PERSON), vehicle: BIO_list(st.CHECKS_VEHICLE), equipment: BIO_list(st.CHECKS_EQUIPMENT), downtime: Number(st.DOWNTIME_DAYS) || 10 },
        kpi: { attempts: ins.length, allowed: allowed.length, denied: denied.length, overrides: overrides.length, exits: mv.filter(function (m) { return m.dir === BIO.OUT; }).length, ext: ext.length, offline: offline.length, manual: manual.length, checksPct: pct(withChecks.length, allowed.length), exitPct: pct(exited.length, allowed.length), reports: reps.length, approvals: appr.length, carriers: Object.keys(mv.reduce(function (a, m) { a[m.itemId] = 1; return a; }, {})).length },
        nonconformities: nc.slice(0, 40),
        external: ['برنامج الترصد والفحوص المعملية الدورية (مثل مسحات إنفلونزا الطيور ونيوكاسل)', 'سجلات التحصين لكل قطيع', 'مكافحة القوارض والطيور البرية والحشرات', 'سلامة المياه والعلف ومصادرهما', 'سجلات تدريب العاملين على الأمن الحيوي', 'التدقيق الرسمي السنوي من الهيئة العامة للخدمات البيطرية']
      };
    },

    /* ---------- الكروت: فقد وتلف وإصدار بديل ---------- */
    /** kind: 'فقد' يلغي الكارت القديم فوراً ويرفع رقم الإصدار، 'تلف' يعيد طباعة نفس الكارت */
    cardReport: function (pin, itemId, kind, note) {
      var u = auth(pin, 'data'), id = BIO_norm(itemId), it = store.find('items', id);
      if (!it) throw new Error('الكود غير مسجل');
      var ver = Number(it.card) || 1, lost = kind === 'فقد';
      if (lost) ver++;
      deps.lock(function () {
        if (lost) store.update('items', id, { card: ver });
        store.append('cardlog', { id: deps.id('K'), time: deps.now(), itemId: id, itemName: it.name, action: lost ? 'فقد: إلغاء الكارت القديم وإصدار بديل' : 'تلف: إعادة طباعة نفس الكارت', card: ver, by: u.name, note: note || '' });
      });
      if (lost) deps.notify({ kind: 'notice', title: '🪪 إلغاء كارت مفقود', body: it.name + ' (' + id + ')\nأي كارت قديم بهذا الكود يُرفض على البوابات ويصل تنبيه فوري.\nالكارت الجديد: الإصدار ' + ver });
      var info = itemInfo(store.find('items', id));
      return { item: info, code: BIO_cardCode(id, info.card) };
    },
    cardLog: function (pin) {
      auth(pin, true);
      return store.all('cardlog').map(function (r) { return { id: r.id, time: BIO_ms(r.time), itemId: BIO_norm(r.itemId), itemName: r.itemName, action: r.action, card: Number(r.card) || 1, by: r.by, note: r.note || '' }; }).sort(function (a, b) { return b.time - a.time; }).slice(0, 200);
    },
    /** بيانات دخول البوابات لإرسالها لهاتف كل بوابة؛ reset يصدر رقماً سرياً جديداً (عند فقد الجهاز أو تسرب الرقم) فيخرج أي جهاز قديم تلقائياً */
    gateAccess: function (pin, userId, reset) {
      var me = auth(pin, 'admin'), sites = sitesById();
      var list = store.all('users').filter(function (x) { return String(x.role).trim() === BIO.ROLE_GUARD && (!userId || BIO_norm(x.id) === BIO_norm(userId)); });
      if (userId && !list.length) throw new Error('المستخدم غير موجود');
      if (reset) {
        var x = list[0], np;
        do { np = String(100000 + Math.floor(Math.random() * 900000)); } while (userByPin(np));
        deps.lock(function () {
          store.update('users', x.id, { pin: np });
          store.append('cardlog', { id: deps.id('K'), time: deps.now(), itemId: BIO_norm(x.id), itemName: x.name, action: 'رقم سري جديد للبوابة (الرقم القديم أُلغي)', card: '', by: me.name, note: '' });
        });
      }
      return list.map(function (x) {
        var g = gateFor({ gateId: BIO_norm(x.gate), isManager: false }, sites);
        return { id: BIO_norm(x.id), name: x.name, gate: g.name || '', sector: g.sector || '', phone: x.phone ? String(x.phone) : '', pin: userId ? String(x.pin) : '', appUrl: settings().APP_URL || '' };
      });
    },

    /* ---------- إدارة البيانات ---------- */
    adminList: function (pin, table) {
      auth(pin, table === 'users' || table === 'contacts' ? 'admin' : true);
      if (!ADMIN[table]) throw new Error('جدول غير معروف');
      var key = TABLES[table].key;
      return store.all(table).map(function (r) {
        var o = { _key: String(r[key]) };
        ADMIN[table].fields.forEach(function (f) { o[f.k] = f.k === 'pin' ? '••••' : (r[f.k] == null ? '' : r[f.k]); });
        if (table === 'rules') o.id = r.id;
        return o;
      });
    },

    adminSave: function (pin, table, row, originalKey) {
      var adminU = auth(pin, adminPerm(table));
      if (table === 'users') return api.userSave(pin, row, originalKey);
      var def = ADMIN[table];
      if (!def) throw new Error('جدول غير معروف');
      var key = TABLES[table].key, obj = {};
      def.fields.forEach(function (f) {
        if (f.ro && originalKey) return;
        var v = row[f.k] == null ? '' : String(row[f.k]).trim();
        if (f.upper) v = v.toUpperCase();
        if (f.k === 'pin' && v === '••••') return;
        if (f.req && !v) throw new Error('الحقل «' + TABLES[table].cols[f.k] + '» مطلوب');
        if (f.type === 'number' && v && isNaN(Number(v))) throw new Error('«' + TABLES[table].cols[f.k] + '» يجب أن يكون رقماً');
        obj[f.k] = f.type === 'number' || (f.type === 'select' && /^\d+$/.test(v)) ? Number(v) : v;
      });
      if (table === 'rules') obj.id = 'R' + obj.from + '-' + obj.to;
      if (table === 'users' && obj.pin) {
        var clash = userByPin(obj.pin);
        if (clash && BIO_norm(clash.id) !== BIO_norm(originalKey || obj.id)) throw new Error('هذا الرقم السري مستخدم لشخص آخر');
      }
      var k = obj[key] != null && obj[key] !== '' ? obj[key] : originalKey;
      var existing = originalKey ? store.find(table, originalKey) : null;
      var before = existing ? Object.assign({}, existing) : null;
      if (table === 'items' && !existing) obj.added = deps.now();
      if (table === 'sites' && (obj.lat !== '' || obj.lng !== '') && (!before || String(before.lat) !== String(obj.lat) || String(before.lng) !== String(obj.lng))) obj.geo = 'مؤكدة';
      deps.lock(function () {
        if (existing) {
          if (BIO_norm(originalKey) !== BIO_norm(k) && store.find(table, k)) throw new Error('الكود «' + k + '» موجود بالفعل');
          store.update(table, originalKey, obj);
        } else {
          if (store.find(table, k)) throw new Error('الكود «' + k + '» موجود بالفعل');
          if (table === 'users' && !obj.pin) throw new Error('الرقم السري مطلوب');
          store.append(table, obj);
        }
      });
      if (api._log) api._log(adminU, table, k, before ? 'تعديل' : 'إضافة', before, obj);
      return { ok: true, key: k };
    },

    /** إضافة أو تحديث مجموعة سجلات مرة واحدة (لصق من إكسيل) */
    adminBulk: function (pin, table, rows) {
      var adminU = auth(pin, adminPerm(table));
      var def = ADMIN[table];
      if (!def || def.noAdd) throw new Error('لا يمكن الإدخال بالجملة في هذا الجدول');
      if (!rows || !rows.length) throw new Error('لا توجد صفوف');
      if (rows.length > 3000) throw new Error('الحد الأقصى 3000 صف في المرة');
      var key = TABLES[table].key, added = [], updated = 0, errors = [], seen = {};
      rows.forEach(function (row, i) {
        try {
          var obj = {};
          def.fields.forEach(function (f) {
            var v = row[f.k] == null ? '' : String(row[f.k]).trim();
            if (f.upper) v = v.toUpperCase();
            if (!v && f.def) v = f.def;
            if (f.req && !v) throw new Error('«' + TABLES[table].cols[f.k] + '» فارغ');
            if (f.type === 'select' && v && f.opts.map(String).indexOf(v) < 0) throw new Error('«' + v + '» ليست قيمة مقبولة في ' + TABLES[table].cols[f.k]);
            obj[f.k] = f.type === 'number' || (f.type === 'select' && /^\d+$/.test(v)) ? Number(v) : v;
          });
          if (table === 'rules') obj.id = 'R' + obj.from + '-' + obj.to;
          if (table === 'users') throw new Error('أضف المستخدمين واحداً واحداً لضبط الرقم السري');
          var k = BIO_norm(obj[key]);
          if (seen[k]) throw new Error('الكود مكرر في البيانات الملصقة');
          seen[k] = true;
          var ex = store.find(table, k);
          if (ex) { store.update(table, ex[key], obj); updated++; } else { if (table === 'items') obj.added = deps.now(); added.push(obj); }
        } catch (e) { errors.push('صف ' + (i + 1) + ': ' + e.message); }
      });
      deps.lock(function () {
        if (store.appendMany) store.appendMany(table, added);
        else added.forEach(function (o) { store.append(table, o); });
      });
      if (api._log && (added.length || updated)) api._log(adminU, table, added.length + updated + ' سجل', 'إدخال بالجملة', null, { added: added.length, updated: updated });
      return { added: added.length, updated: updated, errors: errors.slice(0, 30), errorCount: errors.length };
    },

    adminBulkDelete: function (pin, table, keys) {
      var u = auth(pin, adminPerm(table));
      if (!ADMIN[table] || ADMIN[table].noAdd) throw new Error('لا يمكن الحذف من هذا الجدول');
      var list = (keys || []).map(BIO_norm).filter(function (k) { return !(table === 'users' && k === u.id); });
      deps.lock(function () {
        if (store.removeMany) store.removeMany(table, list);
        else list.forEach(function (k) { store.remove(table, k); });
      });
      if (api._log && list.length) api._log(u, table, list.length + ' سجل', 'حذف بالجملة', { keys: list.slice(0, 40).join('، ') }, null);
      return { deleted: list.length };
    },

    adminDelete: function (pin, table, key) {
      var u = auth(pin, adminPerm(table));
      if (!ADMIN[table] || ADMIN[table].noAdd) throw new Error('لا يمكن الحذف من هذا الجدول');
      if (table === 'users' && BIO_norm(key) === u.id) throw new Error('لا يمكنك حذف حسابك');
      var gone = store.find(table, key); gone = gone ? Object.assign({}, gone) : null;
      deps.lock(function () { store.remove(table, key); });
      if (api._log) api._log(u, table, key, 'حذف', gone, null);
      return { ok: true };
    },

    registerDevice: function (pin, token, gateName) {
      var u = auth(pin);
      if (!token) throw new Error('رمز الجهاز فارغ');
      var row = { token: token, userId: u.id, userName: u.name, role: u.role, gate: u.gateId || gateName || '', updated: deps.now() };
      deps.lock(function () { if (store.find('devices', token)) store.update('devices', token, row); else store.append('devices', row); });
      return { ok: true };
    }
  };
  var H_ = { store: store, deps: deps, auth: auth, settings: settings, sitesById: sitesById, sitesList: sitesList, inScope: inScope, itemInfo: itemInfo, allMoves: allMoves, movesOf: movesOf, appUrl: appUrl, missionOut: missionOut, selfStaff: selfStaff, gateFor: gateFor, userByPin: userByPin };
  BIO_ext(api, H_);
  BIO_vrBridge(api, H_);
  BIO_codes(api, H_);
  BIO_v13(api, H_);
  if (typeof BIO_v14 === 'function') BIO_v14(api, H_);
  if (typeof BIO_v15 === 'function') BIO_v15(api, H_);
  return api;
}

/** مخزن بيانات في الذاكرة (لنسخة العرض والتطبيق عند انقطاع الإنترنت والاختبارات) */
function BIO_memoryStore(seed) {
  var db = {};
  Object.keys(TABLES).forEach(function (t) { db[t] = (seed[t] || []).map(function (r) { return Object.assign({}, r); }); });
  function idx(t, key) {
    var k = TABLES[t].key, v = BIO_norm(key);
    for (var i = 0; i < db[t].length; i++) if (BIO_norm(db[t][i][k]) === v) return i;
    return -1;
  }
  return {
    all: function (t) { return db[t]; },
    find: function (t, key) { var i = idx(t, key); return i < 0 ? null : db[t][i]; },
    append: function (t, obj) { db[t].push(Object.assign({}, obj)); },
    update: function (t, key, patch) { var i = idx(t, key); if (i >= 0) Object.assign(db[t][i], patch); },
    remove: function (t, key) { var i = idx(t, key); if (i >= 0) db[t].splice(i, 1); }
  };
}


/* =====================================================================
   الإصدار 5: رادار الطيور المهاجرة، شركات النقل، النافق والسبلة،
   التدقيق والإجراءات التصحيحية، أكاديمية الأمن الحيوي، سجل التعديلات والنسخ الاحتياطي
   ===================================================================== */

/** مسارات الهجرة فوق مصر (نموذج مبني على المعرفة المنشورة: BirdLife وممر الوادي المتصدع/البحر الأحمر واتفاقية AEWA).
 *  المسار مرتب في اتجاه الهجرة الخريفية (شمال → جنوب)، والربيعية عكسه. months = شدة الهجرة من يناير إلى ديسمبر (0 إلى 1) */
var BIO_FLYWAYS = [
  { id: 'NILE', name: 'ممر وادي النيل', species: 'البط البري والبلشون وطيور الماء والعصفوريات', color: '#3b82c4',
    months: [0.45, 0.55, 0.8, 0.65, 0.25, 0.05, 0.05, 0.3, 0.65, 0.9, 0.8, 0.55],
    path: [[31.52, 31.84], [31.0, 31.42], [30.47, 31.18], [30.05, 31.23], [29.07, 31.1], [28.1, 30.75], [27.18, 31.18], [26.16, 32.72], [25.69, 32.64], [23.97, 32.88], [22.6, 31.9]] },
  { id: 'REDSEA', name: 'ممر البحر الأحمر والوادي المتصدع', species: 'اللقلق الأبيض والجوارح (الصقور والعقبان والحدأة)', color: '#c2410c',
    months: [0.05, 0.3, 0.9, 0.85, 0.45, 0.05, 0.05, 0.4, 0.95, 0.7, 0.2, 0.05],
    path: [[31.05, 33.6], [30.45, 32.6], [29.97, 32.5], [29.6, 32.35], [29.11, 32.65], [28.36, 33.08], [27.26, 33.81], [26.1, 34.28], [25.07, 34.9], [23.95, 35.48], [22.3, 36.4]] },
  { id: 'MED', name: 'ساحل المتوسط وبحيرات الدلتا', species: 'البط الشتوي والخضاري والشرشير والنوارس (أعلى خطر لإنفلونزا الطيور)', color: '#0f766e', bearing: 180,
    months: [0.95, 0.85, 0.55, 0.25, 0.05, 0.02, 0.02, 0.1, 0.35, 0.65, 0.9, 1],
    path: [[31.35, 27.24], [30.83, 28.95], [31.1, 29.9], [31.26, 30.2], [31.5, 30.85], [31.25, 32.0], [31.15, 33.1]] },
  { id: 'OASIS', name: 'ممر الواحات والصحراء الغربية', species: 'العصفوريات والسمان والبط المتجه لقارون ووادي الريان', color: '#a16207',
    months: [0.15, 0.25, 0.65, 0.75, 0.35, 0.02, 0.02, 0.3, 0.75, 0.85, 0.45, 0.2],
    path: [[30.83, 28.95], [30.42, 30.3], [29.85, 30.48], [29.47, 30.6], [29.2, 30.42], [28.35, 28.86], [27.06, 27.97], [25.5, 29.0]] }
];
/** المسطحات المائية التي يتجمع فيها البط والطيور المائية شتاءً (مصادر محلية للعدوى) */
var BIO_WETLANDS = [
  { id: 'QARUN', name: 'بحيرة قارون', lat: 29.47, lng: 30.62, w: 1 },
  { id: 'RAYAN', name: 'بحيرات وادي الريان', lat: 29.2, lng: 30.42, w: 0.9 },
  { id: 'NATRUN', name: 'بحيرات وادي النطرون', lat: 30.38, lng: 30.33, w: 0.8 },
  { id: 'MARYUT', name: 'بحيرة مريوط', lat: 31.1, lng: 29.92, w: 0.9 },
  { id: 'IDKU', name: 'بحيرة إدكو', lat: 31.26, lng: 30.2, w: 0.9 },
  { id: 'BURULLUS', name: 'بحيرة البرلس', lat: 31.5, lng: 30.85, w: 1 },
  { id: 'MANZALA', name: 'بحيرة المنزلة', lat: 31.25, lng: 32.0, w: 1 },
  { id: 'BARDAWIL', name: 'بحيرة البردويل', lat: 31.15, lng: 33.1, w: 0.8 },
  { id: 'QANATER', name: 'النيل عند القناطر الخيرية', lat: 30.19, lng: 31.13, w: 0.6 },
  { id: 'NASSER', name: 'بحيرة ناصر', lat: 22.9, lng: 32.0, w: 0.7 }
];
var BIO_WETLAND_MONTHS = [1, 0.95, 0.7, 0.35, 0.1, 0.05, 0.05, 0.1, 0.35, 0.65, 0.9, 1];
/** الرياح السائدة على ارتفاع 1500 متر تقريباً فوق شمال مصر (من أين تهب، كم/س) لكل شهر: بديل مناخي عند غياب البيانات الحية */
var BIO_CLIMO_WIND = [[300, 30], [310, 30], [320, 28], [330, 24], [340, 22], [350, 22], [355, 24], [350, 24], [345, 22], [335, 22], [320, 26], [305, 30]];
/** حدود مصر مبسطة (للرسم فقط) */
var BIO_EGYPT = [[31.57, 25.15], [31.61, 25.93], [31.35, 27.23], [30.83, 28.95], [31.2, 29.9], [31.32, 30.07], [31.46, 30.37], [31.6, 31.1], [31.52, 31.84], [31.27, 32.3], [31.13, 33.8], [31.32, 34.22], [29.49, 34.89], [29.0, 34.67], [28.5, 34.51], [27.91, 34.33], [27.73, 34.25], [28.24, 33.6], [29.05, 33.1], [29.6, 32.72], [29.97, 32.55], [29.6, 32.35], [29.11, 32.65], [28.36, 33.08], [27.26, 33.81], [26.75, 33.94], [26.1, 34.28], [25.07, 34.9], [23.95, 35.48], [22.2, 36.6], [22.0, 36.9], [22.0, 31.4], [22.0, 25.0], [29.25, 25.0], [30.3, 24.75], [31.57, 25.15]];
var BIO_NILE = [[22.0, 31.35], [22.6, 31.75], [23.3, 32.6], [23.97, 32.88], [24.97, 32.87], [25.69, 32.64], [26.16, 32.72], [26.55, 31.7], [27.18, 31.18], [28.1, 30.75], [29.07, 31.1], [30.05, 31.23], [30.18, 31.12]];
var BIO_NILE_ROSETTA = [[30.18, 31.12], [30.6, 30.9], [31.0, 30.6], [31.46, 30.37]];
var BIO_NILE_DAMIETTA = [[30.18, 31.12], [30.47, 31.18], [31.0, 31.42], [31.52, 31.84]];
var BIO_SUEZ = [[31.27, 32.3], [30.6, 32.3], [29.97, 32.55]];
var BIO_TOWNS = [['القاهرة', 30.05, 31.24], ['الإسكندرية', 31.2, 29.92], ['الفيوم', 29.31, 30.84], ['السويس', 29.97, 32.53], ['أسيوط', 27.18, 31.18], ['أسوان', 24.09, 32.9], ['مرسى مطروح', 31.35, 27.24], ['الواحات البحرية', 28.35, 28.86]];
/** أجناس الطيور الأعلى خطراً في نقل إنفلونزا الطيور (لتصفية مشاهدات eBird) */
var BIO_RISK_GENERA = ['Anas', 'Spatula', 'Mareca', 'Aythya', 'Netta', 'Tadorna', 'Anser', 'Cygnus', 'Fulica', 'Gallinula', 'Larus', 'Chroicocephalus', 'Ardea', 'Egretta', 'Bubulcus', 'Ciconia', 'Plegadis', 'Phalacrocorax', 'Pelecanus', 'Vanellus', 'Calidris', 'Tringa', 'Columba', 'Streptopelia', 'Passer', 'Corvus'];

function BIO_rad(d) { return d * Math.PI / 180; }
function BIO_km(a, b) {
  var R = 6371, dLat = BIO_rad(b[0] - a[0]), dLng = BIO_rad(b[1] - a[1]);
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(BIO_rad(a[0])) * Math.cos(BIO_rad(b[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function BIO_bearing(a, b) {
  var y = Math.sin(BIO_rad(b[1] - a[1])) * Math.cos(BIO_rad(b[0])), x = Math.cos(BIO_rad(a[0])) * Math.sin(BIO_rad(b[0])) - Math.sin(BIO_rad(a[0])) * Math.cos(BIO_rad(b[0])) * Math.cos(BIO_rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function BIO_angDiff(a, b) { var d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; }
function BIO_compass(deg) { return ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'][Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }
/** أقرب نقطة على المسار للموقع (إسقاط محلي مسطح يكفي لمسافات مئات الكيلومترات) */
function BIO_nearestOnPath(p, path) {
  var best = null, kx = Math.cos(BIO_rad(p[0]));
  for (var i = 0; i < path.length - 1; i++) {
    var a = path[i], b = path[i + 1], ax = a[1] * kx, ay = a[0], bx = b[1] * kx, by = b[0], px = p[1] * kx, py = p[0];
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    var q = [ay + t * dy, (ax + t * dx) / kx], d = BIO_km(p, q);
    if (!best || d < best.d) best = { d: d, pt: q, seg: i, heading: BIO_bearing(a, b) };
  }
  return best;
}
/** الشهر الحالي ككسر (أكتوبر 7 = 9.2) لتنعيم الشدة بين الشهور */
function BIO_monthFrac(t) { var d = new Date(t + 3 * BIO.HOUR); return d.getUTCMonth() + (d.getUTCDate() - 1) / 30; }
function BIO_monthly(arr, t) { var m = BIO_monthFrac(t), i = Math.floor(m), f = m - i; return arr[i % 12] * (1 - f) + arr[(i + 1) % 12] * f; }
function BIO_season(t) {
  var m = new Date(t + 3 * BIO.HOUR).getUTCMonth();
  if (m >= 7 && m <= 10) return { k: 'autumn', label: m === 8 || m === 9 ? 'ذروة الهجرة الخريفية' : 'موسم الهجرة الخريفية', dir: 'جنوباً', note: 'الطيور تعبر مصر من أوروبا وآسيا نحو أفريقيا، وتبدأ أسراب البط الشتوي في الوصول لبحيرات الدلتا والفيوم.' };
  if (m === 11 || m <= 1) return { k: 'winter', label: 'التشتية: البط في البحيرات', dir: 'تنقلات محلية', note: 'أعلى تجمع للبط والطيور المائية في البحيرات الشمالية وقارون ووادي الريان، وهو الموسم الأخطر لإنفلونزا الطيور في مصر.' };
  if (m >= 2 && m <= 4) return { k: 'spring', label: m === 2 || m === 3 ? 'ذروة الهجرة الربيعية' : 'نهاية الهجرة الربيعية', dir: 'شمالاً', note: 'الطيور تعود من أفريقيا شمالاً عبر البحر الأحمر ووادي النيل.' };
  return { k: 'summer', label: 'هدوء نسبي', dir: '—', note: 'أقل نشاط للهجرة. يبقى الحذر من الطيور المقيمة (الحمام والعصافير والغربان) حول العنابر.' };
}
/** عدد عناصر متجه السرعة: سرعة الطيران الذاتية تقريباً 40 كم/س، وتحمله الرياح */
var BIO_AIRSPEED = 40;
/** حساب خطر الطيور المهاجرة لكل موقع: wx[siteId] = { dir: من أين تهب الرياح، spd: كم/س }، sightings = مشاهدات حديثة */
function BIO_eta(h) { h = Number(h) || 0; return h < 1 ? Math.max(10, Math.round(h * 6) * 10) + ' دقيقة' : (Math.round(h * 10) / 10) + ' ساعة'; }
function BIO_birdLevel(score) { return score >= 75 ? { k: 'crit', label: 'حرج' } : score >= 55 ? { k: 'high', label: 'مرتفع' } : score >= 30 ? { k: 'mid', label: 'متوسط' } : { k: 'low', label: 'منخفض' }; }
function BIO_birdModel(sites, wx, sightings, t, opts) {
  opts = opts || {};
  var season = BIO_season(t), spring = season.k === 'spring', radius = Number(opts.radius) || 50, climo = BIO_CLIMO_WIND[new Date(t + 3 * BIO.HOUR).getUTCMonth()];
  var fws = BIO_FLYWAYS.map(function (f) { return { f: f, I: BIO_monthly(f.months, t) }; }), wI = BIO_monthly(BIO_WETLAND_MONTHS, t);
  return sites.filter(function (s) { return s.lat != null && s.lng != null && !isNaN(s.lat) && !isNaN(s.lng); }).map(function (s) {
    var p = [s.lat, s.lng], w = (wx && wx[s.id]) || null, wd = w ? w.dir : climo[0], ws = w ? w.spd : climo[1];
    var toward = (wd + 180) % 360;
    function track(heading) {
      var vx = BIO_AIRSPEED * Math.sin(BIO_rad(heading)) + ws * Math.sin(BIO_rad(toward)), vy = BIO_AIRSPEED * Math.cos(BIO_rad(heading)) + ws * Math.cos(BIO_rad(toward));
      return { b: (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360, v: Math.max(12, Math.sqrt(vx * vx + vy * vy)) };
    }
    var parts = [], flocks = [], factors = [];
    fws.forEach(function (x) {
      if (x.I < 0.08) return;
      var n = BIO_nearestOnPath(p, x.f.path), heading = x.f.bearing != null ? x.f.bearing : n.heading;
      if (spring) heading = (heading + 180) % 360;
      var tr = track(heading), toSite = BIO_bearing(n.pt, p), al = n.d < 10 ? 1 : Math.max(0, Math.cos(BIO_rad(BIO_angDiff(tr.b, toSite))));
      var prox = Math.exp(-n.d / 45), sc = 62 * x.I * prox * (0.3 + 0.7 * al * al);
      parts.push(sc);
      if (sc >= 4) factors.push({ k: 'fw', label: x.f.name, d: Math.round(n.d), pts: Math.round(sc), intensity: Math.round(x.I * 100) });
      if (sc >= 8 && al >= 0.55 && n.d <= 220) flocks.push({ from: x.f.name, kind: 'ممر هجرة', fw: x.f.id, color: x.f.color, lat: n.pt[0], lng: n.pt[1], d: Math.round(n.d), track: Math.round(tr.b), speed: Math.round(tr.v), eta: Math.max(0.3, Math.round(n.d / tr.v * 10) / 10), score: Math.round(sc), species: x.f.species });
    });
    BIO_WETLANDS.forEach(function (wl) {
      var d = BIO_km([wl.lat, wl.lng], p);
      if (d > 160) return;
      // تنقلات البط اليومية بين البحيرة ومناطق الغذاء تنجرف مع الرياح
      var toSite = BIO_bearing([wl.lat, wl.lng], p), al = Math.max(0, Math.cos(BIO_rad(BIO_angDiff(toward, toSite))));
      var prox = Math.exp(-d / 30), sc = 55 * wI * wl.w * prox * (0.3 + 0.7 * al);
      parts.push(sc);
      if (sc >= 3) factors.push({ k: 'wl', label: wl.name, d: Math.round(d), pts: Math.round(sc), intensity: Math.round(wI * 100) });
      if (sc >= 5 && al >= 0.6) { var tr = track(toward); flocks.push({ from: wl.name, kind: 'تجمع طيور مائية', fw: 'WL', color: '#2563eb', lat: wl.lat, lng: wl.lng, d: Math.round(d), track: Math.round(tr.b), speed: Math.round(tr.v), eta: Math.max(0.3, Math.round(d / tr.v * 10) / 10), score: Math.round(sc), species: 'البط والطيور المائية' }); }
    });
    var near = (sightings || []).filter(function (o) { return o.lat != null && BIO_km([o.lat, o.lng], p) <= radius; });
    // المشاهدة الأقرب والأحدث والأكبر عدداً تؤثر أكثر (تتلاشى مع المسافة وخلال يومين)
    var sightPts = 0;
    if (near.length) {
      near.forEach(function (o) { var d = BIO_km([o.lat, o.lng], p), age = Math.max(0, (t - (o.time || t)) / BIO.HOUR); sightPts += (6 + Math.log(Number(o.count || 1) + 1) / Math.LN10 * 7) * Math.exp(-d / 20) * Math.exp(-age / 36); });
      sightPts = Math.min(35, sightPts);
      if (sightPts >= 1) factors.push({ k: 'obs', label: near.length + ' مشاهدة خلال ' + radius + ' كم', d: Math.round(Math.min.apply(null, near.map(function (o) { return BIO_km([o.lat, o.lng], p); }))), pts: Math.round(sightPts), intensity: 0 });
    }
    var keep = 1; parts.forEach(function (v) { keep *= 1 - Math.min(95, v) / 100; });
    var score = Math.min(100, Math.round((1 - keep) * 100 + sightPts));
    var lvl = BIO_birdLevel(score);
    factors.sort(function (a, b) { return b.pts - a.pts; }); flocks.sort(function (a, b) { return b.score - a.score; });
    return { id: s.id, name: s.name, sector: s.sector, level: s.level, lat: s.lat, lng: s.lng, geo: s.geo || '', score: score, lvl: lvl, wind: { dir: Math.round(wd), spd: Math.round(ws), toward: Math.round(toward), live: !!w, label: 'من ' + BIO_compass(wd) }, factors: factors.slice(0, 5), flocks: flocks.slice(0, 3), sightings: near.length };
  }).sort(function (a, b) { return b.score - a.score; });
}

/** قائمة التدقيق الداخلي (من دليل Hubbard Efficiency Plus ومعايير WOAH للأمن الحيوي) */
var BIO_CHECKLIST = [
  { sec: 'السياج والبوابات', items: [
    { k: 'F1', t: 'السياج الخارجي سليم بلا فتحات، والبوابة مغلقة ومراقبة', fix: 'إصلاح الفتحات وإغلاق البوابة بقفل وتعيين فرد مسؤول' },
    { k: 'F2', t: 'لافتة «ممنوع الدخول - منطقة أمن حيوي» واضحة على البوابة', fix: 'تركيب لافتة واضحة على كل مدخل' },
    { k: 'F3', t: 'كل الحركات مسجلة في النظام بمسح الكارت (لا دخول يدوي متكرر)', fix: 'مراجعة أجهزة المسح وتدريب الأمن وتسجيل كل حركة' }] },
  { sec: 'الاستحمام وتغيير الملابس', items: [
    { k: 'S1', t: 'غرفة الاستحمام مقسمة بوضوح لجانب متسخ وجانب نظيف', fix: 'تحديد خط الفصل بالأرضية واللافتات ومنع العبور العكسي' },
    { k: 'S2', t: 'مياه ساخنة وصابون وشامبو ومناشف نظيفة متوفرة', fix: 'توفير المستلزمات وتعيين مسؤول متابعة يومية' },
    { k: 'S3', t: 'ملابس وأحذية الموقع متوفرة بكل المقاسات ومغسولة', fix: 'زيادة مخزون الملابس وجدول غسيل يومي' }] },
  { sec: 'تطهير المركبات والمعدات', items: [
    { k: 'V1', t: 'حوض تطهير الإطارات ممتلئ بتركيز مطهر صحيح ومتجدد', fix: 'تجديد المحلول وتسجيل التركيز ووقت التغيير يومياً' },
    { k: 'V2', t: 'رشاش تطهير المركبات يعمل ويغطي الشاسيه والكابينة', fix: 'صيانة الرشاش وتجربة التغطية الكاملة' },
    { k: 'V3', t: 'المعدات والأدوات تُنظف وتُطهر قبل دخول العنابر', fix: 'تخصيص منطقة تطهير للمعدات وسجل لكل معدة' }] },
  { sec: 'القوارض والطيور البرية', items: [
    { k: 'R1', t: 'محطات الطعوم مرقمة وتُفحص أسبوعياً بسجل', fix: 'ترقيم المحطات وجدول فحص أسبوعي موثق' },
    { k: 'R2', t: 'شبك الشبابيك والفتحات سليم يمنع دخول الطيور البرية', fix: 'إصلاح الشبك وإغلاق الفتحات فوراً' },
    { k: 'R3', t: 'لا يوجد علف منسكب أو مياه راكدة حول العنابر', fix: 'تنظيف المحيط يومياً وردم أماكن تجمع المياه' }] },
  { sec: 'العنابر والمياه والنافق', items: [
    { k: 'H1', t: 'حوض تطهير الأقدام عند باب كل عنبر بمحلول متجدد', fix: 'تجديد المحلول مرتين يومياً على الأقل' },
    { k: 'H2', t: 'النافق يُجمع يومياً ويُتخلص منه بطريقة آمنة ومسجلة', fix: 'تسجيل النافق يومياً في النظام والتخلص في حفرة مغلقة أو محرقة' },
    { k: 'H3', t: 'مياه الشرب معالجة بالكلور ويُقاس الكلور الحر دورياً', fix: 'ضبط جرعة الكلور وقياس يومي عند نهاية الخط' },
    { k: 'H4', t: 'فترة الراحة بين الدورات لا تقل عن 10 أيام بعد التطهير', fix: 'الالتزام بجدول الراحة وتوثيق تاريخ التطهير والتسكين' }] }
];

/** محتوى أكاديمية الأمن الحيوي */
var BIO_ACADEMY = [
  { id: 'IND', title: 'التأهيل الإلزامي للأمن الحيوي', who: 'كل الموظفين والعمال والسائقين الجدد', minutes: 12, required: true,
    lessons: [
      { t: 'لماذا الأمن الحيوي؟', p: 'مرض واحد يدخل المزرعة يمكن أن يقضي على قطيع كامل ويغلق الموقع لأسابيع. أغلب الأمراض تدخل مع الناس والمركبات والمعدات والطيور البرية، وليس من الهواء.' },
      { t: 'الكارت هو تصريحك', p: 'كل دخول وخروج يُسجل بمسح الكارت على البوابة. النظام يعرف آخر موقع زرته، ويمنعك من دخول موقع أعلى حماية قبل انتهاء فترة العزل. لا تعطِ كارتك لأحد.' },
      { t: 'الاستحمام وتغيير الملابس', p: 'استحمام كامل بالصابون والشامبو، ثم ملابس وحذاء الموقع من الجانب النظيف. لا يُعبر خط الفصل في الاتجاه العكسي أبداً.' },
      { t: 'المستويات وفترات العزل', p: 'الجدود والأمهات أعلى حماية، ثم التفريخ، ثم التسمين، ثم العلف والمجازر والخارج. من الأقل حماية للأعلى تحتاج فترة عزل، والعكس مسموح.' },
      { t: 'الطيور البرية والقوارض', p: 'لا تترك أبواباً أو شبابيك مفتوحة، ولا علفاً منسكباً. أبلغ فوراً عن أي طيور برية داخل السياج أو أسراب حول الموقع.' },
      { t: 'عند الاشتباه', p: 'نفوق مفاجئ، أو هبوط في الأكل والمياه، أو أعراض تنفسية: أبلغ مدير الموقع فوراً، ولا تنتقل لموقع آخر.' }],
    quiz: [
      { q: 'زرت سوق دواجن أمس. ماذا تفعل اليوم قبل دخول مزرعة الأمهات؟', a: ['أدخل بعد الاستحمام فقط', 'أقر بالزيارة عند البوابة وأنتظر انتهاء فترة العزل', 'أدخل لأن الزيارة كانت قصيرة'], c: 1, why: 'الأسواق مستوى خطر أعلى، ولا يكفي الاستحمام وحده. النظام يحسب فترة العزل من آخر زيارة.' },
      { q: 'زميلك نسي كارته ويطلب كارتك للدخول. ما الصحيح؟', a: ['أعطيه الكارت', 'يدخل بالتحقق اليدوي من هويته عند الأمن', 'يدخل مع أول سيارة'], c: 1, why: 'الكارت شخصي. الأمن يسجل دخوله يدوياً بعد التحقق من البطاقة الشخصية.' },
      { q: 'أي اتجاه حركة يحتاج فترة عزل؟', a: ['من الأمهات إلى التسمين', 'من التسمين إلى الأمهات', 'لا يحتاج أي منهما'], c: 1, why: 'الحركة من الأقل حماية (التسمين) إلى الأعلى (الأمهات) تحتاج عزلاً.' },
      { q: 'بعد الاستحمام تذكرت هاتفك في الجانب المتسخ. ماذا تفعل؟', a: ['أعود وآخذه ثم أكمل', 'أطلب من الأمن تطهيره وتمريره، ولا أعبر الخط عكسياً', 'أتركه وأدخل ثم أعود لاحقاً من نفس الطريق'], c: 1, why: 'عبور خط الفصل عكسياً يلغي فائدة الاستحمام.' },
      { q: 'رأيت سرباً من البط البري يحط بجوار العنابر. ما الإجراء؟', a: ['لا شيء', 'أبلغ مدير الموقع وأسجل المشاهدة في التطبيق', 'أطرده فقط'], c: 1, why: 'البط البري أهم ناقل لإنفلونزا الطيور، والتسجيل يرفع مؤشر الخطر وينبه الإدارة.' },
      { q: 'لاحظت نفوقاً مفاجئاً أكثر من المعتاد في العنبر. ما أول خطوة؟', a: ['أنتظر اليوم التالي', 'أبلغ مدير الموقع فوراً ولا أنتقل لموقع آخر', 'أنقل النافق لموقع آخر للفحص'], c: 1, why: 'الإبلاغ المبكر أهم ساعات الاحتواء، والانتقال قد ينقل العدوى.' }] },
  { id: 'DRV', title: 'السائقون ونقل المركبات', who: 'سائقو العلف والكتاكيت والبيض والسبلة', minutes: 8,
    lessons: [
      { t: 'المركبة تنقل العدوى أكثر من أي شيء', p: 'الإطارات والشاسيه تحمل روث وتراب كل موقع زرته. التطهير الكامل في منطقة التطهير شرط لكل دخول، ويصدر لك شهادة صالحة لساعات محددة.' },
      { t: 'ترتيب الزيارات', p: 'ابدأ يومك بالموقع الأعلى حماية وانتهِ بالأقل. لا تعكس الترتيب في نفس اليوم.' },
      { t: 'سيارات السبلة والنافق', p: 'سيارة السبلة أو النافق لا تدخل أي منطقة نظيفة في نفس اليوم، والنظام يمنعها 24 ساعة بعد آخر حمولة.' },
      { t: 'داخل الموقع', p: 'ابقَ في الكابينة إلا عند الضرورة، وارتدِ الأفرول والحذاء البلاستيكي إن نزلت.' }],
    quiz: [
      { q: 'متى يصلح دخول سيارة العلف موقعاً جديداً؟', a: ['بعد غسيل الزجاج', 'بعد التطهير الكامل وصدور شهادة صالحة', 'في أي وقت'], c: 1, why: 'الشهادة توثق تطهير الإطارات والشاسيه والكابينة.' },
      { q: 'نقلت سبلة صباحاً. هل تدخل محطة تسمين بعد الظهر؟', a: ['نعم بعد الغسيل', 'لا، الدخول ممنوع 24 ساعة', 'نعم إن كانت المحطة قريبة'], c: 1, why: 'سيارات السبلة أعلى خطر، والنظام يمنعها 24 ساعة.' },
      { q: 'بأي موقع تبدأ يومك؟', a: ['الأقل حماية', 'الأعلى حماية', 'الأقرب'], c: 1, why: 'من الأعلى حماية للأقل لا يحتاج عزلاً.' },
      { q: 'هل تنزل من الكابينة داخل المزرعة؟', a: ['متى شئت', 'عند الضرورة فقط وبأفرول وحذاء بلاستيكي', 'أبداً حتى لو تعطلت السيارة'], c: 1, why: 'تقليل التلامس مع أرض الموقع يقلل نقل العدوى.' }] },
  { id: 'REF', title: 'التجديد ربع السنوي', who: 'كل العاملين كل 3 شهور', minutes: 5,
    lessons: [
      { t: 'موسم الطيور المهاجرة', p: 'من سبتمبر إلى مارس تمر ملايين الطيور فوق مصر، ويتجمع البط في البحيرات القريبة. أغلق الشبابيك والفتحات وغطِّ العلف والمياه.' },
      { t: 'التسجيل أهم من التذكر', p: 'كل نافق وكل مشاهدة طيور وكل عطل في التطهير يُسجل في التطبيق فوراً.' }],
    quiz: [
      { q: 'في أي فترة يزيد خطر الطيور المهاجرة في مصر؟', a: ['يونيو ويوليو', 'سبتمبر حتى مارس', 'طوال السنة بنفس الدرجة'], c: 1, why: 'الهجرة الخريفية ثم التشتية ثم الهجرة الربيعية.' },
      { q: 'وجدت حوض تطهير الإطارات فارغاً. ماذا تفعل؟', a: ['أمرر السيارة', 'أبلغ عبر «حالة حرجة» في التطبيق وأوقف الحركة حتى يُملأ', 'أنتظر نهاية الوردية'], c: 1, why: 'عطل التطهير يُبلّغ فوراً لأنه يفتح ثغرة لكل الحركات.' }] }
];

function BIO_plateNorm(s) {
  var t = String(s == null ? '' : s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); });
  t = t.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^0-9ء-ي]/g, '');
  return { digits: t.replace(/\D/g, ''), letters: t.replace(/\d/g, ''), all: t };
}
/** مسافة التحرير بين نصين (لقراءة الكاميرا غير الدقيقة) */
function BIO_editDist(a, b) {
  var m = a.length, n = b.length, d = [], i, j;
  for (i = 0; i <= m; i++) { d[i] = [i]; }
  for (j = 0; j <= n; j++) d[0][j] = j;
  for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
/** يطابق نص اللوحة المقروء مع لوحات المركبات المسجلة (الحروف قد تُقرأ معكوسة) */
function BIO_plateMatch(text, items) {
  var q = BIO_plateNorm(text);
  if (!q.digits && !q.letters) return [];
  return items.filter(function (i) { return i.plate; }).map(function (i) {
    var p = BIO_plateNorm(i.plate), lr = q.letters.split('').reverse().join('');
    var dd = BIO_editDist(q.digits, p.digits), dl = Math.min(BIO_editDist(q.letters, p.letters), BIO_editDist(lr, p.letters));
    var len = Math.max(1, p.digits.length + p.letters.length);
    return { item: i, dist: dd + dl, conf: Math.max(0, Math.round(100 * (1 - (dd + dl) / len))) };
  }).filter(function (x) { return x.conf >= 50; }).sort(function (a, b) { return a.dist - b.dist; }).slice(0, 4);
}

function BIO_ext(api, H) {
  var store = H.store, deps = H.deps, D = 24 * BIO.HOUR;
  var STAFF = ['موظف', 'عامل', 'سائق'];
  function st() { return H.settings(); }
  function num(v, d) { var n = Number(v); return isNaN(n) || v === '' || v == null ? d : n; }
  function day0(t) { return t - ((t + 3 * BIO.HOUR) % D); }
  function short(o) { if (o == null) return ''; var c = {}; Object.keys(o).forEach(function (k) { if (k === '_row') return; var v = o[k]; if (k === 'pin' || k === 'apikey') v = '••••'; if (v !== '' && v != null) c[k] = v instanceof Date ? v.getTime() : v; }); var s = JSON.stringify(c); return s.length > 480 ? s.slice(0, 477) + '…' : s; }
  function has(t) { try { store.all(t); return true; } catch (e) { return false; } }

  /* ---------- سجل التعديلات ---------- */
  api._log = function (u, table, key, action, before, after) {
    try {
      store.append('changes', { id: deps.id('L'), time: deps.now(), userId: u ? u.id : '', userName: u ? u.name : 'النظام', table: (TABLES[table] || {}).sheet || table, key: String(key == null ? '' : key), action: action, before: short(before), after: short(after) });
    } catch (e) {}
  };
  api.changes = function (pin, q) {
    H.auth(pin, 'admin'); q = q || {};
    var list = store.all('changes').map(function (c) { return { id: c.id, time: BIO_ms(c.time), userName: c.userName, table: c.table, key: String(c.key), action: c.action, before: String(c.before || ''), after: String(c.after || '') }; });
    if (q.table) list = list.filter(function (c) { return c.table === q.table; });
    if (q.text) { var t = String(q.text).trim(); list = list.filter(function (c) { return (c.userName + c.key + c.before + c.after + c.action).indexOf(t) >= 0; }); }
    list.sort(function (a, b) { return b.time - a.time; });
    var tables = {}; store.all('changes').forEach(function (c) { tables[c.table] = 1; });
    return { list: list.slice(0, Number(q.limit) || 200), total: list.length, tables: Object.keys(tables) };
  };
  /* ---------- النسخ الاحتياطي ---------- */
  function demoBackups() {
    var now = deps.now(), out = [];
    for (var i = 0; i < 9; i++) { var t = day0(now) - i * D + 2 * BIO.HOUR; if (t > now) continue; out.push({ id: 'DEMO-' + i, name: 'نسخة احتياطية ' + BIO_fmtTime(t).split(' · ')[0], time: t, size: 1.4e6 - i * 3e4, kind: 'تلقائي' }); }
    return out;
  }
  api.backups = function (pin) {
    H.auth(pin, 'admin');
    var keep = num(st().BACKUP_KEEP, 30);
    if (deps.backups) { var r = deps.backups.list(); return { list: r.list, keep: keep, folderUrl: r.folderUrl || '', live: true }; }
    return { list: (api._demoBk || []).concat(demoBackups()), keep: keep, folderUrl: '', live: false };
  };
  api.backupNow = function (pin) {
    var u = H.auth(pin, 'admin'), r;
    if (deps.backups) r = deps.backups.make('يدوي', num(st().BACKUP_KEEP, 30));
    else { r = { id: 'DEMO-M' + deps.now(), name: 'نسخة يدوية ' + BIO_fmtTime(deps.now()), time: deps.now(), size: 1.42e6, kind: 'يدوي' }; (api._demoBk = api._demoBk || []).unshift(r); }
    api._log(u, 'backup', r.name, 'نسخة احتياطية يدوية', null, { name: r.name });
    return r;
  };
  api.backupRestore = function (pin, id, confirm) {
    var u = H.auth(pin, 'admin');
    if (String(confirm || '').trim() !== 'استرجاع') throw new Error('اكتب كلمة «استرجاع» للتأكيد');
    var r = deps.backups ? deps.backups.restore(id) : { ok: true, name: id, demo: true };
    api._log(u, 'backup', r.name || id, 'استرجاع نسخة احتياطية', null, { from: r.name || id, safety: r.safety || '' });
    return r;
  };

  /* ---------- شركات النقل والمقاولون ---------- */
  function companyStats(from, to) {
    var items = {}, by = {}, cos = store.all('companies');
    store.all('items').forEach(function (i) { var c = BIO_norm(i.company); if (c) items[BIO_norm(i.id)] = { c: c, kind: i.kind }; });
    cos.forEach(function (c) { by[BIO_norm(c.id)] = { attempts: 0, ok: 0, denied: 0, overrides: 0, flags: 0, manual: 0, vehIn: 0, vehChecked: 0, people: 0, vehicles: 0, late: 0, litter: 0 }; });
    Object.keys(items).forEach(function (k) { var b = by[items[k].c]; if (b) { if (items[k].kind === 'مركبة') b.vehicles++; else b.people++; } });
    H.allMoves().forEach(function (m) {
      if (m.time < from || m.time >= to) return;
      var it = items[m.itemId], b = it && by[it.c]; if (!b) return;
      if (m.flag) b.flags++;
      if (m.dir !== BIO.IN || m.decision === BIO.CANCELLED || m.decision === BIO.PENDING) return;
      b.attempts++;
      if (m.decision === BIO.ALLOW) b.ok++; else if (m.decision === BIO.OVERRIDE) b.overrides++; else b.denied++;
      if (/يدوي/.test(m.via || '')) b.manual++;
      if (it.kind === 'مركبة' && BIO_counted(m)) { b.vehIn++; if (m.checks) b.vehChecked++; }
    });
    store.all('missions').forEach(function (m) { var it = items[BIO_norm(m.itemId)], t = BIO_ms(m.time); if (it && by[it.c] && t >= from && t < to && m.status === BIO.MS_LATE) by[it.c].late++; });
    if (has('disposal')) store.all('disposal').forEach(function (d) { var it = items[BIO_norm(d.vehicleId)], t = BIO_ms(d.time); if (it && by[it.c] && t >= from && t < to) by[it.c].litter++; });
    Object.keys(by).forEach(function (k) {
      var b = by[k];
      b.compliance = b.attempts ? Math.round(1000 * b.ok / b.attempts) / 10 : null;
      b.score = b.attempts ? Math.max(0, Math.min(100, Math.round((b.ok / b.attempts) * 100 - b.flags * 8 - b.overrides * 3 - b.manual * 2 - b.late * 3))) : null;
    });
    return by;
  }
  function gradeOf(s) { return s == null ? { k: 'n', label: 'لا حركة' } : s >= 90 ? { k: 'a', label: 'ممتاز' } : s >= 75 ? { k: 'b', label: 'جيد' } : s >= 60 ? { k: 'c', label: 'يحتاج متابعة' } : { k: 'd', label: 'ضعيف' }; }
  api.companies = function (pin, days) {
    var u = H.auth(pin, true), now = deps.now(); days = Number(days) || 30;
    var cur = companyStats(now - days * D, now + 1), prev = companyStats(now - 2 * days * D, now - days * D);
    var list = store.all('companies').map(function (c) {
      var id = BIO_norm(c.id), s = cur[id], p = prev[id];
      return { id: id, name: c.name, type: c.type || '', contact: c.contact || '', phone: String(c.phone || ''), email: c.email || '', status: String(c.status || 'نشط').trim(), reason: c.reason || '', note: c.note || '', stats: s, score: s.score, grade: gradeOf(s.score), trend: s.score != null && p && p.score != null ? s.score - p.score : null };
    }).sort(function (a, b) { return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score); });
    list.forEach(function (c, i) { c.rank = c.score == null ? null : i + 1; });
    var items = store.all('items').filter(function (i) { return i.company; }).map(H.itemInfo);
    return { now: now, days: days, list: list, members: items.map(function (i) { return { id: i.id, name: i.name, kind: i.kind, company: i.company, plate: i.plate }; }), canEdit: u.perms.indexOf('data') >= 0, purchasing: st().PURCHASING_EMAIL || '' };
  };
  api.setCompanyStatus = function (pin, id, status, reason) {
    var u = H.auth(pin, 'data'), c = store.find('companies', id);
    if (!c) throw new Error('الشركة غير موجودة');
    status = status === 'موقوف' ? 'موقوف' : 'نشط';
    if (status === 'موقوف' && !String(reason || '').trim()) throw new Error('اكتب سبب الإيقاف');
    var before = Object.assign({}, c), now = deps.now();
    deps.lock(function () { store.update('companies', c.id, { status: status, reason: status === 'موقوف' ? String(reason).trim() : '' }); });
    api._log(u, 'companies', c.id, status === 'موقوف' ? 'إيقاف شركة' : 'إعادة تفعيل شركة', before, { status: status, reason: reason || '' });
    var title = status === 'موقوف' ? '⛔ إيقاف شركة «' + c.name + '» من كل البوابات' : '✅ إعادة تفعيل شركة «' + c.name + '»';
    var body = status === 'موقوف' ? 'كل أفراد ومركبات الشركة ممنوعون من دخول مواقع الشركة حتى إشعار آخر.\nالسبب: ' + reason : 'يُسمح لأفراد ومركبات الشركة بالدخول وفق قواعد العزل المعتادة.';
    store.append('notices', { id: deps.id('N'), time: now, from: u.name, target: 'ALL', level: status === 'موقوف' ? 'عاجل' : 'عادي', title: title, body: body });
    deps.notify({ kind: 'company', title: title, body: body + H.appUrl('#companies') });
    return { ok: true, status: status };
  };
  /** تقرير شهري للمشتريات (يُرسل تلقائياً أول كل شهر) */
  api._companyReport = function () {
    var now = deps.now(), cur = companyStats(now - 30 * D, now + 1), lines = [];
    store.all('companies').map(function (c) { return { c: c, s: cur[BIO_norm(c.id)] }; }).sort(function (a, b) { return (b.s.score == null ? -1 : b.s.score) - (a.s.score == null ? -1 : a.s.score); }).forEach(function (x, i) {
      lines.push((i + 1) + '. ' + x.c.name + ' (' + (x.c.type || '') + '): ' + (x.s.score == null ? 'لا حركة' : x.s.score + '/100 · ' + gradeOf(x.s.score).label) + ' · دخول ' + x.s.attempts + ' · رفض ' + x.s.denied + ' · مخالفات ' + x.s.flags + (String(x.c.status).trim() === 'موقوف' ? ' · موقوفة' : ''));
    });
    var to = st().PURCHASING_EMAIL;
    deps.notify({ kind: 'company-report', emailTo: to ? [to] : [], title: '📊 التقييم الشهري لشركات النقل والمقاولين', body: 'ترتيب الشركات حسب الالتزام بالأمن الحيوي خلال آخر 30 يوماً:\n\n' + lines.join('\n') + '\n\nالدرجة = نسبة الدخول المطابق للقواعد مع خصم للمخالفات والدخول الاستثنائي واليدوي والمأموريات المتأخرة.' + H.appUrl('#companies') });
    return { sent: !!to, lines: lines.length };
  };

  api.companyReportNow = function (pin) {
    var u = H.auth(pin, 'data'), r = api._companyReport();
    api._log(u, 'companies', 'report', 'إرسال التقييم الشهري للمشتريات', null, { to: st().PURCHASING_EMAIL || '' });
    return { sent: r.sent, to: st().PURCHASING_EMAIL || '' };
  };

  /* ---------- النافق والسبلة ---------- */
  var DISPOSAL_METHODS = ['محرقة الموقع', 'حفرة تحلل مغلقة', 'دفن صحي بالجير', 'تسليم لمصنع معالجة مرخص', 'سيارة سبلة خارجية مرخصة'];
  api.disposalAdd = function (pin, r) {
    var u = H.auth(pin), sites = H.sitesById(), now = deps.now(); r = r || {};
    var site = sites[BIO_norm(r.siteId)];
    if (!site || site.external) throw new Error('اختر الموقع');
    if (u.isManager && !H.inScope(u, site.id, sites)) throw new Error('هذا الموقع خارج نطاق إدارتك');
    if (!u.isManager) { var g = H.gateFor(u, sites); if (!g.sites.some(function (x) { return x.id === site.id; })) throw new Error('هذا الموقع لا يتبع بوابتك'); }
    var kind = r.kind === 'سبلة' ? 'سبلة' : 'نافق', count = num(r.count, 0), weight = num(r.weight, 0);
    if (kind === 'نافق' && count <= 0) throw new Error('اكتب عدد النافق');
    if (kind === 'سبلة' && weight <= 0 && !r.vehicleId) throw new Error('اكتب وزن السبلة أو المركبة الناقلة');
    var method = DISPOSAL_METHODS.indexOf(r.method) >= 0 ? r.method : DISPOSAL_METHODS[0];
    var veh = r.vehicleId ? H.itemInfo(store.find('items', BIO_norm(r.vehicleId))) : null;
    if (r.vehicleId && !veh) throw new Error('كود المركبة غير مسجل');
    var row = { id: r.id || deps.id('DP'), time: now, siteId: site.id, siteName: site.name, kind: kind, count: count, weight: weight, method: method, vehicleId: veh ? veh.id : '', vehicleName: veh ? veh.name : '', driverId: r.driverId ? BIO_norm(r.driverId) : '', by: u.name, note: String(r.note || '').slice(0, 300) };
    if (store.find('disposal', row.id)) return { ok: true, duplicate: true };
    deps.lock(function () { store.append('disposal', row); });
    var spike = null;
    if (kind === 'نافق') {
      var d0 = day0(now), today = 0, prev = 0;
      store.all('disposal').forEach(function (x) { if (BIO_norm(x.siteId) !== site.id || x.kind !== 'نافق') return; var t = BIO_ms(x.time); if (t >= d0) today += num(x.count, 0); else if (t >= d0 - 7 * D) prev += num(x.count, 0); });
      var avg = prev / 7;
      if (today >= Math.max(30, avg * 2)) {
        spike = { today: today, avg: Math.round(avg) };
        deps.notify({ kind: 'mortality', siteId: site.id, title: '⚠️ نفوق مرتفع في «' + site.name + '»', body: 'نافق اليوم حتى الآن: ' + today + ' طائر، ومتوسط آخر 7 أيام ' + Math.round(avg) + ' يومياً (' + (avg ? Math.round(today / avg * 10) / 10 + ' ضعف' : 'لا توجد بيانات سابقة') + ').\nالمطلوب: إبلاغ الطبيب البيطري، سحب عينات، ومنع خروج أي فرد أو معدة من الموقع لمواقع أخرى حتى التشخيص. فكّر في رفع حالة الموقع إلى «إنذار».' + H.appUrl('#disposal') });
      }
    }
    if (veh) deps.notify({ kind: 'litter', siteId: site.id, title: '🚛 ' + (kind === 'سبلة' ? 'سيارة سبلة' : 'نقل نافق') + ' خرجت من «' + site.name + '»', body: veh.name + ' (' + veh.id + ')\nممنوعة من دخول أي منطقة نظيفة لمدة ' + num(st().LITTER_BLOCK_HOURS, 24) + ' ساعة. البوابات ترفضها تلقائياً.' });
    return { ok: true, id: row.id, spike: spike };
  };
  api.disposals = function (pin, days) {
    var u = H.auth(pin), sites = H.sitesById(), now = deps.now(); days = Number(days) || 14;
    var mine = u.isManager ? function (id) { return H.inScope(u, id, sites); } : (function () { var ids = H.gateFor(u, sites).sites.map(function (s) { return s.id; }); return function (id) { return ids.indexOf(id) >= 0; }; })();
    var rows = store.all('disposal').map(function (x) { return { id: x.id, time: BIO_ms(x.time), siteId: BIO_norm(x.siteId), siteName: x.siteName, kind: x.kind, count: num(x.count, 0), weight: num(x.weight, 0), method: x.method, vehicleId: BIO_norm(x.vehicleId), vehicleName: x.vehicleName || '', by: x.by, note: x.note || '' }; })
      .filter(function (x) { return mine(x.siteId) && x.time >= now - days * D; }).sort(function (a, b) { return b.time - a.time; });
    var d0 = day0(now), series = {};
    rows.forEach(function (x) { if (x.kind !== 'نافق') return; var i = Math.floor((d0 + D - 1 - x.time) / D); if (i < 0 || i >= days) return; var s = series[x.siteId] = series[x.siteId] || { id: x.siteId, name: x.siteName, days: [] }; for (var k = 0; k < days; k++) s.days[k] = s.days[k] || 0; s.days[i] += x.count; });
    var bySite = Object.keys(series).map(function (k) { var s = series[k]; s.days = s.days.slice().reverse(); var last = s.days[days - 1], prev = s.days.slice(days - 8, days - 1), avg = prev.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, prev.length); s.today = last; s.avg = Math.round(avg * 10) / 10; s.spike = last >= Math.max(30, avg * 2); s.total = s.days.reduce(function (a, b) { return a + b; }, 0); return s; }).sort(function (a, b) { return (b.spike ? 1 : 0) - (a.spike ? 1 : 0) || b.today - a.today; });
    var methods = {}; rows.forEach(function (x) { methods[x.method] = (methods[x.method] || 0) + (x.kind === 'نافق' ? x.count : 0); });
    var blockH = num(st().LITTER_BLOCK_HOURS, 24);
    var blocked = rows.filter(function (x) { return x.vehicleId && x.time > now - blockH * BIO.HOUR; }).map(function (x) { return { vehicleId: x.vehicleId, vehicleName: x.vehicleName, siteName: x.siteName, kind: x.kind, until: x.time + blockH * BIO.HOUR }; });
    return { now: now, days: days, rows: rows.slice(0, 120), bySite: bySite, methods: DISPOSAL_METHODS, methodTotals: methods, blocked: blocked, blockHours: blockH,
      totals: { dead: rows.filter(function (x) { return x.kind === 'نافق'; }).reduce(function (a, x) { return a + x.count; }, 0), litterTons: Math.round(rows.filter(function (x) { return x.kind === 'سبلة'; }).reduce(function (a, x) { return a + x.weight; }, 0) / 100) / 10, trips: rows.filter(function (x) { return x.vehicleId; }).length, today: rows.filter(function (x) { return x.kind === 'نافق' && x.time >= d0; }).reduce(function (a, x) { return a + x.count; }, 0) } };
  };

  /* ---------- قيود البوابة الإضافية (شركة موقوفة، سيارة سبلة، التأهيل الإلزامي) ---------- */
  api._gateChecks = function (item, site, t, s, res) {
    if (site.external) return;
    var deny = function (r) { res.decision = BIO.DENY; res.reasons.unshift(r); };
    if (item.company) {
      var c = store.find('companies', item.company);
      if (c && String(c.status).trim() === 'موقوف') deny('شركة «' + c.name + '» موقوفة من دخول مواقع الشركة بقرار الأمن الحيوي' + (c.reason ? ': ' + c.reason : ''));
    }
    if (item.kind === 'مركبة' || item.kind === 'سائق') {
      var bh = num(s.LITTER_BLOCK_HOURS, 24), last = null;
      store.all('disposal').forEach(function (d) { var tt = BIO_ms(d.time); if ((BIO_norm(d.vehicleId) === item.id || BIO_norm(d.driverId) === item.id) && tt <= t && tt > t - bh * BIO.HOUR && (!last || tt > last.t)) last = { t: tt, site: d.siteName, kind: d.kind }; });
      if (last) deny((item.kind === 'مركبة' ? 'مركبة' : 'سائق') + ' نقل ' + last.kind + ' من «' + last.site + '» منذ ' + Math.max(1, Math.round((t - last.t) / BIO.HOUR)) + ' ساعة. ممنوع دخول أي منطقة نظيفة قبل مرور ' + bh + ' ساعة وغسيل وتطهير كامل');
    }
    if (STAFF.indexOf(item.kind) >= 0 && BIO_isYes(s.ACADEMY_REQUIRED) && item.added) {
      var ok = store.all('training').some(function (r) { return BIO_norm(r.itemId) === item.id && r.module === 'IND' && BIO_isYes(r.passed); });
      if (!ok) deny('لم يجتز التأهيل الإلزامي للأمن الحيوي بعد. يفتح رابط الموظفين ويختار «التدريب» من موبايله (12 دقيقة)، ثم يُفعّل كارته تلقائياً');
    }
  };

  /* ---------- التدقيق الداخلي والإجراءات التصحيحية ---------- */
  function actOut(a, now) {
    var due = BIO_ms(a.due), status = String(a.status || 'مفتوح');
    return { id: a.id, time: BIO_ms(a.time), auditId: a.auditId, siteId: BIO_norm(a.siteId), siteName: a.siteName, finding: a.finding, action: a.action, owner: a.owner || '', due: due, status: status, late: status !== 'مغلق' && due < now, closedAt: BIO_ms(a.closedAt), closeNote: a.closeNote || '' };
  }
  api.inspections = function (pin) {
    var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(), every = num(st().AUDIT_EVERY_DAYS, 30);
    var ins = store.all('inspections').map(function (x) { return { id: x.id, time: BIO_ms(x.time), siteId: BIO_norm(x.siteId), siteName: x.siteName, auditor: x.auditor, score: num(x.score, 0), nc: num(x.nc, 0), note: x.note || '', answers: (function () { try { return JSON.parse(x.answers || '{}'); } catch (e) { return {}; } })() }; })
      .filter(function (x) { return H.inScope(u, x.siteId, sites); }).sort(function (a, b) { return b.time - a.time; });
    var acts = store.all('actions').map(function (a) { return actOut(a, now); }).filter(function (a) { return H.inScope(u, a.siteId, sites); });
    var list = H.sitesList(sites).filter(function (s) { return !s.external && H.inScope(u, s.id, sites); }).map(function (s) {
      var last = ins.filter(function (x) { return x.siteId === s.id; })[0], next = last ? last.time + every * D : now;
      return { id: s.id, name: s.name, sector: s.sector, level: s.level, last: last ? { time: last.time, score: last.score, nc: last.nc, id: last.id } : null, next: next, overdue: next <= now, open: acts.filter(function (a) { return a.siteId === s.id && a.status !== 'مغلق'; }).length, late: acts.filter(function (a) { return a.siteId === s.id && a.late; }).length };
    });
    var open = acts.filter(function (a) { return a.status !== 'مغلق'; }).sort(function (a, b) { return a.due - b.due; });
    var closed = acts.filter(function (a) { return a.status === 'مغلق'; }).sort(function (a, b) { return b.closedAt - a.closedAt; });
    var d90 = ins.filter(function (x) { return x.time >= now - 90 * D; });
    return { now: now, every: every, capaDays: num(st().CAPA_DAYS, 7), checklist: BIO_CHECKLIST, sites: list, recent: ins.slice(0, 20), open: open, closed: closed.slice(0, 20),
      kpi: { avg: d90.length ? Math.round(d90.reduce(function (a, x) { return a + x.score; }, 0) / d90.length) : null, audits90: d90.length, open: open.length, late: open.filter(function (a) { return a.late; }).length, closed30: closed.filter(function (a) { return a.closedAt >= now - 30 * D; }).length, due: list.filter(function (s) { return s.overdue; }).length,
        onTime: (function () { var c = closed.filter(function (a) { return a.closedAt >= now - 90 * D; }); return c.length ? Math.round(100 * c.filter(function (a) { return a.closedAt <= a.due; }).length / c.length) : null; })() } };
  };
  api.inspectionSave = function (pin, p) {
    var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(); p = p || {};
    var site = sites[BIO_norm(p.siteId)];
    if (!site || site.external) throw new Error('اختر الموقع');
    if (!H.inScope(u, site.id, sites)) throw new Error('هذا الموقع خارج نطاق إدارتك');
    var ans = p.answers || {}, yes = 0, no = 0, nc = [];
    BIO_CHECKLIST.forEach(function (sec) { sec.items.forEach(function (it) { var a = ans[it.k] || {}; if (a.v === 'y') yes++; else if (a.v === 'n') { no++; nc.push({ it: it, sec: sec.sec, note: String(a.note || '').slice(0, 200) }); } }); });
    if (yes + no < 5) throw new Error('أجب على 5 بنود على الأقل');
    var score = Math.round(100 * yes / (yes + no)), id = p.id || deps.id('AU');
    if (store.find('inspections', id)) return { id: id, duplicate: true };
    var due = now + num(p.days, num(st().CAPA_DAYS, 7)) * D, owner = String(p.owner || '').trim() || 'مدير ' + site.name;
    deps.lock(function () {
      store.append('inspections', { id: id, time: now, siteId: site.id, siteName: site.name, auditor: u.name, score: score, nc: no, answers: JSON.stringify(ans), note: String(p.note || '').slice(0, 400) });
      nc.forEach(function (x, i) { store.append('actions', { id: id + '-' + (i + 1), time: now, auditId: id, siteId: site.id, siteName: site.name, finding: x.sec + ': ' + x.it.t + (x.note ? ' · ' + x.note : ''), action: x.it.fix, owner: owner, due: due, status: 'مفتوح', closedAt: '', closeNote: '', remindedAt: '' }); });
    });
    api._log(u, 'inspections', id, 'زيارة تدقيق', null, { site: site.name, score: score, nc: no });
    if (no) deps.notify({ kind: 'capa', siteId: site.id, title: '📋 تدقيق «' + site.name + '»: ' + score + '% · ' + no + ' ملاحظة', body: 'أُنشئ ' + no + ' إجراء تصحيحي، المسؤول: ' + owner + '، الموعد: ' + BIO_fmtTime(due) + '\n' + nc.slice(0, 5).map(function (x) { return '• ' + x.it.t; }).join('\n') + H.appUrl('#inspect') });
    return { id: id, score: score, nc: no, due: due };
  };
  api.actionUpdate = function (pin, id, patch) {
    var u = H.auth(pin, true), a = store.find('actions', id), now = deps.now(); patch = patch || {};
    if (!a) throw new Error('الإجراء غير موجود');
    if (!H.inScope(u, a.siteId)) throw new Error('هذا الموقع خارج نطاق إدارتك');
    var up = {}, before = Object.assign({}, a);
    if (patch.status === 'مغلق') { if (!String(patch.closeNote || '').trim()) throw new Error('اكتب ما تم تنفيذه لإغلاق الإجراء'); up = { status: 'مغلق', closedAt: now, closeNote: String(patch.closeNote).slice(0, 300) }; }
    else if (patch.status === 'جارٍ التنفيذ' || patch.status === 'مفتوح') up.status = patch.status;
    if (patch.owner) up.owner = String(patch.owner).slice(0, 80);
    if (patch.due) up.due = BIO_ms(patch.due);
    deps.lock(function () { store.update('actions', a.id, up); });
    api._log(u, 'actions', a.id, up.status === 'مغلق' ? 'إغلاق إجراء تصحيحي' : 'تحديث إجراء تصحيحي', before, up);
    return actOut(store.find('actions', a.id), now);
  };
  /** تذكير قبل الموعد بيوم وتصعيد للمتأخر (يعمل يومياً) */
  api._capaTick = function () {
    var now = deps.now(), d0 = day0(now), sent = 0;
    store.all('actions').forEach(function (a) {
      var x = actOut(a, now); if (x.status === 'مغلق' || BIO_ms(a.remindedAt) >= d0) return;
      if (x.late) { deps.notify({ kind: 'capa', level: 1, siteId: x.siteId, title: '⏰ إجراء تصحيحي متأخر: ' + x.siteName, body: x.finding + '\nالمطلوب: ' + x.action + '\nالمسؤول: ' + x.owner + ' · كان موعده ' + BIO_fmtTime(x.due) + H.appUrl('#inspect') }); }
      else if (x.due - now < D) { deps.notify({ kind: 'capa', siteId: x.siteId, title: '🔔 إجراء تصحيحي موعده غداً: ' + x.siteName, body: x.finding + '\nالمطلوب: ' + x.action + '\nالمسؤول: ' + x.owner + H.appUrl('#inspect') }); }
      else return;
      store.update('actions', a.id, { remindedAt: now }); sent++;
    });
    return sent;
  };

  /* ---------- أكاديمية الأمن الحيوي ---------- */
  function trainingRows() { return store.all('training').map(function (r) { return { id: r.id, time: BIO_ms(r.time), itemId: BIO_norm(r.itemId), itemName: r.itemName, module: r.module, score: num(r.score, 0), passed: BIO_isYes(r.passed), via: r.via || '', cert: r.cert || '' }; }); }
  function modTitle(id) { var m = BIO_ACADEMY.filter(function (x) { return x.id === id; })[0]; return m ? m.title : id; }
  api._trainingOf = function (itemId) {
    var best = {};
    trainingRows().forEach(function (r) { if (r.itemId === itemId && r.passed && (!best[r.module] || r.time > best[r.module].time)) best[r.module] = r; });
    return Object.keys(best).map(function (k) { var r = best[k]; return { module: k, title: modTitle(k), time: r.time, score: r.score, cert: r.cert }; });
  };
  function weekly(now) {
    var all = []; BIO_ACADEMY.forEach(function (m) { m.quiz.forEach(function (q) { all.push({ q: q.q, a: q.a, c: q.c, why: q.why, module: m.title }); }); });
    var wk = Math.floor((now + 3 * BIO.HOUR + 4 * D) / (7 * D));
    return Object.assign({ week: wk }, all[wk % all.length]);
  }
  api.academy = function (pin) {
    var u = H.auth(pin, true), now = deps.now(), s = st();
    var staff = store.all('items').map(H.itemInfo).filter(function (i) { return i && i.active && STAFF.indexOf(i.kind) >= 0; });
    var tr = trainingRows(), passed = {};
    tr.forEach(function (r) { if (r.passed) (passed[r.itemId] = passed[r.itemId] || {})[r.module] = r; });
    var depts = {};
    staff.forEach(function (i) { var d = i.dept || 'بدون إدارة', o = depts[d] = depts[d] || { name: d, total: 0, done: 0 }; o.total++; if (passed[i.id] && passed[i.id].IND) o.done++; });
    var blocked = staff.filter(function (i) { return i.added && !(passed[i.id] && passed[i.id].IND); }).map(function (i) { return { id: i.id, name: i.name, kind: i.kind, dept: i.dept, added: i.added }; });
    var due = staff.filter(function (i) { var r = passed[i.id] && passed[i.id].REF, ind = passed[i.id] && passed[i.id].IND; return ind && (!r || r.time < now - 90 * D) && ind.time < now - 90 * D; }).length;
    var done = staff.filter(function (i) { return passed[i.id] && passed[i.id].IND; }).length;
    return { now: now, required: BIO_isYes(s.ACADEMY_REQUIRED), passMark: num(s.ACADEMY_PASS, 80), video: s.ACADEMY_VIDEO_URL || '', modules: BIO_ACADEMY,
      stats: { staff: staff.length, done: done, pct: staff.length ? Math.round(100 * done / staff.length) : 0, blocked: blocked.length, refreshDue: due, attempts30: tr.filter(function (r) { return r.time >= now - 30 * D; }).length, avg30: (function () { var x = tr.filter(function (r) { return r.time >= now - 30 * D; }); return x.length ? Math.round(x.reduce(function (a, r) { return a + r.score; }, 0) / x.length) : null; })() },
      depts: Object.keys(depts).map(function (k) { return depts[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 12), blocked: blocked.slice(0, 40),
      recent: tr.sort(function (a, b) { return b.time - a.time; }).slice(0, 15).map(function (r) { return Object.assign(r, { title: modTitle(r.module) }); }), weekly: weekly(now), selfUrl: s.APP_URL ? String(s.APP_URL) + '?p=mission#train' : '', canRecord: u.perms.indexOf('data') >= 0 };
  };
  function certId(itemId, mod, t) { return 'BA-' + mod + '-' + BIO_hash(itemId + mod + t).slice(0, 6).toUpperCase(); }
  api.academyRecord = function (pin, itemId, moduleId, score) {
    var u = H.auth(pin, 'data'), it = H.itemInfo(store.find('items', BIO_norm(itemId))), now = deps.now();
    if (!it) throw new Error('الكود غير مسجل');
    if (!BIO_ACADEMY.some(function (m) { return m.id === moduleId; })) throw new Error('اختر البرنامج');
    score = Math.max(0, Math.min(100, num(score, 100)));
    var passed = score >= num(st().ACADEMY_PASS, 80), row = { id: deps.id('TR'), time: now, itemId: it.id, itemName: it.name, module: moduleId, score: score, passed: passed ? BIO.YES : BIO.NO, via: 'تدريب حضوري سجّله ' + u.name, cert: passed ? certId(it.id, moduleId, now) : '' };
    deps.lock(function () { store.append('training', row); });
    api._log(u, 'training', it.id, 'تسجيل تدريب حضوري', null, { module: moduleId, score: score });
    return { ok: true, passed: passed, cert: row.cert };
  };
  function quizOut(m) { return { id: m.id, title: m.title, who: m.who, minutes: m.minutes, required: !!m.required, lessons: m.lessons, quiz: m.quiz.map(function (q) { return { q: q.q, a: q.a }; }) }; }
  api.selfAcademy = function (code, phone) {
    var it = H.selfStaff(code, phone, false), mine = api._trainingOf(it.id), s = st();
    return { me: { id: it.id, name: it.name, kind: it.kind, dept: it.dept }, passMark: num(s.ACADEMY_PASS, 80), video: s.ACADEMY_VIDEO_URL || '', modules: BIO_ACADEMY.filter(function (m) { return m.id !== 'DRV' || it.kind === 'سائق'; }).map(quizOut), done: mine, blocked: BIO_isYes(s.ACADEMY_REQUIRED) && !!it.added && !mine.some(function (r) { return r.module === 'IND'; }) };
  };
  api.selfQuiz = function (code, phone, moduleId, answers) {
    var it = H.selfStaff(code, phone, true), now = deps.now(), m = BIO_ACADEMY.filter(function (x) { return x.id === moduleId; })[0];
    if (!m) throw new Error('البرنامج غير موجود');
    var tries = store.all('training').filter(function (r) { return BIO_norm(r.itemId) === it.id && BIO_ms(r.time) > now - D; }).length;
    if (tries >= 10) throw new Error('وصلت للحد الأقصى من المحاولات اليوم. حاول غداً');
    answers = answers || [];
    var right = 0, review = m.quiz.map(function (q, i) { var ok = Number(answers[i]) === q.c; if (ok) right++; return { q: q.q, ok: ok, chosen: answers[i] == null ? null : Number(answers[i]), correct: q.c, answer: q.a[q.c], why: q.why }; });
    var score = Math.round(100 * right / m.quiz.length), passed = score >= num(st().ACADEMY_PASS, 80), cert = passed ? certId(it.id, m.id, now) : '';
    deps.lock(function () { store.append('training', { id: deps.id('TR'), time: now, itemId: it.id, itemName: it.name, module: m.id, score: score, passed: passed ? BIO.YES : BIO.NO, via: 'اختبار ذاتي من الموبايل', cert: cert }); });
    if (passed && m.required) deps.notify({ kind: 'academy', title: '🎓 اجتاز التأهيل الإلزامي: ' + it.name, body: it.name + ' (' + it.id + ') · ' + score + '%\nأصبح كارته مفعلاً على البوابات.' });
    return { score: score, passed: passed, cert: cert, title: m.title, name: it.name, id: it.id, time: now, review: review, passMark: num(st().ACADEMY_PASS, 80) };
  };

  /* ---------- رادار الطيور المهاجرة ---------- */
  function sightingsSince(t) {
    return store.all('birdobs').map(function (o) { return { id: o.id, time: BIO_ms(o.time), lat: o.lat === '' ? null : Number(o.lat), lng: o.lng === '' ? null : Number(o.lng), siteId: BIO_norm(o.siteId), species: o.species, count: num(o.count, 1), source: o.source || '', note: o.note || '', by: o.by || '' }; })
      .filter(function (o) { return o.time >= t; }).sort(function (a, b) { return b.time - a.time; });
  }
  function birdRun(now) {
    var sites = H.sitesList(H.sitesById()).filter(function (s) { return !s.external; }), w = deps.birdWx ? deps.birdWx() : null, s = st();
    var obs = sightingsSince(now - 7 * D);
    return { model: BIO_birdModel(sites, w && w.sites, obs, now, { radius: num(s.BIRD_RADIUS_KM, 50) }), wx: w, obs: obs, sites: sites };
  }
  api.birds = function (pin) {
    var u = H.auth(pin, true), now = deps.now(), s = st(), run = birdRun(now), all = H.sitesById();
    var model = run.model.filter(function (x) { return H.inScope(u, x.id, all); });
    var missing = run.sites.filter(function (x) { return x.lat == null || isNaN(x.lat); }).map(function (x) { return { id: x.id, name: x.name }; });
    var alerts = store.all('birdalerts').map(function (a) { return { id: a.id, time: BIO_ms(a.time), siteId: BIO_norm(a.siteId), siteName: a.siteName, score: num(a.score, 0), level: a.level, note: a.note || '' }; }).sort(function (a, b) { return b.time - a.time; }).slice(0, 12);
    var season = BIO_season(now);
    return { now: now, season: season, alertLevel: num(s.BIRD_ALERT_LEVEL, 60), radius: num(s.BIRD_RADIUS_KM, 50), canEdit: u.perms.indexOf('admin') >= 0 || u.perms.indexOf('sites') >= 0,
      wx: run.wx ? { live: true, source: run.wx.source || 'Open-Meteo', fetchedAt: run.wx.fetchedAt, note: run.wx.note || '' } : { live: false, source: 'نموذج مناخي للرياح السائدة', note: 'لم تُجلب بيانات الرياح الحية بعد' },
      ebird: !!s.EBIRD_KEY,
      flyways: BIO_FLYWAYS.map(function (f) { return { id: f.id, name: f.name, species: f.species, color: f.color, path: f.path, months: f.months, intensity: Math.round(BIO_monthly(f.months, now) * 100), bearing: f.bearing }; }),
      wetlands: BIO_WETLANDS.map(function (w) { return Object.assign({}, w, { intensity: Math.round(BIO_monthly(BIO_WETLAND_MONTHS, now) * w.w * 100) }); }), wetlandMonths: BIO_WETLAND_MONTHS,
      sites: model, missing: missing, sightings: run.obs.slice(0, 30), alerts: alerts };
  };
  /** تحديث فوري للرياح الحية ومشاهدات eBird (زر «تحديث الآن») */
  api.birdsRefresh = function (pin) {
    H.auth(pin, true);
    if (deps.birdRefresh) deps.birdRefresh();
    return api.birds(pin);
  };
  /** v15.2: زر «تفعيل الآن» في شاشة رادار الطيور: يضبط التحديث التلقائي كل 3 ساعات ويجلب الرياح الحية فوراً */
  api.birdsActivate = function (pin) {
    var u = H.auth(pin, true);
    if (!u.isManager) throw new Error('التفعيل لمدير الأمن الحيوي');
    var res = { triggers: null, wind: null, windError: '' };
    try { res.triggers = deps.ensureTriggers ? deps.ensureTriggers() : null; } catch (e) { res.triggersError = String(e && e.message || e); }
    try { res.wind = deps.windNow ? deps.windNow() : (deps.birdRefresh ? (deps.birdRefresh(), true) : null); } catch (e) { res.windError = String(e && e.message || e); }
    var b = api.birds(pin); b.activation = res; return b;
  };
  api.birdSighting = function (pin, o) {
    var u = H.auth(pin), sites = H.sitesById(), now = deps.now(); o = o || {};
    var site = sites[BIO_norm(o.siteId)];
    if (!site) throw new Error('اختر أقرب موقع');
    var count = Math.max(1, Math.round(num(o.count, 1))), species = String(o.species || '').trim() || 'طيور غير محددة';
    var row = { id: o.id || deps.id('BO'), time: now, lat: o.lat != null && o.lat !== '' ? Number(o.lat) : site.lat, lng: o.lng != null && o.lng !== '' ? Number(o.lng) : site.lng, siteId: site.id, species: species, count: count, source: 'مشاهدة ميدانية', note: String(o.note || '').slice(0, 300), by: u.name };
    if (store.find('birdobs', row.id)) return { ok: true, duplicate: true };
    deps.lock(function () { store.append('birdobs', row); });
    deps.notify({ kind: 'birds', siteId: site.id, title: '🪶 مشاهدة طيور قرب «' + site.name + '»', body: species + ' · العدد التقريبي ' + count + '\n' + (row.note ? row.note + '\n' : '') + 'سجّلها: ' + u.name + '\nالإجراء: إغلاق الشبابيك والفتحات، تغطية العلف والمياه، منع الطيور من الاقتراب من العنابر.' + H.appUrl('#birds') });
    return { ok: true, id: row.id };
  };
  api.siteGeo = function (pin, siteId, lat, lng) {
    var u = H.auth(pin, 'sites'), s = store.find('sites', siteId);
    if (!s) throw new Error('الموقع غير موجود');
    lat = Number(lat); lng = Number(lng);
    if (isNaN(lat) || isNaN(lng) || lat < 21 || lat > 32.5 || lng < 24 || lng > 37) throw new Error('الإحداثيات خارج حدود مصر. انسخها من خرائط جوجل بالصيغة: 29.9051, 30.8012');
    var before = { lat: s.lat, lng: s.lng, geo: s.geo };
    deps.lock(function () { store.update('sites', s.id, { lat: lat, lng: lng, geo: 'مؤكدة' }); });
    api._log(u, 'sites', s.id, 'تعديل الإحداثيات', before, { lat: lat, lng: lng });
    return { ok: true };
  };
  /** يعمل كل 3 ساعات على الخادم: ينبه المديرين عند اقتراب أسراب من موقع (مرة كل 12 ساعة لكل موقع إلا إذا ارتفع المستوى) */
  api._birdsTick = function () {
    var now = deps.now(), s = st(), lim = num(s.BIRD_ALERT_LEVEL, 60), run = birdRun(now), sent = [];
    var prev = {}; store.all('birdalerts').forEach(function (a) { var t = BIO_ms(a.time), k = BIO_norm(a.siteId); if (t > now - 12 * BIO.HOUR && (!prev[k] || num(a.score, 0) > prev[k])) prev[k] = num(a.score, 0); });
    var bySec = {};
    run.model.forEach(function (x) {
      if (x.score < lim || (prev[x.id] != null && x.score < prev[x.id] + 10)) return;
      var f = x.flocks[0], note = f ? 'مصدر متوقع: ' + f.from + ' على بعد ' + f.d + ' كم، اتجاه الحركة ' + BIO_compass(f.track) + '، الوصول المتوقع خلال ' + BIO_eta(f.eta) + ' تقريباً' : 'الموقع داخل نطاق نشاط هجرة مرتفع';
      store.append('birdalerts', { id: deps.id('BA'), time: now, siteId: x.id, siteName: x.name, score: x.score, level: x.lvl.label, note: note + ' · الرياح ' + x.wind.label + ' ' + x.wind.spd + ' كم/س' });
      (bySec[x.sector || ''] = bySec[x.sector || ''] || []).push({ x: x, note: note });
      sent.push(x.id);
    });
    // رسالة واحدة لكل قطاع (بدلاً من رسالة لكل موقع) تصل لمديري القطاع ومدير الأمن الحيوي
    Object.keys(bySec).forEach(function (sec) {
      var L = bySec[sec], top = L[0].x;
      deps.notify({ kind: 'birds', siteId: top.id, title: '🪶 أسراب مهاجرة باتجاه ' + (L.length > 1 ? L.length + ' مواقع في قطاع ' + sec : '«' + top.name + '»') + ' · خطر ' + top.lvl.label + ' (' + top.score + ')',
        body: L.slice(0, 6).map(function (r) { return '• ' + r.x.name + ': ' + r.x.score + '/100 (' + r.x.lvl.label + ')\n  ' + r.note; }).join('\n') + (L.length > 6 ? '\n• و' + (L.length - 6) + ' مواقع أخرى' : '') + '\nالرياح على ارتفاع الطيران: ' + top.wind.label + ' بسرعة ' + top.wind.spd + ' كم/س' + (top.wind.live ? '' : ' (تقدير مناخي)') + '\n\nالإجراءات الموصى بها الآن:\n• إغلاق الشبابيك وفتحات التهوية المفتوحة بالشبك\n• تغطية العلف والمياه ومنع أي تجمع مياه مكشوف\n• تشديد تطهير الأقدام والمركبات وتقليل الزيارات اليوم\n• إبلاغ فوري عن أي طيور برية داخل السياج' + H.appUrl('#birds') });
    });
    return sent;
  };
  /** مشاهدات eBird المجانية (عند إضافة مفتاح EBIRD_KEY) */
  api._ebirdIngest = function (rows) {
    var have = {}; store.all('birdobs').forEach(function (o) { have[o.id] = 1; });
    var sites = H.sitesList(H.sitesById()).filter(function (x) { return !x.external && x.lat != null; }), add = [];
    (rows || []).forEach(function (r) {
      var genus = String(r.sciName || '').split(' ')[0];
      if (BIO_RISK_GENERA.indexOf(genus) < 0) return;
      var id = 'EB-' + r.subId + '-' + r.speciesCode; if (have[id]) return; have[id] = 1;
      var near = null; sites.forEach(function (s) { var d = BIO_km([s.lat, s.lng], [r.lat, r.lng]); if (!near || d < near.d) near = { d: d, id: s.id }; });
      add.push({ id: id, time: BIO_ms(String(r.obsDt).replace(' ', 'T') + ':00+02:00') || deps.now(), lat: r.lat, lng: r.lng, siteId: near ? near.id : '', species: (r.comName || '') + ' (' + (r.sciName || '') + ')', count: r.howMany || 1, source: 'eBird', note: r.locName || '', by: 'eBird' });
    });
    if (add.length) { if (store.appendMany) store.appendMany('birdobs', add); else add.forEach(function (o) { store.append('birdobs', o); }); }
    return add.length;
  };

  /* ---------- ملخص لمركز القيادة وشاشة العمليات ---------- */
  api._dashExtra = function (u, now) {
    var out = {};
    try {
      var all = H.sitesById(), run = birdRun(now), m = run.model.filter(function (x) { return H.inScope(u, x.id, all); });
      out.birds = { top: m[0] ? { id: m[0].id, name: m[0].name, score: m[0].score, lvl: m[0].lvl, flock: m[0].flocks[0] || null, wind: m[0].wind } : null, high: m.filter(function (x) { return x.score >= num(st().BIRD_ALERT_LEVEL, 60); }).length, season: BIO_season(now).label };
    } catch (e) { out.birds = null; }
    try { var acts = store.all('actions').map(function (a) { return actOut(a, now); }).filter(function (a) { return a.status !== 'مغلق' && H.inScope(u, a.siteId); }); out.capa = { open: acts.length, late: acts.filter(function (a) { return a.late; }).length }; } catch (e) {}
    try { out.companies = { suspended: store.all('companies').filter(function (c) { return String(c.status).trim() === 'موقوف'; }).map(function (c) { return c.name; }) }; } catch (e) {}
    try {
      var d0 = day0(now), dead = {}; store.all('disposal').forEach(function (x) { if (x.kind === 'نافق' && BIO_ms(x.time) >= d0 && H.inScope(u, x.siteId)) dead[BIO_norm(x.siteId)] = (dead[BIO_norm(x.siteId)] || 0) + num(x.count, 0); });
      out.deadToday = Object.keys(dead).reduce(function (a, k) { return a + dead[k]; }, 0);
    } catch (e) {}
    return out;
  };
  /** يستدعيها خادم تطبيق التقارير (بدون رقم سري) للتحقق من التذكرة؛ التذكرة تُستخدم مرة واحدة */
  api.vrTicket = function (ticket) {
    var info = deps.ticket ? deps.ticket.take(ticket) : null;
    if (!info) throw new Error('تذكرة الدخول غير صالحة أو انتهت');
    return info;
  };
}

/* ============================ تقارير زيارات الأمن الحيوي ============================
   منصة واحدة ودخول واحد: تطبيق التقارير (نماذج أثناء التربية والتجهيز والتطهير ومصنع العلف، والمراجعة والاعتماد وملفات PDF)
   يفتح داخل المنصة بنفس الرقم السري. مدير الأمن الحيوي يمنح صلاحيات التقارير لكل مستخدم من شاشة المستخدمين،
   والمنصة تسلّم تطبيق التقارير تذكرة دخول تُستخدم مرة واحدة، فيدخل المستخدم بدوره المناسب دون كود ثانٍ. */
var BIO_REPORTS_URL = 'https://script.google.com/macros/s/AKfycbzhk71OJIFJNLcLHa9b2hqw3jHlAXEoBhcoxV6D34H2UvD8-p5fU52XmvEMhqXnG3hN/exec';
BIO_PERMS.push(
  { k: 'vr_write', label: 'تحرير تقارير الزيارات (إنشاء تقرير وإرساله)', short: 'تحرير التقارير', group: 'vr' },
  { k: 'vr_view', label: 'الاطلاع على تقارير الزيارات', short: 'الاطلاع على التقارير', group: 'vr' },
  { k: 'vr_review', label: 'مراجعة التقارير وتعديلها (مسؤول الأمن الحيوي)', short: 'مراجعة وتعديل التقارير', group: 'vr' },
  { k: 'vr_approve', label: 'الاعتماد النهائي للتقارير (مدير إدارة الأمن الحيوي)', short: 'اعتماد التقارير', group: 'vr' }
);
BIO.ROLE_INSPECTOR = 'مفتش أمن حيوي';
BIO_ROLES.forEach(function (r) {
  if (r.k === BIO.ROLE_MANAGER) r.perms = r.perms.concat(['vr_write', 'vr_view', 'vr_review', 'vr_approve']);
  else if (r.k === BIO.ROLE_SECTOR || r.k === BIO.ROLE_SITE || r.k === BIO.ROLE_VIEWER) r.perms = r.perms.concat(['vr_view']);
});
BIO_ROLES.splice(BIO_ROLES.length - 1, 0, { k: BIO.ROLE_INSPECTOR, label: 'مفتش / معاون أمن حيوي', desc: 'يدخل على تقارير الزيارات فقط: يحرر التقارير ويرسلها للمراجعة', scope: 'optional', perms: ['vr_write'], reportsOnly: true });
/** دور المستخدم في تطبيق التقارير حسب أعلى صلاحية تقارير لديه */
var BIO_VR_ROLES = { mgr: 'مدير إدارة الأمن الحيوي (اعتماد)', sup: 'مسؤول الأمن الحيوي (مراجعة وتعديل)', insp: 'مفتش / معاون (تحرير)', view: 'اطلاع' };
function BIO_vrRole(perms) {
  perms = perms || [];
  return perms.indexOf('vr_approve') >= 0 ? 'mgr' : perms.indexOf('vr_review') >= 0 ? 'sup' : perms.indexOf('vr_write') >= 0 ? 'insp' : perms.indexOf('vr_view') >= 0 ? 'view' : '';
}
function BIO_vrBridge(api, H) {
  var deps = H.deps;
  /** يفتح تطبيق التقارير للمستخدم: يرجع الرابط ومعه تذكرة دخول تُستخدم مرة واحدة خلال 10 دقائق */
  api.vrOpen = function (pin) {
    var u = H.auth(pin, 'vr'), role = BIO_vrRole(u.perms);
    if (!role) throw new Error('ليست لديك صلاحية على تقارير الزيارات. اطلبها من مدير الأمن الحيوي');
    var url = String(H.settings().REPORTS_URL || BIO_REPORTS_URL).trim();
    var vr = u.perms.filter(function (p) { return p.indexOf('vr_') === 0; });
    var out = { role: role, roleLabel: BIO_VR_ROLES[role], perms: vr, url: url };
    if (!deps.ticket) { out.demo = true; return out; }
    var tk = deps.ticket.make({ bid: u.id, name: String(u.name || '').slice(0, 60), phone: String(u.phone || ''), role: role, at: deps.now() });
    out.url = url + (url.indexOf('?') < 0 ? '?' : '&') + 'b=' + tk;
    return out;
  };
  /** يستدعيها خادم تطبيق التقارير (بدون رقم سري) للتحقق من التذكرة؛ التذكرة تُستخدم مرة واحدة */
  api.vrTicket = function (ticket) {
    var info = deps.ticket ? deps.ticket.take(ticket) : null;
    if (!info) throw new Error('تذكرة الدخول غير صالحة أو انتهت');
    return info;
  };
}

/* ============================ نظام الأكواد الموحد (الإصدار 12) ============================
   كل حساب له كود يدل على قطاعه ومستواه ومكانه، ورقم سري من 6 أرقام لا يتكرر:
   HQ-MD01 مدير الإدارة · HQ-EX01 الإدارة العليا · W-SM01 مدير قطاع · W-OF01 مسؤول · W-SV01 مشرف · W-AS01 معاون
   W-GT-CP1 نقطة بوابة (منطقة تطهير) · W-GT-F05 بوابة محطة · W-ST-F05 مدير محطة. حرف القطاع مأخوذ من أكواد مواقعه (W الواحات، R ريجوا). */
BIO.ROLE_OFFICER = 'مسؤول أمن حيوي';
BIO.ROLE_SUPERVISOR = 'مشرف أمن حيوي';
(function () {
  var ins = BIO_role(BIO.ROLE_INSPECTOR);
  if (ins) { ins.label = 'معاون أمن حيوي'; ins.desc = 'معاون / مفتش ميداني: يدخل على تقارير الزيارات فقط، يحرر التقرير ويرسله للمراجعة'; }
  BIO_ROLES.push(
    { k: BIO.ROLE_OFFICER, label: 'مسؤول أمن حيوي', desc: 'مسؤول القطاع: يراجع تقارير الزيارات ويعدلها، وتصله طلبات وبلاغات قطاعه', scope: 'sector', perms: ['decide', 'reports', 'notices', 'analytics', 'vr_write', 'vr_view', 'vr_review'] },
    { k: BIO.ROLE_SUPERVISOR, label: 'مشرف أمن حيوي', desc: 'يشرف على مجموعة محطات: يحرر تقارير الزيارات ويتابع بلاغات محطاته ولوحتها', scope: 'site', perms: ['reports', 'analytics', 'vr_write', 'vr_view'] }
  );
  var order = [BIO.ROLE_MANAGER, BIO.ROLE_SECTOR, BIO.ROLE_OFFICER, BIO.ROLE_SUPERVISOR, BIO.ROLE_INSPECTOR, BIO.ROLE_SITE, BIO.ROLE_GUARD, BIO.ROLE_VIEWER];
  BIO_ROLES.sort(function (a, b) { return order.indexOf(a.k) - order.indexOf(b.k); });
})();
TABLES.usersOld = { sheet: 'المستخدمون - قبل نظام الأكواد', key: 'id', cols: { id: 'الكود القديم', pin: 'الرقم السري القديم', name: 'الاسم', role: 'الصلاحية', gate: 'البوابة', phone: 'الهاتف', scope: 'النطاق', perms: 'صلاحيات مخصصة', active: 'نشط', newId: 'الكود الجديد', archivedAt: 'تاريخ الأرشفة' } };
var BIO_CODE_LEVELS = [
  { k: 'MD', label: 'مدير إدارة الأمن الحيوي', role: 'مدير' },
  { k: 'EX', label: 'الإدارة العليا (متابعة)', role: 'متابعة فقط' },
  { k: 'SM', label: 'مدير قطاع', role: 'مدير قطاع' },
  { k: 'OF', label: 'مسؤول أمن حيوي', role: 'مسؤول أمن حيوي' },
  { k: 'SV', label: 'مشرف أمن حيوي', role: 'مشرف أمن حيوي' },
  { k: 'AS', label: 'معاون أمن حيوي', role: 'مفتش أمن حيوي' },
  { k: 'GT', label: 'نقطة بوابة (منطقة تطهير أو بوابة محطة)', role: 'أمن بوابة' },
  { k: 'ST', label: 'مدير محطة / موقع', role: 'مدير موقع' }
];
var BIO_CODE_DEFAULTS = { ex: 1, sm: 1, of: 1, sv: 2, as: 3, siteGate: true, siteMgr: true };
function BIO_codes(api, H) {
  var store = H.store, deps = H.deps;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function counts(c) {
    c = c || {}; var o = {};
    Object.keys(BIO_CODE_DEFAULTS).forEach(function (k) {
      var d = BIO_CODE_DEFAULTS[k];
      o[k] = typeof d === 'boolean' ? (c[k] == null ? d : !!c[k]) : Math.max(0, Math.min(20, Math.round(Number(c[k] == null ? d : c[k]) || 0)));
    });
    return o;
  }
  /** القطاعات وحرف كل قطاع ومواقعه ومناطق تطهيره */
  function sectors() {
    var sites = H.sitesList(H.sitesById()).filter(function (s) { return !s.external; }), cps = store.all('checkpoints').filter(function (c) { return c.id; }), out = [], by = {};
    function sec(name) { name = String(name || '').trim() || 'عام'; if (!by[name]) { by[name] = { name: name, votes: {}, sites: [], cps: [] }; out.push(by[name]); } return by[name]; }
    function vote(x, id) { var m = BIO_norm(id).match(/^([A-Z0-9]{1,4})-/); if (m) x.votes[m[1]] = (x.votes[m[1]] || 0) + 1; }
    sites.forEach(function (s) { var x = sec(s.sector); x.sites.push(s); vote(x, s.id); });
    cps.forEach(function (c) { var x = sec(c.sector); x.cps.push({ id: BIO_norm(c.id), name: c.name }); vote(x, c.id); });
    var used = { HQ: 1 };
    out.forEach(function (x, i) {
      var best = Object.keys(x.votes).sort(function (a, b) { return x.votes[b] - x.votes[a]; })[0];
      if (!best || used[best]) { best = 'S' + (i + 1); while (used[best]) best += 'X'; }
      used[best] = 1; x.p = best;
    });
    return out;
  }
  function suffix(p, id) { id = BIO_norm(id); return id.indexOf(p + '-') === 0 ? id.slice(p.length + 1) : id; }
  /** خطة الحسابات الجديدة (بدون أرقام سرية) */
  function plan(me, c) {
    var rows = [], seen = {};
    function add(r) { var id = r.id, n = 2; while (seen[id]) id = r.id + '-' + (n++); r.id = id; seen[id] = 1; rows.push(r); }
    add({ id: 'HQ-MD01', name: me.name, role: BIO.ROLE_MANAGER, gate: '', scope: '', phone: me.phone || '', group: 'الإدارة العامة', place: 'كل القطاعات', lvl: 'MD', me: true });
    for (var e = 1; e <= c.ex; e++) add({ id: 'HQ-EX' + pad(e), name: 'الإدارة العليا' + (c.ex > 1 ? ' ' + e : ''), role: BIO.ROLE_VIEWER, gate: '', scope: '', group: 'الإدارة العامة', place: 'كل القطاعات', lvl: 'EX' });
    sectors().forEach(function (x) {
      var g = 'قطاع ' + x.name, i;
      for (i = 1; i <= c.sm; i++) add({ id: x.p + '-SM' + pad(i), name: 'مدير قطاع ' + x.name + (c.sm > 1 ? ' ' + i : ''), role: BIO.ROLE_SECTOR, scope: x.name, group: g, place: g, lvl: 'SM' });
      for (i = 1; i <= c.of; i++) add({ id: x.p + '-OF' + pad(i), name: 'مسؤول أمن حيوي ' + i + ' - ' + x.name, role: BIO.ROLE_OFFICER, scope: x.name, group: g, place: g, lvl: 'OF' });
      var share = [];
      for (i = 0; i < c.sv; i++) share.push([]);
      x.sites.forEach(function (s, k) { if (c.sv) share[Math.floor(k * c.sv / x.sites.length)].push(s); }); // تقسيم متصل بترتيب المواقع (ترتيب التسكين)
      for (i = 1; i <= c.sv; i++) {
        var mine = share[i - 1];
        add({ id: x.p + '-SV' + pad(i), name: 'مشرف أمن حيوي ' + i + ' - ' + x.name, role: BIO.ROLE_SUPERVISOR, scope: mine.length ? mine.map(function (s) { return s.id; }).join(',') : x.name, group: g, place: mine.length ? mine.map(function (s) { return s.name.replace(/^.* - /, ''); }).join('، ') : g, lvl: 'SV' });
      }
      for (i = 1; i <= c.as; i++) add({ id: x.p + '-AS' + pad(i), name: 'معاون أمن حيوي ' + i + ' - ' + x.name, role: BIO.ROLE_INSPECTOR, scope: x.name, group: g, place: g, lvl: 'AS' });
      x.cps.forEach(function (cp) { add({ id: x.p + '-GT-' + suffix(x.p, cp.id), name: 'نقطة ' + cp.name, role: BIO.ROLE_GUARD, gate: cp.id, scope: '', group: g, place: cp.name, lvl: 'GT' }); });
      x.sites.forEach(function (s) {
        if (c.siteGate) add({ id: x.p + '-GT-' + suffix(x.p, s.id), name: 'بوابة ' + s.name, role: BIO.ROLE_GUARD, gate: s.id, scope: '', group: g, place: s.name, lvl: 'GT' });
        if (c.siteMgr) add({ id: x.p + '-ST-' + suffix(x.p, s.id), name: 'مدير ' + s.name, role: BIO.ROLE_SITE, gate: '', scope: s.id, group: g, place: s.name, lvl: 'ST' });
      });
    });
    return rows;
  }
  function roleLabel(k) { var r = BIO_role(k); return r ? r.label : k; }
  function cardOf(x, sites) {
    var r = BIO_role(x.role) || BIO_role(BIO.ROLE_GUARD), group = 'الإدارة العامة', place = 'كل القطاعات';
    if (r.k === BIO.ROLE_GUARD) { var gf = H.gateFor({ gateId: BIO_norm(x.gate), isManager: false }, sites); place = gf.name || BIO_norm(x.gate); if (gf.sector) group = 'قطاع ' + gf.sector; }
    else {
      var raw = BIO_list(x.scope);
      if (raw.length) {
        var names = raw.map(function (v) { var s = sites[BIO_norm(v)]; if (s) { group = 'قطاع ' + s.sector; return s.name; } group = 'قطاع ' + String(v).trim(); return 'قطاع ' + String(v).trim(); });
        place = (names.length > 1 ? names.map(function (n) { return n.replace(/^(تسمين|أمهات) [^-]+ - /, ''); }) : names).join('، ');
      }
    }
    var lv = (String(x.id).match(/-(MD|EX|SM|OF|SV|AS|GT|ST)\d*(?:-|$)/) || [])[1] || '';
    return { id: BIO_norm(x.id), name: x.name, role: r.k, roleLabel: r.label, reportsOnly: !!r.reportsOnly, group: group, place: place, lvl: lv, phone: x.phone ? String(x.phone) : '', pin: String(x.pin == null ? '' : x.pin).trim(), active: !(x.active != null && String(x.active).trim() === BIO.NO),
      access: r.reportsOnly ? 'التقارير' : BIO_vrRole(BIO_userPerms({ role: r.k, perms: x.perms })) ? (r.k === BIO.ROLE_GUARD ? 'النظام' : 'النظام والتقارير') : 'النظام' };
  }
  api.codesPreview = function (pin, c) {
    var me = H.auth(pin, 'admin'); c = counts(c);
    var rows = plan(me, c);
    return { counts: c, defaults: BIO_CODE_DEFAULTS, levels: BIO_CODE_LEVELS, current: store.all('users').filter(function (x) { return x.id !== '' && x.id != null; }).length,
      rows: rows.map(function (r) { return { id: r.id, name: r.name, role: r.role, roleLabel: roleLabel(r.role), group: r.group, place: r.place, lvl: r.lvl, me: !!r.me }; }) };
  };
  /** يطبق نظام الأكواد الجديد: يؤرشف الحسابات القديمة في ورقة مستقلة، وينشئ الحسابات الجديدة بأرقام سرية جديدة. رقمك السري لا يتغير */
  api.codesApply = function (pin, c, sure) {
    var me = H.auth(pin, 'admin'); c = counts(c);
    if (sure !== 'تطبيق') throw new Error('أكّد التطبيق أولاً');
    var rows = plan(me, c), taken = {}, now = deps.now();
    taken[String(pin).trim()] = 1;
    var weak = /^(\d)\1+$|^(012345|123456|234567|345678|456789|987654|876543|765432|654321|543210)$/;
    rows.forEach(function (r) {
      if (r.me) { r.pin = String(pin).trim(); return; }
      var p; do { p = String(100000 + Math.floor(Math.random() * 900000)); } while (taken[p] || weak.test(p)); taken[p] = 1; r.pin = p;
    });
    var old = store.all('users').filter(function (x) { return x.id !== '' && x.id != null; }).map(function (x) { var o = {}; Object.keys(TABLES.users.cols).forEach(function (k) { o[k] = x[k]; }); return o; });
    deps.lock(function () {
      var arch = old.map(function (o) { return Object.assign({}, o, { newId: BIO_norm(o.id) === me.id ? 'HQ-MD01' : '', archivedAt: now }); });
      if (store.appendMany) store.appendMany('usersOld', arch); else arch.forEach(function (o) { store.append('usersOld', o); });
      var ids = old.map(function (o) { return o.id; });
      if (store.removeMany) store.removeMany('users', ids); else ids.forEach(function (k) { store.remove('users', k); });
      var objs = rows.map(function (r) { return { id: r.id, pin: r.pin, name: r.name, role: r.role, gate: r.gate || '', phone: r.phone || '', scope: r.scope || '', perms: '', active: BIO.YES }; });
      if (store.appendMany) store.appendMany('users', objs); else objs.forEach(function (o) { store.append('users', o); });
      store.all('devices').filter(function (d) { return BIO_norm(d.userId) === me.id; }).forEach(function (d) { store.update('devices', d.token, { userId: 'HQ-MD01' }); });
      store.append('cardlog', { id: deps.id('K'), time: now, itemId: 'HQ-MD01', itemName: me.name, action: 'تطبيق نظام الأكواد الموحد: ' + objs.length + ' حساب جديد، وأُرشف ' + old.length + ' حساب قديم', card: '', by: me.name, note: '' });
    });
    if (api._log) api._log(me, 'users', '*', 'نظام الأكواد', { count: old.length }, { count: rows.length });
    return { ok: true, created: rows.length, archived: old.length, myId: 'HQ-MD01' };
  };
  /** كروت الدخول للطباعة والتوزيع: الكود والرقم السري والمكان لكل حساب */
  api.codesCards = function (pin) {
    H.auth(pin, 'admin');
    var sites = H.sitesById(), order = {};
    BIO_CODE_LEVELS.forEach(function (l, i) { order[l.k] = i; });
    var list = store.all('users').filter(function (x) { return x.id !== '' && x.id != null; }).map(function (x) { return cardOf(x, sites); });
    list.sort(function (a, b) { return (a.group === 'الإدارة العامة' ? -1 : 0) - (b.group === 'الإدارة العامة' ? -1 : 0) || a.group.localeCompare(b.group, 'ar') || (order[a.lvl] == null ? 99 : order[a.lvl]) - (order[b.lvl] == null ? 99 : order[b.lvl]) || a.id.localeCompare(b.id); });
    return { appUrl: H.settings().APP_URL || '', cards: list };
  };
}


/* ============================================================
 * v13 — إقرار الوجهة بعد الخروج
 * الوجهات الخطرة (risk) تُسجَّل كزيارة خارجية مستوى 4 فيُحسب العزل تلقائياً عند العودة.
 * ============================================================ */
var BIO_EXT_DEST = [
  { id: 'XD-HOME', name: 'المنزل أو السكن', risk: 0, icon: 'user' },
  { id: 'XD-CO', name: 'موقع آخر للشركة', risk: 0, icon: 'gate', pick: true },
  { id: 'XD-OFFICE', name: 'مكتب أو جهة إدارية', risk: 0, icon: 'file' },
  { id: 'XD-MKT', name: 'سوق طيور حية أو محل دواجن', risk: 1, icon: 'alert' },
  { id: 'XD-FRM', name: 'مزرعة دواجن خارجية', risk: 1, icon: 'alert' },
  { id: 'XD-SLH', name: 'مجزر', risk: 1, icon: 'alert' },
  { id: 'XD-HAT', name: 'معمل تفريخ خارجي', risk: 1, icon: 'alert' },
  { id: 'XD-FEED', name: 'مصنع علف أو مورد خامات', risk: 1, icon: 'alert' },
  { id: 'XD-VET', name: 'عيادة أو معمل بيطري', risk: 1, icon: 'alert' },
  { id: 'XD-PET', name: 'طيور منزلية أو صيد طيور', risk: 1, icon: 'alert' },
  { id: 'XD-OTHER', name: 'جهة أخرى', risk: 0, icon: 'edit', note: true }
];
/** p.extKind = كود الوجهة (XD-..) أو كود موقع خارجي من الشيت، p.extSiteId = موقع الشركة عند XD-CO، p.extNote = توضيح */
function BIO_destOf(p, sites, from) {
  var kind = BIO_norm(p.extKind || ''), note = String(p.extNote || '').trim().slice(0, 120), sid = BIO_norm(p.extSiteId || '');
  if (!kind && sid && sites[sid] && sites[sid].external) kind = sid; // نسخ قديمة من التطبيق
  if (!kind) return { label: '', ext: null, note: note };
  var d = BIO_EXT_DEST.filter(function (x) { return x.id === kind; })[0];
  if (kind === 'XD-CO') { var co = sites[sid]; return { label: 'موقع للشركة: ' + (co && !co.external ? co.name : 'غير محدد') + (note ? ' (' + note + ')' : ''), ext: null, note: note }; }
  var s = sites[kind];
  var label = (d ? d.name : s ? s.name : kind) + (note ? ' (' + note + ')' : '');
  return { label: label, ext: s && s.external ? s : null, note: note };
}

/* =====================================================================
 * الإصدار 13: المركبات بأنواعها وتتبعها، تكويد المقاولين ومعداتهم،
 * بيانات النقل في النافق والسبلة، ولوحة حالة المحطات حتى تاريخه
 * ===================================================================== */
var BIO_VEHICLE_TYPES = [
  { k: 'ملاكي', risk: 1 }, { k: 'نقل موظفين / أتوبيس', risk: 1 }, { k: 'نقل علف', risk: 2 }, { k: 'نقل خامات ومستلزمات', risk: 2 },
  { k: 'نقل كتاكيت', risk: 2, phase: 'استقبال كتاكيت' }, { k: 'نقل بيض تفريخ', risk: 2 }, { k: 'نقل طيور حية (بيع)', risk: 3, phase: 'بيع' },
  { k: 'نقل سبلة', risk: 3, phase: 'تحميل سبلة' }, { k: 'نقل نافق', risk: 3 }, { k: 'غاز وسولار', risk: 2 }, { k: 'مياه', risk: 2 },
  { k: 'صيانة', risk: 2 }, { k: 'إسعاف وطوارئ', risk: 1 }, { k: 'جهة حكومية / بيطرية', risk: 2 }, { k: 'مقاول', risk: 3 }, { k: 'أخرى', risk: 2 }
];
var BIO_EQUIP_TYPES = ['لودر', 'حفار أو بلدوزر', 'جرار وعربة', 'ونش', 'ماكينة رش وتطهير', 'مولد كهرباء', 'معدات لحام وصيانة', 'أقفاص وصناديق نقل', 'أخرى'];
var BIO_CONTRACTOR_TYPES = ['مقاول أعمال وإنشاءات', 'مقاول تحميل وتنزيل', 'مقاول تنظيف وتطهير', 'مقاول سبلة ونافق', 'مقاول صيانة'];
/** مراحل المحطة: الدورة المعتادة للتسمين. next = المرحلة المتوقعة بعدها */
var BIO_PHASES = [
  { k: 'استقبال كتاكيت', c: 'info', next: 'تربية', icon: 'truck' },
  { k: 'تربية', c: 'ok', next: 'بيع', icon: 'shield' },
  { k: 'بيع', c: 'warn', next: 'تحميل سبلة', icon: 'out' },
  { k: 'تحميل سبلة', c: 'bad', next: 'تجهيز وتطهير', icon: 'truck' },
  { k: 'تجهيز وتطهير', c: 'info', next: 'فترة راحة', icon: 'refresh' },
  { k: 'فترة راحة', c: 'n', next: 'استقبال كتاكيت', icon: 'clock' },
  { k: 'متوقفة', c: 'n', next: '', icon: 'pause' },
  { k: 'تشغيل', c: 'ok', next: '', icon: 'check' }
];
TABLES.items.cols.vtype = 'النوع التفصيلي';
TABLES.disposal.cols.plate = 'رقم العربية';
TABLES.disposal.cols.driverName = 'اسم السائق';
TABLES.disposal.cols.contractor = 'المقاول';
TABLES.disposal.cols.contractorId = 'كود المقاول';
TABLES.phases = { sheet: 'مراحل المحطات', key: 'id', cols: { id: 'الرقم', time: 'وقت التسجيل', siteId: 'كود الموقع', siteName: 'الموقع', phase: 'المرحلة', startAt: 'بداية المرحلة', flockAt: 'تاريخ التسكين', birds: 'عدد الطيور', by: 'سجّلها', source: 'المصدر', note: 'ملاحظات' } };
TABLES.statusDaily = { sheet: 'حالة المحطات اليومية', key: 'id', cols: { id: 'الرقم', day: 'اليوم', siteId: 'كود الموقع', siteName: 'الموقع', phase: 'المرحلة', days: 'يوم في المرحلة', age: 'عمر القطيع (يوم)', entries: 'دخول اليوم', denied: 'رفض اليوم', dead: 'نافق اليوم', report: 'آخر تقرير زيارة', score: 'درجة التقرير', status: 'حالة الموقع', risk: 'مؤشر الخطر', note: 'ملاحظات' } };
(function () {
  var f = ADMIN.items.fields, i = 0;
  for (; i < f.length; i++) if (f[i].k === 'plate') break;
  f.splice(i + 1, 0, { k: 'vtype', type: 'select', opts: [''].concat(BIO_VEHICLE_TYPES.map(function (x) { return x.k; }), BIO_EQUIP_TYPES.map(function (x) { return 'معدة: ' + x; })), hint: 'للمركبات والمعدات: النوع التفصيلي (ملاكي، علف، كتاكيت، سبلة، لودر...)' });
  var c = ADMIN.companies.fields.filter(function (x) { return x.k === 'type'; })[0];
  if (c) c.opts = c.opts.slice(0, -1).concat(BIO_CONTRACTOR_TYPES, ['أخرى']);
})();
function BIO_phase(k) { for (var i = 0; i < BIO_PHASES.length; i++) if (BIO_PHASES[i].k === k) return BIO_PHASES[i]; return null; }
function BIO_vtype(k) { k = String(k || '').trim(); for (var i = 0; i < BIO_VEHICLE_TYPES.length; i++) if (BIO_VEHICLE_TYPES[i].k === k) return BIO_VEHICLE_TYPES[i]; return null; }
/** هل الموقع محطة تسمين لها دورة (تربية/بيع/سبلة)؟ */
function BIO_isCycleSite(s) { return !!s && !s.external && (Number(s.level) === 3 || /تسمين|محطة/.test(String(s.name) + ' ' + String(s.type))); }
/** يطابق نص «المحطة / الموقع» في تقرير الزيارة مع موقع في المنصة (محطة 13، مصنع علف، المفرخ...) */
function BIO_matchSite(text, code, sites) {
  var t = String(text || '').trim(), c = String(code || '').trim().toUpperCase(), list = sites.filter(function (s) { return !s.external; });
  if (!t && !c) return null;
  var byId = list.filter(function (s) { return s.id === c || s.id === BIO_norm(t); })[0];
  if (byId) return byId;
  var sec = /^OAS|^W-|واحات/i.test(c + ' ' + t) ? 'الواحات' : /^RIG|^R-|ريجوا/i.test(c + ' ' + t) ? 'ريجوا' : '';
  var pick = function (arr) { if (!arr.length) return null; if (sec) { var a = arr.filter(function (s) { return s.sector === sec; }); if (a.length) return a[0]; } return arr[0]; };
  var n = (t.match(/(?:محطة|محطه|station)\s*(\d+)/i) || c.match(/(\d+)\s*$/) || [])[1];
  if (n) { var hit = pick(list.filter(function (s) { var m = String(s.name).match(/محطة\s*(\d+)/); return m && Number(m[1]) === Number(n); })); if (hit) return hit; }
  if (/علف/.test(t)) return pick(list.filter(function (s) { return /علف/.test(s.name); }));
  if (/تفريخ|مفرخ/.test(t)) return pick(list.filter(function (s) { return /تفريخ|مفرخ/.test(s.name); }));
  if (/أمهات|امهات/.test(t)) return pick(list.filter(function (s) { return /أمهات/.test(s.name); }));
  return pick(list.filter(function (s) { return t && (s.name.indexOf(t) >= 0 || t.indexOf(s.name) >= 0); }));
}

function BIO_v13(api, H) {
  var store = H.store, deps = H.deps, D = 24 * BIO.HOUR;
  function st() { return H.settings(); }
  function num(v, d) { var n = Number(v); return isNaN(n) || v === '' || v == null ? d : n; }
  function day0(t) { return t - ((t + 3 * BIO.HOUR) % D); }
  function dayKey(t) { var d = new Date(t + 3 * BIO.HOUR); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function has(t) { try { store.all(t); return true; } catch (e) { return false; } }
  function log(u, t, k, a, b, c) { if (api._log) api._log(u, t, k, a, b, c); }
  function clean(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 80); }
  function nameKey(v) { return String(v || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim(); }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  /** الكود التالي المتاح: V001، CO07، CO03-V02 ... */
  function nextId(table, prefix, w) {
    var re = new RegExp('^' + prefix.replace(/[-]/g, '\\-') + '(\\d+)$'), max = 0;
    store.all(table).forEach(function (r) { var m = BIO_norm(r.id).match(re); if (m) max = Math.max(max, Number(m[1])); });
    return prefix + pad(max + 1, w);
  }
  var MEMBER = { 'عامل': 'W', 'سائق': 'D', 'مركبة': 'V', 'معدة': 'E', 'مشرف': 'S' };
  function canData(u) { return u.isManager && u.perms.indexOf('data') >= 0; }
  function findCompany(q) {
    var id = BIO_norm(q), k = nameKey(q);
    if (!k) return null;
    return store.all('companies').filter(function (c) { return BIO_norm(c.id) === id || nameKey(c.name) === k; })[0] || null;
  }
  function findPlate(plate) {
    var p = BIO_plateNorm(plate).all; if (!p) return null;
    return store.all('items').filter(function (i) { return i.plate && BIO_plateNorm(i.plate).all === p; })[0] || null;
  }
  function addCompany(u, name, type, extra) {
    var row = Object.assign({ id: nextId('companies', 'CO', 2), name: clean(name, 80), type: type || 'أخرى', contact: '', phone: '', email: '', status: 'نشط', reason: '', note: '' }, extra || {});
    deps.lock(function () { store.append('companies', row); });
    log(u, 'companies', row.id, 'إضافة مقاول / شركة', null, row);
    return row;
  }
  function addItem(u, it) {
    var row = Object.assign({ phone: '', active: BIO.YES, card: 1, watch: '', company: '', plate: '', vtype: '', dept: '', added: deps.now() }, it);
    deps.lock(function () { store.append('items', row); });
    log(u, 'items', row.id, 'تسجيل ' + row.kind, null, row);
    return row;
  }
  function memberId(co, kind) { return co ? nextId('items', BIO_norm(co.id) + '-' + (MEMBER[kind] || 'W'), 2) : nextId('items', kind === 'مركبة' ? 'V' : kind === 'معدة' ? 'Q' : kind === 'سائق' ? 'D' : 'C', 3); }

  /* ---------- النافق والسبلة: رقم العربية والسائق والمقاول (تسجيل تلقائي لما لم يُسجَّل) ---------- */
  var baseAdd = api.disposalAdd, baseList = api.disposals;
  api.disposalAdd = function (pin, r) {
    var u = H.auth(pin); r = Object.assign({}, r || {});
    if (r.id && store.find('disposal', r.id)) return { ok: true, duplicate: true };
    var sites = H.sitesById(), site = sites[BIO_norm(r.siteId)];
    if (!site || site.external) throw new Error('اختر الموقع');
    var plate = clean(r.plate, 30), drvName = clean(r.driverName, 60), coName = clean(r.contractor, 80), created = [];
    var veh = r.vehicleId ? store.find('items', BIO_norm(r.vehicleId)) : plate ? findPlate(plate) : null;
    var co = coName ? findCompany(coName) : veh && veh.company ? store.find('companies', veh.company) : null;
    if (coName && !co) { co = addCompany(u, coName, r.kind === 'سبلة' ? 'مقاول سبلة ونافق' : 'نقل سبلة ونافق', { note: 'أُضيف تلقائياً من سجل النافق والسبلة' }); created.push('المقاول ' + co.id); }
    if (!veh && plate) {
      veh = addItem(u, { id: memberId(co, 'مركبة'), name: (r.kind === 'سبلة' ? 'سيارة سبلة ' : 'سيارة نافق ') + plate, kind: 'مركبة', vtype: r.kind === 'سبلة' ? 'نقل سبلة' : 'نقل نافق', plate: plate, company: co ? co.id : '', dept: co ? co.name : 'النقل' });
      created.push('المركبة ' + veh.id);
    } else if (veh && co && !veh.company) store.update('items', veh.id, { company: co.id });
    var drv = r.driverId ? store.find('items', BIO_norm(r.driverId)) : null;
    if (!drv && drvName) {
      var k = nameKey(drvName);
      drv = store.all('items').filter(function (i) { return i.kind === 'سائق' && nameKey(i.name) === k; })[0] || null;
      if (!drv) { drv = addItem(u, { id: memberId(co, 'سائق'), name: drvName, kind: 'سائق', company: co ? co.id : '', dept: co ? co.name : 'النقل' }); created.push('السائق ' + drv.id); }
    }
    r.vehicleId = veh ? BIO_norm(veh.id) : ''; r.driverId = drv ? BIO_norm(drv.id) : '';
    if (r.kind === 'سبلة' && !num(r.weight, 0) && !r.vehicleId) throw new Error('اكتب وزن السبلة أو رقم العربية الناقلة');
    var res = baseAdd(pin, r);
    if (res && res.ok && !res.duplicate) {
      var patch = { plate: veh ? String(veh.plate || plate) : plate, driverName: drv ? drv.name : drvName, contractor: co ? co.name : '', contractorId: co ? BIO_norm(co.id) : '' };
      deps.lock(function () { store.update('disposal', res.id, patch); });
      res.created = created; res.vehicleId = r.vehicleId; res.driverId = r.driverId;
    }
    return res;
  };
  api.disposals = function (pin, days) {
    var d = baseList(pin, days), by = {};
    store.all('disposal').forEach(function (x) { by[String(x.id)] = x; });
    d.rows.forEach(function (r) { var x = by[String(r.id)] || {}; r.plate = String(x.plate || ''); r.driverName = x.driverName || ''; r.contractor = x.contractor || ''; if (!r.driverName && x.driverId) { var dv = store.find('items', x.driverId); if (dv) r.driverName = dv.name; } if (!r.plate && r.vehicleId) { var v = store.find('items', r.vehicleId); if (v) r.plate = String(v.plate || ''); } });
    var cos = {}; store.all('companies').forEach(function (c) { cos[c.name] = 1; });
    d.suggest = {
      plates: store.all('items').filter(function (i) { return i.kind === 'مركبة' && i.plate; }).map(function (i) { return { id: BIO_norm(i.id), plate: String(i.plate), name: i.name }; }),
      drivers: store.all('items').filter(function (i) { return i.kind === 'سائق'; }).map(function (i) { return i.name; }),
      contractors: Object.keys(cos)
    };
    return d;
  };

  /* ---------- المركبات والمعدات بأنواعها: تسجيل وتتبع بين كل النقاط ---------- */
  api.vehicleAdd = function (pin, r) {
    var u = H.auth(pin); r = r || {};
    if (u.isManager && !canData(u)) throw new Error('ليست لديك صلاحية: إضافة وتعديل الأفراد والمركبات والكروت');
    var kind = r.kind === 'معدة' ? 'معدة' : 'مركبة', plate = clean(r.plate, 30), name = clean(r.name, 80);
    var vtype = kind === 'مركبة' ? (BIO_vtype(r.vtype) ? r.vtype : 'أخرى') : 'معدة: ' + (BIO_EQUIP_TYPES.indexOf(r.vtype) >= 0 ? r.vtype : 'أخرى');
    if (kind === 'مركبة' && !plate) throw new Error('اكتب رقم اللوحة');
    if (plate) { var dup = findPlate(plate); if (dup) throw new Error('هذه اللوحة مسجلة بالفعل بكود ' + BIO_norm(dup.id) + ' (' + dup.name + ')'); }
    var co = r.company ? findCompany(r.company) : null;
    if (r.company && !co) { if (!canData(u)) throw new Error('الشركة غير مسجلة. اطلب من المدير إضافتها'); co = addCompany(u, r.company, r.coType || 'أخرى'); }
    var id = memberId(co, kind);
    var row = addItem(u, { id: id, name: name || (vtype.replace('معدة: ', '') + (plate ? ' ' + plate : '')), kind: kind, vtype: vtype, plate: plate, company: co ? BIO_norm(co.id) : '', dept: co ? co.name : clean(r.owner, 60), phone: clean(r.phone, 20) });
    if (!u.isManager) deps.notify({ kind: 'notice', title: '🚗 مركبة جديدة سُجلت من البوابة', body: row.name + ' (' + row.id + ')' + (plate ? '\nاللوحة: ' + plate : '') + '\nالنوع: ' + vtype + '\nسجّلها: ' + u.name + H.appUrl('#fleet') });
    return { ok: true, id: row.id, item: H.itemInfo(row) };
  };
  function sectorOf(sites, id) { var s = sites[id]; return s ? s.sector : ''; }
  function trackOf(list, sites, now, since) {
    var inside = null, last = null, path = [], secs = {}, cross = [], hops = 0, denied = 0, flags = 0, visits = 0, prevIn = null;
    list.forEach(function (m) {
      if (m.dir === BIO.EXT) return;
      if (m.time >= since) { if (m.flag) flags++; if (m.dir === BIO.IN && !BIO_counted(m) && m.decision !== BIO.PENDING && m.decision !== BIO.CANCELLED) denied++; }
      if (!BIO_counted(m) && m.dir === BIO.IN) return;
      last = m;
      if (m.dir === BIO.IN) {
        inside = m;
        if (m.time >= since) {
          visits++; var sec = sectorOf(sites, m.siteId); if (sec) secs[sec] = 1;
          if (prevIn && prevIn.siteId !== m.siteId) { var ps = sectorOf(sites, prevIn.siteId); if (ps && sec && ps !== sec) cross.push({ time: m.time, from: prevIn.siteName, to: m.siteName, fromSector: ps, toSector: sec, gapH: Math.round((m.time - prevIn.time) / BIO.HOUR), flag: m.flag || '', override: m.decision === BIO.OVERRIDE }); else hops++; }
        }
        prevIn = m;
      } else if (m.dir === BIO.OUT && inside && inside.siteId === m.siteId) inside = null;
      if (m.time >= day0(now)) path.push({ time: m.time, site: m.siteName, siteId: m.siteId, dir: m.dir });
    });
    return { inside: inside ? { siteId: inside.siteId, site: inside.siteName, since: inside.time } : null, last: last ? { time: last.time, site: last.siteName, dir: last.dir, checkpoint: last.checkpoint || '' } : null, today: path, sectors: Object.keys(secs), cross: cross, hops: hops, denied: denied, flags: flags, visits: visits };
  }
  function blockedUntil(itemId, now) {
    var bh = num(st().LITTER_BLOCK_HOURS, 24), last = 0;
    if (has('disposal')) store.all('disposal').forEach(function (d) { var t = BIO_ms(d.time); if ((BIO_norm(d.vehicleId) === itemId || BIO_norm(d.driverId) === itemId) && t > last) last = t; });
    return last && last + bh * BIO.HOUR > now ? last + bh * BIO.HOUR : 0;
  }
  function movesByItem() { var by = {}; H.allMoves().forEach(function (m) { (by[m.itemId] = by[m.itemId] || []).push(m); }); return by; }
  api.fleet = function (pin, days) {
    var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(); days = Math.min(90, Number(days) || 7);
    var since = now - days * D, by = movesByItem(), cos = {};
    store.all('companies').forEach(function (c) { cos[BIO_norm(c.id)] = { name: c.name, status: String(c.status || 'نشط').trim() }; });
    var list = store.all('items').map(H.itemInfo).filter(function (i) { return i && (i.kind === 'مركبة' || i.kind === 'معدة'); }).map(function (i) {
      var tr = trackOf(by[i.id] || [], sites, now, since), vt = BIO_vtype(i.vtype), co = cos[i.company];
      var seen = tr.last && H.inScope(u, tr.last && (by[i.id] || []).slice(-1)[0].siteId, sites);
      return { id: i.id, name: i.name, kind: i.kind, vtype: i.vtype || (i.kind === 'معدة' ? 'معدة' : 'غير محدد'), risk: vt ? vt.risk : i.kind === 'معدة' ? 3 : 2, plate: i.plate, company: i.company, companyName: co ? co.name : '', companyStopped: !!(co && co.status === 'موقوف'), active: i.active, track: tr, blockedUntil: blockedUntil(i.id, now), inScope: !tr.last || seen || u.scope.all };
    }).filter(function (v) { return v.inScope; });
    list.sort(function (a, b) { return (b.track.inside ? 1 : 0) - (a.track.inside ? 1 : 0) || ((b.track.last || {}).time || 0) - ((a.track.last || {}).time || 0); });
    var types = {}; list.forEach(function (v) { types[v.vtype] = (types[v.vtype] || 0) + 1; });
    return { now: now, days: days, list: list, types: types, vtypes: BIO_VEHICLE_TYPES, etypes: BIO_EQUIP_TYPES, companies: Object.keys(cos).map(function (k) { return { id: k, name: cos[k].name }; }),
      totals: { all: list.length, inside: list.filter(function (v) { return v.track.inside; }).length, movedToday: list.filter(function (v) { return v.track.today.length; }).length, cross: list.reduce(function (a, v) { return a + v.track.cross.length; }, 0), blocked: list.filter(function (v) { return v.blockedUntil; }).length, highRisk: list.filter(function (v) { return v.risk >= 3; }).length },
      canEdit: canData(u) };
  };

  /* ---------- تكويد المقاولين ومعداتهم وتتبع حركتهم داخل القطاع وبين القطاعات ---------- */
  api.contractorAdd = function (pin, r) {
    var u = H.auth(pin, 'data'); r = r || {};
    var name = clean(r.name, 80); if (!name) throw new Error('اكتب اسم المقاول أو الشركة');
    if (findCompany(name)) throw new Error('هذا الاسم مسجل بالفعل');
    var row = addCompany(u, name, BIO_CONTRACTOR_TYPES.indexOf(r.type) >= 0 ? r.type : BIO_CONTRACTOR_TYPES[0], { contact: clean(r.contact, 60), phone: clean(r.phone, 20), note: clean(r.note, 200) });
    return { ok: true, id: row.id };
  };
  api.contractorMember = function (pin, r) {
    var u = H.auth(pin, 'data'); r = r || {};
    var co = store.find('companies', r.company); if (!co) throw new Error('اختر المقاول');
    var kind = MEMBER[r.kind] ? r.kind : 'عامل', name = clean(r.name, 80), plate = clean(r.plate, 30);
    if (!name && !plate && kind !== 'معدة') throw new Error('اكتب الاسم أو رقم اللوحة');
    if (plate) { var dup = findPlate(plate); if (dup) throw new Error('هذه اللوحة مسجلة بكود ' + BIO_norm(dup.id)); }
    var vt = kind === 'مركبة' ? (BIO_vtype(r.vtype) ? r.vtype : 'مقاول') : kind === 'معدة' ? 'معدة: ' + (BIO_EQUIP_TYPES.indexOf(r.vtype) >= 0 ? r.vtype : 'أخرى') : '';
    var row = addItem(u, { id: memberId(co, kind), name: name || (vt.replace('معدة: ', '') + ' ' + (plate || co.name)).trim(), kind: kind === 'مشرف' ? 'عامل' : kind, vtype: vt, plate: plate, company: BIO_norm(co.id), dept: co.name + (kind === 'مشرف' ? ' · مشرف المقاول' : ''), phone: clean(r.phone, 20) });
    return { ok: true, id: row.id };
  };
  api.contractors = function (pin, days) {
    var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(); days = Math.min(90, Number(days) || 30);
    var since = now - days * D, by = movesByItem();
    var members = store.all('items').map(H.itemInfo).filter(function (i) { return i && i.company; });
    var list = store.all('companies').map(function (c) {
      var id = BIO_norm(c.id), mem = members.filter(function (i) { return i.company === id; }).map(function (i) {
        var tr = trackOf(by[i.id] || [], sites, now, since);
        return { id: i.id, name: i.name, kind: i.kind, vtype: i.vtype, plate: i.plate, active: i.active, inside: tr.inside, last: tr.last, sectors: tr.sectors, cross: tr.cross, hops: tr.hops, visits: tr.visits, denied: tr.denied, flags: tr.flags, today: tr.today, blockedUntil: blockedUntil(i.id, now) };
      });
      var secs = {}, cross = [];
      mem.forEach(function (m) { m.sectors.forEach(function (s) { secs[s] = 1; }); m.cross.forEach(function (x) { cross.push(Object.assign({ who: m.name, id: m.id }, x)); }); });
      cross.sort(function (a, b) { return b.time - a.time; });
      var contractor = /مقاول/.test(c.type || '') || mem.some(function (m) { return m.kind === 'معدة' || m.kind === 'عامل'; });
      return { id: id, name: c.name, type: c.type || '', contact: c.contact || '', phone: String(c.phone || ''), status: String(c.status || 'نشط').trim(), reason: c.reason || '', contractor: contractor, members: mem, counts: { people: mem.filter(function (m) { return m.kind !== 'مركبة' && m.kind !== 'معدة'; }).length, vehicles: mem.filter(function (m) { return m.kind === 'مركبة'; }).length, equipment: mem.filter(function (m) { return m.kind === 'معدة'; }).length, inside: mem.filter(function (m) { return m.inside; }).length },
        sectors: Object.keys(secs), cross: cross.slice(0, 20), crossCount: cross.length, hops: mem.reduce(function (a, m) { return a + m.hops; }, 0), visits: mem.reduce(function (a, m) { return a + m.visits; }, 0), flags: mem.reduce(function (a, m) { return a + m.flags; }, 0), denied: mem.reduce(function (a, m) { return a + m.denied; }, 0) };
    }).sort(function (a, b) { return (b.contractor ? 1 : 0) - (a.contractor ? 1 : 0) || b.counts.inside - a.counts.inside || b.visits - a.visits; });
    return { now: now, days: days, list: list, types: BIO_CONTRACTOR_TYPES, vtypes: BIO_VEHICLE_TYPES.map(function (x) { return x.k; }), etypes: BIO_EQUIP_TYPES, canEdit: canData(u),
      totals: { contractors: list.filter(function (c) { return c.contractor; }).length, members: members.length, inside: list.reduce(function (a, c) { return a + c.counts.inside; }, 0), cross: list.reduce(function (a, c) { return a + c.crossCount; }, 0), stopped: list.filter(function (c) { return c.status === 'موقوف'; }).length } };
  };

  /* ---------- لوحة حالة المحطات حتى تاريخه (تحديث لحظي + لقطة يومية) ---------- */
  function visitReports() {
    if (!deps.visitReports) return { list: [], linked: false };
    try { var r = deps.visitReports() || []; return { list: r, linked: true }; } catch (e) { return { list: [], linked: false, error: String(e && e.message || e) }; }
  }
  /** تقارير الزيارة لكل موقع (الأحدث أولاً) */
  function reportsBySite(sites) {
    var vr = visitReports(), list = H.sitesList(sites), out = {};
    vr.list.forEach(function (r) {
      var s = BIO_matchSite(r.station, r.farmCode, list); if (!s) return;
      var t = BIO_ms(r.date) || BIO_ms(r.updatedAt); if (!t) return;
      (out[s.id] = out[s.id] || []).push({ id: String(r.id || r.no || ''), no: String(r.no || ''), time: t, type: String(r.type || ''), visitType: String(r.visitType || ''), by: String(r.by || ''), score: r.score === '' || r.score == null ? null : Number(r.score), grade: String(r.grade || ''), decision: String(r.decision || ''), critical: num(r.critical, 0), major: num(r.major, 0), minor: num(r.minor, 0), open: num(r.open, 0), status: String(r.status || ''), downtime: r.downtime === '' || r.downtime == null ? null : Number(r.downtime), pdf: String(r.pdf || '') });
    });
    Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return b.time - a.time; }); });
    return { by: out, linked: vr.linked, error: vr.error || '', count: vr.list.length };
  }
  function phaseFromReport(r) { return /تجهيز|تطهير/.test(r.type) ? 'تجهيز وتطهير' : /تربية/.test(r.type) ? 'تربية' : ''; }
  /** يستنتج مرحلة كل محطة من آخر إشارة: تسجيل يدوي، تقرير زيارة، سبلة، سيارة كتاكيت أو بيع على البوابة */
  function siteSignals(sites, reps, now) {
    var sig = {}, push = function (id, x) { (sig[id] = sig[id] || []).push(x); };
    if (has('phases')) store.all('phases').forEach(function (p) { var id = BIO_norm(p.siteId); if (!sites[id] || !BIO_phase(p.phase)) return; push(id, { time: BIO_ms(p.startAt) || BIO_ms(p.time), phase: p.phase, src: 'manual', label: 'تسجيل ' + (p.by || ''), flockAt: BIO_ms(p.flockAt) || 0, birds: num(p.birds, 0), note: p.note || '', at: BIO_ms(p.time) }); });
    Object.keys(reps).forEach(function (id) { reps[id].slice(0, 6).forEach(function (r) { var ph = phaseFromReport(r); if (ph) push(id, { time: r.time, phase: ph, src: 'report', label: 'تقرير زيارة ' + (r.no || r.id) + ' · ' + r.type }); }); });
    if (has('disposal')) store.all('disposal').forEach(function (d) { var id = BIO_norm(d.siteId); if (d.kind === 'سبلة' && sites[id]) push(id, { time: BIO_ms(d.time), phase: 'تحميل سبلة', src: 'litter', label: 'خروج سبلة ' + (d.plate ? 'بالعربية ' + d.plate : '') }); });
    var vt = {}; store.all('items').forEach(function (i) { var t = BIO_vtype(i.vtype); if (t && t.phase) vt[BIO_norm(i.id)] = t.phase; });
    var lim = now - 75 * D;
    H.allMoves().forEach(function (m) { if (m.time < lim || m.dir !== BIO.IN || !BIO_counted(m) || !vt[m.itemId] || !sites[m.siteId]) return; push(m.siteId, { time: m.time, phase: vt[m.itemId], src: 'gate', label: m.itemName + ' دخلت من ' + (m.checkpoint || 'البوابة') }); });
    Object.keys(sig).forEach(function (k) { sig[k].sort(function (a, b) { return a.time - b.time; }); });
    return sig;
  }
  function statusRows(u, now) {
    var sites = H.sitesById(), rep = reportsBySite(sites), sig = siteSignals(sites, rep.by, now), d0 = day0(now), all = H.allMoves();
    var today = {}, week = {}, inside = {};
    all.forEach(function (m) {
      if (m.time >= d0 && m.dir === BIO.IN) { var t = today[m.siteId] = today[m.siteId] || { in: 0, deny: 0, flags: 0 }; if (BIO_counted(m)) t.in++; else if (m.decision !== BIO.PENDING && m.decision !== BIO.CANCELLED) t.deny++; if (m.flag) t.flags++; }
      if (m.time >= now - 7 * D && m.flag) week[m.siteId] = (week[m.siteId] || 0) + 1;
    });
    var on = {}; all.forEach(function (m) { if (m.dir === BIO.EXT || (!BIO_counted(m) && m.dir === BIO.IN)) return; if (m.dir === BIO.IN) on[m.itemId] = m.siteId; else if (m.dir === BIO.OUT && on[m.itemId] === m.siteId) delete on[m.itemId]; });
    Object.keys(on).forEach(function (k) { inside[on[k]] = (inside[on[k]] || 0) + 1; });
    var dead = {}, dead7 = {};
    if (has('disposal')) store.all('disposal').forEach(function (x) { if (x.kind !== 'نافق') return; var id = BIO_norm(x.siteId), t = BIO_ms(x.time); if (t >= d0) dead[id] = (dead[id] || 0) + num(x.count, 0); else if (t >= d0 - 7 * D) dead7[id] = (dead7[id] || 0) + num(x.count, 0); });
    var urgent = {}; store.all('reports').forEach(function (r) { if (String(r.status) !== BIO.R_DONE) { var id = BIO_norm(r.siteId); urgent[id] = (urgent[id] || 0) + 1; } });
    var rows = H.sitesList(sites).filter(function (s) { return !s.external && H.inScope(u, s.id, sites); }).map(function (s) {
      var cyc = BIO_isCycleSite(s), list = sig[s.id] || [], cur = list[list.length - 1] || null, phase, start, src;
      if (cur) { phase = cur.phase; start = cur.time; src = cur; } else { phase = cyc ? '' : 'تشغيل'; start = 0; src = null; }
      // الإشارات المتتالية لنفس المرحلة تُحسب من أولها
      if (cur) for (var i = list.length - 2; i >= 0 && list[i].phase === phase; i--) start = list[i].time;
      if (phase === 'استقبال كتاكيت' && now - start > 2 * D) phase = 'تربية';
      if (phase === 'تجهيز وتطهير' && cur && cur.src !== 'manual' && now - start > 10 * D) phase = 'فترة راحة';
      if (s.status === BIO.ST_CLOSED) phase = 'متوقفة';
      var flockAt = 0; for (var j = list.length - 1; j >= 0; j--) { if (list[j].flockAt) { flockAt = list[j].flockAt; break; } if (list[j].phase === 'استقبال كتاكيت') { flockAt = list[j].time; break; } if (list[j].phase === 'تحميل سبلة' || list[j].phase === 'تجهيز وتطهير' || list[j].phase === 'فترة راحة') break; }
      if (['تربية', 'استقبال كتاكيت', 'بيع'].indexOf(phase) < 0) flockAt = 0;
      var birds = 0; if (flockAt || phase === 'تربية' || phase === 'بيع') for (var b = list.length - 1; b >= 0; b--) { if (list[b].birds) { birds = list[b].birds; break; } if (list[b].phase === 'تحميل سبلة') break; }
      var reps = rep.by[s.id] || [], lr = reps[0] || null, t = today[s.id] || { in: 0, deny: 0, flags: 0 }, avg = (dead7[s.id] || 0) / 7, dd = dead[s.id] || 0;
      var spike = dd >= Math.max(30, avg * 2), risk = 0, why = [];
      if (s.status === BIO.ST_ALERT) { risk += 35; why.push('الموقع في حالة إنذار'); } else if (s.status === BIO.ST_CLOSED) { risk += 50; why.push('الموقع مغلق'); }
      if (spike) { risk += 30; why.push('نفوق مرتفع اليوم'); }
      if (lr && lr.critical) { risk += 20; why.push(lr.critical + ' ملاحظة حرجة في آخر تقرير'); }
      if (lr && lr.score != null && lr.score < 75) { risk += 12; why.push('درجة آخر تقرير ' + lr.score + '%'); }
      if (urgent[s.id]) { risk += 15; why.push(urgent[s.id] + ' بلاغ عاجل مفتوح'); }
      if (t.deny >= 3) { risk += 8; why.push(t.deny + ' حالة رفض اليوم'); }
      if (week[s.id]) { risk += Math.min(15, week[s.id] * 5); why.push(week[s.id] + ' مخالفة خلال 7 أيام'); }
      if (cyc && !lr) { risk += 5; why.push('لا يوجد تقرير زيارة مسجل'); } else if (lr && now - lr.time > 14 * D) { risk += 6; why.push('آخر تقرير زيارة منذ ' + Math.round((now - lr.time) / D) + ' يوماً'); }
      risk = Math.min(100, risk);
      var ph = BIO_phase(phase);
      return { id: s.id, name: s.name, sector: s.sector, level: s.level, type: s.type, status: s.status, cycle: cyc, phase: phase || 'غير محددة', phaseC: ph ? ph.c : 'n', next: ph ? ph.next : '', since: start, days: start ? Math.max(0, Math.floor((now - start) / D)) : null, flockAt: flockAt, age: flockAt ? Math.max(0, Math.floor((now - flockAt) / D)) + 1 : null, birds: birds,
        source: src ? { src: src.src, label: src.label, time: src.time } : null, history: list.slice(-6).reverse().map(function (x) { return { time: x.time, phase: x.phase, src: x.src, label: x.label }; }),
        today: t, inside: inside[s.id] || 0, dead: dd, deadAvg: Math.round(avg * 10) / 10, spike: spike, urgent: urgent[s.id] || 0,
        report: lr, reports: reps.slice(0, 3), risk: risk, riskLabel: risk >= 60 ? 'مرتفع' : risk >= 30 ? 'متوسط' : 'منخفض', why: why };
    });
    rows.sort(function (a, b) { return String(a.sector).localeCompare(String(b.sector)) || (a.cycle ? 1 : 0) - (b.cycle ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'ar', { numeric: true }); });
    return { rows: rows, reports: { linked: rep.linked, error: rep.error, count: rep.count } };
  }
  function canPhase(u) { return u.isManager && u.role !== BIO.ROLE_VIEWER && (u.perms.indexOf('decide') >= 0 || u.perms.indexOf('reports') >= 0 || u.perms.indexOf('vr_write') >= 0 || u.perms.indexOf('admin') >= 0); }
  api.stationStatus = function (pin) {
    var u = H.auth(pin, true), now = deps.now(), r = statusRows(u, now);
    var snap = has('statusDaily') ? store.all('statusDaily').reduce(function (a, x) { return String(x.day) > a ? String(x.day) : a; }, '') : '';
    var counts = {}; r.rows.forEach(function (x) { counts[x.phase] = (counts[x.phase] || 0) + 1; });
    return { now: now, day: dayKey(now), rows: r.rows, counts: counts, phases: BIO_PHASES, reports: r.reports, snapshot: snap, canEdit: canPhase(u), reportsUrl: String(st().REPORTS_URL || BIO_REPORTS_URL) };
  };
  api.setPhase = function (pin, p) {
    var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(); p = p || {};
    if (!canPhase(u)) throw new Error('تحديث مرحلة المحطة لمسؤولي ومشرفي الأمن الحيوي ومديري المواقع');
    var s = sites[BIO_norm(p.siteId)]; if (!s || s.external) throw new Error('اختر الموقع');
    if (!H.inScope(u, s.id, sites)) throw new Error('هذا الموقع خارج نطاق إدارتك');
    if (!BIO_phase(p.phase)) throw new Error('اختر المرحلة');
    var start = BIO_ms(p.startAt) || now; if (start > now + D) throw new Error('تاريخ بداية المرحلة في المستقبل');
    var row = { id: p.id || deps.id('PH'), time: now, siteId: s.id, siteName: s.name, phase: p.phase, startAt: start, flockAt: BIO_ms(p.flockAt) || (p.phase === 'استقبال كتاكيت' ? start : ''), birds: num(p.birds, '') , by: u.name, source: 'تسجيل يدوي', note: clean(p.note, 200) };
    if (store.find('phases', row.id)) return { ok: true, duplicate: true };
    deps.lock(function () { store.append('phases', row); });
    log(u, 'phases', row.id, 'تحديث مرحلة ' + s.name, null, row);
    if (['بيع', 'تحميل سبلة', 'استقبال كتاكيت'].indexOf(p.phase) >= 0) deps.notify({ kind: 'site', siteId: s.id, title: '📍 «' + s.name + '»: مرحلة ' + p.phase, body: 'سجّلها ' + u.name + (row.note ? '\n' + row.note : '') + (p.phase === 'تحميل سبلة' ? '\nسيارات السبلة ممنوعة من المناطق النظيفة ' + num(st().LITTER_BLOCK_HOURS, 24) + ' ساعة بعد الخروج.' : '') + H.appUrl('#stations') });
    return { ok: true, id: row.id };
  };
  /** لقطة يومية (من المهمة المجدولة 2 فجراً): تحفظ حالة كل محطة في شيت «حالة المحطات اليومية» */
  api._statusSnapshot = function () {
    var now = deps.now(), key = dayKey(now), r = statusRows({ scope: { all: true }, isManager: true, perms: [] }, now), have = {};
    store.all('statusDaily').forEach(function (x) { have[String(x.id)] = 1; });
    var rows = r.rows.filter(function (x) { return !have[key + '-' + x.id]; }).map(function (x) { return { id: key + '-' + x.id, day: key, siteId: x.id, siteName: x.name, phase: x.phase, days: x.days == null ? '' : x.days, age: x.age == null ? '' : x.age, entries: x.today.in, denied: x.today.deny, dead: x.dead, report: x.report ? (x.report.no || x.report.id) + ' · ' + x.report.type + ' · ' + BIO_fmtTime(x.report.time) : '', score: x.report && x.report.score != null ? x.report.score : '', status: x.status, risk: x.risk, note: x.why.join('، ') }; });
    if (rows.length) deps.lock(function () { if (store.appendMany) store.appendMany('statusDaily', rows); else rows.forEach(function (x) { store.append('statusDaily', x); }); });
    return { day: key, rows: rows.length };
  };
  /** سجل اللقطات اليومية لمحطة (آخر 30 يوماً) */
  api.stationHistory = function (pin, siteId) {
    var u = H.auth(pin, true), id = BIO_norm(siteId);
    if (!H.inScope(u, id)) throw new Error('هذا الموقع خارج نطاق إدارتك');
    var rows = has('statusDaily') ? store.all('statusDaily').filter(function (x) { return BIO_norm(x.siteId) === id; }).map(function (x) { return { day: String(x.day), phase: x.phase, days: x.days, age: x.age, entries: num(x.entries, 0), denied: num(x.denied, 0), dead: num(x.dead, 0), score: x.score, risk: num(x.risk, 0) }; }).sort(function (a, b) { return a.day < b.day ? 1 : -1; }).slice(0, 30) : [];
    var ph = has('phases') ? store.all('phases').filter(function (x) { return BIO_norm(x.siteId) === id; }).map(function (x) { return { time: BIO_ms(x.time), phase: x.phase, startAt: BIO_ms(x.startAt), by: x.by, note: x.note || '' }; }).sort(function (a, b) { return b.time - a.time; }).slice(0, 20) : [];
    return { days: rows, phases: ph };
  };

  /* ---------- eBird: حفظ المفتاح من التطبيق (للمدير) ---------- */
  api.ebirdStatus = function (pin) {
    H.auth(pin, true); var k = String(st().EBIRD_KEY || '').trim();
    var n = has('birdobs') ? store.all('birdobs').filter(function (o) { return /eBird/i.test(String(o.source)); }).length : 0;
    return { active: !!k, masked: k ? k.slice(0, 2) + '••••' + k.slice(-2) : '', observations: n };
  };
  api.setEbirdKey = function (pin, key) {
    var u = H.auth(pin, 'admin'), k = String(key || '').trim();
    if (k && !/^[A-Za-z0-9]{6,40}$/.test(k)) throw new Error('المفتاح غير صحيح: انسخه كما يظهر في صفحة eBird (حروف وأرقام إنجليزية فقط)');
    var row = store.find('settings', 'EBIRD_KEY');
    deps.lock(function () { if (row) store.update('settings', 'EBIRD_KEY', { value: k }); else store.append('settings', { key: 'EBIRD_KEY', value: k, note: 'مفتاح eBird المجاني لمشاهدات الطيور الحقيقية حول المواقع' }); });
    log(u, 'settings', 'EBIRD_KEY', k ? 'تفعيل eBird' : 'إيقاف eBird', null, { key: k ? '••••' : '' });
    var fetched = null;
    if (k && deps.ebirdNow) { try { fetched = deps.ebirdNow(); } catch (e) { fetched = { error: String(e && e.message || e) }; } }
    return { ok: true, active: !!k, fetched: fetched };
  };
}

/* بيانات العرض للإصدار 13: أنواع المركبات، مقاول بمعداته يتنقل بين القطاعين، ومراحل المحطات */
function BIO_seedV13(s, now) {
  var H = BIO.HOUR, D = 24 * H, Y = BIO.YES, nm = {};
  s.sites.forEach(function (x) { nm[x.id] = x.name; });
  var vt = { V001: 'نقل علف', V002: 'نقل سبلة', V003: 'نقل كتاكيت', V004: 'صيانة', Q001: 'معدة: ماكينة رش وتطهير' };
  s.items.forEach(function (i) { if (vt[i.id]) i.vtype = vt[i.id]; });
  s.moves = s.moves.filter(function (m) { return !(m.itemId === 'V003' && m.siteId === 'W-F03'); });
  (s.companies = s.companies || []).push({ id: 'CO06', name: 'مقاول إنشاءات النخيل (مثال)', type: 'مقاول أعمال وإنشاءات', contact: 'م. شريف', phone: '', email: '', status: 'نشط', reason: '', note: 'صيانة عنابر وأعمال خرسانية' });
  s.items.push(
    { id: 'V005', name: 'سيارة ملاكي - طبيب بيطري (مثال)', kind: 'مركبة', vtype: 'ملاكي', dept: 'الطب البيطري', phone: '', active: Y, plate: 'ق ر م 2525' },
    { id: 'V006', name: 'سيارة تاجر طيور حية (مثال)', kind: 'مركبة', vtype: 'نقل طيور حية (بيع)', dept: 'المبيعات', phone: '', active: Y, plate: 'ب ي ع 7070' },
    { id: 'V007', name: 'تريلا خامات علف (مثال)', kind: 'مركبة', vtype: 'نقل خامات ومستلزمات', dept: 'المشتريات', phone: '', active: Y, plate: 'خ م ت 6161' },
    { id: 'CO06-S01', name: 'مشرف المقاول - سامي (مثال)', kind: 'عامل', dept: 'مقاول إنشاءات النخيل (مثال) · مشرف المقاول', phone: '', active: Y, company: 'CO06' },
    { id: 'CO06-W01', name: 'عامل مقاول - رجب (مثال)', kind: 'عامل', dept: 'مقاول إنشاءات النخيل (مثال)', phone: '', active: Y, company: 'CO06' },
    { id: 'CO06-W02', name: 'عامل مقاول - صابر (مثال)', kind: 'عامل', dept: 'مقاول إنشاءات النخيل (مثال)', phone: '', active: Y, company: 'CO06' },
    { id: 'CO06-V01', name: 'نصف نقل المقاول (مثال)', kind: 'مركبة', vtype: 'مقاول', dept: 'مقاول إنشاءات النخيل (مثال)', phone: '', active: Y, company: 'CO06', plate: 'ن خ ل 3131' },
    { id: 'CO06-E01', name: 'لودر المقاول (مثال)', kind: 'معدة', vtype: 'معدة: لودر', dept: 'مقاول إنشاءات النخيل (مثال)', phone: '', active: Y, company: 'CO06' }
  );
  var k = 0, cps = { W: 'منطقة التطهير المركزية - الواحات', R: 'منطقة التطهير المركزية - ريجوا' };
  function mv(it, name, site, h, dir, extra) { var t = now - h * H; s.moves.push(Object.assign({ id: 'V13-SEED-' + (++k), time: t, itemId: it, itemName: name, siteId: site, siteName: nm[site], dir: dir, decision: BIO.ALLOW, reason: '', checks: dir === BIO.IN ? 'غسيل وتطهير كامل' : '', user: 'أمن البوابة', checkpoint: cps[site.charAt(0)], offline: '', flag: '', via: 'مسح الكارت', updatedAt: t }, extra || {})); }
  mv('V005', 'سيارة ملاكي - طبيب بيطري (مثال)', 'W-HAT', 6, BIO.IN); mv('V005', 'سيارة ملاكي - طبيب بيطري (مثال)', 'W-HAT', 5, BIO.OUT); mv('V005', 'سيارة ملاكي - طبيب بيطري (مثال)', 'W-BRD', 2, BIO.IN);
  mv('V006', 'سيارة تاجر طيور حية (مثال)', 'W-F03', 3, BIO.IN, { checks: 'غسيل وتطهير السيارة بالكامل، تطهير الأقفاص' });
  mv('V007', 'تريلا خامات علف (مثال)', 'W-FEED', 8, BIO.IN); mv('V007', 'تريلا خامات علف (مثال)', 'W-FEED', 6, BIO.OUT);
  mv('CO06-W01', 'عامل مقاول - رجب (مثال)', 'W-F08', 30, BIO.IN); mv('CO06-W01', 'عامل مقاول - رجب (مثال)', 'W-F08', 26, BIO.OUT);
  mv('CO06-W01', 'عامل مقاول - رجب (مثال)', 'R-BRD', 5, BIO.IN, { decision: BIO.OVERRIDE, reason: 'دخول استثنائي لإصلاح عاجل', flag: 'انتقل من قطاع الواحات إلى ريجوا قبل اكتمال العزل (مثال)' });
  mv('CO06-S01', 'مشرف المقاول - سامي (مثال)', 'W-F08', 30, BIO.IN); mv('CO06-S01', 'مشرف المقاول - سامي (مثال)', 'W-F08', 26, BIO.OUT); mv('CO06-S01', 'مشرف المقاول - سامي (مثال)', 'W-F20', 4, BIO.IN);
  mv('CO06-W02', 'عامل مقاول - صابر (مثال)', 'W-F20', 4, BIO.IN);
  mv('CO06-V01', 'نصف نقل المقاول (مثال)', 'W-F08', 30, BIO.IN); mv('CO06-V01', 'نصف نقل المقاول (مثال)', 'W-F08', 26, BIO.OUT);
  mv('CO06-V01', 'نصف نقل المقاول (مثال)', 'R-HAT', 3, BIO.IN, { decision: BIO.DENY, reason: 'لم تكتمل فترة العزل بعد الخروج من محطة 8 (قطاع آخر)', checks: '' });
  mv('CO06-E01', 'لودر المقاول (مثال)', 'W-F08', 48, BIO.IN); mv('CO06-E01', 'لودر المقاول (مثال)', 'W-F08', 40, BIO.OUT); mv('CO06-E01', 'لودر المقاول (مثال)', 'W-F20', 20, BIO.IN);
  s.moves.sort(function (a, b) { return a.time - b.time; });
  var p = 0;
  function ph(site, phase, startD, extra) { s.phases.push(Object.assign({ id: 'PH-SEED-' + (++p), time: now - startD * D, siteId: site, siteName: nm[site], phase: phase, startAt: now - startD * D, flockAt: '', birds: '', by: 'مشرف الأمن الحيوي (مثال)', source: 'تسجيل يدوي', note: '' }, extra || {})); }
  s.phases = [];
  ph('W-F05', 'بيع', 2, { flockAt: now - 36 * D, birds: 42000, note: 'بداية البيع: 3 أيام' });
  ph('W-F03', 'تربية', 34, { flockAt: now - 34 * D, birds: 38000 });
  ph('W-F08', 'فترة راحة', 6, { note: 'داون تايم 14 يوماً' });
  ph('W-F17', 'تجهيز وتطهير', 7);
  ph('W-F20', 'فترة راحة', 3);
  ph('W-F10', 'استقبال كتاكيت', 11, { birds: 40000 });
  s.statusDaily = [];
  return s;
}
var BIO_seedV12_ = BIO_seed;
BIO_seed = function (now) { return BIO_seedV13(BIO_seedV12_(now), now); };
/** تقارير زيارة تجريبية لنسخة العرض (على الخادم تُقرأ من شيت تطبيق التقارير) */
function BIO_demoReports(now) {
  var D = 24 * BIO.HOUR, n = 0;
  function r(st, code, type, d, score, grade, crit, maj, min, status, by) { n++; return { id: 'demo-' + n, no: 'VR-' + (1040 + n), type: type, station: st, farmCode: code, date: now - d * D, visitType: 'دورية', by: by || 'معاون أمن حيوي (مثال)', score: score, grade: grade, decision: score >= 85 ? 'مطابق' : score >= 70 ? 'مطابق مع ملاحظات' : 'غير مطابق', critical: crit, major: maj, minor: min, open: crit + maj, status: status || 'معتمد', downtime: /تجهيز/.test(type) ? 12 : '', pdf: '', updatedAt: now - d * D }; }
  return [
    r('محطة 10', 'OAS-10', 'أثناء التربية', 3, 88, 'جيد جداً', 0, 1, 2),
    r('محطة 4', 'OAS-04', 'أثناء التربية', 5, 71, 'مقبول', 1, 2, 3, 'بانتظار المراجعة'),
    r('محطة 21', 'OAS-21', 'التجهيز والتطهير', 2, 92, 'ممتاز', 0, 0, 1),
    r('محطة 13', 'OAS-13', 'التجهيز والتطهير', 3, 84, 'جيد', 0, 1, 1),
    r('محطة 12', 'OAS-12', 'أثناء التربية', 1, 94, 'ممتاز', 0, 0, 0),
    r('محطة 5', 'OAS-05', 'أثناء التربية', 9, 81, 'جيد', 0, 1, 2),
    r('مصنع علف الواحات', 'OAS-FM', 'مصنع علف', 6, 79, 'جيد', 0, 2, 2),
    r('محطة 3', 'OAS-03', 'أثناء التربية', 12, 86, 'جيد جداً', 0, 0, 3)
  ];
}

/* =====================================================================
   الإصدار 14: حائط الكاميرات (جاهز وينتظر اعتماد الإدارة)، رابط تتبع رحلة السائق لمركبات محددة،
   إقرار الأمن الحيوي مع تسجيل المأمورية أو الزيارة، البلاغ والرسالة الصوتية، الإنذار المبكر من النافق اليومي
   ===================================================================== */
TABLES.items.cols.track = 'تتبع الرحلات';
TABLES.missions.cols.decl = 'إقرار الأمن الحيوي';
TABLES.missions.cols.declRisk = 'تقييم الإقرار';
TABLES.missions.cols.declFlag = 'عدم مطابقة الإقرار';
TABLES.reports.cols.voice = 'رسالة صوتية';
TABLES.messages.cols.voice = 'رسالة صوتية';
TABLES.cameras = { sheet: 'الكاميرات', key: 'id', cols: { id: 'كود الكاميرا', name: 'اسم الكاميرا', siteId: 'كود الموقع أو البوابة', siteName: 'المكان', sector: 'القطاع', kind: 'نوع الربط', url: 'رابط البث أو اللقطة', appUrl: 'رابط تطبيق الكاميرات', active: 'مفعلة', order: 'الترتيب' } };
TABLES.trips = { sheet: 'رحلات المركبات', key: 'id', cols: { id: 'رقم الرحلة', time: 'وقت الإنشاء', itemId: 'كود المركبة', itemName: 'المركبة', plate: 'رقم اللوحة', driver: 'السائق', phone: 'هاتف السائق', fromId: 'من (كود)', fromName: 'من', toId: 'إلى (كود)', toName: 'إلى', token: 'رمز الرابط', by: 'أرسله', byId: 'كود المرسل', status: 'الحالة', startedAt: 'بداية الرحلة', endedAt: 'نهاية الرحلة', lastAt: 'آخر إشارة', lastLat: 'آخر خط عرض', lastLng: 'آخر خط طول', points: 'عدد النقاط', km: 'المسافة (كم)', stops: 'توقفات خارج المواقع', alerts: 'التنبيهات', note: 'ملاحظات' } };
TABLES.tripPings = { sheet: 'نقاط تتبع الرحلات', key: 'id', cols: { id: 'الرقم', tripId: 'رقم الرحلة', time: 'الوقت', pts: 'النقاط (الوقت، العرض، الطول، الدقة)' } };
TABLES.ews = { sheet: 'الإنذار المبكر للنافق', key: 'id', cols: { id: 'الرقم', time: 'الوقت', day: 'اليوم', siteId: 'كود الموقع', siteName: 'الموقع', dead: 'نافق اليوم', base: 'المعدل المعتاد', ratio: 'نسبة الزيادة', pct: 'نسبة النفوق اليومية %', level: 'المستوى', why: 'الأسباب', status: 'الحالة', action: 'الإجراء', by: 'بواسطة', at: 'وقت الإجراء' } };
ADMIN.cameras = { title: 'الكاميرات', fields: [
  { k: 'id', req: 1, upper: 1, hint: 'كود قصير مثل CAM01' }, { k: 'name', req: 1 }, { k: 'siteId', hint: 'كود الموقع أو منطقة التطهير، مثل W-CP1 أو W-F05' },
  { k: 'kind', type: 'select', opts: ['لقطة متجددة (JPEG)', 'بث مباشر (MJPEG)', 'صفحة بث', 'رابط تطبيق فقط'], def: 'لقطة متجددة (JPEG)' },
  { k: 'url', hint: 'رابط https من جهاز البث في المقر (go2rtc) أو جهاز التسجيل' }, { k: 'appUrl', hint: 'اختياري: رابط فتح الكاميرا في تطبيق Hik-Connect أو DMSS' },
  { k: 'active', type: 'yesno', def: 'نعم' }, { k: 'order', type: 'number' }] };
BIO.ROLES_TRIP = ['مدير', 'مدير قطاع', 'مسؤول أمن حيوي', 'مشرف أمن حيوي'];
BIO.TRIP_LIVE = ['بانتظار السائق', 'جارية'];
BIO.DECL_FARMS = ['لا توجد', 'مزرعة دواجن أخرى', 'مزرعة عملاء', 'سوق طيور حية', 'مجزر', 'معمل تفريخ خارجي', 'تربية منزلية'];
BIO.EWS_LEVELS = [{ k: 'طبيعي', c: 'ok', n: 0 }, { k: 'مراقبة', c: 'info', n: 1 }, { k: 'إنذار', c: 'warn', n: 2 }, { k: 'حرج', c: 'bad', n: 3 }];
BIO.EWS_ACTS = ['متابعة', 'رفع إنذار على الموقع', 'إغلاق الموقع', 'تم الاحتواء', 'إنذار غير صحيح'];

function BIO_v14(api, H) {
  var store = H.store, deps = H.deps, D = 24 * BIO.HOUR;
  function st() { return H.settings(); }
  function num(v, d) { var n = Number(v); return isNaN(n) || v === '' || v == null ? d : n; }
  function clean(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 80); }
  function has(t) { try { store.all(t); return true; } catch (e) { return false; } }
  function day0(t) { return t - ((t + 3 * BIO.HOUR) % D); }
  function dayKey(t) { var d = new Date(t + 3 * BIO.HOUR); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function log(u, t, k, a, b, c) { if (api._log) api._log(u, t, k, a, b, c); }
  function json(v, d) { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function setSetting(key, value, note) { if (store.find('settings', key)) store.update('settings', key, { value: value }); else store.append('settings', { key: key, value: value, note: note || '' }); }
  function mapLink(lat, lng) { return 'https://maps.google.com/?q=' + lat + ',' + lng; }
  function siteCoords(sites) { return Object.keys(sites).map(function (k) { return sites[k]; }).filter(function (s) { return s.lat !== '' && s.lat != null && !isNaN(Number(s.lat)) && Number(s.lat) && !s.external; }); }

  /* ---------- 1) حائط الكاميرات ---------- */
  function camsOn() { return BIO_isYes(st().CAMERAS_ENABLED); }
  function camOut(c, sites, cps) {
    var id = BIO_norm(c.siteId), s = sites[id], cp = cps[id];
    return { id: BIO_norm(c.id), name: c.name, siteId: id, siteName: c.siteName || (s ? s.name : cp ? cp.name : ''), sector: c.sector || (s ? s.sector : cp ? cp.sector : ''), gate: !!cp, kind: c.kind || 'لقطة متجددة (JPEG)', url: String(c.url || ''), appUrl: String(c.appUrl || ''), active: c.active === '' || c.active == null || BIO_isYes(c.active), order: num(c.order, 99) };
  }
  api.cams = function (pin) {
    var u = H.auth(pin, true), sites = H.sitesById(), cps = {};
    store.all('checkpoints').forEach(function (c) { cps[BIO_norm(c.id)] = c; });
    var list = (has('cameras') ? store.all('cameras') : []).map(function (c) { return camOut(c, sites, cps); }).filter(function (c) {
      if (!c.siteId || !u.scope || u.scope.all) return true;
      if (sites[c.siteId]) return H.inScope(u, c.siteId, sites);
      return u.scope.sectors.indexOf(c.sector) >= 0 || (cps[c.siteId] && BIO_list(cps[c.siteId].serves).some(function (x) { return H.inScope(u, x, sites); }));
    }).sort(function (a, b) { return a.order - b.order || String(a.id).localeCompare(String(b.id)); });
    var s = st();
    return { enabled: camsOn(), refresh: Math.max(2, num(s.CAM_REFRESH_SEC, 3)), approvedBy: s.CAMERAS_APPROVED_BY || '', approvedAt: s.CAMERAS_APPROVED_AT || '', cameras: list, canAdmin: !!u.isAdmin,
      places: Object.keys(cps).map(function (k) { return { id: k, name: cps[k].name, sector: cps[k].sector, gate: true }; }).concat(H.sitesList(sites).filter(function (x) { return !x.external; }).map(function (x) { return { id: x.id, name: x.name, sector: x.sector, gate: false }; })),
      kinds: ADMIN.cameras.fields[3].opts };
  };
  api.camSave = function (pin, r, orig) {
    var u = H.auth(pin, 'admin'); r = r || {};
    var id = BIO_norm(r.id) || BIO_norm(orig); if (!id) { var n = 1; do { id = 'CAM' + ('0' + n).slice(-2); n++; } while (store.find('cameras', id)); }
    var sites = H.sitesById(), cp = store.find('checkpoints', r.siteId), s = sites[BIO_norm(r.siteId)];
    if (!clean(r.name)) throw new Error('اكتب اسم الكاميرا');
    var url = clean(r.url, 500), app = clean(r.appUrl, 500);
    if (url && !/^https?:\/\//i.test(url)) throw new Error('رابط البث يجب أن يبدأ بـ https://');
    var row = { id: id, name: clean(r.name, 60), siteId: s ? s.id : cp ? BIO_norm(cp.id) : '', siteName: s ? s.name : cp ? cp.name : '', sector: s ? s.sector : cp ? cp.sector : '', kind: ADMIN.cameras.fields[3].opts.indexOf(r.kind) >= 0 ? r.kind : ADMIN.cameras.fields[3].opts[0], url: url, appUrl: app, active: r.active === false || r.active === BIO.NO ? BIO.NO : BIO.YES, order: num(r.order, 99) };
    var old = orig ? store.find('cameras', orig) : store.find('cameras', id);
    deps.lock(function () { if (old) store.update('cameras', old.id, row); else store.append('cameras', row); });
    log(u, 'cameras', id, old ? 'تعديل كاميرا' : 'إضافة كاميرا', old ? Object.assign({}, old) : null, row);
    return { ok: true, id: id };
  };
  api.camDelete = function (pin, id) {
    var u = H.auth(pin, 'admin'), c = store.find('cameras', id); if (!c) throw new Error('الكاميرا غير موجودة');
    deps.lock(function () { store.remove('cameras', id); }); log(u, 'cameras', id, 'حذف كاميرا', c, null);
    return { ok: true };
  };
  /** تفعيل ربط الكاميرات بعد اعتماد الإدارة (المدير العام فقط) */
  api.camEnable = function (pin, on, approval) {
    var u = H.auth(pin, 'admin');
    if (on && !clean(approval)) throw new Error('اكتب رقم أو مرجع موافقة الإدارة');
    deps.lock(function () {
      setSetting('CAMERAS_ENABLED', on ? BIO.YES : BIO.NO, 'ربط كاميرات المراقبة بالتطبيق. يُفعَّل بعد موافقة الإدارة');
      setSetting('CAMERAS_APPROVED_BY', on ? u.name + ' · ' + clean(approval, 80) : '', 'من فعّل ربط الكاميرات ومرجع موافقة الإدارة');
      setSetting('CAMERAS_APPROVED_AT', on ? BIO_fmtTime(deps.now()) : '', 'وقت تفعيل ربط الكاميرات');
    });
    log(u, 'settings', 'CAMERAS_ENABLED', on ? 'تفعيل ربط الكاميرات' : 'إيقاف ربط الكاميرات', null, { approval: approval });
    return { ok: true, enabled: !!on };
  };

  /* ---------- 2) رابط تتبع رحلة السائق ---------- */
  function canTrip(u) { return !!u && u.isManager && (u.isAdmin || BIO.ROLES_TRIP.indexOf(u.role) >= 0); }
  function trackUrl() { var s = st(); return String(s.TRACK_URL || 'https://abdelrahmanzaki2024-lgtm.github.io/biosecurity/').trim(); }
  function intlPhone(p) { var d = String(p || '').replace(/\D/g, ''); if (/^01\d{9}$/.test(d)) d = '2' + d; else if (/^1\d{9}$/.test(d)) d = '20' + d; return d; }
  function tripLink(token) { var b = trackUrl(); return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'p=trip&t=' + token; }
  function tripRows() { return has('trips') ? store.all('trips') : []; }
  function byToken(token) { token = String(token || '').replace(/[^a-z0-9]/gi, ''); if (token.length < 16) return null; return tripRows().filter(function (t) { return String(t.token) === token; })[0] || null; }
  function liveTrip(itemId) { var id = BIO_norm(itemId); return tripRows().filter(function (t) { return BIO_norm(t.itemId) === id && BIO.TRIP_LIVE.indexOf(t.status) >= 0; }).pop() || null; }
  function tripPts(id) {
    var pts = []; if (!has('tripPings')) return pts;
    store.all('tripPings').forEach(function (p) { if (String(p.tripId) === String(id)) pts = pts.concat(json(p.pts, [])); });
    pts.sort(function (a, b) { return a[0] - b[0]; });
    return pts;
  }
  function tripOut(t) {
    return { id: t.id, time: BIO_ms(t.time), itemId: BIO_norm(t.itemId), itemName: t.itemName, plate: String(t.plate || ''), driver: t.driver || '', phone: String(t.phone || ''), fromId: BIO_norm(t.fromId), fromName: t.fromName || '', toId: BIO_norm(t.toId), toName: t.toName || '',
      by: t.by || '', status: t.status, startedAt: BIO_ms(t.startedAt) || null, endedAt: BIO_ms(t.endedAt) || null, lastAt: BIO_ms(t.lastAt) || null, lastLat: num(t.lastLat, null), lastLng: num(t.lastLng, null), points: num(t.points, 0), km: num(t.km, 0), stops: num(t.stops, 0), alerts: json(t.alerts, []), note: t.note || '', live: BIO.TRIP_LIVE.indexOf(t.status) >= 0 };
  }
  /** تحليل المسار: المسافة، والتوقفات خارج مواقع الشركة، والمرور بمواقع شركة غير مدرجة في الرحلة */
  function analyse(t, pts, sites) {
    var s = st(), stopMin = Math.max(3, num(s.TRIP_STOP_MIN, 10)) * 60000, rad = Math.max(80, num(s.TRIP_STOP_RADIUS_M, 300)) / 1000;
    var known = siteCoords(sites), from = BIO_norm(t.fromId), to = BIO_norm(t.toId), km = 0, events = [];
    for (var i = 1; i < pts.length; i++) { var d = BIO_km([pts[i - 1][1], pts[i - 1][2]], [pts[i][1], pts[i][2]]); if (d < 5) km += d; }
    function nearSite(p, within) { var best = null; known.forEach(function (x) { var d = BIO_km([p[1], p[2]], [Number(x.lat), Number(x.lng)]); if (d <= within && (!best || d < best.d)) best = { s: x, d: d }; }); return best; }
    var i0 = 0;
    while (i0 < pts.length) {
      var j = i0 + 1, c = [pts[i0][1], pts[i0][2]];
      while (j < pts.length && BIO_km(c, [pts[j][1], pts[j][2]]) <= rad) j++;
      var dur = pts[j - 1][0] - pts[i0][0];
      if (dur >= stopMin) {
        var lat = 0, lng = 0; for (var k = i0; k < j; k++) { lat += pts[k][1]; lng += pts[k][2]; } lat /= (j - i0); lng /= (j - i0);
        var ns = nearSite([0, lat, lng], 1.2), open = j >= pts.length;
        if (!ns) events.push({ kind: 'stop', at: pts[i0][0], until: pts[j - 1][0], min: Math.round(dur / 60000), lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, open: open, title: 'توقف ' + Math.round(dur / 60000) + ' دقيقة خارج مواقع الشركة' });
        else if (ns.s.id !== from && ns.s.id !== to) events.push({ kind: 'site', at: pts[i0][0], until: pts[j - 1][0], min: Math.round(dur / 60000), lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, siteId: ns.s.id, open: open, title: 'توقف ' + Math.round(dur / 60000) + ' دقيقة عند «' + ns.s.name + '» وهو ليس ضمن خط سير الرحلة' });
      }
      i0 = j;
    }
    return { km: Math.round(km * 10) / 10, events: events };
  }
  api.tripStart = function (pin, r) {
    var u = H.auth(pin, true); r = r || {};
    if (!canTrip(u)) throw new Error('إرسال رابط التتبع متاح للمشرف والمسؤول والمدير فقط');
    var it = H.itemInfo(store.find('items', BIO_norm(r.itemId)));
    if (!it || it.kind !== 'مركبة') throw new Error('اختر المركبة');
    var sites = H.sitesById(), from = sites[BIO_norm(r.fromId)] || null, to = sites[BIO_norm(r.toId)] || null;
    if (!to) throw new Error('اختر وجهة الرحلة');
    if (!H.inScope(u, to.id, sites) && !(from && H.inScope(u, from.id, sites))) throw new Error('الرحلة خارج نطاق إدارتك');
    var phone = intlPhone(r.phone || it.phone), now = deps.now();
    var old = liveTrip(it.id);
    if (old) store.update('trips', old.id, { status: 'أُلغيت (رابط أحدث)', endedAt: now });
    var token = 't' + (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + now.toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 27);
    var row = { id: deps.id('TR'), time: now, itemId: it.id, itemName: it.name, plate: it.plate || '', driver: clean(r.driver, 60), phone: phone, fromId: from ? from.id : '', fromName: from ? from.name : '', toId: to.id, toName: to.name, token: token, by: u.name, byId: u.id, status: 'بانتظار السائق', startedAt: '', endedAt: '', lastAt: '', lastLat: '', lastLng: '', points: 0, km: 0, stops: 0, alerts: '[]', note: clean(r.note, 200) };
    deps.lock(function () { store.append('trips', row); });
    log(u, 'trips', row.id, 'إرسال رابط تتبع رحلة', null, { itemId: it.id, to: to.name });
    var link = tripLink(token);
    var msg = '🚚 ' + (st().COMPANY || 'الأمن الحيوي') + ': رابط تتبع رحلتك\nالمركبة: ' + it.name + (it.plate ? ' (' + it.plate + ')' : '') + '\n' + (from ? 'من: ' + from.name + '\n' : '') + 'إلى: ' + to.name +
      '\n\nافتح الرابط واضغط «ابدأ الرحلة» واترك الصفحة مفتوحة حتى تصل للبوابة:\n' + link + '\n\nممنوع التوقف عند أي مزرعة دواجن أو سوق طيور أو مجزر أثناء الرحلة.';
    return { ok: true, trip: tripOut(row), link: link, phone: phone, message: msg };
  };
  api.tripInfo = function (token) {
    var t = byToken(token); if (!t) throw new Error('رابط التتبع غير صحيح أو انتهت صلاحيته');
    var o = tripOut(t), sites = H.sitesById(), s = st();
    if (!o.live && o.endedAt && deps.now() - o.endedAt > 6 * BIO.HOUR) throw new Error('انتهت هذه الرحلة. اطلب رابطاً جديداً من المشرف');
    var pick = function (id) { var x = sites[id]; return x ? { id: x.id, name: x.name, lat: num(x.lat, null), lng: num(x.lng, null) } : null; };
    return { trip: { id: o.id, itemName: o.itemName, plate: o.plate, driver: o.driver, fromName: o.fromName, toName: o.toName, status: o.status, live: o.live, startedAt: o.startedAt, endedAt: o.endedAt, points: o.points, km: o.km, by: o.by }, from: pick(o.fromId), to: pick(o.toId), company: s.COMPANY || '', every: Math.max(30, num(s.TRIP_PING_SEC, 60)), stopMin: num(s.TRIP_STOP_MIN, 10) };
  };
  api.tripPing = function (token, pts, ended) {
    var t = byToken(token); if (!t) throw new Error('رابط التتبع غير صحيح');
    var now = deps.now(), created = BIO_ms(t.time);
    if (BIO.TRIP_LIVE.indexOf(t.status) < 0) return { ok: true, ended: true, status: t.status };
    if (now - created > 3 * D) { store.update('trips', t.id, { status: 'انتهت صلاحية الرابط', endedAt: now }); return { ok: true, ended: true, status: 'انتهت صلاحية الرابط' }; }
    var clean_ = (Array.isArray(pts) ? pts : []).slice(0, 400).map(function (p) { return [Math.round(num(p[0], 0)), Math.round(num(p[1], 0) * 1e6) / 1e6, Math.round(num(p[2], 0) * 1e6) / 1e6, Math.round(num(p[3], 0))]; })
      .filter(function (p) { return p[0] >= created - 10 * 60000 && p[0] <= now + 5 * 60000 && Math.abs(p[1]) <= 90 && Math.abs(p[2]) <= 180 && (p[1] || p[2]) && p[3] < 2000; });
    var sites = H.sitesById();
    return deps.lock(function () {
      if (clean_.length) store.append('tripPings', { id: deps.id('TP'), tripId: t.id, time: now, pts: JSON.stringify(clean_) });
      var all = tripPts(t.id), a = analyse(t, all, sites), prev = json(t.alerts, []), seen = {}, fresh = [];
      prev.forEach(function (e) { seen[e.kind + ':' + e.at] = e; });
      a.events.forEach(function (e) { var k = e.kind + ':' + e.at; if (!seen[k]) { fresh.push(e); prev.push(e); } else Object.assign(seen[k], { until: e.until, min: e.min, open: e.open, title: e.title }); });
      var last = all[all.length - 1], patch = { status: ended ? 'انتهت (أنهاها السائق)' : all.length ? 'جارية' : t.status, points: all.length, km: a.km, stops: prev.length, alerts: JSON.stringify(prev.slice(-40)) };
      if (all.length && !t.startedAt) patch.startedAt = all[0][0];
      if (last) { patch.lastAt = last[0]; patch.lastLat = last[1]; patch.lastLng = last[2]; }
      if (ended) patch.endedAt = now;
      store.update('trips', t.id, patch);
      fresh.forEach(function (e) {
        deps.notify({ kind: 'trip', siteId: BIO_norm(t.toId), title: '🚚 ' + (e.kind === 'site' ? 'مرور غير مخطط: ' : 'توقف أثناء الرحلة: ') + t.itemName, body: e.title + '\nالرحلة: ' + (t.fromName ? t.fromName + ' ← ' : '') + t.toName + (t.driver ? '\nالسائق: ' + t.driver : '') + '\nالمكان على الخريطة: ' + mapLink(e.lat, e.lng) + H.appUrl('#trips/' + t.id) });
      });
      return { ok: true, status: patch.status, points: all.length, km: a.km, stops: prev.length, ended: !!ended };
    });
  };
  /** الرحلة الجارية: يُعاد حساب المسافة والتوقفات من النقاط عند العرض */
  function liveCalc(t, sites) {
    if (BIO.TRIP_LIVE.indexOf(t.status) < 0 || !num(t.points, 0)) return t;
    var a = analyse(t, tripPts(t.id), sites), prev = json(t.alerts, []), seen = {};
    prev.forEach(function (e) { seen[e.kind + ':' + e.at] = 1; });
    a.events.forEach(function (e) { if (!seen[e.kind + ':' + e.at]) prev.push(e); });
    return Object.assign({}, t, { km: a.km, stops: prev.length, alerts: JSON.stringify(prev) });
  }
  api.trips = function (pin, days) {
    var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(); days = Math.min(60, num(days, 7));
    var list = tripRows().map(function (t) { return tripOut(liveCalc(t, sites)); }).filter(function (t) { return (t.live || t.time >= now - days * D) && (H.inScope(u, t.toId, sites) || (t.fromId && H.inScope(u, t.fromId, sites))); }).sort(function (a, b) { return (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.time - a.time; });
    var veh = store.all('items').map(H.itemInfo).filter(function (i) { return i && i.kind === 'مركبة' && i.active; }).map(function (i) { return { id: i.id, name: i.name, plate: i.plate, vtype: i.vtype, track: i.track, phone: i.phone, live: !!liveTrip(i.id) }; });
    return { now: now, list: list, vehicles: veh, canTrip: canTrip(u), totals: { live: list.filter(function (t) { return t.live; }).length, flagged: list.filter(function (t) { return t.stops; }).length, required: veh.filter(function (v) { return v.track; }).length, km: Math.round(list.reduce(function (a, t) { return a + t.km; }, 0)) },
      sites: H.sitesList(sites).filter(function (s) { return !s.external; }).map(function (s) { return { id: s.id, name: s.name, sector: s.sector }; }), stopMin: num(st().TRIP_STOP_MIN, 10) };
  };
  api.tripDetail = function (pin, id) {
    var u = H.auth(pin, true), t = store.find('trips', id); if (!t) throw new Error('الرحلة غير موجودة');
    var sites = H.sitesById(), o = tripOut(liveCalc(t, sites));
    o.pts = tripPts(t.id).map(function (p) { return [p[0], p[1], p[2]]; });
    o.sites = siteCoords(sites).map(function (s) { return { id: s.id, name: s.name, lat: Number(s.lat), lng: Number(s.lng), on: s.id === o.fromId || s.id === o.toId }; });
    o.link = o.live ? tripLink(t.token) : '';
    o.canTrip = canTrip(u);
    return o;
  };
  api.tripStop = function (pin, id) {
    var u = H.auth(pin, true); if (!canTrip(u)) throw new Error('غير مسموح');
    var t = store.find('trips', id); if (!t) throw new Error('الرحلة غير موجودة');
    store.update('trips', t.id, { status: 'أُوقفت بواسطة ' + u.name, endedAt: deps.now() });
    return { ok: true };
  };
  api.setTrack = function (pin, itemId, on) {
    var u = H.auth(pin, true); if (!canTrip(u)) throw new Error('تحديد المركبات المتتبعة متاح للمشرف والمسؤول والمدير فقط');
    var it = store.find('items', BIO_norm(itemId)); if (!it || it.kind !== 'مركبة') throw new Error('المركبة غير موجودة');
    store.update('items', it.id, { track: on ? BIO.YES : '' }); log(u, 'items', it.id, on ? 'تفعيل تتبع الرحلات' : 'إلغاء تتبع الرحلات', null, null);
    return { ok: true, track: !!on };
  };
  var fleet13 = api.fleet;
  api.fleet = function (pin, days) {
    var d = fleet13(pin, days), u = H.auth(pin, true), tr = {};
    d.canTrip = canTrip(u);
    store.all('items').forEach(function (i) { if (BIO_isYes(i.track)) tr[BIO_norm(i.id)] = 1; });
    d.list.forEach(function (v) { v.trackReq = !!tr[v.id]; var lt = liveTrip(v.id); v.trip = lt ? { id: lt.id, status: lt.status, toName: lt.toName, stops: num(lt.stops, 0) } : null; });
    return d;
  };

  /* ---------- 3) إقرار الأمن الحيوي مع المأمورية أو الزيارة ---------- */
  /** يقارن إقرار الشخص بسجل حركته الفعلي ويقيّم الخطورة */
  function declCheck(itemId, d, visitAt, sites) {
    var now = deps.now(), flags = [], risk = 0, why = [];
    var farm = BIO.DECL_FARMS.indexOf(d.lastFarm) >= 0 ? d.lastFarm : 'لا توجد', farmAt = BIO_ms(d.lastFarmAt) || 0;
    if (farm !== 'لا توجد') {
      var hrs = farmAt ? (visitAt - farmAt) / BIO.HOUR : 0;
      if (!farmAt || hrs < 72) { risk = Math.max(risk, 3); why.push('مخالطة «' + farm + '» ' + (farmAt ? 'قبل الزيارة بـ ' + Math.max(0, Math.round(hrs)) + ' ساعة' : 'دون تاريخ') + ' (أقل من 72 ساعة)'); }
      else { risk = Math.max(risk, 1); why.push('مخالطة «' + farm + '» قبل الزيارة بـ ' + Math.round(hrs / 24) + ' يوم'); }
    }
    if (d.birds72) { risk = Math.max(risk, 3); why.push('تعامل مع طيور حية أو نافقة خارج الشركة خلال 72 ساعة'); }
    if (d.sick) { risk = Math.max(risk, 3); why.push('لاحظ نفوقاً أو أعراضاً غير طبيعية في مكان زاره'); }
    if (d.home) { risk = Math.max(risk, 2); why.push('يربي طيوراً في منزله'); }
    var mv = itemId ? H.movesOf(itemId).filter(function (m) { return BIO_ms(m.time) <= now && BIO_ms(m.time) >= now - 14 * D; }) : [];
    var lastIn = mv.filter(function (m) { return m.dir === BIO.IN && BIO_counted(m) && sites[BIO_norm(m.siteId)] && !sites[BIO_norm(m.siteId)].external; }).pop();
    var decSite = BIO_norm(d.lastSite), decAt = BIO_ms(d.lastSiteAt) || 0;
    if (lastIn) {
      var real = sites[BIO_norm(lastIn.siteId)], ra = BIO_ms(lastIn.time);
      if (!decSite) flags.push('أقر بعدم دخول أي موقع للشركة خلال 14 يوماً، بينما سجله يُظهر دخوله «' + real.name + '» يوم ' + BIO_fmtTime(ra));
      else if (decSite !== real.id && sites[decSite] && Number(sites[decSite].level) !== Number(real.level)) flags.push('أقر أن آخر موقع دخله «' + sites[decSite].name + '» بينما السجل يُظهر «' + real.name + '» يوم ' + BIO_fmtTime(ra));
      else if (decSite === real.id && decAt && Math.abs(decAt - ra) > 36 * BIO.HOUR) flags.push('تاريخ آخر دخول لـ«' + real.name + '» في الإقرار يختلف عن السجل (' + BIO_fmtTime(ra) + ')');
    }
    var ext = mv.filter(function (m) { return m.dir === BIO.EXT && BIO_ms(m.time) >= now - 3 * D; }).pop();
    if (ext && farm === 'لا توجد' && !d.birds72) flags.push('سجل الخروج يُظهر توجهه إلى «' + ext.siteName + '» يوم ' + BIO_fmtTime(BIO_ms(ext.time)) + ' ولم يذكره في الإقرار');
    if (flags.length) risk = Math.max(risk, 2);
    var lv = risk >= 3 ? 'عالي' : risk >= 2 ? 'متوسط' : 'منخفض';
    return { risk: lv, why: why, flags: flags, farm: farm, farmAt: farmAt };
  }
  function readDecl(m) {
    var d = m && m.decl && typeof m.decl === 'object' ? m.decl : null;
    if (!d) return null;
    return { lastFarm: clean(d.lastFarm, 40), lastFarmAt: BIO_ms(d.lastFarmAt) || null, birds72: !!d.birds72, home: !!d.home, sick: !!d.sick, lastSite: BIO_norm(d.lastSite), lastSiteAt: BIO_ms(d.lastSiteAt) || null, agree: !!d.agree };
  }
  function withDecl(base, needAgree) {
    return function () {
      var args = Array.prototype.slice.call(arguments), m = args[args.length - 1] || {}, d = readDecl(m);
      if (!d) throw new Error('أكمل إقرار الأمن الحيوي قبل الإرسال');
      if (needAgree && !d.agree) throw new Error('يجب الموافقة على صحة الإقرار قبل الإرسال');
      m.lastContact = d.lastFarm; m.lastContactAt = d.lastFarmAt;
      var res = base.apply(null, args);
      if (!res || res.duplicate || !res.mission) return res;
      var ms = res.mission, sites = H.sitesById(), c = declCheck(ms.itemId, d, ms.visitAt, sites);
      var patch = { decl: JSON.stringify(Object.assign({}, d, { at: deps.now() })), declRisk: c.risk, declFlag: c.flags.join(' | ') };
      store.update('missions', ms.id, patch);
      Object.assign(ms, patch);
      if (c.flags.length || c.risk === 'عالي') {
        deps.notify({ kind: 'mission', siteId: ms.siteId, title: (c.flags.length ? '🧾 إقرار غير مطابق للسجل: ' : '🧾 إقرار عالي الخطورة: ') + ms.visitor + ' ← ' + ms.siteName,
          body: c.flags.concat(c.why).join('\n') + '\nالمأمورية: ' + ms.id + ' · موعدها ' + BIO_fmtTime(ms.visitAt) + H.appUrl('#missions') });
      }
      res.decl = { risk: c.risk, why: c.why, flags: c.flags };
      return res;
    };
  }
  api.createMission = withDecl(api.createMission, true);
  api.selfMission = withDecl(api.selfMission, true);
  api.declOptions = function () { return { farms: BIO.DECL_FARMS }; };
  /** على البوابة: إقرار غير مطابق أو عالي الخطورة يظهر للحارس، ويمنع الدخول إن فُعّل DECL_BLOCK */
  var gate13 = api._gateChecks;
  api._gateChecks = function (item, site, t, s, res) {
    if (gate13) gate13(item, site, t, s, res);
    var ms = store.all('missions').filter(function (m) { return BIO_norm(m.itemId) === item.id && BIO_norm(m.siteId) === site.id && BIO_ms(m.visitAt) - 2 * BIO.HOUR <= t && (BIO_ms(m.endAt) || BIO_ms(m.visitAt) + 10 * BIO.HOUR) >= t; }).pop();
    if (ms && (ms.declFlag || ms.declRisk === 'عالي')) {
      var approved = ms.status === BIO.MS_EXC || /إقرار/.test(String(ms.note || ''));
      if (ms.declFlag) res.warnings.unshift('🧾 إقرار غير مطابق للسجل: ' + ms.declFlag);
      if (ms.declRisk === 'عالي') res.warnings.unshift('🧾 إقرار عالي الخطورة' + (approved ? ' (راجعه المدير)' : '') + ': تحقق من الاستحمام وتغيير الملابس بدقة');
      if (BIO_isYes(s.DECL_BLOCK) && ms.declRisk === 'عالي' && !approved && res.decision === BIO.ALLOW) { res.decision = BIO.DENY; res.reasons.unshift('إقرار الأمن الحيوي عالي الخطورة ولم يعتمده المدير بعد'); }
    }
    // المركبة القادمة برابط تتبع: ملخص الرحلة للحارس وإنهاؤها عند الوصول
    if (item.kind === 'مركبة') {
      var lt = liveTrip(item.id);
      if (lt) {
        lt = liveCalc(lt, H.sitesById());
        var al = json(lt.alerts, []);
        res.warnings.unshift('🚚 رحلة متتبعة' + (lt.fromName ? ' من «' + lt.fromName + '»' : '') + ': ' + num(lt.km, 0) + ' كم' + (al.length ? ' · ' + al.length + ' توقف خارج خط السير: ' + al.map(function (e) { return e.title; }).join('، ') : ' دون توقفات خارج المواقع'));
        if (lt.status === 'بانتظار السائق') res.warnings.unshift('🚚 أُرسل للسائق رابط تتبع ولم يفتحه: لا يوجد مسار مسجل لهذه الرحلة');
        store.update('trips', lt.id, { status: 'وصلت' + (BIO_norm(lt.toId) === site.id ? '' : ' إلى موقع آخر: ' + site.name), endedAt: t });
      }
    }
  };
  var scan13 = api.scan;
  api.scan = function (pin, p) {
    var r = scan13(pin, p);
    if (r && r.dir === 'OUT' && r.item && r.item.kind === 'مركبة' && r.item.track && !p.offline) {
      var lt = liveTrip(r.item.id);
      if (!lt) {
        r.warnings = (r.warnings || []).concat(['🚚 هذه المركبة تتطلب رابط تتبع رحلة: تم إبلاغ المشرف لإرساله للسائق']);
        r.tripNeeded = true;
        deps.notify({ kind: 'trip', siteId: r.site.id, title: '🚚 مركبة خرجت وتحتاج رابط تتبع: ' + r.item.name, body: r.item.name + (r.item.plate ? ' (' + r.item.plate + ')' : '') + '\nخرجت من «' + r.site.name + '»' + (r.dest ? ' إلى ' + r.dest : '') + '\nأرسل رابط التتبع للسائق من شاشة رحلات المركبات' + H.appUrl('#trips') });
      } else r.warnings = (r.warnings || []).concat(['🚚 رابط التتبع مُرسل للسائق: الرحلة ' + lt.status + ' إلى «' + lt.toName + '»']);
    }
    return r;
  };

  /* ---------- 4) البلاغ والرسالة الصوتية ---------- */
  function keepVoice(v, name) {
    if (!v || !/^data:audio\//i.test(v)) return '';
    if (String(v).length > 2600000) throw new Error('الرسالة الصوتية أطول من المسموح (دقيقتان)');
    return deps.saveVoice ? deps.saveVoice(v, name) : v;
  }
  var report13 = api.report;
  api.report = function (pin, r) {
    r = Object.assign({}, r || {});
    var voice = r.voice; delete r.voice;
    if (voice && r.id && store.find('reports', r.id)) return report13(pin, r);
    var url = voice ? keepVoice(voice, 'بلاغ صوتي ' + (r.id || '')) : '';
    if (url) r.note = (r.note ? r.note + '\n' : '') + '🎤 مرفق رسالة صوتية: افتح البلاغ لسماعها';
    var res = report13(pin, r);
    if (url && res && res.id && !res.duplicate) store.update('reports', res.id, { voice: url });
    return res;
  };
  var send13 = api.sendMessage;
  api.sendMessage = function (pin, m) {
    m = Object.assign({}, m || {});
    var voice = m.voice; delete m.voice;
    if (m.id && store.find('messages', m.id)) return { id: m.id, duplicate: true };
    var url = voice ? keepVoice(voice, 'رسالة صوتية ' + (m.id || '')) : '';
    if (url && !String(m.text || '').trim()) m.text = '🎤 رسالة صوتية';
    var res = send13(pin, m);
    if (url && res && res.id) store.update('messages', res.id, { voice: url });
    return res;
  };

  /* ---------- 5) الإنذار المبكر من النافق اليومي ---------- */
  function ewsCfg() { var s = st(); return { watch: num(s.EWS_WATCH, 1.5), alert: num(s.EWS_ALERT, 2), crit: num(s.EWS_CRIT, 3), min: num(s.EWS_MIN_DEAD, 15), pW: num(s.EWS_PCT_WATCH, 0.1), pA: num(s.EWS_PCT_ALERT, 0.2), pC: num(s.EWS_PCT_CRIT, 0.4) }; }
  function lastPhase(siteId) {
    if (!has('phases')) return null;
    var r = store.all('phases').filter(function (p) { return BIO_norm(p.siteId) === siteId; }).sort(function (a, b) { return BIO_ms(a.startAt || a.time) - BIO_ms(b.startAt || b.time); });
    var birds = 0, flockAt = 0, last = r[r.length - 1] || null;
    r.forEach(function (p) { if (num(p.birds, 0)) birds = num(p.birds, 0); if (BIO_ms(p.flockAt)) flockAt = BIO_ms(p.flockAt); if (/تحميل سبلة|تجهيز وتطهير|فترة راحة/.test(String(p.phase))) { birds = 0; flockAt = 0; } });
    // v15: آخر يوم في ملف بيانات المزارع (خلال 3 أيام) أدق من التسجيل اليدوي للعدد والعمر
    var dl = dailyLast(siteId);
    if (dl && dl.t >= day0(deps.now()) - 3 * D) { if (dl.stock > 0) birds = dl.stock + dl.dead; if (dl.age > 0) flockAt = dl.t - (dl.age - 1) * D; }
    return { phase: last ? String(last.phase) : '', birds: birds, flockAt: flockAt };
  }
  /** v15: يوم البيانات «YYYY-MM-DD» (نص أو تاريخ من الشيت) → بداية اليوم بتوقيت القاهرة */
  function dayT(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v == null ? '' : v));
    if (m && typeof v === 'string') return Date.UTC(+m[1], +m[2] - 1, +m[3]) - 3 * BIO.HOUR;
    var t = BIO_ms(v); return t ? day0(t + 3 * BIO.HOUR) : 0;
  }
  function dailyRows() { return has('daily') ? store.all('daily') : []; }
  function dailyDead(x) { return num(x.dead, 0) + num(x.killed, 0) + num(x.inj, 0); }
  function dailyLast(siteId) {
    var best = null;
    dailyRows().forEach(function (x) { if (BIO_norm(x.siteId) !== siteId) return; var t = dayT(x.day); if (t && (!best || t > best.t)) best = { t: t, stock: num(x.stock, 0), dead: dailyDead(x), age: num(x.age, 0), status: String(x.status || '') }; });
    return best;
  }
  function series(siteIds, days, now) {
    var t0 = day0(now) - (days - 1) * D, out = {};
    siteIds.forEach(function (id) { out[id] = { dead: new Array(days).fill(0), rec: new Array(days).fill(false), file: new Array(days).fill(false) }; });
    // ملف البيانات اليومي هو المرجع لليوم الذي ورد فيه؛ سجل النافق اليدوي يُكمل الأيام التي لم ترد في الملف
    dailyRows().forEach(function (x) {
      var id = BIO_norm(x.siteId), i = Math.round((dayT(x.day) - t0) / D);
      if (!out[id] || i < 0 || i >= days) return;
      out[id].dead[i] = dailyDead(x); out[id].rec[i] = true; out[id].file[i] = true;
    });
    store.all('disposal').forEach(function (x) {
      if (x.kind !== 'نافق') return;
      var id = BIO_norm(x.siteId), t = BIO_ms(x.time), i = Math.floor((t - t0) / D);
      if (!out[id] || i < 0 || i >= days || out[id].file[i]) return;
      out[id].dead[i] += num(x.count, 0); out[id].rec[i] = true;
    });
    return out;
  }
  function judge(dead, hist, birds, cfg, age) {
    // أول أسبوع من عمر الكتاكيت نفوقه الطبيعي أعلى: حدود نسبة القطيع تتضاعف حتى لا يصدر إنذار كاذب
    if (age && age <= 7) cfg = Object.assign({}, cfg, { pW: cfg.pW * 2, pA: cfg.pA * 2, pC: cfg.pC * 2 });
    var past = hist.filter(function (v, i) { return v != null; });
    var base = past.length >= 3 ? past.reduce(function (a, b) { return a + b; }, 0) / past.length : null;
    var ratio = base != null ? dead / Math.max(base, 1) : null, pct = birds ? dead / birds * 100 : null, lv = 0, why = [];
    var big = dead >= cfg.min;
    if (big && ratio != null) {
      if (ratio >= cfg.crit) { lv = 3; why.push('النافق ' + (Math.round(ratio * 10) / 10) + ' أضعاف المعدل المعتاد'); }
      else if (ratio >= cfg.alert) { lv = 2; why.push('النافق ' + (Math.round(ratio * 10) / 10) + ' ضعف المعدل المعتاد'); }
      else if (ratio >= cfg.watch) { lv = 1; why.push('النافق أعلى من المعتاد بـ ' + Math.round((ratio - 1) * 100) + '%'); }
    }
    if (pct != null) {
      var p = Math.round(pct * 100) / 100;
      if (pct >= cfg.pC) { lv = Math.max(lv, 3); why.push('نسبة نفوق يومية ' + p + '% من القطيع'); }
      else if (pct >= cfg.pA) { lv = Math.max(lv, 2); why.push('نسبة نفوق يومية ' + p + '% من القطيع'); }
      else if (pct >= cfg.pW) { lv = Math.max(lv, 1); why.push('نسبة نفوق يومية ' + p + '% من القطيع'); }
    }
    var h = past.slice(-2);
    if (big && h.length === 2 && h[0] != null && h[1] != null && h[1] > h[0] * 1.1 && dead > h[1] * 1.1) { lv = Math.max(lv, 1); why.push('ارتفاع متتالٍ 3 أيام'); }
    return { level: BIO.EWS_LEVELS[lv].k, n: lv, base: base == null ? null : Math.round(base * 10) / 10, ratio: ratio == null ? null : Math.round(ratio * 100) / 100, pct: pct == null ? null : Math.round(pct * 1000) / 1000, why: why };
  }
  function evalSite(siteId, now) {
    var cfg = ewsCfg(), s = series([siteId], 8, now)[siteId], ph = lastPhase(siteId) || {};
    // أيام ما قبل تسكين الدورة الحالية لا تدخل في المعدل (نافق نهاية الدورة السابقة لا يُقارن بكتاكيت عمر يوم)
    var fl = ph.flockAt ? day0(ph.flockAt) : 0;
    var hist = s.dead.slice(0, 7).map(function (v, i) { return s.rec[i] && day0(now) - (7 - i) * D >= fl ? v : null; });
    var age = ph.flockAt ? Math.floor((day0(now) - day0(ph.flockAt)) / D) + 1 : 0;
    return Object.assign(judge(s.dead[7], hist, ph.birds, cfg, age), { dead: s.dead[7] });
  }
  function ewsRows() { return has('ews') ? store.all('ews') : []; }
  function ewsOut(r) { return { id: r.id, time: BIO_ms(r.time), day: String(r.day), siteId: BIO_norm(r.siteId), siteName: r.siteName, dead: num(r.dead, 0), base: num(r.base, null), ratio: num(r.ratio, null), pct: num(r.pct, null), level: r.level, why: String(r.why || ''), status: r.status || 'جديد', action: r.action || '', by: r.by || '', at: BIO_ms(r.at) || null }; }
  /** يُستدعى بعد كل تسجيل نافق: يقارن بالمعدل ويرسل الإنذار مرة واحدة لكل مستوى في اليوم */
  function ewsFire(siteId, now) {
    var sites = H.sitesById(), site = sites[siteId]; if (!site) return null;
    var j = evalSite(siteId, now); if (j.n < 2) return j;
    var dk = dayKey(now), prev = ewsRows().filter(function (r) { return BIO_norm(r.siteId) === siteId && String(r.day) === dk; });
    var top = prev.reduce(function (a, r) { var l = BIO.EWS_LEVELS.filter(function (x) { return x.k === r.level; })[0]; return Math.max(a, l ? l.n : 0); }, 0);
    if (top >= j.n) { var cur = prev[prev.length - 1]; store.update('ews', cur.id, { dead: j.dead, ratio: j.ratio == null ? '' : j.ratio, pct: j.pct == null ? '' : j.pct }); return Object.assign(j, { id: cur.id }); }
    var row = { id: deps.id('EW'), time: now, day: dk, siteId: siteId, siteName: site.name, dead: j.dead, base: j.base == null ? '' : j.base, ratio: j.ratio == null ? '' : j.ratio, pct: j.pct == null ? '' : j.pct, level: j.level, why: j.why.join(' · '), status: 'جديد', action: '', by: '', at: '' };
    store.append('ews', row);
    deps.notify({ kind: 'ews', siteId: siteId, title: (j.n >= 3 ? '🔴 إنذار مبكر حرج: ' : '🟠 إنذار مبكر: ') + 'نفوق مرتفع في ' + site.name,
      body: 'نافق اليوم: ' + j.dead + (j.base != null ? ' · المعدل المعتاد ' + j.base : '') + '\n' + j.why.join('\n') + '\n\nالإجراءات المقترحة: زيارة الطبيب البيطري فوراً، أخذ عينات للمعمل، رفع الإنذار على الموقع ومنع الزيارات غير الضرورية، ومراجعة من دخل الموقع آخر 72 ساعة.' + H.appUrl('#ews') });
    return Object.assign(j, { id: row.id, fired: true });
  }
  var disp13 = api.disposalAdd;
  api.disposalAdd = function (pin, r) {
    // تنبيه «نفوق مرتفع» القديم يُؤجَّل: إن أطلق الإنذار المبكر تنبيهه لا يُرسل الاثنان معاً
    var held = [], notify0 = deps.notify, res;
    deps.notify = function (e) { if (e && e.kind === 'mortality') held.push(e); else notify0(e); };
    try { res = disp13(pin, r); } finally { deps.notify = notify0; }
    var e = null;
    if (res && res.ok && !res.duplicate && r && r.kind === 'نافق') {
      e = ewsFire(BIO_norm(r.siteId), deps.now());
      if (e && e.n >= 1) res.ews = { level: e.level, n: e.n, why: e.why, dead: e.dead, base: e.base, id: e.id || '' };
    }
    if (!(e && e.n >= 2)) held.forEach(function (x) { notify0(x); });
    return res;
  };
  api._ewsFire = ewsFire;
  api._dayT = dayT;
  api.ews = function (pin) {
    var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(), cfg = ewsCfg(), N = 14;
    var list = H.sitesList(sites).filter(function (s) { return !s.external && H.inScope(u, s.id, sites) && (BIO_isCycleSite(s) || Number(s.level) <= 2); });
    var ser = series(list.map(function (s) { return s.id; }), N + 7, now);
    var rows = list.map(function (s) {
      var x = ser[s.id], ph = lastPhase(s.id) || {}, days = [];
      var ageAt = function (i) { return ph.flockAt ? Math.floor((day0(now) - (N + 6 - i) * D - day0(ph.flockAt)) / D) + 1 : 0; };
      var fl = ph.flockAt ? day0(ph.flockAt) : 0, inCyc = function (j) { return day0(now) - (N + 6 - j) * D >= fl; };
      for (var i = 7; i < N + 7; i++) { var hist = x.dead.slice(i - 7, i).map(function (v, k) { return x.rec[i - 7 + k] && inCyc(i - 7 + k) ? v : null; }); var j = judge(x.dead[i], hist, ph.birds, cfg, ageAt(i)); days.push({ dead: x.dead[i], rec: x.rec[i], n: x.rec[i] ? j.n : 0, base: j.base }); }
      var today = days[N - 1], hist7 = x.dead.slice(N - 1, N + 6).map(function (v, k) { return x.rec[N - 1 + k] && inCyc(N - 1 + k) ? v : null; }), j = judge(today.dead, hist7, ph.birds, cfg, ageAt(N + 6));
      var growing = /تربية|استقبال|بيع/.test(String(ph.phase || '')) || (!ph.phase && BIO_isCycleSite(s));
      return { id: s.id, name: s.name, sector: s.sector, level: Number(s.level), status: s.status, phase: ph.phase || '', birds: ph.birds || 0, age: ph.flockAt ? Math.max(1, Math.floor((now - ph.flockAt) / D) + 1) : null, days: days, today: today.dead, recToday: today.rec, base: j.base, ratio: j.ratio, pct: j.pct, n: j.n, levelName: j.level, why: j.why, missing: growing && !today.rec, week: x.dead.slice(N + 0, N + 7).reduce(function (a, b) { return a + b; }, 0) };
    }).sort(function (a, b) { return b.n - a.n || (b.ratio || 0) - (a.ratio || 0) || a.name.localeCompare(b.name); });
    var alerts = ewsRows().map(ewsOut).filter(function (a) { return a.time >= now - 7 * D && H.inScope(u, a.siteId, sites); }).sort(function (a, b) { return b.time - a.time; });
    var counts = { watch: rows.filter(function (r) { return r.n === 1; }).length, alert: rows.filter(function (r) { return r.n === 2; }).length, crit: rows.filter(function (r) { return r.n >= 3; }).length, missing: rows.filter(function (r) { return r.missing; }).length, open: alerts.filter(function (a) { return a.status === 'جديد' || a.status === 'قيد المتابعة'; }).length };
    return { now: now, rows: rows, alerts: alerts, counts: counts, cfg: cfg, acts: BIO.EWS_ACTS, canSites: u.perms.indexOf('sites') >= 0, deadToday: rows.reduce(function (a, r) { return a + r.today; }, 0) };
  };
  api.ewsAct = function (pin, id, act, note) {
    var u = H.auth(pin, true), r = store.find('ews', id); if (!r) throw new Error('الإنذار غير موجود');
    if (BIO.EWS_ACTS.indexOf(act) < 0) throw new Error('إجراء غير معروف');
    if (act === 'رفع إنذار على الموقع') api.setSiteStatus(pin, r.siteId, BIO.ST_ALERT, 'إنذار مبكر: نفوق مرتفع' + (note ? ' · ' + note : ''));
    if (act === 'إغلاق الموقع') api.setSiteStatus(pin, r.siteId, BIO.ST_CLOSED, 'إنذار مبكر: نفوق مرتفع' + (note ? ' · ' + note : ''));
    var status = act === 'تم الاحتواء' ? 'مغلق: تم الاحتواء' : act === 'إنذار غير صحيح' ? 'مغلق: إنذار غير صحيح' : 'قيد المتابعة';
    var line = act + (note ? ': ' + clean(note, 200) : '') + ' · ' + u.name;
    store.update('ews', r.id, { status: status, action: (r.action ? r.action + '\n' : '') + line, by: u.name, at: deps.now() });
    log(u, 'ews', r.id, act, null, { note: note });
    return { ok: true, status: status };
  };
  /** لوحة القيادة: عدد الإنذارات المبكرة المفتوحة */
  var dash13 = api.dashboard;
  api.dashboard = function (pin) {
    var d = dash13(pin);
    try { var u = H.auth(pin, true), sites = H.sitesById(), now = deps.now(); d.ews = ewsRows().map(ewsOut).filter(function (a) { return a.time >= now - 2 * D && (a.status === 'جديد' || a.status === 'قيد المتابعة') && H.inScope(u, a.siteId, sites); }); } catch (e) {}
    return d;
  };
}

/** بيانات نسخة العرض للإصدار 14 */
function BIO_seedV14(s, now) {
  var H = BIO.HOUR, D = 24 * H, Y = BIO.YES;
  s.settings.push(
    { key: 'CAMERAS_ENABLED', value: 'لا', note: 'ربط كاميرات المراقبة بالتطبيق. يبقى «لا» حتى موافقة الإدارة، ويُفعَّل من شاشة حائط الكاميرات' },
    { key: 'CAMERAS_APPROVED_BY', value: '', note: 'من فعّل ربط الكاميرات ومرجع موافقة الإدارة' },
    { key: 'CAMERAS_APPROVED_AT', value: '', note: 'وقت تفعيل ربط الكاميرات' },
    { key: 'CAM_REFRESH_SEC', value: 3, note: 'تحديث لقطات الكاميرات كل كم ثانية' },
    { key: 'TRACK_URL', value: 'https://abdelrahmanzaki2024-lgtm.github.io/biosecurity/', note: 'رابط التطبيق المستضاف الذي يُرسل للسائق لتتبع الرحلة (يحتاج https وصلاحية الموقع)' },
    { key: 'TRIP_STOP_MIN', value: 10, note: 'أقل مدة توقف بالدقائق خارج مواقع الشركة تُسجَّل مخالفة أثناء الرحلة' },
    { key: 'TRIP_STOP_RADIUS_M', value: 300, note: 'نصف قطر التوقف بالمتر' },
    { key: 'TRIP_PING_SEC', value: 60, note: 'إرسال موقع السائق كل كم ثانية' },
    { key: 'DECL_BLOCK', value: 'لا', note: 'نعم = البوابة تمنع صاحب الإقرار عالي الخطورة حتى يعتمده المدير. لا = تحذير فقط' },
    { key: 'EWS_WATCH', value: 1.5, note: 'الإنذار المبكر: مراقبة عند النافق 1.5 ضعف المعدل' },
    { key: 'EWS_ALERT', value: 2, note: 'الإنذار المبكر: إنذار عند ضعف المعدل' },
    { key: 'EWS_CRIT', value: 3, note: 'الإنذار المبكر: حرج عند 3 أضعاف المعدل' },
    { key: 'EWS_MIN_DEAD', value: 15, note: 'أقل عدد نافق يومي تُحسب عنده النسبة للمعدل (لتجنب إنذارات الأعداد الصغيرة)' },
    { key: 'EWS_PCT_WATCH', value: 0.1, note: 'نسبة النفوق اليومية % من القطيع للمراقبة' },
    { key: 'EWS_PCT_ALERT', value: 0.2, note: 'نسبة النفوق اليومية % للإنذار' },
    { key: 'EWS_PCT_CRIT', value: 0.4, note: 'نسبة النفوق اليومية % للحالة الحرجة' }
  );
  // كاميرات أمثلة (تُحذف من الشيت الحقيقي عند setup)
  s.cameras = [
    { id: 'CAM01', name: 'بوابة التطهير المركزية - الدخول', siteId: 'W-CP1', kind: 'لقطة متجددة (JPEG)', url: '', appUrl: '', active: Y, order: 1 },
    { id: 'CAM02', name: 'حمام البوابة المركزية', siteId: 'W-CP1', kind: 'لقطة متجددة (JPEG)', url: '', appUrl: '', active: Y, order: 2 },
    { id: 'CAM03', name: 'بوابة أمهات الواحات', siteId: 'W-BRD', kind: 'بث مباشر (MJPEG)', url: '', appUrl: '', active: Y, order: 3 },
    { id: 'CAM04', name: 'رصيف معمل التفريخ', siteId: 'W-HAT', kind: 'لقطة متجددة (JPEG)', url: '', appUrl: '', active: Y, order: 4 },
    { id: 'CAM05', name: 'بوابة تسمين المحطة 5', siteId: 'W-F05', kind: 'لقطة متجددة (JPEG)', url: '', appUrl: '', active: Y, order: 5 },
    { id: 'CAM06', name: 'بوابة مصنع العلف', siteId: 'W-FEED', kind: 'لقطة متجددة (JPEG)', url: '', appUrl: '', active: Y, order: 6 },
    { id: 'CAM07', name: 'بوابة أمهات ريجوا', siteId: 'R-BRD', kind: 'بث مباشر (MJPEG)', url: '', appUrl: '', active: Y, order: 7 },
    { id: 'CAM08', name: 'منطقة تطهير المبيعات', siteId: 'W-CP3', kind: 'لقطة متجددة (JPEG)', url: '', appUrl: '', active: Y, order: 8 }
  ];
  var ids = {}; s.sites.forEach(function (x) { ids[x.id] = x; }); (s.checkpoints || []).forEach(function (c) { ids[c.id] = c; });
  s.cameras = s.cameras.filter(function (c) { return ids[c.siteId]; });
  // مركبات تتطلب تتبع الرحلات + رحلة جارية فيها توقف قرب سوق طيور
  s.items.forEach(function (i) { if (i.id === 'V003' || i.id === 'V006') i.track = Y; });
  var f = ids['W-HAT'], t = ids['W-F05'] || ids['W-F10'];
  if (f && t && f.lat != null && t.lat != null) {
    var pts = [], t0 = now - 95 * 60000, a = [Number(f.lat), Number(f.lng)], b = [Number(t.lat), Number(t.lng)], mid = [a[0] + (b[0] - a[0]) * 0.45 + 0.02, a[1] + (b[1] - a[1]) * 0.45 - 0.03];
    for (var i = 0; i <= 30; i++) { var k = i / 30; pts.push([t0 + i * 90000, a[0] + (mid[0] - a[0]) * k, a[1] + (mid[1] - a[1]) * k, 12]); }
    for (var j = 1; j <= 16; j++) pts.push([t0 + 30 * 90000 + j * 60000, mid[0] + (j % 3) * 0.00012, mid[1] + (j % 2) * 0.0001, 9]);
    for (var m = 1; m <= 24; m++) { var q = m / 30; pts.push([t0 + 30 * 90000 + 16 * 60000 + m * 90000, mid[0] + (b[0] - mid[0]) * q, mid[1] + (b[1] - mid[1]) * q, 11]); }
    s.trips = [{ id: 'TR-DEMO-1', time: t0 - 5 * 60000, itemId: 'V003', itemName: 'سيارة نقل كتاكيت', plate: '', driver: 'محمود السائق (مثال)', phone: '201000000000', fromId: f.id, fromName: f.name, toId: t.id, toName: t.name, token: 'tdemo0trip0link0for0preview1', by: 'مدير الأمن الحيوي', byId: 'U09', status: 'جارية', startedAt: pts[0][0], endedAt: '', lastAt: pts[pts.length - 1][0], lastLat: pts[pts.length - 1][1], lastLng: pts[pts.length - 1][2], points: pts.length, km: 0, stops: 0, alerts: '[]', note: '' }];
    s.tripPings = [{ id: 'TP-DEMO-1', tripId: 'TR-DEMO-1', time: now - 60000, pts: JSON.stringify(pts) }];
    var it3 = s.items.filter(function (x) { return x.id === 'V003'; })[0]; if (it3) s.trips[0].itemName = it3.name, s.trips[0].plate = it3.plate || '';
  }
  // نافق اليوم مرتفع في محطة لعرض الإنذار المبكر
  var hi = ids['W-F12'] ? 'W-F12' : null;
  if (hi) {
    var hist = [21, 19, 23, 20, 22, 24, 21, 29, 41];
    hist.forEach(function (c, i) { s.disposal.push({ id: 'DP-EWS-H' + i, time: now - (hist.length - i) * D - 2 * H, siteId: hi, siteName: ids[hi].name, kind: 'نافق', count: c, weight: Math.round(c * 1.9), method: 'محرقة', vehicleId: '', vehicleName: '', driverId: '', by: 'أمن بوابة المحطة (مثال)', note: '' }); });
    s.disposal.push({ id: 'DP-EWS-1', time: now - 40 * 60000, siteId: hi, siteName: ids[hi].name, kind: 'نافق', count: 96, weight: 180, method: 'محرقة', vehicleId: '', vehicleName: '', driverId: '', by: 'أمن بوابة المحطة (مثال)', note: 'عنبر 2 أعلى من المعتاد' });
    if (s.phases) s.phases.push({ id: 'PH-EWS-1', time: now - 27 * D, siteId: hi, siteName: ids[hi].name, phase: 'تربية', startAt: now - 27 * D, flockAt: now - 27 * D, birds: 36000, by: 'مشرف الأمن الحيوي (مثال)', source: 'تسجيل يدوي', note: '' });
    s.ews = [{ id: 'EW-DEMO-1', time: now - 39 * 60000, day: '', siteId: hi, siteName: ids[hi].name, dead: 96, base: 24.1, ratio: 3.98, pct: 0.267, level: 'حرج', why: 'النافق 4 أضعاف المعدل المعتاد · نسبة نفوق يومية 0.27% من القطيع · ارتفاع متتالٍ 3 أيام', status: 'جديد', action: '', by: '', at: '' }];
    var dd = new Date(now + 3 * H); s.ews[0].day = dd.getUTCFullYear() + '-' + ('0' + (dd.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + dd.getUTCDate()).slice(-2);
  }
  return s;
}
var BIO_seedV13_ = BIO_seed;
BIO_seed = function (now) { return BIO_seedV14(BIO_seedV13_(now), now); };


/* =====================================================================
   الإصدار 15: ملف بيانات المزارع اليومي (إكسيل)
   المدير يرفع الملف الذي يرسله مدخلو البيانات يومياً، فيقرأه التطبيق على الجهاز
   (حتى الملفات الضخمة التي تحمل سنوات من البيانات)، ويحلل آخر الأيام، ثم يحفظ
   ملخص كل محطة في كل يوم، ويحدّث مرحلة المحطة وعدد الطيور والإنذار المبكر.
   ===================================================================== */
TABLES.daily = { sheet: 'البيانات اليومية للمزارع', key: 'id', cols: { id: 'الرقم', day: 'اليوم', siteId: 'كود الموقع', siteName: 'الموقع', farm: 'اسم المزرعة في الملف', cycle: 'الدورة', status: 'الحالة', age: 'العمر (يوم)', houses: 'عدد العنابر', stock: 'الرصيد', placed: 'كتاكيت مسكنة', dead: 'النافق', killed: 'الفرز والذبح', inj: 'الحقن', lab: 'عينات المعمل', feed: 'العلف (كجم)', sold: 'المباع (طائر)', soldKg: 'المباع (كجم)', culls: 'كتاكيت مستبعدة', cum: 'النافق التراكمي للدورة', breed: 'السلالة', source: 'مصدر الكتاكيت', detail: 'تفاصيل العنابر', hash: 'بصمة البيانات', importId: 'رقم الاستيراد', time: 'آخر تحديث' } };
TABLES.imports = { sheet: 'سجل استيراد ملفات البيانات', key: 'id', cols: { id: 'رقم الاستيراد', time: 'الوقت', file: 'اسم الملف', day: 'تاريخ البيانات', from: 'من يوم', rows: 'صفوف مقروءة', sites: 'المحطات', added: 'أيام جديدة', updated: 'أيام عُدلت', dead: 'نافق آخر يوم', alerts: 'ملاحظات مهمة', findings: 'نتيجة التحليل', by: 'رفعه', byId: 'كود من رفعه' } };
var BIO_FARM_STATUS = { 'استلام': 'استقبال كتاكيت', 'تسكين': 'استقبال كتاكيت', 'تسمين': 'تربية', 'تربية': 'تربية', 'بيع': 'بيع', 'placement': 'استقبال كتاكيت', 'growing': 'تربية', 'sale': 'بيع', 'sales': 'بيع' };

function BIO_v15(api, H) {
  var store = H.store, deps = H.deps, D = 24 * BIO.HOUR, NUMS = ['cycle', 'age', 'houses', 'stock', 'placed', 'dead', 'killed', 'inj', 'lab', 'feed', 'sold', 'soldKg', 'culls', 'cum'];
  function st() { return H.settings(); }
  function num(v, d) { var n = Number(v); return isNaN(n) || v === '' || v == null ? d : n; }
  function clean(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 80); }
  function json(v, d) { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function has(t) { try { store.all(t); return true; } catch (e) { return false; } }
  function day0(t) { return t - ((t + 3 * BIO.HOUR) % D); }
  function dayKey(t) { var d = new Date(t + 3 * BIO.HOUR); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function dayT(v) { return api._dayT ? api._dayT(v) : 0; }
  function dk(v) { var t = dayT(v); return t ? dayKey(t + 12 * BIO.HOUR) : ''; }
  function log(u, t, k, a, b, c) { if (api._log) api._log(u, t, k, a, b, c); }
  function setSetting(key, value, note) { if (store.find('settings', key)) store.update('settings', key, { value: value }); else store.append('settings', { key: key, value: value, note: note || '' }); }
  function canImport(u) { return !!u && u.isManager && (u.perms || []).indexOf('data') >= 0; }
  function stationNo(name) { var m = /محطة\s*(\d+)/.exec(String(name)); return m ? Number(m[1]) : null; }
  function farmSites(u, sites) {
    return H.sitesList(sites).filter(function (s) { return !s.external && H.inScope(u, s.id, sites); })
      .map(function (s) { return { id: s.id, name: s.name, sector: s.sector, level: Number(s.level), no: stationNo(s.name), cycle: BIO_isCycleSite(s) }; });
  }
  function rowsOut(x) {
    var o = { day: dk(x.day), siteId: BIO_norm(x.siteId), status: String(x.status || ''), farm: String(x.farm || ''), breed: String(x.breed || ''), source: String(x.source || ''), detail: json(x.detail, []) };
    NUMS.forEach(function (k) { o[k] = num(x[k], 0); });
    o.mort = o.dead + o.killed + o.inj; o.pct = o.stock + o.mort > 0 ? Math.round(o.mort / (o.stock + o.mort) * 10000) / 100 : null;
    o.gpb = o.stock > 0 && o.feed > 0 ? Math.round(o.feed * 1000 / o.stock) : null;
    return o;
  }
  function importOut(r) { return { id: r.id, time: BIO_ms(r.time), file: String(r.file || ''), day: dk(r.day) || String(r.day || ''), from: dk(r.from) || String(r.from || ''), rows: num(r.rows, 0), sites: String(r.sites || ''), added: num(r.added, 0), updated: num(r.updated, 0), dead: num(r.dead, 0), alerts: num(r.alerts, 0), findings: json(r.findings, []), by: String(r.by || '') }; }

  /** ما يحتاجه التطبيق قبل قراءة الملف: المحطات وربط الأعمدة والأسماء المحفوظ من المرات السابقة */
  api.farmMeta = function (pin) {
    var u = H.auth(pin, true), sites = H.sitesById();
    var imp = has('imports') ? store.all('imports').map(importOut).sort(function (a, b) { return b.time - a.time; }) : [];
    return { sites: farmSites(u, sites), map: json(st().IMPORT_MAP, {}), aliases: json(st().IMPORT_SITES, {}), last: imp[0] || null, canImport: canImport(u), window: num(st().IMPORT_DAYS, 14) };
  };

  /** حفظ ما قرأه التطبيق من الملف: ملخص كل محطة في كل يوم (يُحدَّث إن تغيّر)، ثم المرحلة والإنذار المبكر */
  api.farmImport = function (pin, p) {
    var u = H.auth(pin, true); if (!canImport(u)) throw new Error('رفع ملف البيانات للمدير فقط');
    p = p || {};
    if (p.id && has('imports') && store.find('imports', p.id)) return { ok: true, duplicate: true, id: p.id };
    var sites = H.sitesById(), now = deps.now(), list = Array.isArray(p.days) ? p.days.slice(0, 3000) : [];
    if (!list.length) throw new Error('لا توجد بيانات في الملف لحفظها');
    var id = clean(p.id, 40) || deps.id('IM'), existing = {}, adds = [], upd = 0, same = 0, skipped = {}, touched = {}, last = '';
    if (has('daily')) store.all('daily').forEach(function (x) { existing[String(x.id)] = x; });
    list.forEach(function (r) {
      var sid = BIO_norm(r.siteId), s = sites[sid], day = String(r.day || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      if (!s || s.external || !H.inScope(u, sid, sites)) { skipped[clean(r.farm || sid, 40)] = 1; return; }
      var o = { id: day + '|' + sid, day: day, siteId: sid, siteName: s.name, farm: clean(r.farm, 40), status: clean(r.status, 20), breed: clean(r.breed, 60), source: clean(r.source, 120), detail: JSON.stringify((Array.isArray(r.detail) ? r.detail : []).slice(0, 40)).slice(0, 4000) };
      NUMS.forEach(function (k) { o[k] = Math.round(num(r[k], 0) * 100) / 100; });
      o.hash = BIO_hash ? BIO_hash(JSON.stringify([o.status, o.breed, o.source, o.detail].concat(NUMS.map(function (k) { return o[k]; })))) : '';
      o.importId = id; o.time = now;
      touched[sid] = touched[sid] || {}; touched[sid][day] = o;
      if (day > last) last = day;
      var ex = existing[o.id];
      if (!ex) { adds.push(o); existing[o.id] = o; return; }
      if (String(ex.hash) === String(o.hash)) { same++; return; }
      var patch = {}; Object.keys(o).forEach(function (k) { if (k !== 'id' && String(ex[k]) !== String(o[k])) patch[k] = o[k]; });
      store.update('daily', o.id, patch); upd++;
    });
    if (adds.length) { if (store.appendMany) store.appendMany('daily', adds); else adds.forEach(function (o) { store.append('daily', o); }); }
    if (p.map && typeof p.map === 'object') { var mj = JSON.stringify(p.map); if (mj.length < 8000) setSetting('IMPORT_MAP', mj, 'ربط أعمدة ملف بيانات المزارع (يُحفظ تلقائياً من شاشة رفع الملف)'); }
    if (p.aliases && typeof p.aliases === 'object') { var aj = JSON.stringify(p.aliases); if (aj.length < 8000) setSetting('IMPORT_SITES', aj, 'ربط أسماء المزارع في الملف بمواقع التطبيق'); }

    // مرحلة المحطة من حالة آخر يوم في الملف (استلام ← استقبال كتاكيت، تسمين ← تربية، بيع ← بيع)
    var phases = [], ewsOut = [], dead = 0, lastT = dayT(last);
    Object.keys(touched).forEach(function (sid) {
      var o = touched[sid][last]; if (!o) return;
      dead += o.dead + o.killed + o.inj;
      var ph = BIO_FARM_STATUS[String(o.status).trim().toLowerCase()] || BIO_FARM_STATUS[String(o.status).trim()];
      if (ph && has('phases') && lastT >= day0(now) - 2 * D) {
        var cur = store.all('phases').filter(function (x) { return BIO_norm(x.siteId) === sid; }).sort(function (a, b) { return BIO_ms(a.startAt || a.time) - BIO_ms(b.startAt || b.time); }).pop();
        var ORD = ['استقبال كتاكيت', 'تربية', 'بيع', 'تحميل سبلة', 'تجهيز وتطهير', 'فترة راحة'], ci = cur ? ORD.indexOf(String(cur.phase)) : -1, pi = ORD.indexOf(ph);
        // لا يُرجِع المرحلة للخلف: بعد «بيع» يسجل المشرف «تحميل سبلة» يدوياً ولا يلغيه الملف، إلا إذا بدأت دورة جديدة
        if (!cur || (String(cur.phase) !== ph && (ci < 0 || ci < pi || (ci >= 3 && pi <= 1)))) {
          var days = Object.keys(touched[sid]).sort(), first = last;
          for (var i = days.length - 1; i >= 0; i--) { var st0 = BIO_FARM_STATUS[String(touched[sid][days[i]].status).trim()]; if (st0 === ph) first = days[i]; else break; }
          var row = { id: deps.id('PH'), time: now, siteId: sid, siteName: sites[sid].name, phase: ph, startAt: dayT(first) + 8 * BIO.HOUR, flockAt: o.age > 0 ? lastT - (o.age - 1) * D : '', birds: o.stock + o.dead + o.killed + o.inj || '', by: u.name, source: 'ملف البيانات اليومي', note: 'من ملف ' + clean(p.file, 60) };
          store.append('phases', row); phases.push({ siteId: sid, name: sites[sid].name, phase: ph });
        }
      }
      if (api._ewsFire && lastT >= day0(now) - 2 * D) {
        var t = lastT === day0(now) ? now : lastT + 20 * BIO.HOUR, e = api._ewsFire(sid, t);
        if (e && e.n >= 1) ewsOut.push({ siteId: sid, name: sites[sid].name, level: e.level, n: e.n, why: e.why, dead: e.dead, base: e.base, fired: !!e.fired });
      }
    });
    var findings = (Array.isArray(p.findings) ? p.findings : []).slice(0, 80).map(function (f) { return { lv: clean(f.lv, 6), siteId: BIO_norm(f.siteId), site: clean(f.site, 40), text: clean(f.text, 220) }; });
    var bad = findings.filter(function (f) { return f.lv === 'bad'; });
    var rec = { id: id, time: now, file: clean(p.file, 120), day: last, from: clean(p.from, 10), rows: num(p.rows, 0), sites: Object.keys(touched).map(function (k) { return sites[k].name; }).join('، '), added: adds.length, updated: upd, dead: dead, alerts: bad.length + findings.filter(function (f) { return f.lv === 'warn'; }).length, findings: JSON.stringify(findings).slice(0, 45000), by: u.name, byId: u.id };
    store.append('imports', rec);
    log(u, 'daily', id, 'رفع ملف بيانات المزارع', null, { file: rec.file, day: last, added: adds.length, updated: upd });
    var fired = ewsOut.filter(function (e) { return e.fired; }).map(function (e) { return e.siteId; });
    var mail = bad.filter(function (f) { return fired.indexOf(f.siteId) < 0; });
    if (mail.length) deps.notify({ kind: 'farm', title: '📊 ملف بيانات المزارع: ' + mail.length + ' ملاحظة مهمة', body: 'بيانات يوم ' + last + ' · رفعه ' + u.name + '\n\n' + mail.slice(0, 8).map(function (f) { return '• ' + (f.site ? f.site + ': ' : '') + f.text; }).join('\n') + H.appUrl('#farm') });
    return { ok: true, id: id, day: last, added: adds.length, updated: upd, unchanged: same, skipped: Object.keys(skipped), phases: phases, ews: ewsOut, sites: Object.keys(touched).length };
  };

  /** شاشة بيانات المزارع: آخر 14 يوماً لكل محطة ونتيجة تحليل آخر ملف */
  api.farmData = function (pin, n) {
    var u = H.auth(pin, true), sites = H.sitesById(), N = Math.min(60, Math.max(7, num(n, 14)));
    var all = has('daily') ? store.all('daily').filter(function (x) { return H.inScope(u, BIO_norm(x.siteId), sites); }).map(rowsOut) : [];
    var latest = all.reduce(function (a, x) { return x.day > a ? x.day : a; }, '');
    var t1 = latest ? dayT(latest) : day0(deps.now()), from = dayKey(t1 - (N - 1) * D + 12 * BIO.HOUR), by = {};
    all.forEach(function (x) { if (x.day >= from && x.day <= latest) (by[x.siteId] = by[x.siteId] || []).push(x); });
    var list = farmSites(u, sites).filter(function (s) { return s.cycle || by[s.id]; }).map(function (s) {
      var rows = (by[s.id] || []).sort(function (a, b) { return a.day < b.day ? -1 : 1; }), lastRow = rows[rows.length - 1] || null;
      return { id: s.id, name: s.name, sector: s.sector, no: s.no, rows: rows, last: lastRow, today: lastRow && lastRow.day === latest ? lastRow : null };
    }).sort(function (a, b) { return (b.today ? 1 : 0) - (a.today ? 1 : 0) || (a.no || 99) - (b.no || 99) || a.name.localeCompare(b.name); });
    var imp = has('imports') ? store.all('imports').map(importOut).sort(function (a, b) { return b.time - a.time; }) : [];
    return { latest: latest, from: from, sites: list, imports: imp.slice(0, 10), findings: imp[0] ? imp[0].findings : [], canImport: canImport(u), now: deps.now() };
  };
}
