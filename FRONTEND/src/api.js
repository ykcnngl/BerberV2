import axios from "axios";

// Site ve API aynı adreste (Cloudflare Worker); geliştirmede Vite /api isteklerini Worker'a yönlendirir
export const API_URL = `${import.meta.env.VITE_API_URL || ""}/api/v1/booking`;

export const getErrorMessage = (error, fallback) =>
  error.response?.data?.message || fallback;

// Telefona SMS doğrulama kodu gönderir; başarılıysa true döner
export const requestVerificationCode = async (phone) => {
  try {
    await axios.post(`${API_URL}/verification/request`, { phone });
    return true;
  } catch (error) {
    alert(getErrorMessage(error, "Doğrulama kodu gönderilemedi."));
    return false;
  }
};
