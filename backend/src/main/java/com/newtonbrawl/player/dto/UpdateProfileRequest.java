package com.newtonbrawl.player.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
    @NotBlank @Size(min = 2, max = 32, message = "Display name must be 2-32 characters")
    String displayName) {
}
