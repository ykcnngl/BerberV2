package com.ariftuzunalp.booking.config;

import com.ariftuzunalp.booking.service.GalleryService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.TimeUnit;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final AdminAuthInterceptor adminAuthInterceptor;
    private final GalleryService galleryService;

    @Value("${app.cors.allowed-origins}")
    private String[] allowedOrigins;

    // CORS: sadece app.cors.allowed-origins içindeki adresler API'ye erişebilir
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                .allowedHeaders("Content-Type", "X-Admin-Password", "X-Customer-Token");
    }

    // Galeri fotoğrafları diskten sunulur; dosya adları rastgele olduğu için uzun süre önbelleğe alınabilir
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/api/v1/booking/gallery/images/**")
                .addResourceLocations(galleryService.getGalleryDir().toUri().toString())
                .setCacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic());
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(adminAuthInterceptor)
                .addPathPatterns("/api/v1/booking/admin/**")
                .excludePathPatterns("/api/v1/booking/admin/login");
    }
}
