package com.newtonbrawl.auth;

import com.newtonbrawl.auth.dto.AuthResponse;
import com.newtonbrawl.auth.dto.LoginRequest;
import com.newtonbrawl.auth.dto.RegisterRequest;
import com.newtonbrawl.security.AuthenticatedPlayer;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest body) {
        return authService.register(body);
    }

    /** Play now, sign up later: creates a guest account and returns its token. */
    @PostMapping("/guest")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse guest() {
        return authService.guest();
    }

    /** A signed-in guest picks a username, email and password; their progress carries over. */
    @PostMapping("/claim")
    public AuthResponse claim(@AuthenticationPrincipal AuthenticatedPlayer me, @Valid @RequestBody RegisterRequest body) {
        if (me == null) throw new com.newtonbrawl.common.exception.ForbiddenException("Sign in as a guest first");
        return authService.claim(me.id(), body);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest body) {
        return authService.login(body);
    }
}
