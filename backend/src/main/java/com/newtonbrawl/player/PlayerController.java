package com.newtonbrawl.player;

import com.newtonbrawl.player.dto.PlayerProfileDto;
import com.newtonbrawl.player.dto.UpdateProfileRequest;
import com.newtonbrawl.security.AuthenticatedPlayer;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/players")
public class PlayerController {

    private final PlayerService playerService;

    public PlayerController(PlayerService playerService) {
        this.playerService = playerService;
    }

    /** The logged-in player's own profile. */
    @GetMapping("/me")
    public PlayerProfileDto me(@AuthenticationPrincipal AuthenticatedPlayer me) {
        return playerService.getProfile(me.id());
    }

    @PatchMapping("/me")
    public PlayerProfileDto updateMe(@AuthenticationPrincipal AuthenticatedPlayer me,
                                     @Valid @RequestBody UpdateProfileRequest body) {
        return playerService.updateDisplayName(me.id(), body.displayName());
    }

    /** Any player's public profile. */
    @GetMapping("/{id}")
    public PlayerProfileDto byId(@PathVariable long id) {
        return playerService.getProfile(id);
    }
}
