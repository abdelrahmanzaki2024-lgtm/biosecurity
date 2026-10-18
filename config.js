/* إعدادات التطبيق - عدّل هذا الملف فقط بعد النشر (راجع دليل التشغيل) */
self.BIO_CONFIG = {
  COMPANY: 'كايرو ثري إيه',
  // رابط تطبيق الويب من Apps Script (Deploy > Web app URL) وينتهي بـ /exec
  API_URL: 'https://script.google.com/macros/s/AKfycbyCGXD_59FuBBqrDXRRIgx2HvYDq4EWpxoMwJlBkI4b4X1_DKxz9iwA3_r71sOQWw/exec',
  // رابط تطبيق التقارير من Apps Script (ينتهي بـ /exec): علشان التقارير تشتغل من غير نت من النسخة المثبتة
  REPORTS_URL: 'https://script.google.com/macros/s/AKfycbzhk71OJIFJNLcLHa9b2hqw3jHlAXEoBhcoxV6D34H2UvD8-p5fU52XmvEMhqXnG3hN/exec',
  // شعار الشركة: ضع ملف logo.png بجانب index.html
  LOGO_URL: 'logo.png',
  // إعدادات Firebase للإشعارات الفورية (Project settings > General > Your apps > Web app). اتركها null لتعطيل الإشعارات
  FIREBASE: null,
  // Cloud Messaging > Web Push certificates > Key pair
  VAPID_KEY: ''
};
