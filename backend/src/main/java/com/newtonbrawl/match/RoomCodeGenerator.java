package com.newtonbrawl.match;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** Short, human-friendly room codes. No 0/O/1/I to avoid misreading when shared out loud. */
@Component
public class RoomCodeGenerator {
    static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    static final int LENGTH = 5;

    private final SecureRandom random = new SecureRandom();

    public String next() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return sb.toString();
    }
}
