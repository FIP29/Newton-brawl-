package com.newtonbrawl.security;

import java.security.Principal;

/**
 * The security principal for a request: the player identified by a verified JWT.
 * Inject it into controllers with {@code @AuthenticationPrincipal AuthenticatedPlayer me}.
 */
public record AuthenticatedPlayer(long id, String username) implements Principal {
    @Override
    public String getName() {
        return username;
    }
}
