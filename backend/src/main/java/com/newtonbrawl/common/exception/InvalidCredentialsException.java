package com.newtonbrawl.common.exception;

import org.springframework.http.HttpStatus;

/** 401 — wrong login/password. The message never reveals which one was wrong. */
public class InvalidCredentialsException extends ApiException {
    public InvalidCredentialsException() {
        super(HttpStatus.UNAUTHORIZED, "Invalid username or password");
    }
}
