package com.newtonbrawl.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.Map;

/**
 * Uniform error body returned by every endpoint.
 *
 * @param fieldErrors per-field validation messages (only present for 400 validation errors)
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(Instant timestamp, int status, String error, String message,
                       String path, Map<String, String> fieldErrors) {

    public static ApiError of(HttpStatus status, String message, String path) {
        return new ApiError(Instant.now(), status.value(), status.getReasonPhrase(), message, path, Map.of());
    }

    public static ApiError validation(String path, Map<String, String> fieldErrors) {
        HttpStatus s = HttpStatus.BAD_REQUEST;
        return new ApiError(Instant.now(), s.value(), s.getReasonPhrase(), "Validation failed", path, fieldErrors);
    }
}
