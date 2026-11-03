package com.newtonbrawl.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Origins allowed to call the API from a browser (the Vite dev server by default). */
@ConfigurationProperties(prefix = "newton-brawl.cors")
public record CorsProperties(List<String> allowedOrigins) {
    public CorsProperties {
        allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
    }
}
