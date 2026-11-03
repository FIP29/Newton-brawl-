package com.newtonbrawl.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** {@code login} accepts either the username or the email address. */
public record LoginRequest(
    @NotBlank(message = "Username or email is required") String login,
    @NotBlank(message = "Password is required") String password) {
}
