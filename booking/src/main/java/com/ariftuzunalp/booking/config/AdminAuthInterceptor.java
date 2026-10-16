package com.ariftuzunalp.booking.config;

import com.ariftuzunalp.booking.exception.UnauthorizedException;
import com.ariftuzunalp.booking.service.AdminAuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

// /api/v1/booking/admin/** altındaki tüm istekler (login hariç) X-Admin-Password ile doğrulanır
@Component
@RequiredArgsConstructor
public class AdminAuthInterceptor implements HandlerInterceptor {

    public static final String ADMIN_HEADER = "X-Admin-Password";

    private final AdminAuthService adminAuthService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (CorsUtils.isPreFlightRequest(request)) {
            return true;
        }
        String password = request.getHeader(ADMIN_HEADER);
        if (password == null || password.isBlank()) {
            throw new UnauthorizedException("Bu işlem için yönetici girişi gerekli.");
        }
        adminAuthService.verify(password);
        return true;
    }
}
