import { useState, useEffect } from "react";
import axios from "axios";
import { KeyRound } from "lucide-react";
import { API_URL, getErrorMessage, requestVerificationCode } from "./api";

const RESEND_COOLDOWN_SECONDS = 60;

// Telefona gönderilen 6 haneli kodu doğrular ve oturum anahtarını onVerified'a verir.
// Bu bileşen gösterilmeden önce kod requestVerificationCode ile gönderilmiş olmalıdır.
function CodeVerification({ phone, submitLabel, onVerified, onBack }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleVerify = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/verification/verify`, {
        phone,
        code,
      });
      await onVerified(response.data.token);
    } catch (error) {
      alert(getErrorMessage(error, "Kod doğrulanamadı."));
      setCode("");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setLoading(true);
    if (await requestVerificationCode(phone)) {
      setCode("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400 text-center">
        {phone} numarasına gönderilen 6 haneli kodu girin.
      </p>
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-300 mb-2">
          <KeyRound size={16} /> Doğrulama Kodu
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="______"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length === 6 && !loading) handleVerify();
          }}
          className="w-full text-center tracking-[0.5em] text-xl bg-neutral-950 border border-neutral-700 rounded-lg p-3 text-white focus:outline-none focus:border-bronze-400"
        />
      </div>
      <button
        onClick={handleVerify}
        disabled={code.length !== 6 || loading}
        className="w-full bg-bronze-400 hover:bg-bronze-300 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-semibold p-3 rounded-lg transition-colors"
      >
        {loading ? "İşleniyor..." : submitLabel}
      </button>
      <div className="flex justify-between text-sm">
        <button
          onClick={onBack}
          disabled={loading}
          className="text-neutral-400 hover:text-white transition-colors"
        >
          Numarayı değiştir
        </button>
        <button
          onClick={handleResend}
          disabled={resendCooldown > 0 || loading}
          className="text-neutral-400 hover:text-white disabled:opacity-60 disabled:hover:text-neutral-400 transition-colors"
        >
          {resendCooldown > 0
            ? `Kodu tekrar gönder (${resendCooldown} sn)`
            : "Kodu tekrar gönder"}
        </button>
      </div>
    </div>
  );
}

export default CodeVerification;
