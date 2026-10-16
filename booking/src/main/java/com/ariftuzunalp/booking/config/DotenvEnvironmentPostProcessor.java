package com.ariftuzunalp.booking.config;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// booking/.env dosyasını UTF-8 olarak okur (Spring'in .properties okuyucusu ISO-8859-1 kullandığı için
// Türkçe karakterler bozuluyordu). Gerçek ortam değişkenleri .env'deki değerlerden önceliklidir.
public class DotenvEnvironmentPostProcessor implements EnvironmentPostProcessor {

    // Uygulama booking/ klasöründen veya proje kökünden başlatılabilir
    private static final List<Path> CANDIDATES = List.of(Path.of(".env"), Path.of("booking", ".env"));

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        CANDIDATES.stream().filter(Files::isRegularFile).findFirst().ifPresent(file -> {
            Map<String, Object> values = read(file);
            // .env'nin bulunduğu klasör (booking/): yüklenen dosyalar gibi göreli yollar buna göre çözülür
            values.putIfAbsent("dotenv.dir", file.toAbsolutePath().getParent().toString().replace('\\', '/'));
            MapPropertySource source = new MapPropertySource("dotenv", values);
            String systemEnv = StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME;
            if (environment.getPropertySources().contains(systemEnv)) {
                environment.getPropertySources().addAfter(systemEnv, source);
            } else {
                environment.getPropertySources().addLast(source);
            }
        });
    }

    private static Map<String, Object> read(Path file) {
        Map<String, Object> values = new LinkedHashMap<>();
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String trimmed = line.strip();
                int eq = trimmed.indexOf('=');
                if (trimmed.isEmpty() || trimmed.startsWith("#") || eq <= 0) {
                    continue;
                }
                String value = trimmed.substring(eq + 1).strip();
                if (value.length() >= 2 && (value.startsWith("\"") && value.endsWith("\"")
                        || value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length() - 1);
                }
                values.put(trimmed.substring(0, eq).strip(), value);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(".env dosyası okunamadı: " + file.toAbsolutePath(), e);
        }
        return values;
    }
}
