/** Name pools & sample content for the Jordan/MENA demo tenant. */

export const MALE_FIRST = [
  "Ahmad", "Mohammad", "Omar", "Yazan", "Laith", "Faris", "Kareem", "Jad", "Basil", "Zaid",
  "Hisham", "Mahmoud", "Tareq", "Sami", "Nidal", "Rami", "Fadi", "Ibrahim", "Hamzeh", "Saleh",
  "Anas", "Baraa", "Diaa", "Emad", "Ghassan", "Hadi", "Jaafar", "Khaled", "Mazen", "Nasser",
  "Qusai", "Rashid", "Sharif", "Talal", "Waleed", "Yousef", "Zain", "Adnan", "Bilal", "Husam",
];

export const FEMALE_FIRST = [
  "Layan", "Tala", "Joud", "Nour", "Rania", "Dima", "Aya", "Salma", "Razan", "Haya",
  "Leen", "Sandra", "Mira", "Yasmine", "Farah", "Dana", "Rita", "Mais", "Aline", "Reem",
  "Saba", "Taleen", "Ward", "Zeina", "Amani", "Batoul", "Carmen", "Diala", "Ella", "Ghada",
  "Haneen", "Israa", "Jana", "Kinda", "Lina", "Mariam", "Nada", "Ola", "Raghda", "Sireen",
];

export const FAMILY = [
  "Al-Masri", "Khoury", "Haddad", "Nasser", "Qasem", "Awad", "Saleh", "Abuhamdan", "Issa",
  "Barakat", "Al-Khatib", "Shami", "Halasa", "Tarawneh", "Majali", "Rifai", "Dajani", "Kurdi",
  "Armoush", "Zureikat", "Hamdan", "Sayegh", "Naber", "Tahboub", "Qudah", "Bani Hani", "Obeidat",
  "Freij", "Ghanem", "Huneidi", "Jarrar", "Kanan", "Lozi", "Malkawi", "Najjar", "Otoum", "Qaralleh",
];

export const ARABIC_NAMES: Record<string, string> = {
  Ahmad: "أحمد", Mohammad: "محمد", Omar: "عمر", Yazan: "يزن", Laith: "ليث", Faris: "فارس",
  Kareem: "كريم", Jad: "جد", Basil: "باسل", Zaid: "زيد", Layan: "ليان", Tala: "تالا",
  Joud: "جود", Nour: "نور", Rania: "رانيا", Dima: "ديما", Aya: "آية", Salma: "سلمى",
  Razan: "رزان", Haya: "حيا", Leen: "لين", "Al-Masri": "المصري", Khoury: "خوري",
  Haddad: "حداد", Nasser: "ناصر", Qasem: "قاسم", Awad: "عوض", Saleh: "صالح", Issa: "عيسى",
  Tarawneh: "طراونة", Majali: "مجالي", Rifai: "رفاعي", Dajani: "دجاني", Hamdan: "حمدان",
};

export const TAG_POOL = [
  "morning", "evening", "student", "corporate", "vip", "pt-interest", "referral",
  "ramadan-hours", "couple", "off-peak",
];

export const NOTE_POOL = [
  "Prefers morning sessions before work.",
  "Asked about freezing during travel in August.",
  "Referred by a colleague from the same office building.",
  "Training for the Amman Marathon — comes in 4x/week.",
  "Requested a trainer introduction for strength basics.",
  "Usually pays cash; asked about CliQ transfers.",
  "Works night shifts, comes in late evening.",
  "Interested in upgrading to the annual plan at renewal.",
  "Asked for a pause during exam period.",
  "Comes with a friend; both on quarterly plans.",
];

export const SENSITIVE_NOTE_POOL = [
  "Knee injury — avoid box jumps per physiotherapist.",
  "Mentioned lower-back disc issue; recommend medical clearance for heavy lifts.",
];

export const LOST_REASONS = [
  "Price too high",
  "Chose a competitor closer to home",
  "No response after multiple attempts",
  "Timing — will reconsider next month",
  "Preferred a gym with a pool",
];

export const CALL_NOTE_POOL = [
  "Spoke briefly, asked for WhatsApp details of the quarterly offer.",
  "No answer — will retry tomorrow morning.",
  "Interested in the annual plan, comparing with another gym's price.",
  "Asked about ladies-only hours.",
  "Wants to bring a friend for a trial on Thursday.",
  "Said the location is convenient; deciding this week.",
  "Asked if the student discount applies to the semi-annual plan.",
  "Requested a callback after 6pm.",
];

export const RENEWAL_OUTCOME_POOL = [
  "Promised to renew this week, waiting for salary.",
  "Asked for the loyalty discount details on WhatsApp.",
  "Will decide after trying the new class schedule.",
  "Renewed over the phone — will pay at the desk tomorrow.",
  "Traveling for two weeks; asked to follow up on return.",
];
