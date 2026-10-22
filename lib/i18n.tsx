'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

const en = {
  'loading': 'Filling the tank…',
  'fallback.title': "This aquarium needs WebGL, which isn't available in this browser right now.",
  'fallback.hint': 'Try enabling hardware acceleration or opening the page in a recent version of Chrome, Edge, Firefox or Safari.',
  'info.label': 'Info',
  'info.day': 'Day {n}',
  'weather.rain': 'Rain',
  'weather.cloudy': 'Cloudy',
  'weather.clear': 'Sunny',
  'light.on': 'Turn aquarium light off',
  'light.off': 'Turn aquarium light on',
  'light.onShort': 'Light off',
  'light.offShort': 'Light on',
  'coins.aria': '{n} coins, open shop',
  'status.label': 'Tank status',
  'status.yourTank': 'Your tank',
  'tank.planted120': 'Planted tank 120cm',
  'status.fish': 'Fish · {n}',
  'status.noFish': 'No fish yet — visit the Shop!',
  'status.satiety': 'Fed',
  'status.satietyAria': 'Fish fullness',
  'status.environment': 'Environment',
  'status.moss': 'Moss',
  'status.mossValue': '{n} clumps',
  'status.algae': 'Algae',
  'status.algaeAria': 'Algae level',
  'status.ph': 'pH',
  'status.phAria': 'pH level',
  'status.oxygen': 'O₂',
  'status.oxygenAria': 'Oxygen level',
  'level.good': 'Good',
  'level.warn': 'Watch',
  'level.bad': 'Poor',
  'nav.settings': 'Settings',
  'nav.shop': 'Shop',
  'actions.label': 'Actions',
  'actions.feed': 'Feed',
  'actions.water': 'Change water',
  'actions.clean': 'Clean tank',
  'actions.waterCost': 'Costs {n} coins',
  'actions.notEnough': 'Not enough coins',
  'toast.fed': 'Fish fed!',
  'toast.noFish': 'No fish to feed yet',
  'toast.water': 'Water changed (−{n} coins)',
  'toast.clean': 'Squeaky clean!',
  'shop.soon': 'The fish and decoration shop opens in a later version.',
  'settings.language': 'Language',
  'settings.credits': 'Credits',
  'fish.betta': 'Betta',
  'fish.tuna': 'Tuna',
  'fish.doubleSaddle': 'Double-Saddle Butterflyfish',
  'fish.powderBlueTang': 'Powder Blue Tang',
  'fish.yellowTang': 'Yellow Tang',
  'fish.caranx': 'Caranx',
  'fish.bannerfish': 'Bannerfish',
  'fish.bicolorAngelfish': 'Bicolor Angelfish',
  'fish.clownTriggerfish': 'Clown Triggerfish',
  'fish.convictTang': 'Convict Tang',
  'fish.emperorAngelfish': 'Emperor Angelfish',
  'fish.juvenileAngelfish': 'Juvenile Angelfish',
  'fish.royalAngelfish': 'Royal Angelfish',
  'fish.threadfin': 'Threadfin Butterflyfish',
  'fish.yellowLongnose': 'Yellow Longnose Butterflyfish',
  'fish.blueTang': 'Blue Tang',
  'fish.purpleTang': 'Purple Tang',
  'fish.copperband': 'Copperband Butterflyfish',
  'fish.linedSurgeon': 'Lined Surgeonfish',
  'fish.flameAngelfish': 'Flame Angelfish',
  'fish.fusilier': 'Fusilier',
  'fish.clownfishBlack': 'Black Clownfish',
  'fish.clownfishOrange': 'Orange Clownfish',
  'fish.discus': 'Discus',
  'common.close': 'Close',
};

export type MessageKey = keyof typeof en;

const vi: Record<MessageKey, string> = {
  'loading': 'Đang đổ nước vào bể…',
  'fallback.title': 'Bể cá cần WebGL nhưng trình duyệt này hiện không hỗ trợ.',
  'fallback.hint': 'Hãy bật tăng tốc phần cứng hoặc mở trang bằng phiên bản mới của Chrome, Edge, Firefox hoặc Safari.',
  'info.label': 'Thông tin',
  'info.day': 'Ngày {n}',
  'weather.rain': 'Mưa',
  'weather.cloudy': 'Nhiều mây',
  'weather.clear': 'Nắng',
  'light.on': 'Tắt đèn bể cá',
  'light.off': 'Bật đèn bể cá',
  'light.onShort': 'Tắt đèn',
  'light.offShort': 'Bật đèn',
  'coins.aria': '{n} coin, mở cửa hàng',
  'status.label': 'Trạng thái bể',
  'status.yourTank': 'Bể của bạn',
  'tank.planted120': 'Bể thủy sinh 120cm',
  'status.fish': 'Cá · {n} con',
  'status.noFish': 'Chưa có cá — ghé Shop nhé!',
  'status.satiety': 'Độ no',
  'status.satietyAria': 'Độ no của cá',
  'status.environment': 'Môi trường',
  'status.moss': 'Rêu',
  'status.mossValue': '{n} cụm',
  'status.algae': 'Tảo',
  'status.algaeAria': 'Mức tảo',
  'status.ph': 'pH',
  'status.phAria': 'Độ pH',
  'status.oxygen': 'Oxy',
  'status.oxygenAria': 'Nồng độ oxy',
  'level.good': 'Tốt',
  'level.warn': 'Chú ý',
  'level.bad': 'Kém',
  'nav.settings': 'Cài đặt',
  'nav.shop': 'Cửa hàng',
  'actions.label': 'Thao tác',
  'actions.feed': 'Cho ăn',
  'actions.water': 'Thay nước',
  'actions.clean': 'Dọn bể',
  'actions.waterCost': 'Tốn {n} coin',
  'actions.notEnough': 'Không đủ coin',
  'toast.fed': 'Đã cho cá ăn!',
  'toast.noFish': 'Bể chưa có cá để cho ăn',
  'toast.water': 'Đã thay nước (−{n} coin)',
  'toast.clean': 'Bể sạch bong rồi!',
  'shop.soon': 'Cửa hàng cá và đồ trang trí sẽ mở trong bản sau.',
  'settings.language': 'Ngôn ngữ',
  'settings.credits': 'Ghi công',
  'fish.betta': 'Cá betta',
  'fish.tuna': 'Cá ngừ',
  'fish.doubleSaddle': 'Cá bướm hai yên',
  'fish.powderBlueTang': 'Cá đuôi gai xanh phấn',
  'fish.yellowTang': 'Cá đuôi gai vàng',
  'fish.caranx': 'Cá khế',
  'fish.bannerfish': 'Cá bướm cờ',
  'fish.bicolorAngelfish': 'Cá thiên thần hai màu',
  'fish.clownTriggerfish': 'Cá bò hề',
  'fish.convictTang': 'Cá đuôi gai sọc',
  'fish.emperorAngelfish': 'Cá thiên thần hoàng đế',
  'fish.juvenileAngelfish': 'Cá thiên thần non',
  'fish.royalAngelfish': 'Cá thiên thần hoàng gia',
  'fish.threadfin': 'Cá bướm vây sợi',
  'fish.yellowLongnose': 'Cá bướm mõm dài vàng',
  'fish.blueTang': 'Cá đuôi gai xanh',
  'fish.purpleTang': 'Cá đuôi gai tím',
  'fish.copperband': 'Cá bướm sọc đồng',
  'fish.linedSurgeon': 'Cá đuôi gai kẻ sọc',
  'fish.flameAngelfish': 'Cá thiên thần lửa',
  'fish.fusilier': 'Cá fusilier',
  'fish.clownfishBlack': 'Cá hề đen',
  'fish.clownfishOrange': 'Cá hề cam',
  'fish.discus': 'Cá đĩa',
  'common.close': 'Đóng',
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, vi };
const STORAGE_KEY = 'fishora.locale';

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translate;
}

const Ctx = createContext<I18n | null>(null);

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start with 'vi' on both server and first client render to avoid a hydration mismatch, then detect.
  const [locale, setLocaleState] = useState<Locale>('vi');

  useEffect(() => setLocaleState(detect()), []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback<Translate>(
    (key, vars) => {
      let msg = MESSAGES[locale][key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) msg = msg.replace(`{${k}}`, String(v));
      return msg;
    },
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
