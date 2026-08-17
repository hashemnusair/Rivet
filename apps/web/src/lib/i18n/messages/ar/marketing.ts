import { plural } from "../../dictionary";
import type { marketing as EnMarketing } from "../en/marketing";

/**
 * The public site in Arabic. The headline keeps its three-beat rhythm rather
 * than translating word-for-word — "كل عضو. كل دينار. كل شيفت." lands the same
 * way, and "شيفت" is the word a gym in Amman actually uses for a shift.
 */
export const marketing: typeof EnMarketing = {
  nav: {
    product: "المنتج",
    forMembers: "للأعضاء",
    pricing: "الأسعار",
    findGym: "ابحث عن نادٍ",
    primary: "التنقل الرئيسي",
    mobile: "قائمة الجوال",
    home: "الصفحة الرئيسية لـ RIVET",
    toggleNav: "إظهار أو إخفاء القائمة",
  },

  actions: {
    apply: "أرسل طلب انضمام النادي",
    applyShort: "إرسال طلب النادي",
    seeHow: "شاهد كيف يعمل",
    signIn: "تسجيل الدخول",
    signInToRivet: "تسجيل الدخول إلى RIVET",
    openRivet: "فتح RIVET",
    preparingAccount: "جارٍ تجهيز الحساب…",
    preparingAccountLong: "جارٍ تجهيز حسابك…",
    createFreeAccount: "أنشئ حسابًا مجانيًا",
    createAccount: "إنشاء حساب",
    findGym: "ابحث عن نادٍ",
  },

  hero: {
    eyebrow: "نظام الإيرادات والعمليات · صُنع في عمّان",
    line1: "كل عضو.",
    line2: "كل دينار.",
    line3: "كل شيفت.",
    body: "يجمع RIVET مكتب المبيعات وصالة النادي والكاش وهاتف العضو في سجل واحد — من أول تجربة مجانية حتى التجديد العاشر.",
    accessNote: "يُمنح النادي حق الوصول بعد مراجعة الطلب وإتمام تهيئة المشغّل.",
    stats: {
      tenderTerm: "نقدًا · بطاقة · كليك",
      tenderDetail: "إيصال لكل عملية دفع",
      branchTerm: "فروع متعددة",
      branchDetail: "دفتر واحد لكل صالة",
      localeTerm: "العربية / من اليمين لليسار",
      localeDetail: "أصيلة منذ اليوم الأول",
      qrTerm: "رمز العضو",
      qrDetail: "مسحة واحدة، وحكم واضح",
    },
  },

  device: {
    alt: "معاينة توضيحية للوحة تحكم RIVET وتطبيق العضو، دون أي بيانات عملاء أو بيانات تشغيلية.",
    searchPlaceholder: "ابحث في الأعضاء والفرص والصفحات",
    allBranches: "كل الفروع",
    today: "اليوم",
    greeting: "صباح الخير",
    live: "مباشر",
    gymOwner: "مالك النادي",
    needsAttention: "يحتاج انتباهًا",
    drawerVariance: "فرق في الكاش بانتظار الموافقة",
    revenue30: "الإيرادات · آخر ٣٠ يومًا",
    receptionLive: "الاستقبال · مباشر",
    memberEntry: "دخول عضو",
    kpi: {
      collectedToday: "المحصّل اليوم",
      collectedTodayValue: "مُوصَل",
      collectedTodayNote: "نقدًا · بطاقة · كليك",
      thisMonth: "هذا الشهر",
      thisMonthValue: "في الدفتر",
      thisMonthNote: "مُسوّى",
      outstanding: "المستحق",
      outstandingValue: "متتبَّع",
      outstandingNote: "أرصدة غير مدفوعة",
      newMembers: "أعضاء جدد",
      newMembersValue: "مسجّل",
      newMembersNote: "هذا الشهر",
      renewals: "التجديدات ≤ ٧ أيام",
      renewalsValue: "في الطابور",
      renewalsNote: "قابلة للتنفيذ",
      checkIns: "الدخول اليوم",
      checkInsValue: "مُتحقَّق",
      checkInsNote: "عند الباب",
    },
    verdict: {
      valid: "سارٍ",
      validNote: "العضوية فعّالة",
      expiring: "قارب الانتهاء",
      expiringNote: "التجديد مستحق",
      frozen: "مجمّد",
      frozenNote: "العضوية مجمّدة",
    },
    phone: {
      member: "RIVET · عضو",
      active: "فعّالة",
      membership: "عضويتك",
      gymBranch: "النادي المختار · الفرع",
      statusLabel: "الحالة",
      statusValue: "سارية",
      visitsLabel: "الزيارات",
      visitsValue: "السجل",
      entryPass: "تصريح الدخول",
      scanAtDesk: "امسحه عند المكتب",
      home: "الرئيسية",
      explore: "استكشاف",
      account: "الحساب",
    },
  },

  vocabulary: {
    lead: "فرصة",
    freeTrial: "تجربة مجانية",
    offer: "عرض",
    membership: "عضوية",
    tender: "نقدًا · بطاقة · كليك",
    receipt: "إيصال",
    checkIn: "تسجيل دخول",
    verdict: "الحكم",
    freeze: "تجميد",
    transfer: "نقل",
    shiftClose: "إغلاق الشيفت",
    drawerVariance: "فرق الكاش",
    overrideReason: "سبب التجاوز",
    auditEntry: "قيد تدقيق",
    renewal: "تجديد",
  },

  numbers: {
    liveValue: "مباشرة",
    liveLabel: "عمليات الفروع في مساحة عمل واحدة",
    oneValue: "واحد",
    oneLabel: "سجل زمني واحد لكل عضو",
    auditedValue: "مُدقَّقة",
    auditedLabel: "المدفوعات والشيفتات والتجاوزات",
    scopedValue: "مُحدَّدة",
    scopedLabel: "الأدوار والفروع وصلاحيات الوصول",
  },

  loop: {
    eyebrow: "الدورة التجارية",
    titleLine1: "ثمانية أثقال.",
    titleLine2: "آلة واحدة.",
    body: "شعار RIVET هو رصّة أثقال، وهو يعمل مثلها تمامًا — ثماني مراحل من إيرادات النادي، كلها مثبّتة على سجل العضو نفسه. راقب الآلة وهي تمرّ عليها، أو اختر ثقلًا بنفسك.",
    stagesLabel: "مراحل الدورة",
    stages: {
      lead: {
        label: "فرصة",
        detail:
          "حجز من المتجر، أو زائر مباشر، أو ترشيح من صديق — كل اسم يصل إلى مسار واحد مع مسؤول ووقت متابعة. لا شيء يبقى في دفتر.",
      },
      contact: {
        label: "تواصل",
        detail:
          "المبيعات تعمل على طابور يومي لا على الذاكرة. كل مكالمة وردّ ووعد يُسجَّل على ملف العضو لحظة حدوثه.",
      },
      trial: {
        label: "تجربة مجانية",
        detail:
          "تُحجز التجارب على مواعيد حقيقية وتُؤكَّد قبل الزيارة، فيعرف المكتب من سيدخل ولماذا جاء.",
      },
      offer: {
        label: "عرض",
        detail:
          "الباقات والأسعار تأتي من الكتالوج، فيُسعَّر العرض دون تخمين — وكل خصم يحمل سببًا وعليه اسم.",
      },
      membership: {
        label: "عضوية",
        detail:
          "البيع يكتب العضوية: التواريخ والشروط والتجميد والنقل كلها على السجل، لا على ورقة ملصقة على مكتب الاستقبال.",
      },
      payment: {
        label: "دفعة",
        detail:
          "نقدًا أو ببطاقة أو عبر كليك — كل دينار يُوصَل لحظة حركته، ويستقر في كاش لا بد أن يتسوّى عند الإغلاق.",
      },
      checkIn: {
        label: "تسجيل دخول",
        detail:
          "مسحة واحدة عند الباب تُعيد حكمًا — سارٍ أو قارب الانتهاء أو مجمّد أو ممنوع — ومعه الإجراء التالي جاهزًا.",
      },
      renewal: {
        label: "تجديد",
        detail:
          "الأعضاء المقبلون على الانتهاء يدخلون طابور التجديد قبل أن تنقضي عضويتهم، وتعيد الدورة البيع إلى الثقل الأول.",
      },
    },
  },

  ops: {
    eyebrow: "RIVET للأندية",
    title: "عمق حيث تخسر الأندية أموالها.",
    description:
      "ليست جدارًا من لوحات المؤشرات — بل سطح عمل للبيع والتحصيل وتسجيل الدخول والتسوية والإشراف.",
    member360: {
      label: "العضو من كل زاوية",
      title: "القصة كاملة",
      copy: "المكالمات والتجارب والباقات والمدفوعات والتجميد والزيارات والتجديدات في سجل زمني واحد.",
    },
    reception: {
      label: "الاستقبال",
      title: "حكم، لا تخمين",
      copy: "سارٍ أو قارب الانتهاء أو مجمّد أو مستنفد أو ممنوع — ومعه الإجراء التالي جاهزًا.",
    },
    drawer: {
      label: "الشيفت والكاش",
      title: "أغلِق في تسعين ثانية",
      copy: "المتوقع مقابل الكاش المعدود، مع تسمية كل فرق وتفسيره وتوجيهه للموافقة.",
    },
    accountability: {
      label: "المساءلة",
      title: "كل تجاوز عليه اسم",
      copy: "الخصومات والمرتجعات والتجميد والإلغاءات مُعلَّلة ومتدرّجة ومكتوبة في سجل لا يُعدَّل.",
    },
  },

  member: {
    eyebrow: "RIVET للأعضاء",
    title: "الجهة الأخرى من المكتب.",
    description:
      "حساب واحد يجد أندية جديدة، ويحجز تجربة مجانية، ويحمل كل عضوية فعّالة — بلا متجر تطبيقات، وبلا بطاقة بلاستيكية، وبلا صور لإيصالات قديمة.",
    benefits: {
      status: "حالة العضوية وتاريخ انتهائها والزيارات والرصيد في لمحة",
      qr: "هوية QR مخصّصة لدخول سريع عند المكتب",
      receipts: "إيصالات وسجل مدفوعات تبقى حتى لو ضاع الهاتف",
      language: "بالعربية أو الإنجليزية، لكل عضو على حدة",
    },
    card: {
      badge: "عضو RIVET",
      live: "مساحة عمل مباشرة",
      eyebrow: "عضويتك في النادي",
      title: "سجل عضو واحد موثّق",
      meta: "الباقة · الفرع · رقم العضو",
      membershipLabel: "العضوية",
      membershipValue: "حالة النادي المباشرة",
      visitsLabel: "الزيارات",
      visitsValue: "زيارات مسجّلة",
      qrTitle: "رمز الدخول بعد التفعيل",
      qrNote: "يُصدر فقط من عضوية فعّالة ومحفوظة.",
      footer: "هوية الدخول · معتمدة من النادي",
    },
  },

  network: {
    eyebrow: "شبكة RIVET",
    title: "اعثر على النادي. احجز قبل أن تزوره.",
    description:
      "لا تظهر في الدليل إلا الأندية التي تعمل فعلًا على RIVET، فيصل طلب التجربة إلى طابور متابعة حقيقي بدل صندوق بريد.",
    emptyTitle: "لا توجد أندية RIVET مباشرة بعد",
    emptyDescription: "الدليل جاهز، لكن لم ينشر أي نادٍ إعلانًا مباشرًا حتى الآن.",
    ptCount: "{count} مدرّب",
    fromPrice: "من {price} د.أ",
  },

  pricing: {
    eyebrow: "الأسعار",
    title: "فرع واحد أو ثمانية. النظام نفسه.",
    description:
      "كل باقة تشمل الظهور في الدليل، وتطبيق العضو، وصلاحيات الموظفين، وسجل التدقيق، ودورة الإيرادات كاملة. غيّر الباقة في أي وقت قبل انتهاء التجربة.",
    emptyTitle: "يجري تجهيز الأسعار",
    emptyDescription: "أسعار RIVET غير متاحة من الكتالوج المباشر بعد.",
    mostPopular: "الأكثر طلبًا",
    perMonth: "/ شهريًا",
    price: "{amount} د.أ",
    branches: plural({
      zero: "بلا فروع",
      one: "فرع واحد",
      two: "فرعان",
      few: "{count} فروع",
      many: "{count} فرعًا",
      other: "{count} فرع",
    }),
    staff: plural({
      zero: "بلا حسابات موظفين",
      one: "حتى حساب موظف واحد",
      two: "حتى حسابَي موظفين",
      few: "حتى {formatted} حسابات موظفين",
      many: "حتى {formatted} حساب موظف",
      other: "حتى {formatted} حساب موظف",
    }),
    members: plural({
      zero: "بلا أعضاء",
      one: "حتى عضو واحد",
      two: "حتى عضوين",
      few: "حتى {formatted} أعضاء",
      many: "حتى {formatted} عضوًا",
      other: "حتى {formatted} عضو",
    }),
    included: "تطبيق العضو والظهور في الدليل مشمولان",
  },

  cta: {
    eyebrow: "الدفعة الأولى قيد التهيئة في عمّان",
    title: "جرّبه على أرقامك أنت.",
    body: "نهيّئ نسخة تجريبية حول فروعك وأعضائك وقواعد تشغيلك، ليتمكن الفريق من التحقق من سير العمل كاملًا على بيانات موثوقة.",
  },

  footer: {
    blurb: "نظام الإيرادات والعمليات للأندية الرياضية — وأبسط طريقة للأعضاء ليجدوها وينضموا إليها ويدخلوها.",
    madeIn: "صُنع في عمّان · Made in Amman",
    product: "المنتج",
    overview: "نظرة عامة",
    members: "الأعضاء",
    signIn: "تسجيل الدخول",
    createMemberAccount: "إنشاء حساب عضو",
    myDashboard: "لوحتي",
    copyright: "© ٢٠٢٦ RIVET · عمّان، الأردن",
    rivetForGyms: "RIVET للأندية",
    copyrightShort: "© ٢٠٢٦ RIVET · عمّان",
  },

  memberShell: {
    member: "عضو",
    navigation: "تنقّل العضو",
    home: "الرئيسية",
    exploreGyms: "استكشف الأندية",
    explore: "استكشاف",
    account: "الحساب",
    accountMenu: "فتح قائمة الحساب",
    profile: "الملف الشخصي",
    communicationSettings: "إعدادات التواصل",
    signingOut: "جارٍ تسجيل خروجك",
    signingOutDetail: "العودة إلى تسجيل دخول آمن…",
    openingWorkspace: "جارٍ فتح مساحة عملك",
    openingWorkspaceDetail: "ننقلك إلى القسم المناسب في RIVET…",
  },
};
