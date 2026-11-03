package com.newtonbrawl.config;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * JWT settings bound from {@code newton-brawl.jwt.*}.
 *
 * @param secret            base64-encoded HMAC key (at least 256 bits)
 * @param expirationMinutes lifetime of an access token
 */
@Validated
@ConfigurationProperties(prefix = "newton-brawl.jwt")
public record JwtProperties(@NotBlank String secret, @Min(1) long expirationMinutes) {
}
