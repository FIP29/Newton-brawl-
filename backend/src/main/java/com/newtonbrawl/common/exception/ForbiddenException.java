package com.newtonbrawl.common.exception;

import org.springframework.http.HttpStatus;

/** 403 — the caller is known but not allowed to do this (e.g. a guest joining ranked). */
public class ForbiddenException extends ApiException {
    public ForbiddenException(String message) {
        super(HttpStatus.FORBIDDEN, message);
    }
}
