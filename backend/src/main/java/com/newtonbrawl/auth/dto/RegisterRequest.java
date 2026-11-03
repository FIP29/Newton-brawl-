package com.newtonbrawl.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank(message = "Username is required")
    @Pattern(regexp = "^[A-Za-z0-9_]{3,20}$",
             message = "Username must be 3-20 letters, digits or underscores")
    String username,

    @NotBlank(message = "Email is required")
    @Email(message = "Email is not valid")
    @Size(max = 254)
    String email,

    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 72, message = "Password must be 8-72 characters")
    String password,

    @Size(max = 32, message = "Display name must be at most 32 characters")
    String displayName) {
}
