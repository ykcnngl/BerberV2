// Tüm hatalar frontend'in okuyabileceği { "message": "..." } biçiminde döner (bkz. index.ts onError)

export class HttpError extends Error {
  constructor(readonly status: 400 | 401 | 404 | 503, message: string) {
    super(message);
  }
}

// İş kuralı ihlali (400)
export class BusinessError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

// Eksik veya hatalı biçimli parametre (400)
export class BadRequest extends HttpError {
  constructor() {
    super(400, "Geçersiz istek. Lütfen gönderilen bilgileri kontrol edin.");
  }
}

export class NotFound extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}

export class Unauthorized extends HttpError {
  constructor(message: string) {
    super(401, message);
  }
}

// SMS sağlayıcısına ulaşılamadı veya gönderim reddedildi (503). Ayrıntı sadece loga yazılır.
export class SmsError extends HttpError {
  constructor(readonly detail: string) {
    super(503, "SMS şu anda gönderilemiyor. Lütfen biraz sonra tekrar deneyin.");
  }
}
