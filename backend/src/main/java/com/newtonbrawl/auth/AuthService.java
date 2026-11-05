package com.newtonbrawl.auth;

import com.newtonbrawl.auth.dto.AuthResponse;
import com.newtonbrawl.auth.dto.LoginRequest;
import com.newtonbrawl.auth.dto.RegisterRequest;
import com.newtonbrawl.common.exception.ConflictException;
import com.newtonbrawl.common.exception.InvalidCredentialsException;
import com.newtonbrawl.player.Player;
import com.newtonbrawl.player.PlayerRepository;
import com.newtonbrawl.player.dto.PlayerProfileDto;
import com.newtonbrawl.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.newtonbrawl.common.exception.ForbiddenException;
import com.newtonbrawl.common.exception.NotFoundException;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;

@Service
public class AuthService {

    private final PlayerRepository players;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(PlayerRepository players, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.players = players;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        String username = req.username().trim();
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (players.existsByUsernameIgnoreCase(username)) {
            throw new ConflictException("Username is already taken");
        }
        if (players.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("Email is already registered");
        }
        String displayName = (req.displayName() == null || req.displayName().isBlank())
            ? username : req.displayName().trim();

        Player player = new Player(username, email, passwordEncoder.encode(req.password()), displayName);
        player.markLoggedIn();
        players.save(player);
        return tokenFor(player);
    }

    /**
     * One-click guest: a generated name ("Guest-7F3A2C"), a placeholder email nobody can log in with and a
     * random password that's never shown. The token is the only way back in, so the client keeps it.
     */
    @Transactional
    public AuthResponse guest() {
        String suffix, username;
        do {
            suffix = HexFormat.of().withUpperCase().formatHex(randomBytes(3));
            username = "Guest-" + suffix;
        } while (players.existsByUsernameIgnoreCase(username));
        String email = "guest-" + suffix.toLowerCase(Locale.ROOT) + "-" + HexFormat.of().formatHex(randomBytes(4)) + "@guest.invalid";
        Player player = Player.guest(username, email, passwordEncoder.encode(HexFormat.of().formatHex(randomBytes(24))));
        player.markLoggedIn();
        players.save(player);
        return tokenFor(player);
    }

    /** Turns the caller's guest account into a real one, keeping its record, Codex and unlocks. */
    @Transactional
    public AuthResponse claim(long playerId, RegisterRequest req) {
        Player player = players.findById(playerId).orElseThrow(() -> new NotFoundException("Player not found"));
        if (!player.isGuest()) throw new ForbiddenException("This account is already registered");
        String username = req.username().trim();
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (players.existsByUsernameIgnoreCase(username)) throw new ConflictException("Username is already taken");
        if (players.existsByEmailIgnoreCase(email)) throw new ConflictException("Email is already registered");
        String displayName = (req.displayName() == null || req.displayName().isBlank()) ? username : req.displayName().trim();
        player.claim(username, email, passwordEncoder.encode(req.password()), displayName);
        player.markLoggedIn();
        return tokenFor(player);
    }

    private static final SecureRandom RANDOM = new SecureRandom();

    private static byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        RANDOM.nextBytes(b);
        return b;
    }

    @Transactional
    public AuthResponse login(LoginRequest req) {
        String login = req.login().trim();
        Player player = (login.contains("@")
                ? players.findByEmailIgnoreCase(login)
                : players.findByUsernameIgnoreCase(login))
            .filter(p -> passwordEncoder.matches(req.password(), p.getPasswordHash()))
            .orElseThrow(InvalidCredentialsException::new);
        player.markLoggedIn();
        return tokenFor(player);
    }

    private AuthResponse tokenFor(Player player) {
        JwtService.IssuedToken t = jwtService.issue(player.getId(), player.getUsername());
        return new AuthResponse(t.token(), t.expiresAt(), PlayerProfileDto.from(player));
    }
}
