package com.newtonbrawl.common.exception;

import org.springframework.http.HttpStatus;

/** Base type for domain errors that map cleanly to an HTTP status. */
public abstract class ApiException extends RuntimeException {
    private final HttpStatus status;

    protected ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
