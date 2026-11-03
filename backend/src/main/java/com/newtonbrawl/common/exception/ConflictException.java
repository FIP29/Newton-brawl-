package com.newtonbrawl.common.exception;

import org.springframework.http.HttpStatus;

/** 409 — e.g. username or email already taken. */
public class ConflictException extends ApiException {
    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, message);
    }
}
