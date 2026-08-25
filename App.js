const printStyle = `
  @media print {
    #mainAppRoot > *:not(.print-modal-wrapper) { display: none !important; }
    .print-modal-wrapper {
      position: static !important;
      background: none !important;
      overflow: visible !important;
    }
    .print-modal-wrapper > div {
      position: static !important;
      max-width: 100% !important;
      min-height: 0 !important;
      box-shadow: none !important;
      padding: 0 !important;
    }
    .print-modal-wrapper > div > div {
      max-width: 100% !important;
      box-shadow: none !important;
      padding: 6px !important;
    }
    #printableConsent {
      position: static !important;
      width: 100%;
      padding: 10px;
      line-height: 1.5 !important;
    }
    #printableConsent p { margin-bottom: 6px !important; }
    .no-print { display: none !important; }
  }
`;

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// 鎖定繁體中文，阻斷自動翻譯
document.documentElement.lang = "zh-TW";

// ⚡ 初始化您的 Supabase 雲端專案連線
// 🌐 這是「網路投保」專用的新資料庫，請改成您新建立的 Supabase 專案 URL / anon key
// （目前先沿用舊專案設定當佔位，正式使用前務必替換，否則會讀到內部業務員系統的舊資料庫）
const SUPABASE_URL = "https://gdkpjnprlwvsnjxjgouw.supabase.co";
const SUPABASE_KEY = "sb_publishable__0EKAJuODhxIZ6fFoef5Jw_a_Oi7Bbe";
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// 後端規則引擎
const INSURANCE_RATE_ENGINE = {
  versionCode: "V2026_GOLDEN",
  effectiveStartDate: "1150801",
  hullBaseRates: { "01甲式": 0.022, "05乙式": 0.011, "07丙式": 0.0065 },
  theftBaseRate: 0.0058,
  compulsoryBase: { 自小客: 1318, 重型機車: 1470 },
  annualDepreciation: 0.75,
};

// 🚗 23 檔完全體車籍字典 (挑選車種全自動取得價格與c.c.數)

const VEHICLE_OPTIONS = [
  { code: "03", label: "03:自小客" },
  { code: "01", label: "01:重型機車" },
  { code: "02", label: "02:輕型機車" },
  { code: "04", label: "04:自小貨" },
  { code: "05", label: "05:自大客" },
  { code: "06", label: "06:自大貨" },
  { code: "32", label: "32:大型重機" },
  { code: "34", label: "34:小型輕機" },
];

const LIABILITY_INJURY_OPTIONS = [
  { label: "30萬/60萬", base: 1500 },
  { label: "40萬/80萬", base: 1800 },
  { label: "200萬/400萬", base: 2800 },
  { label: "300萬/600萬", base: 3200 },
  { label: "500萬/1000萬", base: 3800 },
];

const LIABILITY_PROP_OPTIONS = [
  { label: "10萬", base: 1100 },
  { label: "20萬", base: 1300 },
  { label: "30萬", base: 1500 },
  { label: "50萬", base: 1700 },
  { label: "100萬", base: 2200 },
];

const PASSENGER_PLAN_OPTIONS = [
  { label: "100萬/400萬", fullPremium: 360, driverPremium: 80 },
  { label: "200萬/800萬", fullPremium: 650, driverPremium: 140 },
  { label: "300萬/1200萬", fullPremium: 1000, driverPremium: 220 },
];

const HULL_DEDUCTIBLE_DICT = {
  0: "不用顯示",
  "3/5/7千元": "3/5/7第一次自付3000，第二次自付5000，第三次及之後自付7000",
  "5/8千元": "第二次自付5000，之後自付8000",
};

// 💡 鋼鐵修正：全自動動態捕獲當前網域，並用標準 + 號實體字串拼接，保證生成可點擊斜線連結！
const generatePromoText = (type, name, plate, total, qid) => {
  const currentDomain = window.location.origin;
  const link = currentDomain + "/?signId=" + qid;
  const header =
    type === "sms"
      ? "【簡訊投保通知】"
      : type === "email"
      ? "【E-mail 即時通知】"
      : "【強制險投保通知】";
  return (
    header +
    "親愛的 " +
    name +
    " 您好，您愛車 " +
    plate +
    " 的強制任意險報價已精算完成，總金額為 NT$ " +
    total.toLocaleString() +
    " 元。請點擊下方連結確認明細並線上簽名：" +
    link
  );
};
const generatePaymentText = (name, plate, total, qid) => {
  const currentDomain = window.location.origin;
  const link = currentDomain + "/?payId=" + qid;
  return (
    "【投保通知】親愛的 " +
    name +
    " 您好，您愛車 " +
    plate +
    " 的汽車險報價已精算完成，總金額為 NT$ " +
    total.toLocaleString() +
    " 元，並至便利商店繳費：" +
    link
  );
};
function PaymentBarcodePage({ record }) {
  const barcodeRef1 = useRef(null);
  const barcodeRef2 = useRef(null);
  const barcodeRef3 = useRef(null);

  useEffect(() => {
    if (!record) return;
    let retryCount = 0;
    const drawBarcodes = () => {
      if (!window.JsBarcode) {
        retryCount++;
        if (retryCount > 25) {
          alert("條碼套件載入逾時，可能是網路環境擋住了外部資源");
          return;
        }
        setTimeout(drawBarcodes, 200);
        return;
      }
      try {
        window.JsBarcode(barcodeRef1.current, record.quoteId, {
          format: "CODE128",
          displayValue: true,
          fontSize: 14,
          height: 50,
        });
        window.JsBarcode(barcodeRef2.current, String(record.totalPremium), {
          format: "CODE128",
          displayValue: true,
          fontSize: 14,
          height: 50,
        });
        window.JsBarcode(barcodeRef3.current, record.dueDate, {
          format: "CODE128",
          displayValue: true,
          fontSize: 14,
          height: 50,
        });
      } catch (e) {
        alert("條碼繪製失敗：" + e.message);
      }
    };
    drawBarcodes();
  }, [record]);

  if (!record) {
    return (
      <div className="container p-4 text-center min-vh-100 d-flex align-items-center justify-content-center bg-white">
        <div className="text-muted">⏳ 正在連線雲端提取繳費資訊...</div>
      </div>
    );
  }

  return (
    <div className="container p-0 min-vh-100 bg-white d-flex align-items-center justify-content-center">
      <div className="w-100" style={{ maxWidth: "420px" }}>
        <div className="bg-danger text-white text-center py-3 fw-bold fs-5">
          產險保費繳款條碼
        </div>
        <div className="bg-light text-center py-3 px-3 border-bottom">
          <div className="fs-5 fw-bold mb-2">
            報價編號：
            <span className="text-primary">{record.quoteId}</span>
          </div>
          <div className="mb-1">被保險人：{record.clientName}</div>
          <div className="mb-1">牌照號碼：{record.carNumber}</div>
          <div className="mb-1">
            繳款金額：NT$ {record.totalPremium.toLocaleString()}
          </div>
          <div>繳費期限：{record.dueDate}</div>
        </div>
        <div className="text-center py-4">
          <svg ref={barcodeRef1} className="mb-3"></svg>
          <br />
          <svg ref={barcodeRef2} className="mb-3"></svg>
          <br />
          <svg ref={barcodeRef3}></svg>
        </div>
        <div className="bg-danger text-white text-center py-2 small">
          7-ELEVEN、全家、萊爾富、OK便利商店
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [historyQuotes, setHistoryQuotes] = useState([]);
  const [brandOptions, setBrandOptions] = useState([]);
  const [hullRateVersions, setHullRateVersions] = useState([]);
  const [hullClaimFactorTable, setHullClaimFactorTable] = useState([]);
  const [hullDeductibleFactorTable, setHullDeductibleFactorTable] = useState(
    []
  );
  const [liabilityCoveragePremiums, setLiabilityCoveragePremiums] = useState(
    []
  );
  const [liabilityClaimFactorTable, setLiabilityClaimFactorTable] = useState(
    []
  );
  const [excessLiabilityRates, setExcessLiabilityRates] = useState([]);
  const [excessBlockedReason, setExcessBlockedReason] = useState("");

  const [theftRateVersions, setTheftRateVersions] = useState([]);
  const [compulsoryRateVersions, setCompulsoryRateVersions] = useState([]);
  const [compulsoryAgeGenderFactors, setCompulsoryAgeGenderFactors] = useState(
    []
  );
  const [compulsoryViolationFactors, setCompulsoryViolationFactors] = useState(
    []
  );

  useEffect(() => {
    const fetchCompulsoryTables = async () => {
      try {
        const [{ data: cr }, { data: ag }, { data: vf }] = await Promise.all([
          supabaseClient.from("compulsory_rate_versions").select("*"),
          supabaseClient.from("compulsory_age_gender_factors").select("*"),
          supabaseClient.from("compulsory_violation_factors").select("*"),
        ]);
        if (cr) setCompulsoryRateVersions(cr);
        if (ag) setCompulsoryAgeGenderFactors(ag);
        if (vf) setCompulsoryViolationFactors(vf);
      } catch (e) {}
    };
    fetchCompulsoryTables();
  }, []);
  const [theftFormulaDetail, setTheftFormulaDetail] = useState(null);
  const [liabilityFormulaDetail, setLiabilityFormulaDetail] = useState(null);
  const [excessFormulaDetail, setExcessFormulaDetail] = useState(null);
  const [passengerFormulaDetail, setPassengerFormulaDetail] = useState(null);
  const [compulsoryFormulaDetail, setCompulsoryFormulaDetail] = useState(null);
  const [verifyType, setVerifyType] = useState("compulsory");
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadDocType, setDownloadDocType] = useState("mobile_sign_consent");
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpPhase, setOtpPhase] = useState("send");
  const [otpCode, setOtpCode] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifiedAt, setOtpVerifiedAt] = useState(null);
  const [midVerified, setMidVerified] = useState(false);
  const [midVerifiedAt, setMidVerifiedAt] = useState(null);
  const [cardVerified, setCardVerified] = useState(false);
  const [cardVerifiedAt, setCardVerifiedAt] = useState(null);

  const sendOtpCode = () => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtpCode(code);
    setOtpPhase("verify");
    alert(
      "📱（模擬簡訊發送）驗證碼已發送至 " +
        (activeSignRecord?.phone || "客戶手機") +
        "\n\n測試用驗證碼：" +
        code
    );
  };

  const verifyOtpCode = () => {
    if (otpInput === otpCode) {
      setOtpVerified(true);
      setOtpVerifiedAt(new Date().toISOString());
      alert("✅ OTP 身分驗證成功！現在可以送出簽名確認書。");
      setShowOtpModal(false);
      setOtpPhase("send");
      setOtpInput("");
    } else {
      alert("❌ 驗證碼錯誤，請重新輸入");
    }
  };

  // 📱 MID（Mobile ID）身分驗證 — 目前為模擬流程，正式串接方式待後續提供
  const verifyMid = () => {
    setMidVerified(true);
    setMidVerifiedAt(new Date().toISOString());
    alert("✅（模擬）MID 手機門號身分驗證通過！");
  };

  // 💳 信用卡持卡人身分驗證 — 目前為模擬流程，正式串接方式待後續提供
  const [cardNumberInput, setCardNumberInput] = useState("");
  const handleCardNumberChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 16);
    const formatted = digits.replace(/(.{4})/g, "$1 ").trim();
    setCardNumberInput(formatted);
  };
  const verifyCard = () => {
    const digits = cardNumberInput.replace(/\s/g, "");
    if (digits.length !== 16) {
      alert("⚠️ 請輸入完整 16 碼信用卡卡號後再進行驗證。");
      return;
    }
    setCardVerified(true);
    setCardVerifiedAt(new Date().toISOString());
    alert("✅（模擬）信用卡持卡人身分驗證通過！");
  };

  // ℹ️ 身分驗證「說明及注意事項」彈窗開關
  const [showVerifyInfoModal, setShowVerifyInfoModal] = useState(false);

  // ================================================================
  // 🤖 AI快速報價（規則式問答版，先跑流程，之後可再串接真AI大腦）
  // ================================================================
  const [showAiQuoteModal, setShowAiQuoteModal] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatStep, setAiChatStep] = useState(0);
  const [aiChatAnswers, setAiChatAnswers] = useState({});
  const [aiListening, setAiListening] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const aiRecognitionRef = useRef(null);

  const aiQuestions = [
    {
      key: "carInfo",
      text: "您好，我是快速報價小幫手 🤖 請問您的愛車是什麼廠牌車型呢？(例如：Toyota Altis)",
    },
    {
      key: "carYear",
      text: "了解，這台車大約是幾年的車呢？(出廠年份，例如 2020，或說「新車」)",
    },
    {
      key: "ageGender",
      text: "方便請教一下要保人的年齡和性別嗎？(例如：35歲 男)",
    },
    {
      key: "claimHistory",
      text: "過去有沒有出過險，或是有酒駕紀錄呢？(沒有的話直接說「沒有」即可)",
    },
    {
      key: "coverageWanted",
      text: "想投保哪些險種呢？(例如：車體險、竊盜險、第三人責任險、乘客險，或是「都要」「基本的就好」)",
    },
    {
      key: "budget",
      text: "最後，大概的預算是多少呢？(例如：2萬以內、不限預算)",
    },
  ];

  const openAiQuoteModal = () => {
    setAiChatMessages([{ role: "ai", text: aiQuestions[0].text }]);
    setAiChatStep(0);
    setAiChatAnswers({});
    setAiChatInput("");
    setAiRecommendation(null);
    setShowAiQuoteModal(true);
  };

  const generateAiRecommendation = (answers) => {
    const wantText = answers.coverageWanted || "";
    const budgetText = answers.budget || "";
    const historyText = answers.claimHistory || "";

    const wantAll = /都要|全部|全險/.test(wantText);
    const wantBasic = /基本|陽春|強制險就好|只要強制/.test(wantText);

    const budgetNumMatch = budgetText.match(/(\d+(\.\d+)?)/);
    let budgetLevel = "mid";
    if (budgetNumMatch) {
      let num = parseFloat(budgetNumMatch[1]);
      if (/萬/.test(budgetText)) num = num * 10000;
      if (num > 0 && num <= 15000) budgetLevel = "low";
      else if (num >= 30000) budgetLevel = "high";
    }
    if (/不限|沒關係|都可以/.test(budgetText)) budgetLevel = "high";

    const hasRisk =
      /(有.*(出險|酒駕)|酒駕)/.test(historyText) &&
      !/沒有|無/.test(historyText);

    const rec = {
      liability: true,
      hull:
        wantAll ||
        /車體|碰撞|自碰/.test(wantText) ||
        (!wantBasic && budgetLevel !== "low"),
      theft:
        wantAll ||
        /竊盜|失竊/.test(wantText) ||
        (!wantBasic && budgetLevel === "high"),
      excess: wantAll || /超額|加保/.test(wantText),
      passenger: wantAll || /乘客/.test(wantText),
    };
    if (wantBasic) {
      rec.hull = false;
      rec.theft = false;
      rec.excess = false;
      rec.passenger = false;
    }

    let note = "";
    if (hasRisk) {
      note =
        "由於您提到過去有出險或酒駕紀錄，實際保費可能會因從人係數而提高，正式試算時請提供詳細紀錄，以利業務員為您確認費率。";
    }

    return { ...rec, note, budgetLevel };
  };

  const handleAiChatSend = () => {
    const text = aiChatInput.trim();
    if (!text) return;
    const currentQuestion = aiQuestions[aiChatStep];
    const newAnswers = { ...aiChatAnswers, [currentQuestion.key]: text };
    const newMessages = [...aiChatMessages, { role: "user", text }];

    const nextStep = aiChatStep + 1;
    if (nextStep < aiQuestions.length) {
      newMessages.push({ role: "ai", text: aiQuestions[nextStep].text });
      setAiChatMessages(newMessages);
      setAiChatAnswers(newAnswers);
      setAiChatStep(nextStep);
    } else {
      const rec = generateAiRecommendation(newAnswers);
      newMessages.push({
        role: "ai",
        text: "謝謝您的說明！根據您提供的資訊，我為您整理出以下建議投保組合，您可以在下方勾選調整，確認後按「帶入主頁繼續試算」即可帶入正式報價表單喔～",
      });
      setAiChatMessages(newMessages);
      setAiChatAnswers(newAnswers);
      setAiRecommendation(rec);
    }
    setAiChatInput("");
  };

  const toggleAiRecommendationItem = (field) => {
    setAiRecommendation((prev) =>
      prev ? { ...prev, [field]: !prev[field] } : prev
    );
  };

  // 「廠牌車系」是綁定資料庫選單的下拉選單，不能塞任意文字進去，
  // 所以用 AI 聊天時打的廠牌車型文字，去brandOptions裡面做寬鬆比對，
  // 找到才用 handleVChg 正確帶入（連同代號/排氣量/重置價格一起連動）。
  const findBrandMatch = (text) => {
    if (!text || !brandOptions || brandOptions.length === 0) return null;
    const norm = text.toUpperCase().replace(/\s+/g, "");
    let match = brandOptions.find((o) =>
      o.label.toUpperCase().replace(/\s+/g, "").includes(norm)
    );
    if (match) return match;
    const tokens = text.toUpperCase().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      match = brandOptions.find((o) => {
        const labelNorm = o.label.toUpperCase();
        return tokens.every((t) => labelNorm.includes(t));
      });
    }
    return match || null;
  };

  // 🔢 從 claimHistory 文字中解析「出險」「酒駕」的次數（找不到明確次數就不亂猜）
  const cnNumMap = {
    一: 1,
    兩: 2,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const parseIncidentCount = (text, keyword) => {
    if (!text) return { count: 0, mentioned: false };
    const negPattern = new RegExp(`(沒有|没有|無)[^，,。]{0,2}${keyword}`);
    if (negPattern.test(text)) return { count: 0, mentioned: false };
    if (!text.includes(keyword)) return { count: 0, mentioned: false };
    const digitMatch = text.match(new RegExp(`${keyword}[^\\d]{0,3}(\\d+)`));
    if (digitMatch)
      return {
        count: Math.min(10, parseInt(digitMatch[1], 10)),
        mentioned: true,
      };
    const cnPattern = new RegExp(
      `${keyword}[^一二兩三四五六七八九十]{0,3}([一二兩三四五六七八九十])次`
    );
    const cnMatch = text.match(cnPattern);
    if (cnMatch) return { count: cnNumMap[cnMatch[1]] || 1, mentioned: true };
    return { count: 0, mentioned: true }; // 有提到但抓不到明確次數
  };

  const applyAiRecommendationToForm = () => {
    if (!aiRecommendation) return;
    setHasLiability(true);
    setHasHull(!!aiRecommendation.hull);
    setHasTheft(!!aiRecommendation.theft);
    setHasExcess(!!aiRecommendation.excess);
    setHasPassenger(!!aiRecommendation.passenger);

    const today = new Date();
    const todayMM = String(today.getMonth() + 1).padStart(2, "0");
    const todayDD = String(today.getDate()).padStart(2, "0");

    const genderText = aiChatAnswers.ageGender || "";
    if (/男/.test(genderText)) setGender("男");
    else if (/女/.test(genderText)) setGender("女");

    // 🎂 生日：用年齡推算出生年(換算民國年)，月/日用今天的月日
    let birthdaySet = false;
    const ageMatch = genderText.match(/\d+/);
    if (ageMatch) {
      const age = parseInt(ageMatch[0], 10);
      if (age > 0 && age < 120) {
        const birthYearWestern = today.getFullYear() - age;
        const rocYear = birthYearWestern - 1911;
        if (rocYear > 0) {
          setBirthday(`${rocYear}${todayMM}${todayDD}`);
          birthdaySet = true;
        }
      }
    }

    // 🚗 製造年月：解析 carYear 回答（支援「2020」「109年」「5年」「新車」等講法）
    const carYearText = aiChatAnswers.carYear || "";
    let manufYear = null;
    if (/新車|今年/.test(carYearText)) {
      manufYear = today.getFullYear();
    } else {
      const numMatch = carYearText.match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        if (num > 1911) {
          manufYear = num; // 西元年，例如 2020
        } else if (num >= 50 && num <= 130) {
          manufYear = num + 1911; // 民國年，例如 109
        } else if (num > 0 && num < 50) {
          manufYear = today.getFullYear() - num; // 車齡，例如「5年」
        }
      }
    }
    let manufactureSet = false;
    if (manufYear) {
      setManufactureDate(`${manufYear}${todayMM}`);
      manufactureSet = true;
    }

    // 🚦 出險/酒駕紀錄：
    // 只簡單問「出險次數」，沒細分是強制/車責/車體哪一種出的，所以改成依「實際有投保的項目」對應套用：
    //   - 強制肇事等級：法定一定有保，永遠套用
    //   - 車責賠款等級：只有這次有勾選第三人責任險才套用
    //   - 車體賠款等級：只有這次有勾選車體險才套用
    // 有出險 → 每次出險 +1 級（各自上限10/10/6）
    // 沒出險 → 新車(車齡0)=預設值，車齡每多一年 -1 級（無賠款折扣逐年累積，各自下限1/1/-3）
    // 這只是簡化版對應，之後查完費率公式的實際理賠次數/級數換算表後，這段邏輯要再換成精算版本。
    const historyText = aiChatAnswers.claimHistory || "";
    const claimInfo = parseIncidentCount(historyText, "出險");
    const duiInfo = parseIncidentCount(historyText, "酒駕");
    const carAge = manufYear
      ? Math.max(0, today.getFullYear() - manufYear)
      : null;

    let levelSet = false;
    if (claimInfo.count > 0) {
      setLevel(String(Math.min(10, 4 + claimInfo.count)));
      if (aiRecommendation.liability) {
        setLiabilityClaimLevel(String(Math.min(10, 4 + claimInfo.count)));
      }
      if (aiRecommendation.hull) {
        setCarDamageLevel(String(Math.min(6, 0 + claimInfo.count)));
      }
      levelSet = true;
    } else if (!claimInfo.mentioned && carAge !== null) {
      setLevel(String(Math.max(1, 4 - carAge)));
      if (aiRecommendation.liability) {
        setLiabilityClaimLevel(String(Math.max(1, 4 - carAge)));
      }
      if (aiRecommendation.hull) {
        setCarDamageLevel(String(Math.max(-3, 0 - carAge)));
      }
      levelSet = true;
    }
    let duiSet = false;
    if (duiInfo.count > 0) {
      setDrunkCount(String(Math.min(10, duiInfo.count)));
      duiSet = true;
    }

    const carInfoText = aiChatAnswers.carInfo || "";
    let brandMatch = null;
    if (carInfoText) {
      brandMatch = findBrandMatch(carInfoText);
      if (brandMatch) {
        handleVChg(brandMatch.label);
      }
    }

    setShowAiQuoteModal(false);

    let msg = "✅ 已為您帶入建議的投保險種";
    if (genderText) msg += "、性別";
    if (birthdaySet) msg += "、生日";
    if (manufactureSet) msg += "、製造年月";
    if (levelSet) msg += "、肇事/賠款等級（依實際投保項目調整）";
    if (duiSet) msg += "、酒駕次數";
    if (brandMatch) msg += `，並自動選取廠牌車系「${brandMatch.label}」`;
    msg += "，請確認車籍、生日與從人資料是否正確後，再進行試算喔！";

    if (carInfoText && !brandMatch) {
      msg += `\n\n⚠️ 系統在車型主檔中找不到與「${carInfoText}」對應的廠牌車系，請於下方「廠牌車系」下拉選單手動選取正確車型。`;
    }
    if (claimInfo.mentioned && !levelSet) {
      msg += `\n\n⚠️ 系統偵測到您提到出險紀錄，但無法判斷確切次數，強制肇事等級／車責賠款等級／車體賠款等級請手動確認。`;
    }
    if (duiInfo.mentioned && !duiSet) {
      msg += `\n\n⚠️ 系統偵測到您提到酒駕紀錄，但無法判斷確切次數，酒駕次數請手動確認。`;
    }
    alert(msg);
  };

  // 🎤 語音輸入（瀏覽器原生語音辨識，不支援的瀏覽器會提示改用打字）
  const toggleAiMic = () => {
    const SpeechRecognitionApi =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionApi) {
      alert("⚠️ 您的瀏覽器不支援語音輸入，請直接用打字輸入喔！");
      return;
    }
    if (aiListening) {
      aiRecognitionRef.current && aiRecognitionRef.current.stop();
      setAiListening(false);
      return;
    }
    const recognition = new SpeechRecognitionApi();
    recognition.lang = "zh-TW";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setAiChatInput((prev) => (prev ? prev + transcript : transcript));
    };
    recognition.onerror = () => setAiListening(false);
    recognition.onend = () => setAiListening(false);
    aiRecognitionRef.current = recognition;
    setAiListening(true);
    recognition.start();
  };

  const [queryLoading, setQueryLoading] = useState(false);
  const openQueryModal = async (qid) => {
    setShowQueryModal(true);
    setQueryLoading(true);
    setQueryRecord(null);
    try {
      const { data, error } = await supabaseClient
        .from("quote_full_records")
        .select("*")
        .eq("quotation_no", qid)
        .single();
      if (!error && data) {
        setQueryRecord(data);
      }
    } catch (e) {}
    setQueryLoading(false);
  };
  const [paymentPageRecord, setPaymentPageRecord] = useState(null);
  const [queryRecord, setQueryRecord] = useState(null);

  useEffect(() => {
    const fetchTheftTable = async () => {
      try {
        const { data } = await supabaseClient
          .from("theft_rate_versions")
          .select("*");
        if (data) setTheftRateVersions(data);
      } catch (e) {}
    };
    fetchTheftTable();
  }, []);
  useEffect(() => {
    const fetchLiabilityTables = async () => {
      try {
        const [{ data: covs }, { data: claims }, { data: excess }] =
          await Promise.all([
            supabaseClient.from("liability_coverage_premiums").select("*"),
            supabaseClient.from("liability_claim_factors").select("*"),
            supabaseClient.from("excess_liability_rates").select("*"),
          ]);
        if (covs) setLiabilityCoveragePremiums(covs);
        if (claims) setLiabilityClaimFactorTable(claims);
        if (excess) setExcessLiabilityRates(excess);
      } catch (e) {}
    };
    fetchLiabilityTables();
  }, []);
  const [hullFormulaDetail, setHullFormulaDetail] = useState(null);
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  useEffect(() => {
    const fetchHullRateTables = async () => {
      try {
        const [{ data: versions }, { data: claims }, { data: deds }] =
          await Promise.all([
            supabaseClient.from("hull_rate_versions").select("*"),
            supabaseClient.from("hull_claim_factors").select("*"),
            supabaseClient.from("hull_deductible_factors").select("*"),
          ]);
        if (versions) setHullRateVersions(versions);
        if (claims) setHullClaimFactorTable(claims);
        if (deds) setHullDeductibleFactorTable(deds);
      } catch (e) {}
    };
    fetchHullRateTables();
  }, []);

  // 🎯 依「起保日」挑出最接近、且不晚於起保日的生效版本
  const pickVersionedRate = (list, dateStr) => {
    if (!list || list.length === 0) return null;
    const target = parseInt(dateStr, 10) || 0;
    const eligible = list.filter(
      (r) => parseInt(r.effective_date, 10) <= target
    );
    const pool = eligible.length > 0 ? eligible : list;
    return pool.reduce((latest, cur) =>
      parseInt(cur.effective_date, 10) > parseInt(latest.effective_date, 10)
        ? cur
        : latest
    );
  };

  // 🚀 頁面載入時，從雲端資料庫 brand_series_rates 撈取車型主檔，取代原本寫死的陣列
  useEffect(() => {
    const fetchVehicleModels = async () => {
      try {
        const { data, error } = await supabaseClient
          .from("brand_series_rates")
          .select("*")
          .order("id", { ascending: true });
        if (!error && data) {
          setBrandOptions(
            data.map((m) => ({
              label: m.label,
              code: m.code,
              value: String(m.value),
              cc: String(m.cc),
              rateFactor: m.rate_factor,
            }))
          );
        }
      } catch (e) {}
    };
    fetchVehicleModels();
  }, []);

  const [isCalc, setIsCalc] = useState(false);

  // 1. 上段：客戶與 CRM 基本資料控制項 useState 宣告
  const [clientName, setClientName] = useState("");
  const [carNumber, setCarNumber] = useState("");
  const [birthday, setBirthday] = useState("480101");
  const [gender, setGender] = useState("女");
  const [vehicle, setVehicle] = useState("03:自小客");
  const [passengerCount, setPassengerCount] = useState("5");
  const [passengerUnit, setPassengerUnit] = useState("人");
  const [phone, setPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // 2. 中段：雙軌保期與車籍控制項 (起保日預設 1150808 今日綠字)
  const getTodayMinguo = () => {
    const now = new Date();
    const y = now.getFullYear() - 1911;
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };
  const [startDate, setStartDate] = useState(getTodayMinguo());
  const [endDateCompulsory, setEndDateCompulsory] = useState("1160808");
  const [startDateArbitrary, setStartDateArbitrary] = useState(
    getTodayMinguo()
  );
  const [endDateArbitrary, setEndDateArbitrary] = useState("1160808");
  const [mergedBrandSeries, setMergedBrandSeries] = useState("");
  const [modelCode, setModelCode] = useState("");
  const [issueDate, setIssueDate] = useState(getTodayMinguo().substring(0, 5));
  const [manufactureDate, setManufactureDate] = useState(
    `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(
      2,
      "0"
    )}`
  );
  const [engineDisplacement, setEngineDisplacement] = useState("");
  const [replacementValue, setReplacementValue] = useState("");

  // 💡 修正問題 2：新增即時動態折舊後商品保額狀態變數，不需試算即可動態拋轉
  const [depreciatedInsuredValue, setDepreciatedInsuredValue] = useState(0);

  // 車籍精算衍生項目
  const [carAge, setCarAge] = useState(0);
  const [rateCode, setRateCode] = useState(1.8);

  // 六欄位從人矩陣狀態
  const [level, setLevel] = useState("4");
  const [drunkCount, setDrunkCount] = useState("0");
  const [liabilityClaimLevel, setLiabilityClaimLevel] = useState("4");
  const [liabilityClaimFactor, setLiabilityClaimFactor] = useState(1.0);
  const [hullClaimLevel, setCarDamageLevel] = useState("0");
  const [hullClaimFactor, setHullClaimFactor] = useState(1.0);

  // 3. 下段：五大投保險種選單狀態 (左側直接打勾)
  const [hasHull, setHasHull] = useState(false);
  const [hullType, setHullType] = useState("07丙式");
  const [hullDeductible, setHullDeductible] = useState("0");
  const [hasTheft, setHasTheft] = useState(false);
  const [theftDeductible, setTheftDeductible] = useState("10%");
  const [hasLiability, setHasLiability] = useState(false);
  const [liabilityCoverage, setLiabilityCoverage] = useState("200萬/400萬");
  const [liabilityProperty, setLiabilityProperty] = useState("30萬");
  const [hasExcess, setHasExcess] = useState(false);
  const [excessLimit, setExcessCoverage] = useState("1000萬");
  const [hasPassenger, setHasPassenger] = useState(false);
  const [passengerType, setPassengerType] = useState("保整車");
  const [passengerPlan, setPassengerPlan] = useState("100萬/400萬");

  // 💰 險種獨立保費格狀態
  const [hullPremium, setHullPremium] = useState(0);
  const [theftPremium, setTheftPremium] = useState(0);
  const [liabilityPremiumInjury, setLiabilityPremiumInjury] = useState(0);
  const [liabilityPremiumProperty, setLiabilityPremiumProperty] = useState(0);
  const [excessPremium, setExcessPremium] = useState(0);
  const [passengerPremium, setPassengerPremium] = useState(0);

  // 底部三大總額看板狀態
  const [compulsoryPremium, setCompulsoryPremium] = useState(0);
  const [arbitraryPremium, setArbitraryPremium] = useState(0);
  const [totalPremium, setTotalPremium] = useState(0);

  // 雙彈窗與手寫簽名控制變數
  const [showSignModal, setShowSignModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [activeSignRecord, setActiveSignRecord] = useState(null);
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const [isSigned, setIsSigned] = useState(false);
  // 💡 修正問題 2：輸入重置價格及製造年月後，自動即時運算折舊後價值（萬元），隨時供車體與竊盜險右方顯示保額
  useEffect(() => {
    if (!manufactureDate || manufactureDate.length < 4 || !replacementValue) {
      setDepreciatedInsuredValue(0);
      return;
    }
    const currentWestYear = 2026;
    const mfWestYear = parseInt(manufactureDate.substring(0, 4)) || 2026;
    const calculatedAge = Math.max(0, currentWestYear - mfWestYear);
    setCarAge(calculatedAge);
    const originalValue = parseFloat(replacementValue) || 0;
    setDepreciatedInsuredValue(
      Math.round(originalValue * Math.pow(0.75, calculatedAge) * 10) / 10
    );
    setIsCalc(false);
  }, [manufactureDate, replacementValue]);

  // 六欄位從人係數換算連動
  useEffect(() => {
    const liveLiabPool = liabilityClaimFactorTable.filter(
      (r) =>
        !liabilityVersion ||
        r.effective_date === liabilityVersion.effective_date
    );
    const liveLiabRecord = liveLiabPool.find(
      (r) => r.claim_level === parseInt(liabilityClaimLevel)
    );
    setLiabilityClaimFactor(
      liveLiabRecord ? parseFloat(liveLiabRecord.factor) : 0
    );
    const liveVersion = pickVersionedRate(hullRateVersions, startDate);
    const livePool = hullClaimFactorTable.filter(
      (r) =>
        r.effective_date === (liveVersion ? liveVersion.effective_date : null)
    );
    const liveRecord = livePool.find(
      (r) => r.claim_level === parseInt(hullClaimLevel)
    );
    setHullClaimFactor(
      liveRecord
        ? parseFloat(liveRecord.factor)
        : (parseInt(hullClaimLevel) || 0) * 0.2
    );
    setIsCalc(false);
  }, [liabilityClaimLevel, hullClaimLevel]);

  // 💡 修正問題 3：雙軌保期連動 (投保機車車種 01/02/32/34 時，到期日自動動態預設為 2 年後)
  useEffect(() => {
    if (!startDate || startDate.length < 6) return;
    const sy = parseInt(startDate.substring(0, startDate.length - 4));
    const md = startDate.substring(startDate.length - 4);
    if (isNaN(sy)) return;
    const isM = ["01", "02", "32", "34"].some((c) => vehicle.startsWith(c));
    setEndDateCompulsory(String(sy + (isM ? 2 : 1)) + md);
    setIsCalc(false);
  }, [startDate, vehicle]);

  useEffect(() => {
    if (!startDateArbitrary || startDateArbitrary.length < 6) return;
    const sy = parseInt(
      startDateArbitrary.substring(0, startDateArbitrary.length - 4)
    );
    const md = startDateArbitrary.substring(startDateArbitrary.length - 4);
    if (isNaN(sy)) return;
    setEndDateArbitrary(String(sy + 1) + md);
    setIsCalc(false);
  }, [startDateArbitrary]);

  useEffect(() => {
    const rows = liabilityCoveragePremiums.filter(
      (r) => r.injury_coverage === liabilityCoverage
    );
    if (
      rows.length > 0 &&
      !rows.some((r) => r.property_coverage === liabilityProperty)
    ) {
      setLiabilityProperty(rows[0].property_coverage);
    }
  }, [liabilityCoverage, liabilityCoveragePremiums]);
  // 💡 修正問題 1：挑選廠牌車型後，自動取得重置價格、排氣量、廠型代號
  const handleVChg = (lbl) => {
    setMergedBrandSeries(lbl);
    const m = brandOptions.find((i) => i.label === lbl);
    if (m) {
      setModelCode(m.code);
      setRateCode(m.rateFactor);
      setEngineDisplacement(m.cc);
      setReplacementValue(m.value);
    }
    setIsCalc(false);
  };

  useEffect(() => {
    if (hullType === "07丙式") setHullDeductible("0");
  }, [hullType]);

  useEffect(() => {
    if (!hasLiability) setHasExcess(false);
  }, [hasLiability]);
  // 💳 客戶點「繳費」連結進來，抓取該筆報價的繳費資訊
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payId = params.get("payId");
    if (payId) {
      const fetchPaymentInfo = async () => {
        try {
          const { data, error } = await supabaseClient
            .from("insurance_quotations")
            .select("*")
            .eq("quotation_no", payId)
            .single();
          if (!error && data) {
            const snap = data.ui_state_snapshot || {};
            const dueDate =
              parseInt(snap.compulsoryStartDate) <=
              parseInt(snap.arbitraryStartDate)
                ? snap.compulsoryStartDate
                : snap.arbitraryStartDate;
            setPaymentPageRecord({
              quoteId: data.quotation_no,
              clientName: data.client_name,
              carNumber: data.plate_no,
              totalPremium: data.total_premium || 0,
              dueDate: dueDate || "-",
            });
          }
        } catch (e) {}
      };
      fetchPaymentInfo();
    }
  }, [window.location.search]);
  // 🚀 智慧型網址單號強行攔截大腦 (內聯合體：100% 解決客戶端姓名與保費漏同步、卡在提取中的缺陷)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const signId = params.get("signId");
    if (signId) {
      const fetchSingleQuote = async () => {
        try {
          const { data, error } = await supabaseClient
            .from("insurance_quotations")
            .select("*")
            .eq("quotation_no", signId)
            .single();
          if (!error && data) {
            setClientName(data.client_name);
            setCarNumber(data.plate_no);
            setVehicle(data.vehicle_type_display || "03:自小客");
            setCompulsoryPremium(data.forced_premium || 0);
            setArbitraryPremium(data.arbitrary_premium || 0);
            setTotalPremium(data.total_premium || 0);
            // 📞 電話號碼一律以 quote_full_records 的頂層 phone 欄位為準，不再依賴 ui_state_snapshot
            let phoneValue = "";
            try {
              const { data: fullRecord } = await supabaseClient
                .from("quote_full_records")
                .select("phone")
                .eq("quotation_no", signId)
                .single();
              phoneValue = fullRecord?.phone || "";
            } catch (e2) {}
            setActiveSignRecord({
              quoteId: data.quotation_no,
              clientName: data.client_name,
              carNumber: data.plate_no,
              vehicle: data.vehicle_type_display,
              totalPremium: data.total_premium,
              phone: phoneValue,
            });
            setShowSignModal(true); // 💡 網址參數有 signId 時，強制點火彈出手寫簽名畫面！
          }
        } catch (e) {}
      };
      fetchSingleQuote();
    }
  }, [window.location.search]);

  // 🚀 1. 唯一的精算核心大腦 (包含所有從人係數與機車強制險去加成公式)
  const applicableDeductibles = (() => {
    const v = pickVersionedRate(hullRateVersions, startDate);
    if (!v) return [];
    return hullDeductibleFactorTable.filter(
      (r) => r.effective_date === v.effective_date
    );
  })();
  const liabilityVersion = pickVersionedRate(
    liabilityCoveragePremiums.length
      ? [
          ...new Set(liabilityCoveragePremiums.map((r) => r.effective_date)),
        ].map((d) => ({ effective_date: d }))
      : [],
    startDateArbitrary
  );
  const liabilityRows = liabilityCoveragePremiums.filter(
    (r) =>
      !liabilityVersion || r.effective_date === liabilityVersion.effective_date
  );
  const injuryOptions = [
    ...new Set(liabilityRows.map((r) => r.injury_coverage)),
  ];
  const propertyOptions = liabilityRows
    .filter((r) => r.injury_coverage === liabilityCoverage)
    .map((r) => r.property_coverage);
  const triggerCalc = async () => {
    const currentYear = 115;
    const age = currentYear - (parseInt(birthday.substring(0, 2)) || 48);
    let activeRule = INSURANCE_RATE_ENGINE;

    const { data: ageFactors } = await supabaseClient
      .from("age_gender_factors")
      .select("*")
      .lte("age_min", age)
      .gte("age_max", age);
    const ageFactorRecord =
      ageFactors && ageFactors.length > 0
        ? ageFactors[0]
        : { male_factor: 1.1, female_factor: 1.0 };
    const ageGenderFactor =
      gender === "女"
        ? parseFloat(ageFactorRecord.female_factor)
        : parseFloat(ageFactorRecord.male_factor);

    const originalValue = (parseFloat(replacementValue) || 0) * 10000;
    const depreciatedValue = Math.round(
      originalValue * Math.pow(activeRule.annualDepreciation, carAge)
    );

    let p_hull = 0,
      p_theft = 0,
      p_liab_inj = 0,
      p_liab_prop = 0,
      p_excess = 0,
      p_passenger = 0;
    const hullVersion = pickVersionedRate(hullRateVersions, startDate) || {
      effective_date: "預設",
      depreciation_rate: 0.75,
      base_rate_a: 0.022,
      base_rate_b: 0.011,
      base_rate_c: 0.0065,
    };
    const hullClaimPool = hullClaimFactorTable.filter(
      (r) => r.effective_date === hullVersion.effective_date
    );
    const hullClaimRecord = hullClaimPool.find(
      (r) => r.claim_level === parseInt(hullClaimLevel)
    );
    const hullClaimFactorValue = hullClaimRecord
      ? parseFloat(hullClaimRecord.factor)
      : (parseInt(hullClaimLevel) || 0) * 0.2;

    if (hasHull) {
      const baseRate =
        hullType === "01甲式"
          ? hullVersion.base_rate_a
          : hullType === "05乙式"
          ? hullVersion.base_rate_b
          : hullVersion.base_rate_c;
      const basicPremium = depreciatedValue * baseRate;
      const dedPool = hullDeductibleFactorTable.filter(
        (r) => r.effective_date === hullVersion.effective_date
      );
      const dedRecord = dedPool.find(
        (r) => r.deductible_label === hullDeductible
      );
      let dedFactor = dedRecord ? parseFloat(dedRecord.factor) : 1.0;
      const beforeDeductible =
        basicPremium * rateCode * (ageGenderFactor + hullClaimFactorValue);
      p_hull = Math.round(
        hullType === "07丙式" ? beforeDeductible : beforeDeductible * dedFactor
      );

      // 📋 記錄計算明細，供「查看公式」按鈕顯示驗證用
      setHullFormulaDetail({
        effectiveDate: hullVersion.effective_date,
        replacementValue: originalValue,
        depreciationRate: hullVersion.depreciation_rate,
        carAge,
        depreciatedValue,
        baseRate,
        basicPremium: Math.round(basicPremium),
        rateCode,
        ageGenderFactor,
        hullClaimFactorValue,
        dedFactor: hullType === "07丙式" ? 1.0 : dedFactor,
        beforeDeductible: Math.round(beforeDeductible),
        finalPremium: p_hull,
      });
    }
    if (hasTheft) {
      const theftVersion = pickVersionedRate(
        theftRateVersions,
        startDateArbitrary
      );
      const depreciatedValueWan = depreciatedValue / 10000;
      const theftRow = theftRateVersions.find(
        (r) =>
          (!theftVersion || r.effective_date === theftVersion.effective_date) &&
          depreciatedValueWan >= r.value_min &&
          depreciatedValueWan < r.value_max
      ) || { base_rate: 0.006, risk_factor: 0.95 };
      const theftDedFactor =
        theftDeductible === "20%" ? 0.8 : theftDeductible === "10%" ? 0.9 : 1.0;
      const theftBeforeDed =
        depreciatedValue * theftRow.base_rate * theftRow.risk_factor;
      p_theft = Math.round(theftBeforeDed * theftDedFactor);
      setTheftFormulaDetail({
        depreciatedValue,
        baseRate: theftRow.base_rate,
        riskFactor: theftRow.risk_factor,
        beforeDed: Math.round(theftBeforeDed),
        dedFactor: theftDedFactor,
        finalPremium: p_theft,
      });
    }
    let liabilityClaimFactorValue = 0;
    if (hasLiability) {
      const claimPool = liabilityClaimFactorTable.filter(
        (r) =>
          !liabilityVersion ||
          r.effective_date === liabilityVersion.effective_date
      );
      const claimRecord = claimPool.find(
        (r) => r.claim_level === parseInt(liabilityClaimLevel)
      );
      liabilityClaimFactorValue = claimRecord
        ? parseFloat(claimRecord.factor)
        : 0;

      const combo = liabilityRows.find(
        (r) =>
          r.injury_coverage === liabilityCoverage &&
          r.property_coverage === liabilityProperty
      );
      const multiplier = 1 + ageGenderFactor + liabilityClaimFactorValue;
      if (combo) {
        p_liab_inj = Math.round(combo.injury_premium * multiplier);
        p_liab_prop = Math.round(combo.property_premium * multiplier);
        setLiabilityFormulaDetail({
          injuryCoverage: liabilityCoverage,
          propertyCoverage: liabilityProperty,
          injuryBase: combo.injury_premium,
          propertyBase: combo.property_premium,
          ageGenderFactor,
          claimFactor: liabilityClaimFactorValue,
          multiplier,
          p_liab_inj,
          p_liab_prop,
        });
      }
    }
    if (hasExcess && hasLiability) {
      const excessPool = excessLiabilityRates.filter(
        (r) =>
          !liabilityVersion ||
          r.effective_date === liabilityVersion.effective_date
      );
      const excessRecord = excessPool.find(
        (r) => r.excess_coverage === excessLimit
      );
      if (excessRecord) {
        const injuryRank = (label) => parseInt(label) || 0; // "300萬/600萬" → 300
        const injuryOk =
          injuryRank(liabilityCoverage) >=
          injuryRank(excessRecord.min_injury_required);
        const propertyOk =
          parseFloat(liabilityProperty) >= excessRecord.min_property_required;
        if (!injuryOk || !propertyOk) {
          const injuryParts =
            excessRecord.min_injury_required.match(/\d+/g) || [];
          const reason = `第三人責任險保額須為${injuryParts[0] || "?"}/${
            injuryParts[1] || "?"
          }/${excessRecord.min_property_required}萬以上`;
          setExcessBlockedReason(reason);
          alert("⚠️ 無法試算：" + reason);
          return;
        }
        setExcessBlockedReason("");
        p_excess = excessRecord.base_premium;
        setExcessFormulaDetail({
          excessLimit,
          minInjuryRequired: excessRecord.min_injury_required,
          minPropertyRequired: excessRecord.min_property_required,
          basePremium: excessRecord.base_premium,
        });
      }
    } else {
      setExcessBlockedReason("");
      setExcessFormulaDetail(null);
    }
    if (hasPassenger) {
      const planObj = PASSENGER_PLAN_OPTIONS.find((o) =>
        o.label.includes(passengerPlan)
      ) || { fullPremium: 360, driverPremium: 80 };
      p_passenger =
        passengerType === "保整車"
          ? planObj.fullPremium
          : planObj.driverPremium;
      setPassengerFormulaDetail({
        passengerType,
        passengerPlan,
        fullPremium: planObj.fullPremium,
        driverPremium: planObj.driverPremium,
        finalPremium: p_passenger,
      });
    }

    // 💡 修正問題 3：如果是機車，強制險全自動與從人等級、酒駕次數切斷加成，維持基準費不予乘積
    const isHeavyMotor = ["01", "02", "32", "34"].some((c) =>
      vehicle.startsWith(c)
    );
    const vehicleCategory = isHeavyMotor ? "普通重型機車" : "自用小客車";
    const compulsoryVersion = pickVersionedRate(
      compulsoryRateVersions.length
        ? [...new Set(compulsoryRateVersions.map((r) => r.effective_date))].map(
            (d) => ({ effective_date: d })
          )
        : [],
      startDate
    );
    const cRow = compulsoryRateVersions.find(
      (r) =>
        (!compulsoryVersion ||
          r.effective_date === compulsoryVersion.effective_date) &&
        r.vehicle_category === vehicleCategory
    ) || {
      base_premium: isHeavyMotor ? 658 : 965.15,
      business_fee: isHeavyMotor ? 181 : 387.8,
      special_fund_rate: isHeavyMotor ? 0.02 : 0.03,
      stability_fund_rate: 0.002,
    };

    let adjustedNetPremium;
    let ageGenderFactorC = null;
    let violationFactorC = null;

    if (isHeavyMotor) {
      adjustedNetPremium = cRow.base_premium;
    } else {
      const agPool = compulsoryAgeGenderFactors.filter(
        (r) =>
          !compulsoryVersion ||
          r.effective_date === compulsoryVersion.effective_date
      );
      const agRecord = agPool.find(
        (r) => r.gender === gender && age >= r.age_min && age <= r.age_max
      );
      ageGenderFactorC = agRecord ? parseFloat(agRecord.factor) : 1.0;

      const vPool = compulsoryViolationFactors.filter(
        (r) =>
          !compulsoryVersion ||
          r.effective_date === compulsoryVersion.effective_date
      );
      const vRecord = vPool.find((r) => r.level === parseInt(level));
      violationFactorC = vRecord ? parseFloat(vRecord.factor) : 1.0;

      adjustedNetPremium =
        cRow.base_premium * (ageGenderFactorC + violationFactorC - 1);
    }

    const drunkSurcharge = isHeavyMotor ? 0 : parseInt(drunkCount) * 3600;
    let cp =
      Math.round(
        (adjustedNetPremium + cRow.business_fee) /
          (1 - cRow.special_fund_rate - cRow.stability_fund_rate)
      ) + drunkSurcharge;

    setCompulsoryFormulaDetail({
      vehicleCategory,
      basePremium: cRow.base_premium,
      ageGenderFactor: ageGenderFactorC,
      violationFactor: violationFactorC,
      adjustedNetPremium: Math.round(adjustedNetPremium),
      businessFee: cRow.business_fee,
      specialFundRate: cRow.special_fund_rate,
      stabilityFundRate: cRow.stability_fund_rate,
      drunkSurcharge,
      cp,
    });

    setHullPremium(p_hull);
    setTheftPremium(p_theft);
    setLiabilityPremiumInjury(p_liab_inj);
    setLiabilityPremiumProperty(p_liab_prop);
    setExcessPremium(p_excess);
    setPassengerPremium(p_passenger);
    setCompulsoryPremium(cp);
    setArbitraryPremium(
      p_hull + p_theft + p_liab_inj + p_liab_prop + p_excess + p_passenger
    );
    setTotalPremium(
      cp + p_hull + p_theft + p_liab_inj + p_liab_prop + p_excess + p_passenger
    );
    setIsCalc(true);
    alert(
      "精算對帳單完成！總金額為 NT$ " +
        (
          cp +
          p_hull +
          p_theft +
          p_liab_inj +
          p_liab_prop +
          p_excess +
          p_passenger
        ).toLocaleString() +
        " 元。"
    );
  };

  // 🚀 修正問題 2：精確對齊大表的資料欄位，讓一覽表的起保與到期日 100% 彩色現形！
  // 📞 電話號碼一律以 quote_full_records 的頂層 phone 欄位為準，不再依賴 ui_state_snapshot（新舊資料格式不一致，該欄位不可靠）
  // 📋 簽署狀態優先以 quote_full_records.sign_status 為準（有真實簽名圖檔／OTP驗證紀錄佐證），沒有值才 fallback 回 insurance_quotations.status，避免兩表不同步時畫面誤導
  const fetchHistory = async () => {
    try {
      const { data } = await supabaseClient
        .from("insurance_quotations")
        .select("*")
        .order("quotation_no", { ascending: false });
      if (data) {
        // 撈 quote_full_records 的 quotation_no -> phone / sign_status 對照表
        const quoteNos = data.map((item) => item.quotation_no);
        const phoneMap = {};
        const signStatusMap = {};
        if (quoteNos.length > 0) {
          const { data: fullRows } = await supabaseClient
            .from("quote_full_records")
            .select("quotation_no, phone, sign_status")
            .in("quotation_no", quoteNos);
          (fullRows || []).forEach((row) => {
            phoneMap[row.quotation_no] = row.phone || "";
            signStatusMap[row.quotation_no] = row.sign_status || "";
          });
        }
        setHistoryQuotes(
          data.map((item) => {
            const snap = item.ui_state_snapshot || {};
            return {
              quoteId: item.quotation_no,
              clientName: item.client_name,
              carNumber: item.plate_no,
              vehicle: item.vehicle_type_display || "03:自小客",
              compulsoryPremium: item.forced_premium || 0,
              arbitraryPremium: item.arbitrary_premium || 0,
              totalPremium: item.total_premium || 0,
              status:
                signStatusMap[item.quotation_no] || item.status || "待簽署",
              compulsoryStartDate: snap.compulsoryStartDate || "-",
              compulsoryEndDate: snap.compulsoryEndDate || "-",
              arbitraryStartDate: snap.arbitraryStartDate || "-",
              arbitraryEndDate: snap.arbitraryEndDate || "-",
              clientEmail: snap.clientEmail || "",
              phone: phoneMap[item.quotation_no] || "",
              coverageItems: snap.coverageItems || [],
            };
          })
        );
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // 🚀 修正問題 1：補上看板與垃圾桶刪除所需的註銷功能函數
  const handleDeleteRecord = async (qid) => {
    if (!window.confirm("⚠️ 確定要註銷並刪除這筆報價單嗎？")) return;
    try {
      await supabaseClient
        .from("insurance_quotations")
        .delete()
        .eq("quotation_no", qid);
    } catch (e) {}
    setHistoryQuotes(historyQuotes.filter((q) => q.quoteId !== qid));
    alert("🗑️ 報價紀錄已成功註銷刪除。");
  };

  // 🚀 2. 精算並儲存報價單 (💡 修正問題 5：跨日期偵測流水序號強制從 00001 重頭開始)
  const handleSave = async () => {
    if (!phone) {
      alert("⚠️ 行動電話為必填欄位，請填寫後再試算並儲存報價單。");
      return;
    }
    if (!clientName || !carNumber) {
      alert("請填寫姓名與車號！");
      return;
    }
    try {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const prefix = "Q" + todayStr;
      const nextSerial =
        historyQuotes.filter((q) => q.quoteId.startsWith(prefix)).length + 1;
      const qid = prefix + String(nextSerial).padStart(5, "0");
      const fileName = qid + "_" + clientName + ".pdf";

      const coverageItems = [
        { code: "21", name: "強制責任保險", amount: compulsoryPremium },
      ];
      if (hasHull)
        coverageItems.push({
          code: hullType.substring(0, 2),
          name: `車體損失險(${hullType})`,
          amount: hullPremium,
        });
      if (hasTheft)
        coverageItems.push({
          code: "11",
          name: "竊盜損失險",
          amount: theftPremium,
        });
      if (hasLiability) {
        coverageItems.push({
          code: "31",
          name: `第三人體傷險(${liabilityCoverage})`,
          amount: liabilityPremiumInjury,
        });
        coverageItems.push({
          code: "32",
          name: `第三人財損險(${liabilityProperty})`,
          amount: liabilityPremiumProperty,
        });
      }
      if (hasExcess)
        coverageItems.push({
          code: "34",
          name: `第三人超額險(${excessLimit})`,
          amount: excessPremium,
        });
      if (hasPassenger)
        coverageItems.push({
          code: "54",
          name: "乘客責任險",
          amount: passengerPremium,
        });

      await supabaseClient.from("quote_full_records").insert([
        {
          quotation_no: qid,
          client_name: clientName,
          phone: phone,
          client_email: clientEmail,
          birthday: birthday,
          gender: gender,
          passenger_count: passengerCount,
          passenger_unit: passengerUnit,
          plate_no: carNumber,
          vehicle_type_display: vehicle,
          brand_series: mergedBrandSeries,
          model_code: modelCode,
          engine_displacement: engineDisplacement,
          replacement_value: replacementValue,
          manufacture_date: manufactureDate,
          issue_date: issueDate,
          compulsory_start_date: startDate,
          compulsory_end_date: endDateCompulsory,
          arbitrary_start_date: startDateArbitrary,
          arbitrary_end_date: endDateArbitrary,
          coverage_items: coverageItems,
          compulsory_premium: compulsoryPremium,
          arbitrary_premium: arbitraryPremium,
          total_premium: totalPremium,
          sign_status: "待簽署",
          payment_status: "未繳費",
          otp_verified: false,
          mid_verified: false,
          card_verified: false,
        },
      ]);

      await supabaseClient.from("insurance_quotations").insert([
        {
          quotation_no: qid,
          client_name: clientName,
          plate_no: carNumber,
          vehicle_type_display: vehicle,
          forced_premium: compulsoryPremium,
          arbitrary_premium: arbitraryPremium,
          total_premium: totalPremium,
          status: "待簽署",
          ui_state_snapshot: {
            compulsoryStartDate: startDate,
            compulsoryEndDate: endDateCompulsory,
            arbitraryStartDate: startDateArbitrary,
            arbitraryEndDate: endDateArbitrary,
            clientEmail: clientEmail,
            phone: phone,
            coverageItems: coverageItems,
          },
        },
      ]);
      setHistoryQuotes([
        {
          quoteId: qid,
          clientName,
          carNumber,
          vehicle,
          compulsoryPremium,
          arbitraryPremium,
          totalPremium,
          status: "待簽署",
          compulsoryStartDate: startDate,
          compulsoryEndDate: endDateCompulsory,
          arbitraryStartDate: startDateArbitrary,
          arbitraryEndDate: endDateArbitrary,
          clientEmail: clientEmail,
          phone: phone,
          coverageItems: coverageItems,
        },
        ...historyQuotes,
      ]);
      alert(
        "儲存成功！單號：" + qid + "\n商用存檔檔案已歸檔為：[" + fileName + "]"
      );
      // 🧹 完整清空表單，比照第一次開啟報價系統的預設畫面
      setClientName("");
      setCarNumber("");
      setBirthday("480101");
      setGender("女");
      setVehicle("03:自小客");
      setPassengerCount("5");
      setPassengerUnit("人");
      setPhone("");
      setClientEmail("");
      setStartDate(getTodayMinguo());
      setStartDateArbitrary(getTodayMinguo());
      setMergedBrandSeries("");
      setModelCode("");
      setIssueDate(getTodayMinguo().substring(0, 5));
      setManufactureDate(
        `${new Date().getFullYear()}${String(
          new Date().getMonth() + 1
        ).padStart(2, "0")}`
      );
      setEngineDisplacement("");
      setReplacementValue("");
      setLevel("4");
      setDrunkCount("0");
      setLiabilityClaimLevel("4");
      setCarDamageLevel("0");
      setHasHull(false);
      setHullType("07丙式");
      setHullDeductible("0");
      setHasTheft(false);
      setTheftDeductible("10%");
      setHasLiability(false);
      setLiabilityCoverage("200萬/400萬");
      setLiabilityProperty("30萬");
      setHasExcess(false);
      setExcessCoverage("1000萬");
      setHasPassenger(false);
      setPassengerType("保整車");
      setPassengerPlan("100萬/400萬");
      setIsCalc(false);
    } catch (err) {}
  };

  // ==========================================
  // 🚀 3. 三軌通訊外發渠道 (💡 修正問題 5：精確對齊內文變數，100% 絕對強制外彈信箱)
  // ==========================================
  const triggerPaymentSend = (item) => {
    const dueDate =
      parseInt(item.compulsoryStartDate) <= parseInt(item.arbitraryStartDate)
        ? item.compulsoryStartDate
        : item.arbitraryStartDate;
    const messageText = generatePaymentText(
      item.clientName,
      item.carNumber,
      item.totalPremium,
      item.quoteId
    );
    navigator.clipboard.writeText(messageText).catch(() => {});
    const lineUrl =
      "https://line.me/R/msg/text/?" + encodeURIComponent(messageText);
    window.open(lineUrl, "_blank");
  };
  const triggerSendAction = (channel, item) => {
    const messageText = generatePromoText(
      channel,
      item.clientName,
      item.carNumber,
      item.totalPremium,
      item.quoteId
    );
    navigator.clipboard.writeText(messageText).catch(() => {});

    if (channel === "line") {
      window.open(
        "https://line.me/R/msg/text/?" + encodeURIComponent(messageText),
        "_blank"
      );
    } else if (channel === "sms") {
      window.location.href =
        "sms:" +
        (item.phone || phone || "") +
        "?&body=" +
        encodeURIComponent(messageText);
    } else if (channel === "email") {
      // 🎯 修正核心：改用標準的實體字串拼接格式，您的 Outlook 或電腦預設信箱草稿匣將會 100% 一秒自動外彈！
      window.location.href =
        "mailto:" +
        (item.clientEmail || clientEmail || "") +
        "?subject=" +
        encodeURIComponent("車險報價通知") +
        "&body=" +
        encodeURIComponent(messageText);
    }
  };

  // ==========================================
  // ✍️ 4. 手寫 Canvas 事件感應與【內聯全自動除名大腦】
  // ==========================================
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    // 🎯 換算「畫布顯示尺寸」與「畫布內部解析度」的比例差，消除手機縮放偏移
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // 📱 鎖定手機下拉/橡皮筋滑動，簽名時畫面不會跑掉
  useEffect(() => {
    const preventScroll = (e) => {
      if (e.target && e.target.tagName === "CANVAS" && e.cancelable) {
        e.preventDefault();
      }
    };
    window.addEventListener("touchmove", preventScroll, { passive: false });
    return () => window.removeEventListener("touchmove", preventScroll);
  }, []);

  const startDrawing = (e) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };
  const clearCanvas = () => {
    if (canvasRef.current)
      canvasRef.current
        .getContext("2d")
        .clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const submitSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const buffer = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const isBlank = !buffer.data.some((color) => color !== 0);
    if (isBlank) {
      alert("⚠️ 偵測到畫布空白！請先簽名。");
      return;
    }

    if (activeSignRecord) {
      try {
        const signatureImage = canvas.toDataURL("image/png");
        const { error: iqError } = await supabaseClient
          .from("insurance_quotations")
          .update({ status: "已簽署" })
          .eq("quotation_no", activeSignRecord.quoteId);
        if (iqError) {
          console.error("insurance_quotations update failed:", iqError);
          alert(
            "⚠️ 送出失敗（更新報價單狀態時發生錯誤）：\n" + iqError.message
          );
          return;
        }
        const { error: qfrError } = await supabaseClient
          .from("quote_full_records")
          .update({
            signature_image: signatureImage,
            sign_status: "已簽署",
            otp_verified: otpVerified,
            otp_verified_at: otpVerified
              ? otpVerifiedAt || new Date().toISOString()
              : null,
            mid_verified: midVerified,
            mid_verified_at: midVerified
              ? midVerifiedAt || new Date().toISOString()
              : null,
            card_verified: cardVerified,
            card_verified_at: cardVerified
              ? cardVerifiedAt || new Date().toISOString()
              : null,
          })
          .eq("quotation_no", activeSignRecord.quoteId);
        if (qfrError) {
          console.error("quote_full_records update failed:", qfrError);
          alert(
            "⚠️ 送出失敗（更新簽名/OTP資料時發生錯誤）：\n" + qfrError.message
          );
          return;
        }
        setHistoryQuotes((prev) =>
          prev.map((q) =>
            q.quoteId === activeSignRecord.quoteId
              ? { ...q, status: "已簽署" }
              : q
          )
        );

        // 🎯 判斷目前是「客戶手機端」還是「經辦後台自己點簽名」
        const isCustomerFlow = window.location.search.includes("signId");
        if (isCustomerFlow) {
          // 客戶端：停在「簽署完成」畫面，絕不掉回經辦後台
          setIsSigned(true);
        } else {
          // 經辦後台自己簽：跟原本一樣，關閉彈窗、留在主畫面
          alert("✍️ 投保確認書簽署成功！該筆報價已由待簽署看板中除名！");
          setShowSignModal(false);
          setActiveSignRecord(null);
          setShowOtpModal(false);
          setOtpPhase("send");
          setOtpInput("");
          setOtpVerified(false);
          setOtpVerifiedAt(null);
          setMidVerified(false);
          setMidVerifiedAt(null);
          setCardVerified(false);
          setCardVerifiedAt(null);
          setCardNumberInput("");
        }
      } catch (err) {
        console.error("submitSignature unexpected error:", err);
        alert("⚠️ 送出時發生未預期錯誤：\n" + (err?.message || String(err)));
      }
    }
  };
  // ====================================================================
  // 🎯 物理防禦雙視圖分流：當客戶點連結進來，直接滿版遮斷，背景絕對全白不穿透！
  // ====================================================================
  if (window.location.search.includes("payId")) {
    return <PaymentBarcodePage record={paymentPageRecord} />;
  }
  if (window.location.search.includes("signId")) {
    if (isSigned) {
      return (
        <div className="container p-4 text-center min-vh-100 d-flex align-items-center justify-content-center bg-white">
          <div
            className="p-4 border rounded shadow-sm bg-white"
            style={{ maxWidth: "450px" }}
          >
            <h2 className="text-success fw-bold mb-3">🤝 投保確認完成</h2>
            <p className="text-muted">
              親愛的客戶您好，您的手寫電子簽章已與保單單號安全綁定並歸檔上雲端，經辦人員將立即為您處理後續核保出單程序。謝謝您！
            </p>
          </div>
        </div>
      );
    }
    if (!showSignModal) {
      return (
        <div className="container p-4 text-center min-vh-100 d-flex align-items-center justify-content-center bg-white">
          <div className="text-muted">⏳ 正在連線雲端提取報價單明細...</div>
        </div>
      );
    }
    return (
      <div
        className="container p-4 bg-white min-vh-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: "#ffffff" }}
      >
        <div
          className="p-4 border shadow-lg bg-white rounded-3 w-100"
          style={{ maxWidth: "550px", zIndex: 9999 }}
        >
          <div
            className="text-center fw-bold border-bottom pb-2 mb-3 text-primary"
            style={{ fontSize: "1.2rem" }}
          >
            ✒️ 汽機車保險投保確認書
          </div>
          <div className="bg-light p-3 rounded-2 border mb-3 text-start small">
            <div className="fw-bold mb-1 text-dark">核定明細：</div>
            <div>客戶姓名：{clientName || "核定客戶"}</div>
            <div>車牌號碼：{carNumber || "QQQ-222"}</div>
            <div className="mb-1">車種項目：{vehicle || "03:自小客"}</div>
            <div className="mb-1">
              聯絡電話：{activeSignRecord?.phone || "未提供"}
            </div>
            <div
              className="text-danger fw-bold mt-2"
              style={{ fontSize: "1rem" }}
            >
              總保費金額合計：NT${" "}
              {totalPremium ? totalPremium.toLocaleString() : "17,275"} 元
            </div>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="text-start text-danger fw-bold small">
              ⚠️ 行動投保簽名前要保人必須完成以下任意兩種的身分驗證始能生效
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary flex-shrink-0 ms-2"
              onClick={() => setShowVerifyInfoModal(true)}
            >
              說明及注意事項
            </button>
          </div>
          <div className="d-flex flex-column gap-2 mb-3">
            <div
              className={`d-flex justify-content-between align-items-center rounded-2 p-2 ${
                midVerified
                  ? "bg-success bg-opacity-10"
                  : "bg-warning bg-opacity-10"
              }`}
            >
              <span className="small fw-bold">
                {midVerified ? "✅ MID驗證已通過" : "未驗證"}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={verifyMid}
                disabled={midVerified}
              >
                {midVerified ? "已驗證" : "MID驗證"}
              </button>
            </div>
            <div
              className={`rounded-2 p-2 ${
                cardVerified
                  ? "bg-success bg-opacity-10"
                  : "bg-warning bg-opacity-10"
              }`}
            >
              <div className="d-flex justify-content-between align-items-center">
                <span className="small fw-bold">
                  {cardVerified ? "✅ 信用卡持卡人驗證已通過" : "未驗證"}
                </span>
              </div>
              {!cardVerified && (
                <div className="d-flex gap-2 mt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-control form-control-sm font-monospace"
                    placeholder="---- ---- ---- ----"
                    value={cardNumberInput}
                    onChange={handleCardNumberChange}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary flex-shrink-0"
                    onClick={verifyCard}
                  >
                    信用卡持卡人驗證
                  </button>
                </div>
              )}
            </div>
            <div
              className={`d-flex justify-content-between align-items-center rounded-2 p-2 ${
                otpVerified
                  ? "bg-success bg-opacity-10"
                  : "bg-warning bg-opacity-10"
              }`}
            >
              <span className="small fw-bold">
                {otpVerified ? "✅ OTP驗證已通過" : "未驗證"}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  if (!activeSignRecord?.phone) {
                    alert(
                      "⚠️ 無法進行 OTP 驗證：這筆報價單沒有留存客戶行動電話。\n請經辦人員回到報價系統，補上行動電話後重新試算並儲存，才能進行 OTP 驗證。"
                    );
                    return;
                  }
                  setShowOtpModal(true);
                }}
                disabled={otpVerified}
              >
                {otpVerified ? "已驗證" : "OTP驗證"}
              </button>
            </div>
          </div>
          <div className="text-start text-danger fw-bold small mb-2">
            請在藍色虛線框內用手指或滑鼠手寫簽名：
          </div>
          <canvas
            ref={canvasRef}
            width="490"
            height="220"
            className="border border-primary bg-white w-100 mb-3"
            style={{
              borderStyle: "dashed",
              cursor: "crosshair",
              touchAction: "none",
              minHeight: "220px",
            }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          <div className="d-flex gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-secondary w-50 fw-bold py-2"
              onClick={clearCanvas}
            >
              清除重簽
            </button>
            <button
              type="button"
              className="btn btn-primary w-50 fw-bold py-2"
              onClick={submitSignature}
              disabled={
                [otpVerified, midVerified, cardVerified].filter(Boolean)
                  .length < 2
              }
            >
              確認送出確認書
            </button>
          </div>
          <div className="text-center text-muted small border-top pt-2">
            🔒 本手寫電子簽章受商用加密協議保護。
          </div>
        </div>
        {showOtpModal && (
          <div
            className="modal d-block show bg-black bg-opacity-75"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: 100050,
              overflowY: "auto",
            }}
          >
            <div className="d-flex align-items-center justify-content-center min-vh-100 p-3">
              <div
                className="bg-white rounded-3 p-4 shadow-lg"
                style={{ maxWidth: "400px", width: "100%" }}
              >
                <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                  <h6 className="fw-bold text-primary mb-0">📱 OTP 身分驗證</h6>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowOtpModal(false);
                      setOtpPhase("send");
                      setOtpInput("");
                    }}
                  />
                </div>

                {otpPhase === "send" && (
                  <>
                    <p className="small text-muted">
                      將發送驗證碼至客戶手機：
                      <span className="fw-bold text-dark">
                        {activeSignRecord?.phone || "（查無電話號碼）"}
                      </span>
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary w-100 fw-bold"
                      disabled={!activeSignRecord?.phone}
                      onClick={sendOtpCode}
                    >
                      發送驗證碼
                    </button>
                  </>
                )}

                {otpPhase === "verify" && (
                  <>
                    <p className="small text-muted">
                      請輸入客戶收到的 6 位數驗證碼：
                    </p>
                    <input
                      type="text"
                      maxLength={6}
                      className="form-control mb-3 text-center fs-4 font-monospace"
                      value={otpInput}
                      onChange={(e) =>
                        setOtpInput(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="------"
                    />
                    <button
                      type="button"
                      className="btn btn-primary w-100 fw-bold mb-2"
                      onClick={verifyOtpCode}
                    >
                      確認驗證
                    </button>
                    <button
                      type="button"
                      className="btn btn-link w-100 btn-sm"
                      onClick={sendOtpCode}
                    >
                      重新發送驗證碼
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {showVerifyInfoModal && (
          <div
            className="modal d-block show bg-black bg-opacity-75"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: 100060,
              overflowY: "auto",
            }}
          >
            <div className="d-flex align-items-center justify-content-center min-vh-100 p-3">
              <div
                className="bg-white rounded-3 p-4 shadow-lg"
                style={{ maxWidth: "480px", width: "100%" }}
              >
                <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                  <h6 className="fw-bold text-primary mb-0">
                    ℹ️ 說明及注意事項
                  </h6>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowVerifyInfoModal(false)}
                  />
                </div>
                <div className="small text-start" style={{ lineHeight: 1.8 }}>
                  <p>
                    1. 進行手機驗證(MID驗證)前，請先關閉 WiFi，並使用 4G/5G
                    之行動數據進行連線，若為雙卡機用戶請確認欲驗證之手機門號是否正在使用。
                  </p>
                  <p>
                    2.
                    依法令規定為保障客戶權益，簽署要保書時，會透過「信用卡持卡人驗證」程序，輔助手機驗證(Mobile
                    ID)，強化簽署者識別，本步驟之信用卡卡號輸入僅作為驗證用途，驗證通過後不會主動執行扣款。另外，驗證過程請使用要保人及被保險人本人申辦之信用卡驗證，若輸入非本人申辦之信用卡卡號將會驗證失敗。
                  </p>
                  <p className="mb-0">
                    3.
                    完成上述之投保服務後，本公司將進行抽樣電訪程序確認是否為要保人本人完成文件簽署，為確保客戶權益，非本人完成驗證，本公司將不予承保。
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary w-100 fw-bold mt-3"
                  onClick={() => setShowVerifyInfoModal(false)}
                >
                  我已知悉
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ====================================================================
  // 📊 以下為「經辦專屬後台主畫面」
  // ====================================================================
  const isMotorVehicle = ["01", "02", "32", "34"].some((c) =>
    vehicle.startsWith(c)
  );

  return (
    <div
      id="mainAppRoot"
      className="container p-4 bg-white text-start shadow-sm rounded border"
      style={{ maxWidth: "850px", marginTop: "20px" }}
      translate="no"
    >
      <h4 className="fw-bold mb-4 text-center text-primary border-bottom pb-2">
        📋 汽車險報價系統
      </h4>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="fw-bold text-dark mb-0">👤 客戶基本資料</h6>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary fw-bold"
          onClick={openAiQuoteModal}
        >
          🤖 AI快速報價
        </button>
      </div>
      <div className="row g-3 bg-light p-3 rounded mb-4 border">
        <div className="col-4">
          姓名*
          <input
            type="text"
            className="form-control bg-white"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>
        <div className="col-4">
          車號*
          <input
            type="text"
            className="form-control bg-white"
            placeholder="例: ABC-1234"
            value={carNumber}
            onChange={(e) => setCarNumber(e.target.value)}
          />
        </div>
        <div className="col-4">
          生日(民國年)*
          <input
            type="text"
            className="form-control bg-white"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>
        <div className="col-4">
          車種選擇*
          <select
            className="form-select bg-white"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
          >
            {VEHICLE_OPTIONS.map((o) => (
              <option key={o.code} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-4">
          被保性別
          <select
            className="form-select bg-white"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </div>
        <div className="col-2">
          乘載量
          <input
            type="number"
            className="form-control bg-light"
            value={passengerCount}
            readOnly
          />
        </div>
        <div className="col-2">
          單位
          <select
            className="form-select bg-white"
            value={passengerUnit}
            onChange={(e) => setPassengerUnit(e.target.value)}
          >
            <option value="人">人</option>
            <option value="噸">噸</option>
          </select>
        </div>
        <div className="col-6">
          行動電話<span className="text-danger">（必填）</span>
          <input
            type="text"
            className="form-control bg-white border-secondary-subtle"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="col-6">
          E-mail
          <input
            type="text"
            className="form-control bg-white"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
        </div>
      </div>
      {/* 🚗 車籍資料 */}
      <h6 className="fw-bold text-dark mb-2">🚗 車籍資料</h6>
      <div className="p-3 rounded mb-4 bg-white border border-warning shadow-sm">
        <div className="row g-3 mb-3">
          <div className="col-6">
            廠牌車系*
            <select
              className="form-select fw-bold border-primary"
              value={mergedBrandSeries}
              onChange={(e) => handleVChg(e.target.value)}
            >
              <option value="">-- 選取車型自動拋轉重置價格 --</option>
              {brandOptions.map((i) => (
                <option key={i.label} value={i.label}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6">
            廠型代號
            <input
              type="text"
              className="form-control bg-light font-monospace"
              value={modelCode}
              readOnly
            />
          </div>
        </div>
        <div className="row g-3">
          <div className="col-3">
            發照年月
            <input
              type="text"
              className="form-control bg-white"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="col-3">
            製造年月*
            <input
              type="text"
              className="form-control bg-white fw-bold text-primary"
              placeholder="例: 202608"
              value={manufactureDate}
              onChange={(e) => setManufactureDate(e.target.value)}
            />
          </div>
          <div className="col-3">
            排氣量(c.c.)
            <input
              type="text"
              className="form-control bg-light font-monospace"
              value={engineDisplacement}
              readOnly
            />
          </div>
          <div className="col-3">
            重置價格(萬元)*
            <input
              type="text"
              className="form-control bg-light text-danger fw-bold font-monospace"
              value={replacementValue}
              readOnly
            />
          </div>
        </div>

        {/* 💡 六欄位從人矩陣：鋼鐵校正 onChange 語法，彻底砸碎死鎖迴圈！ */}
        <div className="row g-3 mt-1 bg-light p-2 rounded border mb-3 small">
          <div className="col-2">
            強制肇事等級
            <select
              className="form-select form-select-sm"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={isMotorVehicle}
            >
              {[...Array(10)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div className="col-2">
            酒駕次數
            <select
              className="form-select form-select-sm"
              value={drunkCount}
              onChange={(e) => setDrunkCount(e.target.value)}
              disabled={isMotorVehicle}
            >
              {[...Array(11)].map((_, i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div className="col-2">
            車責賠款等級
            <select
              className="form-select form-select-sm text-primary fw-bold"
              value={liabilityClaimLevel}
              onChange={(e) => setLiabilityClaimLevel(e.target.value)}
            >
              {[...Array(10)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div className="col-2">
            車責賠款係數
            <div className="form-control form-control-sm bg-light fw-bold">
              {liabilityClaimFactor.toFixed(1)}
            </div>
          </div>

          {/* 🎯 關鍵除錯行：標準單向狀態賦值，絕不引發背景重複渲染當機 */}
          <div className="col-2">
            車體賠款等級
            <select
              className="form-select form-select-sm text-danger fw-bold"
              value={hullClaimLevel}
              onChange={(e) => setCarDamageLevel(e.target.value)}
            >
              {[-3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="col-2">
            車體賠款係數
            <div className="form-control form-control-sm bg-light fw-bold">
              {hullClaimFactor.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="row g-3 mt-1">
          <div className="col-3">
            強制-起保日
            <input
              type="text"
              className="form-control bg-white fw-bold text-success"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="col-3">
            強制-到期日
            <input
              type="text"
              className="form-control bg-light font-monospace"
              value={endDateCompulsory}
              readOnly
            />
          </div>
          <div className="col-3">
            任意-起保日*
            <input
              type="text"
              className="form-control bg-white fw-bold text-success"
              value={startDateArbitrary}
              onChange={(e) => setStartDateArbitrary(e.target.value)}
            />
          </div>
          <div className="col-3">
            任意-到期日
            <input
              type="text"
              className="form-control bg-light font-monospace"
              value={endDateArbitrary}
              readOnly
            />
          </div>
        </div>
      </div>
      <h6 className="fw-bold text-dark mb-2">🛡️ 五大投保險種選單</h6>
      <div
        className="p-3 bg-white border border-success border-2 rounded mb-3 shadow-sm"
        style={{ fontSize: "0.85rem" }}
      >
        {/* 1. 車體損失險 */}
        <div className="row g-2 align-items-center mb-2 pb-2 border-bottom">
          <div className="col-3">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={hasHull}
                onChange={(e) => setHasHull(e.target.checked)}
                id="h1"
              />
              <label
                htmlFor="h1"
                className="form-check-label fw-bold text-success"
              >
                1. 車體損失險
              </label>
            </div>
          </div>
          <div className="col-3">
            <select
              className="form-select form-select-sm border-secondary-subtle"
              value={hullType}
              onChange={(e) => setHullType(e.target.value)}
              disabled={!hasHull}
            >
              <option value="01甲式">01甲式</option>
              <option value="05乙式">05乙式</option>
              <option value="07丙式">07丙式</option>
            </select>
          </div>
          <div className="col-3">
            <select
              className="form-select form-select-sm border-secondary-subtle"
              value={hullDeductible}
              onChange={(e) => setHullDeductible(e.target.value)}
              disabled={!hasHull || hullType === "07丙式"}
            >
              {applicableDeductibles.map((r) => (
                <option key={r.deductible_label} value={r.deductible_label}>
                  {r.deductible_label === "0"
                    ? "自付額: 0"
                    : r.deductible_label}
                </option>
              ))}
            </select>
          </div>
          {/* 💡 修正問題 2：最右方除了保費，一律加上全自動換算出的即時折舊保額提示 */}
          <div className="col-3 text-end">
            <div className="fw-bold text-primary small">
              保額: {depreciatedInsuredValue || 0} 萬元
            </div>
            <span className="fw-bold text-danger">
              保費：{hullPremium.toLocaleString()} 元
            </span>
          </div>
          {hasHull && hullDeductible === "3/5/7千元" && (
            <div className="col-12 mt-1 ps-4 text-primary small font-monospace">
              💡 自負額說明：{HULL_DEDUCTIBLE_DICT[hullDeductible]}
            </div>
          )}
        </div>

        {/* 2. 竊盜損失險 */}
        <div className="row g-2 align-items-center mb-2 pb-2 border-bottom">
          <div className="col-3">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={hasTheft}
                onChange={(e) => setHasTheft(e.target.checked)}
                id="theft"
              />
              <label htmlFor="theft" className="form-check-label fw-bold">
                2. 竊盜損失險 (11)
              </label>
            </div>
          </div>
          <div className="col-3">
            <select
              className="form-select form-select-sm border-secondary-subtle"
              value={theftDeductible}
              onChange={(e) => setTheftDeductible(e.target.value)}
              disabled={!hasTheft}
            >
              <option value="0">自負額: 0</option>
              <option value="10%">自負額: 10%</option>
              <option value="20%">自負額: 20%</option>
            </select>
          </div>
          <div className="col-3 text-muted small">
            預估殘值: {depreciatedInsuredValue || 0} 萬
          </div>
          {/* 💡 修正問題 2：右側加上即時折舊保額提示 */}
          <div className="col-3 text-end">
            <div className="fw-bold text-primary small">
              保額: {depreciatedInsuredValue || 0} 萬元
            </div>
            <span className="fw-bold text-danger">
              保費：{theftPremium.toLocaleString()} 元
            </span>
          </div>
        </div>

        {/* 3. 第三人責任險 */}
        <div className="row g-2 align-items-center mb-2 pb-2 border-bottom">
          <div className="col-3">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={hasLiability}
                onChange={(e) => setHasLiability(e.target.checked)}
                id="liability"
              />
              <label htmlFor="liability" className="form-check-label fw-bold">
                3. 第三人責任險 (31)
              </label>
            </div>
          </div>
          <div className="col-4">
            <select
              className="form-select form-select-sm border-secondary-subtle"
              value={liabilityCoverage}
              onChange={(e) => setLiabilityCoverage(e.target.value)}
              disabled={!hasLiability}
            >
              {injuryOptions.map((label) => (
                <option key={label} value={label}>
                  體傷: {label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-2">
            <select
              className="form-select form-select-sm border-secondary-subtle"
              value={liabilityProperty}
              onChange={(e) => setLiabilityProperty(e.target.value)}
              disabled={!hasLiability}
            >
              {propertyOptions.map((label) => (
                <option key={label} value={label}>
                  財損: {label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-3 text-end">
            <div className="fw-bold text-danger small">
              體傷: {liabilityPremiumInjury.toLocaleString()} 元
            </div>
            <div className="fw-bold text-danger small">
              財損: {liabilityPremiumProperty.toLocaleString()} 元
            </div>
          </div>
        </div>
        {/* 4. 第三人超額責任險 */}
        <div
          className="row g-2 align-items-center mb-2 pb-2 border-bottom"
          style={{ opacity: hasLiability ? 1 : 0.5 }}
        >
          <div className="col-3">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={hasExcess}
                onChange={(e) => setHasExcess(e.target.checked)}
                disabled={!hasLiability}
                id="excess"
              />
              <label
                htmlFor="excess"
                className="form-check-label fw-bold text-primary"
              >
                4. 第三人超額險
              </label>
            </div>
          </div>
          <div className="col-6">
            <select
              className="form-select form-select-sm"
              value={excessLimit}
              onChange={(e) => setExcessCoverage(e.target.value)}
              disabled={!hasExcess || !hasLiability}
            >
              <option value="500萬">最高上限: 500萬</option>
              <option value="1000萬">最高上限: 1000萬</option>
              <option value="2000萬">最高上限: 2000萬</option>
            </select>
          </div>
          <div className="col-3 text-end">
            <span className="fw-bold text-danger">
              保費：{excessPremium.toLocaleString()} 元
            </span>
          </div>
        </div>

        {/* 5. 乘客責任險 */}
        <div className="row g-2 align-items-center">
          <div className="col-3">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={hasPassenger}
                onChange={(e) => setHasPassenger(e.target.checked)}
                id="passenger"
              />
              <label htmlFor="passenger" className="form-check-label fw-bold">
                5. 乘客責任險
              </label>
            </div>
          </div>
          <div className="col-3">
            <select
              className="form-select form-select-sm"
              value={passengerType}
              onChange={(e) => setPassengerType(e.target.value)}
              disabled={!hasPassenger}
            >
              <option value="保整車">預設: 保整車</option>
              <option value="單保駕駛">單保駕駛</option>
            </select>
          </div>
          <div className="col-3">
            <select
              className="form-select form-select-sm"
              value={passengerPlan}
              onChange={(e) => setPassengerPlan(e.target.value)}
              disabled={!hasPassenger}
            >
              {PASSENGER_PLAN_OPTIONS.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-3 text-end">
            <span className="fw-bold text-danger">
              保費：{passengerPremium.toLocaleString()} 元
            </span>
          </div>
        </div>
      </div>

      {/* 智慧總額看板 */}
      <div className="p-3 bg-light border border-2 rounded text-end mb-3 shadow-sm">
        <div className="d-flex justify-content-between border-bottom pb-1 small text-muted">
          <span>任意險保費：</span>
          <span>NT$ {arbitraryPremium?.toLocaleString()} 元</span>
        </div>
        <div className="d-flex justify-content-between border-bottom py-1 small text-muted">
          <span>強制險保費：</span>
          <span>NT$ {compulsoryPremium?.toLocaleString()} 元</span>
        </div>
        <div className="d-flex justify-content-between pt-1 fw-bold text-danger fs-5">
          <span>總保費金額合計：</span>
          <span>NT$ {totalPremium?.toLocaleString()} 元</span>
        </div>
      </div>

      {/* 🌐 網路投保簡易試算版：只保留試算保費，移除儲存/查詢/驗證/下載/簽名等內部作業功能 */}
      <div className="row g-2 mb-2">
        <div className="col-md-6 offset-md-3 col-12">
          <button
            type="button"
            onClick={triggerCalc}
            className="btn btn-primary w-100 fw-bold py-2"
          >
            試算保費
          </button>
        </div>
      </div>

      {showAiQuoteModal && (
        <div
          className="modal-backdrop-custom"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            zIndex: 100070,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="bg-white rounded shadow-lg p-3 d-flex flex-column"
            style={{ width: "92%", maxWidth: "480px", maxHeight: "85vh" }}
          >
            <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
              <h6 className="fw-bold mb-0 text-primary">🤖 AI快速報價小幫手</h6>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowAiQuoteModal(false)}
              ></button>
            </div>

            <div
              className="flex-grow-1 overflow-auto mb-2 p-2 bg-light rounded"
              style={{ minHeight: "260px" }}
            >
              {aiChatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`d-flex mb-2 ${
                    msg.role === "user"
                      ? "justify-content-end"
                      : "justify-content-start"
                  }`}
                >
                  <div
                    className={`p-2 rounded-3 small ${
                      msg.role === "user"
                        ? "bg-primary text-white"
                        : "bg-white border text-dark"
                    }`}
                    style={{ maxWidth: "80%", whiteSpace: "pre-wrap" }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {aiRecommendation && (
                <div className="bg-white border rounded p-2 mt-2 small">
                  <div className="fw-bold text-success mb-2">
                    ✅ 建議投保組合
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked
                      disabled
                      readOnly
                    />
                    <label className="form-check-label">
                      強制險（法定必保）
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked
                      disabled
                      readOnly
                    />
                    <label className="form-check-label">第三人責任險</label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={aiRecommendation.hull}
                      onChange={() => toggleAiRecommendationItem("hull")}
                    />
                    <label className="form-check-label">車體險</label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={aiRecommendation.theft}
                      onChange={() => toggleAiRecommendationItem("theft")}
                    />
                    <label className="form-check-label">竊盜險</label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={aiRecommendation.excess}
                      onChange={() => toggleAiRecommendationItem("excess")}
                    />
                    <label className="form-check-label">超額責任險</label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={aiRecommendation.passenger}
                      onChange={() => toggleAiRecommendationItem("passenger")}
                    />
                    <label className="form-check-label">乘客險</label>
                  </div>
                  {aiRecommendation.note && (
                    <div className="text-danger" style={{ fontSize: "0.8rem" }}>
                      ⚠️ {aiRecommendation.note}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-success btn-sm w-100 fw-bold mt-2"
                    onClick={applyAiRecommendationToForm}
                  >
                    帶入主頁繼續試算
                  </button>
                </div>
              )}
            </div>

            {!aiRecommendation && (
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${
                    aiListening ? "btn-danger" : "btn-outline-secondary"
                  }`}
                  onClick={toggleAiMic}
                  title="語音輸入"
                >
                  {aiListening ? "🔴" : "🎤"}
                </button>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="請輸入回答，或按🎤語音輸入"
                  value={aiChatInput}
                  onChange={(e) => setAiChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing)
                      handleAiChatSend();
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm fw-bold"
                  onClick={handleAiChatSend}
                >
                  送出
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} // ⚠️ 鋼鐵終極封頂結尾大括號！
