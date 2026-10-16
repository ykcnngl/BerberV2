import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import BookingPage from "./pages/BookingPage";
import AdminPage from "./pages/AdminPage";

// /          -> işletmenin tanıtım sitesi
// /randevu   -> müşterinin randevu alma ve randevularım sayfası
// /yonetim   -> yönetici paneli (müşteri sayfalarından link verilmez)
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/randevu" element={<BookingPage />} />
        <Route path="/yonetim" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
