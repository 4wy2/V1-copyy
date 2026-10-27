(() => {
  const copy = {
    ar: {
      title: 'بوابة اللجنة العلمية | نادي الهندسة الكهربائية',
      brand: 'اللجنة العلمية', portal: 'بوابة اللجنة العلمية', club: 'نادي الهندسة الكهربائية',
      openMenu: 'فتح القائمة', closeMenu: 'إغلاق القائمة', mainNav: 'القائمة الرئيسية',
      navHome: 'الرئيسية', navMajors: 'التخصصات والخطط الدراسية', navFaculty: 'بحث هيئة التدريس',
      blackboard: 'البلاك بورد', edugate: 'الايدوقيت',
      introTitle: 'اللجنة العلمية',
      introText: 'مبادرة علمية تهدف إلى دعم طلاب قسم الهندسة الكهربائية وتسهيل الوصول للمصادر التعليمية.',
      servicesTitle: 'المنصات والخدمات الأكاديمية', flowcharts: 'فلوشارت التخصصات', schedule: 'أنشئ جدولك',
      shareTitle: 'شاركنا مصادرك الدراسية',
      shareText: 'عندك ملخص أو اختبار سابق أو ملف يفيد زملاءك؟ أرسله عبر النموذج، ونراجعه قبل نشره.',
      addSource: 'إضافة مصدر',
      resourcesTitle: 'ملفات ومراجع',
      courseLibrary: 'مكتبة المواد', summaries: 'ملخصات', exams: 'اختبارات', labs: 'تجارب', soon: 'قريباً',
      resourcesNote: 'هذه الأقسام تعتمد على مساهماتكم، شاركونا ما لديكم لنفتحها للجميع.',
      disclaimer: 'هذا الموقع مبادرة طلابية مساعدة وليس جهة رسمية.', creditName: 'الرصاصي',
      langLabel: 'Switch to English', toLight: 'الوضع الفاتح', toDark: 'الوضع الداكن'
    },
    en: {
      title: 'Scientific Committee Portal | Electrical Engineering Club',
      brand: 'Scientific Committee', portal: 'Scientific Committee Portal', club: 'Electrical Engineering Club',
      openMenu: 'Open menu', closeMenu: 'Close menu', mainNav: 'Main menu',
      navHome: 'Home', navMajors: 'Majors and study plans', navFaculty: 'Faculty search',
      blackboard: 'Blackboard', edugate: 'Edugate',
      introTitle: 'Scientific Committee',
      introText: 'A student initiative supporting Electrical Engineering students and making study resources easier to reach.',
      servicesTitle: 'Platforms and academic services', flowcharts: 'Major flowcharts', schedule: 'Build your schedule',
      shareTitle: 'Share your study resources',
      shareText: 'Have a summary, a past exam or a useful file? Send it through the form and we will review it before publishing.',
      addSource: 'Add a resource',
      resourcesTitle: 'Files and references',
      courseLibrary: 'Course library', summaries: 'Summaries', exams: 'Past exams', labs: 'Labs', soon: 'Soon',
      resourcesNote: 'These sections depend on your contributions. Share what you have and we will open them for everyone.',
      disclaimer: 'This is a student-led initiative, not an official institution website.', creditName: 'Al-Rasasi',
      langLabel: 'التبديل إلى العربية', toLight: 'Light mode', toDark: 'Dark mode'
    }
  };

  const root = document.documentElement;
  const langBtn = document.getElementById('languageToggle');
  const themeBtn = document.getElementById('themeToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const openBtn = document.getElementById('openSidebar');
  const closeBtn = document.getElementById('closeSidebar');
  let lang = root.lang === 'en' ? 'en' : 'ar';
  let theme = root.dataset.theme === 'light' ? 'light' : 'dark';

  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  function render() {
    const s = copy[lang];
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    root.dataset.theme = theme;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = s[el.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', s[el.dataset.i18nAria]); });
    langBtn.textContent = lang === 'ar' ? 'EN' : 'ع';
    langBtn.setAttribute('aria-label', s.langLabel);
    themeBtn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>' : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
    themeBtn.setAttribute('aria-label', theme === 'dark' ? s.toLight : s.toDark);
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#11141c' : '#f3f3f6';
    document.title = s.title;
  }

  langBtn.addEventListener('click', () => { lang = lang === 'ar' ? 'en' : 'ar'; save('ee_language', lang); render(); });
  themeBtn.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; save('ee_theme', theme); render(); });

  function setBackground(inert) { document.querySelectorAll('header, main, footer').forEach((n) => { n.inert = inert; }); }

  function openMenu() {
    sidebar.classList.add('is-open');
    sidebar.inert = false;
    sidebar.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    setBackground(true);
    closeBtn.focus();
  }
  function closeMenu(returnFocus = true) {
    sidebar.classList.remove('is-open');
    sidebar.inert = true;
    sidebar.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    setBackground(false);
    if (returnFocus) openBtn.focus();
  }

  openBtn.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', () => closeMenu());
  overlay.addEventListener('click', () => closeMenu(false));
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => closeMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (!sidebar.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeMenu();
    if (e.key === 'Tab') {
      const items = [...sidebar.querySelectorAll('a[href], button')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  render();
})();
